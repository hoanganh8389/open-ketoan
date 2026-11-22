// [2026-11-22 08:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-040 — B2 (S040-6): thử phần thuần của bộ chấm PR — ba mặt, tác động, trục, kết luận, phát hành, khối bằng chứng, bảng (T040-35)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ciOf, criteriaDiff, docMatrix, evidenceTemplate, gradeOf, identityOf, impactOf, isoWeek, kindOf, parseEvidence, personScores,
  pillarFacets, prScore, regressions, releaseOf, renderBoard, renderPeople, suggestAxes, verdictOf,
} from './cham-pr.lib.mjs';

const doc = (pillars) => ({ contract: 'bizcity_pillars@1', pillars });
const P = (id, role, ...statuses) => ({ id, key: id, role, criteria: statuses.map((s, i) => ({ id: `${id}-${i + 1}`, status: s })) });

test('ba mặt: trọng số đạt 1 · một phần ½ · tài liệu ¼ · chưa 0, tách nền móng / trụ cột', () => {
  const f = pillarFacets(doc([P('0', 'nền móng', 'dat', 'chua'), P('I', 'trụ cột', 'mot-phan', 'tai-lieu'), P('X', 'nền móng', 'dat', 'dat')]));
  assert.equal(f.foundation, 75); // (1 + 0 + 1 + 1) / 4
  assert.equal(f.pillars, 38); // (0.5 + 0.25) / 2 = 37.5 → 38
  assert.deepEqual(f.byPillar, { 0: 50, I: 38, X: 100 });
  assert.equal(pillarFacets(null), null);
});

test('ba mặt khớp số đo trên tru-cot.json thật (cùng công thức scripts/tru-cot-md.mjs)', () => {
  const real = JSON.parse(readFileSync(fileURLToPath(new URL('../docs/standard/tru-cot.json', import.meta.url)), 'utf8'));
  const f = pillarFacets(real);
  for (const v of [f.foundation, f.pillars, f.overall]) assert.ok(v >= 0 && v <= 100);
  assert.equal(Object.keys(f.byPillar).length, real.pillars.length);
});

test('tiêu chí đổi mức: thêm, bỏ, đổi; hạ mức là lùi', () => {
  const a = doc([P('I', 'trụ cột', 'dat', 'mot-phan', 'chua')]);
  const b = doc([P('I', 'trụ cột', 'mot-phan', 'dat'), P('X', 'nền móng', 'chua')]);
  const d = criteriaDiff(a, b);
  assert.deepEqual(d, [
    { id: 'I/I-1', from: 'dat', to: 'mot-phan' },
    { id: 'I/I-2', from: 'mot-phan', to: 'dat' },
    { id: 'I/I-3', from: 'chua', to: null },
    { id: 'X/X-1', from: null, to: 'chua' },
  ]);
  assert.deepEqual(regressions(d).map((c) => c.id), ['I/I-1', 'I/I-3']);
});

test('loại PR: đẩy tiến độ · mở thước đo · giữ nhịp', () => {
  const base = { foundation: { before: 68, after: 68 }, docMatrix: { before: null, after: null } };
  assert.equal(kindOf({ ...base, criteriaChanged: [{ id: 'I/L-1', from: 'mot-phan', to: 'dat' }] }), 'đẩy tiến độ');
  assert.equal(kindOf({ ...base, criteriaChanged: [{ id: 'X/DC-1', from: null, to: 'chua' }] }), 'mở thước đo');
  assert.equal(kindOf({ ...base, docMatrix: { before: null, after: 69 }, criteriaChanged: [] }), 'mở thước đo');
  assert.equal(kindOf({ ...base, docMatrix: { before: 69, after: 72 }, criteriaChanged: [] }), 'đẩy tiến độ');
  assert.equal(kindOf({ ...base, criteriaChanged: [] }), 'giữ nhịp');
});

