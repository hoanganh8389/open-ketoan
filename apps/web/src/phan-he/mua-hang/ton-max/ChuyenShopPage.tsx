/**
 * ĐỀ XUẤT CHUYỂN HÀNG XUỐNG SHOP (MH19) — 2 lần / tuần mỗi shop được chia hàng từ kho chi nhánh:
 *   cần chuyển = max shop − tồn shop − hàng đang đi đường đến shop − đề nghị đã chốt chưa làm; làm tròn theo thùng
 *   (tự động / nguyên thùng / lẻ — cài từng mã ở Tồn max); kho không đủ thì ưu tiên shop thiếu nhiều nhất so với max.
 * Sửa số chuyển, bỏ dòng, bấm "Chốt đề nghị" → mỗi shop một đề nghị chuyển. Thẻ "Đề nghị đã chốt": kế toán kho quét danh sách
 * này (hoặc kho / POS đọc qua API) để lên phiếu chuyển kho, rồi đánh dấu "Đã lên phiếu".
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, FileSpreadsheet, Send, SlidersHorizontal, Truck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { TRANSFER_ALLOCATIONS, TRANSFER_MODES, TRANSFER_ROUNDINGS, type TransferAllocation, type TransferRounding } from '@bizcity/mua-hang-domain';
import { PageHeader } from '@/components/PageHeader';
import { DataGrid, type Column } from '@/components/DataGrid';
import { ErrorBox, Loading, Modal } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { monthStart, today } from '../du-lieu';
import { fold, num, qtyFmt, stockApi, useHierarchy, type TransferRequest, type TransferSuggest, type TransferSuggestLine } from './api';
import { useMotChiNhanh } from './chung';
import { useThaoTac } from '@/lib/manHinh';
// [2026-11-26 kiennt] NT-MH-022 — bảng tham số + thanh lọc chuẩn (Chi nhánh · Kỳ) như MH11 / MH17 (đóng góp)
import { FilterLayout } from '@/components/ReportPanel';
import { BranchSelect, DateRange } from '@/components/filters';

type Row = TransferSuggestLine & { _group?: boolean; _key: string };
const lk = (l: TransferSuggestLine) => `${l.shopCode}|${l.sku}`;
const STATUS: Record<TransferRequest['status'], string> = { open: 'Chờ lên phiếu', done: 'Đã lên phiếu', cancelled: 'Đã huỷ' };
// [2026-11-13 10:00 AM kiennt] NT-MH-004 — tuỳ chọn làm tròn / phân bổ khi kho thiếu, nhớ trên máy người dùng
const OPT_KEY = 'mh19-tuy-chon';
const readOpts = (): { rounding: TransferRounding; allocation: TransferAllocation } => {
  try { const o = JSON.parse(localStorage.getItem(OPT_KEY) ?? '{}'); return { rounding: o.rounding ?? 'sku', allocation: o.allocation ?? 'shortage' }; } catch { return { rounding: 'sku', allocation: 'shortage' }; }
};
const saveOpts = (o: { rounding: TransferRounding; allocation: TransferAllocation }) => { try { localStorage.setItem(OPT_KEY, JSON.stringify(o)); } catch { /* trình duyệt chặn lưu: bỏ qua */ } };

