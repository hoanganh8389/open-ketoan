// @bizcity-layer P secrets
// [2026-11-25 08:55 PM Võ Hoàng] FLOW — platform.secrets (BIZCITY-SECRETS-v1 §3–§5): bí mật mã hoá phong bì AES-256-GCM theo đơn vị — khoá gốc BIZCITY_SECRETS_KEY, khoá dữ liệu mỗi đơn vị (tenant_secret_keys), set / get / has / delete theo module, đổi khoá gốc, action đọc cho khoá app có secrets:read:<module> (đóng góp)
// [2026-11-25 11:32 PM Võ Hoàng] FLOW — platform.secrets: sổ khai bí mật theo module (registerModuleSecrets) cho ctx.secrets, action đọc GET /api/v1/m/<key>/secrets/read, chặn ghi trong action đọc (đóng góp)
/**
 * BÍ MẬT THEO ĐƠN VỊ (platform.secrets, docs/contracts/BIZCITY-SECRETS-v1.md, migration 0184).
 *
 *   Khoá gốc      BIZCITY_SECRETS_KEY (config/env.ts) — một cho bản cài, không lưu trong CSDL. Thiếu → NOT_READY
 *                 SECRETS_KEY_MISSING ở đúng chỗ gọi bí mật; phần còn lại của ứng dụng chạy bình thường.
 *   Khoá dữ liệu  32 byte ngẫu nhiên cho mỗi đơn vị, sinh ở lần ghi đầu, lưu đã mã bằng khoá gốc (tenant_secret_keys) kèm dấu vân
 *                 khoá gốc: khoá gốc khác → SECRETS_KEY_MISMATCH, không thử giải mã ra rác.
 *   Giá trị       AES-256-GCM bằng khoá dữ liệu; dữ liệu kèm (AAD) = đơn vị + tên + phạm vi → chép bản mã sang dòng / đơn vị
 *                 khác là không giải được.
 *   Module        tên `<module>.<tên>` — module chỉ chạm tên của mình; có danh sách khai (manifest secrets[]) thì chỉ tên đã khai,
 *                 đúng phạm vi đã khai. `get` chỉ phía máy chủ; giao diện chỉ thấy `has` (đã đặt lúc … bởi …).
 *   App ngoài     action `<module>.secrets.read` (GET /api/v1/m/<module>/secrets/read — defineModule tự thêm khi manifest khai
 *                 secrets[]) gác bằng quyền `secrets:read:<module>`; mỗi lần đọc ghi một dòng audit_logs.
 *   R-LOG-4       không log, không đưa giá trị vào lỗi / nhật ký / bằng chứng — nhật ký chỉ ghi "đã đổi".
 */
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import { z } from 'zod';
import { decodeSecretsKey, env } from '../config/env.js';
import type { Db } from '../db/client.js';
import type { Database } from '../db/types.js';
import { defineAction, type AnyActionDef } from './actions.js';
import { writeAudit } from './audit.js';
import { registerSecretsReadPermission, type Permission } from './auth.js';
import { Errors } from './errors.js';

export type SecretScopeType = 'tenant' | 'book' | 'branch';
/** Phạm vi của một bí mật: không truyền = cả đơn vị; `bookId` = theo sổ (pháp nhân); `branchCode` = theo chi nhánh. */
export interface SecretScope { branchCode?: string; bookId?: string }
/** Một dòng manifest `secrets[]`. */
export interface SecretDecl { name: string; scope: SecretScopeType; label: string }
/** Điều giao diện được thấy về một bí mật — không bao giờ có giá trị. */
export interface SecretInfo { set: boolean; updatedAt: string | null; updatedBy: string | null }

/** `ctx.secrets` (BIZCITY-SECRETS-v1 §3). */
export interface SecretsApi {
  set(name: string, value: string, opts?: { scope?: SecretScope; note?: string }): Promise<void>;
  /** Chỉ phía máy chủ — không trả giá trị này ra giao diện. */
  get(name: string, scope?: SecretScope): Promise<string | null>;
  has(name: string, scope?: SecretScope): Promise<SecretInfo>;
  delete(name: string, scope?: SecretScope): Promise<void>;
}

