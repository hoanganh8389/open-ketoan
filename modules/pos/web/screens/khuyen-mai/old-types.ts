/**
 * BH18 theo mẫu plugin chính sách cũ (tgs_selling_policy) — phần thuần: các LOẠI CHƯƠNG TRÌNH plugin cũ đang cho tạo (ACTIVE_POLICY_TYPES = 1, 2, 4,
 * 5, 10, 12, 13, 14, 15), form 2 thẻ "Thông tin chương trình" / "Khuyến mãi theo mặt hàng" ↔ `params` của khuôn Core (Core kiểm lại khi phát hành).
 * Loại cũ chưa có khuôn (4 theo lô hàng, 12 JSON thủ công của IT) không hiện; loại mới của màn (bậc, combo món, flash sale, hạn mức…) ẨN, code giữ nguyên
 * (chương trình đã lưu của các loại đó vẫn mở bằng form cũ KmForm). Không gọi API, không React — test ở modules/pos/test/khuyen-mai-du-nhu-cu.test.ts.
 */
// [2026-11-27 10:00 AM Võ Hoàng] NGHIEM-THU — NT-BH-049 (S-CD-14, S-CD-16, S-CD-17): form chính sách như plugin cũ — 7 loại cũ, bảng nhiều dòng mọi loại (đóng góp)
import { list, num } from './model';

/** Loại chương trình theo plugin cũ (mã số = selling_policy_type cũ). */
export type OldType = 'ck' | 'bxgy' | 'fixed' | 'batch' | 'voucher' | 'pool' | 'order_gift' | 'lowest';
export const OLD_TYPES: { id: OldType; oldId: number; label: string; contract: string; hint: string }[] = [
  { id: 'ck', oldId: 5, label: 'Chiết khấu', contract: 'sale.promo.price_lines@2', hint: 'Mỗi mã một dòng: từ số lượng, chiết khấu % hoặc tiền / đơn vị, tối đa (đ)' },
  { id: 'bxgy', oldId: 2, label: 'Mua X tặng Y', contract: 'sale.promo.buy_x_get_y@2', hint: 'Bảng hàng mua (mỗi mã đủ số lượng của dòng) → bảng quà; nhiều quà thì khách chọn 1' },
  { id: 'fixed', oldId: 1, label: 'Giảm giá cố định', contract: 'sale.promo.price_lines@2', hint: 'Mỗi mã một dòng: từ số lượng, giá mới' },
  // [2026-11-29 02:30 AM Võ Hoàng] NGHIEM-THU — NT-BH-064: hiện lại loại 4 "Theo lô hàng" — khuôn price_lines@2 có lọc lô (lotFilter.lotNos) (đóng góp)
  { id: 'batch', oldId: 4, label: 'Theo lô hàng', contract: 'sale.promo.price_lines@2', hint: 'Mỗi dòng: mã, số lô (nhiều lô cách dấu phẩy), giá mới — chỉ phần hàng xuất từ các lô đó được giá mới (máy chủ tự chọn lô hạn gần trước)' },
  { id: 'voucher', oldId: 10, label: 'Voucher / Mã giảm giá', contract: 'sale.promo.order_discount@1', hint: 'Khách đọc mã: giảm % (có trần) hoặc tiền, đơn tối thiểu, tối đa mỗi khách' },
  { id: 'pool', oldId: 13, label: 'Combo bộ sản phẩm', contract: 'sale.promo.pool_combo@2', hint: 'Mua đủ N mã khác nhau trong pool giảm % cả pool; chưa đủ thì giảm theo số lượng từng mã' },
  { id: 'order_gift', oldId: 14, label: 'Quà tặng theo giá trị đơn hàng', contract: 'sale.promo.order_gift@2', hint: 'Đơn đạt "Tổng giá trị đơn hàng ≥" tặng quà (nhân theo bội số); nhiều quà thì khách chọn 1' },
  { id: 'lowest', oldId: 15, label: 'Mua đủ sản phẩm, tặng sản phẩm giá thấp nhất', contract: 'sale.promo.cheapest_free@1', hint: 'Mua đủ số lượng bất kỳ trong danh sách, món giá thấp nhất được tặng' },
];
export const OLD_TYPE: Record<OldType, (typeof OLD_TYPES)[number]> = Object.fromEntries(OLD_TYPES.map((t) => [t.id, t])) as never;
/** Loại cũ không hiện ở màn mới và lý do — ghi ở phiếu NT-BH-049 §6. */
export const OLD_HIDDEN = [
  { oldId: 12, label: 'Trường hợp đặc biệt (IT)', why: 'JSON thủ công của IT, không dùng ở kế toán' },
];

