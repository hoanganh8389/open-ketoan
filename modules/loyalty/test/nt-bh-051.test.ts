// NT-BH-051 — tích điểm đủ như plugin cũ: thẻ Thành viên (gom, tìm, lọc hạng, trang), lịch sử trước / sau, số lượng voucher đổi điểm.
import { describe, expect, it } from 'vitest';
import type { LedgerEntry } from '../api/domain/ledger.js';
import { filterMembers, historyRows, memberRows } from '../api/domain/members.js';
import { quoteRedeem } from '../api/domain/redeem.js';
import { PROGRAM } from './fixture.js';

const TIERS = [
  { key: 'member', name: 'Thành viên', minPoints: 0, multiplier: 1 },
  { key: 'gold', name: 'Vàng', minPoints: 1000, multiplier: 1.5, color: '#d4a017' },
];

describe('NT-BH-051 — thẻ Thành viên', () => {
  const aggs = [
    { partnerCode: '0901111111', balance: 800, earned: 1200, reversed: -100, redeemed: 300, lastAt: '2026-11-20T03:00:00.000Z' },
    { partnerCode: '0902222222', balance: 50, earned: 50, reversed: 0, redeemed: 0, lastAt: '2026-11-21T03:00:00.000Z' },
    { partnerCode: '0903333333', balance: 0, earned: 999, reversed: 0, redeemed: 999, lastAt: '2026-11-22T03:00:00.000Z' },
  ];
  const partners = new Map([['0901111111', { code: '0901111111', name: 'Nguyễn Văn Ánh', phone: '0901111111' }]]);
  const rows = memberRows(aggs, partners, TIERS);

  it('hạng theo TỔNG đã tích (tích + hoàn), không theo số dư; đổi điểm không tụt hạng', () => {
    expect(rows[0]).toMatchObject({ customerCode: '0901111111', name: 'Nguyễn Văn Ánh', tierKey: 'gold', tierName: 'Vàng', tierColor: '#d4a017', balance: 800, totalEarned: 1100, totalRedeemed: 300 });
    expect(rows[2]).toMatchObject({ tierKey: 'member', balance: 0, totalEarned: 999 });
  });
  it('tìm không dấu theo tên / SĐT, lọc hạng, xếp điểm hiện tại giảm dần, chia trang', () => {
    expect(filterMembers(rows, { q: 'anh', page: 1, pageSize: 50 }).items.map((r) => r.customerCode)).toEqual(['0901111111']);
    expect(filterMembers(rows, { q: '2222', page: 1, pageSize: 50 }).total).toBe(1);
    expect(filterMembers(rows, { tier: 'member', page: 1, pageSize: 50 }).items.map((r) => r.customerCode)).toEqual(['0902222222', '0903333333']);
    const p2 = filterMembers(rows, { page: 2, pageSize: 2 });
    expect(p2).toMatchObject({ total: 3, page: 2, pages: 2 });
    expect(p2.items.map((r) => r.customerCode)).toEqual(['0903333333']);
    expect(filterMembers(rows, { page: 9, pageSize: 2 }).page).toBe(2);
  });
});

describe('NT-BH-051 — lịch sử điểm trước / sau', () => {
  const E: (LedgerEntry & { branchCode?: string })[] = [
    { id: 'e2', kind: 'redeem', points: -100, at: '2026-11-15T05:00:00.000Z', ref: { type: 'order', id: 'o2', code: 'HD2' }, branchCode: 'CN02' },
    { id: 'e1', kind: 'earn', points: 150, at: '2026-11-15T03:00:00.000Z', expiresAt: '2027-11-15T03:00:00.000Z', ref: { type: 'order', id: 'o1', code: 'HD1' }, branchCode: 'CN02' },
    { id: 'e3', kind: 'adjust', points: 20.5, at: '2026-11-16T03:00:00.000Z', ref: { type: 'manual', id: 'a1', code: 'DC0001' }, note: 'Bù đơn lỗi' },
  ];
  it('cộng dồn theo thời gian, trả mới nhất trước, mô tả = lý do điều chỉnh', () => {
    const h = historyRows(E);
    expect(h.map((x) => [x.id, x.before, x.after])).toEqual([['e3', 50, 70.5], ['e2', 150, 50], ['e1', 0, 150]]);
    expect(h[0]).toMatchObject({ kindLabel: 'Điều chỉnh tay', refCode: 'DC0001', description: 'Bù đơn lỗi' });
    expect(h[2]).toMatchObject({ kindLabel: 'Tích điểm', branchCode: 'CN02', expiresAt: '2027-11-15T03:00:00.000Z' });
  });
});

describe('NT-BH-051 — số lượng voucher đổi điểm', () => {
  const NOW = '2026-11-15T05:00:00.000Z';
  const H: LedgerEntry[] = [{ id: 'l', kind: 'earn', points: 500, at: '2026-11-15T03:00:00.000Z', expiresAt: null }];
  const withQty = (q: number) => ({
    ...PROGRAM,
    policies: PROGRAM.policies.map((p) => (p.id !== 3 ? p : {
      ...p, rules: { rules: { rewards: ((p.rules as { rules: { rewards: Record<string, unknown>[] } }).rules.rewards).map((r) => ({ ...r, voucher_quantity: q })) } },
    })),
  });
  it('voucher_quantity 3 → 3 voucher mã khác nhau, trừ điểm một lần', () => {
    const q = quoteRedeem(withQty(3), H, { orderId: 'o9', orderTotal: 325_000, redeem: ['lp_3_vc50k'], storeId: 2, now: NOW });
    expect(q.problems).toEqual([]);
    expect(q.points).toBe(100);
    expect(q.rewards.map((r) => r.points)).toEqual([100, 0, 0]);
    expect(new Set(q.rewards.map((r) => r.voucher!.code)).size).toBe(3);
  });
  it('mặc định 1 voucher như trước', () => {
    expect(quoteRedeem(PROGRAM, H, { orderId: 'o9', orderTotal: 325_000, redeem: ['lp_3_vc50k'], storeId: 2, now: NOW }).rewards).toHaveLength(1);
  });
});
