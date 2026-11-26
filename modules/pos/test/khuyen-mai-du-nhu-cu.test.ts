// [2026-11-27 Võ Hoàng] NGHIEM-THU — NT-BH-049: khuyến mại đủ như plugin cũ — khuôn @2 lưu nháp được, ĐVT quy đổi, dán từ Excel,
// sinh nhật ngày / tuần, loại đơn, khung qua đêm, hàng chính của chương trình @2 khi trả (đóng góp)
import { describe, expect, it } from 'vitest';
import { draftContentSchema, skusOf } from '../api/domain/promo.js';
import { policyMainSkus } from '../api/domain/returns.js';
import { emptyForm, emptyPriceLine, fromParams, parsePriceLines, toParams } from '../web/screens/khuyen-mai/model.js';
import { OLD_TYPES, emptyOld, oldFromParams, oldToParams, parsePaste, reasonOf, splitReason, type OldForm } from '../web/screens/khuyen-mai/old-types.js';

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

// [2026-11-27 Võ Hoàng] NGHIEM-THU — NT-BH-049 (S-CD-14…17): form chính sách theo mẫu plugin cũ ↔ params (đóng góp)

describe('NT-BH-049 — form kiểu plugin cũ', () => {
  const D0 = '2026-11-27';
  const base = (t: OldForm['type'], p: Partial<OldForm> = {}): OldForm => ({ ...emptyOld(t, D0), key: 'TGS_1127_01', name: 'Thử', ...p });
  const U = { unitName: '', unitRatio: '' };
  it('chỉ 7 loại plugin cũ cho tạo (5, 2, 1, 10, 13, 14, 15) theo thứ tự ô chọn cũ', () => {
    expect(OLD_TYPES.map((t) => t.oldId)).toEqual([5, 2, 1, 10, 13, 14, 15]);
  });
  it('Chiết khấu: nhiều dòng, từ SL → bậc theo mã, % / tiền, Tối đa (đ), ĐVT', () => {
    const f = base('ck', { ckRows: [
      { sku: 'A', ...U, fromQty: '1', pct: '10', amount: '', maxDiscount: '50000' },
      { sku: 'B', unitName: 'Thùng', unitRatio: '24', fromQty: '1', pct: '5', amount: '', maxDiscount: '' },
      { sku: 'B', unitName: 'Thùng', unitRatio: '24', fromQty: '2', pct: '8', amount: '', maxDiscount: '' },
      { sku: 'C', ...U, fromQty: '1', pct: '', amount: '3000', maxDiscount: '' },
      { sku: '', ...U, fromQty: '1', pct: '', amount: '', maxDiscount: '' },
    ] });
    const r = oldToParams(f);
    expect(r.problems).toEqual([]);
    expect(r.contract).toBe('sale.promo.price_lines@2');
    expect(r.params.lines).toEqual([
      { sku: 'A', pct: 10, maxDiscount: 50000 },
      { sku: 'B', tiers: [{ min: 1, pct: 5 }, { min: 2, pct: 8 }], unit: { name: 'Thùng', ratio: 24 } },
      { sku: 'C', amountPerUnit: 3000 },
    ]);
    expect(r.params.exclusive).toBe(true);
    expect((r.params.conditions as { orderTypes: string[] }).orderTypes).toEqual(['retail']);
    const back = oldFromParams(r.contract, r.params, { key: 'TGS_1127_01', reason: 'Thử', today: D0 })!;
    expect(back.type).toBe('ck');
    expect(back.ckRows.map((x) => [x.sku, x.fromQty, x.pct, x.amount, x.maxDiscount, x.unitName])).toEqual([
      ['A', '1', '10', '', '50000', ''], ['B', '1', '5', '', '', 'Thùng'], ['B', '2', '8', '', '', 'Thùng'], ['C', '1', '', '3000', '', ''],
    ]);
  });
  it('Chiết khấu: dòng nhập cả % và đ → báo lỗi', () => {
    const r = oldToParams(base('ck', { ckRows: [{ sku: 'A', ...U, fromQty: '1', pct: '10', amount: '5000', maxDiscount: '' }] }));
    expect(r.problems.join(' ')).toContain('HOẶC');
  });
  it('Giảm giá cố định: giá mới theo từ SL', () => {
    const r = oldToParams(base('fixed', { fixedRows: [{ sku: 'A', ...U, fromQty: '1', price: '90000' }, { sku: 'A', ...U, fromQty: '3', price: '85000' }] }));
    expect(r.problems).toEqual([]);
    expect(r.params.lines).toEqual([{ sku: 'A', tiers: [{ min: 1, unitPrice: 90000 }, { min: 3, unitPrice: 85000 }] }]);
    expect(oldFromParams(r.contract, r.params, { key: 'K', today: D0 })!.type).toBe('fixed');
  });
  it('Mua X tặng Y: nhiều dòng mua (mỗi mã tính riêng), nhiều quà (khách chọn 1), ĐVT quy về đơn vị nhỏ nhất', () => {
    const r = oldToParams(base('bxgy', {
      buyRows: [{ sku: 'A', ...U, qty: '2' }, { sku: 'B', unitName: 'Lốc', unitRatio: '4', qty: '1' }],
      giftRows: [{ sku: 'Q1', ...U, qty: '1' }, { sku: 'Q2', ...U, qty: '1' }],
    }));
    expect(r.problems).toEqual([]);
    expect(r.contract).toBe('sale.promo.buy_x_get_y@2');
    expect(r.params.buy).toEqual({ items: [{ sku: 'A', qty: 2 }, { sku: 'B', qty: 4 }], mode: 'each' });
    expect(r.params.get).toEqual({ options: [{ sku: 'Q1', qty: 1 }, { sku: 'Q2', qty: 1 }], choose: 1 });
    const back = oldFromParams(r.contract, r.params, { key: 'K', today: D0 })!;
    expect(back.buyRows.map((x) => [x.sku, x.qty])).toEqual([['A', '2'], ['B', '4']]);
    expect(back.giftRows).toHaveLength(2);
    expect(oldFromParams('sale.promo.buy_x_get_y@2', { buy: { items: [{ sku: 'A' }], mode: 'any', qty: 2 }, get: { options: [{ sku: 'Q', qty: 1 }] } }, { key: 'K', today: D0 })).toBeNull();
  });
  it('Voucher / mã giảm giá: mã khách đọc, % có trần, đơn tối thiểu, tối đa mỗi khách', () => {
    const r = oldToParams(base('voucher', { vcCodes: 'KM10, TET26', vcType: 'percent', vcValue: '10', vcMax: '50000', vcMinOrder: '200000', vcPerCustomer: '2' }));
    expect(r.problems).toEqual([]);
    expect(r.params.tiers).toEqual([{ minOrder: 200000, pct: 10, maxDiscount: 50000 }]);
    expect((r.params.conditions as { couponCodes: string[] }).couponCodes).toEqual(['KM10', 'TET26']);
    expect(r.quota).toEqual({ perCustomer: 2 });
    expect(oldFromParams(r.contract, r.params, { key: 'K', today: D0, quota: r.quota })!.vcPerCustomer).toBe('2');
  });
  it('Combo bộ sản phẩm (pool): pool, mức theo SL, combo N mã khác nhau', () => {
    const r = oldToParams(base('pool', { poolRows: [{ sku: 'A', ...U }, { sku: 'B', ...U }], poolTiers: [{ minQty: '2', pct: '10' }], poolMinDistinct: '2', poolPct: '20' }));
    expect(r.problems).toEqual([]);
    expect(r.params).toMatchObject({ skus: ['A', 'B'], qtyTiers: [{ min: 2, pct: 10 }], combo: { minDistinct: 2, pct: 20 } });
    expect(oldFromParams(r.contract, r.params, { key: 'K', today: D0 })!.poolPct).toBe('20');
  });
  it('Quà theo giá trị đơn: ngưỡng = Tổng giá trị đơn hàng ≥, nhân bội số, nhiều quà khách chọn 1', () => {
    const r = oldToParams(base('order_gift', { minOrderTotal: '500000', giftRows: [{ sku: 'Q1', ...U, qty: '1' }, { sku: 'Q2', ...U, qty: '2' }] }));
    expect(r.problems).toEqual([]);
    expect(r.params).toMatchObject({ tiers: [{ minOrder: 500000, gifts: [{ sku: 'Q1', qty: 1 }, { sku: 'Q2', qty: 2 }] }], multiply: true, choose: 1 });
    expect((r.params.conditions as Record<string, unknown> | undefined)?.minOrderAmount).toBeUndefined();
    expect(oldFromParams(r.contract, r.params, { key: 'K', today: D0 })!.minOrderTotal).toBe('500000');
  });
  it('Mua đủ tặng giá thấp nhất: số lượng cần mua, quà mỗi lượt, danh sách SKU', () => {
    const r = oldToParams(base('lowest', { lowRequired: '4', lowGift: '1', lowRows: [{ sku: 'A', ...U }, { sku: 'B', ...U }] }));
    expect(r.problems).toEqual([]);
    expect(r.params).toMatchObject({ skus: ['A', 'B'], buyQty: 4, freeQty: 1, repeat: true });
    expect(oldToParams(base('lowest', { lowRequired: '1', lowRows: [{ sku: 'A', ...U }] })).problems.join(' ')).toContain('Số lượng cần mua');
  });
  it('Thông tin chương trình: khoảng ngày / khung giờ / thứ / loại đơn / tổng đơn / số đơn / sinh nhật / áp đồng thời', () => {
    const r = oldToParams(base('ck', {
      ckRows: [{ sku: 'A', ...U, fromQty: '1', pct: '10', amount: '', maxDiscount: '' }],
      allowStack: true, dateOn: true, validFrom: '2026-12-01', validTo: '2026-12-31', timeOn: true, timeFrom: '22:00', timeTo: '02:00',
      weekdaysOn: true, weekdays: [6, 7], retail: true, wholesale: true, so: true, minOrderTotal: '300000', maxUsage: '20', birthday: 'week',
    }));
    expect(r.problems).toEqual([]);
    expect(r.params).toMatchObject({ exclusive: false, validFrom: '2026-12-01', validTo: '2026-12-31',
      conditions: { weekdays: [6, 7], timeFrom: '22:00', timeTo: '02:00', minOrderAmount: 300000, birthdayScope: 'week' } });
    expect((r.params.conditions as Record<string, unknown>).orderTypes).toBeUndefined();
    expect(r.quota).toEqual({ perBranch: 20 });
    expect(oldToParams(base('ck', { retail: false })).problems.join(' ')).toContain('loại đơn');
  });
  it('Tên — mô tả ↔ lý do; dán Excel bỏ dòng tiêu đề', () => {
    expect(reasonOf({ name: 'Mua 2 tặng 1', description: 'Dielac' })).toBe('Mua 2 tặng 1 — Dielac');
    expect(splitReason('Mua 2 tặng 1 — Dielac')).toEqual({ name: 'Mua 2 tặng 1', description: 'Dielac' });
    expect(parsePaste('Mã SKU\tTừ SL\tCK %\nA\t1\t10\nB\t2\t5')).toEqual([['A', '1', '10'], ['B', '2', '5']]);
  });
});
