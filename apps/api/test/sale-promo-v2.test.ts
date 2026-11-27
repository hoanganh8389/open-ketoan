// [2026-11-25 10:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-040 §4, §5: khuôn sale.promo.*@2 qua hàm thuần và qua endpoint; @1 giữ nguyên (đóng góp)
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buyXGetYV2Vectors, orderGiftV2Vectors, poolComboVectors, priceLinesVectors, saleBuyXGetYV2, saleOrderGiftV2, salePoolCombo, salePriceLines, scopeLines,
} from '../src/modules/system/rule-contracts/sale-promo-v2.js';
import {
  cheapestFreeVectors, comboVectors, orderDiscountVectors, orderGiftVectors, saleCheapestFree, saleCombo, saleOrderDiscount, saleOrderGift, saleTiered, tieredVectors,
} from '../src/modules/system/rule-contracts/sale-promo.js';
import { buyXGetYVectors, saleBuyXGetY } from '../src/modules/system/rule-contracts/sale-promo-buy-x-get-y.js';
import { getRuleContract, RULE_CONTRACTS, type AnyRuleContract } from '../src/modules/system/rule-contracts/index.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

type Vec = { name: string; params: unknown; input: { lines: object[]; context?: Record<string, unknown> }; output: Record<string, unknown> };
/** Bộ ca đã khai kiểu riêng → kiểu chung để chạy vòng (không index signature nên qua unknown). */
const vs = (x: unknown) => x as Vec[];
const SETS: [AnyRuleContract, Vec[]][] = [[salePriceLines, vs(priceLinesVectors)], [saleBuyXGetYV2, vs(buyXGetYV2Vectors)], [saleOrderGiftV2, vs(orderGiftV2Vectors)]];
const run = (c: AnyRuleContract, v: Vec) => c.evaluate(c.params.parse(v.params), v.input);
const byName = (vs: Vec[], start: string) => vs.find((v) => v.name.startsWith(start))!;

