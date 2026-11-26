// @bizcity-layer P module-sdk
// [2026-11-25 10:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-040 §2: ba khuôn khuyến mại @2 — giá riêng từng dòng, mua nhiều mã / quà lựa chọn, quà nhân bội số; phạm vi nhóm / nhãn (đóng góp)
/**
 * KHUYẾN MẠI @2 (phiếu NT-BH-040) — ba Rule Contract nội tuyến, phiên bản mới cạnh `@1` (khuôn `@1` giữ nguyên, chương trình cũ không chuyển):
 *   - `sale.promo.price_lines@2`  (K1): một chương trình nhiều mã, mỗi mã một cách giảm / một bảng bậc riêng;
 *   - `sale.promo.buy_x_get_y@2`  (K2a, K2b): mua nhiều mã (`any` gộp số lượng / `all` đủ từng mã), quà lựa chọn (`choose` trong `options`);
 *   - `sale.promo.order_gift@2`   (K4): quà theo tổng đơn, `multiply` nhân bội số ngưỡng, kẹp `maxTimes`.
 *
 * Quy ước như `@1` (sale-promo.ts): số lượng theo đơn vị nhỏ nhất; so theo `itemId` nếu có, không thì `sku`; tiền làm tròn đồng; `explain` tiếng Việt;
 * khối chung (thời gian, ưu tiên, áp riêng, điều kiện, trần NĐ81); `context.lenient` (cửa nạp tính lại) — thiếu dữ liệu thì `indeterminate`.
 *
 * Phạm vi (K3) `scope { skus?, groupCodes?, brandCodes? }`: dòng thuộc phạm vi khi mã nằm trong `skus`, HOẶC khớp mọi chiều nhóm / nhãn đã khai
 * (nhóm: một trong `groupCodes` nằm trong nhóm của dòng kể cả nhóm cha; nhãn: `brandCode` của dòng nằm trong `brandCodes`). Phạm vi trống = mọi dòng.
 * Khuôn thuần: nhóm / nhãn của dòng do BỘ TÍNH điền trước khi gọi (`lines[].groupCodes` = nhóm của mặt hàng + các nhóm cha, `lines[].brandCode`),
 * tra ở danh mục `bizcity_read.products`; nguồn bán không phải gửi. Trường vắng (undefined) = chưa biết → không đoán (chặn, hoặc `indeterminate` ở cửa nạp).
 *
 * Quà lựa chọn: `context.giftChoice` = các mã quà người bán đã chọn CHO CHƯƠNG TRÌNH NÀY (bộ tính lấy từ `giftChoice[policyKey]` của yêu cầu).
 * Chưa chọn / chọn sai → `pendingChoice` (các món được chọn, số món phải chọn) để máy bán hiện hộp "Chọn quà tặng"; `gifts` rỗng.
 */
import { z } from 'zod';
import { conditionsBlock, promoConditions, type PromoContext, type PromoDiscount } from './sale-promo.js';
import type { RuleContract, Treatment } from './types.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
const sku = z.string().trim().min(1).max(64);
const code = z.string().trim().min(1).max(64);
const money = z.number().finite().min(0);
const pos = z.number().finite().positive();
const itemId = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'itemId không đúng khuôn');

const common = {
  validFrom: day.optional(),
  validTo: day.optional(),
  priority: z.number().int().min(-1000).max(1000).default(0),
  exclusive: z.boolean().default(false),
  conditions: promoConditions.optional(),
  legalCapPct: z.number().min(0).max(100).nullable().default(50),
};

export const promoScope = z.object({
  skus: z.array(sku).max(500).optional(),
  groupCodes: z.array(code).max(200).optional(),
  brandCodes: z.array(code).max(200).optional(),
}).strict();
export type PromoScope = z.infer<typeof promoScope>;

/** Dòng giỏ của khuôn @2: như @1, thêm nhóm / nhãn do bộ tính tra danh mục điền. */
export interface PromoLineV2 {
  lineKey: string; sku: string; qty: number; itemId?: string; price?: number;
  /** Nhóm của mặt hàng + các nhóm cha; [] = không có nhóm; vắng = chưa biết. */
  groupCodes?: string[];
  /** Nhãn của mặt hàng; null = không có nhãn; vắng = chưa biết. */
  brandCode?: string | null;
}
export interface PromoContextV2 extends PromoContext {
  /** Mã quà đã chọn cho chương trình này (buy_x_get_y@2). */
  giftChoice?: string[];
}
export interface PromoInputV2 { lines: PromoLineV2[]; context?: PromoContextV2 }
export interface GiftOut { sku: string; itemId?: string; qty: number }
export interface PendingChoice {
  /** Số món phải chọn. */
  choose: number;
  /** Số lần đủ điều kiện. */
  times: number;
  /** Các món được chọn, số lượng nếu chọn món đó. */
  options: GiftOut[];
  /** Lý do lựa chọn đang gửi không dùng được (chọn thiếu / thừa / sai món). */
  problem?: string;
}
export interface PromoOutputV2 {
  discounts: PromoDiscount[];
  gifts: GiftOut[];
  total: number;
  touched: string[];
  noPrice: string[];
  blocked?: string;
  indeterminate?: true;
  pendingChoice?: PendingChoice;
  detail?: Record<string, unknown>;
}

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
const EPS = 1e-9;
const okQty = (q: number) => Number.isFinite(q) && q > 0;
const hasPrice = (l: PromoLineV2) => l.price !== undefined && Number.isFinite(l.price) && l.price >= 0;
const vnd = (n: number) => n.toLocaleString('vi-VN');
const empty = (over: Partial<PromoOutputV2> = {}): PromoOutputV2 => ({ discounts: [], gifts: [], total: 0, touched: [], noPrice: [], ...over });
const matches = (t: { sku: string; itemId?: string }, l: { sku: string; itemId?: string }) => (t.itemId ? l.itemId === t.itemId : l.sku === t.sku);
const orderAmountOf = (lines: PromoLineV2[]): number | null => (lines.some((l) => !hasPrice(l)) ? null : lines.reduce((s, l) => s + Math.round(l.qty * l.price!), 0));

