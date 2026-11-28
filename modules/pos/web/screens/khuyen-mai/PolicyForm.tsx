/**
 * BH18 — hộp "Tạo chương trình mới" theo mẫu plugin chính sách cũ (tgs_selling_policy, partials/policy-edit-modal.php): hai thẻ
 * "Thông tin chương trình" / "Khuyến mãi theo mặt hàng", bảng nhiều dòng cho MỌI loại (cả Mua X tặng Y), Thêm dòng, Import Excel (dán / tệp CSV),
 * Chọn cột, tên sản phẩm + đơn vị tự điền theo danh mục. Lưu = bản nháp ở module pos → người có quyền duyệt → phát hành (như KmForm).
 */
// [2026-11-27 10:00 AM Võ Hoàng] NGHIEM-THU — NT-BH-049 (S-CD-15…17): form chính sách như plugin cũ (đóng góp)
import { useMemo, useState, type ReactNode } from 'react';
import { FormPage, Modal, errorText, useApi, useCan, useMutation, useQuery } from '@bizcity/ui-kit';
import { M } from '../../lib';
import { OverlapList, approveAndPublish, type Draft, type Overlap } from './Drafts';
import {
  OLD_TYPES, OLD_TYPE, PASTE_COLS, HSD_MODES, emptyCk, emptyFixed, emptyOld, emptyQty, emptyUnit, oldToParams, parsePaste, reasonOf,
  type CkRow, type FixedRow, type OldForm, type OldType, type QtyRow, type UnitRow,
} from './old-types';

type Unit = { unit: string; ratio: number };
type Branch = { code: string; name: string; isActive?: boolean };
type ItemClass = { code: string; name: string; isActive: boolean };
const THU = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
const yesterday = () => new Date(Date.now() + 7 * 3_600_000 - 86_400_000).toISOString().slice(0, 10);

