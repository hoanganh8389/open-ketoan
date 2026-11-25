// [2026-11-25 09:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-039: hàm thuần nháp chính sách (kiểm, băm phiên bản, áp nhiều cửa hàng) + "chưa đủ hạng" (đóng góp)
import { describe, expect, it } from 'vitest';
import { calculateEarnPoints } from '../api/domain/engine.js';
import { DRAFT_CODES, checkProgram, contentOf, contentVersion, mergeInto } from '../api/domain/program-draft.js';
import { quoteRedeem } from '../api/domain/redeem.js';
import { PROGRAM } from './fixture.js';

const base = contentOf(PROGRAM);

describe('nháp chính sách tích điểm (NT-BH-039)', () => {
  it('bản website đang chạy là nháp hợp lệ (chép làm nháp đầu tiên — Q3)', () => {
    expect(checkProgram(base, base, new Set(['100045001Z']))).toEqual([]);
  });

  it('trả mọi lỗi một lần, mỗi lỗi chỉ đúng ô: trùng mã, thiếu số tiền, quà ngừng, hạng lạ, bỏ chính sách đã phát hành', () => {
    const p = structuredClone(base);
    p.policies[1]!.code = 'TICH10K'; // trùng mã dòng 1
    p.policies[0]!.rules = { earn_rate: 1, earn_unit: 0 };
    (p.policies[2]!.rules as { rules: { rewards: Record<string, unknown>[] } }).rules.rewards[0]!.min_tier = 'kimcuong';
    p.policies.pop(); // bỏ THUONG1TR
    const f = checkProgram(p, base, new Set()).map((x) => `${x.code}@${x.field}`);
    expect(f).toEqual(expect.arrayContaining([
      `${DRAFT_CODES.codeDup}@policies.1.code`, `${DRAFT_CODES.required}@policies.0.rules.earn_unit`, `${DRAFT_CODES.tier}@policies.2.rules.rules.rewards.0.min_tier`,
      `${DRAFT_CODES.item}@policies.2.rules.rules.rewards.0.sku`, `${DRAFT_CODES.removed}@policies`,
    ]));
  });

  it('phiên bản = băm nội dung: cùng nội dung cùng phiên bản, đổi một ô thì khác; không phụ thuộc thứ tự khoá', () => {
    const v = contentVersion(base, 2);
    expect(v).toMatch(/^kt-[0-9a-f]{16}$/);
    expect(contentVersion(JSON.parse(JSON.stringify({ policies: base.policies, tiers: base.tiers, settings: base.settings })), 2)).toBe(v);
    expect(contentVersion({ ...base, settings: { ...base.settings, enableTierMultiplier: false } }, 2)).not.toBe(v);
    expect(contentVersion(base, 3)).not.toBe(v);
  });

  it('áp nhiều cửa hàng: cùng mã → thay, mã mới → thêm (số thứ tự trùng thì cấp số mới), chính sách riêng giữ nguyên', () => {
    const apply = { ...base, policies: [{ ...base.policies[0]!, id: 4, code: 'MOI' }, { ...base.policies[3]!, title: 'Thưởng mới' }] };
    const out = mergeInto(base, apply);
    expect(out.policies.map((p) => [p.id, p.code])).toEqual([[1, 'TICH10K'], [3, 'DOIVC'], [4, 'DOIQUA'], [2, 'THUONG1TR'], [5, 'MOI']]);
    expect(out.policies.find((p) => p.code === 'THUONG1TR')!.title).toBe('Thưởng mới');
    expect(mergeInto(null, apply)).toBe(apply);
  });

  it('ca 4: bật nhân theo hạng, hạng Bạc ×1,2, đơn 325.000 → 38,4 (bộ tính làm tròn 2 số lẻ, không đổi)', () => {
    const r = calculateEarnPoints(base, { storeId: 0, now: 1_800_000_000, orderTotal: 325_000, tierKey: 'silver', items: [] });
    expect(r.totalPoints).toBe(38.4);
  });

  it('ca 5: quà hạng tối thiểu Bạc, khách Thành viên đổi → "chưa đủ hạng"', () => {
    const p = structuredClone(PROGRAM);
    (p.policies[2]!.rules as { rules: { rewards: Record<string, unknown>[] } }).rules.rewards[0]!.min_tier = 'silver';
    const q = quoteRedeem(p, [{ id: 'L1', kind: 'earn', points: 500, at: '2026-11-01T00:00:00Z', expiresAt: null }], {
      orderId: 'o1', orderTotal: 325_000, redeem: ['lp_4_qua1'], storeId: 0, now: '2026-11-25T03:00:00Z',
    });
    expect(q.problems).toEqual(["Phần thưởng Me n' Mil 200ml chưa đủ hạng: cần hạng Bạc, khách đang hạng Thành viên"]);
  });
});
