// [2026-11-28 03:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-059: bước 1 Cài đặt + hạng — một bộ cài đặt áp cho Tất cả / chọn cửa hàng, nút Ghi · Gửi duyệt · Duyệt (đóng góp)
/**
 * Lấy cài đặt + bảng hạng của một cửa hàng làm mẫu (mặc định cửa hàng đầu tiên đã có), sửa, rồi áp cho Tất cả / các cửa hàng chọn.
 * Bảng dưới cho thấy từng cửa hàng đang dùng gì (tên gọi điểm, số hạng, tích / đổi ở máy bán, nháp). Người có quyền duyệt bấm Duyệt =
 * phát hành ngay (tự lập tự duyệt — Hoàng 28/11).
 */
import { useEffect, useState } from 'react';
import { DataGrid, ErrorBox, errorText, useApi, useCan, useMutation, useQueryClient, type GridColumn } from '@bizcity/ui-kit';
import { ApDungCho } from './ApDungCho';
import { CaiDatHangForm } from './CaiDatHangForm';
import { M, PERM, STATUS_LABEL, fieldErrorsOf, useLeaveGuard, type BranchConfig, type Content, type FieldErrors, type Overview, type SaveMode, type Settings, type Target, type Tier } from './model';

const DEFAULT: { settings: Settings; tiers: Tier[] } = {
  settings: { enablePosEarn: true, enablePosRedeem: true, enableTierMultiplier: false, minRedeemPoints: 0, pointLabel: 'điểm' },
  tiers: [{ key: 'MEMBER', name: 'Thành viên', minPoints: 0, multiplier: 1 }],
};
const yes = (b: boolean | undefined) => (b ? 'Có' : 'Không');

