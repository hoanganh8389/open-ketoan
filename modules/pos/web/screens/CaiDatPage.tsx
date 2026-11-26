/**
 * BH17 Cài đặt bán hàng — một màn cho bán lẻ (NT-BH-008 §7, NT-BH-014; chữ chốt nghiep-vu/20):
 *   ① Máy bán tại quầy: hạn trả, bắt buộc mở ca, ca theo chi nhánh / máy, ngưỡng chênh lệch két (khoá bizcity.pos.*).
 *   ② Ghi sổ chứng từ bán: sale / sale_return ghi ngay hay chờ duyệt — GET / PUT /api/v1/settings/posting-modes của Core
 *      (PUT thay cả bảng → gộp với chế độ hiện có của loại chứng từ khác rồi mới gửi).
 *   ③ Chênh lệch két: bật lập phiếu kế toán khi chốt ca lệch; hai lý do loại journal CHỈ XEM (đọc GET /api/v1/posting/scheme) —
 *      cặp Nợ / Có khai ở Quy tắc hạch toán ACC41 (NT-BH-042). Module không ghi lý do, không giữ số tài khoản nào.
 *   ④ Tài khoản hạch toán bán hàng: loại nhóm "Bán hàng" của ACC41 (chỉ đọc), nút Sửa ở ACC41.
 *   ⑤ Giao hàng đơn đặt hàng (NT-BH-032): kho KHG, mã phí ship, COD theo hãng — khoá của module phieu-ban (GiaoHangCaiDat).
 * Khoá của module ghi qua đường chung PUT /api/v1/settings/values/:key (quyền settings:write; có phiên bản, ai đổi, lúc nào).
 */
// [2026-11-13 08:45 PM Võ Hoàng] NGHIEM-THU — NT-BH-014: BH17 gom 4 khối cài đặt bán hàng (đóng góp)
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-024 Q3: chọn kho KTL nhận hàng trả lỗi / hết hạn của từng cửa hàng (đóng góp)
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-027 số bill dạng shop (số kế thừa), NT-BH-028 kho quà KKM của từng cửa hàng (đóng góp)
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-030 Q3: hạn trả riêng từng cửa hàng; quá hạn → yêu cầu trả quá hạn duyệt ở BH14 (đóng góp)
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-027 (18/11 anh chốt): bỏ mục "Số bill theo dạng shop" — dạng shop mặc định, website tự báo số cuối (đóng góp)
// [2026-11-25 11:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-042: khối ③ bỏ ô Nợ / Có + gọi ghi lý do; dòng chỉ đọc + nút "Khai ở Quy tắc hạch toán" (đóng góp)
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ErrorBox, Field, Loading, PageHeader, errorText, useApi, useCan, useMutation, useQuery, useQueryClient } from '@bizcity/ui-kit';
import { M } from '../lib';
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-032: khối ⑤ Giao hàng đơn đặt hàng (đóng góp)
import { GiaoHangCaiDat } from './GiaoHangCaiDat';

