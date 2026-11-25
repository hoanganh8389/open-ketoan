// [2026-11-25 09:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-039: khai chính sách tích điểm ở kế toán (đóng góp)
/**
 * POST /api/v1/m/loyalty/program-drafts — lập nháp chính sách cho một hoặc nhiều cửa hàng. Không gửi `program` → mỗi cửa hàng chép bản đang
 * chạy của chính nó ("Sửa từ bản hiện hành", Q3); có `program` → gộp chính sách theo mã vào bản của từng cửa hàng (áp nhiều cửa hàng một lần).
 * Cửa hàng đã có nháp đang mở → CONFLICT (LOYALTY_DRAFT_OPEN). `submit: true` = gửi duyệt luôn. Chưa áp ở máy bán tới khi duyệt.
 */
import { defineAction, z } from '@bizcity/module-sdk';
import { createDrafts } from '../drafts.js';
import type { ProgramContent } from '../domain/program-draft.js';
import { draftContentSchema } from '../schemas.js';

export default defineAction({
  id: 'loyalty.draft.create', title: 'Lập nháp chính sách tích điểm', tags: ['Điểm thành viên'],
  permission: 'loyalty:chinh-sach-lap', effect: 'write', sideEffects: ['masterdata'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT'],
  input: z.object({
    branchCodes: z.array(z.string().trim().min(1).max(32)).min(1, 'Chọn ít nhất một cửa hàng').max(200),
    program: draftContentSchema.optional(), submit: z.boolean().default(false),
  }),
  output: z.object({ items: z.array(z.record(z.unknown())) }),
  expose: { http: { method: 'POST', path: '/program-drafts' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'loyalty.program-draft', objectId: (i) => i.branchCodes.join(',') },
  branchOf: async (_ctx, i) => i.branchCodes,
  handler: async (ctx, i) => ({
    items: await ctx.data.module((tx) => createDrafts(tx, ctx, { branchCodes: i.branchCodes, program: i.program as ProgramContent | undefined, submit: i.submit })),
  }),
});
