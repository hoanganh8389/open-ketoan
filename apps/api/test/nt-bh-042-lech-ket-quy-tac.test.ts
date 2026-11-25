/**
 * NT-BH-042 — tài khoản chênh lệch két khai ở Quy tắc hạch toán (ACC41), BH17 chỉ xem (chữ chốt docs/nghiem-thu/ban-hang/NT-BH-042-lech-ket-quy-tac-hach-toan.md).
 *   Core: migration 0185 thêm POS-THIEU-KET (Nợ 1381 / Có 1111) và POS-THUA-KET (Nợ 1111 / Có 3381) cho đơn vị đang có — không đè lý do đã khai,
 *   không thêm khi tài khoản không phải TK chi tiết đang dùng; ACC41 nghiệp vụ "Chênh lệch két máy bán" (pos_cash_diff) đọc / đổi cặp Nợ / Có của lý do
 *   (PUT /api/v1/posting/scheme/reasons/:code — TK chi tiết, phạm vi 138 / 334 / 632 / 811 – 111 và 111 – 338 / 711, quyền settings:write).
 *   Module pos không đổi máy chủ: manual_journal theo reasonCode; bút toán của đơn vị cũ trước / sau nâng cấp như nhau.
 * Migration chạy trong test bằng chính tệp SQL, giới hạn vào đơn vị của test (các tệp test khác không bị thêm lý do).
 * Hệ thống tài khoản mẫu: 1388 là TK tổng hợp → "đơn vị tự đổi" dùng TK chi tiết 13881 thay cho 1388 của phiếu.
 */
// [2026-11-25 11:30 PM Võ Hoàng] NGHIEM-THU — test tích hợp phiếu NT-BH-042 (đóng góp)
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runModuleMigrations } from '@bizcity/platform/db/module-db';
import { buildApp } from '../src/app.js';
import { syncBundled } from '../src/core/module-lifecycle.js';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

const DIR = fileURLToPath(new URL('../../../modules/pos/', import.meta.url));
const HAS = existsSync(path.join(DIR, 'bizcity.module.json'));
const MIG_FILE = '0185_ly_do_chenh_lech_ket.sql';
const MIG = readFileSync(fileURLToPath(new URL(`../../../db/migrations/${MIG_FILE}`, import.meta.url)), 'utf8');
const M = '/api/v1/m/pos';
const READS = ['bizcity_read.branches', 'bizcity_read.products', 'bizcity_read.tax_codes', 'bizcity_read.payment_methods', 'bizcity_read.partners',
  'bizcity_read.branch_prices', 'bizcity_read.stock_on_hand', 'bizcity_read.warehouses'];

type Reason = { code: string; exists: boolean; debitAccount: string | null; creditAccount: string | null; debitStatus: string; creditStatus: string; debitRange: string[]; creditRange: string[] };

