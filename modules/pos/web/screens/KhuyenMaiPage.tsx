/**
 * BH18 Khuyến mại (phiếu NT-BH-016, chữ chốt docs/nghiep-vu/22): danh sách khuyến mại (khuôn `sale.promo.*` ở sổ đăng ký chính sách của Core),
 * Thêm theo 6 loại, Sửa (bản mới từ ngày chọn), Ngừng (bản mới kết thúc hôm trước ngày ngừng), Thử tính trên giỏ hàng. Chỉ gọi API chính sách
 * có sẵn của Core — module không lưu gì.
 * 15/11 (phiếu NT-BH-018): một màn *Chương trình khuyến mại* — gộp Chương trình bán có hạn mức (trước là BH12): thẻ *Có hạn mức*, *Báo cáo hạn
 * mức* (API /api/v1/sale-programs giữ nguyên), Thêm có 8 loại (6 khuyến mại + tặng hàng / giảm giá có hạn mức), Thử tính chung mọi chương trình.
 * Đường cũ /ban-hang/chuong-trinh chuyển về đây, thẻ Có hạn mức (?the=han-muc).
 */
// [2026-11-14 01:20 AM Võ Hoàng] NGHIEM-THU — NT-BH-016: màn Khuyến mại BH18 (đóng góp)
// [2026-11-15 10:00 AM Võ Hoàng] NGHIEM-THU — NT-BH-018: gộp BH12 vào BH18 thành một màn Chương trình khuyến mại (đóng góp)
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-025: Thêm / Sửa lưu nháp → duyệt → phát hành; thẻ Nháp / chờ duyệt, Báo cáo khuyến mại; ngừng ghi nhật ký (đóng góp)
import { useMemo, useState } from 'react';
import { BranchPicker, DataGrid, ErrorBox, Field, Loading, Modal, PageHeader, errorText, useApi, useCan, useMutation, useQuery, useQueryClient, type GridColumn } from '@bizcity/ui-kit';
import { Badge, M, vnd } from '../lib';
import { DraftsTab, PromoReportTab, draftToForm } from './khuyen-mai/Drafts';
import { HanMucForm } from './khuyen-mai/HanMucForm';
import { HanMucList, HanMucReport } from './khuyen-mai/HanMucTab';
import { QUOTA_KINDS, type Program } from './khuyen-mai/han-muc';
import { KmForm } from './khuyen-mai/KmForm';
import { KIND_BY_CONTRACT, KIND_INFO, STATUS_LABEL, STOP_REASON, emptyForm, fromParams, statusOf, stopParams, type Form, type PromoKind } from './khuyen-mai/model';
// [2026-11-27 Võ Hoàng] NGHIEM-THU — NT-BH-049 (S-CD-14, S-CD-15, S-CD-18): Thêm mở form kiểu plugin cũ (loại chọn trong form, chỉ 7 loại cũ);
// loại mới của màn (bậc, combo món, flash sale, hạn mức…) ẩn khỏi Thêm — chương trình đã có vẫn mở bằng form cũ; thanh nút như màn danh mục (đóng góp)
import { PolicyForm } from './khuyen-mai/PolicyForm';
import { OLD_TYPE, emptyOld, nextPolicyCode, oldFromParams, type OldForm } from './khuyen-mai/old-types';
import type { Draft } from './khuyen-mai/Drafts';

type Version = { version: number; effectiveFrom: string | null; effectiveTo: string | null; status: string; scope: { branchCodes?: string[] }; reason: string | null; applied: number; publishedBy: string; publishedAt: string };
type RegPolicy = { policyKey: string; ruleContract: string; versions: Version[]; current: number | null };
type PolicyView = { policyKey: string; version: number; ruleContract: string; params: Record<string, unknown> | null; scope: { branchCodes?: string[] }; effectiveFrom: string | null };
type Row = {
  key: string; kind: PromoKind; contract: string; version: number; branches: string; from: string; to: string; status: keyof typeof STATUS_LABEL; applied: number; note: string; last: Version;
  /** Tên loại theo plugin cũ khi nội dung khớp một loại cũ. */
  oldLabel?: string;
};

