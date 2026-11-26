/**
 * NT-BH-042 — lý do phiếu kế toán (journal) cho đơn vị tạo mới và "Quay về dữ liệu gốc" bộ Lý do:
 *   - đơn vị mới (gói nền vn-tt99-nen) có sẵn POS-THIEU-KET (Nợ 1381 / Có 1111) và POS-THUA-KET (Nợ 1111 / Có 3381);
 *   - khôi phục đọc cặp Nợ / Có của lý do journal (không vi phạm posting_reasons_journal_accounts_check), giữ cặp đơn vị đã đổi ở ACC41,
 *     thêm lại lý do đã xoá theo cặp của tệp gốc; không xoá lý do gói nền có.
 */
// [2026-11-26 01:00 AM Võ Hoàng] NGHIEM-THU — test NT-BH-042: lý do journal ở gói nền + khôi phục dữ liệu gốc (đóng góp)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

const PACK = JSON.parse(readFileSync(fileURLToPath(new URL('../../../db/packs/vn-tt99-nen.posting-pack.json', import.meta.url)), 'utf8')) as { reasons: { code: string }[] };

describe('NT-BH-042 — lý do journal: gói nền + khôi phục dữ liệu gốc', () => {
  let ctx: TestCtx;
  let tenantId = '';
  const restore = async () => {
    const url = '/api/v1/default-data/reasons/restore';
    const p = await call(ctx, 'POST', `${url}?dryRun=1`, { confirm: true });
    expect(p.status, JSON.stringify(p.body)).toBe(200);
    return call(ctx, 'POST', url, { confirm: true, password: 'Thuy!@#', previewToken: p.body.meta.previewToken });
  };
  const row = async (code: string) => (await sql<{ kind: string; debit_account: string | null; credit_account: string | null; flags: Record<string, unknown>; is_active: boolean }>`
    SELECT kind, debit_account, credit_account, flags, is_active FROM posting_reasons WHERE tenant_id = ${tenantId} AND code = ${code}`.execute(db)).rows[0];

  beforeAll(async () => {
    ctx = await setupTenant();
    tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  });
  afterAll(async () => { await ctx?.app.close(); });

  it('đơn vị mới có sẵn hai lý do chênh lệch két (gói nền); ACC41 / BH17 thấy "Đã khai"', async () => {
    expect(await row('POS-THIEU-KET')).toMatchObject({ kind: 'journal', debit_account: '1381', credit_account: '1111', flags: { default: 'manual_journal:pos_cash_short' }, is_active: true });
    expect(await row('POS-THUA-KET')).toMatchObject({ kind: 'journal', debit_account: '1111', credit_account: '3381', flags: { default: 'manual_journal:pos_cash_over' }, is_active: true });
    const reasons = (await call(ctx, 'GET', '/api/v1/posting/scheme')).body.data.reasons as { code: string; exists: boolean; debitStatus: string; creditStatus: string }[];
    expect(reasons.map((r) => [r.code, r.exists, r.debitStatus, r.creditStatus])).toEqual([['POS-THIEU-KET', true, 'ok', 'ok'], ['POS-THUA-KET', true, 'ok', 'ok']]);
  });

  it('khôi phục bộ Lý do giữ cặp tài khoản đơn vị đã đổi ở ACC41; chạy lại không còn gì để cập nhật; mã của gói nền còn đủ', async () => {
    const set = await call(ctx, 'PUT', '/api/v1/posting/scheme/reasons/POS-THIEU-KET', { debitAccount: '13881', creditAccount: '1111' });
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    const r1 = await restore();
    expect(r1.status, JSON.stringify(r1.body)).toBe(200);
    expect(await row('POS-THIEU-KET')).toMatchObject({ kind: 'journal', debit_account: '13881', credit_account: '1111', flags: { default: 'manual_journal:pos_cash_short', module: 'pos' } });
    expect(await row('POS-THUA-KET')).toMatchObject({ kind: 'journal', debit_account: '1111', credit_account: '3381' });
    expect((await restore()).body.data.updated).toBe(0);
    const have = new Set((await sql<{ code: string }>`SELECT code FROM posting_reasons WHERE tenant_id = ${tenantId} AND is_active`.execute(db)).rows.map((x) => x.code));
    for (const r of PACK.reasons) expect(have.has(r.code), r.code).toBe(true);
  });

  it('lý do journal đã xoá (chưa dùng) → khôi phục thêm lại theo cặp của tệp gốc, không lỗi ràng buộc cặp Nợ / Có', async () => {
    await sql`DELETE FROM posting_reasons WHERE tenant_id = ${tenantId} AND code = 'POS-THUA-KET'`.execute(db);
    const r = await restore();
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.added).toBeGreaterThanOrEqual(1);
    expect(await row('POS-THUA-KET')).toMatchObject({ kind: 'journal', debit_account: '1111', credit_account: '3381', is_active: true });
  });
});
