// [2026-11-25 09:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-039: điều chỉnh điểm tay có duyệt (đóng góp)
/**
 * POST /api/v1/m/loyalty/adjustments/:id/approve — duyệt yêu cầu điều chỉnh: ghi một dòng adjust ở sổ điểm (ref manual = mã yêu cầu). Người lập
 * không tự duyệt (FORBIDDEN). Trừ quá số điểm dùng được lúc duyệt → CONFLICT LOYALTY_ADJUST_OVER_BALANCE.
 */
import { defineAction, z } from '@bizcity/module-sdk';
import { approveAdjustment } from '../adjust.js';

export default defineAction({
  id: 'loyalty.adjustment.approve', title: 'Duyệt điều chỉnh điểm', tags: ['Điểm thành viên'],
  permission: 'loyalty:dieu-chinh-duyet', effect: 'write', sideEffects: ['documents'], idempotency: 'required',
  errors: ['CONFLICT', 'NOT_FOUND', 'FORBIDDEN'],
  input: z.object({ id: z.string().trim().min(1).max(64), note: z.string().trim().max(500).optional() }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/adjustments/:id/approve' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'loyalty.adjustment', objectId: (i) => i.id },
  handler: async (ctx, i) => ctx.data.module((tx) => approveAdjustment(tx, ctx, i.id, i.note)),
});
