#!/usr/bin/env node
// [2026-11-22 08:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-040 — B2 (S040-6, S040-7): bộ chấm tiến độ theo PR đã merge — chỉ đọc repo + GitHub, ghi docs/reviews/tien-do/PR-<n>.json và sinh docs/reviews/TIEN-DO-PR.md
/**
 * Chấm tiến độ một PR đã merge vào main: ba mặt (nền móng · trụ cột · ma trận chứng từ, tuỳ chọn ma trận tuân thủ C-*),
 * 12 trục gợi ý từ luật dò H-*, CI / người duyệt / khối bằng chứng → VERIFIED · UNVERIFIED · BLOCKED.
 * Đặc tả: docs/phases/PHASE-040-DOCUMENT-CONTINUITY-TIEN-DO-TRU-COT/20-CHAM-DIEM-TIEN-DO.md.
 *
 *   node scripts/cham-pr.mjs --pr 581                  in kết quả một PR (JSON)
 *   node scripts/cham-pr.mjs --last 10 --write         chấm 10 PR merge gần nhất, ghi PR-<n>.json, sinh lại bảng
 *   node scripts/cham-pr.mjs --since 2026-11-15 --write
 *   node scripts/cham-pr.mjs --board                   chỉ sinh lại docs/reviews/TIEN-DO-PR.md từ các PR-<n>.json
 *     --selfcheck   chạy thêm selfcheck ở commit trước / sau merge (worktree tạm) để lấy điểm ma trận tuân thủ C-* — chậm
 *     --no-keep-human  khi ghi đè PR-<n>.json đã có, mặc định giữ trục người duyệt đã sửa (`axesBy: "người"`); cờ này bỏ giữ
 *
 * Chỉ đọc: git (đã fetch), `gh api`. Không ghi giờ sinh vào tệp (cùng nguồn → cùng tệp).
 * Cần: `gh` đã đăng nhập; `git fetch origin` trước khi chạy.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONTRACT, ciOf, criteriaDiff, docMatrix, gradeOf, impactOf, kindOf, parseEvidence, pillarFacets, prScore, regressions, releaseOf,
  renderBoard, suggestAxes, verdictOf,
} from './cham-pr.lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'docs/reviews/tien-do');
const BOARD = path.join(ROOT, 'docs/reviews/TIEN-DO-PR.md');
const TRU_COT = 'docs/standard/tru-cot.json';
const DOC_MATRIX = 'docs/phases/PHASE-040-DOCUMENT-CONTINUITY-TIEN-DO-TRU-COT/10-MA-TRAN-CHUNG-TU.md';

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const flag = (n) => args.includes(n);

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const gitShow = (sha, file) => { try { return execFileSync('git', ['show', `${sha}:${file}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 * 1024 * 1024 }); } catch { return null; } }; // nuot-loi: tệp chưa có ở commit đó = null (mặt đó "—")
/** `gh api` có thử lại (mạng chập chờn làm hỏng cả lượt chạy lùi); hết lượt thử thì ném lỗi gốc. */
function gh(p, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      return JSON.parse(execFileSync('gh', ['api', p], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }));
    } catch (e) {
      if (i >= tries) throw e;
      execFileSync(process.execPath, ['-e', `setTimeout(() => {}, ${2000 * i})`]); // chờ rồi thử lại
    }
  }
}
const repo = () => {
  const url = git('remote', 'get-url', 'origin').trim();
  const m = /github\.com[:/]([^/]+\/[^/.]+)/.exec(url);
  if (!m) throw new Error(`origin không phải GitHub: ${url}`);
  return m[1];
};

/** Tài khoản trong .github/CODEOWNERS — tác giả là người giữ framework thì H-FRAMEWORK không trừ điểm T2. */
function codeowners(sha) {
  const text = gitShow(sha, '.github/CODEOWNERS') ?? '';
  return new Set([...text.matchAll(/@([A-Za-z0-9-]+)/g)].map((m) => m[1].toLowerCase()));
}

