// [2026-11-23 02:00 PM Nguyễn Văn Thủy] MH22 — kiểm danh sách MST nhận hoá đơn: khớp MST gốc / chi nhánh, ingest-xml, whoami, gợi ý, MH12 không xoá mất (đóng góp)
/**
 * Một trang ERP nhận hoá đơn đầu vào của nhiều công ty / chi nhánh theo danh sách MST cấu hình ở MH22.
 *   Trống           như trước: cùng MST gốc với đơn vị (HT03)
 *   MST gốc         nhận mọi chi nhánh;  MST có đuôi: chỉ đúng chi nhánh đó
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/client.js';
import { chuanDanhSach, khopMst } from '../src/phan-he/mua-hang/mst-nhan-hoa-don.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let t: TestCtx;
let tenantId = '';
const URL_XML = '/api/v1/purchase/invoices/ingest-xml';
const URL_MST = '/api/v1/purchase/invoices/buyer-tax-codes';
let so = 500;
const xml = (mua: string) => `<?xml version="1.0" encoding="UTF-8"?>
<HDon><DLHDon><TTChung><KHMSHDon>1</KHMSHDon><KHHDon>C26TMM</KHHDon><SHDon>${++so}</SHDon><NLap>2026-11-20</NLap><DVTTe>VND</DVTTe></TTChung>
<NDHDon><NBan><Ten>Công ty Bán</Ten><MST>0109999999</MST><DChi>Hà Nội</DChi></NBan><NMua><Ten>Bên mua ${mua}</Ten><MST>${mua}</MST></NMua>
<DSHHDVu><HHDVu><TChat>1</TChat><MHHDVu>MM-1</MHHDVu><THHDVu>Hàng thử</THHDVu><DVTinh>Hộp</DVTinh><SLuong>1</SLuong><DGia>100000</DGia><ThTien>100000</ThTien><TSuat>8%</TSuat></HHDVu></DSHHDVu>
<TToan><TgTCThue>100000</TgTCThue><TgTThue>8000</TgTThue><TgTTTBSo>108000</TgTTTBSo></TToan></NDHDon></DLHDon><MCCQT>00MM</MCCQT></HDon>`;
const gui = async (mua: string) => (await call(t, 'POST', URL_XML, { fileName: 'hd.xml', xmlBase64: Buffer.from(xml(mua), 'utf8').toString('base64') })).body.data as { status: string; message?: string };
const luu = (taxCodes: string[]) => call(t, 'PUT', URL_MST, { taxCodes });

beforeAll(async () => {
  t = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', t.tenantCode).executeTakeFirstOrThrow()).id;
  await db.updateTable('tenants').set({ tax_code: '0106933743' }).where('id', '=', tenantId).execute();
  await db.insertInto('branches').values([
    { tenant_id: tenantId, code: 'MM-PT', name: 'Chi nhánh Phú Thọ', tax_code: '0106933743-008' },
    { tenant_id: tenantId, code: 'MM-HM', name: 'Homemart', tax_code: '0110981355' },
    { tenant_id: tenantId, code: 'MM-RAC', name: 'Điểm bán', tax_code: 'ĐỊA ĐIỂM KINH DOANH' },
  ]).execute();
}, 60_000);
afterAll(async () => { await t.app.close(); });

describe('Khớp MST (hàm thuần)', () => {
  it('MST gốc nhận mọi chi nhánh, MST có đuôi chỉ đúng nó', () => {
    expect(khopMst(['0106933743'], '0106933743-008')).toBe('0106933743');
    expect(khopMst(['0106933743'], '0106933743')).toBe('0106933743');
    expect(khopMst(['0106933743-008'], '0106933743-008')).toBe('0106933743-008');
    expect(khopMst(['0106933743-008'], '0106933743-013')).toBeNull();
    expect(khopMst(['0106933743-008'], '0106933743')).toBeNull();
    expect(khopMst(['0110981355'], ' 0110981355 ')).toBe('0110981355');
    expect(khopMst(['0106933743'], '01069337430')).toBeNull();
    expect(khopMst([], '0106933743')).toBeNull();
  });
  it('chuẩn danh sách: bỏ trùng, bỏ chi nhánh đã nằm trong MST gốc, báo ô sai khuôn', () => {
    expect(chuanDanhSach(['0110981355', ' 0106933743-008 ', '0106933743-008', '0106933743', '']).list).toEqual(['0106933743', '0110981355']);
    expect(chuanDanhSach(['0106933743-008', '0106933743-013']).list).toEqual(['0106933743-008', '0106933743-013']);
    expect(chuanDanhSach(['123', '0106933743-08', 'abc']).loi).toHaveLength(3);
  });
});

describe('MST nhận hoá đơn (MH22)', () => {
  it('chưa cấu hình: như trước — nhận cùng MST gốc với đơn vị, công ty khác báo sai người mua và chỉ chỗ sửa', async () => {
    const g = (await call(t, 'GET', URL_MST)).body.data;
    expect(g).toMatchObject({ list: [], effective: ['0106933743'], tenantTaxCode: '0106933743' });
    expect((await gui('0106933743-008')).status).toBe('saved');
    expect((await gui('0106933743')).status).toBe('saved');
    const hm = await gui('0110981355');
    expect(hm.status).toBe('wrong_buyer');
    expect(hm.message).toContain('MH22');
  });

  it('gợi ý: MST đơn vị, chi nhánh (bỏ ô ghi sai khuôn), người mua trên hoá đơn đã nhận kèm số tờ', async () => {
    const goiY = (await call(t, 'GET', URL_MST)).body.data.suggestions as { mst: string; ten: string; nguon: string[]; soHoaDon: number; dangNhan: boolean }[];
    expect(goiY.map((x) => x.mst)).toEqual(['0106933743', '0106933743-008', '0110981355']);
    expect(goiY.find((x) => x.mst === '0106933743-008')).toMatchObject({ ten: 'Chi nhánh Phú Thọ', soHoaDon: 1, dangNhan: true });
    expect(goiY.find((x) => x.mst === '0106933743-008')!.nguon).toEqual(expect.arrayContaining(['chi_nhanh', 'hoa_don']));
    expect(goiY.find((x) => x.mst === '0110981355')).toMatchObject({ ten: 'Homemart', dangNhan: false, soHoaDon: 0 });
  });

  it('thêm Homemart + chỉ chi nhánh Phú Thọ: Homemart nhận, chi nhánh khác của TGS bị chặn', async () => {
    const r = await luu(['0110981355', '0106933743-008']);
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ list: ['0106933743-008', '0110981355'], effective: ['0106933743-008', '0110981355'] });
    expect((await gui('0110981355')).status).toBe('saved');
    expect((await gui('0106933743-008')).status).toBe('saved');
    const khac = await gui('0106933743-013');
    expect(khac.status).toBe('wrong_buyer');
    expect(khac.message).toContain('0106933743-008, 0110981355');
    expect((await gui('0106933743')).status).toBe('wrong_buyer');
  });

  it('cầu nối hỏi khoá: trả danh sách MST trang nhận', async () => {
    const key = (await call(t, 'POST', '/api/v1/api-keys', { name: 'Cầu nối', scopes: ['documents:write'] })).body.data.key;
    const w = await t.app.inject({ method: 'GET', url: '/api/v1/purchase/invoices/bridge/whoami', headers: { 'x-api-key': key } });
    expect(w.json().data).toMatchObject({ taxCode: '0106933743', taxCodes: ['0106933743-008', '0110981355'], taxCodesConfigured: true });
    // Khoá chỉ gửi chứng từ không sửa được danh sách.
    const sua = await t.app.inject({ method: 'PUT', url: URL_MST, headers: { 'x-api-key': key }, payload: { taxCodes: [] } });
    expect(sua.statusCode).toBe(403);
  });

  it('lưu cài đặt mua hàng (MH12) không xoá mất danh sách', async () => {
    const s = (await call(t, 'GET', '/api/v1/purchase/settings')).body.data;
    const r = await call(t, 'PUT', '/api/v1/purchase/settings', { holidays: s.holidays, brandOpening: s.brandOpening, warnDays: 5, priceWarnPct: s.priceWarnPct, requireOrder: s.requireOrder, blockOverOrder: s.blockOverOrder });
    expect(r.status).toBe(200);
    expect((await call(t, 'GET', URL_MST)).body.data.list).toEqual(['0106933743-008', '0110981355']);
    expect((await call(t, 'GET', '/api/v1/purchase/settings')).body.data.warnDays).toBe(5);
  });

  it('MST sai khuôn bị từ chối, danh sách giữ nguyên', async () => {
    const r = await luu(['0110981355', '12345']);
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toContain('12345');
    expect((await call(t, 'GET', URL_MST)).body.data.list).toEqual(['0106933743-008', '0110981355']);
  });

  it('xoá trắng danh sách: trở lại theo MST đơn vị', async () => {
    expect((await luu([])).body.data).toMatchObject({ list: [], effective: ['0106933743'] });
    expect((await gui('0106933743-013')).status).toBe('saved');
    expect((await gui('0110981355')).status).toBe('wrong_buyer');
  });
});
