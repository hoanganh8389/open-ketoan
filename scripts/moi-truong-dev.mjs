#!/usr/bin/env node
// [2026-11-25 08:41 PM Johnny Chu - Chu Hoàng Anh] FLOW — STD-12 (chữ chốt ở dòng giữ chỗ STD-12, #661): môi trường dev một lệnh + chặn trước khi đẩy. Chủ chỉ đạo 2026-11-25:
//   "selfcheck máy contributor và agent tự động cài các công cụ hỗ trợ dev có env ổn để selfcheck". Không phụ thuộc gói ngoài (chạy được trước npm install).
/**
 * MÔI TRƯỜNG DEV — kiểm và dựng những gì contributor / trợ lý AI cần để selfcheck, test và các công cụ bản đồ lỗi chạy được.
 *
 *   node scripts/moi-truong-dev.mjs                 # chỉ KIỂM, in bảng ✔ / ✘ + cách sửa (không đổi gì)
 *   node scripts/moi-truong-dev.mjs --sua           # sửa những gì sửa tự động được: npm install, build gói, clone / kéo ../bizcity-platform,
 *                                                   #   docker compose up -d db, cài hook pre-push. Không bao giờ đụng CSDL `ketoan`, không xoá gì.
 *   node scripts/moi-truong-dev.mjs --nhanh         # kiểm nhanh (không mạng, không docker, không selfcheck) — hook SessionStart của agent
 *   node scripts/moi-truong-dev.mjs --truoc-khi-day # hook pre-push: nhan-viec kiem + selfcheck, CHỈ chặn kiểm đỏ MỚI so với origin/main
 *
 * So với origin/main: chạy selfcheck trên một worktree tạm của origin/main (đệm theo SHA ở .git/bizcity/), so tập dấu vân tay `fp` của các phát hiện
 * thuộc kiểm đỏ. Đỏ có sẵn trên main không chặn — chỉ phần nhánh này làm thêm. `git push --no-verify` vẫn bỏ qua được: người duyệt đòi khối bằng chứng (R-REV-17).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WIN = process.platform === 'win32';
const PLATFORM_URL = 'https://github.com/hoanganh8389/bizcity-platform.git';

/* ── phần thuần (có test ở moi-truong-dev.test.mjs) ── */

/** "22.12.0" ≥ ">=22.12"? */
export function nodeOk(version, engines = '>=22.12') {
  const need = (/(\d+)\.(\d+)/.exec(engines) ?? [0, 22, 12]).slice(1).map(Number);
  const have = version.replace(/^v/, '').split('.').map(Number);
  return have[0] > need[0] || (have[0] === need[0] && have[1] >= need[1]);
}

/** Dấu vân tay của phát hiện thuộc kiểm đỏ (status fail) trong selfcheck.json. */
export function redPrints(selfcheck) {
  const out = new Map();
  for (const r of selfcheck?.results ?? []) {
    if (r.status !== 'fail' && r.status !== 'error') continue;
    const fps = (r.findings ?? []).map((f) => f.fp ?? `${r.id}|${f.file ?? ''}|${f.key ?? f.message ?? ''}`);
    out.set(r.id, { title: r.title, fps: new Set(fps.length ? fps : [`${r.id}|(lỗi chạy check)`]), findings: r.findings ?? [] });
  }
  return out;
}

/** Dấu vân tay của MỌI phát hiện (mọi trạng thái, kể cả nợ cũ ở baseline) — để không tính lại những gì main đã có. */
const fpOf = (id, f) => f.fp ?? `${id}|${f.file ?? ''}|${f.key ?? f.message ?? ''}`;
export function allPrints(selfcheck) {
  const s = new Set();
  for (const r of selfcheck?.results ?? []) for (const f of r.findings ?? []) s.add(fpOf(r.id, f));
  return s;
}

