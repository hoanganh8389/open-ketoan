/**
 * Hộp thoại "Lập chuyển kho" của đơn đặt hàng BH20 (phiếu NT-BH-041): đơn Đã gửi thiếu hàng để giữ → chọn MỘT kho có hàng (cùng cửa
 * hàng trừ KCB / KHG → chi nhánh cha → cửa hàng cùng cha), số lượng điền sẵn = min(thiếu − đang chuyển, tồn kho xuất), sửa được (≤ tồn),
 * ghi chú → phiếu chuyển kho KHO01 về kho bán của đơn, xuất luôn.
 *
 * Ba lời gọi theo thứ tự (máy chủ module không tự lập được phiếu của phân hệ Kho — ctx.actions.call chỉ gọi action đọc):
 *   1. POST /api/v1/m/phieu-ban/orders/:id/transfers  { step: 'prepare' } — máy chủ kiểm lại, trả khuôn phiếu KHO01;
 *   2. POST /api/v1/kho/transfers                       — action Kho kho.transfer.create bằng phiên người bấm (quyền kho:chuyen-kho-lap);
 *   3. POST …/transfers { step: 'record' }               — nối phiếu vào đơn (lịch sử, khung Giữ hàng). Bước 2 lỗi → { step: 'abort' }.
 * Bị từ chối: hộp thoại giữ nguyên dữ liệu đã nhập, tô ô lỗi theo error.details.findings (Q-CHUNG-07).
 */
// [2026-11-25 Võ Hoàng] NGHIEM-THU — NT-BH-041: hộp thoại Lập chuyển kho cho đơn thiếu hàng (đóng góp)
import { useMemo, useState } from 'react';
import { ErrorBox, Field, Loading, Modal, errorText, useApi, useMutation, useQuery } from '@bizcity/ui-kit';
import { KHO_TRANSFERS, M, SOURCE_GROUP, vnd, type Order, type OrderTransfer, type TransferSources } from '../lib';

type KhoDoc = { id: string | number; docNo: string; status: string };
type Prepared = { seq: number; orderNo: string; payload: { fromBranchCode: string; fromWarehouse: string; toWarehouse: string; lines: { sku: string; qty: number }[] } & Record<string, unknown> };
const num = (s: string) => (s.trim() === '' ? 0 : Number(s.replace(/\./g, '').replace(',', '.')));
const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** Lỗi theo ô từ máy chủ (details.findings → { field, title }). */
function fieldErrors(err: unknown): Record<string, string> {
  const f = (err as { details?: { findings?: { field?: string; title?: string }[] } } | null)?.details?.findings;
  return Object.fromEntries((Array.isArray(f) ? f : []).filter((x) => x.field).map((x) => [x.field!, x.title ?? '']));
}

