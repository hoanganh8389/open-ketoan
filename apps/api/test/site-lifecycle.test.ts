// [2026-11-22 01:18 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B6b (D039-15, Q039-1, R-SITE-12): ca kiểm vòng đời site — khoá chỉ đọc, mở lại, xoá mềm, lấy lại, dọn (T039-12)
/**
 * Vòng đời site — PHASE-039 B6b. Một site thật (database từ mẫu chạy đủ migration):
 *   - khoá: GET / đăng nhập / xem trước chạy, ghi khác → 423 SITE_SUSPENDED và route không chạy; mở lại → ghi được (Q039-1);
 *   - xoá mềm: site chưa khoá / không có bản sao lưu ≤ 24 giờ → từ chối; hợp lệ → database đổi tên, tên miền 404, vai trò ứng dụng
 *     không vào được; lấy lại trong 30 ngày → database về tên cũ, site khoá (T039-12);
 *   - dọn: `_cu_` > 7 ngày, `_kp_` > 1 ngày, xoá mềm > 30 ngày (DROP + gỡ vai trò, tên miền); bản mới hơn và database lạ không bị chạm.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import pg from 'pg';
import { closeDb } from '../src/db/client.js';
import { env } from '../src/config/env.js';
import { registerRequestContext } from '../src/core/request-context.js';
import { setSiteModeForTest } from '@bizcity/platform/db/site';
import { closeSiteRegistry, configureSiteRegistryForTest, invalidateSiteCache, resolveSiteByHost } from '@bizcity/platform/db/site-registry';
import { configureProvisionerForTest, newSiteId, siteDbNames } from '@bizcity/platform/db/site-provisioner';
import { deleteSite, resumeSite, suspendSite, sweepSites, undeleteSite } from '@bizcity/platform/db/site-lifecycle';
import { createSiteWithOwner } from '../src/db/site-create.js';

const API_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testDb = new URL(env.DATABASE_URL).pathname.slice(1);
const CTL = `${testDb}_lctl`;
const TPL = `${testDb}_ltpl`;
const KEY = 'khoa-bi-mat-cua-test-phai-du-32-ky-tu!';
const SLUG = 'pvl-congtya';
const HOST = 'a.lifecycle.test';
const { dbName: DB, appRole: ROLE } = siteDbNames(SLUG);
const STRANGER = `${testDb}_l_la_cu_20200101t000000`; // database lạ có đuôi giống: không được dọn
const urlOf = (name: string) => { const u = new URL(env.DATABASE_URL); u.pathname = `/${name}`; return u.toString(); };

async function q<T extends pg.QueryResultRow>(database: string, text: string, values: unknown[] = []): Promise<T[]> {
  const c = new pg.Client({ connectionString: urlOf(database) });
  await c.connect();
  try { return (await c.query<T>(text, values)).rows; } finally { await c.end(); }
}
const dbs = async () => (await q<{ datname: string }>('postgres',
  "SELECT datname FROM pg_database WHERE datname = $1 OR datname ~ ('^' || $1 || '_(cu|kp|xoa)_') OR datname = $2 ORDER BY datname", [DB, STRANGER])).map((r) => r.datname);
async function dropAll(): Promise<void> {
  for (const d of await dbs()) await q('postgres', `DROP DATABASE IF EXISTS ${d} WITH (FORCE)`);
  await q('postgres', `DROP ROLE IF EXISTS ${ROLE}`);
  await q('postgres', `DROP DATABASE IF EXISTS ${TPL} WITH (FORCE)`);
  await q('postgres', `DROP DATABASE IF EXISTS ${CTL} WITH (FORCE)`);
}
const status = async () => (await q<{ status: string; deleted_db: string | null; purged_at: Date | null; suspend_reason: string | null }>(
  CTL, 'SELECT status, deleted_db, purged_at, suspend_reason FROM sites WHERE slug = $1', [SLUG]))[0]!;
const backupRow = (siteId: string, hoursAgo: number) => q(CTL,
  `INSERT INTO site_backups (id, site_id, file, bytes, tables, reason, verified, created_at)
   VALUES ($1, $2, '/kiem/thu.dump', 1, 1, 'manual', true, now() - make_interval(hours => $3))`, [newSiteId(), siteId, hoursAgo]);

let app: FastifyInstance;
let site: Awaited<ReturnType<typeof createSiteWithOwner>>;
let reached = 0;

beforeAll(async () => {
  await dropAll();
  await q('postgres', `CREATE DATABASE ${CTL}`);
  await q('postgres', `CREATE DATABASE ${TPL}`);
  execSync('npx tsx --conditions=development src/db/migrate.ts', { cwd: API_DIR, env: { ...process.env, DATABASE_URL: urlOf(TPL) }, stdio: 'pipe' });
  await configureSiteRegistryForTest(urlOf(CTL), KEY);
  configureProvisionerForTest({ templateDb: TPL, adminUrl: env.DATABASE_URL, parentRole: 'ketoan_app' });
  site = await createSiteWithOwner({ slug: SLUG, domain: HOST, name: 'Công ty A' });
  app = Fastify();
  registerRequestContext(app);
  for (const url of ['/api/v1/x', '/api/v1/auth/login', '/api/v1/posting/scheme/preview']) {
    app.get(url, async () => { reached++; return { ok: true }; });
    app.post(url, async () => { reached++; return { ok: true }; });
  }
}, 240_000);

afterAll(async () => {
  setSiteModeForTest('single');
  await app?.close();
  await closeDb();
  await closeSiteRegistry();
  await configureSiteRegistryForTest(undefined);
  await dropAll();
});

const call = (method: 'GET' | 'POST', url: string) => app.inject({ method, url, headers: { host: HOST }, ...(method === 'POST' ? { payload: {} } : {}) });

describe('PHASE-039 B6b — vòng đời site', () => {
  it('khoá: xem / đăng nhập / xem trước chạy, ghi khác → 423 không chạy route; mở lại → ghi được (Q039-1)', async () => {
    setSiteModeForTest('multi');
    try {
      expect(await suspendSite(SLUG, 'quá hạn thanh toán')).toMatchObject({ status: 'suspended' });
      expect(await status()).toMatchObject({ status: 'suspended', suspend_reason: 'quá hạn thanh toán' });
      expect(await suspendSite(SLUG)).toMatchObject({ status: 'suspended' }); // gọi lại không hại
      expect(await resolveSiteByHost(HOST)).toEqual({ siteId: site.siteId, readOnly: true });
      reached = 0;
      expect((await call('GET', '/api/v1/x')).statusCode).toBe(200);
      expect((await call('POST', '/api/v1/auth/login')).statusCode).toBe(200);
      expect((await call('POST', '/api/v1/posting/scheme/preview')).statusCode).toBe(200);
      const w = await call('POST', '/api/v1/x');
      expect(w.statusCode).toBe(423);
      expect(w.json()).toMatchObject({ ok: false, error: { code: 'SITE_SUSPENDED' } });
      expect(reached).toBe(3);

      await resumeSite(SLUG);
      expect((await call('POST', '/api/v1/x')).statusCode).toBe(200);
      expect(await status()).toMatchObject({ status: 'active', suspend_reason: null });
    } finally {
      setSiteModeForTest('single');
    }
  });

  it('xoá mềm bị từ chối: chưa khoá, không có bản sao lưu, bản sao lưu quá 24 giờ (T039-12)', async () => {
    await expect(deleteSite(SLUG)).rejects.toMatchObject({ code: 'SITE_STATE_INVALID' });
    await suspendSite(SLUG);
    await expect(deleteSite(SLUG)).rejects.toMatchObject({ code: 'SITE_BACKUP_REQUIRED' });
    await backupRow(site.siteId, 25);
    await expect(deleteSite(SLUG)).rejects.toMatchObject({ code: 'SITE_BACKUP_REQUIRED' });
    expect(await dbs()).toEqual([DB]);
    await expect(deleteSite('khong-co')).rejects.toMatchObject({ code: 'SITE_UNKNOWN' });
  });

  it('xoá mềm hợp lệ: database đổi tên, tên miền 404, vai trò ứng dụng không vào được; lấy lại → về tên cũ, site khoá', async () => {
    await backupRow(site.siteId, 1);
    const d = await deleteSite(SLUG);
    expect(d.deletedDb).toMatch(new RegExp(`^${DB}_xoa_\\d{8}t\\d{6}$`));
    expect(await dbs()).toEqual([d.deletedDb]);
    expect(await status()).toMatchObject({ status: 'deleted', deleted_db: d.deletedDb });
    invalidateSiteCache();
    expect(await resolveSiteByHost(HOST)).toBeNull();
    const p = await q<{ c: boolean }>('postgres', "SELECT has_database_privilege($1, $2, 'CONNECT') AS c", [ROLE, d.deletedDb]);
    expect(p[0]!.c).toBe(false);

    expect(await undeleteSite(SLUG)).toMatchObject({ status: 'suspended' });
    expect(await dbs()).toEqual([DB]);
    expect(await status()).toMatchObject({ status: 'suspended', deleted_db: null });
    const p2 = await q<{ c: boolean }>('postgres', "SELECT has_database_privilege($1, $2, 'CONNECT') AS c", [ROLE, DB]);
    expect(p2[0]!.c).toBe(true);
    expect((await q<{ n: string }>(DB, 'SELECT count(*) AS n FROM tenants'))[0]!.n).toBe('1'); // dữ liệu còn nguyên
    await expect(undeleteSite(SLUG)).rejects.toMatchObject({ code: 'SITE_STATE_INVALID' });
  });

  it('dọn: _cu_ > 7 ngày, _kp_ > 1 ngày, xoá mềm > 30 ngày; bản mới hơn và database lạ không chạm', async () => {
    const now = Date.UTC(2026, 10, 22, 12, 0, 0);
    const oldCu = `${DB}_cu_20261110t000000`; // 12 ngày
    const newCu = `${DB}_cu_20261120t000000`; // 2 ngày
    const oldKp = `${DB}_kp_20261120t000000`; // 2 ngày
    for (const n of [oldCu, newCu, oldKp, STRANGER]) await q('postgres', `CREATE DATABASE ${n}`);
    await q(CTL, 'UPDATE sites SET previous_db = $2 WHERE slug = $1', [SLUG, oldCu]);

    const dry = await sweepSites({ now, dryRun: true });
    expect(dry.map((a) => [a.kind, a.database]).sort()).toEqual([['drop_previous', oldCu], ['drop_restore_tmp', oldKp]]);
    expect(await dbs()).toEqual([DB, newCu, oldCu, oldKp, STRANGER].sort());

    await sweepSites({ now });
    expect(await dbs()).toEqual([DB, newCu, STRANGER].sort());
    expect((await q<{ previous_db: string | null }>(CTL, 'SELECT previous_db FROM sites WHERE slug = $1', [SLUG]))[0]!.previous_db).toBeNull();

    // xoá mềm 31 ngày trước → dọn hẳn
    const d = await deleteSite(SLUG);
    await q(CTL, "UPDATE sites SET deleted_at = now() - interval '31 days' WHERE slug = $1", [SLUG]);
    const acts = await sweepSites();
    expect(acts).toContainEqual({ kind: 'purge_deleted', slug: SLUG, database: d.deletedDb });
    expect(await dbs()).toEqual([newCu, STRANGER].sort());
    expect((await status()).purged_at).not.toBeNull();
    expect(await q(CTL, 'SELECT 1 FROM site_domains WHERE site_id = $1', [site.siteId])).toEqual([]);
    expect(await q('postgres', 'SELECT 1 FROM pg_roles WHERE rolname = $1', [ROLE])).toEqual([]);
    await expect(undeleteSite(SLUG)).rejects.toMatchObject({ code: 'SITE_STATE_INVALID' });
  });
});