/** Kiểm đỏ MỚI của nhánh so với main: phát hiện thuộc kiểm đỏ ở nhánh mà main chưa có (ở bất kỳ trạng thái nào), hoặc kiểm lỗi khi chạy. */
export function newReds(mainSc, headSc) {
  const known = allPrints(mainSc), mainRed = redPrints(mainSc);
  const out = [];
  for (const [id, h] of redPrints(headSc)) {
    const fresh = h.findings.filter((f) => !known.has(fpOf(id, f)));
    if (!h.findings.length && !mainRed.has(id)) out.push({ id, title: h.title, findings: [{ message: 'kiểm lỗi khi chạy' }] });
    else if (fresh.length) out.push({ id, title: h.title, findings: fresh });
  }
  return out;
}

/** Thư mục cài gói cũ hơn khoá gói? (node_modules/.package-lock.json do npm ghi sau mỗi lần cài) */
export function installStale(lockMtime, installedMtime) {
  return installedMtime == null || lockMtime > installedMtime + 1000;
}

/* ── chạy lệnh ── */
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: opts.cwd ?? ROOT, encoding: 'utf8', shell: WIN && /^(npm|npx|docker)$/.test(cmd), timeout: opts.timeout ?? 600_000, stdio: opts.inherit ? 'inherit' : 'pipe' });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim(), status: r.status };
}
const mtime = (p) => { try { return statSync(p).mtimeMs; } catch { return null; } };
function newest(dir) {
  let t = 0;
  if (!existsSync(dir)) return t;
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    t = Math.max(t, f.isDirectory() ? newest(p) : (mtime(p) ?? 0));
  }
  return t;
}
const platformDir = () => path.resolve(process.env.BIZCITY_PLATFORM_DIR ?? path.join(ROOT, '..', 'bizcity-platform'));

/* ── các mục kiểm ── */
const PKGS = [
  { name: '@ketoan/contracts', dir: 'packages/contracts' },
  { name: '@bizcity/mua-hang-domain', dir: 'modules/mua-hang/domain' },
];

