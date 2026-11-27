/** GET /api/v1/m/de-nghi-dieu-chuyen/danh-muc?branchCode= — chi nhánh nhận được chọn (cùng cấp trên + cấp trên, theo MH15), kho xuất mặc định, quyền của người xem. */
// [2026-11-28 10:00 AM Võ Hoàng] NGHIEM-THU — NT-BH-056: danh mục form đề nghị điều chuyển (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { danhMuc } from '../service.js';

export default defineAction({
  id: 'de-nghi-dieu-chuyen.danh-muc.get', title: 'Danh mục cho form đề nghị điều chuyển', tags: ['Đề nghị điều chuyển'],
  permission: 'de-nghi-dieu-chuyen:xem', effect: 'read', idempotency: 'none', errors: ['VALIDATION_ERROR', 'FORBIDDEN'],
  input: z.object({ branchCode: z.string().trim().max(32).default('') }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'GET', path: '/danh-muc' }, mcp: false, ai: 'read' },
  branchOf: async (_ctx, i) => i.branchCode || null,
  handler: async (ctx, i) => danhMuc(ctx, i.branchCode),
});
