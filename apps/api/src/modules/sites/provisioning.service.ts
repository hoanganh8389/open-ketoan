// @bizcity-layer P apps/api
// [2026-11-22 10:48 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B5a (D039-10, D039-14, R-IDEM-1): dịch vụ Provisioning API — khoá prov_… (băm), việc có trạng thái + Idempotency-Key, tạo site chạy nền, mật khẩu chủ site trả một lần
/**
 * Dịch vụ của Provisioning API `bizcity_site_provisioning@1` (bản nháp: docs/phases/PHASE-039-NHIEU-CSDL-SITE-REGISTRY/30-HOP-DONG-PROVISIONING.md).
 * Mọi dữ liệu ở database điều khiển (CONTROL_DATABASE_URL); không đụng database của site nào ngoài lúc tạo site.
 *
 * Việc tạo site chạy nền trong tiến trình API (vài giây). Tiến trình chết giữa chừng thì việc kẹt `running` — B5b thêm quét việc kẹt.
 */
import { createHash, randomBytes } from 'node:crypto';
import { newSiteId, SiteProvisionError } from '@bizcity/platform/db/site-provisioner';
import { controlPool, decryptSiteSecret, encryptSiteSecret, ensureControlSchema } from '@bizcity/platform/db/site-registry';
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

// ── Tạo site (việc có trạng thái) ─────────────────────────────────────────────────────────────────────────────────────────

export interface ProvisionBody { slug: string; domain: string; displayName?: string; owner: { email: string; name?: string; phone?: string }; sample?: boolean; externalRef?: string }

const STEPS = ['validate', 'create_database', 'seed_owner', 'activate'] as const;
const stepsOf = (status: 'pending' | 'running' | 'done' | 'failed') => STEPS.map((key) => ({ key, status }));

/**
 * Nhận lệnh tạo site. Cùng khoá gọi + cùng Idempotency-Key: cùng thân → trả đúng việc cũ; thân khác → 422.
 * Việc mới: ghi `queued`, trả ngay mã việc + mã site, chạy tạo site ở nền.
 */
export async function startProvision(keyId: string, idempotencyKey: string, body: ProvisionBody): Promise<{ created: boolean; jobId: string; siteId: string }> {
  await ensureControlSchema();
  const ctl = controlPool();
  const hash = sha256(stableJson(body));
  const prev = await ctl.query<{ id: string; site_id: string; request_hash: string }>('SELECT id, site_id, request_hash FROM site_jobs WHERE key_id = $1 AND idempotency_key = $2', [keyId, idempotencyKey]);
  const found = prev.rows[0];
  if (found) {
    if (found.request_hash !== hash) throw new ProvisionHttpError(422, 'IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key này đã dùng cho một lệnh có nội dung khác');
    return { created: false, jobId: found.id, siteId: found.site_id };
  }
  const jobId = newSiteId();
  const siteId = newSiteId();
  const ins = await ctl.query<{ id: string }>(
    `INSERT INTO site_jobs (id, key_id, idempotency_key, request_hash, kind, site_id, status, steps)
     VALUES ($1, $2, $3, $4, 'provision', $5, 'queued', $6) ON CONFLICT (key_id, idempotency_key) DO NOTHING RETURNING id`,
    [jobId, keyId, idempotencyKey, hash, siteId, JSON.stringify(stepsOf('pending'))],
  );
  if (!ins.rowCount) return startProvision(keyId, idempotencyKey, body); // hai lệnh trùng tới cùng lúc: lấy việc của lệnh kia
  void runProvision(jobId, siteId, body);
  return { created: true, jobId, siteId };
}