const NAME_RE = /^[a-z][a-z0-9-]*(\.[a-z0-9][a-z0-9_-]*)+$/;
const MODULE_RE = /^[a-z][a-z0-9-]*$/;
const SCOPE_ID_RE = /^[A-Za-z0-9._-]{1,64}$/;
/** Giá trị tối đa 8 KB (mật khẩu, token, khoá API — không phải tệp). */
export const SECRET_VALUE_MAX = 8 * 1024;
const FP_INFO = 'bizcity.secrets.fingerprint';

// ── Khoá gốc ────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface MasterKey { readonly key: Buffer; readonly fingerprint: string }

/** Khoá gốc từ chuỗi cấu hình (hex / base64 ≥ 32 byte). Dài hơn 32 byte thì rút bằng HKDF-SHA256. Sai khuôn → lỗi không kèm giá trị. */
export function masterKeyFrom(raw: string): MasterKey {
  const decoded = decodeSecretsKey(raw);
  if (!decoded) throw Errors.notReady('Khoá gốc bí mật sai khuôn: cần hex hoặc base64 giải ra ít nhất 32 byte', { reason: 'SECRETS_KEY_INVALID' });
  const key = decoded.length === 32 ? decoded : Buffer.from(hkdfSync('sha256', decoded, Buffer.alloc(0), 'bizcity.secrets.master', 32));
  return { key, fingerprint: createHmac('sha256', key).update(FP_INFO).digest('hex').slice(0, 16) };
}

let masterOverride: MasterKey | null | undefined;
/** Đổi khoá gốc đang dùng trong tiến trình (test; lệnh đổi khoá sau khi mã lại). `undefined` = trở về BIZCITY_SECRETS_KEY. */
export function useSecretsMasterKey(raw: string | null | undefined): void {
  masterOverride = raw === undefined ? undefined : raw === null ? null : masterKeyFrom(raw);
}

/** Khoá gốc đang dùng; chưa cấu hình → NOT_READY SECRETS_KEY_MISSING (chỉ chỗ dùng bí mật bị ảnh hưởng). */
export function currentMasterKey(): MasterKey {
  const mk = masterOverride !== undefined ? masterOverride : env.BIZCITY_SECRETS_KEY ? masterKeyFrom(env.BIZCITY_SECRETS_KEY) : null;
  if (!mk) throw Errors.notReady('Bản cài chưa đặt khoá gốc BIZCITY_SECRETS_KEY nên chưa lưu / đọc được bí mật. Quản trị bản cài đặt khoá (openssl rand -base64 32) rồi khởi động lại.', { reason: 'SECRETS_KEY_MISSING' });
  return mk;
}

const mismatch = () => Errors.notReady('Khoá gốc BIZCITY_SECRETS_KEY không khớp khoá đã mã bí mật của đơn vị (đổi khoá mà chưa chạy lệnh mã lại?). Đặt lại khoá cũ, chạy lệnh đổi khoá, hoặc nhập lại bí mật.', { reason: 'SECRETS_KEY_MISMATCH' });

// ── Mã / giải AES-256-GCM ────────────────────────────────────────────────────────────────────────────────────────────────
interface Sealed { ciphertext: Buffer; iv: Buffer; tag: Buffer }
function seal(key: Buffer, plain: Buffer, aad: string): Sealed {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(aad, 'utf8'));
  const ciphertext = Buffer.concat([c.update(plain), c.final()]);
  return { ciphertext, iv, tag: c.getAuthTag() };
}
/** Giải; sai khoá / bản mã bị sửa → null (không ném lỗi của crypto ra ngoài — thông điệp gốc không cần, và không kèm dữ liệu). */
function open(key: Buffer, s: Sealed, aad: string): Buffer | null {
  try {
    const d = createDecipheriv('aes-256-gcm', key, s.iv);
    d.setAAD(Buffer.from(aad, 'utf8'));
    d.setAuthTag(s.tag);
    return Buffer.concat([d.update(s.ciphertext), d.final()]);
  } catch { // nuot-loi: GCM xác thực hỏng = sai khoá hoặc bản mã bị sửa; người gọi đổi thành lỗi chuẩn có reason, không lộ dữ liệu
    return null;
  }
}
const keyAad = (tenantId: string) => `bizcity.secrets.key|${tenantId}`;
const valueAad = (tenantId: string, name: string, type: SecretScopeType, id: string) => `bizcity.secrets.value|${tenantId}|${name}|${type}|${id}`;

