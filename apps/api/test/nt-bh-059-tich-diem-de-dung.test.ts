// [2026-11-28 02:30 PM Võ Hoàng] NGHIEM-THU — test tích hợp phiếu NT-BH-059: khai chương trình tích điểm theo luồng, áp Tất cả / chọn cửa hàng, tự lập tự duyệt (đóng góp)
/**
 * NT-BH-059 — một chương trình (theo mã) lưu cho Tất cả / các cửa hàng chọn qua POST /policies/save: rải vào nháp từng cửa hàng, cửa hàng bỏ
 * khỏi phạm vi thì ngừng ở đó; người có quyền duyệt phát hành ngay (tự lập tự duyệt); người chỉ có quyền lập thì gửi duyệt; phạm vi cửa hàng
 * áp đúng ở bộ tính (đơn máy bán cửa hàng ngoài phạm vi không tích theo chương trình).
 */
import { existsSync, readFileSync } from 'node:fs';
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
const POS_READS: string[] = HAS ? (JSON.parse(readFileSync(path.join(POS, 'bizcity.module.json'), 'utf8')) as { data: { reads: string[] } }).data.reads : [];
const L = '/api/v1/m/loyalty';
const SKU = '100021001';
const vnDate = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const TODAY = vnDate();
let n = 0;
const oid = () => `0193a1b2-0000-7000-8000-0000005900${String(++n).padStart(2, '0')}`;
const order = (branchCode: string, phone: string) => ({
  id: oid(), branchCode, businessDate: TODAY, shiftId: `ngay-${TODAY}`, exportReasonCode: 'XBA', customer: { phone, name: 'Khách thử 059' },
  lines: [{ lineId: 'l1', sku: SKU, unitName: 'Lon', unitQty: 1, clientUnitPrice: 325_000 }],
  promotionSelections: [], payment: { mode: 'cash', cashGiven: 325_000 }, clientTotal: 325_000, coreVersion: '0.1.0', promotionsVersion: '',
});
const TICH = { id: 1, code: 'TD_1126_01', title: '1 điểm / 10.000đ', type: 1, priority: 1, status: 1, autoApply: true, startDate: 0, endDate: 0, applyToBlogIds: [],
  rules: { earn_rate: 1, earn_unit: 10000, point_expiry_days: 365 } };

