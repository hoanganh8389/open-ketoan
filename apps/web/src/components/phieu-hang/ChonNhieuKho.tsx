// [2026-11-21 Nguyễn Văn Thủy] Chọn NHIỀU phân kho (đơn đặt giao nhiều nơi): ô tích theo cây chi nhánh, có tìm kiếm (đóng góp)
/**
 * CHỌN NHIỀU KHO — danh sách kho của chi nhánh và mọi chi nhánh con (đệ quy), xếp theo cây, tích nhiều kho. Kho đầu tiên trong danh
 * sách là kho giao chính. Kho đang dùng ở dòng hàng (khoa) hiện tích sẵn, không bỏ được ở đây (đổi ở cột Phân kho của dòng).
 */
import { useEffect, useRef, useState } from 'react';
import { useCayDonVi } from '@/lib/cayDonVi';

const boDau = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

// [2026-11-25 Nguyễn Văn Thủy] `branchCodes`: chỉ kho của các chi nhánh nhận đã chọn (và chi nhánh con đệ quy); ô đã chọn hiện mã kho (đóng góp)
export function ChonNhieuKho({ branchCode, branchCodes, value, khoa = [], onChange, disabled, placeholder = 'Chọn kho giao' }: {
  branchCode: string; branchCodes?: string[]; value: string[]; khoa?: string[]; onChange: (codes: string[]) => void; disabled?: boolean; placeholder?: string;
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
  const d0 = Math.min(...(branchCodes?.length ? branchCodes : [branchCode]).map((b) => cay.index.get(b)?.depth ?? 0));
  // Chi nhánh + con (đệ quy) theo cây; thêm chi nhánh sở hữu kho đang chọn / đang dùng ở dòng mà nằm ngoài nhánh này (dòng chọn chi nhánh nhận khác).
  const goc = branchCodes?.length ? branchCodes : [branchCode];
  const trongCay = [...new Set(goc.flatMap((b) => [b, ...cay.conCua(b)]))];
  const ngoai = [...new Set(chon.map((c) => cay.khoChu(c)).filter((b) => b && !trongCay.includes(b)))];
  const nhom = [...trongCay, ...ngoai].map((b) => ({
    b, ten: cay.index.get(b)?.name ?? b, sau: ngoai.includes(b) ? 0 : Math.max(0, (cay.index.get(b)?.depth ?? d0) - d0), ngoaiPham: ngoai.includes(b),
    kho: cay.whOf(b).filter((w) => w.isActive || chon.includes(w.code)),
  })).filter((g) => g.kho.length);
  const k = boDau(q.trim());
  const loc = nhom.map((g) => ({ ...g, kho: k ? g.kho.filter((w) => boDau(`${w.code} ${w.name} ${g.ten}`).includes(k)) : g.kho })).filter((g) => g.kho.length);
  const doi = (c: string) => onChange(value.includes(c) ? value.filter((x) => x !== c) : [...value, c]);
  const nhan = chon.length ? <span className="mono">{chon.join(', ')}</span> : '';
  return (
    <>
      <button ref={nut} type="button" className="input select" disabled={disabled} style={{ textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}
        title={chon.length ? chon.map((c, i) => `${i === 0 ? '★ ' : ''}${c} · ${cay.khoTen(c)}${khoa.includes(c) && !value.includes(c) ? ' (theo dòng hàng)' : ''}`).join('\n') : 'Tích một hoặc nhiều phân kho NCC giao tới'}
        onClick={() => { if (mo) { setMo(null); return; } const r = nut.current!.getBoundingClientRect(); setMo({ top: r.bottom + 2, left: r.left, width: Math.max(r.width, 300) }); setQ(''); }}>
        {nhan || <span className="muted">{placeholder}</span>}{chon.length > 1 ? <span className="badge badge-info" style={{ marginLeft: 4 }}>{chon.length} kho</span> : null}
      </button>
      {mo && (
        <div ref={hop} className="mh-col-pop" style={{ position: 'fixed', top: mo.top, left: mo.left, width: mo.width, maxHeight: 340, overflow: 'auto', zIndex: 80, background: 'var(--surface, #fff)', border: '1px solid var(--line)', borderRadius: 6, boxShadow: '0 6px 24px rgba(15,34,61,.18)', padding: 6 }}>
          <input className="input" autoFocus placeholder="Tìm kho / chi nhánh…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: '100%', marginBottom: 4 }} />
          {!loc.length && <div className="muted" style={{ padding: 6, fontSize: 12 }}>{nhom.length ? 'Không có kho khớp' : 'Chi nhánh chưa có phân kho'}</div>}
          {loc.map((g) => (
            <div key={g.b} style={{ marginLeft: g.sau * 12 }}>
              <div className={g.ngoaiPham ? 'mh-bad' : 'muted'} style={{ fontSize: 11, fontWeight: 600, padding: '4px 2px 1px' }} title={g.ngoaiPham ? 'Chi nhánh này không thuộc chi nhánh nhận đã chọn — bỏ tích kho hoặc thêm chi nhánh nhận' : undefined}>{g.b} · {g.ten}{g.ngoaiPham ? ' — ngoài chi nhánh nhận' : ''}</div>
              {g.kho.map((w) => {
                const theoDong = khoa.includes(w.code) && !value.includes(w.code);
                return (
                  <label key={w.code} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '2px 4px', cursor: theoDong ? 'default' : 'pointer', fontSize: 12.5 }} title={theoDong ? 'Kho đang dùng ở dòng hàng — đổi ở cột Phân kho của dòng' : `${w.code} · ${w.name}`}>
                    <input type="checkbox" checked={chon.includes(w.code)} disabled={theoDong} onChange={() => doi(w.code)} />
                    <span className="mono">{w.code}</span><span className="muted">{w.name}</span>
                    {w.isDefault && <span className="badge badge-gray" style={{ fontSize: 10 }}>mặc định</span>}
                    {theoDong && <span className="muted" style={{ fontSize: 10.5 }}>theo dòng</span>}
                    {chon[0] === w.code && <span className="badge badge-info" style={{ fontSize: 10, marginLeft: 'auto' }}>chính</span>}
                  </label>
                );
              })}
            </div>
          ))}
          {value.length > 0 && <div style={{ borderTop: '1px solid var(--line)', marginTop: 4, paddingTop: 4, display: 'flex', gap: 6 }}>
            <button type="button" className="btn btn-xs" onClick={() => onChange([])}>Bỏ chọn hết</button>
            <button type="button" className="btn btn-xs btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setMo(null)}>Xong</button>
          </div>}
        </div>
      )}
    </>
  );
}
