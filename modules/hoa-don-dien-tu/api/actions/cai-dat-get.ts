/** GET /api/v1/m/hoa-don-dien-tu/cai-dat — cài đặt sổ + bảng chi nhánh + trạng thái bí mật (không bao giờ có giá trị). */
// [2026-11-26 09:00 PM Võ Hoàng] NGHIEM-THU — NT-BH-048: đọc cài đặt hoá đơn điện tử (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { P_XEM, readAll } from '../service.js';

export default defineAction({
  id: 'hoa-don-dien-tu.cai-dat.get', title: 'Xem cài đặt hoá đơn điện tử', tags: ['Hoá đơn điện tử'],
  permission: P_XEM, effect: 'read', idempotency: 'none', errors: ['FORBIDDEN'],
  input: z.object({}),
  output: z.record(z.unknown()),
  expose: { http: { method: 'GET', path: '/cai-dat' }, mcp: true, ai: 'read' },
  handler: async (ctx) => readAll(ctx),
});
