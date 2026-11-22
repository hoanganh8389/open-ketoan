// @bizcity-layer P data
// [2026-11-22 01:18 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B6b (ADR-0036, D039-15, Q039-1, R-SITE-12): vòng đời site — khoá chỉ đọc, mở lại, xoá mềm, lấy lại, dọn
/**
 * VÒNG ĐỜI SITE (PHASE-039 B6b; lệnh `bizcity site suspend / resume / delete / undelete / sweep`).
 *
 *   suspendSite   active → suspended. Chỉ đọc ở tầng HTTP (request-context: xem / in / xuất / đăng nhập được, ghi → 423
 *                 SITE_SUSPENDED). Database vẫn ghi được (phiên đăng nhập, việc nền). Có hiệu lực ở mọi tiến trình trong ≤ 30 giây.
 *   resumeSite    suspended → active.
 *   deleteSite    XOÁ MỀM (D039-15, R-SITE-12): cần site đang khoá + bản sao lưu đã kiểm ≤ 24 giờ. Ngắt kết nối, thu CONNECT của vai
 *                 trò ứng dụng, đổi tên database thành `kt_<slug>_xoa_<giờ>`; `deleted` → tên miền trả 404. Lấy lại được 30 ngày.
 *   undeleteSite  deleted (chưa dọn) → đổi tên lại, cấp lại CONNECT, `suspended` (người vận hành mở lại sau khi kiểm).
 *   addSiteDomain / removeSiteDomain   thêm / bỏ tên miền (B5b); không bỏ được tên miền chính; `primary` đổi tên miền chính.
 *   sweepSites    dọn: database `_cu_` (trước lần khôi phục) quá 7 ngày, `_kp_` (khôi phục dở) quá 1 ngày, site xoá mềm quá 30
 *                 ngày (DROP database + vai trò ứng dụng, gỡ tên miền, ghi purged_at). `dryRun` chỉ liệt kê.
 *
 * Chỉ chạm database có tên dựng từ `db_name` của site trong registry — không dọn database lạ trên cụm.
 */
import pg from 'pg';
import { unregisterSitePool } from './site.js';
import { adminUrlFor, provisionerConfig } from './site-provisioner.js';
import { controlPool, ensureControlSchema, invalidateSiteCache } from './site-registry.js';

export type SiteLifecycleCode = 'SITE_UNKNOWN' | 'SITE_STATE_INVALID' | 'SITE_BACKUP_REQUIRED'
  // [2026-11-22 01:29 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B5b: tên miền của site
  | 'SITE_DOMAIN_INVALID' | 'SITE_DOMAIN_TAKEN' | 'SITE_DOMAIN_PRIMARY' | 'SITE_DOMAIN_UNKNOWN';

export class SiteLifecycleError extends Error {
  constructor(readonly code: SiteLifecycleCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SiteLifecycleError';
  }
}

interface Row {
  id: string; slug: string; status: string; db_name: string; db_app_role: string | null;
  deleted_db: string | null; deleted_at: Date | null; purged_at: Date | null; previous_db: string | null;
}
const COLS = 'id, slug, status, db_name, db_app_role, deleted_db, deleted_at, purged_at, previous_db';

const DAY = 86_400_000;
const KEEP_PREVIOUS_MS = 7 * DAY;
const KEEP_RESTORE_TMP_MS = DAY;
const KEEP_DELETED_MS = 30 * DAY;
const BACKUP_MAX_AGE_MS = DAY;

const stampUtc = (d = new Date()) => d.toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').toLowerCase();
/** `…_<yyyymmdd>t<hhmmss>` → thời điểm (UTC). */
function stampTime(name: string): number | null {
  const m = /_(\d{4})(\d{2})(\d{2})t(\d{2})(\d{2})(\d{2})$/.exec(name);
  return m ? Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!) : null;
}

async function findSite(ref: string): Promise<Row> {
  await ensureControlSchema();
  const r = await controlPool().query<Row>(`SELECT ${COLS} FROM sites WHERE id = $1 OR slug = $1`, [ref]);
  if (!r.rows[0]) throw new SiteLifecycleError('SITE_UNKNOWN', `Không có site: ${ref}`);
  return r.rows[0];
}