export function LapChuyenKhoDialog({ order, live, onClose, onDone }: {
  order: Order;
  /** Trạng thái hiện tại của phiếu đã lập (đọc ở KHO01); không đọc được thì dùng trạng thái lúc lập. */
  live: Record<string, string>;
  onClose: () => void;
  onDone: (o: Order, text: string) => void;
}) {
  const api = useApi();
  const src = useQuery({ queryKey: ['phieu-ban', 'transfer-sources', order.id], queryFn: () => api.get<TransferSources>(`${M}/orders/${order.id}/transfer-sources`) });
  const [sel, setSel] = useState('');
  const [qty, setQty] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const data = src.data;
  const source = data?.sources.find((s) => `${s.branchCode}|${s.warehouseCode}` === sel);
  // Q-CHUNG-03: phiếu đã lập cho đơn còn "Đã xuất" (chưa nhận) → phần đang chuyển trừ khỏi số mặc định, nhắc người lập.
  const moving = useMemo(() => (data?.transfers ?? []).filter((t: OrderTransfer) => (live[t.id] ?? t.status) === 'shipped'), [data, live]);
  const inTransit = (sku: string) => r4(moving.reduce((s, t) => s + t.lines.filter((l) => l.sku === sku).reduce((a, l) => a + l.qty, 0), 0));

  const pick = (key: string) => {
    setSel(key);
    setErrs({});
    const s = data?.sources.find((x) => `${x.branchCode}|${x.warehouseCode}` === key);
    if (!s || !data) return;
    setQty(Object.fromEntries(data.short.map((l) => [l.sku, String(Math.max(0, Math.min(r4(l.need - inTransit(l.sku)), s.stock[l.sku] ?? 0)))])));
  };

  // Báo tại ô trước khi gửi (Q-CHUNG-06): kho xuất, SL > 0 ít nhất một dòng, SL ≤ tồn kho xuất (Q-KHO-02).
  const lines = (data?.short ?? []).map((l) => ({ sku: l.sku, qty: num(qty[l.sku] ?? '') }));
  const local: Record<string, string> = {};
  if (data && !source) local.fromWarehouse = 'Chọn kho xuất';
  lines.forEach((l, i) => {
    if (Number.isNaN(l.qty) || l.qty < 0) local[`lines[${i}].qty`] = 'Số lượng không hợp lệ';
    else if (source && l.qty > (source.stock[l.sku] ?? 0)) local[`lines[${i}].qty`] = `${source.warehouseCode} chỉ còn ${source.stock[l.sku] ?? 0}`;
  });
  if (source && !lines.some((l) => l.qty > 0)) local.lines = 'Nhập số lượng chuyển (> 0) ít nhất một dòng';
  const shown = { ...errs, ...local };
  const blocked = Object.keys(local).length > 0;

  const save = useMutation({
    mutationFn: async () => {
      setErrs({});
      const body = { fromBranchCode: source!.branchCode, fromWarehouse: source!.warehouseCode, lines: lines.filter((l) => l.qty > 0), ...(note.trim() ? { note: note.trim() } : {}) };
      const prep = await api.post<Prepared>(`${M}/orders/${order.id}/transfers`, { step: 'prepare', ...body });
      let t: KhoDoc;
      try {
        t = await api.post<KhoDoc>(KHO_TRANSFERS, prep.payload);
      } catch (e) {
        // nuot-loi: bỏ chỗ "đang lập" chỉ là dọn dẹp — lỗi thật cần báo là lỗi KHO01 ném tiếp bên dưới; chỗ tự hết hạn sau 2 phút
        await api.post(`${M}/orders/${order.id}/transfers`, { step: 'abort' }).catch(() => undefined);
        throw e;
      }
      const o = await api.post<Order>(`${M}/orders/${order.id}/transfers`, {
        step: 'record', fromBranchCode: body.fromBranchCode, fromWarehouse: body.fromWarehouse, lines: prep.payload.lines.map((l) => ({ sku: l.sku, qty: l.qty })),
        transfer: { id: String(t.id), docNo: t.docNo, status: t.status },
      });
      const where = t.status === 'received' ? 'cùng chi nhánh — đã nhận vào kho bán, bấm "Giữ lại hàng" để giữ' : 'khác chi nhánh — chờ thủ kho cửa hàng nhận ở KHO01, nhận xong bấm "Giữ lại hàng"';
      return { o, text: `Đã lập phiếu chuyển kho ${t.docNo}: ${body.fromWarehouse} → ${order.warehouseCode} (${where})` };
    },
    onSuccess: (r) => { onDone(r.o, r.text); onClose(); },
    onError: (e) => setErrs(fieldErrors(e)),
  });

  return (
    <Modal title={`Lập chuyển kho cho đơn ${order.orderNo}`} wide onClose={onClose}
      footer={<>
        <button className="btn btn-primary" disabled={!data || blocked || save.isPending || !data.canCreate}
          title={!data?.canCreate ? 'Cần quyền Lập phiếu chuyển kho (KHO01)' : blocked ? Object.values(local)[0] : 'Lập phiếu chuyển kho KHO01 về kho bán của đơn (xuất luôn)'}
          onClick={() => save.mutate()}>{save.isPending ? 'Đang lập…' : 'Lưu'}</button>
        <button className="btn" disabled={save.isPending} onClick={onClose}>Thôi</button>
      </>}>
      {src.isLoading ? <Loading /> : src.error ? <ErrorBox error={errorText(src.error)} /> : data && (<>
        <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
          Kho nhập: kho bán <b>{data.toWarehouse}</b> của cửa hàng {data.branchCode}. Một phiếu = một kho xuất; thiếu ở nhiều kho thì lập nhiều lần.
          Hàng về kho bán rồi bấm <b>Giữ lại hàng</b> ở khung Giữ hàng.
        </div>
        {moving.length > 0 && (
          <div className="mh-check warn" style={{ marginBottom: 6 }}>
            ⚠ Đã có phiếu {moving.map((t) => `${t.docNo} đang chuyển ${t.lines.map((l) => `${l.sku} × ${vnd(l.qty)}`).join(', ')}`).join('; ')} — số mặc định đã trừ phần đang chuyển
          </div>
        )}
        {!data.short.length ? <div className="mh-check ok">✓ Đơn không còn thiếu hàng để giữ</div> : (<>
          <Field label="Kho xuất (có tồn ít nhất một mã thiếu)" full>
            {data.sources.length === 0 ? <div className="mh-check warn">⚠ Không kho nào (cùng cửa hàng, chi nhánh cha, cửa hàng cùng cha) có hàng các mã thiếu</div> : (
              <table className="grid">
                <thead><tr><th /><th>Nhóm</th><th>Chi nhánh</th><th>Kho</th><th>Tồn các mã thiếu</th></tr></thead>
                <tbody>{data.sources.map((s) => {
                  const key = `${s.branchCode}|${s.warehouseCode}`;
                  return (
                    <tr key={key} onClick={() => pick(key)} style={{ cursor: 'pointer' }}>
                      <td><input type="radio" name="fromWarehouse" checked={sel === key} onChange={() => pick(key)} /></td>
                      <td>{SOURCE_GROUP[s.group]}</td><td>{s.branchCode}</td><td>{s.warehouseCode} — {s.name}</td>
                      <td>{data.short.map((l) => `${l.sku}: ${vnd(s.stock[l.sku] ?? 0)}`).join(' · ')}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            )}
            {shown.fromWarehouse && sel && <div className="mh-bad" style={{ fontSize: 12 }}>{shown.fromWarehouse}</div>}
          </Field>
          <table className="grid" style={{ marginTop: 8 }}>
            <thead><tr><th>Mã hàng</th><th>Tên</th><th>ĐVT</th><th>Cần</th><th>Đang chuyển</th><th>Tồn kho xuất</th><th style={{ width: 110 }}>SL chuyển</th></tr></thead>
            <tbody>{data.short.map((l, i) => {
              const e = shown[`lines[${i}].qty`] ?? shown[`lines[${i}].sku`];
              return (
                <tr key={l.sku}>
                  <td>{l.sku}</td><td>{l.name}</td><td>{l.unit}</td><td style={{ textAlign: 'right' }}>{vnd(l.need)}</td>
                  <td style={{ textAlign: 'right' }}>{inTransit(l.sku) ? vnd(inTransit(l.sku)) : ''}</td>
                  <td style={{ textAlign: 'right' }}>{source ? vnd(source.stock[l.sku] ?? 0) : '—'}</td>
                  <td>
                    <input className={`input${e ? ' input-error' : ''}`} value={qty[l.sku] ?? ''} disabled={!source} placeholder={source ? `≤ ${vnd(source.stock[l.sku] ?? 0)}` : 'chọn kho'}
                      title={e ?? ''} onChange={(ev) => { setQty({ ...qty, [l.sku]: ev.target.value }); setErrs({}); }} />
                    {e && <div className="mh-bad" style={{ fontSize: 11.5 }}>{e}</div>}
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
          {shown.lines && <div className="mh-bad" style={{ fontSize: 12, marginTop: 4 }}>{shown.lines}</div>}
          <Field label="Ghi chú (thêm vào sau &quot;Chuyển hàng cho đơn đặt hàng …&quot;)" full>
            <input className="input" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          </Field>
          {!data.canCreate && <div className="mh-check warn">⚠ Cần quyền Lập phiếu chuyển kho (KHO01) — nhờ quản trị cho quyền kho:chuyen-kho-lap</div>}
        </>)}
        {save.error && <div className="mh-bad" style={{ marginTop: 6 }}>{errorText(save.error)}</div>}
      </>)}
    </Modal>
  );
}
