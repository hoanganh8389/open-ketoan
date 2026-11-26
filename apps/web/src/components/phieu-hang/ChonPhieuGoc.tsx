// [2026-11-26 08:40 PM Võ Hoàng] NGHIEM-THU — NT-BH-046: hộp chọn phiếu gốc cho BH11 — phiếu bán đã duyệt của khách / theo số phiếu, tích dòng còn trả (đóng góp)
/**
 * Chọn phiếu bán gốc cho phiếu trả (BH11): danh sách phiếu bán ĐÃ DUYỆT của cửa hàng theo khách đang chọn, hoặc tìm theo số phiếu
 * (khách lẻ) — GET /api/v1/m/phieu-ban/return-sources. Chọn phiếu → bảng dòng: SL bán, đã trả, còn trả; tích dòng, gõ SL trả (không quá
 * còn trả) → "Đưa vào phiếu". Giá, chiết khấu, thuế của dòng trả theo dòng gốc (máy chủ tính lại khi Ghi).
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { Modal, NumInput } from '@/components/ui';

export interface ReturnSourceLine {
  lineKey: string; sku: string; name: string; unit: string; qty: number; unitPrice: number; discount: number; taxCode: string;
  isGift: boolean; warehouseCode?: string; returned: number; returnable: number;
}
export interface ReturnSource {
  id: string; docNo: string; docDate: string; branchCode: string; warehouseCode?: string;
  partner?: { code: string; name: string; taxCode?: string }; totals: { total: number }; lines: ReturnSourceLine[];
}
/** Kết quả chọn: phiếu gốc + các dòng (SL trả đã gõ). */
export type PickedReturn = { source: ReturnSource; lines: { line: ReturnSourceLine; qty: number }[] };

const money = (n: number) => n.toLocaleString('vi-VN');
const dmy = (d: string) => d.split('-').reverse().join('/');

/** Đọc phiếu gốc theo cửa hàng + khách hoặc số phiếu. */
export function returnSources(p: { branch: string; partnerCode?: string; search?: string; open?: boolean }) {
  return api.get<{ items: ReturnSource[] }>('/api/v1/m/phieu-ban/return-sources', {
    branch: p.branch, ...(p.partnerCode ? { partnerCode: p.partnerCode } : {}), ...(p.search ? { search: p.search } : {}), ...(p.open ? { open: '1' } : {}),
  }).then((r) => r.items);
}

