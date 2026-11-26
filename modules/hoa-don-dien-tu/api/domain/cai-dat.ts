/**
 * Hàm thuần (không I/O) của cài đặt hoá đơn điện tử (NT-BH-048): kiểm ô, gộp cài đặt hiệu lực theo chi nhánh, tên ô đã đổi cho nhật ký.
 * Theo sổ (một đơn vị = một sổ, P-0): người bán + tài khoản Viettel + mặc định. Theo chi nhánh: mẫu số / ký hiệu (trống = theo sổ) + portal.
 */
// [2026-11-26 09:00 PM Võ Hoàng] NGHIEM-THU — NT-BH-048: kiểm ô + cài đặt hiệu lực theo chi nhánh (đóng góp)

export type Finding = { field: string; title: string; code: string };

/** Bí mật khai ở manifest (`secrets[]`) — S-HD-4 (cầu nối) đọc đúng các tên này. */
export const SECRET = {
  matKhauViettel: 'hoa-don-dien-tu.viettel.password',
  maTruyCapViettel: 'hoa-don-dien-tu.viettel.token',
  matKhauPortal: 'hoa-don-dien-tu.portal.password',
} as const;

export type TrangThai = 'nhap' | 'dang-dung' | 'ngung';
export type AuthMode = 'basic' | 'token';
export type AutoMode = 'draft' | 'issue';

/** Ô thường của sổ (không có bí mật). */
export type SoFields = {
  trangThai: TrangThai; mst: string; tenPhapLy: string; diaChi: string; dienThoai: string;
  apiBaseUrl: string; authMode: AuthMode; username: string; sslVerify: boolean;
  templateCode: string; invoiceSeries: string; paymentMethod: string; autoEnabled: boolean; autoMode: AutoMode;
};

/** Ô thường của chi nhánh. Mẫu số / ký hiệu trống = theo sổ. */
export type ChiNhanhFields = {
  templateCode: string; invoiceSeries: string; portalEnabled: boolean; portalAccount: string; portalSupplierId: string; active: boolean;
};

/** Ô bí mật nhập từ màn: undefined / '' = giữ nguyên; '-' = xoá; chuỗi khác = đặt mới. */
export type SecretInput = string | undefined;
export const secretAction = (v: SecretInput): 'keep' | 'delete' | 'set' => (v === undefined || v === '' ? 'keep' : v.trim() === '-' ? 'delete' : 'set');

/** MST 10 số hoặc 10 số + "-" + 3 số (chi nhánh). */
export const MST_RE = /^\d{10}(-\d{3})?$/;

/**
 * Kiểm sổ trước khi lưu. `secret` = mật khẩu / token sẽ còn sau lần lưu này (đã đặt từ trước hoặc vừa nhập).
 * Nháp / ngừng: chỉ kiểm ô có nhập. Đang dùng: đủ MST, tên pháp lý, API base URL, mẫu số, ký hiệu và cách xác thực (như website `validate_cluster_data`).
 */
export function soFindings(f: SoFields, secret: { password: boolean; token: boolean }): Finding[] {
  const out: Finding[] = [];
  const dung = f.trangThai === 'dang-dung';
  if (f.mst && !MST_RE.test(f.mst)) out.push({ field: 'mst', title: 'MST phải là 10 số hoặc 14 ký tự dạng 0123456789-001', code: 'HDDT_MST' });
  if (f.apiBaseUrl && !/^https:\/\/[^\s/]+/i.test(f.apiBaseUrl)) out.push({ field: 'apiBaseUrl', title: 'API base URL phải bắt đầu bằng https://', code: 'HDDT_URL' });
  if (dung) {
    if (!f.mst) out.push({ field: 'mst', title: 'Thiếu MST người bán', code: 'HDDT_MST_THIEU' });
    if (!f.tenPhapLy) out.push({ field: 'tenPhapLy', title: 'Thiếu tên pháp lý', code: 'HDDT_TEN_THIEU' });
    if (!f.apiBaseUrl) out.push({ field: 'apiBaseUrl', title: 'Thiếu API base URL', code: 'HDDT_URL_THIEU' });
    if (!f.templateCode) out.push({ field: 'templateCode', title: 'Thiếu mẫu số mặc định', code: 'HDDT_MAU_THIEU' });
    if (!f.invoiceSeries) out.push({ field: 'invoiceSeries', title: 'Thiếu ký hiệu mặc định', code: 'HDDT_KY_HIEU_THIEU' });
    if (f.authMode === 'basic' && !f.username) out.push({ field: 'username', title: 'Xác thực Basic cần tên đăng nhập', code: 'HDDT_USER_THIEU' });
    if (f.authMode === 'basic' && !secret.password) out.push({ field: 'password', title: 'Xác thực Basic cần mật khẩu Viettel', code: 'HDDT_PASS_THIEU' });
    if (f.authMode === 'token' && !secret.token) out.push({ field: 'token', title: 'Xác thực Bearer cần access token', code: 'HDDT_TOKEN_THIEU' });
  }
  return out;
}

