/**
 * NT-BH-044 — BH06 Phiếu xuất điều chỉnh lập ở kế toán (module xuat-dieu-chinh, chốt 26/11/2026).
 * Dữ liệu theo §7 của phiếu: cửa hàng CH02 (kho bán CH02-K1 mặc định, kho quà CH02-KKM), CH03 (kho CH03-K1). Mã SUA01 (hộp, thùng = 24 hộp):
 * lô L01 HSD 30/06/2027 tồn 10, lô L02 HSD 31/12/2027 tồn 5 ở CH02-K1; SUA02 cùng lô (ca 25, tách để không lẫn tồn); SUA03 cho phiếu có giá;
 * QUA01 tồn 3 ở CH02-KKM. Lý do XSD1 (DUNG-BH), XHH01 (HUY) có mục đích; XTEST (kind out, chưa có mục đích) bị chặn. Kỳ 10/2026 khoá ở ca 11.
 * Mỗi ca ghi đúng mã lỗi chặn của bản đồ lỗi PhieuXuatForm.failure-map.json.
 */
// [2026-11-26 03:10 PM Võ Hoàng] NGHIEM-THU — test tích hợp phiếu NT-BH-044 (đóng góp)
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runModuleMigrations } from '@bizcity/platform/db/module-db';
import { buildApp } from '../src/app.js';
import { syncBundled } from '../src/core/module-lifecycle.js';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';
import { khaiGia } from './pos-nhap-ton.js';

const DIR = fileURLToPath(new URL('../../../modules/xuat-dieu-chinh/', import.meta.url));
const HAS = existsSync(path.join(DIR, 'bizcity.module.json'));
const READS = ['bizcity_read.branches', 'bizcity_read.warehouses', 'bizcity_read.products', 'bizcity_read.branch_prices', 'bizcity_read.stock_on_hand',
  'bizcity_read.tax_codes', 'bizcity_read.partners', 'bizcity_read.monthly_unit_costs'];
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const M = '/api/v1/m/xuat-dieu-chinh';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = { status: number; body: any };
type Phieu = { id: string; docNo: string; status: string; version: number; total: number; priced: boolean; kind: string; ledgerStatus: string | null; purposeCode: string | null; belowCost: unknown[] };

