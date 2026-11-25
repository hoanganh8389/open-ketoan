// [2026-11-25 09:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-039: khung soạn chính sách tích điểm của một cửa hàng (nháp → gửi duyệt → duyệt = phát hành) (đóng góp)
/**
 * Dùng chung cho ba thẻ Chương trình / Đổi điểm / Cài đặt + hạng: chọn cửa hàng → thấy bản máy bán đang tính và nháp đang mở (nếu có).
 * - "Sửa từ bản hiện hành": lập nháp chép bản đang chạy (Q3); bản đã phát hành không sửa (Q-CHUNG-02).
 * - "Lưu nháp" / "Gửi duyệt": kèm revision — người khác vừa lưu thì máy chủ chặn "Nháp đã đổi lúc … bởi …", có nút Tải lại (Q-CHUNG-03).
 * - Lỗi trả một lần, tô đỏ đúng ô (Q-CHUNG-06); rời trang khi chưa lưu thì hỏi (Q-CHUNG-07).
 * - Nút ẩn theo quyền (useCan), máy chủ vẫn chặn (Q-CHUNG-01).
 */
import { useEffect, useState } from 'react';
import { BranchPicker, ErrorBox, Loading, Modal, errorText, useApi, useCan, useMutation, useQuery, useQueryClient } from '@bizcity/ui-kit';
import { ApDungModal } from './ApDungModal';
import { CaiDatHangForm } from './CaiDatHangForm';
import { ChuongTrinhForm } from './ChuongTrinhForm';
import { DoiDiemForm } from './DoiDiemForm';
import { DuyetModal } from './DuyetModal';
import { ACTION_LABEL, M, PERM, STATUS_LABEL, fieldErrorsOf, reasonOf, useLeaveGuard, type Content, type Draft, type FieldErrors } from './model';

export type View = 'chuong-trinh' | 'doi-diem' | 'cai-dat';
type Current = Content & { version: string };

