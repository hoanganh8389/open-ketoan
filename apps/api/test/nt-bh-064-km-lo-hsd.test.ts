// [2026-11-29 02:30 AM Võ Hoàng] NGHIEM-THU — NT-BH-064: khuyến mại theo lô / hạn dùng — bộ tính dự phân lô hạn gần trước, chỉ giảm phần lô khớp;
// phiếu bán ghi lô → kho xuất đúng lô đã giảm (đóng góp)
/**
 * Phiếu docs/nghiem-thu/ban-hang/NT-BH-064-khuyen-mai-theo-lo-han-dung.md.
 *   1. Nhập 2 lô LO64: CAN (HSD 05/12/2026) 1 lon, XA (HSD 01/06/2027) 5 lon ở CN01.
 *   2. Chương trình price_lines@2: LO64 giảm 20 % khi HSD còn ≤ 30 ngày.
 *   3. Evaluate ngày 29/11/2026, CN01, 3 lon × 100.000 → giảm 1 lon (20.000), lots = [CAN], plan = [CAN 1, XA 2].
 *   4. Không gửi chi nhánh → không dự phân lô được → bỏ qua, nói rõ "chưa biết lô".
 *   5. Phiếu bán ghi lô từng phần (lotNo) → kho xuất đúng: CAN còn 0, XA còn 3.
 *   6. Chương trình lô cụ thể (loại "Theo lô hàng" cũ): lô XA giá 80.000.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const ok = (r: { status: number; body: unknown }) => expect([200, 201], JSON.stringify(r.body)).toContain(r.status);
type Lot = { lotNo: string; expDate: string | null; stock: number };
const lots = async () => (await call<{ data: Lot[] }>(ctx, 'GET', '/api/v1/lots?search=LO64')).body.data;
const stockOf = (ls: Lot[], no: string) => ls.find((l) => l.lotNo === no)?.stock;

beforeAll(async () => {
  ctx = await setupTenant();
  ok(await call(ctx, 'POST', '/api/v1/documents', {
    docType: 'purchase', docKey: 'NM-LO64', branchCode: 'CN01', docNo: 'NM-LO64', docDate: '2026-11-01', partner: { code: 'NCC-64', name: 'NCC lô 64' },
    lines: [
      { lineKey: 'l1', sku: 'LO64', name: 'Sữa lô 64', unit: 'Lon', qty: 1, lotNo: 'CAN', expDate: '2026-12-05', taxCode: 'V08', taxAmount: 0, amountBeforeTax: 60_000 },
      { lineKey: 'l2', sku: 'LO64', name: 'Sữa lô 64', unit: 'Lon', qty: 5, lotNo: 'XA', expDate: '2027-06-01', taxCode: 'V08', taxAmount: 0, amountBeforeTax: 300_000 },
    ],
    totals: { beforeTax: 360_000, tax: 0, total: 360_000 },
  }));
  ok(await call(ctx, 'POST', '/api/v1/policies', {
    key: 'KM-CAN-DATE', ruleContract: 'sale.promo.price_lines@2', effectiveFrom: '2026-11-01', reason: 'NT-BH-064 thử cận date',
    params: { basis: 'qty', lines: [{ sku: 'LO64', pct: 20, lotFilter: { expWithinDays: 30 } }] },
  }));
});
afterAll(async () => { await ctx.app.close(); });

const lines = [{ lineKey: 'a', sku: 'LO64', qty: 3, price: 100_000 }];

describe('NT-BH-064 — khuyến mại theo lô / hạn dùng', () => {
  it('dự phân lô hạn gần trước: 3 lon → giảm đúng 1 lon lô CAN; trả kế hoạch lô cả dòng', async () => {
    const r = await call<{ data: { discounts: { lineKey: string; qty: number; amount: number; lots?: unknown; plan?: unknown }[] } }>(ctx, 'POST', '/api/v1/policies/evaluate',
      { docDate: '2026-11-29', branchCode: 'CN01', lines, policies: [{ key: 'KM-CAN-DATE' }] });
    ok(r);
    expect(r.body.data.discounts).toEqual([expect.objectContaining({
      lineKey: 'a', qty: 1, amount: 20_000,
      lots: [{ lotNo: 'CAN', expDate: '2026-12-05', qty: 1 }],
      plan: [{ lotNo: 'CAN', expDate: '2026-12-05', qty: 1 }, { lotNo: 'XA', expDate: '2027-06-01', qty: 2 }],
    })]);
  });

  it('nguồn bán tự gửi lô → bị bỏ, bộ tính tự dự phân lô (không tin lô do máy bán gửi)', async () => {
    const r = await call<{ data: { discounts: { amount: number }[] } }>(ctx, 'POST', '/api/v1/policies/evaluate',
      { docDate: '2026-11-29', branchCode: 'CN01', lines: [{ ...lines[0], lots: [{ lotNo: 'CAN', expDate: '2026-12-05', qty: 3 }] }], policies: [{ key: 'KM-CAN-DATE' }] });
    ok(r);
    expect(r.body.data.discounts.map((d) => d.amount)).toEqual([20_000]);
  });

  it('không có chi nhánh → không biết lô → bỏ qua, nói rõ', async () => {
    const r = await call<{ data: { discounts: unknown[]; skipped: { key: string; reason: string }[] } }>(ctx, 'POST', '/api/v1/policies/evaluate',
      { docDate: '2026-11-29', lines, policies: [{ key: 'KM-CAN-DATE' }] });
    ok(r);
    expect(r.body.data.discounts).toEqual([]);
    expect(r.body.data.skipped[0]!.reason).toContain('chưa biết lô');
  });

  it('HSD còn hơn 30 ngày (ngày bán 01/11) → lô CAN chưa vào khoảng → không giảm', async () => {
    const r = await call<{ data: { discounts: unknown[] } }>(ctx, 'POST', '/api/v1/policies/evaluate',
      { docDate: '2026-11-01', branchCode: 'CN01', lines, policies: [{ key: 'KM-CAN-DATE' }] });
    ok(r);
    expect(r.body.data.discounts).toEqual([]);
  });

  it('phiếu bán ghi lô từng phần → kho xuất đúng lô đã giảm (CAN về 0, XA còn 3)', async () => {
    ok(await call(ctx, 'POST', '/api/v1/documents', {
      docType: 'sale', docKey: 'BL-LO64', branchCode: 'CN01', docNo: 'BL-LO64', docDate: '2026-11-29',
      lines: [
        { lineKey: 'a', sku: 'LO64', name: 'Sữa lô 64', unit: 'Lon', qty: 1, lotNo: 'CAN', expDate: '2026-12-05', taxCode: 'R08', amountBeforeTax: 74_074, taxAmount: 5_926, discount: 18_519 },
        { lineKey: 'a~2', sku: 'LO64', name: 'Sữa lô 64', unit: 'Lon', qty: 2, lotNo: 'XA', expDate: '2027-06-01', taxCode: 'R08', amountBeforeTax: 185_185, taxAmount: 14_815 },
      ],
      payments: [], totals: { beforeTax: 259_259, tax: 20_741, total: 280_000 },
    }));
    const ls = await lots();
    expect(stockOf(ls, 'CAN')).toBe(0);
    expect(stockOf(ls, 'XA')).toBe(3);
  });

  it('lô cụ thể (loại "Theo lô hàng" cũ): lô XA giá 80.000 — chỉ phần lô XA được giảm', async () => {
    ok(await call(ctx, 'POST', '/api/v1/policies', {
      key: 'KM-LO-XA', ruleContract: 'sale.promo.price_lines@2', effectiveFrom: '2026-11-01', reason: 'NT-BH-064 thử lô cụ thể',
      params: { basis: 'qty', lines: [{ sku: 'LO64', unitPrice: 80_000, lotFilter: { lotNos: ['XA'] } }] },
    }));
    const r = await call<{ data: { discounts: { qty: number; amount: number; lots?: unknown }[] } }>(ctx, 'POST', '/api/v1/policies/evaluate',
      { docDate: '2026-11-30', branchCode: 'CN01', lines: [{ lineKey: 'b', sku: 'LO64', qty: 2, price: 100_000 }], policies: [{ key: 'KM-LO-XA' }] });
    ok(r);
    // CAN đã bán hết ở ca trước → 2 lon đều lô XA → giảm 2 × 20.000.
    expect(r.body.data.discounts).toEqual([expect.objectContaining({ qty: 2, amount: 40_000, lots: [{ lotNo: 'XA', expDate: '2027-06-01', qty: 2 }] })]);
  });
});