/** Kiểm chi nhánh: bật portal thì cần tài khoản portal + mật khẩu portal. */
export function chiNhanhFindings(f: ChiNhanhFields, portalPassword: boolean): Finding[] {
  const out: Finding[] = [];
  if (f.portalEnabled && !f.portalAccount) out.push({ field: 'portalAccount', title: 'Bật gửi mail qua portal cần tài khoản portal', code: 'HDDT_PORTAL_THIEU' });
  if (f.portalEnabled && !portalPassword) out.push({ field: 'portalPassword', title: 'Bật gửi mail qua portal cần mật khẩu portal', code: 'HDDT_PORTAL_PASS_THIEU' });
  return out;
}

/** Tên ô đã đổi (nhật ký chỉ ghi TÊN ô, không ghi giá trị bí mật). */
export function changedFields<T extends Record<string, unknown>>(before: T | null, after: T): string[] {
  return Object.keys(after).filter((k) => !before || JSON.stringify(before[k]) !== JSON.stringify(after[k]));
}

export type Effective = {
  branchCode: string; trangThai: TrangThai; active: boolean; mst: string; tenPhapLy: string; diaChi: string; dienThoai: string;
  apiBaseUrl: string; authMode: AuthMode; username: string; sslVerify: boolean;
  templateCode: string; invoiceSeries: string; templateFrom: 'chi-nhanh' | 'so'; seriesFrom: 'chi-nhanh' | 'so';
  paymentMethod: string; autoEnabled: boolean; autoMode: AutoMode;
  portalEnabled: boolean; portalAccount: string; portalSupplierId: string;
};

/** Cài đặt hiệu lực của một chi nhánh: ô của chi nhánh, trống thì lấy của sổ. Chi nhánh chưa khai → toàn bộ theo sổ, portal tắt. */
export function effectiveFor(branchCode: string, so: SoFields, cn: ChiNhanhFields | null): Effective {
  const tpl = cn?.templateCode?.trim() || '';
  const ser = cn?.invoiceSeries?.trim() || '';
  return {
    branchCode, trangThai: so.trangThai, active: cn ? cn.active : true,
    mst: so.mst, tenPhapLy: so.tenPhapLy, diaChi: so.diaChi, dienThoai: so.dienThoai,
    apiBaseUrl: so.apiBaseUrl, authMode: so.authMode, username: so.username, sslVerify: so.sslVerify,
    templateCode: tpl || so.templateCode, invoiceSeries: ser || so.invoiceSeries, templateFrom: tpl ? 'chi-nhanh' : 'so', seriesFrom: ser ? 'chi-nhanh' : 'so',
    paymentMethod: so.paymentMethod, autoEnabled: so.autoEnabled, autoMode: so.autoMode,
    portalEnabled: cn?.portalEnabled ?? false, portalAccount: cn?.portalAccount ?? '', portalSupplierId: cn?.portalSupplierId ?? '',
  };
}

/** Sổ trống (chưa khai) — form không trắng tinh: xác thực Basic, SSL bật, tự động tắt, phát hành tay. */
export const SO_TRONG: SoFields = {
  trangThai: 'nhap', mst: '', tenPhapLy: '', diaChi: '', dienThoai: '', apiBaseUrl: '', authMode: 'basic', username: '', sslVerify: true,
  templateCode: '', invoiceSeries: '', paymentMethod: 'TM/CK', autoEnabled: false, autoMode: 'draft',
};

/** Kết quả thử kết nối theo mã HTTP (chỉ GET API base URL, không gọi lệnh phát hành). */
export function ketNoiText(code: number | null, err?: string): { ok: boolean; text: string } {
  if (code === null) return { ok: false, text: `Không kết nối được: ${err ?? 'lỗi mạng'}` };
  if (code === 401 || code === 403) return { ok: false, text: `Máy chủ Viettel từ chối tài khoản (HTTP ${code}) — kiểm tên đăng nhập / mật khẩu / token` };
  if (code >= 500) return { ok: false, text: `Máy chủ Viettel đang lỗi (HTTP ${code}) — thử lại sau` };
  return { ok: true, text: `Kết nối được tới máy chủ API (HTTP ${code}). Đây chưa phải thao tác phát hành hoá đơn.` };
}
