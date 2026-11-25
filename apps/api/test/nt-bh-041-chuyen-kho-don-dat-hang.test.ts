/**
 * NT-BH-041 — BH20: nút "Lập chuyển kho" (phiếu KHO01) + "Giữ lại hàng" khi kho bán thiếu hàng (chốt 25/11/2026).
 * Dữ liệu theo §4 của phiếu: CN01 chi nhánh cha (kho tổng CN01-KT), cửa hàng CH02 (kho bán CH02-K1, KCB CH02-KCB, kho phụ CH02-K2,
 * KHG CH02-KHG) và CH03 (CH03-K1) cùng cha CN01. Tồn SUA01: CH02-K1 4, CH02-K2 2, CN01-KT 50, CH03-K1 8 (+ CH02-KHG 5 để thấy bị loại).
 * Màn gọi ba bước: module prepare → action Kho kho.transfer.create (POST /api/v1/kho/transfers, phiên người bấm) → module record.
 */
// [2026-11-25 Võ Hoàng] NGHIEM-THU — test tích hợp phiếu NT-BH-041 (đóng góp)
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
import { nhapTon } from './pos-nhap-ton.js';

const POS = fileURLToPath(new URL('../../../modules/pos/', import.meta.url));
const PB = fileURLToPath(new URL('../../../modules/phieu-ban/', import.meta.url));
const HAS = existsSync(path.join(POS, 'bizcity.module.json')) && existsSync(path.join(PB, 'bizcity.module.json'));
const READS = ['bizcity_read.branches', 'bizcity_read.products', 'bizcity_read.tax_codes', 'bizcity_read.payment_methods', 'bizcity_read.partners',
  'bizcity_read.branch_prices', 'bizcity_read.stock_on_hand', 'bizcity_read.warehouses', 'bizcity_read.item_kinds'];
const SKU = 'SUA01';
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const M = '/api/v1/m/phieu-ban';
const CK = '/api/v1/kho/transfers';

type Order = { id: string; orderNo: string; status: string; warehouseCode: string; holdWarehouseCode: string | null;
  lines: { lineKey: string; sku: string; qty: number; held: number }[]; holdShort: { sku: string; need: number }[];
  transfers?: { id: string; docNo: string; from: string; qty: number; status: string }[] };
type Sources = { short: { sku: string; need: number }[]; sources: { group: string; branchCode: string; warehouseCode: string; stock: Record<string, number> }[];
  transfers: { id: string; docNo: string }[]; canCreate: boolean };
type Prepared = { seq: number; payload: Record<string, unknown> & { lines: { sku: string; qty: number }[]; note: string; toWarehouse: string } };

