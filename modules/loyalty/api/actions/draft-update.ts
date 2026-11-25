// [2026-11-25 09:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-039: khai chính sách tích điểm ở kế toán (đóng góp)
/**
 * PUT /api/v1/m/loyalty/program-drafts/:id — sửa nháp (nháp / chờ duyệt / bị từ chối) kèm `revision` đang xem: người khác vừa lưu → CONFLICT
 * LOYALTY_DRAFT_CHANGED ("Nháp đã đổi lúc … bởi …, tải lại"). `submit: true` = gửi duyệt (kiểm đủ, trả mọi lỗi một lần). Bản đã phát hành không sửa.
 */
import { defineAction, z } from '@bizcity/module-sdk';
import { draftBranches, saveDraft } from '../drafts.js';
import type { ProgramContent } from '../domain/program-draft.js';
import { draftContentSchema } from '../schemas.js';

export default defineAction({
  id: 'loyalty.draft.update', title: 'Sửa nháp chính sách tích điểm', tags: ['Điểm thành viên'],
  permission: 'loyalty:chinh-sach-sua', effect: 'write', sideEffects: ['masterdata'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND'],
  input: z.object({ id: z.string().trim().min(1).max(64), program: draftContentSchema, revision: z.number().int().positive(), submit: z.boolean().default(false) }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'PUT', path: '/program-drafts/:id' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'loyalty.program-draft', objectId: (i) => i.id },
  branchOf: async (ctx, i) => ctx.data.module((tx) => draftBranches(tx, [i.id])),
  handler: async (ctx, { id, ...i }) => ctx.data.module((tx) => saveDraft(tx, ctx, id, { program: i.program as ProgramContent, revision: i.revision, submit: i.submit })),
});
