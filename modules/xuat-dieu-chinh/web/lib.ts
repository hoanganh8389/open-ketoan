/** Kiểu dữ liệu + tiện ích dùng chung của màn BH06 (NT-BH-044). Chỉ gọi API của module `/api/v1/m/xuat-dieu-chinh/…` và API đọc của Core. */
// [2026-11-26 03:10 PM Võ Hoàng] NGHIEM-THU — NT-BH-044: kiểu và tiện ích màn BH06 (đóng góp)

export const M = '/api/v1/m/xuat-dieu-chinh';
export const P_XEM = 'xuat-dieu-chinh:phieu-xem';
export const P_LAP = 'xuat-dieu-chinh:phieu-lap';
export const P_HUY = 'xuat-dieu-chinh:phieu-huy';

export type Line = {
  lineKey: string; sku: string; name: string; unit: string; unitRatio: number; unitQty: number; qty: number; baseUnit: string;
  lotNo?: string; expDate?: string; unitPrice: number; taxCode: string | null; taxRate: number; amountBeforeTax: number; taxAmount: number; amount: number;
};
export type Phieu = {
  id: string; docNo: string; docDate: string; branchCode: string; warehouseCode: string; reasonCode: string; purposeCode: string | null; priced: boolean;
  kind: 'zero' | 'priced'; partner: { code: string; name: string } | null; receiverName: string; employeeName: string; description: string; lines: Line[];
  total: number; status: 'draft' | 'posted' | 'cancelled'; version: number; ledgerStatus: string | null; copiedFrom: string | null;
  belowCost: { sku: string; unitPrice: number; unitCost: number }[]; cancelReason: string | null; createdBy: string; createdByName: string;
  source: 'module' | 'btsoft';
};
export type DanhMuc = {
  today: string; canBackdate: boolean; canEditOthers: boolean; defaultReason: string; excludedReasons: string[]; purposeOfReason: Record<string, string>;
  warehouses: { code: string; name: string; isDefault: boolean; isPromo: boolean }[]; defaultWarehouse: string | null;
};
export type HangInfo = {
  sku: string; name: string; active: boolean; baseUnit: string; taxCode: string | null; taxRate: number | null;
  units: { unit: string; ratio: number; price: number | null }[]; stock: number; unitCost: number | null;
};
export type Reason = { code: string; name: string; kind: string; isActive: boolean };

export const STATUS: Record<string, string> = { draft: 'Nháp', posted: 'Đã ghi sổ', cancelled: 'Đã huỷ', pending: 'Chờ định khoản', error: 'Lỗi định khoản' };

/** Lý do đã có màn riêng — không chọn ở BH06 (C13). */
export const excluded = (code: string) => {
  const c = code.toUpperCase();
  return ['XBA', 'XBB', 'XCKHO', 'XKK', 'XCN', 'XCN3'].includes(c) || c.startsWith('XNB');
};

/** Lỗi máy chủ → { đường dẫn ô: câu báo } (details.findings / error.fields). */
export function fieldErrors(err: unknown): Record<string, string> {
  const d = (err as { details?: { findings?: { field?: string; title?: string }[] } } | null)?.details;
  const out: Record<string, string> = {};
  for (const f of d?.findings ?? []) if (f.field && !out[f.field]) out[f.field] = f.title ?? '';
  return out;
}

export const money = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 0 });
