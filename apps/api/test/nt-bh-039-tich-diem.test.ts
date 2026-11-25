// [2026-11-25 09:30 PM Võ Hoàng] NGHIEM-THU — test tích hợp phiếu NT-BH-039: khai chính sách tích điểm ở kế toán, điều chỉnh điểm tay có duyệt (đóng góp)
/**
 * NT-BH-039 — chính sách tích điểm khai và duyệt ở open-ketoan (module loyalty): nháp theo cửa hàng ("Sửa từ bản hiện hành") → gửi duyệt → người
 * khác có quyền duyệt = phát hành (dòng programs mới, phiên bản = băm nội dung); áp nhiều cửa hàng một lần; website đẩy bản cũ hơn bị từ chối;
 * điều chỉnh điểm tay có duyệt. 9 ca §3 của docs/nghiem-thu/ban-hang/NT-BH-039-tich-diem-khai-o-ke-toan.md + bản đồ lỗi R-REV-17.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runModuleMigrations } from '@bizcity/platform/db/module-db';
import { dispatchOnce } from '@bizcity/platform/core/events';
import { buildApp } from '../src/app.js';
import { syncBundled } from '../src/core/module-lifecycle.js';
import { db } from '../src/db/client.js';
import { call as callCtx, setupTenant, type TestCtx } from './helpers.js';
import { khaiGia, nhapTon } from './pos-nhap-ton.js';

const POS = fileURLToPath(new URL('../../../modules/pos/', import.meta.url));
const LOY = fileURLToPath(new URL('../../../modules/loyalty/', import.meta.url));
const HAS = existsSync(path.join(POS, 'bizcity.module.json')) && existsSync(path.join(LOY, 'bizcity.module.json'));
const POS_READS = ['bizcity_read.branches', 'bizcity_read.products', 'bizcity_read.tax_codes', 'bizcity_read.payment_methods', 'bizcity_read.partners', 'bizcity_read.stock_on_hand', 'bizcity_read.warehouses'];
const L = '/api/v1/m/loyalty';
const SKU = '100021001';
const GIFT = '100099001Z';
const PHONE = '0903900001';
const SILVER = '0903900002';

const vnDate = (offset = 0) => new Date(Date.now() + 7 * 3600_000 + offset * 86_400_000).toISOString().slice(0, 10);
const TODAY = vnDate();
let n = 0;
const oid = () => `0193a1b2-0000-7000-8000-0000003900${String(++n).padStart(2, '0')}`;
const order = (branchCode: string, customer: Record<string, unknown>, over: Record<string, unknown> = {}) => ({
  id: oid(), branchCode, businessDate: TODAY, shiftId: `ngay-${TODAY}`, exportReasonCode: 'XBA', customer,
  lines: [{ lineId: 'l1', sku: SKU, unitName: 'Lon', unitQty: 1, clientUnitPrice: 325_000 }],
  promotionSelections: [], payment: { mode: 'cash', cashGiven: 325_000 }, clientTotal: 325_000, coreVersion: '0.1.0', promotionsVersion: '', ...over,
});

type Policy = { id: number; code: string; title: string; type: number; priority: number; status: number; autoApply: boolean; startDate: number; endDate: number; applyToBlogIds: number[]; rules: Record<string, unknown> };
type Content = { settings: Record<string, unknown>; tiers: { key: string; name: string; minPoints: number; multiplier: number }[]; policies: Policy[] };
const policy = (id: number, code: string, type: number, rules: Record<string, unknown>, title = code): Policy =>
  ({ id, code, title, type, priority: id, status: 1, autoApply: true, startDate: 0, endDate: 0, applyToBlogIds: [], rules });
// Bản website đang chạy ở CN02 / CN01: chỉ có thưởng đơn lớn; hạng ×1 / ×1,2; chưa bật nhân điểm theo hạng.
const WEB = {
  version: 'web-1',
  settings: { enablePosEarn: true, enablePosRedeem: true, enableTierMultiplier: false, minRedeemPoints: 0, pointLabel: 'điểm' },
  tiers: [{ key: 'member', name: 'Thành viên', minPoints: 0, multiplier: 1 }, { key: 'silver', name: 'Bạc', minPoints: 1000, multiplier: 1.2 }],
  policies: [policy(2, 'THUONG1TR', 4, { point_expiry_days: 365, rules: [{ min_amount: 1000000, bonus_points: 20 }] }, 'Đơn từ 1.000.000đ thưởng 20 điểm')],
};
const TICH10K = policy(1, 'TICH10K', 1, { earn_rate: 1, earn_unit: 10000, point_expiry_days: 365 }, '1 điểm / 10.000đ');

describe.skipIf(!HAS)('NT-BH-039 — khai chính sách tích điểm ở kế toán', () => {
  let owner: TestCtx;
  let A: TestCtx; // kế toán: lập / sửa, không có quyền duyệt
  let B: TestCtx; // kế toán trưởng: duyệt
  let app: FastifyInstance;
  let tenantId = '';
  let k = 0;
  const req = (who: TestCtx, method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) => app.inject({
    method, url, ...(payload ? { payload: payload as never } : {}),
    headers: { authorization: `Bearer ${who.token}`, ...(method === 'GET' ? {} : { 'idempotency-key': `nt-bh-039-${++k}-${Date.now()}` }) },
  });
  const deliver = () => dispatchOnce({ tenantId, consumers: ['loyalty.order-earn', 'loyalty.return-reverse'] });
  const points = async (c: string, branch = 'CN02') => (await req(owner, 'GET', `${L}/customers/${c}?branch=${branch}`)).json().data;
  const current = async (branch: string) => (await req(owner, 'GET', `${L}/program?branch=${branch}`)).json().data;
  /** A sửa từ bản hiện hành của cửa hàng, đổi nội dung, gửi duyệt; trả nháp chờ duyệt. */
  const draftFor = async (branch: string, edit: (c: Content) => Content) => {
    const c = await req(A, 'POST', `${L}/program-drafts`, { branchCodes: [branch] });
    expect(c.statusCode, c.body).toBe(200);
    const d = c.json().data.items[0];
    const u = await req(A, 'PUT', `${L}/program-drafts/${d.id}`, { program: edit(d.program), revision: d.revision, submit: true });
    expect(u.statusCode, u.body).toBe(200);
    return u.json().data;
  };
  const approve = async (ids: string[]) => {
    const r = await req(B, 'POST', `${L}/program-drafts/approve`, { ids });
    expect(r.statusCode, r.body).toBe(200);
    return r.json().data.items;
  };
  const login = async (email: string, fullName: string, role: string) => {
    expect((await callCtx(owner, 'POST', '/api/v1/users', { email, fullName, role, password: 'Pass@12345' })).status).toBe(201);
    const r = await owner.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: owner.tenantCode, email, password: 'Pass@12345' } });
    return { ...owner, token: r.json().data.token as string };
  };

  beforeAll(async () => {
    owner = await setupTenant();
    tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', owner.tenantCode).executeTakeFirstOrThrow()).id;
    await runModuleMigrations('pos', path.join(POS, 'migrations'), { reads: POS_READS });
    await runModuleMigrations('loyalty', path.join(LOY, 'migrations'), { reads: ['bizcity_read.partners', 'bizcity_read.branches', 'bizcity_read.products'] });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:nt-bh-039', trx as never); });
    app = await buildApp();
    A = await login('ketoan039@ketoan.local', 'Kế toán A', 'accountant');
    B = await login('ktt039@ketoan.local', 'Kế toán trưởng B', 'chief_accountant');
    expect((await callCtx(owner, 'POST', '/api/v1/branches', { code: 'CN02', name: 'Cửa hàng 02' })).status).toBeLessThan(300);
    const put = await callCtx(owner, 'PUT', '/api/v1/products', { products: [
      { sku: SKU, name: 'Sữa bột Biomil Plus 1 400g', unit: 'Lon', taxOutCode: 'R08' }, { sku: GIFT, name: 'Bình sữa', unit: 'Cái', taxOutCode: 'R08' },
    ] });
    expect(put.status, JSON.stringify(put.body)).toBeLessThan(300);
    expect((await callCtx(owner, 'PUT', `/api/v1/products/${SKU}`, { taxOutCode: 'R08' })).status).toBe(200);
    expect((await callCtx(owner, 'POST', '/api/v1/partners', { code: SILVER, name: 'Khách hạng bạc' })).status).toBeLessThan(300);
    await nhapTon(owner, 'CN02', [[SKU, 100, 'Lon']]);
    await khaiGia(tenantId, [[SKU, 'Lon', 325_000]]);
    for (const b of ['CN01', 'CN02']) {
      const r = await req(owner, 'POST', `${L}/program`, { branchCode: b, storeId: 0, program: WEB });
      expect(r.statusCode, r.body).toBe(200);
    }
  });
  afterAll(async () => {
    await app?.close();
    await owner?.app.close();
  });

  let draftId = '';
  it('ca 1: A sửa từ bản hiện hành CN02 (chép nguyên bản website), thêm "1 điểm / 10.000đ, hạn 365 ngày", gửi duyệt → chờ duyệt; máy bán vẫn bản cũ', async () => {
    const c = await req(A, 'POST', `${L}/program-drafts`, { branchCodes: ['CN02'] });
    expect(c.statusCode, c.body).toBe(200);
    const d = c.json().data.items[0];
    expect(d).toMatchObject({ branchCode: 'CN02', status: 'draft', baseVersion: 'web-1', revision: 1 });
    expect(d.program).toEqual({ settings: WEB.settings, tiers: WEB.tiers, policies: WEB.policies }); // Q3: chép đủ
    draftId = d.id;
    // Lưu nháp (revision 1 → 2); màn khác còn giữ revision 1 lưu đè → CONFLICT LOYALTY_DRAFT_CHANGED (Q-CHUNG-03).
    const s = await req(A, 'PUT', `${L}/program-drafts/${draftId}`, { program: { ...d.program, policies: [TICH10K, ...d.program.policies] }, revision: 1 });
    expect(s.json().data).toMatchObject({ status: 'draft', revision: 2 });
    const stale = await req(B, 'PUT', `${L}/program-drafts/${draftId}`, { program: d.program, revision: 1 });
    expect(stale.statusCode, stale.body).toBe(409);
    expect(stale.json().error.details.reason).toBe('LOYALTY_DRAFT_CHANGED');
    expect(stale.json().error.message).toMatch(/^Nháp đã đổi lúc .+ bởi Kế toán A — tải lại/);
    const sub = await req(A, 'PUT', `${L}/program-drafts/${draftId}`, { program: { ...d.program, policies: [TICH10K, ...d.program.policies] }, revision: 2, submit: true });
    expect(sub.json().data).toMatchObject({ status: 'pending', revision: 3 });
    expect((await current('CN02')).version).toBe('web-1');
  });

  it('ca 3: A tự duyệt (không có quyền duyệt) → 403; chủ đơn vị lập rồi tự duyệt → 403 FORBIDDEN (người lập không tự duyệt)', async () => {
    const self = await req(A, 'POST', `${L}/program-drafts/approve`, { ids: [draftId] });
    expect(self.statusCode, self.body).toBe(403);
    expect((await current('CN02')).version).toBe('web-1');
    const own = await req(owner, 'POST', `${L}/program-drafts`, { branchCodes: ['CN01'], submit: true });
    expect(own.statusCode, own.body).toBe(200);
    const ownId = own.json().data.items[0].id;
    const r = await req(owner, 'POST', `${L}/program-drafts/approve`, { ids: [ownId] });
    expect(r.statusCode, r.body).toBe(403);
    expect(r.json().error.code).toBe('FORBIDDEN');
    // Người khác (B) duyệt được nháp của chủ đơn vị: CN01 chuyển sang bản kế toán phát hành (nội dung như bản website).
    expect((await approve([ownId]))[0].status).toBe('published');
  });

  it('ca 2: B duyệt → programs CN02 có phiên bản mới (băm nội dung, người nhận = B); đơn 325.000 có khách → +32 điểm', async () => {
    const [pub] = await approve([draftId]);
    expect(pub).toMatchObject({ status: 'published', approvedByName: 'Kế toán trưởng B', publishedVersion: expect.stringMatching(/^kt-[0-9a-f]{16}$/) });
    const cur = await current('CN02');
    expect(cur.version).toBe(pub.publishedVersion);
    expect(cur.policies.map((p: Policy) => p.code)).toEqual(['TICH10K', 'THUONG1TR']);
    const row = (await sql<{ received_by: string }>`SELECT received_by FROM mod_loyalty.programs WHERE tenant_id = ${tenantId} AND branch_code = 'CN02' AND version = ${pub.publishedVersion}`.execute(db)).rows[0];
    expect(row?.received_by).toBe('Kế toán trưởng B');
    const log = (await req(A, 'GET', `${L}/program-drafts/${draftId}`)).json().data.log as { action: string; actorName: string }[];
    expect(log.map((l) => `${l.action}:${l.actorName}`)).toEqual(['create:Kế toán A', 'update:Kế toán A', 'submit:Kế toán A', 'approve:Kế toán trưởng B']);
    // Bản đã phát hành không sửa (Q-CHUNG-02).
    const again = await req(A, 'PUT', `${L}/program-drafts/${draftId}`, { program: pub.program, revision: pub.revision });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.details.reason).toBe('LOYALTY_DRAFT_STATE');

    const r = await req(owner, 'POST', '/api/v1/m/pos/orders', order('CN02', { phone: PHONE, name: 'Chị Lan' }));
    expect(r.statusCode, r.body).toBe(201);
    await deliver();
    expect(await points(PHONE)).toMatchObject({ balance: 32, tierKey: 'member' });
  });

  it('ca 4: bật nhân điểm theo hạng; khách tổng tích 1.200 (hạng Bạc ×1,2) mua 325.000 → +38,4 điểm', async () => {
    const d = await draftFor('CN02', (c) => ({ ...c, settings: { ...c.settings, enableTierMultiplier: true } }));
    await approve([d.id]);
    const op = await req(owner, 'POST', `${L}/opening`, { asOf: vnDate(-1), rows: [{ customerCode: SILVER, totalEarned: 1200, balance: 1200 }] });
    expect(op.statusCode, op.body).toBe(200);
    expect((await points(SILVER)).tierKey).toBe('silver');
    const r = await req(owner, 'POST', '/api/v1/m/pos/orders', order('CN02', { partnerId: SILVER }));
    expect(r.statusCode, r.body).toBe(201);
    await deliver();
    const earn = (await sql<{ points: string }>`SELECT points FROM mod_loyalty.entries WHERE tenant_id = ${tenantId} AND partner_code = ${SILVER} AND kind = 'earn' AND ref_type = 'order'`.execute(db)).rows;
    expect(earn.map((e) => Number(e.points))).toEqual([38.4]);
    expect((await points(SILVER)).balance).toBe(1238.4);
  });

  it('ca 5: thêm quà "Bình sữa" 200 điểm, hạng tối thiểu Bạc → khách hạng Thành viên đổi bị từ chối "chưa đủ hạng"', async () => {
    const reward = { reward_code: 'BINHSUA', name: 'Bình sữa', sku: GIFT, quantity: 1, points_required: 200, min_tier: 'silver' };
    const d = await draftFor('CN02', (c) => ({ ...c, policies: [...c.policies, policy(5, 'DOIQUA', 5, { rules: { rewards: [reward] } }, 'Đổi quà')] }));
    await approve([d.id]);
    const r = await req(owner, 'POST', '/api/v1/m/pos/orders', order('CN02', { partnerId: PHONE }, { loyalty: { redeem: ['lp_5_binhsua'] } }));
    expect(r.statusCode, r.body).toBe(400);
    expect(r.json().error.message).toContain('Phần thưởng Bình sữa chưa đủ hạng: cần hạng Bạc, khách đang hạng Thành viên');
  });

  let adjId = '';
  it('ca 6: điều chỉnh tay +50 "Bù đơn lỗi", A lập, B duyệt → sổ điểm có dòng adjust +50, số dư +50, nhật ký A lập / B duyệt', async () => {
    const before = (await points(PHONE)).balance as number;
    const c = await req(A, 'POST', `${L}/adjustments`, { customerCode: PHONE, points: 50, reason: 'Bù đơn lỗi', branchCode: 'CN02' });
    expect(c.statusCode, c.body).toBe(200);
    adjId = c.json().data.id;
    expect(c.json().data).toMatchObject({ status: 'pending', points: 50, createdByName: 'Kế toán A' });
    expect((await points(PHONE)).balance).toBe(before); // chưa duyệt chưa ghi sổ
    const a = await req(B, 'POST', `${L}/adjustments/${adjId}/approve`, {});
    expect(a.statusCode, a.body).toBe(200);
    expect(a.json().data).toMatchObject({ status: 'approved', approvedByName: 'Kế toán trưởng B' });
    const rows = (await sql<{ kind: string; points: string; note: string; ref_type: string }>`
      SELECT kind, points, note, ref_type FROM mod_loyalty.entries WHERE tenant_id = ${tenantId} AND partner_code = ${PHONE} AND kind = 'adjust'`.execute(db)).rows;
    expect(rows.map((r) => [r.kind, Number(r.points), r.note, r.ref_type])).toEqual([['adjust', 50, 'Bù đơn lỗi', 'manual']]);
    expect((await points(PHONE)).balance).toBe(before + 50);
    const log = (await req(A, 'GET', `${L}/adjustments/${adjId}`)).json().data.log as { action: string; actorName: string }[];
    expect(log.map((l) => `${l.action}:${l.actorName}`)).toEqual(['create:Kế toán A', 'approve:Kế toán trưởng B']);
    // Bấm duyệt lại (khoá khác) → không ghi thêm.
    const twice = await req(B, 'POST', `${L}/adjustments/${adjId}/approve`, {});
    expect(twice.statusCode).toBe(409);
    expect(twice.json().error.details.reason).toBe('LOYALTY_ADJUST_STATE');
  });

  it('ca 7: A lập rồi tự duyệt → bị chặn; chủ đơn vị (có quyền duyệt) tự duyệt yêu cầu của mình → FORBIDDEN; trừ quá số dư → LOYALTY_ADJUST_OVER_BALANCE', async () => {
    const c = await req(A, 'POST', `${L}/adjustments`, { customerCode: PHONE, points: 10, reason: 'Thử tự duyệt' });
    const self = await req(A, 'POST', `${L}/adjustments/${c.json().data.id}/approve`, {});
    expect(self.statusCode, self.body).toBe(403);
    const o = await req(owner, 'POST', `${L}/adjustments`, { customerCode: PHONE, points: 10, reason: 'Chủ tự lập' });
    const own = await req(owner, 'POST', `${L}/adjustments/${o.json().data.id}/approve`, {});
    expect(own.statusCode, own.body).toBe(403);
    expect(own.json().error.code).toBe('FORBIDDEN');
    const bal = (await points(PHONE)).available as number;
    const over = await req(A, 'POST', `${L}/adjustments`, { customerCode: PHONE, points: -(bal + 1), reason: 'Trừ quá' });
    expect(over.statusCode, over.body).toBe(400);
    expect(over.json().error.details.findings[0].code).toBe('LOYALTY_ADJUST_OVER_BALANCE');
    expect(over.json().error.fields).toEqual([expect.objectContaining({ path: 'points' })]);
    // Lập lúc còn đủ, duyệt lúc đã thiếu → chặn ở bước duyệt (không để số dư âm).
    const ok = await req(A, 'POST', `${L}/adjustments`, { customerCode: PHONE, points: -bal, reason: 'Trừ hết' });
    const first = await req(A, 'POST', `${L}/adjustments`, { customerCode: PHONE, points: -1, reason: 'Trừ 1' });
    expect((await req(B, 'POST', `${L}/adjustments/${first.json().data.id}/approve`, {})).statusCode).toBe(200);
    const late = await req(B, 'POST', `${L}/adjustments/${ok.json().data.id}/approve`, {});
    expect(late.statusCode, late.body).toBe(409);
    expect(late.json().error.details.reason).toBe('LOYALTY_ADJUST_OVER_BALANCE');
    // Thiếu lý do + số 0 + khách lạ → trả mọi lỗi một lần (Q-CHUNG-06).
    const bad = await req(A, 'POST', `${L}/adjustments`, { customerCode: 'KHONGCO', points: 0, reason: ' ' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.fields.map((f: { path: string }) => f.path).sort()).toEqual(['customerCode', 'points', 'reason']);
    expect(bad.json().error.details.findings.map((f: { code: string }) => f.code)).toContain('LOYALTY_CUSTOMER_UNKNOWN');
  });

  it('ca 8: áp chính sách cho CN01, CN02 một lần → hai bản nháp; cửa hàng đã có nháp mở → LOYALTY_DRAFT_OPEN; duyệt cùng lúc', async () => {
    const apply = { settings: WEB.settings, tiers: WEB.tiers, policies: [policy(9, 'SINHNHAT', 4, { rules: [{ min_amount: 0, bonus_points: 5 }] }, 'Thưởng 5 điểm mọi đơn')] };
    const c = await req(A, 'POST', `${L}/program-drafts`, { branchCodes: ['CN01', 'CN02'], program: apply, submit: true });
    expect(c.statusCode, c.body).toBe(200);
    const items = c.json().data.items as { id: string; branchCode: string; batchId: string; status: string; program: Content }[];
    expect(items.map((d) => [d.branchCode, d.status])).toEqual([['CN01', 'pending'], ['CN02', 'pending']]);
    expect(items[0]!.batchId).toBe(items[1]!.batchId);
    // CN02 giữ chính sách riêng đã phát hành, thêm SINHNHAT; CN01 thêm vào bản website.
    expect(items[1]!.program.policies.map((p) => p.code)).toEqual(['TICH10K', 'THUONG1TR', 'DOIQUA', 'SINHNHAT']);
    expect(items[0]!.program.policies.map((p) => p.code)).toEqual(['THUONG1TR', 'SINHNHAT']);
    const dup = await req(A, 'POST', `${L}/program-drafts`, { branchCodes: ['CN01'] });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.details.reason).toBe('LOYALTY_DRAFT_OPEN');
    const pub = await approve(items.map((d) => d.id));
    expect(pub.map((d: { status: string }) => d.status)).toEqual(['published', 'published']);
    expect((await current('CN01')).policies.map((p: Policy) => p.code)).toContain('SINHNHAT');
    expect((await current('CN02')).policies.map((p: Policy) => p.code)).toContain('SINHNHAT');
  });

  it('ca 9: website đẩy tay bản cũ hơn bản kế toán đã phát hành → không đè, báo "kế toán có bản mới hơn"; gửi lại bản đang chạy vẫn không đổi', async () => {
    const before = await current('CN02');
    const old = await req(owner, 'POST', `${L}/program`, { branchCode: 'CN02', storeId: 0, program: WEB });
    expect(old.statusCode, old.body).toBe(409);
    expect(old.json().error.details.reason).toBe('LOYALTY_PROGRAM_OLDER');
    expect(old.json().error.message).toContain('Kế toán có bản mới hơn cho cửa hàng CN02');
    const other = await req(owner, 'POST', `${L}/program`, { branchCode: 'CN02', storeId: 0, program: { ...WEB, version: 'web-2', updatedAt: '2026-01-01T00:00:00Z' } });
    expect(other.json().error.details.reason).toBe('LOYALTY_PROGRAM_OLDER');
    expect((await current('CN02')).version).toBe(before.version);
    const same = await req(owner, 'POST', `${L}/program`, { branchCode: 'CN02', storeId: 0, program: before });
    expect(same.json().data).toEqual({ branchCode: 'CN02', version: before.version, changed: false });
    // Website sửa SAU lúc kế toán duyệt (updatedAt mới hơn) → nhận.
    const newer = await req(owner, 'POST', `${L}/program`, { branchCode: 'CN02', storeId: 0, program: { ...WEB, version: 'web-3', updatedAt: new Date(Date.now() + 60_000).toISOString() } });
    expect(newer.json().data).toMatchObject({ version: 'web-3', changed: true });
  });

  it('R-REV-17: gửi duyệt trả mọi lỗi một lần, chỉ đúng ô — trùng mã, bỏ chính sách đã phát hành, quà không có ở danh mục', async () => {
    const c = await req(A, 'POST', `${L}/program-drafts`, { branchCodes: ['CN01'] });
    const d = c.json().data.items[0];
    const pols = d.program.policies as Policy[];
    const bad = {
      ...d.program,
      policies: [
        ...pols.filter((p) => p.code !== 'THUONG1TR'),
        policy(20, 'SINHNHAT', 1, { earn_rate: 1, earn_unit: 0 }),
        policy(21, 'QUA', 5, { rules: { rewards: [{ reward_code: 'X', name: 'Quà lạ', sku: 'KHONGCO', points_required: 10 }] } }),
      ],
    };
    const r = await req(A, 'PUT', `${L}/program-drafts/${d.id}`, { program: bad, revision: d.revision, submit: true });
    expect(r.statusCode, r.body).toBe(400);
    const codes = (r.json().error.details.findings as { code: string; field: string }[]).map((f) => `${f.code}@${f.field}`);
    expect(codes).toEqual(expect.arrayContaining([
      'LOYALTY_POLICY_CODE_DUP@policies.1.code', 'LOYALTY_FIELD_REQUIRED@policies.1.rules.earn_unit',
      'LOYALTY_ITEM_INACTIVE@policies.2.rules.rules.rewards.0.sku', 'LOYALTY_POLICY_REMOVED@policies',
    ]));
    expect(r.json().error.fields.length).toBeGreaterThanOrEqual(4);
    // Lưu nháp vẫn chặn trùng mã (Q-DM-02), cho phép ô còn trống.
    const save = await req(A, 'PUT', `${L}/program-drafts/${d.id}`, { program: bad, revision: d.revision });
    expect(save.statusCode).toBe(400);
    expect(save.json().error.details.findings.map((f: { code: string }) => f.code)).toContain('LOYALTY_POLICY_CODE_DUP');
    // A không có quyền duyệt → không từ chối được nháp.
    expect((await req(A, 'POST', `${L}/program-drafts/reject`, { ids: [d.id], reason: 'x' })).statusCode).toBe(403);
  });
});