type Values = {
  returnDays: number; requireOpenShift: boolean; shiftScope: 'branch' | 'device'; cashDiffAlert: number;
  cashDiffJournal: boolean; cashShortReason: string; cashOverReason: string;
  /** NT-BH-024: "<mã cửa hàng>=<mã kho KTL>" (khoá bizcity.pos.return_bad_warehouses). */
  returnBadWarehouses: string[];
  /** NT-BH-028: "<mã cửa hàng>=<mã kho KKM>" (khoá bizcity.pos.gift_warehouses). */
  giftWarehouses: string[];
  /** NT-BH-030 Q3: "<mã cửa hàng>=<số ngày>" hạn trả riêng (khoá bizcity.pos.return_days_by_shop). */
  returnDaysByShop: string[];
};
type Wh = { code: string; name: string; branchCode: string; branchName: string; isActive: boolean; isDefault?: boolean; typeCode: string };
/** So giá trị cài đặt (mảng so theo nội dung). */
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const toMap = (list: readonly string[]) => Object.fromEntries(list.map((x) => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
const fromMap = (m: Record<string, string>) => Object.entries(m).filter(([, w]) => w).sort(([a], [b]) => a.localeCompare(b)).map(([b, w]) => `${b}=${w}`);
type Resp = { values: Values; keys: Record<keyof Values, string> };
type Mode = 'auto' | 'approve';
// [2026-11-15 Nguyễn Văn Thủy] tài khoản bán hàng đọc từ Quy tắc hạch toán (ACC41) — bỏ Tài khoản ngầm định theo loại (đóng góp)
type SchemeLine = { side: 'debit' | 'credit'; role: string; source: string; key?: string; when?: string };
/** Lý do phiếu kế toán trên ACC41 (NT-BH-042): cặp Nợ / Có đang lưu, trạng thái từng bên. */
type SchemeReason = { code: string; name: string; exists: boolean; isActive: boolean; debitAccount: string | null; debitStatus: string; creditAccount: string | null; creditStatus: string };
type Scheme = {
  businesses: { code: string; name: string; groups: { name: string; lines: SchemeLine[] }[] }[];
  keys: { key: string; accountCode: string | null; accountName: string | null }[];
  reasons?: SchemeReason[];
};
const SOURCE_LABEL: Record<string, string> = { payment: 'theo hình thức thanh toán', warehouse: 'theo loại kho', tax: 'theo loại thuế', purpose: 'theo mục đích xuất' };
/** Màn ACC41 mở thẳng nghiệp vụ Chênh lệch két máy bán. */
const ACC41_CASH_DIFF = '/cau-hinh/quy-tac-hach-toan?nghiep-vu=pos_cash_diff';

const SALE_TYPES: [string, string][] = [['sale', 'Phiếu bán hàng (đơn máy POS, BH10)'], ['sale_return', 'Phiếu trả hàng (BH11, BH14)']];
// [2026-11-16 06:00 PM Võ Hoàng] NGHIEM-THU — NT-BH-021: công tắc chặn bán quá tồn của phiếu bán nhập tay (khoá của module phieu-ban, Q6) (đóng góp)
const PB_BLOCK = 'bizcity.phieu_ban.block_negative_stock';

function Block({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="card card-body" style={{ maxWidth: 760, display: 'grid', gap: 12 }}>
      <div><b>{title}</b><div className="muted">{hint}</div></div>
      {children}
    </section>
  );
}

export function CaiDatPage() {
  const api = useApi();
  const can = useCan();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['pos-admin', 'settings'], queryFn: () => api.get<Resp>(`${M}/admin/settings`) });
  const modesQ = useQuery({ queryKey: ['posting-modes'], queryFn: () => api.get<Record<string, Mode>>('/api/v1/settings/posting-modes') });
  const typesQ = useQuery({ queryKey: ['posting-scheme'], queryFn: () => api.get<Scheme>('/api/v1/posting/scheme') });
  const pbQ = useQuery({ queryKey: ['setting', PB_BLOCK], queryFn: () => api.get<{ value: unknown }>(`/api/v1/settings/values/${PB_BLOCK}`) });
  const whsQ = useQuery({ queryKey: ['warehouses'], queryFn: () => api.get<Wh[]>('/api/v1/warehouses') });
  const branches = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of whsQ.data ?? []) m.set(w.branchCode, w.branchName);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [whsQ.data]);
  const [pbBlock, setPbBlock] = useState(false);
  useEffect(() => { if (pbQ.data) setPbBlock(pbQ.data.value === true); }, [pbQ.data]);
  const [v, setV] = useState<Values | null>(null);
  const [modes, setModes] = useState<Record<string, Mode>>({});
  const [err, setErr] = useState<Partial<Record<keyof Values, string>>>({});
  useEffect(() => { if (q.data) setV(q.data.values); }, [q.data]);
  useEffect(() => { if (modesQ.data) setModes(modesQ.data); }, [modesQ.data]);

  const writable = can('settings:write');
  const save = useMutation({
    mutationFn: async () => {
      if (!q.data || !v) return;
      // Mã lý do (cash_short_reason / cash_over_reason) không sửa ở màn này (NT-BH-042 Q4) — giữ nguyên giá trị đang lưu.
      for (const k of Object.keys(v) as (keyof Values)[]) {
        if (!same(v[k], q.data.values[k])) await api.put(`/api/v1/settings/values/${encodeURIComponent(q.data.keys[k])}`, { key: q.data.keys[k], value: v[k] });
      }
      if (modesQ.data && SALE_TYPES.some(([t]) => modes[t] !== modesQ.data![t])) await api.put('/api/v1/settings/posting-modes', { ...modesQ.data, ...modes });
      if (pbQ.data && pbBlock !== (pbQ.data.value === true)) await api.put(`/api/v1/settings/values/${PB_BLOCK}`, { key: PB_BLOCK, value: pbBlock });
    },
    onSuccess: () => Promise.all([
      qc.invalidateQueries({ queryKey: ['pos-admin', 'settings'] }), qc.invalidateQueries({ queryKey: ['posting-modes'] }),
      qc.invalidateQueries({ queryKey: ['setting', PB_BLOCK] }),
    ]),
  });

  if (q.isLoading || !v) return q.error ? <ErrorBox error={errorText(q.error)} /> : <Loading />;
  const days = (s: string) => {
    const n = Number(s);
    setErr((e) => ({ ...e, returnDays: Number.isInteger(n) && n >= 0 && n <= 60 ? undefined : 'Từ 0 đến 60 ngày' }));
    setV({ ...v, returnDays: Number.isInteger(n) ? n : v.returnDays });
  };
  const changed = (q.data && (Object.keys(v) as (keyof Values)[]).some((k) => !same(v[k], q.data!.values[k])))
    || (modesQ.data && SALE_TYPES.some(([t]) => modes[t] !== modesQ.data![t]))
    || (pbQ.data && pbBlock !== (pbQ.data.value === true));
  const reset = () => { setV(q.data!.values); if (modesQ.data) setModes(modesQ.data); if (pbQ.data) setPbBlock(pbQ.data.value === true); setErr({}); };
  const saleBiz = (typesQ.data?.businesses ?? []).filter((b) => b.code === 'sale' || b.code === 'sale_return');
  const keyAcc = (k?: string) => typesQ.data?.keys.find((x) => x.key === k);
  const accText = (l: SchemeLine) => (l.source === 'rule' ? `${keyAcc(l.key)?.accountCode ?? '—'} ${keyAcc(l.key)?.accountName ?? ''}` : SOURCE_LABEL[l.source] ?? l.source);
  /** Dòng chỉ đọc của một hướng: mã lý do, "Nợ … / Có …" đang lưu trên lý do (ACC41), Đã khai / Chưa khai tài khoản. */
  const reasonRow = (label: string, code: string) => {
    const r = typesQ.data?.reasons?.find((x) => x.code === code);
    const ok = r?.exists && r.isActive && r.debitStatus === 'ok' && r.creditStatus === 'ok';
    return (
      <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ minWidth: 150 }}>{label} <span className="muted mono">({code})</span></span>
        {!typesQ.data ? <Loading /> : !r ? <span className="muted">Lý do {code} không có trên Quy tắc hạch toán — tài khoản xem ở API lý do</span> : (
          <>
            <span className="mono">{r.exists ? `Nợ ${r.debitAccount ?? '—'} / Có ${r.creditAccount ?? '—'}` : '—'}</span>
            {ok ? <span className="badge badge-ok">Đã khai</span> : <span className="badge badge-warn">Chưa khai tài khoản</span>}
          </>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <PageHeader title="Cài đặt bán hàng" code="BH17" subtitle="Một chỗ cho cài đặt bán lẻ: máy bán tại quầy, cách ghi sổ chứng từ bán, chênh lệch két, tài khoản hạch toán. Đổi có hiệu lực từ hôm nay, lưu lịch sử ai đổi lúc nào." />

      <Block title="① Máy bán tại quầy" hint="Áp cho mọi cửa hàng của đơn vị.">
        <Field label="Hạn trả hàng không cần duyệt (ngày, tính từ ngày bán)" hint={err.returnDays ?? 'Áp cho cả công ty; cửa hàng nào khác thì khai riêng ở bảng dưới. Quá hạn: máy bán gửi yêu cầu trả quá hạn, người có quyền "Duyệt trả quá hạn" (kế toán trưởng) duyệt ở BH14. Mặc định 3 ngày.'}>
          <input className={`input${err.returnDays ? ' input-error' : ''}`} type="number" min={0} max={60} value={v.returnDays} disabled={!writable} onChange={(e) => days(e.target.value)} />
        </Field>
        <Field label="Hạn trả riêng của cửa hàng" hint="Để trống = theo hạn công ty. Hạn tính theo cửa hàng nhận trả (trả được ở cửa hàng khác cùng MST chi nhánh).">
          {whsQ.error ? <ErrorBox error={errorText(whsQ.error)} /> : !whsQ.data ? <Loading /> : (
            <table className="grid">
              <thead><tr><th>Cửa hàng</th><th>Số ngày (0–60)</th></tr></thead>
              <tbody>{branches.map(([code, name]) => {
                const map = toMap(v.returnDaysByShop);
                return (
                  <tr key={code}><td>{code} — {name}</td><td>
                    <input className="input" type="number" min={0} max={60} style={{ width: 90 }} value={map[code] ?? ''} placeholder={String(v.returnDays)} disabled={!writable}
                      onChange={(e) => {
                        const n = e.target.value.trim();
                        const ok = n === '' || (Number.isInteger(Number(n)) && Number(n) >= 0 && Number(n) <= 60);
                        if (ok) setV({ ...v, returnDaysByShop: fromMap({ ...map, [code]: n === '' ? '' : String(Number(n)) }) });
                      }} />
                  </td></tr>
                );
              })}</tbody>
            </table>
          )}
        </Field>
        <Field label="Bán quá tồn" hint="Máy bán luôn chặn: dòng hàng thiếu tồn báo đỏ, không thanh toán được (NT-BH-021). Đơn bán lúc mất mạng gửi bù vẫn nhận, lọc ở Đơn bán máy POS.">
          <span>Luôn chặn</span>
        </Field>
        <Field label="Bắt buộc mở ca trước khi bán" hint="Chưa bật: máy bán vẫn nhận đơn khi chưa mở ca (ca theo ngày).">
          <input type="checkbox" checked={v.requireOpenShift} disabled={!writable} onChange={(e) => setV({ ...v, requireOpenShift: e.target.checked })} />
        </Field>
        <Field label="Ca bán" hint="Đợt này chỉ áp dụng một ca chung cho mỗi chi nhánh.">
          <select className="input" value={v.shiftScope} disabled={!writable} onChange={(e) => setV({ ...v, shiftScope: e.target.value as Values['shiftScope'] })}>
            <option value="branch">Một ca chung cho cả chi nhánh</option>
            <option value="device">Mỗi máy bán một ca</option>
          </select>
        </Field>
        <Field label="Ngưỡng chênh lệch két cần chú ý (đồng)" hint="Sổ ca bán tô đỏ ca có chênh lệch từ ngưỡng này trở lên; 0 = mọi chênh lệch.">
          <input className="input" type="number" min={0} value={v.cashDiffAlert} disabled={!writable} onChange={(e) => setV({ ...v, cashDiffAlert: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
        </Field>
        <Field label="Kho nhận hàng khách trả bị lỗi / hết hạn" hint={'Thu ngân chọn "Lỗi – hết hạn" ở hộp hoàn / đổi hàng thì hàng vào kho loại KTL "Kho hàng trả lại" của cửa hàng; "Nguyên vẹn" về kho bán. Cửa hàng chưa chọn kho thì máy bán không nhận trả hàng lỗi. Chưa có kho KTL: khai ở Danh mục kho (DM18).'}>
          {whsQ.error ? <ErrorBox error={errorText(whsQ.error)} /> : !whsQ.data ? <Loading /> : (
            <table className="grid">
              <thead><tr><th>Cửa hàng</th><th>Kho KTL nhận hàng lỗi</th></tr></thead>
              <tbody>{branches.map(([code, name]) => {
                const map = toMap(v.returnBadWarehouses);
                const opts = whsQ.data.filter((w) => w.branchCode === code && w.isActive && (w.typeCode === 'KTL' || w.code === map[code]));
                return (
                  <tr key={code}><td>{code} — {name}</td><td>
                    <select className="input" value={map[code] ?? ''} disabled={!writable} title={writable ? '' : 'Cần quyền settings:write'}
                      onChange={(e) => setV({ ...v, returnBadWarehouses: fromMap({ ...map, [code]: e.target.value }) })}>
                      <option value="">{opts.length ? '— chưa chọn —' : '— cửa hàng chưa có kho loại KTL —'}</option>
                      {opts.map((w) => <option key={w.code} value={w.code}>{w.code} — {w.name}{w.typeCode !== 'KTL' ? ` (loại ${w.typeCode})` : ''}</option>)}
                    </select>
                  </td></tr>
                );
              })}</tbody>
            </table>
          )}
        </Field>
        <Field label="Kho quà (hàng khuyến mại cùng mã hàng bán)" hint={'Dòng quà của máy bán và phiếu bán BH10 trừ tồn ở kho loại KKM "Kho hàng khuyến mại" của cửa hàng; hàng bán trừ kho bán; tồn hai kho không cộng chung (hết quà thì không tặng). Chưa chọn: quà trừ kho bán như cũ. Thuế / bill Z không đổi. Chưa có kho KKM: khai ở Danh mục kho (DM18).'}>
          {whsQ.error ? <ErrorBox error={errorText(whsQ.error)} /> : !whsQ.data ? <Loading /> : (
            <table className="grid">
              <thead><tr><th>Cửa hàng</th><th>Kho quà (KKM)</th></tr></thead>
              <tbody>{branches.map(([code, name]) => {
                const map = toMap(v.giftWarehouses);
                const opts = whsQ.data.filter((w) => w.branchCode === code && w.isActive && (w.typeCode === 'KKM' || w.code === map[code]));
                return (
                  <tr key={code}><td>{code} — {name}</td><td>
                    <select className="input" value={map[code] ?? ''} disabled={!writable} title={writable ? '' : 'Cần quyền settings:write'}
                      onChange={(e) => setV({ ...v, giftWarehouses: fromMap({ ...map, [code]: e.target.value }) })}>
                      <option value="">{opts.length ? '— chưa chọn (quà trừ kho bán) —' : '— cửa hàng chưa có kho loại KKM —'}</option>
                      {opts.map((w) => <option key={w.code} value={w.code}>{w.code} — {w.name}{w.typeCode !== 'KKM' ? ` (loại ${w.typeCode})` : ''}</option>)}
                    </select>
                  </td></tr>
                );
              })}</tbody>
            </table>
          )}
        </Field>
      </Block>

      <Block title="② Ghi sổ chứng từ bán" hint="Ghi ngay: chứng từ lên sổ khi máy bán gửi (bán lẻ mặc định ghi ngay, như POS cũ). Chờ duyệt: nằm ở Trạm chứng từ ACC14 chờ kế toán duyệt.">
        {modesQ.error ? <ErrorBox error={errorText(modesQ.error)} /> : SALE_TYPES.map(([t, label]) => (
          <Field key={t} label={label}>
            <select className="input" value={modes[t] ?? 'approve'} disabled={!writable || !modesQ.data} onChange={(e) => setModes({ ...modes, [t]: e.target.value as Mode })}>
              <option value="auto">Ghi ngay</option>
              <option value="approve">Chờ duyệt</option>
            </select>
          </Field>
        ))}
      </Block>

      <Block title="③ Chênh lệch két khi chốt ca" hint="Ca chốt có tiền thiếu / thừa thì lập một phiếu kế toán (tài sản thiếu / thừa chờ xử lý), đối tượng là chi nhánh. Tài khoản nằm trên lý do, khai ở Quy tắc hạch toán (ACC41).">
        <Field label="Lập phiếu kế toán khi chốt ca lệch két" hint={'Tắt: chỉ lưu biên bản ca, kế toán xử lý tay. Lý do chưa khai tài khoản lúc chốt: ca vẫn chốt, biên bản ghi "chưa lập" — khai ở ACC41 rồi "Lập lại phiếu" ở Sổ ca.'}>
          <input type="checkbox" checked={v.cashDiffJournal} disabled={!writable} onChange={(e) => setV({ ...v, cashDiffJournal: e.target.checked })} />
        </Field>
        {typesQ.error ? <ErrorBox error={errorText(typesQ.error)} /> : (
          <>
            {reasonRow('Thiếu tiền', v.cashShortReason)}
            {reasonRow('Thừa tiền', v.cashOverReason)}
          </>
        )}
        <div><a className="btn" href={ACC41_CASH_DIFF}>Khai ở Quy tắc hạch toán</a></div>
        {modesQ.data && (
          <p className="muted" style={{ margin: 0 }}>
            Phiếu lập xong: {modesQ.data.manual_journal === 'auto' ? 'ghi sổ ngay' : 'chờ kế toán duyệt ở Trạm chứng từ ACC14'} — theo chế độ của loại "phiếu kế toán" (dùng chung cho mọi phiếu kế toán phân hệ lập, vd kiểm kê kho), đổi ở ACC14.
          </p>
        )}
      </Block>

      <Block title="④ Tài khoản hạch toán bán hàng" hint="Theo Quy tắc hạch toán (ACC41): khung Nợ / Có của bán hàng và hàng bán trả lại, tài khoản đang dùng.">
        {typesQ.error ? <ErrorBox error={errorText(typesQ.error)} /> : !typesQ.data ? <Loading /> : (
          <table className="grid">
            <thead><tr><th title="Nghiệp vụ">Nghiệp vụ</th><th title="Dòng sổ">Dòng sổ</th><th title="Nợ / Có">Bên</th><th title="Tài khoản">Tài khoản</th></tr></thead>
            <tbody>{saleBiz.flatMap((b) => b.groups.flatMap((g) => g.lines.map((l, i) => (
              <tr key={`${b.code}-${g.name}-${i}`}><td title={b.name}>{b.name}</td><td title={l.when ?? l.role}>{l.role}</td><td>{l.side === 'debit' ? 'Nợ' : 'Có'}</td><td title={accText(l)}>{accText(l)}</td></tr>
            ))))}</tbody>
          </table>
        )}
        <div><a className="btn" href="/cau-hinh/quy-tac-hach-toan">Sửa ở Quy tắc hạch toán (ACC41)</a></div>
      </Block>

      <Block title="⑤ Giao hàng đơn đặt hàng" hint="Chuyến giao của đơn đặt hàng (BH20) ghi sổ hai bước qua kho KHG: Đang giao chuyển kho, Đã giao sinh phiếu bán có phí ship + thanh toán COD. Ghi riêng bằng nút của khối này.">
        <GiaoHangCaiDat />
      </Block>

      {save.error && <ErrorBox error={errorText(save.error)} />}
      {writable ? (
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-primary" disabled={!changed || !!err.returnDays || save.isPending} onClick={() => save.mutate()}>Ghi</button>
          <button type="button" className="btn" disabled={!changed} onClick={reset}>Bỏ sửa</button>
          {save.isSuccess && !changed && <span className="muted">Đã ghi.</span>}
        </div>
      ) : <p className="muted">Chỉ người có quyền ghi cấu hình (kế toán trưởng / quản trị) đổi được.</p>}
    </div>
  );
}
