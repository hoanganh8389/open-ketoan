/**
 * Từng lần mua / trả của một khách (đơn máy bán + phiếu bán BH10): dùng chung cho BH23 Báo cáo khách hàng và thẻ "Lịch sử mua"
 * trong hồ sơ Khách hàng (điểm cắm partner.detail.tab). Nguồn: GET /api/v1/m/pos/reports/customer-detail (quyền pos:report).
 */
// [2026-11-25 05:40 PM Võ Hoàng] NT-BH-034 — tách "từng lần mua" khỏi BH23, thêm thẻ Lịch sử mua trong hồ sơ khách (đóng góp)
import { useMemo, useState } from 'react';
import { DataGrid, ErrorBox, KpiCards, Loading, PeriodField, errorText, useApi, useQuery, type GridColumn } from '@bizcity/ui-kit';
import { Badge, DOC_STATUS, GiftBadge, M, ORDER_STATUS, time, vnd } from '../lib';

export type Line = { sku: string; name: string; unit: string; qty: number; unitPrice: number; discount: number; amount: number; isGift: boolean; promo: string | null; giftValue?: number | null };
export type Purchase = {
  source: 'pos' | 'phieu-ban'; kind: 'sale' | 'return'; refId: string; refCode: string; date: string; branchCode: string; channel: string;
  goods: number; discount: number; total: number; returns: number; originalCode?: string | null;
  vouchers: { code: string; campaignName: string; amount: number }[]; pointsEarned: number; pointsRedeemed: number; lines: Line[];
};
/** Từng dòng hàng của các lần mua (để xuất Excel một bảng phẳng). */
type FlatLine = Line & { refId: string; key: string; refCode: string; date: string; branchCode: string; source: string; vouchers: string; points: string };
export const lineCols: GridColumn<FlatLine>[] = [
  { key: 'date', header: 'Ngày', width: 90 }, { key: 'refCode', header: 'Số đơn / phiếu', type: 'code', width: 130 },
  { key: 'source', header: 'Nguồn', width: 90 }, { key: 'branchCode', header: 'Cửa hàng', type: 'code', width: 80 },
  { key: 'sku', header: 'Mã hàng', type: 'code', width: 100 }, { key: 'name', header: 'Tên hàng', width: 200, render: (l) => (l.isGift ? <>{l.name} <GiftBadge /></> : l.name) }, { key: 'unit', header: 'ĐVT', width: 60 },
  { key: 'qty', header: 'SL', type: 'qty', width: 60 }, { key: 'unitPrice', header: 'Đơn giá', type: 'money', width: 100 },
  { key: 'discount', header: 'Giảm', type: 'money', sum: true, width: 90 }, { key: 'amount', header: 'Thành tiền', type: 'money', sum: true, width: 110 },
  { key: 'promo', header: 'Khuyến mại', width: 120 }, { key: 'isGift', header: 'Quà', width: 70, value: (l) => (l.isGift ? 'Quà' : ''), render: (l) => (l.isGift ? <GiftBadge /> : null) },
  { key: 'giftValue', header: 'Giá trị quà', type: 'money', sum: true, width: 100 },
  { key: 'vouchers', header: 'Voucher', width: 160 }, { key: 'points', header: 'Điểm tích / đổi', width: 110 },
];


export type PurchaseRange = { from: string; to: string; branchCodes?: string; channels?: string };

/** Dòng phẳng để xem / xuất Excel: mỗi dòng hàng một dòng; phiếu trả một dòng âm. */
export function flatLines(list: Purchase[]): FlatLine[] {
  return list.flatMap((p) => {
    const vouchers = p.vouchers.map((v) => `${v.code} (${vnd(v.amount)})`).join(', ');
    const points = p.pointsEarned || p.pointsRedeemed ? `+${p.pointsEarned} / −${p.pointsRedeemed}` : '';
    const src = p.source === 'pos' ? 'Máy bán' : 'Phiếu BH10';
    if (p.kind === 'return') {
      return [{ refId: p.refId, key: `${p.refId}-r`, refCode: p.refCode, date: p.date, branchCode: p.branchCode, source: `${src} · trả hàng${p.originalCode ? ` (${p.originalCode})` : ''}`,
        sku: '', name: 'Trả hàng', unit: '', qty: 0, unitPrice: 0, discount: 0, amount: -p.returns, isGift: false, promo: null, vouchers: '', points: '' }];
    }
    return p.lines.map((l, i) => ({ ...l, refId: p.refId, key: `${p.refId}-${i}`, refCode: p.refCode, date: p.date, branchCode: p.branchCode, source: src,
      vouchers: i === 0 ? vouchers : '', points: i === 0 ? points : '' }));
  });
}

