// @bizcity-layer P data
// [2026-11-22 11:19 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B3 (ADR-0036, D039-11, D039-12, R-SITE-8, R-SITE-9, R-SITE-10): Migration Runner theo site — database mẫu trước, rồi từng site; sao lưu trước mỗi site; site lỗi dừng riêng
/**
 * MIGRATION RUNNER THEO SITE (PHASE-039 B3, lệnh `bizcity site migrate`).
 *
 *   1. database mẫu (`SITE_TEMPLATE_DB`) — lỗi thì DỪNG HẲN, không chạm site nào (R-SITE-8: không nâng site khi mẫu chưa nâng xong)
 *   2. chọn site cần nâng: `schema_version` khác bản cần, hoặc đang `upgrading` / `migration_failed` (chạy lại được)
 *   3. chuyển các site đó sang `upgrading` (nhớ trạng thái cũ ở `resume_status`), đợi bộ đệm tên miền của ứng dụng hết hạn
 *      (`drainMs`, mặc định 35 giây > 30 giây bộ đệm) — từ lúc này ứng dụng trả 503 SITE_UPGRADING cho site đó, việc nền bỏ qua
 *   4. từng site, tuần tự: sao lưu (B6a: backupSite — tự kiểm, ghi site_backups) → migration lõi → migration module (`extra`, lớp gọi truyền vào) → kiểm `schema_version`
 *      xong: trạng thái cũ + `schema_version` mới · lỗi: `migration_failed` + câu lỗi, đi tiếp site sau (R-SITE-10)
 *
 * Kết nối: vai trò quản trị (PROVISION_DATABASE_URL, trống = DATABASE_URL) đổi tên database — chủ sở hữu bảng của site tạo từ mẫu.
 * Không có migration lùi (R-REL-5): lùi một site = khôi phục bản sao lưu vừa tạo (đường dẫn có trong kết quả).
 */
import path from 'node:path';
import pg from 'pg';
import { appliedSchemaVersion, requiredSchemaVersion, runMigrations } from './migrate.js';
import { adminUrlFor, provisionerConfig } from './site-provisioner.js';
import { controlPool, ensureControlSchema, invalidateSiteCache } from './site-registry.js';
import { backupSite, pgToolsAvailable } from './site-backup.js';

export type SiteMigrateOutcome = 'migrated' | 'up-to-date' | 'failed';

export interface SiteMigrateResult {
  slug: string;
  siteId: string;
  outcome: SiteMigrateOutcome;
  /** Migration đã áp (lõi + module). */
  applied: string[];
  schemaVersion: string | null;
  /** Bản sao lưu tạo trước khi nâng (để lùi). */
  backup?: string;
  error?: string;
}

export interface SiteMigrateReport {
  required: string;
  template: { db: string; applied: string[] };
  sites: SiteMigrateResult[];
  failed: number;
}

/** Sao lưu một database trước khi nâng; trả đường dẫn tệp. Ném lỗi = không nâng site đó. */
export type SiteBackup = (site: { siteId: string; slug: string; dbName: string; connectionString: string }) => Promise<string>;

export interface MigrateSitesOptions {
  /** Chỉ các site này (slug); trống = mọi site chưa xoá. */
  slugs?: string[];
  /** Thư mục migration lõi; trống = db/migrations (ca kiểm truyền thư mục tạm). */
  dir?: string;
  /** Migration module trên một database (lớp gọi truyền vào: module SDK nằm ở apps/api). Trả tên đã áp. */
  extra?: (connectionString: string, log: (m: string) => void) => Promise<string[]>;
  /** Cách sao lưu; trống = pg_dump vào `backupDir`. */
  backup?: SiteBackup;
  backupDir?: string;
  /** Bỏ sao lưu (người vận hành tự chịu, vd đã có bản PITR). */
  skipBackup?: boolean;
  /** Thời gian đợi bộ đệm tên miền của ứng dụng hết hạn sau khi chuyển site sang `upgrading`. */
  drainMs?: number;
  log?: (m: string) => void;
}

export type SiteMigrateCode = 'SITE_BACKUP_UNAVAILABLE' | 'SITE_TEMPLATE_MIGRATION_FAILED' | 'SITE_UNKNOWN';

export class SiteMigrateError extends Error {
  constructor(readonly code: SiteMigrateCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SiteMigrateError';
  }
}

const DRAIN_MS = 35_000;

interface Row { id: string; slug: string; status: string; db_name: string; schema_version: string | null }

/** Câu lỗi ngắn để lưu registry: bỏ chuỗi kết nối nếu lỡ có. */
const shortError = (err: unknown): string => String((err as Error)?.message ?? err).replace(/postgres(ql)?:\/\/\S+/g, '<kết nối>').slice(0, 500);