test('ma trận chứng từ: (✅ + ♻) / dòng P0 không 📄', () => {
  const md = [
    '| ID | Chứng từ | chỗ | Hiện trạng | Ghi sổ | Ưu tiên | Bước |', '|---|---|---|---|---|---|---|',
    '| DOC-001 | a | x | 📄 | không | P0 | — |',
    '| DOC-002 | b | x | ✅ trong sổ | có | P0 | — |',
    '| DOC-003 | c | x | ♻ | không | P0 | B6 |',
    '| DOC-004 | d | x | ☐ | không | P0 | B5 |',
    '| DOC-005 | e | x | ☐ | không | P1 | — |',
  ].join('\n');
  assert.deepEqual(docMatrix(md), { rows: 5, p0: 3, done: 2, pct: 67 });
  assert.equal(docMatrix(null), null);
});

test('tác động: đường dẫn → trụ cột / luật / trục; PR chỉ tài liệu', () => {
  const i = impactOf(['apps/api/src/phan-he/mua-hang/hoa-don.ts', 'db/migrations/0181_x.sql', 'apps/api/test/x.test.ts']);
  assert.ok(i.pillars.includes('X') && i.pillars.includes('I'));
  assert.ok(i.axes.includes('T12') && i.axes.includes('T6') && i.axes.includes('T10'));
  assert.equal(i.docsOnly, false);
  assert.equal(impactOf(['docs/phases/README.md', 'CHANGELOG.md']).docsOnly, true);
  assert.deepEqual(impactOf(['docs/phases/README.md']).axes, []);
});

test('trục gợi ý: chặn → 0, cảnh báo → 1, không phát hiện → 2; ghi chú không trừ; trục cần người không có số', () => {
  const impact = { axes: ['T1', 'T6', 'T7', 'T10'] };
  const { axes, basis } = suggestAxes(impact, [
    { id: 'H-LEDGER', level: 'chặn' }, { id: 'H-MIGRATION', level: 'ghi chú' }, { id: 'H-NO-TEST', level: 'cảnh báo' },
  ]);
  assert.equal(axes.T1, 0);
  assert.equal(axes.T6, 2);
  assert.equal(axes.T10, 1);
  assert.equal(axes.T7, 'cần người duyệt');
  assert.equal(axes.T2, '—');
  assert.deepEqual(basis.T1, ['H-LEDGER']);
  // phát hiện ở trục chưa chạm vẫn kéo trục đó vào chấm
  assert.equal(suggestAxes({ axes: [] }, [{ id: 'H-SECRET', level: 'chặn' }]).axes.T4, 0);
});

test('điểm và kết luận theo R-REV §7.2', () => {
  assert.equal(prScore({ T1: 2, T2: 1, T3: '—', T7: 'cần người duyệt' }), 75);
  assert.equal(prScore({ T1: '—' }), null);
  assert.equal(verdictOf({ T1: 2, T2: 2 }, []), 'ĐẠT');
  assert.equal(verdictOf({ T1: 1, T6: 2 }, []), 'ĐẠT có điều kiện');
  assert.equal(verdictOf({ T6: 1, T10: 1, T12: 1 }, []), 'ĐẠT có điều kiện');
  assert.equal(verdictOf({ T1: 0 }, []), 'KHÔNG ĐẠT');
  assert.equal(verdictOf({ T6: 2 }, [{ level: 'chặn' }]), 'KHÔNG ĐẠT');
});

test('khối bằng chứng chạy máy: có mặt, đúng khuôn, đọc kết quả', () => {
  assert.deepEqual(parseEvidence('không có gì'), { present: false });
  const ok = parseEvidence('## Tóm tắt\nx\n\n### Bằng chứng chạy máy\nhead: abc\nbash scripts/kiem-chuan.sh → ĐẠT\nnode tests/conformance/selfcheck.mjs --strict → KHÔNG ĐẠT; C 73%\nvitest → 41 qua\n\n## Khác\nselfcheck → ĐẠT');
  assert.equal(ok.present, true);
  assert.equal(ok.wellFormed, true);
  assert.equal(ok.kiemChuan, 'ĐẠT');
  assert.equal(ok.selfcheck, 'KHÔNG ĐẠT'); // không đọc lan sang mục sau
  assert.equal(ok.testsPassed, 41);
  assert.equal(parseEvidence('## Bằng chứng chạy máy\nkiem-chuan.sh: ĐẠT').wellFormed, false);
});

