/** GET /api/v1/m/xuat-dieu-chinh/phieu/:id — một phiếu đầy đủ. */
// [2026-11-26 03:10 PM Võ Hoàng] NGHIEM-THU — NT-BH-044: xem phiếu BH06 (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { branchOfPhieu, getPhieu, toPhieu } from '../store.js';

export default defineAction({
  id: 'xuat-dieu-chinh.phieu.get', title: 'Xem phiếu xuất điều chỉnh', tags: ['Phiếu xuất điều chỉnh'],
  permission: 'xuat-dieu-chinh:phieu-xem', effect: 'read', idempotency: 'none', errors: ['NOT_FOUND', 'FORBIDDEN'],
  input: z.object({ id: z.string().trim().min(1).max(64) }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'GET', path: '/phieu/:id' }, mcp: true, ai: 'read' },
  branchOf: async (ctx, i) => ctx.data.module((tx) => branchOfPhieu(tx, i.id)),
  handler: async (ctx, { id }) => ctx.data.module(async (tx) => toPhieu(await getPhieu(tx, id))),
});
