// [2026-11-26 03:10 PM Võ Hoàng] NGHIEM-THU — NT-BH-044: BH06 chuyển sang module xuat-dieu-chinh — màn cũ chỉ còn chuyển hướng (đóng góp)
/**
 * Màn BH06 cũ (danh sách phiếu xuất điều chỉnh của Core, chỉ đọc) đã chuyển sang module `xuat-dieu-chinh` (phiếu NT-BH-044): danh sách đủ
 * phiếu 0 đ + có giá, lập / lưu nháp / ghi sổ, huỷ, in 02-VT ở `/app/xuat-dieu-chinh`. Giữ tệp này làm lối chuyển hướng cho đường cũ
 * `/ban-hang/xuat-dieu-chinh` (đã ghim / dấu trang). Mẫu in phiếu cũ vẫn ở ExportAdjustPrint.tsx (in từ màn Chứng từ).
 */
import { Navigate } from 'react-router-dom';

export function ExportAdjustPage() {
  return <Navigate to="/app/xuat-dieu-chinh" replace />;
}