/** Dòng mặt hàng chung: mã, đơn vị (tên + tỉ lệ về đơn vị nhỏ nhất). */
export type UnitRow = { sku: string; unitName: string; unitRatio: string };
// [2026-11-29 02:30 AM Võ Hoàng] NGHIEM-THU — NT-BH-064: lọc HSD trên từng dòng như hsd_filter plugin cũ, thêm "còn ≤ N ngày" (đóng góp)
/** Lọc lô / HSD của dòng: '' mọi HSD · days còn ≤ N ngày · month tháng HSD (MM/YYYY) · year năm HSD · lot số lô cụ thể. */
export type HsdMode = '' | 'days' | 'month' | 'year' | 'lot';
export type HsdCols = { hsdMode: HsdMode; hsdValue: string };
export const HSD_MODES: { v: HsdMode; label: string; ph: string }[] = [
  { v: '', label: 'Mọi HSD', ph: '' }, { v: 'days', label: 'HSD còn ≤ N ngày', ph: 'vd 30' }, { v: 'month', label: 'Theo tháng/năm HSD', ph: 'MM/YYYY' },
  { v: 'year', label: 'Theo năm HSD', ph: 'YYYY' }, { v: 'lot', label: 'Lô cụ thể', ph: 'số lô, cách dấu phẩy' },
];
export type CkRow = UnitRow & HsdCols & { fromQty: string; pct: string; amount: string; maxDiscount: string };
export type FixedRow = UnitRow & HsdCols & { fromQty: string; price: string };
export type QtyRow = UnitRow & { qty: string };
export type PoolTier = { minQty: string; pct: string };

export type OldForm = {
  type: OldType;
  key: string; name: string; description: string;
  /** Áp dụng đồng thời cùng các chương trình khác (bỏ tích = áp riêng). */
  allowStack: boolean;
  dateOn: boolean; validFrom: string; validTo: string;
  timeOn: boolean; timeFrom: string; timeTo: string;
  weekdaysOn: boolean; weekdays: number[];
  retail: boolean; wholesale: boolean; so: boolean;
  /** Tổng giá trị đơn hàng ≥ (loại quà theo giá trị đơn: ngưỡng tặng). */
  minOrderTotal: string;
  /** Số lượng đơn hàng được áp dụng — mỗi cửa hàng (0 / trống = không giới hạn). */
  maxUsage: string;
  memberLevels: string; birthday: '' | 'day' | 'week' | 'month';
  branchCodes: string[];
  scopeMode: 'all' | 'group'; groupCodes: string[];
  ckRows: CkRow[]; fixedRows: FixedRow[];
  buyRows: QtyRow[]; giftRows: QtyRow[];
  // [2026-11-29 01:30 AM Võ Hoàng] NGHIEM-THU — NT-BH-063: Mua X tặng Y nhiều combo — combo 1 là buyRows / giftRows, combo 2.. ở đây (đóng góp)
  /** Combo thứ 2 trở đi (plugin cũ: nhiều rule mua – tặng trong một chương trình). */
  moreCombos: { buyRows: QtyRow[]; giftRows: QtyRow[] }[];
  vcCodes: string; vcType: 'percent' | 'fixed'; vcValue: string; vcMax: string; vcMinOrder: string; vcPerCustomer: string;
  poolRows: UnitRow[]; poolTiers: PoolTier[]; poolMinDistinct: string; poolPct: string;
  lowRequired: string; lowGift: string; lowRows: UnitRow[];
  /** Ngày áp (bản phát hành); Core cần. */
  effectiveFrom: string;
  /** Nâng cao (Core có, plugin cũ không có ô): ưu tiên, trần NĐ81, lượt mỗi khách. */
  priority: number; legalCapPct: string; noCap: boolean; perCustomer: string;
};

export const emptyUnit = (): UnitRow => ({ sku: '', unitName: '', unitRatio: '' });
export const emptyCk = (): CkRow => ({ ...emptyUnit(), hsdMode: '', hsdValue: '', fromQty: '1', pct: '', amount: '', maxDiscount: '' });
export const emptyFixed = (): FixedRow => ({ ...emptyUnit(), hsdMode: '', hsdValue: '', fromQty: '1', price: '' });

