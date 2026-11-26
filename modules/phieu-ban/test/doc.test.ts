// [2026-11-13 11:55 PM Võ Hoàng] NGHIEM-THU — NT-BH-015: hàm thuần phiếu bán / trả nhập tay (đóng góp)
import { describe, expect, it } from 'vitest';
import { computeDoc, formatNo, lockReturnLines, overReturn, periodOf, returnableByLine, returnableBySku, toLedgerDoc, type CatalogItem, type DocInput, type OriginalLine } from '../api/domain/doc.js';

const catalog = new Map<string, CatalogItem>([['SUA330', { sku: 'SUA330', name: 'Sữa 330', unit: 'Hộp', taxCode: 'R08', itemId: null }]]);
const ctx = { catalog, taxRates: new Map([['R08', 8], ['KCT', 0]]), methods: new Set(['TM', 'CK']), partner: { code: 'KH001', name: 'Đại lý An', taxCode: null } };
const input = (over: Partial<DocInput> = {}): DocInput => ({ docDate: '2026-11-13', branchCode: 'CN01', partner: { code: 'KH001' }, lines: [{ lineKey: 'L1', sku: 'SUA330', qty: 2, unitPrice: 300_000 }], ...over });

describe('computeDoc', () => {
  it('tính lại ở máy chủ: tiền = SL × đơn giá − chiết khấu, thuế theo mã thuế danh mục; tên / ĐVT lấy theo danh mục', () => {
    const { body, problems } = computeDoc(input({ lines: [{ lineKey: 'L1', sku: 'SUA330', qty: 2, unitPrice: 300_000, discount: 10_000 }] }), ctx);
    expect(problems).toEqual([]);
    expect(body.lines[0]).toMatchObject({ name: 'Sữa 330', unit: 'Hộp', taxCode: 'R08', amountBeforeTax: 590_000, taxAmount: 47_200 });
    expect(body.totals).toEqual({ beforeTax: 590_000, tax: 47_200, total: 637_200 });
  });
  it('quà: tiền 0; thu đủ không cần khách; ghi nợ thiếu khách → lỗi', () => {
    const gift = computeDoc(input({ lines: [{ lineKey: 'L1', sku: 'SUA330', qty: 1, unitPrice: 300_000, isGift: true }] }), ctx);
    expect(gift.body.totals.total).toBe(0);
    const paid = computeDoc(input({ partner: undefined, payments: [{ methodCode: 'TM', amount: 648_000 }] }), { ...ctx, partner: null });
    expect(paid.problems).toEqual([]);
    const debt = computeDoc(input({ partner: undefined }), { ...ctx, partner: null });
    expect(debt.problems).toEqual(['Phiếu còn ghi nợ (thu chưa đủ) phải chọn khách hàng']);
  });
  it('báo đủ lỗi một lần: mã lạ, chưa có thuế, hình thức lạ, thu quá tổng, khoá dòng trùng', () => {
    const { problems } = computeDoc(input({
      lines: [{ lineKey: 'L1', sku: 'LA', qty: 1, unitPrice: 1 }, { lineKey: 'L1', sku: 'SUA330', qty: 1, unitPrice: 1 }],
      payments: [{ methodCode: 'XX', amount: 1_000_000 }],
    }), ctx);
    expect(problems.join(' | ')).toMatch(/Dòng 1 \(LA\): mã hàng không có.*chưa khai thuế đầu ra.*Khoá dòng L1 bị trùng.*XX.*lớn hơn tổng phiếu/);
  });
});

describe('số phiếu, trả hàng, chứng từ nộp sổ', () => {
  it('số theo tháng: BH / TL + yyMM + 6 số', () => {
    expect(periodOf('2026-11-13')).toBe('2611');
    expect(formatNo('sale', '2611', 1)).toBe('BH2611000001');
    expect(formatNo('sale_return', '2611', 42)).toBe('TL2611000042');
    expect(() => formatNo('sale', '2611', 1_000_000)).toThrow();
  });
  it('còn trả được = đã bán − đã trả; trả vượt → câu lỗi theo mã', () => {
    const left = returnableBySku([{ sku: 'A', qty: 3 }, { sku: 'A', qty: 1 }], [{ sku: 'A', qty: 1 }]);
    expect(left.get('A')).toBe(3);
    expect(overReturn([{ sku: 'A', qty: 3 }], left)).toEqual([]);
    expect(overReturn([{ sku: 'A', qty: 4 }, { sku: 'B', qty: 1 }], left)).toEqual(['A: trả 4, còn trả được 3', 'B: trả 1, còn trả được 0']);
  });
  it('chứng từ nộp: khoá phieu-ban:<id>, phiên bản, kho trên từng dòng, phiếu trả mang originalDocKey; không có số tài khoản', () => {
    const { body } = computeDoc(input({ warehouseCode: 'K01' }), ctx);
    const doc = toLedgerDoc({ docId: 'abc', kind: 'sale_return', branchCode: 'CN01', docNo: 'TL2611000001', docDate: '2026-11-13', body, version: 2, originalDocId: 'goc', catalog });
    expect(doc).toMatchObject({ docType: 'sale_return', docKey: 'phieu-ban:abc', version: 2, originalDocKey: 'phieu-ban:goc', partner: { code: 'KH001' } });
    expect(doc.lines[0]).toMatchObject({ warehouseCode: 'K01', amountBeforeTax: 600_000, taxAmount: 48_000 });
    expect(JSON.stringify(doc)).not.toMatch(/"(debit|credit)Account"|1311|5111/);
  });
});

