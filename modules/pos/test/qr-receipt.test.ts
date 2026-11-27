// [2026-11-28 03:00 PM Võ Hoàng] NGHIEM-THU — NT-BH-057: phiếu thu tiền khách của phần QR (đóng góp)
import { describe, expect, it } from 'vitest';
import { qrReceiptDocKey, qrReceiptDocs } from '../api/domain/qr-receipt.js';

describe('NT-BH-057 — phiếu thu tiền QR khi xác nhận', () => {
  const base = { orderId: 'o-1', code: 'CN01BT10001', branchCode: 'CN01', saleDocKey: 'pos:CN01:sale:o-1', paidDate: '2026-11-28' };

  it('mỗi phần QR một phiếu thu khách, đối trừ đúng phiếu bán, mã chứng từ cố định', () => {
    const docs = qrReceiptDocs({ ...base, customer: { id: 'KH01', name: 'An', phone: '0901' }, parts: [{ methodCode: 'QR', amount: 330_000 }], paymentRef: 'TTCK-9' });
    expect(docs).toEqual([expect.objectContaining({
      docType: 'customer_payment', docKey: qrReceiptDocKey('CN01', 'o-1', 'QR'), branchCode: 'CN01', docNo: 'TTCK-9', docDate: '2026-11-28',
      methodCode: 'QR', direction: 'in', partner: { code: 'KH01', name: 'An', phone: '0901' },
      lines: [{ lineKey: '1', amount: 330_000, invoiceDocKey: 'pos:CN01:sale:o-1' }], totals: { total: 330_000 },
    })]);
  });

  it('khách lẻ: không gắn đối tượng; không mã giao dịch thì số chứng từ = mã đơn', () => {
    const [d] = qrReceiptDocs({ ...base, customer: { id: '', name: 'Khách lẻ' }, parts: [{ methodCode: 'QR', amount: 1 }] });
    expect(d).not.toHaveProperty('partner');
    expect(d!.docNo).toBe('CN01BT10001');
  });

  it('đơn cũ (không có parts) hoặc phần 0 đ → không sinh phiếu', () => {
    expect(qrReceiptDocs({ ...base })).toEqual([]);
    expect(qrReceiptDocs({ ...base, parts: [{ methodCode: 'QR', amount: 0 }] })).toEqual([]);
  });
});
