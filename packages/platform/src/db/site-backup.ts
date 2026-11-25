// @bizcity-layer P data
// [2026-11-22 12:06 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B6a (ADR-0036, D039-13, R-SITE-10): Backup Manager theo site — sao lưu đã kiểm, khôi phục vào database tạm rồi đổi tên
/**
 * BACKUP MANAGER THEO SITE (PHASE-039 B6a; lệnh `bizcity site backup`, `bizcity site restore`).
 *
 *   backupSite(site)    pg_dump -Fc database của site → `<thư mục>/<slug>/<slug>-<giờ UTC>.dump` → tự kiểm (pg_restore --list:
 *                       đọc được, có dữ liệu `ledger_entries`, đếm bảng) → ghi `site_backups`. Hỏng: tệp đổi đuôi `.hong`, ném lỗi.
 *                       `keep`: giữ N bản mới nhất của site, xoá tệp + dòng cũ hơn.
 *   importBackup(site, file) tệp .dump làm ngoài lệnh (vd pg_dump từ cụm PITR tạm) → tự kiểm → ghi  lý do 
 *   restoreSite(site, backupId)
 *                       kiểm lại tệp → database tạm `kt_<slug>_kp_<giờ>` (template0) → pg_restore → đối chiếu số bảng, có sổ cái
 *                       → site `upgrading` (503, việc nền dừng), đợi bộ đệm → ngắt kết nối → đổi tên: database đang chạy thành
 *                       `kt_<slug>_cu_<giờ>` (giữ để lùi), database tạm thành tên của site → trả trạng thái cũ. Site khác không bị chạm.
 *
 * Lược đồ của bản khôi phục cũ hơn ứng dụng → cổng lược đồ chặn (SITE_UPGRADING) tới khi chạy `site migrate` (kết quả báo).
 * Công cụ pg_dump / pg_restore thay được (`setPgToolsForTest`: ca kiểm chạy công cụ trong container của database).
 */
import { spawn } from 'node:child_process';
import { mkdir, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { appliedSchemaVersion } from './migrate.js';
import { adminUrlFor, newSiteId, provisionerConfig } from './site-provisioner.js';
import { controlPool, ensureControlSchema, invalidateSiteCache } from './site-registry.js';

/** Ba thao tác cần của bộ công cụ PostgreSQL. `connectionString` có mật khẩu — không ghi vào nhật ký. */
export interface PgTools {
  available(): Promise<boolean>;
  dump(connectionString: string, file: string): Promise<void>;
  /** Mục lục của bản sao lưu (pg_restore --list). */
  list(file: string): Promise<string>;
  restore(connectionString: string, file: string): Promise<void>;
}

/**
 * Chạy một lệnh, gom stdout / stderr thành chuỗi. Không tìm thấy lệnh → mã -1, không ném. Tệp sao lưu do chính pg_dump ghi
 * (`--file`), không đẩy luồng qua đây.
 */
export function runTool(cmd: string, args: string[], opts: { env?: NodeJS.ProcessEnv } = {}): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    const p = spawn(cmd, args, { env: opts.env ?? process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout?.on('data', (d: Buffer) => { out += d.toString(); });
    p.stderr?.on('data', (d: Buffer) => { err += d.toString(); });
    p.on('error', (e) => resolve({ code: -1, out, err: e.message }));
    p.on('close', (code) => resolve({ code: code ?? -1, out, err }));
  });
}

const connArgs = (connectionString: string) => {
  const u = new URL(connectionString);
  return {
    args: [`--host=${u.hostname}`, `--port=${u.port || '5432'}`, `--username=${decodeURIComponent(u.username)}`],
    db: decodeURIComponent(u.pathname.slice(1)),
    env: { ...process.env, PGPASSWORD: decodeURIComponent(u.password) },
  };
};
const fail = (what: string, r: { code: number; err: string }) => new Error(`${what} lỗi (mã ${r.code}): ${r.err.trim().slice(0, 300)}`);

