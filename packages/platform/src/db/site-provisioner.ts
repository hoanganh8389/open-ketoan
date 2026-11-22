// @bizcity-layer P data
// [2026-11-22 10:26 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B4a (ADR-0036, D039-9, D039-10, D039-19, R-SITE-2): Site Provisioner — database site từ database mẫu, vai trò ứng dụng riêng từng site, dọn khi hỏng
// [2026-11-22 10:36 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B4b: bước khởi tạo do lớp gọi truyền vào (đơn vị đầu + chủ site), chạy bằng kết nối quản trị tới database site mới; hỏng thì dọn như bước khác
/**
 * SITE PROVISIONER (ADR-0036; PHASE-039 B4a). Tạo một site:
 *
 *   1. kiểm slug (chữ thường, số, gạch nối; 3–30 ký tự), tên miền
 *   2. ghi registry: `sites` (provisioning) + `site_domains`              → trùng: SITE_SLUG_TAKEN / SITE_DOMAIN_TAKEN
 *   3. vai trò `kt_<slug>_app`: LOGIN, mật khẩu ngẫu nhiên, thành viên SITE_APP_PARENT_ROLE (thừa hưởng quyền bảng mà migration
 *      cấp cho `ketoan_app`)
 *   4. `CREATE DATABASE kt_<slug> TEMPLATE <SITE_TEMPLATE_DB>`; thu CONNECT khỏi PUBLIC; chỉ cấp CONNECT cho vai trò của site
 *      → vai trò site A không vào được database site B (R-SITE-2)                            → không có mẫu: SITE_TEMPLATE_MISSING
 *   5. mật khẩu mã hoá (SITE_SECRET_KEY) vào registry; `status = active`
 *
 * Hỏng ở bước nào: dọn ngược — xoá database, vai trò, dòng registry đã tạo (R-JOB-1 phía Open Kế Toán). Tên database / vai trò
 * dựng từ slug đã kiểm; câu DDL do PostgreSQL tự trích dẫn bằng format(%I, %L) (hàm `ddl`) — không ghép chuỗi ở ứng dụng (R-SEC).
 *
 * 4b. (B4b) `initialize`: hàm của lớp gọi (vd `seed()` của Kernel qua lệnh `bizcity site create`) chạy trong ngữ cảnh một site tạm trỏ
 *     tới database mới bằng kết nối QUẢN TRỊ (vai trò ứng dụng chịu RLS, không ghi được dữ liệu gốc). Platform không gọi Kernel.
 *
 * CHƯA làm: vai trò sở hữu riêng `kt_<slug>_owner`
 * (cần chạy migration theo site — B3), việc có trạng thái `site_jobs` + Idempotency-Key (B5). Database mẫu do người vận hành
 * chuẩn bị: tạo database `SITE_TEMPLATE_DB`, chạy `npm run db:migrate` với DATABASE_URL trỏ tới nó.
 */
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { env } from '../config/env.js';
import { registerSitePool, unregisterSitePool, withSite } from './site.js';
import { controlPool, encryptSiteSecret, ensureControlSchema, invalidateSiteCache } from './site-registry.js';
// [2026-11-22 11:19 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B3 (R-SITE-9): site mới ghi schema_version (lược đồ của database mẫu) ngay khi tạo
import { appliedSchemaVersion } from './migrate.js';

export type SiteProvisionCode = 'SITE_SLUG_INVALID' | 'SITE_DOMAIN_INVALID' | 'SITE_SLUG_TAKEN' | 'SITE_DOMAIN_TAKEN' | 'SITE_TEMPLATE_MISSING' | 'SITE_PROVISION_FAILED';

/** Lỗi tạo site: mã cố định + câu dễ hiểu. Không mang mật khẩu, chuỗi kết nối. */
export class SiteProvisionError extends Error {
  constructor(readonly code: SiteProvisionCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SiteProvisionError';
  }
}

export interface CreateSiteInput {
  /** Mã site cấp trước (Provisioning API trả ngay cho phía gọi, B5a); trống = tự sinh. */
  siteId?: string;
  slug: string;
  /** Tên miền chính, đầy đủ (vd congtya.btnet.vn). */
  domain: string;
  displayName?: string;
  ownerEmail?: string;
  externalRef?: string;
  // [2026-11-22 08:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B8 (S039-21): 
  /** Báo bước thật cho việc có trạng thái (Provisioning API): validate → create_database → seed_owner → activate. Lỗi của hàm này bị bỏ qua. */
  onStep?: (key: SiteStepKey, status: 'running' | 'done') => void | Promise<void>;
}

export type SiteStepKey = 'validate' | 'create_database' | 'seed_owner' | 'activate';

/** Bước khởi tạo dữ liệu của site mới: chạy trong ngữ cảnh site tạm (`db` trỏ tới database mới, vai trò quản trị). */
export type SiteInitializer<T> = (site: { siteId: string; slug: string; dbName: string }) => Promise<T>;

