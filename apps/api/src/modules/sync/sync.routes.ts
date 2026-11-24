// @bizcity-layer M data/masterdata
// [2026-11-24 07:10 PM Johnny Chu - Chu Hoàng Anh] SPINE-3 — Q-SPINE-3 (chủ duyệt 2026-11-24): route changefeed + digest danh mục (bizcity_sync@1). Chỉ đọc, quyền catalog:read; theo khuôn route đọc đã chốt (branch.routes.ts).
/**
 * Changefeed danh mục cho app khác kéo bản sao và đối chiếu (chuẩn xương sống bizcity_spine@1 §4.1).
 *   GET /api/v1/sync/:axis          ?since=<cursor>&limit=<1..1000>   trang thay đổi theo (updated_at, id); dòng ngừng vẫn có, deleted = true
 *   GET /api/v1/sync/:axis/digest   ?since=<cursor>                   [{ id, version, deleted }] để so băm theo id
 * axis ∈ items (kèm codes + units) · partners · branches. cursor = `<updated_at ISO>|<id>` do máy chủ trả, app chỉ chuyền lại.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authOf, requirePermission } from '../../core/auth.js';
import { ok } from '../../core/http.js';
import { SYNC_AXES, SYNC_MAX_LIMIT, syncService } from './sync.service.js';

const tags = ['Danh mục: Đồng bộ (changefeed)'];
const params = z.object({ axis: z.enum(SYNC_AXES) });
/** Con trỏ do máy chủ phát: `<updated_at>|<id>`; chuỗi khác bị chặn ở cửa, service không phải đoán. */
const cursor = z.string().min(3).max(200).regex(/^[^|]+\|[^|]*$/, 'since phải là con trỏ máy chủ đã trả: <updated_at>|<id>');

export async function syncRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/v1/sync/:axis', {
    preHandler: requirePermission('catalog:read'),
    schema: {
      tags, summary: 'Trang thay đổi của danh mục theo con trỏ (bizcity_sync@1)', params,
      querystring: z.object({ since: cursor.optional(), limit: z.coerce.number().int().min(1).max(SYNC_MAX_LIMIT).default(200) }),
    },
    handler: async (req) => {
      const page = await syncService.page(req.params.axis, authOf(req).tenantId, req.query.since, req.query.limit);
      return ok(page.data, { ...page.meta });
    },
  });

  r.get('/api/v1/sync/:axis/digest', {
    preHandler: requirePermission('catalog:read'),
    schema: { tags, summary: 'Băm theo id để đối chiếu bản sao (bizcity_sync@1)', params, querystring: z.object({ since: cursor.optional() }) },
    handler: async (req) => ok(await syncService.digest(req.params.axis, authOf(req).tenantId, req.query.since)),
  });
}