/** Ô lọc HSD → lotFilter của khuôn; undefined = không lọc; sai → ghi lỗi, trả null. */
export function lotFilterOf(r: HsdCols, label: string, problems: string[]): Record<string, unknown> | undefined | null {
  const v = (r.hsdValue ?? '').trim();
  switch (r.hsdMode ?? '') {
    case '': return undefined;
    case 'days': { const n = Number(v); if (!v || !Number.isInteger(n) || n < 0 || n > 3650) { problems.push(`${label}: HSD còn ≤ N ngày — nhập số nguyên 0–3650`); return null; } return { expWithinDays: n }; }
    case 'month': {
      const a = /^(\d{1,2})\/(\d{4})$/.exec(v), b = /^(\d{4})-(\d{2})$/.exec(v);
      if (!a && !b) { problems.push(`${label}: tháng HSD dạng MM/YYYY`); return null; }
      const mm = a ? a[1]! : b![2]!, yy = a ? a[2]! : b![1]!;
      const n = Number(mm); if (n < 1 || n > 12) { problems.push(`${label}: tháng HSD 1–12`); return null; }
      return { expMonth: `${yy}-${String(n).padStart(2, '0')}` };
    }
    case 'year': if (!/^\d{4}$/.test(v)) { problems.push(`${label}: năm HSD dạng YYYY`); return null; } return { expYear: v };
    case 'lot': { const lots = list(v); if (!lots.length) { problems.push(`${label}: chưa nhập số lô`); return null; } return { lotNos: [...new Set(lots)] }; }
  }
}
/** lotFilter của khuôn → ô lọc HSD của form. */
export function hsdOf(lf: Record<string, unknown> | undefined): HsdCols {
  if (!lf) return { hsdMode: '', hsdValue: '' };
  if (Array.isArray(lf.lotNos) && lf.lotNos.length) return { hsdMode: 'lot', hsdValue: (lf.lotNos as string[]).join(', ') };
  if (lf.expWithinDays != null) return { hsdMode: 'days', hsdValue: String(lf.expWithinDays) };
  if (typeof lf.expMonth === 'string') return { hsdMode: 'month', hsdValue: `${lf.expMonth.slice(5, 7)}/${lf.expMonth.slice(0, 4)}` };
  if (typeof lf.expYear === 'string') return { hsdMode: 'year', hsdValue: lf.expYear };
  return { hsdMode: '', hsdValue: '' };
}
export const emptyQty = (): QtyRow => ({ ...emptyUnit(), qty: '1' });
const rows5 = <T,>(f: () => T) => [f(), f(), f(), f(), f()];

export function emptyOld(type: OldType, today: string): OldForm {
  return {
    type, key: '', name: '', description: '', allowStack: false,
    dateOn: false, validFrom: today, validTo: '', timeOn: false, timeFrom: '', timeTo: '', weekdaysOn: false, weekdays: [],
    retail: true, wholesale: false, so: false, minOrderTotal: '0', maxUsage: '0', memberLevels: '', birthday: '', branchCodes: [],
    scopeMode: 'all', groupCodes: [],
    ckRows: rows5(emptyCk), fixedRows: rows5(emptyFixed), buyRows: [emptyQty()], giftRows: [emptyQty()], moreCombos: [],
    vcCodes: '', vcType: 'percent', vcValue: '', vcMax: '', vcMinOrder: '', vcPerCustomer: '1',
    poolRows: [emptyUnit()], poolTiers: [{ minQty: '2', pct: '' }], poolMinDistinct: '2', poolPct: '',
    lowRequired: '4', lowGift: '1', lowRows: [emptyUnit()],
    effectiveFrom: today, priority: 0, legalCapPct: '', noCap: false, perCustomer: '',
  };
}

type Params = Record<string, unknown>;
const used = <T extends { sku: string }>(rows: T[]) => rows.filter((r) => r.sku.trim());
const ratioOf = (r: UnitRow) => { const n = num(r.unitRatio); return n && n > 0 ? n : 1; };

