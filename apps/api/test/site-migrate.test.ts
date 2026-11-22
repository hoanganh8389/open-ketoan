// [2026-11-22 11:19 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B3 (D039-11, D039-12, R-SITE-8, R-SITE-9, R-SITE-10): ca kiểm Migration Runner theo site + cổng lược đồ (T039-7, T039-8)
/**
 * Migration theo site — PHASE-039 B3. Ba site thật tạo từ cùng database mẫu (migration thật). Thư mục migration tạm = bản sao
 * db/migrations + một tệp 9999 cố ý lỗi ở site thứ 2:
 *   - thiếu pg_dump → dừng trước khi chạm registry;
 *   - `site migrate --all`: mẫu nâng trước; site 1, 3 xong, site 2 `migration_failed` và không đổi lược đồ (T039-7);
 *   - cổng lược đồ: ứng dụng mới chặn site 2 (SITE_MIGRATION_FAILED), ứng dụng cũ chặn site đã nâng (SITE_UPGRADING, T039-8);
 *     việc nền bỏ site bị chặn; site khoá trước khi nâng vẫn khoá sau khi nâng;
 *   - sửa tệp lỗi, chạy lại: site 2 xong, site 1, 3 "đã mới".
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import pg from 'pg';
import { closeDb } from '../src/db/client.js';
import { env } from '../src/config/env.js';
import { currentRequest, registerRequestContext } from '../src/core/request-context.js';
import { eachSite } from '../src/core/events.js';
import { MIGRATIONS_DIR } from '@bizcity/platform/db/paths';
import { requiredSchemaVersion } from '@bizcity/platform/db/migrate';
import { setSiteModeForTest } from '@bizcity/platform/db/site';
import {
  closeSiteRegistry, configureSiteRegistryForTest, gatedSiteIds, invalidateSiteCache, resolveSiteByHost, setRequiredSchemaVersionForTest,
} from '@bizcity/platform/db/site-registry';
import { configureProvisionerForTest, siteDbNames } from '@bizcity/platform/db/site-provisioner';
import { migrateSites, SiteMigrateError, type SiteBackup } from '@bizcity/platform/db/site-migrate';
// [2026-11-22 12:35 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B6a: ca thiếu pg_dump dùng công cụ giả, không đổi process.env.PATH (đổi PATH làm chết worker vitest khi chạy song song trên Windows)
import { localPgTools, setPgToolsForTest } from '@bizcity/platform/db/site-backup';
import { createSiteWithOwner } from '../src/db/site-create.js';

const API_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testDb = new URL(env.DATABASE_URL).pathname.slice(1);
const CTL = `${testDb}_mctl`;
const TPL = `${testDb}_mtpl`;
const KEY = 'khoa-bi-mat-cua-test-phai-du-32-ky-tu!';
const SLUGS = ['pvm-site1', 'pvm-site2', 'pvm-site3'];
const NEXT = '9999_b3_kiem_nang_cap.sql';
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
const status = async () => Object.fromEntries((await q<{ slug: string; status: string; schema_version: string | null; resume_status: string | null }>(
  CTL, 'SELECT slug, status, schema_version, resume_status FROM sites ORDER BY slug')).map((r) => [r.slug, r]));
const hasProbe = async (database: string) => (await q<{ t: string | null }>(database, "SELECT to_regclass('public.b3_probe')::text AS t"))[0]!.t !== null;

/** Tệp 9999: lỗi cố ý ở database của site 2 (chỉ trong ca kiểm — migration thật không được đọc tên database, R-SITE-11). */
const writeNext = (failOnSite2: boolean) => writeFileSync(path.join(tmpDir, NEXT), `
${failOnSite2 ? `DO $$ BEGIN IF current_database() = '${siteDbNames('pvm-site2').dbName}' THEN RAISE EXCEPTION 'lỗi cố ý của ca kiểm'; END IF; END $$;` : ''}
CREATE TABLE b3_probe (x integer);
`);

