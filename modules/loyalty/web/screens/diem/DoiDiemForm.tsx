// [2026-11-25 09:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-039: thẻ Đổi điểm (L2) — danh mục quà (loại 5) / voucher (loại 6) theo hạng (đóng góp)
// [2026-11-27 Võ Hoàng] NGHIEM-THU — NT-BH-051: đủ ô như plugin cũ — ưu tiên, tự động áp, từ ngày, số lượng voucher, theo dõi tồn quà (đóng góp)
/**
 * Soạn danh mục ĐỔI điểm của nháp: mỗi chính sách loại 5 (quà) / 6 (voucher) có các phần thưởng — mã, tên, điểm cần, hạng tối thiểu, số lượng
 * (quà: mã hàng chọn ở danh mục mặt hàng đang dùng, không tạo mặt hàng tại chỗ — Q-CHUNG-08); voucher: kiểu giảm, giá trị, trần, đơn tối thiểu,
 * số ngày hiệu lực, tiền tố mã. Khách chưa đủ hạng thì máy bán báo "chưa đủ hạng".
 */
import { ItemPicker } from '@bizcity/ui-kit';
import { Lines } from './ChuongTrinhForm';
import { Box, Err, Lbl, NumIn, Row, TextIn } from './parts';
import { TYPE_LABEL, arr, dayToStart, endToStopDay, newPolicy, rec, startToDay, stopDayToEnd, type Content, type FieldErrors, type Policy } from './model';

type Props = { content: Content; base: Content | null; errs: FieldErrors; readOnly: boolean; onChange: (c: Content) => void };

