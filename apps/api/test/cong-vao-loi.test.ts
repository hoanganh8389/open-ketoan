// [2026-11-22 11:50 AM Johnny Chu - Chu Hoàng Anh] PHASE-038 — B2 (S038-6): cổng vào trả JSON GATEWAY_UNAVAILABLE khớp danh mục; web-loi.log không ghi chuỗi truy vấn; xoay log 10 MB × 3
/**
 * Cổng vào (container web, docker/nginx.conf) — kiểm tĩnh trên tệp cấu hình + chạy thật script xoay log. Phần chạy nginx thật
 * (dừng api → curl) ghi ở PR / checklist PHASE-038 vì cần Docker.
 *   - thân JSON của @gateway_unavailable parse được, đúng phong bì lỗi, mã / thông báo / http khớp ERROR_CATALOG;
 *   - mọi location chuyển sang api có error_page → @gateway_unavailable; không proxy_intercept_errors (5xx của api đi nguyên);
 *   - proxy_pass qua biến + resolver (phân giải lúc chạy);
 *   - nhật ký cổng vào (logs/web/) ghi $uri, không $request_uri (R-LOG-4); có rid = $request_id;
 *   - docker/web-xoay-log.sh: chuyển dang-ghi.log sang <ngày VN>.log, tách phần, giữ 30 ngày, trần thư mục (B6, D038-7).
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ERROR_CATALOG } from '@ketoan/contracts';

const ROOT = path.resolve(__dirname, '../../..');
const conf = readFileSync(path.join(ROOT, 'docker/nginx.conf'), 'utf8');
const noComments = conf.split('\n').map((l) => l.replace(/#.*$/, '')).join('\n');

/** Thân một location (đếm ngoặc), không chú thích. */
function block(header: RegExp): string {
  const m = header.exec(noComments);
  if (!m) throw new Error(`không thấy ${header}`);
  let depth = 0; let i = noComments.indexOf('{', m.index);
  const start = i;
  for (; i < noComments.length; i++) {
    if (noComments[i] === '{') depth++;
    if (noComments[i] === '}' && --depth === 0) break;
  }
  return noComments.slice(start + 1, i);
}

describe('cổng vào: JSON GATEWAY_UNAVAILABLE', () => {
  it('thân trả về là phong bì lỗi chuẩn, khớp danh mục mã lỗi', () => {
    const b = block(/location @gateway_unavailable/);
    const m = /return (\d{3}) '(.+)';/.exec(b);
    expect(m).not.toBeNull();
    const spec = ERROR_CATALOG.GATEWAY_UNAVAILABLE;
    expect(Number(m![1])).toBe(spec.http);
    const body = JSON.parse(m![2]!.replace('$request_id', '0123456789abcdef0123456789abcdef')) as { ok: boolean; error: Record<string, string> };
    expect(body).toEqual({ ok: false, error: { code: 'GATEWAY_UNAVAILABLE', message: spec.message, requestId: '0123456789abcdef0123456789abcdef' } });
    expect(b).toMatch(/default_type application\/json;/);
    expect(b).toMatch(/charset_types application\/json;/);
  });

  it('mọi location chuyển tới api: proxy_pass qua biến, error_page về @gateway_unavailable; không chặn 5xx của api', () => {
    for (const h of [/location \/api\/ /, /location = \/mcp /]) {
      const b = block(h);
      expect(b).toMatch(/proxy_pass \$ketoan_api;/);
      expect(b).toMatch(/error_page 502 503 = @gateway_unavailable;/);
      // 504 (báo cáo chạy quá proxy_read_timeout, api vẫn sống) KHÔNG gộp vào "không kết nối được"
      expect(b).not.toMatch(/error_page[^;]*504/);
    }
    expect(noComments).not.toMatch(/proxy_intercept_errors\s+on/);
    expect(noComments).toMatch(/resolver 127\.0\.0\.11/);
    expect(noComments).not.toMatch(/proxy_pass http:\/\/api/); // không còn tên cố định phân giải một lần
  });

  // [2026-11-22 07:50 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — B6 (D038-7): nginx ghi web/dang-ghi.log; script chuyển sang web/<ngày>.log
  it('nhật ký cổng vào: chỉ mã ≥ 500, ghi $uri (không chuỗi truy vấn), có rid; ghi web/dang-ghi.log; stdout giữ như cũ', () => {
    const fmt = /log_format ketoan_loi '([^']+)'/.exec(noComments)?.[1] ?? '';
    expect(fmt).toContain('$uri');
    expect(fmt).not.toMatch(/\$request_uri|\$args|\$query_string|\$request_body|\$http_authorization|\$http_cookie/);
    expect(fmt).toContain('rid=$request_id');
    expect(noComments).toMatch(/access_log \/var\/log\/ketoan\/web\/dang-ghi\.log ketoan_loi if=\$ketoan_loi5xx;/);
    expect(noComments).toMatch(/error_log \/var\/log\/ketoan\/web\/dang-ghi\.log warn;/);
    expect(noComments).toMatch(/access_log \/var\/log\/nginx\/access\.log main;/);
  });
});

