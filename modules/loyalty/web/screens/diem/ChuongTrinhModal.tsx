// [2026-11-28 03:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-059: hộp chương trình tích / đổi điểm như form khuyến mại BH18 — hai thẻ, mã tự sinh, Áp dụng cho, chân Ghi · Gửi duyệt · Duyệt (đóng góp)
/**
 * Một chương trình (loại 1–4 tích điểm, 5–6 đổi điểm) cho Tất cả / các cửa hàng chọn:
 *   - thẻ "Thông tin chương trình": loại (chọn gọn, có mô tả), mã (tự sinh TD_/DD_<MMYY>_<NN>, sửa được khi chưa phát hành), tên, ngày, ưu tiên,
 *     tự động áp, đang chạy, ghi chú, Áp dụng cho;
 *   - thẻ "Cách tính điểm" / "Phần thưởng": bảng nhiều dòng (Thêm dòng, Import Excel cho mã hàng / phần thưởng), hệ số theo hạng (xem).
 * Chân: Ghi (nháp) · Gửi duyệt · Duyệt (phát hành) — người có quyền Duyệt chính sách tự lập tự duyệt (Hoàng 28/11) · Thoát.
 * Máy chủ trả mọi lỗi một lần, tô đỏ đúng ô (đường dẫn policies.0.…, target).
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Modal, errorText, useApi, useCan, useMutation, useQuery } from '@bizcity/ui-kit';
import { ApDungCho } from './ApDungCho';
import { Err } from './parts';
import {
  EARN_TYPES, M, PERM, REDEEM_TYPES, TYPE_HINT, TYPE_LABEL, arr, dayToStart, endToStopDay, fieldErrorsOf, newPolicy, rec, startToDay, stopDayToEnd,
  useLeaveGuard, type Branch, type FieldErrors, type Policy, type Rules, type SaveMode, type Target, type Tier,
} from './model';

type Props = {
  initial: Policy; target: Target; isNew: boolean; published: boolean; group: 'earn' | 'redeem';
  branches: Branch[]; tiers: Tier[]; tierOn: boolean; onClose: () => void; onDone: (msg: string) => void;
};
type SaveOut = { items: { id: string; branchCode: string; status: string }[]; targets: string[]; stopped: string[]; published: boolean };
const AT = 'policies.0';
const INFO_FIELDS = /^(policies\.0\.(code|title|priority|startDate|endDate|notes|status|autoApply)|target|policy)$/;

/** Dán từ Excel: mỗi dòng một mục, cột cách nhau tab / chấm phẩy; dòng tiêu đề tự bỏ. */
export function parseRows(text: string): string[][] {
  const out = String(text ?? '').split(/\r?\n/).map((r) => r.trim()).filter(Boolean).map((r) => r.split(/\t|;/).map((x) => x.trim()));
  if (out.length && out[0]![0] && /^(m[ãa]|sku|stt|code)/i.test(out[0]![0])) out.shift();
  return out.filter((c) => c[0]);
}

const Lbl = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <label style={{ display: 'grid', gap: 3 }} title={hint}><span className="muted" style={{ fontSize: 12.5 }}>{label}</span>{children}</label>
);
const Panel = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="card card-body" style={{ display: 'grid', gap: 8, alignContent: 'start', margin: 0 }}><b>{title}</b>{children}</section>
);