/** Form kiểu cũ → khuôn + params + hạn mức. Lỗi rõ theo ô (Core còn kiểm lại khi phát hành). */
export function oldToParams(f: OldForm): { contract: string; params: Params; quota: { perBranch?: number; perCustomer?: number } | null; problems: string[] } {
  const problems: string[] = [];
  const need = (v: number | undefined, label: string, opt: { int?: boolean; min?: number; gt0?: boolean } = {}) => {
    if (v === undefined || Number.isNaN(v) || v < (opt.min ?? 0) || (opt.gt0 && !(v > 0)) || (opt.int && !Number.isInteger(v))) { problems.push(`${label}: chưa nhập hoặc sai`); return undefined; }
    return v;
  };
  const opt = (s: string) => (s.trim() ? num(s) : undefined);
  // ── thẻ Thông tin chương trình ──
  const common: Params = { priority: f.priority || 0, exclusive: !f.allowStack };
  if (f.noCap) common.legalCapPct = null;
  else if (f.legalCapPct.trim()) common.legalCapPct = need(num(f.legalCapPct), 'Trần khuyến mại (%)');
  const c: Params = {};
  if (f.weekdaysOn) { if (!f.weekdays.length) problems.push('Đã tích "ngày trong tuần" nhưng chưa chọn thứ nào'); else c.weekdays = [...f.weekdays].sort(); }
  if (f.timeOn) {
    if (!f.timeFrom || !f.timeTo) problems.push('Đã tích "khung giờ" nhưng chưa nhập đủ Từ / Đến');
    else if (f.timeFrom === f.timeTo) problems.push('Giờ kết thúc trùng giờ bắt đầu');
    else { c.timeFrom = f.timeFrom; c.timeTo = f.timeTo; }
  }
  const types = [f.retail && 'retail', f.wholesale && 'wholesale', f.so && 'so'].filter(Boolean) as string[];
  if (!types.length) problems.push('Chọn ít nhất một loại đơn được áp (bán lẻ / bán buôn / SO)');
  else if (types.length < 3) c.orderTypes = types;
  const minOrder = opt(f.minOrderTotal);
  if (minOrder !== undefined && (Number.isNaN(minOrder) || minOrder < 0)) problems.push('Tổng giá trị đơn hàng: số ≥ 0');
  if (f.type !== 'order_gift' && minOrder && minOrder > 0) c.minOrderAmount = minOrder;
  if (f.birthday === 'month') c.birthdayMonth = true;
  if (f.birthday === 'day' || f.birthday === 'week') c.birthdayScope = f.birthday;
  if (list(f.memberLevels).length) c.memberLevels = list(f.memberLevels);
  if (f.dateOn) {
    if (!f.validFrom) problems.push('Đã tích "khoảng thời gian" nhưng chưa nhập ngày Từ');
    if (f.validFrom) common.validFrom = f.validFrom;
    if (f.validTo) common.validTo = f.validTo;
    if (f.validFrom && f.validTo && f.validTo < f.validFrom) problems.push('Đến ngày trước Từ ngày');
  }
  const scope = f.scopeMode === 'group' ? (f.groupCodes.length ? { scope: { groupCodes: [...new Set(f.groupCodes)] } } : (problems.push('Phạm vi "Theo nhóm hàng" nhưng chưa chọn nhóm'), {})) : {};
  // ── thẻ Khuyến mãi theo mặt hàng ──
  let own: Params = {};
  const contract = OLD_TYPE[f.type].contract;
  const dupSku = (rows: { sku: string }[], what: string) => {
    const s = rows.map((r) => r.sku.trim());
    const d = s.filter((x, i) => s.indexOf(x) !== i);
    if (d.length) problems.push(`${what}: mã ${[...new Set(d)].join(', ')} khai trùng`);
  };
  switch (f.type) {
    case 'ck':
    case 'fixed':
    case 'batch': {
      const rows = f.type === 'ck' ? used(f.ckRows) : used(f.fixedRows);
      if (!rows.length) problems.push('Chưa nhập mã SKU nào ở bảng "Cách tính chương trình"');
      const bySku = new Map<string, (CkRow | FixedRow)[]>();
      for (const r of rows) bySku.set(r.sku.trim(), [...(bySku.get(r.sku.trim()) ?? []), r]);
      const lines = [...bySku.entries()].map(([s, rs]) => {
        const units = new Set(rs.map((r) => `${r.unitName.trim()}|${ratioOf(r)}`));
        if (units.size > 1) problems.push(`${s}: các dòng của cùng một mã phải cùng đơn vị`);
        const froms = rs.map((r, i) => need(num(r.fromQty || '1'), `${s} dòng ${i + 1}: từ SL`, { gt0: true }) ?? 1);
        if (new Set(froms).size !== froms.length) problems.push(`${s}: hai dòng trùng "Từ SL"`);
        // NT-BH-064: lọc lô / HSD theo mã (mọi dòng của một mã phải cùng bộ lọc); loại "Theo lô hàng" bắt buộc số lô.
        if (f.type === 'batch' && rs.some((r) => !(r.hsdValue ?? '').trim())) problems.push(`${s}: loại "Theo lô hàng" phải nhập số lô`);
        const lfs = rs.map((r) => (f.type === 'batch' ? { ...r, hsdMode: 'lot' as const } : r)).map((r) => lotFilterOf(r, s, problems));
        if (new Set(lfs.map((x) => JSON.stringify(x ?? null))).size > 1) problems.push(`${s}: các dòng của cùng một mã phải cùng lọc HSD / lô`);
        const lot = lfs[0] ? { lotFilter: lfs[0] } : {};
        const way = (r: CkRow | FixedRow, i: number): Params => {
          if (f.type === 'fixed' || f.type === 'batch') return { unitPrice: need(num((r as FixedRow).price), `${s} dòng ${i + 1}: giá mới`) };
          const k = r as CkRow;
          const hasPct = k.pct.trim() !== '' && num(k.pct) !== 0, hasAmt = k.amount.trim() !== '' && num(k.amount) !== 0;
          if (hasPct === hasAmt) { problems.push(`${s} dòng ${i + 1}: nhập Chiết khấu % HOẶC Chiết khấu đ (một trong hai)`); return {}; }
          const w: Params = hasPct ? { pct: need(num(k.pct), `${s}: chiết khấu %`, { gt0: true }) } : { amountPerUnit: need(num(k.amount), `${s}: chiết khấu đ`, { gt0: true }) };
          if (hasPct && (num(k.pct) ?? 0) > 100) problems.push(`${s}: chiết khấu % tối đa 100`);
          if (k.maxDiscount.trim() && num(k.maxDiscount) !== 0) w.maxDiscount = need(num(k.maxDiscount), `${s}: tối đa (đ)`, { gt0: true });
          return w;
        };
        const r0 = rs[0]!;
        const unit = ratioOf(r0) !== 1 && r0.unitName.trim() ? { unit: { name: r0.unitName.trim(), ratio: ratioOf(r0) } } : {};
        if (rs.length === 1 && froms[0] === 1) {
          const w = way(r0, 0);
          return { sku: s, ...w, ...unit, ...lot };
        }
        const order = rs.map((r, i) => ({ r, i, min: froms[i]! })).sort((a, b) => a.min - b.min);
        const tiers = order.map(({ r, i, min }) => ({ min, ...way(r, i) }));
        return { sku: s, tiers, ...unit, ...lot };
      });
      own = { basis: 'qty', lines, ...scope };
      break;
    }
    case 'bxgy': {
      // NT-BH-063: mỗi combo một bộ hàng mua + quà; combo không có dòng nào thì bỏ (combo 1 bắt buộc).
      const all = [{ buyRows: f.buyRows, giftRows: f.giftRows }, ...f.moreCombos];
      const filled = all.map((c, k) => ({ k, buy: used(c.buyRows), gift: used(c.giftRows) })).filter((c, i) => i === 0 || c.buy.length || c.gift.length);
      const tag = (k: number) => (filled.length > 1 ? `Combo ${k + 1} — ` : '');
      const built = filled.map(({ k, buy, gift }) => {
        if (!buy.length) problems.push(`${tag(k)}Chưa nhập hàng mua`);
        if (!gift.length) problems.push(`${tag(k)}Chưa nhập quà tặng`);
        dupSku(buy, `${tag(k)}Hàng mua`); dupSku(gift, `${tag(k)}Quà tặng`);
        return {
          buy: { items: buy.map((r, i) => ({ sku: r.sku.trim(), qty: (need(num(r.qty), `${tag(k)}Hàng mua dòng ${i + 1}: số lượng`, { gt0: true }) ?? 1) * ratioOf(r) })), mode: 'each' as const },
          get: { options: gift.map((r, i) => ({ sku: r.sku.trim(), qty: (need(num(r.qty), `${tag(k)}Quà dòng ${i + 1}: số lượng`, { gt0: true }) ?? 1) * ratioOf(r) })), choose: 1 },
        };
      });
      if (built.length > 1) {
        const seen = new Map<string, number>();
        built.forEach((c, k) => c.buy.items.forEach((x) => { const was = seen.get(x.sku); if (was !== undefined && was !== k) problems.push(`Mã mua ${x.sku} có ở cả combo ${was + 1} và combo ${k + 1}`); seen.set(x.sku, k); }));
      }
      own = { ...built[0]!, ...(built.length > 1 ? { combos: built } : {}), repeat: true, ...scope };
      break;
    }
    case 'voucher': {
      const codes = list(f.vcCodes);
      if (!codes.length) problems.push('Chưa nhập mã giảm giá (khách đọc mã)');
      else c.couponCodes = codes;
      const value = need(num(f.vcValue), 'Giá trị giảm', { gt0: true });
      if (f.vcType === 'percent' && value !== undefined && value > 100) problems.push('Giảm % tối đa 100');
      const max = opt(f.vcMax);
      own = { tiers: [{ minOrder: need(num(f.vcMinOrder || '0'), 'Đơn tối thiểu') ?? 0, ...(f.vcType === 'percent' ? { pct: value } : { amount: value }), ...(max ? { maxDiscount: max } : {}) }] };
      break;
    }
    case 'pool': {
      const rows = used(f.poolRows);
      if (!rows.length) problems.push('Pool chưa có mã SKU');
      dupSku(rows, 'Pool');
      const tiers = f.poolTiers.filter((t) => t.minQty.trim() || t.pct.trim()).map((t, i) => ({ min: need(num(t.minQty), `Mức ${i + 1}: SL`, { gt0: true }), pct: need(num(t.pct), `Mức ${i + 1}: % giảm`, { gt0: true }) }));
      const pct = opt(f.poolPct);
      own = {
        skus: rows.map((r) => r.sku.trim()), qtyTiers: tiers,
        ...(pct ? { combo: { minDistinct: need(num(f.poolMinDistinct), 'Số SP khác nhau tối thiểu', { int: true, min: 1 }), pct } } : {}),
      };
      if (!pct && !tiers.length) problems.push('Khai % giảm combo hoặc ít nhất một mức giảm theo số lượng');
      break;
    }
    case 'order_gift': {
      const gift = used(f.giftRows);
      if (!gift.length) problems.push('Chưa nhập quà');
      dupSku(gift, 'Quà');
      const threshold = minOrder && minOrder > 0 ? minOrder : 0;
      own = {
        tiers: [{ minOrder: threshold, gifts: gift.map((r, i) => ({ sku: r.sku.trim(), qty: (need(num(r.qty), `Quà dòng ${i + 1}: số lượng tặng`, { gt0: true }) ?? 1) * ratioOf(r) })) }],
        multiply: threshold > 0, ...(gift.length > 1 ? { choose: 1 } : {}), ...scope,
      };
      break;
    }
    case 'lowest': {
      const rows = used(f.lowRows);
      if (!rows.length) problems.push('Chưa có SKU đủ điều kiện');
      dupSku(rows, 'Danh sách SKU');
      const req = need(num(f.lowRequired), 'Số lượng cần mua', { int: true, min: 2 });
      const gift = need(num(f.lowGift), 'Số lượng quà mỗi lượt', { int: true, min: 1 });
      if (req !== undefined && gift !== undefined && gift >= req) problems.push('Số quà mỗi lượt phải nhỏ hơn số lượng cần mua');
      own = { skus: rows.map((r) => r.sku.trim()), buyQty: req, freeQty: gift, repeat: true };
      break;
    }
  }
  if (Object.keys(c).length) common.conditions = c;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/.test(f.key.trim())) problems.push('Mã chương trình: 2–64 ký tự chữ, số, dấu chấm, gạch (vd TGS_1126_01)');
  if (!f.name.trim()) problems.push('Chưa nhập tên chương trình');
  if (!f.effectiveFrom) problems.push('Chưa có ngày bắt đầu áp');
  const usage = opt(f.maxUsage), perC = opt(f.vcPerCustomer && f.type === 'voucher' ? f.vcPerCustomer : f.perCustomer);
  if (usage !== undefined && (Number.isNaN(usage) || usage < 0 || !Number.isInteger(usage))) problems.push('Số lượng đơn hàng được áp dụng: số nguyên ≥ 0');
  if (perC !== undefined && (Number.isNaN(perC) || perC < 0 || !Number.isInteger(perC))) problems.push('Tối đa mỗi khách: số nguyên ≥ 0');
  const quota = { ...(usage ? { perBranch: usage } : {}), ...(perC ? { perCustomer: perC } : {}) };
  return { contract, params: { ...common, ...own }, quota: Object.keys(quota).length ? quota : null, problems };
}