/** pg_dump / pg_restore trên máy chạy lệnh (ảnh api có bản 16). Mật khẩu qua PGPASSWORD, không nằm trên dòng lệnh. */
export const localPgTools: PgTools = {
  async available() { return (await runTool('pg_dump', ['--version'])).code === 0 && (await runTool('pg_restore', ['--version'])).code === 0; },
  async dump(connectionString, file) {
    const c = connArgs(connectionString);
    const r = await runTool('pg_dump', ['--format=custom', `--file=${file}`, ...c.args, c.db], { env: c.env });
    if (r.code !== 0) throw fail('pg_dump', r);
  },
  async list(file) {
    const r = await runTool('pg_restore', ['--list', file]);
    if (r.code !== 0) throw fail('pg_restore --list', r);
    return r.out;
  },
  async restore(connectionString, file) {
    const c = connArgs(connectionString);
    const r = await runTool('pg_restore', ['--exit-on-error', `--dbname=${c.db}`, ...c.args, file], { env: c.env });
    if (r.code !== 0) throw fail('pg_restore', r);
  },
};

let tools: PgTools = localPgTools;
/** Đổi bộ công cụ (trống = công cụ trên máy). Chỉ cho test. */
export function setPgToolsForTest(t: PgTools | undefined): void { tools = t ?? localPgTools; }
export const pgToolsAvailable = (): Promise<boolean> => tools.available();

export type SiteBackupCode = 'SITE_UNKNOWN' | 'SITE_BACKUP_UNAVAILABLE' | 'SITE_BACKUP_FAILED' | 'SITE_BACKUP_NOT_FOUND' | 'SITE_RESTORE_FAILED';

export class SiteBackupError extends Error {
  constructor(readonly code: SiteBackupCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SiteBackupError';
  }
}

interface SiteRow { id: string; slug: string; status: string; db_name: string; db_app_role: string | null; schema_version: string | null }
export interface BackupRecord { id: string; siteId: string; slug: string; file: string; bytes: number; tables: number; schemaVersion: string | null; reason: string; createdAt: string }

const stampUtc = (d = new Date()) => d.toISOString().replace(/[-:]/g, '').replace(/\..+$/, '');
const shortError = (err: unknown): string => String((err as Error)?.message ?? err).replace(/postgres(ql)?:\/\/\S+/g, '<kết nối>').slice(0, 500);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Mã site hoặc slug → dòng registry (site chưa xoá, không đang tạo). */
async function findSite(ref: string): Promise<SiteRow> {
  await ensureControlSchema();
  const r = await controlPool().query<SiteRow>(
    `SELECT id, slug, status, db_name, db_app_role, schema_version FROM sites
      WHERE (id = $1 OR slug = $1) AND status NOT IN ('deleted', 'provisioning')`,
    [ref],
  );
  if (!r.rows[0]) throw new SiteBackupError('SITE_UNKNOWN', `Không có site đang chạy: ${ref}`);
  return r.rows[0];
}

/** Đọc mục lục bản sao lưu: số bảng, có dữ liệu sổ cái. Không đọc được → ném. */
export async function inspectBackup(file: string): Promise<{ tables: number; ledger: boolean }> {
  const toc = await tools.list(file);
  const lines = toc.split(/\r?\n/);
  return {
    // mục "TABLE <schema> <tên>" = định nghĩa bảng; "TABLE DATA" / "TABLE ATTACH" là dữ liệu / gắn phân vùng — không đếm
    tables: lines.filter((l) => /^\d+; \d+ \d+ TABLE (?!DATA |ATTACH )\S+ \S+/.test(l)).length,
    ledger: lines.some((l) => /^\d+; \d+ \d+ TABLE DATA public ledger_entries /.test(l)),
  };
}

export interface BackupSiteOptions {
  /** Thư mục gốc; tệp ở `<dir>/<slug>/`. Trống = backups/sites. */
  dir?: string;
  reason?: 'manual' | 'schedule' | 'migrate';
  /** Giữ N bản mới nhất của site (đếm cả bản vừa tạo); trống = giữ hết. */
  keep?: number;
}

