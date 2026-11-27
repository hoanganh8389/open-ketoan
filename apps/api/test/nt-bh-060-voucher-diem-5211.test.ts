// [2026-11-28 05:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-060: voucher đổi điểm → chiết khấu thương mại 5211, doanh thu đủ giá (đóng góp)
/**
 * NT-BH-060 — voucher đổi điểm dùng ở đơn máy bán: doanh thu 511 ghi đủ giá bán, phần voucher ghi Nợ chiết khấu thương mại 5211.
 * Module pos lập bút toán ghi lại (manual_journal) theo lý do POS-VOUCHER-DIEM / POS-VOUCHER-DIEM-TRA khai ở Quy tắc hạch toán;
 * chưa khai lý do → không lập, đơn vẫn bán. Trả hàng đảo theo tỉ lệ số lượng trả; hủy đơn hủy luôn bút toán.
 * Số theo phiếu docs/nghiem-thu/ban-hang/NT-BH-060-voucher-diem-chiet-khau-5211.md.
 */
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
import { setupTenant, type TestCtx } from './helpers.js';
import { khaiGia, nhapTon } from './pos-nhap-ton.js';

const POS = fileURLToPath(new URL('../../../modules/pos/', import.meta.url));
const LOY = fileURLToPath(new URL('../../../modules/loyalty/', import.meta.url));
const HAS = existsSync(path.join(POS, 'bizcity.module.json')) && existsSync(path.join(LOY, 'bizcity.module.json'));
const POS_READS = ['bizcity_read.branches', 'bizcity_read.products', 'bizcity_read.tax_codes', 'bizcity_read.payment_methods', 'bizcity_read.partners', 'bizcity_read.branch_prices', 'bizcity_read.stock_on_hand', 'bizcity_read.warehouses'];
const SKU = '100021001';
const PHONE = '0901234560';

const policy = (id: number, code: string, type: number, rules: Record<string, unknown>) =>
  ({ id, code, title: code, type, priority: id, status: 1, autoApply: true, startDate: 0, endDate: 0, applyToBlogIds: [], rules });
const PROGRAM = {
  version: 'lp-test-060',
  settings: { enablePosEarn: true, enablePosRedeem: true, enableTierMultiplier: true, minRedeemPoints: 0, pointLabel: 'điểm' },
  tiers: [{ key: 'member', name: 'Thành viên', minPoints: 0, multiplier: 1 }],
  policies: [
    policy(1, 'TICH10K', 1, { earn_rate: 1, earn_unit: 10000, point_expiry_days: 365 }),
    policy(3, 'DOIVC', 6, { rules: { rewards: [{ reward_code: 'VC50K', name: 'Voucher 50.000đ', points_required: 100, voucher_prefix: 'TGS50-', discount_type: 'fixed', discount_value: 50000, expires_in_days: 30 }] } }),
  ],
};

const TODAY = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
let n = 0;
const id = () => `0193a1b2-0000-7000-8000-0000000600${String(++n).padStart(2, '0')}`;
const order = (oid: string, over: Record<string, unknown> = {}) => ({
  id: oid, branchCode: 'CN01', businessDate: TODAY, shiftId: `ngay-${TODAY}`, exportReasonCode: 'XBA', customer: { partnerId: PHONE },
  lines: [{ lineId: 'l1', sku: SKU, unitName: 'Lon', unitQty: 1, clientUnitPrice: 325_000 }],
  promotionSelections: [], payment: { mode: 'cash', cashGiven: 325_000 }, clientTotal: 325_000, coreVersion: '0.1.0', promotionsVersion: '', ...over,
});

