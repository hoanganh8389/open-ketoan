// [2026-11-27 Võ Hoàng] NGHIEM-THU — NT-BH-049: khuyến mại đủ như plugin cũ — khuôn @2 lưu nháp được, ĐVT quy đổi, dán từ Excel,
// sinh nhật ngày / tuần, loại đơn, khung qua đêm, hàng chính của chương trình @2 khi trả (đóng góp)
import { describe, expect, it } from 'vitest';
import { draftContentSchema, skusOf } from '../api/domain/promo.js';
import { policyMainSkus } from '../api/domain/returns.js';
import { emptyForm, emptyPriceLine, fromParams, parsePriceLines, toParams } from '../web/screens/khuyen-mai/model.js';

const D = '2026-11-27';

describe('NT-BH-049 — khuôn @2 lưu nháp được (trước đây bị từ chối)', () => {
  it('ba khuôn @2 qua khuôn nháp của module', () => {
    for (const c of ['sale.promo.price_lines@2', 'sale.promo.buy_x_get_y@2', 'sale.promo.order_gift@2']) {
      expect(draftContentSchema.safeParse({ key: 'KM-V2', ruleContract: c, params: {}, effectiveFrom: D }).success, c).toBe(true);
    }
  });
  it('mã hàng của chương trình @2 (cảnh báo trùng)', () => {
    expect(skusOf('sale.promo.price_lines@2', { lines: [{ sku: 'A', pct: 10 }, { sku: 'B', unitPrice: 1 }] })).toEqual(['A', 'B']);
    expect(skusOf('sale.promo.buy_x_get_y@2', { buy: { items: [{ sku: 'A' }, { sku: 'B' }], mode: 'any', qty: 3 }, get: { options: [{ sku: 'Q1', qty: 1 }], choose: 1 } })).toEqual(['A', 'B', 'Q1']);
    expect(skusOf('sale.promo.buy_x_get_y@2', { buy: { items: [], mode: 'any', qty: 3 }, scope: { groupCodes: ['SUA'] }, get: { options: [], choose: 1 } })).toBeNull();
    expect(skusOf('sale.promo.order_gift@2', { tiers: [], scope: { skus: ['A'] } })).toEqual(['A']);
    expect(skusOf('sale.promo.order_gift@2', { tiers: [] })).toBeNull();
  });
  it('hàng chính khi trả: mã mua của @2, chỉ nhóm / nhãn → null', () => {
    expect(policyMainSkus({ ruleContract: 'sale.promo.buy_x_get_y@2', params: { buy: { items: [{ sku: 'A' }, { sku: 'B' }] } } })).toEqual(['A', 'B']);
    expect(policyMainSkus({ ruleContract: 'sale.promo.buy_x_get_y@2', params: { buy: { items: [] }, scope: { groupCodes: ['G'] } } })).toBeNull();
    expect(policyMainSkus({ ruleContract: 'sale.promo.order_gift@2', params: { scope: { skus: ['A'] } } })).toEqual(['A']);
  });
});

describe('NT-BH-049 — form: ĐVT quy đổi (K7), dán từ Excel (K11)', () => {
  it('dòng có ĐVT Thùng = 24 → params.unit; đọc lại ra đúng ô', () => {
    const f = { ...emptyForm('price_lines', D), key: 'KM-THUNG', priceLines: [{ ...emptyPriceLine(), sku: 'A', mode: 'unitPrice' as const, value: '360.000', unitName: 'Thùng', unitRatio: '24' }] };
    const { params, problems } = toParams(f);
    expect(problems).toEqual([]);
    expect((params.lines as unknown[])[0]).toEqual({ sku: 'A', unitPrice: 360_000, unit: { name: 'Thùng', ratio: 24 } });
    const back = fromParams('sale.promo.price_lines@2', params, { key: 'KM-THUNG', today: D })!;
    expect(back.priceLines[0]).toMatchObject({ sku: 'A', unitName: 'Thùng', unitRatio: '24', mode: 'unitPrice', value: '360000' });
  });
  it('tỉ lệ mà không có tên ĐVT → báo', () => {
    const f = { ...emptyForm('price_lines', D), key: 'KM-X', priceLines: [{ ...emptyPriceLine(), sku: 'A', value: '10', unitRatio: '24' }] };
    expect(toParams(f).problems.join(' ')).toContain('tên ĐVT');
  });
  it('dán bảng: bỏ dòng tiêu đề; cách %, giá, tiền; cột ĐVT / tỉ lệ', () => {
    const r = parsePriceLines('Mã\tCách\tMức\nSP1\t%\t10\nSP2\tgiá\t95000\t5\nSP3;tiền;20000;;Thùng;24');
    expect(r.problems).toEqual([]);
    expect(r.lines.map((x) => [x.sku, x.mode, x.value, x.maxQty, x.unitName, x.unitRatio])).toEqual([
      ['SP1', 'pct', '10', '', '', ''], ['SP2', 'unitPrice', '95000', '5', '', ''], ['SP3', 'amountPerUnit', '20000', '', 'Thùng', '24'],
    ]);
  });
  it('dán bảng: cách lạ / thiếu mức → báo theo dòng', () => {
    const r = parsePriceLines('SP1\tabc\t10\nSP2\t%');
    expect(r.lines).toEqual([]);
    expect(r.problems).toHaveLength(2);
  });
});

