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
 *   bizcity site key-create --label "Site Manager" [--ips 1.2.3.4,5.6.7.8] [--json]
 *       tạo khoá prov_… gọi Provisioning API (in MỘT LẦN; database chỉ giữ băm)
 *   bizcity site migrate (--all | --slug a,b) [--backup-dir backups/sites] [--skip-backup] [--drain-seconds 35] [--json]
 *       nâng lược đồ: database mẫu trước, rồi từng site (sao lưu pg_dump trước mỗi site); site lỗi → migration_failed, đi tiếp;
 *       in bảng tổng kết; mã thoát 1 khi có site lỗi (chạy lại sau khi sửa) — R-SITE-8, R-SITE-10, docs/ops/NHIEU-SITE.md §6
 *   bizcity site backup (--all | --slug a,b) [--dir backups/sites] [--keep 14] [--schedule] [--json]
 *       sao lưu pg_dump từng site, tự kiểm, ghi site_backups; --keep giữ N bản mới nhất mỗi site; --schedule = lượt của lịch đêm
 *   bizcity site backups [--slug a] [--json]        các bản sao lưu đã ghi
 *   bizcity site backup-import --slug a --file x.dump [--json]   ghi tệp làm ngoài lệnh (vd từ PITR) làm bản sao lưu của site
 *   bizcity site restore --slug a --backup <mã> --yes [--drain-seconds 35] [--json]
 *       khôi phục site từ bản sao lưu của chính nó (database tạm → kiểm → đổi tên; database cũ giữ lại) — NHIEU-SITE.md §8
 *
 * Chạy trực tiếp: npx tsx --conditions=development apps/api/src/cli/site.ts <lệnh> …
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SiteProvisionError } from '@bizcity/platform/db/site-provisioner';
import { closeSiteRegistry } from '@bizcity/platform/db/site-registry';
import { createSiteWithOwner, listSites } from '../db/site-create.js';
import { createProvisionKey } from '../modules/sites/provisioning.service.js';
import { closeDb } from '../db/client.js';
// [2026-11-22 11:19 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B3 (D039-12): lệnh site migrate — migration lõi + module SDK + registry module trên từng database site
import pg from 'pg';
import { runModuleMigrations } from '@bizcity/platform/db/module-db';
import { registerSitePool, unregisterSitePool, withSite } from '@bizcity/platform/db/site';
import { migrateSites, SiteMigrateError, type SiteMigrateReport } from '@bizcity/platform/db/site-migrate';
import { discoverSdkModules } from '../core/sdk-modules.js';
// [2026-11-22 12:06 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B6a (D039-13): lệnh site backup / backups / restore
import { backupSite, importBackup, listBackups, restoreSite, SiteBackupError } from '@bizcity/platform/db/site-backup';
import { listSites as listAllSites } from '../db/site-create.js';
import { syncBundled } from '../core/module-lifecycle.js';

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
  // [2026-11-22 10:48 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B5a: khoá prov_… cho Provisioning API
  if (cmd === 'key-create') {
    const label = typeof args.label === 'string' ? args.label : '';
    const ips = typeof args.ips === 'string' ? args.ips.split(',').map((x) => x.trim()).filter(Boolean) : [];
    const k = await createProvisionKey(label, ips);
    if (json) console.log(JSON.stringify(k));
    else console.log(`✓ Khoá Provisioning ${k.prefix}… (${k.id})\n  Khoá (chỉ in lần này, lưu vào Site Manager): ${k.key}`);
    return 0;
  }
  if (cmd === 'migrate') {
    const slugs = typeof args.slug === 'string' ? args.slug.split(',').map((x) => x.trim()).filter(Boolean) : [];
    if (!slugs.length && args.all !== true) { console.error('Chọn site: --all (mọi site) hoặc --slug a,b'); return 2; }
    const drain = typeof args['drain-seconds'] === 'string' ? Number(args['drain-seconds']) : undefined;
    if (drain !== undefined && !(Number.isFinite(drain) && drain >= 0)) { console.error('--drain-seconds phải là số giây ≥ 0'); return 2; }
    let report: SiteMigrateReport;
    try {
      report = await migrateSites({
        ...(slugs.length ? { slugs } : {}),
        extra: siteExtras,
        ...(typeof args['backup-dir'] === 'string' ? { backupDir: args['backup-dir'] } : {}),
        skipBackup: args['skip-backup'] === true,
        ...(drain !== undefined ? { drainMs: drain * 1000 } : {}),
        log: json ? () => {} : (m) => console.log(m),
      });
    } catch (err) {
      if (err instanceof SiteMigrateError) { console.error(`✗ ${err.code}: ${err.message}`); return 1; }
      throw err;
    }
    if (json) console.log(JSON.stringify(report));
    else printReport(report);
    return report.failed ? 1 : 0;
  }
  if (cmd === 'backup') {
    const slugs = typeof args.slug === 'string' ? args.slug.split(',').map((x) => x.trim()).filter(Boolean) : [];
    if (!slugs.length && args.all !== true) { console.error('Chọn site: --all (mọi site) hoặc --slug a,b'); return 2; }
    const keep = typeof args.keep === 'string' ? Number(args.keep) : undefined;
    if (keep !== undefined && !(Number.isInteger(keep) && keep >= 1)) { console.error('--keep phải là số nguyên ≥ 1'); return 2; }
    const targets = slugs.length ? slugs : (await listAllSites()).filter((s) => s.status !== 'deleted' && s.status !== 'provisioning').map((s) => s.slug);
    const out: unknown[] = [];
    let failed = 0;
    for (const slug of targets) {
      try {
        const r = await backupSite(slug, { ...(typeof args.dir === 'string' ? { dir: args.dir } : {}), reason: args.schedule === true ? 'schedule' : 'manual', ...(keep ? { keep } : {}) });
        out.push(r);
        if (!json) console.log(`✓ ${r.slug.padEnd(30)} ${(r.bytes / 1048576).toFixed(1).padStart(7)} MB  ${r.tables} bảng  ${r.file}  [${r.id}]${r.pruned.length ? `  · xoá ${r.pruned.length} bản cũ` : ''}`);
      } catch (err) {
        if (!(err instanceof SiteBackupError)) throw err;
        failed++;
        out.push({ slug, error: err.code, message: err.message });
        if (!json) console.error(`✗ ${slug}: ${err.code} — ${err.message}`);
      }
    }
    if (json) console.log(JSON.stringify(out));
    return failed ? 1 : 0;
  }
  if (cmd === 'backups') {
    const rows = await listBackups(typeof args.slug === 'string' ? args.slug : undefined);
    if (json) console.log(JSON.stringify(rows));
    else if (!rows.length) console.log('(chưa có bản sao lưu nào)');
    else for (const b of rows) console.log(`${b.slug.padEnd(30)} ${b.createdAt.slice(0, 19).replace('T', ' ')}  ${b.reason.padEnd(8)} ${(b.bytes / 1048576).toFixed(1).padStart(7)} MB  ${b.id}  ${b.file}`);
    return 0;
  }
  if (cmd === 'backup-import') {
    const slug = typeof args.slug === 'string' ? args.slug : '';
    const file = typeof args.file === 'string' ? args.file : '';
    if (!slug || !file) { console.error('Thiếu --slug hoặc --file'); return 2; }
    try {
      const r = await importBackup(slug, file);
      if (json) console.log(JSON.stringify(r));
      else console.log(`✓ Đã ghi ${r.file} làm bản sao lưu của ${r.slug} (${r.tables} bảng) [${r.id}]. Khôi phục: bizcity site restore --slug ${r.slug} --backup ${r.id} --yes`);
      return 0;
    } catch (err) {
      if (err instanceof SiteBackupError) { console.error(`✗ ${err.code}: ${err.message}`); return 1; }
      throw err;
    }
  }
  if (cmd === 'restore') {
    const slug = typeof args.slug === 'string' ? args.slug : '';
    const backup = typeof args.backup === 'string' ? args.backup : '';
    if (!slug || !backup) { console.error('Thiếu --slug hoặc --backup (mã ở "bizcity site backups --slug …")'); return 2; }
    if (args.yes !== true) { console.error('Khôi phục thay database đang chạy của site bằng bản sao lưu (database cũ giữ lại để lùi). Chạy lại với --yes để xác nhận.'); return 2; }
    const drain = typeof args['drain-seconds'] === 'string' ? Number(args['drain-seconds']) : undefined;
    if (drain !== undefined && !(Number.isFinite(drain) && drain >= 0)) { console.error('--drain-seconds phải là số giây ≥ 0'); return 2; }
    try {
      const r = await restoreSite(slug, backup, { ...(drain !== undefined ? { drainMs: drain * 1000 } : {}), log: json ? () => {} : (m) => console.log(m) });
      if (json) console.log(JSON.stringify(r));
      else {
        console.log(`✓ Đã khôi phục ${r.slug} từ bản ${r.backupId}. Database cũ: ${r.previousDb} (giữ để lùi; xoá tay sau 7 ngày).`);
        if (r.schemaChanged) console.log(`  Lược đồ của bản khôi phục: ${r.schemaVersion}. Ứng dụng mới hơn bản này thì chạy: bizcity site migrate --slug ${r.slug}`);
      }
      return 0;
    } catch (err) {
      if (err instanceof SiteBackupError) { console.error(`✗ ${err.code}: ${err.message}`); return 1; }
      throw err;
    }
  }
  console.error('Lệnh: site create --slug <ten> --domain <ten.mien> [--name …] [--email …] [--json] | site list [--json] | site key-create --label … [--ips …] [--json] | site migrate (--all | --slug a,b) [--skip-backup] [--json] | site backup (--all | --slug a,b) [--keep N] [--json] | site backups [--slug a] | site restore --slug a --backup <mã> --yes');
  return 2;
}

