// [2026-11-03 02:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — ADR-0020: SC-FIND-1 thêm căn cứ (R-GATE-11); SC-FIND-2 mọi thông báo của Core dựng từ thư viện mã (R-GATE-10)
// [2026-11-07 10:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-45 (ADR-0032 D-LIB-5): SC-FIND-1 đọc thêm cổng L — mã LIB-* (library-findings.ts) và mã luật riêng của thư viện (libraries/*/library.json rules[]); không trùng mã giữa mọi nguồn
// [2026-11-02 11:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — S024-27 (ADR-0019, R-GATE-2 / R-GATE-5): SC-FIND-1 — một thư viện phát hiện cho hai cổng: mã không trùng, đủ vì sao / cách sửa, trang tra mã đủ mã
/**
 * bizcity_findings@1: hai danh mục nguồn (Gate A `catalog-hint.ts`, Gate B `intake-findings.ts`) gom về một thư viện. Kiểm:
 *   - mã không trùng giữa hai danh mục (và trong từng danh mục);
 *   - mỗi mã có tiêu đề và "vì sao"; mức block / warn có "cách sửa" (không chặn im lặng, R-GATE-2);
 *   - trang người đọc docs/huong-dan/ma-loi/README.md có đúng các mã (sinh bằng `node scripts/sinh-ma-loi.mjs --write`);
 *   - mỗi mã có căn cứ ở legal-basis.ts (FINDING_BASIS), khoá có trong LEGAL_BASES, tên văn bản (trừ NOI-BO) có trong
 *     docs/can-cu/01-danh-muc-van-ban.md (R-GATE-11).
 * Đọc nguồn bằng regex (không cần build), như SC-INTAKE-1.
 */
const HINTS = 'packages/contracts/src/catalog-hint.ts';
const INTAKE = 'packages/contracts/src/intake-findings.ts';
const PAGE = 'docs/huong-dan/ma-loi/README.md';
const BASIS = 'packages/contracts/src/legal-basis.ts';
const LAW_PAGE = 'docs/can-cu/01-danh-muc-van-ban.md';
const LIBRARY = 'packages/contracts/src/library-findings.ts';
const LIB_ROW = /^ {2}'(LIB-[A-Z]+-\d{3})': \{ level: '(block|warn|info)', step: '[a-z]+', title: '([^']*)', why: '([^']*)', fix: '([^']*)' \},/;
const INTAKE_ROW = /^ {2}'(IN-[A-Z]+-\d{3})': \{[^\n]*severity: '(block|warn|hint)'[^\n]*title: '([^']*)', why: '([^']*)', fix: '([^']*)'/;

// [2026-11-22 11:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-040 — B10a (S040-22): CATALOG_HINTS nay là phép gộp `{ ...BASE_HINTS, ...QT_* }` (b290a47b) — đọc cả BASE_HINTS và từng tệp quy-tac/*.ts được gộp (trước đây 93 mã có thật bị báo "thư viện không có")
/** Các mục `  'MÃ': {` … `  },` của một khai báo `const <tên> … = {` … `};` (chỉ trong thân khai báo đó). */
function entriesOf(src, decl) {
  const out = [];
  const start = src.search(new RegExp(`^(?:export )?const ${decl}\\b`, 'm'));
  if (start < 0) return out;
  const rest = src.slice(start);
  const close = rest.search(/^\};?\s*$/m);
  const body = close < 0 ? rest : rest.slice(0, close + 2);
  for (const m of body.matchAll(/^ {2}'([A-Z]+-[A-Z]+-\d{3})': \{([\s\S]*?)^ {2}\},/gm)) {
    const b = m[2];
    const field = (k) => new RegExp(`\\b${k}: '((?:[^'\\\\]|\\\\.)*)'`).exec(b)?.[1];
    out.push({ code: m[1], level: field('level'), title: field('title'), why: field('why'), fix: field('fix') });
  }
  return out;
}

/**
 * Các mục của CATALOG_HINTS. Hai khuôn: (cũ) các mục viết thẳng trong `export const CATALOG_HINTS = {`;
 * (mới) `CATALOG_HINTS = { ...BASE_HINTS, ...QT_X }` — đọc BASE_HINTS trong tệp và mỗi QT_X ở tệp nó được import.
 * `read(rel)` đọc tệp khác trong repo. Trả [[tệp, mục[]], …].
 */
function hintSources(src, read) {
  const decl = /export const CATALOG_HINTS[^=]*=\s*\{([^}]*)\}/.exec(src);
  const spreads = decl ? [...decl[1].matchAll(/\.\.\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]) : [];
  if (!spreads.length) return [[HINTS, entriesOf(src, 'CATALOG_HINTS')]];
  const out = [];
  for (const name of spreads) {
    const imp = new RegExp(`import \\{[^}]*\\b${name}\\b[^}]*\\} from '\\./([^']+)\\.js'`).exec(src);
    if (!imp) { out.push([HINTS, entriesOf(src, name)]); continue; }
    const file = `packages/contracts/src/${imp[1]}.ts`;
    out.push([file, entriesOf(read(file) ?? '', name)]);
  }
  return out;
}

