/**
 * Form BH06 Phiếu xuất điều chỉnh (NT-BH-044): lập / sửa nháp, Lưu nháp, Lưu (= ghi sổ, trừ kho ngay), Huỷ phiếu (bút toán đảo, lý do bắt buộc),
 * Chép thành phiếu mới, Xoá nháp. Bản đồ lỗi: PhieuXuatForm.failure-map.json (R-REV-17).
 *   - Báo trước khi gửi: kho, lý do, ngày, dòng (mã, SL > 0, số nguyên, ≤ tồn kho đã quy về ĐVT nhỏ nhất), người nhận của phiếu có giá.
 *   - Máy chủ kiểm lại và trả hết lỗi một lần (details.findings) → tô đỏ đúng ô, cuộn tới ô đầu.
 *   - Nút ẩn theo quyền (useCan); máy chủ vẫn 403. Đang gửi thì khoá nút (Idempotency-Key do useApi gắn — bấm hai lần một kết quả).
 *   - Đóng form khi còn thay đổi chưa lưu → hỏi "Bỏ thay đổi chưa lưu?".
 */
// [2026-11-26 03:10 PM Võ Hoàng] NGHIEM-THU — NT-BH-044: form lập phiếu xuất điều chỉnh BH06 (đóng góp)
import { useEffect, useMemo, useRef, useState } from 'react';
import { BranchPicker, ErrorBox, Field, ItemPicker, Modal, errorText, useApi, useCan, useQuery, useQueryClient } from '@bizcity/ui-kit';
import { M, P_HUY, P_LAP, STATUS, excluded, fieldErrors, money, type DanhMuc, type HangInfo, type Phieu, type Reason } from '../lib';
import { inPhieu02VT } from './In02VT';

type Row = { key: string; sku: string; unit: string; qty: string; lotNo: string; expDate: string; unitPrice: string };
type Head = {
  branchCode: string; warehouseCode: string; docDate: string; reasonCode: string; priced: boolean; partnerCode: string; receiverName: string;
  employeeName: string; description: string;
};
type Lot = { lotNo: string; expDate: string | null; available: number };

let seq = 0;
const blankRow = (): Row => ({ key: `r${++seq}`, sku: '', unit: '', qty: '', lotNo: '', expDate: '', unitPrice: '' });

export interface PhieuXuatFormProps {
  /** Phiếu đang mở (null = lập mới). */
  phieu: Phieu | null;
  /** Lập mới từ phiếu này (Chép thành phiếu mới). */
  copyFrom?: Phieu | null;
  branchCode: string;
  reasons: Reason[];
  onClose: () => void;
  onSaved: (p: Phieu) => void;
  onCopy: (p: Phieu) => void;
}

