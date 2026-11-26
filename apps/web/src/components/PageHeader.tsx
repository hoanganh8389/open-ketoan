// [2026-11-06 01:10 AM Nguyễn Văn Thủy] MENU — mô tả dưới tiêu đề chuyển thành chú thích rê chuột để đỡ chữ
/**
 * Tiêu đề trang: tên, mã chức năng, mô tả ngắn (rê chuột vào biểu tượng i), các nút, nút "In" (in màn đang xem theo khổ giấy,
 * đầu trang có tên đơn vị, cuối trang có ô chữ ký) và nút "Hướng dẫn"
 * mở tài liệu sử dụng của chính màn này (docs/huong-dan/<helpKey>.md). Màn danh mục có dữ liệu gốc thì thêm nút
 * "Quay về dữ liệu gốc" (DEFAULT_DATA_SCREENS).
 */
import { useState, type ReactNode } from 'react';
import { HelpCircle, Info, Printer, RefreshCw } from 'lucide-react';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { useAppMenu } from '@/layout/useAppMenu';
import { useAuth } from '@/lib/auth';
import { tenMan } from '@/layout/ten-man';
import { HelpDrawer } from './HelpDrawer';
import { taiLaiNeuCoBanMoi } from '@/lib/banMoi';
import { DEFAULT_DATA_SCREENS, RestoreDefaultsButton } from '@/features/flow/DefaultDataPages';

export function PageHeader({ title, code, subtitle, note, actions, helpKey, helpExtra }: { title: string; code?: string; subtitle?: string; /** Dòng luôn hiện dưới tiêu đề, dành cho thông tin theo dữ liệu đang xem. */ note?: string; actions?: ReactNode; helpKey?: string; /** Phần riêng của màn hiện trong ngăn Hướng dẫn, dưới thẻ hướng dẫn. */ helpExtra?: ReactNode }) {
  const [help, setHelp] = useState(false);
  // [2026-11-26 06:40 PM Nguyễn Văn Thủy] UX — mọi màn có nút Nạp (tải lại số liệu mới nhất từ máy chủ); màn đã có nút Nạp riêng (.btn-nap) thì nút này ẩn (theme.css) (đóng góp)
  const qc = useQueryClient();
  const dangNap = useIsFetching() > 0;
  const { user } = useAuth();
  // Tên, mã của màn đặt ở một nơi (layout/ten-man.ts): khớp đúng đường dẫn đang mở thì dùng.
  const pathname = useLocation().pathname;
  const t = tenMan(pathname);
  // [2026-11-17 kiennt] tiêu đề, mã đồng nhất với menu: màn có trong menu thì lấy tên + mã ở menu (đóng góp)
  const menu = useAppMenu();
  const m = t ? undefined : menu.flatMap((g) => [g, ...(g.children ?? [])]).find((x) => x.path === pathname);
  if (t) { title = t.label; code = t.code ?? code; } else if (m) { title = m.label; code = code ?? m.code; } // mã của màn giữ nguyên (dùng tra nút Quay về dữ liệu gốc)
  return (
    <div className="page-header">
      {/* Chỉ hiện khi in: tên đơn vị ở đầu trang. */}
      <div className="print-org">{user?.tenant.name}</div>
      <div>
        <div className="page-title">
          <h1>{title}</h1>
          {code && <span className="code">{code}</span>}
          {subtitle && <span className="page-info" title={subtitle} aria-label={subtitle}><Info size={14} /></span>}
        </div>
        {note && <div className="page-sub">{note}</div>}
      </div>
      <div className="page-actions">
        <button type="button" className="btn nut-nap-man" onClick={() => void taiLaiNeuCoBanMoi().then((moi) => { if (!moi) void qc.invalidateQueries({ type: 'active' }); })} title="Nạp lại số liệu mới nhất của màn này; có bản phần mềm mới thì tải lại trang để cập nhật">
          <RefreshCw size={16} className={dangNap ? 'spin' : undefined} /> Nạp
        </button>
        {actions}
        {code && DEFAULT_DATA_SCREENS[code] && <RestoreDefaultsButton datasetKey={DEFAULT_DATA_SCREENS[code]!.key} title={DEFAULT_DATA_SCREENS[code]!.title} />}
        {code && (
          // Màn danh mục có nút In trên thanh công cụ (cạnh Xuất) thì nút này ẩn — xem .nut-in-man ở theme.css.
          <button className="btn nut-in-man" onClick={() => window.print()} title="In màn hình đang xem">
            <Printer size={16} /> In
          </button>
        )}
        {helpKey && (
          <button className="btn btn-help" onClick={() => setHelp(true)}>
            <HelpCircle size={16} /> Hướng dẫn
          </button>
        )}
      </div>
      {help && helpKey && <HelpDrawer guideKey={helpKey} onClose={() => setHelp(false)} extra={helpExtra} />}
    </div>
  );
}
