// [2026-11-22 02:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — B4 (S038-9): nhận ra "mất kết nối máy chủ phần mềm" và lịch thử lại giãn dần — logic thuần cho apps/web (test ở apps/api/test/ket-noi.test.ts)
/**
 * Khi cổng vào không gọi được api (api dừng / đang khởi động lại), mọi màn đang mở cùng lúc nhận lỗi. Giao diện cần:
 *   - nhận ra loại lỗi này — khác lỗi nghiệp vụ, khác 504 báo cáo chạy lâu, khác 5xx do chính api trả;
 *   - hiện MỘT khay "Không kết nối được máy chủ phần mềm", không một hộp lỗi kỹ thuật cho mỗi lời gọi;
 *   - tự thử lại giãn dần (không dội cổng vào), nối lại được thì tắt khay.
 * Thuần, không DOM: web (apps/web/src/lib/ketNoi.ts) giữ trạng thái và gọi mạng.
 */

/** Mã của cổng vào (docker/nginx.conf, PHASE-038 B2). */
export const MA_MAT_KET_NOI = 'GATEWAY_UNAVAILABLE';

export interface PhanHoiThu {
  /** Mã HTTP; 0 = không nhận được phản hồi (mạng hỏng, fetch ném lỗi). */
  status: number;
  /** Thân có parse được JSON không. */
  json: boolean;
  /** error.code nếu thân là phong bì lỗi. */
  code?: string | null;
}

/**
 * Lỗi này có phải "không kết nối được máy chủ phần mềm" không.
 *   - GATEWAY_UNAVAILABLE (nginx của bản cài từ PHASE-038 B2) → có.
 *   - 502 / 503 thân không phải JSON (bản cài cũ, proxy aaPanel phía trước tự trả trang HTML) → có.
 *   - 0: fetch không có phản hồi (mất mạng, máy chủ tắt hẳn) → có.
 *   - 504 không: thường là báo cáo chạy quá giờ khi api vẫn sống (api.ts có câu riêng).
 *   - 5xx thân JSON của api (NOT_READY, INTERNAL_ERROR có requestId) không: api vẫn trả lời.
 */
export function laMatKetNoi(r: PhanHoiThu): boolean {
  if (r.code === MA_MAT_KET_NOI) return true;
  if (r.status === 0) return true;
  return !r.json && (r.status === 502 || r.status === 503);
}

/** Lịch thử lại (ms) sau lần thử thứ `lan` (1, 2, …): 5 → 10 → 20 → 40 → 60 giây rồi giữ 60 giây. */
export function choThuLai(lan: number): number {
  const n = Math.max(1, Math.floor(lan));
  return Math.min(60_000, 5_000 * 2 ** (n - 1));
}

/** Chữ cho kế toán (thuật ngữ thường, không mã kỹ thuật trên dòng chính). */
export const CHU_MAT_KET_NOI = {
  tieuDe: 'Không kết nối được máy chủ phần mềm',
  moTa: 'Phần mềm đang tự thử lại. Dữ liệu đã lưu không mất; thao tác đang làm dở chưa được ghi — làm lại sau khi nối được.',
  keoDai: 'Kéo dài quá vài phút: báo người quản trị chạy ./scripts/lay-log.sh trên máy chủ và gửi gói log (logs/goi-bao-loi-*.tar.gz) kèm mã tra cứu dưới đây.',
  thuLai: 'Thử lại ngay',
  daNoi: 'Đã nối lại máy chủ phần mềm',
} as const;

export interface TrangThaiKetNoi {
  mat: boolean;
  /** Lúc bắt đầu mất (ms), null khi đang nối. */
  tu: number | null;
  /** Số lần thử lại kế tiếp (1, 2, …) — quyết định chờ bao lâu (choThuLai). */
  lan: number;
  /** Mã tra cứu của lỗi đầu tiên (requestId của cổng vào) — người dùng chép gửi quản trị. */
  requestId?: string;
  dangThu: boolean;
  /** Lúc nối lại gần nhất (ms) — khay báo "đã nối lại" trong chốc lát. */
  daNoiLuc?: number;
}

/** Phụ thuộc bên ngoài của kho (web truyền fetch / setTimeout / sự kiện thật; test truyền bản giả). */
export interface PhuThuocKetNoi {
  /** Gọi /api/v1/system/health; true = máy chủ trả lời ok. Ném lỗi = chưa trả lời. */
  thuSucKhoe: () => Promise<boolean>;
  henGio: (fn: () => void, ms: number) => unknown;
  boHen: (h: unknown) => void;
  /** Báo các màn: đã nối lại (web: tải lại số liệu). */
  phatNoiLai: () => void;
  bayGio?: () => number;
}

export interface KhoKetNoi {
  la: typeof laMatKetNoi;
  /** Báo mất kết nối. true = lần đầu (khay Mã tra cứu ghi một lần cho N lời gọi hỏng). */
  mat(requestId?: string): boolean;
  /** Một lời gọi thành công / lần thử được: tắt, báo nối lại. Không làm gì khi đang nối. */
  daNoi(): void;
  /** "Thử lại ngay": thử một lần; không được thì giữ lịch. */
  thuNgay(): Promise<boolean>;
  dangMat(): boolean;
  trangThai(): TrangThaiKetNoi;
  nghe(f: () => void): () => void;
}

/**
 * Kho trạng thái "mất kết nối" của một tab. Đang mất: thử sức khoẻ theo choThuLai (5 → 60 giây), một vòng duy nhất — không
 * dội cổng vào. trangThai() trả cùng một đối tượng tới khi đổi (dùng được với useSyncExternalStore).
 */
export function taoKhoKetNoi(dep: PhuThuocKetNoi): KhoKetNoi {
  const now = dep.bayGio ?? Date.now;
  let st: TrangThaiKetNoi = { mat: false, tu: null, lan: 0, dangThu: false };
  const nghe = new Set<() => void>();
  let hen: unknown = null;
  const doi = (n: Partial<TrangThaiKetNoi>) => { st = { ...st, ...n }; nghe.forEach((f) => f()); };
  const boHen = () => { if (hen !== null) dep.boHen(hen); hen = null; };

  const thu = async (): Promise<boolean> => {
    if (st.dangThu) return false;
    doi({ dangThu: true });
    let ok = false;
    try {
      ok = await dep.thuSucKhoe();
    } catch {
      // nuot-loi: máy chủ vẫn chưa trả lời — đúng là điều đang chờ; lần thử sau theo lịch
    }
    doi({ dangThu: false });
    if (ok) kho.daNoi();
    return ok;
  };

  const henLan = (): void => {
    boHen();
    hen = dep.henGio(() => {
      hen = null;
      if (!st.mat) return;
      void thu().then((ok) => { if (!ok && st.mat) { doi({ lan: st.lan + 1 }); henLan(); } });
    }, choThuLai(st.lan));
  };

  const kho: KhoKetNoi = {
    la: laMatKetNoi,
    mat(requestId) {
      if (st.mat) return false;
      doi({ mat: true, tu: now(), lan: 1, requestId, daNoiLuc: undefined });
      henLan();
      return true;
    },
    daNoi() {
      if (!st.mat) return;
      boHen();
      doi({ mat: false, tu: null, lan: 0, requestId: undefined, daNoiLuc: now() });
      dep.phatNoiLai();
    },
    thuNgay: () => thu(),
    dangMat: () => st.mat,
    trangThai: () => st,
    nghe(f) { nghe.add(f); return () => { nghe.delete(f); }; },
  };
  return kho;
}