/** Khung con có tiêu đề như "spe-subpanel" của màn cũ — dùng lớp chung card / card-body. */
const Panel = ({ title, children, style }: { title: string; children: ReactNode; style?: React.CSSProperties }) => (
  <section className="card card-body" style={{ display: 'grid', gap: 8, alignContent: 'start', margin: 0, ...style }}>
    <b>{title}</b>{children}
  </section>
);
const Check = ({ label, checked, onChange, disabled, title }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; title?: string }) => (
  <label className="checkbox" title={title} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', opacity: disabled ? 0.6 : 1 }}>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /> {label}
  </label>
);
const Lbl = ({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) => (
  <label style={{ display: 'grid', gap: 3 }} title={hint}><span className="muted" style={{ fontSize: 12.5 }}>{label}</span>{children}</label>
);

export function PolicyForm({ initial, editing, draftId, onClose, onDone }: { initial: OldForm; editing: boolean; draftId?: string; onClose: () => void; onDone: (msg: string) => void }) {
  const api = useApi();
  const can = useCan();
  const [f, setF] = useState<OldForm>(initial);
  // [2026-11-29 01:30 AM Võ Hoàng] NGHIEM-THU — NT-BH-063: 4 bước ngang thay 2 thẻ; ngày bắt đầu áp lấy từ "Từ ngày" (bỏ ô ngày phát hành) (đóng góp)
  const [buoc, setBuoc] = useState(0);
  const [stop, setStop] = useState(false);
  const [paste, setPaste] = useState<{ target: string; text: string } | null>(null);
  const [warn, setWarn] = useState<{ msg: string; overlaps: Overlap[] } | null>(null);
  const [hidden, setHidden] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('pos.km.cot-an') ?? '[]') as string[]; } catch { return []; } });
  const [colMenu, setColMenu] = useState(false);
  const set = (p: Partial<OldForm>) => setF((x) => ({ ...x, ...p }));
  const eff = stop ? { ...f, dateOn: true, validTo: yesterday(), validFrom: f.validFrom && f.validFrom <= yesterday() ? f.validFrom : yesterday() } : f;
  // "Tất cả cửa hàng" là một trạng thái riêng: bỏ tích thì chưa cửa hàng nào được chọn (sửa lỗi ô cũ: chưa chọn hiện tích hết, bấm một ô lại bỏ ô đó).
  const [allBr, setAllBr] = useState(initial.branchCodes.length === 0);
  const out0 = oldToParams(eff);
  const apTu = f.dateOn && f.validFrom && f.validFrom > f.effectiveFrom ? f.validFrom : f.effectiveFrom;
  const out = !allBr && !f.branchCodes.length ? { ...out0, problems: [...out0.problems, 'Chọn ít nhất một cửa hàng áp dụng (hoặc tích Tất cả cửa hàng)'] } : out0;
  const dirty = JSON.stringify(f) !== JSON.stringify(initial) || stop;
  const close = () => { if (!dirty || window.confirm('Còn thay đổi chưa lưu — bỏ thay đổi và đóng?')) onClose(); };

  // Danh mục: tên + cờ dưới 24 tháng, đơn vị quy đổi, cửa hàng, nhóm hàng, hạng thành viên.
  const allSkus = useMemo(() => [...new Set([...f.ckRows, ...f.fixedRows, ...f.buyRows, ...f.giftRows, ...f.moreCombos.flatMap((c) => [...c.buyRows, ...c.giftRows]), ...f.poolRows, ...f.lowRows].map((r) => r.sku.trim()).filter(Boolean))].sort(), [f]);
  const prods = useQuery({ queryKey: ['km', 'sp', allSkus.join(',')], enabled: allSkus.length > 0, staleTime: 60_000,
    queryFn: () => api.get<{ sku: string; name: string; unit?: string; isUnder24m?: boolean }[]>('/api/v1/products', { skus: allSkus.join(','), pageSize: 1000 }) });
  const units = useQuery({ queryKey: ['km', 'dvt', allSkus.join(',')], enabled: allSkus.length > 0, staleTime: 60_000,
    queryFn: () => api.get<Record<string, Unit[]>>('/api/v1/purchase/units', { skus: allSkus.join(',') }) });
  const branches = useQuery({ queryKey: ['km', 'branches'], queryFn: () => api.get<Branch[]>('/api/v1/branches'), staleTime: 300_000 });
  // [2026-11-29 01:30 AM Võ Hoàng] NGHIEM-THU — NT-BH-065: danh sách kênh bán (Kênh bán hàng) cho ô "Chọn kênh" (đóng góp)
  const channelList = useQuery({ queryKey: ['pos-kenh-ban'], staleTime: 300_000,
    queryFn: () => api.get<{ items: { code: string; name: string; kind: 'online' | 'offline'; active: boolean }[] }>(`${M}/channels`) });
  const groups = useQuery({ queryKey: ['km', 'item-classes', 'group'], queryFn: () => api.get<ItemClass[]>('/api/v1/item-classes/group'), staleTime: 300_000 });
  const tiers = useQuery({ queryKey: ['km', 'hang'], retry: false, staleTime: 300_000,
    queryFn: () => api.get<{ tiers?: { key: string; name: string }[]; content?: { tiers?: { key: string; name: string }[] } }>('/api/v1/m/loyalty/program') });
  const tierList = tiers.data?.tiers ?? tiers.data?.content?.tiers ?? [];
  const prodOf = (s: string) => (prods.data ?? []).find((p) => p.sku === s.trim());
  const under24 = (prods.data ?? []).filter((p) => p.isUnder24m);

  // [2026-11-28 10:00 AM Võ Hoàng] NGHIEM-THU — NT-BH-049: chân form như phiếu BH10 / phiếu mua — Ghi · Gửi duyệt · Duyệt (phát hành) · Thoát; người có quyền
  // Duyệt khuyến mại duyệt ngay chương trình mình lập (bỏ luật hai người, Hoàng chốt 28/11) (đóng góp)
  const approver = can('pos:promo-approve');
  type Act = 'draft' | 'submit' | 'approve';
  const save = useMutation({
    mutationFn: async (act: Act) => {
      const body = { key: f.key.trim(), ruleContract: out.contract, params: out.params, effectiveFrom: apTu, branchCodes: f.branchCodes,
        reason: reasonOf(f) || undefined, quota: out.quota, submit: act !== 'draft' };
      const r = draftId ? await api.put<{ draft: Draft; overlaps: Overlap[] }>(`${M}/promo/drafts/${draftId}`, body) : await api.post<{ draft: Draft; overlaps: Overlap[] }>(`${M}/promo/drafts`, body);
      const version = act === 'approve' ? await approveAndPublish(api, r.draft) : null;
      return { ...r, version };
    },
    onSuccess: (r, act) => {
      const msg = act === 'approve' ? `Đã duyệt và phát hành ${f.key.trim()} (bản ${r.version}) — máy bán áp từ ${apTu}.`
        : `Đã lưu ${f.key.trim()}${act === 'submit' ? ', đã gửi duyệt' : ' (nháp)'} — máy bán áp sau khi được duyệt.`;
      if (r.overlaps.length) setWarn({ msg, overlaps: r.overlaps }); else onDone(msg);
    },
  });
  if (warn) {
    return (
      <Modal title={`Đã lưu ${f.key.trim()} — có chương trình trùng`} onClose={() => onDone(warn.msg)} footer={<button type="button" className="btn btn-primary" onClick={() => onDone(warn.msg)}>Đã hiểu</button>}>
        <div style={{ gridColumn: '1 / -1', display: 'grid', gap: 8 }}><span>{warn.msg}</span><OverlapList overlaps={warn.overlaps} /></div>
      </Modal>
    );
  }

  // ── ô dùng chung của bảng ──
  const inp = (v: string, on: (s: string) => void, o: { w?: number | string; ph?: string; right?: boolean; type?: string; title?: string } = {}) => (
    <input className="input" type={o.type ?? 'text'} style={{ width: o.w ?? '100%', textAlign: o.right ? 'right' : undefined }} value={v} placeholder={o.ph} title={o.title} onChange={(e) => on(e.target.value)} />
  );
  const unitSel = <R extends UnitRow>(r: R, on: (p: Partial<UnitRow>) => void) => {
    const us = units.data?.[r.sku.trim()] ?? [];
    const base = us.find((u) => u.ratio === 1)?.unit ?? prodOf(r.sku)?.unit ?? '';
    const val = r.unitName && Number(r.unitRatio || 1) !== 1 ? `${r.unitName}|${r.unitRatio}` : '';
    return (
      <select className="input" style={{ width: '100%' }} value={val} disabled={!r.sku.trim()} title="Đơn vị tính của dòng — số lượng quy về đơn vị nhỏ nhất"
        onChange={(e) => { const [n, k] = e.target.value.split('|'); on(e.target.value ? { unitName: n!, unitRatio: k! } : { unitName: '', unitRatio: '' }); }}>
        <option value="">{base || (r.sku.trim() ? 'Đơn vị nhỏ nhất' : 'Chưa cấu hình ĐVT')}</option>
        {us.filter((u) => u.ratio !== 1).map((u) => <option key={u.unit} value={`${u.unit}|${u.ratio}`}>{u.unit} (= {u.ratio})</option>)}
        {val && !us.some((u) => `${u.unit}|${u.ratio}` === val) && <option value={val}>{r.unitName} (= {r.unitRatio})</option>}
      </select>
    );
  };
  const nameCell = (s: string) => <span className={prodOf(s) ? '' : 'muted'} style={{ fontSize: 12.5 }}>{s.trim() ? (prodOf(s)?.name ?? (prods.isLoading ? '…' : 'Không có trong danh mục')) : ''}</span>;
  const showCol = (k: string) => !hidden.includes(k);
  // nuot-loi: localStorage có thể bị trình duyệt chặn (chế độ riêng tư) — cột vẫn ẩn / hiện trong phiên, chỉ không nhớ lại
  const toggleCol = (k: string) => { const n = hidden.includes(k) ? hidden.filter((x) => x !== k) : [...hidden, k]; setHidden(n); try { localStorage.setItem('pos.km.cot-an', JSON.stringify(n)); } catch { /* bỏ qua */ } };
  const delBtn = (onDel: () => void) => <button type="button" className="btn btn-xs" title="Xoá dòng" aria-label="Xoá dòng" onClick={onDel}>×</button>;
  type Col<R> = { k: string; h: string; w?: number; opt?: boolean; cell: (r: R, i: number) => ReactNode };
  function Grid<R extends { sku: string }>({ rows, cols, onAdd, onDel, addLabel, pasteTarget }: { rows: R[]; cols: Col<R>[]; onAdd: () => void; onDel: (i: number) => void; addLabel?: string; pasteTarget?: string }) {
    const vis = cols.filter((c) => !c.opt || showCol(c.k));
    return (
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ maxHeight: 420, overflow: 'auto', border: '1px solid var(--line, #dde3ea)', borderRadius: 6 }}>
          <table className="grid full" style={{ margin: 0 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}><tr><th style={{ width: 48 }} title="Số thứ tự">STT</th>{vis.map((c) => <th key={c.k} style={{ width: c.w }} title={c.h}>{c.h}</th>)}<th style={{ width: 36 }} /></tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i}><td className="muted" style={{ textAlign: 'center' }}>{i + 1}</td>{vis.map((c) => <td key={c.k}>{c.cell(r, i)}</td>)}<td>{rows.length > 1 && delBtn(() => onDel(i))}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-sm" onClick={onAdd}>+ {addLabel ?? 'Thêm dòng'}</button>
          {pasteTarget && <button type="button" className="btn btn-sm" title={`Dán từ Excel hoặc mở tệp CSV: ${PASTE_COLS[f.type]}`} onClick={() => setPaste({ target: pasteTarget, text: '' })}>Import Excel</button>}
          <span className="muted" style={{ alignSelf: 'center' }}>{rows.filter((r) => r.sku.trim()).length} mã</span>
        </div>
      </div>
    );
  }
  const upd = <K extends keyof OldForm>(k: K, i: number, p: object) => set({ [k]: (f[k] as unknown as object[]).map((x, j) => (j === i ? { ...x, ...p } : x)) } as Partial<OldForm>);
  const add = <K extends keyof OldForm>(k: K, mk: () => object) => set({ [k]: [...(f[k] as unknown as object[]), mk()] } as Partial<OldForm>);
  const del = <K extends keyof OldForm>(k: K, i: number) => set({ [k]: (f[k] as unknown as object[]).filter((_, j) => j !== i) } as Partial<OldForm>);
  const skuCol = <R extends UnitRow>(k: keyof OldForm, h = 'Mã SKU'): Col<R> => ({ k: 'sku', h, w: 130, cell: (r, i) => inp(r.sku, (v) => upd(k, i, { sku: v }), { ph: 'Mã…' }) });
  const nameCol = <R extends UnitRow>(): Col<R> => ({ k: 'name', h: 'Tên sản phẩm', opt: true, cell: (r) => nameCell(r.sku) });
  const unitCol = <R extends UnitRow>(k: keyof OldForm): Col<R> => ({ k: 'unit', h: 'Đơn vị', w: 150, opt: true, cell: (r, i) => unitSel(r, (p) => upd(k, i, p)) });
  // [2026-11-29 02:30 AM Võ Hoàng] NGHIEM-THU — NT-BH-064: cột "Lọc HSD" của dòng giá (như hsd_filter plugin cũ, thêm còn ≤ N ngày); loại "Theo lô hàng"
  // chỉ có ô số lô. Máy chủ tự chọn lô hạn gần trước, chỉ phần thuộc lô khớp được giảm; thu ngân không chọn lô (đóng góp)
  const hsdCol = <R extends CkRow | FixedRow>(k: 'ckRows' | 'fixedRows'): Col<R> => ({
    k: 'hsd', h: 'Lọc HSD / lô', w: 260, opt: true, cell: (r, i) => {
      const m = HSD_MODES.find((x) => x.v === r.hsdMode) ?? HSD_MODES[0]!;
      return (
        <div className="row" style={{ gap: 4 }}>
          <select className="input" style={{ width: r.hsdMode ? 140 : '100%' }} value={r.hsdMode} title="Chỉ giảm phần hàng xuất từ lô khớp (máy chủ tự chọn lô hạn gần trước)"
            onChange={(e) => upd(k, i, { hsdMode: e.target.value, ...(e.target.value ? {} : { hsdValue: '' }) })}>
            {HSD_MODES.map((x) => <option key={x.v} value={x.v}>{x.label}</option>)}
          </select>
          {r.hsdMode && inp(r.hsdValue, (v) => upd(k, i, { hsdValue: v }), { ph: m.ph })}
        </div>
      );
    },
  });
  const lotCol: Col<FixedRow> = { k: 'lot', h: 'Số lô', w: 200, cell: (r, i) => inp(r.hsdValue, (v) => upd('fixedRows', i, { hsdMode: 'lot', hsdValue: v }), { ph: 'số lô, cách dấu phẩy' }) };
  const qtyRows = (k: 'buyRows' | 'giftRows', qtyLabel: string, addLabel: string) => (
    <Grid<QtyRow> rows={f[k]} pasteTarget={k} addLabel={addLabel} onAdd={() => add(k, emptyQty)} onDel={(i) => del(k, i)}
      cols={[skuCol(k), nameCol(), { k: 'qty', h: qtyLabel, w: 100, cell: (r, i) => inp(r.qty, (v) => upd(k, i, { qty: v }), { right: true }) }, unitCol(k)]} />
  );

  const applyPaste = () => {
    if (!paste) return;
    const rows = parsePaste(paste.text);
    const t = paste.target as keyof OldForm;
    const mk = (c: string[]): object => {
      switch (t) {
        case 'ckRows': return { ...emptyCk(), sku: c[0] ?? '', fromQty: c[1] || '1', pct: c[2] ?? '', amount: c[3] ?? '', maxDiscount: c[4] ?? '' } satisfies CkRow;
        case 'fixedRows': return { ...emptyFixed(), sku: c[0] ?? '', fromQty: c[1] || '1', price: c[2] ?? '', ...(f.type === 'batch' && c[3] ? { hsdMode: 'lot' as const, hsdValue: c[3] } : {}) } satisfies FixedRow;
        case 'buyRows': case 'giftRows': return { ...emptyQty(), sku: c[0] ?? '', qty: c[1] || '1' } satisfies QtyRow;
        default: return { ...emptyUnit(), sku: c[0] ?? '' };
      }
    };
    const keep = (f[t] as unknown as UnitRow[]).filter((r) => r.sku.trim());
    set({ [t]: [...keep, ...rows.map(mk)] } as Partial<OldForm>);
    setPaste(null);
  };

  const typeInfo = OLD_TYPE[f.type];
  const branchList = (branches.data ?? []).filter((b) => b.isActive !== false);
  const allBranches = allBr;

  return (
    // [2026-11-29 04:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-066: form trong trang (FormPage dùng chung — như MH29), bỏ hộp thoại; nút ở đầu trang, câu báo dưới đầu trang (đóng góp)
    <FormPage title={<span>{editing ? 'Sửa chương trình' : 'Tạo chương trình mới'}{f.key.trim() ? ` ${f.key.trim()}` : ''} <span className="badge badge-info">{typeInfo.label}</span></span>} onBack={close}
      actions={<><button type="button" className="btn" disabled={out.problems.length > 0 || save.isPending} title={out.problems.join('; ') || 'Ghi bản nháp — chưa áp ở máy bán'} onClick={() => save.mutate('draft')}>Ghi</button>
        <button type="button" className="btn" disabled={out.problems.length > 0 || save.isPending} title={out.problems.join('; ') || 'Ghi và gửi người có quyền Duyệt khuyến mại'} onClick={() => save.mutate('submit')}>Gửi duyệt</button>
        {approver && <button type="button" className="btn btn-primary" disabled={out.problems.length > 0 || save.isPending} title={out.problems.join('; ') || 'Ghi, duyệt và phát hành ngay — máy bán áp từ ngày áp dụng'}
          onClick={() => save.mutate('approve')}>Duyệt (phát hành)</button>}
        <button type="button" className="btn" onClick={close}>Thoát</button></>}
      note={<span className="muted" style={{ fontSize: 12.5 }}>{save.error ? <span className="mh-bad">{errorText(save.error)}</span> : out.problems.length ? `Chưa lưu được: ${out.problems.slice(0, 3).join(' · ')}${out.problems.length > 3 ? ` (+${out.problems.length - 3})` : ''}` : (approver ? 'Ghi = nháp · Gửi duyệt = chờ người duyệt · Duyệt = phát hành ngay.' : 'Ghi = nháp · Gửi duyệt = chờ người có quyền Duyệt khuyến mại.')}</span>}
      current={buoc} onStep={setBuoc} steps={[
          { label: 'Thông tin chung', warn: out.problems.some((x) => /Mã chương trình|tên chương trình/i.test(x)) },
          { label: 'Thời gian & điều kiện', warn: out.problems.some((x) => /ngày|giờ|Tổng giá trị|đơn hàng được áp|kênh/i.test(x)) }, // NT-BH-065: ô Kênh bán ở bước 2
          { label: 'Đối tượng áp dụng', warn: out.problems.some((x) => /cửa hàng|mỗi khách|hạng/i.test(x)) },
          { label: 'Hàng & quà', warn: out.problems.some((x) => /SKU|mã|quà|Pool|giá|chiết khấu|Hàng mua|Combo/i.test(x)) },
        ]}>
      <div style={{ display: 'grid', gap: 12 }}>

        {buoc === 0 && <>
          <div style={{ display: 'grid', gridTemplateColumns: '170px minmax(0, 420px)', gap: 8, alignItems: 'center' }}>
            <b>Loại chương trình <span className="mh-bad">*</span></b>
            <select className="input" value={f.type} disabled={editing} title={editing ? 'Không đổi loại khi sửa — lập chương trình mới' : typeInfo.hint}
              onChange={(e) => { const t = e.target.value as OldType; setF({ ...emptyOld(t, f.effectiveFrom), ...pickInfo(f), type: t }); }}>
              {OLD_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <span className="muted" style={{ marginTop: -6 }}>{typeInfo.hint}.</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 12 }}>
            <Panel title="Thông tin chung">
              <Lbl label="Mã chương trình *">{inp(f.key, (v) => set({ key: v }), { ph: 'VD: TGS_1126_01' })}</Lbl>
              <Lbl label="Tên chương trình *">{inp(f.name, (v) => set({ name: v }), { ph: 'VD: Mua 2 lon Dielac tặng 1 lon' })}</Lbl>
              <Lbl label="Mô tả"><textarea className="input" rows={3} value={f.description} placeholder="Mô tả ngắn về chương trình" onChange={(e) => set({ description: e.target.value })} /></Lbl>
              <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
                <Check label="Tích lũy thống kê cuối kỳ" checked={false} disabled onChange={() => {}} title="Chưa có ở kế toán — báo cáo khuyến mại (thẻ Báo cáo khuyến mại) đã cộng theo kỳ" />
                <Check label="Áp dụng đồng thời cùng các Chương trình khác" checked={f.allowStack} onChange={(v) => set({ allowStack: v })} title="Bỏ tích = áp riêng: dòng đã được chương trình này giảm thì chương trình sau không áp" />
                <Check label="Hủy/dừng chương trình" checked={stop} disabled={!editing} onChange={setStop} title={editing ? 'Tích rồi Lưu: chương trình kết thúc hôm qua (cần duyệt như mọi lần sửa)' : 'Dùng khi sửa chương trình đang chạy'} />
              </div>
              <div style={{ borderTop: '1px solid var(--line, #e3e8ee)', paddingTop: 8, display: 'grid', gap: 6 }}>
                <Lbl label="Cách cộng quyền lợi quà" hint="Chưa có ở kế toán — mỗi chương trình tính riêng">
                  <select className="input" disabled value="legacy" style={{ maxWidth: 320 }}><option value="legacy">Theo chương trình riêng</option></select>
                </Lbl>
                <input className="input" disabled placeholder="Mã nhóm quà (VD: POOL_XYZ)" style={{ maxWidth: 320 }} title="Chưa có ở kế toán" />
                <span className="muted" style={{ fontSize: 12 }}>Gộp quyền lợi quà giữa các chương trình (mã nhóm quà) chưa có ở kế toán — mỗi chương trình tính riêng.</span>
              </div>
            </Panel>
          </div>
        </>}

        {buoc === 1 && <>
          <div style={{ display: 'grid', gap: 12 }}>
            <Panel title="Chọn thời gian khuyến mãi">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ display: 'grid', gap: 6 }}>
                  <Check label="Chỉ áp dụng trong khoảng thời gian" checked={f.dateOn} onChange={(v) => set({ dateOn: v })} />
                  {f.dateOn ? <>
                    <Lbl label="Từ ngày">{inp(f.validFrom, (v) => set({ validFrom: v }), { type: 'date' })}</Lbl>
                    <Lbl label="Đến ngày">{inp(f.validTo, (v) => set({ validTo: v }), { type: 'date' })}</Lbl>
                  </> : <span className="muted" style={{ fontSize: 12.5 }}>Không giới hạn ngày — áp từ ngày duyệt ({f.effectiveFrom}).</span>}
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <Check label="Chỉ áp dụng trong khung giờ" checked={f.timeOn} onChange={(v) => set({ timeOn: v })} />
                  {f.timeOn ? <>
                    <Lbl label="Từ giờ">{inp(f.timeFrom, (v) => set({ timeFrom: v }), { type: 'time' })}</Lbl>
                    <Lbl label="Đến giờ">{inp(f.timeTo, (v) => set({ timeTo: v }), { type: 'time' })}</Lbl>
                  </> : <span className="muted" style={{ fontSize: 12.5 }}>Cả ngày.</span>}
                  {f.timeOn && f.timeFrom && f.timeTo && f.timeTo < f.timeFrom && <span className="badge badge-info" title="Giờ kết thúc trước giờ bắt đầu = qua nửa đêm">qua đêm</span>}
                </div>
              </div>
              <Check label="Chỉ áp dụng cho ngày trong tuần" checked={f.weekdaysOn} onChange={(v) => set({ weekdaysOn: v })} />
              {f.weekdaysOn && <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                {THU.map((t, i) => {
                  const on = f.weekdays.includes(i + 1);
                  return <button key={t} type="button" className={`btn btn-sm ${on ? 'btn-primary' : ''}`} disabled={!f.weekdaysOn} aria-pressed={on}
                    onClick={() => set({ weekdays: on ? f.weekdays.filter((d) => d !== i + 1) : [...f.weekdays, i + 1] })}>{t}</button>;
                })}
              </div>}
            </Panel>
          </div>

          <Panel title="Chỉ áp dụng cho những đơn hàng thỏa mãn điều kiện">
            {f.channelMode === 'pick' && (
              <div className="row" role="group" aria-label="Chọn kênh bán" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                <span className="muted">Kênh được áp:</span>
                {(channelList.data?.items ?? []).filter((c) => c.active || f.channels.includes(c.code)).map((c) => (
                  <Check key={c.code} label={`${c.name} (${c.kind === 'online' ? 'online' : 'offline'})`} checked={f.channels.includes(c.code)}
                    onChange={(v) => set({ channels: v ? [...f.channels, c.code] : f.channels.filter((x) => x !== c.code) })} />
                ))}
                {channelList.isLoading && <span className="muted">Đang tải kênh bán…</span>}
              </div>
            )}
            <div className="row" style={{ gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <b>Áp dụng cho</b>
              <Check label="Hóa đơn bán lẻ" checked={f.retail} onChange={(v) => set({ retail: v })} title="Máy bán POS, phiếu bán lẻ" />
              <Check label="Hóa đơn bán buôn" checked={f.wholesale} onChange={(v) => set({ wholesale: v })} />
              <Check label="Đơn đặt hàng (SO)" checked={f.so} onChange={(v) => set({ so: v })} />
              <b title="Loại kênh theo màn Kênh bán hàng (online / offline); đơn không xác định được kênh thì chương trình có điều kiện kênh không áp">Kênh bán</b>
              <select className="input" style={{ width: 170 }} aria-label="Kênh bán" value={f.channelMode}
                onChange={(e) => set({ channelMode: e.target.value as OldForm['channelMode'] })}>
                <option value="all">Tất cả kênh</option>
                <option value="offline">Chỉ offline (tại cửa hàng)</option>
                <option value="online">Chỉ online</option>
                <option value="pick">Chọn kênh…</option>
              </select>
              <span>{f.type === 'order_gift' ? 'Tổng giá trị đơn hàng ≥ (ngưỡng tặng quà)' : 'Tổng giá trị đơn hàng ≥'}</span>{inp(f.minOrderTotal, (v) => set({ minOrderTotal: v }), { w: 150, right: true })}
              <span title="Mỗi cửa hàng tối đa bao nhiêu đơn được áp; 0 = không giới hạn">Số lượng đơn hàng được áp dụng</span>{inp(f.maxUsage, (v) => set({ maxUsage: v }), { w: 110, right: true, title: 'Mỗi cửa hàng; 0 = không giới hạn' })}
            </div>
          </Panel>

        </>}

        {buoc === 2 && <>
          <Panel title="Đối tượng được áp dụng khuyến mãi">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <div style={{ display: 'grid', gap: 4, alignContent: 'start' }}>
                <b style={{ fontSize: 13 }}>Chỉ áp dụng cho các hạng thẻ</b>
                {tierList.length ? tierList.map((t) => {
                  const lv = f.memberLevels.split(/[\s,;]+/).filter(Boolean);
                  return <Check key={t.key} label={t.name || t.key} checked={lv.includes(t.key)} onChange={(v) => set({ memberLevels: (v ? [...lv, t.key] : lv.filter((x) => x !== t.key)).join(', ') })} />;
                }) : inp(f.memberLevels, (v) => set({ memberLevels: v }), { ph: 'Mã hạng: VANG, BAC (trống = mọi khách)' })}
                <span className="muted" style={{ fontSize: 12 }}>Không chọn = mọi khách.</span>
              </div>
              <div style={{ display: 'grid', gap: 4, alignContent: 'start' }}>
                <b style={{ fontSize: 13 }}>Chỉ áp dụng cho các nhóm khách hàng</b>
                <Check label="Khách mua lẻ" checked={false} disabled onChange={() => {}} title="Plugin cũ cũng chưa dùng ô này" />
              </div>
              <div style={{ display: 'grid', gap: 4, alignContent: 'start' }}>
                <b style={{ fontSize: 13 }}>Chỉ áp dụng cho</b>
                {([['', 'Không giới hạn'], ['day', 'Khách hàng có sinh nhật trong ngày'], ['week', 'Khách hàng có sinh nhật trong tuần'], ['month', 'Khách hàng có sinh nhật trong tháng']] as const).map(([v, l]) => (
                  <label key={v} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><input type="radio" name="km-sinh-nhat" checked={f.birthday === v} onChange={() => set({ birthday: v })} /> {l}</label>
                ))}
              </div>
              <div style={{ display: 'grid', gap: 4, alignContent: 'start' }}>
                <b style={{ fontSize: 13 }}>Chỉ áp dụng cho các chi nhánh</b>
                <Check label="Tất cả cửa hàng" checked={allBranches} onChange={(v) => { setAllBr(v); set({ branchCodes: [] }); }} />
                <div style={{ maxHeight: 160, overflow: 'auto', display: 'grid', gap: 2, paddingLeft: 4 }}>
                  {branchList.map((b) => (
                    <Check key={b.code} label={`${b.code} ${b.name}`} checked={!allBranches && f.branchCodes.includes(b.code)} disabled={allBranches}
                      onChange={(v) => set({ branchCodes: v ? [...f.branchCodes, b.code] : f.branchCodes.filter((x) => x !== b.code) })} />
                  ))}
                </div>
                {!allBranches && !f.branchCodes.length && <span className="mh-bad">Chọn ít nhất một cửa hàng hoặc tích Tất cả</span>}
              </div>
            </div>
          </Panel>

          <details>
            <summary className="muted" style={{ cursor: 'pointer' }}>Thêm của kế toán (không có ở plugin cũ): ưu tiên, trần NĐ81, tối đa mỗi khách</summary>
            <div className="row" style={{ gap: 14, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
              <span>Ưu tiên</span><input className="input" type="number" style={{ width: 90 }} value={f.priority} onChange={(e) => set({ priority: Math.round(Number(e.target.value) || 0) })} title="Số lớn tính trước" />
              <span>Trần khuyến mại (NĐ81)</span>{inp(f.legalCapPct, (v) => set({ legalCapPct: v }), { w: 70, ph: '50' })}<span>% tiền dòng</span>
              <Check label="Miễn trần (ghi lý do ở mô tả)" checked={f.noCap} onChange={(v) => set({ noCap: v })} />
              {f.type !== 'voucher' && <><span>Tối đa mỗi khách</span>{inp(f.perCustomer, (v) => set({ perCustomer: v }), { w: 90, ph: 'không giới hạn' })}<span>lần</span></>}
            </div>
          </details>
        </>}

        {buoc === 3 && <>
          {under24.length > 0 && (
            <div className="alert alert-warn">⚠ NĐ100/2014: không khuyến mại sản phẩm dinh dưỡng cho trẻ dưới 24 tháng — kiểm lại: {under24.map((x) => `${x.sku} ${x.name}`).join('; ')}</div>
          )}
          {(f.type === 'ck' || f.type === 'fixed' || f.type === 'batch' || f.type === 'bxgy' || f.type === 'order_gift') && (
            <Panel title="Phạm vi Nhóm hàng (HCL)">
              <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
                <Lbl label="Kiểu phạm vi">
                  <select className="input" style={{ width: 260 }} value={f.scopeMode} onChange={(e) => set({ scopeMode: e.target.value as OldForm['scopeMode'] })}>
                    <option value="all">Toàn bộ sản phẩm</option><option value="group">Theo Nhóm hàng (HCL)</option>
                  </select>
                </Lbl>
                {f.scopeMode === 'group' && (
                  <Lbl label="Nhóm hàng">
                    <select className="input" style={{ width: 300 }} value={f.groupCodes[0] ?? ''} onChange={(e) => set({ groupCodes: e.target.value ? [e.target.value] : [] })}>
                      <option value="">Chọn nhóm hàng…</option>
                      {(groups.data ?? []).filter((g) => g.isActive || f.groupCodes.includes(g.code)).map((g) => <option key={g.code} value={g.code}>{g.code} · {g.name}</option>)}
                    </select>
                  </Lbl>
                )}
              </div>
              <span className="muted" style={{ fontSize: 12 }}>Nhóm hàng đã chọn tự động bao gồm toàn bộ nhóm con.</span>
            </Panel>
          )}
          <Panel title="Cách tính chương trình">
            <div className="row" style={{ justifyContent: 'flex-end', position: 'relative', marginTop: -30 }}>
              <button type="button" className="btn btn-sm" onClick={() => setColMenu((x) => !x)} title="Ẩn / hiện cột phụ của bảng">Chọn cột</button>
              {colMenu && (
                <div className="card card-body" style={{ position: 'absolute', right: 0, top: 32, zIndex: 5, display: 'grid', gap: 4, minWidth: 180 }}>
                  {[['name', 'Tên sản phẩm'], ['unit', 'Đơn vị'], ['max', 'Tối đa (đ)'], ['hsd', 'Lọc HSD / lô']].map(([k, l]) => <Check key={k} label={l!} checked={showCol(k!)} onChange={() => toggleCol(k!)} />)}
                </div>
              )}
            </div>
            {f.type === 'ck' && (
              <Grid<CkRow> rows={f.ckRows} pasteTarget="ckRows" onAdd={() => add('ckRows', emptyCk)} onDel={(i) => del('ckRows', i)} cols={[
                skuCol('ckRows'), nameCol(),
                { k: 'from', h: 'Từ SL', w: 90, cell: (r, i) => inp(r.fromQty, (v) => upd('ckRows', i, { fromQty: v }), { right: true }) },
                unitCol('ckRows'),
                { k: 'pct', h: 'Chiết khấu %', w: 110, cell: (r, i) => inp(r.pct, (v) => upd('ckRows', i, { pct: v }), { right: true }) },
                { k: 'amt', h: 'Chiết khấu đ', w: 120, cell: (r, i) => inp(r.amount, (v) => upd('ckRows', i, { amount: v }), { right: true, ph: 'VNĐ / đơn vị' }) },
                { k: 'max', h: 'Tối đa (đ)', w: 120, opt: true, cell: (r, i) => inp(r.maxDiscount, (v) => upd('ckRows', i, { maxDiscount: v }), { right: true, title: 'Trần tiền giảm của cả mã trên một đơn' }) },
                hsdCol<CkRow>('ckRows'),
              ]} />
            )}
            {(f.type === 'fixed' || f.type === 'batch') && (
              <Grid<FixedRow> rows={f.fixedRows} pasteTarget="fixedRows" onAdd={() => add('fixedRows', f.type === 'batch' ? () => ({ ...emptyFixed(), hsdMode: 'lot' as const }) : emptyFixed)} onDel={(i) => del('fixedRows', i)} cols={[
                skuCol('fixedRows'), nameCol(), unitCol('fixedRows'),
                { k: 'from', h: 'Từ SL', w: 90, cell: (r, i) => inp(r.fromQty, (v) => upd('fixedRows', i, { fromQty: v }), { right: true }) },
                { k: 'price', h: 'Giá mới', w: 140, cell: (r, i) => inp(r.price, (v) => upd('fixedRows', i, { price: v }), { right: true, ph: 'VNĐ / đơn vị' }) },
                ...(f.type === 'batch' ? [lotCol] : [hsdCol<FixedRow>('fixedRows')]),
              ]} />
            )}
            {(f.type === 'ck' || f.type === 'fixed' || f.type === 'batch') && (
              <span className="muted" style={{ fontSize: 12 }}>Lọc HSD / lô: máy chủ tự chọn lô xuất theo hạn gần trước và chỉ giảm phần hàng thuộc lô khớp; phiếu bán ghi lô đó. Máy bán mất mạng không áp chương trình có lọc lô.</span>
            )}
            {f.type === 'bxgy' && (
              <div style={{ display: 'grid', gap: 10 }}>
                {/* [2026-11-29 01:30 AM Võ Hoàng] NGHIEM-THU — NT-BH-063: nhiều combo mua – tặng như plugin cũ; mỗi combo tính riêng (đóng góp) */}
                {f.moreCombos.length > 0 && <b style={{ fontSize: 14 }}>Combo 1</b>}
                <b style={{ fontSize: 13 }}>Hàng mua — mỗi dòng: mua đủ số lượng của mã đó thì được một lần quà (mua gấp đôi được gấp đôi)</b>
                {qtyRows('buyRows', 'SL mua', 'Thêm dòng mua')}
                <b style={{ fontSize: 13 }}>Quà tặng mỗi lần — một quà thì tặng luôn, nhiều quà thì khách chọn 1 ở máy bán</b>
                {qtyRows('giftRows', 'SL tặng', 'Thêm quà')}
                {f.moreCombos.map((c, ci) => {
                  const setC = (patch: Partial<typeof c>) => set({ moreCombos: f.moreCombos.map((x, j) => (j === ci ? { ...x, ...patch } : x)) });
                  const rowsOf = (k: 'buyRows' | 'giftRows', qtyLabel: string, addLabel: string) => (
                    <Grid<QtyRow> rows={c[k]} addLabel={addLabel} onAdd={() => setC({ [k]: [...c[k], emptyQty()] })} onDel={(i) => setC({ [k]: c[k].filter((_, j) => j !== i) })}
                      cols={[
                        { k: 'sku', h: 'Mã SKU', w: 130, cell: (r, i) => inp(r.sku, (v) => setC({ [k]: c[k].map((x, j) => (j === i ? { ...x, sku: v } : x)) }), { ph: 'Mã…' }) },
                        nameCol(),
                        { k: 'qty', h: qtyLabel, w: 100, cell: (r, i) => inp(r.qty, (v) => setC({ [k]: c[k].map((x, j) => (j === i ? { ...x, qty: v } : x)) }), { right: true }) },
                        { k: 'unit', h: 'Đơn vị', w: 150, opt: true, cell: (r, i) => unitSel(r, (pp) => setC({ [k]: c[k].map((x, j) => (j === i ? { ...x, ...pp } : x)) })) },
                      ]} />
                  );
                  return (
                    <div key={ci} style={{ display: 'grid', gap: 10, borderTop: '1px dashed var(--line, #dde3ea)', paddingTop: 10 }}>
                      <div className="row" style={{ alignItems: 'center', gap: 8 }}>
                        <b style={{ fontSize: 14, flex: 1 }}>Combo {ci + 2}</b>
                        <button type="button" className="btn btn-sm" onClick={() => set({ moreCombos: f.moreCombos.filter((_, j) => j !== ci) })}>Xoá combo</button>
                      </div>
                      <b style={{ fontSize: 13 }}>Hàng mua</b>
                      {rowsOf('buyRows', 'SL mua', 'Thêm dòng mua')}
                      <b style={{ fontSize: 13 }}>Quà tặng mỗi lần</b>
                      {rowsOf('giftRows', 'SL tặng', 'Thêm quà')}
                    </div>
                  );
                })}
                <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <button type="button" className="btn btn-sm" disabled={f.moreCombos.length >= 19} onClick={() => set({ moreCombos: [...f.moreCombos, { buyRows: [emptyQty()], giftRows: [emptyQty()] }] })}>+ Thêm combo mua – tặng</button>
                  <span className="muted" style={{ fontSize: 12 }}>Mỗi combo một bộ hàng mua và quà riêng; khách mua đủ combo nào được quà combo đó (cộng dồn).</span>
                </div>
              </div>
            )}
            {f.type === 'order_gift' && (
              <div style={{ display: 'grid', gap: 8 }}>
                <div className="alert alert-info" style={{ margin: 0 }}>Quà được áp dụng khi đơn đạt mức <b>Tổng giá trị đơn hàng</b> ở bước Thời gian & điều kiện ({f.minOrderTotal || '0'} đ); đủ mấy lần ngưỡng tặng mấy lần.</div>
                {qtyRows('giftRows', 'Số lượng tặng', 'Thêm quà')}
              </div>
            )}
            {f.type === 'voucher' && (
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                  <Lbl label="Mã giảm giá (khách đọc một mã)" hint="Nhiều mã cách nhau dấu phẩy">{inp(f.vcCodes, (v) => set({ vcCodes: v }), { ph: 'KM50K, TET26' })}</Lbl>
                  <Lbl label="Tối đa / KH (lần)">{inp(f.vcPerCustomer, (v) => set({ vcPerCustomer: v }), { right: true })}</Lbl>
                  <Lbl label="Loại giảm"><select className="input" value={f.vcType} onChange={(e) => set({ vcType: e.target.value as OldForm['vcType'] })}><option value="percent">%</option><option value="fixed">Cố định</option></select></Lbl>
                  <Lbl label="Giá trị">{inp(f.vcValue, (v) => set({ vcValue: v }), { right: true })}</Lbl>
                  <Lbl label="Tối đa (đ)">{inp(f.vcMax, (v) => set({ vcMax: v }), { right: true, ph: 'không trần' })}</Lbl>
                  <Lbl label="Đơn tối thiểu">{inp(f.vcMinOrder, (v) => set({ vcMinOrder: v }), { right: true, ph: '0' })}</Lbl>
                </div>
                <span className="muted" style={{ fontSize: 12 }}>Mã chung cho mọi khách khai ở đây. Lô mã riêng từng khách / lô mã không gắn SĐT (tiền tố + số lượng) khai ở màn Voucher (BH21).</span>
              </div>
            )}
            {f.type === 'pool' && (
              <div style={{ display: 'grid', gap: 10 }}>
                <span className="muted">Giảm giá theo combo: mua đủ X sản phẩm <b>khác nhau</b> trong pool → giảm % trên toàn bộ SP trong pool. Nếu chưa đủ combo, áp mức giảm theo số lượng từng SP.</span>
                <b style={{ fontSize: 13 }}>Pool sản phẩm</b>
                <Grid<UnitRow> rows={f.poolRows} pasteTarget="poolRows" addLabel="Thêm SKU vào pool" onAdd={() => add('poolRows', emptyUnit)} onDel={(i) => del('poolRows', i)} cols={[skuCol('poolRows'), nameCol()]} />
                <b style={{ fontSize: 13 }}>Mức giảm theo số lượng (mua cùng SKU)</b>
                <table className="grid" style={{ maxWidth: 420 }}>
                  <thead><tr><th>Từ SL</th><th>% giảm</th><th style={{ width: 36 }} /></tr></thead>
                  <tbody>{f.poolTiers.map((t, i) => <tr key={i}><td>{inp(t.minQty, (v) => upd('poolTiers', i, { minQty: v }), { right: true })}</td><td>{inp(t.pct, (v) => upd('poolTiers', i, { pct: v }), { right: true })}</td><td>{f.poolTiers.length > 1 && delBtn(() => del('poolTiers', i))}</td></tr>)}</tbody>
                </table>
                <div><button type="button" className="btn btn-sm" onClick={() => add('poolTiers', () => ({ minQty: '', pct: '' }))}>+ Thêm mức</button></div>
                <b style={{ fontSize: 13 }}>Quy tắc combo (mua khác nhau)</b>
                <div className="row" style={{ gap: 12 }}>
                  <Lbl label="Số SP khác nhau tối thiểu">{inp(f.poolMinDistinct, (v) => set({ poolMinDistinct: v }), { w: 120, right: true })}</Lbl>
                  <Lbl label="% Giảm combo">{inp(f.poolPct, (v) => set({ poolPct: v }), { w: 120, right: true })}</Lbl>
                </div>
              </div>
            )}
            {f.type === 'lowest' && (
              <div style={{ display: 'grid', gap: 10 }}>
                <div className="alert alert-info" style={{ margin: 0 }}>Mua đủ số lượng sản phẩm bất kỳ trong danh sách, quà được chọn là sản phẩm có giá bán thấp nhất.</div>
                <div className="row" style={{ gap: 12 }}>
                  <Lbl label="Số lượng cần mua">{inp(f.lowRequired, (v) => set({ lowRequired: v }), { w: 120, right: true })}</Lbl>
                  <Lbl label="Số lượng quà mỗi lượt">{inp(f.lowGift, (v) => set({ lowGift: v }), { w: 120, right: true })}</Lbl>
                </div>
                <b style={{ fontSize: 13 }}>Danh sách SKU đủ điều kiện</b>
                <Grid<UnitRow> rows={f.lowRows} pasteTarget="lowRows" addLabel="Thêm SKU" onAdd={() => add('lowRows', emptyUnit)} onDel={(i) => del('lowRows', i)} cols={[skuCol('lowRows'), nameCol()]} />
              </div>
            )}
          </Panel>
        </>}

        {paste && (
          <div className="card card-body" style={{ display: 'grid', gap: 6 }}>
            <b>Import Excel</b>
            <span className="muted">Chép các cột từ Excel rồi dán (hoặc mở tệp CSV): <b>{paste.target === 'giftRows' ? 'Mã SKU quà | Số lượng' : paste.target === 'buyRows' ? 'Mã SKU | Số lượng' : PASTE_COLS[f.type]}</b> — mỗi dòng một mã, dòng tiêu đề tự bỏ. Dòng dán thêm vào sau các dòng đã có.</span>
            <input type="file" accept=".csv,.txt,.tsv" onChange={(e) => { const file = e.target.files?.[0]; if (file) void file.text().then((t) => setPaste({ ...paste, text: t })); }} />
            <textarea className="input" rows={6} value={paste.text} onChange={(e) => setPaste({ ...paste, text: e.target.value })} placeholder={'A001\t1\t10\nA002\t2\t5'} />
            <div className="row" style={{ gap: 6 }}>
              <button type="button" className="btn btn-sm btn-primary" disabled={!parsePaste(paste.text).length} onClick={applyPaste}>Thêm {parsePaste(paste.text).length} dòng</button>
              <button type="button" className="btn btn-sm" onClick={() => setPaste(null)}>Bỏ</button>
            </div>
          </div>
        )}
      </div>
    </FormPage>
  );
}

/** Đổi loại giữ lại phần "Thông tin chương trình" đã nhập. */
function pickInfo(f: OldForm): Partial<OldForm> {
  const { key, name, description, allowStack, dateOn, validFrom, validTo, timeOn, timeFrom, timeTo, weekdaysOn, weekdays, retail, wholesale, so, minOrderTotal, maxUsage,
    memberLevels, birthday, branchCodes, effectiveFrom, priority, legalCapPct, noCap, perCustomer, channelMode, channels } = f;
  return { key, name, description, allowStack, dateOn, validFrom, validTo, timeOn, timeFrom, timeTo, weekdaysOn, weekdays, retail, wholesale, so, minOrderTotal, maxUsage,
    memberLevels, birthday, branchCodes, effectiveFrom, priority, legalCapPct, noCap, perCustomer, channelMode, channels };
}
