// [2026-11-27 12:40 PM Nguyễn Văn Thủy] KHO08 — #70 tab Test: báo cáo lô và hạn dùng ở Kho (và Mua hàng): tồn từng lô theo chi nhánh · kho,
// nhóm theo mức hạn (đã hết hạn / ≤ 7 / ≤ 15 / ≤ 30 ngày / còn hạn), lọc chung cây chi nhánh + kho (đóng góp)
/**
 * THẺ HẠN DÙNG của Tồn theo lô (KHO05; trước là màn riêng KHO08) — đọc cùng dữ liệu Tồn theo lô (KHO05): lô sinh từ phiếu nhập có số lô / hạn dùng (kể cả chỉ ghi hạn dùng).
 * Mỗi dòng: một lô còn tồn ở một chi nhánh · kho. Thẻ trên cùng bấm được để lọc nhanh theo mức hạn.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { FilterLayout } from '@/components/ReportPanel';
import { BranchSelect } from '@/components/filters';
import { DataGrid } from '@/components/DataGrid';
import { ErrorBox, Loading } from '@/components/ui';
import './ton-theo-lo.css';

interface LotRow {
  id: string; sku: string; name: string; lotNo: string; expDate: string | null; daysLeft: number | null; purchaseName: string;
  firstDocNo: string; firstDate: string | null; qtyIn: number; qtyOut: number; stock: number; branch: string; branchName: string; warehouse: string; warehouseName: string;
}
type Muc = 'expired' | 'm7' | 'm15' | 'm30' | 'ok' | 'none';
const MUC: Record<Muc, { label: string; title: string; cls: string }> = {
  expired: { label: 'Đã hết hạn', title: 'Hạn dùng đã qua: không xuất bán — trả NCC hoặc huỷ có biên bản', cls: 'badge-bad' },
  m7: { label: 'Còn ≤ 7 ngày', title: 'Còn từ 0 đến 7 ngày', cls: 'badge-bad' },
  m15: { label: 'Còn ≤ 15 ngày', title: 'Còn từ 8 đến 15 ngày', cls: 'badge-warn' },
  m30: { label: 'Còn ≤ 30 ngày', title: 'Còn từ 16 đến 30 ngày', cls: 'badge-warn' },
  ok: { label: 'Còn hạn', title: 'Còn trên 30 ngày', cls: 'badge-ok' },
  none: { label: 'Không hạn dùng', title: 'Dòng phiếu nhập không ghi hạn dùng', cls: '' },
};
const mucOf = (d: number | null): Muc => (d === null ? 'none' : d < 0 ? 'expired' : d <= 7 ? 'm7' : d <= 15 ? 'm15' : d <= 30 ? 'm30' : 'ok');
const viDate = (d: string | null) => (d ? d.split('-').reverse().join('/') : '');
const num = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 4 });

/** Thẻ "Hạn dùng" của màn Tồn theo lô (KHO05) — gộp vào KHO05 để không có hai màn lô. */
export function HanDungLo() {
  const [f, setF] = useState({ branchCodes: '', warehouses: '', search: '', muc: '' as '' | Muc });
  const set = (p: Partial<typeof f>) => setF((o) => ({ ...o, ...p }));
  const [search, setSearch] = useState('');
  const params = {
    split: '1', stock: '1',
    ...(f.branchCodes && f.branchCodes !== '-' ? { branchCodes: f.branchCodes } : {}),
    ...(f.warehouses ? { warehouses: f.warehouses } : {}),
    ...(f.search ? { search: f.search } : {}),
  };
  const q = useQuery({ queryKey: ['lots', 'bao-cao-han', params], queryFn: () => api.get<LotRow[]>('/api/v1/lots', params) });
  const all = (q.data ?? []).filter((l) => l.stock > 0);
  // Mặc định không liệt kê lô không ghi hạn dùng (báo cáo về hạn dùng); chọn "Không hạn dùng" ở Tình trạng hạn để xem.
  const rows = (f.muc ? all.filter((l) => mucOf(l.daysLeft) === f.muc) : all.filter((l) => l.daysLeft !== null))
    .slice().sort((a, b) => (a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9));
  const dem = (m: Muc) => all.filter((l) => mucOf(l.daysLeft) === m);
  return (
      <FilterLayout
        onSearch={() => set({ search: search.trim() })}
        filters={
          <form className="rp-form" onSubmit={(e) => { e.preventDefault(); set({ search: search.trim() }); }}>
            <div className="field"><label>Mã / tên / số lô</label><input className="input" placeholder="Mã, tên, số lô" value={search} onChange={(e) => setSearch(e.target.value)} onBlur={() => set({ search: search.trim() })} /></div>
            <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} warehouses={{ value: f.warehouses, onChange: (warehouses) => set({ warehouses }) }} />
            <div className="field"><label>Tình trạng hạn</label>
              <select className="select input" value={f.muc} onChange={(e) => set({ muc: e.target.value as '' | Muc })}>
                <option value="">Có hạn dùng</option>{(Object.keys(MUC) as Muc[]).map((m) => <option key={m} value={m}>{MUC[m].label}</option>)}
              </select>
            </div>
          </form>
        }
      >
        <div className="kpis">
          {(['expired', 'm7', 'm15', 'm30'] as Muc[]).map((m) => { const r = dem(m); return (
            <button key={m} type="button" className={`card kpi ${f.muc === m ? 'active' : ''}`} style={{ textAlign: 'left', cursor: 'pointer' }} title={`${MUC[m].title} — bấm để lọc`} onClick={() => set({ muc: f.muc === m ? '' : m })}>
              <div className="label">{MUC[m].label}</div>
              <div className={`value ${r.length ? 'mh-bad' : ''}`}>{r.length} lô</div>
              <div className="hint">{num(r.reduce((s, l) => s + l.stock, 0))} ĐVT</div>
            </button>); })}
        </div>
        <div className="card">
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {q.isLoading ? <Loading /> : (
            <DataGrid
              storageKey="kho08-lo-han"
              rows={rows}
              rowKey={(l) => `${l.id}|${l.branch}|${l.warehouse}`}
              exportName="bao-cao-lo-han-dung"
              emptyText="Không có lô còn tồn. Lô sinh ra khi phiếu nhập ghi số lô / hạn dùng."
              columns={[
                { key: 'sku', header: 'Mã hàng', title: 'Mã hàng', type: 'code' },
                { key: 'name', header: 'Tên hàng', title: 'Tên trong danh mục' },
                { key: 'lotNo', header: 'Số lô', title: 'Số lô của nhà cung cấp', type: 'code', render: (l) => l.lotNo || <span className="muted">không số</span> },
                { key: 'expDate', header: 'Hạn dùng', title: 'Hạn dùng của lô', render: (l) => viDate(l.expDate) || '—' },
                { key: 'daysLeft', header: 'Còn (ngày)', title: 'Số ngày còn tới hạn dùng (âm = đã quá hạn)', type: 'number', value: (l) => l.daysLeft },
                { key: 'muc', header: 'Tình trạng', title: 'Mức hạn: hết hạn / ≤ 7 / ≤ 15 / ≤ 30 ngày / còn hạn', value: (l) => MUC[mucOf(l.daysLeft)].label,
                  render: (l) => { const m = MUC[mucOf(l.daysLeft)]; return <span className={`badge ${m.cls}`} title={m.title}>{m.label}</span>; } },
                { key: 'branch', header: 'Chi nhánh', title: 'Chi nhánh đang giữ lô', type: 'code', render: (l) => <span title={l.branchName}>{l.branch}</span> },
                { key: 'warehouse', header: 'Kho', title: 'Phân kho đang giữ lô', type: 'code', render: (l) => <span title={l.warehouseName}>{l.warehouse || <span className="muted">—</span>}</span> },
                { key: 'stock', header: 'Tồn', title: 'Tồn của lô ở chi nhánh · kho này', type: 'qty', sum: true, bold: true },
                { key: 'firstDocNo', header: 'Phiếu nhập', title: 'Phiếu nhập đầu tiên của lô', type: 'code', render: (l) => <>{l.firstDocNo} <span className="muted">{viDate(l.firstDate)}</span></> },
              ]}
            />
          )}
        </div>
      </FilterLayout>
  );
}