/** Điểm ma trận tuân thủ C-* bằng selfcheck ở một commit (worktree tạm, xoá sau). */
function complianceAt(sha) {
  const dir = mkdtempSync(path.join(tmpdir(), 'cham-pr-'));
  try {
    git('worktree', 'add', '--detach', dir, sha);
    spawnSync(process.execPath, ['tests/conformance/selfcheck.mjs'], { cwd: dir, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    const f = path.join(dir, 'tests/conformance/output/latest/scoreboard.json');
    return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')).compliance?.score ?? null : null;
  } finally {
    try { git('worktree', 'remove', '--force', dir); } catch { rmSync(dir, { recursive: true, force: true }); } // nuot-loi: dọn worktree tạm; không gỡ được thì xoá thư mục
  }
}

function scanRange(base, merge) {
  const r = spawnSync(process.execPath, ['scripts/ra-soat-dong-gop.mjs', '--range', `${base}..${merge}`, '--json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (!r.stdout.trim()) throw new Error(`ra-soat-dong-gop không chạy được: ${r.stderr.slice(0, 400)}`);
  return JSON.parse(r.stdout);
}

function checkRunsOf(R, sha) {
  const runs = gh(`repos/${R}/commits/${sha}/check-runs?per_page=100`).check_runs ?? [];
  const failed = runs.find((x) => x.conclusion === 'failure');
  let locked = null;
  if (failed) {
    const ann = gh(`repos/${R}/check-runs/${failed.id}/annotations`);
    locked = ann.map((a) => a.message).find((m) => /billing issue|account is locked/i.test(m)) ?? null;
  }
  return { runs: runs.map((x) => ({ name: x.name, conclusion: x.conclusion })), locked };
}

function scorePr(R, n, { withSelfcheck }) {
  const pr = gh(`repos/${R}/pulls/${n}`);
  if (!pr.merged_at) throw new Error(`PR #${n} chưa merge`);
  const merge = pr.merge_commit_sha;
  const parents = git('rev-list', '--parents', '-n', '1', merge).trim().split(' ').slice(1);
  const base = parents[0];
  const files = git('diff', '--name-only', base, merge).trim().split('\n').filter(Boolean);

  const tcA = gitShow(base, TRU_COT);
  const tcB = gitShow(merge, TRU_COT);
  const fa = tcA ? pillarFacets(JSON.parse(tcA)) : null;
  const fb = tcB ? pillarFacets(JSON.parse(tcB)) : null;
  const dmA = docMatrix(gitShow(base, DOC_MATRIX));
  const dmB = docMatrix(gitShow(merge, DOC_MATRIX));

  const commits = gh(`repos/${R}/pulls/${n}/commits?per_page=100`);
  const authorCount = new Map();
  for (const c of commits) {
    const id = c.author?.login ?? c.commit?.author?.name ?? '?';
    authorCount.set(id, (authorCount.get(id) ?? 0) + 1);
  }
  const authors = [...authorCount].map(([id, k]) => ({ id, commits: k })).sort((a, b) => b.commits - a.commits || a.id.localeCompare(b.id));
  const authorIds = new Set([pr.user.login, ...authorCount.keys()].map((s) => s.toLowerCase()));
  const reviews = gh(`repos/${R}/pulls/${n}/reviews?per_page=100`);
  const approvers = new Set(reviews.filter((r) => r.state === 'APPROVED' && !authorIds.has(String(r.user?.login).toLowerCase())).map((r) => r.user.login));

  const scan = scanRange(base, merge);
  const owners = codeowners(base);
  const allOwners = [...authorIds].every((a) => owners.has(a));
  const findings = scan.findings.filter((f) => !(f.id === 'H-FRAMEWORK' && allOwners));

  const impact = impactOf(files);
  const { axes, basis } = suggestAxes(impact, findings);
  const score = prScore(axes);
  const verdict = verdictOf(axes, findings);
  const { runs, locked } = checkRunsOf(R, pr.head.sha);
  const ci = ciOf(runs, locked);
  const evidence = parseEvidence(pr.body);
  const release = releaseOf({ verdict, ci, evidence, reviewers: approvers.size });

  const progress = {
    foundation: { before: fa?.foundation ?? null, after: fb?.foundation ?? null },
    pillars: { before: fa?.pillars ?? null, after: fb?.pillars ?? null },
    overall: { before: fa?.overall ?? null, after: fb?.overall ?? null },
    docMatrix: { before: dmA?.pct ?? null, after: dmB?.pct ?? null },
    compliance: withSelfcheck ? { before: complianceAt(base), after: complianceAt(merge) } : { before: null, after: null, note: 'không chạy selfcheck (thêm --selfcheck)' },
    byPillar: fb?.byPillar ?? {},
    criteriaChanged: tcA || tcB ? criteriaDiff(tcA ? JSON.parse(tcA) : null, tcB ? JSON.parse(tcB) : null) : [],
  };
  const followUps = [
    ...findings.filter((f) => f.level === 'chặn').map((f) => `${f.id} ${f.file}${f.line ? `:${f.line}` : ''} — mở việc khắc phục`),
    ...regressions(progress.criteriaChanged).map((c) => `${c.id} hạ mức ${c.from} → ${c.to ?? 'bỏ'} — ghi lý do hoặc khôi phục`),
  ];
  return {
    contract: CONTRACT,
    pr: n,
    title: pr.title,
    mergedAt: pr.merged_at,
    base: base.slice(0, 8),
    merge: merge.slice(0, 8),
    authors,
    reviews: approvers.size,
    ci,
    evidenceBlock: evidence,
    files: files.length,
    impact,
    progress,
    kind: kindOf(progress),
    regressed: regressions(progress.criteriaChanged),
    axes,
    axesBy: 'máy',
    axesBasis: basis,
    score,
    grade: gradeOf(release, score),
    verdict,
    release,
    findings: findings.map(({ id, level, rule, file, line }) => ({ id, level, rule, file, line })),
    followUps,
  };
}

function listMerged(R, { last, since }) {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const batch = gh(`repos/${R}/pulls?state=closed&base=main&sort=updated&direction=desc&per_page=100&page=${page}`);
    if (!batch.length) break;
    for (const p of batch) if (p.merged_at && (!since || p.merged_at >= since)) out.push({ n: p.number, at: p.merged_at });
    if (last && out.length >= last * 2) break;
  }
  out.sort((a, b) => b.at.localeCompare(a.at));
  return (last ? out.slice(0, last) : out).map((x) => x.n);
}

const readRecords = () => (existsSync(OUT_DIR) ? readdirSync(OUT_DIR).filter((f) => /^PR-\d+\.json$/.test(f)).map((f) => JSON.parse(readFileSync(path.join(OUT_DIR, f), 'utf8'))) : []);

function writeRecord(rec) {
  mkdirSync(OUT_DIR, { recursive: true });
  const f = path.join(OUT_DIR, `PR-${rec.pr}.json`);
  if (existsSync(f)) {
    const old = JSON.parse(readFileSync(f, 'utf8'));
    // không chạy --selfcheck lần này: giữ số tuân thủ đã đo của cùng cặp commit
    if (rec.progress.compliance.before == null && rec.progress.compliance.after == null && old.base === rec.base && old.merge === rec.merge && old.progress?.compliance?.after != null) rec.progress.compliance = old.progress.compliance;
  }
  if (existsSync(f) && !flag('--no-keep-human')) {
    const old = JSON.parse(readFileSync(f, 'utf8'));
    if (old.axesBy === 'người') {
      Object.assign(rec, { axes: old.axes, axesBy: 'người', axesBasis: old.axesBasis, reviewNote: old.reviewNote });
      rec.score = prScore(rec.axes);
      rec.verdict = verdictOf(rec.axes, rec.findings);
      rec.release = releaseOf({ verdict: rec.verdict, ci: rec.ci, evidence: rec.evidenceBlock, reviewers: rec.reviews });
      rec.grade = gradeOf(rec.release, rec.score);
    }
  }
  writeFileSync(f, JSON.stringify(rec, null, 2) + '\n');
}

function main() {
  const write = flag('--write');
  if (flag('--board')) {
    writeFileSync(BOARD, renderBoard(readRecords()));
    console.log(`đã sinh ${path.relative(ROOT, BOARD)} từ ${readRecords().length} PR`);
    return;
  }
  const R = repo();
  const one = opt('--pr');
  const nums = one ? [Number(one)] : listMerged(R, { last: opt('--last') ? Number(opt('--last')) : undefined, since: opt('--since') });
  if (!nums.length) { console.error('không có PR nào: dùng --pr <số>, --last <n> hoặc --since <ngày>'); process.exit(2); }
  const results = [];
  for (const n of nums) {
    const rec = scorePr(R, n, { withSelfcheck: flag('--selfcheck') });
    results.push(rec);
    if (write) writeRecord(rec);
    console.error(`#${n} ${rec.kind} · ${rec.verdict} · ${rec.release} · nền móng ${rec.progress.foundation.after ?? '—'} % · trụ cột ${rec.progress.pillars.after ?? '—'} %`);
  }
  if (write) {
    writeFileSync(BOARD, renderBoard(readRecords()));
    console.error(`đã ghi ${results.length} tệp ở ${path.relative(ROOT, OUT_DIR)} và sinh lại ${path.relative(ROOT, BOARD)}`);
  } else console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
}

main();
