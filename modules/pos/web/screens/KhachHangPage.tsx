/**
 * BH23 Báo cáo khách hàng (phiếu NT-BH-034 §2 B): mỗi khách × kỳ × cửa hàng — số đơn, tiền hàng, giảm giá, thực trả, trả hàng, voucher, điểm
 * tích / đổi, quà (số lượng, giá trị theo giá bán), cửa hàng đã mua. Bấm khách → từng lần mua (mặt hàng, đơn giá, SL, khuyến mại, voucher,
 * điểm, quà). Gồm đơn máy bán và phiếu bán BH10; lọc nhiều cửa hàng, kênh; xuất Excel. Quyền xem pos:report.
 */
// [2026-11-19 Võ Hoàng] NGHIEM-THU — NT-BH-034: màn Báo cáo khách hàng (đóng góp)
import { useState } from 'react';
import { DataGrid, ErrorBox, KpiCards, Loading, PageHeader, errorText, useApi, useQuery, type GridColumn } from '@bizcity/ui-kit';
import { M, RangeLayout, useRange } from '../lib';
import { TungLanMua } from './lich-su-mua';

type Row = {
  customerCode: string; customerName: string; phone: string; branchCode: string; period: string; orders: number; posOrders: number; phieuBanDocs: number;
  goods: number; discount: number; net: number; returns: number; netAfterReturns: number; voucherCount: number; voucherAmount: number;
  pointsEarned: number; pointsRedeemed: number; giftQty: number; giftValue: number; shops: string;
};
type Meta = { totals?: Record<string, number>; phieuBan?: string; voucher?: string; loyalty?: string };

const cols: GridColumn<Row>[] = [
  { key: 'customerCode', header: 'Mã khách', type: 'code', width: 110 }, { key: 'customerName', header: 'Tên khách', width: 180 },
  { key: 'phone', header: 'SĐT', width: 100 }, { key: 'branchCode', header: 'Cửa hàng', type: 'code', width: 80 }, { key: 'period', header: 'Kỳ', width: 150 },
  { key: 'orders', header: 'Số đơn', type: 'number', sum: true, width: 70 },
  { key: 'goods', header: 'Tiền hàng', type: 'money', sum: true, width: 110 }, { key: 'discount', header: 'Giảm giá', type: 'money', sum: true, width: 100 },
  { key: 'net', header: 'Thực trả', type: 'money', sum: true, width: 110 }, { key: 'returns', header: 'Trả hàng', type: 'money', sum: true, width: 100 },
  { key: 'netAfterReturns', header: 'Thực thu', type: 'money', sum: true, width: 110 },
  { key: 'voucherCount', header: 'Voucher (mã)', type: 'number', sum: true, width: 80 }, { key: 'voucherAmount', header: 'Tiền voucher', type: 'money', sum: true, width: 100 },
  { key: 'pointsEarned', header: 'Điểm tích', type: 'qty', sum: true, width: 80 }, { key: 'pointsRedeemed', header: 'Điểm đổi', type: 'qty', sum: true, width: 80 },
  { key: 'giftQty', header: 'Quà (SL)', type: 'qty', sum: true, width: 70 }, { key: 'giftValue', header: 'Giá trị quà (giá bán)', type: 'money', sum: true, width: 120 },
  { key: 'shops', header: 'Cửa hàng đã mua', width: 140 },
];

function Detail({ row, range }: { row: Row; range: { from: string; to: string; branchCodes: string; channels: string } }) {
  return (
    <div className="card" style={{ marginTop: 8, padding: 8 }}>
      <b>Từng lần mua · {row.customerName || 'Khách lẻ'} {row.customerCode ? `(${row.customerCode})` : ''}</b>
      <TungLanMua customerCode={row.customerCode} customerName={row.customerName} range={range} storageKey="pos.khach-hang.chi-tiet" />
    </div>
  );
}

