// [2026-11-22 10:36 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B4b (D039-9): ca kiểm tạo site có chủ site — database mẫu chạy đủ migration thật, seed của Kernel, không in bí mật (T039-9 một phần)
/**
 * Tạo site có chủ site — PHASE-039 B4b. Database mẫu dựng bằng migration thật (`src/db/migrate.ts`, ~10 giây).
 *   - site mới có đơn vị đầu (mã = slug, tên công ty), tài khoản chủ site (email của khách, vai trò owner, mật khẩu kiểm được),
 *     hệ thống tài khoản; KHÔNG có khoá API tích hợp tự sinh;
 *   - mật khẩu / khoá không xuất hiện trong console (R-LOG-4);
 *   - lệnh `site list` thấy site;
 *   - bước khởi tạo hỏng → dọn sạch database, vai trò, registry.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { closeDb } from '../src/db/client.js';
import { env } from '../src/config/env.js';
import { verifyPassword } from '@bizcity/platform/core/security/password';
import { closeSiteRegistry, configureSiteRegistryForTest } from '@bizcity/platform/db/site-registry';
import { configureProvisionerForTest, createSite, siteDbNames } from '@bizcity/platform/db/site-provisioner';
import { createSiteWithOwner, listSites } from '../src/db/site-create.js';
import { parseArgs } from '../src/cli/site.js';

const API_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testDb = new URL(env.DATABASE_URL).pathname.slice(1);
const CTL = `${testDb}_cctl`;
const TPL = `${testDb}_ctpl`;
const KEY = 'khoa-bi-mat-cua-test-phai-du-32-ky-tu!';
const SLUGS = ['pvb-congtyz', 'pvb-hongkhoitao'];
const urlOf = (name: string) => { const u = new URL(env.DATABASE_URL); u.pathname = `/${name}`; return u.toString(); };

async function q<T extends pg.QueryResultRow>(database: string, text: string, values: unknown[] = []): Promise<T[]> {
  const c = new pg.Client({ connectionString: urlOf(database) });
  await c.connect();
  try { return (await c.query<T>(text, values)).rows; } finally { await c.end(); }
}

async function dropAll(): Promise<void> {
  for (const slug of SLUGS) {
    const { dbName, appRole } = siteDbNames(slug);
    await q('postgres', `DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await q('postgres', `DROP ROLE IF EXISTS ${appRole}`);
  }
  await q('postgres', `DROP DATABASE IF EXISTS ${TPL} WITH (FORCE)`);
  await q('postgres', `DROP DATABASE IF EXISTS ${CTL} WITH (FORCE)`);
}

beforeAll(async () => {
  await dropAll();
  await q('postgres', `CREATE DATABASE ${CTL}`);
  await q('postgres', `CREATE DATABASE ${TPL}`);
  execSync('npx tsx --conditions=development src/db/migrate.ts', { cwd: API_DIR, env: { ...process.env, DATABASE_URL: urlOf(TPL) }, stdio: 'pipe' });
  await configureSiteRegistryForTest(urlOf(CTL), KEY);
  configureProvisionerForTest({ templateDb: TPL, adminUrl: env.DATABASE_URL, parentRole: 'ketoan_app' });
}, 180_000);

afterAll(async () => {
  await closeDb();
  await closeSiteRegistry();
  await configureSiteRegistryForTest(undefined);
  await dropAll();
});

describe('PHASE-039 B4b — tạo site có chủ site', () => {
  let r: Awaited<ReturnType<typeof createSiteWithOwner>>;
  let printed = '';

  it('site mới có đơn vị đầu, chủ site, hệ thống tài khoản; không có khoá API tự sinh; không in bí mật', async () => {
    const spy = vi.spyOn(console, 'log');
    try {
      r = await createSiteWithOwner({ slug: 'pvb-congtyz', domain: 'congtyz.btnet.test', name: 'Công ty Z', email: 'Chu@Z.test' });
    } finally {
      printed = spy.mock.calls.map((c) => c.join(' ')).join('\n');
      spy.mockRestore();
    }
    expect(r).toMatchObject({ slug: 'pvb-congtyz', dbName: 'kt_pvb_congtyz', ownerEmail: 'chu@z.test' });
    expect(r.ownerPassword.length).toBeGreaterThanOrEqual(16);

    const tenants = await q<{ id: string; code: string; name: string }>(r.dbName, 'SELECT id::text, code, name FROM tenants');
    expect(tenants).toEqual([{ id: r.tenantId, code: 'pvb-congtyz', name: 'Công ty Z' }]);
    const users = await q<{ email: string; role: string; password_hash: string }>(r.dbName, 'SELECT email, role, password_hash FROM users');
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ email: 'chu@z.test', role: 'owner' });
    expect(await verifyPassword(r.ownerPassword, users[0]!.password_hash)).toBe(true);
    const [acc] = await q<{ n: number }>(r.dbName, 'SELECT count(*)::int AS n FROM accounts');
    expect(acc!.n).toBeGreaterThan(50);
    const [keys] = await q<{ n: number }>(r.dbName, 'SELECT count(*)::int AS n FROM api_keys');
    expect(keys!.n).toBe(0);
  });

  it('mật khẩu chủ site không xuất hiện trong console (R-LOG-4)', () => {
    expect(printed).toContain('chu@z.test');
    expect(printed).not.toContain(r.ownerPassword);
  });

  it('lệnh site list thấy site cùng tên miền', async () => {
    const rows = await listSites();
    expect(rows.find((s) => s.slug === 'pvb-congtyz')).toMatchObject({ status: 'active', db_name: 'kt_pvb_congtyz', domains: 'congtyz.btnet.test' });
  });

  it('bước khởi tạo hỏng → dọn sạch database, vai trò, registry', async () => {
    await expect(createSite({ slug: 'pvb-hongkhoitao', domain: 'hong.btnet.test' }, async () => { throw new Error('seed hỏng (giả lập)'); }))
      .rejects.toMatchObject({ code: 'SITE_PROVISION_FAILED' });
    expect((await listSites()).some((s) => s.slug === 'pvb-hongkhoitao')).toBe(false);
    const [left] = await q<{ r: number; d: number }>('postgres',
      "SELECT (SELECT count(*) FROM pg_roles WHERE rolname = 'kt_pvb_hongkhoitao_app')::int AS r, (SELECT count(*) FROM pg_database WHERE datname = 'kt_pvb_hongkhoitao')::int AS d");
    expect(left).toEqual({ r: 0, d: 0 });
  });

  it('đọc tham số dòng lệnh', () => {
    expect(parseArgs(['create', '--slug', 'a-b', '--name', 'Công ty A', '--json'])).toEqual({ _: ['create'], slug: 'a-b', name: 'Công ty A', json: true });
  });
});
