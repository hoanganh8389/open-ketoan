// [2026-11-25 09:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-039: hộp Áp cho nhiều cửa hàng — mỗi cửa hàng một nháp (đóng góp)
/**
 * Áp nội dung đang xem (cài đặt, bảng hạng, chính sách) cho nhiều cửa hàng một lần: mỗi cửa hàng một bản nháp, chính sách gộp theo mã vào bản
 * đang chạy của cửa hàng đó (cùng mã → thay; chính sách riêng giữ nguyên). Cửa hàng đang có nháp chưa duyệt → máy chủ chặn, nêu tên cửa hàng.
 */
import { useState } from 'react';
import { BranchCheckList, ErrorBox, Modal, errorText, useApi, useMutation } from '@bizcity/ui-kit';
import { M, type Content } from './model';

export function ApDungModal({ content, onClose, onDone }: { content: Content; onClose: () => void; onDone: (msg: string) => void }) {
  const api = useApi();
  const [branchCodes, setBranches] = useState('');
  const [submit, setSubmit] = useState(true);
  const list = branchCodes.split(',').map((s) => s.trim()).filter(Boolean);
  const go = useMutation({
    mutationFn: () => api.post<{ items: { branchCode: string }[] }>(`${M}/program-drafts`, { branchCodes: list, program: content, submit }),
    onSuccess: (r) => onDone(`Đã lập ${r.items.length} nháp (${r.items.map((d) => d.branchCode).join(', ')})${submit ? ', đã gửi duyệt' : ''} — chưa áp ở máy bán tới khi duyệt.`),
  });
  return (
    <Modal title="Áp chính sách cho nhiều cửa hàng" onClose={onClose}
      footer={<div style={{ display: 'flex', gap: 6 }}>
        <button type="button" className="btn btn-primary" disabled={!list.length || go.isPending} title={list.length ? '' : 'Chọn ít nhất một cửa hàng'} onClick={() => go.mutate()}>Lập nháp</button>
        <button type="button" className="btn" onClick={onClose}>Đóng</button>
      </div>}>
      <div style={{ gridColumn: '1 / -1', display: 'grid', gap: 8 }}>
        <span>Cửa hàng áp dụng (*) — <span className="muted">{content.policies.length} chính sách, {content.tiers.length} hạng</span></span>
        <div data-field="branchCodes"><BranchCheckList value={branchCodes} onChange={setBranches} /></div>
        <label style={{ display: 'flex', gap: 6 }}><input type="checkbox" checked={submit} onChange={(e) => setSubmit(e.target.checked)} />Gửi duyệt luôn</label>
        {go.error ? <ErrorBox error={errorText(go.error)} /> : null}
      </div>
    </Modal>
  );
}
