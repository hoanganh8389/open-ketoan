// @bizcity-layer P apps/api
// [2026-11-22 10:48 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B5a (D039-10, D039-14, R-IDEM-1): dịch vụ Provisioning API — khoá prov_… (băm), việc có trạng thái + Idempotency-Key, tạo site chạy nền, mật khẩu chủ site trả một lần
/**
 * Dịch vụ của Provisioning API `bizcity_site_provisioning@1` (bản nháp: docs/phases/PHASE-039-NHIEU-CSDL-SITE-REGISTRY/30-HOP-DONG-PROVISIONING.md).
 * Mọi dữ liệu ở database điều khiển (CONTROL_DATABASE_URL); không đụng database của site nào ngoài lúc tạo site.
 *
 * Việc chạy nền trong tiến trình API. Tiến trình chết giữa chừng: việc kẹt quá 2 giờ được đánh dấu failed JOB_INTERRUPTED (B5b).
 */
import { createHash, randomBytes } from 'node:crypto';
import pg from 'pg';
import { env } from '@bizcity/platform/config/env';
import { BUILD_VERSION } from '@bizcity/platform/core/version';
import { adminUrlFor, newSiteId, SiteProvisionError } from '@bizcity/platform/db/site-provisioner';
import { appSchemaVersion, controlPool, decryptSiteSecret, encryptSiteSecret, ensureControlSchema } from '@bizcity/platform/db/site-registry';
// [2026-11-22 01:29 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B5b: lệnh vòng đời + sao lưu / khôi phục của lõi
import { addSiteDomain, deleteSite, removeSiteDomain, resumeSite, SiteLifecycleError, suspendSite } from '@bizcity/platform/db/site-lifecycle';
import { backupSite, listBackups, restoreSite, SiteBackupError } from '@bizcity/platform/db/site-backup';
import { createSiteWithOwner } from '../../db/site-create.js';

export const CONTRACT = 'bizcity_site_provisioning@1';

/** Lỗi trả cho phía gọi: mã cố định (hợp đồng §5) + câu dễ hiểu. Không mang khoá, mật khẩu, chuỗi kết nối. */
export class ProvisionHttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'ProvisionHttpError';
  }
}

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

/** JSON có khoá sắp xếp: cùng nội dung → cùng chuỗi → cùng dấu băm (so thân lệnh khi gửi lại cùng Idempotency-Key). */
function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}

// ── Khoá prov_… ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Tạo khoá gọi Provisioning API. Khoá trả về MỘT lần; database chỉ giữ băm và đầu khoá. */
export async function createProvisionKey(label: string, allowedIps: string[] = []): Promise<{ id: string; prefix: string; key: string }> {
  await ensureControlSchema();
  const key = `prov_${randomBytes(24).toString('base64url')}`;
  const id = newSiteId();
  const prefix = key.slice(0, 11);
  await controlPool().query('INSERT INTO provision_keys (id, prefix, key_hash, label, allowed_ips) VALUES ($1, $2, $3, $4, $5)', [id, prefix, sha256(key), label, allowedIps]);
  return { id, prefix, key };
}

/** Khoá trong header Authorization còn dùng được và gọi từ IP được phép → mã khoá. Sai thì một lỗi chung (không nói lý do). */
export async function authenticateKey(authorization: string | undefined, ip: string): Promise<string> {
  const m = /^Bearer\s+(prov_[A-Za-z0-9_-]{20,80})$/.exec(authorization ?? '');
  if (!m) throw new ProvisionHttpError(401, 'PROVISION_KEY_INVALID', 'Khoá Provisioning thiếu, sai hoặc đã thu hồi');
  await ensureControlSchema();
  const r = await controlPool().query<{ id: string; allowed_ips: string[] }>('SELECT id, allowed_ips FROM provision_keys WHERE key_hash = $1 AND revoked_at IS NULL', [sha256(m[1]!)]);
  const row = r.rows[0];
  if (!row || (row.allowed_ips.length > 0 && !row.allowed_ips.includes(ip))) {
    throw new ProvisionHttpError(401, 'PROVISION_KEY_INVALID', 'Khoá Provisioning thiếu, sai hoặc đã thu hồi');
  }
  return row.id;
}

