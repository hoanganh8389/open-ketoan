// [2026-11-28 Võ Hoàng] NGHIEM-THU — NT-BH-052: tiền từ chứng từ bán / trả hàng lên ACC51 (111) / ACC54 (112) (đóng góp)
/**
 * NT-BH-052 — GET /api/v1/cash-movements: chứng từ không phải phiếu thu chi (bán, trả hàng…) ghi tiền thẳng trong bút toán của nó
 * → đọc từ sổ cái theo TK 111 (kind=cash) / 112 (kind=bank), số ròng theo chứng từ; bốn loại phiếu tiền không lấy lại.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const push = async (payload: unknown) => {
  const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/documents/batch', payload: payload as never, headers: { 'x-api-key': ctx.apiKey } });
  return { status: res.statusCode, body: res.json() as any };
};
const list = async (kind: 'cash' | 'bank', extra = '') =>
  (await call(ctx, 'GET', `/api/v1/cash-movements?kind=${kind}&from=2026-10-01&to=2026-10-31${extra}`)).body.data as any[];

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
  const r = await push({ documents: [
    saleDoc({ docKey: 'pos:CN01:HD0001', docNo: 'HD0001' }),
    saleDoc({ docKey: 'pos:CN01:HD0002', docNo: 'HD0002', payments: [{ methodCode: 'CK', amount: 200000 }] }),
    ret,
  ] });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  for (const d of r.body.data) expect(d.status, JSON.stringify(d)).toBe('posted');
});
afterAll(async () => {
  await ctx.app.close();
});

describe('NT-BH-052 — tiền từ chứng từ bán / trả hàng ở ACC51 / ACC54', () => {
  it('kind=cash: đơn bán tiền mặt là Thu, phiếu trả hoàn tiền mặt là Chi; đơn chuyển khoản không có', async () => {
    const rows = await list('cash');
    const by = Object.fromEntries(rows.map((x) => [x.docNo, x]));
    expect(by.HD0001, JSON.stringify(rows)).toMatchObject({ docType: 'sale', thu: 200000, chi: 0 });
    expect(by.TH0001, JSON.stringify(rows)).toMatchObject({ docType: 'sale_return', thu: 0, chi: 50000 });
    expect(by.HD0002).toBeUndefined();
    expect(String(by.HD0001.accounts)).toMatch(/^111/);
  });

  it('kind=bank: đơn chuyển khoản là Tiền vào TK 112', async () => {
    const rows = await list('bank');
    expect(rows.map((x) => x.docNo)).toEqual(['HD0002']);
    expect(rows[0]).toMatchObject({ thu: 200000, chi: 0 });
    expect(String(rows[0].accounts)).toMatch(/^112/);
  });

  it('lọc chi nhánh / tìm theo số phiếu; chi nhánh không có thì rỗng', async () => {
    expect((await list('cash', '&search=TH0001')).map((x) => x.docNo)).toEqual(['TH0001']);
    expect(await list('cash', '&branchCodes=CN99')).toEqual([]);
    expect(await list('cash', '&branchCodes=-')).toEqual([]);
  });

  it('phiếu thu tiền mặt (loại receipt) không lấy lại ở đây — đã có ở danh sách chính', async () => {
    const rows = await list('cash');
    expect(rows.every((x) => !['receipt', 'payment', 'bank_receipt', 'bank_payment'].includes(x.docType))).toBe(true);
  });
});
