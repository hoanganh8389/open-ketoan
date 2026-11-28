// [2026-11-29 02:30 AM Võ Hoàng] NGHIEM-THU — NT-BH-064: dòng giảm theo lô / hạn dùng → phiếu bán ghi lô từng phần, tiền khớp dòng gốc (đóng góp)
import { describe, expect, it } from 'vitest';
import { computeOrder, toSaleDocument, type CatalogItem } from '../api/domain/order.js';
import { splitLineByLots } from '../api/domain/lot-split.js';
import { orderDraftSchema, type OrderDraft } from '../api/domain/schema.js';

const catalog = new Map<string, CatalogItem>([
  ['SUA400', { sku: 'SUA400', name: 'Sữa bột 400g', unit: 'Lon', taxCode: 'R08', taxRate: 8, itemId: null, variant: 'normal', sendTax: true }],
]);
const methods = [{ code: 'TM', name: 'Tiền mặt' }];
const L1 = { lotNo: 'L1', expDate: '2026-12-05', qty: 1 };
const L2 = { lotNo: 'L2', expDate: '2027-06-01', qty: 2 };

/** Ví dụ phiếu: 3 lon × 100.000, lô L1 (còn 6 ngày) 1 lon được giảm 20 % = 20.000; 2 lon lô L2 giá thường. */
const draft = (line: Record<string, unknown> = {}): OrderDraft => orderDraftSchema.parse({
  id: '0193a1b2-0000-7000-8000-000000000064', branchCode: 'CN02', businessDate: '2026-11-29', shiftId: 'ngay', exportReasonCode: 'XBA',
  customer: { retail: true },
  lines: [{ lineId: 'l1', sku: 'SUA400', unitName: 'Lon', unitQty: 3, clientUnitPrice: 100_000, policyRef: { key: 'KM-CAN-DATE', version: 1, line: 'discount' }, promoDiscount: 20_000, ...line }],
  policyRefs: [{ key: 'KM-CAN-DATE', version: 1, hash: 'h' }],
  promotionSelections: [], payment: { mode: 'cash', cashGiven: 300_000 }, clientTotal: 280_000, coreVersion: '0.1.0', promotionsVersion: '',
});
const docOf = (d: OrderDraft) => {
  const o = computeOrder({ draft: d, catalog, paymentMethods: methods });
  if ('problem' in o) throw new Error(o.problem.message);
  return { o, doc: toSaleDocument(o, { draft: d, branchCode: 'CN02', code: 'CN02BT10099' }) };
};

describe('NT-BH-064 — phiếu bán ghi lô của dòng giảm theo lô', () => {
  it('3 lon: 1 lon lô L1 được giảm 20.000, 2 lon lô L2 giá thường → 2 dòng phiếu, mỗi dòng một lô; tiền cộng lại đúng dòng gốc', () => {
    const plain = docOf(draft()).doc.lines[0] as Record<string, number>;
    const { doc } = docOf(draft({ promoLots: [L1], lotPlan: [L1, L2] }));
    expect(doc.lines).toHaveLength(2);
    const [a, b] = doc.lines as Record<string, unknown>[];
    expect(a).toMatchObject({ lineKey: 'l1', qty: 1, lotNo: 'L1', expDate: '2026-12-05', policyRef: { key: 'KM-CAN-DATE' } });
    expect(b).toMatchObject({ lineKey: 'l1~2', qty: 2, lotNo: 'L2', expDate: '2027-06-01' });
    expect(b).not.toHaveProperty('policyRef');
    // Phần L1: 100.000 − 20.000 = 80.000 gồm thuế; phần L2: 200.000 gồm thuế, không giảm.
    expect((a!.amountBeforeTax as number) + (a!.taxAmount as number)).toBe(80_000);
    expect((b!.amountBeforeTax as number) + (b!.taxAmount as number)).toBe(200_000);
    expect(b!.discount).toBe(0);
    const sum = (k: string) => (doc.lines as Record<string, number>[]).reduce((s, l) => s + l[k]!, 0);
    expect(sum('amountBeforeTax')).toBe(plain.amountBeforeTax);
    expect(sum('taxAmount')).toBe(plain.taxAmount);
    expect(sum('discount')).toBe(plain.discount);
    expect(sum('qty')).toBe(3);
  });

  it('không có kế hoạch lô (chương trình thường) → một dòng như cũ, không ghi lô', () => {
    const { doc } = docOf(draft());
    expect(doc.lines).toHaveLength(1);
    expect(doc.lines[0]).not.toHaveProperty('lotNo');
  });

  it('kế hoạch lô không khớp số lượng dòng → không tách (Kernel tự phân lô)', () => {
    const { doc } = docOf(draft({ promoLots: [L1], lotPlan: [L1] }));
    expect(doc.lines).toHaveLength(1);
  });

  it('phần thiếu tồn lô (lô trống) không ghi lô', () => {
    const parts = splitLineByLots({ qty: 3, base: 300_000, promo: 20_000, money: { gross: 280_000, net: 259_259, tax: 20_741, discountNet: 18_519 },
      lotPlan: [L1, { lotNo: '', expDate: null, qty: 2 }], promoLots: [L1] })!;
    expect(parts.map((p) => [p.lotNo, p.qty, p.promo, p.promoted])).toEqual([['L1', 1, 20_000, true], ['', 2, 0, false]]);
    expect(parts.reduce((s, p) => s + p.money.gross, 0)).toBe(280_000);
  });
});
