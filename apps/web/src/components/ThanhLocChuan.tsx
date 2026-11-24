// [2026-11-25 Nguyễn Văn Thủy] UX TOÀN HỆ THỐNG — thanh lọc chuẩn luôn hiện ngoài màn, cùng thứ tự ở mọi màn (đóng góp)
/**
 * Thanh lọc chuẩn đầu mọi màn có bảng tham số:
 *   [Chi nhánh ▾ (cây cơ cấu trước, danh sách sau)]  [Kỳ ▾ | từ ngày – đến ngày]  [Nhóm hàng ▾]  · các tham số khác ·  [Chọn tham số]
 *  - Giá trị lấy từ ô lọc tương ứng trong bảng tham số (đăng ký qua locChuan) — hai nơi là MỘT, đổi bên nào bên kia theo.
 *  - Ô màn không dùng: hiện "Tất cả", mờ, rê chuột báo màn không lọc theo tiêu chí này.
 *  - Đổi ở thanh ngoài áp ngay (không cần bấm Tìm kiếm).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CalendarDays, ChevronDown, FolderTree, Lock, Network } from 'lucide-react';
import { PERIOD_PRESETS, presetOf, rememberPeriod } from '@/lib/format';
import { useOrgTree } from '@/lib/orgUnits';
import { useBranches } from './filters';
import { CayDonVi } from './CayDonVi';
import { CayNhomHang, indexNhom, useNhomHang } from './CayNhomHang';
import type { LocChuan } from './locChuan';
import { useKhoLoc, WarehouseCheckList } from './ReportPanel';

/** Giá trị "không chi nhánh nào" (trùng BRANCH_NONE của bảng tham số). */
const CN_NONE = '-';

function useDong(open: boolean, setOpen: (v: boolean) => void) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open, setOpen]);
  return box;
}