export function ChuyenShopPage() {
  const [tab, setTab] = useState<'suggest' | 'list'>('suggest');
  // [2026-11-26 kiennt] NT-MH-022 — ô Chi nhánh chung, MỘT chi nhánh một lúc (cả chi nhánh); Kỳ chỉ dùng ở thẻ Đề nghị đã chốt (đóng góp)
  const cn = useMotChiNhanh({ caNhom: true });
  const parent = cn.parent;
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const seg = <div className="tm-sign"><button className={tab === 'suggest' ? 'on' : ''} onClick={() => setTab('suggest')}>Đề xuất chuyển</button><button className={tab === 'list' ? 'on' : ''} onClick={() => setTab('list')}>Đề nghị đã chốt</button></div>;
  return (
    <>
      <PageHeader title="Chuyển hàng xuống shop" code="MH19" helpKey="mua-hang-chuyen-shop" subtitle="Tự tính shop nào thiếu bao nhiêu so với tồn max (trừ hàng đang đi đường), làm tròn theo thùng, không vượt tồn kho — chốt thành đề nghị cho kho lên phiếu chuyển" />
      <FilterLayout filters={<>
        {tab === 'list' && <DateRange from={from} to={to} remember={false} onChange={(a, b) => { setFrom(a); setTo(b); }} />}
        <BranchSelect value={cn.value} onChange={cn.onChange} />
      </>}>
        {/* [2026-11-26 kiennt] NT-MH-024 — bỏ khung cảnh báo vàng "Chưa nhận được kho tổng…" (xem ở MH16 / DM16); nút Đề xuất / Đã chốt vào chung hàng công cụ (đóng góp) */}
        <div className="card mh19-card">
          {!parent ? <><div className="tm-bar">{seg}</div><div className="muted" style={{ padding: '8px 12px' }}>Chọn một chi nhánh ở ô Chi nhánh.</div></>
            : tab === 'suggest' ? <DeXuat parent={parent} seg={seg} onDone={() => setTab('list')} /> : <DaChot parent={parent} seg={seg} from={from} to={to} />}
        </div>
      </FilterLayout>
    </>
  );
}

