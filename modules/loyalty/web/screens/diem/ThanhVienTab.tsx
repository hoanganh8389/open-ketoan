// [2026-11-27 Võ Hoàng] NGHIEM-THU — NT-BH-051: thẻ Thành viên như admin-views/members.php của plugin cũ — tìm, lọc hạng, điểm hiện tại /
// tổng tích / tổng đổi, Cộng / Trừ điểm (lập yêu cầu điều chỉnh, người khác duyệt), Lịch sử điểm có cột Trước / Sau (đóng góp)
import { useState } from 'react';
import { DataGrid, ErrorBox, Loading, Modal, errorText, useApi, useCan, useQuery, useQueryClient, type GridColumn } from '@bizcity/ui-kit';
import { DieuChinhForm } from './DieuChinhForm';
import { M, PERM } from './model';

type Member = {
  customerCode: string; name: string; phone: string; tierKey: string; tierName: string; tierColor: string;
  balance: number; totalEarned: number; totalRedeemed: number; lastAt: string;
};
type Page = { total: number; page: number; pages: number; pageSize: number; items: Member[]; tiers: { key: string; name: string; color: string }[] };
type Hist = { id: string; at: string; kindLabel: string; points: number; before: number; after: number; refCode: string; branchCode: string; description: string; expiresAt: string | null };

const vn = (iso: string) => (iso ? new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '');
const h = (label: string, tip: string) => <span title={tip}>{label}</span>;

export function ThanhVienTab() {
  const api = useApi();
  const can = useCan();
  const qc = useQueryClient();
  const [draft, setDraft] = useState({ q: '', tier: '' });
  const [f, setF] = useState({ q: '', tier: '', page: 1 });
  const [hist, setHist] = useState<Member | null>(null);
  const [adj, setAdj] = useState<{ code: string; sign: 1 | -1 } | null>(null);
  const [msg, setMsg] = useState('');
  const q = useQuery({
    queryKey: ['loyalty', 'members', f],
    queryFn: () => api.get<Page>(`${M}/members`, { ...(f.q ? { q: f.q } : {}), ...(f.tier ? { tier: f.tier } : {}), page: f.page, pageSize: 50 }),
  });
  const d = q.data;
  const lap = can(PERM.dcLap);
  const cols: GridColumn<Member>[] = [
    { key: 'customerCode', header: h('Mã khách', 'Mã đối tượng (máy bán: SĐT)'), type: 'code', width: 120 },
    { key: 'name', header: h('Tên', 'Tên ở danh mục đối tượng'), width: 200 },
    { key: 'phone', header: 'SĐT', width: 110 },
    { key: 'tierName', header: h('Hạng', 'Theo TỔNG điểm đã tích, bảng hạng của chính sách mới nhất'), width: 110,
      render: (m) => <span className="badge" style={m.tierColor ? { background: m.tierColor, color: '#fff' } : undefined}>{m.tierName}</span> },
    { key: 'balance', header: h('Điểm hiện tại', 'Số dư = tổng mọi dòng sổ điểm'), type: 'number', sum: true, width: 110 },
    { key: 'totalEarned', header: h('Tổng tích', 'Điểm đã tích (trừ phần hoàn khi trả hàng)'), type: 'number', sum: true, width: 100 },
    { key: 'totalRedeemed', header: h('Tổng đổi', 'Điểm đã đổi quà / voucher'), type: 'number', sum: true, width: 100 },
    { key: 'lastAt', header: h('Phát sinh cuối', 'Lần cuối có dòng sổ điểm'), width: 150, value: (m) => vn(m.lastAt) },
    { key: 'tt', header: 'Thao tác', width: 190, noFilter: true, noSort: true, render: (m) => (
      <span style={{ display: 'flex', gap: 4 }}>
        <button type="button" className="btn btn-xs" title="Lịch sử giao dịch điểm (trước / sau)" onClick={() => setHist(m)}>Lịch sử</button>
        {lap && <button type="button" className="btn btn-xs" title="Cộng điểm — lập yêu cầu, người khác duyệt mới ghi sổ" onClick={() => setAdj({ code: m.customerCode, sign: 1 })}>+ Cộng</button>}
        {lap && <button type="button" className="btn btn-xs" title="Trừ điểm — lập yêu cầu, người khác duyệt mới ghi sổ" onClick={() => setAdj({ code: m.customerCode, sign: -1 })}>− Trừ</button>}
      </span>
    ) },
  ];
  return (
    <section className="card">
      {/* [2026-11-27 Võ Hoàng] NGHIEM-THU — NT-BH-051: ô tìm / lọc trên thanh catalog-toolbar trong card, bảng sát mép như màn Core (đóng góp) */}
      <form className="catalog-toolbar" style={{ alignItems: 'center' }} onSubmit={(e) => { e.preventDefault(); setF({ q: draft.q.trim(), tier: draft.tier, page: 1 }); }}>
        <input className="input" style={{ width: 260, height: 28 }} value={draft.q} placeholder="Tìm: mã, tên, SĐT" title="Tìm không dấu theo mã khách, tên, SĐT" onChange={(e) => setDraft({ ...draft, q: e.target.value })} />
        <select className="input" style={{ height: 28 }} value={draft.tier} title="Lọc theo hạng" onChange={(e) => setDraft({ ...draft, tier: e.target.value })}>
          <option value="">Mọi hạng</option>
          {(d?.tiers ?? []).map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
        </select>
        <button type="submit" className="btn btn-sm btn-primary" title="Tìm theo chữ và hạng đã chọn">Tìm</button>
        <span style={{ flex: 1 }} />
        {d && <span className="muted">{d.total.toLocaleString('vi-VN')} khách · trang {d.page} / {d.pages}</span>}
        {d && d.pages > 1 && <>
          <button type="button" className="btn btn-sm" disabled={d.page <= 1} onClick={() => setF({ ...f, page: d.page - 1 })}>« Trước</button>
          <button type="button" className="btn btn-sm" disabled={d.page >= d.pages} onClick={() => setF({ ...f, page: d.page + 1 })}>Sau »</button>
        </>}
      </form>
      {msg && <div className="card-body" style={{ paddingBottom: 0 }}><div className="alert alert-ok" role="status">{msg}</div></div>}
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={errorText(q.error)} /> : (
        <DataGrid rows={d?.items ?? []} columns={cols} rowKey={(m) => m.customerCode} storageKey="loyalty.thanh-vien" exportName="thanh-vien-diem"
          emptyText="Chưa có khách nào có sổ điểm" onRowDoubleClick={(m) => setHist(m)} />
      )}
      {hist && <LichSu member={hist} onClose={() => setHist(null)} />}
      {adj && <DieuChinhForm initial={{ customerCode: adj.code, sign: adj.sign }} onClose={() => setAdj(null)}
        onDone={(m) => { setAdj(null); setMsg(m); void qc.invalidateQueries({ queryKey: ['loyalty'] }); }} />}
    </section>
  );
}

