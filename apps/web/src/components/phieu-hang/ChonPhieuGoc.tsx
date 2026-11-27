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
import { DataGrid } from '@/components/DataGrid';

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
    if (doc?.id === d.id) return;
    setDoc(d);
    setQty(Object.fromEntries(d.lines.map((l) => [l.lineKey, l.returnable])));
    // Tích sẵn mọi dòng còn trả (SL = còn trả): thường khách trả cả phiếu; bỏ tích / sửa SL dòng không trả.
    setTich(Object.fromEntries(d.lines.filter((l) => l.returnable > 0).map((l) => [l.lineKey, true])));
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
      {/* [2026-11-28 Võ Hoàng] NGHIEM-THU — NT-BH-046: hộp chọn phiếu gốc làm lại bằng thành phần chung — thân hộp thoại là lưới 4 cột nên mọi khối
          phải chiếm cả hàng (.full); hai bảng dùng DataGrid; chọn phiếu là tích sẵn mọi dòng còn trả với SL = còn trả → "Đưa vào phiếu" bấm được ngay (đóng góp) */}
      <form className="full row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }} data-no-search onSubmit={(e) => { e.preventDefault(); setTerm(search.trim()); setDoc(null); }}>
        <span title="Nguồn danh sách phiếu gốc">
          {partnerCode && !term ? <>Phiếu bán đã duyệt của khách <b className="mono">{partnerCode}</b> · cửa hàng <b className="mono">{branchCode}</b></>
            : <>Tìm phiếu bán đã duyệt theo số phiếu · cửa hàng <b className="mono">{branchCode}</b></>}
        </span>
        <span style={{ flex: 1 }} />
        <input className="input mono" style={{ width: 240, height: 28 }} value={search} placeholder="Số phiếu, vd BH2611000001" title="Gõ số phiếu bán gốc (một phần số cũng được) rồi bấm Tìm — dùng cho khách lẻ"
          onChange={(e) => setSearch(e.target.value.toUpperCase())} />
        <button className="btn btn-sm" type="submit" title="Tìm phiếu bán đã duyệt theo số phiếu">Tìm</button>
        {term && partnerCode && <button className="btn btn-sm" type="button" onClick={() => { setSearch(''); setTerm(''); setDoc(null); }} title="Quay lại danh sách phiếu của khách">Phiếu của khách</button>}
      </form>
      {q.error && <div className="full alert alert-bad">{errorText(q.error)}</div>}
      <div className="full">
        <DataGrid<ReturnSource> rows={q.data ?? []} rowKey={(d) => d.id} storageKey="bh11-chon-phieu-goc-v2" maxHeight="220px" footerLabel={false}
          emptyText={q.isLoading ? 'Đang tải…' : !byPartner && !term ? 'Gõ số phiếu bán gốc rồi bấm Tìm' : 'Không có phiếu bán đã duyệt còn trả được'}
          onRowClick={chon} onSelect={(d) => { if (d) chon(d); }}
          rowClassName={(d) => (doc?.id === d.id ? 'selected' : '')}
          columns={[
            { key: 'docDate', header: 'Ngày', title: 'Ngày phiếu bán', type: 'date', width: 100 },
            { key: 'docNo', header: 'Số phiếu', title: 'Số phiếu bán gốc', type: 'code', width: 140 },
            { key: 'partner', header: 'Khách', title: 'Khách trên phiếu gốc', width: 260, value: (d) => (d.partner ? `${d.partner.code} — ${d.partner.name}` : 'Khách lẻ') },
            { key: 'total', header: 'Tổng tiền', title: 'Tổng tiền thanh toán của phiếu gốc', type: 'money', width: 130, value: (d) => d.totals.total },
            { key: 'conTra', header: 'Dòng còn trả', title: 'Số dòng còn trả được / số dòng của phiếu', width: 110, value: (d) => `${d.lines.filter((l) => l.returnable > 0).length} / ${d.lines.length}` },
          ]} />
      </div>

      {doc ? (
        <div className="full">
          <div className="row" style={{ alignItems: 'center', gap: 8, margin: '4px 0' }}>
            <b>Dòng của phiếu {doc.docNo}</b>
            <span className="muted">· tích dòng cần trả, sửa SL trả (không quá Còn trả); giá, chiết khấu, thuế theo dòng gốc</span>
          </div>
          <DataGrid<ReturnSourceLine> rows={doc.lines} rowKey={(l) => l.lineKey} storageKey="bh11-chon-phieu-goc-dong-v2" maxHeight="260px" footerLabel={false}
            rowClassName={(l) => (l.returnable <= 0 ? 'muted' : '')}
            columns={[
              { key: 'tich', width: 44, noFilter: true, noSort: true, noExport: true, value: () => '',
                header: <input type="checkbox" title="Tích / bỏ tích mọi dòng còn trả" checked={doc.lines.some((l) => l.returnable > 0) && doc.lines.filter((l) => l.returnable > 0).every((l) => tich[l.lineKey])}
                  onChange={(e) => setTich(Object.fromEntries(doc.lines.filter((l) => l.returnable > 0).map((l) => [l.lineKey, e.target.checked])))} />,
                render: (l) => <input type="checkbox" disabled={l.returnable <= 0} title={l.returnable <= 0 ? 'Dòng đã trả hết' : 'Trả dòng này'} checked={Boolean(tich[l.lineKey])}
                  onClick={(e) => e.stopPropagation()} onChange={(e) => setTich({ ...tich, [l.lineKey]: e.target.checked })} /> },
              { key: 'sku', header: 'Mã hàng', title: 'Mã hàng', type: 'code', width: 120 },
              { key: 'name', header: 'Tên hàng', title: 'Tên hàng', width: 260, render: (l) => <>{l.name}{l.isGift && <span className="badge badge-gray" style={{ marginLeft: 4 }}>quà</span>}</> },
              { key: 'unit', header: 'ĐVT', title: 'Đơn vị tính', width: 70 },
              { key: 'qty', header: 'SL bán', title: 'Số lượng trên phiếu gốc', type: 'qty', width: 80 },
              { key: 'returned', header: 'Đã trả', title: 'Đã trả ở các phiếu trả đã duyệt', type: 'qty', width: 80 },
              { key: 'returnable', header: 'Còn trả', title: 'SL bán − đã trả của dòng này', type: 'qty', width: 80, bold: true, showZero: true },
              { key: 'slTra', header: 'SL trả', title: 'SL khách trả lần này (không quá Còn trả)', width: 110, noFilter: true, noSort: true, value: (l) => qty[l.lineKey] ?? 0,
                render: (l) => <NumInput value={qty[l.lineKey] ?? 0} disabled={l.returnable <= 0 || !tich[l.lineKey]}
                  title={l.returnable <= 0 ? 'Dòng đã trả hết' : !tich[l.lineKey] ? 'Tích dòng trước' : `Tối đa ${l.returnable}`}
                  onChange={(n) => setQty({ ...qty, [l.lineKey]: Math.max(0, n ?? 0) })} /> },
              { key: 'unitPrice', header: 'Đơn giá', title: 'Đơn giá trước thuế của dòng gốc — dòng trả dùng đúng giá này', type: 'money', width: 120,
                render: (l) => (l.isGift ? <span className="muted">tặng</span> : money(l.unitPrice)) },
            ]} />
          {why && <div className="muted" style={{ marginTop: 4 }} role="status">{why}</div>}
        </div>
      ) : (
        <div className="full muted" role="status">Bấm một phiếu ở bảng trên để xem các dòng còn trả.</div>
      )}
    </Modal>
  );
}
