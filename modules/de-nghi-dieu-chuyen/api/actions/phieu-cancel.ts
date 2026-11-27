/** POST /api/v1/m/de-nghi-dieu-chuyen/phieu/:id/cancel — huỷ đề nghị Chờ duyệt (người lập: đề nghị của chi nhánh mình, lập hôm nay; người duyệt: mọi lúc). */
// [2026-11-28 10:00 AM Võ Hoàng] NGHIEM-THU — NT-BH-056: huỷ đề nghị điều chuyển (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { cancel } from '../service.js';
import { branchOfClaim } from '../store.js';

export default defineAction({
  id: 'de-nghi-dieu-chuyen.phieu.cancel', title: 'Huỷ đề nghị điều chuyển', tags: ['Đề nghị điều chuyển'],
  permission: 'de-nghi-dieu-chuyen:lap', effect: 'write', sideEffects: ['documents'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND', 'FORBIDDEN'],
  input: z.object({ id: z.string().trim().min(1).max(32), branchCode: z.string().trim().max(32).optional(), reason: z.string().trim().max(500).default('') }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/phieu/:id/cancel' }, mcp: false, ai: 'deny', destructive: true },
  evidence: { objectType: 'de-nghi-dieu-chuyen.phieu', objectId: (i) => i.id },
  branchOf: async (ctx, i) => ctx.data.module((tx) => branchOfClaim(tx, i.id, i.branchCode)),
  handler: async (ctx, { id, reason }) => cancel(ctx, id, reason),
});
