// [2026-11-22 12:37 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B2a (ADR-0036): ca kiểm Site Registry + nhận site theo tên miền, SITE_MODE=multi (T039-4, một phần T039-2, T039-14)
/**
 * Site Registry — PHASE-039 B2a. Tạo một database điều khiển và hai database site (A, B) có bảng đánh dấu riêng, rồi:
 *   - yêu cầu tới a.<miền> đọc database A, tới b.<miền> đọc database B; một site có hai tên miền → cùng một database (T039-14);
 *   - tên miền lạ → 404 SITE_NOT_FOUND, không truy vấn nào chạy (T039-4);
 *   - kiểm sống chạy trên site ngầm định (bộ cân bằng tải gọi bằng địa chỉ máy);
 *   - chế độ multi: truy vấn ngoài ngữ cảnh site → SITE_CONTEXT_MISSING (R-SITE-3);
 *   - site đang tạo / đã xoá không được phục vụ.
 * Chế độ multi chỉ bật trong tệp này (setSiteModeForTest) và trả về single sau mỗi ca.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import pg from 'pg';
import { closeDb, db } from '../src/db/client.js';
import { env } from '../src/config/env.js';
import { registerRequestContext } from '../src/core/request-context.js';
import { setSiteModeForTest } from '@bizcity/platform/db/site';
import { closeSiteRegistry, configureSiteRegistryForTest, ensureControlSchema, invalidateSiteCache, resolveSiteIdByHost } from '@bizcity/platform/db/site-registry';

const base = new URL(env.DATABASE_URL);
const testDb = base.pathname.slice(1);
const CTL = `${testDb}_ctl`;
const DB_A = `${testDb}_sa`;
const DB_B = `${testDb}_sb`;
const urlOf = (name: string) => { const u = new URL(env.DATABASE_URL); u.pathname = `/${name}`; return u.toString(); };

async function admin<T>(fn: (c: pg.Client) => Promise<T>, database = 'postgres'): Promise<T> {
  const c = new pg.Client({ connectionString: urlOf(database) });
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}

let app: FastifyInstance;
const ctl = () => new pg.Client({ connectionString: urlOf(CTL) });

beforeAll(async () => {
  await admin(async (c) => {
    for (const name of [CTL, DB_A, DB_B]) {
      await c.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await c.query(`CREATE DATABASE ${name}`);
    }
  });
  for (const [name, mark] of [[DB_A, 'A'], [DB_B, 'B']] as const) {
    await admin(async (c) => {
      await c.query('CREATE TABLE site_marker (name text NOT NULL)');
      await c.query('INSERT INTO site_marker VALUES ($1)', [mark]);
      await c.query('GRANT SELECT ON site_marker TO PUBLIC');
    }, name);
  }
  await configureSiteRegistryForTest(urlOf(CTL));
  await ensureControlSchema();
  const c = ctl();
  await c.connect();
  try {
    const host = base.hostname;
    const port = Number(base.port || 5432);
    await c.query(
      `INSERT INTO sites (id, slug, status, db_host, db_port, db_name) VALUES
         ('S_A', 'congtya', 'active', $1, $2, $3),
         ('S_B', 'congtyb', 'active', $1, $2, $4),
         ('S_NEW', 'dangtao', 'provisioning', $1, $2, $5),
         ('S_DEL', 'daxoa', 'deleted', $1, $2, $6)`,
      [host, port, DB_A, DB_B, `${testDb}_new`, `${testDb}_del`],
    );
    await c.query(
      `INSERT INTO site_domains (domain, site_id, is_primary) VALUES
         ('congtya.btnet.test', 'S_A', true), ('ketoan.congtya.test', 'S_A', false),
         ('congtyb.bizcity.test', 'S_B', true), ('dangtao.btnet.test', 'S_NEW', true), ('daxoa.btnet.test', 'S_DEL', true)`,
    );
  } finally {
    await c.end();
  }

  app = Fastify();
  registerRequestContext(app);
  const which = async () => {
    const marker = await sql<{ name: string }>`SELECT name FROM site_marker`.execute(db).then((r) => r.rows[0]?.name ?? null, () => null);
    const name = (await sql<{ d: string }>`SELECT current_database() AS d`.execute(db)).rows[0]!.d;
    return { db: name, marker };
  };
  app.get('/which', which);
  app.get('/api/v1/system/health', which);
  await app.ready();
});

afterEach(() => {
  setSiteModeForTest('single');
});

afterAll(async () => {
  setSiteModeForTest('single');
  await app?.close();
  await closeSiteRegistry();
  await configureSiteRegistryForTest(undefined);
  await closeDb();
  await admin(async (c) => {
    for (const name of [CTL, DB_A, DB_B]) await c.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  });
});

const get = (host: string, url = '/which') => app.inject({ method: 'GET', url, headers: { host } });

describe('PHASE-039 B2a — Site Registry, nhận site theo tên miền (SITE_MODE=multi)', () => {
  it('mỗi tên miền đọc đúng database của site mình', async () => {
    setSiteModeForTest('multi');
    const a = await get('congtya.btnet.test');
    const b = await get('congtyb.bizcity.test');
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    expect(a.json()).toEqual({ db: DB_A, marker: 'A' });
    expect(b.json()).toEqual({ db: DB_B, marker: 'B' });
  });

  it('một site có hai tên miền thuộc hai tên miền gốc khác nhau → cùng một database; có cổng, chữ hoa vẫn nhận (T039-14)', async () => {
    setSiteModeForTest('multi');
    expect((await get('ketoan.congtya.test')).json()).toEqual({ db: DB_A, marker: 'A' });
    expect((await get('CongTyA.btnet.test:443')).json()).toEqual({ db: DB_A, marker: 'A' });
  });

  it('tên miền lạ → 404 SITE_NOT_FOUND, không lộ site khác (T039-4)', async () => {
    setSiteModeForTest('multi');
    for (const host of ['khongco.btnet.test', 'localhost', '127.0.0.1']) {
      const r = await get(host);
      expect(r.statusCode).toBe(404);
      expect(r.json()).toMatchObject({ ok: false, error: { code: 'SITE_NOT_FOUND' } });
      expect(r.body).not.toMatch(/congty|_sa|_sb/);
    }
  });

  it('site đang tạo hoặc đã xoá không được phục vụ', async () => {
    setSiteModeForTest('multi');
    expect((await get('dangtao.btnet.test')).statusCode).toBe(404);
    expect((await get('daxoa.btnet.test')).statusCode).toBe(404);
  });

  it('kiểm sống chạy trên site ngầm định dù gọi bằng địa chỉ máy', async () => {
    setSiteModeForTest('multi');
    const r = await get('127.0.0.1', '/api/v1/system/health');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ db: testDb });
  });

  it('chế độ multi: truy vấn ngoài ngữ cảnh site bị từ chối, không rơi về site ngầm định (R-SITE-3)', async () => {
    setSiteModeForTest('multi');
    await expect(sql`SELECT 1`.execute(db)).rejects.toMatchObject({ name: 'SiteRoutingError', code: 'SITE_CONTEXT_MISSING' });
  });

  it('đổi registry rồi xoá bộ đệm: tên miền trỏ sang site khác có hiệu lực ngay', async () => {
    setSiteModeForTest('multi');
    expect(await resolveSiteIdByHost('congtya.btnet.test')).toBe('S_A');
    const c = ctl();
    await c.connect();
    await c.query(`UPDATE site_domains SET site_id = 'S_B', is_primary = false WHERE domain = 'ketoan.congtya.test'`);
    await c.end();
    invalidateSiteCache();
    expect((await get('ketoan.congtya.test')).json()).toEqual({ db: DB_B, marker: 'B' });
  });

  it('chế độ single (mặc định): tên miền không quan trọng, mọi yêu cầu chạy trên DATABASE_URL như trước', async () => {
    const r = await get('khongco.btnet.test');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ db: testDb });
  });
});
