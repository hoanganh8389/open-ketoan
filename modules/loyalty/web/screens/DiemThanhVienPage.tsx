// [2026-11-16 11:00 AM Võ Hoàng] LOYALTY — NT-BH-020 bước 3: màn BH19 Điểm thành viên (đóng góp)
// [2026-11-25 09:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-039: thêm thẻ Chương trình / Đổi điểm / Cài đặt + hạng / Điều chỉnh — khai, duyệt chính sách ở kế toán (đóng góp)
/**
 * BH19 Điểm thành viên. Thẻ Tổng quan (NT-BH-020 kiểm 5): phát sinh điểm trong kỳ theo cửa hàng, số dư cuối kỳ theo hạng, danh sách khách.
 * NT-BH-059: theo luồng 4 bước — Cài đặt + hạng, Chương trình tích điểm, Đổi điểm (mỗi chương trình áp Tất cả / chọn cửa hàng; Ghi · Gửi
 * duyệt · Duyệt phát hành), Thành viên & điều chỉnh (điều chỉnh tay vẫn người khác duyệt).
 */
import { useState, type ReactNode } from 'react';
// [2026-11-28 03:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-059: BH19 theo luồng 1 Cài đặt + hạng → 2 Chương trình tích điểm → 3 Đổi điểm → 4 Thành viên & điều chỉnh;
// khai theo chương trình áp cho Tất cả / chọn cửa hàng (thay khung soạn theo từng cửa hàng) (đóng góp)
import { CaiDatTab } from './diem/CaiDatTab';
import { ChuongTrinhTab } from './diem/ChuongTrinhTab';
import { DieuChinhTab } from './diem/DieuChinhTab';
import { M, type Overview } from './diem/model';
// [2026-11-27 Võ Hoàng] NGHIEM-THU — NT-BH-051: thẻ Thành viên (tìm, lọc hạng, cộng / trừ, lịch sử trước / sau) như plugin cũ (đóng góp)
import { ThanhVienTab } from './diem/ThanhVienTab';
import { DataGrid, ErrorBox, FilterLayout, KpiCards, Loading, PageHeader, PeriodField, errorText, useApi, useQuery, type GridColumn } from '@bizcity/ui-kit';

type Kinds = { earn: number; redeem: number; expire: number; reverse: number; adjust: number };
type Report = {
  from: string; to: string; total: Kinds; balance: number; customerCount: number;
  byBranch: (Kinds & { branchCode: string })[];
  byTier: { tierKey: string; tierName: string; customers: number; balance: number }[];
  customers: { customerCode: string; balance: number; tierName: string; period: Kinds }[];
};

const vnToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
/** Tiêu đề cột có chú thích rê chuột: nghĩa + cách tính (UI §7). */
const h = (label: string, tip: string) => <span title={tip}>{label}</span>;
const kindCols = <T extends Kinds>(): GridColumn<T>[] => [
  { key: 'earn', header: h('Tích', 'Điểm tích theo đơn bán (và số dư cũ nạp từ website)'), type: 'number', sum: true, width: 90 },
  { key: 'redeem', header: h('Đổi', 'Điểm khách đổi lấy quà / voucher (số âm)'), type: 'number', sum: true, width: 90 },
  { key: 'expire', header: h('Hết hạn', 'Phần còn lại của lô quá hạn, ghi hằng ngày (số âm)'), type: 'number', sum: true, width: 90 },
  { key: 'reverse', header: h('Hoàn khi trả hàng', 'Điểm đã tích của phần hàng khách trả (số âm)'), type: 'number', sum: true, width: 120 },
  { key: 'adjust', header: h('Điều chỉnh', 'Điều chỉnh tay'), type: 'number', sum: true, width: 100 },
];
const branchCols: GridColumn<Report['byBranch'][number]>[] = [
  { key: 'branchCode', header: h('Cửa hàng', 'Cửa hàng phát sinh; hết hạn / số dư cũ không gắn cửa hàng'), type: 'code', width: 110, value: (b) => b.branchCode || '(không theo cửa hàng)' },
  ...kindCols<Report['byBranch'][number]>(),
];
const tierCols: GridColumn<Report['byTier'][number]>[] = [
  { key: 'tierName', header: h('Hạng', 'Hạng theo tổng điểm đã tích (chính sách website)'), width: 140 },
  { key: 'customers', header: 'Số khách', type: 'number', sum: true, width: 90 },
  { key: 'balance', header: h('Điểm còn', 'Tổng số dư cuối kỳ của khách ở hạng này'), type: 'number', sum: true, width: 110 },
];
const customerCols: GridColumn<Report['customers'][number]>[] = [
  { key: 'customerCode', header: h('Mã khách', 'Mã đối tượng (máy bán: SĐT)'), type: 'code', width: 120 },
  { key: 'tierName', header: 'Hạng', width: 110 },
  { key: 'balance', header: h('Điểm còn', 'Số dư cuối kỳ = tổng mọi dòng sổ điểm tới hết ngày cuối kỳ'), type: 'number', sum: true, width: 100 },
  { key: 'earn', header: 'Tích trong kỳ', type: 'number', sum: true, width: 110, value: (c) => c.period.earn },
  { key: 'redeem', header: 'Đổi trong kỳ', type: 'number', sum: true, width: 110, value: (c) => c.period.redeem },
  { key: 'expire', header: 'Hết hạn trong kỳ', type: 'number', sum: true, width: 120, value: (c) => c.period.expire },
];

