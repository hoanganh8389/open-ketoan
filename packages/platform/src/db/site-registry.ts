// @bizcity-layer P data
// [2026-11-22 12:37 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B2a (ADR-0036, D039-2, D039-4, D039-6): Site Registry trong database điều khiển; tên miền → site (bộ đệm 30 giây); mở pool của site khi cần
// [2026-11-22 10:26 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B4a (D039-19, R-SITE-2): kết nối bằng vai trò riêng của site (mật khẩu mã hoá AES-256-GCM bằng SITE_SECRET_KEY); xuất pool điều khiển cho Site Provisioner
/**
 * SITE REGISTRY (ADR-0036; PHASE-039 B2a). Chỉ dùng khi SITE_MODE=multi.
 *
 * Database điều khiển (CONTROL_DATABASE_URL) giữ bảng `sites`, `site_domains`, migration riêng ở `db/control-migrations/`.
 *
 *   resolveSiteIdByHost(host)   tên miền của yêu cầu → mã site đang phục vụ được; null khi không có (→ 404 SITE_NOT_FOUND)
 *   invalidateSiteCache()       xoá bộ đệm tên miền (sau khi registry đổi)
 *   ensureControlSchema()       áp migration của database điều khiển (khoá tư vấn, chạy lại không hại)
 *
 * Mở pool của site lần đầu nó được nhận (registerSitePool ở db/site.ts). Site có vai trò riêng (B4a, D039-19): kết nối bằng
 * vai trò đó, mật khẩu giải mã bằng SITE_SECRET_KEY. Site ghi tay chưa có vai trò riêng: thông tin đăng nhập của DATABASE_URL.
 * Trần pool và tự đóng pool rảnh (D039-7) làm ở B2c.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { env } from '../config/env.js';
import { listSiteIds, registerSitePool } from './site.js';
import { DB_DIR } from './paths.js';
// [2026-11-22 11:19 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B3 (D039-11, R-SITE-9): cổng lược đồ — chỉ phục vụ site có schema_version đúng bản ứng dụng cần
import { requiredSchemaVersion } from './migrate.js';

export const CONTROL_MIGRATIONS_DIR = path.join(DB_DIR, 'control-migrations');
const CACHE_MS = 30_000;
const SITE_POOL_MAX = 4;
const SERVABLE = new Set(['active', 'suspended']);

export interface SiteRecord {
  id: string;
  slug: string;
  status: string;
  db_host: string;
  db_port: number;
  db_name: string;
  db_app_role: string | null;
  db_secrets_enc: string | null;
  schema_version?: string | null;
}

let controlUrl: string | undefined = env.CONTROL_DATABASE_URL;
let secretKey: string | undefined = env.SITE_SECRET_KEY;
let control: pg.Pool | undefined;
let schemaReady: Promise<void> | undefined;
const byHost = new Map<string, { at: number; site: SiteRecord | null }>();

/** Đổi database điều khiển (và khoá mã hoá) lúc chạy. Chỉ cho test; bản cài đọc CONTROL_DATABASE_URL, SITE_SECRET_KEY một lần. */
export async function configureSiteRegistryForTest(url: string | undefined, key?: string): Promise<void> {
  await closeSiteRegistry();
  controlUrl = url;
  if (key !== undefined) secretKey = key;
}

/** Pool của database điều khiển (Site Provisioner ghi registry qua đây). */
export function controlPool(): pg.Pool {
  if (!controlUrl) throw new Error('Thiếu CONTROL_DATABASE_URL: Site Registry chỉ chạy khi SITE_MODE=multi có database điều khiển');
  control ??= new pg.Pool({ connectionString: controlUrl, max: 4 });
  return control;
}

