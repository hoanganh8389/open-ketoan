// [2026-11-21 09:23 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B1 (ADR-0036): ca kiểm bộ định tuyến CSDL theo site ở chế độ một site (T039-1 phần định tuyến, R-SITE-3, R-SITE-5)
/**
 * Bộ định tuyến CSDL theo site — PHASE-039 B1, chế độ một site.
 *   - Bộ định tuyến chỉ có site ngầm định; pool của nó là `pool` của DATABASE_URL (hành vi như trước PHASE-039).
 *   - Truy vấn qua `db` mượn kết nối theo site của ngữ cảnh; site lạ → SITE_NOT_FOUND, không rơi về site ngầm định.
 *   - withSite giữ mã yêu cầu / mã tương quan / đơn vị; forEachSite chạy từng site, lỗi một site không chặn site khác.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import type pg from 'pg';
import { closeDb, db, pool } from '../src/db/client.js';
import { currentRequest, withRequestContext } from '../src/core/request-context.js';
import {
  DEFAULT_SITE_ID,
  SiteRoutingError,
  currentSiteId,
  forEachSite,
  listSiteIds,
  poolOf,
  registerSitePool,
  withSite,
} from '@bizcity/platform/db/site';

const dbName = async () => (await sql<{ d: string }>`SELECT current_database() AS d`.execute(db)).rows[0]!.d;

afterAll(async () => {
  await closeDb();
});

describe('PHASE-039 B1 — bộ định tuyến CSDL theo site, chế độ một site', () => {
  it('chỉ có site ngầm định, pool của nó là pool của DATABASE_URL', () => {
    expect(listSiteIds()).toEqual([DEFAULT_SITE_ID]);
    expect(poolOf()).toBe(pool);
    expect(poolOf(DEFAULT_SITE_ID)).toBe(pool);
    expect(currentSiteId()).toBe(DEFAULT_SITE_ID);
  });

  it('ngoài ngữ cảnh và trong ngữ cảnh site ngầm định: cùng một database', async () => {
    const outside = await dbName();
    const inside = await withSite(DEFAULT_SITE_ID, () => dbName());
    expect(inside).toBe(outside);
  });

  it('site lạ: truy vấn bị từ chối với SITE_NOT_FOUND, không rơi về site ngầm định (R-SITE-3)', async () => {
    expect(() => poolOf('khong-co')).toThrow(SiteRoutingError);
    const run = withRequestContext({ requestId: 't-site-1', correlationId: 't-site-1', siteId: 'khong-co' }, () => dbName());
    await expect(run).rejects.toMatchObject({ name: 'SiteRoutingError', code: 'SITE_NOT_FOUND' });
  });

  it('withSite giữ mã yêu cầu, mã tương quan, đơn vị của ngữ cảnh đang có', () => {
    const got = withRequestContext({ requestId: 'r-site-2', correlationId: 'c-site-2', tenantId: 't-1' }, () =>
      withSite(DEFAULT_SITE_ID, () => currentRequest()),
    );
    expect(got).toMatchObject({ requestId: 'r-site-2', correlationId: 'c-site-2', tenantId: 't-1', siteId: DEFAULT_SITE_ID });
    expect(withSite(DEFAULT_SITE_ID, () => currentRequest())).toMatchObject({ requestId: `site:${DEFAULT_SITE_ID}`, siteId: DEFAULT_SITE_ID });
  });

  it('một mã site chỉ có một pool', () => {
    expect(() => registerSitePool(DEFAULT_SITE_ID, pool)).not.toThrow();
    expect(() => registerSitePool(DEFAULT_SITE_ID, {} as pg.Pool)).toThrow(/đã có pool/);
  });

  // Ca cuối: đăng ký thêm một site giả có kết nối hỏng (còn lại tới hết tệp; closeDb đóng cả nó).
  it('forEachSite chạy từng site trong ngữ cảnh của site đó; có onError thì lỗi một site không chặn site khác', async () => {
    const broken = { connect: async () => { throw new Error('mất kết nối (giả lập)'); }, end: async () => {} } as unknown as pg.Pool;
    registerSitePool('site-hong', broken);

    const seen: string[] = [];
    const errs: string[] = [];
    await forEachSite(
      async (siteId) => {
        expect(currentSiteId()).toBe(siteId);
        await dbName();
        seen.push(siteId);
      },
      (siteId) => errs.push(siteId),
    );
    expect(seen).toEqual([DEFAULT_SITE_ID]);
    expect(errs).toEqual(['site-hong']);

    await expect(forEachSite(async () => { await dbName(); })).rejects.toThrow(/mất kết nối/);
  });
});
