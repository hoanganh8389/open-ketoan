/**
 * NT-BH-048 — THUE03 Hoá đơn điện tử khai ở kế toán (module hoa-don-dien-tu, chốt 26/11/2026). Ca 1–14 của phiếu §5.
 * Dữ liệu: chi nhánh CH01, 08004. Địa chỉ API là địa chỉ thử (`https://vinvoice.test/…`) — mọi lời gọi ra ngoài đi qua fetch giả,
 * không chạm Viettel thật, không phát hành hoá đơn. Mật khẩu là chuỗi ngẫu nhiên dò được trong CSDL / nhật ký / phản hồi.
 */
// [2026-11-26 09:30 PM Võ Hoàng] NGHIEM-THU — test tích hợp phiếu NT-BH-048 (đóng góp)
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { registerAppManifests, type AppManifest } from '@bizcity/platform/core/apps';
import { useSecretsMasterKey } from '@bizcity/platform/core/secrets';
import { runModuleMigrations } from '@bizcity/platform/db/module-db';
import { buildApp } from '../src/app.js';
import { syncBundled } from '../src/core/module-lifecycle.js';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

const DIR = fileURLToPath(new URL('../../../modules/hoa-don-dien-tu/', import.meta.url));
const HAS = existsSync(path.join(DIR, 'bizcity.module.json'));
const M = '/api/v1/m/hoa-don-dien-tu';
const URL_THU = 'https://vinvoice.test/services/einvoiceapplication/api';
const MK = `Mk-Viettel-${randomBytes(6).toString('hex')}`;
const MK_PORTAL = `Mk-Portal-${randomBytes(6).toString('hex')}`;
const APP_KEY = 'nt048-viettel';
const MASTER = randomBytes(32).toString('base64');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = { status: number; body: any; raw: string };

const SO = {
  trangThai: 'dang-dung', mst: '0100109106', tenPhapLy: 'Công ty thử NT-BH-048', diaChi: 'Phú Thọ', dienThoai: '0210000000', apiBaseUrl: URL_THU,
  authMode: 'basic', username: 'nt048-user', sslVerify: true, templateCode: '1/001', invoiceSeries: 'C25TAA', paymentMethod: 'TM/CK', autoEnabled: false, autoMode: 'draft',
};

