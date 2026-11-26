/**
 * GET /api/v1/m/phieu-ban/return-sources?branch&partnerCode&search&from&to&open — phiếu bán ĐÃ DUYỆT của cửa hàng để chọn làm phiếu gốc
 * ở BH11 (phiếu NT-BH-046): theo khách, hoặc tìm theo số phiếu (khách lẻ); mỗi phiếu kèm còn trả từng dòng (đã trừ phiếu trả đã duyệt).
 */
// [2026-11-26 07:45 PM Võ Hoàng] NGHIEM-THU — NT-BH-046: action đọc phiếu gốc cho BH11 (đóng góp)
import { Errors, defineAction, z } from '@bizcity/module-sdk';
import { returnSources } from '../service.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export default defineAction({
  id: 'phieu-ban.doc.return-sources', title: 'Phiếu bán đã duyệt để chọn làm phiếu gốc (trả hàng)', tags: ['Phiếu bán nhập tay'],
  permission: 'phieu-ban:read', effect: 'read', idempotency: 'none', errors: ['VALIDATION_ERROR'],
  input: z.object({
    branch: z.string().trim().max(32).optional(),
    partnerCode: z.string().trim().max(64).optional(),
    search: z.string().trim().max(32).optional(),
    from: day.optional(), to: day.optional(),
    open: z.union([z.boolean(), z.enum(['1', '0', 'true', 'false'])]).optional(),
  }),
  output: z.object({ items: z.array(z.record(z.unknown())) }),
  expose: { http: { method: 'GET', path: '/return-sources' }, mcp: false, ai: 'read' },
  handler: async (ctx, i) => {
    // Phạm vi chi nhánh của người xem (như danh sách phiếu).
    // Chưa chọn cửa hàng / chưa có khách hay số phiếu → rỗng (màn chưa đủ điều kiện tìm).
    if (!i.branch || (!i.partnerCode && !i.search)) return { items: [] };
    if (ctx.branchScope && !ctx.branchScope.includes(i.branch)) throw Errors.validation(`Không có quyền xem phiếu của cửa hàng ${i.branch}`, { field: 'branch' });
    return returnSources(ctx, {
      branch: i.branch, ...(i.partnerCode ? { partnerCode: i.partnerCode } : {}), ...(i.search ? { search: i.search } : {}),
      ...(i.from ? { from: i.from } : {}), ...(i.to ? { to: i.to } : {}), open: i.open === true || i.open === '1' || i.open === 'true',
    });
  },
});
