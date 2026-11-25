// [2026-11-25 09:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-039: điều chỉnh điểm tay có duyệt (đóng góp)
/** GET /api/v1/m/loyalty/adjustments/:id — một yêu cầu điều chỉnh kèm nhật ký (ai lập, ai duyệt). */
import { defineAction, z } from '@bizcity/module-sdk';
import { getAdjustment } from '../adjust.js';

export default defineAction({
  id: 'loyalty.adjustment.get', title: 'Xem yêu cầu điều chỉnh điểm', tags: ['Điểm thành viên'],
  permission: 'loyalty:read', effect: 'read', idempotency: 'none', errors: ['NOT_FOUND'],
  input: z.object({ id: z.string().trim().min(1).max(64) }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'GET', path: '/adjustments/:id' }, mcp: false, ai: 'read' },
  handler: async (ctx, { id }) => ctx.data.module((tx) => getAdjustment(tx, id)),
});
