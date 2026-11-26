/**
 * Logic thuần của phiếu xuất điều chỉnh BH06 (NT-BH-044): lý do chọn được, ánh xạ lý do → mục đích, tính dòng, kiểm tồn, dựng chứng từ
 * nộp sổ. Không đọc CSDL — store.ts đọc danh mục, service.ts ghép. Không số tài khoản, không giá vốn: Kernel định khoản theo docType + lý do
 * + mục đích, giá trị phiếu 0 đ theo giá vốn bình quân khi tính giá vốn tháng.
 */
// [2026-11-26 03:10 PM Võ Hoàng] NGHIEM-THU — NT-BH-044: logic thuần phiếu xuất điều chỉnh (đóng góp)
import { roundMoney } from '@bizcity/module-sdk';

export const MODULE = 'xuat-dieu-chinh';
export const DEFAULT_REASON = 'XSD1';
export const SOURCE_TYPE = 'export_adjust';

/**
 * Lý do đã có màn riêng — không chọn được ở BH06 (C13): XBA, XBB (bán), XCKho (chuyển kho), XKK (kiểm kê), XCN, XCN3, XNB* (nội bộ).
 */
export function excludedReason(code: string): boolean {
  const c = code.trim().toUpperCase();
  return ['XBA', 'XBB', 'XCKHO', 'XKK', 'XCN', 'XCN3'].includes(c) || c.startsWith('XNB');
}

/**
 * Lý do → mã mục đích xuất (C2, chỉ mã — không tài khoản), như PURPOSE_OF_REASON của cầu nối tgs_accounting_bridge. Gửi purposeCode cho
 * phiếu 0 đ để Kernel tra TK đối ứng của mục đích (thiếu mục đích → TK hàng thiếu chờ xử lý). Tạm thời: khi Core tự suy mục đích từ lý do
 * (đề xuất mức 4 — phiếu NT-BH-044 §6 P1) thì bỏ bảng này.
 */
export const PURPOSE_OF_REASON: Readonly<Record<string, string>> = Object.freeze({
  XHH01: 'HUY', // Xuất huỷ hàng hỏng
  XHH02: 'MAT', // Mất, thất thoát hàng hoá
  XMKT1: 'TANG-KH', // Xuất khách dùng thử sản phẩm
  'XTA1.4': 'TANG-KH', // Xuất sử dụng / tặng / thưởng khách hàng
  XSD1: 'DUNG-BH', // Xuất sử dụng vật tư, hàng hoá cho bộ phận bán hàng
  XSD2: 'DUNG-QL', // Xuất sử dụng vật tư cho bộ phận quản lý
  XDT_641: 'DAO-TAO', // Xuất đào tạo bộ phận bán hàng
  XTA3: 'THUONG-NV', // Xuất sử dụng / tặng / thưởng nhân viên
  XTA_64118: 'THUONG-NV', // Xuất sử dụng / tặng / thưởng bộ phận bán hàng
  XTA2: 'NGOAI-GIAO', // Xuất tặng / ngoại giao
});
export const purposeOf = (reason: string): string | null => PURPOSE_OF_REASON[reason.trim().toUpperCase()] ?? PURPOSE_OF_REASON[reason.trim()] ?? null;

export type Finding = { field: string; title: string; code: string };

/** Dòng gửi lên (màn / máy bán). unitQty theo ĐVT đã chọn; unitPrice = giá trọn 1 ĐVT (gồm thuế) — chỉ phiếu có giá. */
export type LineInput = { lineKey?: string; sku: string; unit?: string; unitQty: number; lotNo?: string; expDate?: string; unitPrice?: number };

export type CatalogItem = {
  sku: string; name: string; baseUnit: string; taxCode: string | null; active: boolean;
  /** ĐVT → hệ số quy về ĐVT nhỏ nhất; giá niêm yết (null = chưa khai). */
  units: Map<string, { ratio: number; price: number | null }>;
};

export type Line = {
  lineKey: string; sku: string; name: string; unit: string; unitRatio: number; unitQty: number; qty: number; baseUnit: string;
  lotNo?: string; expDate?: string; unitPrice: number; taxCode: string | null; taxRate: number; amountBeforeTax: number; taxAmount: number; amount: number;
};

