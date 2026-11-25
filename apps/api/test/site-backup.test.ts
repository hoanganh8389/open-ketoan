// [2026-11-22 12:06 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B6a (D039-13, R-SITE-10): ca kiểm Backup Manager theo site — sao lưu đã kiểm, khôi phục một site không chạm site khác (T039-11)
/**
 * Sao lưu / khôi phục theo site — PHASE-039 B6a. Hai site thật (A, B) từ cùng database mẫu. pg_dump / pg_restore chạy trong
 * container của database (máy dev không có công cụ; ảnh api có bản 16 — B3b):
 *   - sao lưu A: tệp `.dump`, `site_backups` đã kiểm, số bảng; --keep 1 xoá bản cũ;
 *   - sau sao lưu A đổi dữ liệu + thêm bảng; khôi phục A: A về đúng trạng thái lúc sao lưu, B không đổi (T039-11);
 *     database cũ của A giữ lại, vai trò ứng dụng của A không vào được nó; pool của API đang giữ kết nối tới A không làm sập tiến trình;
 *   - thiếu công cụ / mã bản sao lưu lạ / bản của site khác → từ chối, không chạm gì;
 *   - `site migrate` sao lưu qua Backup Manager (dòng `site_backups` lý do `migrate`).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { closeDb } from '../src/db/client.js';
import { env } from '../src/config/env.js';
import { poolOf, setSiteModeForTest } from '@bizcity/platform/db/site';
import { closeSiteRegistry, configureSiteRegistryForTest, invalidateSiteCache, resolveSiteByHost } from '@bizcity/platform/db/site-registry';
import { configureProvisionerForTest, siteDbNames } from '@bizcity/platform/db/site-provisioner';
import { backupSite, importBackup, listBackups, localPgTools, restoreSite, runTool, setPgToolsForTest, type PgTools } from '@bizcity/platform/db/site-backup';
import { migrateSites } from '@bizcity/platform/db/site-migrate';
import { createSiteWithOwner } from '../src/db/site-create.js';

const API_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testDb = new URL(env.DATABASE_URL).pathname.slice(1);
const CTL = `${testDb}_bctl`;
const TPL = `${testDb}_btpl`;
const KEY = 'khoa-bi-mat-cua-test-phai-du-32-ky-tu!';
const SLUGS = ['pvk-congtya', 'pvk-congtyb']; // tiền tố riêng: pvb- đã thuộc site-create.test.ts
const CONTAINER = process.env.KETOAN_DB_CONTAINER ?? 'ketoan-db-1';
const urlOf = (name: string) => { const u = new URL(env.DATABASE_URL); u.pathname = `/${name}`; return u.toString(); };

/**
 * pg_dump / pg_restore trong container của database: cùng tài khoản, máy chủ = 127.0.0.1:5432 bên trong container. Tệp chuyển
 * bằng `docker cp` (không đẩy luồng qua `docker exec -i`: trên Windows lúc được lúc nhận 0 byte).
 */
let seq = 0;
const inBox = () => `/tmp/okt-b6-${process.pid}-${++seq}.dump`;
async function must(args: string[], what: string): Promise<string> {
  const r = await runTool('docker', args);
  if (r.code !== 0) throw new Error(`${what}: ${r.err}`);
  return r.out;
}
const dockerTools: PgTools = {
  async available() { return (await runTool('docker', ['exec', CONTAINER, 'pg_dump', '--version'])).code === 0; },
  async dump(url, file) {
    const u = new URL(url);
    const t = inBox();
    await must(['exec', '-e', `PGPASSWORD=${decodeURIComponent(u.password)}`, CONTAINER, 'pg_dump', '--format=custom', `--file=${t}`, '-h', '127.0.0.1', '-U', decodeURIComponent(u.username), u.pathname.slice(1)], 'pg_dump');
    await must(['cp', `${CONTAINER}:${t}`, file], 'docker cp ra');
    await runTool('docker', ['exec', CONTAINER, 'rm', '-f', t]);
  },
  async list(file) {
    const t = inBox();
    await must(['cp', file, `${CONTAINER}:${t}`], 'docker cp vào');
    try { return await must(['exec', CONTAINER, 'pg_restore', '--list', t], 'pg_restore --list'); } finally { await runTool('docker', ['exec', CONTAINER, 'rm', '-f', t]); }
  },
  async restore(url, file) {
    const u = new URL(url);
    const t = inBox();
    await must(['cp', file, `${CONTAINER}:${t}`], 'docker cp vào');
    try {
      await must(['exec', '-e', `PGPASSWORD=${decodeURIComponent(u.password)}`, CONTAINER, 'pg_restore', '--exit-on-error', '-h', '127.0.0.1', '-U', decodeURIComponent(u.username), '-d', u.pathname.slice(1), t], 'pg_restore');
    } finally { await runTool('docker', ['exec', CONTAINER, 'rm', '-f', t]); }
  },
};