export function ChuongTrinhModal({ initial, target, isNew, published, group, branches, tiers, tierOn, onClose, onDone }: Props) {
  const api = useApi();
  const can = useCan();
  const [p, setP] = useState<Policy>(initial);
  const [tgt, setTgt] = useState<Target>(target);
  const [tab, setTab] = useState<'info' | 'rules'>('info');
  const [errs, setErrs] = useState<FieldErrors>({});
  const [paste, setPaste] = useState<string | null>(null);
  const dirty = JSON.stringify(p) !== JSON.stringify(initial) || JSON.stringify(tgt) !== JSON.stringify(target);
  useLeaveGuard(dirty);
  const close = () => { if (!dirty || window.confirm('Còn thay đổi chưa lưu — bỏ thay đổi và đóng?')) onClose(); };
  const set = (x: Partial<Policy>) => setP((o) => ({ ...o, ...x }));
  const setR = (x: Rules) => setP((o) => ({ ...o, rules: { ...o.rules, ...x } }));
  const r = p.rules;
  const lines = p.type === 5 || p.type === 6 ? arr(rec(r.rules).rewards) : arr(r.rules);
  const setLines = (rows: Rules[]) => (p.type === 5 || p.type === 6 ? setR({ rules: { ...rec(r.rules), rewards: rows } }) : setR({ rules: rows }));
  const approver = can(PERM.duyet);

  // Tên mặt hàng theo danh mục (mã hàng tích điểm / quà).
  const skus = useMemo(() => [...new Set(lines.map((x) => String(x.sku ?? '').trim()).filter(Boolean))].sort(), [lines]);
  const prods = useQuery({ queryKey: ['loyalty', 'sp', skus.join(',')], enabled: skus.length > 0 && (p.type === 2 || p.type === 5), staleTime: 60_000,
    queryFn: () => api.get<{ sku: string; name: string; unit?: string }[]>('/api/v1/products', { skus: skus.join(','), pageSize: 1000 }) });
  const nameOf = (s: unknown) => {
    const k = String(s ?? '').trim();
    if (!k) return '';
    return (prods.data ?? []).find((x) => x.sku === k)?.name ?? (prods.isLoading ? '…' : 'Không có trong danh mục');
  };

  // Kiểm trước khi gửi (máy chủ kiểm lại đủ — Q-CHUNG-06).
  const problems: string[] = [];
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,99}$/.test(p.code.trim())) problems.push('Mã chương trình: chữ, số, dấu chấm, gạch (vd TD_1126_01)');
  if (!p.title.trim()) problems.push('Nhập tên chương trình');
  if (!tgt.all && !tgt.branchCodes.length) problems.push('Chọn ít nhất một cửa hàng áp dụng');
  if ((p.type === 1 || p.type === 3) && !(Number(r.earn_rate) > 0 && Number(r.earn_unit) > 0)) problems.push('Nhập số điểm và số tiền (lớn hơn 0)');
  if (p.type === 2 && !lines.some((x) => String(x.sku ?? '').trim())) problems.push('Thêm ít nhất một mã hàng');
  if (p.type === 4 && !lines.length) problems.push('Thêm ít nhất một mức đơn');
  if ((p.type === 5 || p.type === 6) && !lines.length) problems.push('Thêm ít nhất một phần thưởng');
  const rulesBad = Object.keys(errs).some((k) => !INFO_FIELDS.test(k)) || problems.some((x) => /điểm và số tiền|mã hàng|mức đơn|phần thưởng/.test(x));
  const infoBad = Object.keys(errs).some((k) => INFO_FIELDS.test(k));

  const save = useMutation({
    mutationFn: (mode: SaveMode) => api.post<SaveOut>(`${M}/policies/save`, { policy: { ...p, code: p.code.trim(), title: p.title.trim() }, target: tgt, mode }),
    onSuccess: (o, mode) => {
      const n = tgt.all ? `tất cả ${o.targets.length} cửa hàng` : `${o.targets.length} cửa hàng (${o.targets.join(', ')})`;
      const stop = o.stopped.length ? ` Ngừng ở ${o.stopped.join(', ')}.` : '';
      onDone(mode === 'approve' ? `Đã duyệt và phát hành ${p.code.trim()} cho ${n} — máy bán tính từ đơn kế tiếp.${stop}`
        : mode === 'submit' ? `Đã gửi duyệt ${p.code.trim()} cho ${n} — máy bán áp sau khi được duyệt.${stop}`
          : `Đã ghi nháp ${p.code.trim()} cho ${n} — chưa áp ở máy bán.${stop}`);
    },
    onError: (e) => { const f = fieldErrorsOf(e); setErrs(f); const ks = Object.keys(f); if (ks.length && ks.every((k) => !INFO_FIELDS.test(k))) setTab('rules'); else if (ks.length) setTab('info'); },
  });

  const inp = (v: unknown, on: (s: string) => void, o: { w?: number | string; path?: string; ph?: string; dis?: boolean; title?: string } = {}) => (
    <span style={{ display: 'grid' }}>
      <input className="input" name={o.path} style={{ width: o.w ?? '100%', ...(o.path && errs[o.path] ? { borderColor: 'var(--bad, #dc2626)' } : {}) }} value={String(v ?? '')}
        placeholder={o.ph} disabled={o.dis} title={o.title} onChange={(e) => on(e.target.value)} />
      {o.path && <Err errs={errs} path={o.path} />}
    </span>
  );
  const num = (v: unknown, on: (n: number) => void, o: { w?: number | string; path?: string; title?: string; dis?: boolean } = {}) => (
    <span style={{ display: 'grid' }}>
      <input className="input" type="number" name={o.path} style={{ width: o.w ?? '100%', textAlign: 'right', ...(o.path && errs[o.path] ? { borderColor: 'var(--bad, #dc2626)' } : {}) }}
        value={v === undefined || v === null ? '' : Number(v)} title={o.title} disabled={o.dis} onChange={(e) => on(e.target.value === '' ? 0 : Number(e.target.value))} />
      {o.path && <Err errs={errs} path={o.path} />}
    </span>
  );

  // ── bảng nhiều dòng ──
  type Col = { h: string; tip?: string; w?: number; cell: (x: Rules, j: number, upd: (v: Rules) => void) => ReactNode };
  const rowsAt = p.type === 5 || p.type === 6 ? `${AT}.rules.rules.rewards` : `${AT}.rules.rules`;
  const blank = (): Rules => p.type === 2 ? { sku: '', points: 1 }
    : p.type === 4 ? { min_amount: 1_000_000, bonus_points: 10 }
      : p.type === 5 ? { reward_code: '', name: '', sku: '', quantity: 1, points_required: 100, status: 1 }
        : { reward_code: '', name: '', points_required: 100, quantity: 1, discount_type: 'fixed', discount_value: 50_000, expires_in_days: 30, status: 1 };
  const tierSel = (x: Rules, upd: (v: Rules) => void, path: string) => (
    <span style={{ display: 'grid' }}>
      <select className="input" name={path} value={String(x.min_tier ?? '')} onChange={(e) => upd({ min_tier: e.target.value || undefined })}>
        <option value="">(mọi hạng)</option>{tiers.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
      </select><Err errs={errs} path={path} />
    </span>
  );
  const cols: Col[] = p.type === 2 ? [
    { h: 'Mã hàng *', w: 150, cell: (x, j, u) => inp(x.sku, (v) => u({ sku: v }), { path: `${rowsAt}.${j}.sku`, ph: 'Mã SKU…' }) },
    { h: 'Tên sản phẩm', cell: (x) => <span className="muted" style={{ fontSize: 12.5 }}>{nameOf(x.sku)}</span> },
    { h: 'Điểm / đơn vị *', tip: 'Mỗi đơn vị bán được cộng bấy nhiêu điểm', w: 130, cell: (x, j, u) => num(x.points, (v) => u({ points: v }), { path: `${rowsAt}.${j}.points` }) },
  ] : p.type === 4 ? [
    { h: 'Đơn từ (đồng) *', tip: 'Tổng tiền đơn đạt mức này thì được thưởng', w: 180, cell: (x, j, u) => num(x.min_amount, (v) => u({ min_amount: v }), { path: `${rowsAt}.${j}.min_amount` }) },
    { h: 'Thưởng (điểm) *', w: 150, cell: (x, j, u) => num(x.bonus_points, (v) => u({ bonus_points: v }), { path: `${rowsAt}.${j}.bonus_points` }) },
  ] : p.type === 5 ? [
    { h: 'Mã thưởng *', w: 110, cell: (x, j, u) => inp(x.reward_code, (v) => u({ reward_code: v }), { path: `${rowsAt}.${j}.reward_code` }) },
    { h: 'Tên quà *', w: 180, cell: (x, j, u) => inp(x.name, (v) => u({ name: v }), { path: `${rowsAt}.${j}.name` }) },
    { h: 'Điểm cần *', w: 90, cell: (x, j, u) => num(x.points_required, (v) => u({ points_required: v }), { path: `${rowsAt}.${j}.points_required` }) },
    { h: 'Hạng tối thiểu', tip: 'Khách dưới hạng này máy bán báo "chưa đủ hạng"', w: 130, cell: (x, j, u) => tierSel(x, u, `${rowsAt}.${j}.min_tier`) },
    { h: 'Mã hàng quà *', tip: 'Mặt hàng đang dùng ở danh mục (không tạo tại chỗ)', w: 130, cell: (x, j, u) => inp(x.sku, (v) => u({ sku: v }), { path: `${rowsAt}.${j}.sku`, ph: 'Mã SKU…' }) },
    { h: 'Tên mặt hàng', cell: (x) => <span className="muted" style={{ fontSize: 12.5 }}>{nameOf(x.sku)}</span> },
    { h: 'SL', w: 70, cell: (x, j, u) => num(x.quantity ?? 1, (v) => u({ quantity: v }), { path: `${rowsAt}.${j}.quantity` }) },
    { h: 'Theo dõi tồn', tip: 'Tích = quà tính vào tồn kho quà', w: 90, cell: (x, _j, u) => <input type="checkbox" checked={Number(x.is_tracking ?? 0) === 1} onChange={(e) => u({ is_tracking: e.target.checked ? 1 : 0 })} /> },
  ] : [
    { h: 'Mã thưởng *', w: 100, cell: (x, j, u) => inp(x.reward_code, (v) => u({ reward_code: v }), { path: `${rowsAt}.${j}.reward_code` }) },
    { h: 'Tên voucher *', w: 160, cell: (x, j, u) => inp(x.name, (v) => u({ name: v }), { path: `${rowsAt}.${j}.name` }) },
    { h: 'Điểm cần *', w: 85, cell: (x, j, u) => num(x.points_required, (v) => u({ points_required: v }), { path: `${rowsAt}.${j}.points_required` }) },
    { h: 'Hạng tối thiểu', w: 120, cell: (x, j, u) => tierSel(x, u, `${rowsAt}.${j}.min_tier`) },
    { h: 'SL', tip: 'Số voucher phát mỗi lần đổi', w: 60, cell: (x, j, u) => num(x.quantity ?? 1, (v) => u({ quantity: v }), { path: `${rowsAt}.${j}.quantity` }) },
    { h: 'Kiểu giảm', w: 95, cell: (x, _j, u) => <select className="input" value={String(x.discount_type ?? 'fixed')} onChange={(e) => u({ discount_type: e.target.value })}><option value="fixed">Số tiền</option><option value="percent">%</option></select> },
    { h: 'Giá trị *', w: 100, cell: (x, j, u) => num(x.discount_value, (v) => u({ discount_value: v }), { path: `${rowsAt}.${j}.discount_value` }) },
    { h: 'Giảm tối đa', tip: '0 = không trần (giảm %)', w: 100, cell: (x, j, u) => num(x.max_discount ?? 0, (v) => u({ max_discount: v }), { path: `${rowsAt}.${j}.max_discount` }) },
    { h: 'Đơn tối thiểu', w: 100, cell: (x, j, u) => num(x.min_order_amount ?? 0, (v) => u({ min_order_amount: v }), { path: `${rowsAt}.${j}.min_order_amount` }) },
    { h: 'Hiệu lực (ngày)', w: 80, cell: (x, j, u) => num(x.expires_in_days ?? 0, (v) => u({ expires_in_days: v }), { path: `${rowsAt}.${j}.expires_in_days` }) },
    { h: 'Tiền tố mã', w: 80, cell: (x, j, u) => inp(x.voucher_prefix, (v) => u({ voucher_prefix: v }), { path: `${rowsAt}.${j}.voucher_prefix` }) },
  ];
  const pasteCols = p.type === 2 ? 'Mã hàng | Điểm / đơn vị' : p.type === 4 ? 'Đơn từ | Thưởng điểm' : p.type === 5 ? 'Mã thưởng | Tên quà | Điểm cần | Mã hàng quà | SL' : 'Mã thưởng | Tên voucher | Điểm cần | Giá trị giảm';
  const fromPaste = (c: string[]): Rules => {
    const n = (s: string | undefined, d: number) => (s && Number.isFinite(Number(s.replace(/[.,\s](?=\d{3}\b)/g, ''))) ? Number(s.replace(/[.,\s](?=\d{3}\b)/g, '')) : d);
    if (p.type === 2) return { sku: c[0] ?? '', points: n(c[1], 1) };
    if (p.type === 4) return { min_amount: n(c[0], 0), bonus_points: n(c[1], 0) };
    if (p.type === 5) return { ...blank(), reward_code: c[0] ?? '', name: c[1] ?? '', points_required: n(c[2], 100), sku: c[3] ?? '', quantity: n(c[4], 1) };
    return { ...blank(), reward_code: c[0] ?? '', name: c[1] ?? '', points_required: n(c[2], 100), discount_value: n(c[3], 50_000) };
  };
  const grid = (
    <div style={{ display: 'grid', gap: 6 }}>
      <Err errs={errs} path={rowsAt} />
      <div style={{ maxHeight: 360, overflow: 'auto', border: '1px solid var(--line, #dde3ea)', borderRadius: 6 }}>
        <table className="grid full" style={{ margin: 0 }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}><tr><th style={{ width: 44 }}>STT</th>{cols.map((c) => <th key={c.h} style={{ width: c.w }} title={c.tip ?? c.h}>{c.h}</th>)}<th style={{ width: 36 }} /></tr></thead>
          <tbody>
            {lines.map((x, j) => (
              <tr key={j}>
                <td className="muted" style={{ textAlign: 'center' }}>{j + 1}</td>
                {cols.map((c) => <td key={c.h}>{c.cell(x, j, (v) => setLines(lines.map((y, k) => (k === j ? { ...y, ...v } : y))))}</td>)}
                <td><button type="button" className="btn btn-xs" title="Xoá dòng" aria-label="Xoá dòng" onClick={() => setLines(lines.filter((_, k) => k !== j))}>×</button></td>
              </tr>
            ))}
            {!lines.length && <tr><td colSpan={cols.length + 2} className="muted" style={{ textAlign: 'center', padding: 12 }}>Chưa có dòng nào — bấm "+ Thêm dòng" hoặc "Import Excel".</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="btn btn-sm" onClick={() => setLines([...lines, blank()])}>+ Thêm dòng</button>
        <button type="button" className="btn btn-sm" title={`Dán từ Excel hoặc mở tệp CSV: ${pasteCols}`} onClick={() => setPaste('')}>Import Excel</button>
        <span className="muted">{lines.length} dòng</span>
      </div>
      {paste !== null && (
        <div className="card card-body" style={{ display: 'grid', gap: 6, margin: 0 }}>
          <b>Import Excel</b>
          <span className="muted">Chép các cột từ Excel rồi dán (hoặc mở tệp CSV): <b>{pasteCols}</b> — mỗi dòng một mục, dòng tiêu đề tự bỏ; dòng dán thêm vào sau các dòng đã có.</span>
          <input type="file" accept=".csv,.txt,.tsv" onChange={(e) => { const f = e.target.files?.[0]; if (f) void f.text().then(setPaste); }} />
          <textarea className="input" rows={5} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={p.type === 2 ? 'A001\t5\nA002\t3' : ''} />
          <div className="row" style={{ gap: 6 }}>
            <button type="button" className="btn btn-sm btn-primary" disabled={!parseRows(paste).length} onClick={() => { setLines([...lines.filter((x) => Object.values(x).some((v) => String(v ?? '').trim())), ...parseRows(paste).map(fromPaste)]); setPaste(null); }}>Thêm {parseRows(paste).length} dòng</button>
            <button type="button" className="btn btn-sm" onClick={() => setPaste(null)}>Bỏ</button>
          </div>
        </div>
      )}
    </div>
  );

  // Ví dụ tính cho loại theo tiền / nhân điểm (như máy bán: phần nguyên của tiền / số tiền × điểm).
  const sample = 325_000;
  const base = Number(r.earn_unit) > 0 ? Math.floor(sample / Number(r.earn_unit)) * Number(r.earn_rate || 0) : 0;
  const mul = p.type === 3 ? Number(rec(r.rules).multiplier ?? 2) : 1;
  const types = group === 'earn' ? EARN_TYPES : REDEEM_TYPES;
  const word = group === 'earn' ? 'chương trình tích điểm' : 'danh mục đổi điểm';

  return (
    <Modal wide title={<span>{isNew ? `Thêm ${word}` : `Sửa ${word}`}{p.code.trim() ? ` ${p.code.trim()}` : ''} <span className="badge badge-info">{TYPE_LABEL[p.type]}</span></span>} onClose={close}
      footer={<div className="row" style={{ gap: 8, width: '100%', alignItems: 'center' }}>
        <span className="muted" style={{ flex: 1, fontSize: 12.5 }}>
          {save.error ? <span style={{ color: 'var(--bad, #dc2626)' }}>{errorText(save.error)}</span>
            : problems.length ? `Chưa lưu được: ${problems.slice(0, 3).join(' · ')}${problems.length > 3 ? ` (+${problems.length - 3})` : ''}`
              : approver ? 'Ghi = nháp · Gửi duyệt = chờ người duyệt · Duyệt = phát hành ngay cho các cửa hàng đã chọn.' : 'Ghi = nháp · Gửi duyệt = chờ người có quyền Duyệt chính sách tích điểm.'}
        </span>
        <button type="button" className="btn" disabled={problems.length > 0 || save.isPending} title={problems.join('; ') || 'Ghi bản nháp — chưa áp ở máy bán'} onClick={() => save.mutate('draft')}>Ghi</button>
        <button type="button" className="btn" disabled={problems.length > 0 || save.isPending} title={problems.join('; ') || 'Ghi và gửi người có quyền duyệt'} onClick={() => save.mutate('submit')}>Gửi duyệt</button>
        {approver && <button type="button" className="btn btn-primary" disabled={problems.length > 0 || save.isPending} title={problems.join('; ') || 'Ghi, duyệt và phát hành ngay — máy bán tính từ đơn kế tiếp'} onClick={() => save.mutate('approve')}>Duyệt (phát hành)</button>}
        <button type="button" className="btn" onClick={close}>Thoát</button>
      </div>}>
      <div style={{ gridColumn: '1 / -1', display: 'grid', gap: 12 }}>
        <div className="tabs" role="tablist">
          <button type="button" role="tab" className={`tab ${tab === 'info' ? 'active' : ''}`} onClick={() => setTab('info')}>Thông tin chương trình{infoBad ? ' ⚠' : ''}</button>
          <button type="button" role="tab" className={`tab ${tab === 'rules' ? 'active' : ''}`} onClick={() => setTab('rules')}>{group === 'earn' ? 'Cách tính điểm' : 'Phần thưởng đổi điểm'}{rulesBad ? ' ⚠' : ''}</button>
        </div>

        {tab === 'info' && <>
          <div style={{ display: 'grid', gap: 6 }}>
            <b>Loại chương trình <span style={{ color: 'var(--bad, #dc2626)' }}>*</span></b>
            <div role="radiogroup" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 6 }}>
              {types.map((t) => {
                const on = p.type === t;
                return (
                  <label key={t} title={isNew ? TYPE_HINT[t] : 'Không đổi loại khi sửa — thêm chương trình mới'}
                    className="card card-body" style={{ margin: 0, padding: '8px 10px', cursor: isNew ? 'pointer' : 'default', display: 'grid', gap: 2, opacity: !isNew && !on ? 0.5 : 1,
                      borderColor: on ? 'var(--brand-600, #2563eb)' : undefined, boxShadow: on ? '0 0 0 1px var(--brand-600, #2563eb)' : undefined }}>
                    <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="radio" name="loai" checked={on} disabled={!isNew} onChange={() => { const n = newPolicy(t, [p]); setP({ ...p, type: t, rules: n.rules }); }} />
                      <b style={{ fontSize: 13 }}>{TYPE_LABEL[t]}</b>
                    </span>
                    <span className="muted" style={{ fontSize: 12 }}>{TYPE_HINT[t]}</span>
                  </label>
                );
              })}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12 }}>
            <Panel title="Thông tin chung">
              <Lbl label="Mã chương trình *" hint={published ? 'Đã phát hành — không đổi mã (thêm chương trình mới nếu cần mã khác)' : 'Tự sinh theo tháng, sửa được'}>
                {inp(p.code, (v) => set({ code: v }), { path: `${AT}.code`, ph: group === 'earn' ? 'VD: TD_1126_01' : 'VD: DD_1126_01', dis: published })}
              </Lbl>
              <Lbl label="Tên chương trình *">{inp(p.title, (v) => set({ title: v }), { path: `${AT}.title`, ph: group === 'earn' ? 'VD: Tích 1 điểm mỗi 10.000đ' : 'VD: Đổi quà cuối năm' })}</Lbl>
              <Lbl label="Ghi chú" hint="Ghi chú nội bộ">
                <textarea className="input" rows={2} name={`${AT}.notes`} value={String(p.notes ?? '')} onChange={(e) => set({ notes: e.target.value })} />
              </Lbl>
            </Panel>
            <Panel title="Thời gian và cách chạy">
              <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                <Lbl label="Từ ngày" hint="Trống = áp ngay khi duyệt"><input className="input" type="date" name={`${AT}.startDate`} value={startToDay(p.startDate)} onChange={(e) => set({ startDate: dayToStart(e.target.value) })} /></Lbl>
                <Lbl label="Ngừng từ ngày" hint="Chương trình đã phát hành không xoá — đặt ngày ngừng; trống = không hạn">
                  <span style={{ display: 'grid' }}><input className="input" type="date" name={`${AT}.endDate`} value={endToStopDay(p.endDate)} onChange={(e) => set({ endDate: stopDayToEnd(e.target.value) })} /><Err errs={errs} path={`${AT}.endDate`} /></span>
                </Lbl>
                <Lbl label="Ưu tiên" hint={group === 'earn' ? 'Số nhỏ tính trước' : 'Số nhỏ hiện trước ở máy bán'}>{num(p.priority, (v) => set({ priority: Math.round(v) }), { w: 90, path: `${AT}.priority` })}</Lbl>
              </div>
              <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
                <label className="checkbox" title="Bỏ tích = ngừng chương trình (giữ lại để xem)" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" checked={p.status === 1} onChange={(e) => set({ status: e.target.checked ? 1 : 0 })} /> Đang chạy
                </label>
                <label className="checkbox" title={group === 'earn' ? 'Bỏ tích = máy bán không tự cộng điểm theo chương trình này' : 'Bỏ tích = máy bán không đưa danh mục này ra để đổi'} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" checked={p.autoApply !== false} onChange={(e) => set({ autoApply: e.target.checked })} /> Tự động áp ở máy bán
                </label>
              </div>
            </Panel>
          </div>
          <Panel title="Áp dụng cho">
            <ApDungCho name="ct" branches={branches} value={tgt} onChange={setTgt} errs={errs} />
            {!isNew && <span className="muted" style={{ fontSize: 12.5 }}>Bỏ một cửa hàng khỏi danh sách = chương trình ngừng ở cửa hàng đó (bản đã phát hành giữ nguyên để tra lại).</span>}
          </Panel>
        </>}

        {tab === 'rules' && <>
          <span className="muted">{TYPE_HINT[p.type]}</span>
          {(p.type === 1 || p.type === 3) && (
            <Panel title="Điểm theo tiền">
              <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <Lbl label="Số điểm *">{num(r.earn_rate, (v) => setR({ earn_rate: v }), { w: 90, path: `${AT}.rules.earn_rate` })}</Lbl>
                <span style={{ paddingBottom: 8 }}>điểm cho mỗi</span>
                <Lbl label="Số tiền (đồng) *">{num(r.earn_unit, (v) => setR({ earn_unit: v }), { w: 130, path: `${AT}.rules.earn_unit` })}</Lbl>
                {p.type === 3 && <Lbl label="Nhân (×) *" hint="Điểm thêm = điểm theo tiền × (hệ số − 1)">{num(rec(r.rules).multiplier ?? 2, (v) => setR({ rules: { ...rec(r.rules), multiplier: v } }), { w: 80, path: `${AT}.rules.rules.multiplier` })}</Lbl>}
                {p.type === 3 && <Lbl label="Mô tả dịp" hint="VD: x2 điểm Tết — hiện ở chi tiết điểm của đơn">{inp(rec(r.rules).description, (v) => setR({ rules: { ...rec(r.rules), description: v } }), { w: 220, path: `${AT}.rules.rules.description` })}</Lbl>}
                <Lbl label="Giá trị đổi (đ / điểm)" hint="Giá trị 1 điểm quy ra tiền — để báo cáo; máy bán đổi điểm qua danh mục quà / voucher">{num(r.redeem_rate ?? 1, (v) => setR({ redeem_rate: v }), { w: 110, path: `${AT}.rules.redeem_rate` })}</Lbl>
              </div>
              <span className="muted" style={{ fontSize: 12.5 }}>
                Ví dụ: đơn 325.000đ → {base.toLocaleString('vi-VN')} điểm{p.type === 3 ? ` × ${mul} = ${(base * mul).toLocaleString('vi-VN')} điểm` : ''} (chưa tính hệ số hạng, trần điểm).
              </span>
            </Panel>
          )}
          {(p.type === 2 || p.type === 4) && <Panel title={p.type === 2 ? 'Điểm theo mã hàng' : 'Thưởng theo mức đơn'}>{grid}</Panel>}
          {(p.type === 5 || p.type === 6) && <Panel title={p.type === 5 ? 'Quà đổi bằng điểm' : 'Voucher đổi bằng điểm'}>{grid}</Panel>}
          {group === 'earn' && (
            <Panel title="Giới hạn">
              <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                <Lbl label="Hạn điểm (ngày)" hint="Điểm tích từ chương trình này hết hạn sau bấy nhiêu ngày; 0 = không hết hạn">{num(r.point_expiry_days ?? 0, (v) => setR({ point_expiry_days: v }), { w: 110, path: `${AT}.rules.point_expiry_days` })}</Lbl>
                <Lbl label="Đơn tối thiểu (đồng)" hint="Đơn dưới mức này không tích">{num(r.min_order_amount ?? 0, (v) => setR({ min_order_amount: v }), { w: 140, path: `${AT}.rules.min_order_amount` })}</Lbl>
                <Lbl label="Trần điểm / đơn" hint="0 = không trần">{num(r.max_points_per_order ?? 0, (v) => setR({ max_points_per_order: v }), { w: 110, path: `${AT}.rules.max_points_per_order` })}</Lbl>
              </div>
            </Panel>
          )}
          {group === 'earn' && (
            <Panel title="Hệ số theo hạng (khai ở bước 1 · Cài đặt + hạng)">
              {tiers.length ? (
                <table className="grid" style={{ margin: 0, maxWidth: 460 }}>
                  <thead><tr><th>Hạng</th><th title="Hạng theo tổng điểm đã tích">Từ tổng điểm</th><th title="Điểm tích × hệ số">Hệ số</th></tr></thead>
                  <tbody>{tiers.map((t) => <tr key={t.key}><td>{t.name}</td><td style={{ textAlign: 'right' }}>{t.minPoints.toLocaleString('vi-VN')}</td><td style={{ textAlign: 'right' }}>×{t.multiplier}</td></tr>)}</tbody>
                </table>
              ) : <span className="muted">Chưa khai hạng.</span>}
              <span className="muted" style={{ fontSize: 12.5 }}>{tierOn ? 'Đang bật nhân điểm theo hạng: điểm của khách × hệ số hạng.' : 'Đang tắt nhân điểm theo hạng (bật ở bước 1).'}</span>
            </Panel>
          )}
        </>}
      </div>
    </Modal>
  );
}
