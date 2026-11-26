// [2026-11-25 11:55 PM Võ Hoàng] NGHIEM-THU — NT-BH-043: hàm thuần báo cáo bán hàng máy POS gom ở máy chủ (đóng góp)
import { describe, expect, it } from 'vitest';
import {
  assignLots, collectedParts, dailyRows, expandGroups, groupPath, isManualGift, lineCost, monthRange, monthsIn, paidOf, paymentText, rangeProblem,
  type GroupRow, type PayMethod,
} from '../api/domain/sales-report.js';

const methods: PayMethod[] = [
  { code: 'TM', name: 'Tiền mặt', isReceivable: false, bankAccountCode: null },
  { code: 'CK', name: 'Chuyển khoản', isReceivable: false, bankAccountCode: 'VCB-01' },
  { code: 'QR', name: 'Quét mã QR', isReceivable: false, bankAccountCode: 'VCB-01' },
  { code: 'VOUCHER', name: 'Voucher', isReceivable: false, bankAccountCode: null },
  { code: 'CONGNO', name: 'Ghi công nợ', isReceivable: true, bankAccountCode: null },
  { code: 'DOI_TRU', name: 'Đối trừ công nợ', isReceivable: true, bankAccountCode: null },
];
const groups: GroupRow[] = [
  { code: 'SUA', name: 'Sữa', fullName: 'Sữa', parentCode: null, isActive: true },
  { code: 'SUA-BOT', name: 'Sữa bột', fullName: 'Sữa Sữa bột', parentCode: 'SUA', isActive: true },
  { code: 'SUA-NUOC', name: 'Sữa nước', fullName: 'Sữa Sữa nước', parentCode: 'SUA', isActive: true },
  { code: 'TA', name: 'Tã', fullName: 'Tã', parentCode: null, isActive: true },
];

describe('khoảng ngày (ca 12, Q6)', () => {
  it('92 ngày đạt, 93 ngày báo ở ô Đến ngày; đến < từ báo', () => {
    expect(rangeProblem('2026-09-01', '2026-12-01')).toBeNull();
    expect(rangeProblem('2026-09-01', '2026-12-02')).toEqual({ field: 'to', message: 'Khoảng ngày tối đa 92 ngày' });
    expect(rangeProblem('2026-11-02', '2026-11-01')?.field).toBe('to');
    expect(rangeProblem('2026-1-1', '2026-11-01')?.field).toBe('from');
  });
  it('tháng của khoảng; tháng đang chạy tới hôm nay, tháng chưa tới rỗng', () => {
    expect(monthsIn('2026-10-20', '2027-01-05')).toEqual([{ year: 2026, month: 10 }, { year: 2026, month: 11 }, { year: 2026, month: 12 }, { year: 2027, month: 1 }]);
    expect(monthRange(2026, 11, '2026-11-25')).toEqual({ from: '2026-11-01', to: '2026-11-25' });
    expect(monthRange(2026, 2, '2026-11-25')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthRange(2026, 12, '2026-11-25')).toBeNull();
  });
});

describe('cây nhóm hàng (ca 5)', () => {
  const map = new Map(groups.map((g) => [g.code, g]));
  it('đường nhóm "Sữa / Sữa bột"; mã lạ giữ mã; trống = Chưa phân nhóm', () => {
    expect(groupPath('SUA-BOT', map)).toBe('Sữa / Sữa bột');
    expect(groupPath('XYZ', map)).toBe('XYZ');
    expect(groupPath('', map)).toBe('Chưa phân nhóm');
  });
  it('chọn cha lấy cả con; vòng lặp không treo', () => {
    expect(expandGroups(['SUA'], groups).sort()).toEqual(['SUA', 'SUA-BOT', 'SUA-NUOC']);
    expect(expandGroups(['SUA-NUOC'], groups)).toEqual(['SUA-NUOC']);
    const loop: GroupRow[] = [{ ...groups[0]!, parentCode: 'SUA-BOT' }, groups[1]!];
    expect(groupPath('SUA-BOT', new Map(loop.map((g) => [g.code, g])))).toBe('Sữa / Sữa bột');
    expect(expandGroups(['SUA'], loop).sort()).toEqual(['SUA', 'SUA-BOT']);
  });
});

describe('lô theo dòng chứng từ (ca 1)', () => {
  it('dòng thứ n cùng mặt hàng lấy lô của dòng chứng từ thứ n cùng mặt hàng', () => {
    const lots = [
      { docKey: 'd1', lineNo: 1, sku: 'SB01', itemId: 'I1', lotNo: 'L2511', expDate: '2027-06-30', qty: -2 },
      { docKey: 'd1', lineNo: 3, sku: 'SB01', itemId: 'I1', lotNo: 'L2512', expDate: '2027-07-31', qty: -1 },
      { docKey: 'd1', lineNo: 2, sku: 'SN01', itemId: null, lotNo: '', expDate: null, qty: -5 },
    ];
    const got = assignLots([
      { key: 'a', docKey: 'd1', sku: 'SB01', itemId: 'I1', nth: 2 },
      { key: 'b', docKey: 'd1', sku: 'SB01', itemId: 'I1', nth: 1 },
      { key: 'c', docKey: 'd1', sku: 'SN01', itemId: null, nth: 1 },
      { key: 'd', docKey: 'd2', sku: 'SB01', itemId: 'I1', nth: 1 },
    ], lots);
    expect(got.get('b')).toEqual([{ lotNo: 'L2511', expDate: '2027-06-30', qty: 2 }]);
    expect(got.get('a')).toEqual([{ lotNo: 'L2512', expDate: '2027-07-31', qty: 1 }]);
    expect(got.get('c')).toEqual([{ lotNo: '', expDate: null, qty: 5 }]);
    expect(got.get('d')).toEqual([]);
  });
});

