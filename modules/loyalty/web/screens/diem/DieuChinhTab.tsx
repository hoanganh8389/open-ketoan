// [2026-11-25 09:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-039: thẻ Điều chỉnh (L4) — danh sách yêu cầu, lập, duyệt / từ chối (đóng góp)
import { useState } from 'react';
import { DataGrid, ErrorBox, Loading, errorText, useApi, useCan, useQuery, useQueryClient, type GridColumn } from '@bizcity/ui-kit';
import { DieuChinhForm } from './DieuChinhForm';
import { DuyetModal } from './DuyetModal';
import { M, PERM, STATUS_LABEL, type Adjustment } from './model';

const cols: GridColumn<Adjustment>[] = [
  { key: 'code', header: 'Số', type: 'code', width: 110 },
  { key: 'createdAt', header: 'Lúc lập', width: 140, value: (a) => new Date(a.createdAt).toLocaleString('vi-VN') },
  { key: 'customerCode', header: 'Mã khách', type: 'code', width: 120 },
  { key: 'points', header: <span title="Dương = cộng, âm = trừ">Điểm</span>, type: 'number', sum: true, width: 90 },
  { key: 'reason', header: 'Lý do', width: 220 },
  { key: 'status', header: 'Trạng thái', width: 100, value: (a) => STATUS_LABEL[a.status] ?? a.status },
  { key: 'createdByName', header: 'Người lập', width: 130 },
  { key: 'approvedByName', header: 'Người duyệt / từ chối', width: 150 },
  { key: 'rejectReason', header: 'Lý do từ chối', width: 160 },
];

export function DieuChinhTab() {
  const api = useApi();
  const can = useCan();
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<'' | 'lap' | 'duyet'>('');
  const [msg, setMsg] = useState('');
  const q = useQuery({ queryKey: ['loyalty', 'adjustments'], queryFn: () => api.get<{ items: Adjustment[] }>(`${M}/adjustments`) });
  const items = q.data?.items ?? [];
  const pending = items.filter((a) => a.status === 'pending');
  const done = (m: string) => { setDialog(''); setMsg(m); void qc.invalidateQueries({ queryKey: ['loyalty'] }); };
  return (
    <section className="card">
      {/* [2026-11-27 Võ Hoàng] NGHIEM-THU — NT-BH-051: thanh nút catalog-toolbar trong card như màn Core (đóng góp) */}
      <div className="catalog-toolbar">
        {can(PERM.dcLap) && <button type="button" className="btn btn-sm btn-primary" title="Lập yêu cầu cộng / trừ điểm (bắt buộc lý do)" onClick={() => setDialog('lap')}>+ Lập điều chỉnh</button>}
        {can(PERM.dcDuyet) && <button type="button" className="btn btn-sm" title="Yêu cầu đang chờ duyệt" disabled={!pending.length} onClick={() => setDialog('duyet')}>Duyệt / từ chối ({pending.length})</button>}
        <button type="button" className="btn btn-sm btn-nap" disabled={q.isFetching} title="Nạp lại danh sách" onClick={() => void q.refetch()}>{q.isFetching ? 'Đang nạp…' : '⟳ Nạp'}</button>
      </div>
      <div className="card-body" style={{ paddingTop: 8, paddingBottom: 0 }}>
        <p className="muted" style={{ margin: 0 }}>Điều chỉnh tay cộng / trừ điểm của khách, bắt buộc lý do; người khác có quyền duyệt mới ghi vào sổ điểm (dòng "điều chỉnh"). Không trừ quá số điểm khách đang có.</p>
        {msg && <div className="alert alert-ok" role="status" style={{ marginTop: 8 }}>{msg}</div>}
      </div>
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={errorText(q.error)} /> : (
        <DataGrid rows={items} columns={cols} rowKey={(a) => a.id} storageKey="loyalty.dieu-chinh" exportName="dieu-chinh-diem" emptyText="Chưa có yêu cầu điều chỉnh" />
      )}
      {dialog === 'lap' && <DieuChinhForm onClose={() => setDialog('')} onDone={done} />}
      {dialog === 'duyet' && <DuyetModal kind="adjustment" items={pending} onClose={() => setDialog('')} onDone={done} />}
    </section>
  );
}
