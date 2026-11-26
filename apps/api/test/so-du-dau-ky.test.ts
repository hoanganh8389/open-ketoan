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
    const r = await call(ctx, 'POST', '/api/v1/opening-balances', { branchCode: 'CN01', docDate: '2026-10-31', balancingAccount: '4211', lines: [{ accountCode: '1111', credit: 1_000_000 }] });
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
});