/** Migration module SDK + đồng bộ registry module (như job cơ sở dữ liệu db/setup.ts) trên một database, bằng kết nối quản trị. */
async function siteExtras(connectionString: string, log: (m: string) => void): Promise<string[]> {
  const applied: string[] = [];
  for (const m of discoverSdkModules()) {
    const reads = (m.manifest.data as { reads?: string[] } | undefined)?.reads ?? [];
    applied.push(...await runModuleMigrations(m.key, `${m.dir}/migrations`, { reads, log, connectionString }));
  }
  const tempId = `prov:migrate:${new URL(connectionString).pathname.slice(1)}`;
  registerSitePool(tempId, new pg.Pool({ connectionString, max: 2 }));
  try {
    const changes = await withSite(tempId, () => syncBundled('site-migrate'));
    if (changes.length) log(`  registry module: ${changes.map((c) => `${c.action} ${c.key}`).join(', ')}`);
  } finally {
    await unregisterSitePool(tempId);
  }
  return applied;
}

function printReport(r: SiteMigrateReport): void {
  const mark = { migrated: '✓ đã nâng', 'up-to-date': '· đã mới', failed: '✗ LỖI' } as const;
  console.log(`\nLược đồ cần: ${r.required}  ·  database mẫu ${r.template.db || '(chưa đặt SITE_TEMPLATE_DB)'}: ${r.template.applied.length} migration`);
  for (const s of r.sites) {
    console.log(`${s.slug.padEnd(30)} ${mark[s.outcome].padEnd(10)} ${String(s.applied.length).padStart(3)} migration  ${s.backup ?? ''}${s.error ? `\n    ${s.error}` : ''}`);
  }
  console.log(r.failed ? `\n✗ ${r.failed} site lỗi: đang bị chặn (503 SITE_MIGRATION_FAILED). Sửa rồi chạy lại cùng lệnh; lùi = khôi phục bản sao lưu ở trên.` : `\n✓ Xong ${r.sites.length} site.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main(process.argv.slice(2))
    .then(async (code) => { await closeSiteRegistry(); await closeDb(); process.exit(code); })
    .catch(async (err: unknown) => { console.error((err as Error).message); await closeSiteRegistry().catch(() => undefined); await closeDb().catch(() => undefined); process.exit(1); });
}
