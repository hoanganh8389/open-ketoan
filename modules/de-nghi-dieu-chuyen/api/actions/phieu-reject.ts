/** POST /api/v1/m/de-nghi-dieu-chuyen/phieu/:id/reject — người duyệt từ chối đề nghị Chờ duyệt (lý do bắt buộc ≥ 5 ký tự). */
// [2026-11-28 10:00 AM Võ Hoàng] NGHIEM-THU — NT-BH-056: từ chối đề nghị điều chuyển (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { reject } from '../service.js';
import { branchOfClaim } from '../store.js';

export default defineAction({
  id: 'de-nghi-dieu-chuyen.phieu.reject', title: 'Từ chối đề nghị điều chuyển', tags: ['Đề nghị điều chuyển'],
  permission: 'de-nghi-dieu-chuyen:duyet', effect: 'write', sideEffects: ['documents'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND', 'FORBIDDEN'],
  input: z.object({ id: z.string().trim().min(1).max(32), branchCode: z.string().trim().max(32).optional(), reason: z.string().trim().max(500).default('') }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/phieu/:id/reject' }, mcp: false, ai: 'deny', destructive: true },
  evidence: { objectType: 'de-nghi-dieu-chuyen.phieu', objectId: (i) => i.id },
  branchOf: async (ctx, i) => ctx.data.module((tx) => branchOfClaim(tx, i.id, i.branchCode)),
  handler: async (ctx, { id, reason }) => reject(ctx, id, reason),
});