/**
 * Lọc dòng theo phạm vi. `unknown` = các dòng mà phạm vi cần nhóm / nhãn nhưng bộ tính chưa điền (không đoán).
 */
export function scopeLines(scope: PromoScope | undefined, lines: PromoLineV2[]): { lines: PromoLineV2[]; unknown: string[] } {
  const live = lines.filter((l) => okQty(l.qty));
  const skus = scope?.skus ?? [], groups = scope?.groupCodes ?? [], brands = scope?.brandCodes ?? [];
  if (!skus.length && !groups.length && !brands.length) return { lines: live, unknown: [] };
  const out: PromoLineV2[] = [];
  const unknown: string[] = [];
  for (const l of live) {
    if (skus.includes(l.sku)) { out.push(l); continue; }
    if (!groups.length && !brands.length) continue;
    if ((groups.length && l.groupCodes === undefined) || (brands.length && l.brandCode === undefined)) { unknown.push(l.lineKey); continue; }
    const g = !groups.length || (l.groupCodes ?? []).some((x) => groups.includes(x));
    const b = !brands.length || (l.brandCode != null && brands.includes(l.brandCode));
    if (g && b) out.push(l);
  }
  return { lines: out, unknown };
}
const unknownOut = (ctx: PromoContextV2 | undefined, unknown: string[]) => (ctx?.lenient
  ? empty({ indeterminate: true })
  : empty({ blocked: `phạm vi theo nhóm / nhãn — chưa biết nhóm / nhãn của ${unknown.length} dòng (bộ tính tra danh mục)`, detail: { unknown } }));

// ── a) Giá riêng từng dòng (K1) ─────────────────────────────────────────────────────────────────────────────────────
const way = { pct: z.number().positive().max(100).nullish(), amountPerUnit: pos.nullish(), unitPrice: money.nullish() };
export const priceLinesParams = z.object({
  ...common,
  scope: promoScope.optional(),
  basis: z.enum(['qty', 'amount']).default('qty'),
  lines: z.array(z.object({
    sku, itemId: itemId.optional(), ...way,
    tiers: z.array(z.object({ min: pos, ...way }).strict()).min(1).max(20).optional(),
    /** Số lượng tối đa được giảm trên một chứng từ (theo thứ tự dòng). */
    maxQty: pos.optional(),
  }).strict()).min(1).max(500),
}).strict();
export type PriceLinesParams = z.infer<typeof priceLinesParams>;
type Way = { pct?: number | null; amountPerUnit?: number | null; unitPrice?: number | null };
const wayCount = (o: Way) => [o.pct, o.amountPerUnit, o.unitPrice].filter((x) => x !== null && x !== undefined).length;
const hasWay = (o: Way) => wayCount(o) > 0;
function discountOf(qty: number, price: number, w: Way): number {
  const g = Math.round(qty * price);
  const raw = w.pct != null ? Math.round((g * w.pct) / 100) : w.amountPerUnit != null ? Math.round(qty * w.amountPerUnit) : g - Math.round(qty * (w.unitPrice ?? 0));
  return Math.min(g, Math.max(0, raw));
}

export function evaluatePriceLines(p: PriceLinesParams, input: PromoInputV2): PromoOutputV2 {
  const ctx = input.context;
  const all = input.lines.filter((l) => okQty(l.qty));
  const blocked = conditionsBlock(p.conditions, ctx, orderAmountOf(all));
  if (blocked) return empty({ blocked });
  const sc = scopeLines(p.scope, input.lines);
  if (sc.unknown.length) return unknownOut(ctx, sc.unknown);
  const owner = new Map<string, number>(); // dòng giỏ → dòng chương trình đầu tiên khớp
  for (const l of sc.lines) { const i = p.lines.findIndex((e) => matches(e, l)); if (i >= 0) owner.set(l.lineKey, i); }
  const hit = sc.lines.filter((l) => owner.has(l.lineKey));
  if (!hit.length) return empty({ blocked: 'giỏ không có mã nào của chương trình' });
  if (hit.some((l) => !hasPrice(l)) && ctx?.lenient) return empty({ indeterminate: true });
  const discounts: PromoDiscount[] = [];
  const noPrice = hit.filter((l) => !hasPrice(l)).map((l) => l.lineKey);
  const entries: Record<string, unknown>[] = [];
  p.lines.forEach((e, i) => {
    const ls = hit.filter((l) => owner.get(l.lineKey) === i && hasPrice(l));
    if (!ls.length) return;
    const base = p.basis === 'qty' ? r4(ls.reduce((s, l) => s + l.qty, 0)) : ls.reduce((s, l) => s + Math.round(l.qty * l.price!), 0);
    const tier = e.tiers ? [...e.tiers].reverse().find((t) => base >= t.min - EPS) : undefined;
    const w: Way | undefined = e.tiers ? tier : e;
    entries.push({ sku: e.sku, base, ...(tier ? { tierMin: tier.min } : {}) });
    if (!w || !hasWay(w)) return;
    let room = e.maxQty ?? Infinity;
    for (const l of ls) {
      if (room <= EPS) break;
      const q = Math.min(l.qty, room); room = r4(room - q);
      const amount = discountOf(q, l.price!, w);
      if (amount > 0) discounts.push({ lineKey: l.lineKey, sku: l.sku, qty: l.qty, amount });
    }
  });
  const total = discounts.reduce((s, d) => s + d.amount, 0);
  const touched = hit.map((l) => l.lineKey);
  if (!discounts.length) return empty({ blocked: 'chưa dòng nào đạt mức giảm của chương trình', noPrice, detail: { entries } });
  return { discounts, gifts: [], total, touched, noPrice, detail: { entries } };
}

