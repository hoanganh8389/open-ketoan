// [2026-11-22 11:50 AM Johnny Chu - Chu Hoàng Anh] PHASE-038 — B2 (S038-6): cổng vào trả JSON GATEWAY_UNAVAILABLE khớp danh mục; web-loi.log không ghi chuỗi truy vấn; xoay log 10 MB × 3
/**
 * Cổng vào (container web, docker/nginx.conf) — kiểm tĩnh trên tệp cấu hình + chạy thật script xoay log. Phần chạy nginx thật
 * (dừng api → curl) ghi ở PR / checklist PHASE-038 vì cần Docker.
 *   - thân JSON của @gateway_unavailable parse được, đúng phong bì lỗi, mã / thông báo / http khớp ERROR_CATALOG;
 *   - mọi location chuyển sang api có error_page → @gateway_unavailable; không proxy_intercept_errors (5xx của api đi nguyên);
 *   - proxy_pass qua biến + resolver (phân giải lúc chạy);
 *   - web-loi.log ghi $uri, không $request_uri (R-LOG-4); có rid = $request_id;
 *   - docker/web-xoay-log.sh giữ đúng số tệp, xoá bản cũ nhất, gọi lệnh mở lại.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

  it('web-loi.log: chỉ mã ≥ 500, ghi $uri (không chuỗi truy vấn), có rid; stdout giữ như cũ', () => {
    const fmt = /log_format ketoan_loi '([^']+)'/.exec(noComments)?.[1] ?? '';
    expect(fmt).toContain('$uri');
    expect(fmt).not.toMatch(/\$request_uri|\$args|\$query_string|\$request_body|\$http_authorization|\$http_cookie/);
    expect(fmt).toContain('rid=$request_id');
    expect(noComments).toMatch(/access_log \/var\/log\/ketoan\/web-loi\.log ketoan_loi if=\$ketoan_loi5xx;/);
    expect(noComments).toMatch(/error_log \/var\/log\/ketoan\/web-loi\.log warn;/);
    expect(noComments).toMatch(/access_log \/var\/log\/nginx\/access\.log main;/);
  });
});

const sh = spawnSync('sh', ['-c', 'echo ok'], { encoding: 'utf8' });
describe.skipIf(sh.status !== 0)('docker/web-xoay-log.sh', () => {
  const script = path.join(ROOT, 'docker/web-xoay-log.sh');
  const run = (dir: string, max: number) => spawnSync('sh', [script], {
    encoding: 'utf8',
    env: { ...process.env, XOAY_LOG_FILE: path.join(dir, 'web-loi.log').replace(/\\/g, '/'), XOAY_LOG_MAX_BYTES: String(max), XOAY_LOG_KEEP: '3', XOAY_LOG_ONCE: '1', XOAY_LOG_REOPEN: `touch ${path.join(dir, 'da-mo-lai').replace(/\\/g, '/')}` },
  });

  it('dưới trần: không đổi gì; vượt trần: xoay, giữ 3 tệp, bản cũ nhất bị xoá, gọi mở lại', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'xoay-log-'));
    try {
      const f = (n = '') => path.join(dir, `web-loi.log${n}`);
      writeFileSync(f(), 'x'.repeat(50));
      expect(run(dir, 100).status).toBe(0);
      expect(readdirSync(dir)).toEqual(['web-loi.log']);

      writeFileSync(f(), 'MOI'.repeat(50)); writeFileSync(f('.1'), 'CU1'); writeFileSync(f('.2'), 'CU2');
      expect(run(dir, 100).status).toBe(0);
      expect(readdirSync(dir).sort()).toEqual(['da-mo-lai', 'web-loi.log.1', 'web-loi.log.2']);
      expect(readFileSync(f('.1'), 'utf8')).toBe('MOI'.repeat(50));
      expect(readFileSync(f('.2'), 'utf8')).toBe('CU1'); // CU2 (cũ nhất) đã bị xoá
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
