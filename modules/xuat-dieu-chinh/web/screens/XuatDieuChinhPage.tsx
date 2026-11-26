/**
 * BH06 Phiếu xuất điều chỉnh (NT-BH-044) — danh sách + form lập + in 02-VT, một chỗ lập duy nhất.
 * Danh sách gồm phiếu của module (nháp / đã ghi sổ / đã huỷ, 0 đ và có giá) và phiếu cũ do cầu nối gửi (sourceSystem btsoft,
 * sourceRef.type export_adjust — đọc ở danh sách chứng từ của Core, chỉ người có quyền xem chứng từ). Cột Loại "0 đ" / "Có giá", tổng tiền.
 * Phiếu cũ huỷ bằng lệnh huỷ chứng từ của Core (cần quyền huỷ phiếu BH06 + quyền ghi chứng từ — module chưa huỷ được chứng từ của nguồn
 * khác, đề xuất mức 4 P4 ở phiếu NT-BH-044 §6).
 */
// [2026-11-26 03:10 PM Võ Hoàng] NGHIEM-THU — NT-BH-044: màn BH06 trong module (đóng góp)
import { useMemo, useState } from 'react';
import { BranchCheckList, DataGrid, ErrorBox, FilterLayout, Modal, PageHeader, PeriodField, errorText, useApi, useCan, useQuery, useQueryClient, type GridColumn } from '@bizcity/ui-kit';
import { M, P_HUY, P_LAP, STATUS, type Phieu, type Reason } from '../lib';
import { inPhieu02VT } from './In02VT';
import { PhieuXuatForm } from './PhieuXuatForm';

type CoreDoc = { id: string; docKey: string; docType: string; docNo: string; docDate: string; total: number; status: string; branchCode: string;
  partnerCode: string | null; partnerName: string | null; description: string; sourceSystem: string };
type Row = Phieu & { coreDocKey?: string };

const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/** Phiếu cũ của cầu nối → dòng danh sách (chỉ xem, in, huỷ). */
const fromCore = (d: CoreDoc): Row => ({
  id: d.id, docNo: d.docNo, docDate: d.docDate.slice(0, 10), branchCode: d.branchCode, warehouseCode: '', reasonCode: '', purposeCode: null,
  priced: d.docType === 'sale', kind: d.docType === 'sale' ? 'priced' : 'zero', partner: d.partnerCode ? { code: d.partnerCode, name: d.partnerName ?? '' } : null,
  receiverName: '', employeeName: '', description: d.description, lines: [], total: d.total, status: d.status === 'cancelled' ? 'cancelled' : 'posted', version: 0,
  ledgerStatus: d.status, copiedFrom: null, belowCost: [], cancelReason: null, createdBy: '', createdByName: '', source: 'btsoft', coreDocKey: d.docKey,
});