test('CI: khoá thanh toán, mọi job bỏ qua, xanh, đỏ', () => {
  const runs = [{ conclusion: 'failure' }, { conclusion: 'skipped' }];
  assert.deepEqual(ciOf(runs, 'The job was not started because your account is locked due to a billing issue.'), { ran: false, reason: 'billing-lock', jobs: 2 });
  assert.equal(ciOf([{ conclusion: 'skipped' }], null).ran, false);
  assert.equal(ciOf([{ conclusion: 'cancelled' }, { conclusion: 'skipped' }], null).ran, false);
  assert.equal(ciOf([{ conclusion: 'success' }, { conclusion: 'skipped' }], null).green, true);
  assert.equal(ciOf([{ conclusion: 'success' }, { conclusion: 'failure' }], null).green, false);
  assert.equal(ciOf([], null).ran, false);
});

test('phát hành: BLOCKED · VERIFIED cần bằng chứng chạy và người duyệt khác tác giả · còn lại UNVERIFIED; hạng chỉ khi VERIFIED', () => {
  const green = { ran: true, green: true };
  const ev = { present: true, wellFormed: true, kiemChuan: 'ĐẠT', selfcheck: 'ĐẠT' };
  assert.equal(releaseOf({ verdict: 'KHÔNG ĐẠT', ci: green, evidence: ev, reviewers: 1 }), 'BLOCKED');
  assert.equal(releaseOf({ verdict: 'ĐẠT', ci: green, evidence: null, reviewers: 1 }), 'VERIFIED');
  assert.equal(releaseOf({ verdict: 'ĐẠT', ci: { ran: false }, evidence: ev, reviewers: 1 }), 'VERIFIED');
  assert.equal(releaseOf({ verdict: 'ĐẠT', ci: green, evidence: ev, reviewers: 0 }), 'UNVERIFIED');
  assert.equal(releaseOf({ verdict: 'ĐẠT', ci: { ran: false }, evidence: { ...ev, selfcheck: 'KHÔNG ĐẠT' }, reviewers: 1 }), 'UNVERIFIED');
  assert.equal(gradeOf('VERIFIED', 91), 'A');
  assert.equal(gradeOf('VERIFIED', 69), 'D');
  assert.equal(gradeOf('UNVERIFIED', 95), null);
});

test('tuần ISO', () => {
  assert.equal(isoWeek('2026-11-22T12:00:00Z'), '2026-W47');
  assert.equal(isoWeek('2026-01-01'), '2026-W01');
  assert.equal(isoWeek('2027-01-01'), '2026-W53');
});

test('bảng TIEN-DO-PR: không giờ sinh, mới → cũ, gom tháng khi vượt keep, đường theo tuần', () => {
  const rec = (pr, at, extra = {}) => ({
    pr, mergedAt: at, authors: [{ id: 'a', commits: 1 }], kind: 'giữ nhịp', impact: { pillars: [], rules: [] },
    progress: { foundation: { before: 60, after: 61 }, pillars: { before: 62, after: 62 }, docMatrix: { before: null, after: null }, byPillar: { X: 41 }, criteriaChanged: [] },
    score: null, grade: null, verdict: 'ĐẠT', release: 'UNVERIFIED', reviews: 0, ci: { ran: false, reason: 'billing-lock' }, evidenceBlock: { present: false }, ...extra,
  });
  const md = renderBoard([rec(1, '2026-10-01T00:00:00Z'), rec(3, '2026-11-22T00:00:00Z', { release: 'BLOCKED' }), rec(2, '2026-11-21T00:00:00Z')], { keep: 2 });
  assert.equal(md, renderBoard([rec(2, '2026-11-21T00:00:00Z'), rec(1, '2026-10-01T00:00:00Z'), rec(3, '2026-11-22T00:00:00Z', { release: 'BLOCKED' })], { keep: 2 }));
  assert.ok(md.indexOf('pull/3)') < md.indexOf('pull/2)'));
  assert.ok(!md.includes('pull/1)'));
  assert.match(md, /\| 2026-10 \| 1 \| 0 \| 0 \|/);
  assert.match(md, /`BLOCKED` 1/);
  assert.match(md, /60 → 61 % \(\+1\)/);
  assert.match(md, /\| 2026-W47 \| 61 % \| 62 % \| — \| 41 \|/);
  assert.doesNotMatch(md, /\d{2}:\d{2} UTC/);
});

