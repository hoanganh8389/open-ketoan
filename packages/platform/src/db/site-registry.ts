// @bizcity-layer P data
// [2026-11-22 12:37 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B2a (ADR-0036, D039-2, D039-4, D039-6): Site Registry trong database điều khiển; tên miền → site (bộ đệm 30 giây); mở pool của site khi cần
/**
 * SITE REGISTRY (ADR-0036; PHASE-039 B2a). Chỉ dùng khi SITE_MODE=multi.
 *
 * Database điều khiển (CONTROL_DATABASE_URL) giữ bảng `sites`, `site_domains`, migration riêng ở `db/control-migrations/`.
 *
 *   resolveSiteIdByHost(host)   tên miền của yêu cầu → mã site đang phục vụ được; null khi không có (→ 404 SITE_NOT_FOUND)
 *   invalidateSiteCache()       xoá bộ đệm tên miền (sau khi registry đổi)
 *   ensureControlSchema()       áp migration của database điều khiển (khoá tư vấn, chạy lại không hại)
 *
 * Mở pool của site lần đầu nó được nhận (registerSitePool ở db/site.ts). B2a: kết nối bằng thông tin đăng nhập của
 * DATABASE_URL, chỉ đổi máy chủ / cổng / tên database theo registry. Vai trò PostgreSQL riêng từng site (D039-19) thay ở B4.
 * Trần pool và tự đóng pool rảnh (D039-7) làm ở B2c.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { env } from '../config/env.js';
import { listSiteIds, registerSitePool } from './site.js';
import { DB_DIR } from './paths.js';

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
}

let controlUrl: string | undefined = env.CONTROL_DATABASE_URL;
let control: pg.Pool | undefined;
let schemaReady: Promise<void> | undefined;
const byHost = new Map<string, { at: number; site: SiteRecord | null }>();

/** Đổi database điều khiển lúc chạy. Chỉ cho test; bản cài đọc CONTROL_DATABASE_URL một lần. */
export async function configureSiteRegistryForTest(url: string | undefined): Promise<void> {
  await closeSiteRegistry();
  controlUrl = url;
}

function controlPool(): pg.Pool {
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

/** Tên miền → mã site đang phục vụ được (active / suspended). Không có, đã xoá, đang tạo → null. Mở pool của site khi cần. */
export async function resolveSiteIdByHost(host: string | undefined): Promise<string | null> {
  const h = normalizeHost(host);
  if (!h) return null;
  const now = Date.now();
  let hit = byHost.get(h);
  if (!hit || now - hit.at > CACHE_MS) {
    await ensureControlSchema();
    const r = await controlPool().query<SiteRecord>(
      `SELECT s.id, s.slug, s.status, s.db_host, s.db_port, s.db_name
         FROM site_domains d JOIN sites s ON s.id = d.site_id
        WHERE d.domain = $1`,
      [h],
    );
    hit = { at: now, site: r.rows[0] ?? null };
    byHost.set(h, hit);
  }
  const site = hit.site;
  if (!site || !SERVABLE.has(site.status)) return null;
  if (!listSiteIds().includes(site.id)) registerSitePool(site.id, new pg.Pool({ connectionString: siteConnectionString(site), max: SITE_POOL_MAX }));
  return site.id;
}

/** Chuỗi kết nối của site: thông tin đăng nhập của DATABASE_URL (B2a), máy chủ / cổng / database theo registry. */
function siteConnectionString(site: SiteRecord): string {
  const u = new URL(env.DATABASE_URL);
  u.hostname = site.db_host;
  u.port = String(site.db_port);
  u.pathname = `/${site.db_name}`;
  return u.toString();
}

export function invalidateSiteCache(): void {
  byHost.clear();
}

/** Đóng pool của database điều khiển (tắt ứng dụng / test). Pool của từng site đóng cùng db (endAllSitePools). */
export async function closeSiteRegistry(): Promise<void> {
  byHost.clear();
  schemaReady = undefined;
  const p = control;
  control = undefined;
  await p?.end();
}
