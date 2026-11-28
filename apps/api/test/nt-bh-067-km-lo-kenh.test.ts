// [2026-11-29 06:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-067: phần còn lại của NT-BH-064 / 065 — lọc lô cho Mua X tặng Y và quà theo tổng đơn;
// kênh bán ở BH10 / BH20, máy chủ kiểm lại kênh khi ghi, kiểm trùng theo kênh (đóng góp)
/**
 * Phiếu docs/nghiem-thu/ban-hang/NT-BH-067-km-lo-kenh-phan-con-lai.md.
 *   1. Nhập 2 lô LO67 ở CN01: CAN (HSD 05/12/2026) 2 lon, XA (HSD 01/06/2027) 5 lon.
 *   2. Mua 2 LO67 HSD còn ≤ 30 ngày tặng 1 QUA67: 2 lon → tặng 1; 4 lon (2 CAN + 2 XA) → vẫn 1; không chi nhánh → "chưa biết lô".
 *   3. Quà theo tổng đơn ≥ 200.000 chỉ tính lô CAN: 3 lon × 100.000 → CAN 2 lon = 200.000 → tặng.
 *   4. Chiết khấu 10 % SUA67 "Chỉ online": máy bán đơn kênh Gần shop → từ chối (field saleChannel); kênh Zalo → nhận.
 *   5. BH10: phiếu kênh Gần shop mang khuyến mại đó → không ghi (từ chối, field saleChannel); kênh Zalo → ghi, duyệt được.
 *   6. BH20: đơn kênh Zalo → máy chủ áp 10 %; kênh Gần shop → không áp; giao → phiếu bán mang kênh Zalo.
 *   7. Kiểm trùng: "Chỉ offline" cùng mã không trùng với "Chỉ online"; "Tất cả kênh" thì trùng.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runModuleMigrations } from '@bizcity/platform/db/module-db';
import { buildApp } from '../src/app.js';
import { syncBundled } from '../src/core/module-lifecycle.js';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';
import { khaiGia, nhapTon } from './pos-nhap-ton.js';

const POS = fileURLToPath(new URL('../../../modules/pos/', import.meta.url));
const PB = fileURLToPath(new URL('../../../modules/phieu-ban/', import.meta.url));
const HAS = existsSync(path.join(POS, 'bizcity.module.json')) && existsSync(path.join(PB, 'bizcity.module.json'));
const READS = ['bizcity_read.branches', 'bizcity_read.products', 'bizcity_read.tax_codes', 'bizcity_read.payment_methods', 'bizcity_read.partners',
  'bizcity_read.branch_prices', 'bizcity_read.stock_on_hand', 'bizcity_read.warehouses'];
const vnDate = (offset = 0) => new Date(Date.now() + 7 * 3600_000 + offset * 86_400_000).toISOString().slice(0, 10);
const TODAY = vnDate();
let seq = 0;
const uuid = () => `0193a1b2-0000-7000-8000-${String(67_000_000 + ++seq).padStart(12, '0')}`;
type Ref = { key: string; version: number; hash: string };

describe.skipIf(!HAS)('NT-BH-067 — khuyến mại theo lô (Mua X tặng Y, quà theo đơn) và theo kênh (BH10, BH20, máy chủ, kiểm trùng)', () => {
  let ctx: TestCtx;
  let app: FastifyInstance;
  let k = 0;
  let refs: Ref[] = [];
  const req = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) => app.inject({
    method, url, ...(payload ? { payload: payload as never } : {}),
    headers: { authorization: `Bearer ${ctx.token}`, ...(method === 'GET' ? {} : { 'idempotency-key': `nt-bh-067-${++k}-${Date.now()}` }) },
  });
  const ok = (r: { status: number; body: unknown }) => expect([200, 201], JSON.stringify(r.body)).toContain(r.status);
  const evaluate = (body: Record<string, unknown>) => call<{ data: { gifts: { sku: string; qty: number }[]; discounts: { lineKey: string; amount: number }[]; skipped: { key: string; reason: string }[];
    applied: { policyRef: Ref; result: { detail?: Record<string, unknown> } }[]; policyRefs: Ref[] } }>(ctx, 'POST', '/api/v1/policies/evaluate', body);

  beforeAll(async () => {
    ctx = await setupTenant();
    const tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
    await runModuleMigrations('pos', path.join(POS, 'migrations'), { reads: READS });
    await runModuleMigrations('phieu-ban', path.join(PB, 'migrations'), { reads: READS });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:nt-bh-067', trx as never); });
    app = await buildApp();
    const products = [['LO67', 'Sữa lô 67'], ['QUA67', 'Quà 67'], ['SUA67', 'Sữa kênh 67']];
    expect((await call(ctx, 'PUT', '/api/v1/products', { products: products.map(([sku, name]) => ({ sku, name, unit: 'Hộp' })) })).status).toBeLessThan(300);
    for (const [sku] of products) expect((await call(ctx, 'PUT', `/api/v1/products/${sku}`, { taxOutCode: 'R08' })).status).toBe(200);
    expect((await call(ctx, 'POST', '/api/v1/partners', { code: 'KH067', name: 'Khách 067' })).status).toBeLessThan(300);
    const modes = (await call(ctx, 'GET', '/api/v1/settings/posting-modes')).body.data;
    expect((await call(ctx, 'PUT', '/api/v1/settings/posting-modes', { ...modes, sale: 'auto', sale_return: 'auto' })).status).toBe(200);
    ok(await call(ctx, 'POST', '/api/v1/documents', {
      docType: 'purchase', docKey: 'NM-LO67', branchCode: 'CN01', docNo: 'NM-LO67', docDate: '2026-11-01', partner: { code: 'NCC-67', name: 'NCC lô 67' },
      lines: [
        { lineKey: 'l1', sku: 'LO67', name: 'Sữa lô 67', unit: 'Hộp', qty: 2, lotNo: 'CAN', expDate: '2026-12-05', taxCode: 'V08', taxAmount: 0, amountBeforeTax: 120_000 },
        { lineKey: 'l2', sku: 'LO67', name: 'Sữa lô 67', unit: 'Hộp', qty: 5, lotNo: 'XA', expDate: '2027-06-01', taxCode: 'V08', taxAmount: 0, amountBeforeTax: 300_000 },
      ],
      totals: { beforeTax: 420_000, tax: 0, total: 420_000 },
    }));
    await nhapTon(ctx, 'CN01', [['SUA67', 100, 'Hộp'], ['QUA67', 100, 'Hộp']]);
    await khaiGia(tenantId, [['SUA67', 'Hộp', 100_000], ['LO67', 'Hộp', 100_000]]);
  });
  afterAll(async () => {
    await app?.close();
    await ctx?.app.close();
  });

  it('§4 Mua 2 LO67 HSD còn ≤ 30 ngày tặng 1 QUA67: 2 lon (lô CAN) → tặng 1; 4 lon (CAN 2 + XA 2) → vẫn 1; không chi nhánh → chưa biết lô', async () => {
    ok(await call(ctx, 'POST', '/api/v1/policies', {
      key: 'KM67-BXGY-LO', ruleContract: 'sale.promo.buy_x_get_y@2', effectiveFrom: '2026-11-01', reason: 'NT-BH-067 mua cận date tặng quà',
      params: { buy: { items: [{ sku: 'LO67', qty: 2, lotFilter: { expWithinDays: 30 } }], mode: 'each' }, get: { options: [{ sku: 'QUA67', qty: 1 }], choose: 1 }, repeat: true },
    }));
    const two = await evaluate({ docDate: '2026-11-29', branchCode: 'CN01', lines: [{ lineKey: 'a', sku: 'LO67', qty: 2 }], policies: [{ key: 'KM67-BXGY-LO' }] });
    ok(two);
    expect(two.body.data.gifts.map((g) => [g.sku, g.qty])).toEqual([['QUA67', 1]]);
    expect(two.body.data.applied[0]!.result.detail).toMatchObject({ bought: 2, times: 1, buyLots: [{ lineKey: 'a', lots: [{ lotNo: 'CAN', expDate: '2026-12-05', qty: 2 }] }] });
    const four = await evaluate({ docDate: '2026-11-29', branchCode: 'CN01', lines: [{ lineKey: 'a', sku: 'LO67', qty: 4 }], policies: [{ key: 'KM67-BXGY-LO' }] });
    expect(four.body.data.gifts.map((g) => [g.sku, g.qty])).toEqual([['QUA67', 1]]);
    const none = await evaluate({ docDate: '2026-11-29', lines: [{ lineKey: 'a', sku: 'LO67', qty: 2 }], policies: [{ key: 'KM67-BXGY-LO' }] });
    expect(none.body.data.gifts).toEqual([]);
    expect(none.body.data.skipped[0]!.reason).toContain('chưa biết lô');
  });

  it('§4 quà theo tổng đơn ≥ 200.000 chỉ tính hàng lô CAN: 3 lon × 100.000 (CAN 2) → tặng 1; ngưỡng 300.000 → không', async () => {
    const pub = async (key: string, minOrder: number) => ok(await call(ctx, 'POST', '/api/v1/policies', {
      key, ruleContract: 'sale.promo.order_gift@2', effectiveFrom: '2026-11-01', reason: 'NT-BH-067 quà theo tổng đơn theo lô',
      params: { tiers: [{ minOrder, gifts: [{ sku: 'QUA67', qty: 1 }] }], multiply: false, lotFilter: { lotNos: ['CAN'] } },
    }));
    await pub('KM67-OG-200', 200_000);
    await pub('KM67-OG-300', 300_000);
    const lines = [{ lineKey: 'a', sku: 'LO67', qty: 3, price: 100_000 }];
    const r200 = await evaluate({ docDate: '2026-11-29', branchCode: 'CN01', lines, policies: [{ key: 'KM67-OG-200' }] });
    expect(r200.body.data.gifts.map((g) => [g.sku, g.qty])).toEqual([['QUA67', 1]]);
    const r300 = await evaluate({ docDate: '2026-11-29', branchCode: 'CN01', lines, policies: [{ key: 'KM67-OG-300' }] });
    expect(r300.body.data.gifts).toEqual([]);
    expect(r300.body.data.skipped[0]!.reason).toContain('tổng đơn 200.000 chưa đủ 300.000');
  });

  const posOrder = (saleSource: string) => ({
    id: uuid(), branchCode: 'CN01', businessDate: TODAY, shiftId: `ngay-${TODAY}`, exportReasonCode: 'XBA', customer: { retail: true }, saleSource,
    lines: [{ lineId: 'l1', productId: 'SUA67', sku: 'SUA67', unitName: 'Hộp', unitQty: 1, clientUnitPrice: 100_000, promoDiscount: 10_000,
      policyRef: { key: 'KM67-ONL', version: 1, line: 'discount' } }],
    promotionSelections: [], payment: { mode: 'cash', cashGiven: 90_000 }, clientTotal: 90_000, coreVersion: '0.1.0', promotionsVersion: '', policyRefs: refs,
  });

  it('§4 máy chủ kiểm lại kênh: Chỉ online — đơn máy bán kênh Gần shop → từ chối (field saleChannel); kênh Zalo → nhận', async () => {
    ok(await call(ctx, 'POST', '/api/v1/policies', {
      key: 'KM67-ONL', ruleContract: 'sale.promo.price_lines@2', effectiveFrom: vnDate(-1), reason: 'NT-BH-067 chỉ online',
      params: { basis: 'qty', conditions: { channelKinds: ['online'] }, lines: [{ sku: 'SUA67', pct: 10 }] },
    }));
    const ev = await evaluate({ docDate: TODAY, branchCode: 'CN01', channel: 'ZALO', channelKind: 'online', lines: [{ lineKey: 'l1', sku: 'SUA67', qty: 1, price: 100_000 }], policies: [{ key: 'KM67-ONL' }] });
    expect(ev.body.data.discounts.map((d) => d.amount)).toEqual([10_000]);
    refs = ev.body.data.policyRefs.map(({ key, version, hash }) => ({ key, version, hash }));
    // Ngay danh mục kênh (nạp sẵn: Gần shop offline, Zalo online).
    expect((await req('GET', '/api/v1/m/pos/channels')).statusCode).toBe(200);
    const bad = await req('POST', '/api/v1/m/pos/orders', posOrder('GAN_SHOP'));
    expect(bad.statusCode, bad.body).toBe(400);
    expect(bad.json().error.details).toMatchObject({ field: 'saleChannel', items: [{ key: 'KM67-ONL', channel: 'GAN_SHOP', kind: 'offline', why: 'chỉ áp kênh online' }] });
    const good = await req('POST', '/api/v1/m/pos/orders', posOrder('ZALO'));
    expect(good.statusCode, good.body).toBe(201);
  });

  it('§4 BH10: phiếu kênh Gần shop mang khuyến mại Chỉ online → không ghi; kênh Zalo → ghi và duyệt được', async () => {
    const doc = (saleChannel: string) => ({
      docType: 'sale', docDate: TODAY, branchCode: 'CN01', partner: { code: 'KH067' }, payments: [], policyRefs: refs, saleChannel,
      lines: [{ lineKey: 'L1', sku: 'SUA67', qty: 1, unitPrice: 92_593, discount: 9_259, policyRef: { key: 'KM67-ONL', version: 1, line: 'discount' } }],
    });
    const bad = await req('POST', '/api/v1/m/phieu-ban/docs', doc('GAN_SHOP'));
    expect(bad.statusCode, bad.body).toBe(400);
    expect(bad.json().error.details).toMatchObject({ field: 'saleChannel', items: [{ key: 'KM67-ONL', channel: 'GAN_SHOP' }] });
    expect(bad.json().error.message).toContain('chỉ áp kênh online');
    const good = await req('POST', '/api/v1/m/phieu-ban/docs', doc('ZALO'));
    expect(good.statusCode, good.body).toBe(200);
    const appr = await req('POST', `/api/v1/m/phieu-ban/docs/${good.json().data.id}/approve`, {});
    expect(appr.statusCode, appr.body).toBe(200);
  });

  it('§4 BH20: đơn kênh Zalo → máy chủ áp 10 % (KM67-ONL); kênh Gần shop → không áp; đơn lưu kênh', async () => {
    // Đơn đặt hàng cần kho bán mặc định của cửa hàng.
    expect((await call(ctx, 'POST', '/api/v1/warehouses', { code: 'CN01-K1', branchCode: 'CN01', name: 'Kho bán CN01', isDefault: true })).status).toBe(201);
    const order = async (saleChannel?: string) => {
      const r = await req('POST', '/api/v1/m/phieu-ban/orders', {
        orderDate: TODAY, branchCode: 'CN01', validUntil: vnDate(3), partner: { code: 'KH067' }, lines: [{ lineKey: 'L1', sku: 'SUA67', qty: 1 }], ...(saleChannel ? { saleChannel } : {}),
      });
      expect(r.statusCode, r.body).toBe(200);
      return r.json().data.order as { saleChannel?: string; saleChannelName?: string; lines: { lineKey: string; discount?: number; policyRef?: { key: string } }[] };
    };
    const z = await order('zalo');
    expect(z).toMatchObject({ saleChannel: 'ZALO', saleChannelName: 'Zalo' });
    expect(z.lines[0]).toMatchObject({ policyRef: { key: 'KM67-ONL' } });
    expect(z.lines[0]!.discount).toBeGreaterThan(0);
    const g = await order();
    expect(g.saleChannel).toBeUndefined();
    expect(g.lines[0]!.policyRef).toBeUndefined();
  });

  it('§4 kiểm trùng theo kênh: "Chỉ offline" cùng mã không trùng "Chỉ online"; "Tất cả kênh" thì trùng', async () => {
    const draft = (key: string, conditions?: Record<string, unknown>) => req('POST', '/api/v1/m/pos/promo/drafts', {
      key, ruleContract: 'sale.promo.price_lines@2', effectiveFrom: TODAY, branchCodes: [], reason: key,
      params: { basis: 'qty', lines: [{ sku: 'SUA67', pct: 5 }], ...(conditions ? { conditions } : {}) },
    });
    const off = await draft('KM67-OFF', { channelKinds: ['offline'] });
    expect(off.statusCode, off.body).toBe(200);
    expect(off.json().data.overlaps.map((o: { key: string }) => o.key)).not.toContain('KM67-ONL');
    const all = await draft('KM67-ALL');
    expect(all.statusCode, all.body).toBe(200);
    expect(all.json().data.overlaps.map((o: { key: string }) => o.key)).toContain('KM67-ONL');
  });
});
