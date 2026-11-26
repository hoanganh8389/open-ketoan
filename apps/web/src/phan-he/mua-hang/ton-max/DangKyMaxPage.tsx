/**
 * PHIẾU ĐĂNG KÝ TỒN MAX (MH17) — 2 lần / tháng shop đăng ký lại max; chi nhánh đăng ký max cho hàng mới.
 *   Mã có sẵn: chọn shop → phần mềm điền sẵn mọi mã của shop (tồn, bán / ngày, max hiện tại, max gợi ý) → sửa max đề nghị → gửi duyệt.
 *     Duyệt = ghi max (Tồn max MH16). Lệch nhỏ (≤ % cài ở Công thức) thì duyệt tự động. POS gửi phiếu qua API cùng khuôn.
 *   Hàng mới (NCC gửi mẫu, mã chưa có): bảng mặt hàng × shop, mỗi shop điền max; duyệt khi chưa có mã thì chờ — có mã (tạo ở
 *     Danh mục mặt hàng khi hàng về) thì gắn mã vào dòng, max ghi ngay cho từng shop.
 * Danh sách lọc theo ngày lập, không phân trang.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileDown, FileUp, Plus, Sparkles } from 'lucide-react';
import { MAX_REQUEST_STATUS, type MaxRequestItem, type MaxRequestKind, type MaxRequestStatus } from '@bizcity/mua-hang-domain';
import { PageHeader } from '@/components/PageHeader';
import { DataGrid, type Column } from '@/components/DataGrid';
import { ErrorBox, Loading, Modal } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { monthStart, today } from '../du-lieu';
import { ChonMatHang, type CatalogItem } from '../thanh-phan/ChonMatHang';
import { NhapExcelChung } from '../thanh-phan/NhapExcelChung';
import { docSo, fold, num, qtyFmt, stockApi, useHierarchy, type BranchNode, type MaxRequest } from './api';
import { ChonChiNhanhCha, ChuaPhanCap, CN_NONE, OSo, useMotChiNhanh } from './chung'; // [2026-11-25 kiennt] NT-MH-009 — ô số gõ tay (đóng góp)
import { useThaoTac } from '@/lib/manHinh';
// [2026-11-26 kiennt] NT-MH-022 — bảng tham số + thanh lọc chuẩn (Chi nhánh · Kỳ) dùng chung như MH11 (đóng góp)
import { FilterLayout } from '@/components/ReportPanel';
import { BranchSelect, DateRange } from '@/components/filters';

const TONE: Record<MaxRequestStatus, string> = { draft: 'info', submitted: 'warn', approved: 'ok', cancelled: 'bad' };

type MoPhieu = { id?: string; kind: MaxRequestKind; branchCode?: string; parent: string };

export function DangKyMaxPage() {
  const tt = useThaoTac('mua-hang.dang-ky-max'); // [2026-11-13 08:00 PM kiennt] NT-HT-003 — nút lập phiếu theo thao tác "them" của màn MH17 (đóng góp)
  const h = useHierarchy();
  // [2026-11-26 kiennt] NT-MH-022 — ô Chi nhánh chung, MỘT chi nhánh một lúc (useMotChiNhanh); lọc phía trình duyệt (shop hoặc chi nhánh cha của phiếu), API không đổi (đóng góp)
  const cn = useMotChiNhanh();
  const branchCodes = cn.value;
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [open, setOpen] = useState<MoPhieu | null>(null);
  const [sel, setSel] = useState<MaxRequest | null>(null);
  const q = useQuery({ queryKey: ['ton-max', 'max-requests', from, to], queryFn: () => stockApi.maxRequests({ from, to }) });
  const all = useMemo(() => {
    const rows = q.data ?? [];
    if (!branchCodes) return rows;
    if (branchCodes === CN_NONE) return [];
    const picked = new Set(branchCodes.split(','));
    return rows.filter((r) => picked.has(r.branchCode) || (r.parentCode && picked.has(r.parentCode)));
  }, [q.data, branchCodes]);
  // Lập phiếu cần MỘT chi nhánh cha; chưa rõ (bỏ chọn hết, mã chưa phân cấp) thì hỏi ở hộp "Lập phiếu cho chi nhánh".
  const parent = cn.parent;
  // [2026-11-26 kiennt] NT-MH-022 — nút lập phiếu luôn bấm được; chưa rõ chi nhánh thì hỏi chọn (thay cho nút mờ) (đóng góp)
  const [hoiCN, setHoiCN] = useState<{ kind: MaxRequestKind; code: string } | null>(null);
  const lap = (kind: MaxRequestKind, p: string) => setOpen(kind === 'new_item' ? { kind, branchCode: p, parent: p } : { kind, parent: p });
  const batDauLap = (kind: MaxRequestKind) => (parent ? lap(kind, parent) : setHoiCN({ kind, code: '' }));
  const moPhieu = (r: MaxRequest) => setOpen({ id: r.id, kind: r.kind, parent: r.parentCode || r.branchCode });
  const cols: Column<MaxRequest>[] = [
    { key: 'code', header: 'Số phiếu', type: 'code', width: 120 },
    { key: 'createdAt', header: 'Ngày lập', width: 130, value: (r) => r.createdAt, render: (r) => new Date(r.createdAt).toLocaleString('vi-VN') },
    { key: 'kind', header: 'Loại', width: 110, value: (r) => (r.kind === 'new_item' ? 'Hàng mới' : 'Mã có sẵn'), render: (r) => <span className={`tm-chip ${r.kind === 'new_item' ? 'warn' : 'info'}`}>{r.kind === 'new_item' ? 'Hàng mới' : 'Mã có sẵn'}</span> },
    { key: 'branch', header: 'Chi nhánh / shop', width: 200, value: (r) => `${r.branchCode} ${r.branchName}`, render: (r) => <><b className="mono">{r.branchCode}</b> {r.branchName}</> },
    { key: 'title', header: 'Tiêu đề', width: 220 },
    { key: 'itemCount', header: 'Số mã', type: 'number', width: 70, sum: true },
    { key: 'unlinked', header: 'Chưa có mã', type: 'number', width: 80, render: (r) => (r.unlinked ? <span className="tm-low">{r.unlinked}</span> : '') },
    { key: 'status', header: 'Trạng thái', width: 110, value: (r) => MAX_REQUEST_STATUS[r.status], render: (r) => <span className={`tm-chip ${TONE[r.status]}`}>{MAX_REQUEST_STATUS[r.status]}</span> },
    { key: 'source', header: 'Nguồn', width: 70, value: (r) => r.source.toUpperCase() },
    { key: 'createdBy', header: 'Người lập', width: 120 },
    { key: 'approvedBy', header: 'Người duyệt', width: 140 },
  ];
  return (
    <>
      <PageHeader title="Phiếu đăng ký tồn max (shop)" code="MH17" helpKey="mua-hang-dang-ky-max" subtitle="Shop lập phiếu đề nghị max; kế toán mua hàng duyệt (duyệt = ghi tồn max). Hàng mới chưa có mã: chi nhánh đăng ký max cho từng shop" />
      {/* [2026-11-26 kiennt] NT-MH-022 — thanh lọc chuẩn + hàng nút trên lưới như MH11 (đóng góp) */}
      <FilterLayout filters={<>
        <DateRange from={from} to={to} remember={false} onChange={(a, b) => { setFrom(a); setTo(b); }} />
        <BranchSelect value={cn.value} onChange={cn.onChange} />
      </>}>
        <div className="card">
          <ChuaPhanCap branches={h.data?.branches} />
          <div className="row" style={{ gap: 6, padding: '6px 12px', flexWrap: 'wrap' }}>
            {tt.them && <button type="button" className="btn btn-sm btn-primary" onClick={() => batDauLap('existing')}>+ Phiếu shop đăng ký max</button>}
            {tt.them && <button type="button" className="btn btn-sm" onClick={() => batDauLap('new_item')}>+ Phiếu hàng mới</button>}
            <button type="button" className="btn btn-sm" disabled={!sel} title={sel ? `Mở phiếu ${sel.code}` : 'Bấm chọn một phiếu trong lưới'} onClick={() => sel && moPhieu(sel)}>{sel?.status === 'approved' || sel?.status === 'cancelled' ? 'Xem' : 'Mở / sửa'}</button>
            <button type="button" className="btn btn-sm" onClick={() => void q.refetch()}>Nạp</button>
            <span className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>{all.length} phiếu{parent ? ` · lập phiếu cho chi nhánh ${parent}` : ''}</span>
          </div>
          {/* [2026-11-25 kiennt] NT-MH-006 — bỏ dải ô đếm Tất cả / Chờ duyệt / Nháp / Đã duyệt / Hàng mới chờ gắn mã; lọc trạng thái ở cột Trạng thái của lưới (đóng góp) */}
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {q.isLoading ? <Loading /> : <DataGrid rows={all} columns={cols} rowKey={(r) => r.id} storageKey="dang-ky-max" onSelect={setSel} onRowClick={moPhieu} exportName="phieu-dang-ky-max" emptyText="Chưa có phiếu nào trong kỳ và chi nhánh đang chọn." />}
        </div>
      </FilterLayout>
      {hoiCN && <Modal title={hoiCN.kind === 'new_item' ? 'Lập phiếu hàng mới cho chi nhánh' : 'Lập phiếu shop đăng ký max cho chi nhánh'} onClose={() => setHoiCN(null)}
        footer={<>
          <button type="button" className="btn" onClick={() => setHoiCN(null)}>Huỷ</button>
          <button type="button" className="btn btn-primary" disabled={!hoiCN.code} title={hoiCN.code ? '' : 'Chọn một chi nhánh'} onClick={() => { lap(hoiCN.kind, hoiCN.code); setHoiCN(null); }}>Lập phiếu</button>
        </>}>
        <p className="muted" style={{ marginTop: 0 }}>Ô Chi nhánh chưa chọn chi nhánh nào — phiếu lập cho một chi nhánh, chọn chi nhánh:</p>
        <ChonChiNhanhCha value={hoiCN.code} onChange={(code) => setHoiCN((x) => (x ? { ...x, code } : x))} />
      </Modal>}
      {open && open.parent && <PhieuDangKy key={open.id ?? open.kind} parent={open.parent} init={open} branches={h.data?.branches ?? []} onClose={() => setOpen(null)} />}
    </>
  );
}

