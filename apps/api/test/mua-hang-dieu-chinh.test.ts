/**
 * [2026-11-15 Nguyễn Văn Thủy] Sửa phiếu mua đã ghi sổ bằng BẢN ĐIỀU CHỈNH (đóng góp)
 *   - Lập điều chỉnh: phiếu về nháp, bắt buộc lý do; sổ GIỮ bút toán bản cũ (không đảo ngay).
 *   - Duyệt bản điều chỉnh: cùng chứng từ kế toán, phiên bản mới → đảo bản cũ + ghi bản mới; lịch sử ghi lý do + thay đổi.
 *   - Huỷ điều chỉnh: phiếu về đúng bản đã duyệt, sổ không đổi.
 *   - Đơn đặt hàng (không ghi sổ) không lập điều chỉnh.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let t: TestCtx;
let tenantId: string;
type Doc = { id: string; status: string; ledger?: string; lines: { qty: number }[]; links: { eventId: string; docKey: string }[]; adjust?: { reason: string }; adjustments?: { reason: string; changes: string[] }[] };
const body = (qty: number, extra: Record<string, unknown> = {}) => ({
  kind: 'receipt', outsideOrder: { reason: 'Phép thử: điều chỉnh' }, docDate: '2026-10-08', branchCode: 'CN-NA', partnerCode: 'NCC-DIEUCHINH', priceIncludesVat: false, orderDiscount: {},
  lines: [{ lineKey: 'a', sku: '110154028', name: 'Anlene Gold 5X hương vani 400g', unit: 'Lon', qty, price: 250000, taxCode: 'V08', lineType: 'buy', lotNo: 'L1', expDate: '2028-01-01' }], ...extra,
});
const get = async (id: string) => { const x = (await call(t, 'GET', `/api/v1/purchase/documents/${id}`)).body.data as Doc & { doc?: Doc }; return x.doc ?? x; };
const approve = async (id: string) => { const r = await call(t, 'POST', `/api/v1/purchase/documents/${id}/approve`); expect(r.status, JSON.stringify(r.body).slice(0, 500)).toBe(200); return r.body.data as Doc; };
/** Số đang có hiệu lực trên sổ của một chứng từ kế toán (gốc + đảo âm + mới) và số bút toán đảo. */
async function ledger(eventId: string) {
  const r = await sql<{ debit: string; is_reversal: boolean }>`
    SELECT SUM(l.debit) AS debit, e.is_reversal FROM ledger_entries e JOIN ledger_lines l ON l.entry_id = e.id
     WHERE e.tenant_id = ${tenantId} AND e.event_id = ${eventId} AND e.status IN ('posted', 'reversed') GROUP BY e.id, e.is_reversal`.execute(db);
  const rows = r.rows.map((x) => ({ debit: Number(x.debit), rev: x.is_reversal }));
  // Bút toán đảo ghi số âm, bản gốc chuyển 'reversed': cộng thẳng = số đang có hiệu lực.
  return { net: rows.reduce((s, x) => s + x.debit, 0), reversals: rows.filter((x) => x.rev).length };
}

beforeAll(async () => {
  t = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', t.tenantCode).executeTakeFirstOrThrow()).id;
  expect((await call(t, 'POST', '/api/v1/purchase/demo/seed', { password: 'Thuy!@#' })).status).toBe(200);
  await call(t, 'PUT', '/api/v1/partners/NCC-DIEUCHINH', { name: 'NCC điều chỉnh', kind: 'supplier' });
}, 60_000);
afterAll(async () => { await t.app.close(); });

