// [2026-11-22 12:47 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B2b (D039-5, R-SITE-4): ca kiểm claim sid trong vé đăng nhập và vé ứng dụng (T039-3)
/**
 * Vé gắn site — PHASE-039 B2b.
 *   - Vé cấp ở site A dùng ở site A được, ở site B bị từ chối (T039-3), ngoài ngữ cảnh site ở chế độ multi bị từ chối.
 *   - Vé cũ (không có sid) vẫn dùng được ở chế độ single, bị từ chối ở chế độ multi.
 *   - Chế độ single: vé mang sid = site ngầm định.
 * Không cần database: chỉ ký / kiểm vé trong ngữ cảnh site (withSite).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { SignJWT, decodeJwt } from 'jose';
import { env } from '../src/config/env.js';
import { signSession, verifySession } from '@bizcity/platform/core/security/tokens';
import { signAppTicket, verifyAppTicket } from '@bizcity/platform/core/apps';
import { DEFAULT_SITE_ID, setSiteModeForTest, withSite } from '@bizcity/platform/db/site';

const claims = { sub: 'u1', tid: 't1', role: 'owner', name: 'Chủ' };
const app = { tenantId: 't1', app: 'acme.pos', userId: 'u1', name: 'Chủ', role: 'owner' };
const oldToken = () =>
  new SignJWT({ tid: 't1', role: 'owner', name: 'Chủ', sv: 0 })
    .setProtectedHeader({ alg: 'HS256' }).setSubject('u1').setIssuedAt().setExpirationTime('1h')
    .sign(new TextEncoder().encode(env.JWT_SECRET));

afterEach(() => {
  setSiteModeForTest('single');
});

describe('PHASE-039 B2b — vé đăng nhập gắn site', () => {
  it('chế độ single: vé mang sid của site ngầm định và kiểm được như trước', async () => {
    const t = await signSession(claims);
    expect(decodeJwt(t).sid).toBe(DEFAULT_SITE_ID);
    expect(await verifySession(t)).toMatchObject({ sub: 'u1', tid: 't1' });
  });

  it('chế độ single: vé cũ không có sid vẫn dùng được', async () => {
    expect(await verifySession(await oldToken())).toMatchObject({ sub: 'u1' });
  });

  it('chế độ multi: vé của site A dùng ở site A được, ở site B bị từ chối (T039-3)', async () => {
    setSiteModeForTest('multi');
    const t = await withSite('S_A', () => signSession(claims));
    expect(decodeJwt(t).sid).toBe('S_A');
    expect(await withSite('S_A', () => verifySession(t))).toMatchObject({ sub: 'u1' });
    expect(await withSite('S_B', () => verifySession(t))).toBeNull();
  });

  it('chế độ multi: ngoài ngữ cảnh site không kiểm được vé; không cấp được vé', async () => {
    setSiteModeForTest('multi');
    const t = await withSite('S_A', () => signSession(claims));
    expect(await verifySession(t)).toBeNull();
    await expect(signSession(claims)).rejects.toMatchObject({ code: 'SITE_CONTEXT_MISSING' });
  });

  it('chế độ multi: vé cũ không có sid bị từ chối', async () => {
    setSiteModeForTest('multi');
    const t = await oldToken();
    expect(await withSite('S_A', () => verifySession(t))).toBeNull();
  });

  it('chế độ multi: sid sai kiểu bị từ chối', async () => {
    setSiteModeForTest('multi');
    const forged = await new SignJWT({ tid: 't1', sid: 123, role: 'owner' })
      .setProtectedHeader({ alg: 'HS256' }).setSubject('u1').setExpirationTime('1h')
      .sign(new TextEncoder().encode(env.JWT_SECRET));
    expect(await withSite('S_A', () => verifySession(forged))).toBeNull();
  });
});

describe('PHASE-039 B2b — vé ứng dụng gắn site', () => {
  it('single: kiểm được như trước', async () => {
    const { ticket } = await signAppTicket(app);
    expect(await verifyAppTicket(ticket)).toMatchObject({ app: 'acme.pos', tenantId: 't1' });
  });

  it('multi: vé ứng dụng của site A không dùng được ở site B', async () => {
    setSiteModeForTest('multi');
    const { ticket } = await withSite('S_A', () => signAppTicket(app));
    expect(await withSite('S_A', () => verifyAppTicket(ticket))).toMatchObject({ app: 'acme.pos' });
    expect(await withSite('S_B', () => verifyAppTicket(ticket))).toBeNull();
  });
});
