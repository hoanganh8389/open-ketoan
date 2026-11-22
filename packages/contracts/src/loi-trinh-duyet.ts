// [2026-11-22 04:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — B4b (S038-13, D038-5, R-LOG-10): khuôn lỗi giao diện gửi về máy chủ — chỉ loại lỗi, khung stack của mã web, màn; không dữ liệu nhập
/**
 * Lỗi lập trình ở trình duyệt (render React, lỗi không bắt, promise không bắt) gửi về POST /api/v1/system/client-errors để người sửa
 * thấy trong logs/web-client.log — trước đây chỉ là một màn trắng, máy chủ không biết (G10).
 *
 * Bảo vệ dữ liệu (R-LOG-4), làm ở CẢ hai đầu (máy chủ không tin bên gửi):
 *   - thông báo lỗi bị che email, số điện thoại / MST / số tài khoản (chuỗi ≥ 6 chữ số), mã định danh dài; cắt 200 ký tự;
 *   - chỉ giữ khung stack trỏ vào tệp của chính bản web (/assets/, /src/), bỏ tham số truy vấn và tên miền;
 *   - màn chỉ là đường dẫn đã thay đoạn có số / mã bằng `:x` (lamSachDuongDan), không chuỗi truy vấn;
 *   - không gửi state, props, giá trị ô nhập, nội dung trang.
 */
import { lamSachDuongDan } from './ma-tra-cuu.js';

export const GIOI_HAN_LOI_TRINH_DUYET = {
  /** Mỗi phiên trình duyệt / mỗi địa chỉ IP phía máy chủ. */
  moiPhut: 10,
  thongBao: 200,
  soKhung: 5,
  khung: 160,
  loai: 60,
  man: 200,
} as const;

export type KieuLoiTrinhDuyet = 'render' | 'error' | 'promise';

export interface LoiTrinhDuyet {
  kind: KieuLoiTrinhDuyet;
  /** Tên lớp lỗi (TypeError, ChunkLoadError…). */
  type: string;
  message: string;
  /** Khung stack của mã web: "assets/index-abc123.js:1:23456" hoặc "src/features/x.tsx:12:3". */
  frames: string[];
  /** Màn đang mở, đã làm sạch. */
  screen: string;
  /** Mã tra cứu phía trình duyệt — hiện trên màn lỗi, có trong dòng log để tìm. */
  cid: string;
}

/** Che dữ liệu có thể lọt vào thông báo lỗi, rồi cắt độ dài. */
export function cheThongBao(msg: string): string {
  return String(msg)
    .replace(/[^\s@"'<>]+@[^\s@"'<>]+\.[a-z]{2,}/gi, '<email>')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
    .replace(/[A-Za-z0-9_-]{32,}/g, '<chuỗi>')
    .replace(/\d[\d .-]{4,}\d/g, (m) => (m.replace(/\D/g, '').length >= 6 ? '<số>' : m))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, GIOI_HAN_LOI_TRINH_DUYET.thongBao);
}

const FRAME_RE = /(?:https?:\/\/[^/\s)]+)?\/((?:assets|src)\/[^\s?#):]+)(?:\?[^\s):]*)?:(\d+)(?::(\d+))?/;

/** Khung stack của chính bản web (bỏ tiện ích trình duyệt, thư viện ngoài, eval), tối đa soKhung. */
export function khungCuaWeb(stack: string | undefined): string[] {
  const out: string[] = [];
  for (const line of String(stack ?? '').split('\n')) {
    const m = FRAME_RE.exec(line);
    if (!m || m[1]!.includes('node_modules')) continue;
    out.push(`${m[1]}:${m[2]}${m[3] ? `:${m[3]}` : ''}`.slice(0, GIOI_HAN_LOI_TRINH_DUYET.khung));
    if (out.length >= GIOI_HAN_LOI_TRINH_DUYET.soKhung) break;
  }
  return out;
}

function chuoiCua(v: unknown): string {
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    // nuot-loi: giá trị không tuần tự hoá được (vòng tham chiếu) — String() vẫn cho người sửa biết loại; không cần lỗi thứ hai
    return String(v);
  }
}

/** Đóng gói một lỗi bất kỳ thành khuôn gửi đi. */
export function goiLoiTrinhDuyet(err: unknown, kind: KieuLoiTrinhDuyet, screen: string, cid: string): LoiTrinhDuyet {
  const e = err instanceof Error ? err : null;
  const type = (e?.name || (typeof err === 'string' ? 'string' : typeof err)).slice(0, GIOI_HAN_LOI_TRINH_DUYET.loai);
  const message = cheThongBao(e ? e.message : typeof err === 'string' ? err : chuoiCua(err));
  return { kind, type, message, frames: khungCuaWeb(e?.stack), screen: lamSachDuongDan(screen).slice(0, GIOI_HAN_LOI_TRINH_DUYET.man), cid };
}

/**
 * Lỗi nên bỏ qua: tiếng ồn của trình duyệt, không phải lỗi của mã web — "Script error." (tệp tên miền khác, không có chi tiết),
 * ResizeObserver loop (cảnh báo bố cục, vô hại), huỷ yêu cầu chủ động (AbortError).
 */
export function boQuaLoiTrinhDuyet(l: Pick<LoiTrinhDuyet, 'type' | 'message'>): boolean {
  return l.type === 'AbortError' || /^Script error\.?$/i.test(l.message) || /ResizeObserver loop/i.test(l.message);
}