describe.skipIf(!HAS)('NT-BH-059 — chương trình tích điểm theo luồng, áp Tất cả / chọn cửa hàng', () => {
  let owner: TestCtx;
  let A: TestCtx; // chỉ có quyền lập (không duyệt)
  let app: FastifyInstance;
  let tenantId = '';
  let k = 0;
  const req = (who: TestCtx, method: 'GET' | 'POST', url: string, payload?: unknown) => app.inject({
    method, url, ...(payload ? { payload: payload as never } : {}),
    headers: { authorization: `Bearer ${who.token}`, ...(method === 'GET' ? {} : { 'idempotency-key': `nt-bh-059-${++k}-${Date.now()}` }) },
  });
  const save = (who: TestCtx, body: unknown) => req(who, 'POST', `${L}/policies/save`, body);
  const overview = async () => (await req(owner, 'GET', `${L}/policies`)).json().data as {
    branches: { code: string }[]; pending: number;
    policies: { code: string; state: string; allBranches: boolean; uses: { branchCode: string; state: string }[] }[];
    settings: { branchCode: string; settings: { pointLabel: string } | null }[];
  };
  const current = async (branch: string) => (await req(owner, 'GET', `${L}/program?branch=${branch}`)).json().data;
  const points = async (phone: string, branch: string) => (await req(owner, 'GET', `${L}/customers/${phone}?branch=${branch}`)).json().data;

  beforeAll(async () => {
    owner = await setupTenant();
    tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', owner.tenantCode).executeTakeFirstOrThrow()).id;
    await runModuleMigrations('pos', path.join(POS, 'migrations'), { reads: POS_READS });
    await runModuleMigrations('loyalty', path.join(LOY, 'migrations'), { reads: ['bizcity_read.partners', 'bizcity_read.branches', 'bizcity_read.products'] });
    await db.transaction().execute(async (trx) => { await sql`SET LOCAL ROLE NONE`.execute(trx); await syncBundled('test:nt-bh-059', trx as never); });
    app = await buildApp();
    for (const [code, name] of [['CN02', 'Cửa hàng 02'], ['CN03', 'Cửa hàng 03']]) {
      expect((await callCtx(owner, 'POST', '/api/v1/branches', { code, name })).status).toBeLessThan(300);
    }
    const put = await callCtx(owner, 'PUT', '/api/v1/products', { products: [{ sku: SKU, name: 'Sữa bột Biomil Plus 1 400g', unit: 'Lon', taxOutCode: 'R08' }] });
    expect(put.status, JSON.stringify(put.body)).toBeLessThan(300);
    expect((await callCtx(owner, 'PUT', `/api/v1/products/${SKU}`, { taxOutCode: 'R08' })).status).toBe(200);
    for (const b of ['CN02', 'CN03']) await nhapTon(owner, b, [[SKU, 50, 'Lon']]);
    await khaiGia(tenantId, [[SKU, 'Lon', 325_000]]);
    // A: vai trò chỉ có quyền lập / sửa chính sách (không duyệt).
    const u = await callCtx(owner, 'POST', '/api/v1/users', { email: 'ketoan059@ketoan.local', fullName: 'Kế toán 059', role: 'accountant', password: 'Pass@12345' });
    expect(u.status).toBe(201);
    const role = await callCtx(owner, 'POST', '/api/v1/roles', { code: 'lap_diem_059', label: 'Lập chính sách điểm', kind: 'privilege', reason: 'NT-BH-059' });
    for (const permission of ['loyalty:chinh-sach-lap', 'loyalty:chinh-sach-sua']) {
      expect((await callCtx(owner, 'POST', `/api/v1/roles/${role.body.data.id}/rules`, { permission, effect: 'allow', reason: 'NT-BH-059' })).status).toBe(201);
    }
    expect((await callCtx(owner, 'POST', `/api/v1/users/${u.body.data.id}/roles`, { tenantRoleId: role.body.data.id, reason: 'NT-BH-059' })).status).toBe(201);
    const r = await owner.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: owner.tenantCode, email: 'ketoan059@ketoan.local', password: 'Pass@12345' } });
    A = { ...owner, token: r.json().data.token as string };
  });
  afterAll(async () => {
    await app?.close();
    await owner?.app.close();
  });

  it('ca 1: chủ đơn vị (có quyền duyệt) lưu chương trình cho Tất cả cửa hàng, Duyệt ngay → phát hành ở mọi cửa hàng, tổng hợp "áp tất cả, đang áp"', async () => {
    const r = await save(owner, { policy: TICH, target: { all: true, branchCodes: [] }, mode: 'approve' });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().data).toMatchObject({ published: true, stopped: [] });
    const branches = (await overview()).branches.map((b) => b.code);
    expect(r.json().data.targets.sort()).toEqual(branches.sort());
    for (const b of branches) {
      const cur = await current(b);
      expect(cur.policies.map((p: { code: string }) => p.code)).toContain('TD_1126_01');
    }
    const p = (await overview()).policies.find((x) => x.code === 'TD_1126_01')!;
    expect(p).toMatchObject({ state: 'active', allBranches: true });
  });

  it('ca 2: đổi phạm vi sang chọn CN02 → CN03 (và các cửa hàng khác) ngừng chương trình; đơn CN02 tích 32 điểm, đơn CN03 không tích', async () => {
    const r = await save(owner, { policy: TICH, target: { all: false, branchCodes: ['CN02'] }, mode: 'approve' });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().data.stopped).toContain('CN03');
    const c3 = (await current('CN03')).policies.find((p: { code: string }) => p.code === 'TD_1126_01');
    expect(c3.status).toBe(0);
    const p = (await overview()).policies.find((x) => x.code === 'TD_1126_01')!;
    expect(p.allBranches).toBe(false);
    expect(p.uses.find((u) => u.branchCode === 'CN03')!.state).toBe('stopped');
    expect(p.uses.find((u) => u.branchCode === 'CN02')!.state).toBe('active');
    for (const [b, phone] of [['CN02', '0905900001'], ['CN03', '0905900002']] as const) {
      const o = await callCtx(owner, 'POST', '/api/v1/m/pos/orders', order(b, phone));
      expect(o.status, JSON.stringify(o.body)).toBeLessThan(300);
    }
    await dispatchOnce({ tenantId, consumers: ['loyalty.order-earn'] });
    expect((await points('0905900001', 'CN02')).balance).toBe(32);
    expect((await points('0905900002', 'CN03')).balance ?? 0).toBe(0);
  });

  it('ca 3: người chỉ có quyền lập bấm Duyệt ngay → 403; Gửi duyệt → nháp chờ duyệt, máy bán chưa đổi; chủ đơn vị duyệt ở danh sách chờ', async () => {
    const edit = { ...TICH, title: '2 điểm / 10.000đ', rules: { ...TICH.rules, earn_rate: 2 } };
    const denied = await save(A, { policy: edit, target: { all: false, branchCodes: ['CN02'] }, mode: 'approve' });
    expect(denied.statusCode, denied.body).toBe(403);
    expect(denied.json().error.code).toBe('FORBIDDEN');
    const sub = await save(A, { policy: edit, target: { all: false, branchCodes: ['CN02'] }, mode: 'submit' });
    expect(sub.statusCode, sub.body).toBe(200);
    const cn02 = (sub.json().data.items as { id: string; branchCode: string; status: string }[]).find((d) => d.branchCode === 'CN02')!;
    expect(cn02).toMatchObject({ status: 'pending' });
    const ov = await overview();
    expect(ov.pending).toBeGreaterThanOrEqual(1);
    expect(ov.policies.find((x) => x.code === 'TD_1126_01')!.state).toBe('pending');
    expect((await current('CN02')).policies.find((p: { code: string }) => p.code === 'TD_1126_01').rules.earn_rate).toBe(1);
    const ap = await req(owner, 'POST', `${L}/program-drafts/approve`, { ids: [cn02.id] });
    expect(ap.statusCode, ap.body).toBe(200);
    expect((await current('CN02')).policies.find((p: { code: string }) => p.code === 'TD_1126_01').rules.earn_rate).toBe(2);
  });

  it('ca 4: gửi duyệt thiếu ô → 400 một lần, đường dẫn ô theo form (policies.0.*); không cửa hàng nào → lỗi ô target', async () => {
    const bad = { ...TICH, code: 'TD_1126_02', title: '', rules: { earn_rate: 1, earn_unit: 0 } };
    const r = await save(owner, { policy: bad, target: { all: true, branchCodes: [] }, mode: 'submit' });
    expect(r.statusCode, r.body).toBe(400);
    const fields = (r.json().error.details.findings as { field: string }[]).map((f) => f.field);
    expect(r.json().error.code).toBe('VALIDATION_ERROR');
    expect(fields).toEqual(expect.arrayContaining(['policies.0.title', 'policies.0.rules.earn_unit']));
    expect((r.json().error.details.findings as { code: string }[]).map((f) => f.code)).toContain('LOYALTY_FIELD_REQUIRED');
    const unknown = await save(owner, { policy: { ...TICH, code: 'TD_1126_03' }, target: { all: false, branchCodes: ['KHONGCO'] }, mode: 'draft' });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json().error.details.findings[0]).toMatchObject({ code: 'LOYALTY_BRANCH_UNKNOWN', field: 'target' });
    const none = await save(owner, { policy: { ...TICH, code: 'TD_1126_03' }, target: { all: false, branchCodes: [] }, mode: 'draft' });
    expect(none.statusCode).toBe(400);
    expect(none.json().error.details.findings[0].field).toBe('target');
  });

  it('ca 5: cài đặt + hạng lưu cho Tất cả, Duyệt ngay → mọi cửa hàng đổi tên gọi điểm', async () => {
    const r = await save(owner, {
      config: { settings: { enablePosEarn: true, enablePosRedeem: true, enableTierMultiplier: false, minRedeemPoints: 0, pointLabel: 'xu' },
        tiers: [{ key: 'member', name: 'Thành viên', minPoints: 0, multiplier: 1 }] },
      target: { all: true, branchCodes: [] }, mode: 'approve',
    });
    expect(r.statusCode, r.body).toBe(200);
    for (const s of (await overview()).settings) expect(s.settings?.pointLabel).toBe('xu');
  });

  // [2026-11-28 04:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-059: Duyệt ngay chỉ phát hành đúng chương trình đang lưu, không kéo theo nháp khác của cửa hàng (đóng góp)
  it('ca 6: CN02 có nháp TD_1126_04 (chưa gửi); Duyệt ngay TD_1126_05 → máy bán CN02 có TD_1126_05, KHÔNG có TD_1126_04; nháp vẫn giữ cả hai, vẫn là nháp', async () => {
    const one = { target: { all: false, branchCodes: ['CN02'] } };
    const d = await save(owner, { ...one, policy: { ...TICH, id: 40, code: 'TD_1126_04', title: 'Nháp chưa gửi' }, mode: 'draft' });
    expect(d.statusCode, d.body).toBe(200);
    const a = await save(owner, { ...one, policy: { ...TICH, id: 41, code: 'TD_1126_05', title: 'Duyệt ngay' }, mode: 'approve' });
    expect(a.statusCode, a.body).toBe(200);
    const codes = ((await current('CN02')).policies as { code: string }[]).map((p) => p.code);
    expect(codes).toContain('TD_1126_05');
    expect(codes).not.toContain('TD_1126_04');
    const open = (await req(owner, 'GET', `${L}/program-drafts?branch=CN02`)).json().data.items[0];
    expect(open.status).toBe('draft');
    expect((open.program.policies as { code: string }[]).map((p) => p.code)).toEqual(expect.arrayContaining(['TD_1126_04', 'TD_1126_05']));
    const ov = await overview();
    expect(ov.policies.find((x) => x.code === 'TD_1126_04')!.state).toBe('draft');
    expect(ov.policies.find((x) => x.code === 'TD_1126_05')!.state).toBe('active');
  });
});
