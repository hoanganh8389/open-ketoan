/**
 * Hộp khai báo / sửa một khuyến mại (BH18, NT-BH-016): ô chung (mã, áp từ ngày, cửa hàng, thời gian chiến dịch, điều kiện, ưu tiên, áp riêng, trần
 * NĐ81) + phần riêng của từng loại. Phát hành = POST /api/v1/policies (Core kiểm lại nội dung, lỗi hiện nguyên câu của Core).
 * 18/11 (NT-BH-025): Lưu = BẢN NHÁP ở module pos (chưa áp); người có quyền Duyệt khuyến mại duyệt rồi mới phát hành. Khai hạn mức lượt theo
 * cửa hàng. Lưu xong hiện cảnh báo chương trình trùng (cùng mã hàng, cùng cửa hàng, giao thời gian) — chỉ cảnh báo.
 * NT-BH-037: khung phiếu `DocSheet` cùng mẫu phiếu mua — khối đầu (mã, loại, ngày áp, thời gian chiến dịch, tên, cửa hàng), thân theo loại,
 * cột Trợ lý (Kiểm tra, Tóm tắt, Trùng chương trình). Dữ liệu gửi, lời gọi API giữ nguyên.
 */
// [2026-11-14 01:10 AM Võ Hoàng] NGHIEM-THU — NT-BH-016: form khuyến mại 6 loại (đóng góp)
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-025: lưu nháp + gửi duyệt, hạn mức lượt, cảnh báo trùng (đóng góp)
// [2026-11-22 Võ Hoàng] NGHIEM-THU — NT-BH-037: form khuyến mại dựng lại bằng DocSheet cùng mẫu phiếu mua (đóng góp)
import { useState, type ReactNode } from 'react';
import { BranchCheckList, DocSheet, DocSheetPanel, ErrorBox, Field, Loading, Modal, errorText, useApi, useMutation, useQuery } from '@bizcity/ui-kit';
import { M } from '../../lib';
import { OverlapList, type Overlap } from './Drafts';
import { KIND_INFO, toParams, toQuota, type Form, type TierMode } from './model';

const THU = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const Row = ({ children }: { children: ReactNode }) => <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>{children}</div>;
const Box = ({ title, children }: { title: string; children: ReactNode }) => (
  <fieldset style={{ border: '1px solid var(--line, #ddd)', borderRadius: 6, padding: '8px 10px', display: 'grid', gap: 8 }}><legend style={{ padding: '0 4px' }}><b>{title}</b></legend>{children}</fieldset>
);