/** Chạy việc tạo site; mọi lỗi được ghi vào việc, không ném ra ngoài (chạy nền). */
export async function runProvision(jobId: string, siteId: string, body: ProvisionBody): Promise<void> {
  const ctl = controlPool();
  const SET = 'UPDATE site_jobs SET status = $2, steps = $3, result_enc = $4, error_code = $5, error_message = $6, updated_at = now() WHERE id = $1';
  try {
    await ctl.query(SET, [jobId, 'running', JSON.stringify(stepsOf('running')), null, null, null]);
    const r = await createSiteWithOwner({ siteId, slug: body.slug, domain: body.domain, ...(body.displayName ? { name: body.displayName } : {}), email: body.owner.email });
    const secret = encryptSiteSecret(JSON.stringify({ email: r.ownerEmail, initialPassword: r.ownerPassword }));
    await ctl.query(SET, [jobId, 'done', JSON.stringify(stepsOf('done')), secret, null, null]);
  } catch (err) {
    const known = err instanceof SiteProvisionError;
    const code = known ? err.code : 'SITE_PROVISION_FAILED';
    const message = known ? err.message : 'Không tạo được site. Đội vận hành đã được báo.';
    await ctl.query(SET, [jobId, 'failed', JSON.stringify(stepsOf('failed')), null, code, message]).catch(() => undefined);
  }
}

/** Trạng thái việc. Việc tạo site xong: lần đọc ĐẦU trả kèm email + mật khẩu ban đầu của chủ site rồi xoá khỏi database. */
export async function getJob(keyId: string, jobId: string): Promise<Record<string, unknown>> {
  await ensureControlSchema();
  const ctl = controlPool();
  const r = await ctl.query('SELECT id, site_id, kind, status, steps, error_code, error_message FROM site_jobs WHERE id = $1 AND key_id = $2', [jobId, keyId]);
  const j = r.rows[0];
  if (!j) throw new ProvisionHttpError(404, 'JOB_NOT_FOUND', 'Không có việc này');
  const out: Record<string, unknown> = {
    jobId: j.id, siteId: j.site_id, kind: j.kind, status: j.status, steps: j.steps,
    error: j.error_code ? { code: j.error_code, message: j.error_message } : null,
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

// ── Đọc site ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

const SITE_SQL = `
  SELECT s.id, s.slug, s.display_name, s.status, s.schema_version, s.app_version, s.external_ref, s.created_at,
         coalesce(json_agg(json_build_object('domain', d.domain, 'primary', d.is_primary) ORDER BY d.is_primary DESC, d.domain)
                  FILTER (WHERE d.domain IS NOT NULL), '[]') AS domains
    FROM sites s LEFT JOIN site_domains d ON d.site_id = s.id`;

type SiteRow = { id: string; slug: string; display_name: string; status: string; schema_version: string | null; app_version: string | null; external_ref: string | null; created_at: Date; domains: unknown };
const siteDto = (s: SiteRow) => ({
  siteId: s.id, slug: s.slug, displayName: s.display_name, status: s.status, domains: s.domains,
  schemaVersion: s.schema_version, appVersion: s.app_version, externalRef: s.external_ref, createdAt: new Date(s.created_at).toISOString(),
});

export async function getSite(siteId: string): Promise<ReturnType<typeof siteDto>> {
  await ensureControlSchema();
  const r = await controlPool().query<SiteRow>(`${SITE_SQL} WHERE s.id = $1 GROUP BY s.id`, [siteId]);
  if (!r.rows[0]) throw new ProvisionHttpError(404, 'SITE_NOT_FOUND', 'Không có site này');
  return siteDto(r.rows[0]);
}

export async function listSitesDto(status?: string): Promise<{ items: Array<ReturnType<typeof siteDto>>; next: null }> {
  await ensureControlSchema();
  const r = await controlPool().query<SiteRow>(`${SITE_SQL} WHERE ($1::text IS NULL OR s.status = $1) GROUP BY s.id ORDER BY s.created_at`, [status ?? null]);
  return { items: r.rows.map(siteDto), next: null };
}

export async function health(): Promise<{ contract: string; sites: Record<string, number> }> {
  await ensureControlSchema();
  const r = await controlPool().query<{ status: string; n: number }>('SELECT status, count(*)::int AS n FROM sites GROUP BY status');
  return { contract: CONTRACT, sites: Object.fromEntries(r.rows.map((x) => [x.status, x.n])) };
}
