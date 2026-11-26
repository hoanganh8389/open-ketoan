/** POST /api/v1/m/xuat-dieu-chinh/phieu/:id/cancel — huỷ phiếu đã ghi sổ: bút toán đảo, lý do huỷ bắt buộc; kỳ khoá → PERIOD_LOCKED. */
// [2026-11-26 03:10 PM Võ Hoàng] NGHIEM-THU — NT-BH-044: huỷ phiếu BH06 (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { cancel } from '../service.js';
import { branchOfPhieu } from '../store.js';

export default defineAction({
  id: 'xuat-dieu-chinh.phieu.cancel', title: 'Huỷ phiếu xuất điều chỉnh (bút toán đảo)', tags: ['Phiếu xuất điều chỉnh'],
  permission: 'xuat-dieu-chinh:phieu-huy', effect: 'write', sideEffects: ['documents', 'ledger'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND', 'FORBIDDEN', 'PERIOD_LOCKED'],
  input: z.object({ id: z.string().trim().min(1).max(64), reason: z.string().trim().max(500).default('') }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/phieu/:id/cancel' }, mcp: false, ai: 'deny', destructive: true },
  evidence: { objectType: 'xuat-dieu-chinh.phieu', objectId: (i) => i.id },
  branchOf: async (ctx, i) => ctx.data.module((tx) => branchOfPhieu(tx, i.id)),
  handler: async (ctx, { id, reason }) => cancel(ctx, id, reason),
});
