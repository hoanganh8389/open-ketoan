/** GET /api/v1/m/de-nghi-dieu-chuyen/hang?branchCode=&skus= — tên, ĐVT nhỏ nhất, tồn ở kho xuất mặc định của chi nhánh. Không có giá vốn. */
// [2026-11-28 10:00 AM Võ Hoàng] NGHIEM-THU — NT-BH-056: tồn mặt hàng cho form đề nghị (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { hang } from '../service.js';

export default defineAction({
  id: 'de-nghi-dieu-chuyen.hang.get', title: 'Tồn mặt hàng cho đề nghị điều chuyển', tags: ['Đề nghị điều chuyển'],
  permission: 'de-nghi-dieu-chuyen:xem', effect: 'read', idempotency: 'none',
  input: z.object({ branchCode: z.string().trim().max(32).default(''), skus: z.string().trim().max(5000).default('') }),
  output: z.object({ warehouseCode: z.string(), items: z.array(z.object({ sku: z.string(), name: z.string(), unit: z.string(), active: z.boolean(), stock: z.number() })) }),
  expose: { http: { method: 'GET', path: '/hang' }, mcp: false, ai: 'read' },
  branchOf: async (_ctx, i) => i.branchCode || null,
  handler: async (ctx, i) => hang(ctx, i.branchCode, i.skus.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 200)),
});