describe.skipIf(!HAS)('NT-BH-048 — THUE03 Hoá đơn điện tử khai ở kế toán', () => {
  let ctx: TestCtx;
  let app: FastifyInstance;
  let tenantId = '';
  let k = 0;
  let apiKey = '';
  const tok: Record<string, string> = {};
  const req = async (who: string | null, method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown, headers?: Record<string, string>): Promise<R> => {
    const r = await app.inject({
      method, url, ...(payload ? { payload: payload as never } : {}),
      headers: headers ?? { authorization: `Bearer ${who ? tok[who] : ctx.token}`, ...(method === 'GET' ? {} : { 'idempotency-key': `nt-bh-048-${++k}-${Date.now()}` }) },
    });
    let body: unknown = r.body;
    try { body = r.json(); } catch { /* nuot-loi: thân không phải JSON (lỗi khung) — giữ chuỗi để in */ }
    return { status: r.statusCode, body, raw: r.body };
  };
  const ok = (r: R) => { expect(r.status, r.raw.slice(0, 600)).toBeLessThan(300); return r.body.data; };
  const fields = (r: R) => ((r.body?.error?.fields ?? []) as { path: string }[]).map((f) => f.path);
  const caiDat = async () => ok(await req(null, 'GET', `${M}/cai-dat`));
  const asOwner = <T>(fn: (trx: typeof db) => Promise<T>) => db.transaction().execute(async (trx) => {
    await sql`SET LOCAL ROLE NONE`.execute(trx);
    return fn(trx as unknown as typeof db);
  });
  /** Toàn bộ dữ liệu của module + nhật ký Core của đơn vị — dò bản rõ mật khẩu. */
  const dump = () => asOwner(async (trx) => {
    const t = async (q: ReturnType<typeof sql<{ t: string }>>) => (await q.execute(trx)).rows.map((r) => r.t).join('\n');
    return [
      await t(sql<{ t: string }>`SELECT s::text AS t FROM mod_hoa_don_dien_tu.so s WHERE tenant_id = ${tenantId}`),
      await t(sql<{ t: string }>`SELECT c::text AS t FROM mod_hoa_don_dien_tu.chi_nhanh c WHERE tenant_id = ${tenantId}`),
      await t(sql<{ t: string }>`SELECT n::text AS t FROM mod_hoa_don_dien_tu.nhat_ky n WHERE tenant_id = ${tenantId}`),
      await t(sql<{ t: string }>`SELECT a::text AS t FROM audit_logs a WHERE tenant_id = ${tenantId}`),
      await t(sql<{ t: string }>`SELECT s::text AS t FROM tenant_secrets s WHERE tenant_id = ${tenantId}`),
    ].join('\n');
  });

  beforeAll(async () => {
    useSecretsMasterKey(MASTER);
    ctx = await setupTenant();
    tenantId = String((await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id);
    await runModuleMigrations('hoa-don-dien-tu', path.join(DIR, 'migrations'), { reads: ['bizcity_read.branches'] });
    registerAppManifests([{ contract: 'bizcity_module@1', id: `acme.${APP_KEY}`, key: APP_KEY, kind: 'app', version: '0.1.0', label: 'Plugin Viettel thử',
      description: 'App thử đọc bí mật hoá đơn điện tử (NT-BH-048)', app: { scopes: ['secrets:read:hoa-don-dien-tu'] } } as AppManifest]);
    await asOwner((trx) => syncBundled('test:nt-bh-048', trx as never));
    app = await buildApp();
    for (const b of [{ code: 'CH01', name: 'Cửa hàng 01' }, { code: '08004', name: 'Shop Lâm Thao' }]) expect((await call(ctx, 'POST', '/api/v1/branches', b)).status).toBe(201);
    const ktEmail = 'ketoan@nt048.local';
    ok(await req(null, 'POST', '/api/v1/users', { email: ktEmail, fullName: 'Kế toán 048', role: 'accountant', password: 'Nt048@12345' }));
    tok.kt = (await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email: ktEmail, password: 'Nt048@12345' } })).json().data.token;
    const ins = await req(null, 'POST', `/api/v1/apps/${APP_KEY}/install`);
    apiKey = ok(ins).apiKey;
  });
  afterEach(() => { vi.unstubAllGlobals(); });
  afterAll(async () => {
    useSecretsMasterKey(undefined);
    await app?.close();
    await ctx?.app.close();
  });

  it('ca 1: lần đầu — chưa khai, bảng chi nhánh đủ chi nhánh đang dùng, mẫu số "theo sổ"', async () => {
    const d = await caiDat();
    expect(d.so).toMatchObject({ configured: false, version: 0, authMode: 'basic', sslVerify: true, autoEnabled: false });
    expect(d.canEdit).toBe(true);
    expect(d.secrets.password).toEqual({ set: false, updatedAt: null, updatedBy: null });
    const codes = d.chiNhanh.map((c: { branchCode: string }) => c.branchCode);
    expect(codes).toEqual(expect.arrayContaining(['CH01', '08004']));
    expect(d.chiNhanh.find((c: { branchCode: string }) => c.branchCode === '08004')).toMatchObject({ configured: false, templateFrom: 'so', seriesFrom: 'so' });
  });

  it('ca 6 / 7: MST sai, API không https — chặn tại ô, báo hết một lần', async () => {
    const r = await req(null, 'PUT', `${M}/cai-dat/so`, { ...SO, version: 0, mst: '12345', apiBaseUrl: 'http://vinvoice.test/api', password: MK });
    expect(r.status).toBe(400);
    expect(fields(r)).toEqual(expect.arrayContaining(['mst', 'apiBaseUrl']));
    expect((await caiDat()).so.configured).toBe(false);
  });

  it('ca 2: lưu sổ — mật khẩu chỉ "đã đặt", không có giá trị ở phản hồi / bảng module', async () => {
    const r = ok(await req(null, 'PUT', `${M}/cai-dat/so`, { ...SO, version: 0, password: MK }));
    expect(r.version).toBe(1);
    expect(r.biMat).toEqual(['đặt mật khẩu Viettel']);
    const raw = (await req(null, 'GET', `${M}/cai-dat`)).raw;
    expect(raw).not.toContain(MK);
    const d = JSON.parse(raw).data;
    expect(d.so).toMatchObject({ configured: true, mst: '0100109106', trangThai: 'dang-dung', version: 1 });
    expect(d.secrets.password.set).toBe(true);
    expect(d.secrets.password.updatedAt).toBeTruthy();
    const cols = (await asOwner((trx) => sql<{ c: string }>`SELECT column_name AS c FROM information_schema.columns WHERE table_schema = 'mod_hoa_don_dien_tu'`.execute(trx))).rows.map((x) => x.c);
    expect(cols.filter((c) => /pass|token|mat_khau/i.test(c))).toEqual([]);
  });

  it('ca 3: lưu lại, ô mật khẩu trống → giữ nguyên', async () => {
    const before = (await caiDat()).secrets.password.updatedAt;
    const r = ok(await req(null, 'PUT', `${M}/cai-dat/so`, { ...SO, version: 1, dienThoai: '0210111111' }));
    expect(r.biMat).toEqual([]);
    expect(r.oDaDoi).toEqual(['dienThoai']);
    const d = await caiDat();
    expect(d.secrets.password).toMatchObject({ set: true, updatedAt: before });
  });

  it('ca 9: gửi phiên bản cũ → CONFLICT, không ghi đè', async () => {
    const r = await req(null, 'PUT', `${M}/cai-dat/so`, { ...SO, version: 1, tenPhapLy: 'Ghi đè' });
    expect(r.status).toBe(409);
    expect((await caiDat()).so.tenPhapLy).toBe(SO.tenPhapLy);
  });

  it('ca 8: kế toán (chỉ quyền xem) — xem được, canEdit false, lưu / thử kết nối bị 403', async () => {
    const d = ok(await req('kt', 'GET', `${M}/cai-dat`));
    expect(d.canEdit).toBe(false);
    expect((await req('kt', 'PUT', `${M}/cai-dat/so`, { ...SO, version: 2 })).status).toBe(403);
    expect((await req('kt', 'PUT', `${M}/cai-dat/chi-nhanh/08004`, { branchCode: '08004', version: 0 })).status).toBe(403);
    expect((await req('kt', 'POST', `${M}/ket-noi/thu`, {})).status).toBe(403);
  });

  it('ca 5: chi nhánh 08004 riêng mẫu số / ký hiệu + portal; chi nhánh khác theo sổ; export không có bí mật', async () => {
    const thieu = await req(null, 'PUT', `${M}/cai-dat/chi-nhanh/08004`, { branchCode: '08004', version: 0, portalEnabled: true });
    expect(thieu.status).toBe(400);
    expect(fields(thieu)).toEqual(expect.arrayContaining(['portalAccount', 'portalPassword']));
    ok(await req(null, 'PUT', `${M}/cai-dat/chi-nhanh/08004`, {
      branchCode: '08004', version: 0, templateCode: '1/002', invoiceSeries: 'C25TLT', portalEnabled: true, portalAccount: '0100109106-001_QT', portalSupplierId: '102668', portalPassword: MK_PORTAL,
    }));
    const d = await caiDat();
    const cn = d.chiNhanh.find((c: { branchCode: string }) => c.branchCode === '08004');
    expect(cn).toMatchObject({ configured: true, effectiveTemplate: '1/002', effectiveSeries: 'C25TLT', templateFrom: 'chi-nhanh', portalPassword: { set: true } });
    const ex = await req(null, 'GET', `${M}/cai-dat/export`);
    expect(ex.raw).not.toContain(MK);
    expect(ex.raw).not.toContain(MK_PORTAL);
    const rows = ok(ex).chiNhanh as { branchCode: string; templateCode: string; invoiceSeries: string; mst: string; portalEnabled: boolean }[];
    expect(rows.find((x) => x.branchCode === '08004')).toMatchObject({ templateCode: '1/002', invoiceSeries: 'C25TLT', mst: '0100109106', portalEnabled: true });
    expect(rows.find((x) => x.branchCode === 'CH01')).toMatchObject({ templateCode: '1/001', invoiceSeries: 'C25TAA', portalEnabled: false });
    expect(ok(ex).secretNames).toEqual({ matKhauViettel: 'hoa-don-dien-tu.viettel.password', maTruyCapViettel: 'hoa-don-dien-tu.viettel.token', matKhauPortal: 'hoa-don-dien-tu.portal.password' });
    expect(ok(await req(null, 'GET', `${M}/cai-dat/export`, undefined)).configVersion).toMatch(/^\d+\.\d+$/);
  });

  it('ca 10: thử kết nối — chỉ một GET tới API base URL, Basic đúng tài khoản; 200 / 401 / lỗi mạng báo đúng câu, ghi nhật ký', async () => {
    const calls: { url: string; method: string; auth: string | null }[] = [];
    const fake = (status: number | Error) => vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), method: String(init.method), auth: new Headers(init.headers).get('authorization') });
      if (status instanceof Error) throw status;
      return new Response(null, { status });
    });
    vi.stubGlobal('fetch', fake(200));
    const a = ok(await req(null, 'POST', `${M}/ket-noi/thu`, {}));
    expect(a).toMatchObject({ ok: true, httpCode: 200 });
    expect(calls).toEqual([{ url: URL_THU, method: 'GET', auth: `Basic ${Buffer.from(`nt048-user:${MK}`).toString('base64')}` }]);
    vi.stubGlobal('fetch', fake(401));
    const b = ok(await req(null, 'POST', `${M}/ket-noi/thu`, {}));
    expect(b).toMatchObject({ ok: false, httpCode: 401 });
    expect(b.message).toContain('từ chối tài khoản');
    vi.stubGlobal('fetch', fake(new Error('getaddrinfo ENOTFOUND vinvoice.test')));
    const c = ok(await req(null, 'POST', `${M}/ket-noi/thu`, {}));
    expect(c).toMatchObject({ ok: false, httpCode: null });
    expect(c.message).toContain('Không kết nối được');
    expect(calls.every((x) => x.url === URL_THU && x.method === 'GET')).toBe(true);
    const nk = ok(await req(null, 'GET', `${M}/nhat-ky`)).items.filter((x: { hanhDong: string }) => x.hanhDong === 'thu-ket-noi');
    expect(nk.map((x: { chiTiet: { httpCode: number | null } }) => x.chiTiet.httpCode)).toEqual([null, 401, 200]);
  });

  it('ca 11: phiên người dùng (chủ đơn vị) đọc bí mật → 403', async () => {
    const r = await req(null, 'GET', `${M}/secrets/read?name=hoa-don-dien-tu.viettel.password`);
    expect(r.status).toBe(403);
    expect(r.raw).not.toContain(MK);
  });

  it('ca 12: khoá app có secrets:read:hoa-don-dien-tu đọc đúng giá trị (sổ + chi nhánh), mỗi lần một dòng nhật ký không giá trị', async () => {
    const h = { 'x-api-key': apiKey };
    const a = await req(null, 'GET', `${M}/secrets/read?name=hoa-don-dien-tu.viettel.password`, undefined, h);
    expect(a.status, a.raw).toBe(200);
    expect(a.body.data).toMatchObject({ name: 'hoa-don-dien-tu.viettel.password', scope: 'tenant', value: MK });
    const b = await req(null, 'GET', `${M}/secrets/read?name=hoa-don-dien-tu.portal.password&branchCode=08004`, undefined, h);
    expect(b.body.data).toMatchObject({ scope: 'branch', scopeId: '08004', value: MK_PORTAL });
    const logs = (await asOwner((trx) => sql<{ t: string }>`SELECT a::text AS t FROM audit_logs a WHERE tenant_id = ${tenantId} AND action = 'secrets.read'`.execute(trx))).rows;
    expect(logs).toHaveLength(2);
    expect(logs.map((x) => x.t).join(' ')).not.toContain(MK);
  });

  it('ca 4: gõ "-" → xoá mật khẩu; đang dùng + Basic mà không còn mật khẩu thì chặn, chuyển Nháp thì lưu được', async () => {
    const v = (await caiDat()).so.version;
    const r = await req(null, 'PUT', `${M}/cai-dat/so`, { ...SO, version: v, password: '-' });
    expect(r.status).toBe(400);
    expect(fields(r)).toEqual(['password']);
    const ok2 = ok(await req(null, 'PUT', `${M}/cai-dat/so`, { ...SO, version: v, trangThai: 'nhap', password: '-' }));
    expect(ok2.biMat).toEqual(['xoá mật khẩu Viettel']);
    expect((await caiDat()).secrets.password.set).toBe(false);
  });

  it('ca 13: chưa khai khoá gốc — đặt mật khẩu báo NOT_READY, ô thường vẫn lưu được', async () => {
    useSecretsMasterKey(null);
    try {
      const v = (await caiDat()).so.version;
      const r = await req(null, 'PUT', `${M}/cai-dat/so`, { ...SO, version: v, trangThai: 'nhap', password: MK });
      expect(r.status).toBe(503);
      expect(r.body.error.details.reason).toBe('SECRETS_KEY_MISSING');
      expect((await caiDat()).so.version).toBe(v); // cả lần lưu huỷ cùng giao dịch
      ok(await req(null, 'PUT', `${M}/cai-dat/so`, { ...SO, version: v, trangThai: 'nhap', diaChi: 'Việt Trì, Phú Thọ' }));
    } finally {
      useSecretsMasterKey(MASTER);
    }
  });

  it('ca 14: nhật ký có đủ dòng (sổ, chi nhánh, thử kết nối) và không nơi nào giữ bản rõ mật khẩu', async () => {
    const items = ok(await req(null, 'GET', `${M}/nhat-ky`)).items as { doiTuong: string; hanhDong: string; chiTiet: { biMat?: string[] } }[];
    expect(items.some((x) => x.doiTuong === 'so' && (x.chiTiet.biMat ?? []).includes('đặt mật khẩu Viettel'))).toBe(true);
    expect(items.some((x) => x.doiTuong === 'so' && (x.chiTiet.biMat ?? []).includes('xoá mật khẩu Viettel'))).toBe(true);
    expect(items.some((x) => x.doiTuong === 'chi-nhanh:08004' && (x.chiTiet.biMat ?? []).includes('đặt mật khẩu portal'))).toBe(true);
    expect(items.some((x) => x.doiTuong === 'ket-noi')).toBe(true);
    const all = await dump();
    expect(all).not.toContain(MK);
    expect(all).not.toContain(MK_PORTAL);
  });
});
