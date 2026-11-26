/** Phiếu xuất điều chỉnh BH06 (NT-BH-044) — phần máy chủ. Mọi action khai ở đây VÀ trong bizcity.module.json (`actions`). */
// [2026-11-26 03:10 PM Võ Hoàng] NGHIEM-THU — NT-BH-044: đăng ký action phiếu xuất điều chỉnh (đóng góp)
import { defineModule } from '@bizcity/module-sdk';
import manifest from '../bizcity.module.json' with { type: 'json' };
import danhMucGet from './actions/danh-muc-get.js';
import hangGet from './actions/hang-get.js';
import phieuCancel from './actions/phieu-cancel.js';
import phieuDelete from './actions/phieu-delete.js';
import phieuGet from './actions/phieu-get.js';
import phieuList from './actions/phieu-list.js';
import phieuSave from './actions/phieu-save.js';

export default defineModule({ manifest, actions: [phieuList, phieuGet, phieuSave, phieuDelete, phieuCancel, danhMucGet, hangGet], subscribers: [] });