// ── b) Mua nhiều mã, quà lựa chọn (K2a, K2b) ──────────────────────────────────────────────────────────────────────────
const target = z.object({ sku, itemId: itemId.optional(), qty: pos.optional() }).strict();
export const buyXGetYV2Params = z.object({
  ...common,
  scope: promoScope.optional(),
  buy: z.object({
    /** Mã phải mua. Trống = mọi dòng trong phạm vi (cần `scope`). */
    items: z.array(target).max(50).default([]),
    /** any: Σ số lượng các mã ≥ qty; all: đủ `items[].qty` từng mã. */
    mode: z.enum(['any', 'all']).default('any'),
    qty: pos.optional(),
  }).strict(),
  get: z.object({
    options: z.array(z.object({ sku, itemId: itemId.optional(), qty: pos }).strict()).min(1).max(20),
    choose: z.number().int().min(1).max(20).default(1),
  }).strict(),
  repeat: z.boolean().default(true),
  maxGiftQty: pos.optional(),
}).strict();
export type BuyXGetYV2Params = z.infer<typeof buyXGetYV2Params>;

export function evaluateBuyXGetYV2(p: BuyXGetYV2Params, input: PromoInputV2): PromoOutputV2 {
  const ctx = input.context;
  const blocked = conditionsBlock(p.conditions, ctx, orderAmountOf(input.lines.filter((l) => okQty(l.qty))));
  if (blocked) return empty({ blocked });
  const sc = scopeLines(p.scope, input.lines);
  if (sc.unknown.length) return unknownOut(ctx, sc.unknown);
  const buyLines = p.buy.items.length ? sc.lines.filter((l) => p.buy.items.some((t) => matches(t, l))) : sc.lines;
  const qtyOf = (t: { sku: string; itemId?: string }) => r4(buyLines.filter((l) => matches(t, l)).reduce((s, l) => s + l.qty, 0));
  const bought = r4(buyLines.reduce((s, l) => s + l.qty, 0));
  let times: number;
  if (p.buy.mode === 'all') times = Math.min(...p.buy.items.map((t) => Math.floor(qtyOf(t) / (t.qty ?? 1) + EPS)));
  else times = Math.floor(bought / (p.buy.qty ?? 1) + EPS);
  if (!p.repeat) times = Math.min(times, 1);
  if (!Number.isFinite(times) || times <= 0) {
    const need = p.buy.mode === 'all'
      ? p.buy.items.map((t) => `${t.qty ?? 1} ${t.sku}`).join(' và ')
      : `${p.buy.qty ?? 1} trong ${p.buy.items.length ? p.buy.items.map((t) => t.sku).join(', ') : 'phạm vi'}`;
    return empty({ blocked: `chưa đủ điều kiện mua (${need}); mới mua ${bought}`, detail: { bought, times: 0 } });
  }
  const touched = buyLines.map((l) => l.lineKey);
  const cap = (list: GiftOut[]) => {
    let room = p.maxGiftQty ?? Infinity;
    const out: GiftOut[] = [];
    for (const g of list) { const q = r4(Math.min(g.qty, room)); if (q <= 0) break; out.push({ ...g, qty: q }); room = r4(room - q); }
    return out;
  };
  const per = (o: { sku: string; itemId?: string; qty: number }): GiftOut => ({ sku: o.sku, ...(o.itemId ? { itemId: o.itemId } : {}), qty: r4(times * o.qty) });
  const opts = p.get.options;
  const detail = { bought, times };
  if (opts.length <= p.get.choose) return { discounts: [], gifts: cap(opts.map(per)), total: 0, touched, noPrice: [], detail };
  const chosen = [...new Set((ctx?.giftChoice ?? []).map((x) => x.trim()).filter(Boolean))];
  const pending = (problem?: string): PromoOutputV2 => (ctx?.lenient
    ? empty({ indeterminate: true })
    : { ...empty({ touched, detail }), pendingChoice: { choose: p.get.choose, times, options: opts.map((o) => cap([per(o)])[0]!), ...(problem ? { problem } : {}) } });
  if (!chosen.length) return pending();
  const wrong = chosen.filter((s) => !opts.some((o) => o.sku === s));
  if (wrong.length) return pending(`${wrong.join(', ')} không có trong danh sách quà của chương trình`);
  if (chosen.length !== p.get.choose) return pending(`phải chọn ${p.get.choose} món quà, đang chọn ${chosen.length}`);
  return { discounts: [], gifts: cap(opts.filter((o) => chosen.includes(o.sku)).map(per)), total: 0, touched, noPrice: [], detail };
}

// ── c) Quà theo tổng đơn, nhân bội số (K4) ────────────────────────────────────────────────────────────────────────────
export const orderGiftV2Params = z.object({
  ...common,
  scope: promoScope.optional(),
  tiers: z.array(z.object({ minOrder: money, gifts: z.array(z.object({ sku, itemId: itemId.optional(), qty: pos }).strict()).min(1).max(20) }).strict()).min(1).max(20),
  /** Bật: tặng floor(tổng đơn / ngưỡng của bậc đạt được) lần quà của bậc đó. */
  multiply: z.boolean().default(false),
  maxTimes: z.number().int().positive().optional(),
}).strict();
export type OrderGiftV2Params = z.infer<typeof orderGiftV2Params>;

export function evaluateOrderGiftV2(p: OrderGiftV2Params, input: PromoInputV2): PromoOutputV2 {
  const ctx = input.context;
  const sc = scopeLines(p.scope, input.lines);
  if (sc.unknown.length) return unknownOut(ctx, sc.unknown);
  const amount = orderAmountOf(sc.lines);
  if (amount === null) return ctx?.lenient ? empty({ indeterminate: true }) : empty({ blocked: 'cần đơn giá các dòng để tính tổng đơn', noPrice: sc.lines.filter((l) => !hasPrice(l)).map((l) => l.lineKey) });
  const blocked = conditionsBlock(p.conditions, ctx, orderAmountOf(input.lines.filter((l) => okQty(l.qty))));
  if (blocked) return empty({ blocked });
  const tier = [...p.tiers].reverse().find((t) => amount >= t.minOrder);
  if (!tier) return empty({ blocked: `tổng đơn ${vnd(amount)} chưa đủ ${vnd(p.tiers[0]!.minOrder)}`, detail: { orderAmount: amount } });
  let times = p.multiply && tier.minOrder > 0 ? Math.floor(amount / tier.minOrder) : 1;
  if (p.multiply && p.maxTimes !== undefined) times = Math.min(times, p.maxTimes);
  return {
    discounts: [], gifts: tier.gifts.map((g) => ({ sku: g.sku, ...(g.itemId ? { itemId: g.itemId } : {}), qty: r4(g.qty * times) })), total: 0,
    touched: sc.lines.map((l) => l.lineKey), noPrice: [], detail: { orderAmount: amount, tierMin: tier.minOrder, times },
  };
}

