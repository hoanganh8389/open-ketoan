/**
 * NT-BH-047 — BH01 Báo cáo bán hàng đủ cột (kho, nhóm hàng, số lô, hạn dùng, SL theo ĐVT nhỏ nhất) và BH02 xem theo kho.
 * Số liệu theo §4 / §5 của phiếu (docs/nghiem-thu/ban-hang/NT-BH-047-phieu-ban-bao-cao-du-cot.md).
 */
// [2026-11-26 09:20 PM Võ Hoàng] NGHIEM-THU — test tích hợp phiếu NT-BH-047 (đóng góp)
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
const DAY = '2026-11-20';
const RANGE = `from=${DAY}&to=${DAY}`;
const ok = (r: { status: number; body: unknown }) => expect([200, 201], JSON.stringify(r.body)).toContain(r.status);

type DetailRow = { docNo: string; sku: string; unit: string; qty: number; warehouseCode: string; groupCode: string; groupName: string; lotNos: string; expDate: string | null; baseQty: number; baseUnit: string };

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  ok(await call(ctx, 'POST', '/api/v1/warehouses', { code: '08004-KHH', branchCode: 'CN01', name: 'Kho hàng hoá CN01', isDefault: true }));
  expect((await call(ctx, 'PUT', '/api/v1/products', { products: [{ sku: '1001', name: 'Sữa bột 900g', unit: 'Hộp' }, { sku: '1002', name: 'Sữa nước 180ml', unit: 'Hộp' }] })).status).toBeLessThan(300);
  await sql`INSERT INTO product_units (tenant_id, sku, unit, ratio) VALUES (${tenantId}, '1001', 'Hộp', 1), (${tenantId}, '1001', 'Thùng', 12), (${tenantId}, '1002', 'Hộp', 1) ON CONFLICT DO NOTHING`.execute(db);
  await sql`INSERT INTO item_classes (tenant_id, kind, code, name) VALUES (${tenantId}, 'group', 'SB', 'Sữa bột') ON CONFLICT DO NOTHING`.execute(db);
  await sql`UPDATE products SET group_code = 'SB' WHERE tenant_id = ${tenantId} AND sku = '1001'`.execute(db);
  // Nhập theo lô (§4): 1001 lô L01 HSD 31/12/2026; 1002 lô L05 HSD 15/12/2026 (20) + L06 HSD 20/01/2027 (10).
  const pl = [
    { lineKey: 'p1', sku: '1001', name: 'Sữa bột 900g', unit: 'Hộp', qty: 24, lotNo: 'L01', expDate: '2026-12-31' },
    { lineKey: 'p2', sku: '1002', name: 'Sữa nước 180ml', unit: 'Hộp', qty: 20, lotNo: 'L05', expDate: '2026-12-15' },
    { lineKey: 'p3', sku: '1002', name: 'Sữa nước 180ml', unit: 'Hộp', qty: 10, lotNo: 'L06', expDate: '2027-01-20' },
  ].map((l) => ({ ...l, taxCode: 'V08', amountBeforeTax: l.qty * 10_000, taxAmount: 0 }));
  ok(await call(ctx, 'POST', '/api/v1/documents', {
    docType: 'purchase', docKey: 'NM-047', branchCode: 'CN01', docNo: 'NM-047', docDate: '2026-11-10', partner: { code: 'NCC047', name: 'NCC 047' },
    lines: pl, totals: { beforeTax: 540_000, tax: 0, total: 540_000 },
  }));
  // Bán (§4): 1 Thùng 1001 + 30 Hộp 1002, không ghi kho → kho mặc định.
  ok(await call(ctx, 'POST', '/api/v1/documents', {
    docType: 'sale', docKey: 'BH-047', branchCode: 'CN01', docNo: 'BH-047', docDate: DAY,
    lines: [
      { lineKey: 'l1', sku: '1001', name: 'Sữa bột 900g', unit: 'Thùng', qty: 1, taxCode: 'R08', amountBeforeTax: 1_200_000, taxAmount: 96_000 },
      { lineKey: 'l2', sku: '1002', name: 'Sữa nước 180ml', unit: 'Hộp', qty: 30, taxCode: 'R08', amountBeforeTax: 300_000, taxAmount: 24_000 },
    ],
    payments: [{ methodCode: 'TM', amount: 1_620_000 }], totals: { beforeTax: 1_500_000, tax: 120_000, total: 1_620_000 },
  }));
});
afterAll(async () => { await ctx.app.close(); });

describe('NT-BH-047 — báo cáo bán hàng đủ cột', () => {
  it('§5 BH01: kho (kho mặc định khi dòng không ghi kho), nhóm hàng, SL ĐVT nhỏ nhất (1 Thùng = 12), số lô, hạn dùng sớm nhất', async () => {
    const r = await call<{ data: { rows: DetailRow[] } }>(ctx, 'GET', `/api/v1/reports/sales-detail?${RANGE}`);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const by = Object.fromEntries(r.body.data.rows.map((x) => [x.sku, x]));
    expect(by['1001']).toMatchObject({ warehouseCode: '08004-KHH', groupCode: 'SB', groupName: 'Sữa bột', unit: 'Thùng', qty: 1, baseQty: 12, baseUnit: 'Hộp', lotNos: 'L01', expDate: '2026-12-31' });
    expect(by['1002']).toMatchObject({ warehouseCode: '08004-KHH', groupCode: '', baseQty: 30, lotNos: 'L05, L06', expDate: '2026-12-15' });
  });

  it('§5 BH02: xem theo kho — một dòng kho mặc định, tổng khớp xem theo chi nhánh', async () => {
    type S = { key: string; label: string; extra: string; saleAmount: number; tax: number };
    const wh = (await call<{ data: { rows: S[] } }>(ctx, 'GET', `/api/v1/reports/sales-summary?${RANGE}&groupBy=warehouse`)).body.data.rows;
    const br = (await call<{ data: { rows: S[] } }>(ctx, 'GET', `/api/v1/reports/sales-summary?${RANGE}&groupBy=branch`)).body.data.rows;
    expect(wh.map((x) => [x.key, x.label, x.extra])).toEqual([['08004-KHH', 'Kho hàng hoá CN01', 'CN01']]);
    expect(wh[0]!.saleAmount).toBe(br[0]!.saleAmount);
    expect(wh[0]!.saleAmount).toBe(1_500_000);
  });
});