function checks({ quick }) {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const list = [];
  const add = (id, title, ok, fix, sua, level = 'chặn') => list.push({ id, title, ok, fix, sua, level });

  add('E1', `Node ${pkg.engines?.node ?? '>=22.12'} (đang ${process.version})`, nodeOk(process.version, pkg.engines?.node), 'cài Node 22 LTS mới nhất (nodejs.org hoặc nvm / fnm), mở lại terminal', null);

  const git = run('git', ['config', 'user.name']);
  add('E2', 'git có user.name và remote origin', git.ok && git.out.length > 0 && run('git', ['remote', 'get-url', 'origin']).ok, 'git config user.name "<tên>" ; git remote add origin <url repo>', null);

  const lock = mtime(path.join(ROOT, 'package-lock.json'));
  const inst = mtime(path.join(ROOT, 'node_modules', '.package-lock.json'));
  add('E3', 'Gói đã cài và khớp package-lock.json', !installStale(lock ?? 0, inst), 'npm install', () => run('npm', ['install'], { inherit: true }));

  for (const p of PKGS) {
    const dist = path.join(ROOT, p.dir, 'dist');
    const stale = !existsSync(dist) || newest(path.join(ROOT, p.dir, 'src')) > newest(dist);
    add(`E4:${p.name}`, `${p.name} đã build và mới hơn mã nguồn (typecheck không báo lỗi giả)`, !stale, `npm run build -w ${p.name}`, () => run('npm', ['run', 'build', '-w', p.name], { inherit: true }));
  }

  const pd = platformDir();
  const hasTools = existsSync(path.join(pd, 'tools', 'failure-check.mjs')) && existsSync(path.join(pd, 'tools', 'loi.mjs'));
  add('E5', `bizcity-platform ở ${path.relative(ROOT, pd) || pd} (failure-check, loi — AGENTS.md "Màn có ghi dữ liệu")`, hasTools,
    `git clone ${PLATFORM_URL} ${pd}`, () => (existsSync(pd) ? run('git', ['-C', pd, 'pull', '--ff-only'], { inherit: true }) : run('git', ['clone', PLATFORM_URL, pd], { inherit: true })));
  if (hasTools && !quick) {
    run('git', ['-C', pd, 'fetch', '-q', 'origin'], { timeout: 30_000 });
    const behind = run('git', ['-C', pd, 'rev-list', '--count', 'HEAD..origin/main']);
    const n = Number(behind.out) || 0;
    add('E5b', `bizcity-platform mới nhất (đang sau origin/main ${n} commit)`, n === 0, `git -C ${pd} pull --ff-only`, () => run('git', ['-C', pd, 'pull', '--ff-only'], { inherit: true }), 'cảnh báo');
  }

  // .env cho docker compose (giống scripts/cai-nhanh.sh): chưa có → chép .env.example + bí mật ngẫu nhiên; đã có → KHÔNG ghi đè, chỉ thêm biến còn trống.
  const envPath = path.join(ROOT, '.env');
  const envText = existsSync(envPath) ? readFileSync(envPath, 'utf8') : null;
  const has = (k) => new RegExp(`^${k}=.+`, 'm').test(envText ?? '');
  add('E8', '.env có JWT_SECRET và DB_APP_PASSWORD (docker compose cần) — tệp chỉ ở máy, git bỏ qua', envText != null && has('JWT_SECRET') && has('DB_APP_PASSWORD'),
    'bash scripts/cai-nhanh.sh, hoặc --sua (sinh bí mật ngẫu nhiên, không ghi đè .env đã có)', () => {
      const rnd = (n) => randomBytes(64).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, n);
      let t = envText ?? readFileSync(path.join(ROOT, '.env.example'), 'utf8');
      const set = (k, v) => { t = new RegExp(`^${k}=.*$`, 'm').test(t) ? t.replace(new RegExp(`^${k}=.*$`, 'm'), `${k}=${v}`) : `${t.replace(/\n?$/, '\n')}${k}=${v}\n`; };
      if (envText == null) set('JWT_SECRET', rnd(48));
      if (!has('DB_APP_PASSWORD')) set('DB_APP_PASSWORD', rnd(32));
      writeFileSync(envPath, t);
      console.log(`   ${envText == null ? 'tạo .env từ .env.example, sinh JWT_SECRET + DB_APP_PASSWORD' : 'thêm DB_APP_PASSWORD'} (giá trị không in ra)`);
    });

  if (!quick) {
    const d = run('docker', ['compose', 'ps', '--status', 'running', '--services'], { timeout: 20_000 });
    // An toàn dữ liệu: compose của repo đặt tên dự án cố định ("name: ketoan"), nên mọi bản sao / worktree dùng CHUNG container db và volume dữ liệu.
    // `up` trên container đã có có thể TẠO LẠI nó bằng cấu hình của bản sao này → chỉ `up` khi chưa có container nào; đã có thì chỉ `start`.
    const existing = run('docker', ['compose', 'ps', '-a', '-q', 'db'], { timeout: 20_000 }).out.split(/\s+/).filter(Boolean)[0];
    add('E6', 'PostgreSQL (dịch vụ db của docker compose) đang chạy — cần cho npm test, không cần cho selfcheck', d.ok && /\bdb\b/.test(d.out),
      existing ? `docker start ${existing.slice(0, 12)} (container đã có — không tạo lại; test tự dùng CSDL ketoan_test, không bao giờ ketoan)` : 'docker compose up -d db (test tự dùng CSDL ketoan_test, không bao giờ ketoan)',
      () => (existing ? run('docker', ['start', existing], { inherit: true }) : run('docker', ['compose', 'up', '-d', 'db'], { inherit: true })), 'cảnh báo');
  }

  const hooks = run('git', ['config', '--get', 'core.hooksPath']);
  add('E7', 'Hook pre-push của repo đã bật (chặn kiểm đỏ mới trước khi đẩy)', hooks.out === '.githooks', 'git config core.hooksPath .githooks', () => run('git', ['config', 'core.hooksPath', '.githooks']));
  return list;
}