// ── Bộ ca chuẩn (NT-BH-040 §4, §5) ────────────────────────────────────────────────────────────────────────────────────
const L = (lineKey: string, s: string, qty: number, price?: number, extra: Partial<PromoLineV2> = {}): PromoLineV2 => ({ lineKey, sku: s, qty, ...(price !== undefined ? { price } : {}), ...extra });
const base = { priority: 0, exclusive: false, legalCapPct: 50 } as const;
type V<P> = { name: string; params: P; input: PromoInputV2; output: PromoOutputV2 };

export const priceLinesVectors: V<PriceLinesParams>[] = [
  { name: 'ca 1: A giá 90.000, B giảm 10 % — 2 A (100.000), 1 B (200.000) → giảm 20.000 + 20.000',
    params: { ...base, basis: 'qty', lines: [{ sku: 'A', unitPrice: 90_000 }, { sku: 'B', pct: 10 }] }, input: { lines: [L('a', 'A', 2, 100_000), L('b', 'B', 1, 200_000), L('c', 'C', 1, 50_000)] },
    output: { discounts: [{ lineKey: 'a', sku: 'A', qty: 2, amount: 20_000 }, { lineKey: 'b', sku: 'B', qty: 1, amount: 20_000 }], gifts: [], total: 40_000, touched: ['a', 'b'], noPrice: [], detail: { entries: [{ sku: 'A', base: 2 }, { sku: 'B', base: 1 }] } } },
  { name: 'bậc riêng từng mã: A từ 3 cái giảm 10 %, từ 5 cái 20 %; B từ 2 cái giảm 5.000 / cái — 5 A, 1 B',
    params: { ...base, basis: 'qty', lines: [{ sku: 'A', tiers: [{ min: 3, pct: 10 }, { min: 5, pct: 20 }] }, { sku: 'B', tiers: [{ min: 2, amountPerUnit: 5_000 }] }] },
    input: { lines: [L('a', 'A', 5, 100_000), L('b', 'B', 1, 200_000)] },
    output: { discounts: [{ lineKey: 'a', sku: 'A', qty: 5, amount: 100_000 }], gifts: [], total: 100_000, touched: ['a', 'b'], noPrice: [], detail: { entries: [{ sku: 'A', base: 5, tierMin: 5 }, { sku: 'B', base: 1 }] } } },
  { name: 'maxQty 3: 5 A chỉ giảm 3 cái (10.000 / cái), rải theo thứ tự dòng',
    params: { ...base, basis: 'qty', lines: [{ sku: 'A', amountPerUnit: 10_000, maxQty: 3 }] }, input: { lines: [L('a1', 'A', 2, 100_000), L('a2', 'A', 3, 100_000)] },
    output: { discounts: [{ lineKey: 'a1', sku: 'A', qty: 2, amount: 20_000 }, { lineKey: 'a2', sku: 'A', qty: 3, amount: 10_000 }], gifts: [], total: 30_000, touched: ['a1', 'a2'], noPrice: [], detail: { entries: [{ sku: 'A', base: 5 }] } } },
  { name: 'làm tròn đồng: 3 A × 33.333 giảm 15 % → 15.000',
    params: { ...base, basis: 'qty', lines: [{ sku: 'A', pct: 15 }] }, input: { lines: [L('a', 'A', 3, 33_333)] },
    output: { discounts: [{ lineKey: 'a', sku: 'A', qty: 3, amount: 15_000 }], gifts: [], total: 15_000, touched: ['a'], noPrice: [], detail: { entries: [{ sku: 'A', base: 3 }] } } },
  { name: 'giỏ không có mã của chương trình → không áp',
    params: { ...base, basis: 'qty', lines: [{ sku: 'A', pct: 10 }] }, input: { lines: [L('c', 'C', 1, 50_000)] },
    output: { discounts: [], gifts: [], total: 0, touched: [], noPrice: [], blocked: 'giỏ không có mã nào của chương trình' } },
  { name: 'ca 6: phạm vi nhóm SUA-BOT — dòng thuộc nhóm khác → không áp',
    params: { ...base, basis: 'qty', scope: { groupCodes: ['SUA-BOT'] }, lines: [{ sku: 'A', pct: 10 }] }, input: { lines: [L('a', 'A', 1, 100_000, { groupCodes: ['SUA-NUOC'], brandCode: null })] },
    output: { discounts: [], gifts: [], total: 0, touched: [], noPrice: [], blocked: 'giỏ không có mã nào của chương trình' } },
  { name: 'phạm vi nhóm SUA-BOT: dòng thuộc nhóm con (nhóm cha SUA-BOT) → áp',
    params: { ...base, basis: 'qty', scope: { groupCodes: ['SUA-BOT'] }, lines: [{ sku: 'A', pct: 10 }] }, input: { lines: [L('a', 'A', 1, 100_000, { groupCodes: ['SUA-BOT-1', 'SUA-BOT'], brandCode: 'VNM' })] },
    output: { discounts: [{ lineKey: 'a', sku: 'A', qty: 1, amount: 10_000 }], gifts: [], total: 10_000, touched: ['a'], noPrice: [], detail: { entries: [{ sku: 'A', base: 1 }] } } },
];

