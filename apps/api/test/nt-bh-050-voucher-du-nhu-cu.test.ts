/**
 * NT-BH-050 — Voucher đủ như chính sách voucher cũ (module voucher; máy bán): giảm % có trần (V1), lô mã không gắn SĐT + mỗi khách tối đa
 * N mã (V2), cửa hàng áp dụng, trả một phần đơn gốc thu hồi voucher lần mua sau khi còn dưới ngưỡng (V5). Máy bán không đổi luật trừ:
 * module voucher trả `faceValue` = tiền trừ được của đơn đó.
 */
// [2026-11-27 09:00 AM Võ Hoàng] NGHIEM-THU — test tích hợp phiếu NT-BH-050 (đóng góp)
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runModuleMigrations } from '@bizcity/platform/db/module-db';
import { dispatchOnce } from '@bizcity/platform/core/events';
import { buildApp } from '../src/app.js';
import { syncBundled } from '../src/core/module-lifecycle.js';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';
import { khaiGia, nhapTon } from './pos-nhap-ton.js';

const MOD = (k: string) => fileURLToPath(new URL(`../../../modules/${k}/`, import.meta.url));
const HAS = ['pos', 'phieu-ban', 'voucher'].every((k) => existsSync(path.join(MOD(k), 'bizcity.module.json')));
const READS = ['bizcity_read.branches', 'bizcity_read.products', 'bizcity_read.tax_codes', 'bizcity_read.payment_methods', 'bizcity_read.partners',
  'bizcity_read.branch_prices', 'bizcity_read.stock_on_hand', 'bizcity_read.warehouses'];
const P = '/api/v1/m/pos';
const V = '/api/v1/m/voucher';
const TODAY = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const A = '0911111111';
const B = '0912222222';
let seq = 0;
const uuid = () => `0193a1b2-0000-7000-8000-${String(50_000_000 + ++seq).padStart(12, '0')}`;