export function KmForm({ initial, editing, draftId, onClose, onDone }: { initial: Form; editing: boolean; draftId?: string; onClose: () => void; onDone: (msg: string) => void }) {
  const api = useApi();
  const [f, setF] = useState<Form>(initial);
  const [warn, setWarn] = useState<{ msg: string; overlaps: Overlap[] } | null>(null);
  const set = (p: Partial<Form>) => setF((x) => ({ ...x, ...p }));
  const tp = toParams(f);
  const { params } = tp;
  const q = toQuota(f);
  const problems = [...tp.problems, ...q.problems];
  // Bản nháp đã lưu: đọc cảnh báo trùng đang có (cùng API hộp Duyệt); bản mới thì máy chủ báo khi Lưu.
  const ov = useQuery({ queryKey: ['km', 'overlaps', draftId], enabled: Boolean(draftId), queryFn: () => api.get<Overlap[]>(`${M}/promo/drafts/${draftId}/overlaps`) });
  const publish = useMutation({
    mutationFn: (submit: boolean) => {
      const body = {
        key: f.key.trim(), ruleContract: KIND_INFO[f.kind].contract, params, effectiveFrom: f.effectiveFrom, branchCodes: f.branchCodes,
        ...(f.reason.trim() ? { reason: f.reason.trim() } : {}), quota: q.quota, submit,
      };
      return draftId ? api.put<{ overlaps: Overlap[] }>(`${M}/promo/drafts/${draftId}`, body) : api.post<{ overlaps: Overlap[] }>(`${M}/promo/drafts`, body);
    },
    onSuccess: (r, submit) => {
      const msg = `Đã lưu nháp ${f.key.trim()}${submit ? ', đã gửi duyệt' : ''} — chưa áp ở máy bán cho tới khi được duyệt.`;
      if (r.overlaps.length) setWarn({ msg, overlaps: r.overlaps });
      else onDone(msg);
    },
  });
  if (warn) {
    return (
      <Modal title={`Đã lưu ${f.key.trim()} — có chương trình trùng`} onClose={() => onDone(warn.msg)} footer={<button type="button" className="btn btn-primary" onClick={() => onDone(warn.msg)}>Đã hiểu</button>}>
        <div style={{ gridColumn: '1 / -1', display: 'grid', gap: 8 }}>
          <span>{warn.msg}</span>
          <OverlapList overlaps={warn.overlaps} />
        </div>
      </Modal>
    );
  }
  const inp = (v: string, on: (s: string) => void, w = 110, ph = '') => <input className="input" style={{ width: w }} value={v} placeholder={ph} onChange={(e) => on(e.target.value)} />;
  const rows = <T,>(arr: T[], render: (x: T, i: number) => ReactNode, add: () => void, del: (i: number) => void) => (
    <>
      {arr.map((x, i) => <Row key={i}>{render(x, i)}{arr.length > 1 && <button type="button" className="btn btn-xs" title="Bỏ dòng" onClick={() => del(i)}>×</button>}</Row>)}
      <div><button type="button" className="btn btn-xs" onClick={add}>+ Thêm bậc / món</button></div>
    </>
  );

  const branchText = f.branchCodes.length ? f.branchCodes.join(', ') : 'Mọi cửa hàng';
  const skuCount = (s: string) => s.split(/[\s,;]+/).filter(Boolean).length;
  const reward = (() => {
    switch (f.kind) {
      case 'tiered': return `${f.tiers.length} bậc theo ${f.basis === 'qty' ? 'số lượng' : 'tiền hàng của nhóm'} · nhóm ${skuCount(f.skus)} mã`;
      case 'order_discount': return `${f.orderTiers.length} bậc theo tổng đơn${skuCount(f.skus) ? ` · chỉ tính ${skuCount(f.skus)} mã` : ''}`;
      case 'order_gift': return `${f.giftTiers.length} bậc quà theo tổng đơn${skuCount(f.skus) ? ` · chỉ tính ${skuCount(f.skus)} mã` : ''}`;
      case 'combo': return `Bộ ${f.items.filter((x) => x.sku.trim()).length} món · ${f.comboMode === 'comboPrice' ? 'giá cả bộ' : f.comboMode === 'discountPct' ? 'giảm % cả bộ' : 'giảm tiền / bộ'} ${f.comboValue || '…'}`;
      case 'cheapest_free': return `Mua ${f.buyQty || '…'} tặng ${f.freeQty || '…'} món rẻ nhất · nhóm ${skuCount(f.skus)} mã${f.repeat ? ' · lặp lại' : ''}`;
      case 'buy_x_get_y': return `Mua ${f.buy.sku || '…'} × ${f.buy.qty || '…'} tặng ${f.get.sku || '…'} × ${f.get.qty || '…'}${f.repeat ? ' · lặp lại' : ''}`;
      default: return '';
    }
  })();
  const quotaText = f.quotaPerBranch.trim() || f.quotaBranches.trim()
    ? [f.quotaPerBranch.trim() && `${f.quotaPerBranch.trim()} đơn / cửa hàng`, f.quotaBranches.trim() && `riêng ${f.quotaBranches.trim()}`].filter(Boolean).join(' · ')
    : 'Không giới hạn';

  return (
    <DocSheet
      title={`${editing ? 'Sửa' : 'Thêm'} khuyến mại${f.key.trim() ? ` ${f.key.trim()}` : ''}`}
      badges={<span className="badge badge-info">{KIND_INFO[f.kind].label}</span>}
      onClose={onClose}
      sideTitle="Trợ lý khuyến mại"
      keys="Ctrl + S - Lưu và gửi duyệt · Esc - Thoát"
      footNote={publish.error ? <span className="mh-bad">{errorText(publish.error)}</span> : problems.length > 0 ? <span className="muted">Chưa lưu được: {problems.join(' · ')}</span> : null}
      footer={<>
        <button type="button" className="btn" disabled={problems.length > 0 || publish.isPending} title={problems.join('; ')} onClick={() => publish.mutate(false)}>Lưu nháp</button>
        <button type="button" className="btn btn-primary" disabled={problems.length > 0 || publish.isPending} title={problems.join('; ')} onClick={() => publish.mutate(true)}>Lưu và gửi duyệt</button>
        <button type="button" className="btn" onClick={onClose}>Đóng</button>
      </>}
      side={<>
        <DocSheetPanel title="Kiểm tra" badge={problems.length ? <span className="badge badge-warn">{problems.length}</span> : <span className="badge badge-ok">ổn</span>}>
          {problems.length ? problems.map((p) => <div key={p} className="mh-check warn">⚠ {p}</div>)
            : <div className="mh-check ok">✓ Đủ thông tin — Lưu nháp hoặc Lưu và gửi duyệt</div>}
          <ol className="mh-guide" style={{ marginTop: 6 }}>
            <li><b>Lưu</b> là bản nháp — chưa áp ở máy bán</li>
            <li>Người có quyền Duyệt khuyến mại (không phải người lập) <b>duyệt</b> thì mới phát hành</li>
            <li>Máy bán áp từ <b>ngày áp dụng</b>; đổi về sau thì Sửa (bản mới), không xoá</li>
          </ol>
        </DocSheetPanel>
        <DocSheetPanel title="Tóm tắt">
          <div className="mh-kv">
            <span>Áp cho</span><span>{branchText}</span>
            <span>Áp từ ngày</span><span>{f.effectiveFrom || '—'}</span>
            <span>Chiến dịch</span><span>{f.validFrom || '…'} – {f.validTo || 'không hạn'}</span>
            <span>Hạn mức lượt</span><span>{quotaText}</span>
          </div>
          <div style={{ fontSize: 12.5, marginTop: 6 }}><span className="muted">Mức thưởng: </span>{reward}</div>
        </DocSheetPanel>
        <DocSheetPanel title="Trùng chương trình" badge={ov.data?.length ? <span className="badge badge-warn">{ov.data.length}</span> : undefined}>
          {!draftId ? <div className="muted" style={{ fontSize: 12 }}>Lưu xong máy chủ báo chương trình trùng (cùng mã hàng, cùng cửa hàng, giao thời gian) — chỉ cảnh báo.</div>
            : ov.isLoading ? <Loading /> : ov.error ? <ErrorBox error={errorText(ov.error)} /> : <OverlapList overlaps={ov.data ?? []} />}
          {draftId && <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>Theo bản nháp đã lưu; sửa xong bấm Lưu để kiểm lại.</div>}
        </DocSheetPanel>
      </>}>
      <p className="muted" style={{ margin: '0 0 8px' }}>{KIND_INFO[f.kind].hint}.</p>
      <div className="mh-head">
        <Field label="Mã khuyến mại (*)" hint="vd KM-TET-2026"><input className="input" value={f.key} disabled={editing} onChange={(e) => set({ key: e.target.value })} /></Field>
        <div className="span2"><Field label="Loại"><input className="input" value={KIND_INFO[f.kind].label} disabled title="Chọn loại lúc Thêm chương trình" /></Field></div>
        <Field label="Áp dụng từ ngày (*)"><input className="input" type="date" value={f.effectiveFrom} onChange={(e) => set({ effectiveFrom: e.target.value })} /></Field>
        <Field label="Chiến dịch từ ngày"><input className="input" type="date" value={f.validFrom} onChange={(e) => set({ validFrom: e.target.value })} /></Field>
        <Field label="đến ngày" hint="Trống = không hạn"><input className="input" type="date" value={f.validTo} onChange={(e) => set({ validTo: e.target.value })} /></Field>
        <div className="span4"><Field label="Tên / ghi chú" hint="Lưu ở lý do phát hành; lùi ngày áp về trước hôm nay phải ghi lý do"><input className="input" value={f.reason} onChange={(e) => set({ reason: e.target.value })} /></Field></div>
        <div className="span4"><Field label="Cửa hàng áp dụng" hint="Không chọn = mọi cửa hàng"><BranchCheckList value={f.branchCodes.join(',')} onChange={(v) => set({ branchCodes: v.split(',').filter(Boolean) })} /></Field></div>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {f.kind === 'tiered' && (
          <Box title="Nhóm hàng và các bậc">
            <Field label="Mã hàng trong nhóm (*)" hint="Cách nhau dấu phẩy"><textarea className="input" rows={2} value={f.skus} onChange={(e) => set({ skus: e.target.value })} /></Field>
            <Row>Tính bậc theo <select className="input" value={f.basis} onChange={(e) => set({ basis: e.target.value as Form['basis'] })}><option value="qty">số lượng</option><option value="amount">tiền hàng của nhóm</option></select></Row>
            {rows(f.tiers, (t, i) => <>Từ {inp(t.min, (v) => set({ tiers: f.tiers.map((x, j) => (j === i ? { ...x, min: v } : x)) }), 110, f.basis === 'qty' ? 'số cái' : 'số tiền')}
              <select className="input" value={t.mode} onChange={(e) => set({ tiers: f.tiers.map((x, j) => (j === i ? { ...x, mode: e.target.value as TierMode } : x)) })}>
                <option value="pct">giảm %</option><option value="unitPrice">giá chương trình / cái</option><option value="amountPerUnit">giảm tiền / cái</option>
              </select>{inp(t.value, (v) => set({ tiers: f.tiers.map((x, j) => (j === i ? { ...x, value: v } : x)) }))}</>,
            () => set({ tiers: [...f.tiers, { min: '', mode: 'pct', value: '' }] }), (i) => set({ tiers: f.tiers.filter((_, j) => j !== i) }))}
          </Box>
        )}
        {f.kind === 'order_discount' && (
          <Box title="Các bậc theo tổng đơn">
            <Field label="Chỉ tính các mã hàng" hint="Trống = cả đơn"><textarea className="input" rows={2} value={f.skus} onChange={(e) => set({ skus: e.target.value })} /></Field>
            {rows(f.orderTiers, (t, i) => <>Đơn từ {inp(t.minOrder, (v) => set({ orderTiers: f.orderTiers.map((x, j) => (j === i ? { ...x, minOrder: v } : x)) }), 130)}
              <select className="input" value={t.mode} onChange={(e) => set({ orderTiers: f.orderTiers.map((x, j) => (j === i ? { ...x, mode: e.target.value as 'pct' | 'amount' } : x)) })}><option value="pct">giảm %</option><option value="amount">giảm tiền</option></select>
              {inp(t.value, (v) => set({ orderTiers: f.orderTiers.map((x, j) => (j === i ? { ...x, value: v } : x)) }))} tối đa {inp(t.maxDiscount, (v) => set({ orderTiers: f.orderTiers.map((x, j) => (j === i ? { ...x, maxDiscount: v } : x)) }), 110, 'không trần')}</>,
            () => set({ orderTiers: [...f.orderTiers, { minOrder: '', mode: 'pct', value: '', maxDiscount: '' }] }), (i) => set({ orderTiers: f.orderTiers.filter((_, j) => j !== i) }))}
          </Box>
        )}
        {f.kind === 'order_gift' && (
          <Box title="Quà theo tổng đơn">
            <Field label="Chỉ tính các mã hàng" hint="Trống = cả đơn"><textarea className="input" rows={2} value={f.skus} onChange={(e) => set({ skus: e.target.value })} /></Field>
            {rows(f.giftTiers, (t, i) => <>Đơn từ {inp(t.minOrder, (v) => set({ giftTiers: f.giftTiers.map((x, j) => (j === i ? { ...x, minOrder: v } : x)) }), 130)} tặng {inp(t.gifts, (v) => set({ giftTiers: f.giftTiers.map((x, j) => (j === i ? { ...x, gifts: v } : x)) }), 280, 'QUA01:1, QUA02:2')}</>,
            () => set({ giftTiers: [...f.giftTiers, { minOrder: '', gifts: '' }] }), (i) => set({ giftTiers: f.giftTiers.filter((_, j) => j !== i) }))}
          </Box>
        )}
        {f.kind === 'combo' && (
          <Box title="Các món của một bộ">
            {rows(f.items, (t, i) => <>Mã {inp(t.sku, (v) => set({ items: f.items.map((x, j) => (j === i ? { ...x, sku: v } : x)) }), 160)} SL {inp(t.qty, (v) => set({ items: f.items.map((x, j) => (j === i ? { ...x, qty: v } : x)) }), 70)}</>,
            () => set({ items: [...f.items, { sku: '', qty: '1' }] }), (i) => set({ items: f.items.filter((_, j) => j !== i) }))}
            <Row><select className="input" value={f.comboMode} onChange={(e) => set({ comboMode: e.target.value as Form['comboMode'] })}><option value="comboPrice">giá cả bộ</option><option value="discountPct">giảm % cả bộ</option><option value="discountAmount">giảm tiền / bộ</option></select>
              {inp(f.comboValue, (v) => set({ comboValue: v }), 130)} Tối đa {inp(f.maxCombos, (v) => set({ maxCombos: v }), 70, 'không giới hạn')} bộ / phiếu</Row>
          </Box>
        )}
        {f.kind === 'cheapest_free' && (
          <Box title="Nhóm hàng">
            <Field label="Mã hàng trong nhóm (*)"><textarea className="input" rows={2} value={f.skus} onChange={(e) => set({ skus: e.target.value })} /></Field>
            <Row>Mua {inp(f.buyQty, (v) => set({ buyQty: v }), 60)} món tặng {inp(f.freeQty, (v) => set({ freeQty: v }), 60)} món rẻ nhất <label><input type="checkbox" checked={f.repeat} onChange={(e) => set({ repeat: e.target.checked })} /> lặp lại (mua 6 tặng 2…)</label></Row>
          </Box>
        )}
        {f.kind === 'buy_x_get_y' && (
          <Box title="Mua X tặng Y">
            <Row>Mua mã {inp(f.buy.sku, (v) => set({ buy: { ...f.buy, sku: v } }), 160)} SL {inp(f.buy.qty, (v) => set({ buy: { ...f.buy, qty: v } }), 70)} tặng mã {inp(f.get.sku, (v) => set({ get: { ...f.get, sku: v } }), 160)} SL {inp(f.get.qty, (v) => set({ get: { ...f.get, qty: v } }), 70)}</Row>
            <Row><label><input type="checkbox" checked={f.repeat} onChange={(e) => set({ repeat: e.target.checked })} /> lặp lại (mua 4 tặng 2…)</label> Trần quà / phiếu {inp(f.maxGiftQty, (v) => set({ maxGiftQty: v }), 80, 'không trần')}</Row>
          </Box>
        )}

        {f.kind !== 'buy_x_get_y' && (
          <Box title="Điều kiện và cách cộng">
            <Row>Thứ {THU.map((t, i) => <label key={t}><input type="checkbox" checked={f.weekdays.includes(i + 1)} onChange={(e) => set({ weekdays: e.target.checked ? [...f.weekdays, i + 1] : f.weekdays.filter((d) => d !== i + 1) })} /> {t}</label>)} <span className="muted">(không chọn = mọi ngày)</span></Row>
            <Row>Khung giờ <input className="input" type="time" value={f.timeFrom} onChange={(e) => set({ timeFrom: e.target.value })} /> – <input className="input" type="time" value={f.timeTo} onChange={(e) => set({ timeTo: e.target.value })} />
              Đơn tối thiểu {inp(f.minOrderAmount, (v) => set({ minOrderAmount: v }), 120)}</Row>
            <Row>Mã giảm giá {inp(f.couponCodes, (v) => set({ couponCodes: v }), 220, 'KM50K, TET26 (khách đọc một mã)')}
              <label><input type="checkbox" checked={f.birthdayMonth} onChange={(e) => set({ birthdayMonth: e.target.checked })} /> chỉ khách sinh nhật trong tháng</label>
              Hạng thành viên {inp(f.memberLevels, (v) => set({ memberLevels: v }), 160, 'VANG, BAC')}</Row>
            <Row>Ưu tiên <input className="input" type="number" style={{ width: 80 }} value={f.priority} onChange={(e) => set({ priority: Math.round(Number(e.target.value) || 0) })} /> <span className="muted">(lớn tính trước)</span>
              <label><input type="checkbox" checked={f.exclusive} onChange={(e) => set({ exclusive: e.target.checked })} /> áp riêng — dòng đã được khuyến mại này giảm thì khuyến mại sau không áp</label></Row>
            <Row>Trần khuyến mại (NĐ81) {inp(f.legalCapPct, (v) => set({ legalCapPct: v }), 70, '50')} % tiền dòng
              <label><input type="checkbox" checked={f.noCap} onChange={(e) => set({ noCap: e.target.checked })} /> miễn trần (người khai chịu trách nhiệm — ghi lý do ở ô ghi chú)</label></Row>
          </Box>
        )}
        <Box title="Hạn mức lượt theo cửa hàng (không bắt buộc)">
          <Row>Mỗi cửa hàng tối đa {inp(f.quotaPerBranch, (v) => set({ quotaPerBranch: v }), 90, 'không giới hạn')} đơn áp chương trình
            · riêng {inp(f.quotaBranches, (v) => set({ quotaBranches: v }), 220, 'CN01=2, CN02=5')}</Row>
          <span className="muted">Hết lượt: máy bán báo trước khi thanh toán và không nhận đơn còn áp chương trình này; phiếu bán BH10 không duyệt được. Trả cả đơn → trả lại lượt.</span>
        </Box>
      </div>
    </DocSheet>
  );
}
