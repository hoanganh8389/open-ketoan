// [2026-11-28 10:00 AM Võ Hoàng] NGHIEM-THU — NT-BH-056: test thuần luật đề nghị điều chuyển (đóng góp)
import { describe, expect, it } from 'vitest';
import { canChange, checkLines, formatNo, normalizeExp, periodOf, receiveCandidates } from '../api/domain/rules.js';

const names = new Map([['SUA01', { name: 'Sữa 01', unit: 'Hộp', active: true }], ['NGUNG', { name: 'Ngừng', unit: 'Cái', active: false }]]);

describe('NT-BH-056 — luật đề nghị điều chuyển', () => {
  it('số đề nghị DNDC-<chi nhánh>-<yyMM>-<4 số>', () => {
    expect(periodOf('2026-11-28')).toBe('2611');
    expect(formatNo('08004', '2611', 7)).toBe('DNDC-08004-2611-0007');
  });

  it('hạn dùng: yyyy-mm-dd / dd/mm/yyyy, trống = null, sai = undefined', () => {
    expect(normalizeExp('2027-06-30')).toBe('2027-06-30');
    expect(normalizeExp('30/06/2027')).toBe('2027-06-30');
    expect(normalizeExp('')).toBeNull();
    expect(normalizeExp('31/02/2027')).toBeUndefined();
    expect(normalizeExp('06-30-2027')).toBeUndefined();
  });

  it('bỏ dòng thiếu mã / SL ≤ 0 (như máy bán cũ), cộng SL theo mã so với tồn', () => {
    const c = checkLines([{ sku: 'SUA01', qty: 3 }, { sku: '', qty: 5 }, { sku: 'SUA01', qty: 0 }, { sku: 'SUA01', qty: 2 }], names, new Map([['SUA01', 5]]));
    expect(c.findings).toEqual([]);
    expect(c.lines.map((l) => [l.lineKey, l.qty, l.name, l.unit, l.stock])).toEqual([['L1', 3, 'Sữa 01', 'Hộp', 5], ['L2', 2, 'Sữa 01', 'Hộp', 5]]);
    expect(c.totalQty).toBe(5);
    const over = checkLines([{ sku: 'SUA01', qty: 4 }, { sku: 'SUA01', qty: 2 }], names, new Map([['SUA01', 5]]));
    expect(over.findings.map((f) => [f.code, f.field])).toEqual([['DNDC_OVER_STOCK', 'lines[0].qty']]);
    expect(over.findings[0]!.title).toBe('Sản phẩm SUA01 chỉ còn 5, không thể điều chuyển 6');
  });

  it('chặn: không có dòng, mã lạ, mã ngừng, hạn dùng sai dạng', () => {
    expect(checkLines([], names, new Map()).findings.map((f) => f.code)).toEqual(['DNDC_NO_LINES']);
    const c = checkLines([{ sku: 'LA', qty: 1 }, { sku: 'NGUNG', qty: 1 }, { sku: 'SUA01', qty: 1, expDate: '2027/06/30' }], names, new Map([['SUA01', 9], ['NGUNG', 9], ['LA', 9]]));
    expect(c.findings.map((f) => [f.code, f.field])).toEqual([
      ['DNDC_SKU_UNKNOWN', 'lines[0].sku'], ['DNDC_SKU_INACTIVE', 'lines[1].sku'], ['DNDC_EXP_FORMAT', 'lines[2].expDate'],
    ]);
  });

  it('chi nhánh nhận: cùng cấp trên + cấp trên (cấp trên đứng đầu), bỏ chính mình và chi nhánh ngừng', () => {
    const all = [
      { code: 'TPT', name: 'Tỉnh Phú Thọ', parentCode: null, active: true },
      { code: '08004', name: 'Lâm Thao', parentCode: 'TPT', active: true },
      { code: '08028', name: 'Tiên Cát', parentCode: 'TPT', active: true },
      { code: '08032', name: 'Hùng Lô', parentCode: 'TPT', active: false },
      { code: 'HN01', name: 'Hà Nội 01', parentCode: 'THN', active: true },
      { code: 'THN', name: 'Hà Nội', parentCode: null, active: true },
    ];
    expect(receiveCandidates('08004', all).map((b) => [b.code, b.isParent])).toEqual([['TPT', true], ['08028', false]]);
    expect(receiveCandidates('TPT', all).map((b) => b.code)).toEqual(['THN']);
  });

  it('sửa / huỷ: chỉ Chờ duyệt; người lập: chi nhánh mình, lập hôm nay; người duyệt: mọi lúc', () => {
    const p = { status: 'pending' as const, branchCode: '08004', docDate: '2026-11-27' };
    expect(canChange(p, { approver: false, branches: ['08004'], today: '2026-11-28' }).ok).toBe(false);
    expect(canChange({ ...p, docDate: '2026-11-28' }, { approver: false, branches: ['08004'], today: '2026-11-28' }).ok).toBe(true);
    expect(canChange({ ...p, docDate: '2026-11-28' }, { approver: false, branches: ['08028'], today: '2026-11-28' }).ok).toBe(false);
    expect(canChange(p, { approver: true, branches: null, today: '2026-11-28' }).ok).toBe(true);
    expect(canChange({ ...p, status: 'converted' }, { approver: true, branches: null, today: '2026-11-28' }).ok).toBe(false);
  });
});