const any3: BuyXGetYV2Params = {
  ...base, buy: { items: [{ sku: 'A' }, { sku: 'B' }], mode: 'any', qty: 3 }, get: { options: [{ sku: 'Q1', qty: 1 }, { sku: 'Q2', qty: 1 }], choose: 1 }, repeat: true,
};
const AB = [L('a', 'A', 2), L('b', 'B', 1)];
export const buyXGetYV2Vectors: V<BuyXGetYV2Params>[] = [
  { name: 'ca 2: any — mua 3 trong {A, B}, chọn Q2 → tặng 1 Q2', params: any3, input: { lines: AB, context: { giftChoice: ['Q2'] } },
    output: { discounts: [], gifts: [{ sku: 'Q2', qty: 1 }], total: 0, touched: ['a', 'b'], noPrice: [], detail: { bought: 3, times: 1 } } },
  { name: 'ca 3: như ca 2, chưa chọn quà → pendingChoice (Q1, Q2)', params: any3, input: { lines: AB },
    output: { discounts: [], gifts: [], total: 0, touched: ['a', 'b'], noPrice: [], detail: { bought: 3, times: 1 }, pendingChoice: { choose: 1, times: 1, options: [{ sku: 'Q1', qty: 1 }, { sku: 'Q2', qty: 1 }] } } },
  { name: 'chọn sai món (Q9) → pendingChoice kèm lý do', params: any3, input: { lines: AB, context: { giftChoice: ['Q9'] } },
    output: { discounts: [], gifts: [], total: 0, touched: ['a', 'b'], noPrice: [], detail: { bought: 3, times: 1 }, pendingChoice: { choose: 1, times: 1, options: [{ sku: 'Q1', qty: 1 }, { sku: 'Q2', qty: 1 }], problem: 'Q9 không có trong danh sách quà của chương trình' } } },
  { name: 'chọn thừa (Q1, Q2 khi chỉ được 1) → pendingChoice kèm lý do', params: any3, input: { lines: AB, context: { giftChoice: ['Q1', 'Q2'] } },
    output: { discounts: [], gifts: [], total: 0, touched: ['a', 'b'], noPrice: [], detail: { bought: 3, times: 1 }, pendingChoice: { choose: 1, times: 1, options: [{ sku: 'Q1', qty: 1 }, { sku: 'Q2', qty: 1 }], problem: 'phải chọn 1 món quà, đang chọn 2' } } },
  { name: 'chọn thiếu (chọn 2, mới chọn Q1) → pendingChoice kèm lý do',
    params: { ...any3, get: { options: [{ sku: 'Q1', qty: 1 }, { sku: 'Q2', qty: 1 }, { sku: 'Q3', qty: 1 }], choose: 2 } }, input: { lines: AB, context: { giftChoice: ['Q1'] } },
    output: { discounts: [], gifts: [], total: 0, touched: ['a', 'b'], noPrice: [], detail: { bought: 3, times: 1 }, pendingChoice: { choose: 2, times: 1, options: [{ sku: 'Q1', qty: 1 }, { sku: 'Q2', qty: 1 }, { sku: 'Q3', qty: 1 }], problem: 'phải chọn 2 món quà, đang chọn 1' } } },
  { name: 'chọn đủ 2 trong 3 → tặng theo thứ tự danh sách quà',
    params: { ...any3, get: { options: [{ sku: 'Q1', qty: 1 }, { sku: 'Q2', qty: 2 }, { sku: 'Q3', qty: 1 }], choose: 2 } }, input: { lines: AB, context: { giftChoice: ['Q3', 'Q2'] } },
    output: { discounts: [], gifts: [{ sku: 'Q2', qty: 2 }, { sku: 'Q3', qty: 1 }], total: 0, touched: ['a', 'b'], noPrice: [], detail: { bought: 3, times: 1 } } },
  { name: 'any lặp lại: 7 món → 2 lần, chỉ một quà thì không cần chọn',
    params: { ...any3, get: { options: [{ sku: 'Q1', qty: 1 }], choose: 1 } }, input: { lines: [L('a', 'A', 4), L('b', 'B', 3), L('c', 'C', 9)] },
    output: { discounts: [], gifts: [{ sku: 'Q1', qty: 2 }], total: 0, touched: ['a', 'b'], noPrice: [], detail: { bought: 7, times: 2 } } },
  { name: 'ca 4: all — mua đủ 1 A và 1 B; giỏ 2 A → không tặng',
    params: { ...base, buy: { items: [{ sku: 'A', qty: 1 }, { sku: 'B', qty: 1 }], mode: 'all' }, get: { options: [{ sku: 'Q1', qty: 1 }], choose: 1 }, repeat: true }, input: { lines: [L('a', 'A', 2)] },
    output: { discounts: [], gifts: [], total: 0, touched: [], noPrice: [], blocked: 'chưa đủ điều kiện mua (1 A và 1 B); mới mua 2', detail: { bought: 2, times: 0 } } },
  { name: 'all — 2 A + 1 B → 1 lần (thiếu B cho lần hai)',
    params: { ...base, buy: { items: [{ sku: 'A', qty: 1 }, { sku: 'B', qty: 1 }], mode: 'all' }, get: { options: [{ sku: 'Q1', qty: 1 }], choose: 1 }, repeat: true }, input: { lines: [L('a', 'A', 2), L('b', 'B', 1)] },
    output: { discounts: [], gifts: [{ sku: 'Q1', qty: 1 }], total: 0, touched: ['a', 'b'], noPrice: [], detail: { bought: 3, times: 1 } } },
  { name: 'maxGiftQty 1 kẹp quà dù đủ 2 lần',
    params: { ...any3, get: { options: [{ sku: 'Q1', qty: 1 }], choose: 1 }, maxGiftQty: 1 }, input: { lines: [L('a', 'A', 6)] },
    output: { discounts: [], gifts: [{ sku: 'Q1', qty: 1 }], total: 0, touched: ['a'], noPrice: [], detail: { bought: 6, times: 2 } } },
  { name: 'phạm vi nhãn VNM, mua 2 bất kỳ (items trống) → chỉ tính dòng nhãn VNM',
    params: { ...base, scope: { brandCodes: ['VNM'] }, buy: { items: [], mode: 'any', qty: 2 }, get: { options: [{ sku: 'Q1', qty: 1 }], choose: 1 }, repeat: true },
    input: { lines: [L('a', 'A', 1, undefined, { groupCodes: [], brandCode: 'VNM' }), L('b', 'B', 5, undefined, { groupCodes: [], brandCode: 'TH' }), L('c', 'C', 1, undefined, { groupCodes: [], brandCode: 'VNM' })] },
    output: { discounts: [], gifts: [{ sku: 'Q1', qty: 1 }], total: 0, touched: ['a', 'c'], noPrice: [], detail: { bought: 2, times: 1 } } },
  { name: 'phạm vi nhãn nhưng dòng chưa có nhãn (bộ tính chưa tra) → chặn, không đoán',
    params: { ...base, scope: { brandCodes: ['VNM'] }, buy: { items: [], mode: 'any', qty: 1 }, get: { options: [{ sku: 'Q1', qty: 1 }], choose: 1 }, repeat: true }, input: { lines: [L('a', 'A', 1)] },
    output: { discounts: [], gifts: [], total: 0, touched: [], noPrice: [], blocked: 'phạm vi theo nhóm / nhãn — chưa biết nhóm / nhãn của 1 dòng (bộ tính tra danh mục)', detail: { unknown: ['a'] } } },
  { name: 'cửa nạp (lenient) chưa biết quà đã chọn → không xác định', params: any3, input: { lines: AB, context: { lenient: true } },
    output: { discounts: [], gifts: [], total: 0, touched: [], noPrice: [], indeterminate: true } },
];