const sh = spawnSync('sh', ['-c', 'echo ok'], { encoding: 'utf8' });
describe.skipIf(sh.status !== 0)('docker/web-xoay-log.sh — một ngày một tệp, giữ 30 ngày, trần thư mục', () => {
  const script = path.join(ROOT, 'docker/web-xoay-log.sh');
  const NGAY = 86_400;
  const t0 = Math.floor(Date.UTC(2026, 10, 22, 2, 0, 0) / 1000); // 09:00 giờ VN 22/11/2026
  const run = (dir: string, now: number, o: Record<string, string> = {}) => spawnSync('sh', [script], {
    encoding: 'utf8',
    env: {
      ...process.env, XOAY_LOG_DIR: dir.replace(/\\/g, '/'), XOAY_LOG_NOW: String(now), XOAY_LOG_ONCE: '1',
      XOAY_LOG_REOPEN: `touch ${path.join(dir, '..', 'da-mo-lai').replace(/\\/g, '/')}`, ...o,
    },
  });
  const tao = () => { const goc = mkdtempSync(path.join(tmpdir(), 'xoay-log-')); const dir = path.join(goc, 'web'); mkdirSync(dir); return { goc, dir }; };

  it('dang-ghi.log có dữ liệu → nối vào <ngày VN>.log, gọi mở lại; rỗng thì không làm gì', () => {
    const { goc, dir } = tao();
    try {
      expect(run(dir, t0).status).toBe(0);
      expect(readdirSync(dir)).toEqual([]);
      writeFileSync(path.join(dir, 'dang-ghi.log'), 'dòng 1\n');
      run(dir, t0);
      writeFileSync(path.join(dir, 'dang-ghi.log'), 'dòng 2\n');
      run(dir, t0);
      expect(readdirSync(dir)).toEqual(['2026-11-22.log']);
      expect(readFileSync(path.join(dir, '2026-11-22.log'), 'utf8')).toBe('dòng 1\ndòng 2\n');
      expect(readdirSync(goc)).toContain('da-mo-lai');
      // 17:00 UTC = 00:00 giờ VN hôm sau
      writeFileSync(path.join(dir, 'dang-ghi.log'), 'dòng 3\n');
      run(dir, Math.floor(Date.UTC(2026, 10, 22, 17, 0, 0) / 1000));
      expect(readdirSync(dir).sort()).toEqual(['2026-11-22.log', '2026-11-23.log']);
    } finally { rmSync(goc, { recursive: true, force: true }); }
  });

  it('một ngày quá trần một tệp → <ngày>.1.log', () => {
    const { goc, dir } = tao();
    try {
      for (let i = 0; i < 3; i++) { writeFileSync(path.join(dir, 'dang-ghi.log'), 'x'.repeat(60) + '\n'); run(dir, t0, { XOAY_LOG_PART_BYTES: '100' }); }
      expect(readdirSync(dir).sort()).toEqual(['2026-11-22.1.log', '2026-11-22.log']);
    } finally { rmSync(goc, { recursive: true, force: true }); }
  });

  it('giữ 30 ngày; vượt trần thư mục xoá cũ nhất trước; tệp lạ không bị đụng', () => {
    const { goc, dir } = tao();
    try {
      run(dir, t0);
      for (const d of ['2026-10-01', '2026-10-22', '2026-10-23', '2026-11-20', '2026-11-21']) writeFileSync(path.join(dir, `${d}.log`), 'x'.repeat(100));
      writeFileSync(path.join(dir, '2026-11-21.1.log'), 'x'.repeat(100));
      writeFileSync(path.join(dir, 'ghi-chu.txt'), 'giữ');
      expect(run(dir, t0).status).toBe(0);
      // hạn 30 ngày trước 22/11 = 23/10: 01/10 và 22/10 bị xoá
      expect(readdirSync(dir).sort()).toEqual(['2026-10-23.log', '2026-11-20.log', '2026-11-21.1.log', '2026-11-21.log', 'ghi-chu.txt']);
      run(dir, t0, { XOAY_LOG_CAP_BYTES: '250' });
      expect(readdirSync(dir).sort()).toEqual(['2026-11-21.1.log', '2026-11-21.log', 'ghi-chu.txt']);
    } finally { rmSync(goc, { recursive: true, force: true }); }
  });

  it('ngày tính đúng khi lùi 30 ngày qua đầu tháng (không dùng tzdata)', () => {
    const { goc, dir } = tao();
    try {
      run(dir, t0 + 10 * NGAY);
      expect(readdirSync(dir)).toEqual([]);
    } finally { rmSync(goc, { recursive: true, force: true }); }
  });
});