const STEPS = [
  { k: 'cai-dat', n: 1, label: 'Cài đặt + hạng', hint: 'Bật tích / đổi ở máy bán, tên gọi điểm, bảng hạng và hệ số — áp cho Tất cả hoặc chọn cửa hàng.' },
  { k: 'chuong-trinh', n: 2, label: 'Chương trình tích điểm', hint: 'Khách mua được bao nhiêu điểm: theo tiền, theo mã hàng, nhân điểm dịp lễ, thưởng theo mức đơn.' },
  { k: 'doi-diem', n: 3, label: 'Đổi điểm', hint: 'Khách dùng điểm đổi quà (mặt hàng) hoặc voucher, giới hạn theo hạng.' },
  { k: 'thanh-vien', n: 4, label: 'Thành viên & điều chỉnh', hint: 'Tra điểm từng khách, lịch sử; cộng / trừ điểm tay (người khác duyệt).' },
] as const;
type Tab = 'tong-quan' | (typeof STEPS)[number]['k'];

export function DiemThanhVienPage() {
  const [tab, setTab] = useState<Tab>('tong-quan');
  const api = useApi();
  const ov = useQuery({ queryKey: ['loyalty', 'overview'], queryFn: () => api.get<Overview>(`${M}/policies`) });
  const d = ov.data;
  const live = (types: number[]) => (d?.policies ?? []).filter((p) => types.includes(p.type) && (p.state === 'active' || p.state === 'scheduled')).length;
  const status: Record<string, ReactNode> = d ? {
    'cai-dat': `${d.settings.filter((s) => s.settings).length} / ${d.branches.length} cửa hàng đã có`,
    'chuong-trinh': `${live([1, 2, 3, 4])} đang áp`,
    'doi-diem': `${live([5, 6])} đang áp`,
    'thanh-vien': d.pending ? `${d.pending} nháp chờ duyệt` : 'tra cứu, điều chỉnh',
  } : {};
  const go = (k: Tab) => () => setTab(k);
  const step = STEPS.find((x) => x.k === tab);
  const at = STEPS.findIndex((x) => x.k === tab);
  const next: Tab | undefined = at >= 0 && at < STEPS.length - 1 ? (STEPS as readonly { k: Tab }[])[at + 1]!.k : undefined;
  return (
    <div>
      <PageHeader title="Điểm thành viên" code="BH19" subtitle="Khai theo 4 bước, mỗi chương trình áp cho Tất cả hoặc chọn cửa hàng; người có quyền duyệt tự lập tự duyệt. Điểm chỉ hạch toán lúc đổi (trên chứng từ bán)." />
      {/* Thanh bước: bấm để mở bước; mỗi bước ghi tình trạng hiện tại. */}
      <div className="tabs" role="tablist" style={{ margin: '8px 0', flexWrap: 'wrap' }}>
        <button type="button" role="tab" className={`tab ${tab === 'tong-quan' ? 'active' : ''}`} onClick={go('tong-quan')}>Tổng quan</button>
        {STEPS.map((x) => (
          <button key={x.k} type="button" role="tab" className={`tab ${tab === x.k ? 'active' : ''}`} title={x.hint} onClick={go(x.k)}>
            <span className="badge badge-info" style={{ marginRight: 6 }}>{x.n}</span>{x.label}
            {status[x.k] ? <span className="muted" style={{ fontSize: 11.5, marginLeft: 6 }}>· {status[x.k]}</span> : null}
          </button>
        ))}
      </div>
      {step && <div className="muted" style={{ margin: '0 0 8px' }}>Bước {step.n}: {step.hint}{next && <> <button type="button" className="btn btn-xs" onClick={go(next)}>Bước {step.n + 1} →</button></>}</div>}
      {tab === 'tong-quan' ? <><LuongBuoc d={d} status={status} onGo={(k) => setTab(k)} /><TongQuan /></>
        : tab === 'thanh-vien' ? <BuocThanhVien />
          : ov.isLoading ? <Loading /> : ov.error ? <ErrorBox error={errorText(ov.error)} /> : !d ? null
            : tab === 'cai-dat' ? <CaiDatTab ov={d} onNext={go('chuong-trinh')} />
              : <ChuongTrinhTab key={tab} group={tab === 'doi-diem' ? 'redeem' : 'earn'} ov={d} onNext={tab === 'chuong-trinh' ? go('doi-diem') : go('thanh-vien')} />}
    </div>
  );
}

