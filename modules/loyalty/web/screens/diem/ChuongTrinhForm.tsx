// [2026-11-25 09:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-039: thẻ Chương trình (L1) — chính sách tích loại 1–4, đủ trường như plugin cũ (đóng góp)
/**
 * Soạn chính sách TÍCH điểm của nháp (loại 1 theo tiền, 2 theo mã hàng, 3 nhân điểm, 4 thưởng theo mức đơn). Chính sách đã phát hành không
 * xoá được — chỉ "Ngừng từ ngày" (Q-DM-01); chính sách mới chưa phát hành thì bỏ được. Mã trùng chặn ở ô Mã (Q-DM-02). Lỗi ô từ máy chủ
 * tô đỏ đúng ô (đường dẫn policies.<i>.…, i = vị trí trong cả danh sách).
 */
import type { ReactNode } from 'react';
import { ItemPicker } from '@bizcity/ui-kit';
import { Box, Err, Lbl, NumIn, Row, TextIn } from './parts';
import { TYPE_LABEL, arr, dayToStart, endToStopDay, newPolicy, rec, startToDay, stopDayToEnd, type Content, type FieldErrors, type Policy, type Rules } from './model';

type Props = { content: Content; base: Content | null; errs: FieldErrors; readOnly: boolean; onChange: (c: Content) => void };