/** Tên + mô tả ↔ lý do phát hành (một ô của Core): "Tên — Mô tả". */
export const reasonOf = (f: Pick<OldForm, 'name' | 'description'>) => [f.name.trim(), f.description.trim()].filter(Boolean).join(' — ').slice(0, 500);
export function splitReason(r: string): { name: string; description: string } {
  const i = r.indexOf(' — ');
  return i < 0 ? { name: r, description: '' } : { name: r.slice(0, i), description: r.slice(i + 3) };
}

const s = (v: unknown) => (v === undefined || v === null ? '' : String(v));
/**
 * Chương trình đã có (khuôn + params) → form kiểu cũ. Khuôn / nội dung form kiểu cũ không biểu diễn được (bậc khác loại, mua any / all…) → null:
 * màn mở bằng form KmForm như trước.
 */
export function oldFromParams(contract: string, p: Params, meta: { key: string; reason?: string; branchCodes?: string[]; quota?: { perBranch?: number; perCustomer?: number } | null; today: string; effectiveFrom?: string }): OldForm | null {
  const cond = (p.conditions ?? {}) as Record<string, unknown>;
  const scope = (p.scope ?? {}) as { skus?: string[]; groupCodes?: string[]; brandCodes?: string[] };
  if (scope.skus?.length || scope.brandCodes?.length) return null;
  let type: OldType;
  const lines = (p.lines ?? []) as Record<string, unknown>[];
  const ways = lines.flatMap((l) => ((l.tiers as Record<string, unknown>[] | undefined) ?? [l]));
  switch (contract) {
    case 'sale.promo.price_lines@2':
      if (!lines.length) return null;
      // NT-BH-064: giá mới + mọi dòng lọc theo số lô = loại "Theo lô hàng".
      if (ways.every((w) => w.unitPrice != null) && lines.every((l) => ((l.lotFilter as { lotNos?: unknown[] } | undefined)?.lotNos?.length ?? 0) > 0)) type = 'batch';
      else if (ways.every((w) => w.unitPrice != null)) type = 'fixed';
      else if (ways.every((w) => w.unitPrice == null && (w.pct != null || w.amountPerUnit != null))) type = 'ck';
      else return null;
      break;
    case 'sale.promo.buy_x_get_y@2': if (((p.buy ?? {}) as { mode?: string }).mode !== 'each') return null; type = 'bxgy'; break;
    case 'sale.promo.order_discount@1': {
      const tiers = (p.tiers ?? []) as unknown[];
      if (!(cond.couponCodes as string[] | undefined)?.length || tiers.length !== 1 || (p.skus as string[] | undefined)?.length) return null;
      type = 'voucher'; break;
    }
    case 'sale.promo.pool_combo@2': type = 'pool'; break;
    case 'sale.promo.order_gift@2': if (((p.tiers ?? []) as unknown[]).length !== 1) return null; type = 'order_gift'; break;
    case 'sale.promo.cheapest_free@1': type = 'lowest'; break;
    default: return null;
  }
  const f = emptyOld(type, meta.today);
  const nd = splitReason(meta.reason ?? '');
  const types = (cond.orderTypes as string[] | undefined) ?? ['retail', 'wholesale', 'so'];
  Object.assign(f, {
    key: meta.key, name: nd.name, description: nd.description, allowStack: p.exclusive !== true,
    dateOn: Boolean(p.validFrom || p.validTo), validFrom: s(p.validFrom) || meta.today, validTo: s(p.validTo),
    timeOn: Boolean(cond.timeFrom || cond.timeTo), timeFrom: s(cond.timeFrom), timeTo: s(cond.timeTo),
    weekdaysOn: Boolean((cond.weekdays as number[] | undefined)?.length), weekdays: (cond.weekdays as number[] | undefined) ?? [],
    retail: types.includes('retail'), wholesale: types.includes('wholesale'), so: types.includes('so'),
    minOrderTotal: s(cond.minOrderAmount ?? 0), maxUsage: s(meta.quota?.perBranch ?? 0), perCustomer: s(meta.quota?.perCustomer ?? ''),
    memberLevels: ((cond.memberLevels as string[] | undefined) ?? []).join(', '),
    birthday: cond.birthdayMonth ? 'month' : ((cond.birthdayScope as OldForm['birthday'] | undefined) ?? ''),
    branchCodes: meta.branchCodes ?? [], scopeMode: scope.groupCodes?.length ? 'group' : 'all', groupCodes: scope.groupCodes ?? [],
    priority: Number(p.priority ?? 0), noCap: p.legalCapPct === null, legalCapPct: p.legalCapPct == null ? '' : s(p.legalCapPct),
    effectiveFrom: meta.effectiveFrom ?? meta.today,
  });
  const unitOf = (l: Record<string, unknown>) => { const u = l.unit as { name?: string; ratio?: number } | undefined; return { unitName: s(u?.name), unitRatio: u?.ratio && u.ratio !== 1 ? s(u.ratio) : '' }; };
  const pad = <T,>(rows: T[], mk: () => T) => (rows.length ? rows : [mk()]);
  if (type === 'ck') {
    f.ckRows = pad(lines.flatMap((l) => {
      const ts = (l.tiers as Record<string, unknown>[] | undefined) ?? [{ ...l, min: 1 }];
      return ts.map((t) => ({ sku: s(l.sku), ...unitOf(l), ...hsdOf(l.lotFilter as Record<string, unknown> | undefined), fromQty: s(t.min ?? 1), pct: s(t.pct), amount: s(t.amountPerUnit), maxDiscount: s(t.maxDiscount ?? (l.tiers ? '' : l.maxDiscount)) }));
    }), emptyCk);
  }
  if (type === 'fixed' || type === 'batch') {
    f.fixedRows = pad(lines.flatMap((l) => {
      const ts = (l.tiers as Record<string, unknown>[] | undefined) ?? [{ ...l, min: 1 }];
      return ts.map((t) => ({ sku: s(l.sku), ...unitOf(l), ...hsdOf(l.lotFilter as Record<string, unknown> | undefined), fromQty: s(t.min ?? 1), price: s(t.unitPrice) }));
    }), emptyFixed);
  }
  if (type === 'bxgy') {
    const b = (p.buy ?? {}) as { items?: { sku: string; qty?: number }[] }, g = (p.get ?? {}) as { options?: { sku: string; qty: number }[] };
    f.buyRows = pad((b.items ?? []).map((x) => ({ ...emptyUnit(), sku: x.sku, qty: s(x.qty ?? 1) })), emptyQty);
    f.giftRows = pad((g.options ?? []).map((x) => ({ ...emptyUnit(), sku: x.sku, qty: s(x.qty) })), emptyQty);
    // NT-BH-063: combo 2.. (combos[0] trùng buy / get)
    const combos = (Array.isArray(p.combos) ? p.combos : []) as { buy?: { items?: { sku: string; qty?: number }[] }; get?: { options?: { sku: string; qty: number }[] } }[];
    f.moreCombos = combos.slice(1).map((c) => ({
      buyRows: pad((c.buy?.items ?? []).map((x) => ({ ...emptyUnit(), sku: x.sku, qty: s(x.qty ?? 1) })), emptyQty),
      giftRows: pad((c.get?.options ?? []).map((x) => ({ ...emptyUnit(), sku: x.sku, qty: s(x.qty) })), emptyQty),
    }));
  }
  if (type === 'voucher') {
    const t = ((p.tiers ?? []) as Record<string, unknown>[])[0] ?? {};
    Object.assign(f, {
      vcCodes: ((cond.couponCodes as string[] | undefined) ?? []).join(', '), vcType: t.pct != null ? 'percent' : 'fixed', vcValue: s(t.pct ?? t.amount),
      vcMax: s(t.maxDiscount), vcMinOrder: s(t.minOrder ?? ''), vcPerCustomer: s(meta.quota?.perCustomer ?? ''),
    });
  }
  if (type === 'pool') {
    f.poolRows = pad(((p.skus ?? []) as string[]).map((x) => ({ ...emptyUnit(), sku: x })), emptyUnit);
    f.poolTiers = pad(((p.qtyTiers ?? []) as { min: number; pct: number }[]).map((t) => ({ minQty: s(t.min), pct: s(t.pct) })), () => ({ minQty: '', pct: '' }));
    const cb = p.combo as { minDistinct?: number; pct?: number } | undefined;
    f.poolMinDistinct = s(cb?.minDistinct ?? 2); f.poolPct = s(cb?.pct);
  }
  if (type === 'order_gift') {
    const t = ((p.tiers ?? []) as { minOrder: number; gifts: { sku: string; qty: number }[] }[])[0]!;
    f.minOrderTotal = s(t.minOrder);
    f.giftRows = pad(t.gifts.map((x) => ({ ...emptyUnit(), sku: x.sku, qty: s(x.qty) })), emptyQty);
  }
  if (type === 'lowest') {
    f.lowRows = pad(((p.skus ?? []) as string[]).map((x) => ({ ...emptyUnit(), sku: x })), emptyUnit);
    f.lowRequired = s(p.buyQty); f.lowGift = s(p.freeQty ?? 1);
  }
  return f;
}