/** Áp migration của database điều khiển một lần mỗi tiến trình (khoá tư vấn 727039 để hai tiến trình không chạy chồng). */
export function ensureControlSchema(): Promise<void> {
  schemaReady ??= (async () => {
    const client = await controlPool().connect();
    try {
      await client.query('SELECT pg_advisory_lock(727039)');
      await client.query('CREATE TABLE IF NOT EXISTS control_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
      const done = new Set((await client.query<{ name: string }>('SELECT name FROM control_migrations')).rows.map((r) => r.name));
      const files = (await readdir(CONTROL_MIGRATIONS_DIR)).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
      for (const file of files) {
        if (done.has(file)) continue;
        await client.query('BEGIN');
        try {
          await client.query(await readFile(path.join(CONTROL_MIGRATIONS_DIR, file), 'utf8'));
          await client.query('INSERT INTO control_migrations (name) VALUES ($1)', [file]);
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          throw new Error(`Migration điều khiển ${file} lỗi: ${(err as Error).message}`, { cause: err });
        }
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock(727039)').catch(() => undefined);
      client.release();
    }
  })().catch((err) => {
    schemaReady = undefined; // lần sau thử lại
    throw err;
  });
  return schemaReady;
}

/** Tên miền chuẩn hoá: chữ thường, bỏ cổng, bỏ dấu chấm cuối. Sai khuôn → null. */
export function normalizeHost(host: string | undefined): string | null {
  if (!host) return null;
  const h = host.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  return /^[a-z0-9.-]{3,253}$/.test(h) ? h : null;
}

export type SiteGateCode = 'SITE_UPGRADING' | 'SITE_MIGRATION_FAILED';
let required: string | undefined;

/** Đặt phiên bản lược đồ ứng dụng cần (trống = đọc lại từ db/migrations). Chỉ cho test. */
export function setRequiredSchemaVersionForTest(v: string | undefined): void {
  required = v;
  gatedAt = 0;
}

/** Phiên bản lược đồ bản ứng dụng này cần (tên migration lõi cuối cùng trong ảnh đang chạy), đọc một lần. */
export function appSchemaVersion(): string {
  required ??= requiredSchemaVersion();
  return required;
}

/**
 * Cổng lược đồ (R-SITE-9): site đang nâng → SITE_UPGRADING; nâng lỗi → SITE_MIGRATION_FAILED; lược đồ khác bản ứng dụng cần
 * (ứng dụng cũ gặp site đã nâng, hoặc ứng dụng mới gặp site chưa nâng) → SITE_UPGRADING. `schema_version` trống (site ghi tay
 * trước B3, chưa chạy `site migrate` lần nào) → phục vụ. null = phục vụ được.
 */
export function siteGate(site: { status: string; schema_version?: string | null }): SiteGateCode | null {
  if (site.status === 'migration_failed') return 'SITE_MIGRATION_FAILED';
  if (site.status === 'upgrading') return 'SITE_UPGRADING';
  if (site.schema_version && site.schema_version !== appSchemaVersion()) return 'SITE_UPGRADING';
  return null;
}

// [2026-11-22 01:18 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B6b (Q039-1): site đang khoá (suspended) phục vụ CHỈ ĐỌC — cờ readOnly (chỉ có khi true)
export type SiteResolution = { siteId: string; readOnly?: true } | { gate: SiteGateCode } | null;

/** Tên miền → site phục vụ được, hoặc mã cổng lược đồ (503), hoặc null (không có, đã xoá, đang tạo → 404). */
export async function resolveSiteByHost(host: string | undefined): Promise<SiteResolution> {
  const h = normalizeHost(host);
  if (!h) return null;
  const site = await lookupHost(h);
  if (!site) return null;
  const gate = siteGate(site);
  if (gate) return { gate };
  if (!SERVABLE.has(site.status)) return null;
  ensurePool(site);
  return site.status === 'suspended' ? { siteId: site.id, readOnly: true } : { siteId: site.id };
}

/** Tên miền → mã site đang phục vụ được (active / suspended, qua cổng lược đồ). Còn lại → null. Mở pool của site khi cần. */
export async function resolveSiteIdByHost(host: string | undefined): Promise<string | null> {
  const r = await resolveSiteByHost(host);
  return r && 'siteId' in r ? r.siteId : null;
}

async function lookupHost(h: string): Promise<SiteRecord | null> {
  const now = Date.now();
  let hit = byHost.get(h);
  if (!hit || now - hit.at > CACHE_MS) {
    await ensureControlSchema();
    const r = await controlPool().query<SiteRecord>(
      `SELECT s.id, s.slug, s.status, s.db_host, s.db_port, s.db_name, s.db_app_role, s.db_secrets_enc, s.schema_version
         FROM site_domains d JOIN sites s ON s.id = d.site_id
        WHERE d.domain = $1`,
      [h],
    );
    hit = { at: now, site: r.rows[0] ?? null };
    byHost.set(h, hit);
  }
  return hit.site;
}

/**
 * Chuỗi kết nối của site: máy chủ / cổng / database theo registry. Có vai trò riêng (B4a): đăng nhập bằng vai trò đó với mật khẩu
 * giải mã từ registry; không có: thông tin đăng nhập của DATABASE_URL (site ghi tay, B2a).
 */
function siteConnectionString(site: SiteRecord): string {
  const u = new URL(env.DATABASE_URL);
  if (site.db_app_role && site.db_secrets_enc) {
    u.username = site.db_app_role;
    u.password = decryptSiteSecret(site.db_secrets_enc);
  }
  u.hostname = site.db_host;
  u.port = String(site.db_port);
  u.pathname = `/${site.db_name}`;
  return u.toString();
}

export function invalidateSiteCache(): void {
  byHost.clear();
  activeAt = 0;
  gatedAt = 0;
}

// [2026-11-22 11:04 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B2c (D039-7, D039-8): pool của site — tối đa 4 kết nối, kết nối rảnh 30 giây thì đóng; việc nền nạp pool của mọi site đang chạy
const POOL_IDLE_MS = 30_000;
const ACTIVE_REFRESH_MS = 30_000;
let activeAt = 0;

function ensurePool(site: SiteRecord): void {
  if (!listSiteIds().includes(site.id)) {
    const p = new pg.Pool({ connectionString: siteConnectionString(site), max: SITE_POOL_MAX, idleTimeoutMillis: POOL_IDLE_MS });
    // [2026-11-22 12:06 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B6a: kết nối rảnh bị ngắt (khôi phục site, quản trị pg_terminate_backend) → pool phát 'error'; không bắt thì sập cả tiến trình API. Pool tự bỏ kết nối hỏng, lần mượn sau mở kết nối mới.
    p.on('error', () => undefined);
    registerSitePool(site.id, p);
  }
}

/**
 * Việc nền (dispatcher sự kiện, đồng hồ) phải chạy cả ở site chưa có yêu cầu nào từ lúc khởi động: đọc registry (tối đa mỗi
 * 30 giây một lần), mở pool cho mọi site `active` / `suspended` chưa có pool. Site bị xoá / chuyển trạng thái: pool cũ ở lại tới khi
 * khởi động lại (B6 thêm gỡ pool khi khoá / xoá site).
 */
export async function registerActiveSitePools(now = Date.now()): Promise<number> {
  if (now - activeAt < ACTIVE_REFRESH_MS) return 0;
  await ensureControlSchema();
  const r = await controlPool().query<SiteRecord>(
    `SELECT id, slug, status, db_host, db_port, db_name, db_app_role, db_secrets_enc FROM sites WHERE status IN ('active', 'suspended')`,
  );
  activeAt = now;
  let added = 0;
  for (const site of r.rows) {
    if (!listSiteIds().includes(site.id)) { ensurePool(site); added++; }
  }
  return added;
}

// [2026-11-22 11:19 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B3 (R-SITE-9): việc nền bỏ site bị cổng lược đồ chặn; đọc lại mỗi giây để `site migrate` dừng được việc nền nhanh
const GATE_REFRESH_MS = 1_000;
let gatedAt = 0;
let gated = new Set<string>();

/** Mã các site bị cổng lược đồ chặn (đang nâng / nâng lỗi / lệch lược đồ). Đọc registry tối đa mỗi giây một lần. */
export async function gatedSiteIds(now = Date.now()): Promise<Set<string>> {
  if (now - gatedAt < GATE_REFRESH_MS) return gated;
  await ensureControlSchema();
  const r = await controlPool().query<{ id: string; status: string; schema_version: string | null }>(
    `SELECT id, status, schema_version FROM sites WHERE status IN ('active', 'suspended', 'upgrading', 'migration_failed')`,
  );
  gated = new Set(r.rows.filter((s) => siteGate(s) !== null).map((s) => s.id));
  gatedAt = now;
  return gated;
}

/** Đóng pool của database điều khiển (tắt ứng dụng / test). Pool của từng site đóng cùng db (endAllSitePools). */
export async function closeSiteRegistry(): Promise<void> {
  byHost.clear();
  schemaReady = undefined;
  const p = control;
  control = undefined;
  await p?.end();
}

// ── Mã hoá mật khẩu vai trò của site (D039-19) ─────────────────────────────────────────────────────────────────────────────
// [2026-11-22 10:26 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B4a: AES-256-GCM, khoá = SHA-256(SITE_SECRET_KEY); dạng lưu v1:<base64(iv 12 | tag 16 | bản mã)>

function keyBytes(): Buffer {
  if (!secretKey) throw new Error('Thiếu SITE_SECRET_KEY: không mã hoá / giải mã được mật khẩu vai trò của site');
  return createHash('sha256').update(secretKey, 'utf8').digest();
}

/** Mã hoá một chuỗi bí mật để lưu ở registry. Không bao giờ ghi giá trị gốc vào nhật ký. */
export function encryptSiteSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', keyBytes(), iv);
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `v1:${Buffer.concat([iv, c.getAuthTag(), body]).toString('base64')}`;
}

/** Giải mã chuỗi đã lưu ở registry. Sai khoá / bị sửa → ném lỗi (không trả chuỗi rỗng). */
export function decryptSiteSecret(stored: string): string {
  if (!stored.startsWith('v1:')) throw new Error('Mật khẩu của site không đúng khuôn v1');
  const raw = Buffer.from(stored.slice(3), 'base64');
  const d = createDecipheriv('aes-256-gcm', keyBytes(), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
}
