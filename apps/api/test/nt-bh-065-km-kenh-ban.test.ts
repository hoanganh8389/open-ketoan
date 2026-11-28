// [2026-11-29 01:30 AM Võ Hoàng] NGHIEM-THU — NT-BH-065: điều kiện kênh bán (online / offline / mã kênh) qua endpoint phát hành → evaluate (đóng góp)
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => { ctx = await setupTenant(); });
afterAll(async () => { await ctx.app.close(); });

const LINES = [{ lineKey: 'a', sku: 'A', qty: 1, price: 100_000 }];
const publish = async (key: string, conditions: Record<string, unknown>) => {
  const r = await call(ctx, 'POST', '/api/v1/policies', { key, ruleContract: 'sale.promo.price_lines@2', params: { basis: 'qty', conditions, lines: [{ sku: 'A', pct: 10 }] }, effectiveFrom: '2026-01-01', reason: 'NT-BH-065 kênh bán' });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
};
const evaluate = async (key: string, extra: Record<string, unknown>) => {
  const r = await call(ctx, 'POST', '/api/v1/policies/evaluate', { docDate: '2026-06-15', lines: LINES, policies: [{ key }], ...extra });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.data as { applied: { policyRef: { key: string } }[]; skipped: { reason: string }[]; discounts: { amount: number }[] };
};

describe('NT-BH-065 — khuyến mại theo kênh bán', () => {
  it('Chỉ online: đơn kênh offline không áp, kênh online áp 10 %', async () => {
    await publish('KENH-ONLINE', { channelKinds: ['online'] });
    const off = await evaluate('KENH-ONLINE', { channel: 'GAN_SHOP', channelKind: 'offline' });
    expect(off.applied).toEqual([]);
    expect(off.skipped[0]!.reason).toContain('chỉ áp kênh online');
    const on = await evaluate('KENH-ONLINE', { channel: 'ZALO', channelKind: 'online' });
    expect(on.applied[0]!.policyRef.key).toBe('KENH-ONLINE');
    expect(on.discounts.map((d) => d.amount)).toEqual([10_000]);
  });

  it('Chỉ offline: đơn không mang loại kênh (mất mạng / nguồn chưa gửi) → không áp, có lý do', async () => {
    await publish('KENH-OFFLINE', { channelKinds: ['offline'] });
    const none = await evaluate('KENH-OFFLINE', {});
    expect(none.applied).toEqual([]);
    expect(none.skipped[0]!.reason).toContain('đơn chưa xác định kênh');
    expect((await evaluate('KENH-OFFLINE', { channel: 'GAN_SHOP', channelKind: 'offline' })).applied).toHaveLength(1);
  });

  it('Chọn kênh ZALO: chỉ đơn mã kênh ZALO (không phân biệt hoa thường) được áp', async () => {
    await publish('KENH-ZALO', { channels: ['ZALO'] });
    expect((await evaluate('KENH-ZALO', { channel: 'FACEBOOK', channelKind: 'online' })).applied).toEqual([]);
    expect((await evaluate('KENH-ZALO', { channel: 'zalo', channelKind: 'online' })).applied).toHaveLength(1);
  });

  it('Không điều kiện kênh (chương trình cũ / Tất cả): áp mọi kênh, kể cả đơn không mang kênh', async () => {
    await publish('KENH-TATCA', {});
    expect((await evaluate('KENH-TATCA', {})).applied).toHaveLength(1);
    expect((await evaluate('KENH-TATCA', { channel: 'ZALO', channelKind: 'online' })).applied).toHaveLength(1);
  });

  it('loại kênh sai giá trị → 400', async () => {
    const r = await call(ctx, 'POST', '/api/v1/policies/evaluate', { docDate: '2026-06-15', lines: LINES, channelKind: 'web' });
    expect(r.status).toBe(400);
  });
});
