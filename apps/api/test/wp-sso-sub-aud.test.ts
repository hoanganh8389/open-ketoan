/**
 * [2026-11-24 10:10 PM Johnny Chu - Chu Hoàng Anh] SPINE-5 — C-9-13: đăng nhập một lần từ WordPress có `sub` + `aud`
 * (bizcity_identity@1, BIZCITY-API-v1 §5.2). Kiểm: khớp theo sub trước email, gắn sub vào người dùng cũ lần đầu,
 * email đã gắn sub khác bị chặn (không chiếm tài khoản), aud sai bị từ chối, sub sai khuôn bị từ chối,
 * WP_SSO_REQUIRE_SUB, vé cũ không sub vẫn vào được (giai đoạn chuyển), người dùng bị khoá vẫn bị chặn.
 */
import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../src/config/env.js';
import { db } from '../src/db/client.js';
import { loginWithWpTicket } from '../src/modules/auth/wp-sso.js';
import { setupTenant, type TestCtx } from './helpers.js';

const SECRET = 'kiem-thu-wp-sso-sub-aud-0123456789';
const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url');
const e = env as { WP_SSO_SECRET: string; WP_SSO_REQUIRE_SUB: string; WP_SSO_AUD: string };

function ticket(claims: Record<string, unknown>): string {
  const now = Math.floor(Date.now() / 1000);
  const body = b64(JSON.stringify({ iat: now, exp: now + 60, ...claims }));
  return `${body}.${b64(createHmac('sha256', SECRET).update(body).digest())}`;
}

let ctx: TestCtx;
let old = { secret: '', require: '', aud: '' };

/** Tra theo email TRONG đơn vị của phép thử (CSDL test dùng lại giữa các lần chạy, đơn vị cũ còn nguyên hàng của lần trước). */
async function userBy(email: string) {
  return db
    .selectFrom('users')
    .innerJoin('tenants', 'tenants.id', 'users.tenant_id')
    .select(['users.id as id', 'users.email as email', 'users.external_sub as external_sub', 'users.is_active as is_active'])
    .where('tenants.code', '=', ctx.tenantCode)
    .where('users.email', '=', email)
    .executeTakeFirst();
}

beforeAll(async () => {
  ctx = await setupTenant();
  old = { secret: e.WP_SSO_SECRET, require: e.WP_SSO_REQUIRE_SUB, aud: e.WP_SSO_AUD };
  e.WP_SSO_SECRET = SECRET;
  e.WP_SSO_REQUIRE_SUB = '0';
  e.WP_SSO_AUD = 'open-ketoan';
});
afterAll(async () => {
  e.WP_SSO_SECRET = old.secret;
  e.WP_SSO_REQUIRE_SUB = old.require;
  e.WP_SSO_AUD = old.aud;
  await ctx.app.close();
});

