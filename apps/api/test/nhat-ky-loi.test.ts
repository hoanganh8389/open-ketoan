// [2026-11-21 03:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — B1 (S038-2..5, S038-11): test nhật ký lỗi cố định — tệp xoay vòng, tách mức, lỗi khởi động ghi đồng bộ, version / commit
/**
 * Nhật ký lỗi cố định của bản cài (PHASE-038, 10-NGHIEN-CUU-GHI-LOG.md §7). Kiểm:
 *   - tệp xoay vòng giữ đúng số bản, không vượt trần;
 *   - chỉ dòng ≥ LOG_FILE_LEVEL vào tệp, stdout vẫn theo LOG_LEVEL;
 *   - logger Fastify thật ghi tệp có service / version / commit;
 *   - lỗi khởi động: một dòng fatal đồng bộ có evt, reason, hint, stack — đọc được ngay sau khi gọi (trước process.exit);
 *   - thư mục không ghi được không làm hỏng việc ghi log.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  classifyStartError, DailyFile, dailyFile, donTepKieuCu, errFp, LEVELS, logError, loggerOptions, logStartFailure, ngayVN, ownFrames, REDACT_PATHS, RotatingFile,
  serializeError, teeStream,
} from '@bizcity/platform/core/logger';
import { EnvError } from '@bizcity/platform/config/env';

let dir: string;
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'nhat-ky-loi-')); });
afterEach(() => { vi.restoreAllMocks(); rmSync(dir, { recursive: true, force: true }); });

/** Tệp hôm nay của một thư mục dịch vụ (B6, D038-7: logs/<dịch vụ>/<YYYY-MM-DD>.log). */
const homNay = (thuMuc: string) => path.join(dir, thuMuc, `${ngayVN()}.log`);
const lines = (file: string) => readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);

describe('RotatingFile', () => {
  it('xoay vòng theo dung lượng, giữ đúng số bản, bản cũ nhất bị xoá', () => {
    const f = new RotatingFile(path.join(dir, 'a.log'), 100, 3);
    for (let i = 0; i < 20; i++) f.write(`${String(i).padStart(2, '0')}-${'x'.repeat(26)}\n`); // 30 byte / dòng
    expect(readdirSync(dir).sort()).toEqual(['a.log', 'a.log.1', 'a.log.2']);
    const total = readdirSync(dir).reduce((n, x) => n + statSync(path.join(dir, x)).size, 0);
    expect(total).toBeLessThanOrEqual(300);
    expect(lines(path.join(dir, 'a.log')).at(-1)).toMatch(/^19-/); // dòng mới nhất ở tệp chính
  });

  it('thư mục không ghi được: báo một lần ra stderr, không ném lỗi', () => {
    const blocker = path.join(dir, 'la-tep');
    writeFileSync(blocker, 'không phải thư mục');
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const f = new RotatingFile(path.join(blocker, 'api-loi.log'));
    expect(() => { f.write('a\n'); f.write('b\n'); }).not.toThrow();
    expect(err).toHaveBeenCalledTimes(1);
  });
});