const og = (over: Partial<OrderGiftV2Params> = {}): OrderGiftV2Params => ({ ...base, multiply: true, tiers: [{ minOrder: 1_000_000, gifts: [{ sku: 'Q', qty: 1 }] }], ...over });
export const orderGiftV2Vectors: V<OrderGiftV2Params>[] = [
  { name: 'ca 5: multiply, ngưỡng 1.000.000 tặng 1 Q, maxTimes 3 — tổng 3.500.000 → 3 Q', params: og({ maxTimes: 3 }), input: { lines: [L('a', 'A', 7, 500_000)] },
    output: { discounts: [], gifts: [{ sku: 'Q', qty: 3 }], total: 0, touched: ['a'], noPrice: [], detail: { orderAmount: 3_500_000, tierMin: 1_000_000, times: 3 } } },
  { name: 'maxTimes kẹp: tổng 5.200.000, maxTimes 3 → 3 Q', params: og({ maxTimes: 3 }), input: { lines: [L('a', 'A', 52, 100_000)] },
    output: { discounts: [], gifts: [{ sku: 'Q', qty: 3 }], total: 0, touched: ['a'], noPrice: [], detail: { orderAmount: 5_200_000, tierMin: 1_000_000, times: 3 } } },
  { name: 'không bật multiply: tổng 3.500.000 → 1 Q (như @1)', params: og({ multiply: false }), input: { lines: [L('a', 'A', 7, 500_000)] },
    output: { discounts: [], gifts: [{ sku: 'Q', qty: 1 }], total: 0, touched: ['a'], noPrice: [], detail: { orderAmount: 3_500_000, tierMin: 1_000_000, times: 1 } } },
  { name: 'chưa đủ ngưỡng', params: og(), input: { lines: [L('a', 'A', 1, 900_000)] },
    output: { discounts: [], gifts: [], total: 0, touched: [], noPrice: [], blocked: 'tổng đơn 900.000 chưa đủ 1.000.000', detail: { orderAmount: 900_000 } } },
  { name: 'phạm vi nhóm SUA-BOT: chỉ cộng dòng thuộc nhóm', params: og({ scope: { groupCodes: ['SUA-BOT'] } }),
    input: { lines: [L('a', 'A', 2, 600_000, { groupCodes: ['SUA-BOT'], brandCode: null }), L('b', 'B', 5, 1_000_000, { groupCodes: ['TA'], brandCode: null })] },
    output: { discounts: [], gifts: [{ sku: 'Q', qty: 1 }], total: 0, touched: ['a'], noPrice: [], detail: { orderAmount: 1_200_000, tierMin: 1_000_000, times: 1 } } },
  { name: 'cửa nạp không có giá → không xác định', params: og(), input: { lines: [L('a', 'A', 5)], context: { lenient: true } },
    output: { discounts: [], gifts: [], total: 0, touched: [], noPrice: [], indeterminate: true } },
];

