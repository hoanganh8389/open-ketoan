/**
 * POST /api/v1/m/voucher/campaigns/:id/batch — sinh LÔ mã không gắn SĐT cho đợt (tiền tố + số lượng), để in / phát tay như "phát hành mã hàng
 * loạt" của plugin chính sách cũ. Ai cầm mã cũng dùng; giới hạn "mỗi khách tối đa" của đợt vẫn kiểm lúc dùng (theo SĐT / mã khách của đơn).
 */
// [2026-11-27 09:00 AM Võ Hoàng] NGHIEM-THU — NT-BH-050: lô mã không SĐT (V2) (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { issueBatch } from '../store.js';
import { todayVn } from '../today.js';

export default defineAction({
  id: 'voucher.code.batch', title: 'Sinh lô mã voucher không gắn SĐT', tags: ['Voucher'],
  permission: 'voucher:write', effect: 'write', sideEffects: ['documents'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND'],
  input: z.object({
    id: z.string().trim().min(1).max(64),
    prefix: z.string().trim().max(12).default(''),
    qty: z.number().int('Số lượng là số nguyên').min(1, 'Số lượng tối thiểu 1').max(5000, 'Mỗi lần tối đa 5.000 mã'),
  }),
  output: z.object({ campaignId: z.string(), created: z.array(z.object({ code: z.string(), phone: z.string().nullable() })), skipped: z.array(z.record(z.unknown())) }),
  expose: { http: { method: 'POST', path: '/campaigns/:id/batch' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'voucher.campaign', objectId: (input) => input.id },
  handler: async (ctx, i) => ctx.data.module((tx) => issueBatch(tx, ctx, i.id, i.prefix, i.qty, todayVn())),
});
