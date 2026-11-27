/** Đề nghị điều chuyển KHO04 (NT-BH-056) — phần giao diện: màn /app/de-nghi-dieu-chuyen (danh sách + form lập / duyệt). Quyền xem: de-nghi-dieu-chuyen:xem. */
// [2026-11-28 10:00 AM Võ Hoàng] NGHIEM-THU — NT-BH-056: màn KHO04 của module (đóng góp)
import { defineWebModule } from '@bizcity/module-sdk/web';
import { DeNghiPage } from './screens/DeNghiPage';

const P = 'de-nghi-dieu-chuyen:xem';

export default defineWebModule({
  key: 'de-nghi-dieu-chuyen',
  label: 'Đề nghị điều chuyển',
  menu: [{ key: 'de-nghi-dieu-chuyen-phieu', label: 'Đề nghị điều chuyển', path: '/app/de-nghi-dieu-chuyen', code: 'KHO04', permission: P }],
  routes: [{ path: '/app/de-nghi-dieu-chuyen', component: DeNghiPage, permission: P }],
});
