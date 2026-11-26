// [2026-11-06 03:20 AM Nguyễn Văn Thủy] MENU — bỏ ô Màn chính, thanh nằm trong vùng làm việc để không che menu trái
/**
 * THANH CỬA SỔ DƯỚI ĐÁY (như thanh tác vụ) — mọi hộp thoại (Modal, phiếu mua hàng, phiếu thu chi…) thu nhỏ được xuống đây:
 *   - nút "—" cạnh ✕ trên hộp thoại: ẩn hộp thoại nhưng GIỮ NGUYÊN mọi thứ đang gõ (component vẫn dựng, chỉ ẩn);
 *   - mỗi hộp thoại một ô: tên phiếu, chấm cam = chưa lưu; bấm ô = mở lại đúng chỗ đang dở (tự chuyển sang thẻ chứa nó);
 *     bấm ô đang mở = thu nhỏ; × trên ô = đóng như bấm ✕;
 *   - nút "Đóng tất cả" ở cuối và chuột phải vào ô (đóng ô này / các ô khác / tất cả, thu nhỏ tất cả); có phiếu chưa lưu thì hỏi lại.
 * Thanh chỉ hiện khi có ít nhất một hộp thoại (không chiếm chỗ khi không cần). Hộp thoại lồng trong hộp thoại khác (vd sửa
 * ĐVT mở từ phiếu) không tạo ô riêng — đi theo hộp thoại cha. Mở lại một hộp thoại thì hộp thoại khác cùng thẻ tự thu nhỏ.
 */
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useInRouterContext, useLocation, useNavigate } from 'react-router-dom';
import { Minus, X, XCircle } from 'lucide-react';

interface Win { id: string; key?: string; label: string; tab: string; minimized: boolean; dirty: boolean; order: number; minimize: () => void; restore: () => void; close: () => void }

let wins: Win[] = [];
let order = 0;
const subs = new Set<() => void>();
const emit = () => { wins = [...wins]; subs.forEach((f) => f()); };
const subscribe = (f: () => void) => { subs.add(f); return () => subs.delete(f); };
const snapshot = () => wins;
const here = () => `${window.location.pathname}`;

// [2026-11-26 06:10 PM Nguyễn Văn Thủy] DOCK — GIỮ HỘP THOẠI QUA TẢI LẠI TRANG / MẤT ĐIỆN: hộp thoại có khai "giu" ghi bản nháp vào
// bộ nhớ máy (localStorage), mở lại trang thì màn chủ tự mở lại đúng phiếu, đúng nội dung đang nhập dở. Chỉ mất khi người dùng
// đóng hẳn (✕ / Thoát / Đóng tất cả) hoặc ghi xong đóng. Đóng THẺ chứa hộp thoại không mất: ô ở thanh dưới vẫn còn (mờ),
// bấm vào thì mở lại thẻ và phiếu (đóng góp)
export interface GiuHopThoai { key: string; kind: string; tab: string; label: string; dirty: boolean; minimized: boolean; draft: unknown; at: number }
const GIU_KEY = 'ketoan.hop-thoai.v1';
const giuSubs = new Set<() => void>();
let giuCache: GiuHopThoai[] | null = null;
function docGiu(): GiuHopThoai[] {
  if (giuCache) return giuCache;
  try { const v = JSON.parse(localStorage.getItem(GIU_KEY) ?? '[]') as GiuHopThoai[]; giuCache = Array.isArray(v) ? v.filter((x) => x && typeof x.key === 'string') : []; } catch { giuCache = []; }
  return giuCache;
}
function ghiGiu(list: GiuHopThoai[]) {
  giuCache = list;
  try { localStorage.setItem(GIU_KEY, JSON.stringify(list)); } catch { /* nuot-loi: đầy bộ nhớ / chế độ riêng tư: vẫn chạy, chỉ không giữ được */ }
  giuSubs.forEach((f) => f());
}
function datGiu(r: GiuHopThoai) { ghiGiu([...docGiu().filter((x) => x.key !== r.key), r]); }
/** Bỏ bản giữ (đóng hẳn hộp thoại). */
export function boGiu(key: string) { if (docGiu().some((x) => x.key === key)) ghiGiu(docGiu().filter((x) => x.key !== key)); }
/** Các hộp thoại đã giữ của một loại, thuộc một màn (đường dẫn) — màn chủ gọi lúc dựng để mở lại. */
export function layGiu(kind: string, pathname: string): GiuHopThoai[] { return docGiu().filter((x) => x.kind === kind && x.tab.split('?')[0] === pathname); }
/** Thẻ đang đóng (TabWorkspace báo trước khi gỡ): hộp thoại trong thẻ đó gỡ ra nhưng KHÔNG mất bản giữ. */
const dongThe = new Set<string>();
export function baoDongThe(pathnames: string[]) { pathnames.forEach((p) => dongThe.add(p)); setTimeout(() => pathnames.forEach((p) => dongThe.delete(p)), 1500); }
let dangRoiTrang = false;
/** Bản giữ đang chờ ghi (gõ chưa đủ 400ms): rời trang / ẩn trang thì ghi ngay, không mất chữ vừa gõ. */
const choGhi = new Map<string, () => void>();
const ghiNgay = () => { [...choGhi.values()].forEach((f) => f()); choGhi.clear(); };
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => { ghiNgay(); dangRoiTrang = true; });
  window.addEventListener('pagehide', () => { ghiNgay(); dangRoiTrang = true; });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') ghiNgay(); });
}
/** Màn chủ mở lại các hộp thoại đã giữ đúng một lần khi dựng. */
export function useMoLaiHopThoai(kind: string, pathname: string, mo: (list: GiuHopThoai[]) => void, san = true) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !san) return;
    done.current = true;
    const list = layGiu(kind, pathname).sort((a, b) => a.at - b.at);
    if (list.length) mo(list);
  }, [san]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Đặt bởi hộp thoại cha: hộp thoại con biết mình đang lồng nên không tạo ô riêng. */
