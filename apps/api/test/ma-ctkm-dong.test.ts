// [2026-11-26 12:20 AM Nguyễn Văn Thủy] MH-KM — mã CTKM của dòng khi nhiều chương trình chồng nhau, lưu vào dòng; ngưỡng SL theo tổng cả phiếu (đóng góp)
/**
 *   T-CTKM-1  chồng 4 chương trình (CK theo mã + quà mua 10 tặng 1 + CK trên đơn + CK thanh toán): mỗi dòng mua đủ 4 mã; dòng quà mã chương trình tặng
 *   T-CTKM-2  một mã giao 2 chi nhánh (2 dòng): cả hai dòng đều có mã quà (không chỉ dòng đầu)
 *   T-CTKM-3  bỏ tích một chương trình trên phiếu: mã đó biến khỏi mọi dòng, mã khác giữ
 *   T-CTKM-4  CK ghi tay trên dòng: chương trình CK dòng không còn mã ở dòng đó; CK trên đơn vẫn có
 *   T-CTKM-5  áp riêng: chỉ mã chương trình áp riêng, chương trình bị chặn không có mã
 *   T-CTKM-6  CK tính trên đơn giá TRƯỚC chiết khấu: đơn giá giữ nguyên, tiền trước CK = SL × đơn giá
 *   T-CTKM-7  bậc SL xét TỔNG các dòng cùng mã của phiếu: HDG 60 + AGG 40 → cả hai được bậc; HDG 30 + AGG 30 (đủ 50) → cả hai được
 *   T-CTKM-8  qua API: lưu đơn → dòng mang ctkm; sửa bỏ tích → ctkm đổi; duyệt → đọc lại vẫn đủ mã
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { computeDoc, ctkmCuaDong, promoBoard, syncGifts, type PDoc, type PLine, type Policy } from '@bizcity/mua-hang-domain';
import { call, setupTenant, type TestCtx } from './helpers.js';

const pol = (code: string, kind: Policy['kind'], rule: Record<string, unknown>, scope: Policy['scope'] = { partnerCode: 'N1' }): Policy => ({ id: code, code, kind, name: `CS ${code}`, scope, isActive: true, rule });
const line = (k: string, qty: number, price: number, o: Partial<PLine> = {}): PLine => ({ lineKey: k, sku: 'A', name: 'Sữa A', unit: 'Lon', qty, price, taxCode: 'V08', lineType: 'buy', brandCode: 'TH', ...o });
const doc = (lines: PLine[], o: Partial<PDoc> = {}): PDoc => ({ id: 'd', kind: 'order', status: 'draft', docNo: '', docDate: '2026-11-25', branchCode: 'CTY', partnerCode: 'N1', priceIncludesVat: false, lines, ...o });
const ma = (d: PDoc, ps: Policy[]) => { const g = { ...d, lines: syncGifts(d, ps).lines }; const rows = promoBoard(g, ps, computeDoc(g, ps)); return { g, of: (k: string) => ctkmCuaDong(rows, g.lines.find((l) => l.lineKey === k)!), qua: g.lines.filter((l) => l.autoGift).map((l) => ctkmCuaDong(rows, l)) }; };

const CHONG = [
  pol('CK2TR', 'trade_discount', { amount: 2_000_000 }),
  pol('CKMA', 'item_discount', { items: [{ sku: 'A', pct: 4 }, { sku: 'B', pct: 4 }] }),
  pol('CKTT', 'payment_discount', { pct: 2 }),
  pol('KM10T1', 'promo_gift', { buy: 10, get: 1, splitIntoCost: false }, { partnerCode: 'N1', brandCode: 'TH' }),
];

describe('Mã CTKM của dòng — nhiều chương trình chồng nhau', () => {
  it('T-CTKM-1 mỗi dòng mua đủ 4 mã; dòng quà có mã chương trình tặng', () => {
    const r = ma(doc([line('a', 60, 500_000), line('b', 20, 400_000, { sku: 'B' })]), CHONG);
    for (const k of ['a', 'b']) expect([...r.of(k)].sort()).toEqual(['CK2TR', 'CKMA', 'CKTT', 'KM10T1']);
    expect(r.qua).toEqual([['KM10T1'], ['KM10T1']]);
  });

  it('T-CTKM-2 một mã giao 2 chi nhánh: cả hai dòng có mã quà', () => {
    const r = ma(doc([line('h', 60, 500_000, { branchCode: 'HDG' }), line('g', 40, 500_000, { branchCode: 'AGG' })]), CHONG);
    expect(r.of('h')).toContain('KM10T1');
    expect(r.of('g')).toContain('KM10T1');
  });

  it('T-CTKM-3 bỏ tích CK trên đơn: mã CK2TR biến khỏi mọi dòng, mã khác giữ', () => {
    const r = ma(doc([line('a', 60, 500_000), line('b', 20, 400_000, { sku: 'B' })], { skipPolicies: ['CK2TR'] }), CHONG);
    for (const k of ['a', 'b']) { expect(r.of(k)).not.toContain('CK2TR'); expect(r.of(k)).toContain('CKMA'); }
  });

  it('T-CTKM-4 CK ghi tay trên dòng a: dòng a không còn CKMA, CK trên đơn vẫn có; dòng b giữ CKMA', () => {
    const r = ma(doc([line('a', 60, 500_000, { discountPct: 1 }), line('b', 20, 400_000, { sku: 'B' })]), CHONG);
    expect(r.of('a')).not.toContain('CKMA');
    expect(r.of('a')).toContain('CK2TR');
    expect(r.of('b')).toContain('CKMA');
  });

  it('T-CTKM-5 áp riêng: chỉ mã áp riêng, chương trình bị chặn không có mã', () => {
    const ps = [pol('RIENG', 'item_discount', { items: [{ sku: 'A', pct: 6, apply: 'exclusive' }] }), pol('KM10T1', 'promo_gift', { buy: 10, get: 1, splitIntoCost: false }, { partnerCode: 'N1', brandCode: 'TH' })];
    const r = ma(doc([line('a', 30, 500_000)]), ps);
    expect(r.of('a')).toContain('RIENG');
    expect(r.of('a')).not.toContain('KM10T1');
  });

  it('T-CTKM-6 CK tính trên đơn giá trước chiết khấu: đơn giá giữ nguyên', () => {
    const c = computeDoc(doc([line('a', 60, 500_000)]), [pol('CKMA', 'item_discount', { items: [{ sku: 'A', pct: 4 }] })]);
    const l = c.lines[0]!;
    expect(l.price).toBe(500_000);
    expect(l.gross).toBe(30_000_000);
    expect(l.lineDiscount).toBe(1_200_000);
    expect(l.after).toBe(28_800_000);
  });

  it('T-CTKM-7 bậc SL theo tổng cả phiếu (đơn giao nhiều chi nhánh)', () => {
    const ps = [pol('BAC', 'qty_tier', { tiers: [{ from: 0, pct: 0 }, { from: 50, pct: 3 }] }, { partnerCode: 'N1', sku: 'A' })];
    const c1 = computeDoc(doc([line('h', 60, 500_000, { branchCode: 'HDG' }), line('g', 40, 500_000, { branchCode: 'AGG' })]), ps);
    expect(c1.lines.map((l) => l.lineDiscount)).toEqual([900_000, 600_000]);
    const d2 = doc([line('h', 30, 500_000, { branchCode: 'HDG' }), line('g', 30, 500_000, { branchCode: 'AGG' })]);
    const c2 = computeDoc(d2, ps);
    expect(c2.lines.map((l) => l.lineDiscount)).toEqual([450_000, 450_000]);
    expect(promoBoard(d2, ps, c2).filter((r) => r.policy === 'BAC').map((r) => r.status)).toEqual(['applied', 'applied']);
  });
});

describe('T-CTKM-8 qua API: mã CTKM lưu vào dòng, đọc lại sau sửa / duyệt', () => {
  let t: TestCtx;
  beforeAll(async () => {
    t = await setupTenant();
    expect((await call(t, 'PUT', '/api/v1/partners/NCC-CT', { name: 'NCC chồng chương trình', kind: 'supplier' })).status).toBeLessThan(300);
    expect((await call(t, 'PUT', '/api/v1/catalog/products/C1?new=true', { name: 'Sữa C1', unit: 'Lon', taxInCode: 'V08', units: [{ unit: 'Lon', ratio: 1, isDefault: true }] })).status).toBeLessThan(300);
    for (const p of [
      { code: 'CT-CKDON', kind: 'trade_discount', name: 'CK 2 triệu trên đơn', scope: { partnerCode: 'NCC-CT' }, rule: { amount: 2_000_000 } },
      { code: 'CT-BAC', kind: 'qty_tier', name: 'Bậc SL', scope: { partnerCode: 'NCC-CT', sku: 'C1' }, rule: { tiers: [{ from: 0, pct: 0 }, { from: 50, pct: 3 }] } },
      { code: 'CT-CKTT', kind: 'payment_discount', name: 'CK thanh toán', scope: { partnerCode: 'NCC-CT' }, rule: { pct: 2 } },
    ]) expect((await call(t, 'POST', '/api/v1/purchase/policies', p)).status).toBe(201);
  }, 60_000);
  afterAll(async () => { await t.app.close(); });
  const body = (extra: Record<string, unknown> = {}) => ({ kind: 'order', docDate: '2026-11-25', branchCode: 'CN', partnerCode: 'NCC-CT', priceIncludesVat: false,
    lines: [{ lineKey: 'a', sku: 'C1', name: 'Sữa C1', unit: 'Lon', qty: 80, price: 500_000, taxCode: 'V08', lineType: 'buy' }], ...extra });
  const lineOf = async (id: string) => {
    const d = (await call(t, 'GET', `/api/v1/purchase/documents/${id}`)).body.data as { doc?: { lines: { ctkm?: string[] }[] }; lines?: { ctkm?: string[] }[] };
    return (d.doc?.lines ?? d.lines)![0]!;
  };

  it('lưu → đủ mã; bỏ tích CK trên đơn → mất mã đó; duyệt → đọc lại vẫn đúng', async () => {
    const res = await call(t, 'POST', '/api/v1/purchase/documents', body());
    expect(res.status, JSON.stringify(res.body)).toBeLessThan(300);
    const id = (res.body.data as { id: string }).id;
    expect([...((await lineOf(id)).ctkm ?? [])].sort()).toEqual(['CT-BAC', 'CT-CKDON', 'CT-CKTT']);
    expect((await call(t, 'PUT', `/api/v1/purchase/documents/${id}`, body({ skipPolicies: ['CT-CKDON'] }))).status).toBe(200);
    expect([...((await lineOf(id)).ctkm ?? [])].sort()).toEqual(['CT-BAC', 'CT-CKTT']);
    expect((await call(t, 'POST', `/api/v1/purchase/documents/${id}/approve`)).status).toBe(200);
    expect([...((await lineOf(id)).ctkm ?? [])].sort()).toEqual(['CT-BAC', 'CT-CKTT']);
  });
});