export interface CreatedSite {
  siteId: string;
  slug: string;
  dbName: string;
  appRole: string;
  domain: string;
}

const SLUG_RE = /^[a-z][a-z0-9-]{2,29}$/;
const DOMAIN_RE = /^[a-z0-9.-]{3,253}$/;

let cfg = {
  templateDb: env.SITE_TEMPLATE_DB,
  adminUrl: env.PROVISION_DATABASE_URL ?? env.DATABASE_URL,
  parentRole: env.SITE_APP_PARENT_ROLE,
};

/** Đổi cấu hình lúc chạy. Chỉ cho test. */
export function configureProvisionerForTest(next: Partial<typeof cfg>): void {
  cfg = { ...cfg, ...next };
}

// [2026-11-22 11:19 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B3: Migration Runner theo site dùng cùng kết nối quản trị
/** Cấu hình đang dùng (database mẫu, vai trò cha). Không trả chuỗi kết nối quản trị. */
export function provisionerConfig(): { templateDb: string | undefined; parentRole: string } {
  return { templateDb: cfg.templateDb, parentRole: cfg.parentRole };
}

/** Chuỗi kết nối quản trị (PROVISION_DATABASE_URL, trống = DATABASE_URL) tới một database. */
export function adminUrlFor(dbName: string): string {
  const u = new URL(cfg.adminUrl);
  u.pathname = `/${dbName}`;
  return u.toString();
}

/** Tên database và vai trò của site, dựng từ slug đã kiểm. */
export function siteDbNames(slug: string): { dbName: string; appRole: string } {
  const dbName = `kt_${slug.replace(/-/g, '_')}`;
  return { dbName, appRole: `${dbName}_app` };
}

/** Mã site dạng ULID (Crockford base32: 10 ký tự thời gian + 16 ký tự ngẫu nhiên), sắp theo thời gian tạo. */
export function newSiteId(now = Date.now()): string {
  const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let t = now;
  let time = '';
  for (let i = 0; i < 10; i++) { time = A[t % 32] + time; t = Math.floor(t / 32); }
  const r = randomBytes(16);
  let rand = '';
  for (let i = 0; i < 16; i++) rand += A[r[i]! % 32];
  return time + rand;
}

/** Chạy một câu DDL có tên định danh / giá trị: PostgreSQL trích dẫn bằng format(%I tên, %L giá trị); mẫu câu là hằng số trong mã. */
async function ddl(c: pg.Client, template: string, ...args: string[]): Promise<void> {
  const r = await c.query<{ q: string }>('SELECT format($1, VARIADIC $2::text[]) AS q', [template, args]);
  await c.query(r.rows[0]!.q);
}

function adminClient(): pg.Client {
  const u = new URL(cfg.adminUrl);
  u.pathname = '/postgres'; // KHÔNG kết nối vào database mẫu: CREATE DATABASE … TEMPLATE cần mẫu không có phiên nào
  return new pg.Client({ connectionString: u.toString() });
}

