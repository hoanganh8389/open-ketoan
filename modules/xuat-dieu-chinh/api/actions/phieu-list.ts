/** GET /api/v1/m/xuat-dieu-chinh/phieu — danh sách phiếu xuất điều chỉnh của module (nháp, đã ghi sổ, đã huỷ; 0 đ và có giá), lọc theo phạm vi chi nhánh. */
// [2026-11-26 03:10 PM Võ Hoàng] NGHIEM-THU — NT-BH-044: danh sách BH06 (đóng góp)
import { defineAction, sumMoney, z } from '@bizcity/module-sdk';
import { listPhieu, toPhieu } from '../store.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export default defineAction({
  id: 'xuat-dieu-chinh.phieu.list', title: 'Danh sách phiếu xuất điều chỉnh', tags: ['Phiếu xuất điều chỉnh'],
  description: 'Phiếu xuất điều chỉnh lập ở module (BH06): cột Loại 0 đ / Có giá, tổng tiền. Phiếu cũ do cầu nối gửi (sourceSystem btsoft) đọc ở danh sách chứng từ của Core (sourceType export_adjust).',
  permission: 'xuat-dieu-chinh:phieu-xem', effect: 'read', idempotency: 'none',
  input: z.object({
    from: day.optional(), to: day.optional(), branchCodes: z.string().max(2000).optional().describe('Mã chi nhánh cách dấu phẩy'),
    status: z.enum(['draft', 'posted', 'cancelled']).optional(), kind: z.enum(['zero', 'priced']).optional(), search: z.string().max(100).optional(),
  }),
  output: z.object({ items: z.array(z.record(z.unknown())), total: z.number(), count: z.number() }),
  expose: { http: { method: 'GET', path: '/phieu' }, mcp: true, ai: 'read' },
  handler: async (ctx, i) => ctx.data.module(async (tx) => {
    const asked = i.branchCodes ? i.branchCodes.split(',').map((s) => s.trim()).filter(Boolean) : null;
    const scope = ctx.branchScope;
    const branches = scope ? (asked ? asked.filter((b) => scope.includes(b)) : [...scope]) : asked;
    const items = (await listPhieu(tx, { from: i.from, to: i.to, branches, status: i.status, kind: i.kind, search: i.search })).map(toPhieu);
    return { items, total: sumMoney(items.filter((x) => x.status !== 'cancelled').map((x) => x.total)), count: items.length };
  }),
});