/** Luồng khai ở Tổng quan: 4 thẻ bước, bước chưa làm hiện gợi ý bắt đầu. */
function LuongBuoc({ d, status, onGo }: { d: Overview | undefined; status: Record<string, ReactNode>; onGo: (k: Tab) => void }) {
  const todo = d ? (!d.settings.some((s) => s.settings) ? 'cai-dat' : !d.policies.some((p) => p.type <= 4) ? 'chuong-trinh' : null) : null;
  return (
    <section className="card" style={{ marginBottom: 12 }}>
      <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
        {STEPS.map((x) => (
          <button key={x.k} type="button" className="card card-body" title={x.hint} onClick={() => onGo(x.k)}
            style={{ margin: 0, textAlign: 'left', cursor: 'pointer', display: 'grid', gap: 4, borderColor: todo === x.k ? 'var(--warn, #d97706)' : undefined }}>
            <span><span className="badge badge-info" style={{ marginRight: 6 }}>{x.n}</span><b>{x.label}</b></span>
            <span className="muted" style={{ fontSize: 12 }}>{x.hint}</span>
            <span style={{ fontSize: 12.5 }}>{todo === x.k ? <b style={{ color: 'var(--warn, #d97706)' }}>Bắt đầu ở đây →</b> : status[x.k] ?? ''}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** Bước 4: Thành viên (tra cứu, cộng / trừ) và Điều chỉnh (yêu cầu cộng / trừ tay — người khác duyệt). */
function BuocThanhVien() {
  const [sub, setSub] = useState<'tv' | 'dc'>('tv');
  return (
    <div>
      <div className="tabs" role="tablist" style={{ margin: '0 0 8px' }}>
        <button type="button" role="tab" className={`tab ${sub === 'tv' ? 'active' : ''}`} onClick={() => setSub('tv')}>Thành viên</button>
        <button type="button" role="tab" className={`tab ${sub === 'dc' ? 'active' : ''}`} onClick={() => setSub('dc')}>Điều chỉnh điểm</button>
      </div>
      {sub === 'tv' ? <ThanhVienTab /> : <DieuChinhTab />}
    </div>
  );
}

function TongQuan() {
  const today = vnToday();
  const [draft, setDraft] = useState({ from: `${today.slice(0, 7)}-01`, to: today });
  const [applied, setApplied] = useState(draft);
  const api = useApi();
  const q = useQuery({ queryKey: ['loyalty-report', applied], queryFn: () => api.get<Report>('/api/v1/m/loyalty/report', applied) });
  const d = q.data;
  return (
    <div>
      <FilterLayout
        onSearch={() => setApplied(draft)}
        filters={<PeriodField from={draft.from} to={draft.to} onChange={(from, to) => setDraft({ from, to })} />}
      >
        {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={errorText(q.error)} /> : d && (
          <>
            <KpiCards items={[
              { key: 'b', label: `Điểm còn (${d.customerCount} khách)`, value: d.balance, tone: 'info' },
              { key: 'e', label: 'Tích trong kỳ', value: d.total.earn, tone: 'ok' },
              { key: 'r', label: 'Đổi trong kỳ', value: d.total.redeem, tone: 'warn' },
              { key: 'x', label: 'Hết hạn trong kỳ', value: d.total.expire },
            ]} />
            <section className="card" style={{ marginTop: 12 }}>
              <div className="card-body" style={{ paddingBottom: 0 }}><b>Phát sinh theo cửa hàng</b></div>
              <DataGrid rows={d.byBranch} columns={branchCols} rowKey={(x) => x.branchCode || '-'} storageKey="loyalty.cn" exportName="diem-thanh-vien-cua-hang" emptyText="Không có phát sinh trong kỳ" />
            </section>
            <section className="card">
              <div className="card-body" style={{ paddingBottom: 0 }}><b>Số dư theo hạng</b></div>
              <DataGrid rows={d.byTier} columns={tierCols} rowKey={(x) => x.tierKey} storageKey="loyalty.hang" />
            </section>
            <section className="card">
              <div className="card-body" style={{ paddingBottom: 0 }}><b>Khách</b> <span className="muted">· 500 khách điểm còn nhiều nhất</span></div>
              <DataGrid rows={d.customers} columns={customerCols} rowKey={(x) => x.customerCode} storageKey="loyalty.khach" exportName="diem-thanh-vien-khach" emptyText="Chưa có khách nào có điểm" />
            </section>
          </>
        )}
      </FilterLayout>
    </div>
  );
}