// [2026-11-27 10:00 AM Võ Hoàng] NGHIEM-THU — NT-BH-049 (S-CD-16): ngữ nghĩa plugin cũ — trần tiền giảm (Tối đa đ), mua X tặng Y "mỗi mã tính riêng",
// quà theo giá trị đơn cho chọn quà, combo bộ sản phẩm (pool) (đóng góp)
describe('NT-BH-049 — khuôn theo plugin chính sách cũ', () => {
  const L = (lineKey: string, sku: string, qty: number, price?: number) => ({ lineKey, sku, qty, ...(price !== undefined ? { price } : {}) });
  const base = { priority: 0, exclusive: false, legalCapPct: null };
  it('price_lines: Tối đa (đ) của dòng kẹp tiền giảm cả mã; bậc có trần riêng', () => {
    const p = salePriceLines.params.parse({ ...base, lines: [{ sku: 'A', pct: 20, maxDiscount: 50_000 }, { sku: 'B', tiers: [{ min: 1, pct: 10 }, { min: 3, pct: 20, maxDiscount: 30_000 }] }] });
    const o = salePriceLines.evaluate(p, { lines: [L('a1', 'A', 2, 100_000), L('a2', 'A', 2, 100_000), L('b', 'B', 3, 100_000)] }) as { discounts: { lineKey: string; amount: number }[]; total: number };
    expect(o.discounts.map((d) => [d.lineKey, d.amount])).toEqual([['a1', 40_000], ['a2', 10_000], ['b', 30_000]]);
    expect(o.total).toBe(80_000);
  });
  it('buy_x_get_y@2 each: mỗi mã tính riêng — 4 A (mua 2) + 3 B (mua 3) → 3 lần quà', () => {
    const p = saleBuyXGetYV2.params.parse({ ...base, buy: { items: [{ sku: 'A', qty: 2 }, { sku: 'B', qty: 3 }], mode: 'each' }, get: { options: [{ sku: 'Q', qty: 1 }], choose: 1 } });
    const o = saleBuyXGetYV2.evaluate(p, { lines: [L('a', 'A', 4, 10_000), L('b', 'B', 3, 10_000)] }) as { gifts: unknown[] };
    expect(o.gifts).toEqual([{ sku: 'Q', qty: 3 }]);
    const none = saleBuyXGetYV2.evaluate(p, { lines: [L('a', 'A', 1, 10_000), L('b', 'B', 2, 10_000)] }) as { gifts: unknown[]; blocked: string };
    expect(none.gifts).toEqual([]);
    expect(none.blocked).toContain('2 A hoặc 3 B');
    expect(saleBuyXGetYV2.publishChecks(saleBuyXGetYV2.params.parse({ ...base, buy: { items: [{ sku: 'A' }], mode: 'each' }, get: { options: [{ sku: 'Q', qty: 1 }] } })).map((x) => x.path)).toContain('buy.items.0.qty');
  });
  it('order_gift@2 choose: hai quà, chọn 1 — chưa chọn → pendingChoice; chọn Q2 → tặng Q2 × số lần', () => {
    const p = saleOrderGiftV2.params.parse({ ...base, tiers: [{ minOrder: 500_000, gifts: [{ sku: 'Q1', qty: 1 }, { sku: 'Q2', qty: 1 }] }], multiply: true, choose: 1 });
    const lines = [L('a', 'A', 1, 1_100_000)];
    const o = saleOrderGiftV2.evaluate(p, { lines }) as { gifts: unknown[]; pendingChoice: { choose: number; times: number; options: { sku: string; qty: number }[] } };
    expect(o.gifts).toEqual([]);
    expect(o.pendingChoice.times).toBe(2);
    expect(o.pendingChoice.options).toEqual([{ sku: 'Q1', qty: 2 }, { sku: 'Q2', qty: 2 }]);
    const c = saleOrderGiftV2.evaluate(p, { lines, context: { giftChoice: ['Q2'] } }) as { gifts: unknown[] };
    expect(c.gifts).toEqual([{ sku: 'Q2', qty: 2 }]);
  });
  it('pool_combo@2: bộ ca chuẩn, đăng ký, kiểm phát hành', () => {
    expect(getRuleContract('sale.promo.pool_combo@2')).toBe(salePoolCombo);
    for (const v of vs(poolComboVectors)) {
      expect(run(salePoolCombo, v), v.name).toEqual(v.output);
      expect(salePoolCombo.publishChecks(salePoolCombo.params.parse(v.params))).toEqual([]);
    }
    expect(salePoolCombo.publishChecks(salePoolCombo.params.parse({ ...base, skus: ['A'], combo: { minDistinct: 3, pct: 10 } })).map((x) => x.path)).toEqual(['combo.minDistinct']);
  });
});