async function q<T extends pg.QueryResultRow>(database: string, text: string, values: unknown[] = []): Promise<T[]> {
  const c = new pg.Client({ connectionString: urlOf(database) });
  await c.connect();
  try { return (await c.query<T>(text, values)).rows; } finally { await c.end(); }
}
async function dropAll(): Promise<void> {
  // chỉ database của các site trong tệp này và bản tạm / bản cũ của chúng (kt_<slug>, kt_<slug>_kp_…, kt_<slug>_cu_…)
  const names = SLUGS.map((s) => siteDbNames(s).dbName);
  const dbs = await q<{ datname: string }>('postgres',
    "SELECT datname FROM pg_database WHERE datname = ANY($1::text[]) OR datname ~ ('^(' || array_to_string($1::text[], '|') || ')_(kp|cu)_[0-9]{8}t[0-9]{6}$')", [names]);
  for (const d of dbs) await q('postgres', `DROP DATABASE IF EXISTS ${d.datname} WITH (FORCE)`);
  for (const slug of SLUGS) await q('postgres', `DROP ROLE IF EXISTS ${siteDbNames(slug).appRole}`);
  await q('postgres', `DROP DATABASE IF EXISTS ${TPL} WITH (FORCE)`);
  await q('postgres', `DROP DATABASE IF EXISTS ${CTL} WITH (FORCE)`);
}
/** Dấu vân tay dữ liệu của một site: tên đơn vị, số tài khoản, có bảng thêm sau sao lưu không, oid database. */
const fingerprint = async (dbName: string) => (await q<{ name: string; accounts: string; extra: string | null; oid: string }>(dbName,
  `SELECT (SELECT string_agg(name, ',' ORDER BY id) FROM tenants) AS name, (SELECT count(*) FROM accounts) AS accounts,
          to_regclass('public.b6_sau_sao_luu')::text AS extra, (SELECT oid::text FROM pg_database WHERE datname = current_database()) AS oid`))[0]!;

let dir: string;
let A: Awaited<ReturnType<typeof createSiteWithOwner>>;
let B: Awaited<ReturnType<typeof createSiteWithOwner>>;

beforeAll(async () => {
  await dropAll();
  await q('postgres', `CREATE DATABASE ${CTL}`);
  await q('postgres', `CREATE DATABASE ${TPL}`);
  execSync('npx tsx --conditions=development src/db/migrate.ts', { cwd: API_DIR, env: { ...process.env, DATABASE_URL: urlOf(TPL) }, stdio: 'pipe' });
  await configureSiteRegistryForTest(urlOf(CTL), KEY);
  configureProvisionerForTest({ templateDb: TPL, adminUrl: env.DATABASE_URL, parentRole: 'ketoan_app' });
  A = await createSiteWithOwner({ slug: SLUGS[0]!, domain: 'a.backup.test', name: 'Công ty A' });
  B = await createSiteWithOwner({ slug: SLUGS[1]!, domain: 'b.backup.test', name: 'Công ty B' });
  dir = mkdtempSync(path.join(os.tmpdir(), 'okt-b6-'));
  setPgToolsForTest(dockerTools);
}, 240_000);

