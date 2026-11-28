// [2026-11-28 03:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-059: danh sách chương trình tích / đổi điểm theo chương trình (không theo từng cửa hàng) — thanh nút Core, trạng thái, áp dụng cho (đóng góp)
/**
 * Bước 2 (tích điểm, loại 1–4) và bước 3 (đổi điểm, loại 5–6): mỗi dòng một chương trình, cột Áp dụng cho (Tất cả / các cửa hàng) và
 * Trạng thái (Nháp / Chờ duyệt / Đang áp / Ngừng). Thanh nút: + Thêm (mã tự sinh) · Sửa · Nhân bản · Duyệt chờ (n). Bấm đúp một dòng = Sửa.
 * Nút ẩn theo quyền (useCan), máy chủ vẫn chặn (Q-CHUNG-01).
 */
import { useState } from 'react';
import { DataGrid, ErrorBox, Loading, errorText, useApi, useCan, useQuery, useQueryClient, type GridColumn } from '@bizcity/ui-kit';
import { ChuongTrinhModal } from './ChuongTrinhModal';
import { DuyetModal } from './DuyetModal';
import {
  EARN_TYPES, M, PERM, REDEEM_TYPES, STATE_BADGE, TYPE_LABEL, endToStopDay, newPolicy, nextLoyaltyCode, ruleSummary, startToDay, targetOf, vnToday,
  type Draft, type OvPolicy, type Overview, type Policy, type Target,
} from './model';

type Open = { initial: Policy; target: Target; isNew: boolean; published: boolean };
const h = (label: string, tip: string) => <span title={tip}>{label}</span>;

