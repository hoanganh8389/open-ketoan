/** DELETE /api/v1/m/xuat-dieu-chinh/phieu/:id — xoá nháp (người lập hoặc kế toán). Phiếu đã ghi sổ không xoá — huỷ. */
// [2026-11-26 03:10 PM Võ Hoàng] NGHIEM-THU — NT-BH-044: xoá nháp BH06 (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { removeDraft } from '../service.js';
import { branchOfPhieu } from '../store.js';

export default defineAction({
  id: 'xuat-dieu-chinh.phieu.delete', title: 'Xoá nháp phiếu xuất điều chỉnh', tags: ['Phiếu xuất điều chỉnh'],
  permission: 'xuat-dieu-chinh:phieu-lap', effect: 'write', sideEffects: ['documents'], idempotency: 'natural',
  errors: ['CONFLICT', 'NOT_FOUND', 'FORBIDDEN'],
  input: z.object({ id: z.string().trim().min(1).max(64), version: z.coerce.number().int().optional() }),
  output: z.object({ id: z.string(), deleted: z.boolean() }),
  expose: { http: { method: 'DELETE', path: '/phieu/:id' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'xuat-dieu-chinh.phieu', objectId: (i) => i.id },
  branchOf: async (ctx, i) => ctx.data.module((tx) => branchOfPhieu(tx, i.id)),
  handler: async (ctx, { id, version }) => removeDraft(ctx, id, version),
});
