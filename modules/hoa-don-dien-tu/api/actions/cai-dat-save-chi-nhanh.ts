/** PUT /api/v1/m/hoa-don-dien-tu/cai-dat/chi-nhanh/:branchCode — mẫu số / ký hiệu riêng (trống = theo sổ), portal gửi mail. */
// [2026-11-26 09:00 PM Võ Hoàng] NGHIEM-THU — NT-BH-048: lưu cài đặt chi nhánh (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { P_SUA, saveCn } from '../service.js';

export default defineAction({
  id: 'hoa-don-dien-tu.cai-dat.save-chi-nhanh', title: 'Lưu cài đặt hoá đơn điện tử theo chi nhánh', tags: ['Hoá đơn điện tử'],
  permission: P_SUA, effect: 'write', sideEffects: ['settings'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'FORBIDDEN', 'NOT_READY'],
  input: z.object({
    branchCode: z.string().trim().min(1).max(32), version: z.coerce.number().int().min(0),
    templateCode: z.string().max(50).default(''), invoiceSeries: z.string().max(50).default(''),
    portalEnabled: z.boolean().default(false), portalAccount: z.string().max(200).default(''), portalSupplierId: z.string().max(50).default(''),
    active: z.boolean().default(true), portalPassword: z.string().max(500).optional(),
  }),
  output: z.object({ branchCode: z.string(), version: z.number(), oDaDoi: z.array(z.string()), biMat: z.array(z.string()) }),
  expose: { http: { method: 'PUT', path: '/cai-dat/chi-nhanh/:branchCode' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'hoa-don-dien-tu.chi-nhanh', objectId: (i) => i.branchCode },
  branchOf: async (_ctx, i) => i.branchCode,
  handler: async (ctx, i) => saveCn(ctx, i),
});
