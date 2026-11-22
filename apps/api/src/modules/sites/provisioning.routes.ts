// @bizcity-layer P apps/api
// [2026-11-22 10:48 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B5a (D039-14): route Provisioning API /_sites/v1 — chỉ chế độ multi, chỉ tên miền điều hành, khoá prov_…, Idempotency-Key bắt buộc với lệnh ghi
/**
 * Provisioning API `bizcity_site_provisioning@1` (máy chủ gọi máy chủ: Site Manager Frappe, script vận hành).
 *   GET   /_sites/v1/health          hợp đồng, số site theo trạng thái
 *   POST  /_sites/v1/sites           tạo site → 202 { jobId, siteId }                       (Idempotency-Key bắt buộc)
 *   GET   /_sites/v1/sites           danh sách site (lọc ?status=)
 *   GET   /_sites/v1/sites/:siteId   một site
 *   GET   /_sites/v1/jobs/:jobId     trạng thái việc; việc tạo site xong: lần đọc đầu kèm email + mật khẩu ban đầu của chủ site
 *
 * Chỉ trả lời khi SITE_MODE=multi VÀ tên miền của yêu cầu = SITE_ADMIN_HOST; khác đi là 404 như đường không tồn tại.
 * Thân phản hồi theo hợp đồng (không bọc { ok, data }); lỗi theo khuôn chung { ok: false, error: { code, message, requestId } }.
 * Không qua phiên đăng nhập (`public: true`): xác thực bằng khoá prov_… ngay trong route.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { env } from '@bizcity/platform/config/env';
import { siteMode } from '@bizcity/platform/db/site';
import { normalizeHost } from '@bizcity/platform/db/site-registry';
import { authenticateKey, getJob, getSite, health, listSitesDto, ProvisionHttpError, startProvision } from './provisioning.service.js';

const tags = ['Provisioning API (nhiều site)'];
const ULID = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'Mã sai khuôn');
const createBody = z.object({
  slug: z.string().min(3).max(30),
  domain: z.string().min(3).max(253),
  displayName: z.string().max(200).optional(),
  // Không dùng z.string().email(): kiểm khuôn tối thiểu, Kernel kiểm tiếp khi tạo người dùng.
  owner: z.object({ email: z.string().min(3).max(254).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Email sai khuôn'), name: z.string().max(200).optional(), phone: z.string().max(30).optional() }),
  sample: z.boolean().optional(),
  externalRef: z.string().max(120).optional(),
});

/** Cổng chung của mọi route: chế độ multi + tên miền điều hành + khoá prov_…; trả mã khoá. */
async function gate(req: FastifyRequest): Promise<string> {
  if (siteMode() !== 'multi' || !env.SITE_ADMIN_HOST || normalizeHost(req.host) !== env.SITE_ADMIN_HOST) {
    throw new ProvisionHttpError(404, 'NOT_FOUND', `Không có đường dẫn ${req.method} ${req.url.split('?')[0]}`);
  }
  return authenticateKey(req.headers.authorization, req.ip);
}

/** Lỗi của Provisioning API ra khuôn chung; lỗi khác để bộ xử lý lỗi chung lo. */
function handle<T>(fn: (req: FastifyRequest, keyId: string, reply: FastifyReply) => Promise<T>) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      return await fn(req, await gate(req), reply);
    } catch (err) {
      if (err instanceof ProvisionHttpError) return reply.code(err.status).send({ ok: false, error: { code: err.code, message: err.message, requestId: String(req.id) } });
      throw err;
    }
  };
}

export async function provisioningRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.get('/_sites/v1/health', { config: { public: true }, schema: { tags, summary: 'Provisioning API: hợp đồng, số site theo trạng thái' }, handler: handle(async () => health()) });

  // @bizcity-route: giao thức Provisioning API (máy chủ gọi máy chủ, khoá prov_…, Idempotency-Key) — tạo database + vai trò của site, không ghi sổ
  r.post('/_sites/v1/sites', {
    config: { public: true }, schema: { tags, summary: 'Tạo site (việc chạy nền) → 202 { jobId, siteId }', body: createBody },
    handler: handle(async (req, keyId, reply) => {
      const idem = String(req.headers['idempotency-key'] ?? '');
      if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idem)) throw new ProvisionHttpError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Lệnh ghi phải có header Idempotency-Key (8–128 ký tự)');
      const out = await startProvision(keyId, idem, req.body as z.infer<typeof createBody>);
      return reply.code(202).send({ jobId: out.jobId, siteId: out.siteId });
    }),
  });

  r.get('/_sites/v1/sites', {
    config: { public: true }, schema: { tags, summary: 'Danh sách site', querystring: z.object({ status: z.enum(['provisioning', 'active', 'suspended', 'upgrading', 'migration_failed', 'deleted']).optional() }) },
    handler: handle(async (req) => listSitesDto((req.query as { status?: string }).status)),
  });

  r.get('/_sites/v1/sites/:siteId', {
    config: { public: true }, schema: { tags, summary: 'Một site', params: z.object({ siteId: ULID }) },
    handler: handle(async (req) => getSite((req.params as { siteId: string }).siteId)),
  });

  r.get('/_sites/v1/jobs/:jobId', {
    config: { public: true }, schema: { tags, summary: 'Trạng thái việc (lần đọc đầu của việc tạo site xong kèm mật khẩu ban đầu của chủ site)', params: z.object({ jobId: ULID }) },
    handler: handle(async (req, keyId) => getJob(keyId, (req.params as { jobId: string }).jobId)),
  });
}