describe('Phiếu mua đã ghi sổ — bản điều chỉnh', () => {
  it('lập điều chỉnh: về nháp, sổ giữ bản cũ; duyệt: đảo bản cũ + ghi bản mới, lịch sử có lý do và thay đổi', async () => {
    const d = await approve(((await call(t, 'POST', '/api/v1/purchase/documents', body(10))).body.data as Doc).id);
    const ev = d.links[0]!.eventId;
    const before = await ledger(ev);
    expect(before.net).toBeGreaterThan(0);

    expect((await call(t, 'POST', `/api/v1/purchase/documents/${d.id}/adjust`, { reason: 'x' })).status).toBe(400); // lý do quá ngắn
    const s = await call(t, 'POST', `/api/v1/purchase/documents/${d.id}/adjust`, { reason: 'NCC giao thêm 2 lon theo biên bản' });
    expect(s.status, JSON.stringify(s.body).slice(0, 400)).toBe(200);
    expect((s.body.data as Doc).status).toBe('draft');
    expect((await ledger(ev)).net).toBe(before.net); // sổ chưa đổi khi đang sửa

    const put = await call(t, 'PUT', `/api/v1/purchase/documents/${d.id}`, body(12));
    expect(put.status, JSON.stringify(put.body).slice(0, 400)).toBe(200);
    expect((await get(d.id)).adjust?.reason).toBe('NCC giao thêm 2 lon theo biên bản'); // ghi nháp giữ thông tin điều chỉnh
    expect((await ledger(ev)).net).toBe(before.net);

    const done = await approve(d.id);
    expect(done.links[0]!.eventId).toBe(ev); // cùng chứng từ kế toán, phiên bản mới
    const after = await ledger(ev);
    expect(after.reversals).toBeGreaterThan(0); // bản cũ được đảo
    expect(after.net).toBeCloseTo(before.net * 1.2, 0); // bản mới 12 lon
    const h = await get(d.id);
    expect(h.adjust).toBeUndefined();
    expect(h.adjustments?.[0]?.reason).toBe('NCC giao thêm 2 lon theo biên bản');
    expect(h.adjustments?.[0]?.changes.length).toBeGreaterThan(0);
  });

  it('huỷ điều chỉnh: phiếu về đúng bản đã duyệt, sổ không đổi', async () => {
    const d = await approve(((await call(t, 'POST', '/api/v1/purchase/documents', body(5, { docDate: '2026-10-09' }))).body.data as Doc).id);
    const ev = d.links[0]!.eventId;
    const before = await ledger(ev);
    expect((await call(t, 'POST', `/api/v1/purchase/documents/${d.id}/adjust`, { reason: 'Thử sửa số lượng' })).status).toBe(200);
    expect((await call(t, 'PUT', `/api/v1/purchase/documents/${d.id}`, body(7, { docDate: '2026-10-09' }))).status).toBe(200);
    expect((await call(t, 'POST', `/api/v1/purchase/documents/${d.id}/cancel`)).status).toBe(409); // đang điều chỉnh: không huỷ phiếu được
    const c = await call(t, 'POST', `/api/v1/purchase/documents/${d.id}/adjust-cancel`);
    expect(c.status, JSON.stringify(c.body).slice(0, 400)).toBe(200);
    const back = c.body.data as Doc;
    expect(back.status).toBe('approved');
    expect(back.lines[0]!.qty).toBe(5);
    expect(back.adjust).toBeUndefined();
    expect(await ledger(ev)).toEqual(before);
  });

  it('đơn đặt hàng không ghi sổ: không lập điều chỉnh được', async () => {
    const o = (await call(t, 'POST', '/api/v1/purchase/documents', { ...body(3), kind: 'order', outsideOrder: undefined })).body.data as Doc;
    const a = await call(t, 'POST', `/api/v1/purchase/documents/${o.id}/approve`);
    expect(a.status, JSON.stringify(a.body).slice(0, 300)).toBe(200);
    const r = await call(t, 'POST', `/api/v1/purchase/documents/${o.id}/adjust`, { reason: 'Đổi số lượng đặt' });
    expect(r.status).toBe(409);
    const list = (await call(t, 'GET', '/api/v1/purchase/documents?kind=order')).body.data as Doc[] | { docs: Doc[] };
    const rows = Array.isArray(list) ? list : list.docs;
    expect(rows.find((x) => x.id === o.id)?.ledger).toBe('none'); // đơn đặt: không ghi sổ
  });

  // [2026-11-26 08:10 PM Nguyễn Văn Thủy] MH06 — phiếu đang điều chỉnh: chưa tính vào doanh số thưởng (số chưa chốt) nhưng báo ra (dangDieuChinh) ở xem trước, tổng hợp thưởng, MH32 (đóng góp)
  it('đang điều chỉnh: tính thưởng chưa cộng phiếu đó nhưng báo rõ phiếu nào, bao nhiêu; huỷ điều chỉnh thì tính lại', async () => {
    await call(t, 'PUT', '/api/v1/partners/NCC-DC-THUONG', { name: 'NCC điều chỉnh thưởng', kind: 'supplier' });
    const pol = await call(t, 'POST', '/api/v1/purchase/policies', { code: 'DC-THUONG', kind: 'period_rebate', name: 'Thưởng tháng thử', scope: { partnerCode: 'NCC-DC-THUONG' }, rule: { period: 'month', tiers: [{ from: 1000000, pct: 2 }] }, validFrom: '2026-10-01', isActive: true });
    expect(pol.status, JSON.stringify(pol.body).slice(0, 300)).toBeLessThan(300);
    const d = await approve(((await call(t, 'POST', '/api/v1/purchase/documents', body(10, { partnerCode: 'NCC-DC-THUONG', docDate: '2026-10-10' }))).body.data as Doc).id);
    const xem = async () => (await call(t, 'POST', '/api/v1/purchase/rebates/preview', { policyCode: 'DC-THUONG', period: '2026-10' })).body.data as { base: number; amount: number; dangDieuChinh: { id: string; value: number }[] };
    const truoc = await xem();
    expect(truoc.base).toBeGreaterThan(0);
    expect(truoc.dangDieuChinh).toEqual([]);
    expect((await call(t, 'POST', `/api/v1/purchase/documents/${d.id}/adjust`, { reason: 'Sửa giá theo biên bản' })).status).toBe(200);
    const dang = await xem();
    expect(dang.base).toBe(0); // chưa tính: số chưa chốt
    expect(dang.dangDieuChinh.map((x) => x.id)).toEqual([d.id]);
    expect(dang.dangDieuChinh[0]!.value).toBe(Math.round(truoc.base)); // báo đúng số đang treo
    const tong = (await call(t, 'GET', '/api/v1/purchase/rebates/overview?month=2026-10')).body.data as { policy: string; dangDieuChinh?: unknown[] }[];
    expect(tong.find((x) => x.policy === 'DC-THUONG')?.dangDieuChinh).toHaveLength(1);
    const th = (await call(t, 'GET', '/api/v1/purchase/policy-execution?from=2026-10-01&to=2026-10-31')).body.data as { policy: string; docs: { docId: string; note: string }[] }[];
    expect(th.find((x) => x.policy === 'DC-THUONG')?.docs.some((x) => x.docId === d.id && x.note.includes('đang điều chỉnh'))).toBe(true);
    expect((await call(t, 'POST', `/api/v1/purchase/documents/${d.id}/adjust-cancel`)).status).toBe(200);
    const sau = await xem();
    expect(sau.base).toBe(truoc.base);
    expect(sau.dangDieuChinh).toEqual([]);
  });
});