// ── Khoá dữ liệu của đơn vị ──────────────────────────────────────────────────────────────────────────────────────────────
interface KeyRow { wrapped_key: Buffer; iv: Buffer; tag: Buffer; key_version: number; master_fingerprint: string }

async function dataKey(conn: Db, tenantId: string, mk: MasterKey, create: boolean): Promise<{ key: Buffer; version: number } | null> {
  const read = async () => (await sql<KeyRow>`SELECT wrapped_key, iv, tag, key_version, master_fingerprint FROM tenant_secret_keys WHERE tenant_id = ${tenantId}`.execute(conn)).rows[0];
  let row = await read();
  if (!row) {
    if (!create) return null;
    const fresh = randomBytes(32);
    const w = seal(mk.key, fresh, keyAad(tenantId));
    await sql`INSERT INTO tenant_secret_keys (tenant_id, wrapped_key, iv, tag, key_version, master_fingerprint)
              VALUES (${tenantId}, ${w.ciphertext}, ${w.iv}, ${w.tag}, 1, ${mk.fingerprint}) ON CONFLICT (tenant_id) DO NOTHING`.execute(conn);
    row = await read();
    if (!row) throw Errors.conflict('Không tạo được khoá dữ liệu bí mật cho đơn vị', { reason: 'SECRETS_KEY_CREATE' });
  }
  if (row.master_fingerprint !== mk.fingerprint) throw mismatch();
  const key = open(mk.key, { ciphertext: row.wrapped_key, iv: row.iv, tag: row.tag }, keyAad(tenantId));
  if (!key) throw mismatch();
  return { key, version: row.key_version };
}

// ── Tên, phạm vi ─────────────────────────────────────────────────────────────────────────────────────────────────────────
function scopeOf(scope: SecretScope | undefined): { type: SecretScopeType; id: string } {
  const b = scope?.branchCode?.trim();
  const k = scope?.bookId?.trim();
  if (b && k) throw Errors.validation('Bí mật chỉ theo một phạm vi: chi nhánh hoặc sổ, không cả hai');
  const id = b || k || '';
  if (id && !SCOPE_ID_RE.test(id)) throw Errors.validation('Mã chi nhánh / sổ của bí mật sai khuôn (chữ, số, . _ -; tối đa 64 ký tự)');
  return { type: b ? 'branch' : k ? 'book' : 'tenant', id };
}

/** Lỗi khai `secrets[]` trong manifest (rỗng = đúng): tên `<module>.…`, phạm vi tenant / book / branch, có nhãn, không trùng. */
export function secretDeclErrors(moduleKey: string, decls: readonly SecretDecl[] | undefined): string[] {
  const bad: string[] = [];
  const seen = new Set<string>();
  for (const d of decls ?? []) {
    const at = `bí mật ${d?.name}`;
    if (typeof d?.name !== 'string' || !NAME_RE.test(d.name) || !d.name.startsWith(`${moduleKey}.`)) bad.push(`${at}: tên phải dạng "${moduleKey}.<tên>"`);
    if (!['tenant', 'book', 'branch'].includes(d?.scope)) bad.push(`${at}: scope "${d?.scope}" (cần tenant / book / branch)`);
    if (!d?.label?.trim()) bad.push(`${at}: thiếu label`);
    if (seen.has(d?.name)) bad.push(`${at}: khai trùng`);
    seen.add(d?.name);
  }
  return bad;
}

// ── Sổ khai bí mật theo module ───────────────────────────────────────────────────────────────────────────────────────────
const declarations = new Map<string, readonly SecretDecl[]>();
/** Module khai `secrets[]` (defineModule gọi lúc nạp): ctx.secrets chỉ cho tên đã khai; quyền `secrets:read:<module>` vào sổ quyền. */
export function registerModuleSecrets(moduleKey: string, decls: readonly SecretDecl[]): void {
  const bad = secretDeclErrors(moduleKey, decls);
  if (bad.length) throw new Error(`Module ${moduleKey}: ${bad.join('; ')}`);
  declarations.set(moduleKey, Object.freeze([...decls]));
  registerSecretsReadPermission(moduleKey);
}
/** Bí mật module đã khai; module không khai → [] (ctx.secrets từ chối mọi tên). */
export const moduleSecretDecls = (moduleKey: string): readonly SecretDecl[] => declarations.get(moduleKey) ?? [];

