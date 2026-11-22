// [2026-11-22 08:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-040 — B2 (S040-6): phần thuần của bộ chấm tiến độ PR — ba mặt, bản đồ tác động, 12 trục gợi ý, trạng thái phát hành, bảng TIEN-DO-PR (PHASE-040 · 20)
/**
 * Hàm thuần, không gọi git / gh / mạng — để test được (scripts/cham-pr.test.mjs).
 * Đặc tả: docs/phases/PHASE-040-DOCUMENT-CONTINUITY-TIEN-DO-TRU-COT/20-CHAM-DIEM-TIEN-DO.md.
 */

export const CONTRACT = 'bizcity_pr_progress@1';

/** Trọng số mức đạt — giống scripts/tru-cot-md.mjs (đạt 1 · một phần ½ · tài liệu ¼ · chưa 0). */
export const WEIGHT = { dat: 1, 'mot-phan': 0.5, 'tai-lieu': 0.25, chua: 0 };

const pct = (num, den) => (den ? Math.round((100 * num) / den) : null);
const score = (criteria) => criteria.reduce((a, c) => a + (WEIGHT[c.status] ?? 0), 0);

/**
 * Ba mặt từ tru-cot.json (bizcity_pillars@1). `foundation` = trụ cột role "nền móng", `pillars` = role "trụ cột";
 * `byPillar` = % từng trụ cột. Không có tệp → null.
 */
export function pillarFacets(truCot) {
  if (!truCot?.pillars) return null;
  const byPillar = {};
  const groups = { 'nền móng': [], 'trụ cột': [] };
  for (const p of truCot.pillars) {
    const cs = p.criteria ?? [];
    byPillar[p.id] = pct(score(cs), cs.length);
    (groups[p.role] ??= []).push(...cs);
  }
  const all = truCot.pillars.flatMap((p) => p.criteria ?? []);
  return {
    foundation: pct(score(groups['nền móng']), groups['nền móng'].length),
    pillars: pct(score(groups['trụ cột']), groups['trụ cột'].length),
    overall: pct(score(all), all.length),
    byPillar,
  };
}

/** Tiêu chí đổi mức giữa hai bản tru-cot.json: thêm, bỏ, đổi mức. Khoá = `<trụ cột>/<mã>`. */
export function criteriaDiff(before, after) {
  const index = (doc) => {
    const m = new Map();
    for (const p of doc?.pillars ?? []) for (const c of p.criteria ?? []) m.set(`${p.id}/${c.id}`, c.status);
    return m;
  };
  const a = index(before);
  const b = index(after);
  const out = [];
  for (const [k, s] of b) if (!a.has(k)) out.push({ id: k, from: null, to: s });
  else if (a.get(k) !== s) out.push({ id: k, from: a.get(k), to: s });
  for (const [k, s] of a) if (!b.has(k)) out.push({ id: k, from: s, to: null });
  return out.sort((x, y) => x.id.localeCompare(y.id));
}

/**
 * Ma trận chứng từ (PHASE-040 · 10 §2) — đọc thẳng từ Markdown, không có bản thứ hai.
 * Dòng `| DOC-nnn | … | Hiện trạng | Ghi sổ | Ưu tiên | Bước |`. Tỉ lệ = (✅ + ♻) / dòng P0 không 📄.
 */
export function docMatrix(md) {
  if (!md) return null;
  const rows = [];
  for (const line of md.split('\n')) {
    const m = /^\|\s*(DOC-\d{3})\s*\|/.exec(line);
    if (!m) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 7) continue;
    const state = cells[3].startsWith('✅') ? 'ok' : cells[3].startsWith('♻') ? 'reuse' : cells[3].startsWith('📄') ? 'concept' : 'todo';
    rows.push({ id: m[1], state, priority: cells[5] });
  }
  const p0 = rows.filter((r) => r.priority === 'P0' && r.state !== 'concept');
  const done = p0.filter((r) => r.state === 'ok' || r.state === 'reuse');
  return { rows: rows.length, p0: p0.length, done: done.length, pct: pct(done.length, p0.length) };
}