const InWindow = createContext(false);
export function DockScope({ children }: { children: ReactNode }) { return <InWindow.Provider value>{children}</InWindow.Provider>; }

/**
 * Gắn vào một hộp thoại. headRef = phần tiêu đề (lấy chữ làm tên ô). Trả về minimized (ẩn hộp thoại bằng CSS, KHÔNG gỡ),
 * minimize (cho nút "—"), top (hộp thoại cấp ngoài cùng — chỉ nó có nút thu nhỏ).
 */
export function useDockWindow(onClose: () => void, dirty = false, key?: string, giu?: { kind: string; draft: () => unknown }) {
  const nested = useContext(InWindow);
  const routed = useInRouterContext();
  return useDockInner(onClose, dirty, !nested && routed, key, giu);
}

/** Mở lại hộp thoại theo khoá (vd `mh:<id phiếu>`) — bấm mở một phiếu đang mở (đã thu nhỏ) thì đưa nó lên, không mở trùng. */
export function restoreDock(key: string) { wins.find((w) => w.key === key)?.restore(); }

/** Chữ của tiêu đề, các phần cách nhau một dấu cách (nhãn "Nháp", "Nhập ngoài đơn" không dính vào nhau); bỏ chữ của nút. */
function textOf(el: Node): string {
  if (el.nodeType === Node.TEXT_NODE) return el.textContent ?? '';
  if (el instanceof HTMLElement && (el.tagName === 'BUTTON' || el.tagName === 'SELECT' || el.classList.contains('modal-viewing') || el.classList.contains('ct-total'))) return '';
  return [...el.childNodes].map(textOf).join(' ');
}

