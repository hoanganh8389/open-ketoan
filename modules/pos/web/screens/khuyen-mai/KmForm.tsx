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
// [2026-11-25 10:50 PM Võ Hoàng] NGHIEM-THU — NT-BH-040: ba loại @2 — bảng nhiều mã (K1), mã mua + quà lựa chọn (K2), nhân bội số (K4), chọn nhóm / nhãn (K3); hỏi trước khi bỏ thay đổi (đóng góp)
import { useState, type ReactNode } from 'react';
import { BranchCheckList, DocSheet, DocSheetPanel, ErrorBox, Field, Loading, Modal, errorText, useApi, useMutation, useQuery } from '@bizcity/ui-kit';
import { M } from '../../lib';
import { OverlapList, type Overlap } from './Drafts';
import { KIND_INFO, V2_KINDS, emptyPriceLine, toParams, toQuota, type Form, type PriceLineForm, type TierMode } from './model';

type ItemClass = { code: string; name: string; isActive: boolean };
/**
 * Chọn nhiều nhóm hàng / nhãn hàng (K3): chỉ mã phân loại đang dùng (Q-CHUNG-08, không thêm tại chỗ — khai ở Danh mục).
 * Mã đã chọn mà nay ngừng dùng vẫn hiện (gạch) để người khai bỏ đi.
 */