/* ── selfcheck so với main ── */
function selfcheckJson(cwd, outDir) {
  rmSync(outDir, { recursive: true, force: true });
  run(process.execPath, ['tests/conformance/selfcheck.mjs', '--out', outDir], { cwd, timeout: 300_000 });
  try { return JSON.parse(readFileSync(path.join(outDir, 'latest', 'selfcheck.json'), 'utf8')); } catch { return null; }
}
// [2026-11-25 10:12 PM Nguyễn Văn Thủy] FLOW — DAY-DEV: so đỏ mới với nhánh gốc của lần đẩy (main, hoặc dev khi chỉ đẩy vào dev) (đóng góp)
function mainSelfcheck(base = 'main') {
  run('git', ['fetch', '-q', 'origin', base], { timeout: 60_000 });
  const sha = run('git', ['rev-parse', `origin/${base}`]).out;
  const cacheDir = path.join(run('git', ['rev-parse', '--git-common-dir']).out || '.git', 'bizcity');
  const cache = path.resolve(ROOT, cacheDir, `selfcheck-main-${sha.slice(0, 12)}.json`);
  if (existsSync(cache)) return { sha, sc: JSON.parse(readFileSync(cache, 'utf8')) };
  const wt = path.join(tmpdir(), `bizcity-main-${sha.slice(0, 12)}-${process.pid}`);
  run('git', ['worktree', 'add', '--detach', '-q', wt, sha]);
  try {
    const sc = selfcheckJson(wt, path.join(wt, '.selfcheck-out'));
    if (sc) { mkdirSync(path.dirname(cache), { recursive: true }); writeFileSync(cache, JSON.stringify(sc)); }
    return { sha, sc };
  } finally { run('git', ['worktree', 'remove', '--force', wt]); }
}
function compareWithMain(base = 'main') {
  const { sha, sc: mainSc } = mainSelfcheck(base);
  const headSc = selfcheckJson(ROOT, path.join(tmpdir(), `bizcity-head-${process.pid}`));
  if (!mainSc || !headSc) return { ok: false, sha, error: 'không chạy được selfcheck (xem node tests/conformance/selfcheck.mjs)' };
  const fresh = newReds(mainSc, headSc);
  return { ok: fresh.length === 0, sha, fresh, headRed: redPrints(headSc).size, mainRed: redPrints(mainSc).size };
}

/** Hook pre-push: git đưa các dòng "<ref máy> <sha máy> <ref xa> <sha xa>" vào stdin. Chỉ đẩy vào refs/heads/dev (không xoá nhánh) → true.
 *  Chạy tay (không có stdin) → false: kiểm đủ như đẩy main. [2026-11-25 10:12 PM Nguyễn Văn Thủy] FLOW — DAY-DEV (đóng góp) */
function dayChiVaoDev() {
  if (process.stdin.isTTY) return false;
  let raw = '';
  try { raw = readFileSync(0, 'utf8'); } catch { return false; } // nuot-loi: không đọc được stdin → coi như chạy tay, kiểm đủ
  const refs = raw.split('\n').map((l) => l.trim().split(/\s+/)).filter((x) => x.length === 4);
  return refs.length > 0 && refs.every(([lr, ls, rr]) => rr === 'refs/heads/dev' && lr !== '(delete)' && !/^0+$/.test(ls));
}

