// [2026-11-25 09:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-039: khai chính sách tích điểm ở kế toán (đóng góp)
/** GET /api/v1/m/loyalty/program-drafts/:id — một nháp kèm nhật ký (lập / sửa / gửi duyệt / duyệt / từ chối). */
import { defineAction, z } from '@bizcity/module-sdk';
import { getDraft } from '../drafts.js';

export default defineAction({
  id: 'loyalty.draft.get', title: 'Xem nháp chính sách tích điểm', tags: ['Điểm thành viên'],
  permission: 'loyalty:read', effect: 'read', idempotency: 'none', errors: ['NOT_FOUND'],
  input: z.object({ id: z.string().trim().min(1).max(64) }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'GET', path: '/program-drafts/:id' }, mcp: false, ai: 'read' },
  handler: async (ctx, { id }) => ctx.data.module((tx) => getDraft(tx, id)),
});
