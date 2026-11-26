/**
 * TỒN MAX (MH16) — khai max (và min nếu cần) theo chi nhánh – kho – mã, một nơi duy nhất.
 *   Theo chi nhánh / shop: chọn kho của chi nhánh hoặc một shop → mỗi mã một dòng: tồn, bán / ngày (đo trong N ngày),
 *     gợi ý max (shop = bán / ngày × số ngày đủ hàng; kho = tổng max shop + % dự phòng), max / min sửa ngay trên ô.
 * Áp gợi ý hàng loạt cho các dòng đang lọc, nhập / xuất Excel, cài riêng từng mã (số ngày đo bán, số ngày đủ hàng, cách chuyển).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileUp, Plus, Settings2, Sparkles } from 'lucide-react';
import { TRANSFER_MODES, type TransferMode } from '@bizcity/mua-hang-domain';
import { PageHeader } from '@/components/PageHeader';
import { DataGrid, type Column } from '@/components/DataGrid';
import { ErrorBox, Field, Loading, Modal } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { NhapExcelChung } from '../thanh-phan/NhapExcelChung';
import { ChonMatHang, type CatalogItem } from '../thanh-phan/ChonMatHang';
import { docSo, num, qtyFmt, stockApi, useHierarchy, type MaxBoardRow } from './api';
import { ChonShop, ChuaPhanCap, isOff, OSo, useMotChiNhanh } from './chung'; // [2026-11-25 kiennt] NT-MH-006 — bỏ dải "Hai cách đặt tồn max" (mỗi màn một việc, đỡ chiếm chỗ) (đóng góp)
import { ChonNhomHang, useLocNhomHang } from '@/components/CayNhomHang';
import { useThaoTac } from '@/lib/manHinh';
// [2026-11-26 kiennt] NT-MH-022 — bảng tham số + thanh lọc chuẩn (Chi nhánh · Nhóm hàng) như MH11 / MH17 (đóng góp)
import { FilterLayout } from '@/components/ReportPanel';
import { BranchSelect } from '@/components/filters';

type Draft = { max?: number; min?: number; mode?: TransferMode };
const k = (r: { branchCode: string; warehouseCode: string; sku: string }) => `${r.branchCode}|${r.warehouseCode}|${r.sku}`;

export function TonMaxPage() {
  const qc = useQueryClient();
  const tt = useThaoTac('mua-hang.ton-max'); // [2026-11-13 08:00 PM kiennt] NT-HT-003 — nút ghi tồn max theo thao tác "sua" của màn MH16 (đóng góp)
  const h = useHierarchy();
  // [2026-11-26 kiennt] NT-MH-022 — ô Chi nhánh chung, MỘT chi nhánh một lúc (cả chi nhánh) (đóng góp)
  const cn = useMotChiNhanh({ caNhom: true });
  const parent = cn.parent;
  // [2026-11-26 kiennt] NT-MH-020 — bỏ chế độ "Theo mã hàng": màn luôn xem theo chi nhánh / shop (đóng góp)
  const [target, setTarget] = useState(''); // '' = kho chi nhánh
  const [wh, setWh] = useState('');
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [extra, setExtra] = useState<MaxBoardRow[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [imp, setImp] = useState(false);
  const [add, setAdd] = useState(false);
  const [cfgSku, setCfgSku] = useState<MaxBoardRow | null>(null);
  const view = useRef<MaxBoardRow[]>([]);
  const shops = (h.data?.branches ?? []).filter((b) => b.level === 'shop' && b.parentCode === parent);
  const parentNode = (h.data?.branches ?? []).find((b) => b.code === parent);
  // Chi nhánh / shop đang xem: kho của nó luôn hiện để chọn (shop thường một kho cố định, kho chi nhánh có nhiều kho).
  const targetNode = target ? shops.find((s) => s.code === target) : parentNode;
  const q = useQuery({
    queryKey: ['ton-max', 'board', parent, 'branch', target, wh, ''], enabled: Boolean(parent),
    queryFn: () => stockApi.board({ parentCode: parent, branchCode: target || parent, warehouseCode: wh || undefined }),
  });
  const isKho = !target;
  // [2026-11-03 04:30 PM Nguyễn Văn Thủy] NHOM — lọc theo nhóm hàng
  const [nhom, setNhom] = useState('');
  const ln = useLocNhomHang(nhom);
  const rows = useMemo(() => {
    const base = [...(q.data?.rows ?? []), ...extra.filter((x) => !(q.data?.rows ?? []).some((r) => k(r) === k(x)))];
    return ln.loc(base);
  }, [q.data, extra, ln]);
  const all = q.data?.rows ?? [];
  const dirty = Object.keys(drafts).length;
  const setD = (r: MaxBoardRow, d: Draft) => setDrafts((x) => ({ ...x, [k(r)]: { ...x[k(r)], ...d } }));
  const val = (r: MaxBoardRow, f: 'max' | 'min') => drafts[k(r)]?.[f] ?? r[f];

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const list = [...all, ...extra];
      const levels = Object.entries(drafts).filter(([, d]) => d.max !== undefined || d.min !== undefined).map(([key, d]) => {
        const r = list.find((x) => k(x) === key)!;
        const max = d.max ?? r.max, min = d.min ?? r.min;
        return { branchCode: r.branchCode, warehouseCode: r.warehouseCode, sku: r.sku, max, min, remove: !max && !min && r.hasLevel };
      }).filter((l) => l.max || l.min || l.remove);
      const modes = Object.entries(drafts).filter(([, d]) => d.mode).map(([key, d]) => ({ sku: key.split('|')[2]!, transferMode: d.mode! }));
      if (levels.length) await stockApi.saveLevels(levels);
      if (modes.length) await stockApi.saveSkuSettings(modes.map((m) => ({ ...m, windowDays: null, coverDays: null })));
      setDrafts({}); setExtra([]);
      setMsg({ ok: true, text: `Đã lưu ${levels.length} dòng tồn max${modes.length ? `, ${modes.length} cách chuyển` : ''}.` });
      await qc.invalidateQueries({ queryKey: ['ton-max'] });
    } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); }
  };
  const applySuggest = (onlyEmpty: boolean) => {
    const list = view.current.filter((r) => r.suggested > 0 && (!onlyEmpty || !val(r, 'max')));
    setDrafts((x) => ({ ...x, ...Object.fromEntries(list.map((r) => [k(r), { ...x[k(r)], max: r.suggested }])) }));
    setMsg({ ok: true, text: `Đã điền gợi ý cho ${list.length} dòng — kiểm rồi bấm Lưu.` });
  };

  const cols: Column<MaxBoardRow>[] = [
    // Mã kho đứng đầu bảng (như báo cáo tồn kho quen dùng).
    { key: 'warehouseCode', header: 'Mã kho', type: 'code' as const, width: 80 },
    { key: 'sku', header: 'Mã hàng', type: 'code' as const, width: 110 },
    { key: 'name', header: 'Tên hàng', width: 220 },
    { key: 'baseUnit', header: 'ĐVT', width: 60 },
    { key: 'pack', header: 'Quy cách', type: 'qty', width: 70, render: (r) => (r.pack ? <span title={`1 ${r.packUnit} = ${r.pack} ${r.baseUnit}`}>{r.pack} / {r.packUnit}</span> : '') },
    { key: 'ton', header: 'Tồn', type: 'qty', width: 80, className: 'tm-stock', showZero: true, sum: true },
    // [2026-11-25 kiennt] NT-MH-007 — đổi tên cột cho rõ: "Tổng max các shop" (chỉ xem, cộng max của shop con) / "Max của kho" (ô khai của kho đang xem) (đóng góp)
    ...(isKho ? [{ key: 'shopMaxSum', header: 'Tổng max các shop', type: 'qty' as const, width: 120, sum: true, className: 'tm-ref', title: 'Cộng max của mọi shop con (chỉ để xem — sửa ở từng shop). Gợi ý max kho = số này + % dự phòng' }] : [
      { key: 'avgPerDay', header: 'Bán / ngày', type: 'qty' as const, width: 80, title: 'Bán trung bình mỗi ngày trong số ngày đo', render: (r: MaxBoardRow) => <span title={`Đo trong ${r.windowDays} ngày gần nhất`}>{qtyFmt(r.avgPerDay)}</span> },
    ]),
    { key: 'suggested', header: 'Gợi ý max', type: 'qty', width: 90, title: 'Gợi ý max', render: (r) => (r.suggested ? <button className="tm-opt" title={isKho || r.shopMaxSum !== undefined ? `Tổng max shop ${qtyFmt(r.shopMaxSum)} + ${q.data?.formula.warehouseBufferPct ?? 10}% dự phòng — bấm để dùng` : `${qtyFmt(r.avgPerDay)} / ngày × ${r.coverDays} ngày — bấm để dùng`} onClick={() => setD(r, { max: r.suggested })}><span className="tm-sug">{qtyFmt(r.suggested)}</span></button> : '') },
    { key: 'max', header: isKho ? 'Max của kho' : 'Max của shop', title: isKho ? 'Max của chính kho đang xem (khai ở đây) — dùng cho phân tích đặt hàng' : 'Max của shop — dùng cho chuyển hàng xuống shop', type: 'qty', width: 110, value: (r) => val(r, 'max'), sum: true, className: 'tm-max',
      render: (r) => <OSo className={`tm-input${drafts[k(r)]?.max !== undefined ? ' dirty' : ''}`} value={val(r, 'max') || undefined} placeholder="0" onChange={(v) => setD(r, { max: v })} /> },
    { key: 'min', header: 'Min của kho', type: 'qty', width: 100, value: (r) => val(r, 'min'), hidden: !isKho,
      render: (r) => <OSo className={`tm-input${drafts[k(r)]?.min !== undefined ? ' dirty' : ''}`} value={val(r, 'min') || undefined} placeholder="0" onChange={(v) => setD(r, { min: v })} /> },
    { key: 'gap', header: 'Thiếu so max', type: 'qty', width: 90, value: (r) => Math.max(0, val(r, 'max') - r.ton), render: (r) => { const g = val(r, 'max') - r.ton; return g > 0 ? <span className="tm-low">{qtyFmt(g)}</span> : g < 0 ? <span className="muted">dư {qtyFmt(-g)}</span> : ''; } },
    { key: 'transferMode', header: 'Chuyển xuống shop', width: 130, value: (r) => drafts[k(r)]?.mode ?? r.transferMode, hidden: isKho,
      render: (r) => <select className="select input" style={{ height: 26, fontSize: 12 }} value={drafts[k(r)]?.mode ?? r.transferMode} onChange={(e) => setD(r, { mode: e.target.value as TransferMode })}>{TRANSFER_MODES.map((m) => <option key={m.key} value={m.key} title={m.hint}>{m.label}</option>)}</select> },
    { key: 'cfg', header: '', width: 40, noFilter: true, noSort: true, render: (r) => <button className="btn btn-xs" title="Cài riêng mã: số ngày đo bán, số ngày đủ hàng" onClick={() => setCfgSku(r)}><Settings2 size={13} /></button> },
  ];

  // [2026-11-26 kiennt] NT-MH-022 — đổi sang chi nhánh khác thì về kho chi nhánh, bỏ số đang sửa; chọn lại đúng chi nhánh đang xem thì giữ (NT-MH-017) (đóng góp)
  const parentTruoc = useRef(parent);
  useEffect(() => {
    if (parentTruoc.current === parent) return;
    parentTruoc.current = parent;
    setTarget(''); setWh(''); setDrafts({}); setExtra([]);
  }, [parent]);
  const curWh = q.data?.warehouseCode || wh;
  const targetName = `kho ${curWh} của ${target ? targetNode?.name ?? target : parentNode?.name ?? parent}${targetNode && isOff(targetNode) ? ' (ngừng)' : ''}`;

  return (
    <>
      <PageHeader title="Tồn max (kế toán mua hàng)" code="MH16" helpKey="mua-hang-ton-max" subtitle="Kế toán mua hàng xem và sửa max theo chi nhánh – kho – mã. Gợi ý từ tốc độ bán (shop) và tổng max shop (kho). Max là gốc của chia hàng xuống shop và đặt mua" />
      <FilterLayout filters={<>
        <BranchSelect value={cn.value} onChange={cn.onChange} />
        <ChonNhomHang value={nhom} onChange={setNhom} />
      </>}>
      <div className="card">
        <ChuaPhanCap branches={h.data?.branches} />
        <div className="tm-bar">
            <ChonShop parent={parent} value={target} onChange={(v) => { setTarget(v); setWh(''); setDrafts({}); setExtra([]); }} />
            <label className="tm-parent" title="Phân kho đang xem — max khai theo từng kho">
              <span>Phân kho</span>
              {targetNode?.warehouses.length ? <select className="select input" style={{ minWidth: 130 }} value={curWh} onChange={(e) => { setWh(e.target.value); setDrafts({}); setExtra([]); }}>
                {targetNode.warehouses.map((w) => <option key={w.code} value={w.code}>{w.code}{w.isDefault ? ' (mặc định)' : ''}</option>)}
              </select> : <span className="mh-bad" style={{ fontSize: 13 }}>chưa có kho — khai ở <Link to="/danh-muc/kho">Danh mục kho</Link></span>}
            </label>
          <span className="grow" />
          {tt.sua && <button className="btn btn-sm" onClick={() => setAdd(true)}><Plus size={14} /> Thêm mã</button>}
          <button className="btn btn-sm" onClick={() => applySuggest(true)} title="Điền gợi ý cho các dòng đang lọc mà chưa có max"><Sparkles size={14} /> Gợi ý cho mã chưa có max</button>
          <button className="btn btn-sm" onClick={() => applySuggest(false)} title="Điền gợi ý cho MỌI dòng đang lọc (ghi đè max đang có)">Áp gợi ý cho dòng đang lọc</button>
          {tt.sua && <button className="btn btn-sm" onClick={() => setImp(true)}><FileUp size={14} /> Nhập Excel</button>}
          {dirty > 0 && <button className="btn btn-sm" onClick={() => { setDrafts({}); setExtra([]); }}>Bỏ ({dirty})</button>}
          {tt.sua && <button className="btn btn-primary" disabled={!dirty || busy} onClick={() => void save()}>Lưu{dirty ? ` (${dirty})` : ''}</button>}
        </div>
        {/* [2026-11-25 kiennt] NT-MH-007 — bỏ dải ô đếm Số mã / Đã có max / Đang dưới max / Có bán, chưa có max / Max lệch gợi ý; lọc ở các cột của lưới (đóng góp) */}
        {/* [2026-11-25 kiennt] NT-MH-008 — bỏ dòng chú thích "Đang xem … · bán / ngày đo trong … max kho gợi ý …" (cách tính gợi ý xem ở MH18; rê chuột cột Gợi ý max) (đóng góp) */}
        {q.data && !q.data.mainWarehouse && <div className="alert alert-info" style={{ margin: '0 12px 8px', fontSize: 13 }}>
          Kho <b>{curWh}</b> là kho phụ: <b>không gợi ý max</b> (gợi ý chỉ ở kho chính để tồn max không bị tính trùng ở nhiều kho) — khai tay, Thêm mã hoặc Nhập Excel.
        </div>}
        {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-bad'}`} style={{ margin: '0 12px 8px' }}>{msg.text}</div>}
        <ErrorBox error={q.error ? errorText(q.error) : null} />
        {q.isLoading ? <Loading /> : (
          <div className="tm-grid"><DataGrid rows={rows} columns={cols} rowKey={(r) => k(r)} storageKey={`ton-max-v2-branch-${isKho ? 'kho' : 'shop'}`} viewRef={view} exportName={`ton-max-${parent}-${target || 'kho'}`}
            exportTitle={`Tồn max — ${targetName}`} emptyText="Chưa có mã nào (chưa có tồn, bán hay max). Bấm Thêm mã hoặc Nhập Excel." /></div>
        )}
      </div>
      </FilterLayout>
      {add && q.data && <ChonMatHang title="Thêm mã để khai max — bấm vào dòng để thêm" existing={new Map([...all, ...extra].map((r) => [r.sku, '✓ đã có']))} onClose={() => setAdd(false)}
        onPick={(p) => { setExtra((x) => [...x, { branchCode: target || parent, branchName: '', warehouseCode: curWh, sku: p.sku, name: p.name, baseUnit: p.unit, ton: 0, avgPerDay: 0, windowDays: q.data!.formula.windowDays, coverDays: q.data!.formula.coverDays, suggested: 0, max: 0, min: 0, hasLevel: false, transferMode: 'auto' }]); }} />}
      {cfgSku && <CaiRiengMa row={cfgSku} onClose={() => setCfgSku(null)} onSaved={() => { setCfgSku(null); void qc.invalidateQueries({ queryKey: ['ton-max'] }); }} />}
      {imp && parent && <NhapExcelChung<'branch' | 'wh' | 'sku' | 'max' | 'min', { branch: string; wh: string; sku: string; max: number; min: number }> onClose={() => setImp(false)} onAdd={async (list) => {
        setImp(false); setBusy(true);
        try { const r = await stockApi.saveLevels(list.map((x) => ({ branchCode: x.branch, warehouseCode: x.wh, sku: x.sku, max: x.max, min: x.min })), 'import'); setMsg({ ok: true, text: `Đã ghi ${r.saved} dòng tồn max từ Excel.` }); await qc.invalidateQueries({ queryKey: ['ton-max'] }); }
        catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); }
      }} s={{
        title: 'Nhập tồn max từ Excel (kho + shop cùng một tệp)', file: 'mau-ton-max.xlsx', keyField: 'sku',
        columns: [
          { name: 'Mã chi nhánh', required: true, aliases: 'Mã shop, Chi nhánh', example: target || shops[0]?.code || '08001', note: 'Mã chi nhánh (kho) hoặc mã shop' },
          { name: 'Mã kho', aliases: 'Kho', example: '', note: 'Trống = kho mặc định của chi nhánh (shop thường chỉ có một kho)' },
          { name: 'Mã hàng', required: true, aliases: 'Mã SP, SKU', example: '110154035', note: 'Mã trong danh mục mặt hàng' },
          { name: 'Tên hàng', example: 'Sữa bột 800g', note: 'Chỉ để xem — nhập bỏ qua' },
          { name: 'ĐVT', example: 'Lon', note: 'Chỉ để xem' },
          { name: 'Tồn', example: 12, note: 'Tồn hiện tại — chỉ để xem' },
          { name: 'Gợi ý max', example: 30, note: 'Chỉ để xem' },
          { name: 'Tồn max', required: true, aliases: 'Max', example: 24, note: 'Theo ĐVT nhỏ nhất (Lon, Hộp…). Để trống = bỏ qua dòng (không đổi)' },
          { name: 'Tồn min', aliases: 'Min', example: 0, note: 'Tuỳ chọn (thường chỉ khai cho kho). Trống = 0' },
        ],
        // [2026-11-25 kiennt] NT-MH-008 — tệp mẫu có sẵn mặt hàng đang dùng CHƯA CÓ MAX ở kho / shop đang xem (mã chi nhánh, mã kho điền sẵn;
        // kèm tồn, gợi ý nếu có) — chỉ nhập số Tồn max (đóng góp)
        mau: async () => {
          const ds = await api.get<CatalogItem[]>('/api/v1/products', { status: 'active', pageSize: 1_000_000 });
          const br = target || parent, whc = q.data?.warehouseCode || wh;
          const by = new Map((q.data?.rows ?? []).map((r) => [r.sku, r]));
          const list = [...new Set([...(q.data?.rows ?? []).map((r) => r.sku), ...ds.map((p) => p.sku)])].filter((x) => !((by.get(x)?.max ?? 0) > 0)).sort((a, b) => a.localeCompare(b));
          if (!list.length) throw new Error(`Mọi mặt hàng đang dùng đã có max ở ${br} kho ${whc} — sửa ngay trên lưới`);
          const pBy = new Map(ds.map((p) => [p.sku, p]));
          return list.map((x) => { const r = by.get(x), p = pBy.get(x); return [br, whc, x, r?.name ?? p?.name ?? '', r?.baseUnit ?? p?.unit ?? '', r ? r.ton : '', r?.suggested || '', '', '']; });
        },
        spec: [['branch', ['ma chi nhanh', 'ma shop', 'chi nhanh']], ['wh', ['ma kho', 'kho']], ['sku', ['ma hang', 'ma sp', 'sku']], ['max', ['ton max', 'max']], ['min', ['ton min', 'min']]],
        map: (r) => {
          const branch = String(r.branch).trim(), s = String(r.sku).trim();
          if (!(h.data?.branches ?? []).some((b) => b.code === branch)) return { error: `${s}: không có chi nhánh ${branch}` };
          // [2026-11-25 kiennt] NT-MH-008 — Tồn max trống = bỏ qua dòng (trước ghi max = 0); số đọc "1.500" = nghìn, "1.5" = 1,5; chữ / âm báo lỗi (đóng góp)
          const rawMax = String(r.max ?? '').trim(), rawMin = String(r.min ?? '').trim();
          if (!rawMax) return { skip: true };
          const max = docSo(rawMax), min = rawMin ? docSo(rawMin) : 0;
          if (!Number.isFinite(max) || !Number.isFinite(min) || max < 0 || min < 0) return { error: `${s}: max / min phải là số ≥ 0 ("${rawMax}"${rawMin ? ` / "${rawMin}"` : ''})` };
          if (min > 0 && max > 0 && min > max) return { error: `${s}: min lớn hơn max` };
          return { value: { branch, wh: String(r.wh ?? '').trim(), sku: s, max, min } };
        },
        head: ['Chi nhánh', 'Kho', 'Mã hàng', 'Max', 'Min'], cells: (x) => [x.branch, x.wh || '(mặc định)', x.sku, qtyFmt(x.max), qtyFmt(x.min)],
        // [2026-11-26 kiennt] NT-MH-018 — kiểm trước khi ghi: mã có trong danh mục, mã kho thuộc chi nhánh; dòng sai đỏ, không đưa vào
        // (trước đây xem trước báo ✓, lúc ghi máy chủ từ chối cả tệp vì một dòng) (đóng góp)
        check: async (list) => {
          const ds = await api.get<CatalogItem[]>('/api/v1/products', { status: 'all', pageSize: 1_000_000 });
          const co = new Set(ds.map((p) => p.sku));
          return list.map((x) => {
            if (!co.has(x.sku)) return `Mã ${x.sku} chưa có trong danh mục mặt hàng`;
            const node = (h.data?.branches ?? []).find((b) => b.code === x.branch);
            if (x.wh && node && !node.warehouses.some((w) => w.code === x.wh)) return `Kho ${x.wh} không thuộc ${x.branch} (kho của ${x.branch}: ${node.warehouses.map((w) => w.code).join(', ') || 'chưa có'})`;
            if (!x.wh && node && !node.warehouses.length) return `${x.branch} chưa có kho — khai ở Danh mục kho`;
            return undefined;
          });
        },
        note: 'Tải file mẫu: có sẵn mặt hàng chưa có max ở kho / shop đang xem — chỉ điền cột Tồn max (dòng để trống được bỏ qua). Ghi ngay khi bấm "Đưa vào": dòng đã có thì cập nhật. Mã chưa có trong danh mục bị báo lỗi.',
      }} />}
    </>
  );
}

