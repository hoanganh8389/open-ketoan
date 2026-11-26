// [2026-11-26 04:30 PM Nguyễn Văn Thủy] HT — tài khoản ở Quy tắc hạch toán thành TK tổng hợp sau khi mở TK con (1561 → 15611):
// đúng một TK con chi tiết thì ghi sổ dùng TK con; nhiều TK con thì báo chọn lại ở ACC41 (lỗi HT19 POSTING_FAILED 13 lần) (đóng góp)
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

const datDefault = async (key: string, code: string) => {
  await db.updateTable('posting_defaults').set({ account_code: code }).where('tenant_id', '=', tenantId).where('key', '=', key).execute();
};

describe('Quy tắc hạch toán trỏ vào tài khoản đã thành tổng hợp', () => {
  it('một TK con chi tiết: ghi sổ dùng TK con, không bị chặn "tài khoản tổng hợp"', async () => {
    const goc = (await db.selectFrom('posting_defaults').select('account_code').where('tenant_id', '=', tenantId).where('key', '=', 'revenue').executeTakeFirstOrThrow()).account_code;
    const con = `${goc}9`;
    await db.insertInto('accounts').values({ tenant_id: tenantId, code: con, name: 'TK con thử', parent_code: goc, is_posting: true }).execute();
    await db.updateTable('accounts').set({ is_posting: false }).where('tenant_id', '=', tenantId).where('code', '=', goc).execute();
    const r = await call(t, 'POST', '/api/v1/documents', saleDoc({ docKey: 'pos:CN01:TKCON1', docNo: 'TKCON1' }));
    expect(r.status, JSON.stringify(r.body).slice(0, 400)).toBeLessThan(300);
    const lines = await db.selectFrom('ledger_lines').select(['account_code']).where('tenant_id', '=', tenantId).execute();
    expect(lines.some((l) => l.account_code === con)).toBe(true);
    expect(lines.some((l) => l.account_code === goc)).toBe(false);
  });

  it('nhiều TK con chi tiết: không tự chọn, báo rõ chọn lại ở ACC41', async () => {
    const cha = (await db.selectFrom('accounts').select(['code']).where('tenant_id', '=', tenantId).where('is_posting', '=', false).where('code', 'like', '511%').orderBy('code').execute())
      .map((a) => a.code).find((c) => c.length === 4)!;
    expect(cha).toBeTruthy();
    await datDefault('revenue', cha);
    const r = await call(t, 'POST', '/api/v1/documents', saleDoc({ docKey: 'pos:CN01:TKCON2', docNo: 'TKCON2' }));
    expect(r.body.data).toMatchObject({ status: 'error', error: { code: 'POSTING_FAILED' } });
    expect(r.body.data.error.message).toContain('ACC41');
    expect(r.body.data.error.message).toContain(cha);
  });
});
