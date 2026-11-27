/**
 * Hoá đơn điện tử (NT-BH-048) — phần máy chủ. Mọi action khai ở đây VÀ trong bizcity.module.json (`actions`).
 * Action đọc bí mật cho khoá app (`hoa-don-dien-tu.secrets.read`, quyền secrets:read:hoa-don-dien-tu) do defineModule tự thêm theo `secrets[]`.
 */
// [2026-11-26 09:00 PM Võ Hoàng] NGHIEM-THU — NT-BH-048: đăng ký action cài đặt hoá đơn điện tử (đóng góp)
import { defineModule, type ModuleManifestLike } from '@bizcity/module-sdk';
import manifest from '../bizcity.module.json' with { type: 'json' };
import caiDatExport from './actions/cai-dat-export.js';
import caiDatGet from './actions/cai-dat-get.js';
import caiDatSaveChiNhanh from './actions/cai-dat-save-chi-nhanh.js';
import caiDatSaveSo from './actions/cai-dat-save-so.js';
import ketNoiThu from './actions/ket-noi-thu.js';
import nhatKyList from './actions/nhat-ky-list.js';

// secrets[].scope trong JSON là chuỗi — ép về khuôn manifest (defineModule vẫn kiểm lại lúc nạp).
export default defineModule({ manifest: manifest as ModuleManifestLike, actions: [caiDatGet, caiDatSaveSo, caiDatSaveChiNhanh, ketNoiThu, caiDatExport, nhatKyList], subscribers: [] });