describe('NT-BH-040 — hàm thuần, bộ ca chuẩn', () => {
  it('đăng ký đủ ba khuôn @2, miền sale; describe() trả đúng bộ ca', () => {
    for (const [c, vs] of SETS) {
      expect(RULE_CONTRACTS).toContain(c);
      expect(getRuleContract(c.id)).toBe(c);
      expect(c.domain).toBe('sale');
      expect(c.describe().vectors).toBe(vs);
    }
    expect(SETS.map(([c]) => c.id)).toEqual(['sale.promo.price_lines@2', 'sale.promo.buy_x_get_y@2', 'sale.promo.order_gift@2']);
  });

  it('mọi vector ra đúng đầu ra chuẩn; tham số qua khuôn zod; kiểm phát hành sạch', () => {
    for (const [c, vs] of SETS) {
      for (const v of vs) {
        expect(run(c, v), `${c.id}: ${v.name}`).toEqual(v.output);
        expect(c.publishChecks(c.params.parse(v.params)), `${c.id}: ${v.name}`).toEqual([]);
        expect(typeof c.explain(c.params.parse(v.params), v.output)).toBe('string');
      }
    }
  });

  it('ca 1: price_lines — A giá 90.000, B giảm 10 % → 20.000 + 20.000', () => {
    const o = run(salePriceLines, byName(vs(priceLinesVectors), 'ca 1')) as { discounts: { sku: string; amount: number }[]; total: number };
    expect(o.discounts.map((d) => [d.sku, d.amount])).toEqual([['A', 20_000], ['B', 20_000]]);
    expect(o.total).toBe(40_000);
  });

  it('ca 2 / 3: any + chọn quà; chưa chọn → pendingChoice (Q1, Q2)', () => {
    const v2 = byName(vs(buyXGetYV2Vectors), 'ca 2');
    expect((run(saleBuyXGetYV2, v2) as { gifts: unknown[] }).gifts).toEqual([{ sku: 'Q2', qty: 1 }]);
    const o3 = run(saleBuyXGetYV2, byName(vs(buyXGetYV2Vectors), 'ca 3')) as { gifts: unknown[]; pendingChoice: { options: { sku: string }[]; choose: number } };
    expect(o3.gifts).toEqual([]);
    expect(o3.pendingChoice.options.map((x) => x.sku)).toEqual(['Q1', 'Q2']);
    expect(saleBuyXGetYV2.explain(saleBuyXGetYV2.params.parse(v2.params), o3 as never)).toContain('chờ chọn 1 quà trong Q1, Q2');
  });

  it('ca 4: all — giỏ 2 A thiếu B → không tặng', () => {
    const o = run(saleBuyXGetYV2, byName(vs(buyXGetYV2Vectors), 'ca 4')) as { gifts: unknown[]; blocked: string };
    expect(o.gifts).toEqual([]);
    expect(o.blocked).toContain('1 A và 1 B');
  });

  it('ca 5: order_gift multiply, maxTimes 3, tổng 3.500.000 → 3 Q', () => {
    expect((run(saleOrderGiftV2, byName(vs(orderGiftV2Vectors), 'ca 5')) as { gifts: unknown[] }).gifts).toEqual([{ sku: 'Q', qty: 3 }]);
  });

  it('ca 6: phạm vi nhóm SUA-BOT, dòng thuộc nhóm khác → không áp (cả ba khuôn)', () => {
    const line = { lineKey: 'x', sku: 'A', qty: 3, price: 1_000_000, groupCodes: ['SUA-NUOC'], brandCode: null };
    const scope = { groupCodes: ['SUA-BOT'] };
    const p1 = salePriceLines.params.parse({ scope, lines: [{ sku: 'A', pct: 10 }] });
    const p2 = saleBuyXGetYV2.params.parse({ scope, buy: { items: [{ sku: 'A' }], qty: 1 }, get: { options: [{ sku: 'Q', qty: 1 }] } });
    const p3 = saleOrderGiftV2.params.parse({ scope, tiers: [{ minOrder: 1, gifts: [{ sku: 'Q', qty: 1 }] }] });
    for (const [c, p] of [[salePriceLines, p1], [saleBuyXGetYV2, p2], [saleOrderGiftV2, p3]] as const) {
      const o = (c as AnyRuleContract).evaluate(p, { lines: [line] }) as { gifts: unknown[]; discounts: unknown[]; blocked?: string };
      expect(o.gifts, c.id).toEqual([]);
      expect(o.discounts, c.id).toEqual([]);
      expect(o.blocked, c.id).toBeTruthy();
    }
  });

  it('phạm vi: mã trong skus luôn thuộc; nhóm và nhãn cùng khai thì phải khớp cả hai; chưa biết nhóm → không đoán', () => {
    const L = (k: string, s: string, g: string[] | undefined, b: string | null | undefined) => ({ lineKey: k, sku: s, qty: 1, ...(g ? { groupCodes: g } : {}), ...(b !== undefined ? { brandCode: b } : {}) });
    const r = scopeLines({ skus: ['Z'], groupCodes: ['G'], brandCodes: ['B'] }, [L('1', 'Z', undefined, undefined), L('2', 'A', ['G'], 'B'), L('3', 'A', ['G'], 'X'), L('4', 'A', undefined, 'B')]);
    expect(r.lines.map((l) => l.lineKey)).toEqual(['1', '2']);
    expect(r.unknown).toEqual(['4']);
    expect(scopeLines(undefined, [L('1', 'A', undefined, undefined)]).lines).toHaveLength(1);
  });

  it('kiểm phát hành: dòng nhiều cách giảm / vừa bậc vừa cách giảm, any thiếu qty, all thiếu qty mã, choose > số quà, multiply ngưỡng 0, maxTimes không multiply', () => {
    const issues = (c: AnyRuleContract, p: unknown) => c.publishChecks(c.params.parse(p)).map((x) => x.path);
    expect(issues(salePriceLines, { lines: [{ sku: 'A', pct: 10, unitPrice: 5 }] })).toContain('lines.0');
    expect(issues(salePriceLines, { lines: [{ sku: 'A', pct: 10, tiers: [{ min: 1, pct: 5 }] }] })).toContain('lines.0');
    expect(issues(salePriceLines, { lines: [{ sku: 'A', tiers: [{ min: 5, pct: 5 }, { min: 3, pct: 10 }] }] })).toContain('lines.0.tiers');
    expect(issues(salePriceLines, { lines: [{ sku: 'A', pct: 1 }, { sku: 'A', pct: 2 }] })).toContain('lines');
    expect(issues(saleBuyXGetYV2, { buy: { items: [{ sku: 'A' }] }, get: { options: [{ sku: 'Q', qty: 1 }] } })).toContain('buy.qty');
    expect(issues(saleBuyXGetYV2, { buy: { items: [{ sku: 'A' }], mode: 'all' }, get: { options: [{ sku: 'Q', qty: 1 }] } })).toContain('buy.items.0.qty');
    expect(issues(saleBuyXGetYV2, { buy: { items: [], qty: 1 }, get: { options: [{ sku: 'Q', qty: 1 }] } })).toContain('buy.items');
    expect(issues(saleBuyXGetYV2, { buy: { items: [{ sku: 'A' }], qty: 1 }, get: { options: [{ sku: 'Q', qty: 1 }], choose: 2 } })).toContain('get.choose');
    expect(issues(saleOrderGiftV2, { multiply: true, tiers: [{ minOrder: 0, gifts: [{ sku: 'Q', qty: 1 }] }] })).toContain('tiers');
    expect(issues(saleOrderGiftV2, { maxTimes: 2, tiers: [{ minOrder: 1, gifts: [{ sku: 'Q', qty: 1 }] }] })).toContain('maxTimes');
    expect(salePriceLines.params.safeParse({ lines: [] }).success).toBe(false);
    expect(saleBuyXGetYV2.params.safeParse({ buy: { items: [] }, get: { options: [] } }).success).toBe(false);
  });

  it('ca 7: khuôn @1 chạy y như cũ — bộ ca mẫu hiện có không đổi', () => {
    const v1: [AnyRuleContract, Vec[]][] = [[saleTiered, vs(tieredVectors)], [saleOrderDiscount, vs(orderDiscountVectors)], [saleOrderGift, vs(orderGiftVectors)],
      [saleCombo, vs(comboVectors)], [saleCheapestFree, vs(cheapestFreeVectors)], [saleBuyXGetY, vs(buyXGetYVectors)]];
    for (const [c, vs] of v1) {
      expect(getRuleContract(c.id), c.id).toBe(c);
      for (const v of vs) expect(c.evaluate(c.params.parse(v.params), v.input), `${c.id}: ${v.name}`).toEqual(v.output);
    }
    expect([tieredVectors, orderDiscountVectors, orderGiftVectors, comboVectors, cheapestFreeVectors, buyXGetYVectors].map((x) => x.length)).toEqual([4, 3, 3, 2, 3, 9]);
  });
});

