// [2026-11-25 Nguyễn Văn Thủy] tuỳ chọn hiện khay Mã tra cứu (góc dưới trái): mọi lỗi / chỉ lỗi kỹ thuật / tắt — nhớ trên máy (đóng góp)
/**
 * 'tat-ca'   : hiện cả "Từ chối đúng luật" (dữ liệu không hợp lệ…) lẫn "Lỗi kỹ thuật".
 * 'ky-thuat' : (mặc định) chỉ hiện lỗi kỹ thuật — lỗi từ chối đúng luật đã báo ngay tại màn nên không bật khay.
 * 'tat'      : không hiện khay (câu lỗi vẫn hiện ở màn).
 */
export type CheDoMaTraCuu = 'tat-ca' | 'ky-thuat' | 'tat';
const KEY = 'ketoan.ma-tra-cuu.hien';
const nghe = new Set<() => void>();
export const hienMaTraCuu = {
  get(): CheDoMaTraCuu {
    try { const v = localStorage.getItem(KEY); if (v === 'tat-ca' || v === 'ky-thuat' || v === 'tat') return v; } catch { /* bỏ qua */ }
    return 'ky-thuat';
  },
  set(v: CheDoMaTraCuu) { try { localStorage.setItem(KEY, v); } catch { /* bỏ qua */ } nghe.forEach((f) => f()); },
  nghe(f: () => void) { nghe.add(f); return () => { nghe.delete(f); }; },
};
