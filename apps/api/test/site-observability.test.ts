// [2026-11-22 02:25 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B7b-1 (S039-19): ca kiểm nhật ký / số đo có site
/**
 * Nhật ký và số đo ở chế độ nhiều site — PHASE-039 B7b-1:
 *   - dòng nhật ký trong ngữ cảnh một site (khác site ngầm định) có trường `site`; site ngầm định / ngoài ngữ cảnh: không có (bản cài
 *     một công ty không đổi); trường `site` do nơi gọi tự ghi thì giữ nguyên;
 *   - số đo bizcity_sites{status} / bizcity_sites_attention{flag} đếm đúng theo registry, đủ mọi nhãn (0 khi không có), KHÔNG có mã
 *     site nào trong /metrics (R-OBS-4); chế độ single: bộ thu không làm gì.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { env } from '../src/config/env.js';
import { withRequestContext } from '../src/core/request-context.js';
import { loggerOptions, siteField } from '@bizcity/platform/core/logger';
import { renderMetrics } from '@bizcity/platform/core/metrics';
import { setSiteModeForTest } from '@bizcity/platform/db/site';
import { closeSiteRegistry, configureSiteRegistryForTest, controlPool, ensureControlSchema, setRequiredSchemaVersionForTest } from '@bizcity/platform/db/site-registry';
import { newSiteId } from '@bizcity/platform/db/site-provisioner';
import { collectSiteMetrics } from '../src/modules/sites/provisioning.routes.js';

const testDb = new URL(env.DATABASE_URL).pathname.slice(1);
const CTL = `${testDb}_octl`;
const urlOf = (name: string) => { const u = new URL(env.DATABASE_URL); u.pathname = `/${name}`; return u.toString(); };
async function q(database: string, text: string): Promise<void> {
  const c = new pg.Client({ connectionString: urlOf(database) });
  await c.connect();
  try { await c.query(text); } finally { await c.end(); }
}
const ctx = (siteId?: string) => ({ requestId: 'r-obs', correlationId: 'r-obs', ...(siteId ? { siteId } : {}) });
const A = newSiteId();
const B = newSiteId();

beforeAll(async () => {
  await q('postgres', `DROP DATABASE IF EXISTS ${CTL} WITH (FORCE)`);
  await q('postgres', `CREATE DATABASE ${CTL}`);
  await configureSiteRegistryForTest(urlOf(CTL), 'khoa-bi-mat-cua-test-phai-du-32-ky-tu!');
  await ensureControlSchema();
  setRequiredSchemaVersionForTest('0179_x.sql');
  await controlPool().query(
    `INSERT INTO sites (id, slug, status, db_host, db_name, schema_version) VALUES
       ($1, 'pvo-congtya', 'active', '127.0.0.1', 'kt_pvo_congtya', '0179_x.sql'),
       ($2, 'pvo-congtyb', 'suspended', '127.0.0.1', 'kt_pvo_congtyb', '0178_cu.sql')`, [A, B]);
});

afterAll(async () => {
  setSiteModeForTest('single');
  setRequiredSchemaVersionForTest(undefined);
  await closeSiteRegistry();
  await configureSiteRegistryForTest(undefined);
  await q('postgres', `DROP DATABASE IF EXISTS ${CTL} WITH (FORCE)`);
});

describe('PHASE-039 B7b-1 — nhật ký / số đo có site', () => {
  it('trường site: chỉ trong ngữ cảnh một site khác site ngầm định', () => {
    expect(siteField()).toEqual({});
    expect(withRequestContext(ctx('default'), () => siteField())).toEqual({});
    expect(withRequestContext(ctx(), () => siteField())).toEqual({});
    expect(withRequestContext(ctx(A), () => siteField())).toEqual({ site: A });
  });

  it('mixin của logger thêm site vào mỗi dòng; nơi gọi tự ghi site thì giữ; lỗi vẫn có errFp', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'okt-b7b-'));
    const mixin = (loggerOptions({ service: 'kiem', level: 'fatal', dir }) as { mixin: (o: object, level: number) => Record<string, unknown> }).mixin;
    expect(mixin({}, 30)).toEqual({});
    expect(withRequestContext(ctx(A), () => mixin({}, 30))).toEqual({ site: A });
    expect(withRequestContext(ctx(A), () => mixin({ site: 'tu-ghi' }, 30))).toEqual({});
    const e = withRequestContext(ctx(A), () => mixin({ err: new Error('hỏng') }, 50));
    expect(e).toMatchObject({ site: A, errFp: expect.any(String) });
  });

  it('bizcity_sites / bizcity_sites_attention đếm đúng, đủ nhãn, không lộ mã site; single: bộ thu không chạy', async () => {
    await collectSiteMetrics(); // single: không làm gì
    expect(renderMetrics()).not.toContain('bizcity_sites{status="suspended"} 1');

    setSiteModeForTest('multi');
    try {
      await collectSiteMetrics();
    } finally {
      setSiteModeForTest('single');
    }
    const m = renderMetrics();
    for (const line of [
      'bizcity_sites{status="active"} 1', 'bizcity_sites{status="suspended"} 1', 'bizcity_sites{status="deleted"} 0',
      'bizcity_sites_attention{flag="backup_missing"} 2', 'bizcity_sites_attention{flag="suspended"} 1',
      'bizcity_sites_attention{flag="schema_behind"} 1', 'bizcity_sites_attention{flag="migration_failed"} 0',
    ]) expect(m).toContain(line);
    expect(m).not.toContain(A);
    expect(m).not.toContain(B);
    expect(m).not.toContain('pvo-congty');
  });
});
