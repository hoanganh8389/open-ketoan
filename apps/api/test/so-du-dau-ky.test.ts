// [2026-11-26 08:20 PM Nguyễn Văn Thủy] SO-DU — phiếu số dư đầu kỳ luôn là "Số dư đầu kỳ" ở sổ / báo cáo (kể cả khi khoảng ngày chứa ngày chốt);
// kiểm khi ghi: tiền không có Dư Có, TK công nợ bắt buộc đối tượng có trong danh mục (đóng góp)
/**
 * Kiểm thử số dư đầu kỳ (ACC15):
 *  - ngày chốt 31/10, xem sổ quỹ từ 01/11: số dư nằm ở dòng đầu kỳ (như trước);
 *  - xem sổ quỹ từ 01/10 (khoảng ngày CHỨA ngày chốt): số dư vẫn ở dòng đầu kỳ, không thành dòng phát sinh; số cuối kỳ không đổi;
 *  - Bảng cân đối số phát sinh, bảng kê số dư tiền, sổ công nợ: cùng cách;
 *  - lệch chuẩn: Dư Có tiền mặt, thiếu / sai mã đối tượng ở TK công nợ → từ chối, câu lỗi nói rõ.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { suaSoDuDauKyCu } from '../src/phan-he/ke-toan/sua-so-du-cu.js';

let ctx: TestCtx;

beforeAll(async () => {
  ctx = await setupTenant();
  await call(ctx, 'PUT', '/api/v1/partners/KH-SD1', { name: 'Khách số dư 1' });
  await call(ctx, 'PUT', '/api/v1/partners/NCC-SD1', { name: 'NCC số dư 1' });
  const r = await call(ctx, 'POST', '/api/v1/opening-balances', {
    branchCode: 'CN01', docDate: '2026-10-31',
    lines: [
      { accountCode: '1111', debit: 50_000_000 },
      { accountCode: '1311', partnerCode: 'KH-SD1', debit: 12_500_000 },
      { accountCode: '33111', partnerCode: 'NCC-SD1', credit: 7_500_000 },
      { accountCode: '4211', credit: 55_000_000 },
    ],
  });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  // Một phiếu thu sau ngày chốt để có phát sinh thật.
  const t = await call(ctx, 'POST', '/api/v1/vouchers', { docType: 'receipt', branchCode: 'CN01', docDate: '2026-11-05', description: 'Thu khách', partnerCode: 'KH-SD1', lines: [{ debitAccount: '1111', creditAccount: '1311', amount: 2_000_000 }] });
  expect(t.status, JSON.stringify(t.body)).toBe(201);
});
afterAll(async () => {
  await ctx.app.close();
  await closeDb();
});

const soQuy = async (from: string, to: string) => {
  const res = await call(ctx, 'GET', `/api/v1/reports/account-ledger?account=1111&from=${from}&to=${to}&kind=cash`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data;
};

describe('Số dư đầu kỳ ở sổ quỹ (ACC76 / ACC12)', () => {
  it('xem từ ngày sau ngày chốt: số dư ở dòng đầu kỳ', async () => {
    const d = await soQuy('2026-11-01', '2026-11-30');
    expect(d.opening.debit).toBe(50_000_000);
    expect(d.rows.map((r: any) => r.docType)).not.toContain('opening');
    expect(d.rows.at(-1).balanceDebit).toBe(52_000_000);
  });
  it('khoảng ngày CHỨA ngày chốt: số dư vẫn ở dòng đầu kỳ, không thành phát sinh; cuối kỳ không đổi', async () => {
    const d = await soQuy('2026-10-01', '2026-11-30');
    expect(d.opening.debit).toBe(50_000_000);
    expect(d.rows.map((r: any) => r.docType)).not.toContain('opening');
    expect(d.rows).toHaveLength(1);
    expect(d.rows[0].balanceDebit).toBe(52_000_000);
  });
  it('khoảng ngày kết thúc TRƯỚC ngày chốt: chưa có số dư', async () => {
    const d = await soQuy('2026-09-01', '2026-09-30');
    expect(d.opening.debit).toBe(0);
    expect(d.rows).toHaveLength(0);
  });
  it('lọc riêng loại chứng từ "opening": thấy dòng số dư, đầu kỳ không cộng trùng', async () => {
    const res = await call(ctx, 'GET', '/api/v1/reports/account-ledger?account=1111&from=2026-10-01&to=2026-11-30&docType=opening');
    expect(res.status).toBe(200);
    expect(res.body.data.opening.debit).toBe(0);
    expect(res.body.data.rows).toHaveLength(1);
  });
});

describe('Số dư đầu kỳ ở báo cáo tổng hợp', () => {
  it('Bảng cân đối số phát sinh (ACC10) chứa ngày chốt: cột đầu kỳ có số dư, phát sinh không tính phiếu số dư', async () => {
    const res = await call(ctx, 'GET', '/api/v1/reports/trial-balance?from=2026-10-01&to=2026-11-30');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const row = (code: string) => res.body.data.rows.find((r: any) => r.accountCode === code || r.code === code);
    const tm = row('1111');
    expect(tm.openingDebit).toBe(50_000_000);
    expect(tm.debit).toBe(2_000_000);
    expect(tm.closingDebit).toBe(52_000_000);
    const kh = row('1311');
    expect(kh.openingDebit).toBe(12_500_000);
    expect(kh.credit).toBe(2_000_000);
    const nv = row('4211');
    expect(nv.openingCredit).toBe(55_000_000);
    expect(nv.credit).toBe(0);
  });
  it('sổ công nợ khách hàng theo đối tượng: đầu kỳ của khách = số dư đã nhập', async () => {
    const res = await call(ctx, 'GET', '/api/v1/reports/account-ledger?account=131&from=2026-10-01&to=2026-11-30&kind=partner&partnerCode=KH-SD1');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.opening.debit).toBe(12_500_000);
    expect(res.body.data.rows).toHaveLength(1);
  });
});

describe('Kiểm khi ghi phiếu số dư (lệch chuẩn)', () => {
  it('Dư Có tiền mặt → từ chối, nói rõ tiền chỉ có Dư Nợ', async () => {
    const r = await call(ctx, 'POST', '/api/v1/opening-balances', { branchCode: 'CN01', docDate: '2026-10-31', lines: [{ accountCode: '1111', credit: 1_000_000 }] });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toContain('chỉ có số dư Nợ');
  });
  it('TK công nợ thiếu mã đối tượng → từ chối', async () => {
    const r = await call(ctx, 'POST', '/api/v1/opening-balances', { branchCode: 'CN01', docDate: '2026-10-31', lines: [{ accountCode: '1311', debit: 1_000_000 }, { accountCode: '4211', credit: 1_000_000 }] });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toContain('cần Mã đối tượng');
  });
  it('mã đối tượng chưa có trong danh mục → từ chối', async () => {
    const r = await call(ctx, 'POST', '/api/v1/opening-balances', { branchCode: 'CN01', docDate: '2026-10-31', lines: [{ accountCode: '1311', partnerCode: 'KHONG-CO-XYZ', debit: 1_000_000 }, { accountCode: '4211', credit: 1_000_000 }] });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toContain('KHONG-CO-XYZ');
  });
  it('doanh thu / chi phí → từ chối (như trước)', async () => {
    const r = await call(ctx, 'POST', '/api/v1/opening-balances', { branchCode: 'CN01', docDate: '2026-10-31', lines: [{ accountCode: '5111', credit: 1_000_000 }, { accountCode: '1111', debit: 1_000_000 }] });
    expect(r.status).toBe(400);
  });

  // [2026-11-27 10:50 AM Nguyễn Văn Thủy] SO-DU — tình huống dev 27/11: chọn 1111 làm TK cân đối → tiền mặt ra Dư Có. Nay: không có TK cân đối,
  // phần lệch tự vào 999 (tự tạo); TK thật làm cân đối bị từ chối (đóng góp)
  it('phiếu chỉ có Dư Nợ tiền (không chọn TK cân đối): ghi được, phần lệch vào 999; sổ quỹ chi nhánh đó Dư Nợ, không ra Dư Có', async () => {
    await call(ctx, 'POST', '/api/v1/branches', { code: 'CN-SD2', name: 'Chi nhánh số dư 2' });
    const r = await call(ctx, 'POST', '/api/v1/opening-balances', { branchCode: 'CN-SD2', docDate: '2026-10-31', lines: [{ accountCode: '1111', debit: 1_000_000 }, { accountCode: '1111', debit: 100_000 }] });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const q = await call(ctx, 'GET', '/api/v1/reports/account-ledger?account=111&from=2026-11-01&to=2026-11-30&kind=cash&branchCodes=CN-SD2');
    expect(q.status, JSON.stringify(q.body)).toBe(200);
    expect(q.body.data.opening.debit).toBe(1_100_000);
    expect(q.body.data.opening.credit).toBe(0);
    const tb = await call(ctx, 'GET', '/api/v1/reports/trial-balance?from=2026-11-01&to=2026-11-30&branchCodes=CN-SD2');
    const r999 = tb.body.data.rows.find((x: any) => x.code === '999');
    expect(r999?.openingCredit).toBe(1_100_000);
  });
  it('gác cổng: chọn TK thật (1111, 4211) làm TK cân đối → từ chối', async () => {
    for (const bal of ['1111', '4211']) {
      const r = await call(ctx, 'POST', '/api/v1/opening-balances', { branchCode: 'CN01', docDate: '2026-10-31', balancingAccount: bal, lines: [{ accountCode: '1121', debit: 100_000 }] });
      expect(r.status).toBe(400);
      expect(JSON.stringify(r.body)).toContain('Không dùng tài khoản');
    }
  });

  // [2026-11-27 12:10 PM Nguyễn Văn Thủy] SO-DU — phiếu cũ (trước khi bỏ ô TK cân đối) ghi phần lệch vào 1111: khởi động tự sửa sang 999 (đóng góp)
  it('tự sửa phiếu cũ ghi phần lệch vào 1111 (tiền mặt Dư Có): ghi lại bản điều chỉnh, 111 hết Dư Có, phần lệch ở 999', async () => {
    await call(ctx, 'POST', '/api/v1/branches', { code: 'CN-SD3', name: 'Chi nhánh số dư 3' });
    // Phiếu cũ: Dư Nợ 1111 = 300.000, phần lệch từng ghi Có 1111 (đóng vai dữ liệu cũ — nay máy chủ không cho lập kiểu này nữa).
    const r = await call(ctx, 'POST', '/api/v1/opening-balances', { branchCode: 'CN-SD3', docDate: '2026-10-31', lines: [{ accountCode: '1111', debit: 300_000 }] });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    await sql`UPDATE accounting_events SET payload = payload || '{"balancingAccount":"1111"}'::jsonb WHERE id = ${r.body.data.id}`.execute(db);
    const tid = String((await sql<{ id: string }>`SELECT id FROM tenants WHERE code = ${ctx.tenantCode}`.execute(db)).rows[0]!.id);
    const logs: string[] = [];
    const n = await suaSoDuDauKyCu({ info: (m) => logs.push(m), warn: (m) => logs.push('WARN ' + m) }, tid);
    expect(n, logs.join(' | ')).toBeGreaterThanOrEqual(1);
    const ev = await sql<{ payload: any }>`SELECT payload FROM accounting_events WHERE id = ${r.body.data.id}`.execute(db);
    expect(ev.rows[0]!.payload.balancingAccount).toBeUndefined();
    const tb = await call(ctx, 'GET', '/api/v1/reports/trial-balance?from=2026-11-01&to=2026-11-30&branchCodes=CN-SD3');
    const row = (c: string) => tb.body.data.rows.find((x: any) => x.code === c);
    expect(row('999')?.openingCredit).toBe(300_000);
    expect(row('1111')?.openingCredit ?? 0).toBe(0);
    expect(row('1111')?.openingDebit).toBe(300_000);
    // Chạy lại: không còn gì để sửa.
    expect(await suaSoDuDauKyCu({ info: () => {}, warn: () => {} }, tid)).toBe(0);
  });
});
