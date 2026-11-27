// [2026-11-27 Võ Hoàng] NGHIEM-THU — NT-BH-051: lịch sử điểm của khách, cột Trước / Sau như plugin cũ (đóng góp)
/** GET /api/v1/m/loyalty/members/:id/history — mọi dòng sổ điểm của khách, mới nhất trước, mỗi dòng có điểm trước / sau. */
import { defineAction, z } from '@bizcity/module-sdk';
import { historyRows } from '../domain/members.js';
import { entriesOf } from '../store.js';

export default defineAction({
  id: 'loyalty.member.history', title: 'Lịch sử điểm của khách', tags: ['Điểm thành viên'],
  permission: 'loyalty:read', effect: 'read', idempotency: 'none',
  input: z.object({ id: z.string().trim().min(1).max(64) }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'GET', path: '/members/:id/history' }, mcp: false, ai: 'read' },
  handler: async (ctx, { id }) => ctx.data.module(async (tx) => ({ customerCode: id, items: historyRows(await entriesOf(tx, id)) })),
});