// ── Khuôn ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const commonDocs = [
  { name: 'validFrom / validTo', type: 'YYYY-MM-DD', required: false, doc: 'Thời gian chương trình' },
  { name: 'priority', type: 'số nguyên', required: false, doc: 'Mặc định 0; lớn tính trước' },
  { name: 'exclusive', type: 'boolean', required: false, doc: 'Áp riêng: dòng đã dùng thì chương trình sau không áp' },
  { name: 'conditions', type: 'object', required: false, doc: 'weekdays[1..7], timeFrom / timeTo (HH:MM), minOrderAmount, couponCodes[], birthdayMonth, memberLevels[]' },
  { name: 'legalCapPct', type: 'số 0–100 | null', required: false, doc: 'Trần NĐ81 (mặc định 50 % tiền dòng); null = miễn' },
  { name: 'scope', type: '{ skus?, groupCodes?, brandCodes? }', required: false, doc: 'Phạm vi: mã trong skus, hoặc khớp mọi chiều nhóm (kể cả nhóm cha) / nhãn đã khai; bộ tính tự tra nhóm / nhãn ở danh mục' },
];
const scopeStep = 'phạm vi: dòng có sku ∈ scope.skus, hoặc (groupCodes trống hoặc giao lines[].groupCodes) và (brandCodes trống hoặc chứa lines[].brandCode); thiếu nhóm / nhãn của dòng → chặn (cửa nạp: không xác định)';
const lineInput = 'lines[]: { lineKey, sku, qty, itemId?, price?, groupCodes? (nhóm + nhóm cha, bộ tính điền), brandCode? (bộ tính điền) }; context?';
const dateIssues = (p: { validFrom?: string; validTo?: string }) => (p.validFrom && p.validTo && p.validTo < p.validFrom ? [{ path: 'validTo', message: 'Ngày kết thúc trước ngày bắt đầu' }] : []);
const timeIssues = (p: { conditions?: { timeFrom?: string; timeTo?: string } }) => (p.conditions?.timeFrom && p.conditions.timeTo && p.conditions.timeTo < p.conditions.timeFrom ? [{ path: 'conditions.timeTo', message: 'Giờ kết thúc trước giờ bắt đầu' }] : []);
const ascending = (xs: number[]) => xs.every((x, i) => i === 0 || x > xs[i - 1]!);
const keyOf = (t: { sku: string; itemId?: string }) => t.itemId ?? `sku:${t.sku}`;
const dupIssue = (list: { sku: string; itemId?: string }[], path: string, what: string) => (new Set(list.map(keyOf)).size !== list.length ? [{ path, message: `Một mã chỉ khai một lần trong ${what}` }] : []);
const treat = (o: PromoOutputV2): Treatment[] => [
  ...(o.gifts.length ? [{ on: 'gift', reasonCode: 'XTA1.4', confirmed: false }] : []),
  ...(o.total > 0 ? [{ on: 'discount', reasonCode: 'GGHB', confirmed: false }] : []),
];
const promoWindow = (p: { validFrom?: string; validTo?: string }) => ({ from: p.validFrom, to: p.validTo });
const explainOf = (title: string) => (_p: unknown, o: PromoOutputV2) =>
  o.indeterminate ? `${title}: không tính được (thiếu dữ liệu)`
    : o.pendingChoice ? `${title}: chờ chọn ${o.pendingChoice.choose} quà trong ${o.pendingChoice.options.map((x) => x.sku).join(', ')}${o.pendingChoice.problem ? ` — ${o.pendingChoice.problem}` : ''}`
      : o.blocked ? `${title}: ${o.blocked}`
        : o.gifts.length ? `${title}: tặng ${o.gifts.map((g) => `${g.qty} ${g.sku}`).join(', ')}`
          : `${title}: giảm ${vnd(o.total)} trên ${o.discounts.length} dòng`;

export const salePriceLines: RuleContract<PriceLinesParams, PromoInputV2, PromoOutputV2> = {
  id: 'sale.promo.price_lines@2', domain: 'sale', title: 'Giá riêng từng mã (nhiều mã, mỗi mã một giá / một bậc)', params: priceLinesParams,
  publishChecks: (p) => [
    ...dateIssues(p), ...timeIssues(p), ...dupIssue(p.lines, 'lines', 'chương trình'),
    ...p.lines.flatMap((e, i) => {
      if (e.tiers) {
        return [
          ...(hasWay(e) ? [{ path: `lines.${i}`, message: `${e.sku}: đã khai bậc thì không khai thêm cách giảm của dòng` }] : []),
          ...(!ascending(e.tiers.map((t) => t.min)) ? [{ path: `lines.${i}.tiers`, message: `${e.sku}: các bậc phải tăng dần, không trùng mức` }] : []),
          ...e.tiers.flatMap((t, j) => (wayCount(t) === 1 ? [] : [{ path: `lines.${i}.tiers.${j}`, message: `${e.sku}: mỗi bậc chọn đúng một cách giảm: pct, amountPerUnit hoặc unitPrice` }])),
        ];
      }
      return wayCount(e) === 1 ? [] : [{ path: `lines.${i}`, message: `${e.sku}: chọn đúng một cách giảm (pct, amountPerUnit, unitPrice) hoặc khai bậc` }];
    }),
  ],
  window: promoWindow, evaluate: evaluatePriceLines, explain: explainOf('Giá riêng từng mã'), treatment: treat,
  describe: () => ({
    params: [...commonDocs,
      { name: 'basis', type: "'qty' | 'amount'", required: false, doc: 'Xét bậc theo số lượng (mặc định) hay tiền của chính mã đó' },
      { name: 'lines', type: '[{ sku, itemId?, pct | amountPerUnit | unitPrice, tiers?[{ min, pct | amountPerUnit | unitPrice }], maxQty? }]', required: true, doc: '1–500 mã; mỗi mã một cách giảm hoặc một bảng bậc riêng; maxQty = số lượng tối đa được giảm trên một chứng từ' }],
    spec: {
      input: lineInput,
      steps: ['kiểm điều kiện chung', scopeStep, 'mỗi dòng giỏ thuộc dòng chương trình ĐẦU TIÊN khớp (itemId nếu có, không thì sku)',
        'mỗi dòng chương trình: base = Σ qty (hoặc Σ tiền) các dòng giỏ của nó; có tiers thì lấy bậc cao nhất min ≤ base, không có bậc thì không giảm',
        'giảm từng dòng giỏ theo cách của dòng / bậc trên min(qty, phần maxQty còn lại), kẹp [0, tiền phần đó], làm tròn đồng'],
      output: 'PromoOutput (discounts theo dòng; detail.entries[{ sku, base, tierMin? }])',
    },
    vectors: priceLinesVectors,
  }),
};