export interface SecretsOptions {
  tenantId: string;
  /** Module đang chạy (tiền tố id action) — chỉ chạm tên `<module>.…`. */
  module: string;
  /** Người ghi vào updated_by / nhật ký. */
  actor: string;
  /** Danh sách khai trong manifest `secrets[]`. Có thì chỉ tên đã khai, đúng phạm vi đã khai. */
  declared?: readonly SecretDecl[];
  /** Action đọc: set / delete bị chặn (ghi bí mật chỉ trong action ghi). */
  readOnly?: boolean;
}

/** Dựng `ctx.secrets` cho một module trong một đơn vị, trên kết nối / giao dịch `conn` (giao dịch của action). */
export function secretsFor(conn: Db, o: SecretsOptions): SecretsApi {
  if (!MODULE_RE.test(o.module)) throw new Error(`ctx.secrets: khoá module "${o.module}" sai khuôn`);
  const declared = o.declared ? new Map(o.declared.map((d) => [d.name, d])) : null;
  const target = (name: string, scope: SecretScope | undefined) => {
    if (typeof name !== 'string' || !NAME_RE.test(name)) throw Errors.validation(`Tên bí mật "${String(name)}" sai khuôn <module>.<tên>`);
    if (!name.startsWith(`${o.module}.`)) throw Errors.forbidden(`Module ${o.module} không được chạm bí mật của module khác (${name.split('.')[0]})`);
    const s = scopeOf(scope);
    if (declared) {
      const d = declared.get(name);
      if (!d) throw Errors.forbidden(`Bí mật ${name} chưa khai trong manifest secrets[] của module ${o.module}`);
      if (d.scope !== s.type) throw Errors.validation(`Bí mật ${name} khai phạm vi ${d.scope}, lời gọi dùng phạm vi ${s.type}`);
    }
    if (!o.tenantId) throw Errors.unauthorized();
    return s;
  };
  return {
    async set(name, value, opts) {
      const s = target(name, opts?.scope);
      if (o.readOnly) throw new Error(`ctx.secrets.set chỉ dùng trong action ghi (${name})`);
      if (typeof value !== 'string' || value.length === 0) throw Errors.validation(`Giá trị bí mật ${name} trống — muốn bỏ thì dùng xoá`);
      if (Buffer.byteLength(value, 'utf8') > SECRET_VALUE_MAX) throw Errors.validation(`Giá trị bí mật ${name} dài quá ${SECRET_VALUE_MAX} byte`);
      const note = (opts?.note ?? '').slice(0, 500);
      const mk = currentMasterKey();
      const dk = (await dataKey(conn, o.tenantId, mk, true))!;
      const v = seal(dk.key, Buffer.from(value, 'utf8'), valueAad(o.tenantId, name, s.type, s.id));
      await sql`INSERT INTO tenant_secrets (tenant_id, module, name, scope_type, scope_id, ciphertext, iv, tag, key_version, note, updated_by, updated_at)
                VALUES (${o.tenantId}, ${o.module}, ${name}, ${s.type}, ${s.id}, ${v.ciphertext}, ${v.iv}, ${v.tag}, ${dk.version}, ${note}, ${o.actor}, now())
                ON CONFLICT (tenant_id, name, scope_type, scope_id) DO UPDATE SET ciphertext = EXCLUDED.ciphertext, iv = EXCLUDED.iv, tag = EXCLUDED.tag,
                  key_version = EXCLUDED.key_version, note = EXCLUDED.note, updated_by = EXCLUDED.updated_by, updated_at = now()`.execute(conn);
      // Nhật ký chỉ ghi "đã đổi" — không giá trị, không độ dài (BIZCITY-SECRETS-v1 §4).
      await writeAudit(conn, { tenantId: o.tenantId, actor: o.actor, action: 'secrets.set', objectType: 'secret', objectId: `${name}@${s.type}:${s.id}`, after: { changed: true } });
    },
    async get(name, scope) {
      const s = target(name, scope);
      return readValue(conn, o.tenantId, name, s);
    },
    async has(name, scope) {
      const s = target(name, scope);
      const r = (await sql<{ updated_at: Date; updated_by: string }>`SELECT updated_at, updated_by FROM tenant_secrets
        WHERE tenant_id = ${o.tenantId} AND name = ${name} AND scope_type = ${s.type} AND scope_id = ${s.id}`.execute(conn)).rows[0];
      return r ? { set: true, updatedAt: new Date(r.updated_at).toISOString(), updatedBy: r.updated_by } : { set: false, updatedAt: null, updatedBy: null };
    },
    async delete(name, scope) {
      const s = target(name, scope);
      if (o.readOnly) throw new Error(`ctx.secrets.delete chỉ dùng trong action ghi (${name})`);
      const r = await sql`DELETE FROM tenant_secrets WHERE tenant_id = ${o.tenantId} AND name = ${name} AND scope_type = ${s.type} AND scope_id = ${s.id}`.execute(conn);
      if (Number(r.numAffectedRows ?? 0n) > 0) {
        await writeAudit(conn, { tenantId: o.tenantId, actor: o.actor, action: 'secrets.delete', objectType: 'secret', objectId: `${name}@${s.type}:${s.id}`, after: { deleted: true } });
      }
    },
  };
}