async function admin<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: adminUrlFor('postgres') });
  await c.connect();
  try { return await fn(c); } finally { await c.end().catch(() => undefined); }
}

async function ddl(c: pg.Client, template: string, ...args: string[]): Promise<void> {
  const r = await c.query<{ q: string }>('SELECT format($1, VARIADIC $2::text[]) AS q', [template, args]);
  await c.query(r.rows[0]!.q);
}

/** Ngắt kết nối rồi đổi tên database; thử lại khi có kết nối mới chen vào (55006). */
async function renameDb(c: pg.Client, from: string, to: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    await c.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', [from]);
    try { await ddl(c, 'ALTER DATABASE %I RENAME TO %I', from, to); return; } catch (err) {
      if ((err as { code?: string }).code !== '55006' || attempt >= 5) throw err;
      await new Promise((r) => setTimeout(r, 200));
    }
  }
}

const dbExists = async (c: pg.Client, name: string) => (await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])).rowCount === 1;

export interface SiteState { siteId: string; slug: string; status: string }

/** Khoá site: chỉ đọc (Q039-1). Đang khoá thì trả lại như cũ (gọi lại không hại). */
export async function suspendSite(ref: string, reason = ''): Promise<SiteState> {
  const s = await findSite(ref);
  if (s.status !== 'active' && s.status !== 'suspended') {
    throw new SiteLifecycleError('SITE_STATE_INVALID', `Site ${s.slug} đang "${s.status}": chỉ khoá được site đang chạy`);
  }
  await controlPool().query(
    `UPDATE sites SET status = 'suspended', suspended_at = coalesce(suspended_at, now()), suspend_reason = $2, updated_at = now() WHERE id = $1`,
    [s.id, reason.slice(0, 500) || null],
  );
  invalidateSiteCache();
  return { siteId: s.id, slug: s.slug, status: 'suspended' };
}

/** Mở lại site đang khoá. Đang chạy thì trả lại như cũ. */
export async function resumeSite(ref: string): Promise<SiteState> {
  const s = await findSite(ref);
  if (s.status !== 'active' && s.status !== 'suspended') {
    throw new SiteLifecycleError('SITE_STATE_INVALID', `Site ${s.slug} đang "${s.status}": chỉ mở lại được site đang khoá`);
  }
  await controlPool().query(
    `UPDATE sites SET status = 'active', suspended_at = NULL, suspend_reason = NULL, updated_at = now() WHERE id = $1`, [s.id]);
  invalidateSiteCache();
  return { siteId: s.id, slug: s.slug, status: 'active' };
}

/** Xoá mềm (D039-15). Trả tên database đã đổi (lấy lại được tới khi dọn, sau 30 ngày). */
export async function deleteSite(ref: string, now = Date.now()): Promise<SiteState & { deletedDb: string; purgeAfter: string }> {
  const s = await findSite(ref);
  if (s.status !== 'suspended') {
    throw new SiteLifecycleError('SITE_STATE_INVALID', `Site ${s.slug} đang "${s.status}": phải khoá site trước khi xoá (bizcity site suspend)`);
  }
  const b = await controlPool().query<{ created_at: Date }>(
    'SELECT created_at FROM site_backups WHERE site_id = $1 AND verified ORDER BY created_at DESC LIMIT 1', [s.id]);
  const last = b.rows[0]?.created_at.getTime();
  if (last === undefined || now - last > BACKUP_MAX_AGE_MS) {
    throw new SiteLifecycleError('SITE_BACKUP_REQUIRED', `Site ${s.slug} cần một bản sao lưu đã kiểm trong 24 giờ trước khi xoá (bizcity site backup --slug ${s.slug})`);
  }
  const deletedDb = `${s.db_name}_xoa_${stampUtc(new Date(now))}`;
  await admin(async (c) => {
    if (s.db_app_role) await ddl(c, 'REVOKE CONNECT, TEMPORARY ON DATABASE %I FROM %I', s.db_name, s.db_app_role);
    await renameDb(c, s.db_name, deletedDb);
  });
  await unregisterSitePool(s.id).catch(() => undefined);
  await controlPool().query(
    `UPDATE sites SET status = 'deleted', deleted_at = to_timestamp($3 / 1000.0), deleted_db = $2, updated_at = now() WHERE id = $1`,
    [s.id, deletedDb, now]);
  invalidateSiteCache();
  return { siteId: s.id, slug: s.slug, status: 'deleted', deletedDb, purgeAfter: new Date(now + KEEP_DELETED_MS).toISOString() };
}

