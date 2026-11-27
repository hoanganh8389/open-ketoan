/** NT-BH-057 — đơn QR chưa nhận tiền: chỉ ghi doanh thu + công nợ; thu tiền ghi khi xác nhận; huỷ đơn chờ không còn bút toán nào. */
// [2026-11-28 03:00 PM Võ Hoàng] NGHIEM-THU — NT-BH-057: test tích hợp sổ cái (đóng góp)
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

const DIR = fileURLToPath(new URL('../../../modules/pos/', import.meta.url));
const HAS = existsSync(path.join(DIR, 'bizcity.module.json'));
const M = '/api/v1/m/pos';
const READS = ['bizcity_read.branches', 'bizcity_read.products', 'bizcity_read.tax_codes', 'bizcity_read.payment_methods', 'bizcity_read.partners',
  'bizcity_read.branch_prices', 'bizcity_read.stock_on_hand', 'bizcity_read.warehouses'];
const TODAY = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const order = (id: string, qty: number, payment: unknown) => ({
  id, branchCode: 'CN01', businessDate: TODAY, shiftId: 'x', exportReasonCode: 'XBA', customer: { retail: true },
  lines: [{ lineId: 'l1', sku: 'SUA330', unitName: 'Hộp', unitQty: qty, clientUnitPrice: 330_000 }], promotionSelections: [],
  payment, clientTotal: qty * 330_000, coreVersion: '0.1.0', promotionsVersion: '',
});
const ID = (n: number) => `0193a1b2-0000-7000-8000-00000057${String(n).padStart(4, '0')}`;

describe.skipIf(!HAS)('NT-BH-057 — đơn QR chưa nhận tiền: thu tiền ghi khi xác nhận', () => {
  let ctx: TestCtx;
  let app: FastifyInstance;
  let tenantId = '';
  let k = 0;
  const headers = () => ({ authorization: `Bearer ${ctx.token}` });
  const post = (url: string, payload: unknown) =>
    app.inject({ method: 'POST', url: `${M}${url}`, payload: payload as never, headers: { ...headers(), 'idempotency-key': `nt-bh-057-${++k}-${Date.now()}` } });

  /** Tổng Nợ − Có theo tài khoản cấp 3 (111 / 112 / 131 / 136…) của mọi chứng từ gắn đơn (phiếu bán + phiếu thu QR), bỏ bút toán đã đảo. */
  const net = async (orderId: string) => {
    const rows = (await sql<{ acc: string; n: string }>`
      SELECT left(l.account_code, 3) AS acc, sum(l.debit - l.credit) AS n
        FROM bizcity_read.ledger_lines l
        JOIN bizcity_read.ledger_entries e ON e.id = l.entry_id
        JOIN accounting_events d ON d.id = e.event_id
       WHERE l.tenant_id = ${tenantId} AND (d.doc_key = ${`pos:CN01:sale:${orderId}`} OR d.doc_key LIKE ${`pos:CN01:qr-receipt:${orderId}:%`})
       GROUP BY 1`.execute(db)).rows;
    return Object.fromEntries(rows.map((r) => [r.acc, Number(r.n)]).filter(([, n]) => n !== 0));
  };
  const receipts = async (orderId: string) => (await sql<{ doc_type: string; status: string }>`
    SELECT doc_type, status FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key LIKE ${`pos:CN01:qr-receipt:${orderId}:%`}`.execute(db)).rows;

  beforeAll(async () => {
    ctx = await setupTenant();
    tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
    await runModuleMigrations('pos', path.join(DIR, 'migrations'), { reads: READS });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:nt-bh-057', trx as never); });
    app = await buildApp();
    expect((await call(ctx, 'PUT', '/api/v1/products', { products: [{ sku: 'SUA330', name: 'Sữa 330', unit: 'Hộp' }] })).status).toBeLessThan(300);
    expect((await call(ctx, 'PUT', '/api/v1/products/SUA330', { taxOutCode: 'R08' })).status).toBe(200);
    await nhapTon(ctx, 'CN01', [['SUA330', 1000, 'Hộp']]);
    await khaiGia(tenantId, [['SUA330', 'Hộp', 330_000]]);
  });
  afterAll(async () => {
    await app?.close();
    await ctx?.app.close();
  });

  it('§5 dòng 1: tạo đơn QR → chỉ doanh thu + công nợ 131 (không Nợ 111 / 112), chưa có phiếu thu', async () => {
    const r = await post('/orders', order(ID(1), 2, { mode: 'qr' }));
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json().data.order).toMatchObject({ status: 'awaiting_payment', qr: { amount: 660_000, parts: [{ methodCode: 'QR', amount: 660_000 }] } });
    const n = await net(ID(1));
    expect(n['131']).toBe(660_000);
    expect(n['111'] ?? 0).toBe(0);
    expect(n['112'] ?? 0).toBe(0);
    expect(await receipts(ID(1))).toEqual([]);
  });

  it('§5 dòng 2: xác nhận nhận tiền → một phiếu thu khách đối trừ 131 về 0; gọi lại không ghi thêm', async () => {
    const ok = await post(`/orders/${ID(1)}/qr/confirm`, { source: 'bank', amount: 660_000, paymentRef: 'TTCK-57' });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json().data.status).toBe('completed');
    const after = await net(ID(1));
    expect(after['131'] ?? 0).toBe(0);
    const money = Object.entries(after).filter(([a]) => !['511', '333', '521', '632', '156'].includes(a)).reduce((t, [, v]) => t + v, 0);
    expect(money).toBe(660_000);
    expect((await receipts(ID(1))).map((d) => d.doc_type)).toEqual(['customer_payment']);
    expect((await post(`/orders/${ID(1)}/qr/confirm`, { source: 'manual', amount: 660_000 })).statusCode).toBe(200);
    expect(await receipts(ID(1))).toHaveLength(1);
  });

  it('§5 dòng 3: chia tiền TM + QR → lúc bán chỉ ghi phần TM; xác nhận QR mới ghi phần QR', async () => {
    const r = await post('/orders', order(ID(2), 2, { mode: 'split', parts: [{ method: 'TM', amount: 330_000 }, { method: 'QR', amount: 330_000 }] }));
    expect(r.statusCode, r.body).toBe(201);
    const before = await net(ID(2));
    expect(before['131']).toBe(330_000);
    expect(before['111']).toBe(330_000);
    expect((await post(`/orders/${ID(2)}/qr/confirm`, { source: 'manual', amount: 330_000 })).statusCode).toBe(200);
    expect((await net(ID(2)))['131'] ?? 0).toBe(0);
  });

  it('§5 dòng 4: huỷ đơn QR chưa trả → doanh thu và công nợ đảo hết, không có phiếu thu', async () => {
    expect((await post('/orders', order(ID(3), 1, { mode: 'qr' }))).statusCode).toBe(201);
    const c = await post(`/orders/${ID(3)}/cancel`, { reason: 'Khách không chuyển' });
    expect(c.statusCode, c.body).toBe(200);
    expect(await net(ID(3))).toEqual({});
    expect(await receipts(ID(3))).toEqual([]);
  });
});
