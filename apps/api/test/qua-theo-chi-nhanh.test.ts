// [2026-11-25 10:45 PM Nguyễn Văn Thủy] MH-KM — đơn đặt giao nhiều chi nhánh nhận: quà tính trên tổng đơn, chia về đúng chi nhánh + kho của hàng mua (đóng góp)
/**
 *   T-QCN-1  một chi nhánh: như cũ — một dòng quà, không gắn chi nhánh
 *   T-QCN-2  HDG 12 + AGG 8 (mua 10 tặng 1, tổng 20 → 2): mỗi chi nhánh 1 quà, dòng quà mang chi nhánh + kho của hàng mua
 *   T-QCN-3  HDG 9 + AGG 6 (tổng 15 → 1 quà): cả đơn được trọn 1 quà (gộp mới đủ), quà về chi nhánh mua nhiều hơn (HDG)
 *   T-QCN-4  chạy lại lần hai không đổi (ổn định), đổi SL thì quà chia lại đúng
 *   T-QCN-5  phiếu nhập (một chi nhánh): không gắn chi nhánh vào dòng quà
 */
import { describe, expect, it } from 'vitest';
import { syncGifts, type PDoc, type PLine, type Policy } from '@bizcity/mua-hang-domain';

const ps: Policy[] = [{ id: 'KM10T1', code: 'KM10T1', kind: 'promo_gift', name: 'Mua 10 tặng 1', scope: { partnerCode: 'N1' }, isActive: true, rule: { buy: 10, get: 1, splitIntoCost: false } }];
const line = (k: string, qty: number, o: Partial<PLine> = {}): PLine => ({ lineKey: k, sku: 'A', name: 'Sữa A', unit: 'Lon', qty, price: 500_000, taxCode: 'V08', lineType: 'buy', brandCode: 'TH', ...o });
const doc = (lines: PLine[], o: Partial<PDoc> = {}): PDoc => ({ id: 'd', kind: 'order', status: 'draft', docNo: '', docDate: '2026-11-25', branchCode: 'CTY', partnerCode: 'N1', priceIncludesVat: false, lines, ...o });
const qua = (ls: PLine[]) => ls.filter((l) => l.autoGift).map((l) => ({ cn: l.branchCode ?? '', kho: l.warehouseCode ?? '', qty: l.qty })).sort((a, b) => a.cn.localeCompare(b.cn));

describe('Quà của đơn giao nhiều chi nhánh nhận', () => {
  it('T-QCN-1 một chi nhánh: một dòng quà, không gắn chi nhánh', () => {
    expect(qua(syncGifts(doc([line('a', 20)]), ps).lines)).toEqual([{ cn: '', kho: '', qty: 2 }]);
  });

  it('T-QCN-2 HDG 12 + AGG 8 → mỗi chi nhánh 1 quà, đúng chi nhánh + kho của hàng mua', () => {
    const d = doc([line('h', 12, { branchCode: 'HDG', warehouseCode: '15-HH' }), line('g', 8, { branchCode: 'AGG', warehouseCode: 'AG-01' })]);
    expect(qua(syncGifts(d, ps).lines)).toEqual([{ cn: 'AGG', kho: 'AG-01', qty: 1 }, { cn: 'HDG', kho: '15-HH', qty: 1 }]);
  });

  it('T-QCN-3 HDG 9 + AGG 6: gộp cả đơn mới đủ 1 quà → quà về chi nhánh mua nhiều hơn', () => {
    const d = doc([line('h', 9, { branchCode: 'HDG' }), line('g', 6, { branchCode: 'AGG' })]);
    expect(qua(syncGifts(d, ps).lines)).toEqual([{ cn: 'HDG', kho: '', qty: 1 }]);
  });

  it('T-QCN-4 chạy lại không đổi; đổi SL thì chia lại', () => {
    const d = doc([line('h', 12, { branchCode: 'HDG' }), line('g', 8, { branchCode: 'AGG' })]);
    const lan1 = syncGifts(d, ps).lines;
    const lan2 = syncGifts(doc(lan1), ps);
    expect(lan2.changes).toEqual([]);
    expect(qua(lan2.lines)).toEqual(qua(lan1));
    const doiSl = syncGifts(doc(lan1.map((l) => (l.lineKey === 'h' ? { ...l, qty: 32 } : l))), ps).lines; // tổng 40 → 4 quà: HDG 32/40 → 3,2 → 3; AGG 0,8 → 1
    expect(qua(doiSl)).toEqual([{ cn: 'AGG', kho: '', qty: 1 }, { cn: 'HDG', kho: '', qty: 3 }]);
  });

  it('T-QCN-5 phiếu nhập: quà không gắn chi nhánh', () => {
    expect(qua(syncGifts(doc([line('a', 20, { branchCode: 'HDG' })], { kind: 'receipt' }), ps).lines)).toEqual([{ cn: '', kho: '', qty: 2 }]);
  });
});
