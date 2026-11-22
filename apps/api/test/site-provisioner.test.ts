// [2026-11-22 10:26 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B4a (D039-9, D039-19, R-SITE-2): ca kiểm Site Provisioner — database từ mẫu, vai trò riêng từng site, dọn khi hỏng (T039-9 một phần, T039-15)
/**
 * Site Provisioner — PHASE-039 B4a. Một database mẫu có bảng đánh dấu (quyền SELECT cấp cho ketoan_app như migration thật làm):
 *   - tạo site: database từ mẫu, vai trò kt_<slug>_app, mật khẩu mã hoá trong registry; yêu cầu tới tên miền chạy bằng vai trò đó
 *     và đọc được bảng nhờ thừa hưởng quyền của ketoan_app;
 *   - vai trò của site A không CONNECT được database site B (T039-15); PUBLIC không CONNECT được;
 *   - mật khẩu trong registry không đọc được nếu không có khoá;
 *   - slug / tên miền trùng: không tạo thêm database, vai trò; thiếu database mẫu: dọn sạch, không còn dòng registry, vai trò.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import pg from 'pg';
import { closeDb, db } from '../src/db/client.js';
import { env } from '../src/config/env.js';
import { setSiteModeForTest, withSite } from '@bizcity/platform/db/site';
import { closeSiteRegistry, configureSiteRegistryForTest, controlPool, decryptSiteSecret, resolveSiteIdByHost } from '@bizcity/platform/db/site-registry';
import { configureProvisionerForTest, createSite, siteDbNames } from '@bizcity/platform/db/site-provisioner';

const testDb = new URL(env.DATABASE_URL).pathname.slice(1);
const CTL = `${testDb}_pctl`;
const TPL = `${testDb}_ptpl`;
const KEY = 'khoa-bi-mat-cua-test-phai-du-32-ky-tu!';
const SLUGS = ['pvx-congtyx', 'pvx-congtyy', 'pvx-thieumau'];
const urlOf = (name: string, user?: string, password?: string) => {
  const u = new URL(env.DATABASE_URL);
  u.pathname = `/${name}`;
  if (user) { u.username = user; u.password = password ?? ''; }
  return u.toString();
};

async function admin<T>(fn: (c: pg.Client) => Promise<T>, database = 'postgres'): Promise<T> {
  const c = new pg.Client({ connectionString: urlOf(database) });
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}

async function dropAll(): Promise<void> {
  await admin(async (c) => {
    for (const slug of SLUGS) {
      const { dbName, appRole } = siteDbNames(slug);
      await c.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
      await c.query(`DROP ROLE IF EXISTS ${appRole}`);
    }
    await c.query(`DROP DATABASE IF EXISTS ${TPL} WITH (FORCE)`);
    await c.query(`DROP DATABASE IF EXISTS ${CTL} WITH (FORCE)`);
  });
}

beforeAll(async () => {
  await dropAll();
  await admin(async (c) => {
    await c.query(`CREATE DATABASE ${CTL}`);
    await c.query(`CREATE DATABASE ${TPL}`);
  });
  await admin(async (c) => {
    await c.query('CREATE TABLE site_marker (name text NOT NULL)');
    await c.query("INSERT INTO site_marker VALUES ('mau')");
    await c.query('GRANT SELECT ON site_marker TO ketoan_app'); // như migration thật: quyền cấp cho ketoan_app
  }, TPL);
  await configureSiteRegistryForTest(urlOf(CTL), KEY);
  configureProvisionerForTest({ templateDb: TPL, adminUrl: env.DATABASE_URL, parentRole: 'ketoan_app' });
});

afterAll(async () => {
  setSiteModeForTest('single');
  await closeDb();
  await closeSiteRegistry();
  await configureSiteRegistryForTest(undefined);
  await dropAll();
});

describe('PHASE-039 B4a — Site Provisioner', () => {
  let x: Awaited<ReturnType<typeof createSite>>;
  let y: Awaited<ReturnType<typeof createSite>>;

  it('tạo site: database từ mẫu, vai trò riêng, registry active, mật khẩu mã hoá', async () => {
    x = await createSite({ slug: 'pvx-congtyx', domain: 'congtyx.btnet.test', displayName: 'Công ty X', ownerEmail: 'chu@x.test' });
    y = await createSite({ slug: 'pvx-congtyy', domain: 'congtyy.bizcity.test' });
    expect(x).toMatchObject({ dbName: 'kt_pvx_congtyx', appRole: 'kt_pvx_congtyx_app' });
    const row = (await controlPool().query('SELECT status, db_app_role, db_secrets_enc FROM sites WHERE id = $1', [x.siteId])).rows[0];
    expect(row).toMatchObject({ status: 'active', db_app_role: 'kt_pvx_congtyx_app' });
    expect(row.db_secrets_enc).toMatch(/^v1:/);
    expect(decryptSiteSecret(row.db_secrets_enc)).toHaveLength(32);
  });

  it('yêu cầu tới tên miền của site chạy bằng vai trò của site, đọc được bảng nhờ thừa hưởng quyền ketoan_app', async () => {
    setSiteModeForTest('multi');
    try {
      const id = await resolveSiteIdByHost('congtyx.btnet.test');
      expect(id).toBe(x.siteId);
      const r = await withSite(id!, async () => (await sql<{ u: string; d: string; m: string }>`SELECT current_user AS u, current_database() AS d, (SELECT name FROM site_marker) AS m`.execute(db)).rows[0]);
      expect(r).toEqual({ u: 'kt_pvx_congtyx_app', d: 'kt_pvx_congtyx', m: 'mau' });
    } finally {
      setSiteModeForTest('single');
    }
  });

  it('vai trò của site X không CONNECT được database site Y; site X vào được database của mình (T039-15)', async () => {
    const enc = (await controlPool().query('SELECT db_secrets_enc FROM sites WHERE id = $1', [x.siteId])).rows[0].db_secrets_enc;
    const pass = decryptSiteSecret(enc);
    const own = new pg.Client({ connectionString: urlOf(x.dbName, x.appRole, pass) });
    await own.connect();
    await own.end();
    const other = new pg.Client({ connectionString: urlOf(y.dbName, x.appRole, pass) });
    await expect(other.connect()).rejects.toThrow(/permission denied for database/);
    await other.end().catch(() => undefined);
  });

  it('PUBLIC và vai trò cha không có CONNECT trên database của site', async () => {
    const r = await admin((c) => c.query(
      `SELECT has_database_privilege('public', $1, 'CONNECT') AS pub, has_database_privilege('ketoan_app', $1, 'CONNECT') AS parent`,
      [x.dbName],
    ));
    expect(r.rows[0]).toEqual({ pub: false, parent: false });
  });

  it('sai khoá: không giải mã được mật khẩu của site', async () => {
    const enc = (await controlPool().query('SELECT db_secrets_enc FROM sites WHERE id = $1', [x.siteId])).rows[0].db_secrets_enc;
    await configureSiteRegistryForTest(urlOf(CTL), 'mot-khoa-khac-hoan-toan-cung-du-32-ky-tu');
    try {
      expect(() => decryptSiteSecret(enc)).toThrow();
    } finally {
      await configureSiteRegistryForTest(urlOf(CTL), KEY);
    }
  });

  it('slug hoặc tên miền trùng: từ chối, không tạo thêm gì', async () => {
    await expect(createSite({ slug: 'pvx-congtyx', domain: 'khac.btnet.test' })).rejects.toMatchObject({ code: 'SITE_SLUG_TAKEN' });
    await expect(createSite({ slug: 'pvx-thieumau', domain: 'congtyx.btnet.test' })).rejects.toMatchObject({ code: 'SITE_DOMAIN_TAKEN' });
    const n = (await controlPool().query('SELECT count(*)::int AS n FROM sites')).rows[0].n;
    expect(n).toBe(2);
    const role = await admin((c) => c.query("SELECT 1 FROM pg_roles WHERE rolname = 'kt_pvx_thieumau_app'"));
    expect(role.rowCount).toBe(0);
  });

  it('slug sai khuôn bị từ chối trước khi chạm database', async () => {
    // (chữ hoa được chuẩn hoá về chữ thường nên không nằm trong danh sách này)
    for (const slug of ['ab', 'abc;drop', 'abc-', 'a--b', '1abc', '../x']) {
      await expect(createSite({ slug, domain: 'x.btnet.test' })).rejects.toMatchObject({ code: 'SITE_SLUG_INVALID' });
    }
  });

  it('thiếu database mẫu: dọn sạch — không còn dòng registry, vai trò, database', async () => {
    configureProvisionerForTest({ templateDb: `${testDb}_khongcomau` });
    try {
      await expect(createSite({ slug: 'pvx-thieumau', domain: 'thieumau.btnet.test' })).rejects.toMatchObject({ code: 'SITE_TEMPLATE_MISSING' });
    } finally {
      configureProvisionerForTest({ templateDb: TPL });
    }
    expect((await controlPool().query("SELECT 1 FROM sites WHERE slug = 'pvx-thieumau'")).rowCount).toBe(0);
    expect((await controlPool().query("SELECT 1 FROM site_domains WHERE domain = 'thieumau.btnet.test'")).rowCount).toBe(0);
    const left = await admin((c) => c.query("SELECT (SELECT count(*) FROM pg_roles WHERE rolname = 'kt_pvx_thieumau_app')::int AS r, (SELECT count(*) FROM pg_database WHERE datname = 'kt_pvx_thieumau')::int AS d"));
    expect(left.rows[0]).toEqual({ r: 0, d: 0 });
  });
});