describe('giá vốn (ca 1, 2, 3 — Q1)', () => {
  it('tháng đã tính: SL × đơn giá; dòng trả âm', () => {
    expect(lineCost({ baseQty: 2, isReturn: false, businessDate: '2026-10-20', monthRun: true, unitCost: 250_000 })).toMatchObject({ unitCost: 250_000, costAmount: 500_000, costStatus: 'ok' });
    expect(lineCost({ baseQty: 1, isReturn: true, businessDate: '2026-10-21', monthRun: true, unitCost: 250_000 }).costAmount).toBe(-250_000);
  });
  it('tháng chưa tính: trống + ghi chú; tháng đã tính mà mã thiếu đơn giá: trống', () => {
    expect(lineCost({ baseQty: 1, isReturn: false, businessDate: '2026-11-25', monthRun: false, unitCost: null }))
      .toEqual({ unitCost: null, costAmount: null, costStatus: 'not_run', costNote: 'Chưa tính giá vốn tháng 11/2026' });
    expect(lineCost({ baseQty: 1, isReturn: false, businessDate: '2026-10-25', monthRun: true, unitCost: null }).costStatus).toBe('no_cost');
  });
});

describe('thu tiền như sổ (ca 7, 13)', () => {
  it('ca 13: đổi hàng khách trả 0 (toàn đối trừ) → không có khoản thu', () => {
    expect(collectedParts({ code: 'CN02BT10040', total: 325_000, payment: { mode: 'split', parts: [{ method: 'doi_tru', amount: 325_000 }] } }, methods)).toEqual([]);
    expect(collectedParts({ code: 'X', total: 430_000, payment: { mode: 'split', parts: [{ method: 'doi_tru', amount: 324_000 }, { method: 'TM', amount: 106_000 }] } }, methods))
      .toEqual([{ method: 'TM', amount: 106_000, receiptNo: 'X', kind: 'cash' }]);
  });
  it('ca 7: TM + CK; số phiếu thu = mã tham chiếu, không có thì số đơn', () => {
    const parts = collectedParts({ code: 'B03', total: 500_000, payment: { mode: 'split', parts: [{ method: 'TM', amount: 200_000 }, { method: 'CK', amount: 300_000, reference: 'FT2511ABC' }] } }, methods);
    expect(parts).toEqual([
      { method: 'TM', amount: 200_000, receiptNo: 'B03', kind: 'cash' },
      { method: 'CK', amount: 300_000, receiptNo: 'FT2511ABC', kind: 'transfer' },
    ]);
  });
  it('tiền mặt trả hết = tổng − voucher hãng; voucher hãng là một khoản thu theo hình thức khai; ghi nợ không thu', () => {
    expect(collectedParts({ code: 'B', total: 330_000, payment: { mode: 'cash' }, voucherUses: [{ kind: 'payment', amount: 30_000, methodCode: 'VOUCHER' }, { kind: 'discount', amount: 10_000 }] }, methods))
      .toEqual([{ method: 'VOUCHER', amount: 30_000, receiptNo: 'B', kind: 'voucher' }, { method: 'TM', amount: 300_000, receiptNo: 'B', kind: 'cash' }]);
    expect(collectedParts({ code: 'C', total: 100, payment: { mode: 'credit' } }, methods)).toEqual([]);
    expect(collectedParts({ code: 'D', total: 300, payment: { mode: 'split', parts: [{ method: 'CONGNO', amount: 100 }, { method: 'QR', amount: 200 }] } }, methods))
      .toEqual([{ method: 'QR', amount: 200, receiptNo: 'D', kind: 'qr' }]);
  });
  it('đã trả: đối trừ coi như đã trả, ghi nợ là còn nợ; chữ hình thức', () => {
    expect(paidOf({ total: 325_000, payment: { mode: 'split', parts: [{ method: 'doi_tru', amount: 325_000 }] } }, methods)).toBe(325_000);
    expect(paidOf({ total: 300, payment: { mode: 'split', parts: [{ method: 'CONGNO', amount: 100 }, { method: 'TM', amount: 200 }] } }, methods)).toBe(200);
    expect(paidOf({ total: 300, payment: { mode: 'credit' } }, methods)).toBe(0);
    expect(paymentText({ mode: 'split', parts: [{ method: 'TM', amount: 1 }, { method: 'doi_tru', amount: 1 }] }, methods)).toBe('Tiền mặt + Đối trừ');
    expect(paymentText({ mode: 'cash' }, methods)).toBe('Tiền mặt');
  });
});

describe('quà thêm tay, theo ngày (ca 6, 8)', () => {
  it('quà không theo chương trình = thêm tay', () => {
    expect(isManualGift({ isGift: true })).toBe(true);
    expect(isManualGift({ isGift: true, policyRef: { key: 'K' } })).toBe(false);
    expect(isManualGift({})).toBe(false);
  });
  it('mỗi ngày một dòng, tỉ trọng cộng 100 %', () => {
    const rows = dailyRows(new Map([['2026-11-02', { qty: 3, revenue: 90_000 }], ['2026-11-05', { qty: 1, revenue: 30_000 }]]), '2026-11-01', '2026-11-25');
    expect(rows).toHaveLength(25);
    expect(rows[1]).toEqual({ date: '2026-11-02', qty: 3, revenue: 90_000, ratio: 75 });
    expect(rows.reduce((s, r) => s + r.ratio, 0)).toBeCloseTo(100);
    expect(dailyRows(new Map(), '2026-11-01', '2026-11-03').every((r) => r.ratio === 0)).toBe(true);
  });
});
