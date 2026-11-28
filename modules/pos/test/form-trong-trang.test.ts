// [2026-11-29 05:40 PM Võ Hoàng] NGHIEM-THU — NT-BH-066: khung form trong trang dùng chung (ui-kit FormPage) — trạng thái bước, tham số URL (đóng góp)
import { describe, expect, it } from 'vitest';
import { formStepState, readParam } from '@bizcity/ui-kit';

describe('NT-BH-066 — FormPage dùng chung BH18 / BH19 / BH21', () => {
  it('bước trước là xong, bước đang mở là on, bước sau là chờ', () => {
    expect([0, 1, 2, 3].map((i) => formStepState(i, 1))).toEqual(['xong', 'on', 'cho', 'cho']);
  });
  it('đọc ?ct= / ?dot= để tải lại mở đúng form; trống = danh sách', () => {
    expect(readParam('ct', '?tab=km&ct=TGS_1126_07')).toBe('TGS_1126_07');
    expect(readParam('ct', '?ct=moi')).toBe('moi');
    expect(readParam('dot', '?ct=moi')).toBeNull();
    expect(readParam('ct', '?ct=')).toBeNull();
  });
});
