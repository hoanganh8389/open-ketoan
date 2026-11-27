/**
 * NT-BH-056 — KHO04 Đề nghị điều chuyển (module de-nghi-dieu-chuyen, chốt 28/11/2026).
 * Dữ liệu: CN01 chi nhánh cha (kho tổng CN01-KT), cửa hàng CH02 (kho bán CH02-K1) và CH03 (CH03-K1) cùng cha CN01; HN01 chi nhánh gốc khác.
 * Tồn SUA01 ở CH02-K1: 10. Thu ngân CH02 (vai trò gán tại CH02: de-nghi-dieu-chuyen:xem / lap) lập đề nghị; chủ đơn vị duyệt → KHO01.
 * Duyệt như màn: module prepare → action Kho kho.transfer.create (POST /api/v1/kho/transfers, phiên người duyệt) → module record.
 */
// [2026-11-28 10:00 AM Võ Hoàng] NGHIEM-THU — test tích hợp phiếu NT-BH-056 (đóng góp)
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { beforeAll, describe, expect, it } from 'vitest';
import { runModuleMigrations } from '@bizcity/platform/db/module-db';
import { buildApp } from '../src/app.js';
import { syncBundled } from '../src/core/module-lifecycle.js';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';
import { nhapTon } from './pos-nhap-ton.js';

const DIR = fileURLToPath(new URL('../../../modules/de-nghi-dieu-chuyen/', import.meta.url));
const HAS = existsSync(path.join(DIR, 'bizcity.module.json'));
const READS = ['bizcity_read.branches', 'bizcity_read.warehouses', 'bizcity_read.products', 'bizcity_read.stock_on_hand', 'bizcity_read.partners'];
const SKU = 'SUA01';
const M = '/api/v1/m/de-nghi-dieu-chuyen';
const CK = '/api/v1/kho/transfers';
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const PERIOD = `${TODAY.slice(2, 4)}${TODAY.slice(5, 7)}`;

type Phieu = { id: string; docNo: string; status: string; version: number; totalQty: number; lines: { sku: string; qty: number; stock: number }[];
  transfer: { id: string; docNo: string; status?: string } | null; toBranchCode: string; source: string; rejectReason: string | null };
type Prepared = { phieu: Phieu; payload: Record<string, unknown> & { lines: { sku: string; qty: number }[]; fromWarehouse: string; toWarehouse: string; mode: string } };

