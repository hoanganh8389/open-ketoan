/**
 * Báo cáo bán hàng máy POS gom ở máy chủ (phiếu NT-BH-043) — hàm thuần, không đọc CSDL.
 * Quy ước giữ như POS cũ (class-tgs-pos-bctk-sales-service.php, salesFacts.ts của máy bán React):
 *   - dòng bán lý do XBA, dòng trả NTH1;
 *   - SL / thành tiền / thuế / trước thuế dòng trả ghi số dương, cột Doanh thu (và Giá vốn) dòng trả ghi âm;
 *   - báo cáo theo danh mục / theo ngày trừ số lượng dòng trả.
 * Thu tiền: chỉ phần tiền thật đã thu như bút toán thu tiền của luật bán (sale.rule.ts) — bỏ phần đối trừ của đổi hàng và hình thức
 * ghi nợ (is_receivable); số phiếu thu = mã tham chiếu thanh toán, không có thì số đơn (như sổ).
 */
// [2026-11-25 11:55 PM Võ Hoàng] NGHIEM-THU — NT-BH-043: quy ước số báo cáo bán hàng máy POS gom ở máy chủ (đóng góp)
import { roundMoney } from '@bizcity/module-sdk';
import { isOffsetMethod, paymentKind } from './order.js';

/** Khoảng ngày tối đa của báo cáo dòng / phiếu / thu (Q6). */
export const MAX_RANGE_DAYS = 92;
/** Kích thước trang tối đa (Q7: 500 / trang; xuất Excel lấy theo lô, tới EXPORT_MAX dòng). */
export const PAGE_MAX = 500;
export const EXPORT_MAX = 20_000;

export const SALE_REASON = 'XBA';
export const RETURN_REASON = 'NTH1';
export const RETAIL_NAME = 'Khách lẻ';
export const NO_GROUP = 'Chưa phân nhóm';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const dayNo = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000;

/** Lỗi khoảng ngày (Q-CHUNG-06): báo ở ô `from` / `to`; null = hợp lệ. Hai đầu tính cả, 92 ngày là tối đa. */
export function rangeProblem(from: string, to: string, max = MAX_RANGE_DAYS): { field: 'from' | 'to'; message: string } | null {
  if (!DAY.test(from)) return { field: 'from', message: 'Từ ngày không đúng dạng yyyy-mm-dd' };
  if (!DAY.test(to)) return { field: 'to', message: 'Đến ngày không đúng dạng yyyy-mm-dd' };
  if (to < from) return { field: 'to', message: 'Đến ngày phải từ Từ ngày trở đi' };
  if (dayNo(to) - dayNo(from) + 1 > max) return { field: 'to', message: `Khoảng ngày tối đa ${max} ngày` };
  return null;
}

