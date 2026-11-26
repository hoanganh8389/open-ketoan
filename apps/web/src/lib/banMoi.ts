// [2026-11-26 07:50 PM Nguyễn Văn Thủy] UX — nút Nạp: máy chủ đã có bản giao diện mới (vừa đẩy code) thì tải lại cả trang để lấy bản mới;
// chưa có thì chỉ nạp lại số liệu, giữ nguyên thẻ / phiếu đang mở (đóng góp)
/** Tệp script chính của bản giao diện đang chạy (vd /assets/index-AbC123.js). */
const banDangChay = (): string => {
  const s = [...document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]')].map((x) => new URL(x.src, location.href).pathname).find((p) => p.includes('/assets/'));
  return s ?? '';
};

/** Có bản giao diện mới trên máy chủ thì tải lại trang và trả true; không có / không kiểm được thì false. */
export async function taiLaiNeuCoBanMoi(): Promise<boolean> {
  const dang = banDangChay();
  if (!dang) return false;
  try {
    const html = await (await fetch(`/?_=${Date.now()}`, { cache: 'no-store' })).text();
    const moi = /<script[^>]+type="module"[^>]+src="([^"]*\/assets\/[^"]+\.js)"/.exec(html)?.[1];
    if (moi && new URL(moi, location.href).pathname !== dang) { location.reload(); return true; }
  } catch (e) {
    // mất mạng / máy chủ đang dựng lại: chỉ nạp lại số liệu như thường
    console.warn('Không kiểm được bản giao diện mới', e);
  }
  return false;
}

/** Mọi nút Nạp riêng của từng màn (.btn-nap: thanh danh mục, danh sách phiếu…) cũng kiểm bản mới — gắn một lần ở main.tsx. */
export function ganNutNapKiemBanMoi() {
  document.addEventListener('click', (e) => { if ((e.target as HTMLElement | null)?.closest?.('.btn-nap')) void taiLaiNeuCoBanMoi(); }, true);
}
