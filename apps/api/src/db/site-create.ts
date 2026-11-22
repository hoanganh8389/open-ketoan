// @bizcity-layer P apps/api
// [2026-11-22 10:43 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B4b (D039-9): nối Site Provisioner (Platform) với seed() của Kernel — đơn vị đầu + chủ site cho site mới; lệnh cli/site.ts và Provisioning API (B5) cùng gọi
/**
 * Tạo site kèm chủ site. Platform không gọi Kernel (lớp), nên việc nối `createSite()` với `seed()` nằm ở đây — cùng lớp với
 * `db/setup.ts` (job cơ sở dữ liệu), qua cổng công khai `kernel/public.ts`.
 */
import { randomBytes } from 'node:crypto';
import { createSite } from '@bizcity/platform/db/site-provisioner';
import { controlPool, ensureControlSchema } from '@bizcity/platform/db/site-registry';
import { seed } from '../kernel/public.js';

/** Mật khẩu ban đầu của chủ site: 16+ ký tự đủ chữ hoa / thường / số / ký hiệu; chỉ trả về một lần, không ghi nhật ký. */
export const ownerPassword = (): string => `Bc${randomBytes(12).toString('base64url')}#7`;

export interface SiteCreateResult { siteId: string; slug: string; domain: string; dbName: string; ownerEmail: string; ownerPassword: string; tenantId: string }

/** Tạo site và khởi tạo đơn vị đầu + chủ site bằng seed() của Kernel (không in bí mật, không tự tạo khoá API). */
// [2026-11-22 10:48 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B5a: nhận mã site cấp trước (Provisioning API trả mã site ngay khi nhận lệnh)
export async function createSiteWithOwner(opts: { siteId?: string; slug: string; domain: string; name?: string; email?: string }): Promise<SiteCreateResult> {
  const domain = opts.domain.trim().toLowerCase();
  const ownerEmail = (opts.email ?? `admin@${domain}`).trim().toLowerCase();
  const password = ownerPassword();
  const created = await createSite(
    { ...(opts.siteId ? { siteId: opts.siteId } : {}), slug: opts.slug, domain, displayName: opts.name ?? '', ownerEmail },
    async ({ slug }) => seed({ tenantCode: slug, tenantName: opts.name || slug, adminEmail: ownerEmail, adminPassword: password, quiet: true, apiKey: false }),
  );
  return {
    siteId: created.siteId, slug: created.slug, domain: created.domain, dbName: created.dbName,
    ownerEmail, ownerPassword: password, tenantId: created.initialized?.tenantId ?? '',
  };
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