// ── Việc có trạng thái (chung cho mọi lệnh ghi) ──────────────────────────────────────────────────────────────────────────
// [2026-11-22 01:29 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B5b (D039-14, R-IDEM-1): một trình chạy việc cho tạo site + khoá / mở / sao lưu / khôi phục / xoá; việc kẹt quá 2 giờ → failed JOB_INTERRUPTED; một site chỉ một việc vòng đời cùng lúc

export interface ProvisionBody { slug: string; domain: string; displayName?: string; owner: { email: string; name?: string; phone?: string }; sample?: boolean; externalRef?: string }

export type JobKind = 'provision' | 'suspend' | 'resume' | 'backup' | 'restore' | 'delete';
type StepStatus = 'pending' | 'running' | 'done' | 'failed';
const STEPS: Record<JobKind, readonly string[]> = {
  provision: ['validate', 'create_database', 'seed_owner', 'activate'],
  suspend: ['suspend'], resume: ['resume'], backup: ['dump', 'verify'], restore: ['restore', 'swap'], delete: ['rename_database'],
};
const stepsOf = (kind: JobKind, status: StepStatus) => STEPS[kind].map((key) => ({ key, status }));
/** Việc `queued` / `running` không cập nhật quá ngưỡng này = tiến trình chạy nó đã chết. */
const STALE_MS = 2 * 3_600_000;
const SITE_JOB_KINDS: JobKind[] = ['suspend', 'resume', 'backup', 'restore', 'delete'];
/** Thời gian đợi bộ đệm tên miền của các tiến trình khác hết hạn trước khi đổi database lúc khôi phục (mặc định của restoreSite: 35 giây). */
let restoreDrainMs: number | undefined;
/** Chỉ cho test: khôi phục không đợi. */
export function setRestoreDrainForTest(ms: number | undefined): void { restoreDrainMs = ms; }

/** Việc kẹt (tiến trình API chết giữa chừng): đánh dấu failed để phía gọi biết và gửi lại được. */
async function failStaleJobs(siteId?: string): Promise<void> {
  await controlPool().query(
    `UPDATE site_jobs SET status = 'failed', error_code = 'JOB_INTERRUPTED', error_message = 'Việc bị gián đoạn (máy chủ khởi động lại giữa chừng). Gửi lại lệnh với Idempotency-Key mới.', updated_at = now()
      WHERE status IN ('queued', 'running') AND updated_at < now() - make_interval(secs => $1) AND ($2::text IS NULL OR site_id = $2)`,
    [STALE_MS / 1000, siteId ?? null],
  );
}

/** Lỗi đã biết của lõi → mã + câu cho phía gọi; lỗi lạ → câu chung (chi tiết chỉ ở nhật ký máy chủ). */
function knownError(err: unknown, fallback: string): { code: string; message: string } {
  if (err instanceof SiteProvisionError || err instanceof SiteLifecycleError || err instanceof SiteBackupError) return { code: err.code, message: err.message };
  return { code: fallback, message: 'Không làm được việc này. Đội vận hành đã được báo.' };
}

/**
 * Nhận một lệnh ghi thành việc. Cùng khoá gọi + cùng Idempotency-Key: cùng lệnh (loại + site + thân) → trả việc cũ; khác → 422.
 * Việc mới: ghi `queued`, trả ngay mã việc, chạy `run` ở nền; kết quả / lỗi ghi vào việc.
 */