export function ChinhSachKhung({ view }: { view: View }) {
  const api = useApi();
  const can = useCan();
  const qc = useQueryClient();
  const [branch, setBranch] = useState('');
  const [edit, setEdit] = useState<Content | null>(null);
  const [dirty, setDirty] = useState(false);
  const [errs, setErrs] = useState<FieldErrors>({});
  const [msg, setMsg] = useState('');
  const [dialog, setDialog] = useState<'' | 'ap' | 'duyet' | 'log'>('');
  useLeaveGuard(dirty);

  const cur = useQuery({
    queryKey: ['loyalty', 'program', branch], enabled: Boolean(branch),
    queryFn: () => api.get<Current>(`${M}/program`, { branch }).catch((e: unknown) => { if ((e as { status?: number }).status === 404) return null; throw e; }),
  });
  const drafts = useQuery({ queryKey: ['loyalty', 'drafts', branch], enabled: Boolean(branch), queryFn: () => api.get<{ items: Draft[] }>(`${M}/program-drafts`, { branch }) });
  const pending = useQuery({ queryKey: ['loyalty', 'drafts', 'pending'], enabled: can(PERM.duyet), queryFn: () => api.get<{ items: Draft[] }>(`${M}/program-drafts`, { status: 'pending' }) });
  const draft = drafts.data?.items[0] ?? null;
  const detail = useQuery({ queryKey: ['loyalty', 'draft', draft?.id], enabled: dialog === 'log' && Boolean(draft), queryFn: () => api.get<Draft>(`${M}/program-drafts/${draft!.id}`) });

  useEffect(() => { setEdit(draft ? draft.program : null); setDirty(false); setErrs({}); }, [draft?.id, draft?.revision]);

  const refresh = () => { void qc.invalidateQueries({ queryKey: ['loyalty'] }); };
  const fail = (e: unknown) => { setErrs(fieldErrorsOf(e)); };
  const create = useMutation({
    mutationFn: () => api.post<{ items: Draft[] }>(`${M}/program-drafts`, { branchCodes: [branch] }),
    onSuccess: () => { setMsg(`Đã lập nháp cho ${branch} từ bản hiện hành.`); refresh(); }, onError: fail,
  });
  const save = useMutation({
    mutationFn: (submit: boolean) => api.put<Draft>(`${M}/program-drafts/${draft!.id}`, { program: edit, revision: draft!.revision, submit }),
    onSuccess: (_d, submit) => { setDirty(false); setErrs({}); setMsg(submit ? 'Đã gửi duyệt — máy bán vẫn tính theo bản cũ tới khi được duyệt.' : 'Đã lưu nháp.'); refresh(); },
    onError: fail,
  });
  const onChange = (c: Content) => { setEdit(c); setDirty(true); };
  const pickBranch = (b: string) => { if (dirty && !window.confirm('Nháp còn thay đổi chưa lưu — bỏ thay đổi và đổi cửa hàng?')) return; setBranch(b); setMsg(''); };

  const canEdit = Boolean(draft) && draft!.status !== 'published' && can(PERM.sua);
  const shown = edit ?? (cur.data ? { settings: cur.data.settings, tiers: cur.data.tiers, policies: cur.data.policies } : null);
  const base = cur.data ? { settings: cur.data.settings, tiers: cur.data.tiers, policies: cur.data.policies } : null;
  const err = create.error ?? save.error;
  const changed = reasonOf(save.error) === 'LOYALTY_DRAFT_CHANGED';
  const formProps = { content: shown!, errs, readOnly: !canEdit, onChange };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '8px 0' }}>
        <span>Cửa hàng</span><div style={{ width: 220 }}><BranchPicker value={branch} onChange={pickBranch} placeholder="Chọn cửa hàng" /></div>
        {branch && can(PERM.lap) && !draft && <button type="button" className="btn" disabled={create.isPending} onClick={() => create.mutate()}>Sửa từ bản hiện hành</button>}
        {canEdit && <button type="button" className="btn" disabled={!dirty || save.isPending} onClick={() => save.mutate(false)}>Lưu nháp</button>}
        {canEdit && <button type="button" className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate(true)}>Gửi duyệt</button>}
        {shown && can(PERM.lap) && <button type="button" className="btn" disabled={dirty} title={dirty ? 'Lưu nháp trước' : ''} onClick={() => setDialog('ap')}>Áp cho nhiều cửa hàng…</button>}
        {can(PERM.duyet) && <button type="button" className="btn" onClick={() => setDialog('duyet')}>Duyệt / từ chối ({pending.data?.items.length ?? 0})</button>}
        {draft && <button type="button" className="btn" onClick={() => setDialog('log')}>Nhật ký</button>}
      </div>
      {branch && (
        <div className="muted" style={{ marginBottom: 6 }}>
          Máy bán đang tính theo: {cur.data ? <b>bản {cur.data.version}</b> : 'chưa có chính sách'}
          {draft && <> · Nháp: <span className="badge badge-warn">{STATUS_LABEL[draft.status]}</span> lập bởi {draft.createdByName || draft.createdBy}{draft.rejectReason && draft.status === 'rejected' ? ` — bị từ chối: ${draft.rejectReason}` : ''}</>}
          {dirty && <> · <b>có thay đổi chưa lưu</b></>}
        </div>
      )}
      {msg && <div className="badge badge-ok" style={{ marginBottom: 6 }}>{msg}</div>}
      {err ? <ErrorBox error={errorText(err)} /> : null}
      {changed && <button type="button" className="btn btn-xs" onClick={() => { setDirty(false); save.reset(); refresh(); }}>Tải lại nháp</button>}
      {!branch ? <span className="muted">Chọn cửa hàng để xem / soạn chính sách tích điểm.</span>
        : cur.isLoading || drafts.isLoading ? <Loading />
          : !shown ? <span className="muted">Cửa hàng chưa có chính sách. {can(PERM.lap) ? 'Bấm "Sửa từ bản hiện hành" để lập nháp mới.' : ''}</span>
            : view === 'chuong-trinh' ? <ChuongTrinhForm {...formProps} base={base} />
              : view === 'doi-diem' ? <DoiDiemForm {...formProps} base={base} />
                : <CaiDatHangForm {...formProps} />}
      {dialog === 'ap' && shown && <ApDungModal content={shown} onClose={() => setDialog('')} onDone={(m) => { setDialog(''); setMsg(m); refresh(); }} />}
      {dialog === 'duyet' && <DuyetModal kind="program" items={pending.data?.items ?? []} onClose={() => setDialog('')} onDone={(m) => { setDialog(''); setMsg(m); refresh(); }} />}
      {dialog === 'log' && (
        <Modal title="Nhật ký nháp" onClose={() => setDialog('')}>
          <div style={{ gridColumn: '1 / -1' }}>
            {detail.isLoading ? <Loading /> : (detail.data?.log ?? []).map((l, i) => (
              <div key={i}>{new Date(l.at).toLocaleString('vi-VN')} — {ACTION_LABEL[l.action] ?? l.action}: {l.actorName}{l.note ? ` (${l.note})` : ''}</div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