/** Tạo một site. Thành công: site `active`, nhận yêu cầu theo tên miền sau khi bộ đệm tên miền hết hạn (đã xoá bộ đệm ở tiến trình này). */
export async function createSite<T = undefined>(input: CreateSiteInput, initialize?: SiteInitializer<T>): Promise<CreatedSite & { initialized?: T }> {
  const slug = String(input.slug ?? '').trim().toLowerCase();
  const domain = String(input.domain ?? '').trim().toLowerCase();
  if (!SLUG_RE.test(slug) || slug.endsWith('-') || slug.includes('--')) {
    throw new SiteProvisionError('SITE_SLUG_INVALID', 'Tên site chỉ gồm chữ thường không dấu, số và dấu gạch, dài 3–30 ký tự, bắt đầu bằng chữ');
  }
  if (!DOMAIN_RE.test(domain)) throw new SiteProvisionError('SITE_DOMAIN_INVALID', 'Tên miền không hợp lệ');
  const { dbName, appRole } = siteDbNames(slug);
  // [2026-11-22 10:48 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B5a: nhận mã site cấp trước (ULID 26 ký tự)
  if (input.siteId !== undefined && !/^[0-9A-HJKMNP-TV-Z]{26}$/.test(input.siteId)) throw new SiteProvisionError('SITE_PROVISION_FAILED', 'Mã site không đúng khuôn');
  const siteId = input.siteId ?? newSiteId();
  const base = new URL(env.DATABASE_URL);

  // [2026-11-22 08:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B8 (S039-21): báo bước; hàm báo hỏng không làm hỏng việc tạo site
  const step = async (key: SiteStepKey, status: 'running' | 'done'): Promise<void> => {
    try { await input.onStep?.(key, status); } catch { /* nuot-loi: báo bước chỉ để hiện tiến độ */ }
  };
  await ensureControlSchema();
  const ctl = controlPool();

  // 2. registry
  await step('validate', 'running');
  try {
    await ctl.query('BEGIN');
    await ctl.query(
      `INSERT INTO sites (id, slug, display_name, status, db_host, db_port, db_name, owner_email, external_ref)
       VALUES ($1, $2, $3, 'provisioning', $4, $5, $6, $7, $8)`,
      [siteId, slug, input.displayName ?? '', base.hostname, Number(base.port || 5432), dbName, input.ownerEmail ?? null, input.externalRef ?? null],
    );
    await ctl.query('INSERT INTO site_domains (domain, site_id, is_primary) VALUES ($1, $2, true)', [domain, siteId]);
    await ctl.query('COMMIT');
    await step('validate', 'done');
  } catch (err) {
    await ctl.query('ROLLBACK').catch(() => undefined);
    const e = err as { code?: string; constraint?: string };
    if (e.code === '23505' && /domain/.test(e.constraint ?? '')) throw new SiteProvisionError('SITE_DOMAIN_TAKEN', 'Tên miền này đã thuộc một site khác', { cause: err });
    if (e.code === '23505') throw new SiteProvisionError('SITE_SLUG_TAKEN', 'Tên site này đã có', { cause: err });
    throw new SiteProvisionError('SITE_PROVISION_FAILED', 'Không ghi được Site Registry', { cause: err });
  }

  const admin = adminClient();
  let roleCreated = false;
  let dbCreated = false;
  try {
    await admin.connect();
    await step('create_database', 'running');
    const tpl = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [cfg.templateDb]);
    if (!tpl.rowCount) throw new SiteProvisionError('SITE_TEMPLATE_MISSING', `Chưa có database mẫu ${cfg.templateDb}: chuẩn bị nó trước khi tạo site (docs/ops/NHIEU-SITE.md)`);

    // 3. vai trò ứng dụng của site
    const password = randomBytes(24).toString('base64url');
    await ddl(admin, 'CREATE ROLE %I LOGIN PASSWORD %L IN ROLE %I', appRole, password, cfg.parentRole);
    roleCreated = true;

    // 4. database từ mẫu, CONNECT chỉ cho vai trò của site
    await ddl(admin, 'CREATE DATABASE %I TEMPLATE %I', dbName, cfg.templateDb);
    dbCreated = true;
    await ddl(admin, 'REVOKE CONNECT, TEMPORARY ON DATABASE %I FROM PUBLIC', dbName);
    await ddl(admin, 'REVOKE CONNECT, TEMPORARY ON DATABASE %I FROM %I', dbName, cfg.parentRole);
    await ddl(admin, 'GRANT CONNECT ON DATABASE %I TO %I', dbName, appRole);
    await step('create_database', 'done');

    // 4b. khởi tạo dữ liệu (lớp gọi truyền vào): pool tạm bằng kết nối quản trị tới database mới
    let initialized: T | undefined;
    await step('seed_owner', 'running');
    if (initialize) {
      const tempId = `prov:${siteId}`;
      registerSitePool(tempId, new pg.Pool({ connectionString: adminUrlFor(dbName), max: 2 }));
      try {
        initialized = await withSite(tempId, () => initialize({ siteId, slug, dbName }));
      } finally {
        await unregisterSitePool(tempId);
      }
    }

    await step('seed_owner', 'done');

    // 5. registry: vai trò + mật khẩu mã hoá, lược đồ (cổng lược đồ, R-SITE-9), site chạy
    await step('activate', 'running');
    const vc = new pg.Client({ connectionString: adminUrlFor(dbName) });
    await vc.connect();
    let schemaVersion: string | null;
    try { schemaVersion = await appliedSchemaVersion(vc); } finally { await vc.end(); }
    await ctl.query(
      `UPDATE sites SET db_app_role = $2, db_secrets_enc = $3, schema_version = $4, status = 'active', updated_at = now() WHERE id = $1`,
      [siteId, appRole, encryptSiteSecret(password), schemaVersion],
    );
    invalidateSiteCache();
    await step('activate', 'done');
    return { siteId, slug, dbName, appRole, domain, ...(initialize ? { initialized } : {}) };
  } catch (err) {
    // dọn ngược; lỗi khi dọn không che lỗi gốc
    if (dbCreated) await ddl(admin, 'DROP DATABASE IF EXISTS %I WITH (FORCE)', dbName).catch(() => undefined);
    if (roleCreated) await ddl(admin, 'DROP ROLE IF EXISTS %I', appRole).catch(() => undefined);
    await ctl.query('DELETE FROM sites WHERE id = $1', [siteId]).catch(() => undefined);
    if (err instanceof SiteProvisionError) throw err;
    throw new SiteProvisionError('SITE_PROVISION_FAILED', 'Không tạo được database hoặc vai trò của site', { cause: err });
  } finally {
    await admin.end().catch(() => undefined);
  }
}
