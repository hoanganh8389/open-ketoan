/**
 * Màn danh sách phiếu hàng hoá dùng chung (bán hàng, hàng bán trả lại, mua hàng, trả hàng nhà cung cấp, chuyển kho).
 * Mỗi phân hệ chỉ cần: <PhieuHangPage kind="sale" code="BH10" seed={mau} helpKey="phieu-hang" />.
 *   - Lọc: khoảng ngày, chi nhánh, trạng thái, tìm nhanh (số phiếu, đối tượng, số hoá đơn, ghi chú).
 *   - Thanh nút như màn Kho (NT-BH-045): + Thêm · Sửa / Xem · In · Nạp · Xuất Excel — ẩn theo quyền thao tác của màn (HT12).
 *     Duyệt (ghi sổ) / Bỏ duyệt nằm trong phiếu (chân phiếu) như phiếu mua; chứng từ không xoá (§7).
 *   - Nhãn "DỮ LIỆU GIẢ" khi loại phiếu đang chạy dữ liệu mẫu (đổi ở API → Nguồn dữ liệu màn hình).
 */
import { dongChungTu } from '@/lib/trangThai';
import { RefreshCw } from 'lucide-react';
import { workBranch } from '@/lib/workBranch';
import { useThemTuDiaChi } from '@/lib/themNhanh';
import { useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useMoLaiHopThoai } from '@/layout/WindowDock';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { defaultTo } from '@/lib/format';
import { KIND_INFO, emptyDoc, tradeApi, type TradeDoc, type TradeKind } from '@/lib/tradeDocs';
import { PageHeader } from '@/components/PageHeader';
import { FilterLayout } from '@/components/ReportPanel';
import { DateRange, BranchSelect } from '@/components/filters';
import { DataGrid, type Column } from '@/components/DataGrid';
import { khoLabel, useKho } from './ChonKho';
import { ErrorBox, Loading } from '@/components/ui';
import { PhieuHangForm, type GiuPhieuHang } from './PhieuHangForm';
import { TRADE_TEMPLATES } from './printTemplates';
import { PrintButton } from '@/components/print';
import { advisoryText, useDocumentGate } from '@/components/PostingGate';
// [2026-11-26 09:00 PM Võ Hoàng] NGHIEM-THU — NT-BH-045: nút theo quyền thao tác của màn (như KHO01), Duyệt trong phiếu; NT-BH-047: cột người lập / duyệt, phiếu gốc, đã thu (đóng góp)
import { useThaoTac } from '@/lib/manHinh';
import { useAuth } from '@/lib/auth';

const STATUS: Record<string, string> = { draft: 'Nháp', approved: 'Đã duyệt' };