let tmpDir: string;
let OLD: string;
const sites: Record<string, Awaited<ReturnType<typeof createSiteWithOwner>>> = {};
const backups: string[] = [];
const fakeBackup: SiteBackup = async ({ slug }) => { backups.push(slug); return `test://${slug}.dump`; };

beforeAll(async () => {
  await dropAll();
  await q('postgres', `CREATE DATABASE ${CTL}`);
  await q('postgres', `CREATE DATABASE ${TPL}`);
  execSync('npx tsx --conditions=development src/db/migrate.ts', { cwd: API_DIR, env: { ...process.env, DATABASE_URL: urlOf(TPL) }, stdio: 'pipe' });
  await configureSiteRegistryForTest(urlOf(CTL), KEY);
  configureProvisionerForTest({ templateDb: TPL, adminUrl: env.DATABASE_URL, parentRole: 'ketoan_app' });
  for (const [i, slug] of SLUGS.entries()) sites[slug] = await createSiteWithOwner({ slug, domain: `s${i + 1}.migrate.test`, name: slug });
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'okt-b3-'));
  // [2026-11-22 12:35 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B6a: chép từng tệp, không fs.cpSync({ recursive }) — nghi làm chết worker vitest (thoát không báo lỗi) khi chạy song song trên Windows
  for (const f of readdirSync(MIGRATIONS_DIR)) copyFileSync(path.join(MIGRATIONS_DIR, f), path.join(tmpDir, f));
  writeNext(true);
  OLD = requiredSchemaVersion();
}, 240_000);