export default {
  id: 'SC-FIND-1',
  title: 'Thư viện phát hiện hai cổng: mã không trùng, đủ vì sao / cách sửa, trang tra mã đủ mã',
  gate: 'DOCS', contract: 'contracts', rules: ['R-GATE-2', 'R-GATE-5', 'R-GATE-11'], tier: 1, enforce: 'block', weight: 2, targets: ['repo'],
  run(ctx) {
    const findings = [];
    const add = (file, msg, key) => findings.push(ctx.finding(file, null, msg, key));
    const hintSrc = hintSources(ctx.repo.read(HINTS) ?? '', (rel) => ctx.repo.read(rel));
    const hints = hintSrc.flatMap(([, l]) => l);
    const intake = (ctx.repo.read(INTAKE) ?? '').split(/\r?\n/).map((l) => INTAKE_ROW.exec(l)).filter(Boolean)
      .map((m) => ({ code: m[1], level: m[2] === 'hint' ? 'info' : m[2], title: m[3], why: m[4], fix: m[5] }));
    const lib = (ctx.repo.read(LIBRARY) ?? '').split(/\r?\n/).map((l) => LIB_ROW.exec(l)).filter(Boolean)
      .map((m) => ({ code: m[1], level: m[2], title: m[3], why: m[4], fix: m[5] }));
    // Mã luật riêng của từng thư viện: căn cứ khai ngay trong luật (basis[]), không ở FINDING_BASIS — kiểm trùng + chữ ở đây, khuôn ở SC-LIB-1.
    const ruleSources = [];
    for (const d of ctx.repo.list('libraries')) {
      const file = `libraries/${d}/library.json`;
      if (!ctx.repo.exists(file)) continue;
      try { ruleSources.push([file, (ctx.repo.json(file).rules ?? []).map((r) => ({ code: r.code, level: r.level, title: r.title, why: r.why, fix: r.fix, rule: true }))]); } catch { /* JSON hỏng: SC-LIB-1 báo */ }
    }
    const ruleCodes = new Set(ruleSources.flatMap(([, l]) => l.map((x) => x.code)));
    const seen = new Map();
    for (const [file, list] of [...hintSrc, [INTAKE, intake], [LIBRARY, lib], ...ruleSources]) {
      for (const e of list) {
        if (seen.has(e.code)) add(file, `mã ${e.code} trùng với ${seen.get(e.code)}`, `dup:${e.code}`);
        else seen.set(e.code, file);
        if (!e.title || !e.why) add(file, `${e.code}: thiếu tiêu đề hoặc "vì sao"`, `text:${e.code}`);
        if ((e.level === 'block' || e.level === 'warn') && !e.fix) add(file, `${e.code}: mức ${e.level} phải có "cách sửa" (fix) — không chặn / cảnh báo im lặng (R-GATE-2)`, `fix:${e.code}`);
      }
    }
    const page = ctx.repo.read(PAGE);
    if (page == null) add(PAGE, 'chưa có trang tra mã — chạy node scripts/sinh-ma-loi.mjs --write', 'page:missing');
    else {
      const listed = new Set([...page.matchAll(/^\| `([A-Z]+-[A-Z]+-\d{3})` \|/gm)].map((m) => m[1]));
      for (const code of seen.keys()) if (!listed.has(code)) add(PAGE, `trang tra mã thiếu ${code} — chạy node scripts/sinh-ma-loi.mjs --write`, `page-missing:${code}`);
      for (const code of listed) if (!seen.has(code)) add(PAGE, `trang tra mã có ${code} nhưng thư viện không có`, `page-extra:${code}`);
    }
    // ── căn cứ (R-GATE-11) ──
    const basisSrc = ctx.repo.read(BASIS);
    if (basisSrc == null) add(BASIS, 'chưa có sổ căn cứ legal-basis.ts — mỗi mã phải có căn cứ (R-GATE-11)', 'basis:file-missing');
    else {
      const laws = new Map([...basisSrc.matchAll(/^ {2}'([A-Z0-9-]+)': \{ title: '([^']+)'/gm)].map((m) => [m[1], m[2]]));
      // B10a: nhiều mục trên một dòng (`'A': ['X'], 'B': ['Y'],`) — đọc mọi mục trong thân FINDING_BASIS, không chỉ mục đầu dòng
      const basisBody = basisSrc.slice(Math.max(0, basisSrc.indexOf('export const FINDING_BASIS')));
      const rows = new Map([...basisBody.matchAll(/'([A-Z]+-[A-Z]+-\d{3})': \[([^\]]*)\]/g)].map((m) => [m[1], [...m[2].matchAll(/'([A-Z0-9-]+)'/g)].map((x) => x[1])]));
      const lawPage = ctx.repo.read(LAW_PAGE) ?? '';
      for (const [key, title] of laws) if (key !== 'NOI-BO' && !lawPage.includes(`**${title}**`)) add(BASIS, `căn cứ ${key} "${title}" không có trong ${LAW_PAGE} — thêm văn bản vào danh mục (có ngày rà soát) hoặc sửa tên`, `basis-law:${key}`);
      for (const code of seen.keys()) {
        if (ruleCodes.has(code)) continue; // mã luật của thư viện: căn cứ ở basis[] của luật
        const keys = rows.get(code);
        if (!keys?.length) { add(BASIS, `${code}: chưa có căn cứ — khai ở FINDING_BASIS (văn bản trong docs/can-cu, hoặc NOI-BO = quy ước phần mềm)`, `basis-missing:${code}`); continue; }
        for (const k of keys) if (!laws.has(k)) add(BASIS, `${code}: căn cứ ${k} không có trong LEGAL_BASES`, `basis-unknown:${code}:${k}`);
      }
      for (const code of rows.keys()) if (!seen.has(code)) add(BASIS, `FINDING_BASIS có ${code} nhưng thư viện không có mã này`, `basis-extra:${code}`);
    }
    return { examined: seen.size, unitBy: 'key', findings, metrics: { gateA: hints.length, gateB: intake.length, gateL: lib.length + ruleSources.reduce((n, [, l]) => n + l.length, 0) } };
  },
};
