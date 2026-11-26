/** Hoá đơn điện tử THUE03 (NT-BH-048) — phần giao diện: màn /app/hoa-don-dien-tu. Quyền xem: hoa-don-dien-tu:cai-dat-xem. */
// [2026-11-26 09:00 PM Võ Hoàng] NGHIEM-THU — NT-BH-048: màn THUE03 của module (đóng góp)
import { defineWebModule } from '@bizcity/module-sdk/web';
import { HoaDonDienTuPage } from './screens/HoaDonDienTuPage';

const P = 'hoa-don-dien-tu:cai-dat-xem';

export default defineWebModule({
  key: 'hoa-don-dien-tu',
  label: 'Hoá đơn điện tử',
  menu: [{ key: 'hoa-don-dien-tu-cai-dat', label: 'Hoá đơn điện tử', path: '/app/hoa-don-dien-tu', code: 'THUE03', permission: P }],
  routes: [{ path: '/app/hoa-don-dien-tu', component: HoaDonDienTuPage, permission: P }],
});