describe('teeStream / loggerOptions', () => {
  it('chỉ dòng ≥ mức tệp vào tệp; stdout nhận cả hai', () => {
    const out: string[] = [];
    const file = new RotatingFile(path.join(dir, 'api-loi.log'));
    const s = teeStream({ file, fileLevel: LEVELS.warn, out: { write: (x: string) => out.push(x) } });
    s.write('{"level":30,"msg":"xong yêu cầu"}\n');
    s.write('{"level":50,"msg":"lỗi hệ thống"}\n');
    expect(out).toHaveLength(2);
    expect(lines(file.file)).toEqual(['{"level":50,"msg":"lỗi hệ thống"}']);
  });

  it('logger Fastify thật: warn vào tệp có service / version / commit; stdout lọc theo LOG_LEVEL', async () => {
    const prevSha = process.env.BIZCITY_GIT_SHA;
    process.env.BIZCITY_GIT_SHA = '69e0c848aabbccddeeff00112233445566778899';
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      const app = Fastify({ logger: loggerOptions({ service: 'api', level: 'error', dir, fileLevel: 'warn' }) });
      app.log.info('việc bình thường');
      app.log.warn({ evt: 'bizcity.test.warn' }, 'cảnh báo');
      app.log.error({ err: new Error('hỏng') }, 'lỗi hệ thống');
      await app.close();
      const rows = lines(homNay('api')).map((l) => JSON.parse(l) as Record<string, unknown>);
      expect(rows.map((r) => r.msg)).toEqual(['cảnh báo', 'lỗi hệ thống']);
      expect(rows[0]).toMatchObject({ service: 'api', commit: '69e0c848aabb', evt: 'bizcity.test.warn' });
      expect(typeof rows[0]!.version).toBe('string');
      expect((rows[1]!.err as { stack: string }).stack).toContain('hỏng');
      const printed = out.mock.calls.map((c) => String(c[0])).join('');
      expect(printed).toContain('lỗi hệ thống');
      expect(printed).not.toContain('cảnh báo'); // LOG_LEVEL=error
    } finally {
      out.mockRestore();
      if (prevSha === undefined) delete process.env.BIZCITY_GIT_SHA; else process.env.BIZCITY_GIT_SHA = prevSha;
    }
  });

  it('không đặt LOG_DIR: không ghi tệp; test: im lặng', () => {
    expect(loggerOptions({ service: 'api', level: 'info', silent: true })).toEqual({ level: 'silent' });
    const o = loggerOptions({ service: 'api', level: 'info', dir: '' }) as { level: string };
    expect(o.level).toBe('info');
    expect(readdirSync(dir)).toEqual([]);
  });
});

describe('lỗi khởi động', () => {
  it.each([
    [new Error('Cơ sở dữ liệu chưa nâng cấp (2 migration chưa áp, mới nhất 0163_x.sql)'), 'MIGRATION_PENDING'],
    [new EnvError('Cấu hình môi trường không hợp lệ: JWT_SECRET'), 'ENV_INVALID'],
    [Object.assign(new Error('password authentication failed'), { code: '28P01' }), 'DB_AUTH_FAILED'],
    [Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }), 'DB_UNREACHABLE'],
    [Object.assign(new Error('listen EADDRINUSE'), { code: 'EADDRINUSE' }), 'PORT_IN_USE'],
    [new TypeError('x is undefined'), 'UNKNOWN'],
  ])('%s → %s', (err, reason) => {
    expect(classifyStartError(err)).toBe(reason);
  });

  it('ghi đồng bộ một dòng fatal có evt, reason, hint, stack — đọc được ngay', () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const reason = logStartFailure(new Error('Cơ sở dữ liệu chưa nâng cấp (1 migration chưa áp, mới nhất 0164_y.sql)'), { service: 'api', dir });
    expect(reason).toBe('MIGRATION_PENDING');
    const [row] = lines(homNay('api')).map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(row).toMatchObject({ level: 60, service: 'api', evt: 'bizcity.system.start_failed', reason: 'MIGRATION_PENDING' });
    expect(String(row!.hint)).toContain('db-migrate');
    expect(String((row!.err as { stack: string }).stack)).toContain('nhat-ky-loi.test.ts');
  });

  it('job db-migrate ghi thư mục riêng logs/db-migrate/<ngày>.log; một DailyFile cho mỗi thư mục', () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    logStartFailure(Object.assign(new Error('Migration 0165_z.sql lỗi: cột trùng'), { code: '42701' }), { service: 'db-migrate', thuMuc: 'db-migrate', dir });
    const p = homNay('db-migrate');
    expect(dailyFile('db-migrate', dir)).toBe(dailyFile('db-migrate', dir));
    expect(JSON.parse(lines(p)[0]!)).toMatchObject({ service: 'db-migrate', reason: 'UNKNOWN', err: { code: '42701' } });
  });
});

// [2026-11-22 01:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-038 — B1b (S038-12): errFp, logError, mixin, redact từng trường, lỗi Postgres không ghi detail
/** Logger Fastify thật, ghi vào tệp tạm ở mức warn trở lên; trả các dòng đã parse. */
async function withAppLog(run: (log: ReturnType<typeof Fastify>['log']) => void): Promise<Record<string, unknown>[]> {
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const app = Fastify({ logger: loggerOptions({ service: 'api', level: 'warn', dir, fileLevel: 'warn' }) });
  run(app.log);
  await app.close();
  return lines(homNay('api')).map((l) => JSON.parse(l) as Record<string, unknown>);
}