export function DoiDiemForm({ content, base, errs, readOnly, onChange }: Props) {
  const setPolicy = (i: number, p: Partial<Policy>) => onChange({ ...content, policies: content.policies.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const published = new Set((base?.policies ?? []).map((p) => p.code.toUpperCase()));
  const rows = content.policies.map((p, i) => ({ p, i })).filter(({ p }) => p.type === 5 || p.type === 6);
  const tierOpts = content.tiers.map((t) => <option key={t.key} value={t.key}>{t.name}</option>);
  return (
    <Box title="Danh mục đổi điểm" actions={!readOnly && [5, 6].map((t) => (
      <button key={t} type="button" className="btn btn-xs" onClick={() => onChange({ ...content, policies: [...content.policies, newPolicy(t, content.policies)] })}>+ {TYPE_LABEL[t]}</button>
    ))}>
      <Err errs={errs} path="policies" />
      {!rows.length && <span className="muted">Chưa có danh mục đổi điểm.</span>}
      {rows.map(({ p, i }) => {
        const at = `policies.${i}`;
        const rewards = arr(rec(p.rules.rules).rewards);
        const isPublished = published.has(p.code.toUpperCase());
        return (
          <div key={`${p.id}-${i}`} className="card card-body" style={{ display: 'grid', gap: 8, margin: 0 }}>
            <Row>
              <Lbl text="Loại"><span className="badge badge-info">{TYPE_LABEL[p.type]}</span></Lbl>
              <Lbl text="Mã (*)"><TextIn errs={errs} path={`${at}.code`} value={p.code} width={120} disabled={readOnly || isPublished} onChange={(v) => setPolicy(i, { code: v })} /></Lbl>
              <Lbl text="Tên (*)"><TextIn errs={errs} path={`${at}.title`} value={p.title} width={220} disabled={readOnly} onChange={(v) => setPolicy(i, { title: v })} /></Lbl>
              <Lbl text="Đang chạy"><input type="checkbox" checked={p.status === 1} disabled={readOnly} onChange={(e) => setPolicy(i, { status: e.target.checked ? 1 : 0 })} /></Lbl>
              <Lbl text="Ưu tiên" tip="Số nhỏ hiện trước ở máy bán"><NumIn errs={errs} path={`${at}.priority`} value={p.priority} width={60} disabled={readOnly} onChange={(v) => setPolicy(i, { priority: v })} /></Lbl>
              <Lbl text="Tự động áp" tip="Bỏ tích = máy bán không đưa danh mục này ra để đổi"><input type="checkbox" checked={p.autoApply !== false} disabled={readOnly} onChange={(e) => setPolicy(i, { autoApply: e.target.checked })} /></Lbl>
              <Lbl text="Từ ngày"><input className="input" type="date" value={startToDay(p.startDate)} disabled={readOnly} onChange={(e) => setPolicy(i, { startDate: dayToStart(e.target.value) })} /></Lbl>
              <Lbl text="Ngừng từ ngày" tip="Danh mục đã phát hành không xoá — đặt ngày ngừng"><input className="input" type="date" value={endToStopDay(p.endDate)} disabled={readOnly} onChange={(e) => setPolicy(i, { endDate: stopDayToEnd(e.target.value) })} /></Lbl>
              {!readOnly && !isPublished && <button type="button" className="btn btn-xs" onClick={() => onChange({ ...content, policies: content.policies.filter((_, j) => j !== i) })}>Bỏ</button>}
            </Row>
            <Lines errs={errs} at={`${at}.rules.rules.rewards`} rows={rewards} readOnly={readOnly}
              onChange={(list) => setPolicy(i, { rules: { ...p.rules, rules: { ...rec(p.rules.rules), rewards: list } } })}
              blank={p.type === 5 ? { reward_code: '', name: '', sku: '', quantity: 1, points_required: 100, status: 1 } : { reward_code: '', name: '', points_required: 100, discount_type: 'fixed', discount_value: 50000, expires_in_days: 30, status: 1 }}
              render={(x, j, set) => {
                const w = `${at}.rules.rules.rewards.${j}`;
                return (
                  <>
                    <Lbl text="Mã thưởng (*)"><TextIn errs={errs} path={`${w}.reward_code`} value={String(x.reward_code ?? '')} width={100} disabled={readOnly} onChange={(v) => set({ reward_code: v })} /></Lbl>
                    <Lbl text="Tên (*)"><TextIn errs={errs} path={`${w}.name`} value={String(x.name ?? '')} width={180} disabled={readOnly} onChange={(v) => set({ name: v })} /></Lbl>
                    <Lbl text="Điểm cần (*)"><NumIn errs={errs} path={`${w}.points_required`} value={Number(x.points_required ?? 0)} width={80} disabled={readOnly} onChange={(v) => set({ points_required: v })} /></Lbl>
                    <Lbl text="Hạng tối thiểu">
                      <span><select className="input" name={`${w}.min_tier`} value={String(x.min_tier ?? '')} disabled={readOnly} onChange={(e) => set({ min_tier: e.target.value || undefined })}>
                        <option value="">(mọi hạng)</option>{tierOpts}
                      </select><Err errs={errs} path={`${w}.min_tier`} /></span>
                    </Lbl>
                    {p.type === 5 ? (
                      <>
                        <Lbl text="Mã hàng quà (*)" tip="Chỉ mặt hàng đang dùng; chưa có thì khai ở Danh mục mặt hàng"><span><ItemPicker value={String(x.sku ?? '')} disabled={readOnly} onChange={(v) => set({ sku: v })} /><Err errs={errs} path={`${w}.sku`} /></span></Lbl>
                        <Lbl text="Số lượng"><NumIn errs={errs} path={`${w}.quantity`} value={Number(x.quantity ?? 1)} width={60} disabled={readOnly} onChange={(v) => set({ quantity: v })} /></Lbl>
                        <Lbl text="Theo dõi tồn" tip="Tích = quà tính vào tồn kho quà (như cột Tracking của plugin cũ)"><input type="checkbox" checked={Number(x.is_tracking ?? 0) === 1} disabled={readOnly} onChange={(e) => set({ is_tracking: e.target.checked ? 1 : 0 })} /></Lbl>
                      </>
                    ) : (
                      <>
                        <Lbl text="Số lượng" tip="Số voucher phát mỗi lần đổi"><NumIn errs={errs} path={`${w}.quantity`} value={Number(x.quantity ?? 1)} width={60} disabled={readOnly} onChange={(v) => set({ quantity: v })} /></Lbl>
                        <Lbl text="Kiểu giảm"><select className="input" value={String(x.discount_type ?? 'fixed')} disabled={readOnly} onChange={(e) => set({ discount_type: e.target.value })}><option value="fixed">Số tiền</option><option value="percent">%</option></select></Lbl>
                        <Lbl text="Giá trị (*)"><NumIn errs={errs} path={`${w}.discount_value`} value={Number(x.discount_value ?? 0)} width={100} disabled={readOnly} onChange={(v) => set({ discount_value: v })} /></Lbl>
                        <Lbl text="Giảm tối đa"><NumIn errs={errs} path={`${w}.max_discount`} value={Number(x.max_discount ?? 0)} width={100} disabled={readOnly} onChange={(v) => set({ max_discount: v })} /></Lbl>
                        <Lbl text="Đơn tối thiểu"><NumIn errs={errs} path={`${w}.min_order_amount`} value={Number(x.min_order_amount ?? 0)} width={100} disabled={readOnly} onChange={(v) => set({ min_order_amount: v })} /></Lbl>
                        <Lbl text="Hiệu lực (ngày)"><NumIn errs={errs} path={`${w}.expires_in_days`} value={Number(x.expires_in_days ?? 0)} width={60} disabled={readOnly} onChange={(v) => set({ expires_in_days: v })} /></Lbl>
                        <Lbl text="Tiền tố mã"><TextIn errs={errs} path={`${w}.voucher_prefix`} value={String(x.voucher_prefix ?? '')} width={80} disabled={readOnly} onChange={(v) => set({ voucher_prefix: v })} /></Lbl>
                      </>
                    )}
                  </>
                );
              }} />
          </div>
        );
      })}
    </Box>
  );
}
