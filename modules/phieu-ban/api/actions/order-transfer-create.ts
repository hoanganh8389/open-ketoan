/**
 * POST /api/v1/m/phieu-ban/orders/:id/transfers — "Lập chuyển kho" cho đơn Đã gửi thiếu hàng (NT-BH-041), ba bước:
 *   prepare: kiểm (đơn Đã gửi; quyền kho:chuyen-kho-lap → thiếu thì FORBIDDEN; kho xuất là kho ứng viên; mã đang thiếu; SL ≤ tồn kho
 *            xuất → VALIDATION_ERROR, error.fields lines[i].qty), giữ chỗ "đang lập" (người khác cùng lúc → CONFLICT PHIEU_BAN_ORDER_STATE cause transfer_busy),
 *            trả `payload` = phiếu KHO01 về kho bán của đơn, xuất luôn — màn gửi payload tới POST /api/v1/kho/transfers bằng phiên người bấm;
 *   record:  nối phiếu KHO01 vừa lập vào đơn (body.transfers + lịch sử); gửi lại cùng phiếu không ghi hai lần;
 *   abort:   KHO01 từ chối → bỏ chỗ "đang lập".
 */
// [2026-11-25 Võ Hoàng] NGHIEM-THU — NT-BH-041: Lập chuyển kho từ đơn đặt hàng (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { transferCreate } from '../order-service.js';

export default defineAction({
  id: 'phieu-ban.order.transfer-create', title: 'Lập chuyển kho (KHO01) cho đơn đặt hàng thiếu hàng', tags: ['Đơn đặt hàng'],
  permission: 'phieu-ban:write', effect: 'write', sideEffects: ['documents'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND', 'FORBIDDEN'],
  input: z.object({
    id: z.string().trim().min(1).max(64),
    step: z.enum(['prepare', 'record', 'abort']).default('prepare'),
    fromBranchCode: z.string().trim().max(32).default(''),
    fromWarehouse: z.string().trim().max(64).default(''),
    lines: z.array(z.object({ sku: z.string().trim().min(1).max(64), qty: z.number().finite().min(0) })).max(500).default([]),
    note: z.string().trim().max(500).optional(),
    transfer: z.object({ id: z.string().trim().max(32), docNo: z.string().trim().max(64), status: z.string().trim().max(32).optional() }).optional(),
  }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/orders/:id/transfers' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'phieu-ban.order', objectId: (input) => input.id },
  handler: async (ctx, { id, ...i }) => transferCreate(ctx, id, i),
});
