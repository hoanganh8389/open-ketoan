// [2026-11-28 Võ Hoàng] NGHIEM-THU — NT-BH-054: sổ quỹ két cửa hàng (máy bán) đọc sổ cái TK 111 của chi nhánh (đóng góp)
/**
 * NT-BH-054 — GET /api/v1/cash-fund?branchCode=&from=&to=: tồn đầu (trước từ ngày), từng ngày doanh thu tiền mặt / hoàn tiền /
 * chuyển tiền / thu chi khác / tồn cuối; lịch sử quỹ chỉ gồm chứng từ không phải đơn bán, phiếu trả. Chuyển khoản không vào quỹ két.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hideCost, type Phieu } from '../../../modules/xuat-dieu-chinh/api/store.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const push = async (payload: unknown) => {
  const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/documents/batch', payload: payload as never, headers: { 'x-api-key': ctx.apiKey } });
  return { status: res.statusCode, body: res.json() as any };
};
const fund = async (q: string) => call(ctx, 'GET', `/api/v1/cash-fund?${q}`);

beforeAll(async () => {
  ctx = await setupTenant();
  await call(ctx, 'PUT', '/api/v1/products', { products: [{ sku: 'SUA01', name: 'Sữa bột 900g', unit: 'Hộp' }, { sku: 'QUA01', name: 'Quà tặng', unit: 'Cái' }] });
  const ret = {
    ...saleDoc({ docKey: 'pos:CN01:TH0001', docNo: 'TH0001', docDate: '2026-10-06', invoice: undefined }),
    docType: 'sale_return',
    lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa bột 900g', unit: 'Hộp', qty: 1, amountBeforeTax: 46296, taxCode: 'R08', taxAmount: 3704 }],
    payments: [{ methodCode: 'TM', amount: 50000 }],
    totals: { beforeTax: 46296, tax: 3704, total: 50000 },
  };
  const ct = {
    docType: 'cash_transfer', docKey: 'pos:CN01:CT0001', version: 1, branchCode: 'CN01', docNo: 'CT0001', docDate: '2026-10-07',
    description: 'CN01 nộp tiền doanh số', toBranchCode: 'CN01', fromMethodCode: 'TM', toMethodCode: 'CK', status: 'sent', totals: { total: 100000 },
  };
  const r = await push({ documents: [
    saleDoc({ docKey: 'pos:CN01:HD0000', docNo: 'HD0000', docDate: '2026-09-30', invoice: undefined }),
    saleDoc({ docKey: 'pos:CN01:HD0001', docNo: 'HD0001', invoice: undefined }),
    saleDoc({ docKey: 'pos:CN01:HD0002', docNo: 'HD0002', invoice: undefined, payments: [{ methodCode: 'CK', amount: 200000 }] }),
    ret, ct,
  ] });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  for (const d of r.body.data) expect(d.status, JSON.stringify(d)).toBe('posted');
});
afterAll(async () => {
  await ctx.app.close();
});

describe('NT-BH-054 — sổ quỹ két cửa hàng đọc sổ cái', () => {
  it('tồn đầu, từng ngày, tồn cuối: bán tiền mặt cộng, trả hàng trừ, chuyển tiền trừ; chuyển khoản không vào két', async () => {
    const r = await fund('branchCode=CN01&from=2026-10-01&to=2026-10-07');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const d = r.body.data;
    expect(d.opening).toBe(200000);
    const by = Object.fromEntries(d.book.map((x: any) => [x.date, x]));
    expect(by['2026-10-05']).toMatchObject({ opening: 200000, cashSale: 200000, cashRefund: 0, closing: 400000 });
    expect(by['2026-10-06']).toMatchObject({ cashRefund: 50000, closing: 350000 });
    expect(by['2026-10-07']).toMatchObject({ transferOut: 100000, closing: 250000 });
    expect(d.balance).toBe(250000);
    expect(d.book).toHaveLength(7);
  });

  it('lịch sử quỹ chỉ có chứng từ khác đơn bán / phiếu trả (phiếu chuyển tiền)', async () => {
    const d = (await fund('branchCode=CN01&from=2026-10-01&to=2026-10-07')).body.data;
    expect(d.entries.map((e: any) => e.docNo)).toEqual(['CT0001']);
    expect(d.entries[0]).toMatchObject({ docType: 'cash_transfer', typeLabel: 'Chuyển tiền', thu: 0, chi: 100000 });
  });

  it('chi nhánh không có → 404; từ ngày sau đến ngày → lỗi nhập', async () => {
    expect((await fund('branchCode=CN99&from=2026-10-01&to=2026-10-07')).status).toBe(404);
    expect((await fund('branchCode=CN01&from=2026-10-08&to=2026-10-01')).status).toBe(400);
  });
});

describe('NT-BH-054 — phiếu xuất điều chỉnh: người không phải kế toán không nhận giá vốn', () => {
  const p = { id: 'x', belowCost: [{ sku: 'SUA03', unitPrice: 100000, unitCost: 250000 }] } as unknown as Phieu;
  it('kế toán (documents:write) giữ nguyên; thu ngân chỉ còn mã + giá bán', () => {
    expect(hideCost(p, true).belowCost).toEqual([{ sku: 'SUA03', unitPrice: 100000, unitCost: 250000 }]);
    expect(hideCost(p, false).belowCost).toEqual([{ sku: 'SUA03', unitPrice: 100000, unitCost: null }]);
  });
});
