/**
 * POST /api/v1/m/de-nghi-dieu-chuyen/phieu/:id/approve — Duyệt, ba bước:
 *   prepare: kiểm (Chờ duyệt; quyền kho:chuyen-kho-lap; tồn kho xuất), giữ chỗ "đang lập", trả `payload` = phiếu KHO01 (xuất luôn) — màn gửi
 *            payload tới POST /api/v1/kho/transfers bằng phiên người duyệt;
 *   record:  ghi phiếu KHO01 vừa lập vào đề nghị → Đã lập chuyển kho (gửi lại cùng phiếu không ghi hai lần);
 *   abort:   KHO01 từ chối → bỏ chỗ "đang lập", đề nghị về Chờ duyệt.
 */
// [2026-11-28 10:00 AM Võ Hoàng] NGHIEM-THU — NT-BH-056: duyệt đề nghị → phiếu chuyển kho KHO01 (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { duyetDeNghi } from '../service.js';
import { branchOfClaim } from '../store.js';

export default defineAction({
  id: 'de-nghi-dieu-chuyen.phieu.approve', title: 'Duyệt đề nghị điều chuyển (lập phiếu chuyển kho KHO01)', tags: ['Đề nghị điều chuyển'],
  permission: 'de-nghi-dieu-chuyen:duyet', effect: 'write', sideEffects: ['documents'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND', 'FORBIDDEN'],
  input: z.object({
    id: z.string().trim().min(1).max(32), branchCode: z.string().trim().max(32).optional(), step: z.enum(['prepare', 'record', 'abort']).default('prepare'), note: z.string().trim().max(500).optional(),
    transfer: z.object({ id: z.string().trim().max(32), docNo: z.string().trim().max(64), status: z.string().trim().max(32).optional() }).optional(),
  }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/phieu/:id/approve' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'de-nghi-dieu-chuyen.phieu', objectId: (i) => i.id },
  branchOf: async (ctx, i) => ctx.data.module((tx) => branchOfClaim(tx, i.id, i.branchCode)),
  handler: async (ctx, { id, branchCode: _b, ...i }) => duyetDeNghi(ctx, id, i),
});
