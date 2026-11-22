// [2026-11-22 11:04 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B2c (D039-8, R-SITE-10): ca kiểm việc nền theo site — dispatcher giao sự kiện đúng site (T039-5)
/**
 * Việc nền theo site — PHASE-039 B2c. Hai site thật tạo từ cùng database mẫu (migration thật) nên CÙNG có đơn vị mã số 1:
 *   - sự kiện phát ở site A chỉ được giao trong site A (subscriber thấy đúng site, đúng database), site B tương tự (T039-5);
 *   - dispatcher nạp pool của site chưa có yêu cầu nào (đọc registry), bỏ site ngầm định ở chế độ multi và pool tạm `prov:…`;
 *   - một site hỏng kết nối: báo lỗi của site đó, các site khác vẫn được giao (R-SITE-10).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'kysely';
import pg from 'pg';
import { closeDb, db } from '../src/db/client.js';
import { env } from '../src/config/env.js';
import { currentRequest, withRequestContext } from '../src/core/request-context.js';
import { defineSubscriber, dispatchAllSites, emitEvent, registerSubscribers, type EventEnvelope } from '../src/core/events.js';
import { backgroundSiteIds, DEFAULT_SITE_ID, listSiteIds, registerSitePool, setSiteModeForTest, unregisterSitePool } from '@bizcity/platform/db/site';
import { closeSiteRegistry, configureSiteRegistryForTest, invalidateSiteCache } from '@bizcity/platform/db/site-registry';
import { configureProvisionerForTest, siteDbNames } from '@bizcity/platform/db/site-provisioner';
import { createSiteWithOwner } from '../src/db/site-create.js';

const API_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testDb = new URL(env.DATABASE_URL).pathname.slice(1);
const CTL = `${testDb}_ectl`;
const TPL = `${testDb}_etpl`;
const KEY = 'khoa-bi-mat-cua-test-phai-du-32-ky-tu!';
const SLUGS = ['pve-congtya', 'pve-congtyb'];
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

const seen: Array<{ site: string | undefined; db: string; tenantId: string; subject: string }> = [];
registerSubscribers([defineSubscriber({
  id: 'test.site-probe',
  module: 'test',
  on: ['test.site.checked'],
  async handle(c, evt: EventEnvelope) {
    const r = await sql<{ d: string }>`SELECT current_database() AS d`.execute(c.tx);
    seen.push({ site: currentRequest()?.siteId, db: r.rows[0]!.d, tenantId: evt.tenantId, subject: evt.subject });
  },
})]);

let A: Awaited<ReturnType<typeof createSiteWithOwner>>;
let B: Awaited<ReturnType<typeof createSiteWithOwner>>;

beforeAll(async () => {
  await dropAll();
  await q('postgres', `CREATE DATABASE ${CTL}`);
  await q('postgres', `CREATE DATABASE ${TPL}`);
  execSync('npx tsx --conditions=development src/db/migrate.ts', { cwd: API_DIR, env: { ...process.env, DATABASE_URL: urlOf(TPL) }, stdio: 'pipe' });
  await configureSiteRegistryForTest(urlOf(CTL), KEY);
  configureProvisionerForTest({ templateDb: TPL, adminUrl: env.DATABASE_URL, parentRole: 'ketoan_app' });
  A = await createSiteWithOwner({ slug: 'pve-congtya', domain: 'a.events.test', name: 'Công ty A' });
  B = await createSiteWithOwner({ slug: 'pve-congtyb', domain: 'b.events.test', name: 'Công ty B' });
}, 180_000);

afterAll(async () => {
  setSiteModeForTest('single');
  await closeDb();
  await closeSiteRegistry();
  await configureSiteRegistryForTest(undefined);
  await dropAll();
});

const emitIn = (site: { siteId: string; tenantId: string }, subject: string) =>
  withRequestContext({ requestId: `t-${subject}`, correlationId: `t-${subject}`, siteId: site.siteId, tenantId: site.tenantId }, () =>
    db.transaction().execute((trx) => emitEvent(trx, { tenantId: site.tenantId, type: 'test.site.checked', subject, source: 'test', actor: { kind: 'system', id: 'test' } })));

describe('PHASE-039 B2c — việc nền theo site', () => {
  it('hai site mới cùng có đơn vị mã số 1 (đúng tình huống trùng mã)', () => {
    expect(A.tenantId).toBe(B.tenantId);
  });

  it('dispatcher nạp pool của site chưa có yêu cầu; sự kiện của site nào giao trong site đó (T039-5)', async () => {
    setSiteModeForTest('multi');
    try {
      invalidateSiteCache();
      const errors: string[] = [];
      await dispatchAllSites((s) => errors.push(s)); // lượt đầu: mở pool cho site A, B từ registry
      expect(listSiteIds()).toEqual(expect.arrayContaining([A.siteId, B.siteId]));
      await emitIn(A, 'su-kien-a');
      await emitIn(B, 'su-kien-b');
      await dispatchAllSites((s) => errors.push(s));
      expect(errors).toEqual([]);
      expect(seen).toHaveLength(2);
      expect(seen).toEqual(expect.arrayContaining([
        { site: A.siteId, db: A.dbName, tenantId: A.tenantId, subject: 'su-kien-a' },
        { site: B.siteId, db: B.dbName, tenantId: B.tenantId, subject: 'su-kien-b' },
      ]));
      for (const s of [A, B]) {
        const rows = await q<{ status: string }>(s.dbName, "SELECT status FROM event_deliveries WHERE consumer = 'test.site-probe'");
        expect(rows).toEqual([{ status: 'done' }]);
      }
    } finally {
      setSiteModeForTest('single');
    }
  });

  it('việc nền bỏ site ngầm định (chế độ multi) và pool tạm prov:…', async () => {
    const tmp = { connect: async () => { throw new Error('không được chạm'); }, end: async () => {} } as unknown as pg.Pool;
    registerSitePool('prov:TAM', tmp);
    try {
      expect(backgroundSiteIds()).toContain(DEFAULT_SITE_ID);
      expect(backgroundSiteIds()).not.toContain('prov:TAM');
      setSiteModeForTest('multi');
      expect(backgroundSiteIds()).not.toContain(DEFAULT_SITE_ID);
    } finally {
      setSiteModeForTest('single');
      await unregisterSitePool('prov:TAM');
    }
  });

  it('một site hỏng kết nối: báo lỗi của site đó, site khác vẫn được giao (R-SITE-10)', async () => {
    const broken = { connect: async () => { throw new Error('mất kết nối (giả lập)'); }, end: async () => {} } as unknown as pg.Pool;
    registerSitePool('S_HONG', broken);
    setSiteModeForTest('multi');
    try {
      seen.length = 0;
      await emitIn(A, 'su-kien-a2');
      const errors: string[] = [];
      await dispatchAllSites((s) => errors.push(s));
      expect(errors).toEqual(['S_HONG']);
      expect(seen.map((x) => x.subject)).toEqual(['su-kien-a2']);
    } finally {
      setSiteModeForTest('single');
      await unregisterSitePool('S_HONG');
    }
  });
});
