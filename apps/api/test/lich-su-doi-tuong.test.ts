// [2026-11-25 05:20 PM Võ Hoàng] NT-BH-035 — test lịch sử đối tượng: tên khoá API, nhãn giá trị (đóng góp)
/**
 * Lịch sử thay đổi trong hồ sơ Khách hàng / Nhà cung cấp (GET /api/v1/co-cau/history?type=partner):
 * - khách tạo bằng khoá API (cầu nối website, máy bán) → "Người làm" là tên khoá, không phải "apikey:<id>";
 * - ô dạng mã hiện nhãn như form: Loại customer → Khách hàng, Loại khách personal → KH cá nhân.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '../src/db/client.js';
import { diffText, PARTNER_VALUES } from '../src/modules/co-cau/co-cau-history.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => { ctx = await setupTenant(); });
afterAll(async () => { await ctx.app.close(); await closeDb(); });

describe('lịch sử đối tượng', () => {
  it('khách tạo bằng khoá API: người làm là tên khoá, Loại là "Khách hàng"', async () => {
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/v1/partners/upsert',
      payload: { code: 'LSDT01', name: 'Khách lịch sử', kind: 'customer', phone: '0900000099' },
      headers: { 'x-api-key': ctx.apiKey, 'idempotency-key': `test-${randomUUID()}` },
    });
    expect(res.statusCode).toBe(200);
    const h = await call<{ data: { by: string; action: string; changes: string[] }[] }>(ctx, 'GET', '/api/v1/co-cau/history?type=partner&code=LSDT01');
    expect(h.status).toBe(200);
    const line = h.body.data[0]!;
    expect(line.by).not.toMatch(/^apikey:/);
    expect(line.by).toMatch(/\(khoá API\)$/);
    expect(line.changes).toContain('Loại: Khách hàng');
  });

  it('nhãn giá trị ô đối tượng', () => {
    expect(diffText({ kind: 'customer' }, { kind: 'supplier' }, PARTNER_VALUES)).toEqual(['Loại: Khách hàng → Nhà cung cấp']);
    expect(diffText({}, { customerType: 'personal', gender: 'female', alsoKinds: ['supplier'] }, PARTNER_VALUES))
      .toEqual(['Loại khách: KH cá nhân', 'Giới tính: Nữ', 'Vai trò thêm: Nhà cung cấp']);
    // Không phải đối tượng (kho, phòng ban): giữ giá trị gốc.
    expect(diffText({}, { kind: 'customer' })).toEqual(['Loại: customer']);
  });
});
