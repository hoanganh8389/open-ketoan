// [2026-11-21 Nguyễn Văn Thủy] Chọn NHIỀU phân kho (đơn đặt giao nhiều nơi): ô tích theo cây chi nhánh, có tìm kiếm (đóng góp)
// [2026-11-25 Nguyễn Văn Thủy] dạng cây thu gọn / mở (chi nhánh ▸ kho), tích chi nhánh = tích mọi kho của nó, bỏ chọn được hết, + thêm kho (đóng góp)
/**
 * CHỌN NHIỀU KHO — cây chi nhánh (chi nhánh nhận + mọi chi nhánh con, đệ quy) với kho ở dưới từng chi nhánh. Kho tích đầu tiên là kho
 * giao chính. Mọi kho (kể cả kho đang dùng ở dòng hàng) bỏ tích được; "Bỏ chọn hết" xoá sạch.
 */
import { useMemo, useState } from 'react';
import { ThemKhoNhanh } from './ThemDanhMucNhanh';
import { ChevronDown, ChevronRight, MapPin, Store, Warehouse } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useCayDonVi } from '@/lib/cayDonVi';
import { POP_STYLE, useHopTha } from './ChonNhieuChiNhanh';

const boDau = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

// [2026-11-25 Nguyễn Văn Thủy] `branchCodes`: chỉ kho của các chi nhánh nhận đã chọn (và chi nhánh con đệ quy); ô đã chọn hiện mã kho (đóng góp)
export function ChonNhieuKho({ branchCode, branchCodes, value, onChange, disabled, placeholder = 'Chọn kho giao' }: {
  branchCode: string; branchCodes?: string[]; value: string[]; /** (giữ cho tương thích, không dùng) */ khoa?: string[]; onChange: (codes: string[]) => void; disabled?: boolean; placeholder?: string;
}) {
  const cay = useCayDonVi();
  const { can } = useAuth();
  const { mo, setMo, nut, hop, bat, giu } = useHopTha(420);
  const [q, setQ] = useState('');
  const [moNhanh, setMoNhanh] = useState<Set<string>>(new Set());
  const [them, setThem] = useState(false);
  const goc = branchCodes?.length ? branchCodes : [branchCode];
  const d0 = Math.min(...goc.map((b) => cay.index.get(b)?.depth ?? 0));
  // Chi nhánh trong phạm vi (theo cây) + chi nhánh sở hữu kho đang tích mà nằm ngoài phạm vi (báo đỏ để bỏ).
  const trongCay = useMemo(() => [...new Set(goc.flatMap((b) => [b, ...cay.conCua(b)]))], [goc.join(','), cay]); // eslint-disable-line react-hooks/exhaustive-deps
  const ngoai = [...new Set(value.map((c) => cay.khoChu(c)).filter((b) => b && !trongCay.includes(b)))];
  const nhom = useMemo(() => [...trongCay, ...ngoai].map((b) => {
    const u = cay.index.get(b);
    return { b, ten: u?.name ?? b, sau: ngoai.includes(b) ? 0 : Math.max(0, (u?.depth ?? d0) - d0), ngoaiPham: ngoai.includes(b), cha: u?.parentCode ?? null, kho: cay.whOf(b).filter((w) => w.isActive || value.includes(w.code)) };
  }), [trongCay, ngoai.join(','), cay, d0, value]); // eslint-disable-line react-hooks/exhaustive-deps
  // Chi nhánh hiện trong cây: có kho ở chính nó hoặc ở chi nhánh con.
  const coKho = useMemo(() => { const s = new Set<string>(); for (const g of nhom) if (g.kho.length) for (let c: string | null = g.b, n = 0; c && n < 30; c = cay.index.get(c)?.parentCode ?? null, n++) s.add(c); return s; }, [nhom, cay]);
  const trongNhom = new Set(nhom.map((g) => g.b));
  const chaCua = (b: string) => { const out: string[] = []; for (let c = cay.index.get(b)?.parentCode ?? null, n = 0; c && trongNhom.has(c) && n < 30; c = cay.index.get(c)?.parentCode ?? null, n++) out.push(c); return out; };
  const moHop = () => {
    if (!bat()) return;
    setQ('');
    // Mở sẵn: chi nhánh gốc + đường tới kho đang tích.
    setMoNhanh(new Set([...goc, ...value.map((c) => cay.khoChu(c)).filter(Boolean).flatMap((b) => [b, ...chaCua(b)])]));
  };
  const k = boDau(q.trim());
  const khopKho = (g: (typeof nhom)[number]) => (k ? g.kho.filter((w) => boDau(`${w.code} ${w.name} ${g.b} ${g.ten}`).includes(k)) : g.kho);
  const khopNhanh = k ? new Set(nhom.filter((g) => khopKho(g).length).flatMap((g) => [g.b, ...chaCua(g.b)])) : null;
  const hien = nhom.filter((g) => coKho.has(g.b) && (khopNhanh ? khopNhanh.has(g.b) : !chaCua(g.b).some((c) => !moNhanh.has(c))));
  const doi = (c: string) => onChange(value.includes(c) ? value.filter((x) => x !== c) : [...value, c]);
  const togg = (b: string) => setMoNhanh((s) => { const n = new Set(s); if (n.has(b)) n.delete(b); else n.add(b); return n; });
  const tichNhanh = (ws: string[]) => { const het = ws.every((c) => value.includes(c)); onChange(het ? value.filter((c) => !ws.includes(c)) : [...value, ...ws.filter((c) => !value.includes(c))]); };
  return (
    <>
      <button ref={nut} type="button" className="input select" disabled={disabled} style={{ textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}
        title={value.length ? value.map((c, i) => `${i === 0 ? '★ ' : ''}${c} · ${cay.khoTen(c)}`).join('\n') : 'Tích một hoặc nhiều phân kho NCC giao tới'}
        onClick={moHop}>
        {value.length ? <span className="mono">{value.join(', ')}</span> : <span className="muted">{placeholder}</span>}{value.length > 1 ? <span className="badge badge-info" style={{ marginLeft: 4 }}>{value.length} kho</span> : null}
      </button>
      {mo && (
        <div ref={hop} className="mh-col-pop" style={{ ...POP_STYLE, top: mo.top, left: mo.left, width: mo.width }}>
          <input className="input" autoFocus placeholder="Tìm kho / chi nhánh…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: '100%', marginBottom: 4 }} />
          {!hien.length && <div className="muted" style={{ padding: 6, fontSize: 12 }}>{coKho.size ? 'Không có kho khớp' : 'Chi nhánh chưa có phân kho'}</div>}
          {hien.map((g) => {
            const coCon = nhom.some((x) => x.cha === g.b && coKho.has(x.b));
            const o = khopNhanh ? true : moNhanh.has(g.b);
            const ws = khopKho(g).map((w) => w.code);
            const n = ws.filter((c) => value.includes(c)).length;
            return (
              <div key={g.b}>
                <div style={{ display: 'flex', gap: 5, alignItems: 'center', padding: '2px 4px', paddingLeft: 4 + g.sau * 16, fontSize: 12.5, whiteSpace: 'nowrap' }} className={g.ngoaiPham ? 'mh-bad' : undefined}
                  title={g.ngoaiPham ? 'Chi nhánh này không thuộc chi nhánh nhận đã chọn — bỏ tích kho hoặc thêm chi nhánh nhận' : `${g.b} · ${g.ten}`}>
                  <button type="button" style={{ width: 16, border: 0, background: 'none', padding: 0, cursor: 'pointer', color: 'var(--muted)' }} disabled={Boolean(khopNhanh)} onClick={() => togg(g.b)} tabIndex={-1}>
                    {o ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  </button>
                  {ws.length > 0 ? <input type="checkbox" title="Tích / bỏ mọi kho của chi nhánh này" checked={n === ws.length} ref={(el) => { if (el) el.indeterminate = n > 0 && n < ws.length; }} onChange={() => tichNhanh(ws)} /> : <span style={{ width: 13 }} />}
                  {coCon ? <MapPin size={13} style={{ color: 'var(--muted)' }} /> : <Store size={13} style={{ color: 'var(--muted)' }} />}
                  <span className="mono">{g.b}</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>{g.ten}</span>
                  {!o && n > 0 && <span className="badge badge-info" style={{ fontSize: 10, marginLeft: 'auto' }}>{n} kho</span>}
                </div>
                {o && khopKho(g).map((w) => (
                  <label key={w.code} style={{ display: 'grid', gridTemplateColumns: '16px 14px 72px minmax(0, 1fr) auto', gap: 6, alignItems: 'center', padding: '2px 4px', paddingLeft: 4 + (g.sau + 1) * 16 + 21, cursor: 'pointer', fontSize: 12.5, whiteSpace: 'nowrap' }} title={`${w.code} · ${w.name}`}>
                    <input type="checkbox" style={{ margin: 0, width: 14, height: 14 }} checked={value.includes(w.code)} onChange={() => doi(w.code)} />
                    <Warehouse size={12} style={{ color: 'var(--muted)' }} />
                    <span className="mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.code}</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.name}</span>
                    <span className="muted" style={{ fontSize: 10.5 }}>{[value[0] === w.code ? 'chính' : '', w.isDefault ? 'mặc định' : ''].filter(Boolean).join(' · ')}</span>
                  </label>
                ))}
              </div>
            );
          })}
          <div style={{ borderTop: '1px solid var(--line)', marginTop: 4, paddingTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-xs" disabled={!value.length} onClick={() => onChange([])}>Bỏ chọn hết</button>
            {can('catalog:write') && <button type="button" className="btn btn-xs" title={`Thêm phân kho cho chi nhánh ${goc[0]}`} onClick={() => { giu.current = true; setThem(true); }}>+ Thêm kho</button>}
            <button type="button" className="btn btn-xs btn-ghost" onClick={() => setMoNhanh(new Set(nhom.map((g) => g.b)))}>Mở hết</button>
            <button type="button" className="btn btn-xs btn-ghost" onClick={() => setMoNhanh(new Set(goc))}>Thu gọn</button>
            <button type="button" className="btn btn-xs btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setMo(null)}>Xong</button>
          </div>
        </div>
      )}
      {them && <ThemKhoNhanh branchCode={goc[0]!} onSaved={(c) => { if (c && !value.includes(c)) onChange([...value, c]); }} onClose={() => { setThem(false); giu.current = false; }} />}
    </>
  );
}
