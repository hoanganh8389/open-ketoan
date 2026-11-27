/** GET /api/v1/m/hoa-don-dien-tu/nhat-ky — ai, lúc nào, sửa ô nào, thử kết nối (mã HTTP). Không có giá trị bí mật. */
// [2026-11-26 09:00 PM Võ Hoàng] NGHIEM-THU — NT-BH-048: nhật ký cài đặt (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { P_XEM, nhatKy } from '../service.js';

export default defineAction({
  id: 'hoa-don-dien-tu.nhat-ky.list', title: 'Nhật ký cài đặt hoá đơn điện tử', tags: ['Hoá đơn điện tử'],
  permission: P_XEM, effect: 'read', idempotency: 'none', errors: ['FORBIDDEN'],
  input: z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }),
  output: z.object({ items: z.array(z.record(z.unknown())) }),
  expose: { http: { method: 'GET', path: '/nhat-ky' }, mcp: true, ai: 'read' },
  handler: async (ctx, i) => nhatKy(ctx, i.limit),
});