const today = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** Mẫu dựng sẵn (NT-BH-049, K10) — ẨN khỏi Thêm từ 27/11 (S-CD-14: chỉ loại plugin cũ đang chạy); giữ code để bật lại sau. */
const SHOW_PRESETS = false;
const PRESETS: { id: string; label: string; hint: string; make: (d: string) => Form }[] = [
  { id: 'flash', label: 'Flash sale (giá sốc theo giờ)', hint: 'Giá riêng từng mã trong khung giờ, giới hạn số lượng mỗi phiếu và số lượt mỗi cửa hàng',
    make: (d) => ({ ...emptyForm('price_lines', d), reason: 'Flash sale', validTo: d, timeFrom: '11:00', timeTo: '13:00', quotaPerBranch: '50', exclusive: true }) },
  { id: 'khai-truong', label: 'Khai trương cửa hàng', hint: 'Giảm % theo tổng đơn trong vài ngày đầu, chỉ cửa hàng mới (chọn cửa hàng)',
    make: (d) => ({ ...emptyForm('order_discount', d), reason: 'Khai trương', validTo: new Date(Date.parse(`${d}T00:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10), orderTiers: [{ minOrder: '0', mode: 'pct', value: '10', maxDiscount: '100000' }] }) },
  { id: 'sinh-nhat', label: 'Sinh nhật khách hàng', hint: 'Giảm % tổng đơn cho khách có sinh nhật (chọn theo ngày / tuần / tháng ở Điều kiện)',
    make: (d) => ({ ...emptyForm('order_discount', d), reason: 'Sinh nhật khách hàng', birthdayScope: 'week', orderTiers: [{ minOrder: '0', mode: 'pct', value: '10', maxDiscount: '' }] }) },
];

const cols: GridColumn<Row>[] = [
  { key: 'key', header: 'Mã', type: 'code', width: 150 },
  { key: 'kind', header: 'Loại', width: 230, value: (r) => r.oldLabel ?? KIND_INFO[r.kind].label },
  { key: 'branches', header: 'Cửa hàng', width: 150 },
  { key: 'from', header: 'Từ ngày', width: 100 },
  { key: 'to', header: 'Đến ngày', width: 100 },
  { key: 'status', header: 'Trạng thái', width: 100, value: (r) => STATUS_LABEL[r.status].label, render: (r) => <Badge map={STATUS_LABEL} value={r.status} /> },
  { key: 'version', header: 'Bản', type: 'number', width: 60 },
  { key: 'applied', header: 'Chứng từ đã áp', type: 'number', sum: true, width: 110 },
  { key: 'note', header: 'Tên / ghi chú', width: 260 },
];

type Tab = 'km' | 'nhap' | 'han-muc' | 'bao-cao' | 'bao-cao-km';
const TABS: [Tab, string, string][] = [
  ['km', 'Khuyến mại', 'Giảm theo bậc, tổng đơn / mã giảm giá, quà theo tổng đơn, combo, món rẻ nhất, mua X tặng Y — đã phát hành'],
  ['nhap', 'Nháp / chờ duyệt', 'Khuyến mại mới / sửa chờ người có quyền Duyệt khuyến mại duyệt rồi mới phát hành (NT-BH-025)'],
  ['han-muc', 'Có hạn mức', 'Tặng hàng / giảm giá trên một mặt hàng, mỗi cửa hàng một số suất (trước là màn Chương trình bán BH12)'],
  ['bao-cao', 'Báo cáo hạn mức', 'Hạn mức, đã dùng, còn lại theo cửa hàng — tính từ các dòng đã bán'],
  ['bao-cao-km', 'Báo cáo khuyến mại', 'Khuyến mại đã dùng theo chương trình × cửa hàng × kỳ: số đơn, tiền giảm, số quà, lượt / hạn mức; bấm xem đơn; Excel'],
];
const tabFromUrl = (): Tab => {
  try { const t = new URLSearchParams(window.location.search).get('the'); return TABS.some(([k]) => k === t) ? (t as Tab) : 'km'; } catch { return 'km'; }
};

export function KhuyenMaiPage() {
  const api = useApi();
  const can = useCan();
  const qc = useQueryClient();
  const writable = can('settings:write');
  /** Chương trình có hạn mức ghi qua /api/v1/sale-programs — quyền ghi danh mục. */
  const quotaWritable = can('catalog:write');
  const [tab, setTab] = useState<Tab>(tabFromUrl);
  const [quotaForm, setQuotaForm] = useState<{ program: Program | null; mode: 'gift' | 'discount' } | null>(null);
  const reg = useQuery({ queryKey: ['km', 'registry'], queryFn: () => api.get<{ items: RegPolicy[] }>('/api/v1/policy-registry') });
  const cur = useQuery({ queryKey: ['km', 'current'], queryFn: () => api.get<{ items: PolicyView[] }>('/api/v1/policies', { domain: 'sale' }) });
  const [pick, setPick] = useState<Row | null>(null);
  const [form, setForm] = useState<{ f: Form; editing: boolean; draftId?: string } | null>(null);
  const [oldForm, setOldForm] = useState<{ f: OldForm; editing: boolean; draftId?: string } | null>(null);
  const [chooseKind, setChooseKind] = useState(false);
  const [trial, setTrial] = useState<string[] | null>(null);
  const [stopOf, setStopOf] = useState<Row | null>(null);
  const [msg, setMsg] = useState('');
  const d0 = today();

  const rows: Row[] = useMemo(() => {
    const params = new Map((cur.data?.items ?? []).map((p) => [p.policyKey, p.params ?? {}]));
    return (reg.data?.items ?? []).filter((p) => KIND_BY_CONTRACT[p.ruleContract]).map((p) => {
      const last = p.versions[p.versions.length - 1]!;
      const shown = p.versions.find((v) => v.version === p.current) ?? last;
      const pr = (params.get(p.policyKey) ?? {}) as { validFrom?: string; validTo?: string };
      const old = oldFromParams(p.ruleContract, (params.get(p.policyKey) ?? {}) as Record<string, unknown>, { key: p.policyKey, today: d0 });
      return {
        ...(old ? { oldLabel: OLD_TYPE[old.type].label } : {}),
        key: p.policyKey, kind: KIND_BY_CONTRACT[p.ruleContract]!, contract: p.ruleContract, version: last.version,
        branches: (shown.scope?.branchCodes ?? []).join(', ') || 'Mọi cửa hàng', from: pr.validFrom ?? shown.effectiveFrom ?? '', to: pr.validTo ?? last.effectiveTo ?? '',
        status: statusOf({ validFrom: pr.validFrom ?? last.effectiveFrom, validTo: pr.validTo, lastReason: last.reason, effectiveTo: last.effectiveTo }, d0),
        applied: p.versions.reduce((s, v) => s + (v.applied ?? 0), 0), note: p.versions[0]?.reason ?? '', last,
      };
    }).sort((a, b) => b.from.localeCompare(a.from) || a.key.localeCompare(b.key));
  }, [reg.data, cur.data, d0]);

  /** Nội dung bản mới nhất của một khuyến mại (đọc tại ngày áp của bản đó — bản sắp chạy chưa phủ hôm nay). */
  const loadParams = async (r: Row) => {
    const at = r.last.effectiveFrom && r.last.effectiveFrom > d0 ? r.last.effectiveFrom : d0;
    const list = (await api.get<{ items: PolicyView[] }>('/api/v1/policies', { domain: 'sale', at })).items;
    const p = list.find((x) => x.policyKey === r.key);
    if (!p?.params) throw new Error(`Không đọc được nội dung khuyến mại ${r.key} tại ngày ${at}`);
    return p;
  };
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['km'] })]);
  /** Bản nháp đã phát hành gần nhất của mã (tên, hạn mức lượt). */
  const lastPublished = async (key: string): Promise<Draft | undefined> => {
    const x = await api.get<{ items?: Draft[] } | Draft[]>(`${M}/promo/drafts`, { status: 'published', q: key });
    return (Array.isArray(x) ? x : x.items ?? []).filter((d) => d.key === key)[0];
  };
  // [2026-11-28 Võ Hoàng] NGHIEM-THU — NT-BH-049: Thêm điền sẵn mã TGS_<MMYY>_<NN> kế tiếp (chương trình + nháp đang có), sửa được (đóng góp)
  const addNew = async () => {
    const drafts = await api.get<Draft[] | { items?: Draft[] }>(`${M}/promo/drafts`, { q: 'TGS_' }).then((x) => (Array.isArray(x) ? x : x.items ?? [])).catch(() => [] as Draft[]);
    const key = nextPolicyCode([...rows.map((r) => r.key), ...drafts.map((d) => d.key)], d0);
    setOldForm({ f: { ...emptyOld('ck', d0), key }, editing: false });
  };
  const edit = useMutation({
    mutationFn: async (r: Row): Promise<{ old?: OldForm; f?: Form }> => {
      const p = await loadParams(r);
      const eff = d0 > (r.last.effectiveFrom ?? '') ? nextDay(d0) : (r.last.effectiveFrom ?? d0);
      const pub = await lastPublished(r.key).catch(() => undefined);
      const old = oldFromParams(r.contract, p.params!, { key: r.key, reason: pub?.reason ?? r.note, branchCodes: p.scope?.branchCodes, quota: pub?.quota ?? null, today: d0, effectiveFrom: eff });
      if (old) return { old };
      const f = fromParams(r.contract, p.params!, { key: r.key, branchCodes: p.scope?.branchCodes, today: d0 });
      if (!f) throw new Error('Loại khuyến mại này chưa sửa được ở màn');
      return { f: { ...f, effectiveFrom: eff, reason: '' } };
    },
    onSuccess: (x) => (x.old ? setOldForm({ f: x.old, editing: true }) : setForm({ f: x.f!, editing: true })),
  });
  // [2026-11-27 Võ Hoàng] NGHIEM-THU — NT-BH-049 (K11): nhân bản — mở form Thêm chép nội dung khuyến mại đang chọn, mã để trống, áp từ hôm nay (đóng góp)
  const copy = useMutation({
    mutationFn: async (r: Row): Promise<{ old?: OldForm; f?: Form }> => {
      const p = await loadParams(r);
      const old = oldFromParams(r.contract, p.params!, { key: '', reason: `${r.note || r.key} (bản sao)`, branchCodes: p.scope?.branchCodes, today: d0, effectiveFrom: d0 });
      if (old) return { old: { ...old, key: '', validFrom: old.validFrom && old.validFrom < d0 ? d0 : old.validFrom } };
      const f = fromParams(r.contract, p.params!, { key: '', branchCodes: p.scope?.branchCodes, today: d0 });
      if (!f) throw new Error('Loại khuyến mại này chưa nhân bản được ở màn');
      return { f: { ...f, key: '', effectiveFrom: d0, validFrom: f.validFrom && f.validFrom < d0 ? d0 : f.validFrom, reason: `Nhân bản từ ${r.key}` } };
    },
    onSuccess: (x) => (x.old ? setOldForm({ f: x.old, editing: false }) : setForm({ f: x.f!, editing: false })),
  });
  const stop = useMutation({
    mutationFn: async ({ r, from }: { r: Row; from: string }) => {
      const p = await loadParams(r);
      return api.post('/api/v1/policies', {
        key: r.key, ruleContract: r.contract, params: stopParams(p.params!, from), effectiveFrom: from,
        ...(p.scope?.branchCodes?.length ? { scope: { branchCodes: p.scope.branchCodes } } : {}), reason: `${STOP_REASON} từ ${from}`,
      }).then(() => api.post(`${M}/promo/stopped`, { key: r.key, from }));
    },
    onSuccess: (_x, v) => { setStopOf(null); setMsg(`Đã ngừng ${v.r.key} từ ${v.from}.`); void refresh(); },
  });

  if (reg.isLoading || cur.isLoading) return <Loading />;
  if (reg.error || cur.error) return <ErrorBox error={errorText(reg.error ?? cur.error)} />;
  const canAdd = writable || quotaWritable;
  return (
    <div>
      <PageHeader title="Chương trình khuyến mại" code="BH18" subtitle="Mọi ưu đãi bán hàng ở một chỗ — máy bán và phiếu bán áp tự động, Core tính chung. Khuyến mại theo đơn / nhóm hàng (6 loại) và chương trình tặng hàng / giảm giá có hạn mức từng cửa hàng." />
      <div className="tabs" role="tablist" style={{ margin: '8px 0' }}>
        {TABS.map(([k, l, t]) => <button key={k} type="button" role="tab" className={`tab ${tab === k ? 'active' : ''}`} title={t} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      <div className="catalog-toolbar canh-phai" style={{ border: '1px solid var(--line-soft, #e3e8ee)', borderRadius: 6 }}>
        {canAdd && <button type="button" className="btn btn-sm btn-primary" title={tab === 'han-muc' ? 'Thêm chương trình có hạn mức cửa hàng' : 'Thêm chương trình khuyến mại (loại chọn trong form, như plugin cũ)'}
          onClick={() => (tab === 'han-muc' ? setChooseKind(true) : void addNew())}>+ Thêm</button>}
        {tab === 'km' && writable && <button type="button" className="btn btn-sm" disabled={!pick || edit.isPending} title={pick ? '' : 'Chọn một khuyến mại ở bảng'} onClick={() => pick && edit.mutate(pick)}>Sửa</button>}
        {tab === 'km' && writable && <button type="button" className="btn btn-sm" disabled={!pick || copy.isPending} title={pick ? 'Thêm khuyến mại mới chép nội dung khuyến mại đang chọn (mã để trống)' : 'Chọn một khuyến mại ở bảng'} onClick={() => pick && copy.mutate(pick)}>Nhân bản</button>}
        {tab === 'km' && writable && <button type="button" className="btn btn-sm" disabled={!pick || pick.status === 'stopped' || pick.status === 'ended'} title={!pick ? 'Chọn một khuyến mại ở bảng' : pick.status === 'stopped' || pick.status === 'ended' ? 'Khuyến mại đã ngừng / đã hết' : ''} onClick={() => setStopOf(pick)}>Ngừng</button>}
        <button type="button" className="btn btn-sm" title="Tính một giỏ hàng như máy bán — mọi chương trình đang chạy (cả có hạn mức), hoặc khuyến mại đang chọn; không ghi gì"
          onClick={() => setTrial(tab === 'km' && pick ? [pick.key] : [])}>Thử tính{tab === 'km' && pick ? ` ${pick.key}` : ' (mọi chương trình)'}</button>
        {tab === 'han-muc' && <span className="muted">Bấm một dòng để xem / sửa hạn mức.</span>}
        {msg && <span className="muted">{msg}</span>}
        {!canAdd && <span className="muted">Thêm / sửa cần quyền ghi cấu hình (khuyến mại) hoặc ghi danh mục (chương trình có hạn mức).</span>}
      </div>
      {edit.error && <ErrorBox error={errorText(edit.error)} />}
      {copy.error && <ErrorBox error={errorText(copy.error)} />}
      {tab === 'km' && (
        <DataGrid rows={rows} columns={cols} rowKey={(r) => r.key} storageKey="pos.khuyen-mai" onRowClick={setPick} onRowDoubleClick={(r) => writable && edit.mutate(r)}
          rowClassName={(r) => (r.key === pick?.key ? 'selected' : '')} emptyText="Chưa có khuyến mại — bấm Thêm" exportName="khuyen-mai" exportTitle="Khuyến mại" />
      )}
      {tab === 'nhap' && <DraftsTab today={d0} onMsg={setMsg} onEdit={(d) => {
        const old = oldFromParams(d.ruleContract, d.params, { key: d.key, reason: d.reason, branchCodes: d.branchCodes, quota: d.quota, today: d0, effectiveFrom: d.effectiveFrom });
        if (old) return setOldForm({ f: old, editing: d.publishedVersion !== null, draftId: d.id });
        const f = draftToForm(d, d0);
        if (!f) return setMsg('Loại khuyến mại này chưa sửa được ở màn');
        setForm({ f, editing: d.publishedVersion !== null, draftId: d.id });
      }} />}
      {tab === 'bao-cao-km' && <PromoReportTab today={d0} />}
      {tab === 'han-muc' && <HanMucList onOpen={(p) => setQuotaForm({ program: p, mode: p.mode })} />}
      {tab === 'bao-cao' && <HanMucReport today={d0} />}

      {chooseKind && (
        <Modal title="Thêm chương trình có hạn mức — chọn loại" onClose={() => setChooseKind(false)}>
          <div style={{ display: 'grid', gap: 6, gridColumn: '1 / -1' }}>
            {/* NT-BH-049 (K10): mẫu dựng sẵn từ loại có sẵn — flash sale = giá riêng từng mã + khung giờ + số lượng tối đa / phiếu + hạn mức lượt */}
            {SHOW_PRESETS && PRESETS.map((pr) => (
              <button key={pr.id} type="button" className="btn" style={{ textAlign: 'left' }} disabled={!writable} title={writable ? pr.hint : 'Cần quyền ghi cấu hình (settings:write)'}
                onClick={() => { setChooseKind(false); setForm({ f: pr.make(d0), editing: false }); }}>
                <b>{pr.label}</b><br /><span className="muted">{pr.hint}</span>
              </button>
            ))}
            {SHOW_PRESETS && (Object.keys(KIND_INFO) as PromoKind[]).map((k) => (
              <button key={k} type="button" className="btn" style={{ textAlign: 'left' }} disabled={!writable} title={writable ? '' : 'Cần quyền ghi cấu hình (settings:write)'}
                onClick={() => { setChooseKind(false); setForm({ f: emptyForm(k, d0), editing: false }); }}>
                <b>{KIND_INFO[k].label}</b><br /><span className="muted">{KIND_INFO[k].hint}</span>
              </button>
            ))}
            {(Object.keys(QUOTA_KINDS) as (keyof typeof QUOTA_KINDS)[]).map((m) => (
              <button key={m} type="button" className="btn" style={{ textAlign: 'left' }} disabled={!quotaWritable} title={quotaWritable ? '' : 'Cần quyền ghi danh mục (catalog:write)'}
                onClick={() => { setChooseKind(false); setTab('han-muc'); setQuotaForm({ program: null, mode: m }); }}>
                <b>{QUOTA_KINDS[m].label}</b><br /><span className="muted">{QUOTA_KINDS[m].hint}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {quotaForm && (
        <HanMucForm key={quotaForm.program?.id ?? `new-${quotaForm.mode}`} program={quotaForm.program} mode={quotaForm.mode} today={d0} writable={quotaWritable}
          onClose={() => setQuotaForm(null)} onDone={(code) => { setQuotaForm(null); setMsg(`Đã lưu chương trình ${code}.`); void refresh(); }} />
      )}
      {oldForm && <PolicyForm initial={oldForm.f} editing={oldForm.editing} {...(oldForm.draftId ? { draftId: oldForm.draftId } : {})} onClose={() => setOldForm(null)}
        onDone={(m) => { setOldForm(null); setMsg(m); setTab('nhap'); void refresh(); }} />}
      {form && <KmForm initial={form.f} editing={form.editing} {...(form.draftId ? { draftId: form.draftId } : {})} onClose={() => setForm(null)}
        onDone={(m) => { setForm(null); setMsg(m); setTab('nhap'); void refresh(); }} />}
      {stopOf && <StopDialog row={stopOf} pending={stop.isPending} error={stop.error ? errorText(stop.error) : ''} onClose={() => setStopOf(null)} onStop={(from) => stop.mutate({ r: stopOf, from })} />}
      {trial && <TrialDialog keys={trial} onClose={() => setTrial(null)} />}
    </div>
  );
}

function StopDialog({ row, pending, error, onClose, onStop }: { row: Row; pending: boolean; error: string; onClose: () => void; onStop: (from: string) => void }) {
  const [from, setFrom] = useState(today());
  return (
    <Modal title={`Ngừng khuyến mại ${row.key}`} onClose={onClose} footer={<div className="row" style={{ gap: 8 }}>
      <button type="button" className="btn btn-primary" disabled={pending || !from} onClick={() => onStop(from)}>Ngừng</button><button type="button" className="btn" onClick={onClose}>Đóng</button></div>}>
      <div style={{ gridColumn: '1 / -1', display: 'grid', gap: 8 }}>
      <Field label="Ngừng từ ngày" hint="Hôm nay = ngừng ngay: đơn từ ngày này không còn được giảm. Chứng từ đã bán giữ nguyên."><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
      {error && <ErrorBox error={error} />}
      </div>
    </Modal>
  );
}

type TrialLine = { sku: string; qty: string; price: string };
type EvalOut = {
  applied: { policyRef: { key: string; version: number }; explain: string }[]; skipped: { key: string; reason: string }[];
  discounts: { lineKey: string; sku: string; amount: number; policyRef: { key: string } }[]; gifts: { sku: string; qty: number; policyRef: { key: string } }[];
  capped?: { lineKey: string; key: string; before: number; after: number; capPct: number }[];
  /** NT-BH-049: chương trình quà lựa chọn chờ chọn quà. */
  pendingChoices?: { key: string; choose: number; options: { sku: string; qty: number }[]; problem?: string }[];
};

/** Thử tính trên giỏ hàng: gọi bộ tính của Core (như máy bán) với các khuyến mại đã phát hành; không ghi gì. */
function TrialDialog({ keys, onClose }: { keys: string[]; onClose: () => void }) {
  const api = useApi();
  const [date, setDate] = useState(today());
  const [branch, setBranch] = useState('');
  const [time, setTime] = useState('');
  const [coupon, setCoupon] = useState('');
  const [lines, setLines] = useState<TrialLine[]>([{ sku: '', qty: '1', price: '' }]);
  const [choice, setChoice] = useState<Record<string, string[]>>({});
  const [orderType, setOrderType] = useState<'retail' | 'wholesale' | 'so'>('retail');
  const [birthday, setBirthday] = useState('');
  const run = useMutation({
    mutationFn: () => api.post<EvalOut>('/api/v1/policies/evaluate', {
      docDate: date, ...(branch ? { branchCode: branch } : {}), ...(keys.length ? { policies: keys.map((key) => ({ key })) } : {}),
      ...(time ? { at: { time, weekday: ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1 } } : {}), ...(coupon.trim() ? { coupons: coupon.split(/[\s,]+/).filter(Boolean) } : {}),
      ...(Object.keys(choice).length ? { giftChoice: choice } : {}), orderType, ...(birthday ? { customer: { birthday } } : {}),
      lines: lines.filter((l) => l.sku.trim()).map((l, i) => ({ lineKey: `L${i + 1}`, sku: l.sku.trim(), qty: Number(l.qty) || 0, ...(l.price.trim() ? { price: Number(l.price.replace(/\./g, '')) } : {}) })),
    }),
  });
  const set = (i: number, p: Partial<TrialLine>) => setLines(lines.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const r = run.data;
  return (
    <Modal wide title={`Thử tính — ${keys.length ? keys.join(', ') : 'mọi khuyến mại đang hiệu lực'}`} onClose={onClose} footer={<div className="row" style={{ gap: 8 }}>
      <button type="button" className="btn btn-primary" disabled={run.isPending || !lines.some((l) => l.sku.trim())} onClick={() => run.mutate()}>Tính</button><button type="button" className="btn" onClick={onClose}>Đóng</button></div>}>
      <div style={{ display: 'grid', gap: 8, gridColumn: '1 / -1' }}>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Field label="Ngày bán"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Cửa hàng"><BranchPicker value={branch} onChange={setBranch} /></Field>
          <Field label="Giờ bán"><input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
          <Field label="Mã giảm giá khách đọc"><input className="input" value={coupon} onChange={(e) => setCoupon(e.target.value)} /></Field>
          <Field label="Loại đơn"><select className="input" value={orderType} onChange={(e) => setOrderType(e.target.value as 'retail')}><option value="retail">Bán lẻ</option><option value="wholesale">Bán sỉ</option><option value="so">Đặt hàng</option></select></Field>
          <Field label="Ngày sinh khách"><input className="input" type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} /></Field>
        </div>
        <b>Giỏ hàng</b>
        {lines.map((l, i) => (
          <div key={i} className="row" style={{ gap: 6 }}>
            Mã <input className="input" style={{ width: 150 }} value={l.sku} onChange={(e) => set(i, { sku: e.target.value })} />
            SL <input className="input" style={{ width: 70 }} value={l.qty} onChange={(e) => set(i, { qty: e.target.value })} />
            Đơn giá <input className="input" style={{ width: 120 }} value={l.price} placeholder="gồm thuế" onChange={(e) => set(i, { price: e.target.value })} />
            {lines.length > 1 && <button type="button" className="btn btn-xs" onClick={() => setLines(lines.filter((_, j) => j !== i))}>×</button>}
          </div>
        ))}
        <div><button type="button" className="btn btn-xs" onClick={() => setLines([...lines, { sku: '', qty: '1', price: '' }])}>+ Thêm dòng</button></div>
        {run.error && <ErrorBox error={errorText(run.error)} />}
        {r && (
          <div style={{ display: 'grid', gap: 4 }}>
            <b>Áp được</b>
            {r.applied.length ? r.applied.map((a) => <div key={a.policyRef.key}>✔ {a.policyRef.key} (bản {a.policyRef.version}): {a.explain}</div>) : <div className="muted">Không khuyến mại nào áp.</div>}
            {r.discounts.map((d, i) => <div key={i} className="muted">— dòng {d.lineKey} {d.sku}: giảm {vnd(d.amount)} ({d.policyRef.key})</div>)}
            {r.gifts.map((g, i) => <div key={i} className="muted">— tặng {g.qty} {g.sku} ({g.policyRef.key})</div>)}
            {(r.capped ?? []).map((c, i) => <div key={i} className="muted">— dòng {c.lineKey}: {c.key} bị kẹp theo trần {c.capPct} % ({vnd(c.before)} → {vnd(c.after)})</div>)}
            {(r.pendingChoices ?? []).map((pc) => (
              <div key={pc.key} className="alert alert-warn" style={{ display: 'grid', gap: 4 }}>
                <span>{pc.key}: khách chọn {pc.choose} quà{pc.problem ? ` — ${pc.problem}` : ''}</span>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>{pc.options.map((o) => (
                  <label key={o.sku}><input type="checkbox" checked={(choice[pc.key] ?? []).includes(o.sku)}
                    onChange={(e) => setChoice((c) => ({ ...c, [pc.key]: e.target.checked ? [...(c[pc.key] ?? []), o.sku] : (c[pc.key] ?? []).filter((x) => x !== o.sku) }))} /> {o.qty} {o.sku}</label>
                ))}</div>
                <span className="muted">Chọn xong bấm Tính lại.</span>
              </div>
            ))}
            {r.skipped.length > 0 && <><b>Không áp</b>{r.skipped.map((s, i) => <div key={i} className="muted">✘ {s.key}: {s.reason}</div>)}</>}
          </div>
        )}
      </div>
    </Modal>
  );
}
