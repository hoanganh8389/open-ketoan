// [2026-11-28 05:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-060: hàm thuần phiếu kế toán voucher đổi điểm (đóng góp)
import { describe, expect, it } from 'vitest';
import { pointVoucherJournal, pointVoucherReturnJournal, returnedPointVoucherNet } from '../api/domain/point-voucher.js';

describe('phiếu kế toán voucher đổi điểm', () => {
  it('đơn: một dòng lý do POS-VOUCHER-DIEM, số = phần chưa thuế, khoá theo đơn', () => {
    const d = pointVoucherJournal({ branchCode: 'CN01', orderId: 'o1', orderCode: 'CN01BT1', businessDate: '2026-11-28', voucherCode: 'TGS50-AB', amountNet: 46_296 });
    expect(d).toMatchObject({ docType: 'manual_journal', docKey: 'pos:CN01:voucher-diem:o1', docNo: 'CN01BT1-VD', docDate: '2026-11-28', totals: { total: 46_296 } });
    expect(d!.lines).toEqual([expect.objectContaining({ lineKey: '1', reasonCode: 'POS-VOUCHER-DIEM', amount: 46_296 })]);
  });

  it('số 0 → không lập', () => {
    expect(pointVoucherJournal({ branchCode: 'CN01', orderId: 'o1', orderCode: 'X', businessDate: '2026-11-28', voucherCode: 'V', amountNet: 0 })).toBeNull();
    expect(pointVoucherReturnJournal({ branchCode: 'CN01', returnId: 'r1', returnCode: 'R', orderCode: 'X', businessDate: '2026-11-28', amountNet: 0 })).toBeNull();
  });

  it('phiếu trả: lý do POS-VOUCHER-DIEM-TRA, khoá theo phiếu trả', () => {
    const d = pointVoucherReturnJournal({ branchCode: 'CN01', returnId: 'r1', returnCode: 'CN01TH1', orderCode: 'CN01BT1', businessDate: '2026-11-29', amountNet: 23_148 });
    expect(d).toMatchObject({ docKey: 'pos:CN01:voucher-diem-tra:r1', docNo: 'CN01TH1-VD', lines: [expect.objectContaining({ reasonCode: 'POS-VOUCHER-DIEM-TRA', amount: 23_148 })] });
  });

  it('phần voucher theo dòng trả: tỉ lệ SL trả / SL bán, trả quá SL bán tính bằng SL bán, đơn cũ không có trường → 0', () => {
    const lines = [{ lineId: 'l1', unitQty: 2, pointVoucherNet: 46_297 }, { lineId: 'l2', unitQty: 1 }];
    expect(returnedPointVoucherNet(lines, [{ lineId: 'l1', qty: 1 }])).toBe(23_149);
    expect(returnedPointVoucherNet(lines, [{ lineId: 'l1', qty: 5 }])).toBe(46_297);
    expect(returnedPointVoucherNet(lines, [{ lineId: 'l2', qty: 1 }, { lineId: 'zz', qty: 1 }])).toBe(0);
  });
});
