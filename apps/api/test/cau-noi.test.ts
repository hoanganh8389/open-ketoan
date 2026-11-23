// [2026-11-23 11:40 AM Nguyễn Văn Thủy] MH22 — kiểm API cầu nối hoá đơn: khoá thuộc đơn vị nào, báo tình trạng, mất liên lạc nhắc ở Việc cần làm (đóng góp)
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let t: TestCtx;
let key = '';
const P = '/api/v1/purchase/invoices/bridge';
const beat = (o: Record<string, unknown> = {}) => ({ machine: 'MAY-TAI', companyTaxCode: '0106933743-008', companyName: 'CN Phú Thọ', connection: 'Bản test', status: 'running', lastRunAt: new Date().toISOString(), nextRunAt: new Date(Date.now() + 900_000).toISOString(), intervalMinutes: 15, counts: { saved: 3, pending: 2, onErp: 10 }, ...o });
const asKey = (method: 'GET' | 'POST', url: string, payload?: unknown, k = key) => t.app.inject({ method, url, headers: { 'x-api-key': k }, ...(payload ? { payload } : {}) });

beforeAll(async () => {
  t = await setupTenant();
  await db.updateTable('tenants').set({ tax_code: '0106933743' }).where('code', '=', t.tenantCode).execute();
  key = (await call(t, 'POST', '/api/v1/api-keys', { name: 'Cầu nối máy tải', scopes: ['documents:write'] })).body.data.key;
}, 60_000);
afterAll(async () => { await t.app.close(); });

describe('Cầu nối hoá đơn', () => {
  it('khoá cho biết thuộc đơn vị nào; khoá sai bị từ chối', async () => {
    const r = await asKey('GET', `${P}/whoami`);
    expect(r.statusCode).toBe(200);
    expect(r.json().data).toMatchObject({ tenantCode: t.tenantCode, taxCode: '0106933743', keyName: 'Cầu nối máy tải' });
    expect((await asKey('GET', `${P}/whoami`, undefined, 'kt_sai')).statusCode).toBe(401);
  });

  it('báo tình trạng: lấy dòng mới nhất mỗi máy × công ty × kết nối', async () => {
    expect((await asKey('POST', `${P}/heartbeat`, beat({ counts: { saved: 1 } }))).statusCode).toBe(200);
    expect((await asKey('POST', `${P}/heartbeat`, beat())).statusCode).toBe(200);
    expect((await asKey('POST', `${P}/heartbeat`, beat({ connection: 'Bản chính', status: 'paused', pausedBy: 'connection', nextRunAt: null }))).statusCode).toBe(200);
    const s = (await call(t, 'GET', `${P}/status`)).body.data as { connection: string; counts: { saved: number }; stale: boolean; keyName: string; status: string }[];
    expect(s).toHaveLength(2);
    expect(s.find((x) => x.connection === 'Bản test')).toMatchObject({ counts: { saved: 3 }, stale: false, keyName: 'Cầu nối máy tải' });
    expect(s.find((x) => x.connection === 'Bản chính')).toMatchObject({ status: 'paused', stale: false });
  });

  it('quá 1 ngày không báo thì mất liên lạc, nhắc ở Việc cần làm; tạm ngừng thì không nhắc', async () => {
    const cu = new Date(Date.now() - 30 * 3_600_000).toISOString();
    await asKey('POST', `${P}/heartbeat`, beat({ machine: 'MAY-CU', lastRunAt: cu }));
    await asKey('POST', `${P}/heartbeat`, beat({ machine: 'MAY-NGUNG', lastRunAt: cu, status: 'paused', pausedBy: 'all' }));
    const s = (await call(t, 'GET', `${P}/status`)).body.data as { machine: string; stale: boolean }[];
    expect(s.find((x) => x.machine === 'MAY-CU')?.stale).toBe(true);
    expect(s.find((x) => x.machine === 'MAY-NGUNG')?.stale).toBe(false);
    const todo = (await call(t, 'GET', '/api/v1/purchase/todo')).body.data.items as { key: string; count: number }[];
    expect(todo.find((x) => x.key === 'bridge_stale')).toMatchObject({ count: 1 });
  });

  it('dữ liệu sai khuôn bị từ chối; khoá chỉ đọc không báo được', async () => {
    expect((await asKey('POST', `${P}/heartbeat`, beat({ status: 'lung tung' }))).statusCode).toBe(400);
    expect((await asKey('POST', `${P}/heartbeat`, beat({ lastRunAt: 'hôm qua' }))).statusCode).toBe(400);
    const doc = (await call(t, 'POST', '/api/v1/api-keys', { name: 'Chỉ đọc', scopes: ['reports:read'] })).body.data.key;
    expect((await asKey('POST', `${P}/heartbeat`, beat(), doc)).statusCode).toBe(403);
  });
});
