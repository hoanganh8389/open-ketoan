/**
 * Phần dùng chung của các màn tồn max: chọn chi nhánh cha (nhớ lần trước), chọn shop, thông báo chưa xếp phân cấp, khối số liệu màu.
 * Ô chọn chi nhánh / shop là ô gõ tìm (mã hoặc tên, không dấu); chi nhánh / shop đã ngừng ghi rõ "ngừng".
 */
import { workBranch } from '@/lib/workBranch';
import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ListPicker } from '@/components/pickers';
import { docSo, fold, lastParent, useHierarchy, type BranchNode } from './api';
// [2026-11-03 10:39 AM Nguyễn Văn Thủy] SDTC — ô "Chi nhánh" theo sơ đồ tổ chức (PT · Chi nhánh Phú Thọ); giá trị vẫn là mã chi nhánh kho (08000)
import { useOrgTree, usePurchaseUnits } from '@/lib/orgUnits';
import './ton-max.css';

// [2026-11-03 03:00 PM Nguyễn Văn Thủy] SDTC — ô Chi nhánh là cây thả xuống theo sơ đồ tổ chức (Miền → Chi nhánh); MH02 tích được nhiều chi nhánh
const SEP = String.fromCharCode(92);
/**
 * Chọn chi nhánh theo sơ đồ tổ chức: cây thả xuống Công ty → Miền → Chi nhánh (vd Phú Thọ). Giá trị là mã chi nhánh nhận hàng
 * (mã xx000, vd 08000) — nhiều chi nhánh thì cách dấu phẩy (multiple). Chưa chọn thì tự lấy chi nhánh đang làm việc / lần trước / đầu tiên.
 */
