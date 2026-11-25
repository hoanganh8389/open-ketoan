// [2026-11-25 09:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-039: điều chỉnh điểm tay có duyệt (đóng góp)
/** POST /api/v1/m/loyalty/adjustments/:id/reject — từ chối yêu cầu điều chỉnh kèm lý do; người lập không tự từ chối. */
import { defineAction, z } from '@bizcity/module-sdk';
import { rejectAdjustment } from '../adjust.js';

export default defineAction({
  id: 'loyalty.adjustment.reject', title: 'Từ chối điều chỉnh điểm', tags: ['Điểm thành viên'],
  permission: 'loyalty:dieu-chinh-duyet', effect: 'write', sideEffects: ['documents'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND', 'FORBIDDEN'],
  input: z.object({ id: z.string().trim().min(1).max(64), reason: z.string().trim().min(1, 'Ghi lý do từ chối').max(500) }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/adjustments/:id/reject' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'loyalty.adjustment', objectId: (i) => i.id },
  handler: async (ctx, i) => ctx.data.module((tx) => rejectAdjustment(tx, ctx, i.id, i.reason)),
});
