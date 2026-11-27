/**
 * Voucher đổi điểm ghi chiết khấu thương mại (NT-BH-060, Hoàng chốt tạm 28/11 — kế toán xác nhận sau).
 *
 * Phiếu bán máy POS chia tiền voucher đổi điểm vào dòng (giảm thành tiền), nên doanh thu 511 ghi theo số SAU voucher. Muốn doanh thu
 * ghi đủ giá bán và phần voucher nằm ở chiết khấu thương mại (5211), module nộp thêm MỘT phiếu kế toán (manual_journal) phân loại lại
 * phần chưa thuế của voucher:  Nợ 5211 / Có 511  (lý do POS-VOUCHER-DIEM). Trả hàng gỡ phần tương ứng khỏi 5211 (lý do
 * POS-VOUCHER-DIEM-TRA, Có 5211; Nợ đề xuất 5213 để hàng trả ghi đủ giá — hoặc 511 nếu kế toán muốn đảo thẳng doanh thu). Thuế GTGT, công nợ, tiền thu không đổi (thuế đã tính trên giá sau chiết khấu).
 * Module chỉ gửi mã lý do — cặp tài khoản nằm trên lý do (posting_reasons loại journal), kế toán khai / đổi ở Quy tắc hạch toán.
 * Lý do chưa khai → Core từ chối phiếu kế toán, đơn bán vẫn ghi (trạng thái phiếu lưu trong ảnh chụp đơn / phiếu trả).
 * Không I/O.
 */
// [2026-11-28 05:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-060: voucher đổi điểm → chiết khấu thương mại 5211, doanh thu đủ giá (đóng góp)
import { roundMoney } from '@bizcity/module-sdk';

export const POINT_VOUCHER_REASON = 'POS-VOUCHER-DIEM';
export const POINT_VOUCHER_RETURN_REASON = 'POS-VOUCHER-DIEM-TRA';

export const pointVoucherDocKey = (branchCode: string, orderId: string) => `pos:${branchCode}:voucher-diem:${orderId}`;
export const pointVoucherReturnDocKey = (branchCode: string, returnId: string) => `pos:${branchCode}:voucher-diem-tra:${returnId}`;

const money = (n: number) => `${roundMoney(n).toLocaleString('vi-VN')}đ`;

function journal(input: { docKey: string; branchCode: string; docNo: string; docDate: string; reasonCode: string; amount: number; description: string; partnerCode?: string | null }) {
  const amount = roundMoney(input.amount);
  if (!(amount > 0)) return null;
  return {
    docType: 'manual_journal' as const,
    docKey: input.docKey,
    version: 1,
    branchCode: input.branchCode,
    docNo: input.docNo.slice(0, 64),
    docDate: input.docDate,
    description: input.description.slice(0, 1000),
    lines: [{
      lineKey: '1',
      reasonCode: input.reasonCode,
      amount,
      ...(input.partnerCode ? { partnerCode: input.partnerCode } : {}),
      description: input.description.slice(0, 500),
    }],
    totals: { total: amount },
  };
}

/** Phiếu kế toán của đơn bán: Nợ chiết khấu thương mại / Có doanh thu, số = phần chưa thuế của voucher đổi điểm. null khi không có. */
export function pointVoucherJournal(input: { branchCode: string; orderId: string; orderCode: string; businessDate: string; voucherCode: string; amountNet: number; partnerCode?: string | null }) {
  return journal({
    docKey: pointVoucherDocKey(input.branchCode, input.orderId),
    branchCode: input.branchCode,
    docNo: `${input.orderCode}-VD`,
    docDate: input.businessDate,
    reasonCode: POINT_VOUCHER_REASON,
    amount: input.amountNet,
    partnerCode: input.partnerCode ?? null,
    description: `Chiết khấu thương mại voucher đổi điểm ${input.voucherCode} đơn ${input.orderCode} (${money(input.amountNet)} chưa thuế)`,
  });
}

/** Phiếu kế toán đảo khi trả hàng: Nợ doanh thu / Có chiết khấu thương mại, phần voucher của các dòng trả. null khi không có. */
export function pointVoucherReturnJournal(input: { branchCode: string; returnId: string; returnCode: string; orderCode: string; businessDate: string; amountNet: number; partnerCode?: string | null }) {
  return journal({
    docKey: pointVoucherReturnDocKey(input.branchCode, input.returnId),
    branchCode: input.branchCode,
    docNo: `${input.returnCode}-VD`,
    docDate: input.businessDate,
    reasonCode: POINT_VOUCHER_RETURN_REASON,
    amount: input.amountNet,
    partnerCode: input.partnerCode ?? null,
    description: `Đảo chiết khấu voucher đổi điểm khi trả hàng ${input.returnCode} (đơn ${input.orderCode}, ${money(input.amountNet)} chưa thuế)`,
  });
}

/**
 * Phần chưa thuế của voucher đổi điểm theo các dòng trả: dòng gốc (ảnh chụp đơn) mang `pointVoucherNet` cho cả SL bán `unitQty`;
 * trả `qty` thì lấy theo tỉ lệ. Dòng gốc không có trường này (đơn trước NT-BH-060) → 0.
 */
export function returnedPointVoucherNet(
  orderLines: readonly { lineId?: string; unitQty?: number; pointVoucherNet?: number }[],
  returned: readonly { lineId: string; qty: number }[],
): number {
  let sum = 0;
  for (const r of returned) {
    const o = orderLines.find((l) => l.lineId === r.lineId);
    const pv = Number(o?.pointVoucherNet ?? 0);
    const sold = Number(o?.unitQty ?? 0);
    if (pv > 0 && sold > 0 && r.qty > 0) sum += (pv * Math.min(r.qty, sold)) / sold;
  }
  return roundMoney(sum);
}