export const saleBuyXGetYV2: RuleContract<BuyXGetYV2Params, PromoInputV2, PromoOutputV2> = {
  id: 'sale.promo.buy_x_get_y@2', domain: 'sale', title: 'Mua nhiều mã tặng quà (quà lựa chọn)', params: buyXGetYV2Params,
  publishChecks: (p) => [
    ...dateIssues(p), ...timeIssues(p), ...dupIssue(p.buy.items, 'buy.items', 'phần mua'), ...dupIssue(p.get.options, 'get.options', 'danh sách quà'),
    ...(p.buy.mode === 'any' && p.buy.qty === undefined ? [{ path: 'buy.qty', message: 'Kiểu "mua bất kỳ" cần tổng số lượng phải mua' }] : []),
    ...(p.buy.mode === 'all' && !p.buy.items.length ? [{ path: 'buy.items', message: 'Kiểu "mua đủ từng mã" cần danh sách mã phải mua' }] : []),
    ...(p.buy.mode === 'all' ? p.buy.items.flatMap((t, i) => (t.qty === undefined ? [{ path: `buy.items.${i}.qty`, message: `${t.sku}: kiểu "mua đủ từng mã" cần số lượng của mã` }] : [])) : []),
    ...(!p.buy.items.length && !(p.scope?.skus?.length || p.scope?.groupCodes?.length || p.scope?.brandCodes?.length) ? [{ path: 'buy.items', message: 'Chưa khai mã phải mua hoặc phạm vi (nhóm / nhãn)' }] : []),
    ...(p.get.choose > p.get.options.length ? [{ path: 'get.choose', message: `Số quà được chọn (${p.get.choose}) lớn hơn số quà khai (${p.get.options.length})` }] : []),
    ...(p.maxGiftQty !== undefined && p.maxGiftQty < Math.min(...p.get.options.map((o) => o.qty)) ? [{ path: 'maxGiftQty', message: 'Trần quà nhỏ hơn số quà một lần — chính sách không bao giờ tặng đủ' }] : []),
  ],
  window: promoWindow, evaluate: evaluateBuyXGetYV2, explain: explainOf('Mua tặng quà'), treatment: treat,
  describe: () => ({
    params: [...commonDocs,
      { name: 'buy.items', type: '[{ sku, itemId?, qty? }]', required: false, doc: '0–50 mã phải mua; trống = mọi dòng trong phạm vi' },
      { name: 'buy.mode', type: "'any' | 'all'", required: false, doc: 'any (mặc định): Σ số lượng các mã ≥ buy.qty; all: đủ items[].qty từng mã' },
      { name: 'buy.qty', type: 'number > 0', required: false, doc: 'Tổng số lượng một lần (kiểu any)' },
      { name: 'get.options', type: '[{ sku, itemId?, qty }]', required: true, doc: '1–20 món quà, số lượng một lần' },
      { name: 'get.choose', type: 'số nguyên 1..options', required: false, doc: 'Khách chọn bao nhiêu món (mặc định 1); bằng số món khai = tặng hết, không cần chọn' },
      { name: 'repeat', type: 'boolean', required: false, doc: 'Mặc định true' },
      { name: 'maxGiftQty', type: 'number > 0', required: false, doc: 'Trần tổng số lượng quà trên một chứng từ (theo thứ tự danh sách quà)' }],
    spec: {
      input: `${lineInput} — context.giftChoice: mã quà đã chọn cho chương trình này`,
      steps: ['kiểm điều kiện chung', scopeStep, 'dòng mua = dòng trong phạm vi khớp một buy.items (trống = mọi dòng trong phạm vi)',
        'any: times = floor(Σ qty / buy.qty + 1e-9); all: times = min floor(qty mã / items[].qty + 1e-9); repeat = false → times ≤ 1',
        'options ≤ choose → tặng hết; không thì cần context.giftChoice: trống → pendingChoice; có mã ngoài options / số mã ≠ choose → pendingChoice + problem',
        'quà = món đã chọn theo thứ tự options, qty = round4(times × qty); kẹp maxGiftQty theo thứ tự', 'cửa nạp (lenient) cần chọn mà không biết lựa chọn → indeterminate'],
      output: 'PromoOutput + pendingChoice?{ choose, times, options[], problem? }',
    },
    vectors: buyXGetYV2Vectors,
  }),
};

export const saleOrderGiftV2: RuleContract<OrderGiftV2Params, PromoInputV2, PromoOutputV2> = {
  id: 'sale.promo.order_gift@2', domain: 'sale', title: 'Quà theo tổng đơn (nhân bội số)', params: orderGiftV2Params,
  publishChecks: (p) => [
    ...dateIssues(p), ...timeIssues(p),
    ...(!ascending(p.tiers.map((t) => t.minOrder)) ? [{ path: 'tiers', message: 'Các bậc tổng đơn phải tăng dần, không trùng mức' }] : []),
    ...(p.multiply && p.tiers.some((t) => t.minOrder <= 0) ? [{ path: 'tiers', message: 'Nhân bội số cần ngưỡng tổng đơn > 0 ở mọi bậc' }] : []),
    ...(!p.multiply && p.maxTimes !== undefined ? [{ path: 'maxTimes', message: 'Số lần tối đa chỉ dùng khi bật nhân bội số' }] : []),
  ],
  window: promoWindow, evaluate: evaluateOrderGiftV2, explain: explainOf('Quà tổng đơn'), treatment: treat,
  describe: () => ({
    params: [...commonDocs,
      { name: 'tiers', type: '[{ minOrder, gifts[{ sku, itemId?, qty }] }]', required: true, doc: 'Quà của bậc cao nhất đạt được' },
      { name: 'multiply', type: 'boolean', required: false, doc: 'Bật: tặng floor(tổng đơn / ngưỡng bậc) lần quà' },
      { name: 'maxTimes', type: 'số nguyên > 0', required: false, doc: 'Trần số lần khi nhân bội số' }],
    spec: {
      input: lineInput,
      steps: [scopeStep, 'tổng đơn = Σ tiền trọn các dòng trong phạm vi (thiếu giá ở cửa nạp → không xác định)', 'kiểm điều kiện chung',
        'bậc cao nhất có minOrder ≤ tổng đơn', 'times = multiply ? min(floor(tổng đơn / minOrder), maxTimes) : 1; quà = qty × times (round4)'],
      output: 'PromoOutput (detail.times)',
    },
    vectors: orderGiftV2Vectors,
  }),
};

export const SALE_PROMO_V2_CONTRACTS = [salePriceLines, saleBuyXGetYV2, saleOrderGiftV2];
