// [2026-11-25 kiennt] NT-MH-012 — đơn vị mua hàng / kho tổng / shop theo cây hiện có: giữ cấp 3, kho tổng nhận tên có chữ "Kho",
// cửa hàng chưa thuộc kho tổng nào thì gom theo đơn vị cha trực tiếp (đóng góp)
/**
 * Mỗi kiểu cây là một công ty gốc riêng trong cùng tenant. Cây thật (cấp 3 gộp cả nhánh, Lào Cai lấy hàng 08000) xem so-do-to-chuc.test.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const ok = async (method: 'GET' | 'POST' | 'PATCH', url: string, body?: unknown, status = method === 'POST' ? 201 : 200) => {
  const r = await call(ctx, method, url, body);
  expect(r.status, `${method} ${url}: ${JSON.stringify(r.body)}`).toBe(status);
  return r.body.data;
};
interface HBranch { code: string; level: string; parentCode: string | null }
const hierarchy = async () => new Map(((await ok('GET', '/api/v1/stock/hierarchy')).branches as HBranch[]).map((b) => [b.code, b]));
const units = async () => (await ok('GET', '/api/v1/org-units/purchase-units')) as { orgCode: string; branchCode: string; branches: number }[];
const nhom = (code: string, name: string, parentCode: string) => ok('POST', '/api/v1/co-cau/units', { code, name, parentCode, levelLabel: parentCode ? 'Nhóm' : 'Công ty' });
/** Đơn vị có phân kho (cửa hàng / kho tổng), đặt dưới parentCode. */
const coKho = async (code: string, name: string, parentCode: string, kho = 1) => {
  await ok('POST', '/api/v1/branches', { code, name });
  for (let i = 1; i <= kho; i++) await ok('POST', '/api/v1/warehouses', { code: `${code}-K${i}`, branchCode: code, name: `Kho ${code} ${i}`, isDefault: i === 1 });
  await ok('PATCH', `/api/v1/co-cau/units/${encodeURIComponent(code)}`, { parentCode });
};

beforeAll(async () => {
  ctx = await setupTenant();
  // A — cây 2 cấp: Công ty › Chi nhánh X › 41000 (kho tổng), 41001, 41002.
  await nhom('CTA', 'Công ty A', ''); await nhom('CNX', 'Chi nhánh X', 'CTA');
  await coKho('41000', 'Tổng X', 'CNX', 2); await coKho('41001', 'Shop X1', 'CNX'); await coKho('41002', 'Shop X2', 'CNX');
  // B — cấp 3 đúng khuôn, kho tổng mã lạ nhưng tên có chữ "Kho".
  await nhom('CTB', 'Công ty B', ''); await nhom('MB-B', 'Miền B', 'CTB'); await nhom('CNY', 'Chi nhánh Y', 'MB-B');
  await coKho('KT-Y', 'Kho tổng Y', 'CNY'); await coKho('Y-01', 'Shop Y1', 'CNY'); await coKho('Y-02', 'Khoái Châu', 'CNY');
  // C — nhánh cấp 3 không có kho tổng; cấp dưới có đơn vị cha tự có phân kho.
  await nhom('CTC', 'Công ty C', ''); await nhom('MB-C', 'Miền C', 'CTC'); await nhom('CNZ', 'Chi nhánh Z', 'MB-C');
  await coKho('ZP', 'Cụm Z', 'CNZ'); await coKho('Z-01', 'Shop Z1', 'ZP'); await coKho('Z-02', 'Shop Z2', 'ZP');
  // E — như Hưng Yên ở DB local: chi nhánh cấp 2 tự có phân kho, cửa hàng chưa có kho.
  await nhom('CTE', 'Công ty E', ''); await coKho('HYX', 'Chi nhánh Hưng Yên X', 'CTE');
  await ok('POST', '/api/v1/branches', { code: 'HLX', name: 'Shop Hoàn Long X' }); await ok('PATCH', '/api/v1/co-cau/units/HLX', { parentCode: 'HYX' });
  // G — theo loại đơn vị (như cây dev): Miền › "tỉnh P" loại Chi nhánh › kho loại Kho trung gian + văn phòng có kho + Tỉnh › cửa hàng.
  const dv = (code: string, name: string, parentCode: string, levelLabel: string) => ok('POST', '/api/v1/co-cau/units', { code, name, parentCode, levelLabel });
  const loai = (code: string, levelLabel: string) => ok('PATCH', `/api/v1/co-cau/units/${encodeURIComponent(code)}`, { levelLabel });
  await dv('CTG', 'Công ty G', '', 'Công ty'); await dv('VG', 'Kho Phú Thọ G', 'CTG', 'Miền'); await dv('TPG', 'tỉnh P', 'VG', 'Chi nhánh');
  await coKho('TTPP', 'Trung tâm phân phối', 'TPG'); await loai('TTPP', 'Kho trung gian');
  await coKho('VPG', 'Văn phòng P', 'TPG', 2); await loai('VPG', 'Văn phòng');
  await dv('HUY', 'Huyện G', 'TPG', 'Tỉnh');
  await coKho('SG1', 'Shop G1', 'HUY'); await loai('SG1', 'Cửa hàng');
  await ok('POST', '/api/v1/branches', { code: 'SG2', name: 'Shop G2' }); await ok('PATCH', '/api/v1/co-cau/units/SG2', { parentCode: 'HUY', levelLabel: 'Cửa hàng' });
  // H — chi nhánh lồng nhau: cửa hàng thuộc chi nhánh GẦN NHẤT.
  await dv('CTH', 'Công ty H', '', 'Công ty');
  await coKho('CNH', 'Chi nhánh H', 'CTH'); await loai('CNH', 'Chi nhánh');
  await coKho('H1', 'Shop H1', 'CNH'); await loai('H1', 'Cửa hàng');
  await coKho('CNH2', 'Chi nhánh H con', 'CNH'); await loai('CNH2', 'Chi nhánh');
  await coKho('H2', 'Shop H2', 'CNH2'); await loai('H2', 'Cửa hàng');
  // D — không có đơn vị nào đạt kho tổng.
  await nhom('CTD', 'Công ty D', ''); await nhom('CNW', 'Chi nhánh W', 'CTD');
  await coKho('W-01', 'Shop W1', 'CNW'); await coKho('W-02', 'Shop W2', 'CNW');
});
afterAll(async () => { await ctx.app.close(); });