/** Một ô của thanh: nhãn nhỏ + nút tóm tắt; mờ khi màn không dùng. */
function O({ icon, nhan, tomTat, khongDung, children, rong = 420 }: { icon: ReactNode; nhan: string; tomTat: string; khongDung?: boolean; children?: (dong: () => void) => ReactNode; rong?: number }) {
  const [open, setOpen] = useState(false);
  const box = useDong(open, setOpen);
  return (
    <div className={`tlc-o${khongDung ? ' tlc-tat' : ''}`} ref={box}>
      <button type="button" className="tlc-nut" disabled={khongDung} onClick={() => setOpen((x) => !x)} aria-expanded={open}
        title={khongDung ? `Màn này không lọc theo ${nhan.toLowerCase()} — luôn là tất cả` : `${nhan}: ${tomTat}`}>
        {icon}<span className="tlc-nhan">{nhan}</span><span className="tlc-gt">{khongDung ? 'Tất cả' : tomTat}</span><ChevronDown size={13} />
      </button>
      {open && children && <div className="tlc-tha" style={{ width: rong }}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

function OChiNhanh({ nguon }: { nguon?: LocChuan['cn'] }) {
  const { data: all = [] } = useBranches();
  const tree = useOrgTree();
  const [the, setThe] = useState<'cay' | 'ds' | 'kho'>('cay');
  const [tim, setTim] = useState('');
  const v = nguon?.value ?? '';
  const picked = v === CN_NONE ? [] : v ? v.split(',') : all.map((b) => b.code);
  const kho = nguon?.kho?.value ? nguon.kho.value.split(',') : [];
  const tomTat = !nguon || !v ? 'Tất cả chi nhánh' : v === CN_NONE ? 'Chưa chọn' : picked.length === 1
    ? `${picked[0]} · ${all.find((b) => b.code === picked[0])?.name ?? ''}` : `${picked.length} / ${all.length} chi nhánh`;
  const khoDs = useKhoLoc();
  const dat = (codes: string[]) => {
    nguon?.onChange(codes.length === 0 ? CN_NONE : codes.length >= all.length ? '' : all.map((b) => b.code).filter((c) => codes.includes(c)).join(','));
    // Bỏ chi nhánh thì kho của chi nhánh đó rời khỏi danh sách kho đã chọn.
    if (kho.length) { const kept = kho.filter((c) => codes.includes(khoDs.find((k) => k.code === c)?.branchCode ?? '')); if (kept.length !== kho.length) nguon?.kho?.onChange(kept.join(',')); }
  };
  const q = tim.trim().toLowerCase();
  const hien = all.filter((b) => (b.isActive || picked.includes(b.code)) && (!q || `${b.code} ${b.name}`.toLowerCase().includes(q)));
  return (
    <O icon={<Network size={14} />} nhan="Chi nhánh" tomTat={tomTat + (kho.length ? ` · ${kho.length} kho` : '')} khongDung={!nguon} rong={520}>
      {(dong) => (
        <div className="tlc-cn">
          <div className="tabs" style={{ margin: 0 }}>
            <button type="button" className={`tab ${the === 'cay' ? 'active' : ''}`} onClick={() => setThe('cay')} title="Cây theo cơ cấu tổ chức: tích một nút = chọn mọi chi nhánh bên dưới">Cây</button>
            <button type="button" className={`tab ${the === 'ds' ? 'active' : ''}`} onClick={() => setThe('ds')}>Danh sách</button>
            <button type="button" className={`tab ${the === 'kho' ? 'active' : ''}`} disabled={!nguon?.kho} onClick={() => setThe('kho')}
              title={nguon?.kho ? 'Chọn riêng từng kho (phân kho); tích kho thì chi nhánh của kho được chọn theo' : 'Màn này không lọc theo kho'}>Kho{!nguon?.kho && <Lock size={11} style={{ marginLeft: 3 }} />}</button>
          </div>
          {/* [2026-11-25 Nguyễn Văn Thủy] màn không lọc theo kho: thẻ Kho khoá + báo rõ (đóng góp) */}
          {!nguon?.kho && <div className="tlc-canh">Màn này chỉ lọc theo chi nhánh, không lọc riêng từng kho — số liệu gồm mọi kho của chi nhánh đã chọn.</div>}
          {/* [2026-11-25 Nguyễn Văn Thủy] Cây · Danh sách · Kho cùng một lựa chọn (đóng góp) */}
          {the === 'kho' && nguon?.kho ? (
            <WarehouseCheckList branches={v} value={nguon.kho.value} onChange={(b, w) => { nguon.onChange(b); nguon.kho?.onChange(w); }} />
          ) : the === 'cay' ? (
            <CayDonVi tree={tree.data} showBranches showWarehouses={Boolean(nguon?.kho)} checkable height={340} openLevel={2}
              picked={picked} pickedWarehouses={kho} onPick={(b, w) => { dat(b); nguon?.kho?.onChange(w.join(',')); }} />
          ) : (
            <>
              <input className="input" placeholder="Tìm mã, tên chi nhánh" value={tim} onChange={(e) => setTim(e.target.value)} autoFocus style={{ width: '100%', margin: '6px 0' }} />
              {/* [2026-11-25 Nguyễn Văn Thủy] chọn tất / bỏ chọn tất cả; đang tìm thì chỉ áp cho các dòng tìm thấy (đóng góp) */}
              <div className="row" style={{ gap: 4, marginBottom: 4 }}>
                <button type="button" className="btn btn-xs" onClick={() => (q ? dat([...new Set([...picked, ...hien.map((b) => b.code)])]) : dat(all.map((b) => b.code)))}>{q ? 'Chọn các dòng tìm thấy' : 'Chọn tất'}</button>
                <button type="button" className="btn btn-xs" onClick={() => (q ? dat(picked.filter((c) => !hien.some((b) => b.code === c))) : dat([]))}>{q ? 'Bỏ chọn các dòng tìm thấy' : 'Bỏ chọn tất cả'}</button>
              </div>
              <div className="tlc-ds">
                {hien.map((b) => (
                  <label key={b.code} className="checkbox"><input type="checkbox" checked={picked.includes(b.code)}
                    onChange={() => dat(picked.includes(b.code) ? picked.filter((c) => c !== b.code) : [...picked, b.code])} /> <span className="mono">{b.code}</span> {b.name}</label>
                ))}
              </div>
            </>
          )}
          <div className="row tlc-chan">
            <span className="muted">{tomTat}</span>
            <button type="button" className="btn btn-sm" onClick={() => { nguon?.onChange(CN_NONE); nguon?.kho?.onChange(''); }} title="Bỏ chọn mọi chi nhánh, kho rồi tích lại cái cần xem">Bỏ chọn tất cả</button>
            <button type="button" className="btn btn-sm" onClick={() => { nguon?.onChange(''); nguon?.kho?.onChange(''); }}>Chọn tất cả</button>
            <button type="button" className="btn btn-sm btn-primary" onClick={dong}>Xong</button>
          </div>
        </div>
      )}
    </O>
  );
}

const dmy = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : v || '…');

function OKy({ nguon }: { nguon?: LocChuan['ky'] }) {
  if (!nguon) return <O icon={<CalendarDays size={14} />} nhan="Kỳ" tomTat="Tất cả" khongDung />;
  const { from, to } = nguon;
  const doi = (a: string, b: string) => { rememberPeriod(a, b); nguon.onChange(a, b); };
  const p = presetOf(from, to);
  if (nguon.chiDen) return (
    <div className="tlc-o tlc-ky" title="Báo cáo số dư tại ngày">
      <CalendarDays size={14} /><span>Đến ngày</span>
      <input type="date" className="input" value={to} onChange={(e) => e.target.value && nguon.onChange('', e.target.value)} />
    </div>
  );
  return (
    <div className="tlc-o tlc-ky">
      <CalendarDays size={14} />
      <select className="select input" value={p} title="Chọn nhanh kỳ xem" onChange={(e) => { const x = PERIOD_PRESETS.find((k) => k.key === e.target.value); if (x) doi(...x.range()); }}>
        <option value="">Tuỳ chọn</option>
        {PERIOD_PRESETS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
      </select>
      <input type="date" className="input" value={from} title={`Từ ngày ${dmy(from)}`} onChange={(e) => doi(e.target.value, to)} />
      <span className="muted">–</span>
      <input type="date" className="input" value={to} min={from} title={`Đến ngày ${dmy(to)}`} onChange={(e) => doi(from, e.target.value)} />
    </div>
  );
}

function ONhom({ nguon }: { nguon?: LocChuan['nhom'] }) {
  const q = useNhomHang();
  const ix = useMemo(() => indexNhom(q.data), [q.data]);
  const codes = nguon?.value ? nguon.value.split(',').filter(Boolean) : [];
  const tomTat = codes.length === 0 ? 'Tất cả' : codes.length === 1 ? (ix.byCode.get(codes[0]!)?.name ?? codes[0]!) : `${codes.length} nhóm`;
  return (
    <O icon={<FolderTree size={14} />} nhan="Nhóm hàng" tomTat={tomTat} khongDung={!nguon} rong={380}>
      {(dong) => (
        <div className="tlc-cn">
          <CayNhomHang list={q.data} checkable picked={codes} onPick={(c) => nguon?.onChange(c.join(','))} height={320} hideInactive />
          <div className="row tlc-chan">
            <span className="muted">{tomTat}</span>
            <button type="button" className="btn btn-sm" onClick={() => nguon?.onChange('')}>Tất cả</button>
            <button type="button" className="btn btn-sm btn-primary" onClick={dong}>Xong</button>
          </div>
        </div>
      )}
    </O>
  );
}

/** Thanh lọc chuẩn: ba ô cố định + phần tóm tắt tham số khác + nút mở bảng tham số. */
export function ThanhLocChuan({ loc, khac, nutThamSo }: { loc: LocChuan; khac?: ReactNode; nutThamSo?: ReactNode }) {
  return (
    <div className="tlc">
      <OChiNhanh nguon={loc.cn} />
      <OKy nguon={loc.ky} />
      <ONhom nguon={loc.nhom} />
      <div className="tlc-khac">{khac}</div>
      {nutThamSo}
    </div>
  );
}
