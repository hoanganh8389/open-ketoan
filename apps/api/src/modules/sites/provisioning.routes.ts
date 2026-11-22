// @bizcity-layer P apps/api
// [2026-11-22 10:48 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B5a (D039-14): route Provisioning API /_sites/v1 — chỉ chế độ multi, chỉ tên miền điều hành, khoá prov_…, Idempotency-Key bắt buộc với lệnh ghi
// [2026-11-22 01:29 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B5b: đủ lệnh vòng đời (khoá / mở / xoá mềm / tên miền / sao lưu / khôi phục); Site có trường sức khoẻ; lọc ?attention=1
/**
 * Provisioning API `bizcity_site_provisioning@1` (máy chủ gọi máy chủ: WordPress, Site Manager, script vận hành).
 *   GET    /_sites/v1/health                         hợp đồng, bản ứng dụng, lược đồ cần, số site theo trạng thái / dấu cần chú ý
 *   POST   /_sites/v1/sites                          tạo site → 202 { jobId, siteId }
 *   GET    /_sites/v1/sites                          danh sách (?status=, ?attention=1, ?updatedAfter=, ?limit=, ?cursor=) → { items, next }
 *   GET    /_sites/v1/sites/:siteId                  một site, kèm thử kết nối database (trường database)
 *   POST   /_sites/v1/sites/:siteId/suspend          khoá chỉ đọc → 202 { jobId }          thân: { reason? }
 *   POST   /_sites/v1/sites/:siteId/resume           mở lại → 202 { jobId }
 *   POST   /_sites/v1/sites/:siteId/domains          thêm tên miền → 200 Site               thân: { domain, primary? }
 *   DELETE /_sites/v1/sites/:siteId/domains/:domain  bỏ tên miền phụ → 200 Site
 *   POST   /_sites/v1/sites/:siteId/backups          sao lưu ngay → 202 { jobId }
 *   GET    /_sites/v1/sites/:siteId/backups          các bản sao lưu đã kiểm
 *   POST   /_sites/v1/sites/:siteId/restore          khôi phục → 202 { jobId }              thân: { backupId }
 *   DELETE /_sites/v1/sites/:siteId                  xoá mềm (cần đang khoá + sao lưu ≤ 24 giờ) → 202 { jobId }
 *   GET    /_sites/v1/jobs/:jobId                    trạng thái việc; việc tạo site xong: lần đọc đầu kèm mật khẩu ban đầu của chủ site
 *
 * Chỉ trả lời khi SITE_MODE=multi VÀ tên miền của yêu cầu = SITE_ADMIN_HOST; khác đi là 404 như đường không tồn tại.
 * Mọi lệnh ghi cần header Idempotency-Key. Thân phản hồi theo hợp đồng (không bọc { ok, data }); lỗi theo khuôn chung.
 * Không qua phiên đăng nhập (`public: true`): xác thực bằng khoá prov_… ngay trong route.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { env } from '@bizcity/platform/config/env';
import { siteMode } from '@bizcity/platform/db/site';
import { normalizeHost } from '@bizcity/platform/db/site-registry';
// [2026-11-22 02:25 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B7b-1: bộ thu số đo bizcity_sites / bizcity_sites_attention (mỗi 5 phút, chỉ chế độ multi)
import { metrics, registerCollector } from '@bizcity/platform/core/metrics';
import {
  addDomain, authenticateKey, getJob, getSite, health, listSiteBackups, listSitesDto, PAGE_MAX, ProvisionHttpError, removeDomain, startProvision, startSiteJob,
} from './provisioning.service.js';

const tags = ['Provisioning API (nhiều site)'];
const ULID = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'Mã sai khuôn');
const siteParams = z.object({ siteId: ULID });
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

/** Header Idempotency-Key của lệnh ghi (8–128 ký tự). */
function idemOf(req: FastifyRequest): string {
  const idem = String(req.headers['idempotency-key'] ?? '');
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idem)) throw new ProvisionHttpError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Lệnh ghi phải có header Idempotency-Key (8–128 ký tự)');
  return idem;
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

