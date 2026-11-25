// [2026-11-25 Nguyễn Văn Thủy] UX TOÀN HỆ THỐNG — nút tạo mới một chỗ cố định ở mọi màn (đóng góp)
/**
 * Nút tạo mới (lập phiếu, thêm hợp đồng, thêm mặt hàng…). Quy ước toàn hệ thống:
 *   luôn là NÚT ĐẦU TIÊN, góc trái của thanh nút ngay trên danh sách; màu chính, dấu +.
 *   Loại khác (nếu có) là hộp chọn đứng ngay sau; các nút Mở / Nhân bản / In / Excel / Nạp theo sau; ô tìm dồn sang phải.
 */
import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';

export function NutTao({ children, onClick, disabled, title }: { children: ReactNode; onClick: () => void; disabled?: boolean; title?: string }) {
  return <button type="button" className="btn btn-sm btn-primary nut-tao" onClick={onClick} disabled={disabled} title={title}><Plus size={14} /> {children}</button>;
}
