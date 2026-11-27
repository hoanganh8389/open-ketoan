// [2026-11-28 03:00 PM Võ Hoàng] NGHIEM-THU — NT-BH-057: phiếu thu tiền khách của phần QR khi tiền về / thu ngân xác nhận (đóng góp)
/**
 * Đơn POS trả bằng QR: lúc bán chỉ ghi doanh thu + công nợ (phiếu bán không có dòng thu tiền QR). Khi ngân hàng báo có hoặc thu ngân
 * bấm "Xác nhận đã nhận tiền", mỗi phần QR thành MỘT phiếu thu tiền khách (customer_payment, chiều in): Nợ TK của hình thức QR (theo
 * danh mục DM05, có đối tượng nhận hộ thì 13681…) / Có 131, đối trừ đúng phiếu bán (`lines[].invoiceDocKey`).
 *   - docKey cố định `pos:<chi nhánh>:qr-receipt:<mã đơn>:<hình thức>` → gửi lại cùng nội dung không ghi hai lần.
 *   - Ngày chứng từ = ngày tiền về (giờ VN); số chứng từ = mã giao dịch ngân hàng nếu có, không thì mã đơn.
 *   - `parts` trống / không có (đơn tạo trước NT-BH-057 đã ghi thu tiền lúc bán) → không sinh phiếu nào.
 */
export type QrReceiptInput = {
  orderId: string;
  code: string;
  branchCode: string;
  saleDocKey: string;
  customer?: { id?: string; name?: string; phone?: string };
  parts?: readonly { methodCode: string; amount: number }[];
  paidDate: string;
  paymentRef?: string;
};

export function qrReceiptDocKey(branchCode: string, orderId: string, methodCode: string): string {
  return `pos:${branchCode}:qr-receipt:${orderId}:${methodCode}`;
}

export function qrReceiptDocs(i: QrReceiptInput) {
  const partner = i.customer?.id ? { partner: { code: i.customer.id, name: i.customer.name ?? '', ...(i.customer.phone ? { phone: i.customer.phone } : {}) } } : {};
  return (i.parts ?? []).filter((p) => p.amount > 0).map((p) => ({
    docType: 'customer_payment' as const,
    docKey: qrReceiptDocKey(i.branchCode, i.orderId, p.methodCode),
    version: 1,
    branchCode: i.branchCode,
    docNo: (i.paymentRef?.trim() || i.code).slice(0, 64),
    docDate: i.paidDate,
    description: `Thu tiền QR đơn máy POS ${i.code}`,
    sourceRef: { type: 'pos.order', id: i.orderId, label: i.code },
    ...partner,
    methodCode: p.methodCode,
    direction: 'in' as const,
    lines: [{ lineKey: '1', amount: p.amount, invoiceDocKey: i.saleDocKey }],
    totals: { total: p.amount },
  }));
}