/** Các tháng (năm, tháng) có trong khoảng ngày — để đọc đơn giá vốn đúng tháng. */
export function monthsIn(from: string, to: string): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const ey = Number(to.slice(0, 4));
  const em = Number(to.slice(5, 7));
  while (y < ey || (y === ey && m <= em)) {
    out.push({ year: y, month: m });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

/** Khoảng ngày của tháng; tháng đang chạy thì tới hôm nay, tháng chưa tới thì null (như POS cũ). */
export function monthRange(year: number, month: number, today: string): { from: string; to: string } | null {
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  if (from > today) return null;
  const last = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { from, to: last > today ? today : last };
}

// ── Nhóm hàng (cây) ─────────────────────────────────────────────────────────────────────────────────────────────────────

export type GroupRow = { code: string; name: string; fullName: string; parentCode: string | null; isActive: boolean };

/** Đường nhóm từ gốc xuống: "Sữa / Sữa bột". Mã không có trong danh mục → chính mã; trống → "Chưa phân nhóm". Chặn vòng lặp. */
export function groupPath(code: string, groups: ReadonlyMap<string, GroupRow>): string {
  if (!code) return NO_GROUP;
  const names: string[] = [];
  const seen = new Set<string>();
  for (let at: string | null = code; at && !seen.has(at); at = groups.get(at)?.parentCode ?? null) {
    seen.add(at);
    const g = groups.get(at);
    names.unshift(g?.name || at);
    if (!g) break;
  }
  return names.join(' / ');
}

/** Nhóm đã chọn + mọi nhóm con cháu (Q-CHUNG-08: chọn cha lấy cả con). Rỗng = không lọc. */
export function expandGroups(selected: readonly string[], groups: readonly GroupRow[]): string[] {
  const children = new Map<string, string[]>();
  for (const g of groups) if (g.parentCode) children.set(g.parentCode, [...(children.get(g.parentCode) ?? []), g.code]);
  const out = new Set<string>();
  const stack = [...selected];
  while (stack.length) {
    const c = stack.pop()!;
    if (out.has(c)) continue;
    out.add(c);
    stack.push(...(children.get(c) ?? []));
  }
  return [...out];
}

/** "SUA,SUA-BOT" → ['SUA','SUA-BOT']. */
export const codeList = (s?: string) => [...new Set((s ?? '').split(',').map((x) => x.trim()).filter(Boolean))].slice(0, 500);

// ── Lô / hạn dùng ───────────────────────────────────────────────────────────────────────────────────────────────────────

export type DocLot = { docKey: string; lineNo: number; sku: string; itemId: string | null; lotNo: string; expDate: string | null; qty: number };
export type LineLot = { lotNo: string; expDate: string | null; qty: number };

/**
 * Gán lô của chứng từ (khung nhìn document_lots, theo thứ tự dòng đã nộp) vào dòng báo cáo: dòng thứ `nth` (1 = đầu) của cùng chứng từ +
 * cùng mặt hàng (item_id, không có thì mã) lấy nhóm lô của dòng chứng từ thứ `nth` cùng mặt hàng. Dòng cùng mã giữ thứ tự như trên chứng
 * từ nên khớp đúng dòng, kể cả khi các dòng nằm ở hai trang.
 */
export function assignLots<L extends { key: string; docKey: string; sku: string; itemId: string | null; nth: number }>(lines: readonly L[], lots: readonly DocLot[]): Map<string, LineLot[]> {
  const ident = (x: { sku: string; itemId: string | null }) => x.itemId ?? `sku:${x.sku}`;
  const groups = new Map<string, { lineNo: number; lots: LineLot[] }[]>();
  const sorted = [...lots].sort((a, b) => a.lineNo - b.lineNo || (a.expDate ?? '9999').localeCompare(b.expDate ?? '9999') || a.lotNo.localeCompare(b.lotNo));
  for (const l of sorted) {
    const k = `${l.docKey}|${ident(l)}`;
    const list = groups.get(k) ?? [];
    let g = list.find((x) => x.lineNo === l.lineNo);
    if (!g) { g = { lineNo: l.lineNo, lots: [] }; list.push(g); }
    g.lots.push({ lotNo: l.lotNo, expDate: l.expDate, qty: Math.abs(l.qty) });
    groups.set(k, list);
  }
  const out = new Map<string, LineLot[]>();
  for (const line of lines) {
    const list = groups.get(`${line.docKey}|${ident(line)}`) ?? groups.get(`${line.docKey}|sku:${line.sku}`);
    out.set(line.key, list?.[line.nth - 1]?.lots ?? []);
  }
  return out;
}

// ── Giá vốn (Q1, Q3) ────────────────────────────────────────────────────────────────────────────────────────────────────

export type CostStatus = 'ok' | 'not_run' | 'no_cost';
export type LineCost = { unitCost: number | null; costAmount: number | null; costStatus: CostStatus; costNote: string };

/**
 * Giá vốn dòng = SL (ĐVT nhỏ nhất) × đơn giá bình quân tháng của lần tính mới nhất; dòng trả ghi âm như Doanh thu.
 * Tháng chưa tính → trống + "Chưa tính giá vốn tháng mm/yyyy"; tháng đã tính mà mã không có đơn giá → trống + "Chưa có đơn giá vốn".
 */
export function lineCost(a: { baseQty: number; isReturn: boolean; businessDate: string; monthRun: boolean; unitCost: number | null }): LineCost {
  const mm = `${a.businessDate.slice(5, 7)}/${a.businessDate.slice(0, 4)}`;
  if (!a.monthRun) return { unitCost: null, costAmount: null, costStatus: 'not_run', costNote: `Chưa tính giá vốn tháng ${mm}` };
  if (a.unitCost === null) return { unitCost: null, costAmount: null, costStatus: 'no_cost', costNote: `Chưa có đơn giá vốn tháng ${mm}` };
  const v = roundMoney(Math.abs(a.baseQty) * a.unitCost);
  return { unitCost: a.unitCost, costAmount: a.isReturn ? -v : v, costStatus: 'ok', costNote: '' };
}

// ── Thanh toán / thu tiền ───────────────────────────────────────────────────────────────────────────────────────────────

export type PayMethod = { code: string; name: string; isReceivable: boolean; bankAccountCode: string | null };
export type SnapPayment = { mode: string; parts?: { method: string; amount: number; reference?: string }[] };
export type SnapVoucherUse = { kind?: string; amount: number; methodCode?: string };
export type CollectedPart = { method: string; amount: number; receiptNo: string; kind: ReturnType<typeof paymentKind> };

const isReceivable = (code: string, methods: readonly PayMethod[]) =>
  code === 'credit' || paymentKind(code) === 'credit' || methods.find((m) => m.code === code)?.isReceivable === true;

/**
 * Phần tiền đã thu của một đơn hoàn tất — đúng các khoản thu tiền luật bán ghi sổ (toSaleDocument.payments, sale.rule.ts):
 *   - voucher hãng (kind 'payment') theo hình thức kế toán khai;
 *   - tiền mặt / QR trả hết: tổng đơn − voucher hãng;
 *   - chia tiền: từng phần, BỎ phần đối trừ (đổi hàng — không phải tiền thu, ca k3 thử thật 25/11 lệch 325.000) và hình thức ghi nợ;
 *   - ghi nợ: không có phiếu thu.
 * Số phiếu thu = mã tham chiếu của phần (có thì dùng) hoặc số đơn, như bút toán thu tiền.
 */
export function collectedParts(o: { code: string; total: number; payment: SnapPayment; voucherUses?: readonly SnapVoucherUse[] }, methods: readonly PayMethod[], cashCode = 'TM', qrCode = 'QR'): CollectedPart[] {
  const vouchers = (o.voucherUses ?? []).filter((v) => v.kind === 'payment' && v.methodCode && v.amount > 0)
    .map((v) => ({ method: v.methodCode!, amount: v.amount, reference: '' }));
  const due = o.total - vouchers.reduce((s, v) => s + v.amount, 0);
  let parts: { method: string; amount: number; reference?: string }[];
  const p = o.payment;
  if (p.mode === 'cash') parts = due > 0 ? [{ method: cashCode, amount: due }] : [];
  else if (p.mode === 'qr') parts = due > 0 ? [{ method: qrCode, amount: due }] : [];
  else if (p.mode === 'split') parts = (p.parts ?? []).filter((x) => !isOffsetMethod(x.method) && x.amount > 0);
  else parts = [];
  return [...vouchers, ...parts]
    .filter((x) => !isReceivable(x.method, methods))
    .map((x) => ({ method: x.method, amount: roundMoney(x.amount), receiptNo: x.reference?.trim() || o.code, kind: paymentKind(x.method) }));
}

/** Đã trả của đơn: tổng − phần ghi nợ (đối trừ đổi hàng coi như đã trả). */
export function paidOf(o: { total: number; payment: SnapPayment }, methods: readonly PayMethod[]): number {
  const p = o.payment;
  if (p.mode === 'credit') return 0;
  const unpaid = p.mode === 'split'
    ? (p.parts ?? []).filter((x) => !isOffsetMethod(x.method) && isReceivable(x.method, methods)).reduce((s, x) => s + x.amount, 0)
    : 0;
  return Math.max(0, roundMoney(o.total - unpaid));
}

const MODE_LABEL: Record<string, string> = { cash: 'Tiền mặt', qr: 'Quét mã QR', credit: 'Ghi công nợ', doi_tru: 'Đối trừ' };

/** Chữ hình thức thanh toán của đơn: "Tiền mặt", "Tiền mặt + Chuyển khoản"… */
export function paymentText(p: SnapPayment, methods: readonly PayMethod[]): string {
  const name = (code: string) => methods.find((m) => m.code === code)?.name ?? MODE_LABEL[code] ?? MODE_LABEL[code.toLowerCase()] ?? code;
  if (p.mode === 'split') return (p.parts ?? []).map((x) => name(x.method)).join(' + ');
  if (p.mode === 'cash') return methods.find((m) => paymentKind(m.code) === 'cash')?.name ?? MODE_LABEL.cash!;
  if (p.mode === 'qr') return methods.find((m) => paymentKind(m.code) === 'qr')?.name ?? MODE_LABEL.qr!;
  return name(p.mode);
}

/** Lý do thu như POS cũ: tiền mặt TBHTM, còn lại TTBHK. */
export const collectionReason = (kind: CollectedPart['kind']) => (kind === 'cash' ? 'TBHTM' : 'TTBHK');

export const customerNameOf = (c: { id?: string; name?: string; phone?: string } | undefined) =>
  (c?.id || c?.phone ? c.name || c.phone || RETAIL_NAME : RETAIL_NAME);

/** Dòng quà thêm tay (không theo chương trình): isGift mà không có policyRef. */
export const isManualGift = (l: { isGift?: boolean; policyRef?: unknown }) => Boolean(l.isGift) && !l.policyRef;

// ── Theo ngày ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export type DailyRow = { date: string; qty: number; revenue: number; ratio: number };

/** Mỗi ngày trong khoảng một dòng (ngày không bán = 0); tỉ trọng = doanh thu ngày / tổng doanh thu × 100 (cộng 100 % khi tổng ≠ 0). */
export function dailyRows(byDay: ReadonlyMap<string, { qty: number; revenue: number }>, from: string, to: string): DailyRow[] {
  const days: string[] = [];
  for (let n = dayNo(from); n <= dayNo(to); n++) days.push(new Date(n * 86_400_000).toISOString().slice(0, 10));
  const total = days.reduce((s, d) => s + (byDay.get(d)?.revenue ?? 0), 0);
  return days.map((date) => {
    const v = byDay.get(date) ?? { qty: 0, revenue: 0 };
    return { date, qty: v.qty, revenue: v.revenue, ratio: total ? (v.revenue * 100) / total : 0 };
  });
}