const throwAt = (msg: string) => { try { throw new TypeError(msg); } catch (e) { return e as Error; } };
const fromA = (m: string) => throwAt(m);
const fromB = (m: string) => throwAt(m);

describe('errFp — dấu vân lỗi', () => {
  it('cùng chỗ ném, thông báo khác → cùng errFp; chỗ khác → khác; 12 ký tự hex', () => {
    const a1 = fromA('phiếu PN0001 lỗi 1.200.000'); const a2 = fromA('phiếu PN0002 lỗi 5');
    expect(errFp(a1)).toMatch(/^[0-9a-f]{12}$/);
    expect(errFp(a1)).toBe(errFp(a2));
    expect(errFp(fromB('phiếu PN0001 lỗi 1.200.000'))).not.toBe(errFp(a1));
    // cùng khung, khác loại lỗi → khác dấu
    const asRange = Object.assign(new RangeError('x'), { stack: a1.stack!.replace(/^TypeError/, 'RangeError') });
    expect(errFp(asRange)).not.toBe(errFp(a1));
  });

  it('chuẩn hoá đường dẫn: máy dev và container cho cùng khung (bỏ tiền tố, số cột, node_modules)', () => {
    const stack = (root: string) => [
      'Error: x',
      `    at postPhieu (${root}/packages/kernel/src/posting.ts:120:15)`,
      `    at ${root}/node_modules/fastify/lib/route.js:9:1`,
      `    at handler (file://${root}/apps/api/src/routes.ts:33:7)`,
    ].join('\n');
    const dev = ownFrames(stack('D:\\projects\\okt'.replace(/\\/g, '/')));
    const box = ownFrames(stack('/app'));
    expect(dev).toEqual(['packages/kernel/src/posting.ts:120', 'apps/api/src/routes.ts:33']);
    expect(box).toEqual(dev);
    expect(ownFrames('Error: x\n    at C:\\w\\apps\\api\\src\\a.ts:5:2')).toEqual(['apps/api/src/a.ts:5']);
  });

  it('lỗi không có khung trong repo: theo thông báo đã thay số / mã định danh', () => {
    const e = (m: string) => Object.assign(new Error(m), { stack: `Error: ${m}\n    at /app/node_modules/pg/lib/x.js:1:1` });
    expect(errFp(e('timeout after 5000ms'))).toBe(errFp(e('timeout after 3000ms')));
    expect(errFp('chuỗi 12')).toBe(errFp('chuỗi 99'));
  });
});