async function startJob(
  keyId: string, idempotencyKey: string, kind: JobKind, target: string | null, body: unknown,
  run: (jobId: string, siteId: string) => Promise<string | undefined>,
): Promise<{ created: boolean; jobId: string; siteId: string }> {
  await ensureControlSchema();
  const ctl = controlPool();
  const hash = sha256(stableJson({ kind, target, body }));
  const prev = await ctl.query<{ id: string; site_id: string; request_hash: string }>('SELECT id, site_id, request_hash FROM site_jobs WHERE key_id = $1 AND idempotency_key = $2', [keyId, idempotencyKey]);
  const found = prev.rows[0];
  if (found) {
    if (found.request_hash !== hash) throw new ProvisionHttpError(422, 'IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key này đã dùng cho một lệnh có nội dung khác');
    return { created: false, jobId: found.id, siteId: found.site_id };
  }
  const siteId = target ?? newSiteId();
  if (target) {
    await failStaleJobs(target);
    const busy = await ctl.query("SELECT 1 FROM site_jobs WHERE site_id = $1 AND kind = ANY($2::text[]) AND status IN ('queued', 'running')", [target, SITE_JOB_KINDS]);
    if (busy.rowCount) throw new ProvisionHttpError(409, 'SITE_BUSY', 'Site đang có một việc chưa xong (khoá / mở / sao lưu / khôi phục / xoá). Hỏi trạng thái việc đó rồi gửi lại.');
  }
  const jobId = newSiteId();
  const ins = await ctl.query<{ id: string }>(
    `INSERT INTO site_jobs (id, key_id, idempotency_key, request_hash, kind, site_id, status, steps)
     VALUES ($1, $2, $3, $4, $5, $6, 'queued', $7) ON CONFLICT (key_id, idempotency_key) DO NOTHING RETURNING id`,
    [jobId, keyId, idempotencyKey, hash, kind, siteId, JSON.stringify(stepsOf(kind, 'pending'))],
  );
  if (!ins.rowCount) return startJob(keyId, idempotencyKey, kind, target, body, run); // hai lệnh trùng tới cùng lúc: lấy việc của lệnh kia
  void runJob(jobId, siteId, kind, run);
  return { created: true, jobId, siteId };
}

/** Chạy việc ở nền; mọi lỗi ghi vào việc, không ném ra ngoài. `run` trả bí mật cần trả một lần (đã mã hoá) nếu có. */
async function runJob(jobId: string, siteId: string, kind: JobKind, run: (jobId: string, siteId: string) => Promise<string | undefined>): Promise<void> {
  const ctl = controlPool();
  const SET = 'UPDATE site_jobs SET status = $2, steps = $3, result_enc = $4, error_code = $5, error_message = $6, updated_at = now() WHERE id = $1';
  try {
    await ctl.query(SET, [jobId, 'running', JSON.stringify(stepsOf(kind, 'running')), null, null, null]);
    const secret = await run(jobId, siteId);
    await ctl.query(SET, [jobId, 'done', JSON.stringify(stepsOf(kind, 'done')), secret ?? null, null, null]);
  } catch (err) {
    const e = knownError(err, kind === 'provision' ? 'SITE_PROVISION_FAILED' : 'SITE_JOB_FAILED');
    await ctl.query(SET, [jobId, 'failed', JSON.stringify(stepsOf(kind, 'failed')), null, e.code, e.message]).catch(() => undefined);
  }
}

/** Nhận lệnh tạo site → việc `provision` (mã site cấp ngay). */
export function startProvision(keyId: string, idempotencyKey: string, body: ProvisionBody): Promise<{ created: boolean; jobId: string; siteId: string }> {
  return startJob(keyId, idempotencyKey, 'provision', null, body, async (_jobId, siteId) => {
    const r = await createSiteWithOwner({ siteId, slug: body.slug, domain: body.domain, ...(body.displayName ? { name: body.displayName } : {}), email: body.owner.email });
    return encryptSiteSecret(JSON.stringify({ email: r.ownerEmail, initialPassword: r.ownerPassword }));
  });
}

/** Site phải có trong registry (chưa dọn) mới nhận lệnh vòng đời. */
async function mustSite(siteId: string): Promise<void> {
  await ensureControlSchema();
  const r = await controlPool().query('SELECT 1 FROM sites WHERE id = $1 AND purged_at IS NULL', [siteId]);
  if (!r.rowCount) throw new ProvisionHttpError(404, 'SITE_NOT_FOUND', 'Không có site này');
}

