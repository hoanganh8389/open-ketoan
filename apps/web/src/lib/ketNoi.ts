// [2026-11-22 02:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — B4 (S038-9): trạng thái "mất kết nối máy chủ phần mềm" của tab — một khay, tự thử lại giãn dần, nối lại thì báo các màn tải lại
/**
 * Một kho cho cả tab (như khoMaTraCuu). Logic ở @ketoan/contracts (ket-noi.ts: laMatKetNoi, choThuLai, taoKhoKetNoi — test ở
 * apps/api/test/ket-noi.test.ts); tệp này chỉ nối fetch / đồng hồ / sự kiện của trình duyệt.
 * api.ts báo `mat()` khi lỗi là mất kết nối, `daNoi()` khi một lời gọi bất kỳ thành công. Đang mất: các màn không tự gọi lặp
 * (App.tsx: react-query không thử lại lỗi này; DangOnline bỏ ping) — chỉ một vòng thử /api/v1/system/health giãn dần 5 → 60 giây.
 */
import { taoKhoKetNoi } from '@ketoan/contracts';

export type { TrangThaiKetNoi } from '@ketoan/contracts';

export const SU_KIEN_DA_NOI_LAI = 'ketoan:da-noi-lai';

export const ketNoi = taoKhoKetNoi({
  // fetch thẳng, không qua api.ts: lời thử hỏng không ghi khay Mã tra cứu lần nữa
  thuSucKhoe: async () => {
    const r = await fetch('/api/v1/system/health', { cache: 'no-store' });
    // nuot-loi: thân không phải JSON (trang HTML của proxy) = chưa nối được; kho tự hẹn lần thử sau
    const j = (await r.json().catch(() => null)) as { ok?: boolean } | null;
    return r.ok && j?.ok === true;
  },
  henGio: (fn, ms) => window.setTimeout(fn, ms),
  boHen: (h) => window.clearTimeout(h as number),
  phatNoiLai: () => window.dispatchEvent(new Event(SU_KIEN_DA_NOI_LAI)),
});
