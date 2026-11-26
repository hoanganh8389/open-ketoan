/**
 * ĐỀ XUẤT CHUYỂN HÀNG XUỐNG SHOP (MH19) — 2 lần / tuần mỗi shop được chia hàng từ kho chi nhánh:
 *   cần chuyển = max shop − tồn shop − hàng đang đi đường đến shop − đề nghị đã chốt chưa làm; làm tròn theo thùng
 *   (tự động / nguyên thùng / lẻ — cài từng mã ở Tồn max); kho không đủ thì ưu tiên shop thiếu nhiều nhất so với max.
 * Sửa số chuyển, bỏ dòng, bấm "Chốt đề nghị" → mỗi shop một đề nghị chuyển. Thẻ "Đề nghị đã chốt": kế toán kho quét danh sách
 * này (hoặc kho / POS đọc qua API) để lên phiếu chuyển kho, rồi đánh dấu "Đã lên phiếu".
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, FileSpreadsheet, Send, SlidersHorizontal, Truck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { TRANSFER_ALLOCATIONS, TRANSFER_MODES, TRANSFER_ROUNDINGS, type TransferAllocation, type TransferRounding } from '@bizcity/mua-hang-domain';
import { PageHeader } from '@/components/PageHeader';
import { DataGrid, type Column } from '@/components/DataGrid';
import { ErrorBox, Loading, Modal } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { monthStart, today } from '../du-lieu';
import { num, qtyFmt, stockApi, useHierarchy, type TransferRequest, type TransferSuggest, type TransferSuggestLine } from './api';
import { ChuaPhanCap, useMotChiNhanh } from './chung';
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
  const h = useHierarchy();
  // [2026-11-26 kiennt] NT-MH-022 — ô Chi nhánh chung, MỘT chi nhánh một lúc (cả chi nhánh); Kỳ chỉ dùng ở thẻ Đề nghị đã chốt (đóng góp)
  const cn = useMotChiNhanh({ caNhom: true });
  const parent = cn.parent;
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  return (
    <>
      <PageHeader title="Chuyển hàng xuống shop" code="MH19" helpKey="mua-hang-chuyen-shop" subtitle="Tự tính shop nào thiếu bao nhiêu so với tồn max (trừ hàng đang đi đường), làm tròn theo thùng, không vượt tồn kho — chốt thành đề nghị cho kho lên phiếu chuyển" />
      <FilterLayout filters={<>
        {tab === 'list' && <DateRange from={from} to={to} remember={false} onChange={(a, b) => { setFrom(a); setTo(b); }} />}
        <BranchSelect value={cn.value} onChange={cn.onChange} />
      </>}>
        <div className="card">
          <ChuaPhanCap branches={h.data?.branches} />
          <div className="tm-bar">
            <div className="tm-sign"><button className={tab === 'suggest' ? 'on' : ''} onClick={() => setTab('suggest')}>Đề xuất chuyển</button><button className={tab === 'list' ? 'on' : ''} onClick={() => setTab('list')}>Đề nghị đã chốt</button></div>
          </div>
          {!parent ? <div className="muted" style={{ padding: '8px 12px' }}>Chọn một chi nhánh ở ô Chi nhánh.</div>
            : tab === 'suggest' ? <DeXuat parent={parent} onDone={() => setTab('list')} /> : <DaChot parent={parent} from={from} to={to} />}
        </div>
      </FilterLayout>
    </>
  );
}

function DeXuat({ parent, onDone }: { parent: string; onDone: () => void }) {
  const qc = useQueryClient();
  const tt = useThaoTac('mua-hang.chuyen-shop'); // [2026-11-13 08:00 PM kiennt] NT-HT-003 — Chốt đề nghị theo thao tác "them" của màn MH19 (đóng góp)
  const [wh, setWh] = useState('');
  const [edit, setEdit] = useState<Record<string, number>>({});
  const [off, setOff] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [quick, setQuick] = useState<'' | 'short'>('');
  // [2026-11-26 kiennt] NT-MH-023 — mỗi NCC một tab (như các sheet Bỉm Dokma / Bỉm Huggies… của file Excel công thức đặt hàng); '' = tất cả NCC, '~' = chưa rõ NCC (đóng góp)
  const [ncc, setNcc] = useState('');
  const [pop, setPop] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);
  useEffect(() => { // đóng ô "Cách chia" khi bấm ra ngoài
    if (!pop) return;
    const h = (e: MouseEvent) => { if (!popRef.current?.contains(e.target as Node)) setPop(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, [pop]);
  const exportRef = useRef<(() => void) | null>(null);
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
  const allLines = q.data?.lines ?? [];
  const nccTabs = useMemo(() => {
    const m = new Map<string, { name: string; n: number }>();
    for (const l of allLines) { const k = l.partnerCode || '~'; const x = m.get(k) ?? { name: l.partnerCode ? (l.partnerName || l.partnerCode) : 'Chưa rõ NCC', n: 0 }; x.n++; m.set(k, x); }
    return [...m].sort(([a, x], [b, y]) => Number(a === '~') - Number(b === '~') || x.name.localeCompare(y.name, 'vi'));
  }, [allLines]);
  const curNcc = nccTabs.some(([k]) => k === ncc) ? ncc : '';
  const lines = curNcc ? allLines.filter((l) => (l.partnerCode || '~') === curNcc) : allLines;
  const qty = (l: TransferSuggestLine) => edit[lk(l)] ?? l.qty;
  const rows = useMemo(() => {
    const out: Row[] = [];
    let last = '';
    for (const l of [...lines].filter((x) => quick !== 'short' || x.short > 0).sort((a, b) => a.shopCode.localeCompare(b.shopCode) || a.sku.localeCompare(b.sku))) {
      if (l.shopCode !== last) { out.push({ ...l, _group: true, _key: `g:${l.shopCode}` }); last = l.shopCode; }
      out.push({ ...l, _key: lk(l) });
    }
    return out;
  }, [lines, quick]);
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
    { key: 'partnerName', header: 'NCC', width: 160, value: (l) => (l.partnerCode ? `${l.partnerCode} ${l.partnerName}` : ''), render: (l) => (l.partnerCode ? <span title={l.partnerCode}>{l.partnerName || l.partnerCode}</span> : <span className="muted">chưa rõ</span>), title: 'NCC mặc định của mã — cùng quy tắc Phân tích đặt hàng (MH02): lần nhập gần nhất, chưa nhập thì NCC có bảng giá đang hiệu lực' },
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
      if (!curNcc) onDone(); // đang chốt theo từng tab NCC thì ở lại màn đề xuất để làm tiếp NCC khác
    } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); }
  };
  const roundOpt = TRANSFER_ROUNDINGS.find((x) => x.key === opts.rounding);
  const allocOpt = TRANSFER_ALLOCATIONS.find((x) => x.key === opts.allocation);
  const nShort = lines.filter((l) => l.short > 0).length;
  const sumQty = picked.reduce((t, l) => t + qty(l), 0);
  return (
    <>
      {/* [2026-11-26 kiennt] NT-MH-023 — thiết kế lại thanh công cụ: hàng 1 = kho xuất · shop · "Cách chia" (làm tròn + khi kho không đủ gộp vào ô bật ra);
          hàng 2 = tab NCC, bên phải là lọc "chỉ thiếu do kho hết" · Excel · Chốt (đóng góp) */}
      <div className="tm-bar mh19-bar">
        <label className="tm-parent"><span>Kho xuất</span>
          <select className="select input" style={{ width: 260, minWidth: 0, flex: 'none' }} value={wh || q.data?.fromWarehouse || ''} onChange={(e) => setWh(e.target.value)}>
            {(q.data?.warehouses ?? []).map((w) => <option key={w.code} value={w.code}>{w.code} · {w.name}{w.isDefault ? ' (mặc định)' : ''}</option>)}
          </select></label>
        <span className="mh19-sep" />
        <div className="mh19-shops" title="Bấm để chọn shop theo thứ tự ưu tiên (số thứ tự hiện trên nút); không chọn = mọi shop, theo mã">
          <span className="muted">Shop</span>
          <button type="button" className={`mh19-chip${sel.length ? '' : ' on'}`} onClick={() => { setSel([]); setEdit({}); }}>Tất cả</button>
          {shopList.map((b) => { const i = sel.indexOf(b.code); return (
            <button key={b.code} type="button" className={`mh19-chip${i >= 0 ? ' on' : ''}`} title={b.name}
              onClick={() => { setSel(i >= 0 ? sel.filter((c) => c !== b.code) : [...sel, b.code]); setEdit({}); }}>{i >= 0 ? <b>{i + 1}</b> : null}{b.code}</button>); })}
        </div>
        <span className="grow" />
        <div className="mh19-pop" ref={popRef}>
          <button type="button" className="btn btn-sm" onClick={() => setPop(!pop)} title="Cách làm tròn và cách chia khi kho không đủ">
            <SlidersHorizontal size={14} /> {roundOpt?.label} · {allocOpt?.label} <ChevronDown size={14} />
          </button>
          {pop && <div className="mh19-pop-panel">
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
          </div>}
        </div>
      </div>
      <div className="mh19-tabrow">
        <div className="tm-ncc-tabs" role="tablist" title="Mỗi NCC một tab — Chốt đề nghị chỉ chốt các dòng của tab đang mở">
          <button type="button" role="tab" className={curNcc ? '' : 'on'} onClick={() => setNcc('')}>Tất cả NCC <span>{allLines.length.toLocaleString('vi-VN')}</span></button>
          {nccTabs.map(([k, x]) => <button key={k} type="button" role="tab" className={`${curNcc === k ? 'on' : ''}${k === '~' ? ' none' : ''}`} title={k === '~' ? 'Mã chưa có lần nhập, chưa khai giá mua NCC nào' : k} onClick={() => setNcc(k)}>{x.name} <span>{x.n.toLocaleString('vi-VN')}</span></button>)}
        </div>
        <div className="mh19-act">
          <label className={`mh19-chip${quick === 'short' ? ' on warn' : ''}`} title="Chỉ hiện các dòng kho không đủ hàng để chia (nên đặt mua thêm ở MH02)">
            <input type="checkbox" checked={quick === 'short'} onChange={(e) => setQuick(e.target.checked ? 'short' : '')} /> Thiếu do kho hết <b>{nShort.toLocaleString('vi-VN')}</b></label>
          <button className="btn btn-sm" title="Xuất Excel đúng các dòng đang thấy" onClick={() => exportRef.current?.()}><FileSpreadsheet size={14} /> Excel</button>
          {tt.them && <button className="btn btn-sm btn-primary" disabled={!picked.length || busy || over.length > 0} title={over.length ? `Tổng chia vượt tồn kho: ${over.join('; ')}` : `${shops.size} shop · ${picked.length} dòng · SL ${qtyFmt(sumQty)}${curNcc ? ' — chỉ các dòng của tab NCC đang mở' : ''}`} onClick={() => void commit()}>
            <Send size={14} /> Chốt đề nghị{picked.length ? <span className="mh19-cnt">{shops.size} shop · {picked.length} dòng · SL {qtyFmt(sumQty)}</span> : null}</button>}
        </div>
      </div>
      {over.length > 0 && <div className="alert alert-bad" style={{ margin: '0 12px 8px' }}>Tổng chia vượt tồn kho chuyển — sửa trước khi chốt: {over.join('; ')}</div>}
      {opts.allocation === 'manual' && lines.some((l) => l.short > 0) && <div className="alert alert-warn" style={{ margin: '0 12px 8px' }}>Chỉnh tay: các mã kho không đủ để trống cột Chuyển — tự nhập số cho từng shop (tổng mỗi mã ≤ tồn kho).</div>}
      {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-bad'}`} style={{ margin: '0 12px 8px' }}>{msg.text}</div>}
      <ErrorBox error={q.error ? errorText(q.error) : null} />
      {q.isLoading ? <Loading /> : <div className="tm-grid"><DataGrid rows={rows} columns={cols} rowKey={(r) => r._key} storageKey="chuyen-shop-de-xuat" exportRef={exportRef} exportName={`de-xuat-chuyen-${parent}${curNcc && curNcc !== '~' ? `-${curNcc}` : ''}-${today()}`}
        rowKind={(r) => (r._group ? 'group' : 'data')} groupLabel={(r) => <b>{r.shopCode} · {r.shopName} <span className="muted" style={{ fontWeight: 400 }}>→ kho {r.toWarehouse}</span></b>}
        emptyText="Không shop nào thiếu hàng so với tồn max (hoặc chưa khai max cho shop — mở Tồn max MH16)." /></div>}
    </>
  );
}

function DaChot({ parent, from, to }: { parent: string; from: string; to: string }) {
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
      <div className="tm-bar" style={{ paddingTop: 0 }}>
        <select className="select input" value={status} onChange={(e) => setStatus(e.target.value)}><option value="open">Chờ lên phiếu</option><option value="done">Đã lên phiếu</option><option value="cancelled">Đã huỷ</option><option value="">Tất cả</option></select>
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