export function PhieuXuatForm({ phieu, copyFrom, branchCode, reasons, onClose, onSaved, onCopy }: PhieuXuatFormProps) {
  const api = useApi();
  const can = useCan();
  const qc = useQueryClient();
  const src = phieu ?? copyFrom ?? null;
  const readOnly = !!phieu && phieu.status !== 'draft';
  const [head, setHead] = useState<Head>(() => ({
    branchCode: src?.branchCode ?? branchCode, warehouseCode: src?.warehouseCode ?? '', docDate: phieu?.docDate ?? '', reasonCode: src?.reasonCode ?? '',
    priced: src?.priced ?? false, partnerCode: src?.partner?.code ?? '', receiverName: src?.receiverName ?? '', employeeName: src?.employeeName ?? '',
    description: src?.description ?? '',
  }));
  const [rows, setRows] = useState<Row[]>(() => (src?.lines.length ? src.lines.map((l) => ({
    key: `r${++seq}`, sku: l.sku, unit: l.unit, qty: String(l.unitQty), lotNo: l.lotNo ?? '', expDate: l.expDate ?? '', unitPrice: src.priced ? String(l.unitPrice) : '',
  })) : [blankRow()]));
  const [dirty, setDirty] = useState(!!copyFrom);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [askCancel, setAskCancel] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const dm = useQuery({ queryKey: ['xdc', 'danh-muc', head.branchCode], queryFn: () => api.get<DanhMuc>(`${M}/danh-muc`, { branchCode: head.branchCode }), enabled: !!head.branchCode });
  const d = dm.data;
  // Mặc định khi lập mới: kho bán của chi nhánh, lý do XSD1, hôm nay (ca 1).
  useEffect(() => {
    if (!d || readOnly) return;
    setHead((h) => ({
      ...h, warehouseCode: h.warehouseCode && d.warehouses.some((w) => w.code === h.warehouseCode) ? h.warehouseCode : d.defaultWarehouse ?? '',
      reasonCode: h.reasonCode || d.defaultReason, docDate: h.docDate || d.today,
    }));
  }, [d, readOnly]);

  const skus = useMemo(() => [...new Set(rows.map((r) => r.sku.trim()).filter(Boolean))].sort(), [rows]);
  const hang = useQuery({
    queryKey: ['xdc', 'hang', head.branchCode, head.warehouseCode, skus.join(',')],
    queryFn: () => api.get<{ items: HangInfo[] }>(`${M}/hang`, { branchCode: head.branchCode, warehouseCode: head.warehouseCode, skus: skus.join(',') }),
    enabled: !!head.branchCode && skus.length > 0,
  });
  const info = useMemo(() => new Map((hang.data?.items ?? []).map((h) => [h.sku, h])), [hang.data]);
  // Lô còn tồn của kho (gợi ý lô của Core — cần quyền đọc chứng từ; không có quyền thì gõ số lô / để trống cho phần mềm tự chọn).
  const lots = useQuery({
    queryKey: ['xdc', 'lots', head.branchCode, head.warehouseCode, skus.join(',')],
    queryFn: () => api.get<{ sku: string; lots: Lot[] }[]>('/api/v1/lots/suggest', { branchCode: head.branchCode, warehouse: head.warehouseCode, items: skus.map((s) => `${s}*1`).join(',') }),
    enabled: can('documents:read') && !readOnly && !!head.warehouseCode && skus.length > 0, retry: false,
  });
  const lotsOf = (sku: string) => lots.data?.find((x) => x.sku === sku)?.lots ?? [];

  const reasonOptions = useMemo(() => reasons.filter((r) => r.kind === 'out' && r.isActive && !excluded(r.code)
    && (head.priced || !!d?.purposeOfReason[r.code])), [reasons, head.priced, d]);

  const set = <K extends keyof Head>(k: K, v: Head[K]) => { setHead((h) => ({ ...h, [k]: v })); setDirty(true); };
  const setRow = (key: string, patch: Partial<Row>) => { setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r))); setDirty(true); };

  /** Kiểm trước khi gửi (bắt sớm, R-STD-FAIL-1) — máy chủ kiểm lại. */
  function check(post: boolean): Record<string, string> {
    const e: Record<string, string> = {};
    if (!head.warehouseCode) e.warehouseCode = 'Chưa chọn kho xuất';
    if (!head.reasonCode) e.reasonCode = 'Chưa chọn lý do xuất';
    if (!head.docDate) e.docDate = 'Chưa nhập ngày phiếu';
    if (head.priced && !head.partnerCode.trim()) e.partnerCode = 'Phiếu có giá phải chọn người nhận';
    const used = rows.filter((r) => r.sku.trim() || r.qty);
    if (!used.length) e.lines = 'Phiếu phải có ít nhất một dòng hàng';
    const need = new Map<string, number>();
    used.forEach((r, i) => {
      const q = Number(r.qty);
      if (!r.sku.trim()) e[`lines[${i}].sku`] = 'Chọn mặt hàng';
      if (!(q > 0)) e[`lines[${i}].qty`] = 'Số lượng phải lớn hơn 0';
      else if (!Number.isInteger(q)) e[`lines[${i}].qty`] = 'ĐVT không cho số lẻ — nhập số nguyên';
      const h = info.get(r.sku.trim());
      const ratio = h?.units.find((u) => u.unit === (r.unit || h.baseUnit))?.ratio ?? 1;
      if (h && q > 0) {
        need.set(h.sku, (need.get(h.sku) ?? 0) + q * ratio);
        if (post && (need.get(h.sku) ?? 0) > h.stock) e[`lines[${i}].qty`] = `${head.warehouseCode} chỉ còn ${h.stock} ${h.baseUnit}${ratio !== 1 ? ` (${q} ${r.unit} = ${q * ratio} ${h.baseUnit})` : ''}`;
      }
    });
    return e;
  }

  const focusFirst = (e: Record<string, string>) => {
    const first = Object.keys(e)[0];
    if (first) box.current?.querySelector<HTMLElement>(`[data-field="${first}"]`)?.scrollIntoView({ block: 'center' });
  };

  async function save(mode: 'draft' | 'post') {
    const e = check(mode === 'post');
    setErrs(e); setError(null); setWarn(null);
    if (Object.keys(e).length) { focusFirst(e); return; }
    setBusy(true);
    try {
      const used = rows.filter((r) => r.sku.trim());
      const res = await api.post<Phieu>(`${M}/phieu`, {
        mode, ...(phieu ? { id: phieu.id, version: phieu.version } : {}), ...(copyFrom ? { copiedFrom: copyFrom.id } : {}),
        branchCode: head.branchCode, warehouseCode: head.warehouseCode, docDate: head.docDate, reasonCode: head.reasonCode, priced: head.priced,
        partnerCode: head.priced ? head.partnerCode.trim() : undefined, receiverName: head.receiverName, employeeName: head.employeeName, description: head.description,
        lines: used.map((r) => ({ lineKey: r.key, sku: r.sku.trim(), unit: r.unit || undefined, unitQty: Number(r.qty), lotNo: r.lotNo || undefined,
          // Ô đơn giá để trống = giá gợi ý của bảng giá (máy chủ điền); đã sửa thì gửi giá đã sửa.
          expDate: r.expDate || undefined, ...(head.priced && r.unitPrice !== '' ? { unitPrice: Number(r.unitPrice) } : {}) })),
      });
      if (res.belowCost?.length) setWarn(`Dưới giá vốn: ${res.belowCost.map((b) => `${b.sku} ${money(b.unitPrice)} < ${money(b.unitCost)}`).join('; ')} — đã lưu, có ghi nhật ký`);
      setDirty(false);
      await qc.invalidateQueries({ queryKey: ['xdc'] });
      onSaved(res);
    } catch (err) {
      const f = fieldErrors(err);
      setErrs(f); focusFirst(f);
      setError(errorText(err));
    } finally { setBusy(false); }
  }

  async function doCancel() {
    if (!phieu) return;
    if (!cancelReason.trim()) { setErrs({ cancelReason: 'Nhập lý do huỷ' }); return; }
    setBusy(true); setError(null);
    try {
      const res = await api.post<Phieu>(`${M}/phieu/${phieu.id}/cancel`, { reason: cancelReason.trim() });
      await qc.invalidateQueries({ queryKey: ['xdc'] });
      onSaved(res);
    } catch (err) { setErrs(fieldErrors(err)); setError(errorText(err)); } finally { setBusy(false); }
  }

  async function removeDraft() {
    if (!phieu || !window.confirm(`Xoá nháp ${phieu.docNo}?`)) return;
    setBusy(true);
    try {
      await api.delete(`${M}/phieu/${phieu.id}?version=${phieu.version}`);
      await qc.invalidateQueries({ queryKey: ['xdc'] });
      onClose();
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }

  const close = () => { if (!dirty || window.confirm('Bỏ thay đổi chưa lưu?')) onClose(); };
  const bad = (k: string) => (errs[k] ? { borderColor: '#d93025' } : undefined);
  const msg = (k: string) => (errs[k] ? <div style={{ color: '#d93025', fontSize: 12 }}>{errs[k]}</div> : null);
  const total = rows.reduce((s, r) => s + (head.priced ? Number(r.qty || 0) * Number(r.unitPrice || 0) : 0), 0);
  const title = phieu ? `Phiếu xuất điều chỉnh ${phieu.docNo} — ${STATUS[phieu.status] ?? phieu.status}` : copyFrom ? `Chép từ ${copyFrom.docNo} (nháp mới)` : 'Thêm phiếu xuất điều chỉnh';

  return (
    <Modal wide title={title} onClose={close} footer={
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {phieu && <button type="button" className="btn" onClick={() => inPhieu02VT([phieu], reasons)}>In 02-VT</button>}
        {phieu?.status === 'posted' && can(P_LAP) && <button type="button" className="btn" disabled={busy} onClick={() => onCopy(phieu)}>Chép thành phiếu mới</button>}
        {phieu?.status === 'posted' && can(P_HUY) && <button type="button" className="btn" disabled={busy} onClick={() => setAskCancel(true)}>Huỷ phiếu</button>}
        {phieu?.status === 'draft' && can(P_LAP) && <button type="button" className="btn" disabled={busy} onClick={removeDraft}>Xoá nháp</button>}
        {!readOnly && can(P_LAP) && <button type="button" className="btn" disabled={busy} onClick={() => save('draft')}>Lưu nháp</button>}
        {!readOnly && can(P_LAP) && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => save('post')}>{busy ? 'Đang lưu…' : 'Lưu (ghi sổ)'}</button>}
        <button type="button" className="btn" onClick={close}>Đóng</button>
      </div>
    }>
      <div ref={box}>
        <ErrorBox error={error} />
        {warn && <div className="badge badge-warn" style={{ display: 'block', padding: 8, marginBottom: 8 }}>{warn}</div>}
        {phieu?.status === 'cancelled' && <div className="badge badge-gray" style={{ display: 'block', padding: 8, marginBottom: 8 }}>Đã huỷ — lý do: {phieu.cancelReason}</div>}
        {askCancel && phieu && (
          <div className="card" style={{ marginBottom: 12 }}><div className="card-body" data-field="cancelReason">
            <Field label="Lý do huỷ (bắt buộc)" full>
              <input className="input" name="cancelReason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} style={bad('cancelReason')} placeholder="vd Lập nhầm" />
            </Field>
            {msg('cancelReason')}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={doCancel}>Xác nhận huỷ (bút toán đảo)</button>
              <button type="button" className="btn" onClick={() => setAskCancel(false)}>Thôi</button>
            </div>
          </div></div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
          <div data-field="branchCode"><Field label="Chi nhánh"><BranchPicker value={head.branchCode} onChange={(v) => set('branchCode', v)} disabled={readOnly || !!phieu} /></Field>{msg('branchCode')}</div>
          <div data-field="warehouseCode"><Field label="Kho xuất">
            <select className="input" name="warehouseCode" value={head.warehouseCode} disabled={readOnly} onChange={(e) => set('warehouseCode', e.target.value)} style={bad('warehouseCode')}>
              <option value="">— chọn kho —</option>
              {(d?.warehouses ?? []).map((w) => <option key={w.code} value={w.code}>{w.code} — {w.name}{w.isPromo ? ' (kho quà)' : ''}</option>)}
            </select></Field>{msg('warehouseCode')}</div>
          <div data-field="docDate"><Field label="Ngày phiếu" hint={d && !d.canBackdate ? 'Thu ngân chỉ lập ngày hôm nay' : undefined}>
            <input type="date" className="input" name="docDate" value={head.docDate} max={d?.today} disabled={readOnly || (!!d && !d.canBackdate)} onChange={(e) => set('docDate', e.target.value)} style={bad('docDate')} />
          </Field>{msg('docDate')}</div>
          <div data-field="reasonCode"><Field label="Lý do xuất">
            <select className="input" name="reasonCode" value={head.reasonCode} disabled={readOnly} onChange={(e) => set('reasonCode', e.target.value)} style={bad('reasonCode')}>
              <option value="">— chọn lý do —</option>
              {reasonOptions.map((r) => <option key={r.code} value={r.code}>{r.code} — {r.name}</option>)}
              {head.reasonCode && !reasonOptions.some((r) => r.code === head.reasonCode) && <option value={head.reasonCode}>{head.reasonCode}</option>}
            </select></Field>{msg('reasonCode')}
            {!readOnly && can('settings:write') && <a href="/cau-hinh/quy-tac-hach-toan" target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>+ Thêm lý do (Quy tắc hạch toán)</a>}
          </div>
          <div><Field label="Loại phiếu">
            <label><input type="checkbox" name="priced" checked={head.priced} disabled={readOnly} onChange={(e) => set('priced', e.target.checked)} /> Phiếu có giá (bán nội bộ, không hoá đơn)</label>
          </Field></div>
          <div data-field="partnerCode"><Field label={head.priced ? 'Người nhận (bắt buộc — công nợ 131)' : 'Người nhận'}>
            {head.priced
              ? <input className="input" name="partnerCode" value={head.partnerCode} disabled={readOnly} placeholder="Mã khách hàng" onChange={(e) => set('partnerCode', e.target.value)} style={bad('partnerCode')} />
              : <input className="input" name="receiverName" value={head.receiverName} disabled={readOnly} onChange={(e) => set('receiverName', e.target.value)} />}
          </Field>{msg('partnerCode')}</div>
          <div><Field label="Nhân viên"><input className="input" name="employeeName" value={head.employeeName} disabled={readOnly} onChange={(e) => set('employeeName', e.target.value)} /></Field></div>
          <div style={{ gridColumn: '1 / -1' }}><Field label="Diễn giải" full><input className="input" name="description" value={head.description} disabled={readOnly} onChange={(e) => set('description', e.target.value)} /></Field></div>
        </div>

        <div data-field="lines" style={{ marginTop: 12, overflowX: 'auto' }}>
          {msg('lines')}
          <table className="grid" style={{ width: '100%' }}>
            <thead><tr>
              <th>#</th><th>Mã hàng</th><th>Tên</th><th>ĐVT</th><th>SL</th><th>Tồn kho</th><th>Lô</th><th>Hạn dùng</th>
              {head.priced && <><th>Đơn giá (gồm thuế)</th><th>Thuế</th><th>Thành tiền</th></>}<th />
            </tr></thead>
            <tbody>
              {rows.map((r, i) => {
                const h = info.get(r.sku.trim());
                const units = h?.units ?? [];
                const lotList = lotsOf(r.sku.trim());
                const price = units.find((u) => u.unit === (r.unit || h?.baseUnit))?.price;
                const below = head.priced && h?.unitCost != null && Number(r.unitPrice || 0) / (units.find((u) => u.unit === (r.unit || h.baseUnit))?.ratio ?? 1) < h.unitCost * (1 + (h.taxRate ?? 0) / 100);
                return (
                  <tr key={r.key}>
                    <td>{i + 1}</td>
                    <td data-field={`lines[${i}].sku`} style={{ minWidth: 180 }}>
                      {readOnly ? r.sku : <ItemPicker value={r.sku} onChange={(v) => setRow(r.key, { sku: v, unit: '', lotNo: '', expDate: '', unitPrice: '' })} placeholder="Chọn mặt hàng đang dùng" />}
                      {msg(`lines[${i}].sku`)}
                    </td>
                    <td>{h?.name ?? ''}</td>
                    <td>
                      <select className="input" name="unit" value={r.unit || h?.baseUnit || ''} disabled={readOnly || !h} onChange={(e) => setRow(r.key, { unit: e.target.value, unitPrice: '' })}>
                        {units.map((u) => <option key={u.unit} value={u.unit}>{u.unit}{u.ratio !== 1 ? ` (${u.ratio} ${h?.baseUnit})` : ''}</option>)}
                      </select>
                    </td>
                    <td data-field={`lines[${i}].qty`}>
                      <input className="input" name="qty" inputMode="numeric" value={r.qty} disabled={readOnly} onChange={(e) => setRow(r.key, { qty: e.target.value })} style={{ width: 80, ...bad(`lines[${i}].qty`) }} />
                      {msg(`lines[${i}].qty`)}
                    </td>
                    <td>{h ? `${h.stock} ${h.baseUnit}` : ''}</td>
                    <td>
                      {lotList.length && !readOnly
                        ? <select className="input" name="lotNo" value={r.lotNo} onChange={(e) => { const l = lotList.find((x) => x.lotNo === e.target.value); setRow(r.key, { lotNo: e.target.value, expDate: l?.expDate ?? '' }); }}>
                            <option value="">Tự chọn (hạn sớm nhất)</option>
                            {lotList.map((l) => <option key={`${l.lotNo}|${l.expDate}`} value={l.lotNo}>{l.lotNo || '(không số)'} — còn {l.available}</option>)}
                          </select>
                        : <input className="input" name="lotNo" value={r.lotNo} disabled={readOnly} placeholder="Trống = tự chọn" onChange={(e) => setRow(r.key, { lotNo: e.target.value })} style={{ width: 100 }} />}
                    </td>
                    <td><input type="date" className="input" name="expDate" value={r.expDate} disabled={readOnly} onChange={(e) => setRow(r.key, { expDate: e.target.value })} /></td>
                    {head.priced && <>
                      <td data-field={`lines[${i}].unitPrice`}>
                        <input className="input" name="unitPrice" inputMode="numeric" value={r.unitPrice || (price != null && !readOnly ? String(price) : r.unitPrice)} disabled={readOnly}
                          onChange={(e) => setRow(r.key, { unitPrice: e.target.value })} style={{ width: 110, ...bad(`lines[${i}].unitPrice`) }} />
                        {below && <div style={{ color: '#b45309', fontSize: 12 }}>Dưới giá vốn — vẫn lưu được, có ghi nhật ký</div>}
                      </td>
                      <td>{h?.taxCode ?? ''}</td>
                      <td style={{ textAlign: 'right' }}>{money(Number(r.qty || 0) * Number(r.unitPrice || price || 0))}</td>
                    </>}
                    <td>{!readOnly && rows.length > 1 && <button type="button" className="btn btn-xs" onClick={() => { setRows((rs) => rs.filter((x) => x.key !== r.key)); setDirty(true); }}>×</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!readOnly && (
            <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
              <button type="button" className="btn btn-xs" onClick={() => { setRows((rs) => [...rs, blankRow()]); setDirty(true); }}>+ Thêm dòng</button>
              {can('catalog:write') && <a href="/danh-muc/mat-hang" target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>+ Thêm mặt hàng (Danh mục mặt hàng)</a>}
            </div>
          )}
          {head.priced && <div style={{ textAlign: 'right', marginTop: 6 }}><b>Tổng tiền: {money(phieu?.priced ? phieu.total : total)}</b></div>}
        </div>
      </div>
    </Modal>
  );
}
