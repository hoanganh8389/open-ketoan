/**
 * In mẫu 02-VT (Phiếu xuất kho, TT 133/200) cho phiếu xuất điều chỉnh — dựng trong module (module không import apps/web), bố cục như
 * ExportAdjustPrint.tsx của màn cũ: chi nhánh — kho, lý do + diễn giải, người nhận, dòng hàng (mã, tên, ĐVT, lô, hạn dùng, SL, đơn giá, thành tiền).
 * Mở cửa sổ in của trình duyệt, mỗi phiếu một trang.
 */
// [2026-11-26 03:10 PM Võ Hoàng] NGHIEM-THU — NT-BH-044: in 02-VT trong module (đóng góp)
import { money, type Phieu, type Reason } from '../lib';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const vnDate = (d: string) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '');

/** Nội dung HTML của một phiếu 02-VT (thuần — test / xem trước dùng lại). */
export function phieu02VT(p: Phieu, reasonName: string): string {
  const rows = p.lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.sku)}</td><td>${esc(l.name)}</td><td>${esc(l.unit)}</td><td>${esc(l.lotNo ?? '')}</td>
    <td>${esc(l.expDate ? vnDate(l.expDate) : '')}</td><td class="r">${esc(l.unitQty)}</td><td class="r">${p.priced ? money(l.unitQty ? l.amount / l.unitQty : 0) : ''}</td>
    <td class="r">${p.priced ? money(l.amount) : ''}</td></tr>`).join('');
  return `<section class="page">
    <div class="hd"><div><b>Chi nhánh:</b> ${esc(p.branchCode)} — <b>Kho:</b> ${esc(p.warehouseCode)}</div><div class="r">Mẫu số 02 - VT</div></div>
    <h2>PHIẾU XUẤT KHO</h2>
    <div class="c">Ngày ${esc(vnDate(p.docDate))} — Số: ${esc(p.docNo)}</div>
    <p>Họ tên người nhận hàng: ${esc(p.partner ? `${p.partner.code} — ${p.partner.name}` : p.receiverName)}</p>
    <p>Lý do xuất kho: ${esc(p.reasonCode)} ${esc(reasonName)}${p.description ? ` — ${esc(p.description)}` : ''}</p>
    <p>Xuất tại kho: ${esc(p.warehouseCode)}${p.employeeName ? ` — Nhân viên: ${esc(p.employeeName)}` : ''}</p>
    <table><thead><tr><th>STT</th><th>Mã hàng</th><th>Tên hàng</th><th>ĐVT</th><th>Số lô</th><th>Hạn dùng</th><th>Số lượng</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead>
    <tbody>${rows}</tbody><tfoot><tr><td colspan="8" class="r"><b>Cộng</b></td><td class="r"><b>${p.priced ? money(p.total) : ''}</b></td></tr></tfoot></table>
    <div class="ky"><div>Người lập phiếu</div><div>Người nhận hàng</div><div>Thủ kho</div><div>Kế toán trưởng</div></div>
  </section>`;
}

export function inPhieu02VT(list: Phieu[], reasons: Reason[]): void {
  const name = (c: string) => reasons.find((r) => r.code === c)?.name ?? '';
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Phiếu xuất kho 02-VT</title><style>
    body{font-family:'Times New Roman',serif;font-size:13px} .page{page-break-after:always;padding:16px} h2{text-align:center;margin:8px 0}
    .c{text-align:center} .r{text-align:right} .hd{display:flex;justify-content:space-between} table{width:100%;border-collapse:collapse;margin-top:8px}
    th,td{border:1px solid #333;padding:3px 5px} .ky{display:flex;justify-content:space-around;margin-top:32px;font-weight:bold}
  </style></head><body>${list.map((p) => phieu02VT(p, name(p.reasonCode))).join('')}</body></html>`);
  w.document.close();
  w.focus();
  w.print();
}