export function usePurchases(customerCode: string, range: PurchaseRange) {
  const api = useApi();
  return useQuery({
    queryKey: ['pos-admin', 'customer-detail', customerCode, range],
    queryFn: () => api.get<Purchase[]>(`${M}/reports/customer-detail`, Object.fromEntries(Object.entries({ ...range, customer: customerCode }).filter(([k, v]) => v || k === 'customer'))),
  });
}

/** Bảng từng lần mua của một khách; bấm một dòng → chi tiết đơn / phiếu đó ở dưới. */
export function TungLanMua({ customerCode, customerName, range, storageKey, maxHeight }: { customerCode: string; customerName: string; range: PurchaseRange; storageKey: string; maxHeight?: string }) {
  const q = usePurchases(customerCode, range);
  const flat = useMemo(() => flatLines(q.data ?? []), [q.data]);
  const [pickId, setPickId] = useState<string | null>(null);
  const pick = (q.data ?? []).find((p) => p.refId === pickId) ?? null;
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={errorText(q.error)} />;
  return (
    <>
      <DataGrid rows={flat} columns={lineCols} rowKey={(l) => l.key} storageKey={storageKey} maxHeight={maxHeight ?? '34vh'}
        onRowClick={(l) => setPickId(l.refId === pickId ? null : l.refId)} rowClassName={(l) => (l.refId === pickId ? 'selected' : '')}
        exportName={`khach-${customerCode || 'le'}`} exportTitle={`Từng lần mua — ${customerName || 'Khách lẻ'} ${range.from} – ${range.to}`} emptyText="Không có lần mua trong kỳ" />
      <p className="muted" style={{ fontSize: 12, margin: '4px 0' }}>Bấm một dòng để xem chi tiết đơn / phiếu.</p>
      {pick && <ChiTietDon p={pick} />}
    </>
  );
}

type AdminOrder = {
  code: string; createdAt: string; cashier: string; status: string; docStatus: string; saleSourceName: string; shiftId: string;
  payments: { method: string; name: string; amount: number }[];
};

