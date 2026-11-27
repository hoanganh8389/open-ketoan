/**
 * NT-BH-046 — BH11 trả theo phiếu gốc: chọn phiếu bán đã duyệt của khách / theo số phiếu, dòng trả khoá theo dòng gốc, còn trả từng dòng
 * kiểm cả lúc Ghi và lúc Duyệt. Số liệu đúng §4 / §5 của phiếu (docs/nghiem-thu/ban-hang/NT-BH-046-tra-hang-theo-phieu-goc.md).
 */
// [2026-11-26 08:20 PM Võ Hoàng] NGHIEM-THU — test tích hợp phiếu NT-BH-046 (đóng góp)
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

const DIR = fileURLToPath(new URL('../../../modules/phieu-ban/', import.meta.url));
const HAS = existsSync(path.join(DIR, 'bizcity.module.json'));
const M = '/api/v1/m/phieu-ban';
const READS = ['bizcity_read.branches', 'bizcity_read.products', 'bizcity_read.tax_codes', 'bizcity_read.payment_methods', 'bizcity_read.partners', 'bizcity_read.branch_prices', 'bizcity_read.stock_on_hand', 'bizcity_read.warehouses'];
const TODAY = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

type Src = { id: string; docNo: string; lines: { lineKey: string; sku: string; qty: number; unitPrice: number; discount: number; returned: number; returnable: number }[] };

