/** Đề nghị điều chuyển KHO04 (NT-BH-056) — phần máy chủ. Mọi action khai ở đây VÀ trong bizcity.module.json (`actions`). */
// [2026-11-28 10:00 AM Võ Hoàng] NGHIEM-THU — NT-BH-056: đăng ký action đề nghị điều chuyển (đóng góp)
import { defineModule } from '@bizcity/module-sdk';
import manifest from '../bizcity.module.json' with { type: 'json' };
import danhMucGet from './actions/danh-muc-get.js';
import hangGet from './actions/hang-get.js';
import phieuApprove from './actions/phieu-approve.js';
import phieuCancel from './actions/phieu-cancel.js';
import phieuGet from './actions/phieu-get.js';
import phieuList from './actions/phieu-list.js';
import phieuReject from './actions/phieu-reject.js';
import phieuSave from './actions/phieu-save.js';

export default defineModule({ manifest, actions: [phieuList, phieuGet, phieuSave, phieuCancel, phieuReject, phieuApprove, danhMucGet, hangGet], subscribers: [] });