/** Cài riêng một mã: số ngày đo bán, số ngày cần đủ hàng, cách làm tròn khi chuyển. */
function CaiRiengMa({ row, onClose, onSaved }: { row: MaxBoardRow; onClose: () => void; onSaved: () => void }) {
  const cur = useQuery({ queryKey: ['ton-max', 'sku-setting', row.sku], queryFn: () => stockApi.skuSettings([row.sku]) });
  const s = cur.data?.[0];
  const [win, setWin] = useState<string | null>(null);
  const [cover, setCover] = useState<string | null>(null);
  const [mode, setMode] = useState<TransferMode | null>(null);
  const [err, setErr] = useState('');
  const w = win ?? (s?.windowDays ? String(s.windowDays) : ''), c = cover ?? (s?.coverDays ? String(s.coverDays) : ''), m = mode ?? s?.transferMode ?? 'auto';
  const save = async (remove = false) => {
    // [2026-11-25 kiennt] NT-MH-009 — số ngày đủ hàng đọc như ô số ("3,5" / "3.5" = 3,5; trước "3.5" thành 35) (đóng góp)
    const cv = c ? docSo(c.trim()) : null;
    if (cv !== null && !(cv > 0)) { setErr(`Số ngày cần đủ hàng "${c}" không phải số > 0`); return; }
    try { await stockApi.saveSkuSettings([{ sku: row.sku, windowDays: w ? Number(w) : null, coverDays: cv, transferMode: m, remove }]); onSaved(); } catch (e) { setErr(errorText(e)); }
  };
  return (
    <Modal title={`Cài riêng mã ${row.sku} — ${row.name}`} onClose={onClose} footer={<>{s && <button className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={() => void save(true)}>Bỏ cài riêng</button>}<button className="btn btn-primary" onClick={() => void save()}>Ghi</button><button className="btn" onClick={onClose}>Thoát</button></>}>
      <div className="full alert alert-info" style={{ fontSize: 13 }}>Để trống = theo công thức của chi nhánh ({row.windowDays} ngày đo, {row.coverDays} ngày đủ hàng). Áp cho mọi chi nhánh.</div>
      <Field label="Số ngày đo tốc độ bán" hint="Bán / ngày = tổng bán trong N ngày gần nhất ÷ N (mặc định 7)"><input className="input num" style={{ width: 100 }} value={w} placeholder={String(row.windowDays)} onChange={(e) => setWin(e.target.value.replace(/\D/g, ''))} /></Field>
      <Field label="Số ngày cần đủ hàng ở shop" hint="Max gợi ý = bán / ngày × số này"><input className="input num" style={{ width: 100 }} value={c} placeholder={String(row.coverDays)} onChange={(e) => setCover(e.target.value)} /></Field>
      <Field label="Chuyển xuống shop" full>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>{TRANSFER_MODES.map((x) => <label key={x.key} className="checkbox chk-explain"><input type="radio" checked={m === x.key} onChange={() => setMode(x.key)} /> <span><b>{x.label}</b><small>{x.hint}</small></span></label>)}</div>
      </Field>
      {err && <div className="full alert alert-bad">{err}</div>}
    </Modal>
  );
}
