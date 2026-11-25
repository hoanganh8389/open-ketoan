/**
 * platform.secrets (BIZCITY-SECRETS-v1 §5, migration 0184): bí mật mã hoá phong bì theo đơn vị.
 *   - ghi rồi đọc đúng giá trị; giao diện (phiên người dùng) không bao giờ thấy giá trị;
 *   - đơn vị A không đọc được bí mật của B (RLS, dưới vai trò ketoan_app);
 *   - đổi khoá gốc vẫn đọc được; sai khoá gốc / thiếu khoá → lỗi rõ, không lộ gì;
 *   - module không chạm tên của module khác, không chạm tên chưa khai;
 *   - action đọc cho khoá app: thiếu quyền secrets:read:<module> → 403; có quyền → giá trị + một dòng nhật ký;
 *   - log, nhật ký, bản sao lưu (dòng CSDL) không chứa bản rõ.
 */
import { randomBytes } from 'node:crypto';
import { Writable } from 'node:stream';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { sql } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/client.js';
import { mountActions } from '@bizcity/platform/core/actions';
import type { AuthContext, Permission } from '@bizcity/platform/core/auth';
import { registerErrorHandler } from '@bizcity/platform/core/http';
import { checkEnv, decodeSecretsKey } from '@bizcity/platform/config/env';
import { defineSecretsReadAction, rotateSecretsMasterKey, secretsFor, secretsReadPermission, useSecretsMasterKey, type SecretDecl } from '@bizcity/platform/core/secrets';
import { defineModule } from '@bizcity/module-sdk';
import { auditRows, setupTenant, type TestCtx } from './helpers.js';

const KEY1 = randomBytes(32).toString('base64');
const KEY2 = randomBytes(32).toString('hex');
const KEY_WRONG = randomBytes(32).toString('base64');
const PLAIN = `Mk-Viettel-${randomBytes(6).toString('hex')}`; // giá trị giả, dò được trong log / CSDL
const DECL: SecretDecl[] = [
  { name: 'hoa-don.viettel.password', scope: 'book', label: 'Mật khẩu Viettel' },
  { name: 'hoa-don.portal.password', scope: 'branch', label: 'Mật khẩu portal gửi mail' },
  { name: 'hoa-don.zalo.token', scope: 'tenant', label: 'Token Zalo OA' },
];

let a: TestCtx, b: TestCtx;
let tenantA = '', tenantB = '';
const idOf = (code: string) => db.selectFrom('tenants').select('id').where('code', '=', code).executeTakeFirstOrThrow().then((r) => String(r.id));
const sec = (tenantId: string, module = 'hoa-don', declared: SecretDecl[] | undefined = DECL) => secretsFor(db, { tenantId, module, actor: 'user:test', declared });
const reasonOf = async (p: Promise<unknown>) => p.then(() => 'OK', (e: { details?: { reason?: string }; code?: string; message?: string }) => ({ code: e.code, reason: e.details?.reason, message: String(e.message) }));

// Logger bắt mọi dòng (mức trace) của app gắn action đọc bí mật; console / stdout cũng bị bắt trong lúc chạy.
const logLines: string[] = [];
let readApp: FastifyInstance;
const auths: Record<string, (t: string) => AuthContext> = {
  user: (t) => ({ tenantId: t, actor: 'user:1', actorName: 'Chủ đơn vị', kind: 'user', role: 'owner', permissions: new Set<Permission>([secretsReadPermission('hoa-don')]) }),
  'key-khong-quyen': (t) => ({ tenantId: t, actor: 'apikey:9', actorName: 'Khoá không quyền', kind: 'apikey', role: null, permissions: new Set<Permission>(['documents:read']), app: 'viettel' }),
  key: (t) => ({ tenantId: t, actor: 'apikey:7', actorName: 'Plugin Viettel', kind: 'apikey', role: null, permissions: new Set<Permission>([secretsReadPermission('hoa-don')]), app: 'viettel' }),
  'key-module-khac': (t) => ({ tenantId: t, actor: 'apikey:8', actorName: 'Khoá module khác', kind: 'apikey', role: null, permissions: new Set<Permission>([secretsReadPermission('zalo')]), app: 'zalo' }),
};
const read = (who: string, payload: Record<string, unknown>, tenant = tenantA) =>
  readApp.inject({ method: 'POST', url: '/api/v1/secrets/hoa-don/read', payload, headers: { 'x-test-auth': who, 'x-test-tenant': tenant } });

