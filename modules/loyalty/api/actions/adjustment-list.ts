// [2026-11-25 09:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-039: điều chỉnh điểm tay có duyệt (đóng góp)
/** GET /api/v1/m/loyalty/adjustments?status=&customer= — yêu cầu điều chỉnh điểm tay (500 gần nhất). */
import { defineAction, z } from '@bizcity/module-sdk';
import { listAdjustments } from '../adjust.js';

export default defineAction({
  id: 'loyalty.adjustment.list', title: 'Danh sách điều chỉnh điểm tay', tags: ['Điểm thành viên'],
  permission: 'loyalty:read', effect: 'read', idempotency: 'none',
  input: z.object({ status: z.enum(['pending', 'approved', 'rejected']).optional(), customer: z.string().trim().max(64).optional() }),
  output: z.object({ items: z.array(z.record(z.unknown())) }),
  expose: { http: { method: 'GET', path: '/adjustments' }, mcp: false, ai: 'read' },
  handler: async (ctx, i) => ({ items: await ctx.data.module((tx) => listAdjustments(tx, i)) }),
});