async function readValue(conn: Db, tenantId: string, name: string, s: { type: SecretScopeType; id: string }): Promise<string | null> {
  const r = (await sql<{ ciphertext: Buffer; iv: Buffer; tag: Buffer }>`SELECT ciphertext, iv, tag FROM tenant_secrets
    WHERE tenant_id = ${tenantId} AND name = ${name} AND scope_type = ${s.type} AND scope_id = ${s.id}`.execute(conn)).rows[0];
  if (!r) return null;
  const mk = currentMasterKey();
  const dk = await dataKey(conn, tenantId, mk, false);
  if (!dk) throw mismatch();
  const plain = open(dk.key, r, valueAad(tenantId, name, s.type, s.id));
  if (!plain) throw Errors.notReady(`Bí mật ${name} không giải mã được (bản mã bị sửa hoặc chép từ chỗ khác) — nhập lại bí mật`, { reason: 'SECRETS_CORRUPT' });
  return plain.toString('utf8');
}

// ── Đổi khoá gốc ─────────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Mã lại khoá dữ liệu của mọi đơn vị từ khoá gốc cũ sang khoá gốc mới; giá trị bí mật không đụng. Chạy NGOÀI yêu cầu (kết nối
 * chưa gắn đơn vị → thấy mọi dòng), trong một giao dịch: hỏng một dòng là không đổi dòng nào. Dòng đã mã bằng khoá mới thì bỏ qua
 * (chạy lại vô hại). Dòng không khớp khoá cũ lẫn khoá mới (`foreign` — vốn đã không đọc được bằng khoá đang chạy) để nguyên và
 * đếm ra cho người chạy lệnh xem; dòng khớp dấu vân khoá cũ mà không giải được → dừng SECRETS_KEY_MISMATCH, không đổi gì.
 */
export async function rotateSecretsMasterKey(conn: Db, oldRaw: string, newRaw: string): Promise<{ rewrapped: number; skipped: number; foreign: number }> {
  const oldK = masterKeyFrom(oldRaw);
  const newK = masterKeyFrom(newRaw);
  const run = async (tx: Db) => {
    const rows = (await sql<KeyRow & { tenant_id: string }>`SELECT tenant_id, wrapped_key, iv, tag, key_version, master_fingerprint FROM tenant_secret_keys ORDER BY tenant_id FOR UPDATE`.execute(tx)).rows;
    let rewrapped = 0;
    let skipped = 0;
    let foreign = 0;
    for (const row of rows) {
      const tid = String(row.tenant_id);
      if (row.master_fingerprint === newK.fingerprint) { skipped++; continue; }
      if (row.master_fingerprint !== oldK.fingerprint) { foreign++; continue; }
      const key = open(oldK.key, { ciphertext: row.wrapped_key, iv: row.iv, tag: row.tag }, keyAad(tid));
      if (!key) throw mismatch();
      const w = seal(newK.key, key, keyAad(tid));
      await sql`UPDATE tenant_secret_keys SET wrapped_key = ${w.ciphertext}, iv = ${w.iv}, tag = ${w.tag}, master_fingerprint = ${newK.fingerprint}, rewrapped_at = now()
                WHERE tenant_id = ${tid}`.execute(tx);
      rewrapped++;
    }
    return { rewrapped, skipped, foreign };
  };
  return conn.isTransaction ? run(conn) : (conn as Kysely<Database>).transaction().execute((tx) => run(tx));
}

