// @bizcity-layer P apps/api
// [2026-11-22 10:43 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B4b (D039-9): nối Site Provisioner (Platform) với seed() của Kernel — đơn vị đầu + chủ site cho site mới; lệnh cli/site.ts và Provisioning API (B5) cùng gọi
/**
 * Tạo site kèm chủ site. Platform không gọi Kernel (lớp), nên việc nối `createSite()` với `seed()` nằm ở đây — cùng lớp với
 * `db/setup.ts` (job cơ sở dữ liệu), qua cổng công khai `kernel/public.ts`.
 */
import { randomBytes } from 'node:crypto';
import { createSite, type SiteStepKey } from '@bizcity/platform/db/site-provisioner';
import { controlPool, ensureControlSchema } from '@bizcity/platform/db/site-registry';
import { seed } from '../kernel/public.js';

/** Mật khẩu ban đầu của chủ site: 16+ ký tự đủ chữ hoa / thường / số / ký hiệu; chỉ trả về một lần, không ghi nhật ký. */
export const ownerPassword = (): string => `Bc${randomBytes(12).toString('base64url')}#7`;

export interface SiteCreateResult { siteId: string; slug: string; domain: string; dbName: string; ownerEmail: string; ownerPassword: string; tenantId: string; sample?: SampleOutcome }

// [2026-11-22 08:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B8 (S039-21): dữ liệu mẫu cho site dùng thử
/** Kết quả nạp Công ty mẫu: `loaded` = có đơn vị mẫu + gói đã chạy; `failed` = site vẫn dùng được, chỉ thiếu dữ liệu mẫu. */
export type SampleOutcome = { status: 'loaded'; tenantCode: string; presetId: string } | { status: 'failed'; presetId: string; why: string };
export type CreateStepKey = SiteStepKey | 'load_sample';

/** Gói mẫu cho site dùng thử: BIZCITY_SAMPLE (nếu là mã gói) hoặc `thuong-mai-ban-le` (gói duy nhất có sẵn). */
export const trialSamplePreset = (): string => {
  const v = (process.env.BIZCITY_SAMPLE ?? '').trim();
  return v && v !== 'off' ? v : 'thuong-mai-ban-le';
};

/** Tạo site và khởi tạo đơn vị đầu + chủ site bằng seed() của Kernel (không in bí mật, không tự tạo khoá API). */
// [2026-11-22 10:48 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B5a: nhận mã site cấp trước (Provisioning API trả mã site ngay khi nhận lệnh)
// [2026-11-22 08:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B8 (S039-21): externalRef, sample, onStep
export async function createSiteWithOwner(opts: {
  siteId?: string; slug: string; domain: string; name?: string; email?: string;
  externalRef?: string; sample?: boolean; onStep?: (key: CreateStepKey, status: 'running' | 'done' | 'failed') => void | Promise<void>;
}): Promise<SiteCreateResult> {
  const domain = opts.domain.trim().toLowerCase();
  const ownerEmail = (opts.email ?? `admin@${domain}`).trim().toLowerCase();
  const password = ownerPassword();
  let sample: SampleOutcome | undefined;
  const created = await createSite(
    {
      ...(opts.siteId ? { siteId: opts.siteId } : {}), slug: opts.slug, domain, displayName: opts.name ?? '', ownerEmail,
      ...(opts.externalRef ? { externalRef: opts.externalRef } : {}),
      ...(opts.onStep ? { onStep: opts.onStep } : {}),
    },
    async ({ slug }) => {
      const r = await seed({ tenantCode: slug, tenantName: opts.name || slug, adminEmail: ownerEmail, adminPassword: password, quiet: true, apiKey: false });
      if (opts.sample) sample = await loadSample(ownerEmail, password, opts.onStep);
      return r;
    },
  );
  return {
    siteId: created.siteId, slug: created.slug, domain: created.domain, dbName: created.dbName,
    ownerEmail, ownerPassword: password, tenantId: created.initialized?.tenantId ?? '',
    ...(sample ? { sample } : {}),
  };
}

/**
 * Công ty mẫu (PHASE-036 `createSampleTenant`) trong site mới — chạy trong ngữ cảnh site tạm của createSite (db = database mới).
 * Cùng email + mật khẩu ban đầu với chủ site để khách đăng nhập được cả hai đơn vị. Lỗi không làm hỏng việc tạo site (như job cài).
 */
async function loadSample(ownerEmail: string, password: string, onStep?: (key: CreateStepKey, status: 'running' | 'done' | 'failed') => void | Promise<void>): Promise<SampleOutcome> {
  const presetId = trialSamplePreset();
  const report = async (s: 'running' | 'done' | 'failed') => { try { await onStep?.('load_sample', s); } catch { /* nuot-loi: báo bước chỉ để hiện tiến độ */ } };
  await report('running');
  try {
    const { createSampleTenant } = await import('../modules/system/setup-run.js');
    const code = (process.env.SAMPLE_TENANT_CODE ?? '').trim() || 'mau';
    const r = await createSampleTenant({ presetId, code, adminPassword: password }, (o) => seed({ ...o, adminEmail: ownerEmail, quiet: true, apiKey: false }));
    const ok = !r.run || r.run.status !== 'failed';
    await report(ok ? 'done' : 'failed');
    return ok ? { status: 'loaded', tenantCode: code, presetId } : { status: 'failed', presetId, why: 'gói mẫu chạy hỏng' };
  } catch (err) {
    await report('failed');
    return { status: 'failed', presetId, why: err instanceof Error ? err.name : 'lỗi lạ' };
  }
}

/** Các site trong Site Registry: mã, slug, trạng thái, database, tên miền (tên miền chính đứng đầu). */
export async function listSites(): Promise<Array<{ id: string; slug: string; status: string; db_name: string; domains: string }>> {
  await ensureControlSchema();
  const r = await controlPool().query(
    `SELECT s.id, s.slug, s.status, s.db_name, coalesce(string_agg(d.domain, ', ' ORDER BY d.is_primary DESC, d.domain), '') AS domains
       FROM sites s LEFT JOIN site_domains d ON d.site_id = s.id
      GROUP BY s.id ORDER BY s.created_at`,
  );
  return r.rows;
}
