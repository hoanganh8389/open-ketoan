// [2026-11-22 08:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B8 (S039-21, S039-22): ca kiểm Provisioning API cho trang dùng thử của bizcity-web
/**
 * Provisioning API — PHASE-039 B8. Ứng dụng thật (buildApp), database mẫu bằng migration thật, gọi như Site Manager:
 *   - tạo site `sample: true` + `externalRef` → bước báo dần (không phải cả danh sách cùng lúc), có bước `load_sample`;
 *     site lưu `externalRef`; trong database site có Công ty mẫu (`is_sample`) đăng nhập bằng cùng email + mật khẩu ban đầu;
 *   - tạo site không `sample` → 4 bước như cũ, không có Công ty mẫu;
 *   - `POST /sites/{id}/owner/reset-password` → việc `reset_owner_password` → lần đọc đầu kèm mật khẩu mới (đăng nhập được ở mọi
 *     đơn vị của site, mật khẩu cũ hết dùng, `session_version` tăng), lần sau không; cùng Idempotency-Key → cùng việc;
 *   - site đang khoá → 409 SITE_STATE_INVALID; site không có → 404.
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
const CTL = `${testDb}_tctl`;
const TPL = `${testDb}_ttpl`;
const KEY = 'khoa-bi-mat-cua-test-phai-du-32-ky-tu!';
const ADMIN_HOST = 'admin.trial.test';
const SLUGS = ['pvt-mau', 'pvt-tron'];
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
  provKey = (await createProvisionKey('test trang dùng thử')).key;
  app = await buildApp();
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

type Opts = { method?: 'GET' | 'POST'; idem?: string; body?: unknown };
async function call(url: string, o: Opts = {}) {
  setSiteModeForTest('multi');
  try {
    const headers: Record<string, string> = { host: ADMIN_HOST, authorization: `Bearer ${provKey}` };
    if (o.idem) headers['idempotency-key'] = o.idem;
    const res = await app.inject({ method: o.method ?? 'GET', url, headers, ...(o.body ? { payload: o.body as object } : {}) });
    return { status: res.statusCode, body: res.json() as Record<string, any> };
  } finally {
    setSiteModeForTest('single');
  }
}

/** Hỏi việc tới khi xong; ghi lại mọi trạng thái bước thấy được và `owner` nếu lần đọc nào có. */
async function waitJob(jobId: string): Promise<{ last: Record<string, any>; seen: string[]; owner?: { email: string; initialPassword: string } }> {
  const seen: string[] = [];
  let owner: { email: string; initialPassword: string } | undefined;
  for (let i = 0; i < 600; i++) {
    const r = await call(`/_sites/v1/jobs/${jobId}`);
    const vec = (r.body.steps as Array<{ key: string; status: string }>).map((s) => `${s.key}:${s.status}`).join(',');
    if (seen[seen.length - 1] !== vec) seen.push(vec);
    if (r.body.owner) owner = r.body.owner;
    if (r.body.status === 'done' || r.body.status === 'failed') return { last: r.body, seen, ...(owner ? { owner } : {}) };
    await new Promise((res) => setTimeout(res, 50));
  }
  throw new Error('việc không xong sau 30 giây');
}

const mau = { slug: 'pvt-mau', domain: 'mau.kt.trial.test', displayName: 'Công ty An Phát', owner: { email: 'chu@anphat.test', name: 'Chủ An Phát' }, sample: true, externalRef: '7' };
const tron = { slug: 'pvt-tron', domain: 'tron.kt.trial.test', displayName: 'Công ty Trơn', owner: { email: 'chu@tron.test' } };