export function XuatDieuChinhPage() {
  const api = useApi();
  const can = useCan();
  const qc = useQueryClient();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [branches, setBranches] = useState('');
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState<{ phieu: Phieu | null; copyFrom?: Phieu | null } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [old, setOld] = useState<Row | null>(null);
  const [oldReason, setOldReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reasons = useQuery({ queryKey: ['xdc', 'reasons'], queryFn: () => api.get<Reason[]>('/api/v1/posting/reasons'), staleTime: 60_000 }).data ?? [];
  const q = useQuery({
    queryKey: ['xdc', 'list', from, to, branches, kind, status],
    queryFn: () => api.get<{ items: Phieu[]; total: number }>(`${M}/phieu`, { from, to, branchCodes: branches || undefined, kind: kind || undefined, status: status || undefined }),
  });
  const core = useQuery({
    queryKey: ['xdc', 'core', from, to, branches],
    queryFn: async () => (await api.getPage<CoreDoc[]>('/api/v1/documents', { from, to, branchCodes: branches || undefined, sourceType: 'export_adjust', sourceSystem: 'btsoft', pageSize: 1_000_000 })).data,
    enabled: can('documents:read'), retry: false,
  });
  const rows: Row[] = useMemo(() => {
    const own = (q.data?.items ?? []) as Row[];
    const legacy = (core.data ?? []).map(fromCore).filter((r) => (!kind || r.kind === kind) && (!status || r.status === status));
    return [...own, ...legacy].sort((a, b) => (a.docDate < b.docDate ? 1 : a.docDate > b.docDate ? -1 : 0));
  }, [q.data, core.data, kind, status]);
  const reasonName = (c: string) => reasons.find((r) => r.code === c)?.name ?? '';
  const branch = branches.split(',').filter(Boolean)[0] ?? '';

  const columns: GridColumn<Row>[] = [
    { key: 'pick', header: '', noSort: true, noFilter: true, width: 32, render: (r) => r.source === 'module'
      ? <input type="checkbox" checked={picked.has(r.id)} onChange={(e) => { const s = new Set(picked); if (e.target.checked) s.add(r.id); else s.delete(r.id); setPicked(s); }} onClick={(e) => e.stopPropagation()} /> : null },
    { key: 'docDate', header: 'Ngày', type: 'date' },
    { key: 'docNo', header: 'Số phiếu', type: 'code' },
    { key: 'branchCode', header: 'Chi nhánh', type: 'code' },
    { key: 'warehouseCode', header: 'Kho', type: 'code' },
    { key: 'kind', header: 'Loại', value: (r) => (r.kind === 'priced' ? 'Có giá' : '0 đ') },
    { key: 'reasonCode', header: 'Lý do', type: 'code' },
    { key: 'reasonName', header: 'Tên lý do', value: (r) => reasonName(r.reasonCode) },
    { key: 'partner', header: 'Người nhận', value: (r) => r.partner?.name || r.receiverName },
    { key: 'description', header: 'Diễn giải' },
    { key: 'total', header: 'Tổng tiền', type: 'money', sum: true },
    { key: 'status', header: 'Trạng thái', value: (r) => STATUS[r.status] ?? r.status },
    { key: 'source', header: 'Nguồn', value: (r) => (r.source === 'btsoft' ? 'Cầu nối (cũ)' : 'BH06') },
  ];

  async function cancelOld() {
    if (!old?.coreDocKey) return;
    if (!oldReason.trim()) { setError('Nhập lý do huỷ'); return; }
    try {
      await api.post('/api/v1/documents/cancel', { docKey: old.coreDocKey, reason: oldReason.trim() });
      setOld(null); setOldReason(''); setError(null);
      await qc.invalidateQueries({ queryKey: ['xdc'] });
    } catch (err) { setError(errorText(err)); }
  }

  const chosen = rows.filter((r) => picked.has(r.id));
  return (
    <div>
      <PageHeader title="Phiếu xuất điều chỉnh" code="BH06" subtitle="Xuất dùng nội bộ, tặng, dùng thử, huỷ hỏng… — Lưu là ghi sổ và trừ kho; phiếu có giá là bán nội bộ, không hoá đơn điện tử"
        actions={<div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn" disabled={!chosen.length} onClick={() => inPhieu02VT(chosen, reasons)}>In 02-VT ({chosen.length})</button>
          {can(P_LAP) && <button type="button" className="btn btn-primary" onClick={() => setOpen({ phieu: null })}>Thêm</button>}
        </div>} />
      <ErrorBox error={q.error ? errorText(q.error) : null} />
      <FilterLayout onSearch={() => q.refetch()} filters={<>
        <PeriodField from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        <BranchCheckList value={branches} onChange={setBranches} />
        <label>Loại <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">Tất cả</option><option value="zero">0 đ</option><option value="priced">Có giá</option></select></label>
        <label>Trạng thái <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Tất cả</option><option value="draft">Nháp</option><option value="posted">Đã ghi sổ</option><option value="cancelled">Đã huỷ</option></select></label>
      </>}>
        <DataGrid<Row> rows={rows} columns={columns} rowKey={(r) => `${r.source}:${r.id}`} storageKey="xdc-list" exportName="phieu-xuat-dieu-chinh"
          emptyText="Không có phiếu xuất điều chỉnh trong khoảng đã chọn."
          onRowClick={(r) => (r.source === 'module' ? setOpen({ phieu: r }) : setOld(r))} />
      </FilterLayout>
      {open && (
        <PhieuXuatForm phieu={open.phieu} copyFrom={open.copyFrom} branchCode={open.phieu?.branchCode ?? open.copyFrom?.branchCode ?? branch} reasons={reasons}
          onClose={() => setOpen(null)} onSaved={(p) => setOpen({ phieu: p })} onCopy={(p) => setOpen({ phieu: null, copyFrom: p })} />
      )}
      {old && (
        <Modal title={`Phiếu cũ ${old.docNo} (cầu nối)`} onClose={() => { setOld(null); setError(null); }} footer={
          can(P_HUY) && can('documents:write') && old.status === 'posted'
            ? <button type="button" className="btn btn-primary" onClick={cancelOld}>Huỷ phiếu (bút toán đảo)</button> : null}>
          <ErrorBox error={error} />
          <p>{old.kind === 'priced' ? 'Phiếu có giá' : 'Phiếu 0 đ'} — {old.branchCode} — {old.docDate} — {old.description}</p>
          {can(P_HUY) && can('documents:write') && old.status === 'posted' && (
            <label data-field="cancelReason">Lý do huỷ (bắt buộc) <input className="input" name="cancelReason" value={oldReason} onChange={(e) => setOldReason(e.target.value)} /></label>
          )}
        </Modal>
      )}
    </div>
  );
}
