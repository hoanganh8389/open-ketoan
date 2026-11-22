// [2026-11-23 10:00 AM Johnny Chu - Chu Hoàng Anh] OKT-SET-1 — ADR-0037: khoá cài đặt open-pos — một khoá cho cả mạng, mỗi blog một tenant, nối bằng mã nối một lần
/**
 * ADR-0037 §Hệ quả: khoá cài đặt + blog đã nối chỉ ghi vào tenant đó; blog chờ → 403 BLOG_NOT_LINKED; mã nối sai / đã dùng → từ chối;
 * một tenant không nối hai blog; không mang blog chỉ gọi route của bản cài; thu hồi khoá → 401 ngay.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '../src/db/client.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let A: TestCtx; // tenant chủ: người tạo khoá cài đặt
let B: TestCtx; // tenant của cửa hàng thứ hai (sổ riêng, cùng máy kế toán)
let key = '';
let code = '';
const codes = new Map<number, string>();

const bridge = (method: 'GET' | 'POST', url: string, payload?: unknown, blog?: number, extra: Record<string, string> = {}) =>
  A.app.inject({ method, url, payload: payload as never, headers: { 'x-api-key': key, ...(blog ? { 'x-okt-blog': String(blog) } : {}), ...extra } });

beforeAll(async () => {
  A = await setupTenant();
  B = await setupTenant();
});
afterAll(async () => {
  await A?.app.close();
  await B?.app.close();
  await closeDb();
});

describe('Khoá cài đặt open-pos (ADR-0037)', () => {
  it('người của tenant chủ tạo khoá; khoá chỉ hiện một lần, khoá API thường không tạo được', async () => {
    const res = await call(A, 'POST', '/api/v1/pos-installations', { name: 'Chuỗi cửa hàng thử', siteUrl: 'https://shop.okt.local' });
    expect(res.status).toBe(201);
    key = res.body.data.key;
    code = res.body.data.code;
    expect(key.startsWith('okti_')).toBe(true);
    expect(code).toMatch(/^inst_[0-9A-Z]{26}$/);
    const list = await call(A, 'GET', '/api/v1/pos-installations');
    expect(JSON.stringify(list.body)).not.toContain(key);
    const viaKey = await A.app.inject({ method: 'POST', url: '/api/v1/pos-installations', payload: { name: 'x' }, headers: { 'x-api-key': A.apiKey, 'idempotency-key': 'k-1' } });
    expect(viaKey.statusCode).toBe(403);
  });

  it('bridge đăng ký blog → chờ + mã nối; blog chờ / blog lạ bị từ chối có lý do', async () => {
    const res = await bridge('POST', '/api/v1/pos-installation/blogs', { blogs: [{ blogId: 2, name: 'Shop A', url: 'https://shop-a.okt.local' }, { blogId: 3, name: 'Shop B' }, { blogId: 4, name: 'Shop C' }] });
    expect(res.statusCode).toBe(200);
    const blogs = res.json().data.blogs as { blogId: number; status: string; linkCode?: string }[];
    expect(blogs.map((b) => b.status)).toEqual(['pending', 'pending', 'pending']);
    for (const b of blogs) { expect(b.linkCode).toMatch(/^[0-9A-Z]{8}$/); codes.set(b.blogId, b.linkCode!); }
    // Gửi lại: mã còn hạn không sinh lại (không lộ lại mã)
    const again = await bridge('POST', '/api/v1/pos-installation/blogs', { blogs: [{ blogId: 2 }] });
    expect(again.json().data.blogs.find((b: { blogId: number }) => b.blogId === 2).linkCode).toBeUndefined();

    const pending = await bridge('POST', '/api/v1/documents', saleDoc({ docKey: 'pos:CN01:HDP1', docNo: 'HDP1' }), 2);
    expect(pending.statusCode).toBe(403);
    expect(pending.json().error.details.reason).toBe('BLOG_NOT_LINKED');
    const unknown = await bridge('GET', '/api/v1/accounts', undefined, 9);
    expect(unknown.statusCode).toBe(403);
    expect(unknown.json().error.details.reason).toBe('BLOG_UNKNOWN');
    const bad = await bridge('GET', '/api/v1/accounts', undefined, undefined, { 'x-okt-blog': 'abc' });
    expect(bad.statusCode).toBe(400);
  });

  it('không mang X-OKT-Blog: chỉ route của bản cài', async () => {
    const res = await bridge('GET', '/api/v1/accounts');
    expect(res.statusCode).toBe(403);
    expect(res.json().error.details.reason).toBe('BLOG_REQUIRED');
    const doc = await bridge('POST', '/api/v1/documents', saleDoc({ docKey: 'pos:CN01:HDN1', docNo: 'HDN1' }));
    expect(doc.statusCode).toBe(403);
    expect((await bridge('GET', '/api/v1/pos-installation/blogs')).statusCode).toBe(200);
  });

  it('kế toán đứng ở tenant đích nhập mã nối → blog nối vào ĐÚNG tenant đó; mã đã dùng / sai bị từ chối', async () => {
    const linkB = await call(B, 'POST', '/api/v1/pos-installations/link', { linkCode: codes.get(3)!.toLowerCase().replace(/(.{4})/, '$1-') });
    expect(linkB.status).toBe(200);
    expect(linkB.body.data.blogId).toBe(3);
    const linkA = await call(A, 'POST', '/api/v1/pos-installations/link', { linkCode: codes.get(2)! });
    expect(linkA.status).toBe(200);

    const reused = await call(A, 'POST', '/api/v1/pos-installations/link', { linkCode: codes.get(3)! });
    expect(reused.status).toBe(400);
    expect(reused.body.error.details.reason).toBe('POS_LINK_CODE_INVALID');
    expect((await call(B, 'POST', '/api/v1/pos-installations/link', { linkCode: 'ZZZZZZZZ' })).status).toBe(400);
    // Một tenant một blog: B đã nối blog 3, không nhận thêm blog 4
    const twice = await call(B, 'POST', '/api/v1/pos-installations/link', { linkCode: codes.get(4)! });
    expect(twice.status).toBe(409);
    expect(twice.body.error.details.reason).toBe('TENANT_ALREADY_LINKED');
    // Khoá API thường / khoá cài đặt không nối được
    const viaKey = await bridge('POST', '/api/v1/pos-installations/link', { linkCode: codes.get(4)! }, 3, { 'idempotency-key': 'k-2' });
    expect(viaKey.statusCode).toBe(403);
  });

  it('khoá cài đặt + blog đã nối ghi vào tenant của blog, không lọt sang tenant chủ', async () => {
    const res = await bridge('POST', '/api/v1/documents', saleDoc({ docKey: 'pos:CN01:HDB3', docNo: 'HDB3' }), 3, { 'x-okt-install': code });
    expect([200, 201]).toContain(res.statusCode);
    const inB = await call(B, 'GET', '/api/v1/documents?docType=sale&pageSize=50');
    const inA = await call(A, 'GET', '/api/v1/documents?docType=sale&pageSize=50');
    expect(JSON.stringify(inB.body)).toContain('HDB3');
    expect(JSON.stringify(inA.body)).not.toContain('HDB3');
    // X-OKT-Install sai mã → 401
    expect((await bridge('GET', '/api/v1/accounts', undefined, 3, { 'x-okt-install': 'inst_00000000000000000000000000' })).statusCode).toBe(401);
    // Khoá cài đặt + blog không có quyền cài đặt của tenant đó
    expect((await bridge('POST', '/api/v1/pos-installations', { name: 'x' }, 3, { 'idempotency-key': 'k-3' })).statusCode).toBe(403);
  });

  it('ping: bản cài thấy từng blog; tenant chủ thấy bản cài; tenant đích thấy cửa hàng đã nối; khoá thường ping riêng', async () => {
    const ping = await bridge('POST', '/api/v1/pos-installation/ping', { blogs: [{ blogId: 2, bridgeVersion: '1.9.0', queueGroups: 0, pendingDocs: 1, latencyMs: 42 }, { blogId: 3, latencyMs: 55 }, { blogId: 77 }] });
    expect(ping.statusCode).toBe(200);
    expect(ping.json().data.accepted).toBe(2);
    expect(ping.json().data.unknown).toEqual([77]);
    const b2 = ping.json().data.blogs.find((b: { blogId: number }) => b.blogId === 2);
    expect(b2).toMatchObject({ status: 'active', tenantCode: A.tenantCode, lastPingMs: 42, bridgeVersion: '1.9.0', stale: false });

    const ownerView = await call(A, 'GET', '/api/v1/pos-installations');
    expect(ownerView.body.data.installations[0].blogs.map((b: { blogId: number; status: string }) => `${b.blogId}:${b.status}`)).toEqual(['2:active', '3:active', '4:pending']);
    const targetView = await call(B, 'GET', '/api/v1/pos-installations');
    expect(targetView.body.data.installations).toEqual([]);
    expect(targetView.body.data.linkedHere).toHaveLength(1);
    expect(targetView.body.data.linkedHere[0]).toMatchObject({ installationCode: code, blogId: 3, lastPingMs: 55 });

    const direct = await B.app.inject({ method: 'POST', url: '/api/v1/connection/ping', payload: { blogId: 5, name: 'Shop riêng', bridgeVersion: '1.9.0', latencyMs: 30 }, headers: { 'x-api-key': B.apiKey } });
    expect(direct.statusCode).toBe(200);
    expect(direct.json().data.tenantCode).toBe(B.tenantCode);
    const after = await call(B, 'GET', '/api/v1/pos-installations');
    expect(after.body.data.directKeys).toEqual([expect.objectContaining({ blogId: 5, name: 'Shop riêng', lastPingMs: 30, stale: false })]);
    // khoá cài đặt không dùng ping của khoá thường
    expect((await bridge('POST', '/api/v1/connection/ping', { blogId: 3 }, 3)).statusCode).toBe(403);
  });

  it('thu hồi khoá → mọi yêu cầu sau đó 401', async () => {
    const res = await call(A, 'POST', `/api/v1/pos-installations/${code}/revoke`, {});
    expect(res.status).toBe(200);
    expect((await bridge('GET', '/api/v1/pos-installation/blogs')).statusCode).toBe(401);
    expect((await bridge('GET', '/api/v1/accounts', undefined, 3)).statusCode).toBe(401);
    // tenant khác không thu hồi được khoá không phải của mình
    expect((await call(B, 'POST', `/api/v1/pos-installations/${code}/revoke`, {})).status).toBe(404);
  });
});