function DeXuat({ parent, seg, onDone }: { parent: string; seg: ReactNode; onDone: () => void }) {
  const qc = useQueryClient();
  const tt = useThaoTac('mua-hang.chuyen-shop'); // [2026-11-13 08:00 PM kiennt] NT-HT-003 — Chốt đề nghị theo thao tác "them" của màn MH19 (đóng góp)
  const [wh, setWh] = useState('');
  const [edit, setEdit] = useState<Record<string, number>>({});
  const [off, setOff] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [quick, setQuick] = useState<'' | 'short'>('');
  const [search, setSearch] = useState('');
  const [khoTab, setKhoTab] = useState('');
  const exportRef = useRef<(() => void) | null>(null); // '' = tất cả kho nhận; còn lại = mã shop
  // NT-MH-004: chọn shop (giữ thứ tự chọn — dùng cho "theo thứ tự" và phần dư khi chia đều), làm tròn, cách phân bổ khi kho thiếu.
  const h = useHierarchy();
  const shopList = (h.data?.branches ?? []).filter((b) => b.level === 'shop' && b.parentCode === parent && b.isActive).sort((a, b) => a.code.localeCompare(b.code));
  const [sel, setSel] = useState<string[]>([]);
  const [opts, setOptsState] = useState(readOpts);
  const setOpts = (p: Partial<typeof opts>) => { const o = { ...opts, ...p }; setOptsState(o); saveOpts(o); setEdit({}); };
  const q = useQuery({
    queryKey: ['ton-max', 'transfer-suggest', parent, wh, sel.join(','), opts.rounding, opts.allocation],
    queryFn: () => api.get<TransferSuggest>('/api/v1/stock/transfer-suggest', { branchCode: parent, fromWarehouse: wh || undefined, shopCodes: sel.length ? sel.join(',') : undefined, rounding: opts.rounding, allocation: opts.allocation }),
  });
  // [2026-11-26 kiennt] NT-MH-024 — bỏ tab NCC ở MH19 (tab theo NCC thuộc Phân tích đặt hàng MH02); thay bằng mỗi KHO NHẬN (shop) một tab (đóng góp)
  const allLines = q.data?.lines ?? [];
  const khoTabs = useMemo(() => {
    const m = new Map<string, { wh: string; name: string; n: number }>();
    for (const l of allLines) { const x = m.get(l.shopCode) ?? { wh: l.toWarehouse, name: l.shopName, n: 0 }; x.n++; m.set(l.shopCode, x); }
    return [...m].sort(([a], [b]) => a.localeCompare(b));
  }, [allLines]);
  const curKho = khoTabs.some(([k]) => k === khoTab) ? khoTab : '';
  const lines = curKho ? allLines.filter((l) => l.shopCode === curKho) : allLines;
  const qty = (l: TransferSuggestLine) => edit[lk(l)] ?? l.qty;
  const rows = useMemo(() => {
    const out: Row[] = [];
    let last = '';
    const f = fold(search.trim());
    for (const l of [...lines].filter((x) => (quick !== 'short' || x.short > 0) && (!f || fold(`${x.sku} ${x.name}`).includes(f))).sort((a, b) => a.shopCode.localeCompare(b.shopCode) || a.sku.localeCompare(b.sku))) {
      if (l.shopCode !== last) { out.push({ ...l, _group: true, _key: `g:${l.shopCode}` }); last = l.shopCode; }
      out.push({ ...l, _key: lk(l) });
    }
    return out;
  }, [lines, quick, search]);
  const picked = lines.filter((l) => !off[lk(l)] && qty(l) > 0);
  const shops = new Set(picked.map((l) => l.shopCode));
  // Tổng chia một mã không vượt tồn kho chuyển (khoTon đã trừ đề nghị chốt chưa làm) — nhất là khi chỉnh tay.
  const over = useMemo(() => {
    const sum = new Map<string, { q: number; ton: number }>();
    for (const l of picked) { const x = sum.get(l.sku) ?? { q: 0, ton: l.khoTon }; x.q += qty(l); sum.set(l.sku, x); }
    return [...sum].filter(([, x]) => x.q > x.ton + 1e-9).map(([sku, x]) => `${sku}: chia ${qtyFmt(x.q)} > tồn kho ${qtyFmt(x.ton)}`);
  }, [picked, edit]); // eslint-disable-line react-hooks/exhaustive-deps
  const cols: Column<Row>[] = [
    { key: 'pick', header: '', width: 34, noFilter: true, noSort: true, render: (l) => <input type="checkbox" checked={!off[lk(l)]} onChange={(e) => setOff({ ...off, [lk(l)]: !e.target.checked })} /> },
    { key: 'sku', header: 'Mã hàng', type: 'code', width: 110 },
    { key: 'name', header: 'Tên hàng', width: 200 },
    { key: 'max', header: 'Max shop', type: 'qty', width: 74, className: 'tm-max' },
    { key: 'ton', header: 'Tồn shop', type: 'qty', width: 74, className: 'tm-stock', showZero: true },
    { key: 'diDuong', header: 'Đi đường + đã đề nghị', type: 'qty', width: 92, render: (l) => <span title={`Đang đi đường ${qtyFmt(l.diDuong - l.reserved)} · đề nghị đã chốt chưa làm ${qtyFmt(l.reserved)}`}>{qtyFmt(l.diDuong) || ''}</span> },
    { key: 'gap', header: 'Thiếu', type: 'qty', width: 70, className: 'tm-need' },
    // [2026-11-26 kiennt] NT-MH-014 — cột tồn kho xuất lên cạnh Thiếu / Chuyển (trước nằm cuối bảng, phải cuộn mới thấy) (đóng góp)
    { key: 'khoTon', header: 'Tồn kho xuất', type: 'qty', width: 90, className: 'tm-ref', showZero: true, title: 'Tồn ở kho đang chọn "Xuất từ kho" (đã trừ đề nghị đã chốt chưa lên phiếu), trước khi chia cho các shop — tổng cột Chuyển của một mã không vượt số này' },
    { key: 'mode', header: 'Làm tròn', width: 100, value: (l) => TRANSFER_MODES.find((m) => m.key === l.mode)?.label ?? l.mode, render: (l) => <span title={TRANSFER_MODES.find((m) => m.key === l.mode)?.hint}>{TRANSFER_MODES.find((m) => m.key === l.mode)?.label}{l.pack ? ` · ${l.pack}/${l.packUnit}` : ''}</span> },
    { key: 'qty', header: 'Chuyển', type: 'qty', width: 160, value: (l) => qty(l), sum: true, render: (l) => <span><input className={`tm-input${edit[lk(l)] !== undefined ? ' dirty' : ''}`} value={qty(l) || ''} onChange={(e) => setEdit({ ...edit, [lk(l)]: num(e.target.value) })} />{l.pack && qty(l) >= l.pack ? <span className="muted" style={{ fontSize: 10.5, marginLeft: 4 }}>{Math.floor(qty(l) / l.pack)} {l.packUnit}{qty(l) % l.pack ? ` + ${qty(l) % l.pack} ${l.baseUnit}` : ''}</span> : null}</span> },
    { key: 'short', header: 'Thiếu do kho hết', type: 'qty', width: 90, render: (l) => (l.short ? <span className="tm-low" title={`Muốn chuyển ${qtyFmt(l.want)}, kho chỉ còn đủ ${qtyFmt(l.qty)}`}>{qtyFmt(l.short)}</span> : '') },
  ];
  const commit = async () => {
    setBusy(true); setMsg(null);
    try {
      const by = new Map<string, TransferSuggestLine[]>();
      for (const l of picked) by.set(l.shopCode, [...(by.get(l.shopCode) ?? []), l]);
      const r = await stockApi.createTransfers({ fromBranch: parent, fromWarehouse: q.data?.fromWarehouse, shops: [...by].map(([s, ls]) => ({ toBranch: s, toWarehouse: ls[0]!.toWarehouse, lines: ls.map((l) => ({ sku: l.sku, name: l.name, unit: l.baseUnit, qty: qty(l), pack: l.pack, packUnit: l.packUnit })) })) });
      setEdit({}); setOff({});
      setMsg({ ok: true, text: `Đã chốt ${r.codes.length} đề nghị chuyển (${r.codes.join(', ')}).` });
      await qc.invalidateQueries({ queryKey: ['ton-max'] });
      if (!curKho) onDone(); // chốt riêng một kho nhận thì ở lại để chốt tiếp kho khác
    } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); }
  };
  const roundOpt = TRANSFER_ROUNDINGS.find((x) => x.key === opts.rounding);
  const allocOpt = TRANSFER_ALLOCATIONS.find((x) => x.key === opts.allocation);
  const nShort = lines.filter((l) => l.short > 0).length;
  const sumQty = picked.reduce((t, l) => t + qty(l), 0);
  const toggleShop = (c: string) => { setSel(sel.includes(c) ? sel.filter((x) => x !== c) : [...sel, c]); setEdit({}); };
  return (
    <>
      {/* [2026-11-26 kiennt] NT-MH-024 — thanh công cụ theo bố cục MH02: Đề xuất / Đã chốt · Hiện ▾ · ô Tìm · Tuỳ chọn chia ▾ (kho xuất, shop, làm tròn,
          khi kho không đủ) · Xuất Excel · Chốt đề nghị; dưới là tab kho nhận (đóng góp) */}
      <div className="tm-bar mh19-bar">
        {seg}
        <label className="tm-parent" title="Lọc nhanh các dòng đề xuất"><span>Hiện</span><select className="select input" style={{ width: 190, minWidth: 0, flex: 'none' }} value={quick} onChange={(e) => setQuick(e.target.value as '' | 'short')}>
          <option value="">Tất cả dòng ({lines.length.toLocaleString('vi-VN')})</option>
          <option value="short">Thiếu do kho hết ({nShort.toLocaleString('vi-VN')})</option>
        </select></label>
        <input className="input" type="search" placeholder="Tìm mã, tên hàng…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
        <Pop align="right" width={380} title={`Kho xuất ${q.data?.fromWarehouse ?? ''} · ${sel.length ? `${sel.length}/${shopList.length} shop theo thứ tự` : 'mọi shop'} · ${roundOpt?.label} · ${allocOpt?.label}`}
          label={<><SlidersHorizontal size={14} /> Tuỳ chọn chia{sel.length ? <b className="mh19-badge">{sel.length} shop</b> : null}</>}>
          <label><span>Kho xuất</span>
            <select className="select input" value={wh || q.data?.fromWarehouse || ''} onChange={(e) => setWh(e.target.value)}>
              {(q.data?.warehouses ?? []).map((w) => <option key={w.code} value={w.code}>{w.code} · {w.name}{w.isDefault ? ' (mặc định)' : ''}</option>)}
            </select></label>
          <div className="mh19-pop-sec"><div className="mh19-pop-head"><span><b>Shop</b> <span className="muted">— bấm theo thứ tự ưu tiên; không chọn = mọi shop</span></span>
            <button type="button" className="btn btn-xs" disabled={!sel.length} onClick={() => { setSel([]); setEdit({}); }}>Tất cả shop</button></div>
          <div className="mh19-shop-list">
            {shopList.map((b) => { const i = sel.indexOf(b.code); return (
              <button key={b.code} type="button" className={i >= 0 ? 'on' : ''} onClick={() => toggleShop(b.code)}>
                <span className="mh19-no">{i >= 0 ? i + 1 : ''}</span><b className="mono">{b.code}</b><span className="mh19-nm">{b.name}</span></button>); })}
            {!shopList.length && <div className="muted" style={{ padding: 8 }}>Chi nhánh chưa có shop.</div>}
          </div></div>
          <label><span>Làm tròn</span>
            <select className="select input" value={opts.rounding} onChange={(e) => setOpts({ rounding: e.target.value as TransferRounding })}>
              {TRANSFER_ROUNDINGS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
            </select>
            <small>{roundOpt?.hint}</small><small>Ngưỡng thùng {Math.round((q.data?.threshold ?? 0.5) * 100)}% — đổi ở Công thức đặt hàng (MH18).</small></label>
          <label><span>Khi kho không đủ</span>
            <select className="select input" value={opts.allocation} onChange={(e) => setOpts({ allocation: e.target.value as TransferAllocation })}>
              {TRANSFER_ALLOCATIONS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
            </select>
            <small>{allocOpt?.hint}</small></label>
        </Pop>
        <button className="btn btn-sm" onClick={() => exportRef.current?.()}><FileSpreadsheet size={14} /> Xuất Excel</button>
        {tt.them && <button className="btn btn-primary" disabled={!picked.length || busy || over.length > 0} title={over.length ? `Tổng chia vượt tồn kho: ${over.join('; ')}` : curKho ? 'Chỉ chốt các dòng của kho nhận đang mở' : undefined} onClick={() => void commit()}>
          <Send size={15} /> Chốt đề nghị ({shops.size} shop · {picked.length} dòng{picked.length ? ` · SL ${qtyFmt(sumQty)}` : ''})</button>}
      </div>
      {khoTabs.length > 0 && <div className="mh19-tabs" role="tablist" title="Mỗi kho nhận (shop) một tab — Chốt đề nghị chỉ chốt các dòng của tab đang mở">
        <button type="button" role="tab" className={curKho ? '' : 'on'} onClick={() => setKhoTab('')}>Tất cả kho nhận <span>{allLines.length.toLocaleString('vi-VN')}</span></button>
        {khoTabs.map(([k, x]) => <button key={k} type="button" role="tab" className={curKho === k ? 'on' : ''} title={`${x.wh || k} · ${x.name} — ${x.n} dòng`} onClick={() => setKhoTab(k)}><b>{x.wh || k}</b><em>{x.name}</em><span>{x.n.toLocaleString('vi-VN')}</span></button>)}
      </div>}
      {over.length > 0 && <div className="alert alert-bad" style={{ margin: '0 12px 8px' }}>Tổng chia vượt tồn kho chuyển — sửa trước khi chốt: {over.join('; ')}</div>}
      {opts.allocation === 'manual' && lines.some((l) => l.short > 0) && <div className="alert alert-warn" style={{ margin: '0 12px 8px' }}>Chỉnh tay: các mã kho không đủ để trống cột Chuyển — tự nhập số cho từng shop (tổng mỗi mã ≤ tồn kho).</div>}
      {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-bad'}`} style={{ margin: '0 12px 8px' }}>{msg.text}</div>}
      <ErrorBox error={q.error ? errorText(q.error) : null} />
      {q.isLoading ? <Loading /> : <div className="tm-grid"><DataGrid rows={rows} columns={cols} rowKey={(r) => r._key} storageKey="chuyen-shop-de-xuat" exportRef={exportRef} exportName={`de-xuat-chuyen-${parent}${curKho ? `-${curKho}` : ''}-${today()}`}
        rowKind={(r) => (r._group ? 'group' : 'data')} groupLabel={(r) => <b>{r.shopCode} · {r.shopName} <span className="muted" style={{ fontWeight: 400 }}>→ kho {r.toWarehouse}</span></b>}
        emptyText="Không shop nào thiếu hàng so với tồn max (hoặc chưa khai max cho shop — mở Tồn max MH16)." /></div>}
    </>
  );
}

/** Nút bật ra một ô nhỏ (chọn shop, cách chia); bấm ra ngoài thì đóng. */
function Pop({ label, title, width, align = 'left', children }: { label: ReactNode; title?: string; width: number; align?: 'left' | 'right'; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div className="mh19-pop" ref={ref}>
      <button type="button" className={`btn btn-sm${open ? ' on' : ''}`} title={title} onClick={() => setOpen(!open)}>{label} <ChevronDown size={14} /></button>
      {open && <div className="mh19-pop-panel" style={{ width, ...(align === 'right' ? { left: 'auto', right: 0 } : {}) }}>{children}</div>}
    </div>
  );
}

function DaChot({ parent, seg, from, to }: { parent: string; seg: ReactNode; from: string; to: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const tt = useThaoTac('mua-hang.chuyen-shop'); // [2026-11-13 08:00 PM kiennt] NT-HT-003 — Huỷ / Mở lại / Đã lên phiếu theo thao tác màn MH19 (đóng góp)
  const [status, setStatus] = useState('open');
  const [open, setOpen] = useState<TransferRequest | null>(null);
  const [err, setErr] = useState('');
  const q = useQuery({ queryKey: ['ton-max', 'transfer-requests', parent, from, to, status], queryFn: () => stockApi.transferRequests({ from, to, status: status || undefined, branchCode: parent }) });
  const act = async (r: TransferRequest, a: 'done' | 'cancel' | 'reopen') => {
    try { await stockApi.transferStatus(r.id, a); setOpen(null); await qc.invalidateQueries({ queryKey: ['ton-max'] }); } catch (e) { setErr(errorText(e)); }
  };
  const exportOne = async (r: TransferRequest) => {
    const XLSX = await import('@/lib/excelChuan').then((m) => m.xlsxChuan()); // [2026-11-11 Nguyễn Văn Thủy] xuất Excel định dạng chuẩn (đóng góp)
    const ws = XLSX.utils.aoa_to_sheet([[`ĐỀ NGHỊ CHUYỂN HÀNG ${r.code}`], [`Từ: ${r.fromBranch} ${r.fromName} (kho ${r.fromWarehouse}) → ${r.toBranch} ${r.toName} (kho ${r.toWarehouse})`], [], ['STT', 'Mã hàng', 'Tên hàng', 'ĐVT', 'Số lượng', 'Quy đổi thùng', 'Ghi chú'],
      ...r.lines.map((l, i) => [i + 1, l.sku, l.name, l.unit, l.qty, l.pack ? `${Math.floor(l.qty / l.pack)} ${l.packUnit}${l.qty % l.pack ? ` + ${l.qty % l.pack} ${l.unit}` : ''}` : '', l.note ?? ''])]);
    ws['!cols'] = [{ wch: 5 }, { wch: 14 }, { wch: 44 }, { wch: 8 }, { wch: 10 }, { wch: 18 }, { wch: 24 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'De nghi'); XLSX.writeFile(wb, `${r.code}.xlsx`);
  };
  const cols: Column<TransferRequest>[] = [
    { key: 'code', header: 'Số đề nghị', type: 'code', width: 120 },
    { key: 'createdAt', header: 'Ngày chốt', width: 130, value: (r) => r.createdAt, render: (r) => new Date(r.createdAt).toLocaleString('vi-VN') },
    { key: 'toBranch', header: 'Shop nhận', width: 200, value: (r) => `${r.toBranch} ${r.toName}`, render: (r) => <><b className="mono">{r.toBranch}</b> {r.toName}</> },
    { key: 'fromWarehouse', header: 'Xuất từ kho', type: 'code', width: 90 },
    { key: 'lineCount', header: 'Số dòng', type: 'number', width: 70, sum: true },
    { key: 'qty', header: 'Tổng SL', type: 'qty', width: 80, sum: true },
    { key: 'status', header: 'Trạng thái', width: 120, value: (r) => STATUS[r.status], render: (r) => <span className={`tm-chip ${r.status === 'done' ? 'ok' : r.status === 'open' ? 'warn' : 'bad'}`}>{STATUS[r.status]}</span> },
    { key: 'createdBy', header: 'Người chốt', width: 120 },
    { key: 'doneBy', header: 'Người lên phiếu', width: 120 },
  ];
  return (
    <>
      <div className="tm-bar mh19-bar">
        {seg}
        <select className="select input" style={{ width: 180, minWidth: 0, flex: 'none' }} value={status} onChange={(e) => setStatus(e.target.value)}><option value="open">Chờ lên phiếu</option><option value="done">Đã lên phiếu</option><option value="cancelled">Đã huỷ</option><option value="">Tất cả</option></select>
        {/* [2026-11-26 kiennt] NT-MH-014 — bỏ dòng chú thích API (Kho / POS đọc danh sách…) trên thẻ Đề nghị đã chốt (đóng góp) */}
      </div>
      {err && <div className="alert alert-bad" style={{ margin: '0 12px 8px' }}>{err}</div>}
      {q.isLoading ? <Loading /> : <DataGrid rows={q.data ?? []} columns={cols} rowKey={(r) => r.id} storageKey="chuyen-shop-da-chot" onRowClick={setOpen} exportName={`de-nghi-chuyen-${parent}`} emptyText="Chưa có đề nghị nào trong khoảng ngày này." />}
      {open && <Modal wide title={`Đề nghị chuyển ${open.code} → ${open.toBranch} ${open.toName}`} onClose={() => setOpen(null)} footer={<>
        {open.status === 'open' && tt.huy && <button className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={() => void act(open, 'cancel')}>Huỷ đề nghị</button>}
        {open.status !== 'open' && tt.xong && <button className="btn" style={{ marginRight: 'auto' }} onClick={() => void act(open, 'reopen')}>Mở lại</button>}
        <button className="btn" onClick={() => void exportOne(open)}><FileSpreadsheet size={14} /> Xuất Excel</button>
        {/* [2026-11-26 kiennt] NT-MH-019 — lập phiếu chuyển kho (KHO01) điền sẵn theo đề nghị; duyệt xuất xong đề nghị tự sang "Đã lên phiếu" (đóng góp) */}
        {open.status === 'open' && <button className="btn btn-primary" title="Mở Phiếu chuyển kho (KHO01) điền sẵn kho xuất / nhập và dòng hàng theo đề nghị — Ghi và duyệt xuất thì đề nghị tự chuyển Đã lên phiếu" onClick={() => { const r = open; setOpen(null); navigate(`/kho/chuyen-kho?tu-de-nghi=${encodeURIComponent(r.id)}&cn=${encodeURIComponent(r.fromBranch)}`); }}><Truck size={14} /> Lập phiếu chuyển kho</button>}
        {open.status === 'open' && tt.xong && <button className="btn" onClick={() => void act(open, 'done')}>Đã lên phiếu chuyển</button>}
        <button className="btn" onClick={() => setOpen(null)}>Đóng</button></>}>
        <div className="full muted" style={{ fontSize: 12.5 }}>Từ {open.fromBranch} {open.fromName} (kho {open.fromWarehouse}) · chốt bởi {open.createdBy} lúc {new Date(open.createdAt).toLocaleString('vi-VN')}{open.doneBy ? ` · ${STATUS[open.status].toLowerCase()} bởi ${open.doneBy}` : ''}</div>
        <div className="full"><table className="mh-mini"><thead><tr><th>#</th><th>Mã</th><th>Tên hàng</th><th className="num">SL</th><th>ĐVT</th><th>Quy đổi</th></tr></thead><tbody>
          {open.lines.map((l, i) => <tr key={l.sku}><td>{i + 1}</td><td className="mono">{l.sku}</td><td>{l.name}</td><td className="num">{qtyFmt(l.qty)}</td><td>{l.unit}</td><td>{l.pack ? `${Math.floor(l.qty / l.pack)} ${l.packUnit}${l.qty % l.pack ? ` + ${l.qty % l.pack}` : ''}` : ''}</td></tr>)}
        </tbody></table></div>
      </Modal>}
    </>
  );
}