function useDockInner(onClose: () => void, dirty: boolean, top: boolean, key?: string, giu?: { kind: string; draft: () => unknown }) {
  const id = useId();
  const [minimized, setMin] = useState(() => Boolean(key && giu && docGiu().find((x) => x.key === key)?.minimized));
  const giuRef = useRef(giu);
  giuRef.current = giu;
  const headRef = useRef<HTMLElement | null>(null);
  const loc = useLocationSafe(top);
  const nav = useNavigateSafe(top);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const tab = loc ? `${loc.pathname}${loc.search}` : here();
  const restore = useCallback(() => {
    // Hộp thoại khác đang mở cùng thẻ: thu nhỏ để không chồng lên nhau.
    for (const w of wins) if (w.id !== id && !w.minimized && w.tab.split('?')[0] === tab.split('?')[0]) w.minimize();
    // [2026-11-25 Nguyễn Văn Thủy] mở lại = chuyển thẻ (state.tab), không chạy lại liên kết của thẻ (?moi=… mở phiếu mới đè phiếu đang dở) (đóng góp)
    if (nav && here() !== tab.split('?')[0]) nav(tab, { state: { tab: true } });
    setMin(false);
  }, [id, nav, tab]);
  useEffect(() => {
    if (!top) return;
    // Hộp thoại mới mở: hộp thoại khác đang mở cùng thẻ tự thu nhỏ (không chồng lên nhau).
    for (const w of wins) if (!w.minimized && w.tab.split('?')[0] === tab.split('?')[0]) w.minimize();
    wins.push({ id, key, label: '', tab, minimized: false, dirty, order: ++order, minimize: () => setMin(true), restore, close: () => closeRef.current() });
    emit();
    return () => {
      wins = wins.filter((w) => w.id !== id); emit();
      // Gỡ vì đóng hẳn → bỏ bản giữ; gỡ vì đóng thẻ / rời trang → giữ lại để mở lại sau.
      if (key && giuRef.current && !dangRoiTrang && !dongThe.has(tab.split('?')[0]!)) boGiu(key);
    };
  }, [top, id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Ghi bản giữ (gom 400ms một lần cho đỡ nặng khi gõ).
  useEffect(() => {
    if (!top || !key || !giu) return;
    const ghi = () => {
      choGhi.delete(id);
      const w = wins.find((x) => x.id === id);
      try { datGiu({ key, kind: giu.kind, tab, label: w?.label || 'Hộp thoại', dirty, minimized, draft: giu.draft(), at: docGiu().find((x) => x.key === key)?.at ?? Date.now() }); } catch { /* nuot-loi: bản nháp không ghi được (dữ liệu vòng) — hộp thoại vẫn chạy */ }
    };
    choGhi.set(id, ghi);
    const t = setTimeout(ghi, 400);
    return () => { clearTimeout(t); choGhi.delete(id); };
  });
  // Cập nhật tên, trạng thái mỗi lần vẽ (chỉ báo khi có đổi).
  useEffect(() => {
    if (!top) return;
    const w = wins.find((x) => x.id === id);
    if (!w) return;
    const label = (headRef.current ? textOf(headRef.current) : '').replace(/\s+/g, ' ').trim().slice(0, 70) || 'Hộp thoại';
    if (w.label !== label || w.minimized !== minimized || w.dirty !== dirty || w.tab !== tab || w.restore !== restore) {
      Object.assign(w, { label, minimized, dirty, tab, restore });
      emit();
    }
  });
  return { minimized: top && minimized, minimize: () => setMin(true), headRef, top };
}
function useLocationSafe(on: boolean) { try { return on ? useLocation() : null; } catch { return null; } } // eslint-disable-line react-hooks/rules-of-hooks
function useNavigateSafe(on: boolean) { try { return on ? useNavigate() : null; } catch { return null; } } // eslint-disable-line react-hooks/rules-of-hooks

/** Nút "—" đặt cạnh nút ✕ ở tiêu đề hộp thoại. */
export function MinimizeButton({ onClick }: { onClick: () => void }) {
  return <button type="button" className="win-min" data-view-ok onClick={onClick} aria-label="Thu nhỏ" title="Thu nhỏ xuống thanh dưới — giữ nguyên dữ liệu đang nhập, bấm ô ở thanh dưới để mở lại"><Minus size={15} /></button>;
}

/** Thanh dưới đáy — đặt một lần ở khung trang. */
const subGiu = (f: () => void) => { giuSubs.add(f); return () => giuSubs.delete(f); };
export function WindowDock() {
  const list = useSyncExternalStore(subscribe, snapshot);
  const giu = useSyncExternalStore(subGiu, docGiu);
  const nav = useNavigateSafe(true);
  // Hộp thoại đã giữ mà chưa dựng (thẻ chứa nó đã đóng / màn chưa mở lại): ô mờ — bấm để mở lại thẻ, màn tự mở lại phiếu.
  const ghosts = giu.filter((r) => !list.some((w) => w.key === r.key));
  const [, force] = useState(0);
  const [menu, setMenu] = useState<{ x: number; y: number; id?: string } | null>(null);
  useEffect(() => {
    if (!menu) return;
    const off = () => setMenu(null);
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    window.addEventListener('click', off); window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('click', off); window.removeEventListener('keydown', esc); };
  }, [menu]);
  // Đổi thẻ (đường dẫn) → vẽ lại để tô đúng ô thuộc thẻ đang xem.
  useEffect(() => { const f = () => force((n) => n + 1); window.addEventListener('popstate', f); const t = setInterval(f, 800); return () => { window.removeEventListener('popstate', f); clearInterval(t); }; }, []);
  useEffect(() => { document.body.classList.toggle('has-dock', list.length + ghosts.length > 0); return () => document.body.classList.remove('has-dock'); }, [list.length, ghosts.length]);
  if (!list.length && !ghosts.length) return null;
  const cur = here();
  /** Đóng nhiều hộp thoại một lượt; có phiếu chưa lưu thì hỏi lại một lần. */
  const closeMany = (ws: Win[], gs: GiuHopThoai[] = []) => {
    const dirty = [...ws.filter((w) => w.dirty), ...gs.filter((g) => g.dirty)];
    if (dirty.length && !window.confirm(`${dirty.length} hộp thoại có thay đổi CHƯA LƯU:\n${dirty.map((w) => `• ${w.label}`).join('\n')}\n\nĐóng sẽ mất các thay đổi đó. Vẫn đóng ${ws.length + gs.length} hộp thoại?`)) return;
    ws.forEach((w) => w.close());
    gs.forEach((g) => boGiu(g.key));
    setMenu(null);
  };
  const moGhost = (g: GiuHopThoai) => nav?.(g.tab, { state: { tab: true } });
  const ctx = (e: React.MouseEvent, id?: string) => { e.preventDefault(); setMenu({ x: Math.min(e.clientX, window.innerWidth - 230), y: e.clientY, id }); };
  const target = menu?.id ? list.find((w) => w.id === menu.id) : undefined;
  return (
    <nav className="win-dock" aria-label="Hộp thoại đang mở" onContextMenu={(e) => ctx(e)}>
      {[...list].sort((a, b) => a.order - b.order).map((w) => {
        const active = !w.minimized && w.tab.split('?')[0] === cur;
        return (
          <span key={w.id} className={`win-chip${active ? ' on' : ''}${w.minimized ? ' min' : ''}`} title={`${w.label}${w.dirty ? ' — chưa lưu' : ''}\n${active ? 'Bấm để thu nhỏ' : 'Bấm để mở lại'}${w.tab.split('?')[0] !== cur ? ' (ở thẻ khác)' : ''}`}
            onClick={() => (active ? w.minimize() : w.restore())} onContextMenu={(e) => { e.stopPropagation(); ctx(e, w.id); }} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') (active ? w.minimize() : w.restore()); }}>
            {w.dirty && <i className="win-dirty" aria-label="chưa lưu" />}
            <span className="win-label">{w.label}</span>
            <button type="button" className="win-close" title="Đóng hộp thoại này" onClick={(e) => { e.stopPropagation(); w.close(); }}><X size={12} /></button>
          </span>
        );
      })}
      {ghosts.map((g) => (
        <span key={`g-${g.key}`} className="win-chip min win-ghost" role="button" tabIndex={0}
          title={`${g.label}${g.dirty ? ' — chưa lưu' : ''}
Đã giữ lại (thẻ chứa phiếu đã đóng / vừa tải lại trang) — bấm để mở lại`}
          onClick={() => moGhost(g)} onKeyDown={(e) => { if (e.key === 'Enter') moGhost(g); }}>
          {g.dirty && <i className="win-dirty" aria-label="chưa lưu" />}
          <span className="win-label">{g.label}</span>
          <button type="button" className="win-close" title="Bỏ hẳn hộp thoại này" onClick={(e) => { e.stopPropagation(); closeMany([], [g]); }}><X size={12} /></button>
        </span>
      ))}
      <button type="button" className="win-chip win-closeall" title="Đóng tất cả hộp thoại (có phiếu chưa lưu thì hỏi lại). Chuột phải vào ô để có thêm lựa chọn" onClick={() => closeMany(list, ghosts)}>
        <XCircle size={14} /> Đóng tất cả
      </button>
      {menu && (
        <div className="ctx-menu win-ctx" style={{ left: menu.x, bottom: 'calc(var(--dock-h) + 4px)' }} onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
          {target && <>
            <div className="ctx-h">{target.label}{target.dirty ? ' · chưa lưu' : ''}</div>
            <button type="button" onClick={() => { (!target.minimized && target.tab.split('?')[0] === cur ? target.minimize() : target.restore()); setMenu(null); }}>{!target.minimized && target.tab.split('?')[0] === cur ? 'Thu nhỏ' : 'Mở lại'}</button>
            <button type="button" className="danger" onClick={() => closeMany([target])}>Đóng ô này</button>
            {list.length > 1 && <button type="button" className="danger" onClick={() => closeMany(list.filter((w) => w.id !== target.id))}>Đóng các ô khác ({list.length - 1})</button>}
            <hr />
          </>}
          <button type="button" onClick={() => { list.forEach((w) => !w.minimized && w.minimize()); setMenu(null); }}>Thu nhỏ tất cả</button>
          <button type="button" className="danger" onClick={() => closeMany(list, ghosts)}>Đóng tất cả ({list.length})</button>
        </div>
      )}
    </nav>
  );
}