describe('NT-BH-049 — điều kiện (K9)', () => {
  it('khung qua đêm 22:00–02:00 hợp lệ; trùng giờ thì báo', () => {
    const f = { ...emptyForm('order_discount', D), key: 'KM-DEM', timeFrom: '22:00', timeTo: '02:00', orderTiers: [{ minOrder: '0', mode: 'pct' as const, value: '5', maxDiscount: '' }] };
    expect(toParams(f).problems).toEqual([]);
    expect((toParams(f).params.conditions as Record<string, unknown>).timeFrom).toBe('22:00');
    expect(toParams({ ...f, timeTo: '22:00' }).problems).toContain('Giờ kết thúc trùng giờ bắt đầu');
  });
  it('sinh nhật tháng → birthdayMonth (khuôn @1 hiểu); tuần / ngày → birthdayScope; đọc lại đúng', () => {
    const base = { ...emptyForm('order_discount', D), key: 'KM-SN', orderTiers: [{ minOrder: '0', mode: 'pct' as const, value: '10', maxDiscount: '' }] };
    expect(toParams({ ...base, birthdayScope: 'month' }).params.conditions).toEqual({ birthdayMonth: true });
    const wk = toParams({ ...base, birthdayScope: 'week' }).params;
    expect(wk.conditions).toEqual({ birthdayScope: 'week' });
    expect(fromParams('sale.promo.order_discount@1', wk, { key: 'KM-SN', today: D })!.birthdayScope).toBe('week');
    expect(fromParams('sale.promo.order_discount@1', { tiers: [], conditions: { birthdayMonth: true } }, { key: 'KM-SN', today: D })!.birthdayScope).toBe('month');
  });
  it('loại đơn: chọn một phần → orderTypes; chọn cả ba = không điều kiện', () => {
    const base = { ...emptyForm('order_discount', D), key: 'KM-SI', orderTiers: [{ minOrder: '0', mode: 'pct' as const, value: '3', maxDiscount: '' }] };
    expect(toParams({ ...base, orderTypes: ['wholesale'] }).params.conditions).toEqual({ orderTypes: ['wholesale'] });
    expect(toParams({ ...base, orderTypes: ['retail', 'wholesale', 'so'] }).params.conditions).toBeUndefined();
  });
});

describe('NT-BH-049 — lượt theo khách (K6)', () => {
  it('quota.perCustomer → dòng @khach; không lẫn vào hạn mức cửa hàng', async () => {
    const { quotaRows, quotaFor, quotaSchema, CUSTOMER_QUOTA } = await import('../api/domain/promo.js');
    expect(quotaSchema.parse({ perCustomer: 2 })).toEqual({ perCustomer: 2 });
    const rows = quotaRows({ perBranch: 10, perCustomer: 2 });
    expect(rows).toEqual([{ branch: '*', quota: 10 }, { branch: CUSTOMER_QUOTA, quota: 2 }]);
    const db = rows.map((r) => ({ branch_code: r.branch, quota: r.quota }));
    expect(quotaFor(db, 'CN01')).toBe(10);
    expect(quotaFor([{ branch_code: CUSTOMER_QUOTA, quota: 2 }], 'CN01')).toBeUndefined();
  });
  it('form: Lượt mỗi khách ↔ quota', async () => {
    const { toQuota, fromQuota } = await import('../web/screens/khuyen-mai/model.js');
    expect(toQuota({ quotaPerBranch: '', quotaBranches: '', quotaPerCustomer: '1' })).toEqual({ quota: { perCustomer: 1 }, problems: [] });
    expect(toQuota({ quotaPerBranch: '', quotaBranches: '', quotaPerCustomer: '0' }).problems).toHaveLength(1);
    expect(fromQuota({ perCustomer: 3 }).quotaPerCustomer).toBe('3');
  });
});