describe.skipIf(!HAS)('NT-BH-041 — Lập chuyển kho + Giữ lại hàng trên đơn đặt hàng', () => {
  let ctx: TestCtx;
  let kt: TestCtx;
  let noKho: TestCtx;
  let app: FastifyInstance;
  let tenantId = '';
  let k = 0;
  const req = (who: TestCtx, method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown, key?: string) => app.inject({
    method, url, ...(payload ? { payload: payload as never } : {}),
    headers: { authorization: `Bearer ${who.token}`, ...(method === 'GET' ? {} : { 'idempotency-key': key ?? `nt-bh-041-${++k}-${Date.now()}` }) },
  });
  const stock = async (branch: string, wh: string) => Number((await sql<{ q: string | null }>`
    SELECT SUM(qty) AS q FROM bizcity_read.stock_on_hand WHERE tenant_id = ${tenantId} AND branch_code = ${branch} AND sku = ${SKU} AND warehouse_code = ${wh}`.execute(db)).rows[0]?.q ?? 0);
  const order = async (id: string) => (await req(ctx, 'GET', `${M}/orders/${id}`)).json().data as Order;
  const sources = (who: TestCtx, id: string) => req(who, 'GET', `${M}/orders/${id}/transfer-sources`);
  const userCtx = async (email: string, role: string): Promise<TestCtx & { id: string }> => {
    const u = await call(ctx, 'POST', '/api/v1/users', { email, fullName: email.split('@')[0], role, password: 'Pass@12345' });
    expect(u.status).toBe(201);
    const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email, password: 'Pass@12345' } });
    return { ...ctx, token: res.json().data.token, id: String(u.body.data.id) };
  };
  /** Ba bước như màn: prepare → KHO01 → record. Trả phiếu KHO01 và đơn sau khi nối. */
  const lap = async (who: TestCtx, id: string, fromBranchCode: string, fromWarehouse: string, qty: number) => {
    const p = await req(who, 'POST', `${M}/orders/${id}/transfers`, { step: 'prepare', fromBranchCode, fromWarehouse, lines: [{ sku: SKU, qty }] });
    expect(p.statusCode, p.body).toBe(200);
    const prep = p.json().data as Prepared;
    const t = await req(who, 'POST', CK, prep.payload);
    expect(t.statusCode, t.body).toBeLessThan(300);
    const doc = t.json().data as { id: string; docNo: string; status: string; note: string };
    const rec = await req(who, 'POST', `${M}/orders/${id}/transfers`, { step: 'record', fromBranchCode, fromWarehouse, lines: prep.payload.lines, transfer: { id: String(doc.id), docNo: doc.docNo, status: doc.status } });
    expect(rec.statusCode, rec.body).toBe(200);
    return { prep, doc, order: rec.json().data as Order };
  };

  let a: Order;

  beforeAll(async () => {
    ctx = await setupTenant();
    tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
    await runModuleMigrations('pos', path.join(POS, 'migrations'), { reads: READS });
    await runModuleMigrations('phieu-ban', path.join(PB, 'migrations'), { reads: READS });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:nt-bh-041', trx as never); });
    app = await buildApp();
    for (const b of [{ code: 'CH02', name: 'Cửa hàng 02' }, { code: 'CH03', name: 'Cửa hàng 03' }]) expect((await call(ctx, 'POST', '/api/v1/branches', b)).status).toBe(201);
    // CH02, CH03 là cửa hàng con của CN01 (cây đơn vị — đặt thẳng như dữ liệu §4).
    await sql`UPDATE branches SET parent_id = (SELECT id FROM branches WHERE tenant_id = ${tenantId} AND code = 'CN01'), level = 'shop'
               WHERE tenant_id = ${tenantId} AND code IN ('CH02', 'CH03')`.execute(db);
    expect((await call(ctx, 'PUT', '/api/v1/products', { products: [{ sku: SKU, name: 'Sữa 01', unit: 'Hộp' }, { sku: 'PHISHIP', name: 'Phí ship', unit: 'Lần' }] })).status).toBeLessThan(300);
    for (const s of [SKU, 'PHISHIP']) expect((await call(ctx, 'PUT', `/api/v1/products/${s}`, { taxOutCode: 'KCT' })).status).toBe(200);
    // Ca 12: PHISHIP là mặt hàng dịch vụ (phân loại đang mở — như NT-BH-035).
    await sql`UPDATE item_classification c SET kind = 'service' FROM products p
      WHERE p.tenant_id = ${tenantId} AND p.sku = 'PHISHIP' AND c.tenant_id = p.tenant_id AND c.item_id = p.item_id AND c.valid_to IS NULL`.execute(db);
    for (const [code, branchCode, name, extra] of [
      ['CN01-KT', 'CN01', 'Kho tổng CN01', { isDefault: true }], ['CH02-K1', 'CH02', 'Kho bán CH02', { isDefault: true }],
      ['CH02-KCB', 'CH02', 'Kho chờ bán CH02', { typeCode: 'KCB' }], ['CH02-K2', 'CH02', 'Kho phụ CH02', {}],
      ['CH02-KHG', 'CH02', 'Kho hàng gửi bán CH02', { typeCode: 'KHG' }], ['CH03-K1', 'CH03', 'Kho bán CH03', { isDefault: true }],
    ] as const) expect((await call(ctx, 'POST', '/api/v1/warehouses', { code, branchCode, name, ...extra })).status).toBe(201);
    for (const [branch, wh, qty] of [['CH02', 'CH02-K1', 4], ['CH02', 'CH02-K2', 2], ['CN01', 'CN01-KT', 50], ['CH03', 'CH03-K1', 8], ['CH02', 'CH02-KHG', 5]] as const) {
      await nhapTon(ctx, branch, [[SKU, qty, 'Hộp']], '2026-10-01', `NHAP-${wh}`, wh);
    }
    for (const [key, value] of [['bizcity.phieu_ban.hold_warehouses', ['CH02=CH02-KCB']], ['bizcity.phieu_ban.ship_warehouses', ['CH02=CH02-KHG']]] as const) {
      const put = await req(ctx, 'PUT', `/api/v1/settings/values/${key}`, { key, value });
      expect(put.statusCode, put.body).toBeLessThan(300);
    }
    kt = await userCtx('kt041@ketoan.local', 'accountant');
    // Ca 8: kế toán bị cấm quyền lập phiếu chuyển kho (vẫn có phieu-ban:write).
    const nk = await userCtx('kt041-nokho@ketoan.local', 'accountant');
    const role = (await call(ctx, 'POST', '/api/v1/roles', { code: 'cam_ck_041', label: 'cam_ck_041', kind: 'restriction', reason: 'NT-BH-041 ca 8' })).body.data.id;
    expect((await call(ctx, 'POST', `/api/v1/roles/${role}/rules`, { permission: 'kho:chuyen-kho-lap', effect: 'deny', reason: 'NT-BH-041 ca 8' })).status).toBe(201);
    expect((await call(ctx, 'POST', `/api/v1/users/${nk.id}/roles`, { tenantRoleId: role, reason: 'NT-BH-041 ca 8' })).status).toBe(201);
    const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email: 'kt041-nokho@ketoan.local', password: 'Pass@12345' } });
    noKho = { ...ctx, token: res.json().data.token };
  });
  afterAll(async () => {
    await app?.close();
    await ctx?.app.close();
  });

  it('ca 1 + 12: đơn CH02 10 hộp + dòng phí ship (dịch vụ), Gửi → Đã gửi, giữ 4 (-G1 CH02-K1 → KCB), thiếu SUA01 6; phí ship không vào danh sách thiếu', async () => {
    const c = await req(ctx, 'POST', `${M}/orders`, {
      orderDate: TODAY, branchCode: 'CH02', validUntil: TODAY, customer: { name: 'Khách 041' },
      lines: [{ lineKey: 'L1', sku: SKU, qty: 10, unitPrice: 330_000 }, { lineKey: 'S1', sku: 'PHISHIP', qty: 1, unitPrice: 30_000 }],
    });
    expect(c.statusCode, c.body).toBe(200);
    const s = await req(ctx, 'POST', `${M}/orders/${c.json().data.order.id}/send`, {});
    expect(s.statusCode, s.body).toBe(200);
    a = s.json().data;
    expect(a).toMatchObject({ status: 'open', warehouseCode: 'CH02-K1', holdWarehouseCode: 'CH02-KCB' });
    expect(a.lines.find((l) => l.lineKey === 'L1')!.held).toBe(4);
    expect(s.json().meta.holdDocs).toEqual([expect.objectContaining({ docNo: `${a.orderNo}-G1` })]);
    expect(a.holdShort).toEqual([{ sku: SKU, name: 'Sữa 01', unit: 'Hộp', need: 6 }]);
  });

  it('ca 2: danh sách kho — CH02-K2 (2) → CN01-KT (50) → CH03-K1 (8); không có kho bán, KCB, KHG; dòng SUA01 cần 6', async () => {
    const r = await sources(kt, a.id);
    expect(r.statusCode, r.body).toBe(200);
    const d = r.json().data as Sources;
    expect(d.short).toEqual([expect.objectContaining({ sku: SKU, need: 6 })]);
    expect(d.sources.map((x) => [x.group, x.warehouseCode, x.stock[SKU]])).toEqual([['same', 'CH02-K2', 2], ['parent', 'CN01-KT', 50], ['sibling', 'CH03-K1', 8]]);
    expect(d.canCreate).toBe(true);
  });

  it('ca 7: SL 9 khi CH03-K1 chỉ còn 8 → VALIDATION_ERROR, error.fields lines[0].qty "CH03-K1 chỉ còn 8"; kho ngoài danh sách bị chặn', async () => {
    const r = await req(kt, 'POST', `${M}/orders/${a.id}/transfers`, { step: 'prepare', fromBranchCode: 'CH03', fromWarehouse: 'CH03-K1', lines: [{ sku: SKU, qty: 9 }] });
    expect(r.statusCode, r.body).toBe(400);
    expect(r.json().error.code).toBe('VALIDATION_ERROR');
    expect(r.json().error.details.findings[0].code).toBe('PHIEU_BAN_TRANSFER_OVER_STOCK');
    expect(r.json().error.fields).toEqual([expect.objectContaining({ path: 'lines[0].qty', message: expect.stringContaining('CH03-K1 chỉ còn 8') })]);
    const kcb = await req(kt, 'POST', `${M}/orders/${a.id}/transfers`, { step: 'prepare', fromBranchCode: 'CH02', fromWarehouse: 'CH02-KHG', lines: [{ sku: SKU, qty: 1 }] });
    expect(kcb.statusCode, kcb.body).toBe(400);
    expect(kcb.json().error.details.findings[0].code).toBe('PHIEU_BAN_TRANSFER_SOURCE');
  });

  it('ca 8: có phieu-ban:write mà không có kho:chuyen-kho-lap → canCreate false; module và KHO01 đều trả 403 FORBIDDEN', async () => {
    expect((await sources(noKho, a.id)).json().data.canCreate).toBe(false);
    const p = await req(noKho, 'POST', `${M}/orders/${a.id}/transfers`, { step: 'prepare', fromBranchCode: 'CN01', fromWarehouse: 'CN01-KT', lines: [{ sku: SKU, qty: 6 }] });
    expect(p.statusCode, p.body).toBe(403);
    expect(p.json().error.code).toBe('FORBIDDEN');
    const t = await req(noKho, 'POST', CK, { docDate: TODAY, fromBranchCode: 'CN01', fromWarehouse: 'CN01-KT', toBranchCode: 'CH02', toWarehouse: 'CH02-K1', lines: [{ lineKey: 'L1', sku: SKU, qty: 6 }] });
    expect(t.statusCode, t.body).toBe(403);
    expect(await stock('CN01', 'CN01-KT')).toBe(50);
    // Giữ lại hàng cần phieu-ban:write — người chỉ xem bị 403.
    const xem = await userCtx('xem041@ketoan.local', 'viewer');
    const h = await req(xem, 'POST', `${M}/orders/${a.id}/hold`, {});
    expect([h.statusCode, h.json().error.code]).toEqual([403, 'FORBIDDEN']);
  });

  it('ca 9 / Q-CHUNG-03: người khác đang lập (đã prepare) → CONFLICT cause transfer_busy; abort bỏ chỗ', async () => {
    const p = await req(kt, 'POST', `${M}/orders/${a.id}/transfers`, { step: 'prepare', fromBranchCode: 'CN01', fromWarehouse: 'CN01-KT', lines: [{ sku: SKU, qty: 6 }] });
    expect(p.statusCode, p.body).toBe(200);
    const busy = await req(ctx, 'POST', `${M}/orders/${a.id}/transfers`, { step: 'prepare', fromBranchCode: 'CN01', fromWarehouse: 'CN01-KT', lines: [{ sku: SKU, qty: 6 }] });
    expect(busy.statusCode, busy.body).toBe(409);
    expect(busy.json().error.details).toMatchObject({ reason: 'PHIEU_BAN_ORDER_STATE', cause: 'transfer_busy' });
    expect((await req(kt, 'POST', `${M}/orders/${a.id}/transfers`, { step: 'abort' })).statusCode).toBe(200);
    expect((await req(ctx, 'POST', `${M}/orders/${a.id}/transfers`, { step: 'prepare', fromBranchCode: 'CN01', fromWarehouse: 'CN01-KT', lines: [{ sku: SKU, qty: 6 }] })).statusCode).toBe(200);
    expect((await req(ctx, 'POST', `${M}/orders/${a.id}/transfers`, { step: 'abort' })).statusCode).toBe(200);
  });

  let ck1: { id: string; docNo: string };
  it('ca 3: chọn CN01-KT, SL 6 → KHO01 CN01/CN01-KT → CH02/CH02-K1 6 hộp Đã xuất (khác chi nhánh); tồn CN01-KT 44; ghi chú + lịch sử đơn; đơn hiện phiếu', async () => {
    const { prep, doc, order: o } = await lap(kt, a.id, 'CN01', 'CN01-KT', 6);
    expect(prep.payload).toMatchObject({ fromBranchCode: 'CN01', fromWarehouse: 'CN01-KT', toBranchCode: 'CH02', toWarehouse: 'CH02-K1', mode: 'ship', docDate: TODAY,
      note: `Chuyển hàng cho đơn đặt hàng ${a.orderNo}`, lines: [expect.objectContaining({ sku: SKU, qty: 6 })] });
    expect(doc.docNo).toMatch(new RegExp(`^CK${TODAY.slice(2, 4)}\\d{5}$`));
    expect(doc).toMatchObject({ status: 'shipped', note: `Chuyển hàng cho đơn đặt hàng ${a.orderNo}` });
    ck1 = { id: String(doc.id), docNo: doc.docNo };
    expect(await stock('CN01', 'CN01-KT')).toBe(44);
    expect(o.transfers).toEqual([expect.objectContaining({ id: ck1.id, docNo: ck1.docNo, from: 'CN01/CN01-KT', qty: 6, status: 'shipped' })]);
    const h = (await req(ctx, 'GET', `${M}/orders/${a.id}/history`)).json().data.events as { action: string; note: string }[];
    expect(h.find((e) => e.action === 'transfer')?.note).toBe(`Lập chuyển kho ${ck1.docNo}: CN01-KT → CH02-K1 SUA01 × 6`);
    // Ca 9: gửi lại bước record cùng phiếu → không nối hai lần.
    const again = await req(kt, 'POST', `${M}/orders/${a.id}/transfers`, { step: 'record', fromBranchCode: 'CN01', fromWarehouse: 'CN01-KT', lines: [{ sku: SKU, qty: 6 }], transfer: { id: ck1.id, docNo: ck1.docNo } });
    expect(again.statusCode, again.body).toBe(200);
    expect((again.json().data as Order).transfers).toHaveLength(1);
  });

  it('ca 4: Giữ lại hàng trước khi CH02 nhận → không có phiếu giữ mới, báo "Kho bán CH02-K1 chưa có thêm hàng (phiếu CK… chưa nhận)", vẫn thiếu 6', async () => {
    const r = await req(kt, 'POST', `${M}/orders/${a.id}/hold`, {});
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().meta.holdDocs).toBeUndefined();
    expect(r.json().meta.holdNothing.message).toBe(`Kho bán CH02-K1 chưa có thêm hàng (phiếu ${ck1.docNo} chưa nhận)`);
    expect((r.json().data as Order).holdShort).toEqual([expect.objectContaining({ sku: SKU, need: 6 })]);
  });

  it('ca 11: thủ kho CH02 từ chối nhận → KHO01 "rejected", tồn CN01-KT về 50; đơn vẫn thiếu 6, lập lại được', async () => {
    const rj = await req(ctx, 'POST', `${CK}/${ck1.id}/reject`, { reason: 'Không nhận — thử NT-BH-041' });
    expect(rj.statusCode, rj.body).toBe(200);
    expect((await req(ctx, 'GET', `${CK}/${ck1.id}`)).json().data.status).toBe('rejected');
    expect(await stock('CN01', 'CN01-KT')).toBe(50);
    expect((await order(a.id)).holdShort).toEqual([expect.objectContaining({ need: 6 })]);
    expect((await sources(kt, a.id)).json().data.sources.map((x: { warehouseCode: string }) => x.warehouseCode)).toContain('CN01-KT');
  });

  it('ca 5: lập lại từ CN01-KT 6, thủ kho CH02 nhận đủ, Giữ lại hàng → -G2 CH02-K1 → CH02-KCB 6; đang giữ 10; hết thiếu', async () => {
    const { doc } = await lap(kt, a.id, 'CN01', 'CN01-KT', 6);
    const rc = await req(ctx, 'POST', `${CK}/${doc.id}/receive`, {});
    expect(rc.statusCode, rc.body).toBe(200);
    expect(await stock('CH02', 'CH02-K1')).toBe(6);
    const r = await req(kt, 'POST', `${M}/orders/${a.id}/hold`, {});
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().meta.holdDocs).toEqual([expect.objectContaining({ docNo: `${a.orderNo}-G2`, status: 'posted' })]);
    const o = r.json().data as Order;
    expect(o.lines.find((l) => l.lineKey === 'L1')!.held).toBe(10);
    expect(o.holdShort).toEqual([]);
    expect(o.transfers).toHaveLength(2);
    expect(await stock('CH02', 'CH02-K1')).toBe(0);
    expect(await stock('CH02', 'CH02-KCB')).toBe(10);
  });

  it('ca 6: đơn thứ hai thiếu 2 — chọn CH02-K2 (cùng cửa hàng) → phiếu nhận luôn; Giữ lại hàng giữ thêm 2', async () => {
    const c = await req(ctx, 'POST', `${M}/orders`, { orderDate: TODAY, branchCode: 'CH02', validUntil: TODAY, customer: { name: 'Khách 041b' }, lines: [{ lineKey: 'L1', sku: SKU, qty: 2, unitPrice: 330_000 }] });
    const id = c.json().data.order.id as string;
    expect((await req(ctx, 'POST', `${M}/orders/${id}/send`, {})).json().data.holdShort).toEqual([expect.objectContaining({ need: 2 })]);
    const { doc } = await lap(kt, id, 'CH02', 'CH02-K2', 2);
    expect(doc.status).toBe('received');
    const r = await req(kt, 'POST', `${M}/orders/${id}/hold`, {});
    expect(r.statusCode, r.body).toBe(200);
    expect((r.json().data as Order).lines[0]!.held).toBe(2);
    expect((r.json().data as Order).holdShort).toEqual([]);
  });

  it('ca 10: đơn Nháp / Đã đóng → transfer-sources, transfers, hold đều CONFLICT PHIEU_BAN_ORDER_STATE', async () => {
    const c = await req(ctx, 'POST', `${M}/orders`, { orderDate: TODAY, branchCode: 'CH02', validUntil: TODAY, customer: { name: 'Khách 041c' }, lines: [{ lineKey: 'L1', sku: SKU, qty: 1, unitPrice: 330_000 }] });
    const draft = c.json().data.order.id as string;
    const cl = await req(ctx, 'POST', `${M}/orders/${a.id}/close`, { note: 'Thử NT-BH-041 ca 10' });
    expect(cl.statusCode, cl.body).toBe(200);
    for (const id of [draft, a.id]) {
      for (const r of [
        await sources(kt, id),
        await req(kt, 'POST', `${M}/orders/${id}/transfers`, { step: 'prepare', fromBranchCode: 'CN01', fromWarehouse: 'CN01-KT', lines: [{ sku: SKU, qty: 1 }] }),
        await req(kt, 'POST', `${M}/orders/${id}/hold`, {}),
      ]) {
        expect(r.statusCode, r.body).toBe(409);
        expect(r.json().error.details.reason).toBe('PHIEU_BAN_ORDER_STATE');
      }
    }
  });
});
