// [2026-11-26 05:10 PM Nguyễn Văn Thủy] HT — tài khoản ở Quy tắc hạch toán thành TK tổng hợp sau khi mở TK con (1561 → 15611, lỗi HT19
// POSTING_FAILED 13 lần): không tự chọn thay kế toán — báo rõ TK nào, ở ACC41, gợi ý TK con, kèm khoá để màn hình mở thẳng hộp sửa (đóng góp)
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/client.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let t: TestCtx;
let tenantId: string;
beforeAll(async () => {
  t = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', t.tenantCode).executeTakeFirstOrThrow()).id;
}, 120_000);
afterAll(async () => { await t.app.close(); });

describe('Quy tắc hạch toán trỏ vào tài khoản đã thành tổng hợp', () => {
  it('mở TK con làm TK ở ACC41 thành tổng hợp: chứng từ báo lỗi rõ (TK, ACC41, gợi ý TK con, khoá), không tự ghi vào TK con', async () => {
    const goc = (await db.selectFrom('posting_defaults').select('account_code').where('tenant_id', '=', tenantId).where('key', '=', 'revenue').executeTakeFirstOrThrow()).account_code;
    const con = `${goc}9`;
    await db.insertInto('accounts').values({ tenant_id: tenantId, code: con, name: 'TK con thử', parent_code: goc, is_posting: true }).execute();
    await db.updateTable('accounts').set({ is_posting: false }).where('tenant_id', '=', tenantId).where('code', '=', goc).execute();
    const r = await call(t, 'POST', '/api/v1/documents', saleDoc({ docKey: 'pos:CN01:TKCON1', docNo: 'TKCON1' }));
    expect(r.body.data).toMatchObject({ status: 'error', error: { code: 'POSTING_FAILED' } });
    const msg: string = r.body.data.error.message;
    for (const s of ['ACC41', goc, 'tài khoản tổng hợp', con, 'khoá "revenue"']) expect(msg).toContain(s);
    const lines = await db.selectFrom('ledger_lines').select(['account_code']).where('tenant_id', '=', tenantId).execute();
    expect(lines.some((l) => l.account_code === con)).toBe(false);
  });

  it('đổi ACC41 sang TK chi tiết thì ghi sổ bình thường', async () => {
    const goc = (await db.selectFrom('posting_defaults').select('account_code').where('tenant_id', '=', tenantId).where('key', '=', 'revenue').executeTakeFirstOrThrow()).account_code;
    await db.updateTable('posting_defaults').set({ account_code: `${goc}9` }).where('tenant_id', '=', tenantId).where('key', '=', 'revenue').execute();
    const r = await call(t, 'POST', '/api/v1/documents', saleDoc({ docKey: 'pos:CN01:TKCON2', docNo: 'TKCON2' }));
    expect(r.body.data.status, JSON.stringify(r.body).slice(0, 300)).not.toBe('error');
    const lines = await db.selectFrom('ledger_lines').select(['account_code']).where('tenant_id', '=', tenantId).execute();
    expect(lines.some((l) => l.account_code === `${goc}9`)).toBe(true);
  });
});
