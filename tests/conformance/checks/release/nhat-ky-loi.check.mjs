// [2026-11-22 09:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — B5 (S038-10, S038-14): bộ kiểm luật ghi log lỗi R-LOG — SC-LOG-1..3, SC-OBS-3
/**
 * Luật R-LOG (docs/rules/RULE-LOG.md, Johnny Chu – Chu Hoàng Anh khởi tạo 2026-11-21). Trước bộ kiểm này người rà và agent nhắc tay.
 *
 *   SC-LOG-1 (R-LOG-1) một đường ghi lỗi: không `err: String(e)` / `err: e.message` trong lời gọi log (mất stack, cause); không
 *            console.* trong mã chạy của API / Platform / Kernel / module (ngoài cli/, job db/, điểm vào khởi động, logger).
 *   SC-LOG-2 (R-LOG-2) không nuốt lỗi im lặng: `catch {}` rỗng, `.catch(() => undefined | null | {} | void 0)` phải có chú thích
 *            `nuot-loi: <lý do>` trên cùng dòng, hai dòng trước, hoặc trong thân catch.
 *   SC-LOG-3 (R-LOG-8) stack trỏ mã nguồn: ảnh API chạy Node --enable-source-maps; tsconfig bật sourceMap.
 *   SC-OBS-3 (R-LOG-9) nhật ký lỗi cố định: mọi dịch vụ compose khai `logging:`; api / db-migrate / web gắn thư mục logs/.
 *
 * Mã cũ trước luật là nợ trong baseline.json (bánh cóc, PHASE-038 S038-14) — không bắt sửa trong PR không liên quan, nhưng
 * không được thêm. Dấu vân tay theo nội dung dòng (không số dòng).
 */
const SRC_API = ['apps/api/src', 'packages/platform/src', 'packages/kernel/src', 'packages/module-sdk/src', 'modules'];
const SRC_ALL = [...SRC_API, 'apps/web/src'];
const LOGGER = 'packages/platform/src/core/logger.ts';
/** Được dùng console / có thể tự in: CLI, job dòng lệnh của db/, điểm vào khởi động (kể cả kiểm .env trước khi có logger), logger, test. */
const CONSOLE_OK = /\/config\/env\.ts$|(^|\/)(cli|test|tests|__tests__)\/|\/db\/(seed|setup|migrate|site-[\w-]+)\.ts$|\/(main|seed)\.ts$|\.test\.tsx?$|\/scripts?\//;
const isCode = (f) => /\.(ts|tsx|mjs)$/.test(f) && !/\.d\.ts$/.test(f) && !/(^|\/)(dist|node_modules)\//.test(f);