/** Một đơn vị thử: đăng nhập, bật ghi sổ ngay phiếu kế toán, đối tượng chi nhánh CN-CN01. */
async function unit(app: () => FastifyInstance) {
  const ctx = await setupTenant();
  const tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:nt-bh-042', trx as never); });
  const modes = (await call(ctx, 'GET', '/api/v1/settings/posting-modes')).body.data;
  expect((await call(ctx, 'PUT', '/api/v1/settings/posting-modes', { ...modes, manual_journal: 'auto' })).status).toBe(200);
  expect((await call(ctx, 'POST', '/api/v1/partners', { code: 'CN-CN01', name: 'Chi nhánh CN01' })).status).toBeLessThan(300);
  let k = 0;
  const post = (url: string, payload: unknown) => app().inject({ method: 'POST', url: `${M}${url}`, payload: payload as never,
    headers: { authorization: `Bearer ${ctx.token}`, 'idempotency-key': `nt-bh-042-${ctx.tenantCode}-${++k}` } });
  /** Mở ca với tiền đầu ca (không bán → phải có = tiền đầu ca) rồi chốt với số đếm được → biên bản. */
  const shift = async (expected: number, counted: number) => {
    const o = await post('/shifts/open', { openingCash: expected, branchCode: 'CN01' });
    expect(o.statusCode, o.body).toBe(201);
    const id = o.json().data.id as string;
    const c = await post('/shifts/close', { shiftId: id, countedCash: counted });
    expect(c.statusCode, c.body).toBe(200);
    return { id, report: c.json().data as Record<string, any>, docKey: `pos:shift:${id}:cash-diff` };
  };
  /** Bút toán của một phiếu theo tài khoản: [Nợ, Có, đối tượng]. */
  const byAccount = async (docKey: string) => {
    const rows = (await sql<{ account: string; d: string; c: string; partner: string | null }>`
      SELECT l.account_code AS account, SUM(l.debit) AS d, SUM(l.credit) AS c, max(p.code) AS partner
        FROM accounting_events a JOIN ledger_entries e ON e.event_id = a.id JOIN ledger_lines l ON l.entry_id = e.id
        LEFT JOIN partners p ON p.id = l.partner_id
       WHERE a.tenant_id = ${tenantId} AND a.doc_key = ${docKey} AND e.status = 'posted' AND NOT e.is_reversal
       GROUP BY l.account_code ORDER BY l.account_code`.execute(db)).rows;
    return Object.fromEntries(rows.map((r) => [r.account, [Number(r.d), Number(r.c), r.partner]]));
  };
  /** Chạy migration 0185 (đúng tệp SQL) cho riêng đơn vị này. */
  const migrate = () => db.transaction().execute(async (trx) => {
    await sql`SET LOCAL ROLE NONE`.execute(trx);
    await sql.raw(MIG.replace(' WHERE EXISTS', ` WHERE t.id = ${Number(tenantId)} AND EXISTS`)).execute(trx);
  });
  const reasonRow = async (code: string) => (await sql<{ kind: string; debit_account: string; credit_account: string; flags: Record<string, unknown>; name: string }>`
    SELECT kind, debit_account, credit_account, flags, name FROM posting_reasons WHERE tenant_id = ${tenantId} AND code = ${code}`.execute(db)).rows[0];
  const schemeReasons = async () => (await call(ctx, 'GET', '/api/v1/posting/scheme')).body.data.reasons as Reason[];
  const setReason = (code: string, debitAccount: string, creditAccount: string, expected?: unknown) =>
    call(ctx, 'PUT', `/api/v1/posting/scheme/reasons/${code}`, { debitAccount, creditAccount, ...(expected ? { expected } : {}) });
  return { ctx, tenantId, post, shift, byAccount, migrate, reasonRow, schemeReasons, setReason };
}

