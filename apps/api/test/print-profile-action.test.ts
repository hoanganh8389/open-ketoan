// [2026-11-23 02:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-040 — B10c-2 (S040-24, SC-ACT-1): ghi / bỏ hồ sơ in qua defineAction — cùng đường, cùng kết quả; có bằng chứng; bỏ lớp cả đơn vị bị chặn
/**
 *   T040-B10C2-1  PUT /print-profile (action core.print-profile.save): ghi lớp chi nhánh, trả { branchCode, profile }, để lại bằng chứng
 *   T040-B10C2-2  DELETE /print-profile?branchCode= (core.print-profile.delete): bỏ lớp chi nhánh; không có branchCode → 400; chi nhánh lạ → 400
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await setupTenant();
});
afterAll(async () => { await ctx.app.close(); });

describe('T040-B10C2 — hồ sơ in qua defineAction', () => {
  it('T040-B10C2-1 ghi lớp chi nhánh qua action, có bằng chứng', async () => {
    const r = await call(ctx, 'PUT', '/api/v1/print-profile', { branchCode: 'CN01', profile: { company: { address: 'Số 9 Phố Thử' } } });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toMatchObject({ branchCode: 'CN01', profile: { company: { address: 'Số 9 Phố Thử' } } });
    const g = await call(ctx, 'GET', '/api/v1/print-profile?branchCode=CN01');
    expect(g.body.data.branch).toMatchObject({ company: { address: 'Số 9 Phố Thử' } });
    expect(r.body.meta?.receipt, 'action ghi có biên nhận bằng chứng (runtime defineAction)').toBeTruthy();
    const bad = await call(ctx, 'PUT', '/api/v1/print-profile', { branchCode: 'KHONG-CO', profile: {} });
    expect(bad.status).toBe(400);
  });

  it('T040-B10C2-2 bỏ lớp chi nhánh; thiếu branchCode bị chặn', async () => {
    const noBranch = await call(ctx, 'DELETE', '/api/v1/print-profile');
    expect(noBranch.status).toBe(400);
    const d = await call(ctx, 'DELETE', '/api/v1/print-profile?branchCode=CN01');
    expect(d.status, JSON.stringify(d.body)).toBe(200);
    expect(d.body.data).toEqual({ branchCode: 'CN01' });
    const g = await call(ctx, 'GET', '/api/v1/print-profile?branchCode=CN01');
    expect(g.body.data.branch).toBeNull();
  });
});
