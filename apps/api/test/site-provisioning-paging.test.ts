// [2026-11-22 03:26 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B5c (D039-14): ca kiểm GET /_sites/v1/sites phân trang con trỏ + updatedAfter — phía gọi đồng bộ theo thay đổi
/**
 * Provisioning API B5c qua ứng dụng thật (buildApp), 7 dòng site ghi thẳng vào database điều khiển (không cần database site):
 *   - limit=3 → ba trang 3 / 3 / 1, `next` null ở trang cuối; gộp lại = đủ 7, đúng thứ tự (updated_at, mã site), không trùng —
 *     kể cả hai site cùng updated_at;
 *   - updatedAfter chỉ trả site đổi sau mốc; site vừa đổi xuất hiện lại; mỗi Site có updatedAt;
 *   - con trỏ hỏng / limit ngoài 1–500 / updatedAfter sai khuôn → 400;
 *   - ghi một bản sao lưu (backup-import, công cụ giả) đẩy updated_at của site → đồng bộ theo thay đổi thấy được.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../src/app.js';
import { closeDb } from '../src/db/client.js';
import { env } from '../src/config/env.js';
import { setSiteModeForTest } from '@bizcity/platform/db/site';
import { closeSiteRegistry, configureSiteRegistryForTest, controlPool, ensureControlSchema } from '@bizcity/platform/db/site-registry';
import { newSiteId } from '@bizcity/platform/db/site-provisioner';
import { importBackup, setPgToolsForTest } from '@bizcity/platform/db/site-backup';
import { createProvisionKey } from '../src/modules/sites/provisioning.service.js';

const testDb = new URL(env.DATABASE_URL).pathname.slice(1);
const CTL = `${testDb}_gctl`;
const ADMIN_HOST = 'admin.paging.test';
const urlOf = (name: string) => { const u = new URL(env.DATABASE_URL); u.pathname = `/${name}`; return u.toString(); };
const mutableEnv = env as { SITE_ADMIN_HOST?: string };
const prevHost = mutableEnv.SITE_ADMIN_HOST;
async function q(database: string, text: string): Promise<void> {
  const c = new pg.Client({ connectionString: urlOf(database) });
  await c.connect();
  try { await c.query(text); } finally { await c.end(); }
}

let app: FastifyInstance;
let provKey = '';
let dir = '';
const ids: string[] = [];

beforeAll(async () => {
  await q('postgres', `DROP DATABASE IF EXISTS ${CTL} WITH (FORCE)`);
  await q('postgres', `CREATE DATABASE ${CTL}`);
  await configureSiteRegistryForTest(urlOf(CTL), 'khoa-bi-mat-cua-test-phai-du-32-ky-tu!');
  await ensureControlSchema();
  // 7 site, updated_at tăng dần; site 3 và 4 CÙNG updated_at (thứ tự theo mã site)
  const times = ['2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z', '2026-11-03T00:00:00.123456Z', '2026-11-03T00:00:00.123456Z', '2026-11-04T00:00:00Z', '2026-11-05T00:00:00Z', '2026-11-06T00:00:00Z'];
  for (const [i, t] of times.entries()) {
    const id = newSiteId(Date.parse('2026-11-01T00:00:00Z') + i);
    ids.push(id);
    await controlPool().query(
      `INSERT INTO sites (id, slug, status, db_host, db_name, created_at, updated_at) VALUES ($1, $2, 'active', '127.0.0.1', $3, $4, $4)`,
      [id, `pvg-site${i + 1}`, `kt_pvg_site${i + 1}`, t]);
  }
  provKey = (await createProvisionKey('test WordPress')).key;
  dir = mkdtempSync(path.join(os.tmpdir(), 'okt-b5c-'));
  app = await buildApp();
  mutableEnv.SITE_ADMIN_HOST = ADMIN_HOST;
}, 120_000);

afterAll(async () => {
  setSiteModeForTest('single');
  setPgToolsForTest(undefined);
  mutableEnv.SITE_ADMIN_HOST = prevHost;
  await app?.close();
  await closeDb();
  await closeSiteRegistry();
  await configureSiteRegistryForTest(undefined);
  await q('postgres', `DROP DATABASE IF EXISTS ${CTL} WITH (FORCE)`);
  if (dir) rmSync(dir, { recursive: true, force: true });
});

async function get(url: string) {
  setSiteModeForTest('multi');
  try {
    const res = await app.inject({ method: 'GET', url, headers: { host: ADMIN_HOST, authorization: `Bearer ${provKey}` } });
    return { status: res.statusCode, body: res.json() as { items: Array<{ siteId: string; slug: string; updatedAt: string }>; next: string | null; error?: { code: string } } };
  } finally {
    setSiteModeForTest('single');
  }
}

describe('PHASE-039 B5c — GET /sites phân trang con trỏ + updatedAfter', () => {
  it('limit=3 → 3 / 3 / 1, next null ở trang cuối; đủ 7, đúng thứ tự, không trùng (kể cả hai site cùng updated_at)', async () => {
    const seen: string[] = [];
    const sizes: number[] = [];
    let url = '/_sites/v1/sites?limit=3';
    for (let i = 0; i < 5; i++) {
      const r = await get(url);
      expect(r.status).toBe(200);
      sizes.push(r.body.items.length);
      seen.push(...r.body.items.map((x) => x.siteId));
      if (!r.body.next) break;
      url = `/_sites/v1/sites?limit=3&cursor=${encodeURIComponent(r.body.next)}`;
    }
    expect(sizes).toEqual([3, 3, 1]);
    const order3and4 = [ids[2]!, ids[3]!].sort();
    expect(seen).toEqual([ids[0], ids[1], ...order3and4, ids[4], ids[5], ids[6]]);
  });

  it('updatedAfter: chỉ site đổi sau mốc; site vừa đổi xuất hiện lại; có updatedAt', async () => {
    const r = await get(`/_sites/v1/sites?updatedAfter=${encodeURIComponent('2026-11-04T00:00:00Z')}`);
    expect(r.body.items.map((x) => x.slug)).toEqual(['pvg-site6', 'pvg-site7']);
    expect(r.body.items[0]!.updatedAt).toBe('2026-11-05T00:00:00.000Z');
    expect(r.body.next).toBeNull();
    await controlPool().query("UPDATE sites SET updated_at = now() WHERE slug = 'pvg-site1'");
    const again = await get(`/_sites/v1/sites?updatedAfter=${encodeURIComponent('2026-11-06T00:00:00Z')}`);
    expect(again.body.items.map((x) => x.slug)).toEqual(['pvg-site1']);
  });

  it('con trỏ hỏng, limit ngoài 1–500, updatedAfter sai khuôn → 400', async () => {
    const bad = await get('/_sites/v1/sites?cursor=khong-phai-con-tro');
    expect([bad.status, bad.body.error?.code]).toEqual([400, 'CURSOR_INVALID']);
    expect((await get('/_sites/v1/sites?limit=0')).status).toBe(400);
    expect((await get('/_sites/v1/sites?limit=501')).status).toBe(400);
    expect((await get('/_sites/v1/sites?updatedAfter=hom-qua')).status).toBe(400);
  });

  it('ghi bản sao lưu đẩy updated_at của site → đồng bộ theo thay đổi thấy được', async () => {
    setPgToolsForTest({
      available: async () => true, dump: async () => undefined, restore: async () => undefined,
      list: async () => '1; 1259 16385 TABLE public accounts ketoan\n2; 0 16385 TABLE DATA public ledger_entries ketoan\n',
    });
    const mark = new Date().toISOString();
    const f = path.join(dir, 'ngoai.dump');
    writeFileSync(f, 'gia');
    await importBackup('pvg-site2', f);
    const r = await get(`/_sites/v1/sites?updatedAfter=${encodeURIComponent(mark)}`);
    expect(r.body.items.map((x) => x.slug)).toEqual(['pvg-site2']);
  });
});
