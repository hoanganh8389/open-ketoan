// [2026-11-29 02:30 AM Võ Hoàng] NGHIEM-THU — NT-BH-064 (C2): dòng được giảm theo lô / hạn dùng → phiếu bán ghi lô từng phần (kho xuất đúng lô đã giảm) (đóng góp)
/**
 * Tách một dòng phiếu bán theo kế hoạch lô Core trả (`lotPlan` — lô dự kiến xuất của CẢ dòng, hạn dùng sớm trước; `promoLots` — các lô được giảm).
 * Mỗi phần mang `lotNo` / `expDate` của lô (phần thiếu tồn lô không ghi lô). Tiền:
 *   - tiền giảm theo chương trình (`promo`) chỉ chia cho các phần thuộc lô được giảm, theo số lượng;
 *   - giảm khác (giảm tay, voucher chia vào dòng) chia theo số lượng mọi phần;
 *   - thành tiền / chưa thuế / thuế / giảm chưa thuế chia sao cho TỔNG các phần đúng bằng dòng gốc (dư đồng dồn vào phần lớn nhất).
 * Kế hoạch không khớp số lượng dòng / không có lô được giảm → không tách (trả null), dòng đi như cũ (Kernel tự phân lô).
 */
import { allocate } from '@bizcity/module-sdk';

export type LotPart = { lotNo: string; expDate: string | null; qty: number };
export type LineMoneyParts = { gross: number; net: number; tax: number; discountNet: number };
export type LotSlice = { lotNo: string; expDate: string | null; qty: number; promo: number; money: LineMoneyParts; promoted: boolean };

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
const sameLot = (a: LotPart, b: LotPart) => a.lotNo === b.lotNo && (a.expDate ?? null) === (b.expDate ?? null);

/**
 * @param qty     số lượng dòng (đơn vị nhỏ nhất)
 * @param base    tiền trước mọi giảm (gồm thuế) = đơn giá × số lượng, đã làm tròn đồng
 * @param money   tiền dòng sau mọi giảm (gross / net / tax / discountNet)
 * @param promo   tiền giảm theo chương trình (gồm thuế) của dòng
 */
export function splitLineByLots(input: { qty: number; base: number; money: LineMoneyParts; promo: number; lotPlan?: LotPart[]; promoLots?: LotPart[] }): LotSlice[] | null {
  const plan = (input.lotPlan ?? []).filter((p) => p.qty > 0);
  const promoLots = (input.promoLots ?? []).filter((p) => p.qty > 0);
  if (plan.length < 1 || !promoLots.length) return null;
  if (Math.abs(r4(plan.reduce((s, p) => s + p.qty, 0)) - r4(input.qty)) > 1e-6) return null;
  // Số lượng được giảm của từng phần (theo lô được giảm; một lô chỉ tính đủ số lượng của nó).
  const left = promoLots.map((p) => ({ ...p }));
  const promotedQty = plan.map((p) => {
    const hit = left.find((x) => sameLot(x, p) && x.qty > 0);
    if (!hit || (!p.lotNo && !p.expDate)) return 0;
    const q = Math.min(hit.qty, p.qty); hit.qty = r4(hit.qty - q);
    return q;
  });
  if (!promotedQty.some((q) => q > 0)) return null;
  const discountGross = input.base - input.money.gross;
  const other = Math.max(0, discountGross - input.promo);
  const promoParts = allocate(Math.min(input.promo, discountGross), promotedQty);
  const otherParts = allocate(other, plan.map((p) => p.qty));
  const baseParts = allocate(input.base, plan.map((p) => p.qty));
  const grossParts = plan.map((_, i) => baseParts[i]! - promoParts[i]! - otherParts[i]!);
  const netParts = allocate(input.money.net, grossParts.map((g) => Math.max(0, g)));
  const discNetParts = allocate(input.money.discountNet, plan.map((_, i) => promoParts[i]! + otherParts[i]!));
  return plan.map((p, i) => ({
    lotNo: p.lotNo, expDate: p.expDate, qty: p.qty, promo: promoParts[i]!, promoted: promotedQty[i]! > 0,
    money: { gross: grossParts[i]!, net: netParts[i]!, tax: grossParts[i]! - netParts[i]!, discountNet: discNetParts[i]! },
  }));
}