function ClassPicker({ kind, value, onChange, label }: { kind: 'group' | 'brand'; value: string[]; onChange: (v: string[]) => void; label: string }) {
  const api = useApi();
  const [q, setQ] = useState('');
  const all = useQuery({ queryKey: ['km', 'item-classes', kind], queryFn: () => api.get<ItemClass[]>(`/api/v1/item-classes/${kind}`), staleTime: 60_000 });
  const rows = all.data ?? [];
  const name = (c: string) => rows.find((r) => r.code === c);
  const t = q.trim().toLowerCase();
  const hits = rows.filter((r) => r.isActive && !value.includes(r.code) && (!t || r.code.toLowerCase().includes(t) || r.name.toLowerCase().includes(t))).slice(0, 30);
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
        {value.length ? value.map((c) => {
          const r = name(c);
          return <span key={c} className={`badge ${r && !r.isActive ? 'badge-warn' : 'badge-info'}`} title={r && !r.isActive ? 'Mã này đã ngừng dùng ở danh mục — nên bỏ' : ''}>
            {c}{r ? ` · ${r.name}` : ''}{r && !r.isActive ? ' (ngừng)' : ''} <button type="button" className="btn btn-xs" aria-label={`Bỏ ${c}`} onClick={() => onChange(value.filter((x) => x !== c))}>×</button></span>;
        }) : <span className="muted">Chưa chọn {label}</span>}
      </div>
      <input className="input" style={{ width: 260 }} value={q} placeholder={`Tìm ${label} theo mã / tên`} onChange={(e) => setQ(e.target.value)} />
      {all.isLoading ? <Loading /> : all.error ? <ErrorBox error={errorText(all.error)} /> : t && (
        <div style={{ maxHeight: 160, overflow: 'auto', border: '1px solid var(--line, #ddd)', borderRadius: 4, padding: 4 }}>
          {hits.length ? hits.map((r) => <div key={r.code}><button type="button" className="btn btn-xs" onClick={() => { onChange([...value, r.code]); setQ(''); }}>+ {r.code} · {r.name}</button></div>)
            : <span className="muted">Không có {label} đang dùng khớp "{q.trim()}"</span>}
        </div>
      )}
    </div>
  );
}

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
  // Q-CHUNG-07: rời form khi còn thay đổi chưa lưu thì hỏi trước.
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const close = () => { if (!dirty || window.confirm('Còn thay đổi chưa lưu — bỏ thay đổi và đóng? (Bấm Huỷ để quay lại, rồi Lưu nháp)')) onClose(); };
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
  const scopeText = [f.groupCodes.length && `nhóm ${f.groupCodes.join(', ')}`, f.brandCodes.length && `nhãn ${f.brandCodes.join(', ')}`].filter(Boolean).map((x) => ` · ${x}`).join('');
  const isV2 = V2_KINDS.includes(f.kind);
  const setLine = (i: number, p: Partial<PriceLineForm>) => set({ priceLines: f.priceLines.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const modeSel = (v: TierMode, on: (m: TierMode) => void) => (
    <select className="input" value={v} onChange={(e) => on(e.target.value as TierMode)}>
      <option value="pct">giảm %</option><option value="unitPrice">giá chương trình / cái</option><option value="amountPerUnit">giảm tiền / cái</option>
    </select>
  );
  const reward = (() => {
    switch (f.kind) {
      case 'tiered': return `${f.tiers.length} bậc theo ${f.basis === 'qty' ? 'số lượng' : 'tiền hàng của nhóm'} · nhóm ${skuCount(f.skus)} mã`;
      case 'order_discount': return `${f.orderTiers.length} bậc theo tổng đơn${skuCount(f.skus) ? ` · chỉ tính ${skuCount(f.skus)} mã` : ''}`;
      case 'order_gift': return `${f.giftTiers.length} bậc quà theo tổng đơn${skuCount(f.skus) ? ` · chỉ tính ${skuCount(f.skus)} mã` : ''}`;
      case 'combo': return `Bộ ${f.items.filter((x) => x.sku.trim()).length} món · ${f.comboMode === 'comboPrice' ? 'giá cả bộ' : f.comboMode === 'discountPct' ? 'giảm % cả bộ' : 'giảm tiền / bộ'} ${f.comboValue || '…'}`;
      case 'cheapest_free': return `Mua ${f.buyQty || '…'} tặng ${f.freeQty || '…'} món rẻ nhất · nhóm ${skuCount(f.skus)} mã${f.repeat ? ' · lặp lại' : ''}`;
      case 'buy_x_get_y': return `Mua ${f.buy.sku || '…'} × ${f.buy.qty || '…'} tặng ${f.get.sku || '…'} × ${f.get.qty || '…'}${f.repeat ? ' · lặp lại' : ''}`;
      case 'price_lines': return `${f.priceLines.filter((x) => x.sku.trim()).length} mã, mỗi mã một mức riêng${scopeText}`;
      case 'buy_x_get_y2': {
        const items = f.buyItems.filter((x) => x.sku.trim()).map((x) => x.sku.trim());
        const buy = f.buyMode === 'all' ? `mua đủ ${items.join(' và ') || '…'}` : `mua ${f.buyTotal || '…'} trong ${items.join(', ') || 'phạm vi'}`;
        return `${buy} · chọn ${f.choose || '…'} trong ${f.giftOptions.filter((x) => x.sku.trim()).length} quà${f.repeat ? ' · lặp lại' : ''}${scopeText}`;
      }
      case 'order_gift2': return `${f.giftTiers.length} bậc quà theo tổng đơn${f.multiply ? ` · nhân bội số${f.maxTimes.trim() ? `, tối đa ${f.maxTimes.trim()} lần` : ''}` : ''}${scopeText}`;
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
      onClose={close}
      sideTitle="Trợ lý khuyến mại"
      keys="Ctrl + S - Lưu và gửi duyệt · Esc - Thoát"
      footNote={publish.error ? <span className="mh-bad">{errorText(publish.error)}</span> : problems.length > 0 ? <span className="muted">Chưa lưu được: {problems.join(' · ')}</span> : null}
      footer={<>
        <button type="button" className="btn" disabled={problems.length > 0 || publish.isPending} title={problems.join('; ')} onClick={() => publish.mutate(false)}>Lưu nháp</button>
        <button type="button" className="btn btn-primary" disabled={problems.length > 0 || publish.isPending} title={problems.join('; ')} onClick={() => publish.mutate(true)}>Lưu và gửi duyệt</button>
        <button type="button" className="btn" onClick={close}>Đóng</button>
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
        {f.kind === 'price_lines' && (
          <Box title="Các mã và mức giảm riêng">
            <Row>Xét bậc theo <select className="input" value={f.basis} onChange={(e) => set({ basis: e.target.value as Form['basis'] })}><option value="qty">số lượng của mã</option><option value="amount">tiền hàng của mã</option></select>
              <span className="muted">(mỗi mã một dòng: một mức giảm, hoặc bảng bậc riêng của mã đó)</span></Row>
            {f.priceLines.map((x, i) => (
              <div key={i} style={{ display: 'grid', gap: 4, borderBottom: '1px dashed var(--line, #ddd)', paddingBottom: 6 }}>
                <Row>
                  <b>{i + 1}.</b> Mã {inp(x.sku, (v) => setLine(i, { sku: v }), 150)}
                  <label><input type="checkbox" checked={x.useTiers} onChange={(e) => setLine(i, { useTiers: e.target.checked })} /> theo bậc</label>
                  {!x.useTiers && <>{modeSel(x.mode, (m) => setLine(i, { mode: m }))}{inp(x.value, (v) => setLine(i, { value: v }))}</>}
                  Tối đa {inp(x.maxQty, (v) => setLine(i, { maxQty: v }), 80, 'không giới hạn')} cái / phiếu
                  {f.priceLines.length > 1 && <button type="button" className="btn btn-xs" title="Bỏ mã" onClick={() => set({ priceLines: f.priceLines.filter((_, j) => j !== i) })}>×</button>}
                </Row>
                {x.useTiers && rows(x.tiers, (t, k) => <>Từ {inp(t.min, (v) => setLine(i, { tiers: x.tiers.map((y, j) => (j === k ? { ...y, min: v } : y)) }), 110, f.basis === 'qty' ? 'số cái' : 'số tiền')}
                  {modeSel(t.mode, (m) => setLine(i, { tiers: x.tiers.map((y, j) => (j === k ? { ...y, mode: m } : y)) }))}
                  {inp(t.value, (v) => setLine(i, { tiers: x.tiers.map((y, j) => (j === k ? { ...y, value: v } : y)) }))}</>,
                () => setLine(i, { tiers: [...x.tiers, { min: '', mode: 'pct', value: '' }] }), (k) => setLine(i, { tiers: x.tiers.filter((_, j) => j !== k) }))}
              </div>
            ))}
            <div><button type="button" className="btn btn-xs" onClick={() => set({ priceLines: [...f.priceLines, emptyPriceLine()] })}>+ Thêm mã</button></div>
          </Box>
        )}
        {f.kind === 'buy_x_get_y2' && (
          <Box title="Phần mua và quà lựa chọn">
            <Row>Cách tính <select className="input" value={f.buyMode} onChange={(e) => set({ buyMode: e.target.value as Form['buyMode'] })}>
              <option value="any">mua bất kỳ trong các mã (gộp số lượng)</option><option value="all">mua đủ từng mã</option></select>
              {f.buyMode === 'any' && <>tổng số lượng {inp(f.buyTotal, (v) => set({ buyTotal: v }), 70)}</>}</Row>
            {rows(f.buyItems, (t, i) => <>Mã mua {inp(t.sku, (v) => set({ buyItems: f.buyItems.map((x, j) => (j === i ? { ...x, sku: v } : x)) }), 160)}
              {f.buyMode === 'all' && <>SL {inp(t.qty, (v) => set({ buyItems: f.buyItems.map((x, j) => (j === i ? { ...x, qty: v } : x)) }), 70)}</>}</>,
            () => set({ buyItems: [...f.buyItems, { sku: '', qty: '' }] }), (i) => set({ buyItems: f.buyItems.filter((_, j) => j !== i) }))}
            <span className="muted">Để trống mã mua = mua bất kỳ hàng trong phạm vi nhóm / nhãn bên dưới.</span>
            {rows(f.giftOptions, (t, i) => <>Quà {inp(t.sku, (v) => set({ giftOptions: f.giftOptions.map((x, j) => (j === i ? { ...x, sku: v } : x)) }), 160)}
              SL {inp(t.qty, (v) => set({ giftOptions: f.giftOptions.map((x, j) => (j === i ? { ...x, qty: v } : x)) }), 70)}</>,
            () => set({ giftOptions: [...f.giftOptions, { sku: '', qty: '1' }] }), (i) => set({ giftOptions: f.giftOptions.filter((_, j) => j !== i) }))}
            <Row>Khách chọn {inp(f.choose, (v) => set({ choose: v }), 50)} món trong {f.giftOptions.filter((x) => x.sku.trim()).length} quà
              <span className="muted">(bằng số quà = tặng hết, không cần chọn; ít hơn = máy bán hiện hộp "Chọn quà tặng")</span></Row>
            <Row><label><input type="checkbox" checked={f.repeat} onChange={(e) => set({ repeat: e.target.checked })} /> lặp lại (đủ mấy lần tặng mấy lần)</label> Trần quà / phiếu {inp(f.maxGiftQty, (v) => set({ maxGiftQty: v }), 80, 'không trần')}</Row>
          </Box>
        )}
        {f.kind === 'order_gift2' && (
          <Box title="Quà theo tổng đơn">
            {rows(f.giftTiers, (t, i) => <>Đơn từ {inp(t.minOrder, (v) => set({ giftTiers: f.giftTiers.map((x, j) => (j === i ? { ...x, minOrder: v } : x)) }), 130)} tặng {inp(t.gifts, (v) => set({ giftTiers: f.giftTiers.map((x, j) => (j === i ? { ...x, gifts: v } : x)) }), 280, 'QUA01:1, QUA02:2')}</>,
            () => set({ giftTiers: [...f.giftTiers, { minOrder: '', gifts: '' }] }), (i) => set({ giftTiers: f.giftTiers.filter((_, j) => j !== i) }))}
            <Row><label><input type="checkbox" checked={f.multiply} onChange={(e) => set({ multiply: e.target.checked })} /> nhân bội số (đủ 2 lần ngưỡng tặng 2 lần quà)</label>
              {f.multiply && <>tối đa {inp(f.maxTimes, (v) => set({ maxTimes: v }), 70, 'không giới hạn')} lần / phiếu</>}</Row>
          </Box>
        )}
        {isV2 && (
          <Box title="Phạm vi (không bắt buộc)">
            {f.kind !== 'price_lines' && <Field label="Mã hàng lẻ" hint="Cách nhau dấu phẩy"><textarea className="input" rows={2} value={f.skus} onChange={(e) => set({ skus: e.target.value })} /></Field>}
            <Field label="Nhóm hàng" hint="Gồm cả nhóm con"><ClassPicker kind="group" label="nhóm hàng" value={f.groupCodes} onChange={(v) => set({ groupCodes: v })} /></Field>
            <Field label="Nhãn hàng"><ClassPicker kind="brand" label="nhãn hàng" value={f.brandCodes} onChange={(v) => set({ brandCodes: v })} /></Field>
            <span className="muted">Dòng thuộc phạm vi khi mã nằm trong mã lẻ, hoặc khớp cả nhóm và nhãn đã chọn. Máy chủ tự tra nhóm / nhãn của mặt hàng ở danh mục. Không chọn gì = mọi mặt hàng.</span>
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
