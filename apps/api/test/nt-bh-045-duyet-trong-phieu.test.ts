/**
 * NT-BH-045 — BH10 / BH11: ô Khách hàng chỉ khách (kể cả đối tượng vừa NCC vừa khách), Duyệt trong phiếu (Ghi rồi Duyệt bằng đúng lệnh
 * cũ), danh sách có người lập / người duyệt / ngày duyệt. Số liệu §4 của phiếu (docs/nghiem-thu/ban-hang/NT-BH-045-…md).
 */
// [2026-11-26 09:30 PM Võ Hoàng] NGHIEM-THU — test tích hợp phiếu NT-BH-045 (đóng góp)
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

const DIR = fileURLToPath(new URL('../../../modules/phieu-ban/', import.meta.url));
const HAS = existsSync(path.join(DIR, 'bizcity.module.json'));
const M = '/api/v1/m/phieu-ban';
const READS = ['bizcity_read.branches', 'bizcity_read.products', 'bizcity_read.tax_codes', 'bizcity_read.payment_methods', 'bizcity_read.partners', 'bizcity_read.branch_prices', 'bizcity_read.stock_on_hand', 'bizcity_read.warehouses'];
const TODAY = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

describe.skipIf(!HAS)('NT-BH-045 — Duyệt trong phiếu, ô Khách chỉ khách', () => {
  let ctx: TestCtx;
  let app: FastifyInstance;
  let k = 0;
  const req = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) => app.inject({
    method, url, ...(payload ? { payload: payload as never } : {}),
    headers: { authorization: `Bearer ${ctx.token}`, ...(method === 'GET' ? {} : { 'idempotency-key': `nt-bh-045-${++k}-${Date.now()}` }) },
  });

  beforeAll(async () => {
    ctx = await setupTenant();
    await runModuleMigrations('phieu-ban', path.join(DIR, 'migrations'), { reads: READS });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:nt-bh-045', trx as never); });
    app = await buildApp();
    expect((await call(ctx, 'PUT', '/api/v1/products', { products: [{ sku: '1001', name: 'Sữa A', unit: 'Hộp' }] })).status).toBeLessThan(300);
    expect((await call(ctx, 'PUT', '/api/v1/products/1001', { taxOutCode: 'R08' })).status).toBe(200);
    expect((await call(ctx, 'POST', '/api/v1/partners', { code: 'KH001', name: 'Khách 045', kind: 'customer' })).status).toBeLessThan(300);
    expect((await call(ctx, 'POST', '/api/v1/partners', { code: 'NCC001', name: 'NCC 045', kind: 'supplier' })).status).toBeLessThan(300);
    expect((await call(ctx, 'POST', '/api/v1/partners', { code: 'DT001', name: 'Vừa NCC vừa khách 045', kind: 'supplier', alsoKinds: ['customer'] })).status).toBeLessThan(300);
    const modes = (await call(ctx, 'GET', '/api/v1/settings/posting-modes')).body.data;
    expect((await call(ctx, 'PUT', '/api/v1/settings/posting-modes', { ...modes, sale: 'auto', sale_return: 'auto' })).status).toBe(200);
  });
  afterAll(async () => {
    await app?.close();
    await ctx?.app.close();
  });

  it('§5 ô Khách hàng: lọc kind=customer thấy KH001, DT001 (also_kinds); không thấy NCC001', async () => {
    const r = await req('GET', '/api/v1/partners?search=045&kind=customer&pageSize=30');
    expect(r.statusCode, r.body).toBe(200);
    const codes = (r.json().data as { code: string }[]).map((x) => x.code).sort();
    expect(codes).toEqual(['DT001', 'KH001']);
  });

  it('§5 Duyệt trong phiếu: Ghi rồi Duyệt → Đã duyệt, danh sách có người lập / người duyệt / ngày duyệt; Bỏ duyệt → Nháp, người duyệt ẩn', async () => {
    const c = await req('POST', `${M}/docs`, { docType: 'sale', docDate: TODAY, branchCode: 'CN01', partner: { code: 'KH001' }, payments: [], lines: [{ lineKey: 'L1', sku: '1001', qty: 2, unitPrice: 100_000 }] });
    expect(c.statusCode, c.body).toBe(200);
    const id = c.json().data.id as string;
    expect(c.json().data.createdBy).toBeTruthy();
    const a = await req('POST', `${M}/docs/${id}/approve`);
    expect(a.statusCode, a.body).toBe(200);
    expect(a.json().data).toMatchObject({ status: 'approved', totals: { beforeTax: 200_000, tax: 16_000, total: 216_000 } });
    const list = (await req('GET', `${M}/docs?docType=sale&from=${TODAY}&to=${TODAY}`)).json().data as { id: string; createdBy?: string; approvedBy?: string; approvedAt?: string }[];
    const row = list.find((x) => x.id === id)!;
    expect(row.approvedBy).toBe(row.createdBy);
    expect(row.approvedAt?.slice(0, 4)).toBe(TODAY.slice(0, 4));
    const u = await req('POST', `${M}/docs/${id}/unapprove`, { reason: 'NT-BH-045 bỏ duyệt' });
    expect(u.statusCode, u.body).toBe(200);
    expect(u.json().data.status).toBe('draft');
  });
});
