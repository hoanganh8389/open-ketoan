/**
 * GET /api/v1/m/phieu-ban/orders/:id/transfer-sources — kho có hàng để "Lập chuyển kho" cho đơn Đã gửi đang thiếu (NT-BH-041): mã thiếu
 * (bỏ dòng dịch vụ), kho ứng viên cùng cửa hàng (trừ kho bán, KCB, KHG) → chi nhánh cha → cửa hàng cùng cha kèm tồn từng mã, các phiếu
 * đã lập cho đơn, `canCreate` (người xem có quyền kho:chuyen-kho-lap). Đơn không Đã gửi → CONFLICT PHIEU_BAN_ORDER_STATE.
 */
// [2026-11-25 Võ Hoàng] NGHIEM-THU — NT-BH-041: kho ứng viên cho Lập chuyển kho (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { transferSources } from '../order-service.js';

export default defineAction({
  id: 'phieu-ban.order.transfer-sources', title: 'Kho có hàng để chuyển cho đơn đặt hàng thiếu hàng', tags: ['Đơn đặt hàng'],
  permission: 'phieu-ban:read', effect: 'read', idempotency: 'none', errors: ['NOT_FOUND', 'CONFLICT'],
  input: z.object({ id: z.string().trim().min(1).max(64) }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'GET', path: '/orders/:id/transfer-sources' }, mcp: true, ai: 'read' },
  handler: async (ctx, { id }) => transferSources(ctx, id),
});