function LichSu({ member, onClose }: { member: Member; onClose: () => void }) {
  const api = useApi();
  const q = useQuery({ queryKey: ['loyalty', 'history', member.customerCode], queryFn: () => api.get<{ items: Hist[] }>(`${M}/members/${encodeURIComponent(member.customerCode)}/history`) });
  const cols: GridColumn<Hist>[] = [
    { key: 'at', header: 'Thời gian', width: 150, value: (x) => vn(x.at) },
    { key: 'kindLabel', header: 'Loại', width: 130 },
    { key: 'points', header: h('Điểm', 'Dương = cộng, âm = trừ'), type: 'number', width: 90 },
    { key: 'before', header: h('Trước', 'Số dư trước dòng này'), type: 'number', width: 90 },
    { key: 'after', header: h('Sau', 'Số dư sau dòng này'), type: 'number', width: 90 },
    { key: 'refCode', header: h('Chứng từ', 'Đơn bán / phiếu trả / số điều chỉnh'), type: 'code', width: 130 },
    { key: 'branchCode', header: 'Cửa hàng', type: 'code', width: 90 },
    { key: 'description', header: 'Mô tả', width: 240 },
    { key: 'expiresAt', header: h('Hết hạn', 'Lô điểm hết hạn lúc'), width: 110, value: (x) => (x.expiresAt ? vn(x.expiresAt).split(' ').pop() ?? '' : '') },
  ];
  return (
    <Modal wide title={`Lịch sử điểm — ${member.customerCode}${member.name ? ` ${member.name}` : ''} (còn ${member.balance} điểm)`} onClose={onClose}
      footer={<button type="button" className="btn" onClick={onClose}>Đóng</button>}>
      <div style={{ gridColumn: '1 / -1' }}>
        {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={errorText(q.error)} /> : (
          <DataGrid rows={q.data?.items ?? []} columns={cols} rowKey={(x) => x.id} storageKey="loyalty.lich-su" exportName={`lich-su-diem-${member.customerCode}`} emptyText="Chưa có giao dịch điểm" />
        )}
      </div>
    </Modal>
  );
}
