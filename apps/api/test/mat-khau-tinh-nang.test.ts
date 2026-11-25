// [2026-11-22 11:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-040 — B10b (S040-23): mật khẩu tính năng nguy hiểm không có giá trị mặc định trong mã (SC-SEC-5), cùng khuôn CK-3 (mat-khau-mac-dinh.test.ts)
/**
 *   T040-SEC-1  checkEnvPassword: chưa đặt biến nào → tính năng tắt, câu lỗi chỉ biến cần đặt; sai → từ chối; đúng → qua; biến đầu đã đặt được ưu tiên
 *   T040-SEC-2  xoá hết cả danh mục khi chưa đặt CATALOG_WIPE_PASSWORD: 403 "đang tắt"; mật khẩu cũ viết trong mã không mở được
 *   T040-SEC-3  đổi công thức giá vốn khi chưa đặt biến nào: 403 "đang tắt"; mật khẩu cũ không mở được; đặt biến thì qua
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { checkEnvPassword, envPassword } from '@bizcity/platform/core/security/tool-password';
import { call, setupTenant, type TestCtx } from './helpers.js';

const KEYS = ['CATALOG_WIPE_PASSWORD', 'COSTING_FORMULA_PASSWORD', 'RESTORE_DEFAULT_PASSWORD'] as const;
const SAVED = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
const OLD = ['Thuy', '!@#'].join(''); // mật khẩu đã công bố — ghép lúc chạy để mã nguồn không chứa nguyên văn
let ctx: TestCtx;

beforeAll(async () => { ctx = await setupTenant(); });
afterAll(async () => { await ctx.app.close(); });
afterEach(() => { for (const k of KEYS) { if (SAVED[k] == null) delete process.env[k]; else process.env[k] = SAVED[k]; } });
const unset = () => { for (const k of KEYS) delete process.env[k]; };

describe('T040-SEC — mật khẩu tính năng nguy hiểm không có mặc định trong mã', () => {
  it('T040-SEC-1 checkEnvPassword: tắt khi chưa đặt biến, sai thì từ chối, đúng thì qua; biến đầu được ưu tiên', () => {
    unset();
    expect(envPassword(KEYS)).toBeNull();
    expect(() => checkEnvPassword(OLD, 'xoá hết', ['CATALOG_WIPE_PASSWORD'])).toThrow(/xoá hết đang tắt.*CATALOG_WIPE_PASSWORD/);
    process.env.CATALOG_WIPE_PASSWORD = 'mk-xoa-thu';
    expect(() => checkEnvPassword('sai', 'xoá hết', ['CATALOG_WIPE_PASSWORD'])).toThrow(/Sai mật khẩu xoá hết/);
    expect(() => checkEnvPassword(undefined, 'xoá hết', ['CATALOG_WIPE_PASSWORD'])).toThrow(/Sai mật khẩu/);
    expect(() => checkEnvPassword('mk-xoa-thu', 'xoá hết', ['CATALOG_WIPE_PASSWORD'])).not.toThrow();
    process.env.COSTING_FORMULA_PASSWORD = 'mk-gia-von';
    expect(envPassword(['COSTING_FORMULA_PASSWORD', 'CATALOG_WIPE_PASSWORD'])).toBe('mk-gia-von');
    expect(() => checkEnvPassword('mk-xoa-thu', 'đổi công thức giá vốn', ['COSTING_FORMULA_PASSWORD', 'CATALOG_WIPE_PASSWORD'])).toThrow(/Sai mật khẩu/);
  });

  it('T040-SEC-2 xoá hết cả danh mục: chưa đặt biến → 403 "đang tắt"; mật khẩu cũ không mở được', async () => {
    unset();
    const off = await call(ctx, 'POST', '/api/v1/catalog-trash/trash', { catalog: 'unit-names', all: true, password: OLD });
    expect(off.status, JSON.stringify(off.body)).toBe(403);
    expect(off.body.error.message).toMatch(/đang tắt/);
    process.env.CATALOG_WIPE_PASSWORD = 'mk-xoa-khac';
    const wrong = await call(ctx, 'POST', '/api/v1/catalog-trash/trash', { catalog: 'unit-names', all: true, password: OLD });
    expect(wrong.status).toBe(403);
    expect(wrong.body.error.message).toMatch(/Sai mật khẩu xoá hết/);
  });

  it('T040-SEC-3 đổi công thức giá vốn: chưa đặt biến → 403 "đang tắt"; mật khẩu cũ không mở được; đặt biến thì qua', async () => {
    const body = { name: 'Thử mật khẩu', options: {}, applyFrom: '2026-12' };
    unset();
    const off = await call(ctx, 'POST', '/api/v1/inventory/costing-formulas', { ...body, password: OLD });
    expect(off.status, JSON.stringify(off.body)).toBe(403);
    expect(off.body.error.message).toMatch(/đang tắt.*COSTING_FORMULA_PASSWORD/);
    process.env.COSTING_FORMULA_PASSWORD = 'mk-gia-von-thu';
    expect((await call(ctx, 'POST', '/api/v1/inventory/costing-formulas', { ...body, password: OLD })).status).toBe(403);
    const okRes = await call(ctx, 'POST', '/api/v1/inventory/costing-formulas', { ...body, password: 'mk-gia-von-thu' });
    expect(okRes.status, JSON.stringify(okRes.body)).toBe(200);
  });
});
