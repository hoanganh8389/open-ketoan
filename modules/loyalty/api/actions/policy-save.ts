// [2026-11-28 02:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-059: lưu một chương trình / cài đặt + hạng cho Tất cả hoặc các cửa hàng chọn (đóng góp)
/**
 * POST /api/v1/m/loyalty/policies/save — { policy | config, target: { all, branchCodes }, mode: draft | submit | approve }.
 * Rải vào nháp từng cửa hàng (gộp vào nháp đang mở nếu có); cửa hàng bỏ khỏi phạm vi mà đang có mã → ngừng ở đó. mode approve cần thêm quyền
 * loyalty:chinh-sach-duyet và phát hành ngay (người có quyền tự lập tự duyệt — Hoàng 28/11). Lỗi trả một lần, đường dẫn ô theo form.
 */
import { defineAction, z } from '@bizcity/module-sdk';
import { activeBranches, saveAcross, type SaveMode } from '../drafts.js';
import type { ProgramContent } from '../domain/program-draft.js';
import { draftPolicySchema, settingsSchema, tierSchema } from '../schemas.js';

const input = z.object({
  policy: draftPolicySchema.optional(),
  config: z.object({ settings: settingsSchema, tiers: z.array(tierSchema).min(1).max(50) }).optional(),
  target: z.object({ all: z.boolean(), branchCodes: z.array(z.string().trim().min(1).max(32)).max(500).default([]) }),
  mode: z.enum(['draft', 'submit', 'approve']).default('draft'),
});

export default defineAction({
  id: 'loyalty.policy.save', title: 'Lưu chương trình tích điểm cho nhiều cửa hàng', tags: ['Điểm thành viên'],
  permission: 'loyalty:chinh-sach-lap', effect: 'write', sideEffects: ['masterdata'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND', 'FORBIDDEN'],
  input,
  output: z.object({ items: z.array(z.record(z.unknown())), targets: z.array(z.string()), stopped: z.array(z.string()), published: z.boolean() }),
  expose: { http: { method: 'POST', path: '/policies/save' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'loyalty.program-draft', objectId: (i) => (i.policy ? String(i.policy.code) : 'cai-dat') },
  branchOf: async (ctx, i) => (i.target.all ? ctx.data.module(async (tx) => (await activeBranches(tx)).map((b) => b.code)) : i.target.branchCodes),
  handler: async (ctx, i) => ctx.data.module((tx) => saveAcross(tx, ctx, {
    policy: i.policy as ProgramContent['policies'][number] | undefined,
    config: i.config as { settings: ProgramContent['settings']; tiers: ProgramContent['tiers'] } | undefined,
    target: { all: i.target.all, branchCodes: i.target.branchCodes }, mode: i.mode as SaveMode,
  })),
});
