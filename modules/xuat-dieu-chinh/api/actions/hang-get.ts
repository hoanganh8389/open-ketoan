/**
 * GET /api/v1/m/xuat-dieu-chinh/hang?branchCode=&warehouseCode=&skus= — thông tin dòng hàng cho form: tên, ĐVT gốc, ĐVT quy đổi + giá
 * niêm yết (bảng giá của chi nhánh — giá gợi ý phiếu có giá, sửa được), thuế suất bán ra theo danh mục, tồn ở kho (ĐVT nhỏ nhất),
 * giá vốn bình quân gần nhất (cảnh báo dưới giá vốn). Mặt hàng ngừng dùng trả active = false (màn không cho chọn).
 */
// [2026-11-26 03:10 PM Võ Hoàng] NGHIEM-THU — NT-BH-044: dòng hàng form BH06 (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { isAccountant, todayVN } from '../service.js';
import { catalogFor, stockOf, taxRates, unitCosts } from '../store.js';

export default defineAction({
  id: 'xuat-dieu-chinh.hang.get', title: 'Dòng hàng cho phiếu xuất điều chỉnh', tags: ['Phiếu xuất điều chỉnh'],
  permission: 'xuat-dieu-chinh:phieu-xem', effect: 'read', idempotency: 'none',
  input: z.object({ branchCode: z.string().trim().max(32).default(''), warehouseCode: z.string().trim().max(64).default(''), skus: z.string().trim().max(5000).default('') }),
  output: z.object({ items: z.array(z.object({
    sku: z.string(), name: z.string(), active: z.boolean(), baseUnit: z.string(), taxCode: z.string().nullable(), taxRate: z.number().nullable(),
    units: z.array(z.object({ unit: z.string(), ratio: z.number(), price: z.number().nullable() })), stock: z.number(), unitCost: z.number().nullable(),
  })) }),
  expose: { http: { method: 'GET', path: '/hang' }, mcp: false, ai: 'read' },
  branchOf: async (_ctx, i) => i.branchCode || null,
  handler: async (ctx, i) => ctx.data.module(async (tx) => {
    const skus = i.skus.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 200);
    if (!i.branchCode || !skus.length) return { items: [] };
    const cat = await catalogFor(tx, i.branchCode, skus);
    const rates = await taxRates(tx);
    const stock = i.warehouseCode ? await stockOf(tx, i.branchCode, i.warehouseCode, skus) : new Map<string, number>();
    // [2026-11-28 Võ Hoàng] NGHIEM-THU — NT-BH-054: người không có documents:write (thu ngân máy bán) không nhận giá vốn (đóng góp)
    const costs = isAccountant(ctx) ? await unitCosts(tx, i.branchCode, todayVN(), skus) : new Map<string, number>();
    return { items: [...cat.values()].map((c) => ({
      sku: c.sku, name: c.name, active: c.active, baseUnit: c.baseUnit, taxCode: c.taxCode, taxRate: c.taxCode ? rates.get(c.taxCode) ?? null : null,
      units: [{ unit: c.baseUnit, ratio: 1, price: c.units.get(c.baseUnit)?.price ?? null },
        ...[...c.units].filter(([u]) => u !== c.baseUnit).map(([unit, v]) => ({ unit, ratio: v.ratio, price: v.price }))],
      stock: stock.get(c.sku) ?? 0, unitCost: costs.get(c.sku) ?? null,
    })) };
  }),
});
