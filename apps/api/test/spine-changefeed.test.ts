/**
 * [2026-11-24 07:10 PM Johnny Chu - Chu Hoàng Anh] SPINE-3 — Q-SPINE-3: changefeed + digest danh mục (bizcity_sync@1).
 * Kiểm: con trỏ ổn định và không bỏ sót, dòng sửa / ngừng xuất hiện lại sau con trỏ, mã + ĐVT đổi làm mặt hàng
 * xuất hiện lại, phân trang has_more, cô lập đơn vị, con trỏ lạ bị chặn ở cửa.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let other: TestCtx;
beforeAll(async () => {
  ctx = await setupTenant();
  other = await setupTenant();
});
afterAll(async () => {
  await ctx.app.close();
  await other.app.close();
  await closeDb();
});

type Row = { id: string; version: number; updated_at: string; deleted: boolean; data: Record<string, any> };
type Page = { data: Row[]; meta: { cursor: string; as_of: string; has_more: boolean } };

async function feed(c: TestCtx, axis: string, q = ''): Promise<Page> {
  const res = await call<Page>(c, 'GET', `/api/v1/sync/${axis}${q}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body;
}

describe('branches: con trỏ, sửa, ngừng', () => {
  it('dòng mới có trong feed; sửa thì xuất hiện lại sau con trỏ với version lớn hơn; ngừng thì deleted = true', async () => {
    const before = await feed(ctx, 'branches');
    const cur0 = before.meta.cursor;

    const created = await call(ctx, 'POST', '/api/v1/branches', { code: 'CNSYNC', name: 'Chi nhánh đồng bộ' });
    expect(created.status, JSON.stringify(created.body)).toBe(201);

    const p1 = await feed(ctx, 'branches', cur0 ? `?since=${encodeURIComponent(cur0)}` : '');
    const row = p1.data.find((r) => r.data.code === 'CNSYNC');
    expect(row, 'chi nhánh mới phải nằm sau con trỏ cũ').toBeTruthy();
    expect(row!.deleted).toBe(false);
    expect(row!.data.name).toBe('Chi nhánh đồng bộ');
    expect(p1.meta.cursor).toBe(`${p1.data[p1.data.length - 1]!.updated_at}|${p1.data[p1.data.length - 1]!.id}`);

    // Sau con trỏ mới: không còn gì.
    const empty = await feed(ctx, 'branches', `?since=${encodeURIComponent(p1.meta.cursor)}`);
    expect(empty.data).toEqual([]);
    expect(empty.meta.cursor).toBe(p1.meta.cursor);

    // Sửa tên → trigger 0182 đẩy updated_at → xuất hiện lại sau con trỏ, version tăng.
    const upd = await call(ctx, 'PATCH', '/api/v1/branches/CNSYNC', { name: 'Chi nhánh đồng bộ (đã sửa)' });
    expect(upd.status, JSON.stringify(upd.body)).toBe(200);
    const p2 = await feed(ctx, 'branches', `?since=${encodeURIComponent(p1.meta.cursor)}`);
    const again = p2.data.find((r) => r.id === row!.id);
    expect(again, 'dòng đã sửa phải xuất hiện lại').toBeTruthy();
    expect(again!.version).toBeGreaterThan(row!.version);
    expect(again!.data.name).toBe('Chi nhánh đồng bộ (đã sửa)');

    // Ngừng → vẫn trong feed, deleted = true (bản sao đóng dòng, không xoá).
    const off = await call(ctx, 'PATCH', '/api/v1/branches/CNSYNC', { isActive: false });
    expect(off.status, JSON.stringify(off.body)).toBe(200);
    const p3 = await feed(ctx, 'branches', `?since=${encodeURIComponent(p2.meta.cursor)}`);
    const gone = p3.data.find((r) => r.id === row!.id);
    expect(gone?.deleted).toBe(true);

    // Digest: có id với version mới nhất.
    const dg = await call<{ data: { id: string; version: number; deleted: boolean }[] }>(ctx, 'GET', '/api/v1/sync/branches/digest');
    expect(dg.status).toBe(200);
    const d = dg.body.data.find((x) => x.id === row!.id);
    expect(d).toMatchObject({ deleted: true });
    expect(d!.version).toBeGreaterThanOrEqual(again!.version);
  });
});

describe('partners: phân trang và cô lập đơn vị', () => {
  it('limit=1 đi hết bằng has_more; đơn vị khác không thấy', async () => {
    const start = (await feed(ctx, 'partners')).meta.cursor;
    for (const code of ['KHSYNC1', 'KHSYNC2', 'KHSYNC3']) {
      const res = await call(ctx, 'POST', '/api/v1/partners/upsert', { code, name: `Khách ${code}`, kind: 'customer' });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
    }
    const seen: string[] = [];
    let cur = start;
    for (let i = 0; i < 10; i++) {
      const p = await feed(ctx, 'partners', `?limit=1${cur ? `&since=${encodeURIComponent(cur)}` : ''}`);
      if (p.data.length === 0) break;
      seen.push(...p.data.map((r) => r.data.code));
      cur = p.meta.cursor;
      if (!p.meta.has_more) break;
    }
    expect(seen).toEqual(['KHSYNC1', 'KHSYNC2', 'KHSYNC3']);

    const otherFeed = await feed(other, 'partners');
    expect(otherFeed.data.some((r) => String(r.data.code).startsWith('KHSYNC'))).toBe(false);
  });
});

describe('items: mã đi cùng dòng; thêm mã làm mặt hàng xuất hiện lại', () => {
  it('core.item.upsert → item có codes; add-code → item xuất hiện lại sau con trỏ với mã mới', async () => {
    const start = (await feed(ctx, 'items')).meta.cursor;
    const created = await call<{ data: { itemId: string } }>(ctx, 'POST', '/api/v1/items/upsert', { sku: 'SPSYNC1', name: 'Hàng đồng bộ', unit: 'cai' });
    expect([200, 201], JSON.stringify(created.body)).toContain(created.status);

    const p1 = await feed(ctx, 'items', start ? `?since=${encodeURIComponent(start)}` : '');
    const row = p1.data.find((r) => (r.data.codes as any[]).some((c) => c.kind === 'sku' && c.code === 'SPSYNC1'));
    expect(row, 'mặt hàng mới phải có trong feed kèm mã sku').toBeTruthy();
    expect(row!.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(row!.deleted).toBe(false);
    expect(Array.isArray(row!.data.units)).toBe(true);
    expect(row!.data.unit_base).toBe('cai');

    // Thêm mã (item_codes) → trigger 0182 chạm items.updated_at → mặt hàng xuất hiện lại sau con trỏ, mang mã mới.
    const added = await call(ctx, 'POST', '/api/v1/items/add-code', { itemId: row!.id, kind: 'alias', code: 'SPSYNC1-ALIAS' });
    expect([200, 201], JSON.stringify(added.body)).toContain(added.status);
    const p2 = await feed(ctx, 'items', `?since=${encodeURIComponent(p1.meta.cursor)}`);
    const again = p2.data.find((r) => r.id === row!.id);
    expect(again, 'thêm mã phải làm mặt hàng xuất hiện lại').toBeTruthy();
    expect(again!.version).toBeGreaterThan(row!.version);
    expect((again!.data.codes as any[]).some((c) => c.kind === 'alias' && c.code === 'SPSYNC1-ALIAS')).toBe(true);
  });
});

describe('con trỏ khi danh mục trống', () => {
  // [2026-11-24 08:40 PM Johnny Chu - Chu Hoàng Anh] SPINE-4 — tái hiện lỗi SC-SPINE-5 do bộ kiểm hộp đen bắt: trang rỗng, không since ⇒ cursor phải khác rỗng và gửi lại được.
  it('trang rỗng vẫn có con trỏ "từ đầu"; gửi lại con trỏ đó ra cùng kết quả', async () => {
    const fresh = await setupTenant();
    try {
      const p = await feed(fresh, 'items');
      expect(p.data).toEqual([]);
      expect(p.meta.cursor).toBe('1970-01-01T00:00:00Z|');
      expect(p.meta.has_more).toBe(false);
      const again = await feed(fresh, 'items', `?since=${encodeURIComponent(p.meta.cursor)}`);
      expect(again.data).toEqual([]);
      expect(again.meta.cursor).toBe(p.meta.cursor);
    } finally {
      await fresh.app.close();
    }
  });
});

describe('cửa vào', () => {
  it('trục lạ → 400; con trỏ không đúng khuôn → 400', async () => {
    expect((await call(ctx, 'GET', '/api/v1/sync/ledger')).status).toBe(400);
    expect((await call(ctx, 'GET', '/api/v1/sync/items?since=abc')).status).toBe(400);
    expect((await call(ctx, 'GET', '/api/v1/sync/items?limit=0')).status).toBe(400);
  });
});
