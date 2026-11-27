/** Kiểu + hằng dùng chung của màn KHO04 Đề nghị điều chuyển (NT-BH-056). */
// [2026-11-28 10:00 AM Võ Hoàng] NGHIEM-THU — NT-BH-056: kiểu dùng chung màn đề nghị điều chuyển (đóng góp)

export const M = '/api/v1/m/de-nghi-dieu-chuyen';
export const P_XEM = 'de-nghi-dieu-chuyen:xem';
export const P_LAP = 'de-nghi-dieu-chuyen:lap';
export const P_DUYET = 'de-nghi-dieu-chuyen:duyet';
/** Lập phiếu chuyển kho KHO01 (POST /api/v1/kho/transfers) bằng phiên người duyệt. */
export const KHO_TRANSFERS = '/api/v1/kho/transfers';

export type Status = 'pending' | 'approved' | 'converted' | 'rejected' | 'cancelled';
export const STATUS: Record<Status, string> = {
  pending: 'Chờ duyệt', approved: 'Đang lập chuyển kho', converted: 'Đã lập chuyển kho', rejected: 'Từ chối', cancelled: 'Đã huỷ',
};

export type Line = { lineKey: string; sku: string; name: string; unit: string; qty: number; stock: number; unitPrice: number | null; note: string; lotNo: string; expDate: string | null };
export type Phieu = {
  id: string; docNo: string; docDate: string; branchCode: string; warehouseCode: string; toBranchCode: string; toBranchName: string;
  partner: { code: string; name: string } | null; reasonCode: string | null; staffName: string; note: string; lines: Line[]; totalItems: number;
  totalQty: number; status: Status; statusLabel: string; version: number; source: 'ketoan' | 'pos'; transfer: { id: string; docNo: string; status?: string } | null;
  rejectReason: string | null; cancelReason: string | null; decidedByName: string | null; decidedAt: string | null; createdByName: string; createdAt: string;
};
export type DanhMuc = {
  branchCode: string; branchName: string; warehouseCode: string; receiveBranches: { code: string; name: string; isParent: boolean }[];
  canApprove: boolean; canCreateTransfer: boolean;
};
export type Hang = { sku: string; name: string; unit: string; active: boolean; stock: number };

export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const monthStart = () => `${today().slice(0, 8)}01`;
export const qtyText = (n: number) => (Number.isInteger(n) ? n.toLocaleString('vi-VN') : n.toLocaleString('vi-VN', { maximumFractionDigits: 4 }));
