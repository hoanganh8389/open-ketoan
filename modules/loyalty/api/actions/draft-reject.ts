// [2026-11-25 09:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-039: khai chính sách tích điểm ở kế toán (đóng góp)
/** POST /api/v1/m/loyalty/program-drafts/reject — từ chối nháp đã gửi duyệt kèm lý do (người lập sửa rồi gửi lại); người lập không tự từ chối. */
import { defineAction, z } from '@bizcity/module-sdk';
import { draftBranches, rejectDrafts } from '../drafts.js';
import { idsSchema } from '../schemas.js';

export default defineAction({
  id: 'loyalty.draft.reject', title: 'Từ chối nháp chính sách tích điểm', tags: ['Điểm thành viên'],
  permission: 'loyalty:chinh-sach-duyet', effect: 'write', sideEffects: ['masterdata'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND', 'FORBIDDEN'],
  input: z.object({ ids: idsSchema, reason: z.string().trim().min(1, 'Ghi lý do từ chối').max(500) }),
  output: z.object({ items: z.array(z.record(z.unknown())) }),
  expose: { http: { method: 'POST', path: '/program-drafts/reject' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'loyalty.program-draft', objectId: (i) => i.ids.join(',') },
  branchOf: async (ctx, i) => ctx.data.module((tx) => draftBranches(tx, i.ids)),
  handler: async (ctx, i) => ({ items: await ctx.data.module((tx) => rejectDrafts(tx, ctx, i.ids, i.reason)) }),
});
