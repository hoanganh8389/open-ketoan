/** Phiếu xuất điều chỉnh BH06 (NT-BH-044) — phần giao diện: màn /app/xuat-dieu-chinh (danh sách + form lập + in 02-VT). Quyền xem: xuat-dieu-chinh:phieu-xem. */
// [2026-11-26 03:10 PM Võ Hoàng] NGHIEM-THU — NT-BH-044: màn BH06 của module (đóng góp)
import { defineWebModule } from '@bizcity/module-sdk/web';
import { XuatDieuChinhPage } from './screens/XuatDieuChinhPage';

const P = 'xuat-dieu-chinh:phieu-xem';

export default defineWebModule({
  key: 'xuat-dieu-chinh',
  label: 'Phiếu xuất điều chỉnh',
  menu: [{ key: 'xuat-dieu-chinh-phieu', label: 'Phiếu xuất điều chỉnh', path: '/app/xuat-dieu-chinh', code: 'BH06', permission: P }],
  routes: [{ path: '/app/xuat-dieu-chinh', component: XuatDieuChinhPage, permission: P }],
});