describe.skipIf(!HAS)('NT-BH-060 — voucher đổi điểm ghi chiết khấu thương mại 5211, doanh thu đủ giá', () => {
  let ctx: TestCtx;
  let app: FastifyInstance;
  let tenantId = '';
  let k = 0;
  const call = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) => app.inject({
    method, url, ...(payload ? { payload: payload as never } : {}),
    headers: { authorization: `Bearer ${ctx.token}`, ...(method !== 'GET' ? { 'idempotency-key': `nt-bh-060-${++k}-${Date.now()}` } : {}) },
  });
  const deliver = () => dispatchOnce({ tenantId, consumers: ['loyalty.order-earn', 'loyalty.return-reverse'] });
  const sell = async (body: unknown) => { const r = await call('POST', '/api/v1/m/pos/orders', body); await deliver(); return r; };
  /** Đổi 100 điểm lấy voucher 50.000 ở một đơn 325.000, trả về mã voucher. */
  const redeem = async () => {
    const r = await sell(order(id(), { loyalty: { redeem: ['lp_3_vc50k'] } }));
    expect(r.statusCode, r.body).toBe(201);
    return r.json().data.order.loyalty.vouchers[0].code as string;
  };
  const useVoucher = (oid: string, code: string, payment: Record<string, unknown> = { mode: 'cash', cashGiven: 275_000 }) =>
    sell(order(oid, { promotionSelections: [{ kind: 'coupon', code }], payment, clientTotal: 275_000 }));
  /** Nợ − Có theo tài khoản của các chứng từ có doc_key khớp (bỏ dòng 0). */
  const net = async (docKeyLike: string) => {
    const rows = (await sql<{ acc: string; n: string }>`
      SELECT l.account_code AS acc, sum(l.debit - l.credit) AS n
        FROM bizcity_read.ledger_lines l
        JOIN bizcity_read.ledger_entries e ON e.id = l.entry_id
        JOIN accounting_events d ON d.id = e.event_id
       WHERE l.tenant_id = ${tenantId} AND d.doc_key LIKE ${docKeyLike}
       GROUP BY 1`.execute(db)).rows;
    return Object.fromEntries(rows.map((r) => [r.acc, Number(r.n)]).filter(([, v]) => v !== 0));
  };
  const event = async (docKey: string) => (await sql<{ status: string }>`
    SELECT status FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = ${docKey}`.execute(db)).rows[0];

  beforeAll(async () => {
    ctx = await setupTenant();
    tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
    await runModuleMigrations('pos', path.join(POS, 'migrations'), { reads: POS_READS });
    await runModuleMigrations('loyalty', path.join(LOY, 'migrations'), { reads: ['bizcity_read.partners', 'bizcity_read.branches'] });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:nt-bh-060', trx as never); });
    app = await buildApp();
    expect((await call('PUT', '/api/v1/products', { products: [{ sku: SKU, name: 'Sữa bột Biomil Plus 1 400g', unit: 'Lon', taxOutCode: 'R08' }] })).statusCode).toBeLessThan(300);
    expect((await call('PUT', `/api/v1/products/${SKU}`, { taxOutCode: 'R08' })).statusCode).toBe(200);
    expect((await call('POST', '/api/v1/m/loyalty/program', { branchCode: 'CN01', storeId: 2, program: PROGRAM })).statusCode).toBe(200);
    await nhapTon(ctx, 'CN01', [[SKU, 1000, 'Lon']]);
    await khaiGia(tenantId, [[SKU, 'Lon', 325_000]]);
    // 12 lon × 325.000 = 3.900.000 → +390 điểm (đủ đổi 3 voucher); mỗi đơn 325.000 sau đó +32 / +27.
    const first = order(id(), { customer: { phone: PHONE, name: 'Chị Mai' }, lines: [{ lineId: 'l1', sku: SKU, unitName: 'Lon', unitQty: 12, clientUnitPrice: 325_000 }], payment: { mode: 'cash', cashGiven: 3_900_000 }, clientTotal: 3_900_000 });
    const f = await sell(first);
    expect(f.statusCode, f.body).toBe(201);
  });
  afterAll(async () => {
    await app?.close();
    await ctx?.app.close();
  });

  it('chưa khai lý do POS-VOUCHER-DIEM → đơn vẫn bán, bút toán ghi lại "not_created", sổ như cũ (511 ghi giá sau voucher)', async () => {
    const voucher = await redeem();
    const oid = id();
    const r = await useVoucher(oid, voucher);
    expect(r.statusCode, r.body).toBe(201);
    const o = r.json().data.order;
    expect(o).toMatchObject({ total: 275_000, subtotal: 254_630 });
    expect(o.pointVoucherJournal).toMatchObject({ reasonCode: 'POS-VOUCHER-DIEM', amount: 46_296, status: 'not_created' });
    expect(await event(`pos:CN01:voucher-diem:${oid}`)).toBeUndefined();
    expect((await net(`pos:CN01:sale:${oid}`))['51111']).toBe(-254_630);
  });

  describe('đã khai lý do (Nợ 52111 / Có 51111; trả: Nợ 52131 / Có 52111)', () => {
    let oid = '';
    beforeAll(async () => {
      for (const [code, r] of Object.entries({
        'POS-VOUCHER-DIEM': { name: 'Voucher đổi điểm — chiết khấu thương mại', kind: 'journal', debitAccount: '52111', creditAccount: '51111' },
        'POS-VOUCHER-DIEM-TRA': { name: 'Trả hàng có voucher đổi điểm — giảm chiết khấu', kind: 'journal', debitAccount: '52131', creditAccount: '52111' },
      })) { const p = await call('PUT', `/api/v1/posting/reasons/${code}`, r); expect(p.statusCode, p.body).toBe(200); }
    });

    it('dùng voucher 50.000 ở đơn 325.000 → Có 511 đủ 300.926, Nợ 5211 46.296, thuế 20.370, tiền mặt 275.000', async () => {
      const voucher = await redeem();
      oid = id();
      const r = await useVoucher(oid, voucher);
      expect(r.statusCode, r.body).toBe(201);
      const o = r.json().data.order;
      expect(o.pointVoucherJournal).toMatchObject({ docKey: `pos:CN01:voucher-diem:${oid}`, docNo: `${o.code}-VD`, amount: 46_296, status: 'posted' });
      expect(await net(`pos:CN01:voucher-diem:${oid}`)).toEqual({ '52111': 46_296, '51111': -46_296 });
      const all = await net(`pos:CN01:%:${oid}`);
      expect(all).toMatchObject({ '51111': -300_926, '52111': 46_296, '33311': -20_370, '1111': 275_000 });
    });

    it('trả lại hàng → bút toán đảo Nợ 52131 / Có 52111 46.296; 5211 về 0, 5213 ghi đủ 300.926', async () => {
      const ret = id();
      const r = await call('POST', '/api/v1/m/pos/returns', { id: ret, orderId: oid, branchCode: 'CN01', lines: [{ lineId: 'l1', qty: 1 }], refundMethod: 'TM', reason: 'Khách đổi ý' });
      expect(r.statusCode, r.body).toBe(201);
      await deliver();
      expect(await net(`pos:CN01:voucher-diem-tra:${ret}`)).toEqual({ '52131': 46_296, '52111': -46_296 });
      const back = await net(`pos:CN01:%:${ret}`);
      expect(back).toMatchObject({ '52131': 300_926, '52111': -46_296 });
      // Đơn + phiếu trả: 511 còn Có 300.926 (đủ giá), 5211 về 0, 5213 Nợ 300.926.
      const sale = await net(`pos:CN01:%:${oid}`);
      expect([sale['51111'], (sale['52111'] ?? 0) + back['52111']!]).toEqual([-300_926, 0]);
    });

    it('hủy đơn QR chưa nhận tiền có voucher → hủy luôn bút toán ghi lại', async () => {
      const voucher = await redeem();
      const o2 = id();
      const r = await useVoucher(o2, voucher, { mode: 'qr' });
      expect(r.statusCode, r.body).toBe(201);
      expect(await event(`pos:CN01:voucher-diem:${o2}`)).toMatchObject({ status: 'posted' });
      const c = await call('POST', `/api/v1/m/pos/orders/${o2}/cancel`, { reason: 'Bấm nhầm' });
      expect(c.statusCode, c.body).toBeLessThan(300);
      expect(await net(`pos:CN01:voucher-diem:${o2}`)).toEqual({});
    });

    it('đơn không dùng voucher → không lập bút toán ghi lại', async () => {
      const o3 = id();
      const r = await sell(order(o3));
      expect(r.statusCode, r.body).toBe(201);
      expect(r.json().data.order.pointVoucherJournal).toBeUndefined();
      expect(await event(`pos:CN01:voucher-diem:${o3}`)).toBeUndefined();
    });
  });
});
