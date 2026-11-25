// [2026-11-25 05:40 PM Võ Hoàng] NT-BH-034 — thẻ Lịch sử mua trong hồ sơ khách: tổng, kỳ mặc định, dòng phẳng, điểm cắm (đóng góp)
import { describe, expect, it } from 'vitest';
import web from '../web/index.js';
import { defaultTabRange, flatLines, purchaseTotals, type Purchase } from '../web/screens/lich-su-mua.js';

const sale = (refId: string, date: string, total: number, over: Partial<Purchase> = {}): Purchase => ({
  source: 'pos', kind: 'sale', refId, refCode: `HD${refId}`, date, branchCode: 'CN02', channel: 'POS', goods: total, discount: 0, total, returns: 0,
  vouchers: [], pointsEarned: 0, pointsRedeemed: 0,
  lines: [{ sku: 'A', name: 'Sữa A', unit: 'Lon', qty: 1, unitPrice: total, discount: 0, amount: total, isGift: false, promo: null }], ...over,
});

describe('thẻ Lịch sử mua', () => {
  it('module pos cắm thẻ vào hồ sơ khách, theo quyền pos:report', () => {
    expect(web.slots).toEqual([expect.objectContaining({ slot: 'partner.detail.tab', label: 'Lịch sử mua', permission: 'pos:report' })]);
  });

  it('kỳ mặc định: 12 tháng gần nhất', () => {
    expect(defaultTabRange(new Date('2026-11-25T10:00:00+07:00'))).toEqual({ from: '2025-11-26', to: '2026-11-25' });
  });

  it('tổng: số lần mua, tổng mua, trả hàng, điểm, lần gần nhất', () => {
    const list = [
      sale('1', '2026-10-01', 325000, { pointsEarned: 32 }),
      sale('2', '2026-11-20', 650000, { pointsEarned: 65, pointsRedeemed: 10 }),
      { ...sale('3', '2026-11-21', 0), kind: 'return' as const, returns: 325000, lines: [] },
    ];
    expect(purchaseTotals(list)).toEqual({ count: 2, total: 975000, returns: 325000, points: 87, last: '2026-11-20' });
    expect(purchaseTotals([])).toEqual({ count: 0, total: 0, returns: 0, points: 0, last: null });
  });

  it('dòng phẳng: mỗi dòng hàng một dòng, phiếu trả một dòng âm', () => {
    const rows = flatLines([sale('1', '2026-10-01', 325000), { ...sale('3', '2026-11-21', 0), kind: 'return', returns: 325000, originalCode: 'HD1', lines: [] }]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ refId: '1', refCode: 'HD1', source: 'Máy bán', amount: 325000 }); // refId: bấm dòng mở chi tiết đơn
    expect(rows[1]).toMatchObject({ name: 'Trả hàng', amount: -325000, source: 'Máy bán · trả hàng (HD1)' });
  });
});