/** Sao lưu một site (mã hoặc slug), tự kiểm, ghi `site_backups`. */
export async function backupSite(ref: string, opts: BackupSiteOptions = {}): Promise<BackupRecord & { pruned: string[] }> {
  const site = await findSite(ref);
  if (!(await tools.available())) throw new SiteBackupError('SITE_BACKUP_UNAVAILABLE', 'Không có pg_dump / pg_restore trên máy chạy lệnh (ảnh api có sẵn bản 16)');
  const dir = path.resolve(opts.dir ?? path.join('backups', 'sites'), site.slug);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${site.slug}-${stampUtc()}.dump`);
  let info: { tables: number; ledger: boolean };
  try {
    await tools.dump(adminUrlFor(site.db_name), file);
    info = await inspectBackup(file);
    if (!info.ledger) throw new Error('bản sao lưu thiếu dữ liệu sổ cái (ledger_entries)');
    if (info.tables === 0) throw new Error('bản sao lưu không có bảng nào');
  } catch (err) {
    await rename(file, `${file}.hong`).catch(() => undefined);
    throw new SiteBackupError('SITE_BACKUP_FAILED', `Sao lưu ${site.slug} hỏng: ${shortError(err)}`, { cause: err });
  }
  const bytes = (await stat(file)).size;
  const id = newSiteId();
  const reason = opts.reason ?? 'manual';
  const ins = await controlPool().query<{ created_at: Date }>(
    `INSERT INTO site_backups (id, site_id, file, bytes, tables, schema_version, reason, verified)
     VALUES ($1, $2, $3, $4, $5, $6, $7, true) RETURNING created_at`,
    [id, site.id, file, bytes, info.tables, site.schema_version, reason],
  );
  // [2026-11-22 03:26 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B5c: bản sao lưu mới là một thay đổi của site — phía gọi đồng bộ theo updatedAfter thấy được
  await controlPool().query('UPDATE sites SET updated_at = now() WHERE id = $1', [site.id]);
  const pruned: string[] = [];
  if (opts.keep !== undefined && opts.keep >= 1) {
    const old = await controlPool().query<{ id: string; file: string }>(
      'SELECT id, file FROM site_backups WHERE site_id = $1 ORDER BY created_at DESC, id DESC OFFSET $2',
      [site.id, opts.keep],
    );
    for (const b of old.rows) {
      await unlink(b.file).catch(() => undefined);
      await controlPool().query('DELETE FROM site_backups WHERE id = $1', [b.id]);
      pruned.push(b.file);
    }
  }
  return { id, siteId: site.id, slug: site.slug, file, bytes, tables: info.tables, schemaVersion: site.schema_version, reason, createdAt: ins.rows[0]!.created_at.toISOString(), pruned };
}

// [2026-11-22 12:35 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B6a: nhận tệp sao lưu làm ngoài lệnh (sổ tay lấy một site từ PITR)
/** Ghi một tệp .dump có sẵn làm bản sao lưu của site (tự kiểm như backupSite). Tệp giữ nguyên chỗ; lược đồ đọc lúc khôi phục. */
export async function importBackup(ref: string, file: string): Promise<BackupRecord> {
  const site = await findSite(ref);
  if (!(await tools.available())) throw new SiteBackupError('SITE_BACKUP_UNAVAILABLE', 'Không có pg_dump / pg_restore trên máy chạy lệnh');
  const abs = path.resolve(file);
  let info: { tables: number; ledger: boolean };
  try {
    info = await inspectBackup(abs);
  } catch (err) {
    throw new SiteBackupError('SITE_BACKUP_FAILED', `Không đọc được tệp ${abs}: ${shortError(err)}`, { cause: err });
  }
  if (!info.ledger || info.tables === 0) throw new SiteBackupError('SITE_BACKUP_FAILED', `Tệp ${abs} không phải bản sao lưu sổ kế toán (thiếu ledger_entries hoặc không có bảng)`);
  const bytes = (await stat(abs)).size;
  const id = newSiteId();
  const ins = await controlPool().query<{ created_at: Date }>(
    `INSERT INTO site_backups (id, site_id, file, bytes, tables, schema_version, reason, verified)
     VALUES ($1, $2, $3, $4, $5, NULL, 'import', true) RETURNING created_at`,
    [id, site.id, abs, bytes, info.tables],
  );
  await controlPool().query('UPDATE sites SET updated_at = now() WHERE id = $1', [site.id]);
  return { id, siteId: site.id, slug: site.slug, file: abs, bytes, tables: info.tables, schemaVersion: null, reason: 'import', createdAt: ins.rows[0]!.created_at.toISOString() };
}

/** Các bản sao lưu đã ghi (mới trước); `ref` = mã hoặc slug của site, trống = mọi site. */
export async function listBackups(ref?: string): Promise<BackupRecord[]> {
  await ensureControlSchema();
  const r = await controlPool().query<{ id: string; site_id: string; slug: string; file: string; bytes: string; tables: number; schema_version: string | null; reason: string; created_at: Date }>(
    `SELECT b.id, b.site_id, s.slug, b.file, b.bytes, b.tables, b.schema_version, b.reason, b.created_at
       FROM site_backups b JOIN sites s ON s.id = b.site_id
      WHERE $1::text IS NULL OR s.id = $1 OR s.slug = $1
      ORDER BY b.created_at DESC, b.id DESC`,
    [ref ?? null],
  );
  return r.rows.map((b) => ({ id: b.id, siteId: b.site_id, slug: b.slug, file: b.file, bytes: Number(b.bytes), tables: b.tables, schemaVersion: b.schema_version, reason: b.reason, createdAt: b.created_at.toISOString() }));
}

async function ddl(c: pg.Client, template: string, ...args: string[]): Promise<void> {
  const r = await c.query<{ q: string }>('SELECT format($1, VARIADIC $2::text[]) AS q', [template, args]);
  await c.query(r.rows[0]!.q);
}

export interface RestoreSiteOptions {
  /** Đợi bộ đệm tên miền của ứng dụng hết hạn sau khi chặn site (mặc định 35 giây). */
  drainMs?: number;
  log?: (m: string) => void;
}

export interface RestoreResult {
  siteId: string;
  slug: string;
  backupId: string;
  /** Database trước khi khôi phục, giữ để lùi. */
  previousDb: string;
  schemaVersion: string | null;
  /** Lược đồ của bản khôi phục khác bản ghi trong registry trước đó → chạy `site migrate` nếu ứng dụng mới hơn. */
  schemaChanged: boolean;
}

/** Khôi phục một site từ một bản sao lưu của chính nó (xem đầu tệp). Site khác không bị chạm. */
export async function restoreSite(ref: string, backupId: string, opts: RestoreSiteOptions = {}): Promise<RestoreResult> {
  const log = opts.log ?? (() => {});
  const site = await findSite(ref);
  const ctl = controlPool();
  const b = (await ctl.query<{ id: string; file: string; tables: number; verified: boolean }>(
    'SELECT id, file, tables, verified FROM site_backups WHERE id = $1 AND site_id = $2', [backupId, site.id])).rows[0];
  if (!b || !b.verified) throw new SiteBackupError('SITE_BACKUP_NOT_FOUND', `Site ${site.slug} không có bản sao lưu đã kiểm mã ${backupId}`);
  if (!(await tools.available())) throw new SiteBackupError('SITE_BACKUP_UNAVAILABLE', 'Không có pg_dump / pg_restore trên máy chạy lệnh');
  const info = await inspectBackup(b.file).catch((err: unknown) => {
    throw new SiteBackupError('SITE_BACKUP_NOT_FOUND', `Không đọc được tệp sao lưu ${b.file}: ${shortError(err)}`, { cause: err });
  });
  if (!info.ledger || info.tables !== b.tables) throw new SiteBackupError('SITE_RESTORE_FAILED', `Tệp ${b.file} không khớp bản đã kiểm (bảng ${info.tables}/${b.tables})`);

  const stamp = stampUtc().toLowerCase();
  const tmpDb = `${site.db_name}_kp_${stamp}`;
  const oldDb = `${site.db_name}_cu_${stamp}`;
  const { parentRole } = provisionerConfig();
  const admin = new pg.Client({ connectionString: adminUrlFor('postgres') });
  await admin.connect();
  let blocked = false;
  let swapped = false;
  try {
    // 1. database tạm, quyền CONNECT như database của site
    await ddl(admin, 'CREATE DATABASE %I TEMPLATE template0', tmpDb);
    await ddl(admin, 'REVOKE CONNECT, TEMPORARY ON DATABASE %I FROM PUBLIC', tmpDb);
    await ddl(admin, 'REVOKE CONNECT, TEMPORARY ON DATABASE %I FROM %I', tmpDb, parentRole);
    log(`  ${site.slug}: khôi phục vào ${tmpDb}…`);
    await tools.restore(adminUrlFor(tmpDb), b.file);

    // 2. đối chiếu
    const c = new pg.Client({ connectionString: adminUrlFor(tmpDb) });
    await c.connect();
    let schemaVersion: string | null;
    try {
      const n = Number((await c.query<{ n: string }>(
        `SELECT count(*) AS n FROM pg_class k JOIN pg_namespace s ON s.oid = k.relnamespace
          WHERE k.relkind IN ('r', 'p') AND s.nspname NOT IN ('pg_catalog', 'information_schema') AND s.nspname NOT LIKE 'pg\\_toast%'`)).rows[0]!.n);
      if (n !== b.tables) throw new Error(`số bảng sau khôi phục ${n}, bản sao lưu có ${b.tables}`);
      if (!(await c.query("SELECT to_regclass('public.ledger_entries') AS t")).rows[0]?.t) throw new Error('thiếu bảng sổ cái');
      schemaVersion = await appliedSchemaVersion(c);
    } finally {
      await c.end();
    }

    // 3. chặn site (503 + việc nền dừng), đợi bộ đệm
    await ctl.query(
      `UPDATE sites SET resume_status = CASE WHEN status IN ('active', 'suspended') THEN status ELSE coalesce(resume_status, 'active') END,
                        status = 'upgrading', updated_at = now() WHERE id = $1`, [site.id]);
    blocked = true;
    invalidateSiteCache();
    const drain = opts.drainMs ?? 35_000;
    if (drain > 0) { log(`  ${site.slug}: chặn site, đợi ${Math.round(drain / 1000)} giây…`); await sleep(drain); }

    // 4. ngắt kết nối, đổi tên hai database (thử lại khi còn kết nối mới chen vào)
    for (let attempt = 1; ; attempt++) {
      await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', [site.db_name]);
      try { await ddl(admin, 'ALTER DATABASE %I RENAME TO %I', site.db_name, oldDb); break; } catch (err) {
        if ((err as { code?: string }).code !== '55006' || attempt >= 5) throw err;
        await sleep(200);
      }
    }
    try {
      await ddl(admin, 'ALTER DATABASE %I RENAME TO %I', tmpDb, site.db_name);
    } catch (err) {
      await ddl(admin, 'ALTER DATABASE %I RENAME TO %I', oldDb, site.db_name).catch(() => undefined);
      throw err;
    }
    swapped = true;
    if (site.db_app_role) {
      await ddl(admin, 'GRANT CONNECT ON DATABASE %I TO %I', site.db_name, site.db_app_role);
      await ddl(admin, 'REVOKE CONNECT, TEMPORARY ON DATABASE %I FROM %I', oldDb, site.db_app_role);
    }

    // 5. mở lại site
    await ctl.query(
      `UPDATE sites SET status = coalesce(resume_status, 'active'), resume_status = NULL, schema_version = $2,
                        restored_at = now(), restored_from = $3, previous_db = $4, updated_at = now() WHERE id = $1`,
      [site.id, schemaVersion, b.id, oldDb]);
    invalidateSiteCache();
    log(`  ${site.slug}: xong — database cũ giữ ở ${oldDb}`);
    return { siteId: site.id, slug: site.slug, backupId: b.id, previousDb: oldDb, schemaVersion, schemaChanged: schemaVersion !== site.schema_version };
  } catch (err) {
    if (!swapped) {
      await ddl(admin, 'DROP DATABASE IF EXISTS %I WITH (FORCE)', tmpDb).catch(() => undefined);
      if (blocked) {
        await ctl.query(`UPDATE sites SET status = coalesce(resume_status, 'active'), resume_status = NULL, updated_at = now() WHERE id = $1`, [site.id]).catch(() => undefined);
        invalidateSiteCache();
      }
    }
    if (err instanceof SiteBackupError) throw err;
    throw new SiteBackupError('SITE_RESTORE_FAILED', `Khôi phục ${site.slug} lỗi, site giữ nguyên database cũ: ${shortError(err)}`, { cause: err });
  } finally {
    await admin.end().catch(() => undefined);
  }
}