describe.skipIf(!HAS)('NT-BH-056 — KHO04 Đề nghị điều chuyển', () => {
  let ctx: TestCtx;
  let tn: TestCtx;
  let app: FastifyInstance;
  let tenantId = '';
  let k = 0;
  const req = (who: TestCtx, method: 'GET' | 'POST', url: string, payload?: unknown) => app.inject({
    method, url, ...(payload ? { payload: payload as never } : {}),
    headers: { authorization: `Bearer ${who.token}`, ...(method === 'GET' ? {} : { 'idempotency-key': `nt-bh-056-${++k}-${Date.now()}` }) },
  });
  const ok = <T>(r: { statusCode: number; body: string; json: () => { data: T } }) => { expect(r.statusCode, r.body.slice(0, 600)).toBeLessThan(300); return r.json().data; };
  const codes = (r: { json: () => { error?: { details?: { findings?: { code: string }[] } } } }) => (r.json().error?.details?.findings ?? []).map((f) => f.code);
  const stock = async (wh: string) => Number((await sql<{ q: string | null }>`
    SELECT SUM(qty) AS q FROM bizcity_read.stock_on_hand WHERE tenant_id = ${tenantId} AND sku = ${SKU} AND warehouse_code = ${wh}`.execute(db)).rows[0]?.q ?? 0);
  const base = (over: Record<string, unknown> = {}) => ({ branchCode: 'CH02', toBranchCode: 'CN01', note: 'Trả hàng về kho tổng', source: 'pos', lines: [{ sku: SKU, qty: 4 }], ...over });

  beforeAll(async () => {
    ctx = await setupTenant();
    tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
    await runModuleMigrations('de-nghi-dieu-chuyen', path.join(DIR, 'migrations'), { reads: READS });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:nt-bh-056', trx as never); });
    app = await buildApp();
    for (const b of [{ code: 'CH02', name: 'Cửa hàng 02' }, { code: 'CH03', name: 'Cửa hàng 03' }, { code: 'HN01', name: 'Hà Nội 01' }]) expect((await call(ctx, 'POST', '/api/v1/branches', b)).status).toBe(201);
    await sql`UPDATE branches SET parent_id = (SELECT id FROM branches WHERE tenant_id = ${tenantId} AND code = 'CN01'), level = 'shop'
               WHERE tenant_id = ${tenantId} AND code IN ('CH02', 'CH03')`.execute(db);
    expect((await call(ctx, 'PUT', '/api/v1/products', { products: [{ sku: SKU, name: 'Sữa 01', unit: 'Hộp' }] })).status).toBeLessThan(300);
    expect((await call(ctx, 'PUT', `/api/v1/products/${SKU}`, { taxOutCode: 'KCT' })).status).toBe(200);
    for (const [code, branchCode, name] of [['CN01-KT', 'CN01', 'Kho tổng CN01'], ['CH02-K1', 'CH02', 'Kho bán CH02'], ['CH03-K1', 'CH03', 'Kho bán CH03'], ['HN01-K1', 'HN01', 'Kho HN01']] as const) {
      expect((await call(ctx, 'POST', '/api/v1/warehouses', { code, branchCode, name, isDefault: true })).status).toBe(201);
    }
    await nhapTon(ctx, 'CH02', [[SKU, 10, 'Hộp']], '2026-10-01', 'NHAP-056-CH02', 'CH02-K1');
    // Thu ngân CH02: chỉ quyền xem / lập đề nghị, vai trò gán tại chi nhánh CH02 (phạm vi chi nhánh bật).
    const u = await call(ctx, 'POST', '/api/v1/users', { email: 'tn056@ketoan.local', fullName: 'Thu ngân 056', role: 'viewer', password: 'Pass@12345' });
    expect(u.status).toBe(201);
    const role = (await call(ctx, 'POST', '/api/v1/roles', { code: 'tn_056', label: 'tn_056', kind: 'job', baseRole: 'viewer', reason: 'NT-BH-056' })).body.data.id;
    for (const permission of ['de-nghi-dieu-chuyen:xem', 'de-nghi-dieu-chuyen:lap']) {
      expect((await call(ctx, 'POST', `/api/v1/roles/${role}/rules`, { permission, effect: 'allow', reason: 'NT-BH-056' })).status).toBe(201);
    }
    const ch02 = (await sql<{ id: string }>`SELECT id::text FROM branches WHERE tenant_id = ${tenantId} AND code = 'CH02'`.execute(db)).rows[0]!.id;
    expect((await call(ctx, 'POST', `/api/v1/users/${u.body.data.id}/roles`, { tenantRoleId: role, scopeType: 'branch', scopeId: ch02, reason: 'NT-BH-056' })).status).toBe(201);
    expect((await call(ctx, 'PUT', '/api/v1/settings/values/bizcity.authz.branch_scope', { value: 'on', reason: 'NT-BH-056' })).status).toBeLessThan(300);
    const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email: 'tn056@ketoan.local', password: 'Pass@12345' } });
    tn = { ...ctx, token: res.json().data.token };
  });

  it('ca 1: danh mục — chi nhánh nhận = cấp trên CN01 (đầu) + cùng cấp CH03; kho xuất mặc định CH02-K1', async () => {
    const d = ok<{ warehouseCode: string; receiveBranches: { code: string; isParent: boolean }[]; canApprove: boolean }>(await req(tn, 'GET', `${M}/danh-muc?branchCode=CH02`));
    expect(d.warehouseCode).toBe('CH02-K1');
    expect(d.receiveBranches.map((b) => [b.code, b.isParent])).toEqual([['CN01', true], ['CH03', false]]);
    expect(d.canApprove).toBe(false);
    const h = ok<{ items: { sku: string; stock: number }[] }>(await req(tn, 'GET', `${M}/hang?branchCode=CH02&skus=${SKU}`));
    expect(h.items[0]).toMatchObject({ sku: SKU, stock: 10 });
  });

  it('ca 2: chặn — quá tồn, chi nhánh nhận ngoài cây, thiếu chi nhánh nhận, không có dòng; thu ngân lập cho chi nhánh khác → FORBIDDEN', async () => {
    const over = await req(tn, 'POST', `${M}/phieu`, base({ lines: [{ sku: SKU, qty: 7 }, { sku: SKU, qty: 4 }] }));
    expect(over.statusCode).toBe(400);
    expect(codes(over)).toEqual(['DNDC_OVER_STOCK']);
    expect(codes(await req(tn, 'POST', `${M}/phieu`, base({ toBranchCode: 'HN01' })))).toEqual(['DNDC_TO_NOT_ALLOWED']);
    expect(codes(await req(tn, 'POST', `${M}/phieu`, base({ toBranchCode: '' })))).toEqual(['DNDC_TO_REQUIRED']);
    expect(codes(await req(tn, 'POST', `${M}/phieu`, base({ lines: [{ sku: '', qty: 3 }] })))).toEqual(['DNDC_NO_LINES']);
    expect((await req(tn, 'POST', `${M}/phieu`, base({ branchCode: 'CH03', toBranchCode: 'CN01' }))).statusCode).toBe(403);
  });

  let a: Phieu;
  it('ca 3: thu ngân lập đề nghị → Chờ duyệt, số DNDC-CH02-<yyMM>-0001, giữ tồn lúc lập; sửa hôm nay được (phiên bản 2)', async () => {
    a = ok<Phieu>(await req(tn, 'POST', `${M}/phieu`, base()));
    expect(a).toMatchObject({ status: 'pending', docNo: `DNDC-CH02-${PERIOD}-0001`, toBranchCode: 'CN01', source: 'pos', totalQty: 4 });
    expect(a.lines[0]).toMatchObject({ sku: SKU, qty: 4, stock: 10 });
    a = ok<Phieu>(await req(tn, 'POST', `${M}/phieu`, base({ id: a.id, version: a.version, lines: [{ sku: SKU, qty: 3 }] })));
    expect(a).toMatchObject({ status: 'pending', version: 2, totalQty: 3 });
    const stale = await req(tn, 'POST', `${M}/phieu`, base({ id: a.id, version: 1 }));
    expect(stale.statusCode).toBe(409);
    const list = ok<{ items: Phieu[] }>(await req(tn, 'GET', `${M}/phieu`));
    expect(list.items.map((x) => x.docNo)).toContain(a.docNo);
  });

  it('ca 4: thu ngân không duyệt được (thiếu quyền duyệt) → FORBIDDEN', async () => {
    expect((await req(tn, 'POST', `${M}/phieu/${a.id}/approve`, { step: 'prepare' })).statusCode).toBe(403);
    expect((await req(tn, 'POST', `${M}/phieu/${a.id}/reject`, { reason: 'Không cần chuyển' })).statusCode).toBe(403);
  });

  it('ca 5: abort — chuẩn bị rồi bỏ: đề nghị về Chờ duyệt', async () => {
    const p = ok<Prepared>(await req(ctx, 'POST', `${M}/phieu/${a.id}/approve`, { step: 'prepare' }));
    expect(p.phieu.status).toBe('approved');
    const b = ok<Phieu>(await req(ctx, 'POST', `${M}/phieu/${a.id}/approve`, { step: 'abort' }));
    expect(b.status).toBe('pending');
  });

  it('ca 6: duyệt — KHO01 xuất luôn CH02-K1 → CN01-KT (chờ nhận), đề nghị Đã lập chuyển kho; ghi lại cùng phiếu không ghi hai lần', async () => {
    const before = await stock('CH02-K1');
    const p = ok<Prepared>(await req(ctx, 'POST', `${M}/phieu/${a.id}/approve`, { step: 'prepare' }));
    expect(p.payload).toMatchObject({ fromBranchCode: 'CH02', fromWarehouse: 'CH02-K1', toBranchCode: 'CN01', toWarehouse: 'CN01-KT', mode: 'ship' });
    expect(p.payload.lines).toEqual([expect.objectContaining({ sku: SKU, qty: 3 })]);
    const t = ok<{ id: string | number; docNo: string; status: string; note: string }>(await req(ctx, 'POST', CK, p.payload));
    expect(t.note).toContain(a.docNo);
    const rec = { step: 'record', transfer: { id: String(t.id), docNo: t.docNo, status: t.status } };
    const done = ok<Phieu>(await req(ctx, 'POST', `${M}/phieu/${a.id}/approve`, rec));
    expect(done).toMatchObject({ status: 'converted', transfer: { id: String(t.id), docNo: t.docNo } });
    expect(await stock('CH02-K1')).toBe(before - 3);
    const again = ok<Phieu>(await req(ctx, 'POST', `${M}/phieu/${a.id}/approve`, rec));
    expect(again.version).toBe(done.version);
    // Đã lập chuyển kho: không sửa / huỷ / từ chối được nữa.
    expect((await req(tn, 'POST', `${M}/phieu`, base({ id: a.id, version: done.version }))).statusCode).toBe(409);
    expect((await req(ctx, 'POST', `${M}/phieu/${a.id}/reject`, { reason: 'Không cần chuyển' })).statusCode).toBe(409);
  });

  it('ca 7: từ chối cần lý do ≥ 5 ký tự; huỷ của người lập', async () => {
    const b = ok<Phieu>(await req(tn, 'POST', `${M}/phieu`, base({ toBranchCode: 'CH03', lines: [{ sku: SKU, qty: 1 }] })));
    expect(b.docNo).toBe(`DNDC-CH02-${PERIOD}-0002`);
    const short = await req(ctx, 'POST', `${M}/phieu/${b.id}/reject`, { reason: 'ko' });
    expect(codes(short)).toEqual(['DNDC_REASON_REQUIRED']);
    const r = ok<Phieu>(await req(ctx, 'POST', `${M}/phieu/${b.id}/reject`, { reason: 'Cửa hàng 03 đã đủ hàng' }));
    expect(r).toMatchObject({ status: 'rejected', rejectReason: 'Cửa hàng 03 đã đủ hàng' });
    const c = ok<Phieu>(await req(tn, 'POST', `${M}/phieu`, base({ lines: [{ sku: SKU, qty: 1 }] })));
    // Lệnh theo mã: thân mang chi nhánh của đề nghị (lớp phân quyền cộng quyền tại đó); khai chi nhánh khác → chặn.
    expect((await req(tn, 'POST', `${M}/phieu/${c.id}/cancel`, { branchCode: 'CH03' })).statusCode).toBe(403);
    expect(ok<Phieu>(await req(tn, 'GET', `${M}/phieu/${c.id}?branchCode=CH02`)).status).toBe('pending');
    expect(ok<Phieu>(await req(tn, 'POST', `${M}/phieu/${c.id}/cancel`, { branchCode: 'CH02' })).status).toBe('cancelled');
    expect((await req(ctx, 'POST', `${M}/phieu/${c.id}/approve`, { step: 'prepare' })).statusCode).toBe(409);
  });
});