describe('PHASE-039 B8 — Provisioning API cho trang dùng thử', () => {
  let siteId = '';
  let firstPassword = '';

  it('sample + externalRef → bước báo dần có load_sample; site lưu externalRef; Công ty mẫu cùng email + mật khẩu', async () => {
    const r = await call('/_sites/v1/sites', { method: 'POST', idem: 'idem-trial-mau-0001', body: mau });
    expect(r.status).toBe(202);
    siteId = r.body.siteId as string;
    const { last, seen, owner } = await waitJob(r.body.jobId as string);
    expect(last).toMatchObject({ status: 'done', error: null });
    expect((last.steps as Array<{ key: string }>).map((s) => s.key)).toEqual(['validate', 'create_database', 'seed_owner', 'load_sample', 'activate']);
    expect(last.steps).toEqual(expect.arrayContaining([{ key: 'load_sample', status: 'done' }]));
    // Báo dần: thấy ít nhất một trạng thái trung gian có bước đã xong và bước còn chờ cùng lúc.
    expect(seen.some((v) => v.includes(':done') && v.includes(':pending'))).toBe(true);
    expect(owner).toMatchObject({ email: 'chu@anphat.test' });
    firstPassword = owner!.initialPassword;

    expect((await call(`/_sites/v1/sites/${siteId}`)).body).toMatchObject({ externalRef: '7', status: 'active' });

    const rows = await q<{ code: string; is_sample: boolean; password_hash: string }>(
      'kt_pvt_mau', 'SELECT t.code, t.is_sample, u.password_hash FROM users u JOIN tenants t ON t.id = u.tenant_id WHERE lower(u.email) = $1 ORDER BY t.is_sample', ['chu@anphat.test'],
    );
    expect(rows.map((x) => x.is_sample)).toEqual([false, true]);
    for (const x of rows) expect(await verifyPassword(firstPassword, x.password_hash)).toBe(true);
  }, 120_000);

  it('không sample → 4 bước như cũ, không có Công ty mẫu', async () => {
    const r = await call('/_sites/v1/sites', { method: 'POST', idem: 'idem-trial-tron-0001', body: tron });
    const { last } = await waitJob(r.body.jobId as string);
    expect(last.status).toBe('done');
    expect((last.steps as Array<{ key: string }>).map((s) => s.key)).toEqual(['validate', 'create_database', 'seed_owner', 'activate']);
    expect(await q('kt_pvt_tron', 'SELECT 1 FROM tenants WHERE is_sample')).toHaveLength(0);
  }, 120_000);

  it('owner/reset-password → mật khẩu mới một lần, ở mọi đơn vị; mật khẩu cũ hết dùng; phiên cũ bị thu', async () => {
    const before = await q<{ v: number }>('kt_pvt_mau', 'SELECT session_version AS v FROM users WHERE lower(email) = $1 ORDER BY tenant_id', ['chu@anphat.test']);
    const r = await call(`/_sites/v1/sites/${siteId}/owner/reset-password`, { method: 'POST', idem: 'idem-trial-reset-0001' });
    expect(r.status).toBe(202);
    const { last, owner } = await waitJob(r.body.jobId as string);
    expect(last).toMatchObject({ status: 'done', kind: 'reset_owner_password', steps: [{ key: 'reset_password', status: 'done' }] });
    expect(owner).toMatchObject({ email: 'chu@anphat.test' });
    expect(owner!.initialPassword).not.toBe(firstPassword);
    expect((await call(`/_sites/v1/jobs/${r.body.jobId}`)).body.owner).toBeUndefined();

    const after = await q<{ v: number; password_hash: string }>('kt_pvt_mau', 'SELECT session_version AS v, password_hash FROM users WHERE lower(email) = $1 ORDER BY tenant_id', ['chu@anphat.test']);
    expect(after).toHaveLength(2);
    after.forEach((x, i) => expect(Number(x.v)).toBe(Number(before[i]!.v) + 1));
    for (const x of after) {
      expect(await verifyPassword(owner!.initialPassword, x.password_hash)).toBe(true);
      expect(await verifyPassword(firstPassword, x.password_hash)).toBe(false);
    }

    const again = await call(`/_sites/v1/sites/${siteId}/owner/reset-password`, { method: 'POST', idem: 'idem-trial-reset-0001' });
    expect(again.body.jobId).toBe(r.body.jobId);
  }, 120_000);

  it('site đang khoá → 409 SITE_STATE_INVALID; site không có → 404; thiếu Idempotency-Key → 400', async () => {
    const s = await call(`/_sites/v1/sites/${siteId}/suspend`, { method: 'POST', idem: 'idem-trial-suspend-01', body: { reason: 'thử' } });
    expect((await waitJob(s.body.jobId as string)).last.status).toBe('done');
    expect(await call(`/_sites/v1/sites/${siteId}/owner/reset-password`, { method: 'POST', idem: 'idem-trial-reset-0002' }))
      .toMatchObject({ status: 409, body: { error: { code: 'SITE_STATE_INVALID' } } });
    expect((await call('/_sites/v1/sites/01ARZ3NDEKTSV4RRFFQ69G5FAV/owner/reset-password', { method: 'POST', idem: 'idem-trial-reset-0003' })).status).toBe(404);
    expect(await call(`/_sites/v1/sites/${siteId}/owner/reset-password`, { method: 'POST' }))
      .toMatchObject({ status: 400, body: { error: { code: 'IDEMPOTENCY_KEY_REQUIRED' } } });
  }, 120_000);
});