describe.skipIf(!HAS)('NT-BH-044 — BH06 Phiếu xuất điều chỉnh lập ở kế toán', () => {
  let ctx: TestCtx;
  let app: FastifyInstance;
  let tenantId = '';
  let k = 0;
  const tok: Record<string, string> = {};
  const bid: Record<string, string> = {};
  const req = async (who: string | null, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown, key?: string): Promise<R> => {
    const r = await app.inject({
      method, url, ...(payload ? { payload: payload as never } : {}),
      headers: { authorization: `Bearer ${who ? tok[who] : ctx.token}`, ...(method === 'GET' ? {} : { 'idempotency-key': key ?? `nt-bh-044-${++k}-${Date.now()}` }) },
    });
    let body: unknown = r.body;
    try { body = r.json(); } catch { /* nuot-loi: thân không phải JSON (lỗi khung) — giữ chuỗi để in */ }
    return { status: r.statusCode, body };
  };
  const ok = (r: R) => { expect(r.status, JSON.stringify(r.body).slice(0, 600)).toBeLessThan(300); return r.body.data; };
  const fields = (r: R) => ((r.body?.error?.fields ?? []) as { path: string }[]).map((f) => f.path);
  const stock = async (wh: string, sku: string) => Number((await sql<{ q: string | null }>`
    SELECT SUM(qty) AS q FROM bizcity_read.stock_on_hand WHERE tenant_id = ${tenantId} AND warehouse_code = ${wh} AND sku = ${sku}`.execute(db)).rows[0]?.q ?? 0);
  const lotStock = async (wh: string, sku: string, lot: string) => Number((await sql<{ q: string | null }>`
    SELECT SUM(m.qty) AS q FROM inventory_lot_moves m JOIN item_lots l ON l.id = m.lot_id
     WHERE m.tenant_id = ${tenantId} AND m.warehouse_code = ${wh} AND m.sku = ${sku} AND l.lot_no = ${lot}`.execute(db)).rows[0]?.q ?? 0);
  const event = async (id: string) => (await sql<{ doc_type: string; status: string; payload: Record<string, unknown>; total: string }>`
    SELECT doc_type, status, payload, total FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = ${`xuat-dieu-chinh:${id}`}`.execute(db)).rows[0];
  const user = async (key: string, role: string) => {
    const email = `${key}@nt044.local`;
    const u = ok(await req(null, 'POST', '/api/v1/users', { email, fullName: key, role, password: 'Nt044@12345' }));
    tok[key] = (await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email, password: 'Nt044@12345' } })).json().data.token;
    return String(u.id);
  };
  const role = async (code: string, rules: string[], baseRole: string) => {
    const r = ok(await req(null, 'POST', '/api/v1/roles', { code, label: code, kind: 'job', baseRole, reason: 'NT-BH-044' }));
    for (const permission of rules) ok(await req(null, 'POST', `/api/v1/roles/${r.id}/rules`, { permission, effect: 'allow', reason: 'NT-BH-044' }));
    return r.id;
  };
  const gan = async (u: string, body: Record<string, unknown>) => ok(await req(null, 'POST', `/api/v1/users/${u}/roles`, { reason: 'NT-BH-044', ...body }));
  /** Phiếu nhập mua có lô (ngày 01/10/2026) — dữ liệu tồn của §7. */
  const nhapLo = async (key: string, branchCode: string, warehouseCode: string, items: [sku: string, qty: number, lot?: string, exp?: string][]) => {
    const lines = items.map(([sku, qty, lotNo, expDate], i) => ({
      lineKey: `l${i + 1}`, sku, name: sku, unit: 'Hộp', qty, amountBeforeTax: qty * 200_000, taxCode: 'V08', taxAmount: qty * 16_000, warehouseCode,
      ...(lotNo ? { lotNo } : {}), ...(expDate ? { expDate } : {}),
    }));
    const beforeTax = lines.reduce((s, l) => s + l.amountBeforeTax, 0); const tax = lines.reduce((s, l) => s + l.taxAmount, 0);
    const r = await call(ctx, 'POST', '/api/v1/documents', { docType: 'purchase', docKey: key, branchCode, docNo: key, docDate: '2026-10-01',
      partner: { code: 'NCC-044', name: 'NCC test 044' }, lines, totals: { beforeTax, tax, total: beforeTax + tax } });
    expect(r.body?.data?.status, JSON.stringify(r.body)).toBe('posted');
  };
  const base = (over: Record<string, unknown> = {}) => ({
    mode: 'post', branchCode: 'CH02', warehouseCode: 'CH02-K1', docDate: TODAY, reasonCode: 'XSD1', priced: false, description: 'Xuất dùng quầy', ...over,
  });
  const save = (who: string | null, body: Record<string, unknown>, key?: string) => req(who, 'POST', `${M}/phieu`, body, key);

  beforeAll(async () => {
    ctx = await setupTenant();
    tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
    await runModuleMigrations('xuat-dieu-chinh', path.join(DIR, 'migrations'), { reads: READS });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:nt-bh-044', trx as never); });
    app = await buildApp();
    for (const b of [{ code: 'CH02', name: 'Cửa hàng 02' }, { code: 'CH03', name: 'Cửa hàng 03' }]) expect((await call(ctx, 'POST', '/api/v1/branches', b)).status).toBe(201);
    for (const b of ok(await req(null, 'GET', '/api/v1/branches'))) bid[b.code] = String(b.id);
    expect((await call(ctx, 'PUT', '/api/v1/products', { products: [
      { sku: 'SUA01', name: 'Sữa 01', unit: 'Hộp' }, { sku: 'SUA02', name: 'Sữa 02', unit: 'Hộp' }, { sku: 'SUA03', name: 'Sữa 03', unit: 'Hộp' },
      { sku: 'QUA01', name: 'Quà 01', unit: 'Cái' }, { sku: 'NGUNG01', name: 'Hàng ngừng', unit: 'Cái' },
    ] })).status).toBeLessThan(300);
    for (const s of ['SUA01', 'SUA02', 'SUA03', 'QUA01', 'NGUNG01']) expect((await call(ctx, 'PUT', `/api/v1/products/${s}`, { taxOutCode: '8' })).status).toBe(200);
    for (const [code, branchCode, name, extra] of [
      ['CH02-K1', 'CH02', 'Kho bán CH02', { isDefault: true }], ['CH02-KKM', 'CH02', 'Kho quà CH02', { isPromo: true, typeCode: 'KKM' }], ['CH03-K1', 'CH03', 'Kho bán CH03', { isDefault: true }],
    ] as const) expect((await call(ctx, 'POST', '/api/v1/warehouses', { code, branchCode, name, ...extra })).status).toBe(201);
    await nhapLo('NHAP-044-K1', 'CH02', 'CH02-K1', [['SUA01', 10, 'L01', '2027-06-30'], ['SUA01', 5, 'L02', '2027-12-31'], ['SUA02', 10, 'L01', '2027-06-30'], ['SUA02', 5, 'L02', '2027-12-31'],
      ['SUA03', 20], ['NGUNG01', 5]]);
    await nhapLo('NHAP-044-KKM', 'CH02', 'CH02-KKM', [['QUA01', 3]]);
    await nhapLo('NHAP-044-CH03', 'CH03', 'CH03-K1', [['SUA01', 5]]);
    expect((await call(ctx, 'PUT', '/api/v1/products/NGUNG01', { isActive: false })).status).toBe(200);
    // Bảng giá công ty: SUA01 hộp 330.000, thùng (24 hộp) 7.500.000; SUA03 hộp 330.000.
    await khaiGia(tenantId, [['SUA01', 'Hộp', 330_000], ['SUA01', 'Thùng', 7_500_000, 24], ['SUA02', 'Hộp', 330_000], ['SUA03', 'Hộp', 330_000], ['QUA01', 'Cái', 0]]);
    // Mục đích xuất của đơn vị (Quy tắc hạch toán ACC41) — module chỉ gửi mã, Kernel tra tài khoản.
    for (const [code, name, acc] of [['DUNG-BH', 'Dùng cho bộ phận bán hàng', '64128'], ['HUY', 'Huỷ hàng hỏng', '6328'], ['TANG-KH', 'Tặng khách', '64184']]) {
      await sql`INSERT INTO stock_purposes (tenant_id, code, name, direction, account_code) VALUES (${tenantId}, ${code}, ${name}, 'decrease', ${acc}) ON CONFLICT DO NOTHING`.execute(db);
    }
    await sql`INSERT INTO posting_reasons (tenant_id, code, name, kind, is_active) VALUES (${tenantId}, 'XTEST', 'Lý do thử chưa khai', 'out', true) ON CONFLICT DO NOTHING`.execute(db);
    // XTA (xuất tặng có giá — bán nội bộ) như gói định khoản db/seeds/ly-do.jsonl; đơn vị test chưa có.
    await sql`INSERT INTO posting_reasons (tenant_id, code, name, kind, counter_account, revenue_account, expense_account, is_active, flags)
      VALUES (${tenantId}, 'XTA', 'Xuất tặng nhân viên, đối tác ghi chi phí', 'out', '1311', '51111', '6321', true, '{"postToLedger": false}'::jsonb) ON CONFLICT DO NOTHING`.execute(db);
    expect((await call(ctx, 'POST', '/api/v1/partners', { code: 'KH001', name: 'Khách 001', kind: 'customer' })).status).toBeLessThan(300);
    // Giá vốn bình quân tháng 10 của SUA03 (để ca 24 thấy "dưới giá vốn"): một lần tính giá vốn của điểm tính chưa gắn cơ cấu.
    const run = (await sql<{ id: string }>`INSERT INTO costing_runs (tenant_id, center_code, year, month, date_from, date_to) VALUES (${tenantId}, '', 2026, 10, '2026-10-01', '2026-10-31') RETURNING id::text`.execute(db)).rows[0]!.id;
    await sql`INSERT INTO costing_run_lines (tenant_id, run_id, sku, unit_cost) VALUES (${tenantId}, ${run}, 'SUA03', 200000)`.execute(db);

    await user('ketoan', 'accountant');
    const tn = await user('thungan', 'staff');
    await gan(tn, { tenantRoleId: await role('thu_ngan_044', ['pos:sell'], 'staff'), scopeType: 'branch', scopeId: bid.CH02 });
    const ql = await user('quanly', 'viewer');
    await gan(ql, { tenantRoleId: await role('quan_ly_044', ['xuat-dieu-chinh:phieu-xem', 'xuat-dieu-chinh:phieu-lap'], 'viewer'), scopeType: 'branch', scopeId: bid.CH02 });
    const xem = await user('chixem', 'viewer');
    await gan(xem, { tenantRoleId: await role('chi_xem_044', ['xuat-dieu-chinh:phieu-xem'], 'viewer') });
    ok(await req(null, 'PUT', '/api/v1/settings/values/bizcity.authz.branch_scope', { value: 'on', reason: 'NT-BH-044 ca 13' }));
  });
  afterAll(async () => {
    await app?.close();
    await ctx?.app.close();
  });

  let ca2: Phieu;

  it('ca 1: mở form — kho mặc định CH02-K1 (có kho quà CH02-KKM), lý do mặc định XSD1, hôm nay; kế toán lùi ngày được, thu ngân không', async () => {
    const d = ok(await req('ketoan', 'GET', `${M}/danh-muc?branchCode=CH02`));
    expect(d).toMatchObject({ defaultWarehouse: 'CH02-K1', defaultReason: 'XSD1', today: TODAY, canBackdate: true });
    expect(d.warehouses.map((w: { code: string }) => w.code)).toEqual(['CH02-K1', 'CH02-KKM']);
    expect(ok(await req('thungan', 'GET', `${M}/danh-muc?branchCode=CH02`)).canBackdate).toBe(false);
  });

  it('ca 2 + 34: phiếu 0 đ XSD1 — stock_adjustment giảm, sourceRef export_adjust, purposeCode DUNG-BH, amount 0; L01 còn 8; số XDC-CH02-…', async () => {
    ca2 = ok(await save('ketoan', base({ lines: [{ sku: 'SUA01', unitQty: 2, lotNo: 'L01', expDate: '2027-06-30' }] })));
    expect(ca2).toMatchObject({ status: 'posted', priced: false, kind: 'zero', total: 0, purposeCode: 'DUNG-BH' });
    expect(ca2.docNo).toMatch(/^XDC-CH02-\d{4}-0001$/);
    const ev = (await event(ca2.id))!;
    expect(ev).toMatchObject({ doc_type: 'stock_adjustment', status: 'posted' });
    expect(ev.payload).toMatchObject({ direction: 'decrease', reasonCode: 'XSD1', purposeCode: 'DUNG-BH', sourceSystem: 'xuat-dieu-chinh', sourceRef: { type: 'export_adjust', id: ca2.id }, totals: { total: 0 } });
    expect(await lotStock('CH02-K1', 'SUA01', 'L01')).toBe(8);
    expect(await stock('CH02-K1', 'SUA01')).toBe(13);
    const bd = (await sql<{ doc_no: string; status: string; doc_type: string }>`SELECT doc_no, status, doc_type FROM business_documents WHERE tenant_id = ${tenantId} AND doc_ref = ${`xuat-dieu-chinh.phieu:${ca2.id}`}`.execute(db)).rows[0];
    expect(bd).toMatchObject({ doc_no: ca2.docNo, status: 'done', doc_type: 'inventory.issue' });
  });

  it('ca 35: phiếu 0 đ lý do XHH01 mang purposeCode HUY (bảng ánh xạ của module)', async () => {
    const p: Phieu = ok(await save('ketoan', base({ reasonCode: 'XHH01', lines: [{ sku: 'SUA03', unitQty: 1 }] })));
    expect((await event(p.id))!.payload).toMatchObject({ reasonCode: 'XHH01', purposeCode: 'HUY' });
  });

  it('ca 3: phiếu có giá XTA — giá gợi ý 330.000 từ bảng giá, thuế theo danh mục, sale internalOnly, công nợ 131 KH001, tồn trừ 1', async () => {
    const h = ok(await req('ketoan', 'GET', `${M}/hang?branchCode=CH02&warehouseCode=CH02-K1&skus=SUA03`)).items[0];
    expect(h).toMatchObject({ sku: 'SUA03', taxCode: '8', taxRate: 8, stock: 19 });
    expect(h.units[0]).toMatchObject({ unit: 'Hộp', ratio: 1, price: 330_000 });
    const p: Phieu = ok(await save('ketoan', base({ reasonCode: 'XTA', priced: true, partnerCode: 'KH001', lines: [{ sku: 'SUA03', unitQty: 1, unitPrice: h.units[0].price }] })));
    expect(p).toMatchObject({ status: 'posted', priced: true, kind: 'priced', total: 330_000 });
    const ev = (await event(p.id))!;
    expect(ev.doc_type).toBe('sale');
    expect(ev.payload).toMatchObject({ internalOnly: true, partner: { code: 'KH001' }, payments: [], sourceRef: { type: 'export_adjust' }, totals: { total: 330_000, tax: 24_444, beforeTax: 305_556 } });
    expect(ev.payload.invoice).toBeUndefined();
    const ar = (await sql<{ d: string }>`SELECT sum(l.debit - l.credit)::text AS d FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id
      JOIN accounting_events a ON a.id = e.event_id JOIN partners pa ON pa.id = l.partner_id
      WHERE a.tenant_id = ${tenantId} AND a.doc_key = ${`xuat-dieu-chinh:${p.id}`} AND l.account_code LIKE '131%' AND pa.code = 'KH001'`.execute(db)).rows[0]!.d;
    expect(Number(ar)).toBe(330_000);
    expect(await stock('CH02-K1', 'SUA03')).toBe(18);
  });

  it('ca 4: SL vượt tồn của kho → VALIDATION_ERROR, error.fields lines[0].qty, không có chứng từ', async () => {
    const r = await save('ketoan', base({ lines: [{ sku: 'SUA01', unitQty: 14 }] }));
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
    expect(fields(r)).toEqual(['lines[0].qty']);
    expect(r.body.error.message).toContain('CH02-K1 chỉ còn 13');
  });

  it('ca 5: ĐVT thùng × 1 (= 24 hộp, tồn 13) → chặn như ca 4, câu báo quy ra hộp', async () => {
    const r = await save('ketoan', base({ lines: [{ sku: 'SUA01', unit: 'Thùng', unitQty: 1 }] }));
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
    expect(fields(r)).toEqual(['lines[0].qty']);
    expect(r.body.error.message).toContain('1 Thùng = 24 Hộp');
  });

  it('ca 6: kho quà CH02-KKM, QUA01 × 2 → ghi sổ, tồn KKM còn 1', async () => {
    ok(await save('ketoan', base({ warehouseCode: 'CH02-KKM', reasonCode: 'XTA1.4', lines: [{ sku: 'QUA01', unitQty: 2 }] })));
    expect(await stock('CH02-KKM', 'QUA01')).toBe(1);
  });

  let nhap: Phieu;
  it('ca 7: Lưu nháp — trạng thái Nháp, không có chứng từ, tồn không đổi; mở lại sửa rồi Lưu thì ghi sổ', async () => {
    nhap = ok(await save('ketoan', base({ mode: 'draft', lines: [{ sku: 'SUA01', unitQty: 1 }] })));
    expect(nhap.status).toBe('draft');
    expect(await event(nhap.id)).toBeUndefined();
    expect(await stock('CH02-K1', 'SUA01')).toBe(13);
    const list = ok(await req('ketoan', 'GET', `${M}/phieu?status=draft`));
    expect(list.items.map((x: Phieu) => x.id)).toContain(nhap.id);
    const edited: Phieu = ok(await save('ketoan', base({ mode: 'draft', id: nhap.id, version: nhap.version, lines: [{ sku: 'SUA01', unitQty: 2 }] })));
    expect(edited.version).toBe(nhap.version + 1);
    const posted: Phieu = ok(await save('ketoan', base({ id: nhap.id, version: edited.version, lines: [{ sku: 'SUA01', unitQty: 2 }] })));
    expect(posted.status).toBe('posted');
    expect(await stock('CH02-K1', 'SUA01')).toBe(11);
  });

  it('ca 8: bấm Lưu hai lần cùng Idempotency-Key → một chứng từ, lần hai trả đúng kết quả lần một', async () => {
    const body = base({ lines: [{ sku: 'SUA03', unitQty: 1 }] });
    const a = ok(await save('ketoan', body, 'nt-bh-044-ca8-cung-khoa'));
    const b = ok(await save('ketoan', body, 'nt-bh-044-ca8-cung-khoa'));
    expect(b.id).toBe(a.id);
    const n = (await sql<{ n: string }>`SELECT count(*) AS n FROM mod_xuat_dieu_chinh.phieu WHERE tenant_id = ${tenantId} AND description = 'Xuất dùng quầy' AND lines @> '[{"sku":"SUA03","unitQty":1}]'::jsonb AND reason_code = 'XSD1'`.execute(db)).rows[0]!.n;
    expect(Number(n)).toBe(1);
  });

  it('ca 9: kế toán huỷ phiếu ca 2, lý do "Lập nhầm" → bút toán đảo, tồn L01 về 10, Đã huỷ, ghi người + lý do', async () => {
    const p = ok(await req('ketoan', 'POST', `${M}/phieu/${ca2.id}/cancel`, { reason: 'Lập nhầm' }));
    expect(p).toMatchObject({ status: 'cancelled', cancelReason: 'Lập nhầm', ledgerStatus: 'cancelled' });
    expect(p.cancelledBy).toMatch(/^user:/);
    expect((await event(ca2.id))!.status).toBe('cancelled');
    expect(await lotStock('CH02-K1', 'SUA01', 'L01')).toBe(10 - 2); // L01 còn trừ 2 của ca 7 (lô tự chọn hạn sớm)
    expect(await stock('CH02-K1', 'SUA01')).toBe(13);
  });

  it('ca 10: huỷ bỏ trống lý do → VALIDATION_ERROR tại ô cancelReason, phiếu giữ nguyên', async () => {
    const r = await req('ketoan', 'POST', `${M}/phieu/${nhap.id}/cancel`, { reason: '' });
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
    expect(fields(r)).toEqual(['cancelReason']);
    expect(ok(await req('ketoan', 'GET', `${M}/phieu/${nhap.id}`)).status).toBe('posted');
  });

  it('ca 11 + Q-CHUNG-04: kỳ 10/2026 khoá — huỷ phiếu ngày 15/10 bị chặn PERIOD_LOCKED, lưu phiếu ngày lùi vào kỳ khoá bị chặn PERIOD_LOCKED tại ô docDate', async () => {
    const thang10: Phieu = ok(await save('ketoan', base({ docDate: '2026-10-15', reasonCode: 'XTA', priced: true, partnerCode: 'KH001', lines: [{ sku: 'SUA03', unitQty: 1, unitPrice: 330_000 }] })));
    ok(await req(null, 'POST', '/api/v1/periods/locks', { year: 2026, month: 10 }));
    const c = await req('ketoan', 'POST', `${M}/phieu/${thang10.id}/cancel`, { reason: 'Thử kỳ khoá' });
    expect(c.body.error?.code, JSON.stringify(c.body)).toBe('PERIOD_LOCKED');
    expect(ok(await req('ketoan', 'GET', `${M}/phieu/${thang10.id}`)).status).toBe('posted');
    const s = await save('ketoan', base({ docDate: '2026-10-20', reasonCode: 'XTA', priced: true, partnerCode: 'KH001', lines: [{ sku: 'SUA03', unitQty: 1, unitPrice: 330_000 }] }));
    expect(s.body.error?.code, JSON.stringify(s.body)).toBe('PERIOD_LOCKED');
    expect(fields(s)).toEqual(['docDate']);
  });

  // Phiếu 0 đ (stock_adjustment không có bút toán tới lúc tính giá vốn): Kernel ghi / huỷ thẻ kho mà không kiểm kỳ khoá (đã thử 26/11: ghi ngày
  // 21/10 và huỷ phiếu 15/10 khi kỳ 10 khoá đều qua) — module không đọc được kỳ kế toán (không có khung nhìn / action đọc). Đề xuất mức 4 P7.
  it.todo('ca 11 (phiếu 0 đ): lưu / huỷ phiếu 0 đ ngày trong kỳ khoá bị chặn PERIOD_LOCKED — chờ Core (đề xuất P7)');

  it('ca 12: vai trò chỉ xem (không phieu-lap) — xem được, gọi thẳng Lưu → 403 FORBIDDEN', async () => {
    ok(await req('chixem', 'GET', `${M}/phieu`));
    const r = await save('chixem', base({ lines: [{ sku: 'SUA03', unitQty: 1 }] }));
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('FORBIDDEN');
  });

  let cuaThuNgan: Phieu;
  it('ca 13: thu ngân (staff tại CH02) lập được ở CH02; huỷ → 403 FORBIDDEN; lập cho CH03 → 403 BRANCH_OUT_OF_SCOPE', async () => {
    cuaThuNgan = ok(await save('thungan', base({ lines: [{ sku: 'SUA03', unitQty: 1 }] })));
    expect(cuaThuNgan.status).toBe('posted');
    const c = await req('thungan', 'POST', `${M}/phieu/${cuaThuNgan.id}/cancel`, { reason: 'Thử' });
    expect(c.status).toBe(403);
    expect(c.body.error.code).toBe('FORBIDDEN');
    const o = await save('thungan', base({ branchCode: 'CH03', warehouseCode: 'CH03-K1', lines: [{ sku: 'SUA01', unitQty: 1 }] }));
    expect(o.status).toBe(403);
    expect(JSON.stringify(o.body)).toContain('BRANCH_OUT_OF_SCOPE');
    expect((ok(await req('thungan', 'GET', `${M}/phieu`)).items as { branchCode: string }[]).every((x) => x.branchCode === 'CH02')).toBe(true);
  });

  it('ca 14: quản lý cửa hàng CH02 (viewer + vai trò tại CH02) — xem + lập, không huỷ', async () => {
    const p: Phieu = ok(await save('quanly', base({ lines: [{ sku: 'SUA03', unitQty: 1 }] })));
    expect(p.status).toBe('posted');
    expect((await req('quanly', 'POST', `${M}/phieu/${p.id}/cancel`, { reason: 'Thử' })).status).toBe(403);
  });

  it('ca 15: danh sách tháng hiện tại có cả phiếu 0 đ và có giá, cột Loại, tổng tiền đúng (phiếu huỷ không cộng)', async () => {
    const d = ok(await req('ketoan', 'GET', `${M}/phieu?from=${TODAY.slice(0, 8)}01&to=${TODAY}`));
    const kinds = new Set((d.items as Phieu[]).map((x) => x.kind));
    expect([...kinds].sort()).toEqual(['priced', 'zero']);
    const sum = (d.items as Phieu[]).filter((x) => x.status !== 'cancelled').reduce((s, x) => s + x.total, 0);
    expect(d.total).toBe(sum);
    expect(d.total).toBeGreaterThanOrEqual(330_000);
    const zeroOnly = ok(await req('ketoan', 'GET', `${M}/phieu?kind=zero&from=${TODAY.slice(0, 8)}01`));
    expect((zeroOnly.items as Phieu[]).every((x) => x.kind === 'zero')).toBe(true);
  });

  it('ca 17 + 25: dòng chọn lô L02 chỉ trừ L02; dòng trống lô 12 hộp tự lấy hạn sớm nhất L01 × 10 + L02 × 2; chứng từ mang lotNo + expDate', async () => {
    const a: Phieu = ok(await save('ketoan', base({ lines: [{ sku: 'SUA02', unitQty: 1, lotNo: 'L02', expDate: '2027-12-31' }] })));
    expect((await event(a.id))!.payload).toMatchObject({ lines: [{ sku: 'SUA02', lotNo: 'L02', expDate: '2027-12-31' }] });
    expect(await lotStock('CH02-K1', 'SUA02', 'L02')).toBe(4);
    expect(await lotStock('CH02-K1', 'SUA02', 'L01')).toBe(10);
    const b: Phieu = ok(await save('ketoan', base({ lines: [{ sku: 'SUA02', unitQty: 12 }] })));
    const lots = (await sql<{ lot_no: string; qty: string }>`SELECT lot_no, qty::text FROM bizcity_read.document_lots WHERE tenant_id = ${tenantId} AND doc_key = ${`xuat-dieu-chinh:${b.id}`} ORDER BY lot_no`.execute(db)).rows;
    expect(lots.map((x) => [x.lot_no, Number(x.qty)])).toEqual([['L01', -10], ['L02', -2]]);
  });

  it('ca 19: lý do đã có màn riêng (XKK) hoặc chưa khai mục đích (XTEST) gửi thẳng API → VALIDATION_ERROR fields reasonCode', async () => {
    for (const reasonCode of ['XKK', 'XNB01', 'XTEST']) {
      const r = await save('ketoan', base({ reasonCode, lines: [{ sku: 'SUA03', unitQty: 1 }] }));
      expect(r.body.error.code, reasonCode).toBe('VALIDATION_ERROR');
      expect(fields(r), reasonCode).toEqual(['reasonCode']);
    }
  });

  it('ca 20: kho của chi nhánh khác, mặt hàng ngừng dùng → VALIDATION_ERROR tại warehouseCode / lines[0].sku', async () => {
    const r = await save('ketoan', base({ warehouseCode: 'CH03-K1', lines: [{ sku: 'NGUNG01', unitQty: 1 }] }));
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
    expect(fields(r).sort()).toEqual(['lines[0].sku', 'warehouseCode']);
  });

  it('ca 22: thiếu kho, không dòng, SL 0 → báo HẾT các ô lỗi một lần', async () => {
    const r = await save('ketoan', base({ warehouseCode: '', lines: [] }));
    expect(fields(r).sort()).toEqual(['lines', 'warehouseCode']);
    const z = await save('ketoan', base({ lines: [{ sku: 'SUA03', unitQty: 0 }, { sku: '', unitQty: 1 }] }));
    expect(z.body.error.code).toBe('VALIDATION_ERROR');
    expect(fields(z).sort()).toEqual(['lines[0].qty', 'lines[1].sku']);
  });

  it('ca 23: phiếu có giá bỏ trống người nhận → VALIDATION_ERROR fields partnerCode', async () => {
    const r = await save('ketoan', base({ reasonCode: 'XTA', priced: true, lines: [{ sku: 'SUA03', unitQty: 1, unitPrice: 330_000 }] }));
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
    expect(fields(r)).toEqual(['partnerCode']);
  });

  it('ca 24: phiếu có giá đơn giá 1.000 (dưới giá vốn 200.000) → cảnh báo "Dưới giá vốn", vẫn lưu; bằng chứng ghi lần lưu dưới giá vốn', async () => {
    const r = await save('ketoan', base({ reasonCode: 'XTA', priced: true, partnerCode: 'KH001', lines: [{ sku: 'SUA03', unitQty: 1, unitPrice: 1_000 }] }));
    const p: Phieu = ok(r);
    expect(p.status).toBe('posted');
    expect(p.belowCost).toEqual([expect.objectContaining({ sku: 'SUA03', unitCost: 200_000 })]);
    expect(String(r.body.meta.warnings)).toContain('Dưới giá vốn');
  });

  it('ca 26: SL 1,5 hộp (ĐVT không cho số lẻ) → chặn tại lines[0].qty', async () => {
    const r = await save('ketoan', base({ lines: [{ sku: 'SUA03', unitQty: 1.5 }] }));
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
    expect(fields(r)).toEqual(['lines[0].qty']);
  });

  it('ca 27: phiếu làm tồn xuống thấp không cảnh báo min / max — chỉ chặn quá tồn', async () => {
    const r = await save('ketoan', base({ warehouseCode: 'CH02-KKM', reasonCode: 'XTA1.4', lines: [{ sku: 'QUA01', unitQty: 1 }] }));
    ok(r);
    expect(r.body.meta.warnings).toBeUndefined();
    expect(await stock('CH02-KKM', 'QUA01')).toBe(0);
  });

  it('ca 28: phiếu đã ghi sổ không sửa (CONFLICT); Chép thành phiếu mới → nháp mới cùng nội dung, chưa vào sổ, nối nguồn', async () => {
    const r = await save('ketoan', base({ id: nhap.id, mode: 'draft', lines: [{ sku: 'SUA01', unitQty: 1 }] }));
    expect(r.body.error.code).toBe('CONFLICT');
    const copy: Phieu = ok(await save('ketoan', base({ mode: 'draft', copiedFrom: nhap.id, lines: [{ sku: 'SUA01', unitQty: 2 }] })));
    expect(copy).toMatchObject({ status: 'draft', copiedFrom: nhap.id });
    expect(copy.id).not.toBe(nhap.id);
    expect(await event(copy.id)).toBeUndefined();
    const link = (await sql<{ n: string }>`SELECT count(*) AS n FROM document_links WHERE tenant_id = ${tenantId} AND from_ref = ${`xuat-dieu-chinh.phieu:${copy.id}`} AND to_ref = ${`xuat-dieu-chinh.phieu:${nhap.id}`}`.execute(db)).rows[0]!.n;
    expect(Number(link)).toBe(1);
  });

  it('ca 29: A và B cùng mở một nháp; A lưu trước, B lưu sau → CONFLICT (kiểm phiên bản), nháp của A giữ nguyên', async () => {
    const d: Phieu = ok(await save('ketoan', base({ mode: 'draft', lines: [{ sku: 'SUA03', unitQty: 1 }] })));
    const a: Phieu = ok(await save('ketoan', base({ mode: 'draft', id: d.id, version: d.version, description: 'A sửa', lines: [{ sku: 'SUA03', unitQty: 2 }] })));
    const b = await save(null, base({ mode: 'draft', id: d.id, version: d.version, description: 'B sửa', lines: [{ sku: 'SUA03', unitQty: 3 }] }));
    expect(b.body.error.code).toBe('CONFLICT');
    expect(b.body.error.message).toContain('tải lại');
    expect(ok(await req('ketoan', 'GET', `${M}/phieu/${d.id}`))).toMatchObject({ description: 'A sửa', version: a.version });
  });

  it('ca 30: thu ngân sửa / xoá nháp do kế toán lập → 403 FORBIDDEN; kế toán xoá được', async () => {
    const d: Phieu = ok(await save('ketoan', base({ mode: 'draft', lines: [{ sku: 'SUA03', unitQty: 1 }] })));
    const s = await save('thungan', base({ mode: 'draft', id: d.id, version: d.version, lines: [{ sku: 'SUA03', unitQty: 2 }] }));
    expect(s.status).toBe(403);
    expect(s.body.error.code).toBe('FORBIDDEN');
    expect((await req('thungan', 'DELETE', `${M}/phieu/${d.id}`)).body.error.code).toBe('FORBIDDEN');
    expect(ok(await req('ketoan', 'DELETE', `${M}/phieu/${d.id}`))).toEqual({ id: d.id, deleted: true });
    expect((await req('ketoan', 'GET', `${M}/phieu/${d.id}`)).status).toBe(404);
    // Người lập (thu ngân) sửa được nháp của mình.
    const mine: Phieu = ok(await save('thungan', base({ mode: 'draft', lines: [{ sku: 'SUA03', unitQty: 1 }] })));
    ok(await save('thungan', base({ mode: 'draft', id: mine.id, version: mine.version, lines: [{ sku: 'SUA03', unitQty: 2 }] })));
  });

  it('ca 31: thu ngân gửi ngày lùi → VALIDATION_ERROR fields docDate; kế toán lùi được (ca 11)', async () => {
    const r = await save('thungan', base({ docDate: new Date(Date.parse(TODAY) - 86_400_000).toISOString().slice(0, 10), lines: [{ sku: 'SUA03', unitQty: 1 }] }));
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
    expect(fields(r)).toEqual(['docDate']);
  });
});