// [2026-11-16 06:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-021: phiếu bán nhập tay chặn bán quá tồn (đóng góp)
describe('NT-BH-021 — stockShortOf', () => {
  it('cộng theo mã gồm quà; thiếu mới báo; mã không có tồn = 0', async () => {
    const { stockShortOf } = await import('../api/domain/doc.js');
    expect(stockShortOf([{ sku: 'A', qty: 5 }, { sku: 'A', qty: 2 }], new Map([['A', 5]]))).toEqual([{ sku: 'A', need: 7, have: 5 }]);
    expect(stockShortOf([{ sku: 'A', qty: 5 }], new Map([['A', 5]]))).toEqual([]);
    expect(stockShortOf([{ sku: 'B', qty: 1 }], new Map())).toEqual([{ sku: 'B', need: 1, have: 0 }]);
  });
});

// [2026-11-26 08:00 PM Võ Hoàng] NGHIEM-THU — NT-BH-046: trả theo dòng phiếu gốc — số liệu §4 / §5 của phiếu (đóng góp)
describe('NT-BH-046 — trả theo dòng phiếu gốc', () => {
  const orig: OriginalLine[] = [
    { lineKey: 'D1', sku: '1001', name: 'Sữa A', unit: 'Hộp', qty: 10, unitPrice: 100_000, discount: 50_000, taxCode: 'R08', isGift: false },
    { lineKey: 'D2', sku: '1002', name: 'Sữa B', unit: 'Hộp', qty: 4, unitPrice: 25_000, discount: 0, taxCode: 'R08', isGift: false },
    { lineKey: 'D3', sku: '1001', name: 'Sữa A', unit: 'Hộp', qty: 2, unitPrice: 90_000, discount: 0, taxCode: 'R08', isGift: false },
  ];
  it('§5: trả lần 1 dòng 1 SL 4 → giá khoá theo dòng gốc, chiết khấu 20.000; còn trả 6 / 4 / 2', () => {
    const r = lockReturnLines([{ lineKey: 'R1', sku: '1001', qty: 4, originalLineKey: 'D1', unitPrice: 1 } as never], orig, returnableByLine(orig, []), 'BH2611000001');
    expect(r.problems).toEqual([]);
    expect(r.lines[0]).toMatchObject({ unitPrice: 100_000, discount: 20_000, taxCode: 'R08', name: 'Sữa A' });
    const left = returnableByLine(orig, [{ sku: '1001', qty: 4, discount: 20_000, originalLineKey: 'D1' }]);
    expect([...left].map(([k, v]) => [k, v.qty])).toEqual([['D1', 6], ['D2', 4], ['D3', 2]]);
    const { body } = computeDoc({ docDate: '2026-11-26', branchCode: 'CN01', partner: { code: 'KH001' }, lines: r.lines } as DocInput,
      { catalog: new Map(), taxRates: new Map([['R08', 8]]), methods: new Set(), partner: { code: 'KH001', name: 'KH', taxCode: null } });
    expect(body.lines[0]).toMatchObject({ amountBeforeTax: 380_000, taxAmount: 30_400, originalLineKey: 'D1' });
  });
  it('§5: trả lần 2 hết dòng 1 (SL 6) → chiết khấu = phần còn lại 30.000; tổng chiết khấu các lần = 50.000', () => {
    const left = returnableByLine(orig, [{ sku: '1001', qty: 4, discount: 20_000, originalLineKey: 'D1' }]);
    const r = lockReturnLines([{ lineKey: 'R1', sku: '1001', qty: 6, originalLineKey: 'D1' }], orig, left, 'BH2611000001');
    expect(r.problems).toEqual([]);
    expect(r.lines[0]!.discount).toBe(30_000);
  });
  it('§5 / §6: dòng 3 trả 3 → chặn theo DÒNG dù mã 1001 còn ở dòng 1; dòng không có khoá gốc / sai mã / khoá lạ → chặn', () => {
    const left = returnableByLine(orig, []);
    expect(lockReturnLines([{ lineKey: 'R1', sku: '1001', qty: 3, originalLineKey: 'D3' }], orig, left, 'X').problems).toEqual(['Dòng 3 phiếu gốc (1001): trả 3, còn trả được 2']);
    expect(lockReturnLines([{ lineKey: 'R1', sku: '1001', qty: 1 }], orig, left, 'X').problems[0]).toContain('chưa chọn từ phiếu gốc X');
    expect(lockReturnLines([{ lineKey: 'R1', sku: '1002', qty: 1, originalLineKey: 'D1' }], orig, left, 'X').problems[0]).toContain('khác mã hàng');
    expect(lockReturnLines([{ lineKey: 'R1', sku: '1001', qty: 1, originalLineKey: 'ZZ' }], orig, left, 'X').problems[0]).toContain('không có trên phiếu gốc');
    // Hai dòng cùng trỏ một dòng gốc: cộng lại để kiểm.
    expect(lockReturnLines([{ lineKey: 'R1', sku: '1002', qty: 3, originalLineKey: 'D2' }, { lineKey: 'R2', sku: '1002', qty: 2, originalLineKey: 'D2' }], orig, left, 'X').problems)
      .toEqual(['Dòng 2 phiếu gốc (1002): trả 5, còn trả được 4']);
  });
  it('§6 dòng 7: phiếu trả cũ không có khoá dòng gốc trừ theo mã vào dòng cùng mã, dòng trước trước', () => {
    const left = returnableByLine(orig, [{ sku: '1001', qty: 11, discount: 0 }]);
    expect(left.get('D1')!.qty).toBe(0);
    expect(left.get('D3')!.qty).toBe(1);
  });
});