/** Lệnh vòng đời của một site → việc chạy nền (khoá, mở, sao lưu, khôi phục, xoá mềm). */
export async function startSiteJob(
  keyId: string, idempotencyKey: string, kind: Exclude<JobKind, 'provision'>, siteId: string, body: { reason?: string; backupId?: string } = {},
): Promise<{ created: boolean; jobId: string; siteId: string }> {
  await mustSite(siteId);
  if (kind === 'restore' && !body.backupId) throw new ProvisionHttpError(400, 'VALIDATION_FAILED', 'Thiếu backupId');
  // Xoá mềm: báo ngay điều kiện chưa đủ (hợp đồng §5), không chờ việc chạy. Gửi lại cùng Idempotency-Key thì trả việc cũ, không kiểm lại.
  if (kind === 'delete') {
    const again = await controlPool().query('SELECT 1 FROM site_jobs WHERE key_id = $1 AND idempotency_key = $2', [keyId, idempotencyKey]);
    if (!again.rowCount) {
      const s = (await controlPool().query<{ status: string; fresh: boolean }>(
        `SELECT s.status, EXISTS (SELECT 1 FROM site_backups b WHERE b.site_id = s.id AND b.verified AND b.created_at > now() - interval '24 hours') AS fresh
           FROM sites s WHERE s.id = $1`, [siteId])).rows[0]!;
      if (s.status !== 'suspended') throw new ProvisionHttpError(409, 'SITE_NOT_SUSPENDED', 'Phải khoá site trước khi xoá (POST /sites/{siteId}/suspend)');
      if (!s.fresh) throw new ProvisionHttpError(409, 'SITE_BACKUP_REQUIRED', 'Cần một bản sao lưu đã kiểm trong 24 giờ trước khi xoá (POST /sites/{siteId}/backups)');
    }
  }
  return startJob(keyId, idempotencyKey, kind, siteId, body, async () => {
    if (kind === 'suspend') await suspendSite(siteId, body.reason ?? '');
    else if (kind === 'resume') await resumeSite(siteId);
    else if (kind === 'backup') await backupSite(siteId, { ...(env.SITE_BACKUP_DIR ? { dir: env.SITE_BACKUP_DIR } : {}), reason: 'manual' });
    else if (kind === 'restore') await restoreSite(siteId, body.backupId!, restoreDrainMs !== undefined ? { drainMs: restoreDrainMs } : {});
    else await deleteSite(siteId);
    return undefined;
  });
}

/** Trạng thái việc. Việc tạo site xong: lần đọc ĐẦU trả kèm email + mật khẩu ban đầu của chủ site rồi xoá khỏi database. */
export async function getJob(keyId: string, jobId: string): Promise<Record<string, unknown>> {
  await ensureControlSchema();
  const ctl = controlPool();
  await failStaleJobs();
  const r = await ctl.query('SELECT id, site_id, kind, status, steps, error_code, error_message, created_at, updated_at FROM site_jobs WHERE id = $1 AND key_id = $2', [jobId, keyId]);
  const j = r.rows[0];
  if (!j) throw new ProvisionHttpError(404, 'JOB_NOT_FOUND', 'Không có việc này');
  const out: Record<string, unknown> = {
    jobId: j.id, siteId: j.site_id, kind: j.kind, status: j.status, steps: j.steps,
    error: j.error_code ? { code: j.error_code, message: j.error_message } : null,
    createdAt: new Date(j.created_at).toISOString(), updatedAt: new Date(j.updated_at).toISOString(),
  };
  if (j.status === 'done') {
    // Khoá dòng, lấy giá trị cũ, xoá — hai lần đọc cùng lúc thì chỉ một lần nhận được mật khẩu.
    const once = await ctl.query<{ result_enc: string }>(
      `WITH old AS (SELECT id, result_enc FROM site_jobs WHERE id = $1 AND result_enc IS NOT NULL FOR UPDATE)
       UPDATE site_jobs j SET result_enc = NULL, updated_at = now() FROM old WHERE j.id = old.id RETURNING old.result_enc`,
      [jobId],
    );
    const enc = once.rows[0]?.result_enc;
    if (enc) out.owner = JSON.parse(decryptSiteSecret(enc)) as { email: string; initialPassword: string };
  }
  return out;
}

// ── Tên miền (đồng bộ, trả Site) ─────────────────────────────────────────────────────────────────────────────────────────

const LIFECYCLE_HTTP: Record<string, number> = {
  SITE_UNKNOWN: 404, SITE_DOMAIN_UNKNOWN: 404, SITE_DOMAIN_INVALID: 400, SITE_DOMAIN_TAKEN: 409, SITE_DOMAIN_PRIMARY: 409, SITE_STATE_INVALID: 409,
};
async function lifecycleHttp<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); } catch (err) {
    if (err instanceof SiteLifecycleError) throw new ProvisionHttpError(LIFECYCLE_HTTP[err.code] ?? 409, err.code === 'SITE_UNKNOWN' ? 'SITE_NOT_FOUND' : err.code, err.message);
    throw err;
  }
}