export function KhachHangPage() {
  const r = useRange({ channels: '', groupBy: 'range' });
  const api = useApi();
  const [pick, setPick] = useState<Row | null>(null);
  const a = r.applied;
  const query = { from: a.from, to: a.to, branchCodes: a.branches, channels: a.channels ?? '', groupBy: a.groupBy ?? 'range' };
  const q = useQuery({
    queryKey: ['pos-admin', 'customers', query],
    queryFn: () => api.getPage<Row[]>(`${M}/reports/customers`, Object.fromEntries(Object.entries(query).filter(([, v]) => v))) as Promise<{ data: Row[]; meta?: Meta }>,
  });
  const t = q.data?.meta?.totals;
  const meta = q.data?.meta;
  return (
    <div>
      <PageHeader title="Báo cáo khách hàng" code="BH23" subtitle="Mỗi khách × kỳ × cửa hàng: đơn, tiền, giảm giá, trả hàng, voucher, điểm, quà — gồm đơn máy bán và phiếu bán BH10. Bấm khách để xem từng lần mua." />
      <RangeLayout r={r} id="pos-khach-hang" more={(
        <>
          <label className="rp-field">
            <span>Kênh (mã, cách nhau dấu phẩy)</span>
            <input className="input" value={r.draft.channels ?? ''} placeholder="ZALO,GAN_SHOP" onChange={(e) => r.setDraft({ ...r.draft, channels: e.target.value })} />
          </label>
          <label className="rp-field">
            <span>Kỳ</span>
            <select className="input" value={r.draft.groupBy ?? 'range'} onChange={(e) => r.setDraft({ ...r.draft, groupBy: e.target.value })}>
              <option value="range">Cả khoảng ngày</option><option value="month">Theo tháng</option>
            </select>
          </label>
        </>
      )}>
        {t && (
          <KpiCards items={[
            { key: 'c', label: 'Số khách', value: t.customers ?? 0 }, { key: 'o', label: 'Số đơn', value: t.orders ?? 0 },
            { key: 'n', label: 'Thực trả', value: t.net ?? 0, tone: 'info' }, { key: 'r', label: 'Trả hàng', value: t.returns ?? 0, tone: 'warn' },
            { key: 'g', label: `Quà (${t.giftQty ?? 0})`, value: t.giftValue ?? 0 },
          ]} />
        )}
        {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={errorText(q.error)} /> : (
          <>
            <DataGrid rows={q.data?.data ?? []} columns={cols} rowKey={(x) => `${x.customerCode}|${x.branchCode}|${x.period}`} storageKey="pos.khach-hang"
              onRowClick={setPick} rowClassName={(x) => (pick && x.customerCode === pick.customerCode ? 'selected' : '')} maxHeight="44vh"
              emptyText="Không có khách mua trong kỳ" exportName="bao-cao-khach-hang" exportTitle={`Báo cáo khách hàng ${query.from} – ${query.to}`} />
            {pick && <Detail row={pick} range={query} />}
          </>
        )}
        <p className="muted">
          Tiền gồm thuế. Tiền hàng = đơn giá × số lượng của dòng hàng (không gồm quà); Giảm giá = khuyến mại + voucher TGS + giảm khác; Thực trả = tiền khách phải trả;
          trả hàng tính theo ngày trả. Voucher, điểm lấy từ module Voucher / Điểm thành viên; giá trị quà theo giá bán hiện hành của cửa hàng (giá vốn quà xem ở báo cáo kho).
          {meta?.phieuBan === 'unavailable' && <b> Chưa gồm phiếu BH10 (module Phiếu bán nhập tay chưa bật hoặc bạn chưa có quyền xem).</b>}
          {meta?.voucher === 'unavailable' && <b> Voucher theo bản chụp đơn (chưa đọc được module Voucher).</b>}
          {meta?.loyalty === 'unavailable' && <b> Điểm theo bản chụp đơn (chưa đọc được module Điểm thành viên).</b>}
        </p>
      </RangeLayout>
    </div>
  );
}