function printChecks(list) {
  for (const c of list) console.log(`  ${c.ok ? '✔' : c.level === 'cảnh báo' ? '!' : '✘'} ${c.id.padEnd(30)} ${c.title}${c.ok ? '' : `\n      sửa: ${c.fix}${c.sua ? '   (tự sửa: --sua)' : ''}`}`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--truoc-khi-day')) {
    console.log('== trước khi đẩy (STD-12) ==');
    // [2026-11-25 10:12 PM Nguyễn Văn Thủy] FLOW — DAY-DEV: chỉ đẩy vào `dev` (máy thử, lịch tự sửa lỗi — docs/ops/TU-DONG-SUA-LOI.md) → miễn kiểm giữ chỗ
    // (R-FLOW-1 / 3) và "đứng sau main" (R-FLOW-5); selfcheck so đỏ mới với origin/dev. Có ref nào khác `dev` (main, test, nhánh tính năng) → kiểm đủ như cũ (đóng góp)
    const choDev = dayChiVaoDev();
    if (choDev) console.log('   chỉ đẩy vào dev (máy thử): miễn giữ chỗ R-FLOW-1 / 3 và R-FLOW-5 "đứng sau main"; selfcheck so với origin/dev');
    const k = run(process.execPath, ['scripts/nhan-viec.mjs', 'kiem'], { timeout: 120_000 });
    const kLines = k.out.split('\n').filter((l) => /✔|✘|▲/.test(l));
    const mien = (l) => choDev && /✘\s+R-FLOW-(1|3)\b|✘\s+R-FLOW-5\s+nhánh đứng sau/.test(l);
    console.log(kLines.map((l) => (mien(l) ? `${l.replace('✘', '·')} (miễn khi đẩy dev)` : l)).map((l) => (l.length > 160 ? `${l.slice(0, 159)}…` : l)).join('\n'));
    if (choDev) k.ok = !kLines.some((l) => /✘/.test(l) && !mien(l));
    const cmp = compareWithMain(choDev ? 'dev' : 'main');
    if (cmp.error) console.log(`✘ ${cmp.error}`);
    else {
      console.log(`selfcheck: nhánh ${cmp.headRed} kiểm đỏ · origin/${choDev ? 'dev' : 'main'} (${cmp.sha.slice(0, 8)}) ${cmp.mainRed} kiểm đỏ · ĐỎ MỚI do nhánh này: ${cmp.fresh.length}`);
      for (const f of cmp.fresh) {
        console.log(`  ✘ ${f.id} ${f.title}`);
        for (const x of f.findings.slice(0, 5)) console.log(`      ${x.file ? `${x.file}${x.line ? `:${x.line}` : ''}  ` : ''}${x.message ?? ''}`);
        if (f.findings.length > 5) console.log(`      … còn ${f.findings.length - 5}`);
      }
    }
    const ok = k.ok && cmp.ok;
    console.log(ok ? 'ĐẠT — đẩy được. Dán khối bằng chứng vào PR: node scripts/cham-pr.mjs --mau-bang-chung' : 'CHẶN — sửa các mục ✘ rồi đẩy lại (R-FLOW-5, R-REV-17). Đỏ có sẵn trên main không tính.');
    process.exit(ok ? 0 : 1);
  }
  const quick = args.includes('--nhanh');
  let list = checks({ quick });
  if (args.includes('--sua')) {
    for (const c of list.filter((x) => !x.ok && x.sua)) { console.log(`→ ${c.id}: ${c.fix}`); c.sua(); }
    list = checks({ quick });
  }
  console.log(`Môi trường dev — ${path.basename(ROOT)}${quick ? ' (kiểm nhanh)' : ''}`);
  printChecks(list);
  const blocking = list.filter((c) => !c.ok && c.level === 'chặn');
  if (!quick && !args.includes('--khong-selfcheck') && !blocking.some((c) => c.id === 'E1')) {
    const r = run(process.execPath, ['tests/conformance/selfcheck.mjs'], { timeout: 300_000 });
    console.log(`  · selfcheck: ${(r.out.split('\n').find((l) => /đạt ·/.test(l)) ?? 'không đọc được kết quả').trim()} — đỏ có sẵn trên main không tính; trước khi đẩy hook chỉ chặn đỏ MỚI`);
  }
  if (blocking.length) console.log(`MÔI TRƯỜNG: CHƯA ỔN — ${blocking.length} mục ✘. ${blocking.some((c) => c.sua) ? 'Chạy: node scripts/moi-truong-dev.mjs --sua' : ''}`);
  else console.log('MÔI TRƯỜNG: ỔN — selfcheck, test, failure-check, loi chạy được.');
  process.exit(quick ? 0 : blocking.length ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