/** Dán từ Excel (Tab / ; / ,) vào bảng của loại — cột theo thứ tự bảng; dòng tiêu đề (cột 1 không phải mã) tự bỏ. */
export const PASTE_COLS: Record<OldType, string> = {
  ck: 'Mã SKU | Từ SL | Chiết khấu % | Chiết khấu đ | Tối đa (đ)',
  fixed: 'Mã SKU | Từ SL | Giá mới',
  batch: 'Mã SKU | Từ SL | Giá mới | Số lô',
  bxgy: 'Mã SKU | Số lượng',
  voucher: '',
  pool: 'Mã SKU',
  order_gift: 'Mã SKU quà | Số lượng tặng',
  lowest: 'Mã SKU',
};
export function parsePaste(text: string): string[][] {
  const out = String(text ?? '').split(/\r?\n/).map((r) => r.trim()).filter(Boolean).map((r) => r.split(/\t|;/).map((x) => x.trim()));
  if (out.length && out[0]![0] && /^(m[ãa]|sku|stt)/i.test(out[0]![0]) ) out.shift();
  return out.filter((c) => c[0]);
}

// [2026-11-28 10:00 AM Võ Hoàng] NGHIEM-THU — NT-BH-049: mã chương trình tự sinh khi Thêm — TGS_<MMYY>_<NN> như plugin cũ (VD TGS_1126_01), vẫn sửa được (đóng góp)
/** Mã kế tiếp của tháng `today` (YYYY-MM-DD): TGS_<MMYY>_<NN>, NN = số lớn nhất đang có của tháng đó + 1 (2 chữ số, quá 99 thì dài hơn). */
export function nextPolicyCode(keys: readonly string[], today: string): string {
  const mmyy = `${today.slice(5, 7)}${today.slice(2, 4)}`;
  const re = new RegExp(`^TGS_${mmyy}_([0-9]+)$`, 'i');
  const max = keys.reduce((m, k) => { const x = re.exec(k.trim()); return x ? Math.max(m, Number(x[1])) : m; }, 0);
  return `TGS_${mmyy}_${String(max + 1).padStart(2, '0')}`;
}