export function CaiDatTab({ ov, onNext }: { ov: Overview; onNext?: () => void }) {
  const api = useApi();
  const can = useCan();
  const qc = useQueryClient();
  const withCfg = ov.settings.filter((s) => s.settings);
  const [src, setSrc] = useState(withCfg[0]?.branchCode ?? '');
  const pickSrc = (b: string) => { const c = ov.settings.find((s) => s.branchCode === b); return c?.settings ? { settings: c.settings, tiers: c.tiers } : DEFAULT; };
  const [cfg, setCfg] = useState(() => pickSrc(src));
  const [orig, setOrig] = useState(cfg);
  const [tgt, setTgt] = useState<Target>({ all: true, branchCodes: [] });
  const [errs, setErrs] = useState<FieldErrors>({});
  const [msg, setMsg] = useState('');
  const dirty = JSON.stringify(cfg) !== JSON.stringify(orig);
  useLeaveGuard(dirty);
  useEffect(() => { const c = pickSrc(src); setCfg(c); setOrig(c); setErrs({}); }, [src]);

  const canEdit = can(PERM.lap);
  const approver = can(PERM.duyet);
  const problems: string[] = [];
  if (!cfg.settings.pointLabel.trim()) problems.push('Nhập tên gọi điểm');
  if (!cfg.tiers.length) problems.push('Cần ít nhất một hạng');
  if (cfg.tiers.some((t) => !t.key.trim() || !t.name.trim())) problems.push('Hạng thiếu mã / tên');
  if (!tgt.all && !tgt.branchCodes.length) problems.push('Chọn ít nhất một cửa hàng áp dụng');
  const save = useMutation({
    mutationFn: (mode: SaveMode) => api.post<{ targets: string[] }>(`${M}/policies/save`, { config: cfg, target: tgt, mode }),
    onSuccess: (o, mode) => {
      setErrs({}); setOrig(cfg);
      const n = tgt.all ? `tất cả ${o.targets.length} cửa hàng` : `${o.targets.length} cửa hàng (${o.targets.join(', ')})`;
      setMsg(mode === 'approve' ? `Đã duyệt và phát hành cài đặt + hạng cho ${n}.` : mode === 'submit' ? `Đã gửi duyệt cài đặt + hạng cho ${n}.` : `Đã ghi nháp cài đặt + hạng cho ${n}.`);
      void qc.invalidateQueries({ queryKey: ['loyalty'] });
    },
    onError: (e) => setErrs(fieldErrorsOf(e)),
  });
  const content: Content = { settings: cfg.settings, tiers: cfg.tiers, policies: [] };
  const nameOf = (c: string) => ov.branches.find((b) => b.code === c)?.name ?? '';
  const cols: GridColumn<BranchConfig>[] = [
    { key: 'branchCode', header: 'Cửa hàng', type: 'code', width: 90 },
    { key: 'name', header: 'Tên', width: 200, value: (s) => nameOf(s.branchCode) },
    { key: 'pointLabel', header: <span title="Tên gọi điểm ở máy bán">Tên gọi điểm</span>, width: 110, value: (s) => s.settings?.pointLabel ?? '' },
    { key: 'tiers', header: 'Hạng', width: 220, value: (s) => s.tiers.map((t) => `${t.name} ×${t.multiplier}`).join(', ') },
    { key: 'earn', header: <span title="Tích điểm ở máy bán">Tích</span>, width: 60, value: (s) => yes(s.settings?.enablePosEarn) },
    { key: 'redeem', header: <span title="Đổi điểm ở máy bán">Đổi</span>, width: 60, value: (s) => yes(s.settings?.enablePosRedeem) },
    { key: 'mult', header: <span title="Nhân điểm theo hạng">Nhân hạng</span>, width: 80, value: (s) => yes(s.settings?.enableTierMultiplier) },
    { key: 'draftStatus', header: <span title="Nháp đang mở của cửa hàng (gồm cả chương trình)">Nháp</span>, width: 100, value: (s) => (s.draftStatus ? STATUS_LABEL[s.draftStatus] ?? s.draftStatus : '') },
  ];

  return (
    <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <section className="card">
        <div className="catalog-toolbar canh-phai" style={{ alignItems: 'center' }}>
          <span className="muted" title="Nạp cài đặt + hạng của cửa hàng này làm mẫu để sửa">Lấy mẫu từ</span>
          <select className="input" style={{ width: 240 }} value={src} onChange={(e) => { if (dirty && !window.confirm('Còn thay đổi chưa lưu — bỏ và nạp mẫu khác?')) return; setSrc(e.target.value); }}>
            {!withCfg.length && <option value="">(mặc định — chưa cửa hàng nào có)</option>}
            {withCfg.map((s) => <option key={s.branchCode} value={s.branchCode}>{s.branchCode} {nameOf(s.branchCode)}</option>)}
          </select>
          {dirty && <span className="muted"><b>có thay đổi chưa lưu</b></span>}
        </div>
      </section>
      {msg && <div className="alert alert-ok" role="status">{msg}{onNext && <> <button type="button" className="btn btn-xs" onClick={onNext}>Bước tiếp →</button></>}</div>}
      <CaiDatHangForm content={content} errs={errs} readOnly={!canEdit} onChange={(c) => setCfg({ settings: c.settings, tiers: c.tiers })} />
      <section className="card">
        <div className="card-body" style={{ display: 'grid', gap: 8 }}>
          <b>Áp dụng cho</b>
          <ApDungCho name="cd" branches={ov.branches} value={tgt} onChange={setTgt} errs={errs} disabled={!canEdit} />
          {canEdit && (
            <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="muted" style={{ flex: 1, fontSize: 12.5 }}>
                {save.error ? <span style={{ color: 'var(--bad, #dc2626)' }}>{errorText(save.error)}</span>
                  : problems.length ? `Chưa lưu được: ${problems.join(' · ')}` : 'Chương trình tích / đổi của từng cửa hàng giữ nguyên — chỉ thay cài đặt + bảng hạng.'}
              </span>
              <button type="button" className="btn" disabled={problems.length > 0 || save.isPending} title="Ghi nháp — chưa áp ở máy bán" onClick={() => save.mutate('draft')}>Ghi</button>
              <button type="button" className="btn" disabled={problems.length > 0 || save.isPending} title="Ghi và gửi người có quyền duyệt" onClick={() => save.mutate('submit')}>Gửi duyệt</button>
              {approver && <button type="button" className="btn btn-primary" disabled={problems.length > 0 || save.isPending} title="Ghi, duyệt và phát hành ngay" onClick={() => save.mutate('approve')}>Duyệt (phát hành)</button>}
            </div>
          )}
        </div>
      </section>
      {save.error && !Object.keys(errs).length ? <ErrorBox error={errorText(save.error)} /> : null}
      <section className="card">
        <div className="card-body" style={{ paddingBottom: 0 }}><b>Cửa hàng đang dùng</b> <span className="muted">· bản máy bán đang tính, hoặc nháp đang mở</span></div>
        <DataGrid rows={ov.settings} columns={cols} rowKey={(s) => s.branchCode} storageKey="loyalty.cai-dat" footerLabel={false} emptyText="Chưa cửa hàng nào có cài đặt tích điểm — khai ở trên rồi áp cho Tất cả cửa hàng." />
      </section>
    </div>
  );
}
