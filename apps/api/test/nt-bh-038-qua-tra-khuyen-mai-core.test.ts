// [2026-11-25 Võ Hoàng] NGHIEM-THU — test tích hợp phiếu NT-BH-038 quà trả theo hàng chính cho khuyến mại Core (đóng góp)
/**
 * NT-BH-038 (chốt 25/11/2026), §4 của docs/nghiem-thu/ban-hang/NT-BH-038-qua-tra-theo-khuyen-mai-core.md: dòng quà của khuyến mại Core
 * (chỉ có policyRef, không promotionId) vẫn phải trả theo hàng chính; hàng chính đọc từ nội dung chương trình (core.policy.list).
 *   - trả hết hàng chính mà thiếu quà → từ chối POS_GIFT_REQUIRED;
 *   - trả hàng ngoài chương trình → không bắt trả quà;
 *   - trả hàng chính + quà → nhận, quà về kho KKM (NT-BH-035);
 *   - màn hoàn hàng (returnable) có policyKey trên dòng quà để máy bán tự điền.
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

const MOD = (k: string) => fileURLToPath(new URL(`../../../modules/${k}/`, import.meta.url));
const HAS = existsSync(path.join(MOD('pos'), 'bizcity.module.json'));
const READS = ['bizcity_read.branches', 'bizcity_read.products', 'bizcity_read.tax_codes', 'bizcity_read.payment_methods', 'bizcity_read.partners',
  'bizcity_read.branch_prices', 'bizcity_read.stock_on_hand', 'bizcity_read.warehouses', 'bizcity_read.item_kinds'];
const TODAY = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const KHO = 'KHO01';
const KM = 'KHO01-KM';
let n = 0;
const uuid = (p = '0') => `0193a1b2-0000-7000-8000-${p}${String(38_000 + ++n).padStart(11, '0')}`;
type Ref = { key: string; version: number; hash: string };

describe.skipIf(!HAS)('NT-BH-038 — quà khuyến mại Core trả theo hàng chính', () => {
  let ctx: TestCtx;
  let app: FastifyInstance;
  let tenantId = '';
  let k = 0;
  let refs: Ref[] = [];
  const req = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) => app.inject({
    method, url, ...(payload ? { payload: payload as never } : {}),
    headers: { authorization: `Bearer ${ctx.token}`, ...(method === 'GET' ? {} : { 'idempotency-key': `nt-bh-038-${++k}-${Date.now()}` }) },
  });
  const pos = (url: string, payload: unknown) => req('POST', `/api/v1/m/pos${url}`, payload);
  const stockAt = async (sku: string, wh: string) => Number((await sql<{ q: string | null }>`
    SELECT SUM(qty) AS q FROM bizcity_read.stock_on_hand WHERE tenant_id = ${tenantId} AND branch_code = 'CN01' AND sku = ${sku} AND coalesce(warehouse_code, '') = ${wh}`.execute(db)).rows[0]?.q ?? 0);
  /** Đơn mua 2 tặng 1 SUA330 (chương trình Core CT-SUA330) + 1 TA01 ngoài chương trình. */
  const sell = async () => {
    const id = uuid();
    const r = await pos('/orders', {
      id, branchCode: 'CN01', businessDate: TODAY, shiftId: `ngay-${TODAY}`, exportReasonCode: 'XBA', customer: { retail: true },
      lines: [
        { lineId: 'l1', sku: 'SUA330', unitName: 'Hộp', unitQty: 2, clientUnitPrice: 330_000 },
        { lineId: 'l2', sku: 'TA01', unitName: 'Gói', unitQty: 1, clientUnitPrice: 200_000 },
        { lineId: 'g1', sku: 'SUA330', unitName: 'Hộp', unitQty: 1, clientUnitPrice: 0, isGift: true, policyRef: { key: 'CT-SUA330', version: 1, line: 'gift' } },
      ],
      promotionSelections: [], payment: { mode: 'cash', cashGiven: 860_000 }, clientTotal: 860_000, coreVersion: '0.1.0', promotionsVersion: '',
      policyRefs: refs.filter((x) => x.key === 'CT-SUA330'),
    });
    expect(r.statusCode, r.body).toBe(201);
    return id;
  };
  const ret = (orderId: string, lines: unknown[]) => pos('/returns', { id: uuid('r'), orderId, branchCode: 'CN01', lines, refundMethod: 'TM', reason: 'Khách trả hàng' });

  beforeAll(async () => {
    ctx = await setupTenant();
    tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
    await runModuleMigrations('pos', path.join(MOD('pos'), 'migrations'), { reads: READS });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:nt-bh-038', trx as never); });
    app = await buildApp();
    expect((await call(ctx, 'PUT', '/api/v1/products', { products: [{ sku: 'SUA330', name: 'Sữa 330', unit: 'Hộp' }, { sku: 'TA01', name: 'Tã quần', unit: 'Gói' }] })).status).toBeLessThan(300);
    for (const sku of ['SUA330', 'TA01']) expect((await call(ctx, 'PUT', `/api/v1/products/${sku}`, { taxOutCode: 'R08' })).status).toBe(200);
    for (const [code, name, extra] of [[KHO, 'Kho bán CN01', { isDefault: true }], [KM, 'Kho khuyến mại CN01', { typeCode: 'KKM' }]] as const) {
      expect((await call(ctx, 'POST', '/api/v1/warehouses', { code, branchCode: 'CN01', name, ...extra })).status).toBe(201);
    }
    await nhapTon(ctx, 'CN01', [['SUA330', 20, 'Hộp'], ['TA01', 10, 'Gói']], '2026-10-01', 'NHAP-KHO01-038', KHO);
    await nhapTon(ctx, 'CN01', [['SUA330', 5, 'Hộp']], '2026-10-01', 'NHAP-KM-038', KM);
    await khaiGia(tenantId, [['SUA330', 'Hộp', 330_000], ['TA01', 'Gói', 200_000]]);
    const prog = await call(ctx, 'POST', '/api/v1/sale-programs', { programKind: 'KM-CTY', validFrom: TODAY, validTo: TODAY, code: 'CT-SUA330', name: 'Mua 2 tặng 1 SUA330', mode: 'gift',
      sku: 'SUA330', buyQty: 2, giftSku: 'SUA330', giftQty: 1, quotas: [{ branchCode: 'CN01', quotaQty: 100 }] });
    expect(prog.status, JSON.stringify(prog.body)).toBe(200);
    const ev = await call(ctx, 'POST', '/api/v1/policies/evaluate', { docDate: TODAY, branchCode: 'CN01', lines: [{ lineKey: 'l1', sku: 'SUA330', qty: 2, price: 330_000 }] });
    expect(ev.status, JSON.stringify(ev.body)).toBe(200);
    refs = ev.body.data.policyRefs.map(({ key, version, hash }: Ref) => ({ key, version, hash }));
    const r = await req('PUT', '/api/v1/settings/values/bizcity.pos.gift_warehouses', { key: 'bizcity.pos.gift_warehouses', value: [`CN01=${KM}`] });
    expect(r.statusCode, r.body).toBeLessThan(300);
  });
  afterAll(async () => {
    await app?.close();
    await ctx?.app.close();
  });

  it('màn hoàn hàng: dòng quà Core có policyKey, dòng bán không có', async () => {
    const orderId = await sell();
    const r = await req('GET', `/api/v1/m/pos/orders/${orderId}/returnable?branch=CN01`);
    expect(r.statusCode, r.body).toBe(200);
    const lines = r.json().data.lines as { lineId: string; policyKey?: string; promotionId?: number }[];
    expect(lines.find((l) => l.lineId === 'g1')).toMatchObject({ policyKey: 'CT-SUA330' });
    expect(lines.find((l) => l.lineId === 'g1')?.promotionId).toBeUndefined();
    expect(lines.find((l) => l.lineId === 'l1')?.policyKey).toBeUndefined();
  });

  it('trả hết hàng chính, thiếu quà → từ chối POS_GIFT_REQUIRED, nêu dòng quà', async () => {
    const orderId = await sell();
    const r = await ret(orderId, [{ lineId: 'l1', qty: 2 }]);
    expect(r.statusCode, r.body).toBeGreaterThanOrEqual(400);
    const err = r.json().error as { details?: { reason?: string; gifts?: { lineId: string; qty: number }[] } };
    expect(JSON.stringify(err)).toContain('POS_GIFT_REQUIRED');
    expect(JSON.stringify(err)).toContain('"lineId":"g1"');
  });

  it('chỉ trả hàng ngoài chương trình → không bắt trả quà', async () => {
    const orderId = await sell();
    const r = await ret(orderId, [{ lineId: 'l2', qty: 1 }]);
    expect(r.statusCode, r.body).toBeLessThan(300);
  });

  it('trả hàng chính kèm quà → nhận; quà về kho KKM', async () => {
    const orderId = await sell();
    const before = await stockAt('SUA330', KM);
    const r = await ret(orderId, [{ lineId: 'l1', qty: 2 }, { lineId: 'g1', qty: 1 }]);
    expect(r.statusCode, r.body).toBeLessThan(300);
    expect(await stockAt('SUA330', KM)).toBe(before + 1);
  });

  it('trả 1 trong 2 hàng chính → suất còn 0 (mua 2 tặng 1), phải trả quà', async () => {
    const orderId = await sell();
    const r = await ret(orderId, [{ lineId: 'l1', qty: 1 }]);
    expect(JSON.stringify(r.json())).toContain('POS_GIFT_REQUIRED');
  });
});
