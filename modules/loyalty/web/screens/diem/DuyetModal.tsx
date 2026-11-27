// [2026-11-25 09:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-039: hộp Duyệt / Từ chối — nháp chính sách (duyệt riêng hoặc cùng lúc) và yêu cầu điều chỉnh điểm (đóng góp)
/**
 * Duyệt = phát hành (nháp chính sách: thêm phiên bản mới cho máy bán) hoặc ghi sổ điểm (điều chỉnh). Điều chỉnh: người lập không tự duyệt —
 * máy chủ chặn (FORBIDDEN), hộp hiện nguyên câu; nháp chính sách: người có quyền duyệt tự duyệt được (NT-BH-059). Nút khoá khi đang gửi (bấm hai lần chỉ một kết quả — Idempotency-Key). Từ chối bắt buộc lý do.
 */
import { useState } from 'react';
import { ErrorBox, Modal, errorText, useApi, useMutation } from '@bizcity/ui-kit';
import { M, type Adjustment, type Draft } from './model';

type Props =
  | { kind: 'program'; items: Draft[]; onClose: () => void; onDone: (msg: string) => void }
  | { kind: 'adjustment'; items: Adjustment[]; onClose: () => void; onDone: (msg: string) => void };

export function DuyetModal(p: Props) {
  const api = useApi();
  const [ids, setIds] = useState<string[]>(p.items.map((x) => x.id));
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const go = useMutation({
    mutationFn: async (approve: boolean) => {
      if (p.kind === 'program') {
        return api.post(`${M}/program-drafts/${approve ? 'approve' : 'reject'}`, approve ? { ids } : { ids, reason: reason.trim() });
      }
      for (const id of ids) await api.post(`${M}/adjustments/${id}/${approve ? 'approve' : 'reject'}`, approve ? {} : { reason: reason.trim() });
      return null;
    },
    onSuccess: (_r, approve) => p.onDone(approve
      ? p.kind === 'program' ? `Đã duyệt và phát hành ${ids.length} nháp — máy bán tính theo bản mới từ đơn kế tiếp.` : `Đã duyệt ${ids.length} điều chỉnh — đã ghi sổ điểm.`
      : `Đã từ chối ${ids.length} mục.`),
  });
  const toggle = (id: string) => setIds((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  const label = (x: Draft | Adjustment) => ('branchCode' in x && 'program' in x)
    ? `${x.branchCode} — nháp của ${x.createdByName || x.createdBy}${x.batchId ? ' (áp nhiều cửa hàng)' : ''}`
    : `${(x as Adjustment).code} · ${(x as Adjustment).customerCode} ${(x as Adjustment).points > 0 ? '+' : ''}${(x as Adjustment).points} điểm · ${(x as Adjustment).reason} · lập: ${(x as Adjustment).createdByName}`;
  return (
    <Modal title={p.kind === 'program' ? 'Duyệt chính sách tích điểm' : 'Duyệt điều chỉnh điểm'} onClose={p.onClose} wide
      footer={<div style={{ display: 'flex', gap: 6 }}>
        {!rejecting && <button type="button" className="btn btn-primary" disabled={!ids.length || go.isPending} onClick={() => go.mutate(true)}>{p.kind === 'program' ? 'Duyệt và phát hành' : 'Duyệt'}</button>}
        {!rejecting && <button type="button" className="btn" disabled={!ids.length || go.isPending} onClick={() => setRejecting(true)}>Từ chối…</button>}
        {rejecting && <button type="button" className="btn btn-primary" disabled={!ids.length || !reason.trim() || go.isPending} title={reason.trim() ? '' : 'Ghi lý do từ chối'} onClick={() => go.mutate(false)}>Từ chối</button>}
        <button type="button" className="btn" onClick={p.onClose}>Đóng</button>
      </div>}>
      <div style={{ gridColumn: '1 / -1', display: 'grid', gap: 6 }}>
        {!p.items.length && <span className="muted">Không có mục nào chờ duyệt.</span>}
        {p.items.map((x) => (
          <label key={x.id} style={{ display: 'flex', gap: 6 }}><input type="checkbox" name="ids" checked={ids.includes(x.id)} onChange={() => toggle(x.id)} />{label(x)}</label>
        ))}
        {/* [2026-11-28 04:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-059: chương trình — người có quyền duyệt tự duyệt được; điều chỉnh điểm vẫn người khác duyệt (đóng góp) */}
        <span className="muted">{p.kind === 'program' ? 'Duyệt = phát hành nháp của cửa hàng (gồm mọi thay đổi trong nháp đó).' : 'Người lập không tự duyệt điều chỉnh của mình.'}</span>
        {rejecting && <label style={{ display: 'grid', gap: 2 }}>Lý do từ chối (*)<input className="input" name="reason" value={reason} onChange={(e) => setReason(e.target.value)} /></label>}
        {go.error ? <ErrorBox error={errorText(go.error)} /> : null}
      </div>
    </Modal>
  );
}
