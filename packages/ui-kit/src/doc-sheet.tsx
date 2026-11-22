// @bizcity-layer P ui-kit
// [2026-11-22 10:40 PM Võ Hoàng] NT-BH-037 — BIZCITY-EXTENSION 1.5.0-draft §3c: khung phiếu DocSheet / DocSheetPanel cho form chứng từ của module (đóng góp)
/**
 * Phần mở rộng 1.5.0-draft của @bizcity/ui-kit (BIZCITY-EXTENSION §3c). Như §3b: ở đây chỉ có CHỮ KÝ (hợp đồng); bản thật là khung
 * phiếu Core `components/phieu-hang/KhungPhieu` (mẫu "Nhập mua (mới)") do khung giao diện đăng ký bằng provideUiKit.
 *
 *   DocSheet       tiêu đề + nhãn · tổng tiền chữ lớn · MỘT nút "? Hướng dẫn" · thu nhỏ · đóng; thân trái = `children`,
 *                  phải = cột Trợ lý (`side`; không có = thân một cột); chân = `footNote` bên trái + `footer` (nút) bên phải.
 *                  Ctrl + S bấm nút chính (.btn-primary) ở chân; Esc đóng; `viewing` = đang xem, F2 / Enter / bấm đúp = `onEdit`.
 *   DocSheetPanel  một khối của cột Trợ lý (Kiểm tra / Tóm tắt / Tổng tiền…).
 *
 * Lớp CSS dùng được trong thân DocSheet (cùng phiếu mua): `mh-head` (khối đầu phiếu, lưới 6 cột; ô con `span2`, `span4` = cả dòng) ·
 * `tabs kp-tabs` + `tab active` (thẻ) · `lines-bar` (thanh nút của bảng dòng) · `kp-lines-box` (khung cuộn bảng dòng) ·
 * trong khối Trợ lý: `mh-check ok|warn` (dòng kiểm), `mh-kv` (+ `total`) (bảng hai cột nhãn — số), `mh-guide` (+ `done`) (các bước).
 */
import type { ComponentType, ReactNode } from 'react';

export interface DocSheetProps {
  /** Tên phiếu + số (chữ của tiêu đề, cũng là tên ô ở thanh thu nhỏ). */
  title: string;
  /** Nhãn trạng thái cạnh tiêu đề. */
  badges?: ReactNode;
  /** Tổng tiền chữ lớn ở tiêu đề; không có = không hiện. */
  total?: { label: string; value: number };
  /** Định danh hướng dẫn; bỏ trống = tự sinh theo màn + tiêu đề (như Modal). */
  helpKey?: string;
  /** Đang xem phiếu đã ghi: nhãn "Đang xem", F2 / Enter / bấm đúp = onEdit, Ctrl + S tắt. */
  viewing?: boolean;
  /** Chỉ xem hẳn (không có Sửa). */
  readOnly?: boolean;
  onEdit?: () => void;
  onClose: () => void;
  /** Tên cột Trợ lý (mặc định "Trợ lý"). */
  sideTitle?: string;
  /** Các khối của cột Trợ lý (DocSheetPanel); không có = thân một cột. */
  side?: ReactNode;
  /** Dòng bên trái chân phiếu (vd "Chưa ghi được: …"). */
  footNote?: ReactNode;
  /** Nút ở chân phiếu; nút chính có lớp `btn btn-primary`. */
  footer: ReactNode;
  /** Dòng phím tắt dưới thân phiếu. */
  keys?: string;
  children: ReactNode;
}

export interface DocSheetPanelProps {
  title: ReactNode;
  /** Nhãn bên phải tiêu đề khối (vd `<span className="badge badge-warn">2</span>`). */
  badge?: ReactNode;
  children: ReactNode;
}

/** Bản thật khung giao diện cung cấp (kế thừa vào UiKitImpl). */
export interface UiKitDocSheetImpl {
  DocSheet: ComponentType<DocSheetProps>;
  DocSheetPanel: ComponentType<DocSheetPanelProps>;
}
