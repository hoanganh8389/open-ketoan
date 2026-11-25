// [2026-11-25 04:45 PM Võ Hoàng] NT-BH-035 — test: core.partner.upsert ghi created_by khi tạo mới (đóng góp)
/**
 * Đối tượng tạo qua core.partner.upsert (cầu nối website, máy bán) phải có người tạo như tạo tay — trước đây created_by rỗng,
 * màn Khách hàng / Nhà cung cấp hiện "Tạo bởi —". Cập nhật đối tượng đã có không đổi người tạo.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => { ctx = await setupTenant(); });
afterAll(async () => { await ctx.app.close(); await closeDb(); });

const createdBy = async (code: string) => {
  const t = await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow();
  const r = await db.selectFrom('partners').select('created_by').where('tenant_id', '=', t.id).where('code', '=', code).executeTakeFirst();
  return r?.created_by ?? null;
};

describe('core.partner.upsert — người tạo', () => {
  it('tạo mới không kèm createdBy → ghi tên người gọi', async () => {
    const r = await call(ctx, 'POST', '/api/v1/partners/upsert', { code: 'KTB01', name: 'Khách tạo bởi 1', kind: 'customer' });
    expect(r.status).toBe(200);
    const by = await createdBy('KTB01');
    expect(by).toBeTruthy();
  });

  it('tạo mới kèm createdBy (tài khoản website) → "createdBy · người gọi"', async () => {
    const r = await call(ctx, 'POST', '/api/v1/partners/upsert', { code: 'KTB02', name: 'Khách tạo bởi 2', kind: 'customer', createdBy: 'admin' });
    expect(r.status).toBe(200);
    const by = await createdBy('KTB02');
    expect(by).toMatch(/^admin( · .+)?$/);
  });

  it('cập nhật đối tượng đã có → giữ người tạo cũ', async () => {
    const before = await createdBy('KTB02');
    const r = await call(ctx, 'POST', '/api/v1/partners/upsert', { code: 'KTB02', name: 'Khách tạo bởi 2 (sửa)', kind: 'customer', createdBy: 'nguoi-khac' });
    expect(r.status).toBe(200);
    expect(await createdBy('KTB02')).toBe(before);
  });
});
