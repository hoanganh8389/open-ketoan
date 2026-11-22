// [2026-11-22 04:50 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — B4b (S038-13, R-LOG-10): gửi lỗi lập trình của giao diện về máy chủ — không dữ liệu nhập, 10 lỗi / phút, không trùng
/**
 * baoLoi(err, kind): đóng gói bằng goiLoiTrinhDuyet (@ketoan/contracts — che thông báo, chỉ khung stack của mã web, màn đã làm
 * sạch), gửi POST /api/v1/system/client-errors, trả mã tra cứu (cid) để màn lỗi hiện cho người dùng chép.
 * caiBatLoiTrinhDuyet(): window "error" + "unhandledrejection" (gọi một lần ở main.tsx).
 *
 * Không gửi: lỗi API (ApiError — đã có khay Mã tra cứu, requestId), tiếng ồn trình duyệt (boQuaLoiTrinhDuyet), lỗi đã gửi trong
 * phiên (cùng loại + khung đầu), quá 10 lỗi / phút. Gửi hỏng (mất mạng, máy chủ chết) thì thôi — không thử lại, không vòng lặp lỗi.
 */
import { boQuaLoiTrinhDuyet, GIOI_HAN_LOI_TRINH_DUYET, goiLoiTrinhDuyet, type KieuLoiTrinhDuyet } from '@ketoan/contracts';
import { ApiError } from './api';

const hex = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');
/** Phiên của tab (ngẫu nhiên, không lưu): máy chủ giới hạn nhịp theo phiên. */
const SID = hex(8);
const daGui = new Set<string>();
let moc: number[] = [];

/** Lỗi API đã có đường riêng (khay Mã tra cứu, requestId của máy chủ). */
const laLoiApi = (err: unknown) => err instanceof ApiError;

/** Gửi một lỗi; trả mã tra cứu (cid) — luôn có, kể cả khi không gửi (để màn lỗi vẫn hiện mã). */
export function baoLoi(err: unknown, kind: KieuLoiTrinhDuyet): string {
  const cid = hex(6);
  if (laLoiApi(err)) return cid;
  const loi = goiLoiTrinhDuyet(err, kind, window.location.pathname, cid);
  if (boQuaLoiTrinhDuyet(loi)) return cid;
  const khoa = `${loi.type}|${loi.frames[0] ?? loi.message}`;
  if (daGui.has(khoa)) return cid;
  const now = Date.now();
  moc = moc.filter((t) => now - t < 60_000);
  if (moc.length >= GIOI_HAN_LOI_TRINH_DUYET.moiPhut) return cid;
  moc.push(now);
  daGui.add(khoa);
  void fetch('/api/v1/system/client-errors', {
    method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...loi, sid: SID }),
  }).catch(() => {
    // nuot-loi: không gửi được (mất mạng / máy chủ chết — B4 đã hiện khay mất kết nối); báo lỗi về lỗi báo lỗi sẽ thành vòng lặp
  });
  return cid;
}

let daCai = false;
/** Bắt lỗi không bắt của cả trang. Gọi một lần, trước khi dựng ứng dụng. */
export function caiBatLoiTrinhDuyet(): void {
  if (daCai) return;
  daCai = true;
  window.addEventListener('error', (e) => { baoLoi(e.error ?? e.message, 'error'); });
  window.addEventListener('unhandledrejection', (e) => { baoLoi(e.reason, 'promise'); });
}