export function ChonPhieuGoc({ branchCode, partnerCode, search: search0, onPick, onClose }: {
  branchCode: string; partnerCode?: string; search?: string; onPick: (p: PickedReturn) => void; onClose: () => void;
}) {
  const [search, setSearch] = useState(search0 ?? '');
  const [term, setTerm] = useState(search0 ?? '');
  const byPartner = Boolean(partnerCode) && !term;
  const q = useQuery({
    queryKey: ['phieu-ban', 'return-sources', branchCode, byPartner ? partnerCode : '', term],
    queryFn: () => returnSources({ branch: branchCode, ...(byPartner ? { partnerCode } : { search: term }), open: true }),
    enabled: Boolean(branchCode) && (byPartner || Boolean(term)),
  });
  const [doc, setDoc] = useState<ReturnSource | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [tich, setTich] = useState<Record<string, boolean>>({});
  const chon = (d: ReturnSource) => {
    setDoc(d);
    setQty(Object.fromEntries(d.lines.map((l) => [l.lineKey, l.returnable])));
    setTich({});
  };
  const picked = doc ? doc.lines.filter((l) => tich[l.lineKey] && (qty[l.lineKey] ?? 0) > 0) : [];
  const over = doc ? doc.lines.filter((l) => tich[l.lineKey] && (qty[l.lineKey] ?? 0) > l.returnable + 1e-9) : [];
  const why = !doc ? 'Chọn một phiếu gốc ở bảng trên' : !picked.length ? 'Tích ít nhất một dòng, SL trả lớn hơn 0' : over.length ? `SL trả vượt còn trả: ${over.map((l) => l.sku).join(', ')}` : '';

  return (
    <Modal wide title="Chọn phiếu bán gốc" onClose={onClose} helpKey="phieu-hang"
      footer={<>
        <button className="btn btn-primary" disabled={Boolean(why)} title={why || 'Đưa các dòng đã tích vào phiếu trả'}
          onClick={() => doc && onPick({ source: doc, lines: picked.map((l) => ({ line: l, qty: qty[l.lineKey] ?? 0 })) })}>Đưa vào phiếu</button>
        <button className="btn" onClick={onClose}>Thoát</button>
      </>}>
      <form className="row" style={{ gap: 6, marginBottom: 8, alignItems: 'center' }} data-no-search onSubmit={(e) => { e.preventDefault(); setTerm(search.trim()); setDoc(null); }}>
        <span className="muted" style={{ fontSize: 12 }}>
          {partnerCode ? <>Phiếu đã duyệt của khách <b>{partnerCode}</b> tại cửa hàng <b>{branchCode}</b> — hoặc tìm theo số phiếu:</> : <>Khách lẻ: gõ <b>số phiếu bán gốc</b> (cửa hàng {branchCode}):</>}
        </span>
        <input className="input mono" style={{ width: 200 }} value={search} placeholder="Số phiếu, vd BH2611000001" onChange={(e) => setSearch(e.target.value.toUpperCase())} />
        <button className="btn btn-sm" type="submit" title="Tìm phiếu bán đã duyệt theo số phiếu (gõ một phần số cũng được)">Tìm</button>
        {term && partnerCode && <button className="btn btn-sm" type="button" onClick={() => { setSearch(''); setTerm(''); setDoc(null); }} title="Quay lại danh sách phiếu của khách">Phiếu của khách</button>}
      </form>
      {q.error && <div className="alert alert-bad">{errorText(q.error)}</div>}
      <table className="grid-table" style={{ width: '100%' }}>
        <thead><tr>
          <th style={{ width: 90 }} title="Ngày phiếu bán">Ngày</th><th style={{ width: 130 }} title="Số phiếu bán gốc">Số phiếu</th><th title="Khách trên phiếu gốc">Khách</th>
          <th style={{ width: 120 }} title="Tổng tiền thanh toán của phiếu gốc">Tổng tiền</th><th style={{ width: 110 }} title="Số dòng còn trả được / số dòng">Dòng còn trả</th>
        </tr></thead>
        <tbody>
          {(q.data ?? []).map((d) => (
            <tr key={d.id} className={doc?.id === d.id ? 'selected' : ''} style={{ cursor: 'pointer' }} onClick={() => chon(d)}>
              <td>{dmy(d.docDate)}</td><td className="mono">{d.docNo}</td><td>{d.partner ? `${d.partner.code} — ${d.partner.name}` : 'Khách lẻ'}</td>
              <td className="num">{money(d.totals.total)}</td><td className="num">{d.lines.filter((l) => l.returnable > 0).length} / {d.lines.length}</td>
            </tr>
          ))}
          {!q.isLoading && !(q.data ?? []).length && (
            <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 10 }}>
              {!byPartner && !term ? 'Gõ số phiếu bán gốc rồi bấm Tìm' : 'Không có phiếu bán đã duyệt còn trả được'}
            </td></tr>
          )}
          {q.isLoading && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 10 }}>Đang tải…</td></tr>}
        </tbody>
      </table>

      {doc && (
        <>
          <h4 style={{ margin: '10px 0 4px' }}>Dòng của phiếu {doc.docNo} — tích dòng cần trả</h4>
          <table className="grid-table" style={{ width: '100%' }}>
            <thead><tr>
              <th style={{ width: 30 }}><input type="checkbox" title="Tích / bỏ tích mọi dòng còn trả" checked={doc.lines.filter((l) => l.returnable > 0).every((l) => tich[l.lineKey])}
                onChange={(e) => setTich(Object.fromEntries(doc.lines.filter((l) => l.returnable > 0).map((l) => [l.lineKey, e.target.checked])))} /></th>
              <th style={{ width: 110 }}>Mã hàng</th><th>Tên hàng</th><th style={{ width: 60 }}>ĐVT</th>
              <th style={{ width: 70 }} title="Số lượng trên phiếu gốc">SL bán</th><th style={{ width: 70 }} title="Đã trả ở các phiếu trả đã duyệt">Đã trả</th>
              <th style={{ width: 75 }} title="SL bán − đã trả của dòng này">Còn trả</th><th style={{ width: 95 }} title="SL khách trả lần này (không quá Còn trả)">SL trả</th>
              <th style={{ width: 105 }} title="Đơn giá trước thuế của dòng gốc — dòng trả dùng đúng giá này">Đơn giá</th>
            </tr></thead>
            <tbody>
              {doc.lines.map((l) => {
                const none = l.returnable <= 0;
                return (
                  <tr key={l.lineKey} className={none ? 'muted' : ''}>
                    <td style={{ textAlign: 'center' }}><input type="checkbox" disabled={none} title={none ? 'Dòng đã trả hết' : 'Trả dòng này'} checked={Boolean(tich[l.lineKey])} onChange={(e) => setTich({ ...tich, [l.lineKey]: e.target.checked })} /></td>
                    <td className="mono">{l.sku}</td><td>{l.name}{l.isGift && <span className="badge badge-gray" style={{ marginLeft: 4 }}>quà</span>}</td><td>{l.unit}</td>
                    <td className="num">{l.qty}</td><td className="num">{l.returned || ''}</td><td className="num"><b>{l.returnable}</b></td>
                    <td><NumInput value={qty[l.lineKey] ?? 0} disabled={none || !tich[l.lineKey]} title={none ? 'Dòng đã trả hết' : !tich[l.lineKey] ? 'Tích dòng trước' : `Tối đa ${l.returnable}`}
                      onChange={(n) => setQty({ ...qty, [l.lineKey]: Math.max(0, n ?? 0) })} /></td>
                    <td className="num">{l.isGift ? <span className="muted">tặng</span> : money(l.unitPrice)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </Modal>
  );
}
