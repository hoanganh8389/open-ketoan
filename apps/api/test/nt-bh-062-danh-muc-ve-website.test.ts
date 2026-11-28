// [2026-11-28 08:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-062: danh mục hàng đổi ở kế toán → app tgs-wp có việc giao webhook để website kéo ngay (đóng góp)
/**
 * NT-BH-062 — mặt hàng tạo / sửa ở kế toán về website ngay (docs/nghiem-thu/ban-hang/NT-BH-062-danh-muc-ve-website-ngay.md).
 * App tgs-wp (website TGS nối qua webhook) đăng ký sự kiện Core `bizcity.masterdata.catalog.changed`: đơn vị đã kết nối app thì
 * mỗi lần đổi danh mục có một việc giao cho `tgs-wp.webhook` (cầu nối nhận → kéo danh mục ngay); đơn vị chưa kết nối thì không.
 * Kết nối cũ (đồng ý trước khi app nhận loại này) chỉ nhận sau khi chủ đơn vị đồng ý lại (POST /api/v1/apps/tgs-wp/scope).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

const TYPE = 'bizcity.masterdata.catalog.changed';
let ctx: TestCtx;
let tenantId = '';
let n = 0;

/** Đổi một mặt hàng rồi chờ sự kiện danh mục đổi (hook onResponse phát SAU khi trả lời, gom theo khung 5 giây). */
async function changeCatalog(): Promise<string> {
  const before = (await db.selectFrom('event_outbox').select('id').where('tenant_id', '=', tenantId).where('type', '=', TYPE).execute()).map((r) => r.id);
  const res = await call(ctx, 'PUT', `/api/v1/products/NT062-${++n}-${Date.now()}`, { name: 'Hàng thử NT-BH-062', unit: 'Cái' });
  expect(res.status).toBeLessThan(300);
  for (let i = 0; i < 60; i++) {
    const rows = await db.selectFrom('event_outbox').select('id').where('tenant_id', '=', tenantId).where('type', '=', TYPE).orderBy('seq').execute();
    const fresh = rows.find((r) => !before.includes(r.id));
    if (fresh) return fresh.id;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('không thấy sự kiện danh mục đổi');
}
const consumers = async (eventId: string) =>
  (await db.selectFrom('event_deliveries').select(['consumer', 'status']).where('event_id', '=', eventId).orderBy('consumer').execute());

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
});
afterAll(async () => {
  await ctx.app.close();
});

describe('NT-BH-062 — danh mục đổi ở kế toán về website ngay', () => {
  it('§1 manifest app tgs-wp nhận sự kiện danh mục đổi (bản 0.2.0)', () => {
    const m = JSON.parse(readFileSync(fileURLToPath(new URL('../src/ung-dung/tgs-wp/bizcity.module.json', import.meta.url)), 'utf8'));
    expect(m.version).toBe('0.2.0');
    expect(m.events.subscribes).toEqual(expect.arrayContaining([{ type: TYPE, version: 1 }]));
  });

  it('§2 đơn vị chưa kết nối app: đổi danh mục không có việc giao cho tgs-wp.webhook', async () => {
    const id = await changeCatalog();
    expect((await consumers(id)).map((d) => d.consumer)).not.toContain('tgs-wp.webhook');
  });

  it('§3 đã kết nối app: đổi danh mục có việc giao tgs-wp.webhook (chờ gửi) bên cạnh catalog.notify-sales', async () => {
    const inst = await ctx.app.inject({ method: 'POST', url: '/api/v1/apps/tgs-wp/install', headers: { authorization: `Bearer ${ctx.token}` } });
    expect(inst.statusCode, inst.body).toBe(201);
    expect(inst.json().data.events).toContain(TYPE);
    // Khung gom 5 giây: sự kiện của §2 có thể còn chiếm khung → chờ sang khung mới.
    await new Promise((r) => setTimeout(r, 5_100));
    const id = await changeCatalog();
    expect(await consumers(id)).toEqual(expect.arrayContaining([{ consumer: 'tgs-wp.webhook', status: 'pending' }]));
  }, 20_000);

  it('§4 kết nối cũ (chưa có loại này) không nhận; đồng ý lại thì nhận', async () => {
    await db.updateTable('app_installations').set({ events: ['pos.order.recorded'] }).where('tenant_id', '=', tenantId).where('app_key', '=', 'tgs-wp').execute();
    await new Promise((r) => setTimeout(r, 5_100));
    const id1 = await changeCatalog();
    expect((await consumers(id1)).map((d) => d.consumer)).not.toContain('tgs-wp.webhook');
    const upd = await ctx.app.inject({ method: 'POST', url: '/api/v1/apps/tgs-wp/scope', headers: { authorization: `Bearer ${ctx.token}` } });
    expect(upd.statusCode, upd.body).toBeLessThan(300);
    await new Promise((r) => setTimeout(r, 5_100));
    const id2 = await changeCatalog();
    expect(await consumers(id2)).toEqual(expect.arrayContaining([{ consumer: 'tgs-wp.webhook', status: 'pending' }]));
  }, 30_000);
});
