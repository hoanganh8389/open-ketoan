// [2026-11-22 10:16 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B2d (R-SITE-6): ca kiểm bộ đệm trong bộ nhớ có mã site
/**
 * Bộ đệm có mã site — PHASE-039 B2d. `tenant_id`, `user_id` là số tự tăng của từng database nên trùng nhau giữa các site:
 * bộ đệm khoá theo đơn vị mà thiếu mã site sẽ trả dữ liệu của site này cho site kia.
 *   - siteScopedKey: khác nhau theo site; chế độ multi ngoài ngữ cảnh site → SITE_CONTEXT_MISSING.
 *   - Giới hạn lượt thử của cùng (đơn vị, người gọi) ở hai site là hai bộ đếm riêng.
 *   - Người đang mở phần mềm của đơn vị 1 ở site A không hiện ở đơn vị 1 của site B.
 * Không cần database.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SITE_ID, setSiteModeForTest, siteScopedKey, withSite } from '@bizcity/platform/db/site';
import { TRIAL_LIMIT, resetTrials, takeTrial } from '@bizcity/kernel/modules/intake/trial-posting';
import { readPresence, touchPresence } from '../src/modules/system/presence.js';

afterEach(() => {
  setSiteModeForTest('single');
  resetTrials();
});

describe('PHASE-039 B2d — bộ đệm có mã site (R-SITE-6)', () => {
  it('khoá bộ đệm khác nhau theo site; chế độ single dùng site ngầm định', () => {
    expect(siteScopedKey('1')).toBe(`${DEFAULT_SITE_ID}\u00011`);
    expect(withSite('S_A', () => siteScopedKey('1'))).not.toBe(withSite('S_B', () => siteScopedKey('1')));
  });

  it('chế độ multi: ngoài ngữ cảnh site không lấy được khoá bộ đệm', () => {
    setSiteModeForTest('multi');
    expect(() => siteScopedKey('1')).toThrow(/Chưa xác định site/);
  });

  it('giới hạn lượt thử: cùng đơn vị và người gọi ở hai site là hai bộ đếm riêng', () => {
    setSiteModeForTest('multi');
    const auth = { tenantId: '1', actor: 'user:1' };
    withSite('S_A', () => {
      for (let i = 0; i < TRIAL_LIMIT; i++) expect(takeTrial(auth)).toBe(true);
      expect(takeTrial(auth)).toBe(false);
    });
    expect(withSite('S_B', () => takeTrial(auth))).toBe(true);
  });

  it('người đang mở phần mềm của đơn vị 1 ở site A không hiện ở đơn vị 1 của site B', () => {
    setSiteModeForTest('multi');
    const tab = { deviceId: 'may-1', tabId: 'tab-1', path: '/so-cai', screen: 'Sổ cái' };
    withSite('S_A', () => touchPresence('1', 'user:7', 'Kế toán A', 'accountant', 'Chrome', tab));
    expect(withSite('S_A', () => readPresence('1', true).accounts)).toBe(1);
    expect(withSite('S_B', () => readPresence('1', true).accounts)).toBe(0);
  });
});