export async function addDomain(siteId: string, domain: string, primary = false): Promise<SiteDto> {
  await mustSite(siteId);
  await lifecycleHttp(() => addSiteDomain(siteId, domain, primary));
  return getSite(siteId, { ping: false });
}

export async function removeDomain(siteId: string, domain: string): Promise<SiteDto> {
  await mustSite(siteId);
  await lifecycleHttp(() => removeSiteDomain(siteId, domain));
  return getSite(siteId, { ping: false });
}

// ── Sao lưu ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Bản sao lưu của site (mới trước). Không trả đường dẫn tệp trên máy chủ. */
export async function listSiteBackups(siteId: string): Promise<{ items: Array<Record<string, unknown>> }> {
  await mustSite(siteId);
  const rows = await listBackups(siteId);
  return { items: rows.map((b) => ({ backupId: b.id, createdAt: b.createdAt, bytes: b.bytes, tables: b.tables, schemaVersion: b.schemaVersion, reason: b.reason })) };
}

// ── Đọc site + sức khoẻ ──────────────────────────────────────────────────────────────────────────────────────────────────

const SITE_SQL = `
  SELECT s.id, s.slug, s.display_name, s.status, s.db_name, s.schema_version, s.app_version, s.external_ref, s.created_at,
         s.suspended_at, s.suspend_reason, s.deleted_at, s.purged_at, s.migrated_at, s.migration_error, s.restored_at,
         (SELECT max(b.created_at) FROM site_backups b WHERE b.site_id = s.id AND b.verified) AS last_backup_at,
         coalesce(json_agg(json_build_object('domain', d.domain, 'primary', d.is_primary) ORDER BY d.is_primary DESC, d.domain)
                  FILTER (WHERE d.domain IS NOT NULL), '[]') AS domains
    FROM sites s LEFT JOIN site_domains d ON d.site_id = s.id`;

type SiteRow = {
  id: string; slug: string; display_name: string; status: string; db_name: string; schema_version: string | null; app_version: string | null;
  external_ref: string | null; created_at: Date; suspended_at: Date | null; suspend_reason: string | null; deleted_at: Date | null;
  purged_at: Date | null; migrated_at: Date | null; migration_error: string | null; restored_at: Date | null; last_backup_at: Date | null; domains: unknown;
};

/** Bản sao lưu cũ hơn ngưỡng này thì báo `backup_stale` (lịch đêm + 2 giờ trễ). */
const BACKUP_STALE_MS = 26 * 3_600_000;
const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);

/**
 * Dấu cần chú ý của một site — để phía gọi (WordPress / Site Manager) tô đỏ, không phải tự suy:
 * suspended · deleted · migration_failed · upgrading · schema_behind (lược đồ khác bản ứng dụng) · backup_missing · backup_stale · unreachable.
 */
function attentionOf(s: SiteRow, now: number, reachable?: boolean): string[] {
  const a: string[] = [];
  if (s.status === 'deleted') return ['deleted'];
  if (s.status === 'suspended') a.push('suspended');
  if (s.status === 'migration_failed') a.push('migration_failed');
  if (s.status === 'upgrading') a.push('upgrading');
  if (s.schema_version && s.schema_version !== appSchemaVersion()) a.push('schema_behind');
  if (!s.last_backup_at) a.push('backup_missing');
  else if (now - new Date(s.last_backup_at).getTime() > BACKUP_STALE_MS) a.push('backup_stale');
  if (reachable === false) a.push('unreachable');
  return a;
}

function siteDto(s: SiteRow, size: Map<string, number>, now: number, ping?: { reachable: boolean; latencyMs: number | null }) {
  const lb = s.last_backup_at ? new Date(s.last_backup_at).getTime() : null;
  return {
    siteId: s.id, slug: s.slug, displayName: s.display_name, status: s.status, domains: s.domains,
    schemaVersion: s.schema_version, schemaCurrent: s.schema_version ? s.schema_version === appSchemaVersion() : null,
    appVersion: s.app_version, externalRef: s.external_ref, createdAt: new Date(s.created_at).toISOString(),
    dbSizeBytes: s.status === 'deleted' ? null : size.get(s.db_name) ?? null,
    lastBackupAt: iso(s.last_backup_at), backupAgeHours: lb === null ? null : Math.round((now - lb) / 360_000) / 10,
    suspendedAt: iso(s.suspended_at), suspendReason: s.suspend_reason,
    deletedAt: iso(s.deleted_at), purgeAfter: s.deleted_at && !s.purged_at ? new Date(new Date(s.deleted_at).getTime() + 30 * 86_400_000).toISOString() : null,
    migratedAt: iso(s.migrated_at), migrationError: s.migration_error, restoredAt: iso(s.restored_at),
    ...(ping ? { database: ping } : {}),
    attention: attentionOf(s, now, ping?.reachable),
  };
}
export type SiteDto = ReturnType<typeof siteDto>;

