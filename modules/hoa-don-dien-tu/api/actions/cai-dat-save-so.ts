/** PUT /api/v1/m/hoa-don-dien-tu/cai-dat/so — lưu người bán + tài khoản Viettel + mặc định. Mật khẩu / token: trống = giữ, "-" = xoá, khác = đặt mới. */
// [2026-11-26 09:00 PM Võ Hoàng] NGHIEM-THU — NT-BH-048: lưu cài đặt sổ (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { P_SUA, saveSo } from '../service.js';

const txt = (max: number) => z.string().max(max).default('');

export default defineAction({
  id: 'hoa-don-dien-tu.cai-dat.save-so', title: 'Lưu cài đặt hoá đơn điện tử theo sổ', tags: ['Hoá đơn điện tử'],
  permission: P_SUA, effect: 'write', sideEffects: ['settings'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'FORBIDDEN', 'NOT_READY'],
  input: z.object({
    version: z.coerce.number().int().min(0),
    trangThai: z.enum(['nhap', 'dang-dung', 'ngung']).default('nhap'),
    mst: txt(20), tenPhapLy: txt(300), diaChi: txt(500), dienThoai: txt(50), apiBaseUrl: txt(500),
    authMode: z.enum(['basic', 'token']).default('basic'), username: txt(200), sslVerify: z.boolean().default(true),
    templateCode: txt(50), invoiceSeries: txt(50), paymentMethod: txt(50), autoEnabled: z.boolean().default(false),
    autoMode: z.enum(['draft', 'issue']).default('draft'),
    password: z.string().max(500).optional(), token: z.string().max(4000).optional(),
  }),
  output: z.object({ version: z.number(), oDaDoi: z.array(z.string()), biMat: z.array(z.string()) }),
  expose: { http: { method: 'PUT', path: '/cai-dat/so' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'hoa-don-dien-tu.so', objectId: () => 'so' },
  handler: async (ctx, i) => saveSo(ctx, i),
});
