// @bizcity-layer P cli
// [2026-11-22 10:36 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B4b (ADR-0036, D039-9): lệnh site (chỉ đọc tham số, in kết quả; việc tạo ở db/site-create.ts) — tạo site (database từ mẫu, vai trò riêng, đơn vị đầu + chủ site) và liệt kê Site Registry
/**
 * LỆNH SITE (PHASE-039, docs/ops/NHIEU-SITE.md). Cần CONTROL_DATABASE_URL, SITE_SECRET_KEY; tạo site cần quyền CREATEDB + CREATEROLE
 * (PROVISION_DATABASE_URL, trống = DATABASE_URL) và database mẫu SITE_TEMPLATE_DB đã chạy đủ migration.
 *
 *   bizcity site create --slug <ten> --domain <ten.mien> [--name "Công ty A"] [--email chu@congty.vn] [--json]
 *       tạo site; in MỘT LẦN email + mật khẩu của chủ site (đổi sau khi đăng nhập). Không ghi mật khẩu vào nhật ký.
 *   bizcity site list [--json]
 *       danh sách site trong registry: mã, slug, trạng thái, database, tên miền
 *
 * Chạy trực tiếp: npx tsx --conditions=development apps/api/src/cli/site.ts <lệnh> …
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SiteProvisionError } from '@bizcity/platform/db/site-provisioner';
import { closeSiteRegistry } from '@bizcity/platform/db/site-registry';
import { createSiteWithOwner, listSites } from '../db/site-create.js';
import { closeDb } from '../db/client.js';

type Args = { _: string[]; [flag: string]: string | boolean | string[] };

export function parseArgs(argv: string[]): Args {
  const out: Args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const cmd = args._[0];
  const json = args.json === true;
  if (cmd === 'create') {
    const slug = typeof args.slug === 'string' ? args.slug : '';
    const domain = typeof args.domain === 'string' ? args.domain : '';
    if (!slug || !domain) { console.error('Thiếu --slug hoặc --domain. Dùng: bizcity site create --slug <ten> --domain <ten.mien> [--name …] [--email …]'); return 2; }
    try {
      const r = await createSiteWithOwner({ slug, domain, ...(typeof args.name === 'string' ? { name: args.name } : {}), ...(typeof args.email === 'string' ? { email: args.email } : {}) });
      if (json) console.log(JSON.stringify(r));
      else {
        console.log(`✓ Đã tạo site ${r.slug} (${r.siteId}) — database ${r.dbName}`);
        console.log(`  Mở: https://${r.domain}`);
        console.log(`  Chủ site: ${r.ownerEmail}  ·  mật khẩu (chỉ in lần này, đổi sau khi đăng nhập): ${r.ownerPassword}`);
      }
      return 0;
    } catch (err) {
      if (err instanceof SiteProvisionError) { console.error(`✗ ${err.code}: ${err.message}`); return 1; }
      throw err;
    }
  }
  if (cmd === 'list') {
    const rows = await listSites();
    if (json) console.log(JSON.stringify(rows));
    else if (!rows.length) console.log('(chưa có site nào)');
    else for (const s of rows) console.log(`${s.slug.padEnd(30)} ${s.status.padEnd(17)} ${s.db_name.padEnd(34)} ${s.domains}  [${s.id}]`);
    return 0;
  }
  console.error('Lệnh: site create --slug <ten> --domain <ten.mien> [--name …] [--email …] [--json] | site list [--json]');
  return 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main(process.argv.slice(2))
    .then(async (code) => { await closeSiteRegistry(); await closeDb(); process.exit(code); })
    .catch(async (err: unknown) => { console.error((err as Error).message); await closeSiteRegistry().catch(() => undefined); await closeDb().catch(() => undefined); process.exit(1); });
}
