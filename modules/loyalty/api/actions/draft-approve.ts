// [2026-11-25 09:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-039: khai chính sách tích điểm ở kế toán (đóng góp)
/**
 * POST /api/v1/m/loyalty/program-drafts/approve — duyệt một hoặc nhiều nháp đã gửi duyệt (cùng lúc) = phát hành: thêm dòng programs (phiên bản =
 * băm nội dung, received_by = người duyệt); máy bán tính theo bản mới từ đơn kế tiếp. Người lập không tự duyệt (FORBIDDEN).
 */
import { defineAction, z } from '@bizcity/module-sdk';
import { approveDrafts, draftBranches } from '../drafts.js';
import { idsSchema } from '../schemas.js';

export default defineAction({
  id: 'loyalty.draft.approve', title: 'Duyệt và phát hành chính sách tích điểm', tags: ['Điểm thành viên'],
  permission: 'loyalty:chinh-sach-duyet', effect: 'write', sideEffects: ['masterdata'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND', 'FORBIDDEN'],
  input: z.object({ ids: idsSchema, note: z.string().trim().max(500).optional() }),
  output: z.object({ items: z.array(z.record(z.unknown())) }),
  expose: { http: { method: 'POST', path: '/program-drafts/approve' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'loyalty.program-draft', objectId: (i) => i.ids.join(',') },
  branchOf: async (ctx, i) => ctx.data.module((tx) => draftBranches(tx, i.ids)),
  handler: async (ctx, i) => ({ items: await ctx.data.module((tx) => approveDrafts(tx, ctx, i.ids, i.note)) }),
});
