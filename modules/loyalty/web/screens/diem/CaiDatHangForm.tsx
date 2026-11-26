// [2026-11-25 09:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-039: thẻ Cài đặt + hạng (L3) — cài đặt tích / đổi và bảng hạng (đóng góp)
/** Cài đặt (tích ở máy bán, đổi ở máy bán, nhân điểm theo hạng, điểm tối thiểu để đổi, tên gọi điểm) và bảng hạng (mã, tên, điểm tối thiểu, hệ số). */
import { Box, Err, Lbl, NumIn, Row, TextIn } from './parts';
import type { Content, FieldErrors, Settings, Tier } from './model';

type Props = { content: Content; errs: FieldErrors; readOnly: boolean; onChange: (c: Content) => void };

export function CaiDatHangForm({ content, errs, readOnly, onChange }: Props) {
  const s = content.settings;
  const setS = (p: Partial<Settings>) => onChange({ ...content, settings: { ...s, ...p } });
  const setT = (i: number, p: Partial<Tier>) => onChange({ ...content, tiers: content.tiers.map((t, j) => (j === i ? { ...t, ...p } : t)) });
  const check = (label: string, tip: string, key: 'enablePosEarn' | 'enablePosRedeem' | 'enableTierMultiplier') => (
    <label title={tip} style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={s[key]} disabled={readOnly} onChange={(e) => setS({ [key]: e.target.checked })} />{label}</label>
  );
  return (
    <>
      <Box title="Cài đặt">
        <Row>
          {check('Tích điểm ở máy bán', 'Tắt = đơn không tích điểm', 'enablePosEarn')}
          {check('Đổi điểm ở máy bán', 'Tắt = máy bán không cho đổi quà / voucher', 'enablePosRedeem')}
          {check('Nhân điểm theo hạng', 'Điểm tích × hệ số của hạng khách (làm tròn 2 số lẻ như plugin cũ)', 'enableTierMultiplier')}
        </Row>
        <Row>
          <Lbl text="Điểm tối thiểu để đổi"><NumIn errs={errs} path="settings.minRedeemPoints" value={s.minRedeemPoints} disabled={readOnly} onChange={(v) => setS({ minRedeemPoints: v })} /></Lbl>
          <Lbl text="Tên gọi điểm (*)"><TextIn errs={errs} path="settings.pointLabel" value={s.pointLabel} width={100} disabled={readOnly} onChange={(v) => setS({ pointLabel: v })} /></Lbl>
        </Row>
      </Box>
      <Box title="Bảng hạng" actions={!readOnly && <button type="button" className="btn btn-xs" onClick={() => onChange({ ...content, tiers: [...content.tiers, { key: '', name: '', minPoints: 0, multiplier: 1 }] })}>+ Thêm hạng</button>}>
        <Err errs={errs} path="tiers" />
        <span className="muted">Hạng theo TỔNG điểm đã tích (không theo số dư); đổi điểm không làm tụt hạng.</span>
        {content.tiers.map((t, i) => (
          <Row key={i}>
            <Lbl text="Mã hạng (*)"><TextIn errs={errs} path={`tiers.${i}.key`} value={t.key} width={100} disabled={readOnly} onChange={(v) => setT(i, { key: v })} /></Lbl>
            <Lbl text="Tên (*)"><TextIn errs={errs} path={`tiers.${i}.name`} value={t.name} width={140} disabled={readOnly} onChange={(v) => setT(i, { name: v })} /></Lbl>
            <Lbl text="Từ tổng điểm"><NumIn errs={errs} path={`tiers.${i}.minPoints`} value={t.minPoints} width={100} disabled={readOnly} onChange={(v) => setT(i, { minPoints: v })} /></Lbl>
            <Lbl text="Màu" tip="Màu nhãn hạng ở máy bán / báo cáo (như plugin cũ)"><input className="input" type="color" style={{ width: 48, padding: 2 }} value={t.color || '#6b7280'} disabled={readOnly} onChange={(e) => setT(i, { color: e.target.value })} /></Lbl>
            <Lbl text="Hệ số (×)"><NumIn errs={errs} path={`tiers.${i}.multiplier`} value={t.multiplier} width={70} disabled={readOnly} onChange={(v) => setT(i, { multiplier: v })} /></Lbl>
            {!readOnly && content.tiers.length > 1 && <button type="button" className="btn btn-xs" onClick={() => onChange({ ...content, tiers: content.tiers.filter((_, j) => j !== i) })}>Bỏ</button>}
          </Row>
        ))}
      </Box>
    </>
  );
}
