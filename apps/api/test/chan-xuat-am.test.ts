// [2026-11-27 kiennt] NT-KHO-003 — chặn xuất quá số tồn ở phiếu chuyển kho lập trong kế toán (KHO01), theo công tắc bizcity.kho.negative_stock (đóng góp)
/**
 * Công tắc `bizcity.kho.negative_stock` (HT13): allow_warn (mặc định — như cũ, chỉ màn hỏi lại) · block (máy chủ từ chối KHO_STOCK_SHORT).
 * Kiểm tại ngày phiếu, cộng theo mã, kho xuất của phiếu, không tính chính phiếu đang sửa; Ghi nháp không trừ tồn nên không kiểm.
 * Số liệu theo phiếu NT-KHO-003: CN-A kho KA-1 nhập 100 (01/11) + 20 (08/11), KA-2 nhập 30 (03/11).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const KEY = 'bizcity.kho.negative_stock';
const ok = (r: { status: number; body: unknown }) => expect([200, 201], JSON.stringify(r.body)).toContain(r.status);
const line = (lineKey: string, sku: string, qty: number) => ({ lineKey, sku, name: `Hàng ${sku}`, unit: 'Lon', qty });
const create = (docDate: string, lines: ReturnType<typeof line>[], extra: Record<string, unknown> = {}) =>
  call<{ data: { id: string; status: string }; error: { message: string; details: unknown } }>(ctx, 'POST', '/api/v1/kho/transfers', { docDate, fromBranchCode: 'CN-A', fromWarehouse: 'KA-1', toBranchCode: 'CN-B', toWarehouse: 'KB-1', lines, ...extra });
const nhap = (docKey: string, wh: string, docDate: string, sku: string, qty: number) => call(ctx, 'POST', '/api/v1/documents', {
  docType: 'purchase', docKey, branchCode: 'CN-A', docNo: docKey, docDate, partner: { code: 'NCC-XA', name: 'NCC thử' },
  lines: [{ lineKey: 'l1', sku, name: `Hàng ${sku}`, unit: 'Lon', qty, warehouseCode: wh, amountBeforeTax: qty * 10000, taxCode: 'V08', taxAmount: 0 }],
  totals: { beforeTax: qty * 10000, tax: 0, total: qty * 10000 },
});
const congTac = (value: 'block' | 'allow_warn') => call(ctx, 'PUT', `/api/v1/settings/values/${KEY}`, { key: KEY, value, validFrom: '2026-01-01', reason: `Thử chặn xuất âm: ${value}` });

beforeAll(async () => {
  ctx = await setupTenant();
  for (const b of [{ code: 'CN-A', name: 'Chi nhánh A' }, { code: 'CN-B', name: 'Chi nhánh B' }]) await call(ctx, 'POST', '/api/v1/branches', b);
  for (const w of [{ code: 'KA-1', branchCode: 'CN-A', name: 'Kho A1', isDefault: true }, { code: 'KA-2', branchCode: 'CN-A', name: 'Kho A2' }, { code: 'KB-1', branchCode: 'CN-B', name: 'Kho B1', isDefault: true }])
    ok(await call(ctx, 'POST', '/api/v1/warehouses', w));
  for (const sku of ['HANG01', 'HANG02', 'HANG03', 'HANG04']) {
    ok(await nhap(`NM-${sku}-1`, 'KA-1', '2026-11-01', sku, 100));
    ok(await nhap(`NM-${sku}-2`, 'KA-1', '2026-11-08', sku, 20));
    ok(await nhap(`NM-${sku}-3`, 'KA-2', '2026-11-03', sku, 30));
  }
});
afterAll(async () => { await ctx.app.close(); });

describe('NT-KHO-003 — KHO01 chặn xuất quá số tồn', () => {
  it('mặc định (allow_warn): chuyển 130 > tồn 120 vẫn ghi được như cũ', async () => {
    const r = await create('2026-11-10', [line('a', 'HANG02', 130)]);
    ok(r);
    expect(r.body.data.status).toBe('shipped');
  });

  it('bật chặn (block): chuyển 130 > tồn KA-1 ngày 10/11 = 120 → KHO_STOCK_SHORT, báo mã · cần · tồn', async () => {
    ok(await congTac('block'));
    const r = await create('2026-11-10', [line('a', 'HANG01', 130)]);
    expect(r.status, JSON.stringify(r.body)).toBe(400);
    expect(r.body.error.details).toMatchObject({ reason: 'KHO_STOCK_SHORT', items: [{ sku: 'HANG01', need: 130, have: 120 }] });
    expect(r.body.error.message).toContain('HANG01 cần 130, tồn 120 ở KA-1 ngày 10/11/2026');
  });

  it('bật chặn: chuyển đúng 120 → ghi được', async () => {
    const r = await create('2026-11-10', [line('a', 'HANG01', 120)]);
    ok(r);
    expect(r.body.data.status).toBe('shipped');
  });

  it('hai dòng cùng mã (60 + 70) cộng theo mã: 130 > 120 → chặn', async () => {
    const r = await create('2026-11-10', [line('a', 'HANG03', 60), line('b', 'HANG03', 70)]);
    expect(r.status, JSON.stringify(r.body)).toBe(400);
    expect(r.body.error.details).toMatchObject({ reason: 'KHO_STOCK_SHORT', items: [{ sku: 'HANG03', need: 130, have: 120 }] });
  });

  it('tồn theo ngày phiếu: ngày 05/11 KA-1 mới có 100 → chuyển 110 bị chặn', async () => {
    const r = await create('2026-11-05', [line('a', 'HANG04', 110)]);
    expect(r.status, JSON.stringify(r.body)).toBe(400);
    expect(r.body.error.details).toMatchObject({ items: [{ sku: 'HANG04', need: 110, have: 100 }] });
  });

  it('Ghi nháp vượt tồn vẫn ghi được (chưa trừ tồn); Duyệt xuất phiếu nháp thì bị chặn', async () => {
    const d = await create('2026-11-10', [line('a', 'HANG03', 150)], { mode: 'draft' });
    ok(d);
    expect(d.body.data.status).toBe('draft');
    const s = await call(ctx, 'POST', `/api/v1/kho/transfers/${d.body.data.id}/ship`, {});
    expect(s.status, JSON.stringify(s.body)).toBe(400);
    expect(s.body.error.details).toMatchObject({ reason: 'KHO_STOCK_SHORT' });
  });

  it('tắt chặn (allow_warn) → chuyển vượt tồn ghi được trở lại', async () => {
    ok(await congTac('allow_warn'));
    ok(await create('2026-11-10', [line('a', 'HANG04', 125)]));
  });
});
