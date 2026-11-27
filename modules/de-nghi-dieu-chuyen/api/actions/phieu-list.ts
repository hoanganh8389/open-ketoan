/**
 * GET /api/v1/m/de-nghi-dieu-chuyen/phieu — danh sách đề nghị điều chuyển, lọc ngày / trạng thái / chi nhánh / số.
 * Phạm vi chi nhánh (vai trò gán theo chi nhánh / máy bán): thấy đề nghị mà chi nhánh mình là bên đề nghị HOẶC bên nhận (như máy bán cũ).
 */
// [2026-11-28 10:00 AM Võ Hoàng] NGHIEM-THU — NT-BH-056: danh sách đề nghị điều chuyển (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { listPhieu, toPhieu } from '../store.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export default defineAction({
  id: 'de-nghi-dieu-chuyen.phieu.list', title: 'Danh sách đề nghị điều chuyển', tags: ['Đề nghị điều chuyển'],
  permission: 'de-nghi-dieu-chuyen:xem', effect: 'read', idempotency: 'none',
  input: z.object({
    from: day.optional(), to: day.optional(), branchCodes: z.string().max(2000).optional().describe('Mã chi nhánh cách dấu phẩy'),
    side: z.enum(['from', 'to', 'both']).default('both').describe('from = bên đề nghị · to = bên nhận · both = cả hai'),
    status: z.enum(['pending', 'approved', 'converted', 'rejected', 'cancelled']).optional(), search: z.string().max(100).optional(),
  }),
  output: z.object({ items: z.array(z.record(z.unknown())), count: z.number() }),
  expose: { http: { method: 'GET', path: '/phieu' }, mcp: true, ai: 'read' },
  handler: async (ctx, i) => ctx.data.module(async (tx) => {
    const asked = i.branchCodes ? i.branchCodes.split(',').map((s) => s.trim()).filter(Boolean) : null;
    const scope = ctx.branchScope;
    const branches = scope ? (asked ? asked.filter((b) => scope.includes(b)) : [...scope]) : asked;
    const items = (await listPhieu(tx, { from: i.from, to: i.to, branches, status: i.status, search: i.search, side: i.side })).map(toPhieu);
    return { items, count: items.length };
  }),
});