describe('logError / mixin — một đường ghi lỗi (R-LOG-1)', () => {
  it('logError: dòng có evt, errFp, err.stack, chuỗi cause, trường ngữ cảnh; câu do người gọi đặt', async () => {
    const err = new Error('Ghi sổ lỗi', { cause: Object.assign(new Error('deadlock detected'), { code: '40P01' }) });
    const [row] = await withAppLog((log) => logError(log, err, { evt: 'bizcity.kho.ghi_so_loi', fn: 'postPhieu' }, 'Ghi sổ phiếu kho lỗi'));
    expect(row).toMatchObject({ level: 50, evt: 'bizcity.kho.ghi_so_loi', fn: 'postPhieu', msg: 'Ghi sổ phiếu kho lỗi', errFp: errFp(err) });
    expect(row!.err).toMatchObject({ type: 'Error', message: 'Ghi sổ lỗi', cause: { message: 'deadlock detected', code: '40P01' } });
    expect(String((row!.err as { stack: string }).stack)).toContain('nhat-ky-loi.test.ts');
  });

  it('logError mức warn (đã lùi) và lỗi không phải Error', async () => {
    const rows = await withAppLog((log) => { logError(log, new Error('tra MST hết giờ'), { level: 'warn', evt: 'bizcity.mst.timeout' }); logError(log, 'chuỗi lạ'); });
    expect(rows[0]).toMatchObject({ level: 40, evt: 'bizcity.mst.timeout', msg: 'tra MST hết giờ' });
    expect(rows[1]).toMatchObject({ level: 50, evt: 'bizcity.error', err: { type: 'string', message: 'chuỗi lạ' } });
  });

  it('log.error({ err }) viết tay cũng có errFp (mixin); warn không gắn', async () => {
    const e = fromA('x');
    const rows = await withAppLog((log) => { log.error({ err: e }, 'lỗi'); log.warn({ err: e }, 'đã lùi'); });
    expect(rows[0]!.errFp).toBe(errFp(e));
    expect(rows[1]!.errFp).toBeUndefined();
  });

  it('lỗi Postgres: giữ mã, bảng, ràng buộc; KHÔNG giữ detail / where (chứa giá trị — R-LOG-4)', () => {
    const pg = Object.assign(new Error('duplicate key value violates unique constraint "uq_partner_tax"'), {
      code: '23505', severity: 'ERROR', table: 'partners', constraint: 'uq_partner_tax', routine: '_bt_check_unique',
      detail: 'Key (tax_code)=(0101234567) already exists.', where: 'SQL statement "INSERT …"',
    });
    const s = serializeError(pg);
    expect(s).toMatchObject({ code: '23505', severity: 'ERROR', table: 'partners', constraint: 'uq_partner_tax', routine: '_bt_check_unique' });
    expect(JSON.stringify(s)).not.toContain('0101234567');
    expect(s).not.toHaveProperty('detail');
    expect(s).not.toHaveProperty('where');
  });
});

describe('redact — lưới an toàn che dữ liệu (R-LOG-4)', () => {
  const SECRET = 'GIA-TRI-BI-MAT-0101234567';
  const fields = ['password', 'passwd', 'token', 'accessToken', 'refreshToken', 'apiKey', 'secret', 'authorization', 'cookie',
    'body', 'payload', 'taxCode', 'mst', 'phone', 'email', 'bankAccount', 'accountNumber', 'idNumber', 'cccd'];

  it.each(fields)('%s: ở gốc và lồng một lớp đều thành ***', async (k) => {
    const [row] = await withAppLog((log) => log.warn({ [k]: SECRET, user: { [k]: SECRET }, keep: 'PN0001' }, 'thử che'));
    expect(JSON.stringify(row)).not.toContain(SECRET);
    expect(row).toMatchObject({ [k]: '***', user: { [k]: '***' }, keep: 'PN0001' });
  });

  it('header nhạy cảm của yêu cầu / trả lời; danh sách có đủ các trường trên', async () => {
    const [row] = await withAppLog((log) => log.warn({
      req: { headers: { authorization: `Bearer ${SECRET}`, cookie: SECRET, 'x-api-key': SECRET, host: 'ketoan.local' } },
      res: { headers: { 'set-cookie': SECRET } },
    }, 'header'));
    // serializer req / res mặc định của Fastify đã bỏ header; redact là lớp thứ hai khi ai đó đổi serializer
    expect(JSON.stringify(row)).not.toContain(SECRET);
    expect(REDACT_PATHS).toEqual(expect.arrayContaining(['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-api-key"]', 'res.headers["set-cookie"]']));
    for (const k of fields) expect(REDACT_PATHS).toContain(`*.${k}`);
  });
});

