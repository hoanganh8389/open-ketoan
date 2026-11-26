/** POST /api/v1/m/hoa-don-dien-tu/ket-noi/thu — máy chủ gọi GET API base URL bằng tài khoản đã khai, báo mã HTTP. Không phát hành hoá đơn. */
// [2026-11-26 09:00 PM Võ Hoàng] NGHIEM-THU — NT-BH-048: thử kết nối Viettel (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { P_SUA, thuKetNoi } from '../service.js';

export default defineAction({
  id: 'hoa-don-dien-tu.ket-noi.thu', title: 'Thử kết nối Viettel', tags: ['Hoá đơn điện tử'],
  permission: P_SUA, effect: 'write', sideEffects: ['external'], idempotency: 'natural',
  errors: ['VALIDATION_ERROR', 'FORBIDDEN', 'NOT_READY'],
  input: z.object({}),
  output: z.object({ ok: z.boolean(), httpCode: z.number().nullable(), ms: z.number(), message: z.string() }),
  expose: { http: { method: 'POST', path: '/ket-noi/thu' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'hoa-don-dien-tu.so', objectId: () => 'ket-noi' },
  handler: async (ctx) => thuKetNoi(ctx),
});
