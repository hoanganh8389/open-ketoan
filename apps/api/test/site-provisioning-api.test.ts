// [2026-11-22 10:48 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B5a (D039-14, R-IDEM-1): ca kiểm Provisioning API /_sites/v1 qua ứng dụng thật (T039-10)
/**
 * Provisioning API — PHASE-039 B5a. Dựng ứng dụng thật (buildApp), database mẫu bằng migration thật, gọi như Site Manager gọi:
 *   - sai tên miền / chế độ single → 404 như đường không tồn tại; thiếu / sai khoá → 401; lệnh ghi thiếu Idempotency-Key → 400;
 *   - tạo site → 202 { jobId, siteId } → hỏi việc tới `done`; lần đọc đầu kèm mật khẩu chủ site (đăng nhập được), lần sau không còn;
 *   - gửi lại cùng Idempotency-Key + cùng thân → cùng việc, không thêm site; thân khác → 422 (T039-10);
 *   - slug trùng → việc `failed` với SITE_SLUG_TAKEN; danh sách / một site / health đúng khuôn hợp đồng.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../src/app.js';
import { closeDb } from '../src/db/client.js';
import { env } from '../src/config/env.js';
import { verifyPassword } from '@bizcity/platform/core/security/password';
import { setSiteModeForTest } from '@bizcity/platform/db/site';
import { closeSiteRegistry, configureSiteRegistryForTest } from '@bizcity/platform/db/site-registry';
import { configureProvisionerForTest, siteDbNames } from '@bizcity/platform/db/site-provisioner';
import { createProvisionKey } from '../src/modules/sites/provisioning.service.js';

const API_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testDb = new URL(env.DATABASE_URL).pathname.slice(1);
const CTL = `${testDb}_actl`;
const TPL = `${testDb}_atpl`;
const KEY = 'khoa-bi-mat-cua-test-phai-du-32-ky-tu!';
const ADMIN_HOST = 'admin.sites.test';
const SLUGS = ['pva-congtyq'];
const urlOf = (name: string) => { const u = new URL(env.DATABASE_URL); u.pathname = `/${name}`; return u.toString(); };
const mutableEnv = env as { SITE_ADMIN_HOST?: string };

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

let app: FastifyInstance;
let provKey = '';
const prevAdminHost = mutableEnv.SITE_ADMIN_HOST;

beforeAll(async () => {
  await dropAll();
  await q('postgres', `CREATE DATABASE ${CTL}`);
  await q('postgres', `CREATE DATABASE ${TPL}`);
  execSync('npx tsx --conditions=development src/db/migrate.ts', { cwd: API_DIR, env: { ...process.env, DATABASE_URL: urlOf(TPL) }, stdio: 'pipe' });
  await configureSiteRegistryForTest(urlOf(CTL), KEY);
  configureProvisionerForTest({ templateDb: TPL, adminUrl: env.DATABASE_URL, parentRole: 'ketoan_app' });
  provKey = (await createProvisionKey('test Site Manager')).key;
  app = await buildApp(); // dựng ở chế độ single (khởi động đọc database ngầm định), rồi bật multi cho từng ca
  mutableEnv.SITE_ADMIN_HOST = ADMIN_HOST;
}, 180_000);

afterAll(async () => {
  setSiteModeForTest('single');
  mutableEnv.SITE_ADMIN_HOST = prevAdminHost;
  await app?.close();
  await closeDb();
  await closeSiteRegistry();
  await configureSiteRegistryForTest(undefined);
  await dropAll();
});

type Opts = { method?: 'GET' | 'POST'; host?: string; key?: string | null; idem?: string; body?: unknown };
async function call(url: string, o: Opts = {}) {
  setSiteModeForTest('multi');
  try {
    const headers: Record<string, string> = { host: o.host ?? ADMIN_HOST };
    if (o.key !== null) headers.authorization = `Bearer ${o.key ?? provKey}`;
    if (o.idem) headers['idempotency-key'] = o.idem;
    const res = await app.inject({ method: o.method ?? 'GET', url, headers, ...(o.body ? { payload: o.body as object } : {}) });
    return { status: res.statusCode, body: res.json() as Record<string, any> };
  } finally {
    setSiteModeForTest('single');
  }
}
async function waitJob(jobId: string): Promise<Record<string, any>> {
  for (let i = 0; i < 150; i++) {
    const r = await call(`/_sites/v1/jobs/${jobId}`);
    if (r.body.status === 'done' || r.body.status === 'failed') return r.body;
    await new Promise((res) => setTimeout(res, 200));
  }
  throw new Error('việc không xong sau 30 giây');
}

const body = { slug: 'pva-congtyq', domain: 'congtyq.btnet.test', displayName: 'Công ty Q', owner: { email: 'chu@q.test', name: 'Chủ Q' }, externalRef: 'wp:42' };

describe('PHASE-039 B5a — Provisioning API /_sites/v1', () => {
  it('sai tên miền hoặc chế độ single → 404 như đường không tồn tại', async () => {
    expect((await call('/_sites/v1/health', { host: 'congtyq.btnet.test' })).status).toBe(404);
    const single = await app.inject({ method: 'GET', url: '/_sites/v1/health', headers: { host: ADMIN_HOST, authorization: `Bearer ${provKey}` } });
    expect(single.statusCode).toBe(404);
  });

  it('thiếu / sai khoá → 401 PROVISION_KEY_INVALID', async () => {
    expect(await call('/_sites/v1/health', { key: null })).toMatchObject({ status: 401, body: { error: { code: 'PROVISION_KEY_INVALID' } } });
    expect(await call('/_sites/v1/health', { key: 'prov_saisaisaisaisaisaisaisaisai' })).toMatchObject({ status: 401 });
  });

  it('lệnh ghi thiếu Idempotency-Key → 400', async () => {
    expect(await call('/_sites/v1/sites', { method: 'POST', body })).toMatchObject({ status: 400, body: { error: { code: 'IDEMPOTENCY_KEY_REQUIRED' } } });
  });

  let jobId = '';
  let siteId = '';
  it('tạo site → 202 { jobId, siteId } → việc xong; lần đọc đầu kèm mật khẩu chủ site, lần sau không', async () => {
    const r = await call('/_sites/v1/sites', { method: 'POST', idem: 'idem-0001-congtyq', body });
    expect(r.status).toBe(202);
    ({ jobId, siteId } = r.body as { jobId: string; siteId: string });
    expect(jobId).toMatch(/^[0-9A-Z]{26}$/);
    const first = await waitJob(jobId);
    expect(first).toMatchObject({ status: 'done', siteId, kind: 'provision', error: null });
    // lần hỏi trả `done` đầu tiên có thể là lần đọc kèm mật khẩu; nếu chưa thì lần kế tiếp
    const owner = first.owner ?? (await call(`/_sites/v1/jobs/${jobId}`)).body.owner;
    expect(owner).toMatchObject({ email: 'chu@q.test' });
    const [u] = await q<{ password_hash: string }>('kt_pva_congtyq', 'SELECT password_hash FROM users WHERE email = $1', ['chu@q.test']);
    expect(await verifyPassword(owner.initialPassword, u!.password_hash)).toBe(true);
    expect((await call(`/_sites/v1/jobs/${jobId}`)).body.owner).toBeUndefined();
  });

  it('gửi lại cùng Idempotency-Key + cùng thân → cùng việc, không thêm site; thân khác → 422 (T039-10)', async () => {
    const again = await call('/_sites/v1/sites', { method: 'POST', idem: 'idem-0001-congtyq', body });
    expect(again.body).toEqual({ jobId, siteId });
    expect((await call('/_sites/v1/sites')).body.items).toHaveLength(1);
    const other = await call('/_sites/v1/sites', { method: 'POST', idem: 'idem-0001-congtyq', body: { ...body, displayName: 'Khác' } });
    expect(other).toMatchObject({ status: 422, body: { error: { code: 'IDEMPOTENCY_KEY_REUSED' } } });
  });

  it('một site và danh sách đúng khuôn hợp đồng', async () => {
    const one = await call(`/_sites/v1/sites/${siteId}`);
    expect(one.body).toMatchObject({ siteId, slug: 'pva-congtyq', displayName: 'Công ty Q', status: 'active', domains: [{ domain: 'congtyq.btnet.test', primary: true }] });
    expect((await call('/_sites/v1/sites?status=deleted')).body.items).toEqual([]);
    expect((await call('/_sites/v1/sites/00000000000000000000000000')).status).toBe(404);
  });

  it('slug trùng (khoá gửi khác) → việc failed với SITE_SLUG_TAKEN', async () => {
    const r = await call('/_sites/v1/sites', { method: 'POST', idem: 'idem-0002-trung', body: { ...body, domain: 'khac.btnet.test' } });
    expect(r.status).toBe(202);
    const done = await waitJob(r.body.jobId);
    expect(done).toMatchObject({ status: 'failed', error: { code: 'SITE_SLUG_TAKEN' } });
  });

  it('health: hợp đồng + số site theo trạng thái', async () => {
    // [2026-11-22 01:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B5b: health thêm appVersion, requiredSchema, attention — so khớp phần của B5a
    expect((await call('/_sites/v1/health')).body).toMatchObject({ contract: 'bizcity_site_provisioning@1', sites: { active: 1 } });
  });
});