/** Lấy lại site đã xoá mềm (chưa dọn). Site về `suspended`: người vận hành kiểm rồi `resume`. */
export async function undeleteSite(ref: string): Promise<SiteState> {
  const s = await findSite(ref);
  if (s.status !== 'deleted' || s.purged_at || !s.deleted_db) {
    throw new SiteLifecycleError('SITE_STATE_INVALID', `Site ${s.slug} không ở trạng thái xoá mềm lấy lại được (đang "${s.status}"${s.purged_at ? ', đã dọn' : ''})`);
  }
  const deletedDb = s.deleted_db;
  await admin(async (c) => {
    if (!(await dbExists(c, deletedDb))) throw new SiteLifecycleError('SITE_STATE_INVALID', `Không còn database ${deletedDb}`);
    if (await dbExists(c, s.db_name)) throw new SiteLifecycleError('SITE_STATE_INVALID', `Đã có database ${s.db_name}: không đổi tên đè được`);
    await renameDb(c, deletedDb, s.db_name);
    if (s.db_app_role) await ddl(c, 'GRANT CONNECT ON DATABASE %I TO %I', s.db_name, s.db_app_role);
  });
  await controlPool().query(
    `UPDATE sites SET status = 'suspended', suspended_at = now(), suspend_reason = 'lấy lại sau xoá mềm', deleted_at = NULL, deleted_db = NULL, updated_at = now() WHERE id = $1`,
    [s.id]);
  invalidateSiteCache();
  return { siteId: s.id, slug: s.slug, status: 'suspended' };
}

