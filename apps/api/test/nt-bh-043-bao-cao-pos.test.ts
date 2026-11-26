/**
 * NT-BH-043 — báo cáo bán hàng máy POS gom ở máy chủ (5 action đọc của module pos + 3 khung nhìn đọc 0186).
 * Dữ liệu như §4 của phiếu: nhóm SUA (con SUA-BOT, SUA-NUOC); SB01 (SUA-BOT, 330.000, thuế 8 %, lô L2511 HSD 2027-06-30), SN01 (SUA-NUOC,
 * 30.000). Tháng trước đã tính giá vốn: SB01 bình quân 250.000; tháng này chưa tính. Ca 4 (6.200 đơn) thay bằng chia trang nhỏ: tổng
 * meta.sums vẫn là của cả khoảng lọc.
 */
// [2026-11-25 11:55 PM Võ Hoàng] NGHIEM-THU — NT-BH-043: test tích hợp báo cáo bán hàng máy POS (đóng góp)
import { createHmac } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runModuleMigrations } from '@bizcity/platform/db/module-db';
import { buildApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { syncBundled } from '../src/core/module-lifecycle.js';
import { db } from '../src/db/client.js';
import { loginWithWpTicket } from '../src/modules/auth/wp-sso.js';
import { call, setupTenant, type TestCtx } from './helpers.js';
import { khaiGia } from './pos-nhap-ton.js';

const DIR = fileURLToPath(new URL('../../../modules/pos/', import.meta.url));
const HAS = existsSync(path.join(DIR, 'bizcity.module.json'));
const M = '/api/v1/m/pos';
const READS = ['bizcity_read.branches', 'bizcity_read.products', 'bizcity_read.tax_codes', 'bizcity_read.payment_methods', 'bizcity_read.partners',
  'bizcity_read.branch_prices', 'bizcity_read.stock_on_hand', 'bizcity_read.warehouses', 'bizcity_read.item_kinds',
  'bizcity_read.item_groups', 'bizcity_read.document_lots', 'bizcity_read.monthly_unit_costs'];
const vnDay = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
const TODAY = vnDay(new Date());
/** Ngày 20 của tháng trước (tháng đã tính giá vốn). */
const PREV = (() => { const y = Number(TODAY.slice(0, 4)); const m = Number(TODAY.slice(5, 7)); const d = new Date(Date.UTC(y, m - 2, 20)); return d.toISOString().slice(0, 10); })();
const PREV_Y = Number(PREV.slice(0, 4));
const PREV_M = Number(PREV.slice(5, 7));
const STOCK_DAY = (() => { const d = new Date(Date.UTC(PREV_Y, PREV_M - 1, 1)); return d.toISOString().slice(0, 10); })();
const SECRET = 'kiem-thu-nt-bh-043';
const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url');
const ticket = (claims: Record<string, unknown>) => {
  const now = Math.floor(Date.now() / 1000);
  const body = b64(JSON.stringify({ iat: now, exp: now + 60, ...claims }));
  return `${body}.${b64(createHmac('sha256', SECRET).update(body).digest())}`;
};
const ID = (n: number) => `0193a1b2-0000-7000-8000-00000004${String(3000 + n).padStart(4, '0')}`;

type Line = { lineId: string; sku: string; unitQty: number; clientUnitPrice: number; isGift?: boolean };
const order = (id: string, branchCode: string, businessDate: string, lines: Line[], payment: unknown, extra: Record<string, unknown> = {}) => ({
  id, branchCode, businessDate, shiftId: 'x', exportReasonCode: 'XBA', customer: { retail: true },
  lines: lines.map((l) => ({ unitName: 'Hộp', ...l })), promotionSelections: [],
  payment, clientTotal: lines.reduce((s, l) => s + (l.isGift ? 0 : l.unitQty * l.clientUnitPrice), 0), coreVersion: '0.1.0', promotionsVersion: '', ...extra,
});

describe.skipIf(!HAS)('NT-BH-043 — báo cáo bán hàng máy POS gom ở máy chủ', () => {
  let ctx: TestCtx;
  let app: FastifyInstance;
  let tenantId = '';
  let k = 0;
  let oldSecret = '';
  let adminId = '';
  const auth = (t = ctx.token) => ({ authorization: `Bearer ${t}` });
  const get = (url: string, t?: string) => app.inject({ method: 'GET', url: `${M}${url}`, headers: auth(t) });
  const post = (url: string, payload: unknown, t?: string) =>
    app.inject({ method: 'POST', url: `${M}${url}`, payload: payload as never, headers: { ...auth(t), 'idempotency-key': `nt-bh-043-${++k}-${Date.now()}` } });
  const ok = async (p: Promise<{ statusCode: number; body: string }>, status = 201) => { const r = await p; expect(r.statusCode, r.body).toBe(status); return r; };

  beforeAll(async () => {
    ctx = await setupTenant();
    tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
    await runModuleMigrations('pos', path.join(DIR, 'migrations'), { reads: READS });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:nt-bh-043', trx as never); });
    oldSecret = env.WP_SSO_SECRET;
    (env as { WP_SSO_SECRET: string }).WP_SSO_SECRET = SECRET;
    app = await buildApp();
    await sql`INSERT INTO branches (tenant_id, code, name) VALUES (${tenantId}, 'CN02', 'Cửa hàng 02') ON CONFLICT DO NOTHING`.execute(db);
    expect((await call(ctx, 'PUT', '/api/v1/products', { products: [{ sku: 'SB01', name: 'Sữa bột 01', unit: 'Hộp' }, { sku: 'SN01', name: 'Sữa nước 01', unit: 'Hộp' }] })).status).toBeLessThan(300);
    for (const sku of ['SB01', 'SN01']) expect((await call(ctx, 'PUT', `/api/v1/products/${sku}`, { taxOutCode: 'R08' })).status).toBe(200);
    // Cây nhóm: SUA → SUA-BOT, SUA-NUOC.
    await sql`INSERT INTO item_classes (tenant_id, kind, code, name, parent_code, full_name) VALUES
      (${tenantId}, 'group', 'SUA', 'Sữa', NULL, 'Sữa'), (${tenantId}, 'group', 'SUA-BOT', 'Sữa bột', 'SUA', 'Sữa Sữa bột'),
      (${tenantId}, 'group', 'SUA-NUOC', 'Sữa nước', 'SUA', 'Sữa Sữa nước') ON CONFLICT DO NOTHING`.execute(db);
    await sql`UPDATE products SET group_code = CASE sku WHEN 'SB01' THEN 'SUA-BOT' ELSE 'SUA-NUOC' END WHERE tenant_id = ${tenantId} AND sku IN ('SB01', 'SN01')`.execute(db);
    // Nhập tồn có lô (SB01 lô L2511 HSD 2027-06-30) ở CN01, SB01 ở CN02.
    for (const [branchCode, lines] of [
      ['CN01', [{ lineKey: 'l1', sku: 'SB01', name: 'SB01', unit: 'Hộp', qty: 100, amountBeforeTax: 100_000, taxCode: 'V08', taxAmount: 8000, lotNo: 'L2511', expDate: '2027-06-30' },
        { lineKey: 'l2', sku: 'SN01', name: 'SN01', unit: 'Hộp', qty: 100, amountBeforeTax: 100_000, taxCode: 'V08', taxAmount: 8000 }]],
      ['CN02', [{ lineKey: 'l1', sku: 'SB01', name: 'SB01', unit: 'Hộp', qty: 100, amountBeforeTax: 100_000, taxCode: 'V08', taxAmount: 8000 }]],
    ] as const) {
      const key = `NHAP-043-${branchCode}`;
      const total = lines.reduce((s, l) => s + l.amountBeforeTax, 0);
      const tax = lines.reduce((s, l) => s + l.taxAmount, 0);
      const r = await call(ctx, 'POST', '/api/v1/documents', { docType: 'purchase', docKey: key, branchCode, docNo: key, docDate: STOCK_DAY,
        partner: { code: 'NCC-043', name: 'NCC test 043' }, lines, totals: { beforeTax: total, tax, total: total + tax } });
      expect(r.body?.data?.status, JSON.stringify(r.body)).toBe('posted');
    }
    await khaiGia(tenantId, [['SB01', 'Hộp', 330_000], ['SN01', 'Hộp', 30_000]]);
    // Tháng trước đã tính giá vốn (chi nhánh chưa gắn cơ cấu = điểm tính giá ''): SB01 250.000. Lần cũ hơn 999 bị lần mới nhất thay.
    for (const [cost, at] of [[999, '2026-01-01T00:00:00Z'], [250_000, '2026-02-01T00:00:00Z']] as const) {
      const run = (await sql<{ id: string }>`INSERT INTO costing_runs (tenant_id, center_code, year, month, date_from, date_to, run_at)
        VALUES (${tenantId}, '', ${PREV_Y}, ${PREV_M}, ${STOCK_DAY}, ${PREV}, ${at}) RETURNING id`.execute(db)).rows[0]!.id;
      await sql`INSERT INTO costing_run_lines (tenant_id, run_id, sku, item_id, unit_cost)
        SELECT ${tenantId}, ${run}, sku, item_id, ${cost} FROM products WHERE tenant_id = ${tenantId} AND sku = 'SB01'`.execute(db);
    }
    adminId = String((await db.selectFrom('users').select('id').where('email', '=', 'tester@ketoan.local').where('tenant_id', '=', tenantId as never).executeTakeFirst())?.id ?? '');

    // Ca 1: B01 tháng trước, SB01 × 2, tiền mặt. Ca 2: B02 hôm nay SB01 × 1. Ca 7: B03 480.000 = TM 180.000 + CK 300.000.
    await ok(post('/orders', order(ID(1), 'CN01', PREV, [{ lineId: 'l1', sku: 'SB01', unitQty: 2, clientUnitPrice: 330_000 }], { mode: 'cash', cashGiven: 700_000 })));
    await ok(post('/orders', order(ID(2), 'CN01', TODAY, [{ lineId: 'l1', sku: 'SB01', unitQty: 1, clientUnitPrice: 330_000 }, { lineId: 'l2', sku: 'SN01', unitQty: 1, clientUnitPrice: 30_000 }],
      { mode: 'cash', cashGiven: 360_000 })));
    await ok(post('/orders', order(ID(3), 'CN01', TODAY, [{ lineId: 'l1', sku: 'SN01', unitQty: 5, clientUnitPrice: 30_000 }, { lineId: 'l2', sku: 'SB01', unitQty: 1, clientUnitPrice: 330_000 }],
      { mode: 'split', parts: [{ method: 'TM', amount: 180_000 }, { method: 'CK', amount: 300_000 }] })));
    // Ca 8: B04 có ghi chú phiếu "Giao chiều" và dòng quà thêm tay (không theo chương trình).
    // Máy chủ chưa nhận dòng quà không có chương trình (POS_GIFT_WITHOUT_POLICY) → dòng quà thêm tay đặt thẳng vào bản chụp đơn.
    await ok(post('/orders', order(ID(4), 'CN01', TODAY, [{ lineId: 'l1', sku: 'SB01', unitQty: 1, clientUnitPrice: 330_000 }], { mode: 'cash', cashGiven: 330_000 }, { note: 'Giao chiều' })));
    await sql`UPDATE mod_pos.orders SET snapshot = jsonb_set(snapshot, '{lines}', (snapshot->'lines') || '[{"lineId":"g1","sku":"SN01","name":"SN01","unitQty":1,"amount":0,"taxAmount":0,"isGift":true}]'::jsonb)
      WHERE tenant_id = ${tenantId} AND order_id = ${ID(4)}`.execute(db);
    // Ca 3: trả 1 SB01 của B02 (hoàn tiền mặt).
    await ok(post('/returns', { id: ID(5), orderId: ID(2), branchCode: 'CN01', lines: [{ lineId: 'l1', qty: 1 }], refundMethod: 'TM', reason: 'Khách đổi ý' }));
    // Ca 13: đổi hàng — trả SB01 của B04, lấy SB01 khác, khách trả 0 (toàn đối trừ).
    await ok(post('/exchanges', {
      id: ID(6), return: { id: ID(6), orderId: ID(4), branchCode: 'CN01', lines: [{ lineId: 'l1', qty: 1 }], refundMethod: 'doi_tru', reason: 'Đổi hàng' },
      order: order(ID(7), 'CN01', TODAY, [{ lineId: 'n1', sku: 'SB01', unitQty: 1, clientUnitPrice: 330_000 }], { mode: 'split', parts: [{ method: 'doi_tru', amount: 330_000 }] }),
    }));
    // Ca 10: CN02 một đơn.
    await ok(post('/orders', order(ID(8), 'CN02', TODAY, [{ lineId: 'l1', sku: 'SB01', unitQty: 1, clientUnitPrice: 330_000 }], { mode: 'cash', cashGiven: 330_000 })));
  });
  afterAll(async () => {
    (env as { WP_SSO_SECRET: string }).WP_SSO_SECRET = oldSecret;
    await app?.close();
    await ctx?.app.close();
  });

  it('ca 1, 2: dòng SB01 tháng đã tính có lô, HSD, thu ngân, giá vốn 500.000; tháng chưa tính để trống + ghi chú', async () => {
    const r = await get(`/reports/sales-lines?from=${PREV}&to=${TODAY}&branch=CN01&kind=sale`);
    expect(r.statusCode, r.body).toBe(200);
    const rows = r.json().data as Record<string, unknown>[];
    const b01 = rows.find((x) => x.orderId === ID(1))!;
    expect(b01).toMatchObject({ sku: 'SB01', baseQty: 2, amount: 660_000, revenue: 660_000, reason: 'XBA', group: 'Sữa / Sữa bột', groupName: 'Sữa bột',
      lots: [{ lotNo: 'L2511', expDate: '2027-06-30', qty: 2 }], unitCost: 250_000, costAmount: 500_000, costStatus: 'ok' });
    expect(b01.cashierId).toBeTruthy();
    expect(typeof b01.cashier).toBe('string');
    const b02 = rows.find((x) => x.orderId === ID(2) && x.sku === 'SB01')!;
    expect(b02).toMatchObject({ unitCost: null, costAmount: null, costStatus: 'not_run', costNote: `Chưa tính giá vốn tháng ${TODAY.slice(5, 7)}/${TODAY.slice(0, 4)}` });
    // Tổng giá vốn chỉ cộng tháng đã tính.
    expect(r.json().meta.sums.cost).toBe(500_000);
    expect(r.json().meta.cost).toBe(true);
  });

  it('ca 3: dòng trả NTH1 — SL, thành tiền dương, doanh thu âm; giá vốn dòng trả (tháng chưa tính) trống', async () => {
    const rows = (await get(`/reports/sales-lines?from=${TODAY}&to=${TODAY}&branch=CN01&kind=return`)).json().data as Record<string, unknown>[];
    const ret = rows.find((x) => x.returnId === ID(5))!;
    expect(ret).toMatchObject({ reason: 'NTH1', isReturn: true, returnText: 'Có', sku: 'SB01', baseQty: 1, amount: 330_000, revenue: -330_000, note: 'Khách đổi ý', payment: 'Tiền mặt' });
  });

  it('ca 4: chia trang máy chủ — trang nhỏ, tổng meta.sums của cả khoảng (bằng tổng đơn − trả của Sổ ca)', async () => {
    const all = (await get(`/reports/sales-lines?from=${PREV}&to=${TODAY}&branch=CN01`)).json();
    const p1 = (await get(`/reports/sales-lines?from=${PREV}&to=${TODAY}&branch=CN01&pageSize=2&page=1`)).json();
    const p2 = (await get(`/reports/sales-lines?from=${PREV}&to=${TODAY}&branch=CN01&pageSize=2&page=2`)).json();
    expect(p1.data).toHaveLength(2);
    expect(p1.meta.total).toBe(all.data.length);
    expect(p1.meta.sums).toEqual(all.meta.sums);
    expect(new Set([...p1.data, ...p2.data].map((x: { key: string }) => x.key)).size).toBe(4);
    const orders = (await sql<{ t: string }>`SELECT sum(total) AS t FROM mod_pos.orders WHERE tenant_id = ${tenantId} AND branch_code = 'CN01' AND status = 'completed'`.execute(db)).rows[0]!.t;
    const returns = (await sql<{ t: string }>`SELECT sum(refund_total) AS t FROM mod_pos.returns WHERE tenant_id = ${tenantId} AND branch_code = 'CN01'`.execute(db)).rows[0]!.t;
    expect(all.meta.sums.revenue).toBe(Number(orders) - Number(returns));
    expect(all.meta.sums.pageSize).toBeUndefined();
    expect((await get(`/reports/sales-lines?from=${TODAY}&branch=CN01&pageSize=501`)).statusCode).toBe(400);
  });

  it('ca 5: theo danh mục — chọn SUA lấy cả SB01, SN01; cột nhóm "Sữa / Sữa bột"; cây nhóm ở meta', async () => {
    const r = await get(`/reports/by-category?from=${PREV}&to=${TODAY}&branch=CN01&groups=SUA`);
    expect(r.statusCode, r.body).toBe(200);
    const rows = r.json().data as { sku: string; group: string; qty: number }[];
    expect(rows.map((x) => x.sku)).toEqual(['SB01', 'SN01']);
    expect(rows[0]!.group).toBe('Sữa / Sữa bột');
    // SB01: bán 2 + 1 + 1 + 1 + 1 (đổi) − trả 1 − trả 1 (đổi) = 4.
    expect(rows[0]!.qty).toBe(4);
    expect((await get(`/reports/by-category?from=${PREV}&to=${TODAY}&branch=CN01&groups=SUA-NUOC`)).json().data.map((x: { sku: string }) => x.sku)).toEqual(['SN01']);
    expect(r.json().meta.groups.map((g: { code: string }) => g.code)).toEqual(['SUA', 'SUA-BOT', 'SUA-NUOC']);
  });

  it('ca 6: doanh số theo ngày tháng này, lọc SUA-NUOC — mỗi ngày một dòng, tỉ trọng cộng 100 %', async () => {
    const r = await get(`/reports/daily?year=${TODAY.slice(0, 4)}&month=${Number(TODAY.slice(5, 7))}&branch=CN01&groups=SUA-NUOC`);
    expect(r.statusCode, r.body).toBe(200);
    const rows = r.json().data as { date: string; revenue: number; ratio: number }[];
    expect(rows).toHaveLength(Number(TODAY.slice(8, 10)));
    expect(rows.at(-1)!.date).toBe(TODAY);
    expect(rows.reduce((s, x) => s + x.ratio, 0)).toBeCloseTo(100);
    expect(rows.at(-1)!.revenue).toBe(30_000 + 150_000);
  });

  it('ca 7, 13: thu tiền — hai dòng TM / CK cho B03, số phiếu thu = số đơn; đơn đổi hàng trả 0 không có dòng; tổng khớp sổ Nợ 111 + 112', async () => {
    const r = await get(`/reports/collections?from=${TODAY}&to=${TODAY}&branch=CN01`);
    expect(r.statusCode, r.body).toBe(200);
    const rows = r.json().data as Record<string, unknown>[];
    const b03 = rows.filter((x) => x.orderId === ID(3));
    const code3 = b03[0]!.saleCode;
    expect(b03).toMatchObject([
      { method: 'TM', paid: 180_000, reason: 'TBHTM', receiptNo: code3 },
      { method: 'CK', paid: 300_000, reason: 'TTBHK', receiptNo: code3 },
    ]);
    expect(rows.some((x) => x.orderId === ID(7))).toBe(false);
    const ledger = (await sql<{ d: string }>`
      SELECT COALESCE(sum(l.debit), 0) AS d FROM accounting_events a JOIN ledger_entries e ON e.event_id = a.id JOIN ledger_lines l ON l.entry_id = e.id
       WHERE a.tenant_id = ${tenantId} AND a.doc_key LIKE 'pos:CN01:sale:%' AND a.doc_date = ${TODAY} AND e.status = 'posted' AND NOT e.is_reversal
         AND (l.account_code LIKE '111%' OR l.account_code LIKE '112%')`.execute(db)).rows[0]!.d;
    expect(r.json().meta.sums.paid).toBe(Number(ledger));
    expect(r.json().meta.sums.paid).toBe(360_000 + 480_000 + 330_000);
    expect((await get(`/reports/collections?from=${TODAY}&to=${TODAY}&branch=CN01&method=CK`)).json().data).toHaveLength(1);
  });

  it('ca 8: tổng hợp — ghi chú phiếu, thêm quà thủ công, đã trả / còn nợ', async () => {
    const r = await get(`/reports/sales-summary?from=${TODAY}&to=${TODAY}&branch=CN01`);
    expect(r.statusCode, r.body).toBe(200);
    const rows = r.json().data as Record<string, unknown>[];
    expect(rows.find((x) => x.orderId === ID(4) && !x.isReturn)).toMatchObject({ note: 'Giao chiều', manualGift: true, total: 330_000, paid: 330_000, debt: 0 });
    expect(rows.find((x) => x.orderId === ID(3))).toMatchObject({ manualGift: false, payment: 'Tiền mặt + Chuyển khoản' });
    expect(rows.find((x) => x.returnId === ID(5))).toMatchObject({ reason: 'NTH1', total: -330_000 });
    expect(r.json().meta.sums.total).toBe(360_000 + 480_000 + 330_000 + 330_000 - 330_000 - 330_000);
  });

  it('ca 9, 10: thu ngân (chỉ pos:sell) — không có cột giá vốn, chi nhánh khác → 403; kế toán (pos:report) xem CN02 có giá vốn', async () => {
    const s = await loginWithWpTicket(ticket({ email: 'thu-ngan-043@example.test', name: 'Thu ngân An', tenant: ctx.tenantCode, perms: ['pos:sell'] }));
    // Chưa mở ca, đơn vị có 2 chi nhánh: không biết chi nhánh của máy → không xem được.
    expect((await get(`/reports/sales-lines?from=${TODAY}&branch=CN01`, s.token)).statusCode).toBe(403);
    await ok(post('/shifts/open', { openingCash: 0, branchCode: 'CN01' }, s.token));
    const mine = await get(`/reports/sales-lines?from=${PREV}&to=${TODAY}&branch=CN01`, s.token);
    expect(mine.statusCode, mine.body).toBe(200);
    for (const row of mine.json().data) {
      expect(row).not.toHaveProperty('unitCost');
      expect(row).not.toHaveProperty('costAmount');
    }
    expect(mine.json().meta.sums).not.toHaveProperty('cost');
    for (const p of ['sales-lines', 'sales-summary', 'collections', 'by-category']) expect((await get(`/reports/${p}?from=${TODAY}&branch=CN02`, s.token)).statusCode, p).toBe(403);
    expect((await get('/reports/daily?branch=CN02', s.token)).statusCode).toBe(403);
    const other = await get(`/reports/sales-lines?from=${TODAY}&branch=CN02`);
    expect(other.statusCode, other.body).toBe(200);
    expect(other.json().data).toMatchObject([{ orderId: ID(8), sku: 'SB01', costStatus: 'not_run' }]);
  });

  it('ca 11: đơn trước 0005 (không có tên thu ngân) — Nhân viên trống, Mã NV vẫn có', async () => {
    await sql`UPDATE mod_pos.orders SET cashier_name = NULL WHERE tenant_id = ${tenantId} AND order_id = ${ID(1)}`.execute(db);
    const row = ((await get(`/reports/sales-lines?from=${PREV}&to=${PREV}&branch=CN01`)).json().data as Record<string, unknown>[])[0]!;
    expect(row.cashier).toBe('');
    expect(row.cashierId).toBeTruthy();
    if (adminId) expect(String(row.cashierId)).toContain(adminId);
  });

  it('ca 12: khoảng ngày > 92 ngày → VALIDATION_ERROR ở ô ngày (daily theo tháng không bị)', async () => {
    const r = await get('/reports/sales-lines?from=2026-01-01&to=2026-04-30&branch=CN01');
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe('VALIDATION_ERROR');
    expect(r.json().error.message).toContain('Khoảng ngày tối đa 92 ngày');
    expect(r.json().error.details).toMatchObject({ field: 'to' });
    for (const p of ['sales-summary', 'collections', 'by-category']) expect((await get(`/reports/${p}?from=2026-01-01&to=2026-04-30&branch=CN01`)).statusCode, p).toBe(400);
  });

  it('khung nhìn 0186 chỉ đọc', async () => {
    await expect(sql`UPDATE bizcity_read.item_groups SET name = 'x' WHERE tenant_id = ${tenantId}`.execute(db)).rejects.toThrow(/chỉ đọc|permission denied/);
    await expect(sql`DELETE FROM bizcity_read.document_lots WHERE tenant_id = ${tenantId}`.execute(db)).rejects.toThrow(/chỉ đọc|permission denied/);
    await expect(sql`DELETE FROM bizcity_read.monthly_unit_costs WHERE tenant_id = ${tenantId}`.execute(db)).rejects.toThrow(/chỉ đọc|permission denied/);
  });
});
