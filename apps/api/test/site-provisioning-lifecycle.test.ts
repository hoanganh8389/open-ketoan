// [2026-11-22 01:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B5b (D039-14, D039-15, Q039-1): ca kiểm Provisioning API — lệnh vòng đời + trường sức khoẻ của Site, gọi như WordPress / Site Manager gọi
/**
 * Provisioning API B5b qua ứng dụng thật (buildApp). Một site tạo bằng POST /sites, rồi:
 *   - Site có sức khoẻ: database thử kết nối được, cỡ database, lược đồ đúng bản, dấu backup_missing; ?attention=1 lọc đúng;
 *   - tên miền: thêm / bỏ phụ; sai khuôn 400, bỏ tên miền chính 409; thiếu Idempotency-Key 400;
 *   - sao lưu → việc xong → danh sách có bản (không lộ đường dẫn tệp), hết backup_missing;
 *   - site đang có việc chưa xong → 409 SITE_BUSY; việc kẹt quá 2 giờ → failed JOB_INTERRUPTED, lệnh sau nhận được;
 *   - khoá → suspended (dấu suspended), mở lại; khôi phục từ bản sao lưu → dữ liệu về lúc sao lưu;
 *   - xoá mềm khi chưa khoá → 409 SITE_NOT_SUSPENDED ngay; khoá rồi xoá → deleted, dấu deleted, cỡ database null;
 *   - health: bản ứng dụng, lược đồ cần, số site theo dấu cần chú ý; site lạ → 404.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../src/app.js';
import { closeDb } from '../src/db/client.js';
import { env } from '../src/config/env.js';
import { setSiteModeForTest } from '@bizcity/platform/db/site';
import { closeSiteRegistry, configureSiteRegistryForTest } from '@bizcity/platform/db/site-registry';
import { configureProvisionerForTest, newSiteId, siteDbNames } from '@bizcity/platform/db/site-provisioner';
import { runTool, setPgToolsForTest, type PgTools } from '@bizcity/platform/db/site-backup';
import { createProvisionKey, setRestoreDrainForTest } from '../src/modules/sites/provisioning.service.js';

const API_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testDb = new URL(env.DATABASE_URL).pathname.slice(1);
const CTL = `${testDb}_pctl2`;
const TPL = `${testDb}_ptpl2`;
const KEY = 'khoa-bi-mat-cua-test-phai-du-32-ky-tu!';
const ADMIN_HOST = 'admin.lifecycle-api.test';
const SLUG = 'pvp-congtya';
const { dbName: DB, appRole: ROLE } = siteDbNames(SLUG);
const CONTAINER = process.env.KETOAN_DB_CONTAINER ?? 'ketoan-db-1';
const urlOf = (name: string) => { const u = new URL(env.DATABASE_URL); u.pathname = `/${name}`; return u.toString(); };
const mutableEnv = env as { SITE_ADMIN_HOST?: string; SITE_BACKUP_DIR?: string };

/** pg_dump / pg_restore trong container database, tệp chuyển bằng docker cp (như site-backup.test.ts). */
let seq = 0;
const inBox = () => `/tmp/okt-b5b-${process.pid}-${++seq}.dump`;
async function must(args: string[], what: string): Promise<string> {
  const r = await runTool('docker', args);
  if (r.code !== 0) throw new Error(`${what}: ${r.err}`);
  return r.out;
}
const dockerTools: PgTools = {
  async available() { return (await runTool('docker', ['exec', CONTAINER, 'pg_dump', '--version'])).code === 0; },
  async dump(url, file) {
    const u = new URL(url); const t = inBox();
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
    const u = new URL(url); const t = inBox();
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
  const dbs = await q<{ datname: string }>('postgres', "SELECT datname FROM pg_database WHERE datname = $1 OR datname ~ ('^' || $1 || '_(cu|kp|xoa)_[0-9]{8}t[0-9]{6}$')", [DB]);
  for (const d of dbs) await q('postgres', `DROP DATABASE IF EXISTS ${d.datname} WITH (FORCE)`);
  await q('postgres', `DROP ROLE IF EXISTS ${ROLE}`);
  await q('postgres', `DROP DATABASE IF EXISTS ${TPL} WITH (FORCE)`);
  await q('postgres', `DROP DATABASE IF EXISTS ${CTL} WITH (FORCE)`);
}

let app: FastifyInstance;
let provKey = '';
let dir = '';
let siteId = '';
let idemN = 0;
const prev = { host: mutableEnv.SITE_ADMIN_HOST, dir: mutableEnv.SITE_BACKUP_DIR };

beforeAll(async () => {
  await dropAll();
  await q('postgres', `CREATE DATABASE ${CTL}`);
  await q('postgres', `CREATE DATABASE ${TPL}`);
  execSync('npx tsx --conditions=development src/db/migrate.ts', { cwd: API_DIR, env: { ...process.env, DATABASE_URL: urlOf(TPL) }, stdio: 'pipe' });
  await configureSiteRegistryForTest(urlOf(CTL), KEY);
  configureProvisionerForTest({ templateDb: TPL, adminUrl: env.DATABASE_URL, parentRole: 'ketoan_app' });
  provKey = (await createProvisionKey('test WordPress')).key;
  dir = mkdtempSync(path.join(os.tmpdir(), 'okt-b5b-'));
  setPgToolsForTest(dockerTools);
  setRestoreDrainForTest(0);
  app = await buildApp();
  mutableEnv.SITE_ADMIN_HOST = ADMIN_HOST;
  mutableEnv.SITE_BACKUP_DIR = dir;
}, 240_000);

afterAll(async () => {
  setSiteModeForTest('single');
  setPgToolsForTest(undefined);
  setRestoreDrainForTest(undefined);
  mutableEnv.SITE_ADMIN_HOST = prev.host;
  mutableEnv.SITE_BACKUP_DIR = prev.dir;
  await app?.close();
  await closeDb();
  await closeSiteRegistry();
  await configureSiteRegistryForTest(undefined);
  await dropAll();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

type Opts = { method?: 'GET' | 'POST' | 'DELETE'; idem?: string | false; body?: unknown };
async function call(url: string, o: Opts = {}) {
  setSiteModeForTest('multi');
  try {
    const method = o.method ?? 'GET';
    const headers: Record<string, string> = { host: ADMIN_HOST, authorization: `Bearer ${provKey}` };
    if (method !== 'GET' && o.idem !== false) headers['idempotency-key'] = o.idem ?? `b5b-test-${++idemN}-${Date.now()}`;
    const res = await app.inject({ method, url, headers, ...(o.body ? { payload: o.body as object } : {}) });
    return { status: res.statusCode, body: res.json() as Record<string, any> };
  } finally {
    setSiteModeForTest('single');
  }
}
async function waitJob(jobId: string): Promise<Record<string, any>> {
  for (let i = 0; i < 300; i++) {
    const r = await call(`/_sites/v1/jobs/${jobId}`);
    if (r.body.status === 'done' || r.body.status === 'failed') return r.body;
    await new Promise((res) => setTimeout(res, 200));
  }
  throw new Error('việc không xong sau 60 giây');
}
async function job(url: string, o: Opts = {}): Promise<Record<string, any>> {
  const r = await call(url, { method: 'POST', ...o });
  expect(r.status, JSON.stringify(r.body)).toBe(202);
  return waitJob(r.body.jobId);
}

describe('PHASE-039 B5b — Provisioning API: vòng đời + sức khoẻ site', () => {
  it('tạo site; Site có sức khoẻ (kết nối thật, cỡ database, lược đồ đúng bản, backup_missing); ?attention=1', async () => {
    const r = await call('/_sites/v1/sites', { method: 'POST', body: { slug: SLUG, domain: 'a.api-life.test', displayName: 'Công ty A', owner: { email: 'chu@a.test' } } });
    expect(r.status).toBe(202);
    siteId = r.body.siteId;
    expect((await waitJob(r.body.jobId)).status).toBe('done');

    const s = (await call(`/_sites/v1/sites/${siteId}`)).body;
    expect(s).toMatchObject({ status: 'active', schemaCurrent: true, database: { reachable: true }, lastBackupAt: null, attention: ['backup_missing'] });
    expect(s.dbSizeBytes).toBeGreaterThan(1_000_000);
    expect((await call('/_sites/v1/sites?attention=1')).body.items.map((x: { siteId: string }) => x.siteId)).toEqual([siteId]);
    expect((await call(`/_sites/v1/sites/${newSiteId()}`)).status).toBe(404);
  });

  it('tên miền: thêm / bỏ phụ; sai khuôn 400; bỏ tên miền chính 409; thiếu Idempotency-Key 400', async () => {
    expect((await call(`/_sites/v1/sites/${siteId}/domains`, { method: 'POST', idem: false, body: { domain: 'phu.api-life.test' } })).status).toBe(400);
    const add = await call(`/_sites/v1/sites/${siteId}/domains`, { method: 'POST', body: { domain: 'Phu.API-Life.test' } });
    expect(add.status).toBe(200);
    expect(add.body.domains).toEqual([{ domain: 'a.api-life.test', primary: true }, { domain: 'phu.api-life.test', primary: false }]);
    const badD = await call(`/_sites/v1/sites/${siteId}/domains`, { method: 'POST', body: { domain: 'khong co dau cham' } });
    expect([badD.status, badD.body.error?.code]).toEqual([400, 'SITE_DOMAIN_INVALID']);
    const prim = await call(`/_sites/v1/sites/${siteId}/domains/a.api-life.test`, { method: 'DELETE' });
    expect([prim.status, prim.body.error?.code]).toEqual([409, 'SITE_DOMAIN_PRIMARY']);
    const del = await call(`/_sites/v1/sites/${siteId}/domains/phu.api-life.test`, { method: 'DELETE' });
    expect(del.status).toBe(200);
    expect(del.body.domains).toEqual([{ domain: 'a.api-life.test', primary: true }]);
  });

  it('sao lưu → việc xong → danh sách có bản (không lộ đường dẫn tệp), hết backup_missing', async () => {
    expect((await job(`/_sites/v1/sites/${siteId}/backups`)).status).toBe('done');
    const b = (await call(`/_sites/v1/sites/${siteId}/backups`)).body.items;
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ reason: 'manual', schemaVersion: expect.stringMatching(/^\d{4}_/) });
    expect(b[0].file).toBeUndefined();
    const s = (await call(`/_sites/v1/sites/${siteId}`)).body;
    expect(s.attention).toEqual([]);
    expect(s.backupAgeHours).toBeLessThan(1);
  });

  it('site đang có việc → 409 SITE_BUSY; việc kẹt quá 2 giờ → failed JOB_INTERRUPTED, lệnh sau nhận được', async () => {
    const stuck = newSiteId();
    await q(CTL, `INSERT INTO site_jobs (id, key_id, idempotency_key, request_hash, kind, site_id, status, steps)
                  SELECT $1, id, 'ket-gia-lap-0001', 'x', 'backup', $2, 'running', '[]' FROM provision_keys LIMIT 1`, [stuck, siteId]);
    const busy = await call(`/_sites/v1/sites/${siteId}/suspend`, { method: 'POST' });
    expect([busy.status, busy.body.error?.code]).toEqual([409, 'SITE_BUSY']);
    await q(CTL, "UPDATE site_jobs SET updated_at = now() - interval '3 hours' WHERE id = $1", [stuck]);
    const j = await job(`/_sites/v1/sites/${siteId}/suspend`, { body: { reason: 'quá hạn' } });
    expect(j.status).toBe('done');
    expect((await call(`/_sites/v1/jobs/${stuck}`)).body).toMatchObject({ status: 'failed', error: { code: 'JOB_INTERRUPTED' } });
  });

  it('khoá → suspended + dấu suspended; mở lại; khôi phục → dữ liệu về lúc sao lưu', async () => {
    let s = (await call(`/_sites/v1/sites/${siteId}`)).body;
    expect(s).toMatchObject({ status: 'suspended', suspendReason: 'quá hạn', attention: ['suspended'] });
    expect((await job(`/_sites/v1/sites/${siteId}/resume`)).status).toBe('done');
    expect((await call(`/_sites/v1/sites/${siteId}`)).body.status).toBe('active');

    await q(DB, "UPDATE tenants SET name = 'SUA SAU SAO LUU'");
    const backupId = (await call(`/_sites/v1/sites/${siteId}/backups`)).body.items[0].backupId;
    const bad = await call(`/_sites/v1/sites/${siteId}/restore`, { method: 'POST', body: {} });
    expect(bad.status).toBe(400);
    expect((await job(`/_sites/v1/sites/${siteId}/restore`, { body: { backupId } })).status).toBe('done');
    expect((await q<{ name: string }>(DB, 'SELECT name FROM tenants'))[0]!.name).toBe('Công ty A');
    s = (await call(`/_sites/v1/sites/${siteId}`)).body;
    expect(s.status).toBe('active');
    expect(s.restoredAt).not.toBeNull();
  });

  it('xoá mềm khi chưa khoá → việc failed SITE_STATE_INVALID; khoá rồi xoá → deleted; health đếm dấu', async () => {
    const f = await call(`/_sites/v1/sites/${siteId}`, { method: 'DELETE' });
    expect([f.status, f.body.error?.code]).toEqual([409, 'SITE_NOT_SUSPENDED']); // báo ngay, không tạo việc
    await job(`/_sites/v1/sites/${siteId}/suspend`);
    expect((await job(`/_sites/v1/sites/${siteId}`, { method: 'DELETE' })).status).toBe('done');
    const s = (await call(`/_sites/v1/sites/${siteId}`)).body;
    expect(s).toMatchObject({ status: 'deleted', attention: ['deleted'], dbSizeBytes: null });
    expect(s.purgeAfter).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(s.database).toBeUndefined();

    const h = (await call('/_sites/v1/health')).body;
    expect(h).toMatchObject({ contract: 'bizcity_site_provisioning@1', sites: { deleted: 1 }, attention: { deleted: 1 } });
    expect(h.requiredSchema).toMatch(/^\d{4}_/);
    expect(typeof h.appVersion).toBe('string');
    expect((await call(`/_sites/v1/sites/${newSiteId()}/suspend`, { method: 'POST' })).status).toBe(404);
  });
});