function PhieuDangKy({ parent, init, branches, onClose }: { parent: string; init: { id?: string; kind: MaxRequestKind; branchCode?: string }; branches: BranchNode[]; onClose: () => void }) {
  const qc = useQueryClient();
  const tt = useThaoTac('mua-hang.dang-ky-max'); // [2026-11-13 08:00 PM kiennt] NT-HT-003 — Lưu / Gửi duyệt / Duyệt / Huỷ theo thao tác màn MH17 (đóng góp)
  const luu = init.id ? tt.sua : tt.them;
  const shops = branches.filter((b) => b.level === 'shop' && b.parentCode === parent);
  const cur = useQuery({ queryKey: ['ton-max', 'max-request', init.id], enabled: Boolean(init.id), queryFn: () => stockApi.maxRequest(init.id!) });
  const [branch, setBranch] = useState(init.branchCode ?? '');
  const [items, setItems] = useState<MaxRequestItem[] | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [search, setSearch] = useState('');
  const [add, setAdd] = useState(false);
  const [imp, setImp] = useState(false);
  const [impShop, setImpShop] = useState(false); // [2026-11-25 kiennt] NT-MH-006 — nhập Excel phiếu shop đăng ký max (đóng góp)
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const req = cur.data;
  const kind = req?.kind ?? init.kind;
  const br = req?.branchCode ?? branch;
  const list = items ?? req?.items ?? [];
  const locked = req?.status === 'cancelled' || (req?.status === 'approved' && kind === 'existing');
  // Phiếu mới của shop: điền sẵn mọi mã của shop theo gợi ý.
  const sug = useQuery({ queryKey: ['ton-max', 'max-suggest', branch], enabled: !init.id && kind === 'existing' && Boolean(branch), queryFn: () => stockApi.maxSuggest(branch) });
  const rows = items ?? (init.id ? req?.items ?? [] : kind === 'existing' ? (sug.data ?? []) : []);
  const tonOf = useMemo(() => new Map((sug.data ?? []).map((s) => [s.sku, s.ton])), [sug.data]);
  const set = (key: string, p: Partial<MaxRequestItem>) => setItems(rows.map((x) => (x.key === key ? { ...x, ...p } : x)));
  const shown = rows.filter((r) => (!onlyChanged || (r.proposedMax ?? 0) !== (r.currentMax ?? 0)) && (!search || fold(`${r.sku} ${r.name} ${r.nccSku ?? ''}`).includes(fold(search))));

  const save = async (opt: { submit?: boolean; approve?: boolean }) => {
    setBusy(true); setErr('');
    try {
      const body = { kind, branchCode: br, title: title ?? req?.title ?? '', note: note ?? req?.note ?? '', items: rows.filter((r) => kind === 'new_item' || (r.proposedMax ?? 0) !== (r.currentMax ?? -1) || init.id), submit: opt.submit || opt.approve };
      if (!body.items.length) throw new Error('Không có dòng nào đổi max so với hiện tại');
      let saved = await stockApi.saveMaxRequest(body, req?.id);
      if (opt.approve && saved.status !== 'approved') saved = await stockApi.approveMaxRequest(saved.id);
      await qc.invalidateQueries({ queryKey: ['ton-max'] });
      onClose();
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  const approve = async () => { setBusy(true); try { await stockApi.approveMaxRequest(req!.id); await qc.invalidateQueries({ queryKey: ['ton-max'] }); onClose(); } catch (e) { setErr(errorText(e)); } finally { setBusy(false); } };
  const cancel = async () => { if (!window.confirm('Huỷ phiếu này?')) return; try { await stockApi.cancelMaxRequest(req!.id); await qc.invalidateQueries({ queryKey: ['ton-max'] }); onClose(); } catch (e) { setErr(errorText(e)); } };
  // [2026-11-25 kiennt] NT-MH-006 — mặt hàng đang dùng CHƯA CÓ MAX ở ít nhất một shop của chi nhánh (đóng góp)
  /** Mỗi mã: max đang có theo shop (shop chưa có thì không có khoá). Chỉ lấy mã còn shop chưa có max. */
  const chuaCoMax = async () => {
    const codes = shops.map((x) => x.code);
    const [ds, lv] = await Promise.all([api.get<CatalogItem[]>('/api/v1/products', { status: 'active', pageSize: 1_000_000 }), stockApi.levels({ branchCodes: codes })]);
    const co = new Map<string, Record<string, number>>();
    for (const l of lv) if (l.max > 0) { const m = co.get(l.sku) ?? {}; m[l.branchCode] = (m[l.branchCode] ?? 0) + l.max; co.set(l.sku, m); }
    const out = ds.filter((p) => codes.some((c) => !(co.get(p.sku)?.[c]))).sort((a, b) => a.sku.localeCompare(b.sku)).map((p) => ({ sku: p.sku, name: p.name, unit: p.unit, co: co.get(p.sku) ?? {} }));
    if (!out.length) throw new Error('Mọi mặt hàng đang dùng đã có max ở mọi shop — sửa max ở Tồn max (MH16) hoặc phiếu shop');
    return out;
  };
  const daCo = (co: Record<string, number>) => Object.entries(co).map(([c, m]) => `${c}: ${m}`).join('; ');
  const template = async () => {
    const XLSX = await import('@/lib/excelChuan').then((m) => m.xlsxChuan()); // [2026-11-11 Nguyễn Văn Thủy] xuất Excel định dạng chuẩn (đóng góp)
    const head = ['Tên hàng', 'Mã bên NCC', 'Mã hàng', 'ĐVT', 'Quy cách', 'Ghi chú', ...shops.map((s) => s.code)];
    // Phiếu còn trống: tệp có sẵn mặt hàng chưa có max (cột Ghi chú ghi shop đã có max) — điền số vào cột shop là xong.
    const body = rows.length ? rows.map((r) => [r.name, r.nccSku ?? '', r.sku, r.unit ?? '', r.pack ?? '', r.note ?? '', ...shops.map((s) => r.maxByShop?.[s.code] ?? '')])
      : await chuaCoMax().then((ds) => ds.map((x) => [x.name, '', x.sku, x.unit, '', daCo(x.co) ? `Đã có max — ${daCo(x.co)}` : '', ...shops.map(() => '')]), (e: Error) => { window.alert(e.message); return null; });
    if (!body) return;
    const ws = XLSX.utils.aoa_to_sheet([head, shops.length ? ['', '', '', '', '', 'Tên shop →', ...shops.map((s) => s.name)] : [], ...body]);
    ws.headerRows = shops.length ? [0, 1] : [0]; // [2026-11-25 kiennt] NT-MH-006 — chỉ rõ dòng tiêu đề (dòng 2 = tên shop), không để tự đoán (đóng góp)
    ws['!cols'] = [{ wch: Math.min(60, Math.max(36, ...body.map((r) => String(r[0] ?? '').length + 2))) }, { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 9 }, { wch: 24 }, ...shops.map(() => ({ wch: 12 }))];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Dang ky max'); XLSX.writeFile(wb, `dang-ky-max-hang-moi-${parent}.xlsx`);
  };
  const exportExisting = async () => {
    const XLSX = await import('@/lib/excelChuan').then((m) => m.xlsxChuan()); // [2026-11-11 Nguyễn Văn Thủy] xuất Excel định dạng chuẩn (đóng góp)
    const ws = XLSX.utils.aoa_to_sheet([['Mã hàng', 'Tên hàng', 'Tồn', 'Bán / ngày', 'Max hiện tại', 'Max gợi ý', 'Max đề nghị', 'Ghi chú'], ...rows.map((r) => [r.sku, r.name, tonOf.get(r.sku) ?? '', r.avgPerDay ?? '', r.currentMax ?? 0, r.suggestedMax ?? 0, r.proposedMax ?? 0, r.note ?? ''])]);
    ws.headerRows = [0]; // [2026-11-25 kiennt] NT-MH-006 — dòng 1 là tiêu đề cột (đóng góp)
    ws['!cols'] = [{ wch: 12 }, { wch: 40 }, { wch: 8 }, { wch: 10 }, { wch: 11 }, { wch: 10 }, { wch: 11 }, { wch: 24 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Dang ky max'); XLSX.writeFile(wb, `dang-ky-max-${br}.xlsx`);
  };

  return (
    // [2026-11-25 kiennt] NT-MH-007 — phiếu hàng mới: chi nhánh + số shop lên tiêu đề cửa sổ, bỏ nhãn vàng trong phiếu (đóng góp)
    <Modal wide title={`${req ? `${req.code} · ` : ''}${kind === 'new_item' ? `Phiếu đăng ký max hàng mới — ${branches.find((b) => b.code === parent)?.name ?? parent} (${parent}) · ${shops.length} shop` : 'Phiếu shop đăng ký tồn max'}${req ? ` — ${MAX_REQUEST_STATUS[req.status]}` : ''}`} onClose={onClose}
      footer={<>
        {req && req.status !== 'cancelled' && !(req.status === 'approved' && kind === 'existing') && tt.huy && <button className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={() => void cancel()}>Huỷ phiếu</button>}
        {!locked && <>
          {(!req || req.status === 'draft') && luu && <button className="btn" disabled={busy} onClick={() => void save({})}>Lưu nháp</button>}
          {(!req || req.status === 'draft') && luu && <button className="btn" disabled={busy} onClick={() => void save({ submit: true })}>Gửi duyệt</button>}
          {req?.status === 'approved' && kind === 'new_item' && tt.sua && <button className="btn btn-primary" disabled={busy} onClick={() => void save({})}>Lưu (gắn mã → ghi max)</button>}
          {req?.status === 'submitted' && tt.sua && <button className="btn" disabled={busy} onClick={() => void save({ submit: true })}>Lưu sửa</button>}
          {req?.status === 'submitted' ? tt.duyet && <button className="btn btn-primary" disabled={busy} onClick={() => void approve()}>Duyệt (ghi max)</button>
            : req?.status !== 'approved' && luu && tt.duyet && <button className="btn btn-primary" disabled={busy} onClick={() => void save({ approve: true })}>Lưu & duyệt</button>}
        </>}
        <button className="btn" onClick={onClose}>Đóng</button>
      </>}>
      {init.id && cur.isLoading ? <Loading /> : <>
        {/* [2026-11-25 kiennt] NT-MH-006 — đầu phiếu chia 2 hàng: ① thông tin phiếu (shop / chi nhánh, tiêu đề); ② thao tác với bảng (tìm, lọc bên trái — thêm, Excel bên phải; Xuất Excel từ chân phiếu lên cạnh Nhập Excel) (đóng góp) */}
        <div className="full row" style={{ gap: 8, alignItems: 'center' }}>
          {kind === 'existing' ? (
            <label className="tm-parent"><span>Shop</span><select className="select input" disabled={Boolean(req)} value={br} onChange={(e) => { setBranch(e.target.value); setItems(null); }}>
              <option value="">— chọn shop —</option><option value={parent}>★ Kho chi nhánh {parent}</option>
              {shops.map((s) => <option key={s.code} value={s.code}>{s.code} · {s.name}</option>)}</select></label>
          ) : null}
          <label className="tm-parent" style={{ flex: 1 }}><span>Tiêu đề</span><input className="input" style={{ flex: 1 }} placeholder="vd Đăng ký max kỳ 2 tháng 10" value={title ?? req?.title ?? ''} disabled={locked} onChange={(e) => setTitle(e.target.value)} /></label>
        </div>
        <div className="full row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="input" type="search" placeholder="Tìm mã / tên…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 220 }} />
          {kind === 'existing' && <label className="checkbox"><input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} /> Chỉ mã đổi max</label>}
          <span className="grow" style={{ flex: 1 }} />
          {/* [2026-11-26 kiennt] NT-MH-016 — max đề nghị không còn điền sẵn gợi ý; muốn lấy gợi ý cho nhiều mã thì bấm nút này (các dòng đang hiện) (đóng góp) */}
          {!locked && kind === 'existing' && br && <button className="btn btn-sm" title="Điền max gợi ý (theo tốc độ bán) vào Max đề nghị cho các dòng đang hiện có gợi ý — sửa lại được trước khi lưu" onClick={() => { const on = new Set(shown.filter((r) => r.suggestedMax).map((r) => r.key)); setItems(rows.map((r) => (on.has(r.key) ? { ...r, proposedMax: r.suggestedMax } : r))); }}><Sparkles size={13} /> Điền max gợi ý</button>}
          {!locked && kind === 'existing' && br && <button className="btn btn-sm" onClick={() => setAdd(true)}><Plus size={13} /> Thêm mã</button>}
          {!locked && kind === 'new_item' && <button className="btn btn-sm" onClick={() => setItems([...rows, { key: `n${Date.now().toString(36)}`, sku: '', name: '', maxByShop: {} }])}><Plus size={13} /> Thêm dòng</button>}
          {!locked && (kind === 'new_item' || br) && <button className="btn btn-sm" onClick={() => (kind === 'new_item' ? setImp(true) : setImpShop(true))}><FileUp size={13} /> Nhập Excel</button>}
          {(kind === 'new_item' || br) && <button className="btn btn-sm" onClick={() => void (kind === 'new_item' ? template() : exportExisting())} title={kind === 'new_item' ? 'Tải bảng mặt hàng × shop (có sẵn cột từng shop) để gửi NCC / shop điền' : 'Xuất các dòng đang có trên phiếu'}><FileDown size={13} /> Xuất Excel</button>}
        </div>
        {req && <div className="full muted" style={{ fontSize: 12 }}>Lập bởi {req.createdBy} lúc {new Date(req.createdAt).toLocaleString('vi-VN')} (nguồn {req.source.toUpperCase()}){req.approvedBy ? ` · duyệt bởi ${req.approvedBy}` : ''}{req.pendingApply ? ` · còn ${req.pendingApply} dòng chờ gắn mã mới ghi max` : ''}</div>}
        {kind === 'existing' ? (
          !br ? <div className="full empty">Chọn shop — phần mềm điền sẵn mọi mã của shop kèm max gợi ý theo tốc độ bán.</div> : sug.isLoading ? <Loading /> : (
            <div className="full tm-matrix"><table><thead><tr><th>Mã hàng</th><th>Tên hàng</th><th className="num">Tồn</th><th className="num">Bán / ngày</th><th className="num">Max hiện tại</th><th className="num">Gợi ý</th><th className="num">Max đề nghị</th><th className="num">Chênh</th><th>Ghi chú</th></tr></thead><tbody>
              {shown.map((r) => {
                const d = (r.proposedMax ?? 0) - (r.currentMax ?? 0);
                return <tr key={r.key}>
                  <td className="mono">{r.sku}</td><td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.name}>{r.name}</td>
                  <td className="num tm-stock">{qtyFmt(tonOf.get(r.sku))}</td><td className="num">{qtyFmt(r.avgPerDay)}</td><td className="num">{qtyFmt(r.currentMax)}</td>
                  <td className="num">{r.suggestedMax ? <button className="tm-opt" disabled={locked} onClick={() => set(r.key, { proposedMax: r.suggestedMax })}><span className="tm-sug">{qtyFmt(r.suggestedMax)}</span></button> : ''}</td>
                  <td className="num"><OSo className={`tm-input${d ? ' dirty' : ''}`} disabled={locked} value={r.proposedMax} onChange={(v) => set(r.key, { proposedMax: v })} /></td>
                  <td className="num">{d ? <span className={d > 0 ? 'tm-sug' : 'tm-low'}>{d > 0 ? '+' : ''}{qtyFmt(d)}{r.currentMax ? ` (${Math.round((d / r.currentMax) * 100)}%)` : ''}</span> : ''}</td>
                  <td><input className="input" style={{ height: 26, width: 160 }} disabled={locked} value={r.note ?? ''} onChange={(e) => set(r.key, { note: e.target.value })} /></td>
                </tr>;
              })}
              {!shown.length && <tr><td colSpan={9} className="muted">Không có dòng nào.</td></tr>}
            </tbody></table></div>
          )
        ) : (
          <div className="full tm-matrix"><table><thead><tr>
            <th className="stick">Tên hàng (theo NCC)</th><th>Mã bên NCC</th><th>Mã hàng</th><th>ĐVT</th><th>Quy cách</th><th className="num">Tổng max</th>
            {shops.map((s) => <th key={s.code} className="num" title={s.name}>{s.code}<div className="muted" style={{ fontSize: 10, fontWeight: 400, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div></th>)}
            <th /></tr></thead><tbody>
            {shown.map((r) => <tr key={r.key}>
              <td className="stick"><input className="input" style={{ height: 26, width: 230 }} disabled={locked} value={r.name} placeholder="Tên hàng" onChange={(e) => set(r.key, { name: e.target.value })} /></td>
              <td><input className="input" style={{ height: 26, width: 100 }} disabled={locked} value={r.nccSku ?? ''} onChange={(e) => set(r.key, { nccSku: e.target.value })} /></td>
              <td><input className="input mono" style={{ height: 26, width: 110, background: r.sku ? '#effbf3' : '#fff7e6' }} disabled={req?.status === 'cancelled'} value={r.sku} placeholder="chưa có mã" title="Có mã hàng (tạo ở Danh mục mặt hàng khi hàng về) thì gõ vào đây — lưu là ghi max" onChange={(e) => set(r.key, { sku: e.target.value.trim() })} /></td>
              <td><input className="input" style={{ height: 26, width: 60 }} disabled={locked} value={r.unit ?? ''} onChange={(e) => set(r.key, { unit: e.target.value })} /></td>
              <td><input className="tm-input" style={{ width: 54 }} disabled={locked} value={r.pack ?? ''} onChange={(e) => set(r.key, { pack: num(e.target.value) || undefined })} /></td>
              <td className="num"><b>{qtyFmt(Object.values(r.maxByShop ?? {}).reduce((s, x) => s + x, 0))}</b></td>
              {shops.map((s) => <td key={s.code}><OSo className="tm-input" style={{ width: 54 }} disabled={req?.status === 'cancelled' || (req?.status === 'approved' && Boolean(r.sku))} value={r.maxByShop?.[s.code]} onChange={(v) => set(r.key, { maxByShop: { ...(r.maxByShop ?? {}), [s.code]: v } })} /></td>)}
              <td>{!locked && <button className="btn btn-xs" onClick={() => setItems(rows.filter((x) => x.key !== r.key))}>✕</button>}</td>
            </tr>)}
            {!shown.length && <tr><td colSpan={7 + shops.length} className="muted">Bấm "Thêm dòng" hoặc "Nhập Excel" (tệp NCC gửi / shop đã điền theo mẫu — nút Xuất Excel tải mẫu có sẵn cột từng shop).</td></tr>}
          </tbody></table></div>
        )}
        <textarea className="input full" rows={2} placeholder="Ghi chú phiếu" disabled={locked} value={note ?? req?.note ?? ''} onChange={(e) => setNote(e.target.value)} />
        {err && <div className="full alert alert-bad">{err}</div>}
      </>}
      {add && <ChonMatHang existing={new Map(rows.map((r) => [r.sku, '✓ đã có']))} onClose={() => setAdd(false)} onPick={(p) => setItems([...rows, { key: p.sku, sku: p.sku, name: p.name, unit: p.unit, currentMax: 0, proposedMax: 0 }])} />}
      {impShop && <NhapExcelChung<'sku' | 'name' | 'max' | 'note', MaxRequestItem> onClose={() => setImpShop(false)} onAdd={(l) => {
        // [2026-11-25 kiennt] NT-MH-006 — mã đã có trên phiếu: thay max đề nghị (và ghi chú); mã chưa có: thêm dòng (đóng góp)
        setImpShop(false);
        const by = new Map(l.map((x) => [x.sku, x]));
        const merged = rows.map((r) => { const x = by.get(r.sku); if (!x) return r; by.delete(r.sku); return { ...r, proposedMax: x.proposedMax, ...(x.note ? { note: x.note } : {}) }; });
        setItems([...merged, ...by.values()]);
      }} s={{
        title: `Nhập Excel max đề nghị — shop ${br}`, file: `mau-dang-ky-max-${br}.xlsx`, keyField: 'sku',
        columns: [
          { name: 'Mã hàng', required: true, aliases: 'Mã SP', example: 'SP001', note: 'Mã trong danh mục mặt hàng' },
          { name: 'Tên hàng', example: 'Sữa bột 800g', note: 'Chỉ để xem — nhập bỏ qua' },
          { name: 'ĐVT', example: 'Lon', note: 'Chỉ để xem' },
          { name: 'Tồn', example: 12, note: 'Tồn của shop — chỉ để xem' },
          { name: 'Bán / ngày', example: 1.5, note: 'Chỉ để xem' },
          { name: 'Max hiện tại', example: 10, note: 'Chỉ để xem' },
          { name: 'Max gợi ý', example: 11, note: 'Bán / ngày × số ngày đủ hàng — chỉ để xem' },
          { name: 'Max đề nghị', aliases: 'Max', example: 12, note: 'Số ≥ 0 theo ĐVT nhỏ nhất. Để trống = bỏ qua dòng' },
          { name: 'Ghi chú', example: '', note: '' },
        ],
        spec: [['sku', ['ma hang', 'ma sp']], ['name', ['ten hang']], ['max', ['max de nghi', 'max']], ['note', ['ghi chu']]],
        mau: async () => {
          // Mặt hàng đang dùng CHƯA CÓ MAX ở shop này (mã đã có max nằm sẵn trên phiếu); mã có tồn / bán kèm số của shop. Max đề nghị để trống cho shop điền.
          // Lấy số của shop ngay lúc tải (phiếu nháp mở lại không có sẵn gợi ý) — để lọc đúng mã đã có max.
          const [ds, sg] = await Promise.all([api.get<CatalogItem[]>('/api/v1/products', { status: 'active', pageSize: 1_000_000 }), stockApi.maxSuggest(br)]);
          const sugBy = new Map(sg.map((x) => [x.sku, x]));
          const skus = [...new Set([...sg.map((x) => x.sku), ...ds.map((p) => p.sku)])].filter((k) => !((sugBy.get(k)?.currentMax ?? 0) > 0)).sort((a, b) => a.localeCompare(b));
          if (!skus.length) throw new Error('Mọi mặt hàng đang dùng đã có max ở shop này — sửa max ngay trên phiếu');
          const pBy = new Map(ds.map((p) => [p.sku, p]));
          return skus.map((k) => {
            const x = sugBy.get(k); const p = pBy.get(k);
            return [k, x?.name ?? p?.name ?? '', x?.unit ?? p?.unit ?? '', x ? x.ton : '', x?.avgPerDay ?? '', x?.currentMax ?? '', x?.suggestedMax ?? '', '', ''];
          });
        },
        map: (r) => {
          const sku = String(r.sku ?? '').trim();
          const raw = String(r.max ?? '').trim();
          if (!raw) return { skip: true };
          const v = docSo(raw);
          if (!Number.isFinite(v) || v < 0) return { error: `${sku}: Max đề nghị "${raw}" không phải số ≥ 0` };
          return { value: { key: sku, sku, name: String(r.name ?? '').trim(), currentMax: 0, proposedMax: v, note: String(r.note ?? '').trim() || undefined } };
        },
        check: async (list) => {
          const [ds, sg] = await Promise.all([api.get<CatalogItem[]>('/api/v1/products', { status: 'all', pageSize: 1_000_000 }), stockApi.maxSuggest(br)]);
          const pBy = new Map(ds.map((p) => [p.sku, p]));
          // Mã phải có trong danh mục; điền tên / ĐVT / max hiện tại theo phiếu (hoặc danh mục). Trùng mã: onAdd lấy dòng sau.
          return list.map((x) => {
            const p = pBy.get(x.sku);
            if (!p) return `Mã ${x.sku} chưa có trong danh mục mặt hàng`;
            const cur = rows.find((r) => r.sku === x.sku) ?? sg.find((r) => r.sku === x.sku);
            x.name = cur?.name || p.name; x.unit = cur?.unit ?? p.unit; x.currentMax = cur?.currentMax ?? 0;
            return undefined;
          });
        },
        head: ['Mã hàng', 'Tên hàng', 'Max hiện tại', 'Max đề nghị', 'Ghi chú'], cells: (x) => [x.sku, x.name, qtyFmt(x.currentMax), qtyFmt(x.proposedMax), x.note ?? ''],
        note: 'Tải file mẫu: có sẵn các mặt hàng đang dùng CHƯA CÓ MAX ở shop này (kèm tồn / bán nếu có); mã đã có max nằm sẵn trên phiếu, sửa ngay trên phiếu hoặc thêm dòng vào tệp. Chỉ điền cột Max đề nghị; dòng để trống được bỏ qua. Trùng mã trong tệp: lấy dòng sau.',
      }} />}
      {imp && <NhapExcelChung<string, MaxRequestItem> onClose={() => setImp(false)} onAdd={(l) => { setImp(false); setItems([...rows, ...l]); }} s={{
        title: 'Nhập hàng mới từ Excel (mỗi shop một cột max)', file: `mau-dang-ky-max-hang-moi-${parent}.xlsx`, keyField: 'name',
        columns: [
          { name: 'Tên hàng', required: true, aliases: 'Tên sản phẩm', example: 'Sữa bột mới 800g', note: 'Tên theo NCC' },
          { name: 'Mã bên NCC', aliases: 'Mã NCC', example: 'NCC-001', note: 'Mã hàng của NCC' },
          { name: 'Mã hàng', aliases: 'Mã SP', example: '', note: 'Để trống nếu chưa có mã' },
          { name: 'ĐVT', example: 'Lon', note: 'ĐVT nhỏ nhất' },
          { name: 'Quy cách', example: 6, note: 'Số ĐVT / thùng' },
          { name: 'Đã có max ở', example: '', note: 'Chỉ để xem — shop đã có max (ô của shop đó để trống = giữ max cũ)' },
          ...shops.map((s) => ({ name: s.code, example: '', note: `Max của shop ${s.name}. Trống = không đổi` })),
        ],
        // Tải file mẫu: có sẵn mặt hàng đang dùng còn shop chưa có max; chỉ điền số vào cột từng shop.
        mau: async () => (await chuaCoMax()).map((x) => [x.name, '', x.sku, x.unit, '', daCo(x.co), ...shops.map(() => '')]),
        spec: [['name', ['ten hang', 'ten san pham']], ['ncc', ['ma ben ncc', 'ma ncc']], ['sku', ['ma hang', 'ma sp']], ['unit', ['dvt']], ['pack', ['quy cach']], ...shops.map((s) => [s.code, [fold(s.code)]] as [string, string[]])],
        map: (r) => {
          const name = String(r.name ?? '').trim();
          if (!name || name === 'Tên shop →') return { error: 'thiếu tên hàng' };
          const maxByShop: Record<string, number> = {};
          for (const s of shops) {
            const v = String(r[s.code] ?? '').trim(); if (!v) continue;
            const n = docSo(v); if (!Number.isFinite(n) || n < 0) return { error: `${name} — shop ${s.code}: max "${v}" không phải số ≥ 0` };
            maxByShop[s.code] = n;
          }
          // Dòng có mã (từ tệp mẫu) mà chưa điền shop nào: bỏ qua, không đưa vào phiếu.
          if (String(r.sku ?? '').trim() && !Object.keys(maxByShop).length) return { skip: true };
          return { value: { key: `n${Math.random().toString(36).slice(2, 8)}`, name, nccSku: String(r.ncc ?? '').trim() || undefined, sku: String(r.sku ?? '').trim(), unit: String(r.unit ?? '').trim() || undefined, pack: num(String(r.pack ?? '')) || undefined, maxByShop } };
        },
        check: async (list) => {
          // Dòng ghi mã: mã phải có trong danh mục (không thì phiếu chờ gắn mã mãi).
          const ds = await api.get<CatalogItem[]>('/api/v1/products', { status: 'all', pageSize: 1_000_000 });
          const co = new Set(ds.map((p) => p.sku));
          return list.map((x) => (x.sku && !co.has(x.sku) ? `Mã ${x.sku} chưa có trong danh mục mặt hàng (hàng chưa có mã thì để trống cột Mã hàng)` : undefined));
        },
        head: ['Tên hàng', 'Mã NCC', 'Mã hàng', 'Số shop có max', 'Tổng max'], cells: (x) => [x.name, x.nccSku ?? '', x.sku || '—', Object.keys(x.maxByShop ?? {}).length, qtyFmt(Object.values(x.maxByShop ?? {}).reduce((s, v) => s + v, 0))],
      }} />}
    </Modal>
  );
}