// [2026-11-22 01:29 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B5b: tên miền của site (Provisioning API POST / DELETE /sites/{id}/domains)
const DOMAIN_RE = /^(?=.{3,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;

/** Thêm tên miền cho site (chữ thường, không cổng). `primary`: thành tên miền chính. Đã thuộc chính site này → chỉ cập nhật chính / phụ. */
export async function addSiteDomain(ref: string, domain: string, primary = false): Promise<SiteState> {
  const s = await findSite(ref);
  if (s.status === 'deleted') throw new SiteLifecycleError('SITE_STATE_INVALID', `Site ${s.slug} đã xoá`);
  const d = domain.trim().toLowerCase().replace(/\.$/, '');
  if (!DOMAIN_RE.test(d)) throw new SiteLifecycleError('SITE_DOMAIN_INVALID', `Tên miền không hợp lệ: ${domain}`);
  const c = await controlPool().connect();
  try {
    await c.query('BEGIN');
    const owner = (await c.query<{ site_id: string }>('SELECT site_id FROM site_domains WHERE domain = $1 FOR UPDATE', [d])).rows[0];
    if (owner && owner.site_id !== s.id) throw new SiteLifecycleError('SITE_DOMAIN_TAKEN', `Tên miền ${d} đã thuộc site khác`);
    if (primary) await c.query('UPDATE site_domains SET is_primary = false WHERE site_id = $1 AND is_primary', [s.id]);
    if (owner) await c.query('UPDATE site_domains SET is_primary = is_primary OR $2 WHERE domain = $1', [d, primary]);
    else await c.query('INSERT INTO site_domains (domain, site_id, is_primary) VALUES ($1, $2, $3)', [d, s.id, primary]);
    await c.query('UPDATE sites SET updated_at = now() WHERE id = $1', [s.id]);
    await c.query('COMMIT');
  } catch (err) {
    await c.query('ROLLBACK').catch(() => undefined);
    if ((err as { code?: string }).code === '23505') throw new SiteLifecycleError('SITE_DOMAIN_TAKEN', `Tên miền ${d} đã thuộc site khác`, { cause: err });
    throw err;
  } finally {
    c.release();
  }
  invalidateSiteCache();
  return { siteId: s.id, slug: s.slug, status: s.status };
}

/** Bỏ một tên miền phụ của site. Tên miền chính không bỏ được (đổi tên miền chính trước bằng addSiteDomain(…, true)). */
export async function removeSiteDomain(ref: string, domain: string): Promise<SiteState> {
  const s = await findSite(ref);
  const d = domain.trim().toLowerCase();
  const row = (await controlPool().query<{ is_primary: boolean }>('SELECT is_primary FROM site_domains WHERE domain = $1 AND site_id = $2', [d, s.id])).rows[0];
  if (!row) throw new SiteLifecycleError('SITE_DOMAIN_UNKNOWN', `Site ${s.slug} không có tên miền ${d}`);
  if (row.is_primary) throw new SiteLifecycleError('SITE_DOMAIN_PRIMARY', `${d} là tên miền chính của site ${s.slug}: đặt tên miền chính khác trước khi bỏ`);
  await controlPool().query('DELETE FROM site_domains WHERE domain = $1 AND site_id = $2', [d, s.id]);
  await controlPool().query('UPDATE sites SET updated_at = now() WHERE id = $1', [s.id]);
  invalidateSiteCache();
  return { siteId: s.id, slug: s.slug, status: s.status };
}

export interface SweepAction { kind: 'drop_previous' | 'drop_restore_tmp' | 'purge_deleted'; slug: string; database: string }

/** Dọn database cũ (xem đầu tệp). `dryRun`: chỉ trả danh sách việc sẽ làm. */
export async function sweepSites(opts: { now?: number; dryRun?: boolean } = {}): Promise<SweepAction[]> {
  const now = opts.now ?? Date.now();
  await ensureControlSchema();
  const sites = (await controlPool().query<Row>(`SELECT ${COLS} FROM sites`)).rows;
  const { templateDb } = provisionerConfig();
  return admin(async (c) => {
    const all = (await c.query<{ datname: string }>('SELECT datname FROM pg_database')).rows.map((r) => r.datname);
    const actions: SweepAction[] = [];
    for (const s of sites) {
      for (const name of all) {
        if (name === templateDb || !name.startsWith(`${s.db_name}_`)) continue;
        const rest = name.slice(s.db_name.length);
        const t = stampTime(name);
        if (t === null) continue;
        if (/^_cu_\d{8}t\d{6}$/.test(rest) && now - t > KEEP_PREVIOUS_MS) actions.push({ kind: 'drop_previous', slug: s.slug, database: name });
        if (/^_kp_\d{8}t\d{6}$/.test(rest) && now - t > KEEP_RESTORE_TMP_MS) actions.push({ kind: 'drop_restore_tmp', slug: s.slug, database: name });
      }
      if (s.status === 'deleted' && !s.purged_at && s.deleted_db && s.deleted_at && now - s.deleted_at.getTime() > KEEP_DELETED_MS) {
        actions.push({ kind: 'purge_deleted', slug: s.slug, database: s.deleted_db });
      }
    }
    if (opts.dryRun) return actions;
    for (const a of actions) {
      await ddl(c, 'DROP DATABASE IF EXISTS %I WITH (FORCE)', a.database);
      const s = sites.find((x) => x.slug === a.slug)!;
      if (a.kind === 'drop_previous' && s.previous_db === a.database) {
        await controlPool().query('UPDATE sites SET previous_db = NULL, updated_at = now() WHERE id = $1', [s.id]);
      }
      if (a.kind === 'purge_deleted') {
        if (s.db_app_role) await ddl(c, 'DROP ROLE IF EXISTS %I', s.db_app_role);
        await controlPool().query('DELETE FROM site_domains WHERE site_id = $1', [s.id]);
        await controlPool().query('UPDATE sites SET purged_at = now(), db_secrets_enc = NULL, updated_at = now() WHERE id = $1', [s.id]);
      }
    }
    invalidateSiteCache();
    return actions;
  });
}