/** Bản đồ tác động: biểu thức đường dẫn → trụ cột, luật, trục được chạm. Thứ tự không quan trọng; một tệp có thể khớp nhiều dòng. */
export const IMPACT_MAP = [
  { re: /^db\/migrations\//, pillars: ['I', 'VII'], rules: ['R-DB'], axes: ['T6', 'T1'] },
  { re: /^db\/migrations\/.*(doc|chung[_-]tu|business_documents)/i, pillars: ['X'], rules: ['R-DOC-CONT'], axes: ['T12'] },
  { re: /^docs\/nghiep-vu\/26-|^docs\/contracts\/BIZCITY-DOCUMENT-v1\.md$|^docs\/rules\/RULE-DOCUMENT-CONTINUITY\.md$/, pillars: ['X'], rules: ['R-DOC-CONT'], axes: ['T12', 'T3'] },
  { re: /^(packages\/kernel\/src\/modules\/(ledger|posting|posting-config|documents|vouchers|periods|closing)|apps\/api\/src\/kernel)\//, pillars: ['I'], rules: ['R-LEDGER', 'R-POST'], axes: ['T1', 'T2'] },
  { re: /^packages\/kernel\/src\/modules\/documents\/|^packages\/platform\/src\/core\/(documents|workflow)\.ts$/, pillars: ['X'], rules: ['R-DOC-CONT', 'R-WF'], axes: ['T12'] },
  { re: /^apps\/api\/src\/phan-he\/mua-hang\/|^modules\/mua-hang\//, pillars: ['X', '0'], rules: ['R-DOC-CONT'], axes: ['T12', 'T1', 'T5'] },
  { re: /^apps\/api\/src\/phan-he\/ban-hang\/|^modules\/(pos|phieu-ban|loyalty|voucher)\//, pillars: ['X'], rules: ['R-DOC-CONT'], axes: ['T12', 'T1', 'T5'] },
  { re: /^apps\/api\/src\/phan-he\/kho\/|^packages\/kernel\/src\/modules\/inventory\//, pillars: ['III', '0'], rules: ['R-CONT', 'R-INV'], axes: ['T1', 'T12'] },
  { re: /^apps\/api\/src\/phan-he\//, pillars: ['VIII'], rules: ['R-BOUND'], axes: ['T2', 'T5', 'T4'] },
  { re: /^apps\/api\/src\/modules\/(catalog|items|partners|branches|products)\//, pillars: ['0', 'II'], rules: ['R-MD', 'R-ITEM'], axes: ['T6'] },
  { re: /^apps\/api\/src\/modules\/(access|auth)\/|^packages\/platform\/src\/core\/(auth|authz|security)/, pillars: ['VII'], rules: ['R-SEC', 'R-TEN'], axes: ['T4'] },
  { re: /^apps\/api\/src\/modules\/sites\/|^packages\/platform\/src\/db\/site-/, pillars: ['VII', 'VIII'], rules: ['R-SITE'], axes: ['T4'] },
  { re: /^packages\/contracts\/src\/intake-findings\.ts$|^packages\/kernel\/src\/modules\/intake\//, pillars: ['IV'], rules: ['R-GATE'], axes: ['T5'] },
  { re: /^(apps\/api\/src|packages\/platform\/src)\/.*polic/, pillars: ['V'], rules: ['R-POL'], axes: ['T1'] },
  { re: /^libraries\/|^packages\/platform\/src\/core\/libraries\//, pillars: ['IX'], rules: ['R-LIB'], axes: ['T5'] },
  { re: /^packages\/(module-sdk|cli)\/|^templates\/|^docs\/contracts\/BIZCITY-(MODULE|EXTENSION|ACTION)/, pillars: ['VIII'], rules: ['R-MOD'], axes: ['T3', 'T11'] },
  { re: /^packages\/contracts\/src\/|^docs\/contracts\/|^docs\/api\//, pillars: [], rules: ['R-API'], axes: ['T3'] },
  { re: /^packages\/platform\/src\/core\/(nhat-ky|run-log|tracing)|^docs\/ops\//, pillars: ['VI'], rules: ['R-LOG', 'R-OBS'], axes: ['T10'] },
  { re: /^(apps\/api\/test|modules\/[^/]+\/test|tests\/)\/?|\.test\.(ts|mjs)$/, pillars: [], rules: ['R-QG'], axes: ['T10'] },
  { re: /^docs\/standard\/tru-cot\.json$/, pillars: [], rules: ['R-CONT-7'], axes: ['T10'] },
  { re: /^apps\/web\/src\/.*(report|bao-cao)/i, pillars: [], rules: ['R-REV-6'], axes: ['T9'] },
  { re: /cache|redis/i, pillars: [], rules: ['R-CACHE'], axes: ['T8'] },
  { re: /^package(-lock)?\.json$|\/package\.json$/, pillars: [], rules: [], axes: ['T11'] },
];

/** Tệp tài liệu thuần (không mã chạy) — PR chỉ có loại này là PR "giữ nhịp" nếu không đổi mức nào. */
export const isDocFile = (f) => /\.md$/.test(f) || /^docs\//.test(f) && !/\.(ts|mjs|js|sql)$/.test(f);

export function impactOf(files) {
  const pillars = new Set();
  const rules = new Set();
  const axes = new Set();
  for (const f of files) for (const m of IMPACT_MAP) if (m.re.test(f)) {
    m.pillars.forEach((x) => pillars.add(x));
    m.rules.forEach((x) => rules.add(x));
    m.axes.forEach((x) => axes.add(x));
  }
  const ord = (s, ref) => [...s].sort((a, b) => ref.indexOf(a) - ref.indexOf(b) || a.localeCompare(b));
  return {
    pillars: ord(pillars, ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']),
    rules: [...rules].sort(),
    axes: ord(axes, AXES),
    docsOnly: files.length > 0 && files.every(isDocFile),
  };
}

/** Mười hai trục: 11 trục R-REV §7 + T12 Liên tục chứng từ. Trục cổng theo R-REV §7.2; T12 là cổng khi PR chạm chứng từ. */
export const AXES = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'];
export const GATE_AXES = ['T1', 'T2', 'T4', 'T5'];
/** Trục máy gợi ý được từ luật dò H-*; còn lại cần người duyệt (PHASE-040 · 20 §5 bước 6). */
export const MACHINE_AXES = ['T1', 'T2', 'T4', 'T5', 'T6', 'T10', 'T12'];

/** Luật dò H-* (scripts/ra-soat-dong-gop.mjs) → trục. */
export const H_AXIS = {
  'H-LEDGER': 'T1', 'H-TRIGGER-OFF': 'T1', 'H-ACCOUNT-LITERAL': 'T1', 'H-MONEY': 'T1',
  'H-LEDGERSVC': 'T2', 'H-KERNEL-IMPORT': 'T2', 'H-CROSS-MODULE': 'T2', 'H-FRAMEWORK': 'T2',
  'H-SECRET': 'T4', 'H-ROUTE-PERM': 'T4', 'H-METRIC-LABEL': 'T4', 'H-FETCH': 'T4',
  'H-REPLY': 'T5',
  'H-MD-TABLE': 'T6', 'H-MIGRATION': 'T6', 'H-SKU': 'T6', 'H-UNIT': 'T6', 'H-SKU-DATA': 'T6', 'H-MASTERDATA': 'T6', 'H-SEQ': 'T6',
  'H-STATUS': 'T12',
  'H-SKIP': 'T10', 'H-NO-TEST': 'T10', 'H-DIRECT-MAIN': 'T10',
};

/**
 * Gợi ý điểm trục từ tác động + phát hiện H-*. Trục không bị chạm → '—'. Trục máy bị chạm: có phát hiện "chặn" → 0,
 * "cảnh báo" → 1, không có → 2. Trục cần người → 'cần người duyệt'. Mỗi điểm kèm căn cứ để người duyệt sửa.
 * "ghi chú" (vd H-MIGRATION) không trừ điểm.
 */
export function suggestAxes(impact, findings) {
  const axes = {};
  const basis = {};
  const touched = new Set(impact.axes);
  for (const f of findings) if (H_AXIS[f.id]) touched.add(H_AXIS[f.id]);
  for (const t of AXES) {
    if (!touched.has(t)) { axes[t] = '—'; continue; }
    if (!MACHINE_AXES.includes(t)) { axes[t] = 'cần người duyệt'; continue; }
    const hits = findings.filter((f) => H_AXIS[f.id] === t && f.level !== 'ghi chú');
    axes[t] = hits.some((f) => f.level === 'chặn') ? 0 : hits.length ? 1 : 2;
    basis[t] = hits.length ? [...new Set(hits.map((f) => f.id))] : ['không có phát hiện H-*'];
  }
  return { axes, basis };
}

/** Điểm PR = Σ điểm trục được chấm / (2 × số trục được chấm), %. Trục '—' và 'cần người duyệt' không tính. */
export function prScore(axes) {
  const vals = Object.values(axes).filter((v) => typeof v === 'number');
  return vals.length ? Math.round((100 * vals.reduce((a, b) => a + b, 0)) / (2 * vals.length)) : null;
}

/** Kết luận theo R-REV §7.2 trên các trục đã có số. */
export function verdictOf(axes, findings) {
  const blocking = findings.some((f) => f.level === 'chặn');
  const gate = GATE_AXES.map((t) => axes[t]).filter((v) => typeof v === 'number');
  const nums = Object.values(axes).filter((v) => typeof v === 'number');
  if (blocking || gate.includes(0)) return 'KHÔNG ĐẠT';
  if (gate.includes(1) || nums.includes(0) || nums.filter((v) => v === 1).length >= 3) return 'ĐẠT có điều kiện';
  return 'ĐẠT';
}

/**
 * Khối "### Bằng chứng chạy máy" trong mô tả PR (PHASE-040 · 20 §4). Có mặt khi có tiêu đề; đúng khuôn khi có ít nhất
 * dòng kiem-chuan và selfcheck với kết quả ĐẠT / KHÔNG ĐẠT. Trả các kết quả đọc được để so khi chạy lại.
 */
export function parseEvidence(body) {
  const text = String(body ?? '');
  const at = text.search(/^#{2,4}\s*Bằng chứng chạy máy\s*$/m);
  if (at < 0) return { present: false };
  const rest = text.slice(at).split('\n').slice(1);
  const end = rest.findIndex((l) => /^#{1,4}\s/.test(l));
  const block = (end < 0 ? rest : rest.slice(0, end)).join('\n');
  const res = (re) => { const m = re.exec(block); return m ? (/KHÔNG ĐẠT/.test(m[0]) ? 'KHÔNG ĐẠT' : 'ĐẠT') : null; };
  const kiemChuan = res(/kiem-chuan\.sh[^\n]*?(KHÔNG ĐẠT|ĐẠT)/);
  const selfcheck = res(/selfcheck[^\n]*?(KHÔNG ĐẠT|ĐẠT)/);
  const tests = /(\d+)\s*(?:test\s*)?qua\b/i.exec(block);
  return { present: true, wellFormed: Boolean(kiemChuan && selfcheck), kiemChuan, selfcheck, testsPassed: tests ? Number(tests[1]) : null };
}

/** CI từ check-run: chạy thật khi có ít nhất một job xong với kết luận khác skipped / cancelled mà không phải bị khoá. */
export function ciOf(checkRuns, lockedMessage) {
  const runs = checkRuns ?? [];
  if (!runs.length) return { ran: false, reason: 'không có check-run', jobs: 0 };
  if (lockedMessage) return { ran: false, reason: 'billing-lock', jobs: runs.length };
  const done = runs.filter((r) => r.conclusion && !['skipped', 'cancelled'].includes(r.conclusion));
  const green = done.length > 0 && done.every((r) => ['success', 'neutral'].includes(r.conclusion));
  return { ran: done.length > 0, green, reason: done.length ? null : 'mọi job bị huỷ hoặc bỏ qua', jobs: runs.length };
}

/**
 * Trạng thái phát hành (PHASE-040 · 20 §3): BLOCKED khi kết luận KHÔNG ĐẠT; VERIFIED khi có bằng chứng chạy
 * (CI xanh, hoặc khối bằng chứng đúng khuôn với kết quả ĐẠT) **và** một người duyệt khác tác giả; còn lại UNVERIFIED.
 */
export function releaseOf({ verdict, ci, evidence, reviewers }) {
  if (verdict === 'KHÔNG ĐẠT') return 'BLOCKED';
  const ran = ci?.ran && ci?.green || evidence?.wellFormed && evidence.kiemChuan === 'ĐẠT' && evidence.selfcheck === 'ĐẠT';
  return ran && reviewers > 0 ? 'VERIFIED' : 'UNVERIFIED';
}

export function gradeOf(release, score) {
  if (release !== 'VERIFIED' || score == null) return null;
  return score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : 'D';
}

/**
 * Loại PR: "đẩy tiến độ" khi một tiêu chí **đã có** đổi mức (lên hoặc xuống) hoặc ma trận chứng từ đã có đổi số;
 * "mở thước đo" khi chỉ thêm tiêu chí / trụ cột / ma trận mới (điểm có thể giảm vì đo được phần còn thiếu);
 * còn lại "giữ nhịp". `lui` = có tiêu chí đã có bị hạ mức.
 */
export function kindOf(progress) {
  const cc = progress.criteriaChanged ?? [];
  const existing = cc.filter((c) => c.from != null && c.to != null);
  const dm = progress.docMatrix;
  if (existing.length || dm && dm.before != null && dm.after != null && dm.before !== dm.after) return 'đẩy tiến độ';
  if (cc.some((c) => c.from == null) || dm && dm.before == null && dm.after != null) return 'mở thước đo';
  return 'giữ nhịp';
}

/** Tiêu chí đã có bị hạ mức giữa hai bản. */
export function regressions(criteriaChanged) {
  const rank = { chua: 0, 'tai-lieu': 1, 'mot-phan': 2, dat: 3 };
  return (criteriaChanged ?? []).filter((c) => c.from != null && (c.to == null || rank[c.to] < rank[c.from]));
}

/** Tuần ISO `YYYY-Www` của một thời điểm. */
export function isoWeek(iso) {
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00Z');
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const y = d.getUTCFullYear();
  const w = Math.ceil(((d - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}

const delta = (o) => {
  if (!o || o.before == null && o.after == null) return '—';
  if (o.before == null) return `mới ${o.after} %`;
  const d = o.after - o.before;
  return d ? `${o.before} → ${o.after} % (${d > 0 ? '+' : ''}${d})` : `${o.after} %`;
};
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** Sinh docs/reviews/TIEN-DO-PR.md từ các PR-<n>.json (mới → cũ, giữ `keep` PR, phần cũ gom theo tháng). Không ghi giờ sinh. */
export function renderBoard(records, { keep = 50 } = {}) {
  const sorted = [...records].sort((a, b) => String(b.mergedAt).localeCompare(String(a.mergedAt)) || b.pr - a.pr);
  const recent = sorted.slice(0, keep);
  const older = sorted.slice(keep);
  const md = [];
  md.push('# Tiến độ theo PR — nền móng · trụ cột · tuân thủ');
  md.push('<!-- [2026-11-22 08:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-040 — B2 (S040-7): bảng sinh bởi scripts/cham-pr.mjs, không sửa tay -->');
  md.push('');
  md.push('> **Sinh bởi** `node scripts/cham-pr.mjs --write` từ `docs/reviews/tien-do/PR-*.json` — **không sửa tay** (R-FLOW-8). Cách chấm: [PHASE-040 · 20](../phases/PHASE-040-DOCUMENT-CONTINUITY-TIEN-DO-TRU-COT/20-CHAM-DIEM-TIEN-DO.md). Trục máy chỉ là **gợi ý** từ luật dò H-*; người duyệt sửa trong `PR-<n>.json` (`axesBy: "người"`).');
  md.push('');
  const by = (k) => sorted.filter((r) => r.release === k).length;
  md.push(`**${sorted.length} PR** · \`VERIFIED\` ${by('VERIFIED')} · \`UNVERIFIED\` ${by('UNVERIFIED')} · \`BLOCKED\` ${by('BLOCKED')} · đẩy tiến độ ${sorted.filter((r) => r.kind === 'đẩy tiến độ').length}`);
  md.push('');
  md.push('| PR · ngày · người | Loại | Tác động | Δ Nền móng | Δ Trụ cột | Δ Ma trận chứng từ | Δ Tuân thủ C | Tiêu chí đổi mức | Điểm · hạng | Kết luận | Phát hành | CI · duyệt · bằng chứng |');
  md.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of recent) {
    const who = (r.authors ?? []).map((a) => a.id).join(', ');
    const imp = [r.impact?.pillars?.length ? `trụ cột ${r.impact.pillars.join(' ')}` : '', (r.impact?.rules ?? []).slice(0, 4).join(' ')].filter(Boolean).join(' · ') || '—';
    const cc = (r.progress?.criteriaChanged ?? []).map((c) => `${c.id} ${c.from ?? '∅'}→${c.to ?? '∅'}`);
    const changed = cc.length > 6 ? `${cc.slice(0, 6).join('; ')}; +${cc.length - 6}` : cc.join('; ') || '—';
    const sc = r.score == null ? '—' : `${r.score} %${r.axesBy === 'máy' ? ' (máy gợi ý)' : ''}${r.grade ? ` · ${r.grade}` : ''}`;
    const ci = r.ci?.ran ? (r.ci.green ? 'xanh' : 'đỏ') : `không chạy${r.ci?.reason ? ` (${r.ci.reason})` : ''}`;
    md.push(`| [#${r.pr}](https://github.com/hoanganh8389/open-ketoan/pull/${r.pr}) · ${String(r.mergedAt).slice(0, 10)} · ${esc(who)} | ${r.kind}${r.regressed?.length ? ` · **lùi ${r.regressed.length}**` : ''} | ${esc(imp)} | ${delta(r.progress?.foundation)} | ${delta(r.progress?.pillars)} | ${delta(r.progress?.docMatrix)} | ${delta(r.progress?.compliance)} | ${esc(changed)} | ${sc} | ${r.verdict} | \`${r.release}\` | ${ci} · ${r.reviews} · ${r.evidenceBlock?.present ? (r.evidenceBlock.wellFormed ? 'đủ' : 'thiếu dòng') : 'không'} |`);
  }
  if (older.length) {
    md.push('', '## PR cũ hơn (gom theo tháng)', '', '| Tháng | Số PR | Đẩy tiến độ | `BLOCKED` |', '|---|---|---|---|');
    const months = new Map();
    for (const r of older) {
      const k = String(r.mergedAt).slice(0, 7);
      const m = months.get(k) ?? { n: 0, up: 0, blocked: 0 };
      m.n++; if (r.kind === 'đẩy tiến độ') m.up++; if (r.release === 'BLOCKED') m.blocked++;
      months.set(k, m);
    }
    for (const [k, m] of [...months].sort().reverse()) md.push(`| ${k} | ${m.n} | ${m.up} | ${m.blocked} |`);
  }
  // đường theo tuần: giá trị "sau" của PR merge cuối cùng trong tuần
  const weeks = new Map();
  for (const r of [...sorted].reverse()) weeks.set(isoWeek(r.mergedAt), r);
  const pillarIds = [...new Set(sorted.flatMap((r) => Object.keys(r.progress?.byPillar ?? {})))]
    .sort((a, b) => ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'].indexOf(a) - ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'].indexOf(b));
  md.push('', '## Đường tiến độ theo tuần', '', 'Giá trị sau PR merge cuối cùng của tuần. Trụ cột đứng yên nhiều tuần là chỗ cần nhìn.', '');
  md.push(`| Tuần | Nền móng | Trụ cột | Ma trận chứng từ | ${pillarIds.join(' | ')} |`);
  md.push(`|---|---|---|---|${pillarIds.map(() => '---').join('|')}|`);
  for (const [w, r] of [...weeks].sort().reverse()) {
    const v = (o) => (o?.after == null ? '—' : `${o.after} %`);
    md.push(`| ${w} | ${v(r.progress?.foundation)} | ${v(r.progress?.pillars)} | ${v(r.progress?.docMatrix)} | ${pillarIds.map((p) => (r.progress?.byPillar?.[p] == null ? '—' : r.progress.byPillar[p])).join(' | ')} |`);
  }
  md.push('');
  return md.join('\n');
}