/** Số lẻ: danh mục chưa có cờ "ĐVT cho phép số lẻ" (đề xuất mức 4 — §6 P5) → mọi ĐVT chỉ nhận số nguyên (C11). */
export const allowsFraction = (_sku: string, _unit: string): boolean => false;

/**
 * Tính dòng theo danh mục: ĐVT quy đổi, SL về ĐVT nhỏ nhất, tiền (phiếu có giá: giá gồm thuế → tách thuế theo thuế suất của mặt hàng).
 * Trả mọi lỗi một lần, mỗi lỗi chỉ đúng ô (lines[i].sku / unit / unitQty / unitPrice).
 */
export function computeLines(input: readonly LineInput[], catalog: Map<string, CatalogItem>, rates: Map<string, number>, priced: boolean): { lines: Line[]; findings: Finding[] } {
  const findings: Finding[] = [];
  const lines: Line[] = [];
  input.forEach((l, i) => {
    const at = `lines[${i}]`;
    const sku = (l.sku ?? '').trim();
    const item = catalog.get(sku);
    if (!sku) { findings.push({ field: `${at}.sku`, title: `Dòng ${i + 1}: chưa chọn mặt hàng`, code: 'XDC_LINE_SKU' }); return; }
    if (!item || !item.active) { findings.push({ field: `${at}.sku`, title: `Dòng ${i + 1}: mặt hàng ${sku} không có hoặc đã ngừng dùng`, code: 'XDC_LINE_SKU' }); return; }
    const unit = (l.unit ?? '').trim() || item.baseUnit;
    const u = unit === item.baseUnit ? { ratio: 1, price: item.units.get(unit)?.price ?? null } : item.units.get(unit);
    if (!u) { findings.push({ field: `${at}.unit`, title: `Dòng ${i + 1}: ${sku} không có ĐVT "${unit}"`, code: 'XDC_LINE_UNIT' }); return; }
    const unitQty = Number(l.unitQty);
    if (!Number.isFinite(unitQty) || unitQty <= 0) { findings.push({ field: `${at}.qty`, title: `Dòng ${i + 1}: số lượng phải lớn hơn 0`, code: 'XDC_LINE_QTY' }); return; }
    if (!Number.isInteger(unitQty) && !allowsFraction(sku, unit)) {
      findings.push({ field: `${at}.qty`, title: `Dòng ${i + 1}: ĐVT ${unit} không cho số lẻ — nhập số nguyên`, code: 'XDC_LINE_FRACTION' });
      return;
    }
    const qty = Math.round(unitQty * u.ratio * 10000) / 10000;
    let unitPrice = 0; let rate = 0; let before = 0; let tax = 0;
    const taxCode = item.taxCode;
    if (priced) {
      unitPrice = Number(l.unitPrice ?? u.price ?? 0);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) { findings.push({ field: `${at}.unitPrice`, title: `Dòng ${i + 1}: đơn giá không hợp lệ`, code: 'XDC_LINE_PRICE' }); return; }
      if (!taxCode || !rates.has(taxCode)) { findings.push({ field: `${at}.sku`, title: `Dòng ${i + 1}: ${sku} chưa khai thuế suất bán ra ở danh mục mặt hàng`, code: 'XDC_LINE_TAX' }); return; }
      rate = rates.get(taxCode)!;
      const amount = roundMoney(unitQty * unitPrice);
      tax = roundMoney(amount * rate / (100 + rate));
      before = roundMoney(amount - tax);
    }
    lines.push({
      lineKey: (l.lineKey ?? '').trim() || `L${i + 1}`, sku, name: item.name, unit, unitRatio: u.ratio, unitQty, qty, baseUnit: item.baseUnit,
      ...(l.lotNo?.trim() ? { lotNo: l.lotNo.trim() } : {}), ...(l.expDate ? { expDate: l.expDate } : {}),
      unitPrice, taxCode, taxRate: rate, amountBeforeTax: before, taxAmount: tax, amount: roundMoney(before + tax),
    });
  });
  if (!input.length) findings.push({ field: 'lines', title: 'Phiếu phải có ít nhất một dòng hàng', code: 'XDC_LINES_EMPTY' });
  return { lines, findings };
}

