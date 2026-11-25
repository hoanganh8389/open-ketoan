// [2026-11-25 06:22 PM Johnny Chu - Chu Hoàng Anh] FLOW — STD-11 (chữ chốt ở dòng giữ chỗ STD-11, CLAIMS #656): SC-UI-2 / SC-UI-3 — buộc contributor theo bản đồ lỗi
//   theo màn (bizcity-platform bizcity_failure_map@1) và vòng phản hồi lỗi (bizcity_feedback_loop@1). Chủ chỉ đạo 2026-11-25: "đảm bảo các contributor tuân thủ".
/**
 * SC-UI-2 (ratchet): form có ghi dữ liệu — tệp `*Form.tsx` / `*Modal.tsx` dưới `apps/web/src` hoặc `modules/<key>/web` — phải có
 *   `<Tên>.failure-map.json` đặt cạnh nó (R-STD-FAIL-6). Form cũ ở baseline; form MỚI thiếu bản đồ là đỏ.
 *   Dựng khung: node ../bizcity-platform/tools/failure-check.mjs --repo . --scaffold <form> --code <MÃ> --flow <luồng> --write
 * SC-UI-3 (block): bản đồ đã có thì đúng khuôn tối thiểu — phần kiểm sâu (đích có thật, bắt sớm, lỗi gặp thật) do
 *   bizcity-platform tools/failure-check.mjs làm; ở đây chỉ chặn những thứ làm bản đồ vô nghĩa:
 *   - JSON đọc được, `schema` = bizcity_failure_map@1, `screen.file` trỏ đúng form;
 *   - dòng `block` có `code` (không null) và mã có trong `packages/contracts/src` (danh mục mã của repo — R-ERR-1, R-INTAKE-11);
 *   - dòng `block` có `test`, tệp test có thật và nhắc đúng mã (hoặc chuỗi sau `#`) — R-STD-FAIL-3;
 *   - câu hỏi ngược không còn `answer: null` — hỏi người yêu cầu / kế toán trưởng, không đoán (R-STD-LOOP-2).
 */
const UNDER = ['apps/web/src', 'modules'];
const FORM = /(Form|Modal)\.tsx$/;
const NOT = /(^|\/)(test|tests|dist|node_modules|fixtures)\/|\.test\.tsx$/;
const tokenIn = (text, tok) => new RegExp(`(?<![A-Za-z0-9_-])${tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_])`, 'u').test(text);

function forms(ctx) {
  return ctx.repo.files({ under: UNDER, ext: ['.tsx'], not: NOT })
    .filter((f) => FORM.test(f) && (f.startsWith('apps/web/src/') || /^modules\/[^/]+\/web\//.test(f)));
}
const mapOf = (form) => form.replace(/\.tsx$/, '.failure-map.json');

export const checks = [
  {
    id: 'SC-UI-2',
    title: 'Form có ghi dữ liệu có bản đồ lỗi theo màn (<Tên>.failure-map.json cạnh form) — R-STD-FAIL-6',
    gate: 'CONF-STATIC', contract: 'quality', rules: ['R-REV-17'], tier: 1, enforce: 'ratchet', weight: 2, targets: ['repo'],
    run(ctx) {
      const fs = forms(ctx);
      const findings = fs.filter((f) => !ctx.repo.exists(mapOf(f)))
        .map((f) => ctx.finding(f, 1, `form chưa có bản đồ lỗi ${mapOf(f).split('/').pop()} — dựng khung: node ../bizcity-platform/tools/failure-check.mjs --repo . --scaffold ${f} --code <MÃ MÀN> --flow <luồng> --write (AGENTS.md "Màn có ghi dữ liệu")`, f));
      return { examined: fs.length, findings, metrics: { forms: fs.length, mapped: fs.length - findings.length }, notes: [`${fs.length} form, ${fs.length - findings.length} có bản đồ lỗi`] };
    },
  },
  {
    id: 'SC-UI-3',
    title: 'Bản đồ lỗi đúng khuôn tối thiểu: dòng chặn có mã trong danh mục + test nhắc đúng mã, câu hỏi ngược đã trả lời — R-STD-FAIL-2/3, R-STD-LOOP-2',
    gate: 'CONF-STATIC', contract: 'quality', rules: ['R-REV-17'], tier: 1, enforce: 'block', weight: 2, targets: ['repo'],
    run(ctx) {
      const maps = ctx.repo.files({ under: UNDER, ext: ['.json'], not: NOT }).filter((f) => f.endsWith('.failure-map.json'));
      const catalog = ctx.repo.files({ under: ['packages/contracts/src'], ext: ['.ts'] }).map((f) => ctx.repo.read(f) ?? '').join('\n');
      const findings = [];
      const bad = (file, msg, key) => findings.push(ctx.finding(file, 1, msg, key));
      for (const file of maps) {
        let m;
        try { m = JSON.parse(ctx.repo.read(file) ?? ''); } catch (e) { bad(file, `bản đồ lỗi không đọc được JSON: ${e.message}`, 'json'); continue; }
        if (m.schema !== 'bizcity_failure_map@1') { bad(file, 'thiếu "schema": "bizcity_failure_map@1"', 'schema'); continue; }
        if (!m.screen?.file || m.screen.file !== file.replace(/\.failure-map\.json$/, '.tsx')) bad(file, `screen.file phải là ${file.replace(/\.failure-map\.json$/, '.tsx')}`, 'screen');
        for (const r of Array.isArray(m.rows) ? m.rows : []) {
          if (r.level !== 'block') continue;
          const id = r.id ?? '?';
          if (!r.code) { bad(file, `${id}: dòng chặn chưa gán mã — chọn mã trong packages/contracts/src, thiếu thì thêm mã theo R-ERR-1 / R-INTAKE-11`, `${id}:code`); continue; }
          if (!tokenIn(catalog, r.code)) bad(file, `${id}: mã ${r.code} không có trong packages/contracts/src — không tự đặt chuỗi trên màn (R-STD-FAIL-2)`, `${id}:catalog`);
          if (!r.test) { bad(file, `${id}: dòng chặn ${r.code} chưa có test (R-STD-FAIL-3)`, `${id}:test`); continue; }
          const [tf, tok] = String(r.test).split('#');
          const tt = ctx.repo.read(tf);
          if (tt == null) bad(file, `${id}: test ${tf} không có`, `${id}:test-file`);
          else if (!tokenIn(tt, tok || r.code)) bad(file, `${id}: test ${tf} không nhắc "${tok || r.code}" — test phải gây ra đúng mã`, `${id}:test-code`);
        }
        const open = (Array.isArray(m.questions) ? m.questions : []).filter((q) => q.answer == null || !String(q.answer).trim());
        if (open.length) bad(file, `${open.length} câu hỏi ngược chưa trả lời (${open.slice(0, 4).map((q) => q.id).join(', ')}${open.length > 4 ? '…' : ''}) — hỏi người yêu cầu / kế toán trưởng, không đoán (R-STD-LOOP-2)`, 'questions');
      }
      return { examined: maps.length, findings, notes: [`${maps.length} bản đồ lỗi`] };
    },
  },
];