export function ChuongTrinhForm({ content, base, errs, readOnly, onChange }: Props) {
  const setPolicy = (i: number, p: Partial<Policy>) => onChange({ ...content, policies: content.policies.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const setRules = (i: number, r: Rules) => setPolicy(i, { rules: { ...content.policies[i]!.rules, ...r } });
  const published = new Set((base?.policies ?? []).map((p) => p.code.toUpperCase()));
  const rows = content.policies.map((p, i) => ({ p, i })).filter(({ p }) => p.type >= 1 && p.type <= 4);
  return (
    <Box title="Chính sách tích điểm" actions={!readOnly && [1, 2, 3, 4].map((t) => (
      <button key={t} type="button" className="btn btn-xs" onClick={() => onChange({ ...content, policies: [...content.policies, newPolicy(t, content.policies)] })}>+ {TYPE_LABEL[t]}</button>
    ))}>
      <Err errs={errs} path="policies" />
      {!rows.length && <span className="muted">Chưa có chính sách tích điểm — bấm "+ Theo tiền" để thêm (vd 1 điểm / 10.000đ, hạn 365 ngày).</span>}
      {rows.map(({ p, i }) => {
        const at = `policies.${i}`;
        const r = p.rules;
        const isPublished = published.has(p.code.toUpperCase());
        return (
          <div key={`${p.id}-${i}`} className="card" style={{ padding: 8, display: 'grid', gap: 6 }}>
            <Row>
              <Lbl text="Loại"><span className="badge badge-info">{TYPE_LABEL[p.type]}</span></Lbl>
              <Lbl text="Mã (*)" tip="Mã chính sách, không trùng trong cửa hàng"><TextIn errs={errs} path={`${at}.code`} value={p.code} width={120} disabled={readOnly || isPublished} onChange={(v) => setPolicy(i, { code: v })} /></Lbl>
              <Lbl text="Tên (*)"><TextIn errs={errs} path={`${at}.title`} value={p.title} width={240} disabled={readOnly} onChange={(v) => setPolicy(i, { title: v })} /></Lbl>
              <Lbl text="Ưu tiên" tip="Số nhỏ chạy trước"><NumIn errs={errs} path={`${at}.priority`} value={p.priority} width={60} disabled={readOnly} onChange={(v) => setPolicy(i, { priority: v })} /></Lbl>
              <Lbl text="Đang chạy"><input type="checkbox" checked={p.status === 1} disabled={readOnly} onChange={(e) => setPolicy(i, { status: e.target.checked ? 1 : 0 })} /></Lbl>
              <Lbl text="Từ ngày"><input className="input" type="date" value={startToDay(p.startDate)} disabled={readOnly} onChange={(e) => setPolicy(i, { startDate: dayToStart(e.target.value) })} /></Lbl>
              <Lbl text="Ngừng từ ngày" tip="Chính sách đã phát hành không xoá — đặt ngày ngừng (bản mới)">
                <span><input className="input" type="date" name={`${at}.endDate`} value={endToStopDay(p.endDate)} disabled={readOnly} onChange={(e) => setPolicy(i, { endDate: stopDayToEnd(e.target.value) })} /><Err errs={errs} path={`${at}.endDate`} /></span>
              </Lbl>
              <Lbl text="Hạn điểm (ngày)" tip="0 = không hết hạn"><NumIn errs={errs} path={`${at}.rules.point_expiry_days`} value={Number(r.point_expiry_days ?? 0)} width={70} disabled={readOnly} onChange={(v) => setRules(i, { point_expiry_days: v })} /></Lbl>
              <Lbl text="Đơn tối thiểu"><NumIn errs={errs} path={`${at}.rules.min_order_amount`} value={Number(r.min_order_amount ?? 0)} width={110} disabled={readOnly} onChange={(v) => setRules(i, { min_order_amount: v })} /></Lbl>
              <Lbl text="Trần điểm / đơn" tip="0 = không trần"><NumIn errs={errs} path={`${at}.rules.max_points_per_order`} value={Number(r.max_points_per_order ?? 0)} width={70} disabled={readOnly} onChange={(v) => setRules(i, { max_points_per_order: v })} /></Lbl>
              {!readOnly && !isPublished && <button type="button" className="btn btn-xs" title="Chính sách chưa phát hành — bỏ được" onClick={() => onChange({ ...content, policies: content.policies.filter((_, j) => j !== i) })}>Bỏ</button>}
            </Row>
            {(p.type === 1 || p.type === 3) && (
              <Row>
                <Lbl text="Số điểm (*)"><NumIn errs={errs} path={`${at}.rules.earn_rate`} value={Number(r.earn_rate ?? 0)} width={70} disabled={readOnly} onChange={(v) => setRules(i, { earn_rate: v })} /></Lbl>
                <Lbl text="cho mỗi số tiền (*)"><NumIn errs={errs} path={`${at}.rules.earn_unit`} value={Number(r.earn_unit ?? 0)} width={110} disabled={readOnly} onChange={(v) => setRules(i, { earn_unit: v })} /></Lbl>
                {p.type === 3 && <Lbl text="Nhân (×)" tip="Điểm thêm = điểm theo tiền × (hệ số − 1)"><NumIn errs={errs} path={`${at}.rules.rules.multiplier`} value={Number(rec(r.rules).multiplier ?? 2)} width={60} disabled={readOnly} onChange={(v) => setRules(i, { rules: { multiplier: v } })} /></Lbl>}
              </Row>
            )}
            {p.type === 2 && (
              <Lines errs={errs} at={`${at}.rules.rules`} rows={arr(r.rules)} readOnly={readOnly} onChange={(rows) => setRules(i, { rules: rows })}
                blank={{ sku: '', points: 1 }} render={(x, j, set) => (
                  <>
                    <Lbl text="Mã hàng (*)"><span><ItemPicker value={String(x.sku ?? '')} disabled={readOnly} onChange={(v) => set({ sku: v })} /><Err errs={errs} path={`${at}.rules.rules.${j}.sku`} /></span></Lbl>
                    <Lbl text="Điểm / đơn vị (*)"><NumIn errs={errs} path={`${at}.rules.rules.${j}.points`} value={Number(x.points ?? 0)} disabled={readOnly} onChange={(v) => set({ points: v })} /></Lbl>
                  </>
                )} />
            )}
            {p.type === 4 && (
              <Lines errs={errs} at={`${at}.rules.rules`} rows={arr(r.rules)} readOnly={readOnly} onChange={(rows) => setRules(i, { rules: rows })}
                blank={{ min_amount: 1000000, bonus_points: 10 }} render={(x, j, set) => (
                  <>
                    <Lbl text="Đơn từ (đồng)"><NumIn errs={errs} path={`${at}.rules.rules.${j}.min_amount`} value={Number(x.min_amount ?? 0)} width={120} disabled={readOnly} onChange={(v) => set({ min_amount: v })} /></Lbl>
                    <Lbl text="Thưởng (điểm) (*)"><NumIn errs={errs} path={`${at}.rules.rules.${j}.bonus_points`} value={Number(x.bonus_points ?? 0)} disabled={readOnly} onChange={(v) => set({ bonus_points: v })} /></Lbl>
                  </>
                )} />
            )}
          </div>
        );
      })}
    </Box>
  );
}

/** Bảng dòng con (mã hàng / mức đơn): thêm, bỏ, sửa từng dòng. */
export function Lines({ errs, at, rows, readOnly, onChange, blank, render }: {
  errs: FieldErrors; at: string; rows: Rules[]; readOnly: boolean; onChange: (rows: Rules[]) => void; blank: Rules;
  render: (x: Rules, j: number, set: (p: Rules) => void) => ReactNode;
}) {
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <Err errs={errs} path={at} />
      {rows.map((x, j) => (
        <Row key={j}>
          {render(x, j, (p) => onChange(rows.map((y, k) => (k === j ? { ...y, ...p } : y))))}
          {!readOnly && <button type="button" className="btn btn-xs" onClick={() => onChange(rows.filter((_, k) => k !== j))}>Bỏ dòng</button>}
        </Row>
      ))}
      {!readOnly && <div><button type="button" className="btn btn-xs" onClick={() => onChange([...rows, { ...blank }])}>+ Thêm dòng</button></div>}
    </div>
  );
}