/** Chạy fn dưới vai trò ketoan_app, kết nối gắn đơn vị `tenant`; giao dịch luôn huỷ (khuôn tenant-isolation.test.ts). */
class RollbackSignal extends Error {}
async function asApp<T>(tenant: string, fn: (trx: typeof db) => Promise<T>): Promise<T> {
  let out!: T;
  await db.transaction().execute(async (trx) => {
    await sql`SET LOCAL ROLE ketoan_app`.execute(trx);
    await sql`SELECT set_config('bizcity.tenant_id', ${tenant}, true)`.execute(trx);
    out = await fn(trx as unknown as typeof db);
    throw new RollbackSignal();
  }).catch((e) => { if (!(e instanceof RollbackSignal)) throw e; });
  return out;
}

beforeAll(async () => {
  a = await setupTenant();
  b = await setupTenant();
  tenantA = await idOf(a.tenantCode);
  tenantB = await idOf(b.tenantCode);
  useSecretsMasterKey(KEY1);
  readApp = Fastify({ logger: { level: 'trace', stream: new Writable({ write(chunk, _enc, cb) { logLines.push(String(chunk)); cb(); } }) } });
  readApp.setValidatorCompiler(validatorCompiler);
  readApp.setSerializerCompiler(serializerCompiler);
  registerErrorHandler(readApp);
  readApp.addHook('onRequest', async (req) => {
    const who = String(req.headers['x-test-auth'] ?? '');
    if (auths[who]) req.auth = auths[who]!(String(req.headers['x-test-tenant']));
  });
  mountActions(readApp, [defineSecretsReadAction('hoa-don')]);
  await readApp.ready();
});
afterEach(() => useSecretsMasterKey(KEY1));
afterAll(async () => {
  useSecretsMasterKey(undefined);
  await readApp.close();
  await a.app.close();
  await b.app.close();
});