describe.skipIf(!HAS)('NT-BH-042 — tài khoản chênh lệch két ở Quy tắc hạch toán', () => {
  let app: FastifyInstance;
  let A: Awaited<ReturnType<typeof unit>>;
  const apps: FastifyInstance[] = [];

  beforeAll(async () => {
    await runModuleMigrations('pos', path.join(DIR, 'migrations'), { reads: READS });
    app = await buildApp();
    A = await unit(() => app);
    apps.push(A.ctx.app);
  });
  afterAll(async () => {
    await app?.close();
    for (const a of apps) await a.close();
  });

  it('migration 0185 đã nằm trong danh sách chạy; khung ACC41 có nghiệp vụ pos_cash_diff (manual_journal) lấy TK theo lý do', async () => {
    expect((await sql<{ name: string }>`SELECT name FROM schema_migrations WHERE name = ${MIG_FILE}`.execute(db)).rows).toHaveLength(1);
    const s = (await call(A.ctx, 'GET', '/api/v1/posting/scheme')).body.data;
    const biz = s.businesses.find((b: { code: string }) => b.code === 'pos_cash_diff');
    expect(biz).toMatchObject({ docType: 'manual_journal', name: 'Chênh lệch két máy bán' });
    expect(biz.groups.flatMap((g: { lines: { source: string; reason: string }[] }) => g.lines.map((l) => `${l.source}:${l.reason}`)))
      .toEqual(['reason:POS-THIEU-KET', 'reason:POS-THIEU-KET', 'reason:POS-THUA-KET', 'reason:POS-THUA-KET']);
    // Đơn vị tạo sau migration chưa có lý do → ACC41 / BH17 báo "Chưa khai tài khoản".
    expect((await A.schemeReasons()).map((r) => [r.code, r.exists, r.debitStatus])).toEqual([['POS-THIEU-KET', false, 'missing'], ['POS-THUA-KET', false, 'missing']]);
  });

  it('ca 1: đơn vị mới sau C2 — phải có 5.020.000, đếm 5.000.000 → Nợ 1381 (CN-CN01) / Có 1111 — 20.000, posted', async () => {
    await A.migrate();
    expect(await A.reasonRow('POS-THIEU-KET')).toMatchObject({ kind: 'journal', debit_account: '1381', credit_account: '1111', flags: { default: 'manual_journal:pos_cash_short', module: 'pos' } });
    expect(await A.reasonRow('POS-THUA-KET')).toMatchObject({ kind: 'journal', debit_account: '1111', credit_account: '3381', flags: { default: 'manual_journal:pos_cash_over', module: 'pos' } });
    expect((await A.schemeReasons()).map((r) => [r.code, r.debitAccount, r.creditAccount, r.debitStatus, r.creditStatus])).toEqual([
      ['POS-THIEU-KET', '1381', '1111', 'ok', 'ok'], ['POS-THUA-KET', '1111', '3381', 'ok', 'ok'],
    ]);
    const s = await A.shift(5_020_000, 5_000_000);
    expect(s.report).toMatchObject({ difference: -20_000, journal: { reasonCode: 'POS-THIEU-KET', amount: 20_000, status: 'posted' } });
    expect(await A.byAccount(s.docKey)).toEqual({ 1111: [0, 20_000, 'CN-CN01'], 1381: [20_000, 0, 'CN-CN01'] });
  });

  it('ca 2: phải có 3.000.000, đếm 3.015.000 → Nợ 1111 / Có 3381 (CN-CN01) — 15.000', async () => {
    const s = await A.shift(3_000_000, 3_015_000);
    expect(s.report).toMatchObject({ difference: 15_000, journal: { reasonCode: 'POS-THUA-KET', amount: 15_000, status: 'posted' } });
    expect(await A.byAccount(s.docKey)).toEqual({ 1111: [15_000, 0, 'CN-CN01'], 3381: [0, 15_000, 'CN-CN01'] });
  });

  it('ca 3: đếm đúng 2.000.000 → không phiếu, biên bản không có journal', async () => {
    const s = await A.shift(2_000_000, 2_000_000);
    expect(s.report.difference).toBe(0);
    expect(s.report.journal).toBeUndefined();
    expect(await A.byAccount(s.docKey)).toEqual({});
  });

  it('migration chạy lại vô hại: không thêm dòng, không đổi cặp', async () => {
    await A.migrate();
    const n = (await sql<{ n: string }>`SELECT count(*) AS n FROM posting_reasons WHERE tenant_id = ${A.tenantId} AND code LIKE 'POS-%-KET'`.execute(db)).rows[0]!.n;
    expect(Number(n)).toBe(2);
    expect(await A.reasonRow('POS-THIEU-KET')).toMatchObject({ debit_account: '1381', credit_account: '1111' });
  });

  it('ca 6: ACC41 chọn Nợ 138 (TK tổng hợp) / 6421, 64111 (ngoài phạm vi) / Có 3381 cho thiếu → chặn tại ô, không ghi', async () => {
    const summary = await A.setReason('POS-THIEU-KET', '138', '1111');
    expect(summary.status).toBe(400);
    expect(summary.body.error.code).toBe('VALIDATION_ERROR');
    expect(summary.body.error.message).toContain('138 là tài khoản tổng hợp');
    expect(summary.body.error.fields).toEqual([expect.objectContaining({ path: 'debitAccount' })]);
    for (const acc of ['6421', '64111']) {
      const out = await A.setReason('POS-THIEU-KET', acc, '1111');
      expect(out.status).toBe(400);
      expect(out.body.error.message).toContain(`${acc} ngoài phạm vi (138, 334, 632, 811)`);
    }
    // Hai ô sai cùng lúc: máy chủ trả cả hai lỗi một lần.
    const both = await A.setReason('POS-THIEU-KET', '6421', '3381');
    expect(both.body.error.fields.map((f: { path: string }) => f.path)).toEqual(['debitAccount', 'creditAccount']);
    expect(both.body.error.message).toContain('3381 ngoài phạm vi (111)');
    // Thừa: Có chỉ 338 / 711.
    expect((await A.setReason('POS-THUA-KET', '1111', '5111')).body.error.message).toContain('5111 ngoài phạm vi (338, 711)');
    // Lý do ngoài màn ACC41 không sửa qua đường này.
    expect((await A.setReason('XBA', '1381', '1111')).status).toBe(400);
    expect(await A.reasonRow('POS-THIEU-KET')).toMatchObject({ debit_account: '1381', credit_account: '1111' });
  });

  it('ca 5: ACC41 đổi Thiếu thành Nợ 13881 → chốt thiếu 20.000 ghi Nợ 13881 / Có 1111; BH17 đọc cặp mới; người khác sửa cùng lúc → CONFLICT', async () => {
    const r = await A.setReason('POS-THIEU-KET', '13881', '1111', { debitAccount: '1381', creditAccount: '1111' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toMatchObject({ created: false, before: { debitAccount: '1381', creditAccount: '1111' } });
    // Hộp thoại mở lúc cặp còn 1381 / 1111 → người lưu sau bị chặn, không ghi đè.
    const stale = await A.setReason('POS-THIEU-KET', '8118', '1111', { debitAccount: '1381', creditAccount: '1111' });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('CONFLICT');
    expect(stale.body.error.message).toContain('vừa được người khác đổi thành Nợ 13881 / Có 1111');
    const s = await A.shift(5_020_000, 5_000_000);
    expect(await A.byAccount(s.docKey)).toEqual({ 1111: [0, 20_000, 'CN-CN01'], 13881: [20_000, 0, 'CN-CN01'] });
    expect((await A.schemeReasons()).find((x) => x.code === 'POS-THIEU-KET')).toMatchObject({ debitAccount: '13881', creditAccount: '1111', debitStatus: 'ok' });
  });

  it('ca 9: kế toán (không settings:write) xem được cặp tài khoản ở ACC41, không sửa được (403)', async () => {
    const u = await call(A.ctx, 'POST', '/api/v1/users', { email: 'kt042@ketoan.local', fullName: 'Kế toán 042', role: 'accountant', password: 'Pass@12345' });
    expect(u.status).toBe(201);
    const login = await A.ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: A.ctx.tenantCode, email: 'kt042@ketoan.local', password: 'Pass@12345' } });
    const kt: TestCtx = { ...A.ctx, token: login.json().data.token as string };
    const seen = (await call(kt, 'GET', '/api/v1/posting/scheme')).body.data.reasons as Reason[];
    expect(seen.find((x) => x.code === 'POS-THIEU-KET')).toMatchObject({ debitAccount: '13881', creditAccount: '1111' });
    const denied = await call(kt, 'PUT', '/api/v1/posting/scheme/reasons/POS-THIEU-KET', { debitAccount: '1381', creditAccount: '1111' });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('FORBIDDEN');
  });

  it('ca 4 + trước / sau: đơn vị cũ đã khai Nợ 13881 / Có 1111 ở BH17 (API lý do cũ) — chạy C2 không đè, bút toán trước và sau nâng cấp như nhau', async () => {
    const B = await unit(() => app);
    apps.push(B.ctx.app);
    // Trước nâng cấp: BH17 cũ gọi PUT /api/v1/posting/reasons (chỉ lý do thiếu); lý do thừa chưa có.
    const old = await call(B.ctx, 'PUT', '/api/v1/posting/reasons/POS-THIEU-KET', { name: 'Thiếu tiền két chờ xử lý (máy bán POS)', kind: 'journal', debitAccount: '13881', creditAccount: '1111', isActive: true });
    expect(old.status, JSON.stringify(old.body)).toBeLessThan(300);
    const before = await B.shift(5_020_000, 5_000_000);
    const beforeLines = await B.byAccount(before.docKey);
    expect(beforeLines).toEqual({ 1111: [0, 20_000, 'CN-CN01'], 13881: [20_000, 0, 'CN-CN01'] });
    await B.migrate();
    expect(await B.reasonRow('POS-THIEU-KET')).toMatchObject({ debit_account: '13881', credit_account: '1111', name: 'Thiếu tiền két chờ xử lý (máy bán POS)' });
    expect(await B.reasonRow('POS-THUA-KET')).toMatchObject({ debit_account: '1111', credit_account: '3381' }); // mã chưa có → thêm
    const after = await B.shift(5_020_000, 5_000_000);
    expect(await B.byAccount(after.docKey)).toEqual(beforeLines);
    expect(after.report.journal).toMatchObject({ reasonCode: before.report.journal.reasonCode, amount: before.report.journal.amount, status: 'posted' });
  });

  it('ca 8: đơn vị không có TK 1381 — C2 không thêm lý do thiếu; chốt thiếu 20.000: ca vẫn chốt, "chưa lập"; khai ở ACC41 rồi Lập lại phiếu → posted', async () => {
    const C = await unit(() => app);
    apps.push(C.ctx.app);
    await sql`UPDATE accounts SET is_active = false WHERE tenant_id = ${C.tenantId} AND code = '1381'`.execute(db);
    await C.migrate();
    expect(await C.reasonRow('POS-THIEU-KET')).toBeUndefined();
    expect(await C.reasonRow('POS-THUA-KET')).toMatchObject({ debit_account: '1111', credit_account: '3381' });
    expect((await C.schemeReasons()).map((r) => [r.code, r.exists])).toEqual([['POS-THIEU-KET', false], ['POS-THUA-KET', true]]);
    const s = await C.shift(5_020_000, 5_000_000);
    expect(s.report.journal).toMatchObject({ reasonCode: 'POS-THIEU-KET', amount: 20_000, status: 'not_created' });
    expect(s.report.journal.error).toContain('POS-THIEU-KET');
    expect(await C.byAccount(s.docKey)).toEqual({});
    // Khai ở ACC41 (đơn vị chưa có mã → tạo lý do journal kèm cờ mặc định), rồi Lập lại phiếu ở Sổ ca.
    const k = await C.setReason('POS-THIEU-KET', '13881', '1111');
    expect(k.status, JSON.stringify(k.body)).toBe(200);
    expect(k.body.data).toMatchObject({ created: true, before: null });
    expect(await C.reasonRow('POS-THIEU-KET')).toMatchObject({ kind: 'journal', flags: { default: 'manual_journal:pos_cash_short', module: 'pos' } });
    const redo = await C.post(`/admin/shifts/${s.id}/journal`, {});
    expect(redo.statusCode, redo.body).toBe(200);
    expect(redo.json().data.journal).toMatchObject({ status: 'posted', amount: 20_000 });
    expect(await C.byAccount(s.docKey)).toEqual({ 1111: [0, 20_000, 'CN-CN01'], 13881: [20_000, 0, 'CN-CN01'] });
  });
});
