/**
 * GET /api/v1/m/xuat-dieu-chinh/danh-muc?branchCode= — dữ liệu mở form BH06: kho đang dùng của chi nhánh (mặc định kho bán, có kho quà KKM),
 * hôm nay, được chọn ngày lùi không, lý do mặc định, lý do bị loại (đã có màn riêng), bảng lý do → mục đích (lý do 0 đ dùng được).
 */
// [2026-11-26 03:10 PM Võ Hoàng] NGHIEM-THU — NT-BH-044: danh mục form BH06 (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { DEFAULT_REASON, PURPOSE_OF_REASON } from '../domain/phieu.js';
import { isAccountant, todayVN } from '../service.js';
import { warehousesOf } from '../store.js';

export default defineAction({
  id: 'xuat-dieu-chinh.danh-muc.get', title: 'Danh mục form phiếu xuất điều chỉnh', tags: ['Phiếu xuất điều chỉnh'],
  permission: 'xuat-dieu-chinh:phieu-xem', effect: 'read', idempotency: 'none',
  input: z.object({ branchCode: z.string().trim().max(32).optional() }),
  output: z.object({
    today: z.string(), canBackdate: z.boolean(), canEditOthers: z.boolean(), defaultReason: z.string(), excludedReasons: z.array(z.string()),
    purposeOfReason: z.record(z.string()), warehouses: z.array(z.object({ code: z.string(), name: z.string(), isDefault: z.boolean(), isPromo: z.boolean() })),
    defaultWarehouse: z.string().nullable(),
  }),
  expose: { http: { method: 'GET', path: '/danh-muc' }, mcp: false, ai: 'read' },
  branchOf: async (_ctx, i) => i.branchCode || null,
  handler: async (ctx, i) => {
    const warehouses = i.branchCode ? await ctx.data.module((tx) => warehousesOf(tx, i.branchCode!)) : [];
    return {
      today: todayVN(), canBackdate: isAccountant(ctx), canEditOthers: isAccountant(ctx), defaultReason: DEFAULT_REASON,
      excludedReasons: ['XBA', 'XBB', 'XCKho', 'XKK', 'XCN', 'XCN3', 'XNB*'], purposeOfReason: { ...PURPOSE_OF_REASON },
      warehouses, defaultWarehouse: warehouses.find((w) => w.isDefault)?.code ?? warehouses[0]?.code ?? null,
    };
  },
});
