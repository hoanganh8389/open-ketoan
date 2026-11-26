// [2026-11-16 11:00 AM Võ Hoàng] LOYALTY — NT-BH-020 bước 3: màn BH19 Điểm thành viên (đóng góp)
// [2026-11-25 09:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-039: thêm thẻ Chương trình / Đổi điểm / Cài đặt + hạng / Điều chỉnh — khai, duyệt chính sách ở kế toán (đóng góp)
/**
 * BH19 Điểm thành viên. Thẻ Tổng quan (NT-BH-020 kiểm 5): phát sinh điểm trong kỳ theo cửa hàng, số dư cuối kỳ theo hạng, danh sách khách.
 * NT-BH-039: thẻ Chương trình (L1), Đổi điểm (L2), Cài đặt + hạng (L3) soạn nháp chính sách theo cửa hàng → gửi duyệt → duyệt = phát hành
 * cho máy bán; thẻ Điều chỉnh (L4) cộng / trừ điểm tay có duyệt.
 */
import { useState } from 'react';
import { ChinhSachKhung } from './diem/ChinhSachKhung';
import { DieuChinhTab } from './diem/DieuChinhTab';
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

const TABS = [['tong-quan', 'Tổng quan'], ['thanh-vien', 'Thành viên'], ['chuong-trinh', 'Chương trình'], ['doi-diem', 'Đổi điểm'], ['cai-dat', 'Cài đặt + hạng'], ['dieu-chinh', 'Điều chỉnh']] as const;
type Tab = (typeof TABS)[number][0];

export function DiemThanhVienPage() {
  const [tab, setTab] = useState<Tab>('tong-quan');
  return (
    <div>
      <PageHeader title="Điểm thành viên" code="BH19" subtitle="Sổ điểm thành viên và chính sách tích điểm của từng cửa hàng (khai, duyệt ở kế toán). Điểm chỉ hạch toán lúc đổi (trên chứng từ bán)." />
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--line, #ddd)', marginBottom: 8 }}>
        {TABS.map(([k, label]) => (
          <button key={k} type="button" className={`btn btn-xs${tab === k ? ' btn-primary' : ''}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      {tab === 'tong-quan' ? <TongQuan /> : tab === 'thanh-vien' ? <ThanhVienTab /> : tab === 'dieu-chinh' ? <DieuChinhTab /> : <ChinhSachKhung view={tab} />}
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
            <h3 style={{ margin: '10px 0 4px' }}>Phát sinh theo cửa hàng</h3>
            <DataGrid rows={d.byBranch} columns={branchCols} rowKey={(x) => x.branchCode || '-'} storageKey="loyalty.cn" exportName="diem-thanh-vien-cua-hang" emptyText="Không có phát sinh trong kỳ" />
            <h3 style={{ margin: '10px 0 4px' }}>Số dư theo hạng</h3>
            <DataGrid rows={d.byTier} columns={tierCols} rowKey={(x) => x.tierKey} storageKey="loyalty.hang" />
            <h3 style={{ margin: '10px 0 4px' }}>Khách (500 khách điểm còn nhiều nhất)</h3>
            <DataGrid rows={d.customers} columns={customerCols} rowKey={(x) => x.customerCode} storageKey="loyalty.khach" exportName="diem-thanh-vien-khach" emptyText="Chưa có khách nào có điểm" />
          </>
        )}
      </FilterLayout>
    </div>
  );
}