afterAll(async () => {
  setPgToolsForTest(undefined);
  setSiteModeForTest('single');
  await closeDb();
  await closeSiteRegistry();
  await configureSiteRegistryForTest(undefined);
  await dropAll();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('PHASE-039 B6a — sao lưu / khôi phục theo site', () => {
  let first: Awaited<ReturnType<typeof backupSite>>;
  let second: Awaited<ReturnType<typeof backupSite>>;

  it('sao lưu: tệp .dump đã kiểm (có sổ cái, đếm bảng), ghi site_backups; --keep 1 xoá bản cũ', async () => {
    first = await backupSite(A.slug, { dir });
    expect(existsSync(first.file)).toBe(true);
    expect(first.file).toContain(path.join(dir, A.slug));
    expect(first.tables).toBeGreaterThan(100);
    expect(first.bytes).toBeGreaterThan(100_000);
    second = await backupSite(A.siteId, { dir, keep: 1 });
    expect(second.pruned).toEqual([first.file]);
    expect(existsSync(first.file)).toBe(false);
    const rows = await listBackups(A.slug);
    expect(rows.map((r) => r.id)).toEqual([second.id]);
    expect(rows[0]).toMatchObject({ reason: 'manual', tables: second.tables, schemaVersion: expect.stringMatching(/^\d{4}_/) });
    expect(await listBackups(B.slug)).toEqual([]);
  });

  it('từ chối: thiếu công cụ, mã bản sao lưu lạ, bản của site khác — không chạm gì', async () => {
    setPgToolsForTest({ ...dockerTools, available: async () => false });
    try {
      await expect(backupSite(A.slug, { dir })).rejects.toMatchObject({ code: 'SITE_BACKUP_UNAVAILABLE' });
    } finally {
      setPgToolsForTest(dockerTools);
    }
    await expect(restoreSite(A.slug, 'KHONG_CO', { drainMs: 0 })).rejects.toMatchObject({ code: 'SITE_BACKUP_NOT_FOUND' });
    await expect(restoreSite(B.slug, second.id, { drainMs: 0 })).rejects.toMatchObject({ code: 'SITE_BACKUP_NOT_FOUND' });
    await expect(backupSite('khong-co', { dir })).rejects.toMatchObject({ code: 'SITE_UNKNOWN' });
    const st = await q<{ status: string }>(CTL, 'SELECT status FROM sites ORDER BY slug');
    expect(st.map((s) => s.status)).toEqual(['active', 'active']);
  });

  it('khôi phục A: A về đúng lúc sao lưu, B không đổi; database cũ giữ lại; pool đang mở của API không sập (T039-11)', async () => {
    const aBefore = await fingerprint(A.dbName);
    const bBefore = await fingerprint(B.dbName);
    // sau sao lưu: A đổi dữ liệu + thêm bảng
    await q(A.dbName, "UPDATE tenants SET name = name || ' (sửa sau sao lưu)'");
    await q(A.dbName, 'CREATE TABLE b6_sau_sao_luu (x integer)');
    expect((await fingerprint(A.dbName)).extra).not.toBeNull();

    // API đang giữ kết nối rảnh tới A (pool của site, như lúc phục vụ yêu cầu)
    setSiteModeForTest('multi');
    invalidateSiteCache();
    expect(await resolveSiteByHost('a.backup.test')).toEqual({ siteId: A.siteId });
    const apiPool = poolOf(A.siteId);
    (await apiPool.connect()).release();
    expect(apiPool.idleCount).toBeGreaterThan(0);

    const r = await restoreSite(A.slug, second.id, { drainMs: 0 });
    expect(r.previousDb).toMatch(new RegExp(`^${A.dbName}_cu_\\d{8}t\\d{6}$`));
    expect(r.schemaChanged).toBe(false);

    const aAfter = await fingerprint(A.dbName);
    expect(aAfter).toMatchObject({ name: aBefore.name, accounts: aBefore.accounts, extra: null });
    expect(aAfter.oid).not.toBe(aBefore.oid); // database mới
    expect(await fingerprint(B.dbName)).toEqual(bBefore); // B không đổi một dòng, cùng database

    // database cũ còn, có dữ liệu sau sao lưu; vai trò ứng dụng của A chỉ CONNECT database mới
    expect((await fingerprint(r.previousDb)).extra).not.toBeNull();
    const priv = await q<{ cur: boolean; old: boolean; pub: boolean }>('postgres',
      "SELECT has_database_privilege($1, $2, 'CONNECT') AS cur, has_database_privilege($1, $3, 'CONNECT') AS old, has_database_privilege('ketoan_app', $2, 'CONNECT') AS pub",
      [siteDbNames(A.slug).appRole, A.dbName, r.previousDb]);
    expect(priv[0]).toEqual({ cur: true, old: false, pub: false });

    // registry: trạng thái cũ, bản đã dùng, database cũ
    const s = (await q<{ status: string; restored_from: string; previous_db: string; resume_status: string | null }>(CTL,
      'SELECT status, restored_from, previous_db, resume_status FROM sites WHERE id = $1', [A.siteId]))[0]!;
    expect(s).toEqual({ status: 'active', restored_from: second.id, previous_db: r.previousDb, resume_status: null });

    // pool của API: kết nối cũ bị ngắt không làm sập tiến trình; lần mượn sau vào database mới
    invalidateSiteCache();
    expect(await resolveSiteByHost('a.backup.test')).toEqual({ siteId: A.siteId });
    const c = await apiPool.connect();
    try {
      const row = (await c.query<{ oid: string }>('SELECT (SELECT oid::text FROM pg_database WHERE datname = current_database()) AS oid')).rows[0]!;
      expect(row.oid).toBe(aAfter.oid);
    } finally {
      c.release();
      setSiteModeForTest('single');
    }
  });

  it('backup-import: tệp .dump làm ngoài lệnh được kiểm rồi ghi (lý do import); tệp rác bị từ chối', async () => {
    const r = await importBackup(A.slug, second.file);
    expect(r).toMatchObject({ reason: 'import', tables: second.tables, schemaVersion: null });
    expect((await listBackups(A.slug)).map((b) => b.id)).toContain(r.id);
    const junk = path.join(dir, 'rac.dump');
    writeFileSync(junk, 'khong phai ban sao luu');
    await expect(importBackup(A.slug, junk)).rejects.toMatchObject({ code: 'SITE_BACKUP_FAILED' });
  });

  it('site migrate sao lưu qua Backup Manager: dòng site_backups lý do migrate', async () => {
    await q(CTL, "UPDATE sites SET schema_version = '0001_cu' WHERE id = $1", [B.siteId]);
    const r = await migrateSites({ slugs: [B.slug], backupDir: dir, drainMs: 0 });
    expect(r.failed).toBe(0);
    expect(r.sites[0]).toMatchObject({ slug: B.slug, outcome: 'migrated' });
    const rows = await listBackups(B.slug);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reason: 'migrate', file: r.sites[0]!.backup });
  });

  it('lệnh không có trên máy: runTool trả mã -1, không ném (localPgTools.available() dựa vào đây)', async () => {
    const r = await runTool('okt-khong-co-lenh-nay-b6a', ['--version']);
    expect(r.code).toBe(-1);
    expect(typeof localPgTools.available).toBe('function');
  });
});