describe('platform.secrets', () => {
  it('ghi rồi đọc ra đúng giá trị theo phạm vi; has chỉ cho biết đã đặt lúc nào, bởi ai', async () => {
    const s = sec(tenantA);
    await s.set('hoa-don.viettel.password', PLAIN, { scope: { bookId: 'SO-01' }, note: 'tài khoản thử' });
    await s.set('hoa-don.portal.password', `${PLAIN}-cn01`, { scope: { branchCode: 'CN01' } });
    await s.set('hoa-don.zalo.token', `${PLAIN}-zalo`);
    expect(await s.get('hoa-don.viettel.password', { bookId: 'SO-01' })).toBe(PLAIN);
    expect(await s.get('hoa-don.portal.password', { branchCode: 'CN01' })).toBe(`${PLAIN}-cn01`);
    expect(await s.get('hoa-don.portal.password', { branchCode: 'CN02' })).toBeNull();
    expect(await s.get('hoa-don.zalo.token')).toBe(`${PLAIN}-zalo`);
    const info = await s.has('hoa-don.viettel.password', { bookId: 'SO-01' });
    expect(info).toMatchObject({ set: true, updatedBy: 'user:test' });
    expect(JSON.stringify(info)).not.toContain(PLAIN);
    // Ghi đè: một dòng, giá trị mới
    await s.set('hoa-don.zalo.token', `${PLAIN}-zalo-2`);
    expect(await s.get('hoa-don.zalo.token')).toBe(`${PLAIN}-zalo-2`);
    expect(Number((await sql<{ n: string }>`SELECT count(*) AS n FROM tenant_secrets WHERE tenant_id = ${tenantA} AND name = 'hoa-don.zalo.token'`.execute(db)).rows[0]!.n)).toBe(1);
    await s.delete('hoa-don.zalo.token');
    expect(await s.has('hoa-don.zalo.token')).toEqual({ set: false, updatedAt: null, updatedBy: null });
    await s.set('hoa-don.zalo.token', `${PLAIN}-zalo`);
  });

  it('bản sao lưu / nhật ký chỉ có bản mã: dòng CSDL, audit_logs không chứa bản rõ; nhật ký ghi "đã đổi"', async () => {
    const rows = (await sql<{ t: string }>`SELECT t::text AS t FROM tenant_secrets t WHERE tenant_id = ${tenantA}`.execute(db)).rows.map((r) => r.t).join('\n');
    const keys = (await sql<{ t: string }>`SELECT t::text AS t FROM tenant_secret_keys t WHERE tenant_id = ${tenantA}`.execute(db)).rows.map((r) => r.t).join('\n');
    expect(rows).not.toContain(PLAIN);
    expect(rows).not.toContain(Buffer.from(PLAIN).toString('hex'));
    expect(keys).toMatch(/[0-9a-f]{16}/);
    const audit = (await sql<{ t: string }>`SELECT t::text AS t FROM audit_logs t WHERE tenant_id = ${tenantA} AND action LIKE 'secrets.%'`.execute(db)).rows.map((r) => r.t);
    const set = await auditRows(tenantA, 'secrets.set', 'hoa-don.viettel.password@book:SO-01');
    expect(set.length).toBeGreaterThan(0);
    expect(set[0]!.after).toEqual({ changed: true });
    expect(audit.join('\n')).not.toContain(PLAIN);
  });

  it('giao diện không thấy giá trị: phiên người dùng gọi action đọc → 403 dù có quyền; không có route nào trả giá trị cho trình duyệt', async () => {
    const res = await read('user', { name: 'hoa-don.viettel.password', bookId: 'SO-01' });
    expect(res.statusCode).toBe(403);
    expect(res.body).not.toContain(PLAIN);
    const routes = a.app.printRoutes({ commonPrefix: false });
    expect(routes).not.toMatch(/secrets/);
  });

  it('đơn vị A không đọc được bí mật của B (RLS dưới ketoan_app)', async () => {
    await sec(tenantB).set('hoa-don.zalo.token', `${PLAIN}-B`);
    const seen = await asApp(tenantA, async (trx) => ({
      rows: Number((await sql<{ n: string }>`SELECT count(*) AS n FROM tenant_secrets WHERE tenant_id = ${tenantB}`.execute(trx)).rows[0]!.n),
      keys: Number((await sql<{ n: string }>`SELECT count(*) AS n FROM tenant_secret_keys WHERE tenant_id = ${tenantB}`.execute(trx)).rows[0]!.n),
      own: Number((await sql<{ n: string }>`SELECT count(*) AS n FROM tenant_secrets WHERE tenant_id = ${tenantA}`.execute(trx)).rows[0]!.n),
      viaApi: await secretsFor(trx, { tenantId: tenantB, module: 'hoa-don', actor: 'user:x' }).get('hoa-don.zalo.token'),
    }));
    expect(seen).toMatchObject({ rows: 0, keys: 0, viaApi: null });
    expect(seen.own).toBeGreaterThan(0);
    await expect(asApp(tenantA, (trx) => sql`UPDATE tenant_secrets SET note = 'đổi trộm' WHERE tenant_id = ${tenantB}`.execute(trx).then((r) => Number(r.numAffectedRows ?? 0n)))).resolves.toBe(0);
    // Chép bản mã của B sang A cũng không giải được (dữ liệu kèm gắn đơn vị + tên + phạm vi)
    await sql`INSERT INTO tenant_secrets (tenant_id, module, name, scope_type, scope_id, ciphertext, iv, tag, key_version, updated_by)
              SELECT ${tenantA}, module, 'hoa-don.portal.password', 'branch', 'CN09', ciphertext, iv, tag, key_version, 'user:chep'
                FROM tenant_secrets WHERE tenant_id = ${tenantB} AND name = 'hoa-don.zalo.token'`.execute(db);
    expect(await reasonOf(sec(tenantA).get('hoa-don.portal.password', { branchCode: 'CN09' }))).toMatchObject({ code: 'NOT_READY', reason: 'SECRETS_CORRUPT' });
    await sec(tenantA).delete('hoa-don.portal.password', { branchCode: 'CN09' });
    expect(await sec(tenantB).get('hoa-don.zalo.token')).toBe(`${PLAIN}-B`);
  });

  it('module không chạm bí mật của module khác, không chạm tên chưa khai / sai phạm vi', async () => {
    const zalo = sec(tenantA, 'zalo', [{ name: 'zalo.oa.token', scope: 'tenant', label: 'Token' }]);
    expect(await reasonOf(zalo.get('hoa-don.zalo.token'))).toMatchObject({ code: 'FORBIDDEN' });
    expect(await reasonOf(zalo.set('hoa-don.zalo.token', 'x'))).toMatchObject({ code: 'FORBIDDEN' });
    expect(await reasonOf(sec(tenantA).get('hoa-don.khong.khai'))).toMatchObject({ code: 'FORBIDDEN' });
    expect(await reasonOf(sec(tenantA).get('hoa-don.viettel.password'))).toMatchObject({ code: 'VALIDATION_ERROR' }); // khai book, gọi tenant
    // Manifest khai sai → defineModule không nạp
    const manifest = { contract: 'bizcity_module@1', id: 'bizcity.hoa-don', key: 'hoa-don', kind: 'module', version: '1.0.0', label: 'Hoá đơn', requires: { capabilities: ['platform.secrets'] } };
    expect(() => defineModule({ manifest: { ...manifest, secrets: [{ name: 'zalo.oa.token', scope: 'tenant', label: 'x' }] } })).toThrow(/hoa-don\.<tên>/);
    expect(() => defineModule({ manifest: { ...manifest, secrets: [{ name: 'hoa-don.a.b', scope: 'site' as never, label: '' }] } })).toThrow(/scope "site"/);
    expect(() => defineModule({ manifest: { ...manifest, secrets: DECL } })).not.toThrow();
  });

  it('khoá app: thiếu quyền secrets:read:<module> → 403; quyền module khác → 403; có quyền → giá trị + một dòng nhật ký', async () => {
    expect((await read('key-khong-quyen', { name: 'hoa-don.viettel.password', bookId: 'SO-01' })).statusCode).toBe(403);
    expect((await read('key-module-khac', { name: 'hoa-don.viettel.password', bookId: 'SO-01' })).statusCode).toBe(403);
    const before = Number((await sql<{ n: string }>`SELECT count(*) AS n FROM audit_logs WHERE tenant_id = ${tenantA} AND action = 'secrets.read'`.execute(db)).rows[0]!.n);
    const res = await read('key', { name: 'hoa-don.viettel.password', bookId: 'SO-01' });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().data).toMatchObject({ name: 'hoa-don.viettel.password', scope: 'book', scopeId: 'SO-01', value: PLAIN });
    const rows = (await sql<{ actor: string; object_id: string; after_data: unknown }>`SELECT actor, object_id, after_data FROM audit_logs WHERE tenant_id = ${tenantA} AND action = 'secrets.read' ORDER BY id`.execute(db)).rows;
    expect(rows.length).toBe(before + 1);
    expect(rows.at(-1)).toMatchObject({ actor: 'apikey:7', object_id: 'hoa-don.viettel.password@book:SO-01', after_data: { found: true } });
    expect(JSON.stringify(rows)).not.toContain(PLAIN);
    // Đơn vị B gọi cùng tên → không thấy bí mật của A
    const resB = await read('key', { name: 'hoa-don.viettel.password', bookId: 'SO-01' }, tenantB);
    expect(resB.json().data.value).toBeNull();
  });

  it('đổi khoá gốc: mã lại khoá dữ liệu, giá trị giữ nguyên, vẫn đọc được bằng khoá mới; khoá cũ hết dùng được; chạy lại vô hại', async () => {
    const before = (await sql<{ c: Buffer }>`SELECT ciphertext AS c FROM tenant_secrets WHERE tenant_id = ${tenantA} AND name = 'hoa-don.viettel.password'`.execute(db)).rows[0]!.c;
    const r = await rotateSecretsMasterKey(db, KEY1, KEY2);
    expect(r.rewrapped).toBeGreaterThanOrEqual(2);
    const after = (await sql<{ c: Buffer }>`SELECT ciphertext AS c FROM tenant_secrets WHERE tenant_id = ${tenantA} AND name = 'hoa-don.viettel.password'`.execute(db)).rows[0]!.c;
    expect(Buffer.compare(before, after)).toBe(0);
    useSecretsMasterKey(KEY2);
    expect(await sec(tenantA).get('hoa-don.viettel.password', { bookId: 'SO-01' })).toBe(PLAIN);
    expect(await sec(tenantB).get('hoa-don.zalo.token')).toBe(`${PLAIN}-B`);
    expect((await rotateSecretsMasterKey(db, KEY1, KEY2)).rewrapped).toBe(0);
    useSecretsMasterKey(KEY1);
    expect(await reasonOf(sec(tenantA).get('hoa-don.viettel.password', { bookId: 'SO-01' }))).toMatchObject({ reason: 'SECRETS_KEY_MISMATCH' });
    // trả lại khoá 1 cho các ca sau
    await rotateSecretsMasterKey(db, KEY2, KEY1);
  });

  it('sai khoá gốc → NOT_READY SECRETS_KEY_MISMATCH, không lộ gì; ghi cũng bị chặn (không sinh khoá dữ liệu mới đè)', async () => {
    useSecretsMasterKey(KEY_WRONG);
    const got = await reasonOf(sec(tenantA).get('hoa-don.viettel.password', { bookId: 'SO-01' }));
    expect(got).toMatchObject({ code: 'NOT_READY', reason: 'SECRETS_KEY_MISMATCH' });
    expect(JSON.stringify(got)).not.toContain(PLAIN);
    expect(await reasonOf(sec(tenantA).set('hoa-don.zalo.token', 'moi'))).toMatchObject({ reason: 'SECRETS_KEY_MISMATCH' });
    const res = await read('key', { name: 'hoa-don.viettel.password', bookId: 'SO-01' });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.json().error.code).toBe('NOT_READY');
    expect(res.body).not.toContain(PLAIN);
    useSecretsMasterKey(KEY1);
    expect(await sec(tenantA).get('hoa-don.zalo.token')).toBe(`${PLAIN}-zalo`);
  });

  it('thiếu khoá gốc → SECRETS_KEY_MISSING ở chỗ dùng bí mật; phần còn lại của ứng dụng vẫn chạy; khoá sai khuôn bị chặn lúc kiểm cấu hình', async () => {
    useSecretsMasterKey(null);
    expect(await reasonOf(sec(tenantA).get('hoa-don.zalo.token'))).toMatchObject({ code: 'NOT_READY', reason: 'SECRETS_KEY_MISSING' });
    const ping = await a.app.inject({ method: 'GET', url: '/api/v1/accounts', headers: { authorization: `Bearer ${a.token}` } });
    expect(ping.statusCode).toBe(200);
    expect(checkEnv({ BIZCITY_SECRETS_KEY: 'ngan-qua' } as NodeJS.ProcessEnv).success).toBe(false);
    expect(checkEnv({ BIZCITY_SECRETS_KEY: randomBytes(16).toString('hex') } as NodeJS.ProcessEnv).success).toBe(false);
    expect(checkEnv({ BIZCITY_SECRETS_KEY: KEY1 } as NodeJS.ProcessEnv).success).toBe(true);
    expect(checkEnv({ BIZCITY_SECRETS_KEY: '' } as NodeJS.ProcessEnv).success).toBe(true);
    expect(decodeSecretsKey(KEY2)?.length).toBe(32);
  });

  it('log không chứa bản rõ (logger mức trace + console + stdout bắt trong lúc ghi / đọc / lỗi)', async () => {
    const captured: string[] = [];
    const orig = { out: process.stdout.write.bind(process.stdout), err: process.stderr.write.bind(process.stderr), log: console.log, error: console.error, warn: console.warn };
    const grab = (x: unknown) => { captured.push(String(x)); return true; };
    process.stdout.write = grab as typeof process.stdout.write;
    process.stderr.write = grab as typeof process.stderr.write;
    console.log = console.error = console.warn = (...xs: unknown[]) => { captured.push(xs.map(String).join(' ')); };
    try {
      await sec(tenantA).set('hoa-don.zalo.token', `${PLAIN}-log`);
      await sec(tenantA).get('hoa-don.zalo.token');
      await read('key', { name: 'hoa-don.zalo.token' });
      await read('key-khong-quyen', { name: 'hoa-don.zalo.token' });
      useSecretsMasterKey(KEY_WRONG);
      await read('key', { name: 'hoa-don.zalo.token' });
      await reasonOf(sec(tenantA).get('hoa-don.zalo.token'));
    } finally {
      process.stdout.write = orig.out;
      process.stderr.write = orig.err;
      Object.assign(console, { log: orig.log, error: orig.error, warn: orig.warn });
      useSecretsMasterKey(KEY1);
    }
    expect(logLines.length).toBeGreaterThan(0);
    const all = [...logLines, ...captured].join('\n');
    expect(all).not.toContain(PLAIN);
  });
});