/** Cỡ database của các site (một truy vấn, kết nối quản trị). Không đọc được → bảng rỗng (trường dbSizeBytes = null). */
async function dbSizes(names: string[]): Promise<Map<string, number>> {
  if (!names.length) return new Map();
  const c = new pg.Client({ connectionString: adminUrlFor('postgres'), connectionTimeoutMillis: 3_000 });
  try {
    await c.connect();
    const r = await c.query<{ datname: string; n: string }>('SELECT datname, pg_database_size(datname)::text AS n FROM pg_database WHERE datname = ANY($1::text[])', [names]);
    return new Map(r.rows.map((x) => [x.datname, Number(x.n)]));
  } catch {
    return new Map();
  } finally {
    await c.end().catch(() => undefined);
  }
}

/** Thử kết nối thật tới database của site (kết nối quản trị, chờ tối đa 3 giây). */
async function pingDb(dbName: string): Promise<{ reachable: boolean; latencyMs: number | null }> {
  const t0 = Date.now();
  const c = new pg.Client({ connectionString: adminUrlFor(dbName), connectionTimeoutMillis: 3_000 });
  try {
    await c.connect();
    await c.query('SELECT 1');
    return { reachable: true, latencyMs: Date.now() - t0 };
  } catch {
    return { reachable: false, latencyMs: null };
  } finally {
    await c.end().catch(() => undefined);
  }
}

/** Một site. Mặc định thử kết nối database thật (trường `database`, dấu `unreachable`). */
export async function getSite(siteId: string, opts: { ping?: boolean } = {}): Promise<SiteDto> {
  await ensureControlSchema();
  const r = await controlPool().query<SiteRow>(`${SITE_SQL} WHERE s.id = $1 GROUP BY s.id`, [siteId]);
  const s = r.rows[0];
  if (!s) throw new ProvisionHttpError(404, 'SITE_NOT_FOUND', 'Không có site này');
  const live = s.status !== 'deleted' && opts.ping !== false;
  const [size, ping] = await Promise.all([dbSizes([s.db_name]), live ? pingDb(s.db_name) : Promise.resolve(undefined)]);
  return siteDto(s, size, Date.now(), ping);
}

/** Danh sách site (lọc trạng thái / chỉ site cần chú ý). Không thử kết nối từng site (đắt khi có hàng trăm site). */
export async function listSitesDto(filter: { status?: string; attention?: boolean } = {}): Promise<{ items: SiteDto[]; next: null }> {
  await ensureControlSchema();
  const r = await controlPool().query<SiteRow>(`${SITE_SQL} WHERE ($1::text IS NULL OR s.status = $1) GROUP BY s.id ORDER BY s.created_at`, [filter.status ?? null]);
  const size = await dbSizes(r.rows.filter((s) => s.status !== 'deleted').map((s) => s.db_name));
  const now = Date.now();
  const items = r.rows.map((s) => siteDto(s, size, now));
  return { items: filter.attention ? items.filter((x) => x.attention.length > 0) : items, next: null };
}

/** Sức khoẻ cụm: hợp đồng, bản ứng dụng, lược đồ cần, số site theo trạng thái và theo dấu cần chú ý. */
export async function health(): Promise<{ contract: string; appVersion: string; requiredSchema: string; sites: Record<string, number>; attention: Record<string, number> }> {
  const { items } = await listSitesDto();
  const sites: Record<string, number> = {};
  const attention: Record<string, number> = {};
  for (const s of items) {
    sites[s.status] = (sites[s.status] ?? 0) + 1;
    for (const a of s.attention) attention[a] = (attention[a] ?? 0) + 1;
  }
  return { contract: CONTRACT, appVersion: BUILD_VERSION.version, requiredSchema: appSchemaVersion(), sites, attention };
}
