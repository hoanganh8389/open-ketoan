// [2026-11-25 09:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-039: hộp lập yêu cầu điều chỉnh điểm tay (L4) (đóng góp)
/**
 * Lập yêu cầu cộng / trừ điểm (số âm = trừ), lý do bắt buộc; chưa ghi sổ tới khi người khác duyệt. Báo trước khi bấm: trừ quá số điểm dùng được
 * (đọc điểm của khách), thiếu lý do, số 0. Máy chủ kiểm lại và trả mọi lỗi một lần theo ô.
 */
import { useState } from 'react';
import { BranchPicker, ErrorBox, Modal, errorText, useApi, useMutation, useQuery } from '@bizcity/ui-kit';
import { Err, Lbl, NumIn, TextIn } from './parts';
import { M, fieldErrorsOf, useLeaveGuard } from './model';

// [2026-11-27 Võ Hoàng] NGHIEM-THU — NT-BH-051: mở từ thẻ Thành viên (nút Cộng / Trừ) điền sẵn mã khách, chiều cộng / trừ (đóng góp)
export function DieuChinhForm({ onClose, onDone, initial }: { onClose: () => void; onDone: (msg: string) => void; initial?: { customerCode: string; sign?: 1 | -1 } }) {
  const api = useApi();
  const [f, setF] = useState({ customerCode: initial?.customerCode ?? '', points: 0, reason: '', branchCode: '' });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const dirty = Boolean((f.customerCode && f.customerCode !== initial?.customerCode) || f.points || f.reason);
  useLeaveGuard(dirty);
  const code = f.customerCode.trim();
  const pts = useQuery({
    queryKey: ['loyalty', 'customer', code], enabled: code.length >= 3,
    queryFn: () => api.get<{ available: number; balance: number; tierName: string }>(`${M}/customers/${encodeURIComponent(code)}`),
  });
  const local: Record<string, string> = {};
  if (!f.points) local.points = 'Số điểm điều chỉnh khác 0 (số âm = trừ)';
  else if (f.points < 0 && pts.data && -f.points > pts.data.available) local.points = `Không trừ quá số điểm khách đang có (${pts.data.available} điểm dùng được)`;
  if (!f.reason.trim()) local.reason = 'Ghi lý do điều chỉnh (bắt buộc)';
  if (!code) local.customerCode = 'Nhập mã khách (máy bán: SĐT)';
  const go = useMutation({
    mutationFn: () => api.post<{ code: string }>(`${M}/adjustments`, { customerCode: code, points: f.points, reason: f.reason.trim(), ...(f.branchCode ? { branchCode: f.branchCode } : {}) }),
    onSuccess: (r) => onDone(`Đã lập yêu cầu ${r.code} — chờ người khác duyệt mới ghi sổ điểm.`),
  });
  const errs = { ...fieldErrorsOf(go.error) };
  const close = () => { if (dirty && !window.confirm('Yêu cầu chưa lưu — đóng và bỏ?')) return; onClose(); };
  return (
    <Modal title={initial?.sign === -1 ? `Trừ điểm khách ${initial.customerCode}` : initial?.sign === 1 ? `Cộng điểm khách ${initial.customerCode}` : 'Lập yêu cầu điều chỉnh điểm'} onClose={close}
      footer={<div style={{ display: 'flex', gap: 6 }}>
        <button type="button" className="btn btn-primary" disabled={Object.keys(local).length > 0 || go.isPending} title={Object.values(local).join('; ')} onClick={() => go.mutate()}>Lập yêu cầu</button>
        <button type="button" className="btn" onClick={close}>Đóng</button>
      </div>}>
      <div style={{ gridColumn: '1 / -1', display: 'grid', gap: 8 }}>
        <Lbl text="Mã khách (*)"><TextIn errs={errs} path="customerCode" value={f.customerCode} width={180} placeholder="SĐT / mã đối tượng" onChange={(v) => set({ customerCode: v })} /></Lbl>
        {pts.data && <span className="muted">Khách đang có {pts.data.balance} điểm ({pts.data.available} dùng được), hạng {pts.data.tierName}.</span>}
        <Lbl text="Số điểm (*)" tip="Số dương = cộng, số âm = trừ"><NumIn errs={f.points && local.points ? { ...errs, points: local.points } : errs} path="points" value={initial?.sign ? Math.abs(f.points) : f.points} width={120} onChange={(v) => set({ points: initial?.sign ? initial.sign * Math.abs(v) : v })} /></Lbl>
        <Lbl text="Lý do (*)"><TextIn errs={errs} path="reason" value={f.reason} width={360} placeholder="vd Bù đơn lỗi" onChange={(v) => set({ reason: v })} /></Lbl>
        <Lbl text="Chi nhánh"><span><BranchPicker value={f.branchCode} onChange={(v) => set({ branchCode: v })} placeholder="(không bắt buộc)" /><Err errs={errs} path="branchCode" /></span></Lbl>
        {go.error ? <ErrorBox error={errorText(go.error)} /> : null}
      </div>
    </Modal>
  );
}
