// [2026-11-22 05:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — B4b (S038-13, D038-5, R-LOG-10): lỗi giao diện về logs/web-client.log — che dữ liệu ở cả hai đầu, giới hạn nhịp, khuôn chặt
/**
 * Kiểm:
 *   - cheThongBao che email, số ≥ 6 chữ số (SĐT, MST, số tài khoản), mã định danh, chuỗi dài; giữ thông báo lập trình bình thường;
 *   - khungCuaWeb chỉ giữ khung của mã web (/assets/, /src/), bỏ tên miền, tham số truy vấn, tiện ích trình duyệt, node_modules;
 *   - goiLoiTrinhDuyet làm sạch màn (không chuỗi truy vấn, đoạn có số → :x);
 *   - route: một dòng vào web-client.log có service web / commit / errFp / cid; máy chủ che lại dù bên gửi không che; trường lạ
 *     bị từ chối; quá 10 lỗi / phút / phiên → 429; cùng lỗi → cùng errFp.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { boQuaLoiTrinhDuyet, cheThongBao, goiLoiTrinhDuyet, khungCuaWeb } from '@ketoan/contracts';
import { _datLaiNhipLoiTrinhDuyet } from '../src/modules/system/client-errors.routes.js';
import { setupTenant, type TestCtx } from './helpers.js';

describe('che dữ liệu trong thông báo lỗi', () => {
  it.each([
    ['Không tìm thấy khách nguyen.van.a@congty.vn', 'Không tìm thấy khách <email>'],
    ['SĐT 0912 345 678 không hợp lệ', 'SĐT <số> không hợp lệ'],
    ['MST 0101234567-001 trùng', 'MST <số> trùng'],
    ['tài khoản 19036789012345', 'tài khoản <số>'],
    ['id 3fa85f64-5717-4562-b3fc-2c963f66afa6', 'id <id>'],
    ['token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9xyz', 'token <chuỗi>'],
    ["Cannot read properties of undefined (reading 'map')", "Cannot read properties of undefined (reading 'map')"],
    ['dòng 12 cột 345', 'dòng 12 cột 345'],
  ])('%s', (vao, ra) => { expect(cheThongBao(vao)).toBe(ra); });

  it('cắt 200 ký tự, gộp khoảng trắng', () => {
    expect(cheThongBao(`a  \n b ${'xy '.repeat(150)}`)).toHaveLength(200); // không phải một chuỗi liền (chuỗi liền ≥ 32 ký tự bị che)
    expect(cheThongBao('a  \n b')).toBe('a b');
  });
});

describe('khung stack của mã web', () => {
  it('giữ /assets/ và /src/, bỏ tên miền / tham số / tiện ích / node_modules; tối đa 5', () => {
    const stack = [
      "TypeError: Cannot read properties of undefined (reading 'map')",
      '    at Bang (https://ketoan.btnet.vn/assets/index-Bx12ab.js:1:23456)',
      '    at chrome-extension://abc/inject.js:3:1',
      '    at http://localhost:5173/src/features/vouchers/CashVouchersPage.tsx?t=1700000:120:15',
      '    at http://localhost:5173/node_modules/.vite/deps/react-dom.js:1:2',
      '    at renderWithHooks (https://ketoan.btnet.vn/assets/vendor-9z.js:2:777)',
    ].join('\n');
    expect(khungCuaWeb(stack)).toEqual(['assets/index-Bx12ab.js:1:23456', 'src/features/vouchers/CashVouchersPage.tsx:120:15', 'assets/vendor-9z.js:2:777']);
    expect(khungCuaWeb(Array.from({ length: 9 }, (_, i) => `at /assets/a.js:${i}:1`).join('\n'))).toHaveLength(5);
  });

  it('đóng gói: màn không chuỗi truy vấn, đoạn có số → :x; lỗi không phải Error vẫn gói được', () => {
    const e = goiLoiTrinhDuyet(new RangeError('x'), 'render', '/chung-tu/PT00123?khach=0912345678', 'abcdef12');
    expect(e).toMatchObject({ kind: 'render', type: 'RangeError', screen: '/chung-tu/:x', cid: 'abcdef12' });
    expect(goiLoiTrinhDuyet({ a: 1 }, 'promise', '/', 'abcdef12')).toMatchObject({ type: 'object', message: '{"a":1}' });
    const vong: Record<string, unknown> = {}; vong.v = vong;
    expect(goiLoiTrinhDuyet(vong, 'promise', '/', 'abcdef12').message).toBe('[object Object]');
  });

  it('bỏ qua tiếng ồn của trình duyệt', () => {
    expect(boQuaLoiTrinhDuyet({ type: 'Error', message: 'Script error.' })).toBe(true);
    expect(boQuaLoiTrinhDuyet({ type: 'Error', message: 'ResizeObserver loop completed with undelivered notifications.' })).toBe(true);
    expect(boQuaLoiTrinhDuyet({ type: 'AbortError', message: 'aborted' })).toBe(true);
    expect(boQuaLoiTrinhDuyet({ type: 'TypeError', message: 'x is undefined' })).toBe(false);
  });
});

describe('POST /api/v1/system/client-errors', () => {
  let ctx: TestCtx;
  let dir: string;
  const prevDir = process.env.LOG_DIR;
  const prevSha = process.env.BIZCITY_GIT_SHA;
  const dong = () => readFileSync(path.join(dir, 'web-client.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);
  const gui = (b: Record<string, unknown>) => ctx.app.inject({ method: 'POST', url: '/api/v1/system/client-errors', payload: b });
  const mau = (o: Record<string, unknown> = {}) => ({
    kind: 'render', type: 'TypeError', message: "Cannot read properties of undefined (reading 'map')",
    frames: ['assets/index-Bx12ab.js:1:23456'], screen: '/bao-cao/so-cai', cid: 'abcdef123456', sid: '0011223344556677', ...o,
  });

  beforeAll(async () => {
    ctx = await setupTenant();
    dir = mkdtempSync(path.join(tmpdir(), 'web-client-'));
    process.env.LOG_DIR = dir;
    process.env.BIZCITY_GIT_SHA = 'abcdef0123456789abcdef0123456789abcdef01';
  });
  afterAll(async () => {
    if (prevDir === undefined) delete process.env.LOG_DIR; else process.env.LOG_DIR = prevDir;
    if (prevSha === undefined) delete process.env.BIZCITY_GIT_SHA; else process.env.BIZCITY_GIT_SHA = prevSha;
    rmSync(dir, { recursive: true, force: true });
    await ctx.app.close();
  });
  beforeEach(() => { _datLaiNhipLoiTrinhDuyet(); });

  it('công khai (không cần đăng nhập): một dòng web-client.log có service web, commit, errFp, cid; trả errFp', async () => {
    const r = await gui(mau());
    expect(r.statusCode).toBe(200);
    const errFp = (r.json() as { data: { errFp: string } }).data.errFp;
    expect(errFp).toMatch(/^[0-9a-f]{12}$/);
    const [l] = dong().slice(-1);
    expect(l).toMatchObject({ level: 50, service: 'web', commit: 'abcdef012345', evt: 'bizcity.web.client_error', errFp, kind: 'render', type: 'TypeError', cid: 'abcdef123456', screen: '/bao-cao/so-cai', frames: ['assets/index-Bx12ab.js:1:23456'] });
    expect(l).not.toHaveProperty('sid');
    // cùng loại + khung → cùng dấu, dù thông báo khác
    const r2 = await gui(mau({ message: 'khác', cid: 'ffffffff0000' }));
    expect((r2.json() as { data: { errFp: string } }).data.errFp).toBe(errFp);
  });

  it('máy chủ che lại dù bên gửi không che: email, SĐT, khung lạ, màn có số / truy vấn', async () => {
    await gui(mau({
      message: 'khách a@b.vn sđt 0912345678', screen: '/chung-tu/PT00123?mst=0101234567',
      frames: ['assets/a.js:1:2', 'https://evil.example/x.js:1:1', 'chrome-extension://z/p.js:1:1'],
    }));
    const l = dong().slice(-1)[0]!;
    const s = JSON.stringify(l);
    expect(s).not.toMatch(/a@b\.vn|0912345678|0101234567|evil|chrome-extension/);
    expect(l).toMatchObject({ message: 'khách <email> sđt <số>', screen: '/chung-tu/:x', frames: ['assets/a.js:1:2'] });
  });

  it('khuôn chặt: thiếu / sai trường, trường lạ (dữ liệu nhập) → 400, không ghi', async () => {
    const truoc = dong().length;
    expect((await gui(mau({ cid: 'không-hex' }))).statusCode).toBe(400);
    expect((await gui(mau({ formData: { khach: 'Nguyễn Văn A' } }))).statusCode).toBe(400);
    expect((await gui({ kind: 'render' })).statusCode).toBe(400);
    expect(dong().length).toBe(truoc);
  });

  it('quá 10 lỗi / phút / phiên → 429, phiên khác vẫn gửi được', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await gui(mau({ cid: `aaaa${String(i).padStart(4, '0')}` }))).statusCode);
    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(codes[10]).toBe(429);
    expect((await gui(mau({ sid: '9999999999999999' }))).statusCode).toBe(200);
  });
});