describe.skipIf(!HAS)('NT-BH-050 — voucher đủ như phần mềm cũ', () => {
  let ctx: TestCtx;
  let app: FastifyInstance;
  let tenantId: string | number;
  let k = 0;
  const req = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) => app.inject({
    method, url, ...(payload ? { payload: payload as never } : {}),
    headers: { authorization: `Bearer ${ctx.token}`, ...(method === 'GET' ? {} : { 'idempotency-key': `nt-bh-050-${++k}-${Date.now()}` }) },
  });
  const deliver = () => dispatchOnce({ consumers: ['voucher.pos-order', 'voucher.pos-return', 'voucher.phieu-ban-doc'], limit: 200 });
  const lookup = async (code: string) => (await req('GET', `${V}/codes/${code}`)).json().data;
  const order = (lines: [string, number, number][], o: { phone?: string; vouchers?: string[]; total?: number; branch?: string } = {}) => {
    const total = o.total ?? lines.reduce((t, [, q, p]) => t + q * p, 0);
    return {
      id: uuid(), branchCode: o.branch ?? 'CN01', businessDate: TODAY, shiftId: `ngay-${TODAY}`, exportReasonCode: 'XBA', customer: { phone: o.phone ?? A, name: 'Khách' },
      lines: lines.map(([sku, unitQty, clientUnitPrice], i) => ({ lineId: `l${i + 1}`, sku, unitName: 'Hộp', unitQty, clientUnitPrice })),
      promotionSelections: [], payment: { mode: 'cash', cashGiven: total }, clientTotal: total, coreVersion: '0.1.0', promotionsVersion: '',
      ...(o.vouchers ? { vouchers: o.vouchers } : {}),
    };
  };
  const campaign = async (body: Record<string, unknown>) => {
    const r = await req('POST', `${V}/campaigns`, { validFrom: TODAY, ...body });
    expect(r.statusCode, r.body).toBe(200);
    return r.json().data as { id: string };
  };
  const import1 = async (id: string, code: string, phone: string) => {
    const r = await req('POST', `${V}/campaigns/${id}/import`, { items: [{ code, phone }] });
    expect(r.statusCode, r.body).toBe(200);
  };

  beforeAll(async () => {
    ctx = await setupTenant();
    tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
    await runModuleMigrations('pos', path.join(MOD('pos'), 'migrations'), { reads: READS });
    await runModuleMigrations('phieu-ban', path.join(MOD('phieu-ban'), 'migrations'), { reads: READS });
    await runModuleMigrations('voucher', path.join(MOD('voucher'), 'migrations'), { reads: ['bizcity_read.partners', 'bizcity_read.products', 'bizcity_read.payment_methods'] });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:nt-bh-050', trx as never); });
    app = await buildApp();
    const products = [['SP100', 'Sữa 100K'], ['BIOMIL', 'Biomil Plus 1']];
    expect((await call(ctx, 'PUT', '/api/v1/products', { products: products.map(([sku, name]) => ({ sku, name, unit: 'Hộp' })) })).status).toBeLessThan(300);
    for (const [sku] of products) expect((await call(ctx, 'PUT', `/api/v1/products/${sku}`, { taxOutCode: 'R08' })).status).toBe(200);
    const modes = (await call(ctx, 'GET', '/api/v1/settings/posting-modes')).body.data;
    expect((await call(ctx, 'PUT', '/api/v1/settings/posting-modes', { ...modes, sale: 'auto', sale_return: 'auto' })).status).toBe(200);
    await nhapTon(ctx, 'CN01', [['SP100', 500, 'Hộp'], ['BIOMIL', 500, 'Hộp']]);
    await khaiGia(tenantId, [['SP100', 'Hộp', 100_000], ['BIOMIL', 'Hộp', 300_000]]);
  });
  afterAll(async () => {
    await app?.close();
    await ctx?.app.close();
  });

  it('§3 dòng 1 (V1): voucher TGS giảm 10% tối đa 20.000 — đơn 300.000 trừ 20.000 (trần), đơn 100.000 trừ 10.000; màn thấy "Giảm 10%, tối đa 20.000đ"', async () => {
    const c = await campaign({ code: 'PCT10', name: 'Giảm 10% tối đa 20K', kind: 'cash', issuer: 'tgs', discountType: 'percent', discountPercent: 10, maxDiscount: 20_000 });
    await import1(c.id, 'PCT-A1', A);
    await import1(c.id, 'PCT-A2', A);
    const av = await req('GET', `${V}/customer?phone=${A}&skus=SP100&total=300000`);
    expect(av.json().data.find((x: { code: string }) => x.code === 'PCT-A1')).toMatchObject({ usable: true, discountType: 'percent', discountPercent: 10, maxDiscount: 20_000, faceValue: 20_000, valueLabel: 'Giảm 10%, tối đa 20.000đ' });
    const big = await req('POST', `${P}/orders`, order([['SP100', 3, 100_000]], { vouchers: ['PCT-A1'], total: 280_000 }));
    expect(big.statusCode, big.body).toBe(201);
    expect(big.json().data.order.total).toBe(280_000);
    expect(big.json().data.order.voucherUses).toEqual([expect.objectContaining({ code: 'PCT-A1', issuer: 'tgs', kind: 'discount', amount: 20_000, faceValue: 20_000 })]);
    const small = await req('POST', `${P}/orders`, order([['SP100', 1, 100_000]], { vouchers: ['PCT-A2'], total: 90_000 }));
    expect(small.statusCode, small.body).toBe(201);
    expect(small.json().data.order.voucherUses[0]).toMatchObject({ amount: 10_000 });
    await deliver();
    expect(await lookup('PCT-A1')).toMatchObject({ state: 'used', usedAmount: 20_000, usedPhone: A, campaign: { discountType: 'percent', discountPercent: 10, maxDiscount: 20_000 } });
  });

  let batch: string[] = [];
  it('§3 dòng 2 (V2): sinh lô 20 mã không gắn SĐT (tiền tố HE) — mỗi khách tối đa 1 mã: khách A dùng mã 1 được, mã 2 bị chặn; khách B dùng mã 2 được', async () => {
    const c = await campaign({ code: 'HE50K', name: 'Hè 50K mỗi khách 1 mã', kind: 'cash', issuer: 'tgs', faceValue: 50_000, perCustomer: 1 });
    const r = await req('POST', `${V}/campaigns/${c.id}/batch`, { prefix: 'he', qty: 20 });
    expect(r.statusCode, r.body).toBe(200);
    batch = r.json().data.created.map((x: { code: string }) => x.code);
    expect(batch).toHaveLength(20);
    expect(new Set(batch).size).toBe(20);
    expect(batch.every((x) => /^HE[A-Z2-9]{8}$/.test(x))).toBe(true);
    expect(await lookup(batch[0]!)).toMatchObject({ phone: null, source: 'batch', state: 'active' });
    const one = await req('POST', `${P}/orders`, order([['SP100', 1, 100_000]], { vouchers: [batch[0]!], total: 50_000 }));
    expect(one.statusCode, one.body).toBe(201);
    await deliver();
    const two = await req('POST', `${P}/orders`, order([['SP100', 1, 100_000]], { vouchers: [batch[1]!], total: 50_000 }));
    expect(two.statusCode, two.body).toBe(400);
    expect(two.json().error.details.reason).toBe('VOUCHER_USED');
    expect(two.json().error.message).toContain('tối đa 1');
    // Cùng đơn hai mã lô của đợt giới hạn 1 → mã thứ hai bị chặn ngay (chưa cần sự kiện).
    const both = await req('POST', `${P}/orders`, order([['SP100', 2, 100_000]], { phone: B, vouchers: [batch[2]!, batch[3]!], total: 100_000 }));
    expect(both.statusCode, both.body).toBe(400);
    const b = await req('POST', `${P}/orders`, order([['SP100', 1, 100_000]], { phone: B, vouchers: [batch[1]!], total: 50_000 }));
    expect(b.statusCode, b.body).toBe(201);
    await deliver();
    expect(await lookup(batch[1]!)).toMatchObject({ state: 'used', usedPhone: B });
    // Tra theo SĐT khách thấy cả mã lô khách đã dùng.
    const mine = (await req('GET', `${V}/codes?phone=${A}`)).json().data.map((x: { code: string }) => x.code);
    expect(mine).toContain(batch[0]);
  });

  it('§3 dòng 3: cửa hàng áp dụng — đợt chỉ cho CN02, dùng ở CN01 → VOUCHER_NOT_APPLICABLE', async () => {
    const c = await campaign({ code: 'CN02ONLY', name: 'Chỉ CN02', kind: 'cash', issuer: 'tgs', faceValue: 10_000, branchCodes: ['CN02'] });
    await import1(c.id, 'CN2-A1', A);
    const r = await req('POST', `${P}/orders`, order([['SP100', 1, 100_000]], { vouchers: ['CN2-A1'], total: 90_000 }));
    expect(r.statusCode, r.body).toBe(400);
    expect(r.json().error.details.reason).toBe('VOUCHER_NOT_APPLICABLE');
  });

  it('§3 dòng 4 (V5): mua 3 Biomil (ngưỡng 2) phát voucher lần mua sau; trả 1 → còn 2, giữ; trả thêm 1 → còn 1, thu hồi; giao lại sự kiện không cộng hai lần', async () => {
    await campaign({
      code: 'BIO-NEXT', name: 'Lần mua sau Biomil 30K', kind: 'next_purchase', issuer: 'tgs', faceValue: 30_000, validDays: 30, skus: ['BIOMIL'],
      issueMode: 'auto', autoRule: { skus: ['BIOMIL'], brandCodes: [], minQty: 2, branches: [] },
    });
    const r = await req('POST', `${P}/orders`, order([['BIOMIL', 3, 300_000]]));
    expect(r.statusCode, r.body).toBe(201);
    const code = r.json().data.order.issuedVouchers[0].code as string;
    await deliver();
    expect(await lookup(code)).toMatchObject({ state: 'active', basisQty: 3, returnedQty: 0 });
    const ret1 = await req('POST', `${P}/returns`, { id: uuid(), orderId: r.json().data.order.id, branchCode: 'CN01', lines: [{ lineId: 'l1', qty: 1 }], refundMethod: 'TM', reason: 'Trả một lon' });
    expect(ret1.statusCode, ret1.body).toBe(201);
    await deliver();
    expect(await lookup(code)).toMatchObject({ state: 'active', returnedQty: 1 });
    const ret2 = await req('POST', `${P}/returns`, { id: uuid(), orderId: r.json().data.order.id, branchCode: 'CN01', lines: [{ lineId: 'l1', qty: 1 }], refundMethod: 'TM', reason: 'Trả thêm một lon' });
    expect(ret2.statusCode, ret2.body).toBe(201);
    await deliver();
    const after = await lookup(code);
    expect(after).toMatchObject({ state: 'revoked', returnedQty: 2 });
    expect(after.revokeReason).toContain('Trả một phần');
    expect(after.log.filter((x: { action: string }) => x.action === 'return')).toHaveLength(2);
  });

  it('lệch chuẩn: đợt đã phát mã không đổi % / trần; tiền tố sai bị chặn; khuôn % thiếu phần trăm bị chặn', async () => {
    const list = (await req('GET', `${V}/campaigns`)).json().data as { id: string; code: string }[];
    const pct = list.find((c) => c.code === 'PCT10')!;
    const ch = await req('PUT', `${V}/campaigns/${pct.id}`, { code: 'PCT10', name: 'Giảm 10%', kind: 'cash', issuer: 'tgs', discountType: 'percent', discountPercent: 15, maxDiscount: 20_000, validFrom: TODAY });
    expect(ch.statusCode, ch.body).toBe(409);
    const ok = await req('PUT', `${V}/campaigns/${pct.id}`, { code: 'PCT10', name: 'Giảm 10% (đổi tên)', kind: 'cash', issuer: 'tgs', discountType: 'percent', discountPercent: 10, maxDiscount: 20_000, perCustomer: 3, validFrom: TODAY });
    expect(ok.statusCode, ok.body).toBe(200);
    const he = list.find((c) => c.code === 'HE50K')!;
    expect((await req('POST', `${V}/campaigns/${he.id}/batch`, { prefix: 'HÈ', qty: 2 })).statusCode).toBe(400);
    expect((await req('POST', `${V}/campaigns`, { code: 'BAD', name: 'Bad', kind: 'cash', issuer: 'tgs', discountType: 'percent', validFrom: TODAY })).statusCode).toBe(400);
  });
});
