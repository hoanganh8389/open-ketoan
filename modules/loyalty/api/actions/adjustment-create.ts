// [2026-11-25 09:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-039: điều chỉnh điểm tay có duyệt (đóng góp)
/**
 * POST /api/v1/m/loyalty/adjustments — lập yêu cầu cộng / trừ điểm tay (chờ duyệt): khách, số điểm có dấu, lý do bắt buộc. Không trần (Q2);
 * trừ quá số điểm dùng được → VALIDATION_ERROR LOYALTY_ADJUST_OVER_BALANCE ở ô số điểm. Mọi lỗi nhập trả một lần.
 */
import { defineAction, z } from '@bizcity/module-sdk';
import { createAdjustment } from '../adjust.js';

export default defineAction({
  id: 'loyalty.adjustment.create', title: 'Lập yêu cầu điều chỉnh điểm', tags: ['Điểm thành viên'],
  permission: 'loyalty:dieu-chinh-lap', effect: 'write', sideEffects: ['documents'], idempotency: 'required',
  errors: ['VALIDATION_ERROR'],
  input: z.object({ customerCode: z.string().max(64), points: z.number().finite(), reason: z.string().max(500), branchCode: z.string().trim().max(32).optional() }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/adjustments' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'loyalty.adjustment', objectId: (i) => i.customerCode },
  handler: async (ctx, i) => ctx.data.module((tx) => createAdjustment(tx, ctx, i)),
});