export function PhieuHangPage({ kind, code, seed, helpKey = 'phieu-hang', subtitle }: { kind: TradeKind; code: string; seed: TradeDoc[]; helpKey?: string; subtitle?: string }) {
  const info = KIND_INFO[kind];
  const tenNguoi = useTenNguoi();
  const tt = useThaoTac(kind === 'sale_return' ? 'ban-hang.tra-lai' : 'ban-hang.phieu-ban');
  const khoAll = useKho();
  const qc = useQueryClient();
  const svc = useMemo(() => tradeApi(kind, seed), [kind, seed]);
  const [f, setF] = useState({ from: `${defaultTo().slice(0, 8)}01`, to: defaultTo(), branchCodes: '', status: '', search: '' });
  const [search, setSearch] = useState('');
  const [sel, setSel] = useState<TradeDoc | null>(null);
  const [editing, setEditing] = useState<TradeDoc | null>(null);
  useThemTuDiaChi((p) => {
    const d = emptyDoc(kind, workBranch.get() || '');
    const kh = p.get('kh');
    if (!kh) return setEditing(d);
    // Mở từ cột Chức năng của danh sách khách hàng: điền sẵn khách (tên, MST lấy từ danh mục).
    void api.get<{ code: string; name: string; taxCode?: string | null }[]>('/api/v1/partners', { search: kh, pageSize: 5 }).catch(() => [])
      .then((rows) => { const r = rows.find((x) => x.code === kh); setEditing({ ...d, partner: { code: kh, name: r?.name ?? kh, taxCode: r?.taxCode ?? undefined } }); });
  });
  const exportRef = useRef<(() => void) | null>(null);
  const key = ['trade', kind, svc.source, f];
  const q = useQuery({ queryKey: key, queryFn: () => svc.list({ ...f, status: f.status || undefined, search: f.search || undefined }) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['trade', kind] });
  // Sửa phiếu đã có rồi Ghi: ở lại, mở lại form bằng bản vừa lưu ở chế độ xem (đổi key để form dựng lại).
  const [formKey, setFormKey] = useState(0);
  // [2026-11-21 Võ Hoàng] NGHIEM-THU — NT-BH-036: form có khung riêng (cùng mẫu phiếu mua) — nút Sửa của danh sách mở thẳng chế độ sửa
  // bằng cờ startEdit (thay openNextInEdit của khung hộp thoại chung); ghi xong / bấm đúp thì mở ở chế độ xem như trước (đóng góp)
  const [startEdit, setStartEdit] = useState(false);
  // [2026-11-26 06:10 PM Nguyễn Văn Thủy] DOCK — tải lại trang / mất điện: mở lại phiếu hàng đang dở đúng nội dung (đóng góp)
  const loc = useLocation();
  const [khoiPhuc, setKhoiPhuc] = useState<GiuPhieuHang | undefined>();
  useMoLaiHopThoai('phieu-hang', loc.pathname, (list) => {
    const g = list[list.length - 1]?.draft as GiuPhieuHang | null;
    if (g?.v) { setKhoiPhuc(g); setStartEdit(Boolean(g.startEdit)); setEditing(g.v); }
  });
  const save = useMutation({ mutationFn: (d: TradeDoc) => svc.save(d), onSuccess: (saved, d) => { setKhoiPhuc(undefined); if (d.id) { setStartEdit(false); setEditing(saved); setFormKey((k) => k + 1); } else setEditing(null); void refresh(); } });
  // [2026-11-02 04:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — S020-21b: duyệt phiếu (nguồn API: vào sổ) khi còn cảnh báo kiểm chuẩn của ngày phiếu ⇒ một dòng bằng chứng; dữ liệu giả lập thì không ghi.
  // NT-BH-045: Duyệt / Bỏ duyệt gọi từ chân phiếu đang mở; cảnh báo kiểm chuẩn theo ngày của phiếu đang mở.
  const gate = useDocumentGate(editing?.docDate);
  const status = useMutation({
    /** Duyệt: phiếu mới / đang sửa chưa ghi → Ghi trước (bản đang thấy trên màn) rồi Duyệt. */
    mutationFn: async (p: { doc: TradeDoc; s: 'draft' | 'approved'; dirty?: boolean }) => {
      const id = p.dirty || !p.doc.id ? (await svc.save(p.doc)).id : p.doc.id;
      return svc.setStatus(id, p.s);
    },
    onSuccess: (d, p) => {
      if (p.s === 'approved' && svc.source === 'api') gate.acknowledge({ docType: kind, docDate: d.docDate, docNo: d.docNo });
      setSel(d); setKhoiPhuc(undefined); setStartEdit(false); setEditing(d); setFormKey((x) => x + 1); save.reset(); void refresh();
    },
  });
  const duyet = (doc: TradeDoc, dirty: boolean) => {
    if (gate.advisories.length && !window.confirm(`Duyệt phiếu ${doc.docNo || '(mới)'}?` + advisoryText(gate.advisories))) return;
    status.mutate({ doc, s: 'approved', dirty });
  };
  const boDuyet = () => {
    if (!editing || !window.confirm(`Bỏ duyệt phiếu ${editing.docNo}? Chứng từ trong sổ sẽ được huỷ (bút toán đảo), phiếu về Nháp để sửa.`)) return;
    status.mutate({ doc: editing, s: 'draft' });
  };
  const open = async (row: TradeDoc) => setEditing(await svc.get(row.id));

  const columns: Column<TradeDoc>[] = [
    { key: 'docDate', header: 'Ngày', type: 'date', width: 100 },
    { key: 'docNo', header: 'Số phiếu', type: 'code', width: 120 },
    { key: 'branchCode', header: info.isTransfer ? 'Chi nhánh xuất' : 'Chi nhánh', type: 'code', width: 110 },
    { key: 'warehouseCode', header: info.isTransfer ? 'Kho xuất' : 'Kho', width: 150, title: 'Kho ở đầu phiếu (trống = kho mặc định của chi nhánh)', value: (r) => khoLabel(khoAll, r.warehouseCode) },
    ...(info.isTransfer ? [{ key: 'toBranchCode', header: 'Chi nhánh nhận', type: 'code', width: 110 } as Column<TradeDoc>, { key: 'toWarehouseCode', header: 'Kho nhận', width: 150, value: (r: TradeDoc) => khoLabel(khoAll, r.toWarehouseCode) } as Column<TradeDoc>] : []),
    ...(info.partner ? [{ key: 'partner', header: info.partnerLabel, width: 220, value: (r: TradeDoc) => (r.partner ? `${r.partner.code} — ${r.partner.name}` : info.partner === 'customer' ? 'Khách lẻ' : '') } as Column<TradeDoc>] : []),
    ...(info.hasInvoice ? [{ key: 'invoice', header: 'Số hoá đơn', type: 'code', width: 110, value: (r: TradeDoc) => r.invoice?.no ?? '' } as Column<TradeDoc>] : []),
    { key: 'lines', header: 'Số dòng', type: 'number', width: 70, value: (r) => r.lines.length },
    ...(!info.isTransfer ? [
      { key: 'beforeTax', header: 'Tiền hàng', type: 'money', width: 120, sum: true, value: (r: TradeDoc) => r.totals.beforeTax } as Column<TradeDoc>,
      { key: 'tax', header: 'Tiền thuế', type: 'money', width: 110, sum: true, value: (r: TradeDoc) => r.totals.tax } as Column<TradeDoc>,
      { key: 'total', header: 'Tổng tiền', type: 'money', width: 130, sum: true, bold: true, value: (r: TradeDoc) => r.totals.total } as Column<TradeDoc>,
    ] : []),
    { key: 'status', header: 'Trạng thái', width: 90, value: (r) => STATUS[r.status] ?? r.status },
    // NT-BH-047: phiếu gốc (BH11), đã thu / còn nợ, người lập / người duyệt.
    ...(info.hasOriginal ? [{ key: 'originalDocNo', header: 'Phiếu gốc', type: 'code', width: 120, title: 'Số phiếu bán gốc mà phiếu trả này trả' } as Column<TradeDoc>] : []),
    ...(info.hasPayments ? [
      { key: 'paid', header: kind === 'sale_return' ? 'Đã trả' : 'Đã thu', type: 'money', width: 110, sum: true, title: kind === 'sale_return' ? 'Tiền đã trả khách trên phiếu' : 'Tiền đã thu trên phiếu (các hình thức không ghi nợ)', value: (r: TradeDoc) => (r.payments ?? []).reduce((x, p) => x + p.amount, 0) } as Column<TradeDoc>,
      { key: 'debt', header: kind === 'sale_return' ? 'Trừ công nợ' : 'Còn nợ', type: 'money', width: 110, sum: true, title: 'Tổng tiền − đã thu / đã trả: phần ghi công nợ khách', value: (r: TradeDoc) => Math.max(0, r.totals.total - (r.payments ?? []).reduce((x, p) => x + p.amount, 0)) } as Column<TradeDoc>,
    ] : []),
    { key: 'createdBy', header: 'Người lập', width: 130, title: 'Người ghi phiếu lần đầu', value: (r) => (r.createdBy ? tenNguoi(r.createdBy) : '') },
    { key: 'approvedBy', header: 'Người duyệt', width: 130, title: 'Người duyệt (ghi sổ) — trống khi phiếu còn nháp', value: (r) => (r.status === 'approved' && r.approvedBy ? tenNguoi(r.approvedBy) : '') },
    { key: 'approvedAt', header: 'Ngày duyệt', type: 'date', width: 100, title: 'Ngày duyệt (ghi sổ)', value: (r) => (r.status === 'approved' && r.approvedAt ? r.approvedAt.slice(0, 10) : '') },
    { key: 'note', header: 'Ghi chú', width: 200 },
  ];

  return (
    <>
      <PageHeader title={info.label} code={code} helpKey={helpKey}
        subtitle={subtitle ?? `Thêm, sửa, duyệt ${info.label.toLowerCase()}`} />
      {svc.source === 'mock' && (
        <div className="alert alert-info" style={{ marginBottom: 8 }}>
          <b>DỮ LIỆU GIẢ</b> — màn đang chạy bằng dữ liệu mẫu lưu ở trình duyệt này (chưa vào sổ kế toán), chờ API thật.
          Đổi nguồn ở <Link to="/tich-hop/nguon-du-lieu">API → Nguồn dữ liệu màn hình</Link>.
        </div>
      )}
      {/* [2026-11-25 Nguyễn Văn Thủy] bộ lọc theo khung chung: thanh lọc chuẩn ngoài màn + Tất cả bộ lọc (đóng góp) */}
      <FilterLayout filters={<>
        <DateRange from={f.from} to={f.to} onChange={(from, to) => setF((x) => ({ ...x, from, to }))} />
        <BranchSelect value={f.branchCodes} onChange={(v) => setF((x) => ({ ...x, branchCodes: v }))} />
        <div className="field"><label>Trạng thái</label>
          <select className="select input" value={f.status} onChange={(e) => setF((x) => ({ ...x, status: e.target.value }))}>
            <option value="">Mọi trạng thái</option><option value="draft">Nháp</option><option value="approved">Đã duyệt</option>
          </select></div>
      </>}>
      <div className="card">
        {/* [2026-11-26 10:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-045: hàng nút sát bảng (không khoảng trống dưới); hàng lọc 1 giữ nguyên (đóng góp) */}
        <div className="row ck-toolbar" style={{ gap: 6, padding: '6px 0 0', marginBottom: 0, flexWrap: 'wrap', alignItems: 'center' }}>
          {tt.them && <button className="btn btn-sm btn-primary" title={`Lập ${info.label.toLowerCase()} mới — chi nhánh điền sẵn chi nhánh đang làm việc`}
            onClick={() => { save.reset(); setStartEdit(false); setEditing(emptyDoc(kind, workBranch.get() || (f.branchCodes.split(',')[0] ?? ''))); setFormKey((x) => x + 1); }}>+ Thêm</button>}
          <button className="btn btn-sm" disabled={!sel} title={!sel ? 'Chọn một phiếu ở bảng dưới' : sel.status === 'approved' ? 'Phiếu đã duyệt — mở xem; Bỏ duyệt ở chân phiếu' : tt.sua ? 'Mở phiếu để sửa' : 'Mở phiếu (chỉ xem — chưa có quyền Sửa)'}
            onClick={() => { if (!sel) return; setStartEdit(sel.status !== 'approved' && Boolean(tt.sua)); void open(sel); }}>{sel?.status !== 'approved' && tt.sua ? 'Sửa' : 'Xem'}</button>
          {TRADE_TEMPLATES[kind] && <PrintButton small screen={code} templates={TRADE_TEMPLATES[kind]!} disabled={!sel} title="In phiếu đang chọn" getDocs={async () => (sel ? [await svc.get(sel.id)] : [])} />}
          <button className="btn btn-sm btn-nap" onClick={() => void q.refetch()} title="Nạp lại dữ liệu mới nhất từ máy chủ"><RefreshCw size={14} /> Nạp</button>
          {tt.xuat && <button className="btn btn-sm" onClick={() => exportRef.current?.()} title="Xuất bảng đang lọc ra Excel">Xuất Excel</button>}
          <span style={{ flex: 1 }} />
          <form className="row" style={{ gap: 4 }} data-no-search onSubmit={(e) => { e.preventDefault(); setF((x) => ({ ...x, search: search.trim() })); }}>
            <input className="input" style={{ width: 240, height: 28 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm: số phiếu, đối tượng, hoá đơn" />
            <button className="btn btn-sm" type="submit">Tìm</button>
          </form>
        </div>
        <ErrorBox error={q.error ? errorText(q.error) : null} />
        {q.isLoading ? <Loading /> : (
          <DataGrid storageKey={`phieu-${kind}-v1`} exportName={`phieu-${kind}`} exportRef={exportRef} rows={q.data?.data ?? []} rowKey={(r) => r.id}
            onSelect={setSel} onRowDoubleClick={(r) => { setStartEdit(false); void open(r); }} rowClassName={(r) => dongChungTu(r.status)} footerLabel="Cộng"
            emptyText={`Chưa có ${info.label.toLowerCase()} trong khoảng này — bấm "+ Thêm"`} columns={columns} />
        )}
      </div>
      </FilterLayout>
      {editing && <PhieuHangForm key={formKey} khoiPhuc={khoiPhuc} giuKey={`hang:${kind}:${editing.id || 'moi'}`} printScreen={code} helpKey={helpKey} startEdit={startEdit} value={editing} readOnly={editing.status === 'approved'} saving={save.isPending}
        error={save.error ?? status.error} onSave={(d) => save.mutate(d)} onClose={() => { setEditing(null); setKhoiPhuc(undefined); save.reset(); status.reset(); }}
        canApprove={tt.duyet && svc.source === 'api'} approving={status.isPending} onApprove={duyet} onUnapprove={boDuyet} />}
    </>
  );
}

/** Tên người theo mã (người lập / người duyệt): chính mình; danh sách người dùng khi có quyền quản lý người dùng; còn lại "Người dùng #id". */
function useTenNguoi() {
  const { user, can } = useAuth();
  const users = useQuery({ queryKey: ['users', 'ten'], queryFn: () => api.get<{ id: string; fullName: string }[]>('/api/v1/users'), enabled: can('users:write'), retry: false, staleTime: 10 * 60_000 });
  return (actor: string) => {
    const id = actor.startsWith('user:') ? actor.slice(5) : actor;
    if (user && String(user.id) === id) return user.fullName;
    return users.data?.find((x) => String(x.id) === id)?.fullName ?? (/^\d+$/.test(id) ? `Người dùng #${id}` : actor);
  };
}