export function ChonChiNhanhCha({ value, onChange, multiple = false }: { value: string; onChange: (v: string) => void; multiple?: boolean }) {
  const h = useHierarchy();
  const parents = (h.data?.branches ?? []).filter((b) => b.level === 'branch');
  const units = usePurchaseUnits().data ?? [];
  const tree = useOrgTree();
  const opts = units.length
    ? units.map((u) => ({ code: u.branchCode, name: u.orgName.replace(/^Chi nhánh\s+/i, ''), group: u.path.split(SEP)[1] ?? '', hint: `${u.activeBranches} cửa hàng` }))
    : parents.map((p) => ({ code: p.code, name: p.name, group: '', hint: '' }));
  const groupName = (g: string) => tree.data?.nodes.find((n) => n.code === g)?.name ?? (g || 'Chi nhánh');
  const groups = [...new Set(opts.map((o) => o.group))];
  useEffect(() => {
    if (value || !opts.length) return;
    // Ưu tiên chi nhánh đang làm việc (cửa hàng → chi nhánh của nó), rồi lựa chọn lần trước.
    const wb = (h.data?.branches ?? []).find((b) => b.code === workBranch.get());
    const fromWork = wb?.level === 'branch' ? wb.code : wb?.level === 'shop' ? wb.parentCode ?? '' : '';
    const last = lastParent.get().split(',').filter((c) => opts.some((o) => o.code === c));
    onChange(opts.some((o) => o.code === fromWork) ? fromWork : last.length ? (multiple ? last.join(',') : last[0]!) : opts[0]!.code);
  }, [value, opts.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const picked = value ? value.split(',') : [];
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const nameOf = (c: string) => opts.find((o) => o.code === c)?.name ?? c;
  const summary = !picked.length ? 'Chọn chi nhánh' : picked.length === 1 ? nameOf(picked[0]!) : picked.length === opts.length ? `Tất cả ${opts.length} chi nhánh` : `${picked.length} chi nhánh: ${picked.map(nameOf).join(', ')}`;
  const commit = (list: string[]) => { const v = opts.filter((o) => list.includes(o.code)).map((o) => o.code).join(','); lastParent.set(v); onChange(v); setOpen(false); };
  const shown = opts.filter((o) => !q.trim() || fold(`${o.name} ${groupName(o.group)}`).includes(fold(q.trim())));
  const toggle = (codes: string[], on: boolean) => setDraft((d) => (on ? [...new Set([...d, ...codes])] : d.filter((c) => !codes.includes(c))));
  const state = (codes: string[]) => { const n = codes.filter((c) => draft.includes(c)).length; return n === 0 ? 'off' : n === codes.length ? 'on' : 'some'; };
  const box3 = (codes: string[]) => <input type="checkbox" checked={state(codes) === 'on'} ref={(el) => { if (el) el.indeterminate = state(codes) === 'some'; }} onChange={() => toggle(codes, state(codes) !== 'on')} />;

  return (
    <div className="tm-parent tm-cn" ref={box} title={summary}>
      <span>Chi nhánh</span>
      <button type="button" className="input tm-cn-btn" onClick={() => { setDraft(picked); setQ(''); setOpen((x) => !x); }}>{summary}</button>
      {open && (
        <div className="tm-cn-drop">
          <input className="input" placeholder="Tìm chi nhánh, miền" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <div className="tm-cn-list">
            {multiple && !q.trim() && <label className="tm-cn-row tm-cn-all">{box3(opts.map((o) => o.code))} <b>Tất cả</b></label>}
            {groups.map((g) => {
              const list = shown.filter((o) => o.group === g);
              if (!list.length) return null;
              return (
                <div key={g || '-'}>
                  {groups.length > 1 && <label className="tm-cn-row tm-cn-group">{multiple && box3(list.map((o) => o.code))} <b>{groupName(g)}</b></label>}
                  {list.map((o) => (multiple
                    ? <label key={o.code} className="tm-cn-row tm-cn-item">{box3([o.code])} {o.name} <span className="muted">{o.hint}</span></label>
                    : <button key={o.code} type="button" className={`tm-cn-row tm-cn-item${picked[0] === o.code ? ' on' : ''}`} onClick={() => commit([o.code])}>{o.name} <span className="muted">{o.hint}</span></button>))}
                </div>
              );
            })}
            {!shown.length && <div className="muted" style={{ padding: 6 }}>{opts.length ? 'Không có chi nhánh khớp' : 'Chưa có sơ đồ tổ chức (DM16)'}</div>}
          </div>
          {multiple && <div className="tm-cn-foot"><span className="muted">{draft.length} chi nhánh</span><button type="button" className="btn btn-sm btn-primary" disabled={!draft.length} onClick={() => commit(draft)}>Xong</button></div>}
        </div>
      )}
    </div>
  );
}

/** Chi nhánh / shop đã ngừng: tắt ở danh mục chi nhánh hoặc mã có đuôi _OFF. */
export const isOff = (b: { code: string; isActive: boolean }) => !b.isActive || /_OFF$/i.test(b.code);
/**
 * Chọn shop con của chi nhánh cha, hoặc chính kho chi nhánh cha (value '' — dòng đầu mang mã chi nhánh cha, tên "Kho chi nhánh").
 * Shop ngừng xếp cuối, ghi "ngừng".
 */
export function ChonShop({ parent, value, onChange, width = 300 }: { parent: string; value: string; onChange: (v: string) => void; width?: number }) {
  const h = useHierarchy();
  const shops = (h.data?.branches ?? []).filter((b) => b.level === 'shop' && b.parentCode === parent)
    .sort((a, b) => Number(isOff(a)) - Number(isOff(b)) || a.code.localeCompare(b.code));
  const KHO_CHA = parent;
  const items = [{ code: KHO_CHA, name: 'Kho chi nhánh', hint: (h.data?.branches ?? []).find((b) => b.code === parent)?.name }, ...shops.map((s) => ({
    code: s.code, name: s.name, hint: [isOff(s) ? 'ngừng' : '', s.warehouses.length ? s.warehouses.map((w) => w.code).join(', ') : 'chưa có kho'].filter(Boolean).join(' · '),
  }))];
  return <ListPicker items={items} value={value || KHO_CHA} style={{ width }} placeholder="Gõ mã / tên shop" emptyText="Không có shop khớp"
    onChange={(v) => { if (v) onChange(v === KHO_CHA ? '' : v); }} />;
}

// [2026-11-25 kiennt] NT-MH-012 — cây đã có mà còn cửa hàng chưa thuộc kho tổng nào: báo đích danh đơn vị và lý do (đóng góp)
/** Chưa có sơ đồ tổ chức thì chỉ đường sang DM16; có cây mà còn cửa hàng chưa thuộc kho tổng nào thì nêu tên đơn vị chứa chúng. */
export function ChuaPhanCap({ branches }: { branches: BranchNode[] | undefined }) {
  const org = useOrgTree();
  if (!branches) return null;
  const coKhoTong = branches.some((b) => b.level === 'branch');
  const nodes = org.data?.nodes ?? [];
  const laNut = new Set(nodes.map((n) => n.code));
  const thieu = new Map<string, number>();
  for (const b of org.data?.branches ?? []) if (b.isActive && !/_OFF$/i.test(b.code) && !b.level && b.orgCode && !laNut.has(b.code)) thieu.set(b.orgCode, (thieu.get(b.orgCode) ?? 0) + 1);
  if (coKhoTong && !thieu.size) return null;
  if (!thieu.size) return <div className="alert alert-warn" style={{ margin: 12 }}>Chưa có sơ đồ tổ chức. Mở <Link to="/danh-muc/so-do-to-chuc">Sơ đồ tổ chức (DM16)</Link> → bấm <b>Quay về dữ liệu gốc</b> hoặc <b>Nhập Excel</b>.</div>;
  const ten = (code: string) => nodes.find((n) => n.code === code)?.name ?? code;
  return (
    <div className="alert alert-warn" style={{ margin: 12 }}>
      Chưa nhận được kho tổng cho: {[...thieu].map(([code, n], i) => <span key={code}>{i ? ', ' : ''}<b>{ten(code)} ({code})</b> — {n} cửa hàng</span>)}.
      {' '}Cần một kho tổng nằm trong chi nhánh: khai loại <b>Chi nhánh</b> cho đơn vị chứa cửa hàng (loại <b>Cửa hàng</b>), rồi cho chính chi nhánh có phân kho, hoặc đặt bên dưới một đơn vị có phân kho loại <b>Kho tổng</b> / <b>Kho trung gian</b> (hoặc mã dạng xx000, tên có chữ Kho). Sửa ở <Link to="/danh-muc/so-do-to-chuc">Sơ đồ tổ chức (DM16)</Link>.
    </div>
  );
}

/** Ô số liệu tóm tắt (khối màu) — bấm được để lọc. */
export function KhoiSo({ label, value, tone = 'blue', active, onClick, hint }: { label: string; value: ReactNode; tone?: 'blue' | 'orange' | 'yellow' | 'green' | 'red' | 'grey' | 'purple'; active?: boolean; onClick?: () => void; hint?: string }) {
  return (
    <button type="button" className={`tm-stat tm-${tone}${active ? ' on' : ''}`} onClick={onClick} disabled={!onClick} title={hint}>
      <span>{label}</span><b>{value}</b>
    </button>
  );
}

// [2026-11-25 kiennt] NT-MH-006 — bỏ dải "Hai cách đặt tồn max" (mỗi màn một việc, đỡ chiếm chỗ) (đóng góp)

// [2026-11-25 kiennt] NT-MH-009 — ô số gõ tay: giữ nguyên chữ đang gõ (gõ được "1,5" / "1.5" — trước mỗi phím đọc lại số nên dấu bị nuốt,
// "1.5" thành 15); đọc như nhập Excel: "1.500" / "1,500" = nghìn, "1.5" / "1,5" = 1,5; chữ / số âm → viền đỏ, không đổi giá trị (đóng góp)
/** Ô nhập số lượng (max, min, max đề nghị…). Rời ô thì hiện lại số đã nhận (thập phân dấu phẩy); value trống (undefined / null) = ô trống. Xoá hết chữ = 0. */
export function OSo({ value, onChange, className, style, ...rest }: { value: number | undefined | null; onChange: (v: number) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [text, setText] = useState<string | null>(null);
  const read = (t: string) => (t.trim() ? docSo(t.trim().replace(/[.,]$/, '')) : 0);
  const bad = text !== null && !(read(text) >= 0);
  const shown = text ?? (value === undefined || value === null ? '' : String(value).replace('.', ','));
  return (
    <input {...rest} className={className} inputMode="decimal" value={shown} title={bad ? 'Không phải số ≥ 0 — giá trị chưa đổi' : rest.title}
      style={bad ? { ...style, borderColor: '#d92d20', background: '#fff1f0' } : style}
      onChange={(e) => { const t = e.target.value; setText(t); const v = read(t); if (v >= 0) onChange(v); }}
      onBlur={(e) => { setText(null); rest.onBlur?.(e); }} />
  );
}
