// [2026-11-27 kiennt] NT-KHO-008 — kiểm kê: thêm tay dòng hàng / lô không có trong sổ (lô, HSD đã hết hoặc chưa từng nhập) mà thực tế còn (đóng góp)
/**
 * Màn "+ Thêm dòng" gửi dòng bookQty = 0, newLot = true, lotNo + HSD tự khai. Ghi nhận chênh lệch → chứng từ điều chỉnh nhập thừa
 * đúng số lô + HSD đã khai (lô mới trong item_lots); "Lấy số tồn" lại không mất dòng (cờ newLot). Dữ liệu giả.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
const ok = <T>(r: { status: number; body: { data: T } }) => { expect(r.status, JSON.stringify(r.body).slice(0, 600)).toBeLessThan(300); return r.body.data; };
type Line = { lineKey: string; sku: string; lotNo: string; expDate?: string; actualExpDate?: string; bookQty: number; countedQty: number; newLot?: boolean };

/** Tồn theo lô ở CN01 / KA-1: lô → [số lượng, HSD]. */
async function lots(sku: string) {
  const r = await sql<{ lot_no: string; exp: string | null; q: string }>`
    SELECT l.lot_no, l.exp_date::text AS exp, sum(m.qty)::text AS q FROM inventory_lot_moves m JOIN item_lots l ON l.id = m.lot_id JOIN branches b ON b.id = m.branch_id
     WHERE m.tenant_id = ${tenantId} AND b.code = 'CN01' AND m.warehouse_code = 'KA-1' AND m.sku = ${sku} GROUP BY l.lot_no, l.exp_date HAVING sum(m.qty) <> 0`.execute(db);
  return Object.fromEntries(r.rows.map((x) => [x.lot_no, [Number(x.q), x.exp]]));
}

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  ok(await call(ctx, 'POST', '/api/v1/warehouses', { code: 'KA-1', branchCode: 'CN01', name: 'Kho hàng', isDefault: true }));
  // Sổ: SUA-TT lô A1 (HSD 31/03/2027) 10 hộp. Thực tế còn thêm 4 hộp lô B9 (HSD 30/06/2027) chưa từng nhập vào hệ thống.
  ok(await call(ctx, 'POST', '/api/v1/documents', {
    docType: 'purchase', docKey: 'NK-TT1', branchCode: 'CN01', docNo: 'NK-TT1', docDate: '2026-11-02', partner: { code: 'NCC-TT', name: 'NCC thêm tay' },
    lines: [{ lineKey: 'l1', sku: 'SUA-TT', name: 'Sữa thêm tay', unit: 'Hộp', qty: 10, warehouseCode: 'KA-1', lotNo: 'A1', expDate: '2027-03-31', amountBeforeTax: 100000, taxCode: 'V08', taxAmount: 0 }],
    totals: { beforeTax: 100000, tax: 0, total: 100000 },
  }));
});
afterAll(async () => { await ctx.app.close(); });

describe('NT-KHO-008 — kiểm kê: thêm tay dòng lô không có trong sổ', () => {
  it('dòng thêm tay (sổ 0, lô B9, HSD 30/06/2027, đếm 4) → ghi nhận chênh lệch nhập thừa đúng lô + HSD', async () => {
    const book = ok(await call<{ data: { lines: Line[] } }>(ctx, 'GET', '/api/v1/kho/kiem-ke/so-ton?branchCode=CN01&warehouse=KA-1&date=2026-11-30'));
    expect(book.lines.map((l) => [l.sku, l.lotNo, l.bookQty])).toEqual([['SUA-TT', 'A1', 10]]);
    const lines = [
      ...book.lines.map((l) => ({ ...l, countedQty: l.bookQty })),
      { lineKey: 'T1', sku: 'SUA-TT', name: 'Sữa thêm tay', unit: 'Hộp', lotNo: 'B9', bookQty: 0, newLot: true, countedQty: 4, expDate: '2027-06-30', actualExpDate: '2027-06-30', note: 'Thêm tay khi kiểm kê' },
    ];
    const c = ok(await call<{ data: { id: string; lines: Line[] } }>(ctx, 'POST', '/api/v1/kho/kiem-ke', { countDate: '2026-11-30', branchCode: 'CN01', warehouseCode: 'KA-1', purpose: 'Kiểm kê có hàng ngoài sổ', lines }));
    expect(c.lines.find((l) => l.lineKey === 'T1')).toMatchObject({ lotNo: 'B9', bookQty: 0, countedQty: 4, newLot: true });
    ok(await call(ctx, 'POST', `/api/v1/kho/kiem-ke/${c.id}/ghi-nhan`, {}));
    expect(await lots('SUA-TT')).toEqual({ A1: [10, '2027-03-31'], B9: [4, '2027-06-30'] });
  });
});
