// @bizcity-layer P permissions
// [2026-11-07 03:34 PM Johnny Chu - Chu Hoàng Anh] PHASE-027 — CK-3: mật khẩu công cụ dữ liệu mẫu không có giá trị mặc định trong mã (SC-SEC-5)
/**
 * MẬT KHẨU CÔNG CỤ (nạp / xoá dữ liệu tình huống, quét cha – con cả danh mục…): đọc từ biến môi trường PURCHASE_SEED_PASSWORD.
 * Không có giá trị mặc định trong mã: mật khẩu viết trong git thì ai đọc repo cũng biết. Chưa đặt biến → công cụ tắt, câu lỗi
 * nói rõ cách bật (người dùng không phải đoán). So sánh thời gian hằng để không lộ mật khẩu qua thời gian trả lời.
 */
import { timingSafeEqual } from 'node:crypto';
import { Errors } from '../errors.js';

export const TOOL_PASSWORD_ENV = 'PURCHASE_SEED_PASSWORD';

/** Công cụ đã được bật trên máy chủ này chưa (đã đặt mật khẩu công cụ). */
export const toolPasswordSet = (): boolean => Boolean(process.env[TOOL_PASSWORD_ENV]);

/** Chặn khi công cụ chưa bật hoặc mật khẩu sai. `what` là tên công cụ trong câu lỗi (vd "nạp dữ liệu"). */
export function checkToolPassword(given: string | undefined, what = 'công cụ'): void {
  const expected = process.env[TOOL_PASSWORD_ENV];
  if (!expected) {
    throw Errors.forbidden(`Công cụ ${what} đang tắt trên máy chủ này: quản trị đặt biến môi trường ${TOOL_PASSWORD_ENV} (mật khẩu công cụ) rồi khởi động lại API để bật`);
  }
  const a = Buffer.from(given ?? '', 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw Errors.forbidden(`Sai mật khẩu ${what}`);
}

// [2026-11-22 11:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-040 — B10b (S040-23): cùng khuôn CK-3 cho mật khẩu tính năng khác (xoá hết danh mục, đổi công thức giá vốn…) — mật khẩu viết sẵn đã công bố (T027-SEC-4) đã quay lại trong mã ở ba chỗ (SC-SEC-5)
/** Biến đầu tiên đã đặt trong `envs` (thứ tự = ưu tiên); không biến nào → null. */
export const envPassword = (envs: readonly string[]): string | null => envs.map((k) => process.env[k]).find((v) => Boolean(v)) ?? null;

/**
 * Chặn khi tính năng chưa bật (chưa đặt biến nào trong `envs`) hoặc mật khẩu sai. Không có giá trị mặc định trong mã.
 * Câu lỗi nêu biến đầu tiên của `envs` — biến người quản trị nên đặt.
 */
export function checkEnvPassword(given: string | undefined, what: string, envs: readonly string[]): void {
  const expected = envPassword(envs);
  if (!expected) {
    throw Errors.forbidden(`Tính năng ${what} đang tắt trên máy chủ này: quản trị đặt biến môi trường ${envs[0]} (mật khẩu ${what}) rồi khởi động lại API để bật`);
  }
  const a = Buffer.from(given ?? '', 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw Errors.forbidden(`Sai mật khẩu ${what}`);
}

// [2026-11-25 Nguyễn Văn Thủy] mật khẩu công cụ + đường dẫn giám sát khai ở màn Cấu hình hệ thống (HT13 → Công cụ & giám sát), lưu ở
// tenants.settings.cong_cu — không phải đặt biến môi trường rồi khởi động lại. Chưa khai thì dùng biến môi trường cũ (đóng góp)
/** Cấu hình công cụ & giám sát của đơn vị (tenants.settings.cong_cu). */
export interface CongCuConfig {
  wipePassword?: string; seedPassword?: string; costingPassword?: string;
  grafanaUrl?: string; grafanaUser?: string; grafanaPassword?: string;
  prometheusUrl?: string; alertmanagerUrl?: string; note?: string;
  /** Địa chỉ máy chủ API gọi tới để đọc log / trace (Bàn điều tra, Tra mã): vd http://loki:3100, http://tempo:3200. */
  lokiUrl?: string; tempoUrl?: string;
  /** Khoá kết nối cho máy ngoài (lịch tự sửa, cron dựng lại) — docs/ops/TU-DONG-SUA-LOI.md. tuSua: công tắc lịch tự sửa (HT20). */
  ketNoiKey?: string; tuSua?: boolean;
}
type Q = { selectFrom: (t: 'tenants') => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
/** Đọc cấu hình công cụ của đơn vị (rỗng nếu chưa khai). */
export async function congCuOf(trx: Q, tenantId: string): Promise<CongCuConfig> {
  const r = await trx.selectFrom('tenants').select('settings').where('id', '=', tenantId).executeTakeFirst() as { settings?: { cong_cu?: CongCuConfig } } | undefined;
  return r?.settings?.cong_cu ?? {};
}
/** Như checkEnvPassword nhưng ưu tiên mật khẩu khai ở HT13 (trường `field`), chưa khai thì biến môi trường `envs`. */
export async function checkConfigPassword(trx: Q, tenantId: string, given: string | undefined, what: string, field: 'wipePassword' | 'seedPassword' | 'costingPassword', envs: readonly string[]): Promise<void> {
  const c = await congCuOf(trx, tenantId);
  const expected = (field === 'costingPassword' ? c.costingPassword || c.wipePassword : c[field]) || envPassword(envs);
  if (!expected) throw Errors.forbidden(`Tính năng ${what} đang tắt: khai mật khẩu ${what} ở Cấu hình hệ thống (HT13) → Công cụ & giám sát`);
  const a = Buffer.from(given ?? '', 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw Errors.forbidden(`Sai mật khẩu ${what}`);
}