// [2026-11-22 09:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-040 — B3 (S040-8, 9): khuôn cũ / mẫu chưa điền, danh tính, điểm theo người
test('khối bằng chứng: khuôn cũ "== BẰNG CHỨNG ==" đọc được; mẫu chưa điền không đúng khuôn', () => {
  const old = parseEvidence('## Bằng chứng (bắt buộc với T0)\n```text\n== BẰNG CHỨNG ==\nselfcheck:   ĐẠT\nkiem-chuan:  ĐẠT\n```');
  assert.equal(old.present, true);
  assert.equal(old.wellFormed, true);
  const blank = parseEvidence('## Bằng chứng chạy máy\n```text\n== BẰNG CHỨNG ==\nhead: <sha>   gộp main: <sha origin/main lúc chạy>\nbash scripts/kiem-chuan.sh → ĐẠT | KHÔNG ĐẠT\nnode tests/conformance/selfcheck.mjs --strict → ĐẠT | KHÔNG ĐẠT\n```');
  assert.equal(blank.present, true);
  assert.equal(blank.wellFormed, false);
  assert.equal(blank.kiemChuan, null);
  assert.equal(parseEvidence('## Bằng chứng chạy máy\nhead: ab12   gộp main: cd34\nkiem-chuan.sh → ĐẠT\nselfcheck → ĐẠT\nvitest → 41/52 qua').testsPassed, 41);
});

test('mẫu khối bằng chứng điền SHA và bộ đọc nhận ra chưa điền kết quả', () => {
  const t = evidenceTemplate({ head: 'aaaa1111', main: 'bbbb2222' });
  assert.match(t, /head: aaaa1111 {3}gộp main: bbbb2222/);
  const ev = parseEvidence(t);
  assert.equal(ev.present, true);
  assert.equal(ev.wellFormed, false);
});

test('danh tính: tài khoản GitHub trước, rồi bí danh; trình tự động bị bỏ', () => {
  const aliases = { 'Võ Hoàng': 'H-Joyy', kiennt: 'TrongKien125' };
  assert.equal(identityOf({ login: 'Thuy2k', name: 'Nguyễn Văn Thủy' }, aliases), 'Thuy2k');
  assert.equal(identityOf({ login: null, name: 'kiennt' }, aliases), 'TrongKien125');
  assert.equal(identityOf({ login: null, name: 'Võ Hoàng' }, aliases), 'H-Joyy');
  assert.equal(identityOf({ login: null, name: 'người lạ' }, aliases), 'người lạ');
  assert.equal(identityOf({ login: 'dependabot[bot]', name: 'x' }, aliases), null);
  assert.equal(identityOf({ login: null, name: 'Claude' }, aliases), null);
});

test('điểm theo người: chỉ PR VERIFIED; chưa đủ 3 PR / 4 tuần thì chưa đủ mẫu; review cho người khác được tính', () => {
  const r = (pr, people, release, score, at = '2026-11-22', reviewers = []) => ({ pr, people, release, score, mergedAt: at, reviewers });
  const rows = personScores([
    r(1, ['a'], 'VERIFIED', 80, '2026-11-02', ['b']), r(2, ['a'], 'VERIFIED', 90, '2026-11-09'), r(3, ['a'], 'VERIFIED', 100, '2026-11-16'),
    r(4, ['b'], 'UNVERIFIED', 100), r(5, ['b'], 'BLOCKED', 20),
  ]);
  const a = rows.find((x) => x.id === 'a');
  const b = rows.find((x) => x.id === 'b');
  assert.equal(a.state, 'đủ mẫu');
  assert.equal(a.avgScore, 90);
  assert.equal(a.total, 84); // (0.7·90 + 0.05·0) / 0.75
  assert.equal(b.state, 'chưa đủ mẫu');
  assert.equal(b.total, null);
  assert.equal(b.reviewsGiven, 1);
  assert.equal(b.blocked, 1);
  assert.match(renderPeople(rows), /KHÔNG COMMIT/);
});