const siteIdOf = (req: FastifyRequest) => (req.params as { siteId: string }).siteId;

const SITE_STATUSES = ['provisioning', 'active', 'suspended', 'upgrading', 'migration_failed', 'deleted'] as const;
const ATTENTION_FLAGS = ['backup_missing', 'backup_stale', 'schema_behind', 'migration_failed', 'upgrading', 'suspended'] as const;

/** Số site theo trạng thái / dấu cần chú ý, đặt đủ mọi nhãn (0 khi không có) để giá trị cũ không đọng. Chế độ single: không làm gì. */
export async function collectSiteMetrics(): Promise<void> {
  if (siteMode() !== 'multi') return;
  const h = await health();
  for (const s of SITE_STATUSES) metrics.sites.set({ status: s }, h.sites[s] ?? 0);
  for (const f of ATTENTION_FLAGS) metrics.sitesAttention.set({ flag: f }, h.attention[f] ?? 0);
}

export async function provisioningRoutes(app: FastifyInstance): Promise<void> {
  registerCollector('sites', collectSiteMetrics, 5 * 60_000);
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.get('/_sites/v1/health', { config: { public: true }, schema: { tags, summary: 'Provisioning API: hợp đồng, bản ứng dụng, số site theo trạng thái / dấu cần chú ý' }, handler: handle(async () => health()) });

  // @bizcity-route: giao thức Provisioning API (máy chủ gọi máy chủ, khoá prov_…, Idempotency-Key) — tạo database + vai trò của site, không ghi sổ
  r.post('/_sites/v1/sites', {
    config: { public: true }, schema: { tags, summary: 'Tạo site (việc chạy nền) → 202 { jobId, siteId }', body: createBody },
    handler: handle(async (req, keyId, reply) => {
      const out = await startProvision(keyId, idemOf(req), req.body as z.infer<typeof createBody>);
      return reply.code(202).send({ jobId: out.jobId, siteId: out.siteId });
    }),
  });

  r.get('/_sites/v1/sites', {
    config: { public: true },
    schema: {
      tags, summary: 'Danh sách site (kèm trường sức khoẻ), sắp theo lần đổi; phân trang con trỏ',
      // [2026-11-22 03:26 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B5c: updatedAfter (ISO 8601), limit 1–500 (mặc định 100), cursor = "next" của trang trước
      querystring: z.object({
        status: z.enum(['provisioning', 'active', 'suspended', 'upgrading', 'migration_failed', 'deleted']).optional(),
        attention: z.enum(['1', 'true']).optional(),
        updatedAfter: z.string().datetime({ offset: true }).optional(),
        limit: z.coerce.number().int().min(1).max(PAGE_MAX).optional(),
        cursor: z.string().min(8).max(400).optional(),
      }),
    },
    handler: handle(async (req) => {
      const q = req.query as { status?: string; attention?: string; updatedAfter?: string; limit?: number; cursor?: string };
      return listSitesDto({
        ...(q.status ? { status: q.status } : {}), attention: q.attention !== undefined,
        ...(q.updatedAfter ? { updatedAfter: q.updatedAfter } : {}), ...(q.limit ? { limit: q.limit } : {}), ...(q.cursor ? { cursor: q.cursor } : {}),
      });
    }),
  });

  r.get('/_sites/v1/sites/:siteId', {
    config: { public: true }, schema: { tags, summary: 'Một site, kèm thử kết nối database', params: siteParams },
    handler: handle(async (req) => getSite(siteIdOf(req))),
  });

  // @bizcity-route: giao thức Provisioning API — khoá site chỉ đọc (registry), không ghi sổ
  r.post('/_sites/v1/sites/:siteId/suspend', {
    config: { public: true }, schema: { tags, summary: 'Khoá site (chỉ đọc) → 202 { jobId }', params: siteParams, body: z.object({ reason: z.string().max(500).optional() }).nullish() },
    handler: handle(async (req, keyId, reply) => {
      const out = await startSiteJob(keyId, idemOf(req), 'suspend', siteIdOf(req), { reason: (req.body as { reason?: string } | null | undefined)?.reason ?? '' });
      return reply.code(202).send({ jobId: out.jobId });
    }),
  });

  // @bizcity-route: giao thức Provisioning API — mở lại site (registry), không ghi sổ
  r.post('/_sites/v1/sites/:siteId/resume', {
    config: { public: true }, schema: { tags, summary: 'Mở lại site → 202 { jobId }', params: siteParams },
    handler: handle(async (req, keyId, reply) => reply.code(202).send({ jobId: (await startSiteJob(keyId, idemOf(req), 'resume', siteIdOf(req))).jobId })),
  });

  // @bizcity-route: giao thức Provisioning API — thêm tên miền của site (registry), không ghi sổ
  r.post('/_sites/v1/sites/:siteId/domains', {
    config: { public: true }, schema: { tags, summary: 'Thêm tên miền → 200 Site', params: siteParams, body: z.object({ domain: z.string().min(3).max(253), primary: z.boolean().optional() }) },
    handler: handle(async (req) => {
      idemOf(req);
      const b = req.body as { domain: string; primary?: boolean };
      return addDomain(siteIdOf(req), b.domain, b.primary === true);
    }),
  });

  // @bizcity-route: giao thức Provisioning API — bỏ tên miền phụ của site (registry), không ghi sổ
  r.delete('/_sites/v1/sites/:siteId/domains/:domain', {
    config: { public: true }, schema: { tags, summary: 'Bỏ tên miền phụ → 200 Site', params: z.object({ siteId: ULID, domain: z.string().min(3).max(253) }) },
    handler: handle(async (req) => {
      idemOf(req);
      return removeDomain(siteIdOf(req), (req.params as { domain: string }).domain);
    }),
  });

  // @bizcity-route: giao thức Provisioning API — sao lưu database của site (pg_dump), không ghi sổ
  r.post('/_sites/v1/sites/:siteId/backups', {
    config: { public: true }, schema: { tags, summary: 'Sao lưu ngay → 202 { jobId }', params: siteParams },
    handler: handle(async (req, keyId, reply) => reply.code(202).send({ jobId: (await startSiteJob(keyId, idemOf(req), 'backup', siteIdOf(req))).jobId })),
  });

  r.get('/_sites/v1/sites/:siteId/backups', {
    config: { public: true }, schema: { tags, summary: 'Các bản sao lưu đã kiểm (mới trước)', params: siteParams },
    handler: handle(async (req) => listSiteBackups(siteIdOf(req))),
  });

  // @bizcity-route: giao thức Provisioning API — khôi phục database của site từ bản sao lưu của chính nó (database cũ giữ lại), không ghi sổ
  r.post('/_sites/v1/sites/:siteId/restore', {
    config: { public: true }, schema: { tags, summary: 'Khôi phục từ một bản sao lưu → 202 { jobId }', params: siteParams, body: z.object({ backupId: ULID }) },
    handler: handle(async (req, keyId, reply) => {
      const out = await startSiteJob(keyId, idemOf(req), 'restore', siteIdOf(req), { backupId: (req.body as { backupId: string }).backupId });
      return reply.code(202).send({ jobId: out.jobId });
    }),
  });

  // @bizcity-route: giao thức Provisioning API — xoá mềm site (đổi tên database, giữ 30 ngày), không ghi sổ
  r.delete('/_sites/v1/sites/:siteId', {
    config: { public: true }, schema: { tags, summary: 'Xoá mềm (cần đang khoá + sao lưu ≤ 24 giờ) → 202 { jobId }', params: siteParams },
    handler: handle(async (req, keyId, reply) => reply.code(202).send({ jobId: (await startSiteJob(keyId, idemOf(req), 'delete', siteIdOf(req))).jobId })),
  });

  r.get('/_sites/v1/jobs/:jobId', {
    config: { public: true }, schema: { tags, summary: 'Trạng thái việc (lần đọc đầu của việc tạo site xong kèm mật khẩu ban đầu của chủ site)', params: z.object({ jobId: ULID }) },
    handler: handle(async (req, keyId) => getJob(keyId, (req.params as { jobId: string }).jobId)),
  });
}
