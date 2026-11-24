// [2026-11-25 Nguyễn Văn Thủy] trang "Đang phát triển": gom mọi việc chưa có màn theo nhóm menu, menu chính không còn mục mờ (đóng góp)
/**
 * Các việc khai `soon` trong bố trí menu (layout/menu-gon.ts GON_DEFS) — đã ẩn khỏi menu trái, trang nhóm, menu điện thoại —
 * được liệt kê ở đây theo nhóm để nhóm phát triển xem lại. Thêm / bớt việc: sửa `soon` ở GON_DEFS.
 */
import { PageHeader } from '@/components/PageHeader';
import { GON_DEFS } from '@/layout/menu-gon';
import { SO_DO, SO_DO_V2 } from '@/layout/so-do-nhom';
import { GonIcon } from '@/layout/SideNav';

export function DangPhatTrienPage() {
  const nhom = GON_DEFS.map((g) => ({
    g,
    viec: [...new Map([
      ...[...g.sections, ...(g.reports ?? [])].flatMap((s) => (s.soon ?? []).map((t) => ({ muc: s.label, ten: t }))),
      // Bước sơ đồ / báo cáo của trang nhóm chưa có màn (layout/so-do-nhom.ts).
      ...[SO_DO_V2[g.key], SO_DO[g.key]].flatMap((d) => [
        ...(d?.rows.flat() ?? []).filter((n) => !n.path).map((n) => ({ muc: 'Sơ đồ quy trình', ten: n.label })),
        ...(d?.reports ?? []).filter((r) => !r.path).map((r) => ({ muc: 'Báo cáo', ten: r.label })),
      ]),
    ].map((v) => [v.ten, v])).values()],
  })).filter((x) => x.viec.length);
  const tong = nhom.reduce((t, x) => t + x.viec.length, 0);
  return (
    <>
      <PageHeader title="Đang phát triển" subtitle={`${tong} việc chưa có màn, xếp theo nhóm menu — không hiện ở menu chính cho tới khi làm xong`} />
      <div className="dpt-luoi">
        {nhom.map(({ g, viec }) => (
          <section key={g.key} className="card dpt-the">
            <header style={{ borderLeftColor: g.color }}><GonIcon name={g.icon} size={16} /> <b>{g.label}</b> <span className="muted">{viec.length}</span></header>
            <ul>{viec.map((v) => <li key={`${v.muc ?? ''}|${v.ten}`}>{v.ten}{v.muc && <span className="muted"> · {v.muc}</span>}</li>)}</ul>
          </section>
        ))}
      </div>
    </>
  );
}
