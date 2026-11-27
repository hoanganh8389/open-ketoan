/**
 * Form đề nghị điều chuyển KHO04 (NT-BH-056): lập / sửa đề nghị Chờ duyệt, xem đề nghị đã xử lý; người duyệt Duyệt (lập phiếu KHO01) / Từ chối;
 * người lập Huỷ đề nghị đang chờ. Duyệt = 3 bước: prepare (module kiểm, giữ chỗ, trả khuôn KHO01) → POST /api/v1/kho/transfers bằng phiên
 * người duyệt → record (ghi số phiếu KHO01 vào đề nghị); bước 2 lỗi → abort (đề nghị về Chờ duyệt).
 */
// [2026-11-28 10:00 AM Võ Hoàng] NGHIEM-THU — NT-BH-056: form đề nghị điều chuyển (đóng góp)
import { useMemo, useState } from 'react';
import { BranchPicker, ErrorBox, Field, ItemPicker, Modal, errorText, useApi, useCan, useQuery, useQueryClient } from '@bizcity/ui-kit';
import { KHO_TRANSFERS, M, P_DUYET, P_LAP, STATUS, qtyText, today, type DanhMuc, type Hang, type Phieu } from '../lib';

type Row = { key: number; sku: string; name: string; unit: string; qty: string; note: string; lotNo: string; expDate: string };
type Prepared = { phieu: Phieu; payload: Record<string, unknown> & { lines: { sku: string; qty: number }[] } };
type KhoDoc = { id: string | number; docNo: string; status: string };

let seq = 0;
const blank = (): Row => ({ key: ++seq, sku: '', name: '', unit: '', qty: '', note: '', lotNo: '', expDate: '' });
const fromPhieu = (p: Phieu): Row[] => p.lines.map((l) => ({ key: ++seq, sku: l.sku, name: l.name, unit: l.unit, qty: String(l.qty), note: l.note, lotNo: l.lotNo, expDate: l.expDate ?? '' }));
/** Lỗi máy chủ → { ô: câu báo } (details.findings). */
const fieldErrors = (err: unknown): Record<string, string> => {
  const f = (err as { details?: { findings?: { field?: string; title?: string }[] } } | null)?.details?.findings ?? [];
  return Object.fromEntries(f.filter((x) => x.field).map((x) => [x.field!, x.title ?? '']));
};

