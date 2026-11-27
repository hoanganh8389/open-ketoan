/** GET /api/v1/m/de-nghi-dieu-chuyen/phieu/:id — một đề nghị đầy đủ (dòng hàng, phiếu KHO01 đã lập nếu có). */
// [2026-11-28 10:00 AM Võ Hoàng] NGHIEM-THU — NT-BH-056: xem đề nghị điều chuyển (đóng góp)
import { Errors, defineAction, z } from '@bizcity/module-sdk';
import { getPhieu, toPhieu } from '../store.js';

export default defineAction({
  id: 'de-nghi-dieu-chuyen.phieu.get', title: 'Xem đề nghị điều chuyển', tags: ['Đề nghị điều chuyển'],
  permission: 'de-nghi-dieu-chuyen:xem', effect: 'read', idempotency: 'none', errors: ['NOT_FOUND', 'FORBIDDEN'],
  input: z.object({ id: z.string().trim().min(1).max(32), branchCode: z.string().trim().max(32).optional() }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'GET', path: '/phieu/:id' }, mcp: true, ai: 'read' },
  handler: async (ctx, { id }) => ctx.data.module(async (tx) => {
    const r = await getPhieu(tx, id);
    const scope = ctx.branchScope;
    // Phạm vi chi nhánh: bên đề nghị hoặc bên nhận (branchOf của Core so một chi nhánh nên kiểm ở đây).
    if (scope && !scope.includes(r.branch_code) && !scope.includes(r.to_branch_code)) throw Errors.forbidden(`Đề nghị ${r.doc_no} không thuộc chi nhánh của bạn`);
    return toPhieu(r);
  }),
});