/** Quá tồn theo mã ở kho của phiếu (SL đã quy về ĐVT nhỏ nhất). Báo vào dòng đầu tiên của mã, câu báo quy ra ĐVT nhỏ nhất. */
export function overStock(lines: readonly Line[], stock: Map<string, number>, warehouse: string): Finding[] {
  const need = new Map<string, number>();
  for (const l of lines) need.set(l.sku, (need.get(l.sku) ?? 0) + l.qty);
  const out: Finding[] = [];
  for (const [sku, q] of need) {
    const have = stock.get(sku) ?? 0;
    if (q > have + 1e-9) {
      const i = lines.findIndex((l) => l.sku === sku);
      const l = lines[i]!;
      const conv = l.unitRatio !== 1 ? ` (${l.unitQty} ${l.unit} = ${q} ${l.baseUnit})` : '';
      out.push({ field: `lines[${i}].qty`, title: `${warehouse} chỉ còn ${have} ${l.baseUnit} ${sku}, phiếu cần ${q}${conv}`, code: 'XDC_OVER_STOCK' });
    }
  }
  return out;
}

const sum = (xs: number[]) => roundMoney(xs.reduce((s, x) => s + x, 0));
export const totalsOf = (lines: readonly Line[]) => ({ beforeTax: sum(lines.map((l) => l.amountBeforeTax)), tax: sum(lines.map((l) => l.taxAmount)), total: sum(lines.map((l) => l.amount)) });

export type Head = {
  docId: string; docNo: string; docDate: string; branchCode: string; warehouseCode: string; reasonCode: string; purposeCode: string | null; priced: boolean;
  partner: { code: string; name: string } | null; receiverName: string; employeeName: string; description: string; lines: Line[];
};

export const docKeyOf = (id: string) => `${MODULE}:${id}`;

/**
 * Chứng từ nộp sổ (bizcity_ledger_intake@1). 0 đ → stock_adjustment giảm kho, amount 0, purposeCode theo bảng ánh xạ. Có giá → sale
 * nội bộ (internalOnly, không hoá đơn), payments rỗng = công nợ người nhận. sourceRef.type = export_adjust (báo cáo bán hàng / kho
 * nhận phiếu theo nhãn này). Không số tài khoản.
 */
export function toLedgerDoc(h: Head, version: number): Record<string, unknown> & { docKey: string; docType: string } {
  const base = {
    docKey: docKeyOf(h.docId), version, branchCode: h.branchCode, docNo: h.docNo, docDate: h.docDate, reasonCode: h.reasonCode,
    description: (`Xuất điều chỉnh ${h.docNo}` + (h.description ? ` — ${h.description}` : '')).slice(0, 1000),
    sourceRef: { type: SOURCE_TYPE, id: h.docId, label: 'Phiếu xuất điều chỉnh' },
    extra: { receiver: h.receiverName || undefined, employee: h.employeeName || undefined, exportAdjust: true },
  };
  if (!h.priced) {
    return {
      ...base, docType: 'stock_adjustment', direction: 'decrease', ...(h.purposeCode ? { purposeCode: h.purposeCode } : {}),
      lines: h.lines.map((l) => ({ lineKey: l.lineKey, sku: l.sku, name: l.name, unit: l.baseUnit, qty: l.qty, amount: 0, warehouseCode: h.warehouseCode,
        ...(l.lotNo ? { lotNo: l.lotNo } : {}), ...(l.expDate ? { expDate: l.expDate } : {}) })),
      totals: { total: 0 },
    };
  }
  return {
    ...base, docType: 'sale', internalOnly: true, partner: h.partner ?? undefined, payments: [],
    lines: h.lines.map((l) => ({
      lineKey: l.lineKey, sku: l.sku, name: l.name, unit: l.unit, qty: l.qty, unitQty: l.unitQty, unitRatio: l.unitRatio,
      unitPrice: roundMoney(l.unitQty ? l.amountBeforeTax / l.unitQty : 0), amountBeforeTax: l.amountBeforeTax, taxCode: l.taxCode!, taxAmount: l.taxAmount,
      warehouseCode: h.warehouseCode, ...(l.lotNo ? { lotNo: l.lotNo } : {}), ...(l.expDate ? { expDate: l.expDate } : {}),
    })),
    totals: totalsOf(h.lines),
  };
}

/** Số phiếu XDC-<chi nhánh>-<yyMM>-<số 4 chữ số>. */
export const periodOf = (date: string) => date.slice(2, 4) + date.slice(5, 7);
export const formatNo = (branch: string, period: string, n: number) => `XDC-${branch}-${period}-${String(n).padStart(4, '0')}`;