describe('khớp người dùng theo sub trước, email sau', () => {
  it('vé có sub tạo người dùng mang external_sub; đăng nhập lại cùng sub khác email vào đúng người đó', async () => {
    const r1 = await loginWithWpTicket(ticket({ sub: 'wp:1203', email: 'nva-sub@example.test', name: 'A', tenant: ctx.tenantCode, aud: 'open-ketoan' }));
    expect((await userBy('nva-sub@example.test'))?.external_sub).toBe('wp:1203');

    const r2 = await loginWithWpTicket(ticket({ sub: 'wp:1203', email: 'nva-doi-mail@example.test', name: 'A', tenant: ctx.tenantCode }));
    expect(r2.user.id).toBe(r1.user.id);
    expect(r2.user.email).toBe('nva-doi-mail@example.test'); // phiên trả email trong vé…
    expect((await userBy('nva-sub@example.test'))?.id).toBe(r1.user.id); // …nhưng email cục bộ không đổi
    expect(await userBy('nva-doi-mail@example.test')).toBeUndefined();
  });

  it('người dùng cũ (đã có theo email, chưa có sub) được gắn sub ở lần đăng nhập đầu có sub', async () => {
    const legacy = await loginWithWpTicket(ticket({ email: 'cu-chua-sub@example.test', tenant: ctx.tenantCode }));
    expect((await userBy('cu-chua-sub@example.test'))?.external_sub).toBeNull();

    const linked = await loginWithWpTicket(ticket({ sub: 'wp:2001', email: 'cu-chua-sub@example.test', tenant: ctx.tenantCode }));
    expect(linked.user.id).toBe(legacy.user.id);
    expect((await userBy('cu-chua-sub@example.test'))?.external_sub).toBe('wp:2001');
  });

  it('email đã gắn sub khác ⇒ từ chối, không chiếm tài khoản', async () => {
    await loginWithWpTicket(ticket({ sub: 'wp:3001', email: 'nan-nhan@example.test', tenant: ctx.tenantCode }));
    await expect(loginWithWpTicket(ticket({ sub: 'wp:3999', email: 'nan-nhan@example.test', tenant: ctx.tenantCode }))).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect((await userBy('nan-nhan@example.test'))?.external_sub).toBe('wp:3001');
  });

  it('người dùng bị khoá vẫn bị chặn dù vé hợp lệ', async () => {
    await loginWithWpTicket(ticket({ sub: 'wp:4001', email: 'bi-khoa@example.test', tenant: ctx.tenantCode }));
    await db.updateTable('users').set({ is_active: false }).where('email', '=', 'bi-khoa@example.test').execute();
    await expect(loginWithWpTicket(ticket({ sub: 'wp:4001', email: 'bi-khoa@example.test', tenant: ctx.tenantCode }))).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('aud và khuôn sub', () => {
  it('aud đúng vào được; aud sai bị từ chối; không có aud vào được (giai đoạn chuyển)', async () => {
    await expect(loginWithWpTicket(ticket({ sub: 'wp:5001', email: 'aud-dung@example.test', tenant: ctx.tenantCode, aud: 'open-ketoan' }))).resolves.toBeTruthy();
    await expect(loginWithWpTicket(ticket({ sub: 'wp:5002', email: 'aud-sai@example.test', tenant: ctx.tenantCode, aud: 'open-cake' }))).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(await userBy('aud-sai@example.test')).toBeUndefined();
    await expect(loginWithWpTicket(ticket({ sub: 'wp:5003', email: 'khong-aud@example.test', tenant: ctx.tenantCode }))).resolves.toBeTruthy();
  });

  it('WP_SSO_AUD đổi được: aud khớp giá trị mới', async () => {
    e.WP_SSO_AUD = 'ketoan-chi-nhanh-2';
    try {
      await expect(loginWithWpTicket(ticket({ sub: 'wp:5101', email: 'aud-moi@example.test', tenant: ctx.tenantCode, aud: 'ketoan-chi-nhanh-2' }))).resolves.toBeTruthy();
      await expect(loginWithWpTicket(ticket({ sub: 'wp:5102', email: 'aud-cu@example.test', tenant: ctx.tenantCode, aud: 'open-ketoan' }))).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    } finally {
      e.WP_SSO_AUD = 'open-ketoan';
    }
  });

  it('sub sai khuôn bị từ chối (và không tạo người dùng)', async () => {
    for (const bad of ['1203', 'wp:', 'wp:abc', 'user:1', 'biz:']) {
      await expect(loginWithWpTicket(ticket({ sub: bad, email: `sub-sai-${bad.replace(/\W/g, '')}@example.test`, tenant: ctx.tenantCode }))).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    }
    expect(await userBy('sub-sai-1203@example.test')).toBeUndefined();
  });
});

describe('WP_SSO_REQUIRE_SUB', () => {
  it('mặc định 0: vé cũ không sub vẫn vào; bật 1: vé thiếu sub bị từ chối, vé có sub vẫn vào', async () => {
    await expect(loginWithWpTicket(ticket({ email: 've-cu@example.test', tenant: ctx.tenantCode }))).resolves.toBeTruthy();
    e.WP_SSO_REQUIRE_SUB = '1';
    try {
      await expect(loginWithWpTicket(ticket({ email: 've-cu-2@example.test', tenant: ctx.tenantCode }))).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
      await expect(loginWithWpTicket(ticket({ sub: 'wp:6001', email: 've-moi@example.test', tenant: ctx.tenantCode }))).resolves.toBeTruthy();
    } finally {
      e.WP_SSO_REQUIRE_SUB = '0';
    }
  });
});

describe('ràng buộc CSDL (migration 0183)', () => {
  it('hai người dùng cùng một đơn vị không cùng sub; sub sai khuôn bị CSDL chặn', async () => {
    await loginWithWpTicket(ticket({ sub: 'wp:7001', email: 'duy-nhat-1@example.test', tenant: ctx.tenantCode }));
    const u2 = await loginWithWpTicket(ticket({ email: 'duy-nhat-2@example.test', tenant: ctx.tenantCode }));
    await expect(db.updateTable('users').set({ external_sub: 'wp:7001' }).where('id', '=', u2.user.id).execute()).rejects.toThrow();
    await expect(db.updateTable('users').set({ external_sub: 'khong-hop-le' }).where('id', '=', u2.user.id).execute()).rejects.toThrow();
  });
});