/** Chi tiết một lần mua: đầu đơn (giờ, thu ngân, ca, hình thức, trạng thái, chứng từ sổ — đơn máy bán), tiền, voucher, điểm, dòng hàng có dấu quà. */
export function ChiTietDon({ p }: { p: Purchase }) {
  const api = useApi();
  const pos = p.source === 'pos' && p.kind === 'sale';
  const o = useQuery({
    queryKey: ['pos-admin', 'order-of', p.refCode, p.date],
    queryFn: () => api.get<AdminOrder[]>(`${M}/admin/orders`, { from: p.date, to: p.date, q: p.refCode, pageSize: 5 }),
    enabled: pos,
  });
  const order = (o.data ?? []).find((x) => x.code === p.refCode) ?? null;
  const rows = flatLines([p]);
  const hide = new Set(['date', 'refCode', 'source', 'branchCode', 'vouchers', 'points']);
  return (
    <div className="card" style={{ marginTop: 8, padding: 10, display: 'grid', gap: 6 }}>
      <b>
        {p.kind === 'return' ? 'Phiếu trả' : 'Đơn'} {p.refCode} · {p.date} · {p.branchCode}{p.channel ? ` · ${p.channel}` : ''} · {p.source === 'pos' ? 'Máy bán' : 'Phiếu bán BH10'}
        {p.originalCode ? ` · trả của ${p.originalCode}` : ''}
      </b>
      {pos && (o.isLoading ? <Loading /> : o.error ? <ErrorBox error={errorText(o.error)} /> : order && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 13 }}>
          <span>Giờ: {time(order.createdAt)}</span>
          <span>Thu ngân: {order.cashier || '—'}</span>
          <span>Ca: {order.shiftId || '—'}</span>
          <span>Hình thức: {order.payments.map((x) => `${x.name} ${vnd(x.amount)}`).join(' · ') || '—'}</span>
          <span>Trạng thái: <Badge map={ORDER_STATUS} value={order.status} /></span>
          <span>Chứng từ sổ: <Badge map={DOC_STATUS} value={order.docStatus} /></span>
        </div>
      ))}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 13 }}>
        {p.kind === 'return' ? <span>Tiền trả: <b>{vnd(p.returns)}</b></span> : (
          <>
            <span>Tiền hàng: {vnd(p.goods)}</span><span>Giảm: {vnd(p.discount)}</span><span>Thực trả: <b>{vnd(p.total)}</b></span>
          </>
        )}
        {p.vouchers.length > 0 && <span>Voucher: {p.vouchers.map((v) => `${v.code} (${vnd(v.amount)})`).join(', ')}</span>}
        {(p.pointsEarned > 0 || p.pointsRedeemed > 0) && <span>Điểm: +{p.pointsEarned} / −{p.pointsRedeemed}</span>}
      </div>
      {p.kind !== 'return' && (
        <DataGrid rows={rows} columns={lineCols.filter((c) => !hide.has(String(c.key)))}
          rowKey={(l) => l.key} storageKey="pos.lich-su-mua.chi-tiet" maxHeight="30vh" exportName={`don-${p.refCode}`} />
      )}
    </div>
  );
}

const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(d);
/** Kỳ mặc định của thẻ: 12 tháng gần nhất. */
export function defaultTabRange(now = new Date()): { from: string; to: string } {
  const from = new Date(now); from.setFullYear(from.getFullYear() - 1); from.setDate(from.getDate() + 1);
  return { from: ymd(from), to: ymd(now) };
}

/** Số tổng của các lần mua trong kỳ. */
export function purchaseTotals(list: Purchase[]) {
  const sales = list.filter((p) => p.kind === 'sale');
  const last = sales.map((p) => p.date).sort().pop() ?? null;
  return {
    count: sales.length, total: sales.reduce((t, p) => t + p.total, 0), returns: list.filter((p) => p.kind === 'return').reduce((t, p) => t + p.returns, 0),
    points: list.reduce((t, p) => t + p.pointsEarned - p.pointsRedeemed, 0), last,
  };
}

/** Thẻ "Lịch sử mua" trong hồ sơ Khách hàng / Nhà cung cấp (partner.detail.tab, props { code, name }). */
export function LichSuMuaTab({ code, name }: { code: string; name: string }) {
  const [range, setRange] = useState(defaultTabRange);
  const q = usePurchases(code, range);
  const t = useMemo(() => purchaseTotals(q.data ?? []), [q.data]);
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <PeriodField from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
        <span className="muted" style={{ fontSize: 12 }}>Đơn máy bán và phiếu bán BH10 của khách ở mọi cửa hàng bạn được xem. Chi tiết, lọc cửa hàng / kênh: BH23 Báo cáo khách hàng.</span>
      </div>
      {!q.isLoading && !q.error && (
        <KpiCards items={[
          { key: 'n', label: 'Số lần mua', value: t.count }, { key: 'm', label: 'Tổng mua', value: t.total, tone: 'info' },
          { key: 'r', label: 'Trả hàng', value: t.returns, tone: 'warn' }, { key: 'p', label: 'Điểm (tích − đổi)', value: t.points },
        ]} />
      )}
      {!q.isLoading && !q.error && <span className="muted" style={{ fontSize: 12 }}>Lần mua gần nhất trong kỳ: {t.last ?? 'chưa có'}</span>}
      <TungLanMua customerCode={code} customerName={name} range={range} storageKey="pos.ho-so-khach.lich-su-mua" maxHeight="46vh" />
    </div>
  );
}
