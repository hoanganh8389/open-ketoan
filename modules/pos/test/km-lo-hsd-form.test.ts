// [2026-11-29 02:30 AM Võ Hoàng] NGHIEM-THU — NT-BH-064: form BH18 — lọc HSD / lô trên dòng giá, loại "Theo lô hàng" ↔ lotFilter của khuôn (đóng góp)
import { describe, expect, it } from 'vitest';
import { OLD_HIDDEN, OLD_TYPES, emptyCk, emptyFixed, emptyOld, hsdOf, lotFilterOf, oldFromParams, oldToParams } from '../web/screens/khuyen-mai/old-types';

const base = (type: Parameters<typeof emptyOld>[0]) => ({ ...emptyOld(type, '2026-11-29'), key: 'TGS_1126_09', name: 'Thử lô', effectiveFrom: '2026-11-29' });

describe('NT-BH-064 — form BH18 lọc lô / HSD', () => {
  it('loại "Theo lô hàng" hiện lại (không còn trong danh sách ẩn)', () => {
    expect(OLD_TYPES.map((t) => t.oldId)).toContain(4);
    expect(OLD_HIDDEN.map((t) => t.oldId)).not.toContain(4);
  });

  it('chiết khấu 20 % chỉ hàng HSD còn ≤ 30 ngày → lotFilter.expWithinDays = 30; mở lại ra đúng ô', () => {
    const f = { ...base('ck'), ckRows: [{ ...emptyCk(), sku: 'SUA400', pct: '20', hsdMode: 'days' as const, hsdValue: '30' }] };
    const r = oldToParams(f);
    expect(r.problems).toEqual([]);
    expect(r.contract).toBe('sale.promo.price_lines@2');
    expect((r.params.lines as unknown[])[0]).toMatchObject({ sku: 'SUA400', pct: 20, lotFilter: { expWithinDays: 30 } });
    const back = oldFromParams(r.contract, r.params, { key: f.key, today: '2026-11-29' })!;
    expect(back.type).toBe('ck');
    expect(back.ckRows[0]).toMatchObject({ sku: 'SUA400', hsdMode: 'days', hsdValue: '30' });
  });

  it('theo tháng HSD 06/2027 (hsd_filter cũ) → expMonth 2027-06', () => {
    expect(lotFilterOf({ hsdMode: 'month', hsdValue: '6/2027' }, 'A', [])).toEqual({ expMonth: '2027-06' });
    expect(lotFilterOf({ hsdMode: 'year', hsdValue: '2027' }, 'A', [])).toEqual({ expYear: '2027' });
    expect(hsdOf({ expMonth: '2027-06' })).toEqual({ hsdMode: 'month', hsdValue: '06/2027' });
    const p: string[] = [];
    expect(lotFilterOf({ hsdMode: 'days', hsdValue: 'abc' }, 'A', p)).toBeNull();
    expect(p[0]).toContain('HSD còn ≤ N ngày');
  });

  it('loại "Theo lô hàng": lô L2 giá 80.000 → price_lines@2 unitPrice + lotNos; mở lại là loại theo lô', () => {
    const f = { ...base('batch'), fixedRows: [{ ...emptyFixed(), sku: 'SUA400', price: '80000', hsdMode: 'lot' as const, hsdValue: 'L2, L3' }] };
    const r = oldToParams(f);
    expect(r.problems).toEqual([]);
    expect((r.params.lines as unknown[])[0]).toMatchObject({ sku: 'SUA400', unitPrice: 80_000, lotFilter: { lotNos: ['L2', 'L3'] } });
    const back = oldFromParams(r.contract, r.params, { key: f.key, today: '2026-11-29' })!;
    expect(back.type).toBe('batch');
    expect(back.fixedRows[0]).toMatchObject({ hsdMode: 'lot', hsdValue: 'L2, L3', price: '80000' });
  });

  it('loại theo lô thiếu số lô → báo lỗi; hai dòng cùng mã khác lọc HSD → báo lỗi', () => {
    expect(oldToParams({ ...base('batch'), fixedRows: [{ ...emptyFixed(), sku: 'SUA400', price: '80000' }] }).problems.join(' ')).toContain('phải nhập số lô');
    const two = oldToParams({ ...base('ck'), ckRows: [
      { ...emptyCk(), sku: 'SUA400', fromQty: '1', pct: '10', hsdMode: 'days' as const, hsdValue: '30' },
      { ...emptyCk(), sku: 'SUA400', fromQty: '3', pct: '20' },
    ] });
    expect(two.problems.join(' ')).toContain('cùng lọc HSD / lô');
  });
});