export function ChuongTrinhTab({ group, ov, onNext }: { group: 'earn' | 'redeem'; ov: Overview; onNext?: () => void }) {
  const api = useApi();
  const can = useCan();
  const qc = useQueryClient();
  const [pick, setPick] = useState<OvPolicy | null>(null);
  const [open, setOpen] = useState<Open | null>(null);
  const [duyet, setDuyet] = useState(false);
  const [msg, setMsg] = useState('');
  const types: readonly number[] = group === 'earn' ? EARN_TYPES : REDEEM_TYPES;
  const rows = ov.policies.filter((p) => types.includes(p.type));
  const pending = useQuery({ queryKey: ['loyalty', 'drafts', 'pending'], enabled: can(PERM.duyet), queryFn: () => api.get<{ items: Draft[] }>(`${M}/program-drafts`, { status: 'pending' }) });
  const canAdd = can(PERM.lap);
  const nameOf = (c: string) => ov.branches.find((b) => b.code === c)?.name ?? c;
  const cfg = ov.settings.find((s) => s.settings) ?? null;
  const tiers = cfg?.tiers ?? [];
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['loyalty'] }); };
  const prefix = group === 'earn' ? 'TD' : 'DD';
  const nextId = () => Math.max(0, ...ov.policies.map((p) => p.id)) + 1;
  const strip = (p: OvPolicy): Policy => { const { uses: _u, state: _s, allBranches: _a, ...rest } = p; return rest; };

  const add = () => {
    const base = newPolicy(types[0]!, []);
    setOpen({ initial: { ...base, id: nextId(), priority: rows.length + 1, code: nextLoyaltyCode(ov.policies.map((p) => p.code), vnToday(), prefix) }, target: { all: true, branchCodes: [] }, isNew: true, published: false });
  };
  const edit = (p: OvPolicy) => setOpen({ initial: strip(p), target: targetOf(p), isNew: false, published: p.uses.some((u) => u.published) });
  const copy = (p: OvPolicy) => setOpen({
    initial: { ...strip(p), id: nextId(), code: nextLoyaltyCode(ov.policies.map((x) => x.code), vnToday(), prefix), title: `${p.title} (bản sao)`, status: 1, endDate: 0 },
    target: targetOf(p), isNew: true, published: false,
  });

  const cols: GridColumn<OvPolicy>[] = [
    { key: 'code', header: h('Mã', 'Mã chương trình (TD_ tích điểm, DD_ đổi điểm)'), type: 'code', width: 130 },
    { key: 'title', header: 'Tên chương trình', width: 210 },
    { key: 'type', header: 'Loại', width: 150, value: (p) => TYPE_LABEL[p.type] ?? String(p.type) },
    { key: 'rule', header: h('Cách tính / phần thưởng', 'Tóm tắt — mở Sửa để xem đủ'), width: 200, value: (p) => ruleSummary(p) },
    {
      key: 'scope', header: h('Áp dụng cho', 'Các cửa hàng đang có chương trình (không tính nơi đã ngừng)'), width: 180,
      value: (p) => (p.allBranches ? 'Tất cả cửa hàng' : p.uses.filter((u) => u.state !== 'stopped').map((u) => u.branchCode).join(', ') || '(không cửa hàng nào)'),
      render: (p) => {
        const on = p.uses.filter((u) => u.state !== 'stopped');
        return p.allBranches ? <b>Tất cả cửa hàng</b> : <span title={on.map((u) => `${u.branchCode} ${nameOf(u.branchCode)}`).join('\n')}>{on.length ? `${on.length} cửa hàng: ${on.map((u) => u.branchCode).join(', ')}` : <span className="muted">(không cửa hàng nào)</span>}</span>;
      },
    },
    { key: 'startDate', header: 'Từ ngày', type: 'date', width: 100, value: (p) => startToDay(p.startDate) },
    { key: 'endDate', header: h('Ngừng từ', 'Ngày bắt đầu ngừng; trống = không hạn'), type: 'date', width: 100, value: (p) => endToStopDay(p.endDate) },
    {
      key: 'state', header: h('Trạng thái', 'Nháp / Chờ duyệt / Đang áp / Ngừng — trạng thái "nặng" nhất trong các cửa hàng'), width: 110,
      value: (p) => STATE_BADGE[p.state].label,
      render: (p) => <span className={STATE_BADGE[p.state].cls} title={`${STATE_BADGE[p.state].tip}\n${p.uses.map((u) => `${u.branchCode}: ${STATE_BADGE[u.state].label}`).join('\n')}`}>{STATE_BADGE[p.state].label}</span>,
    },
  ];
  const word = group === 'earn' ? 'chương trình tích điểm' : 'danh mục đổi điểm';
  const pendingN = pending.data?.items.length ?? ov.pending;

  return (
    <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <section className="card">
        <div className="catalog-toolbar canh-phai" style={{ alignItems: 'center' }}>
          {canAdd && <button type="button" className="btn btn-sm btn-primary" title={`Thêm ${word} — mã tự sinh ${prefix}_<tháng năm>_<số>, áp cho Tất cả hoặc chọn cửa hàng`} onClick={add}>+ Thêm</button>}
          {canAdd && <button type="button" className="btn btn-sm" disabled={!pick} title={pick ? '' : 'Chọn một dòng ở bảng (hoặc bấm đúp dòng)'} onClick={() => pick && edit(pick)}>Sửa</button>}
          {canAdd && <button type="button" className="btn btn-sm" disabled={!pick} title={pick ? 'Thêm chương trình mới chép nội dung dòng đang chọn (mã mới)' : 'Chọn một dòng ở bảng'} onClick={() => pick && copy(pick)}>Nhân bản</button>}
          <button type="button" className="btn btn-sm" onClick={refresh} title="Tải lại danh sách">Nạp</button>
          <span style={{ flex: 1 }} />
          {can(PERM.duyet) && <button type="button" className="btn btn-sm" title="Các thay đổi đang chờ duyệt (mọi cửa hàng)" onClick={() => setDuyet(true)}>Duyệt chờ ({pendingN})</button>}
          {!canAdd && <span className="muted">Chỉ xem — thêm / sửa cần quyền Lập nháp chính sách tích điểm (HT12).</span>}
        </div>
      </section>
      {msg && <div className="alert alert-ok" role="status">{msg}{onNext && <> <button type="button" className="btn btn-xs" onClick={onNext}>Bước tiếp →</button></>}</div>}
      {pending.error ? <ErrorBox error={errorText(pending.error)} /> : null}
      {!rows.length ? (
        <div className="card card-body" style={{ display: 'grid', gap: 6 }}>
          <b>Chưa có {word} nào.</b>
          <span className="muted">{group === 'earn'
            ? 'Bắt đầu bằng một chương trình "Theo tiền" (vd 1 điểm cho mỗi 10.000đ, hạn điểm 365 ngày) áp cho Tất cả cửa hàng. Sau đó có thể thêm theo mã hàng, nhân điểm dịp lễ, thưởng theo mức đơn.'
            : 'Thêm danh mục "Đổi quà" (quà là mặt hàng ở danh mục) hoặc "Đổi voucher" để khách dùng điểm ở máy bán.'}</span>
          {canAdd && <div><button type="button" className="btn btn-sm btn-primary" onClick={add}>+ Thêm {word}</button></div>}
        </div>
      ) : (
        <section className="card">
          <DataGrid rows={rows} columns={cols} rowKey={(p) => p.code} storageKey={`loyalty.ct.${group}`} exportName={group === 'earn' ? 'chuong-trinh-tich-diem' : 'danh-muc-doi-diem'}
            onRowClick={setPick} onRowDoubleClick={(p) => { setPick(p); if (canAdd) edit(p); }} rowClassName={(p) => (pick?.code === p.code ? 'selected' : p.state === 'stopped' ? 'muted' : '')} footerLabel={false} />
        </section>
      )}
      {open && (
        <ChuongTrinhModal {...open} group={group} branches={ov.branches} tiers={tiers} tierOn={Boolean(cfg?.settings?.enableTierMultiplier)}
          onClose={() => setOpen(null)} onDone={(m) => { setOpen(null); setPick(null); setMsg(m); refresh(); }} />
      )}
      {duyet && <DuyetModal kind="program" items={pending.data?.items ?? []} onClose={() => setDuyet(false)} onDone={(m) => { setDuyet(false); setMsg(m); refresh(); }} />}
    </div>
  );
}
