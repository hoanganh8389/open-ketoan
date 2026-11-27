/**
 * KHO04 Đề nghị điều chuyển (NT-BH-056) — danh sách + form. Đề nghị lập từ máy bán (thay bảng wp_global_po_adjustment của website) hoặc ở đây;
 * người có quyền duyệt bấm Duyệt → lập phiếu chuyển kho KHO01 (xuất luôn, chờ chi nhánh nhận xác nhận) hoặc Từ chối.
 * Bố cục theo lớp chung Core: FilterLayout (kỳ, chi nhánh, trạng thái), thanh nút catalog-toolbar trong card, DataGrid sát mép.
 */
// [2026-11-28 10:00 AM Võ Hoàng] NGHIEM-THU — NT-BH-056: màn KHO04 đề nghị điều chuyển (đóng góp)
import { useState } from 'react';
import { BranchCheckList, DataGrid, ErrorBox, FilterLayout, PageHeader, PeriodField, errorText, useApi, useCan, useQuery, type GridColumn } from '@bizcity/ui-kit';
import { M, P_DUYET, P_LAP, STATUS, monthStart, qtyText, today, type Phieu, type Status } from '../lib';
import { DeNghiForm } from './DeNghiForm';

export function DeNghiPage() {
  const api = useApi();
  const can = useCan();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [branches, setBranches] = useState('');
  const [status, setStatus] = useState<Status | ''>('');
  const [sel, setSel] = useState<Phieu | null>(null);
  const [open, setOpen] = useState<{ phieu: Phieu | null } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['dndc', 'list', from, to, branches, status],
    queryFn: () => api.get<{ items: Phieu[] }>(`${M}/phieu`, { from, to, branchCodes: branches || undefined, status: status || undefined }),
  });
  const rows = q.data?.items ?? [];
  const firstBranch = branches.split(',').filter(Boolean)[0] ?? '';

  const columns: GridColumn<Phieu>[] = [
    { key: 'docDate', header: <span title="Ngày lập đề nghị">Ngày</span>, type: 'date', width: 95 },
    { key: 'docNo', header: <span title="Số đề nghị">Số đề nghị</span>, type: 'code', width: 170 },
    { key: 'branchCode', header: <span title="Chi nhánh đề nghị (xuất hàng)">Chi nhánh đề nghị</span>, type: 'code', width: 110 },
    { key: 'warehouseCode', header: <span title="Kho xuất">Kho xuất</span>, type: 'code', width: 110 },
    { key: 'toBranchCode', header: <span title="Chi nhánh nhận">Chi nhánh nhận</span>, width: 180, value: (r) => `${r.toBranchCode} ${r.toBranchName}`.trim() },
    { key: 'totalItems', header: <span title="Số dòng hàng">Số mã</span>, type: 'number', width: 70, sum: true },
    { key: 'totalQty', header: <span title="Tổng số lượng (ĐVT nhỏ nhất)">Tổng SL</span>, type: 'number', width: 90, sum: true, value: (r) => qtyText(r.totalQty) },
    { key: 'status', header: <span title="Trạng thái đề nghị">Trạng thái</span>, width: 140, value: (r) => STATUS[r.status] ?? r.status },
    { key: 'transfer', header: <span title="Phiếu chuyển kho KHO01 lập khi duyệt">Phiếu chuyển kho</span>, type: 'code', width: 140, value: (r) => r.transfer?.docNo ?? '' },
    { key: 'source', header: <span title="Nơi lập">Nơi lập</span>, width: 90, value: (r) => (r.source === 'pos' ? 'Máy bán' : 'Kế toán') },
    { key: 'createdByName', header: <span title="Người lập">Người lập</span>, width: 140 },
    { key: 'decidedByName', header: <span title="Người duyệt / từ chối / huỷ">Người xử lý</span>, width: 140 },
    { key: 'note', header: <span title="Ghi chú">Ghi chú</span>, width: 220 },
  ];

  return (
    <div>
      <PageHeader title="Đề nghị điều chuyển" code="KHO04"
        subtitle="Cửa hàng đề nghị chuyển hàng của mình sang chi nhánh khác; duyệt thì lập phiếu chuyển kho KHO01 (xuất luôn, chi nhánh nhận xác nhận ở Chuyển kho)." />
      <ErrorBox error={q.error ? errorText(q.error) : null} />
      {notice && <div className="alert alert-ok" role="status">{notice}</div>}
      <FilterLayout onSearch={() => q.refetch()} filters={<>
        <PeriodField from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        <BranchCheckList value={branches} onChange={setBranches} />
        <label>Trạng thái <select className="input" value={status} onChange={(e) => setStatus(e.target.value as Status | '')} title="Lọc theo trạng thái">
          <option value="">Tất cả</option>
          {(Object.keys(STATUS) as Status[]).map((s) => <option key={s} value={s}>{STATUS[s]}</option>)}
        </select></label>
      </>}>
        <div className="card">
          <div className="catalog-toolbar">
            {can(P_LAP) && <button type="button" className="btn btn-sm btn-primary" title="Lập đề nghị điều chuyển mới" onClick={() => { setNotice(null); setOpen({ phieu: null }); }}>+ Thêm</button>}
            <button type="button" className="btn btn-sm" disabled={!sel} title={sel ? 'Mở đề nghị đang chọn' : 'Chọn một dòng ở bảng'} onClick={() => sel && setOpen({ phieu: sel })}>
              {sel && sel.status === 'pending' && (can(P_LAP) || can(P_DUYET)) ? (can(P_DUYET) ? 'Xem / Duyệt' : 'Sửa') : 'Xem'}
            </button>
            <button type="button" className="btn btn-sm btn-nap" title="Nạp lại danh sách" onClick={() => void q.refetch()}>⟳ Nạp</button>
          </div>
          <DataGrid<Phieu> rows={rows} columns={columns} rowKey={(r) => r.id} storageKey="dndc-list" exportName="de-nghi-dieu-chuyen"
            emptyText="Không có đề nghị điều chuyển trong khoảng đã chọn." onRowClick={(r) => setSel(r)} onRowDoubleClick={(r) => setOpen({ phieu: r })} />
        </div>
      </FilterLayout>
      {open && (
        <DeNghiForm phieu={open.phieu} branchCode={open.phieu?.branchCode ?? firstBranch} onClose={() => setOpen(null)}
          onSaved={(p, m) => { setNotice(m ?? null); setSel(p); setOpen(p.status === 'pending' ? { phieu: p } : null); }} />
      )}
    </div>
  );
}