describe('NT-MH-012 — đơn vị mua hàng theo cây cơ cấu hiện có', () => {
  it('cây 2 cấp: Chi nhánh X là đơn vị mua hàng, kho tổng 41000, hai shop (bước dự phòng)', async () => {
    const h = await hierarchy();
    expect(h.get('41000')).toMatchObject({ level: 'branch', parentCode: null });
    expect(h.get('41001')).toMatchObject({ level: 'shop', parentCode: '41000' });
    expect(h.get('41002')).toMatchObject({ level: 'shop', parentCode: '41000' });
    expect((await units()).find((u) => u.orgCode === 'CNX')).toMatchObject({ branchCode: '41000' });
  });

  it('cấp 3, kho tổng mã KT-Y tên "Kho tổng Y": nhận theo tên; "Khoái Châu" không bị nhận nhầm là kho', async () => {
    const h = await hierarchy();
    expect(h.get('KT-Y')).toMatchObject({ level: 'branch' });
    expect(h.get('Y-01')).toMatchObject({ level: 'shop', parentCode: 'KT-Y' });
    expect(h.get('Y-02')).toMatchObject({ level: 'shop', parentCode: 'KT-Y' });
    expect((await units()).find((u) => u.orgCode === 'CNY')).toMatchObject({ branchCode: 'KT-Y' });
  });

  it('nhánh cấp 3 thiếu kho tổng: đơn vị cha trực tiếp có phân kho (ZP) làm kho tổng', async () => {
    const h = await hierarchy();
    expect(h.get('ZP')).toMatchObject({ level: 'branch' });
    expect(h.get('Z-01')).toMatchObject({ level: 'shop', parentCode: 'ZP' });
    const u = await units();
    expect(u.find((x) => x.orgCode === 'ZP')).toMatchObject({ branchCode: 'ZP' });
    expect(u.find((x) => x.orgCode === 'CNZ')).toBeUndefined();
  });

  it('chi nhánh cấp 2 tự có phân kho, cửa hàng chưa có kho (Hưng Yên): chi nhánh là kho tổng, cửa hàng là shop', async () => {
    const h = await hierarchy();
    expect(h.get('HYX')).toMatchObject({ level: 'branch' });
    expect(h.get('HLX')).toMatchObject({ level: 'shop', parentCode: 'HYX' });
    expect((await units()).find((u) => u.orgCode === 'HYX')).toMatchObject({ branchCode: 'HYX' });
  });

  it('theo loại: Chi nhánh "tỉnh P" là đơn vị mua hàng, kho tổng loại Kho trung gian (hơn văn phòng nhiều kho), cửa hàng ở cấp dưới là shop', async () => {
    const h = await hierarchy();
    expect(h.get('TTPP')).toMatchObject({ level: 'branch' });
    expect(h.get('SG1')).toMatchObject({ level: 'shop', parentCode: 'TTPP' });
    expect(h.get('SG2')).toMatchObject({ level: 'shop', parentCode: 'TTPP' });
    expect(h.get('VPG')?.level).toBe('');
    expect((await units()).find((u) => u.orgCode === 'TPG')).toMatchObject({ branchCode: 'TTPP' });
  });

  it('chi nhánh lồng nhau: cửa hàng theo chi nhánh gần nhất', async () => {
    const h = await hierarchy();
    expect(h.get('H1')).toMatchObject({ level: 'shop', parentCode: 'CNH' });
    expect(h.get('H2')).toMatchObject({ level: 'shop', parentCode: 'CNH2' });
    expect(h.get('CNH2')).toMatchObject({ level: 'branch' });
  });

  it('không có đơn vị nào đạt kho tổng: không thành đơn vị mua hàng, cửa hàng chưa thuộc ai', async () => {
    const h = await hierarchy();
    expect(h.get('W-01')?.level).toBe('');
    expect((await units()).find((x) => x.orgCode === 'CNW')).toBeUndefined();
    const tree = await ok('GET', '/api/v1/org-units/tree');
    expect(tree.branches.find((b: { code: string }) => b.code === 'W-01')).toMatchObject({ orgCode: 'CNW', level: '' });
  });

  it('thêm kho tổng mã 51000 vào Chi nhánh W → W thành đơn vị mua hàng ngay', async () => {
    await coKho('51000', 'Tổng W', 'CNW');
    const h = await hierarchy();
    expect(h.get('51000')).toMatchObject({ level: 'branch' });
    expect(h.get('W-02')).toMatchObject({ level: 'shop', parentCode: '51000' });
  });
});
