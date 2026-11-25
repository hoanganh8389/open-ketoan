// [2026-11-25 Nguyễn Văn Thủy] Chọn NHIỀU chi nhánh nhận của đơn đặt: chi nhánh lập chứng từ + mọi chi nhánh con (đệ quy), tích theo cây (đóng góp)
// [2026-11-25 Nguyễn Văn Thủy] hiện dạng cây thu gọn / mở (như bộ chọn chi nhánh của báo cáo), bỏ chọn được hết, + thêm chi nhánh (đóng góp)
/**
 * CHỌN NHIỀU CHI NHÁNH NHẬN — cây gồm chi nhánh `goc` và cả cây con của nó; bấm ▸ / ▾ để mở / thu gọn nhánh. Chi nhánh tích đầu
 * tiên là nơi nhận chính (dòng hàng mới mặc định nhận ở đây). Bỏ tích chi nhánh đang có dòng hàng → dòng về nơi nhận chính; bỏ hết
 * → đơn nhận tại chi nhánh lập chứng từ. Ô đã chọn chỉ hiện mã; tên ở chú thích rê chuột và trong cây.
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Building2, ChevronDown, ChevronRight, MapPin, Store } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useCayDonVi } from '@/lib/cayDonVi';

const BranchForm = lazy(() => import('@/features/catalog/BranchesPage').then((m) => ({ default: m.BranchForm })));
const boDau = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
export const POP_STYLE = { position: 'fixed', maxHeight: 380, overflow: 'auto', zIndex: 80, background: 'var(--surface, #fff)', border: '1px solid var(--line)', borderRadius: 6, boxShadow: '0 6px 24px rgba(15,34,61,.18)', padding: 6 } as const;

/** Mở / đóng hộp thả xuống dưới một nút, đóng khi bấm ra ngoài hoặc Esc. */
export function useHopTha(rong: number) {
  const [mo, setMo] = useState<{ top: number; left: number; width: number } | null>(null);
  const nut = useRef<HTMLButtonElement>(null);
  const hop = useRef<HTMLDivElement>(null);
  const giu = useRef(false);
  useEffect(() => {
    if (!mo) return;
    const dong = (e: MouseEvent) => { const t = e.target as Node; if (!giu.current && !hop.current?.contains(t) && !nut.current?.contains(t)) setMo(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !giu.current) { e.stopPropagation(); setMo(null); } };
    document.addEventListener('mousedown', dong); document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('mousedown', dong); document.removeEventListener('keydown', esc, true); };
  }, [mo]);
  const bat = () => { if (mo) { setMo(null); return false; } const r = nut.current!.getBoundingClientRect(); setMo({ top: r.bottom + 2, left: Math.min(r.left, window.innerWidth - rong - 8), width: Math.max(r.width, rong) }); return true; };
  return { mo, setMo, nut, hop, bat, giu };
}

