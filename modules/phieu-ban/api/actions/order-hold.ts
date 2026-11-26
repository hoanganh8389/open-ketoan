/**
 * POST /api/v1/m/phieu-ban/orders/:id/hold — "Giữ lại hàng" (NT-BH-041): đơn Đã gửi → cân giữ hàng lại với tồn hiện tại của kho bán
 * (chứng từ <số đơn>-G<n> kho bán → KCB như lúc gửi). Không giữ thêm được → meta.holdNothing. Đơn khác Đã gửi → CONFLICT PHIEU_BAN_ORDER_STATE.
 */
// [2026-11-25 Võ Hoàng] NGHIEM-THU — NT-BH-041: Giữ lại hàng (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { holdAgain } from '../order-service.js';

export default defineAction({
  id: 'phieu-ban.order.hold', title: 'Giữ lại hàng cho đơn đặt hàng (khi kho bán có thêm hàng)', tags: ['Đơn đặt hàng'],
  permission: 'phieu-ban:write', effect: 'write', sideEffects: ['documents', 'ledger'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND', 'PERIOD_LOCKED'],
  input: z.object({ id: z.string().trim().min(1).max(64) }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/orders/:id/hold' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'phieu-ban.order', objectId: (input) => input.id },
  handler: async (ctx, { id }) => holdAgain(ctx, id),
});
