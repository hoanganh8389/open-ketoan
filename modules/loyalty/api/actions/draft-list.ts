// [2026-11-25 09:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-039: khai chính sách tích điểm ở kế toán (đóng góp)
/** GET /api/v1/m/loyalty/program-drafts?status=&branch= — nháp chính sách tích điểm (mặc định: chưa phát hành). */
import { defineAction, z } from '@bizcity/module-sdk';
import { listDrafts } from '../drafts.js';

export default defineAction({
  id: 'loyalty.draft.list', title: 'Danh sách nháp chính sách tích điểm', tags: ['Điểm thành viên'],
  permission: 'loyalty:read', effect: 'read', idempotency: 'none',
  input: z.object({ status: z.enum(['draft', 'pending', 'published', 'rejected']).optional(), branch: z.string().trim().max(32).optional() }),
  output: z.object({ items: z.array(z.record(z.unknown())) }),
  expose: { http: { method: 'GET', path: '/program-drafts' }, mcp: false, ai: 'read' },
  handler: async (ctx, i) => ({ items: await ctx.data.module((tx) => listDrafts(tx, i)) }),
});
