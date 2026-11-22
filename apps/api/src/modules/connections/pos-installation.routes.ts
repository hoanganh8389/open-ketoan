// @bizcity-layer A adapters/wordpress
// [2026-11-23 09:30 AM Johnny Chu - Chu Hoàng Anh] OKT-SET-1 — ADR-0037 §4: route khoá cài đặt open-pos (bản cài, người dùng, ping khoá thường)
/**
 * Khoá cài đặt open-pos (ADR-0037, luật tối thượng P-0 ý 2). Tài liệu: docs/api/pos-installation.md.
 *
 * Người dùng (quyền settings:write, chỉ người đăng nhập):
 *   GET  /api/v1/pos-installations                 bản cài của tenant này + cửa hàng đã nối vào tenant này + ping khoá thường
 *   POST /api/v1/pos-installations                 tạo khoá cài đặt (khoá chỉ hiện một lần)
 *   POST /api/v1/pos-installations/:code/revoke    thu hồi khoá — mọi yêu cầu sau đó 401
 *   POST /api/v1/pos-installations/link            nhận cửa hàng: nhập mã nối → blog nối vào tenant đang đứng
 * Bridge — khoá cài đặt, KHÔNG mang X-OKT-Blog (chạy trong tenant chủ, INSTALLATION_ROUTES):
 *   GET  /api/v1/pos-installation/blogs            trạng thái từng blog
 *   POST /api/v1/pos-installation/blogs            đăng ký / cập nhật blog; blog chờ nhận mã nối
 *   POST /api/v1/pos-installation/ping             ping cả bản cài
 * Bridge — khoá API thường (bizcity / một cửa hàng):
 *   POST /api/v1/connection/ping                   ping của blog đó (ghi pos_connections của tenant khoá)
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authOf, requireAuthenticated, requireInstallation, requirePermission } from '../../core/auth.js';
import { ok } from '../../core/http.js';
import { defineAction, mountActions, type AnyActionDef } from '@bizcity/platform/core/actions';
import { db } from '../../db/client.js';
import { posInstallationService } from './pos-installation.service.js';

const tags = ['Kết nối open-pos'];
const anyOut = z.custom<object>((v) => typeof v === 'object' && v !== null);
const blogId = z.number().int().min(1).max(999_999_999);
const text = (max: number) => z.string().trim().max(max);
const count = z.number().int().min(0).max(10_000_000);
const pingFields = {
  blogId,
  bridgeVersion: text(40).optional(),
  queueGroups: count.optional(),
  pendingDocs: count.optional(),
  latencyMs: z.number().int().min(0).max(600_000).optional(),
};
const blogsBody = z.object({
  blogs: z.array(z.object({ blogId, name: text(200).optional(), url: text(300).optional(), renewLinkCode: z.boolean().optional() })).min(1).max(500),
});
const pingBody = z.object({ blogs: z.array(z.object(pingFields)).max(500) });

export async function posInstallationRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/pos-installations', {
    preHandler: requirePermission('settings:write'),
    schema: { tags, summary: 'Khoá cài đặt open-pos của đơn vị, cửa hàng đã nối vào đơn vị, ping của khoá thường' },
    handler: async (req) => ok(await posInstallationService.list(authOf(req))),
  });

  r.get('/api/v1/pos-installation/blogs', {
    preHandler: [requireAuthenticated(), requireInstallation()],
    schema: { tags, summary: 'Bridge (khoá cài đặt): trạng thái từng blog của bản cài' },
    handler: async (req) => ok(await posInstallationService.listBlogs(authOf(req))),
  });

  // @bizcity-route: giao thức của bridge (khoá cài đặt, không có người dùng) — đăng ký blog đặt trạng thái tuyệt đối, gửi lại không tạo thêm; mã nối chỉ trả lúc sinh
  r.post('/api/v1/pos-installation/blogs', {
    preHandler: [requireAuthenticated(), requireInstallation()],
    schema: { tags, summary: 'Bridge (khoá cài đặt): đăng ký / cập nhật blog; blog chờ nhận mã nối một lần', body: blogsBody },
    handler: async (req) => ok(await posInstallationService.registerBlogs(authOf(req), req.body.blogs)),
  });

  // @bizcity-route: giao thức của bridge (khoá cài đặt) — ping chỉ ghi thời điểm / số đo của blog đã đăng ký, không đụng sổ
  r.post('/api/v1/pos-installation/ping', {
    preHandler: [requireAuthenticated(), requireInstallation()],
    schema: { tags, summary: 'Bridge (khoá cài đặt): ping cả bản cài — phiên bản, hàng chờ, độ trễ từng blog', body: pingBody },
    handler: async (req) => ok(await posInstallationService.ping(authOf(req), req.body.blogs)),
  });

  // @bizcity-route: giao thức của bridge (khoá API thường) — ping chỉ ghi lần ping cuối của blog vào tenant của khoá, không đụng sổ, không sinh biên nhận mỗi lượt
  r.post('/api/v1/connection/ping', {
    preHandler: requirePermission('documents:write'),
    schema: { tags, summary: 'Bridge (khoá API thường — bizcity / một cửa hàng): ping của blog', body: z.object({ ...pingFields, name: text(200).optional(), url: text(300).optional() }) },
    handler: async (req) => ok(await db.transaction().execute((tx) => posInstallationService.directPing(tx, authOf(req), req.body))),
  });

  mountActions(app, posInstallationActions);
}

export const posInstallationActions: AnyActionDef[] = [
  defineAction({
    id: 'core.pos-installation.create', title: 'Tạo khoá cài đặt open-pos', tags,
    permission: 'settings:write', effect: 'write', sideEffects: ['settings'], idempotency: 'required',
    input: z.object({ name: text(120).min(1), siteUrl: text(300).optional() }), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/pos-installations', status: 201 }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'pos_installation' },
    handler: (ctx, input) => posInstallationService.create(ctx.data.tx, ctx.legacyAuth, input),
  }),
  defineAction({
    id: 'core.pos-installation.revoke', title: 'Thu hồi khoá cài đặt open-pos', tags,
    permission: 'settings:write', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: z.object({ code: z.string().regex(/^inst_[0-9A-Z]{26}$/) }), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/pos-installations/:code/revoke' }, mcp: false, ai: 'deny', destructive: true },
    evidence: { objectType: 'pos_installation' },
    handler: (ctx, input) => posInstallationService.revoke(ctx.data.tx, ctx.legacyAuth, input.code),
  }),
  defineAction({
    id: 'core.pos-installation.link', title: 'Nhận cửa hàng open-pos bằng mã nối', tags,
    permission: 'settings:write', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
    input: z.object({ linkCode: z.string().trim().min(8).max(16) }), output: anyOut,
    expose: { http: { method: 'POST', path: '/api/v1/pos-installations/link' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'pos_installation_blog' },
    handler: (ctx, input) => posInstallationService.link(ctx.data.tx, ctx.legacyAuth, input.linkCode),
  }),
];