describe.skipIf(!HAS)('NT-BH-046 — BH11 trả theo phiếu gốc', () => {
  let ctx: TestCtx;
  let app: FastifyInstance;
  let tenantId = '';
  let k = 0;
  const req = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) => app.inject({
    method, url: `${M}${url}`, ...(payload ? { payload: payload as never } : {}),
    headers: { authorization: `Bearer ${ctx.token}`, ...(method === 'GET' ? {} : { 'idempotency-key': `nt-bh-046-${++k}-${Date.now()}` }) },
  });
  const ret = (lines: Record<string, unknown>[], over: Record<string, unknown> = {}) => ({
    docType: 'sale_return', docDate: TODAY, branchCode: 'CN01', partner: { code: 'KH001' }, originalDocNo: saleNo, payments: [], lines, ...over,
  });
  const create = async (body: unknown) => {
    const r = await req('POST', '/docs', body);
    expect(r.statusCode, r.body).toBe(200);
    return r.json().data as { id: string; docNo: string; lines: Record<string, unknown>[]; totals: { beforeTax: number; tax: number; total: number } };
  };
  const approve = (id: string) => req('POST', `/docs/${id}/approve`);

  let saleId = '';
  let saleNo = '';
  beforeAll(async () => {
    ctx = await setupTenant();
    tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
    await runModuleMigrations('phieu-ban', path.join(DIR, 'migrations'), { reads: READS });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:nt-bh-046', trx as never); });
    app = await buildApp();
    await sql`INSERT INTO branches (tenant_id, code, name) VALUES (${tenantId}, 'CN02', 'Cửa hàng 02') ON CONFLICT DO NOTHING`.execute(db);
    expect((await call(ctx, 'PUT', '/api/v1/products', { products: [{ sku: '1001', name: 'Sữa A', unit: 'Hộp' }, { sku: '1002', name: 'Sữa B', unit: 'Hộp' }] })).status).toBeLessThan(300);
    for (const sku of ['1001', '1002']) expect((await call(ctx, 'PUT', `/api/v1/products/${sku}`, { taxOutCode: 'R08' })).status).toBe(200);
    expect((await call(ctx, 'POST', '/api/v1/partners', { code: 'KH001', name: 'Đại lý An' })).status).toBeLessThan(300);
    expect((await call(ctx, 'POST', '/api/v1/partners', { code: 'KH002', name: 'Đại lý Bình' })).status).toBeLessThan(300);
    const modes = (await call(ctx, 'GET', '/api/v1/settings/posting-modes')).body.data;
    expect((await call(ctx, 'PUT', '/api/v1/settings/posting-modes', { ...modes, sale: 'auto', sale_return: 'auto' })).status).toBe(200);
    // §4: phiếu gốc 3 dòng (hai dòng cùng mã 1001), đã duyệt.
    const s = await create({
      docType: 'sale', docDate: TODAY, branchCode: 'CN01', partner: { code: 'KH001' }, payments: [],
      lines: [
        { lineKey: 'D1', sku: '1001', qty: 10, unitPrice: 100_000, discount: 50_000 },
        { lineKey: 'D2', sku: '1002', qty: 4, unitPrice: 25_000 },
        { lineKey: 'D3', sku: '1001', qty: 2, unitPrice: 90_000 },
      ],
    });
    saleId = s.id;
    saleNo = s.docNo;
    expect((await approve(saleId)).statusCode).toBe(200);
  });
  afterAll(async () => {
    await app?.close();
    await ctx?.app.close();
  });

  it('§3 bước 2: phiếu gốc theo khách / theo số phiếu (khách lẻ), chỉ phiếu đã duyệt của cửa hàng; kèm còn trả từng dòng', async () => {
    const byPartner = (await req('GET', '/return-sources?branch=CN01&partnerCode=KH001')).json().data.items as Src[];
    expect(byPartner.map((x) => x.docNo)).toEqual([saleNo]);
    expect(byPartner[0]!.lines.map((l) => [l.lineKey, l.returnable])).toEqual([['D1', 10], ['D2', 4], ['D3', 2]]);
    expect((await req('GET', `/return-sources?branch=CN01&search=${saleNo}`)).json().data.items).toHaveLength(1);
    expect((await req('GET', '/return-sources?branch=CN01&partnerCode=KH002')).json().data.items).toEqual([]);
    // §6 dòng 6: cửa hàng khác không thấy.
    expect((await req('GET', `/return-sources?branch=CN02&search=${saleNo}`)).json().data.items).toEqual([]);
  });

  it('§5 dòng 1–2: trả dòng 1 SL 4 → giá khoá theo dòng gốc (màn gửi giá khác bị bỏ), chiết khấu 20.000, tiền 380.000 + thuế 30.400; còn 6 / 4 / 2', async () => {
    const r = await create(ret([{ lineKey: 'R1', sku: '1001', qty: 4, originalLineKey: 'D1', unitPrice: 1, taxCode: 'KCT' }]));
    expect(r.lines[0]).toMatchObject({ unitPrice: 100_000, discount: 20_000, taxCode: 'R08', amountBeforeTax: 380_000, taxAmount: 30_400, originalLineKey: 'D1' });
    expect(r.totals).toEqual({ beforeTax: 380_000, tax: 30_400, total: 410_400 });
    expect((await approve(r.id)).statusCode).toBe(200);
    const payload = (await sql<{ p: { originalDocKey?: string } }>`SELECT payload AS p FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = ${`phieu-ban:${r.id}`}`.execute(db)).rows[0]!.p;
    expect(payload.originalDocKey).toBe(`phieu-ban:${saleId}`);
    const left = (await req('GET', `/docs/${saleId}/returnable`)).json().data as Src;
    expect(left.lines.map((l) => [l.lineKey, l.returned, l.returnable])).toEqual([['D1', 4, 6], ['D2', 0, 4], ['D3', 0, 2]]);
  });

  it('§5 dòng 4: dòng 3 trả 3 → chặn lúc Ghi theo DÒNG ("còn trả được 2") dù mã 1001 còn ở dòng 1', async () => {
    const r = await req('POST', '/docs', ret([{ lineKey: 'R1', sku: '1001', qty: 3, originalLineKey: 'D3' }]));
    expect(r.statusCode).toBe(400);
    expect(r.json().error.message).toContain('Dòng 3 phiếu gốc (1001): trả 3, còn trả được 2');
  });

  it('§6 dòng 1–2: không phiếu gốc / dòng không chọn từ phiếu gốc / sai mã / phiếu gốc không có → chặn', async () => {
    const noOrig = await req('POST', '/docs', ret([{ lineKey: 'R1', sku: '1001', qty: 1, originalLineKey: 'D1' }], { originalDocNo: undefined }));
    expect(noOrig.json().error.message).toContain('Phiếu trả phải chọn phiếu bán gốc');
    expect((await req('POST', '/docs', ret([{ lineKey: 'R1', sku: '1001', qty: 1, unitPrice: 100_000 }]))).json().error.message).toContain('chưa chọn từ phiếu gốc');
    expect((await req('POST', '/docs', ret([{ lineKey: 'R1', sku: '1002', qty: 1, originalLineKey: 'D1' }]))).json().error.message).toContain('khác mã hàng');
    expect((await req('POST', '/docs', ret([{ lineKey: 'R1', sku: '1001', qty: 1, originalLineKey: 'D1' }], { originalDocNo: 'BH0000000999' }))).json().error.message).toContain('Không có phiếu bán BH0000000999');
  });

  it('§6 dòng 5: hai phiếu trả nháp cùng trả hết dòng 2 → duyệt phiếu sau bị chặn "còn trả được 0"', async () => {
    const a = await create(ret([{ lineKey: 'R1', sku: '1002', qty: 4, originalLineKey: 'D2' }]));
    const b = await create(ret([{ lineKey: 'R1', sku: '1002', qty: 4, originalLineKey: 'D2' }]));
    expect((await approve(a.id)).statusCode).toBe(200);
    const nb = await approve(b.id);
    expect(nb.statusCode).toBe(400);
    expect(nb.json().error.message).toContain('còn trả được 0');
  });

  it('§5 dòng 3: trả nốt dòng 1 (SL 6) → chiết khấu = phần còn lại 30.000; tổng chiết khấu hai lần = 50.000 dòng gốc', async () => {
    const r = await create(ret([{ lineKey: 'R1', sku: '1001', qty: 6, originalLineKey: 'D1' }]));
    expect(r.lines[0]).toMatchObject({ discount: 30_000, amountBeforeTax: 570_000 });
    expect((await approve(r.id)).statusCode).toBe(200);
    const open = (await req('GET', '/return-sources?branch=CN01&partnerCode=KH001&open=1')).json().data.items as Src[];
    // Còn dòng 3 (2 hộp) nên phiếu vẫn trong danh sách "còn trả".
    expect(open[0]!.lines.map((l) => l.returnable)).toEqual([0, 0, 2]);
  });
});