export function ChonNhieuChiNhanh({ goc, value, onChange, disabled, placeholder = 'Chọn chi nhánh nhận' }: {
  goc: string; value: string[]; /** (giữ cho tương thích, không dùng) */ khoa?: string[]; onChange: (codes: string[]) => void; disabled?: boolean; placeholder?: string;
}) {
  const cay = useCayDonVi();
  const { can } = useAuth();
  const { mo, setMo, nut, hop, bat, giu } = useHopTha(380);
  const [q, setQ] = useState('');
  const [dong, setDong] = useState<Set<string>>(new Set());
  const [them, setThem] = useState(false);
  const d0 = cay.index.get(goc)?.depth ?? 0;
  const ds = useMemo(() => [goc, ...cay.conCua(goc)].map((b) => { const u = cay.index.get(b); return { b, ten: u?.name ?? b, cap: u?.levelLabel ?? '', sau: Math.max(0, (u?.depth ?? d0) - d0), cha: u?.parentCode ?? null, con: Boolean(u?.hasKids), active: u?.isActive ?? true }; })
    .filter((x) => x.active || value.includes(x.b))
    // Chi nhánh đang tích nhưng ngoài cây của chi nhánh lập (phiếu cũ / đổi chi nhánh lập): hiện cuối, chữ đỏ để bỏ.
    .concat(value.filter((b) => b !== goc && !cay.conCua(goc).includes(b)).map((b) => ({ b, ten: cay.index.get(b)?.name ?? b, cap: 'ngoài chi nhánh lập', sau: 0, cha: null, con: false, active: true, ngoai: true }))), [goc, cay, d0, value]);
  const coTrong = useMemo(() => new Set(ds.map((x) => x.b)), [ds]);
  const chaCua = (b: string) => { const out: string[] = []; for (let c = cay.index.get(b)?.parentCode ?? null, n = 0; c && coTrong.has(c) && n < 30; c = cay.index.get(c)?.parentCode ?? null, n++) out.push(c); return out; };
  // Mở hộp: thu gọn từ cấp 2 trở xuống, trừ đường tới chi nhánh đang tích.
  const moHop = () => {
    if (!bat()) return;
    setQ('');
    const mo1 = new Set(value.flatMap(chaCua));
    setDong(new Set(ds.filter((x) => x.con && x.sau >= 1 && !mo1.has(x.b)).map((x) => x.b)));
  };
  const k = boDau(q.trim());
  const khop = k ? new Set(ds.filter((x) => boDau(`${x.b} ${x.ten}`).includes(k)).flatMap((x) => [x.b, ...chaCua(x.b)])) : null;
  const hien = ds.filter((x) => (khop ? khop.has(x.b) : !chaCua(x.b).some((c) => dong.has(c))));
  const doi = (c: string) => onChange(value.includes(c) ? value.filter((x) => x !== c) : [...value, c]);
  const togg = (b: string) => setDong((s) => { const n = new Set(s); if (n.has(b)) n.delete(b); else n.add(b); return n; });
  return (
    <>
      <button ref={nut} type="button" className="input select" disabled={disabled} style={{ textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}
        title={value.length ? value.map((c, i) => `${i === 0 ? '★ ' : ''}${c} · ${cay.index.get(c)?.name ?? ''}`).join('\n') : `Chưa tích — đơn nhận tại chi nhánh lập chứng từ ${goc}. Tích một hoặc nhiều chi nhánh nhận (chi nhánh lập và các chi nhánh con)`}
        onClick={moHop}>
        {value.length ? <span className="mono">{value.join(', ')}</span> : <span className="muted">{placeholder}</span>}
      </button>
      {mo && (
        <div ref={hop} className="mh-col-pop" style={{ ...POP_STYLE, top: mo.top, left: mo.left, width: mo.width }}>
          <input className="input" autoFocus placeholder="Tìm chi nhánh…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: '100%', marginBottom: 4 }} />
          {!hien.length && <div className="muted" style={{ padding: 6, fontSize: 12 }}>Không có chi nhánh khớp</div>}
          {hien.map((x) => {
            const Ic = x.sau === 0 && x.con ? Building2 : x.con ? MapPin : Store;
            const o = khop ? true : !dong.has(x.b);
            return (
              <div key={x.b} className={'ngoai' in x ? 'mh-bad' : undefined} style={{ display: 'flex', gap: 5, alignItems: 'center', padding: '2px 4px', paddingLeft: 4 + x.sau * 16, fontSize: 12.5, whiteSpace: 'nowrap' }} title={`${x.b} · ${x.ten}${x.cap ? ` (${x.cap})` : ''}`}>
                <button type="button" className="btn-ghost" style={{ width: 16, border: 0, background: 'none', padding: 0, cursor: x.con ? 'pointer' : 'default', color: 'var(--muted)' }} disabled={!x.con || Boolean(khop)} onClick={() => togg(x.b)} tabIndex={-1}>
                  {x.con ? (o ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : null}
                </button>
                <label style={{ display: 'flex', gap: 5, alignItems: 'center', cursor: 'pointer', minWidth: 0, flex: 1 }}>
                  <input type="checkbox" checked={value.includes(x.b)} onChange={() => doi(x.b)} />
                  <Ic size={13} style={{ color: 'var(--muted)', flex: 'none' }} />
                  <span className="mono">{x.b}</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: x.con ? 600 : undefined }}>{x.ten}</span>
                </label>
                {value[0] === x.b && <span className="badge badge-info" style={{ fontSize: 10 }}>chính</span>}
              </div>
            );
          })}
          <div style={{ borderTop: '1px solid var(--line)', marginTop: 4, paddingTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-xs" disabled={!value.length} title="Bỏ hết — đơn nhận tại chi nhánh lập chứng từ" onClick={() => onChange([])}>Bỏ chọn hết</button>
            {can('catalog:write') && <button type="button" className="btn btn-xs" title="Thêm chi nhánh mới (Cơ cấu tổ chức)" onClick={() => { giu.current = true; setThem(true); }}>+ Thêm chi nhánh</button>}
            <button type="button" className="btn btn-xs btn-ghost" onClick={() => setDong(new Set())}>Mở hết</button>
            <button type="button" className="btn btn-xs btn-ghost" onClick={() => setDong(new Set(ds.filter((x) => x.con && x.sau >= 1).map((x) => x.b)))}>Thu gọn</button>
            <button type="button" className="btn btn-xs btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setMo(null)}>Xong</button>
          </div>
        </div>
      )}
      {them && (
        <Suspense fallback={null}>
          <BranchForm value={{ isNew: true, isActive: true }} onSaved={(c) => { if (c && !value.includes(c)) onChange([...value, c]); }} onClose={() => { setThem(false); giu.current = false; }} />
        </Suspense>
      )}
    </>
  );
}