// ── App ngoài đọc bí mật ─────────────────────────────────────────────────────────────────────────────────────────────────
/** Quyền app để đọc bí mật của một module (BIZCITY-SECRETS-v1 §3). */
export const secretsReadPermission = (moduleKey: string): Permission => `secrets:read:${moduleKey}` as Permission;

const readOutput = z.object({ name: z.string(), scope: z.enum(['tenant', 'book', 'branch']), scopeId: z.string(), value: z.string().nullable(), updatedAt: z.string().nullable() });

/**
 * Action đọc bí mật cho khoá API / khoá app (cầu nối, plugin Viettel…): `<module>.secrets.read`, quyền `secrets:read:<module>`,
 * GET /secrets/read dưới tiền tố route của module (/api/v1/m/<module>/secrets/read — khoá app chỉ GET được ngoài cửa nạp). Mỗi lần đọc (có hay không có giá trị) ghi một dòng audit_logs `secrets.read` — không giá trị.
 * Người dùng đăng nhập bằng phiên giao diện bị chặn dù có quyền: giao diện không bao giờ thấy giá trị.
 */
export function defineSecretsReadAction(moduleKey: string): AnyActionDef {
  if (!MODULE_RE.test(moduleKey)) throw new Error(`defineSecretsReadAction: khoá module "${moduleKey}" sai khuôn`);
  return defineAction({
    id: `${moduleKey}.secrets.read`,
    title: `Đọc bí mật của module ${moduleKey} (khoá app)`,
    description: `Chỉ cho khoá API / khoá app có quyền secrets:read:${moduleKey}; mỗi lần đọc ghi nhật ký. Giao diện không gọi được.`,
    tags: ['secrets'],
    input: z.object({
      name: z.string().regex(NAME_RE).describe(`Tên bí mật ${moduleKey}.<tên>`),
      branchCode: z.string().optional(),
      bookId: z.string().optional(),
    }),
    output: readOutput,
    permission: secretsReadPermission(moduleKey),
    effect: 'read',
    idempotency: 'none',
    expose: { http: { method: 'GET', path: '/secrets/read' }, mcp: false, ai: 'deny' },
    errors: ['FORBIDDEN', 'NOT_READY', 'VALIDATION_ERROR'],
    async handler(ctx, input) {
      if (ctx.actor.kind !== 'apikey') throw Errors.forbidden('Chỉ khoá API / khoá app đọc được giá trị bí mật; giao diện chỉ thấy đã đặt lúc nào, bởi ai');
      if (!input.name.startsWith(`${moduleKey}.`)) throw Errors.forbidden(`Quyền secrets:read:${moduleKey} không đọc được bí mật ${input.name}`);
      const s = scopeOf({ branchCode: input.branchCode, bookId: input.bookId });
      const tx = ctx.data.tx;
      const value = await readValue(tx, ctx.tenant.id, input.name, s);
      // Mỗi lần đọc một dòng nhật ký (action đọc: dòng thật, không gộp vào bằng chứng) — chỉ tên, phạm vi, có / không; không giá trị.
      await writeAudit(tx, { tenantId: ctx.tenant.id, actor: ctx.actor.id, action: 'secrets.read', objectType: 'secret', objectId: `${input.name}@${s.type}:${s.id}`, after: { found: value !== null } });
      const info = (await sql<{ updated_at: Date }>`SELECT updated_at FROM tenant_secrets WHERE tenant_id = ${ctx.tenant.id} AND name = ${input.name} AND scope_type = ${s.type} AND scope_id = ${s.id}`.execute(tx)).rows[0];
      return { name: input.name, scope: s.type, scopeId: s.id, value, updatedAt: info ? new Date(info.updated_at).toISOString() : null };
    },
  });
}
