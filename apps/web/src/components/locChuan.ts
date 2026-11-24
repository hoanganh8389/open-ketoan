// [2026-11-25 Nguyễn Văn Thủy] UX TOÀN HỆ THỐNG — thanh lọc chuẩn ngoài màn (chi nhánh · kỳ · nhóm hàng) dùng chung một nguồn với bảng "Chọn tham số" (đóng góp)
/**
 * Ngữ cảnh "lọc chuẩn" của một màn có bảng tham số (FilterLayout / ReportSideLayout).
 *
 * Ba ô lọc chuẩn luôn hiện ở thanh ngoài, cùng thứ tự ở mọi màn: Chi nhánh (cây) → Kỳ (từ – đến) → Nhóm hàng.
 * Ô lọc dùng chung đặt trong bảng tham số (BranchSelect / PanelBranchList, DateRange / SideKy / KyNgay, ChonNhomHang)
 * tự đăng ký giá trị + hàm đổi của nó vào đây — thanh ngoài và bảng tham số là MỘT nguồn, đổi bên nào bên kia theo.
 * Màn không có ô nào thì ô đó ở thanh ngoài hiện "Tất cả" và bị mờ (màn không lọc theo tiêu chí đó).
 */
import { createContext, useContext, useEffect, useRef } from 'react';

/** chiDen: báo cáo số dư tại một ngày — chỉ có ô Đến ngày. */
export interface NguonKy { from: string; to: string; onChange: (from: string, to: string) => void; chiDen?: boolean }
export interface NguonCN { value: string; onChange: (v: string) => void; kho?: { value: string; onChange: (v: string) => void } }
export interface NguonNhom { value: string; onChange: (v: string) => void }
export interface LocChuan { ky?: NguonKy; cn?: NguonCN; nhom?: NguonNhom }
export type LoaiLoc = keyof LocChuan;

export interface LocChuanContext { dat: <K extends LoaiLoc>(k: K, nguon: LocChuan[K] | null) => void }
export const LocChuanCtx = createContext<LocChuanContext | null>(null);

/**
 * Ô lọc dùng chung gọi hook này để đăng ký với thanh ngoài. `nguon` null = không đăng ký (ô đang ở ngoài bảng tham số).
 * Hàm đổi luôn là bản mới nhất (giữ qua ref) nên màn không cần useCallback.
 */
export function useDangKyLoc<K extends LoaiLoc>(k: K, nguon: LocChuan[K] | null, khoa: string) {
  const ctx = useContext(LocChuanCtx);
  const ref = useRef(nguon);
  ref.current = nguon;
  const co = Boolean(ctx && nguon);
  useEffect(() => {
    if (!ctx || !co) return undefined;
    const n = ref.current!;
    // Bọc hàm đổi để luôn gọi bản mới nhất.
    const goi = { ...n } as Record<string, unknown>;
    if ('onChange' in n) goi.onChange = (...a: unknown[]) => (ref.current as unknown as { onChange: (...x: unknown[]) => void }).onChange(...a);
    const kho = (n as NguonCN).kho;
    if (kho) goi.kho = { value: kho.value, onChange: (v: string) => (ref.current as NguonCN).kho?.onChange(v) };
    ctx.dat(k, goi as unknown as LocChuan[K]);
    return undefined;
  }, [ctx, co, k, khoa]);
  // Gỡ khi ô rời màn (đổi thẻ báo cáo không còn ô đó).
  useEffect(() => (ctx && co ? () => ctx.dat(k, null) : undefined), [ctx, co, k]);
}