// [2026-11-22 12:06 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B6a: sao lưu mặc định = backupSite (tự kiểm, ghi site_backups, lý do migrate); công cụ pg_dump ở site-backup.ts
/** Có pg_dump / pg_restore trên máy chạy lệnh không. */
export const pgDumpAvailable = pgToolsAvailable;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Nâng lược đồ database mẫu rồi từng site (xem đầu tệp). Không ném khi một site lỗi: lỗi nằm trong báo cáo. */
export async function migrateSites(opts: MigrateSitesOptions = {}): Promise<SiteMigrateReport> {
  const log = opts.log ?? (() => {});
  const required = requiredSchemaVersion(opts.dir);
  await ensureControlSchema();
  const ctl = controlPool();

  // Sao lưu: kiểm trước khi chạm bất cứ gì (thiếu pg_dump thì dừng, không để nửa chừng)
  let backup: SiteBackup | undefined;
  if (!opts.skipBackup) {
    if (opts.backup) backup = opts.backup;
    else if (await pgDumpAvailable()) {
      const dir = opts.backupDir ?? path.join('backups', 'sites');
      backup = async ({ siteId }) => (await backupSite(siteId, { dir, reason: 'migrate' })).file;
    }
    else throw new SiteMigrateError('SITE_BACKUP_UNAVAILABLE', 'Không có pg_dump trên máy chạy lệnh: cài pg_dump (cùng bản PostgreSQL) hoặc chạy lại với --skip-backup nếu đã có bản sao lưu khác');
  }

  // Chọn site
  const rows = (await ctl.query<Row>(
    `SELECT id, slug, status, db_name, schema_version FROM sites WHERE status <> 'deleted' AND status <> 'provisioning' ORDER BY slug`,
  )).rows;
  const wanted = opts.slugs?.length ? opts.slugs : undefined;
  if (wanted) {
    const unknown = wanted.filter((s) => !rows.some((r) => r.slug === s));
    if (unknown.length) throw new SiteMigrateError('SITE_UNKNOWN', `Không có site: ${unknown.join(', ')}`);
  }
  const chosen = wanted ? rows.filter((r) => wanted.includes(r.slug)) : rows;

  // 1. database mẫu
  const { templateDb } = provisionerConfig();
  let templateApplied: string[] = [];
  if (templateDb) {
    try {
      const url = adminUrlFor(templateDb);
      templateApplied = await runMigrations(log, { connectionString: url, ...(opts.dir ? { dir: opts.dir } : {}) });
      if (opts.extra) templateApplied.push(...await opts.extra(url, log));
      log(`Database mẫu ${templateDb}: ${templateApplied.length ? `áp ${templateApplied.length} migration` : 'đã mới nhất'}`);
    } catch (err) {
      throw new SiteMigrateError('SITE_TEMPLATE_MIGRATION_FAILED', `Database mẫu ${templateDb} nâng lỗi — không site nào bị chạm: ${shortError(err)}`, { cause: err });
    }
  }

  // 2–3. site cần nâng → upgrading
  const results: SiteMigrateResult[] = [];
  const todo: Row[] = [];
  for (const r of chosen) {
    if (r.schema_version === required && (r.status === 'active' || r.status === 'suspended')) {
      results.push({ slug: r.slug, siteId: r.id, outcome: 'up-to-date', applied: [], schemaVersion: r.schema_version });
    } else todo.push(r);
  }
  if (todo.length) {
    await ctl.query(
      `UPDATE sites SET resume_status = CASE WHEN status IN ('active', 'suspended') THEN status ELSE coalesce(resume_status, 'active') END,
                        status = 'upgrading', updated_at = now()
        WHERE id = ANY($1::text[])`,
      [todo.map((r) => r.id)],
    );
    invalidateSiteCache();
    const drain = opts.drainMs ?? DRAIN_MS;
    if (drain > 0) {
      log(`Chuyển ${todo.length} site sang "đang nâng cấp"; đợi ${Math.round(drain / 1000)} giây cho ứng dụng thôi phục vụ…`);
      await sleep(drain);
    }
  }

  // 4. từng site
  for (const r of todo) {
    const res: SiteMigrateResult = { slug: r.slug, siteId: r.id, outcome: 'failed', applied: [], schemaVersion: r.schema_version };
    const url = adminUrlFor(r.db_name);
    try {
      if (backup) {
        res.backup = await backup({ siteId: r.id, slug: r.slug, dbName: r.db_name, connectionString: url });
        log(`  ${r.slug}: đã sao lưu ${res.backup}`);
      }
      res.applied = await runMigrations(log, { connectionString: url, ...(opts.dir ? { dir: opts.dir } : {}) });
      if (opts.extra) res.applied.push(...await opts.extra(url, log));
      const c = new pg.Client({ connectionString: url });
      await c.connect();
      try { res.schemaVersion = await appliedSchemaVersion(c); } finally { await c.end(); }
      if (res.schemaVersion !== required) throw new Error(`lược đồ sau khi nâng là ${res.schemaVersion ?? '(trống)'}, cần ${required}`);
      await ctl.query(
        `UPDATE sites SET status = coalesce(resume_status, 'active'), resume_status = NULL, schema_version = $2,
                          migrated_at = now(), migration_error = NULL, updated_at = now()
          WHERE id = $1`,
        [r.id, res.schemaVersion],
      );
      res.outcome = 'migrated';
      log(`  ${r.slug}: xong — ${res.applied.length} migration, lược đồ ${res.schemaVersion}`);
    } catch (err) {
      res.error = shortError(err);
      await ctl.query(
        `UPDATE sites SET status = 'migration_failed', migration_error = $2, updated_at = now() WHERE id = $1`,
        [r.id, res.error],
      );
      log(`  ${r.slug}: LỖI — ${res.error}`);
    }
    results.push(res);
  }
  invalidateSiteCache();
  results.sort((a, b) => a.slug.localeCompare(b.slug));
  return { required, template: { db: templateDb ?? '', applied: templateApplied }, sites: results, failed: results.filter((x) => x.outcome === 'failed').length };
}
