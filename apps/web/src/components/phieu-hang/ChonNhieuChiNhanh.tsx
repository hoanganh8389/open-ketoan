// [2026-11-25 Nguyễn Văn Thủy] Chọn NHIỀU chi nhánh nhận của đơn đặt: chi nhánh lập chứng từ + mọi chi nhánh con (đệ quy), tích theo cây (đóng góp)
/**
 * CHỌN NHIỀU CHI NHÁNH NHẬN — danh sách là chi nhánh `goc` và cả cây con của nó, thụt theo cấp. Chi nhánh đầu tiên là nơi nhận
 * chính (dòng hàng mới mặc định nhận ở đây). Chi nhánh đang có dòng hàng (khoa) tích sẵn, không bỏ được ở đây (đổi ở cột của dòng).
 * Ô đã chọn chỉ hiện mã; tên ở chú thích rê chuột và trong danh sách.
 */
import { useEffect, useRef, useState } from 'react';
import { useCayDonVi } from '@/lib/cayDonVi';

const boDau = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

export function ChonNhieuChiNhanh({ goc, value, khoa = [], onChange, disabled, placeholder = 'Chọn chi nhánh nhận' }: {
  goc: string; value: string[]; khoa?: string[]; onChange: (codes: string[]) => void; disabled?: boolean; placeholder?: string;
}) {
  const cay = useCayDonVi();
  const [mo, setMo] = useState<{ top: number; left: number; width: number } | null>(null);
  const [q, setQ] = useState('');
  const nut = useRef<HTMLButtonElement>(null);
  const hop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mo) return;
    const dong = (e: MouseEvent) => { const t = e.target as Node; if (!hop.current?.contains(t) && !nut.current?.contains(t)) setMo(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setMo(null); } };
    document.addEventListener('mousedown', dong); document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('mousedown', dong); document.removeEventListener('keydown', esc, true); };
  }, [mo]);
  const chon = [...new Set([...value, ...khoa])];
  const d0 = cay.index.get(goc)?.depth ?? 0;
  const ds = [goc, ...cay.conCua(goc)].map((b) => ({ b, ten: cay.index.get(b)?.name ?? b, cap: cay.index.get(b)?.levelLabel ?? '', sau: Math.max(0, (cay.index.get(b)?.depth ?? d0) - d0), active: cay.index.get(b)?.isActive ?? true }))
    .filter((x) => x.active || chon.includes(x.b));
  const k = boDau(q.trim());
  const loc = k ? ds.filter((x) => boDau(`${x.b} ${x.ten}`).includes(k)) : ds;
  const doi = (c: string) => onChange(value.includes(c) ? value.filter((x) => x !== c) : [...value, c]);
  return (
    <>
      <button ref={nut} type="button" className="input select" disabled={disabled} style={{ textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}
        title={chon.length ? chon.map((c, i) => `${i === 0 ? '★ ' : ''}${c} · ${cay.index.get(c)?.name ?? ''}${khoa.includes(c) && !value.includes(c) ? ' (đang có dòng hàng)' : ''}`).join('\n') : 'Tích một hoặc nhiều chi nhánh nhận hàng (chi nhánh lập chứng từ và các chi nhánh con)'}
        onClick={() => { if (mo) { setMo(null); return; } const r = nut.current!.getBoundingClientRect(); setMo({ top: r.bottom + 2, left: r.left, width: Math.max(r.width, 300) }); setQ(''); }}>
        {chon.length ? <span className="mono">{chon.join(', ')}</span> : <span className="muted">{placeholder}</span>}
      </button>
      {mo && (
        <div ref={hop} className="mh-col-pop" style={{ position: 'fixed', top: mo.top, left: mo.left, width: mo.width, maxHeight: 340, overflow: 'auto', zIndex: 80, background: 'var(--surface, #fff)', border: '1px solid var(--line)', borderRadius: 6, boxShadow: '0 6px 24px rgba(15,34,61,.18)', padding: 6 }}>
          <input className="input" autoFocus placeholder="Tìm chi nhánh…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: '100%', marginBottom: 4 }} />
          {!loc.length && <div className="muted" style={{ padding: 6, fontSize: 12 }}>Không có chi nhánh khớp</div>}
          {loc.map((x) => {
            const coDong = khoa.includes(x.b) && !value.includes(x.b);
            return (
              <label key={x.b} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '2px 4px', marginLeft: x.sau * 14, cursor: coDong ? 'default' : 'pointer', fontSize: 12.5 }}
                title={coDong ? 'Chi nhánh đang có dòng hàng — đổi ở cột Chi nhánh nhận của dòng' : `${x.b} · ${x.ten}${x.cap ? ` (${x.cap})` : ''}`}>
                <input type="checkbox" checked={chon.includes(x.b)} disabled={coDong} onChange={() => doi(x.b)} />
                <span className="mono">{x.b}</span><span className="muted">{x.ten}</span>
                {coDong && <span className="muted" style={{ fontSize: 10.5 }}>có dòng</span>}
                {chon[0] === x.b && <span className="badge badge-info" style={{ fontSize: 10, marginLeft: 'auto' }}>chính</span>}
              </label>
            );
          })}
          <div style={{ borderTop: '1px solid var(--line)', marginTop: 4, paddingTop: 4, display: 'flex', gap: 6 }}>
            <button type="button" className="btn btn-xs btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setMo(null)}>Xong</button>
          </div>
        </div>
      )}
    </>
  );
}