describe('NT-BH-040 — qua endpoint (phát hành nội tuyến → evaluate)', () => {
  let ctx: TestCtx;
  beforeAll(async () => { ctx = await setupTenant(); });
  afterAll(async () => { await ctx.app.close(); });

  it('ba khuôn @2 phát hành được; ca không cần nhóm / nhãn và không cần chọn quà ra đúng như hàm thuần', async () => {
    let n = 0;
    for (const [c, vs] of SETS) {
      for (const v of vs) {
        // Ca cửa nạp, ca phạm vi nhóm / nhãn (bộ tính tra danh mục) và ca chọn quà (giftChoice) chờ nối ở policy-service — xem báo cáo NT-BH-040.
        const needsEngine = v.input.context?.lenient || v.input.context?.giftChoice || v.input.lines.some((l) => 'groupCodes' in l || 'brandCode' in l)
          || (v.output as { pendingChoice?: unknown }).pendingChoice || (v.output as { detail?: { unknown?: unknown } }).detail?.unknown
          // NT-BH-049: ca có ngữ cảnh (giờ, khách, ngày) chạy ở hàm thuần — vòng này gọi evaluate không kèm ngữ cảnh.
          || Object.keys(v.input.context ?? {}).length > 0;
        if (needsEngine) continue;
        const key = `KM2-${++n}`;
        const pub = await call(ctx, 'POST', '/api/v1/policies', { key, ruleContract: c.id, params: v.params, effectiveFrom: '2026-01-01', reason: 'Bộ ca chuẩn khuyến mại @2' });
        expect(pub.status, `${c.id} ${v.name}: ${JSON.stringify(pub.body)}`).toBe(201);
        const ev = await call(ctx, 'POST', '/api/v1/policies/evaluate', { docDate: '2026-06-15', lines: v.input.lines, policies: [{ key }] });
        expect(ev.status, `${v.name}: ${JSON.stringify(ev.body)}`).toBe(200);
        const d = ev.body.data;
        const out = v.output as { discounts: { lineKey: string; amount: number }[]; gifts: { sku: string; qty: number }[]; blocked?: string };
        expect(d.discounts.map((x: { lineKey: string; amount: number }) => [x.lineKey, x.amount]), `${c.id} ${v.name}`).toEqual(out.discounts.map((x) => [x.lineKey, x.amount]));
        expect(d.gifts.map((x: { sku: string; qty: number }) => [x.sku, x.qty]), `${c.id} ${v.name}`).toEqual(out.gifts.map((x) => [x.sku, x.qty]));
        if (out.blocked) expect(d.skipped[0].reason, v.name).toContain(out.blocked);
        else expect(d.applied[0].policyRef.key, v.name).toBe(key);
      }
    }
    expect(n).toBeGreaterThanOrEqual(10);
  });

  it('phát hành chặn nội dung sai kiểm chéo (choose > số quà)', async () => {
    const r = await call(ctx, 'POST', '/api/v1/policies', {
      key: 'KM2-SAI', ruleContract: 'sale.promo.buy_x_get_y@2', effectiveFrom: '2026-01-01', reason: 'thử',
      params: { buy: { items: [{ sku: 'A' }], qty: 1 }, get: { options: [{ sku: 'Q', qty: 1 }], choose: 2 } },
    });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
    const m = await call(ctx, 'POST', '/api/v1/policies', {
      key: 'KM2-SAI2', ruleContract: 'sale.promo.order_gift@2', effectiveFrom: '2026-01-01', reason: 'thử',
      params: { multiply: true, tiers: [{ minOrder: 0, gifts: [{ sku: 'Q', qty: 1 }] }] },
    });
    expect(m.status).toBe(400);
    expect(m.body.error.code).toBe('VALIDATION_ERROR');
  });

  // [2026-11-27 10:00 AM Võ Hoàng] NGHIEM-THU — NT-BH-049: bộ tính nhận giftChoice (chưa chọn → pendingChoices) và tự điền nhóm / nhãn của dòng (đóng góp)
  it('NT-BH-049: quà lựa chọn — chưa chọn → pendingChoices; chọn Q2 → tặng Q2', async () => {
    const params = { buy: { items: [{ sku: 'A' }, { sku: 'B' }], mode: 'any', qty: 3 }, get: { options: [{ sku: 'Q1', qty: 1 }, { sku: 'Q2', qty: 1 }], choose: 1 } };
    const pub = await call(ctx, 'POST', '/api/v1/policies', { key: 'KM2-CHON', ruleContract: 'sale.promo.buy_x_get_y@2', params, effectiveFrom: '2026-01-01', reason: 'thử quà lựa chọn' });
    expect(pub.status, JSON.stringify(pub.body)).toBe(201);
    const lines = [{ lineKey: 'a', sku: 'A', qty: 2, price: 100_000 }, { lineKey: 'b', sku: 'B', qty: 1, price: 100_000 }];
    const p1 = await call(ctx, 'POST', '/api/v1/policies/evaluate', { docDate: '2026-06-15', lines, policies: [{ key: 'KM2-CHON' }] });
    expect(p1.status, JSON.stringify(p1.body)).toBe(200);
    expect(p1.body.data.gifts).toEqual([]);
    expect(p1.body.data.pendingChoices).toEqual([expect.objectContaining({ key: 'KM2-CHON', choose: 1, options: [{ sku: 'Q1', qty: 1 }, { sku: 'Q2', qty: 1 }] })]);
    const p2 = await call(ctx, 'POST', '/api/v1/policies/evaluate', { docDate: '2026-06-15', lines, policies: [{ key: 'KM2-CHON' }], giftChoice: { 'KM2-CHON': ['Q2'] } });
    expect(p2.status, JSON.stringify(p2.body)).toBe(200);
    expect(p2.body.data.gifts.map((g: { sku: string; qty: number }) => [g.sku, g.qty])).toEqual([['Q2', 1]]);
    expect(p2.body.data.pendingChoices).toBeUndefined();
  });

  it('NT-BH-049: phạm vi nhóm — bộ tính tự tra nhóm của dòng (mã không có ở danh mục = không thuộc nhóm, không còn "chưa biết nhóm")', async () => {
    const pub = await call(ctx, 'POST', '/api/v1/policies', { key: 'KM2-NHOM', ruleContract: 'sale.promo.price_lines@2', effectiveFrom: '2026-01-01', reason: 'thử phạm vi nhóm',
      params: { basis: 'qty', scope: { groupCodes: ['NHOM-KHONG-CO'] }, lines: [{ sku: 'ZZ-KHONG-CO', pct: 10 }] } });
    expect(pub.status, JSON.stringify(pub.body)).toBe(201);
    const r = await call(ctx, 'POST', '/api/v1/policies/evaluate', { docDate: '2026-06-15', lines: [{ lineKey: 'z', sku: 'ZZ-KHONG-CO', qty: 1, price: 100_000 }], policies: [{ key: 'KM2-NHOM' }] });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.skipped[0].reason).toContain('giỏ không có mã nào của chương trình');
    expect(r.body.data.skipped[0].reason).not.toContain('chưa biết nhóm');
  });

  it('NT-BH-049: loại đơn — chương trình chỉ đơn sỉ không áp đơn máy bán, áp khi orderType = wholesale', async () => {
    const pub = await call(ctx, 'POST', '/api/v1/policies', { key: 'KM2-SI', ruleContract: 'sale.promo.price_lines@2', effectiveFrom: '2026-01-01', reason: 'thử loại đơn',
      params: { basis: 'qty', conditions: { orderTypes: ['wholesale'] }, lines: [{ sku: 'A', pct: 10 }] } });
    expect(pub.status, JSON.stringify(pub.body)).toBe(201);
    const lines = [{ lineKey: 'a', sku: 'A', qty: 1, price: 100_000 }];
    const le = await call(ctx, 'POST', '/api/v1/policies/evaluate', { docDate: '2026-06-15', lines, policies: [{ key: 'KM2-SI' }], orderType: 'retail' });
    expect(le.body.data.discounts).toEqual([]);
    const si = await call(ctx, 'POST', '/api/v1/policies/evaluate', { docDate: '2026-06-15', lines, policies: [{ key: 'KM2-SI' }], orderType: 'wholesale' });
    expect(si.body.data.discounts.map((d: { amount: number }) => d.amount)).toEqual([10_000]);
  });

  it('GET /rule-contracts/:id mô tả ba khuôn @2', async () => {
    for (const [c] of SETS) {
      const r = await call(ctx, 'GET', `/api/v1/rule-contracts/${c.id}`);
      expect(r.status, c.id).toBe(200);
      expect(r.body.data.vectors.length, c.id).toBeGreaterThan(4);
    }
  });
});