// [2026-11-22 07:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — B6 (S038-16, D038-7): một ngày một tệp, giữ 30 ngày, trần thư mục
describe('DailyFile — nhật ký theo ngày (D038-7)', () => {
  const NGAY = 24 * 3_600_000;
  const t0 = Date.UTC(2026, 10, 22, 2, 0, 0); // 09:00 giờ VN 22/11/2026
  const ten = (d: string) => readdirSync(d).sort();
  const NL = '\n';

  it('ngày theo giờ Việt Nam: 17:00 UTC đã là ngày hôm sau', () => {
    expect(ngayVN(Date.UTC(2026, 10, 21, 16, 59))).toBe('2026-11-21');
    expect(ngayVN(Date.UTC(2026, 10, 21, 17, 0))).toBe('2026-11-22');
  });

  it('sang ngày mới thì tệp mới; một ngày quá trần một tệp thì tách <ngày>.1.log', () => {
    let t = t0;
    const f = new DailyFile(path.join(dir, 'api'), { tep: 100, thuMuc: 10_000 }, 30, () => t);
    f.write('a'.repeat(60) + NL);
    f.write('b'.repeat(60) + NL); // dòng 2 vượt 100 byte → phần .1
    t += NGAY;
    f.write('c' + NL);
    expect(ten(path.join(dir, 'api'))).toEqual(['2026-11-22.1.log', '2026-11-22.log', '2026-11-23.log']);
  });

  it('khởi động lại giữa ngày: nối tiếp phần cuối của hôm đó, không ghi đè', () => {
    const d = path.join(dir, 'api');
    const a = new DailyFile(d, { tep: 100, thuMuc: 10_000 }, 30, () => t0);
    a.write('x'.repeat(60) + NL);
    a.write('y'.repeat(60) + NL);
    const b = new DailyFile(d, { tep: 100, thuMuc: 10_000 }, 30, () => t0);
    b.write('z' + NL);
    expect(readFileSync(path.join(d, '2026-11-22.1.log'), 'utf8')).toBe('y'.repeat(60) + NL + 'z' + NL);
  });

  it('giữ 30 ngày: tệp của ngày cũ hơn bị xoá khi sang ngày; tệp lạ trong thư mục không bị đụng', () => {
    const d = path.join(dir, 'web-client');
    let t = t0;
    const f = new DailyFile(d, { tep: 1_000, thuMuc: 1_000_000 }, 30, () => t);
    for (let i = 0; i < 40; i++) { f.write(`ngày ${i}${NL}`); t += NGAY; }
    writeFileSync(path.join(d, 'ghi-chu.txt'), 'không phải nhật ký');
    f.write('cuối' + NL);
    const ds = ten(d).filter((n) => n.endsWith('.log'));
    expect(ds[0]).toBe(`${ngayVN(t - 30 * NGAY)}.log`);
    expect(ds).toHaveLength(31);
    expect(ten(d)).toContain('ghi-chu.txt');
  });

  it('vượt trần thư mục: xoá tệp cũ nhất trước, không xoá tệp đang ghi', () => {
    const d = path.join(dir, 'db-migrate');
    let t = t0;
    const f = new DailyFile(d, { tep: 1_000, thuMuc: 250 }, 30, () => t);
    for (let i = 0; i < 5; i++) { f.write('x'.repeat(99) + NL); t += NGAY; }
    f.write('y' + NL);
    const tong = ten(d).reduce((n, x) => n + statSync(path.join(d, x)).size, 0);
    expect(tong).toBeLessThanOrEqual(250);
    expect(ten(d).at(-1)).toBe(`${ngayVN(t)}.log`);
    expect(ten(d)).not.toContain('2026-11-22.log');
  });

  it('tệp kiểu cũ ở gốc logs/ (trước D038-7): quá 30 ngày thì xoá, còn mới thì giữ', () => {
    for (const n of ['api-loi.log', 'api-loi.log.1', 'web-loi.log', 'db-migrate.log', 'giu-nguyen.log']) writeFileSync(path.join(dir, n), 'cũ');
    const sau = Date.now() + 31 * NGAY;
    expect(donTepKieuCu(dir, Date.now())).toEqual([]);
    expect(donTepKieuCu(dir, sau).sort()).toEqual(['api-loi.log', 'api-loi.log.1', 'db-migrate.log', 'web-loi.log']);
    expect(ten(dir)).toEqual(['giu-nguyen.log']);
  });
});

describe('serializeError', () => {
  it('giữ chuỗi nguyên nhân (cause), mã lỗi, loại', () => {
    const e = new Error('Migration lỗi', { cause: Object.assign(new Error('duplicate column'), { code: '42701' }) });
    expect(serializeError(e)).toMatchObject({ type: 'Error', message: 'Migration lỗi', cause: { message: 'duplicate column', code: '42701' } });
    expect(serializeError('chuỗi')).toEqual({ type: 'string', message: 'chuỗi' });
  });
});