export function DeNghiForm({ phieu, branchCode, onClose, onSaved }: { phieu: Phieu | null; branchCode: string; onClose: () => void; onSaved: (p: Phieu, msg?: string) => void }) {
  const api = useApi();
  const can = useCan();
  const qc = useQueryClient();
  const [branch, setBranch] = useState(phieu?.branchCode ?? branchCode);
  const [toBranch, setToBranch] = useState(phieu?.toBranchCode ?? '');
  const [partnerCode, setPartnerCode] = useState(phieu?.partner?.code ?? '');
  const [reasonCode, setReasonCode] = useState(phieu?.reasonCode ?? '');
  const [staffName, setStaffName] = useState(phieu?.staffName ?? '');
  const [note, setNote] = useState(phieu?.note ?? '');
  const [rows, setRows] = useState<Row[]>(phieu ? fromPhieu(phieu) : [blank()]);
  const [rejectReason, setRejectReason] = useState('');
  const [askReject, setAskReject] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});

  const pending = !phieu || phieu.status === 'pending';
  const editable = pending && can(P_LAP);
  const dm = useQuery({ queryKey: ['dndc', 'danh-muc', branch], queryFn: () => api.get<DanhMuc>(`${M}/danh-muc`, { branchCode: branch }), enabled: !!branch, retry: false });
  const skus = useMemo(() => [...new Set(rows.map((r) => r.sku.trim()).filter(Boolean))].sort(), [rows]);
  const hang = useQuery({
    queryKey: ['dndc', 'hang', branch, skus.join(',')], enabled: !!branch && skus.length > 0, retry: false,
    queryFn: () => api.get<{ items: Hang[] }>(`${M}/hang`, { branchCode: branch, skus: skus.join(',') }),
  });
  const info = new Map((hang.data?.items ?? []).map((h) => [h.sku, h]));
  const setRow = (key: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const msg = (f: string) => (errs[f] ? <div className="field-error" role="alert">{errs[f]}</div> : null);

  const body = () => ({
    ...(phieu ? { id: phieu.id, version: phieu.version } : {}), branchCode: branch, toBranchCode: toBranch, partnerCode: partnerCode.trim() || undefined,
    reasonCode: reasonCode.trim() || undefined, staffName: staffName.trim() || undefined, note: note.trim() || undefined, source: 'ketoan',
    lines: rows.filter((r) => r.sku.trim()).map((r) => ({
      sku: r.sku.trim(), name: r.name || info.get(r.sku)?.name, unit: info.get(r.sku)?.unit || r.unit, qty: Number(r.qty),
      note: r.note || undefined, lotNo: r.lotNo || undefined, expDate: r.expDate || undefined,
    })),
  });

  async function run(fn: () => Promise<{ p: Phieu; msg?: string }>) {
    setBusy(true); setError(null); setErrs({});
    try {
      const r = await fn();
      await qc.invalidateQueries({ queryKey: ['dndc'] });
      onSaved(r.p, r.msg);
    } catch (e) { setError(errorText(e)); setErrs(fieldErrors(e)); } finally { setBusy(false); }
  }
  const save = () => run(async () => ({ p: await api.post<Phieu>(`${M}/phieu`, body()), msg: phieu ? 'Đã lưu đề nghị' : 'Đã lập đề nghị — chờ duyệt' }));
  const cancel = () => {
    if (!phieu || !window.confirm(`Huỷ đề nghị ${phieu.docNo}?`)) return;
    void run(async () => ({ p: await api.post<Phieu>(`${M}/phieu/${phieu.id}/cancel`, { branchCode: phieu.branchCode }), msg: `Đã huỷ đề nghị ${phieu.docNo}` }));
  };
  const reject = () => phieu && run(async () => ({ p: await api.post<Phieu>(`${M}/phieu/${phieu.id}/reject`, { reason: rejectReason, branchCode: phieu.branchCode }), msg: `Đã từ chối đề nghị ${phieu.docNo}` }));
  const approve = () => phieu && run(async () => {
    const prep = await api.post<Prepared>(`${M}/phieu/${phieu.id}/approve`, { step: 'prepare', branchCode: phieu.branchCode });
    let t: KhoDoc;
    try {
      t = await api.post<KhoDoc>(KHO_TRANSFERS, prep.payload);
    } catch (e) {
      // nuot-loi: bỏ chỗ "đang lập" chỉ là dọn dẹp — lỗi thật (của KHO01) ném tiếp bên dưới; chỗ tự hết hạn sau 2 phút
      await api.post(`${M}/phieu/${phieu.id}/approve`, { step: 'abort', branchCode: phieu.branchCode }).catch(() => undefined);
      throw e;
    }
    const p = await api.post<Phieu>(`${M}/phieu/${phieu.id}/approve`, { step: 'record', branchCode: phieu.branchCode, transfer: { id: String(t.id), docNo: t.docNo, status: t.status } });
    return { p, msg: `Đã duyệt — lập phiếu chuyển kho ${t.docNo} (${phieu.branchCode} → ${phieu.toBranchCode}), chờ chi nhánh nhận xác nhận ở KHO01` };
  });

  const title = phieu ? `Đề nghị điều chuyển ${phieu.docNo} · ${STATUS[phieu.status]}` : 'Lập đề nghị điều chuyển';
  const canApprove = !!phieu && pending && can(P_DUYET);
  return (
    <Modal wide title={title} onClose={onClose} footer={<>
      {editable && <button type="button" className="btn" disabled={busy} onClick={save} title="Lưu đề nghị (Chờ duyệt) — máy chủ kiểm lại tồn kho xuất">Ghi</button>}
      {canApprove && <button type="button" className="btn btn-primary" disabled={busy || !dm.data?.canCreateTransfer}
        title={dm.data?.canCreateTransfer ? 'Lập phiếu chuyển kho KHO01 (xuất luôn, chờ chi nhánh nhận xác nhận)' : 'Cần thêm quyền Lập phiếu chuyển kho (KHO01)'}
        onClick={approve}>Duyệt (lập chuyển kho)</button>}
      {canApprove && <button type="button" className="btn" disabled={busy} onClick={() => setAskReject(true)} title="Từ chối đề nghị (lý do bắt buộc)">Từ chối</button>}
      {phieu && editable && <button type="button" className="btn" disabled={busy} onClick={cancel} title="Huỷ đề nghị đang chờ">Huỷ đề nghị</button>}
      <button type="button" className="btn" onClick={onClose}>Thoát</button>
    </>}>
      <ErrorBox error={error ?? (dm.error ? errorText(dm.error) : null)} />
      {phieu?.status === 'converted' && phieu.transfer && (
        <div className="alert alert-ok" role="status">Đã lập phiếu chuyển kho <b>{phieu.transfer.docNo}</b> (KHO01) — xem / nhận hàng ở màn Chuyển kho.
          {phieu.decidedByName ? ` Người duyệt: ${phieu.decidedByName}.` : ''}</div>
      )}
      {phieu?.status === 'rejected' && <div className="alert alert-warn" role="status">Từ chối: {phieu.rejectReason}{phieu.decidedByName ? ` — ${phieu.decidedByName}` : ''}</div>}
      {phieu?.status === 'cancelled' && <div className="alert alert-warn" role="status">Đã huỷ{phieu.cancelReason ? `: ${phieu.cancelReason}` : ''}{phieu.decidedByName ? ` — ${phieu.decidedByName}` : ''}</div>}
      {askReject && (
        <div className="card card-body" data-field="reason">
          <Field label="Lý do từ chối (bắt buộc, ít nhất 5 ký tự)" full>
            <input className="input" name="reason" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} title="Lý do gửi lại người lập" />
          </Field>{msg('reason')}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" className="btn btn-primary" disabled={busy || rejectReason.trim().length < 5} onClick={reject}>Xác nhận từ chối</button>
            <button type="button" className="btn" onClick={() => setAskReject(false)}>Thôi</button>
          </div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px 16px' }}>
        <div data-field="branchCode"><Field label="Chi nhánh đề nghị (xuất hàng)" hint={dm.data?.warehouseCode ? `Kho xuất: ${dm.data.warehouseCode}` : undefined}>
          <BranchPicker value={branch} onChange={(v) => { setBranch(v); setToBranch(''); }} disabled={!!phieu || !editable} />
        </Field>{msg('branchCode')}</div>
        <div data-field="toBranchCode"><Field label="Chi nhánh nhận (bắt buộc)" hint="Cùng cấp trên hoặc chi nhánh cấp trên (cơ cấu MH15)">
          <select className="input" name="toBranchCode" value={toBranch} disabled={!editable} onChange={(e) => setToBranch(e.target.value)} title="Chi nhánh nhận hàng">
            <option value="">— Chọn chi nhánh nhận —</option>
            {(dm.data?.receiveBranches ?? []).map((b) => <option key={b.code} value={b.code}>{b.code} — {b.name}{b.isParent ? ' (cấp trên)' : ''}</option>)}
            {phieu && !(dm.data?.receiveBranches ?? []).some((b) => b.code === toBranch) && toBranch && <option value={toBranch}>{toBranch} — {phieu.toBranchName}</option>}
          </select>
        </Field>{msg('toBranchCode')}</div>
        <div data-field="partnerCode"><Field label="Khách hàng (không bắt buộc)">
          <input className="input" name="partnerCode" value={partnerCode} disabled={!editable} onChange={(e) => setPartnerCode(e.target.value)} placeholder="Mã khách" title="Mã khách hàng liên quan (nếu có)" />
        </Field>{msg('partnerCode')}</div>
        <div><Field label="Lý do (mã, không bắt buộc)"><input className="input" name="reasonCode" value={reasonCode} disabled={!editable} onChange={(e) => setReasonCode(e.target.value)} title="Mã lý do — gửi sang phiếu KHO01 khi duyệt" /></Field></div>
        <div><Field label="Nhân viên"><input className="input" name="staffName" value={staffName} disabled={!editable} onChange={(e) => setStaffName(e.target.value)} title="Nhân viên đề nghị" /></Field></div>
        <div><Field label="Ngày lập"><input className="input" value={phieu?.docDate ?? today()} disabled title="Ngày lập đề nghị (hôm nay)" /></Field></div>
        <div style={{ gridColumn: '1 / -1' }}><Field label="Ghi chú" full><input className="input" name="note" value={note} disabled={!editable} onChange={(e) => setNote(e.target.value)} title="Ghi chú đề nghị" /></Field></div>
      </div>
      <div data-field="lines" style={{ marginTop: 12 }}>{msg('lines')}
        <table className="grid full">
          <thead><tr>
            <th style={{ width: 36 }} title="Số thứ tự">#</th><th title="Mã hàng">Mã hàng</th><th title="Tên hàng">Tên hàng</th><th title="ĐVT nhỏ nhất">ĐVT</th>
            <th className="num" title="Tồn kho xuất của chi nhánh đề nghị (ĐVT nhỏ nhất)">Tồn</th><th className="num" title="Số lượng điều chuyển (≤ tồn)">SL</th>
            <th title="Số lô (không bắt buộc)">Số lô</th><th title="Hạn dùng dd/mm/yyyy hoặc yyyy-mm-dd">Hạn dùng</th><th title="Ghi chú dòng">Ghi chú</th>{editable && <th />}
          </tr></thead>
          <tbody>{rows.map((r, i) => {
            const h = info.get(r.sku);
            const over = h && Number(r.qty) > h.stock;
            return (
              <tr key={r.key}>
                <td className="muted">{i + 1}</td>
                <td data-field={`lines[${i}].sku`} style={{ minWidth: 220 }}>{editable ? <ItemPicker value={r.sku} onChange={(v) => setRow(r.key, { sku: v, name: '', unit: '' })} placeholder="Chọn mặt hàng" /> : r.sku}{msg(`lines[${i}].sku`)}</td>
                <td>{h?.name || r.name}</td>
                <td>{h?.unit || r.unit}</td>
                <td className="num">{h ? qtyText(h.stock) : ''}</td>
                <td data-field={`lines[${i}].qty`} className="num" style={{ width: 100 }}>
                  {editable ? <input className={`input num${over ? ' is-invalid' : ''}`} name={`lines.${i}.qty`} type="number" min={0} step="any" value={r.qty}
                    title={over ? `Chỉ còn ${h?.stock}` : 'Số lượng điều chuyển'} onChange={(e) => setRow(r.key, { qty: e.target.value })} /> : qtyText(Number(r.qty))}
                  {msg(`lines[${i}].qty`)}</td>
                <td>{editable ? <input className="input" value={r.lotNo} onChange={(e) => setRow(r.key, { lotNo: e.target.value })} title="Số lô" /> : r.lotNo}</td>
                <td data-field={`lines[${i}].expDate`}>{editable ? <input className="input" value={r.expDate} placeholder="dd/mm/yyyy" onChange={(e) => setRow(r.key, { expDate: e.target.value })} title="Hạn dùng" /> : r.expDate}{msg(`lines[${i}].expDate`)}</td>
                <td>{editable ? <input className="input" value={r.note} onChange={(e) => setRow(r.key, { note: e.target.value })} title="Ghi chú dòng" /> : r.note}</td>
                {editable && <td><button type="button" className="btn btn-xs" title="Bỏ dòng" onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : [blank()]))}>×</button></td>}
              </tr>
            );
          })}</tbody>
        </table>
        {editable && <button type="button" className="btn btn-sm" style={{ marginTop: 6 }} onClick={() => setRows((rs) => [...rs, blank()])} title="Thêm một dòng hàng">+ Thêm dòng</button>}
      </div>
    </Modal>
  );
}