const NUOT = /nuot-loi\s*:/;
const RONG = /\.catch\(\s*(\(\s*\w*\s*\)|\w+)\s*=>\s*(undefined|null|void 0|\{\s*\}|false|\[\s*\])\s*\)/;
// từ khoá catch của try (không phải phương thức .catch( của Promise — dạng đó xét bằng RONG)
const CATCH_RONG_1 = /(?<![.\w])catch\s*(\([^)]*\))?\s*\{\s*(\/\*[^*]*\*\/\s*)?\}/;
const CATCH_MO = /(?<![.\w])catch\s*(\([^)]*\))?\s*\{\s*$/;

/** Thân catch nhiều dòng rỗng (chỉ chú thích) — trả nội dung để xét có `nuot-loi:` không. null = có lệnh thật. */
function thanRong(ls, i) {
  const body = [];
  for (let j = i + 1; j < Math.min(ls.length, i + 8); j++) {
    const t = ls[j].trim();
    if (t.startsWith('}')) return body.join('\n');
    if (t === '' || t.startsWith('//') || t.startsWith('/*') || t.startsWith('*')) { body.push(t); continue; }
    return null;
  }
  return null;
}

export const checks = [
  {
    id: 'SC-LOG-1',
    title: 'R-LOG-1 một đường ghi lỗi: log giữ đối tượng lỗi (không String(e) / e.message), không console.* trong mã chạy',
    gate: 'CONF-STATIC', contract: 'quality', rules: ['R-LOG-1'], conf: [], tier: 0, enforce: 'ratchet', weight: 2, targets: ['repo'],
    run(ctx) {
      const files = ctx.repo.files({ under: SRC_API, ext: ['.ts', '.tsx'] }).filter(isCode);
      const findings = [];
      for (const f of files) {
        if (f === LOGGER) continue;
        ctx.repo.lines(f).forEach((t, i) => {
          if (/^\s*(\/\/|\*)/.test(t)) return;
          if (/\.(error|warn|fatal)\(\s*\{[^}]*\b(err|error)\s*:\s*(String\(|\(?\s*\w+(\s+as\s+Error)?\s*\)?\??\.message\b)/.test(t)) {
            findings.push(ctx.finding(f, i + 1, `log mất stack: ghi chuỗi thay đối tượng lỗi — viết { err } hoặc logError(log, err, ctx) (R-LOG-1): ${t.trim().slice(0, 100)}`, `mat-stack:${t.trim()}`));
          }
          if (!CONSOLE_OK.test(f) && /\bconsole\.(log|error|warn|info|debug)\(/.test(t)) {
            findings.push(ctx.finding(f, i + 1, `console.* trong mã chạy — dùng req.log / app.log / logger con (R-LOG-1): ${t.trim().slice(0, 100)}`, `console:${t.trim()}`));
          }
        });
      }
      return { examined: files.length, findings };
    },
  },
  {
    id: 'SC-LOG-2',
    title: 'R-LOG-2 không nuốt lỗi im lặng: catch rỗng / .catch(() => undefined) phải có chú thích "nuot-loi: <lý do>"',
    gate: 'CONF-STATIC', contract: 'quality', rules: ['R-LOG-2'], conf: [], tier: 0, enforce: 'ratchet', weight: 2, targets: ['repo'],
    run(ctx) {
      const files = ctx.repo.files({ under: SRC_ALL, ext: ['.ts', '.tsx'] }).filter(isCode).filter((f) => !/\.test\.tsx?$|\/test\//.test(f));
      const findings = [];
      for (const f of files) {
        const ls = ctx.repo.lines(f);
        ls.forEach((t, i) => {
          if (/^\s*(\/\/|\*)/.test(t)) return;
          const truoc = `${ls[i - 2] ?? ''}\n${ls[i - 1] ?? ''}\n${t}`;
          let loai = null;
          if (RONG.test(t) || CATCH_RONG_1.test(t)) loai = 'một dòng';
          else if (CATCH_MO.test(t)) { const b = thanRong(ls, i); if (b !== null) { if (NUOT.test(b)) return; loai = 'thân rỗng'; } }
          if (!loai || NUOT.test(truoc)) return;
          findings.push(ctx.finding(f, i + 1, `nuốt lỗi im lặng (${loai}) — ghi log.warn({ err }, '…') hoặc chú thích "// nuot-loi: <lý do>" (R-LOG-2): ${t.trim().slice(0, 100)}`, `nuot:${t.trim()}`));
        });
      }
      return { examined: files.length, findings };
    },
  },
  {
    id: 'SC-LOG-3',
    title: 'R-LOG-8 stack trỏ mã nguồn .ts: ảnh API chạy Node --enable-source-maps, tsconfig bật sourceMap, không xoá .map',
    gate: 'CONF-STATIC', contract: 'quality', rules: ['R-LOG-8'], conf: [], tier: 1, enforce: 'block', weight: 1, targets: ['repo'],
    run(ctx) {
      const findings = [];
      const df = 'docker/api.Dockerfile';
      const d = ctx.repo.read(df);
      if (d == null) return { examined: 0, findings: [], notes: [`không có ${df}`] };
      if (!/--enable-source-maps/.test(d)) findings.push(ctx.finding(df, null, 'ảnh API thiếu NODE_OPTIONS=--enable-source-maps — stack trong log sẽ trỏ dist/*.js (R-LOG-8)', 'thieu-source-maps'));
      if (/rm\s[^\n]*\.map\b|-name\s+['"]?\*\.map/.test(d)) findings.push(ctx.finding(df, null, 'ảnh API xoá tệp .map — stack không đọc được về .ts (R-LOG-8)', 'xoa-map'));
      const ts = ctx.repo.json('tsconfig.base.json');
      if (ts && ts.compilerOptions?.sourceMap !== true) findings.push(ctx.finding('tsconfig.base.json', null, 'compilerOptions.sourceMap phải là true (R-LOG-8)', 'tsconfig-sourcemap'));
      return { examined: 2, findings };
    },
  },
  {
    id: 'SC-OBS-3',
    title: 'R-LOG-9 nhật ký lỗi cố định: mọi dịch vụ compose khai logging: có trần; api / db-migrate / web gắn thư mục logs/',
    gate: 'CONF-STATIC', contract: 'quality', rules: ['R-LOG-9'], conf: [], tier: 1, enforce: 'block', weight: 1, targets: ['repo'],
    run(ctx) {
      const cf = 'docker-compose.yml';
      const ls = ctx.repo.lines(cf);
      if (!ls.length) return { examined: 0, findings: [], notes: [`không có ${cf}`] };
      // dịch vụ = khoá thụt 2 cách dưới "services:"; khối kéo tới khoá thụt 2 cách kế tiếp
      const findings = [];
      const bd = ls.findIndex((l) => /^services:\s*$/.test(l));
      const dv = new Map();
      let cur = null;
      for (let i = bd + 1; i < ls.length && bd >= 0; i++) {
        const l = ls[i];
        if (/^\S/.test(l)) break;
        const m = /^ {2}([\w-]+):\s*$/.exec(l);
        if (m) { cur = m[1]; dv.set(cur, []); continue; }
        if (cur) dv.get(cur).push(l);
      }
      const GAN = { api: '/app/logs', 'db-migrate': '/app/logs', web: '/var/log/ketoan' };
      for (const [ten, khoi] of dv) {
        const t = khoi.join('\n');
        if (!/^\s{4}logging:/m.test(t)) findings.push(ctx.finding(cf, null, `dịch vụ ${ten} chưa khai logging: có trần (x-logging, max-size / max-file) — log Docker lớn vô hạn (R-LOG-9)`, `logging:${ten}`));
        if (GAN[ten] && !t.includes(`LOG_HOST_DIR:-./logs}:${GAN[ten]}`)) findings.push(ctx.finding(cf, null, `dịch vụ ${ten} chưa gắn \${LOG_HOST_DIR:-./logs}:${GAN[ten]} — nhật ký lỗi cố định không ra máy chủ (R-LOG-9)`, `mount:${ten}`));
      }
      for (const ten of Object.keys(GAN)) if (!dv.has(ten)) findings.push(ctx.finding(cf, null, `không thấy dịch vụ ${ten} trong ${cf}`, `thieu:${ten}`));
      return { examined: dv.size, findings };
    },
  },
];