afterAll(async () => {
  setSiteModeForTest('single');
  setRequiredSchemaVersionForTest(undefined);
  await closeDb();
  await closeSiteRegistry();
  await configureSiteRegistryForTest(undefined);
  await dropAll();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('PHASE-039 B3 — migration theo site, cổng lược đồ', () => {
  it('site mới ghi schema_version = lược đồ của database mẫu', async () => {
    const s = await status();
    for (const slug of SLUGS) expect(s[slug]).toMatchObject({ status: 'active', schema_version: OLD });
  });

  it('thiếu pg_dump (không --skip-backup): dừng trước khi chạm registry', async () => {
    setPgToolsForTest({ ...localPgTools, available: async () => false });
    try {
      await expect(migrateSites({ dir: tmpDir, drainMs: 0 })).rejects.toMatchObject({ code: 'SITE_BACKUP_UNAVAILABLE' });
    } finally {
      setPgToolsForTest(undefined);
    }
    expect(await hasProbe(TPL)).toBe(false);
    for (const r of Object.values(await status())) expect(r.status).toBe('active');
  });

  it('slug lạ: báo lỗi, không chạm gì', async () => {
    await expect(migrateSites({ slugs: ['khong-co'], dir: tmpDir, backup: fakeBackup, drainMs: 0 })).rejects.toBeInstanceOf(SiteMigrateError);
    expect(await hasProbe(TPL)).toBe(false);
  });

  it('--all, lỗi ở site 2: mẫu nâng trước, site 1 và 3 xong, site 2 migration_failed không đổi lược đồ (T039-7)', async () => {
    await q(CTL, "UPDATE sites SET status = 'suspended' WHERE slug = 'pvm-site3'");
    const r = await migrateSites({ dir: tmpDir, backup: fakeBackup, drainMs: 0 });
    expect(r.required).toBe(NEXT);
    expect(r.template.applied).toEqual([NEXT]);
    expect(await hasProbe(TPL)).toBe(true);
    expect(r.failed).toBe(1);
    expect(r.sites.map((x) => [x.slug, x.outcome])).toEqual([['pvm-site1', 'migrated'], ['pvm-site2', 'failed'], ['pvm-site3', 'migrated']]);
    expect(r.sites[1]!.error).toMatch(/lỗi cố ý/);
    expect(backups).toEqual(SLUGS); // sao lưu trước mỗi site, kể cả site lỗi
    const s = await status();
    expect(s['pvm-site1']).toMatchObject({ status: 'active', schema_version: NEXT, resume_status: null });
    expect(s['pvm-site2']).toMatchObject({ status: 'migration_failed', schema_version: OLD, resume_status: 'active' });
    expect(s['pvm-site3']).toMatchObject({ status: 'suspended', schema_version: NEXT }); // khoá trước khi nâng → vẫn khoá
    expect(await hasProbe(sites['pvm-site1']!.dbName)).toBe(true);
    expect(await hasProbe(sites['pvm-site2']!.dbName)).toBe(false); // giao dịch của tệp lỗi đã lùi
  });

  it('cổng lược đồ: ứng dụng mới chặn site nâng lỗi; ứng dụng cũ chặn site đã nâng (T039-8); việc nền bỏ site bị chặn', async () => {
    invalidateSiteCache();
    setRequiredSchemaVersionForTest(NEXT); // ứng dụng bản mới
    expect(await resolveSiteByHost('s1.migrate.test')).toEqual({ siteId: sites['pvm-site1']!.siteId });
    expect(await resolveSiteByHost('s2.migrate.test')).toEqual({ gate: 'SITE_MIGRATION_FAILED' });
    expect([...await gatedSiteIds()]).toEqual([sites['pvm-site2']!.siteId]);

    setSiteModeForTest('multi');
    try {
      const ran: Array<string | undefined> = [];
      await eachSite(async () => { ran.push(currentRequest()?.siteId); }, () => undefined);
      expect(ran).toEqual(expect.arrayContaining([sites['pvm-site1']!.siteId, sites['pvm-site3']!.siteId]));
      expect(ran).not.toContain(sites['pvm-site2']!.siteId);
    } finally {
      setSiteModeForTest('single');
    }

    invalidateSiteCache();
    setRequiredSchemaVersionForTest(OLD); // ứng dụng bản cũ còn chạy
    expect(await resolveSiteByHost('s1.migrate.test')).toEqual({ gate: 'SITE_UPGRADING' });
    expect(await resolveSiteByHost('s2.migrate.test')).toEqual({ gate: 'SITE_MIGRATION_FAILED' });

    // qua HTTP: 503 + Retry-After, route không chạy (không ghi gì)
    const app = Fastify();
    registerRequestContext(app);
    let reached = 0;
    app.get('/x', async () => { reached++; return { ok: true }; });
    setSiteModeForTest('multi');
    try {
      for (const [host, code] of [['s1.migrate.test', 'SITE_UPGRADING'], ['s2.migrate.test', 'SITE_MIGRATION_FAILED']] as const) {
        const res = await app.inject({ method: 'GET', url: '/x', headers: { host } });
        expect(res.statusCode).toBe(503);
        expect(res.headers['retry-after']).toBe('60');
        expect(res.json()).toMatchObject({ ok: false, error: { code } });
      }
      expect(reached).toBe(0);
    } finally {
      setSiteModeForTest('single');
      await app.close();
    }
    setRequiredSchemaVersionForTest(undefined);
  });

  it('sửa tệp lỗi, chạy lại: site 2 xong, site đã nâng "đã mới"', async () => {
    writeNext(false);
    backups.length = 0;
    const r = await migrateSites({ dir: tmpDir, backup: fakeBackup, drainMs: 0 });
    expect(r.failed).toBe(0);
    expect(r.sites.map((x) => [x.slug, x.outcome])).toEqual([['pvm-site1', 'up-to-date'], ['pvm-site2', 'migrated'], ['pvm-site3', 'up-to-date']]);
    expect(backups).toEqual(['pvm-site2']);
    const s = await status();
    expect(s['pvm-site2']).toMatchObject({ status: 'active', schema_version: NEXT, resume_status: null });
    expect((await q<{ migration_error: string | null }>(CTL, "SELECT migration_error FROM sites WHERE slug = 'pvm-site2'"))[0]!.migration_error).toBeNull();
  });
});
