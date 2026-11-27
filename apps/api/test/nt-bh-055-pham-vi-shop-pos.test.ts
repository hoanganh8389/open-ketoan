/**
 * NT-BH-055 — phân quyền theo tài khoản ở báo cáo máy POS: nhân viên (vé chỉ pos:sell) xem được MỌI chi nhánh tài khoản đã mở ca / đã
 * bán (không chỉ ca gần nhất); chi nhánh khác → 403 kèm lý do; chưa thuộc chi nhánh nào → 403 chỉ cách gán; quản trị (pos:report) xem hết.
 */
// [2026-11-28 10:30 AM Võ Hoàng] NGHIEM-THU — NT-BH-055: test phạm vi chi nhánh của tài khoản máy POS (đóng góp)
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
import { setupTenant, type TestCtx } from './helpers.js';

const DIR = fileURLToPath(new URL('../../../modules/pos/', import.meta.url));
const HAS = existsSync(path.join(DIR, 'bizcity.module.json'));
const M = '/api/v1/m/pos';
const READS = ['bizcity_read.branches', 'bizcity_read.products', 'bizcity_read.tax_codes', 'bizcity_read.payment_methods', 'bizcity_read.partners',
  'bizcity_read.branch_prices', 'bizcity_read.stock_on_hand', 'bizcity_read.warehouses', 'bizcity_read.item_kinds',
  'bizcity_read.item_groups', 'bizcity_read.document_lots', 'bizcity_read.monthly_unit_costs'];
const TODAY = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const SECRET = 'kiem-thu-nt-bh-055';
const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url');
const ticket = (claims: Record<string, unknown>) => {
  const now = Math.floor(Date.now() / 1000);
  const body = b64(JSON.stringify({ iat: now, exp: now + 60, ...claims }));
  return `${body}.${b64(createHmac('sha256', SECRET).update(body).digest())}`;
};
const REPORTS = ['sales-lines', 'sales-summary', 'collections', 'by-category'];

describe.skipIf(!HAS)('NT-BH-055 — báo cáo máy POS theo chi nhánh của tài khoản', () => {
  let ctx: TestCtx;
  let app: FastifyInstance;
  let oldSecret = '';
  let k = 0;
  const auth = (t: string) => ({ authorization: `Bearer ${t}` });
  const get = (url: string, t: string) => app.inject({ method: 'GET', url: `${M}${url}`, headers: auth(t) });
  const post = (url: string, payload: unknown, t: string) =>
    app.inject({ method: 'POST', url: `${M}${url}`, payload: payload as never, headers: { ...auth(t), 'idempotency-key': `nt-bh-055-${++k}-${Date.now()}` } });
  const login = async (email: string, perms: string[]) =>
    (await loginWithWpTicket(ticket({ email, name: email, tenant: ctx.tenantCode, perms }))).token;

  beforeAll(async () => {
    ctx = await setupTenant();
    const tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
    await runModuleMigrations('pos', path.join(DIR, 'migrations'), { reads: READS });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:nt-bh-055', trx as never); });
    oldSecret = env.WP_SSO_SECRET;
    (env as { WP_SSO_SECRET: string }).WP_SSO_SECRET = SECRET;
    app = await buildApp();
    await sql`INSERT INTO branches (tenant_id, code, name) VALUES (${tenantId}, 'CN02', 'Cửa hàng 02'), (${tenantId}, 'CN03', 'Cửa hàng 03') ON CONFLICT DO NOTHING`.execute(db);
  });
  afterAll(async () => {
    (env as { WP_SSO_SECRET: string }).WP_SSO_SECRET = oldSecret;
    await app?.close();
    await ctx?.app.close();
  });

  it('ca 1: nhân viên bán ở hai shop (mở ca CN01 rồi CN02) xem được cả hai, không chỉ shop của ca gần nhất', async () => {
    const t = await login('nv-hai-shop-055@example.test', ['pos:sell']);
    for (const b of ['CN01', 'CN02']) {
      const r = await post('/shifts/open', { openingCash: 0, branchCode: b }, t);
      expect(r.statusCode, r.body).toBe(201);
    }
    for (const b of ['CN01', 'CN02']) for (const p of REPORTS) {
      const r = await get(`/reports/${p}?from=${TODAY}&to=${TODAY}&branch=${b}`, t);
      expect(r.statusCode, `${p} ${b}: ${r.body}`).toBe(200);
    }
    const daily = await get('/reports/daily?branch=CN01', t);
    expect(daily.statusCode, daily.body).toBe(200);
  });

  it('ca 2: chi nhánh tài khoản chưa làm → 403 nói rõ được xem chi nhánh nào', async () => {
    const t = await login('nv-mot-shop-055@example.test', ['pos:sell']);
    expect((await post('/shifts/open', { openingCash: 0, branchCode: 'CN03' }, t)).statusCode).toBe(201);
    expect((await get(`/reports/sales-lines?from=${TODAY}&to=${TODAY}&branch=CN03`, t)).statusCode).toBe(200);
    const r = await get(`/reports/sales-lines?from=${TODAY}&to=${TODAY}&branch=CN01`, t);
    expect(r.statusCode).toBe(403);
    expect(r.json().error.message).toContain('chỉ xem được số của chi nhánh CN03');
    // Không gửi chi nhánh: tài khoản chỉ thuộc một chi nhánh thì lấy chi nhánh đó.
    expect((await get(`/reports/sales-lines?from=${TODAY}&to=${TODAY}`, t)).statusCode).toBe(200);
  });

  it('ca 3: tài khoản chưa mở ca / chưa bán lần nào → 403 chỉ cách gán chi nhánh', async () => {
    const t = await login('nv-moi-055@example.test', ['pos:sell']);
    const r = await get(`/reports/collections?from=${TODAY}&to=${TODAY}&branch=CN01`, t);
    expect(r.statusCode).toBe(403);
    expect(r.json().error.message).toContain('chưa thuộc chi nhánh nào');
  });

  it('ca 4: quản trị (pos:report) xem mọi chi nhánh, không cần ca', async () => {
    const t = await login('quan-tri-055@example.test', ['pos:sell', 'pos:report']);
    for (const b of ['CN01', 'CN02', 'CN03']) {
      const r = await get(`/reports/sales-summary?from=${TODAY}&to=${TODAY}&branch=${b}`, t);
      expect(r.statusCode, `${b}: ${r.body}`).toBe(200);
    }
  });
});
