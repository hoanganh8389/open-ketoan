// [2026-11-15 03:45 PM Võ Hoàng] LOYALTY — NT-BH-020 bước 1: website đẩy chính sách tích điểm từng cửa hàng (đóng góp)
// [2026-11-25 09:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-039 (Q4): bản kế toán phát hành thắng — website đẩy bản cũ hơn → CONFLICT LOYALTY_PROGRAM_OLDER (đóng góp)
/**
 * POST /api/v1/m/loyalty/program — website (Cổng kế toán, khoá API; nay chỉ còn lệnh tay `wp tgs-pos loyalty-push`) đẩy LoyaltyProgram của một
 * cửa hàng. Lưu thành phiên bản mới; gửi lại đúng phiên bản đang chạy → không đổi gì. Không nhận từ máy bán: quyền catalog:write, không cấp
 * cho thu ngân. Đặt trạng thái theo phiên bản (idempotency natural): gửi lại bao nhiêu lần cũng vậy, không cần Idempotency-Key.
 *
 * NT-BH-039 Q4: bản đang chạy do kế toán phát hành (nháp đã duyệt) thì website chỉ đè được khi gửi `program.updatedAt` (ISO) MỚI HƠN lúc kế
 * toán duyệt; còn lại từ chối, báo "kế toán có bản mới hơn" (không ghi nhận).
 */
import { Errors, defineAction, z } from '@bizcity/module-sdk';
import type { LoyaltyProgram } from '../domain/engine.js';
import { REASONS, publishedByAccounting } from '../drafts.js';
import { programSchema } from '../schemas.js';
import { branchExists, latestProgram, saveProgram } from '../store.js';

const vnTime = (d: Date) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(d);

export default defineAction({
  id: 'loyalty.program.put', title: 'Nhận chính sách tích điểm của cửa hàng từ website', tags: ['Điểm thành viên'],
  permission: 'catalog:write', effect: 'write', sideEffects: ['masterdata'], idempotency: 'natural',
  errors: ['VALIDATION_ERROR', 'CONFLICT'],
  input: z.object({ branchCode: z.string().trim().min(1).max(32), storeId: z.number().int().nonnegative().default(0), program: programSchema }),
  output: z.object({ branchCode: z.string(), version: z.string(), changed: z.boolean() }),
  expose: { http: { method: 'POST', path: '/program' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'loyalty.program', objectId: (i) => i.branchCode },
  handler: async (ctx, i) => ctx.data.module(async (tx) => {
    if (!(await branchExists(tx, i.branchCode))) throw Errors.validation(`Chưa có chi nhánh ${i.branchCode} ở danh mục chi nhánh`, { field: 'branchCode' });
    const cur = await latestProgram(tx, i.branchCode);
    if (cur && cur.version === i.program.version) return { branchCode: i.branchCode, version: i.program.version, changed: false };
    const acc = cur ? await publishedByAccounting(tx, i.branchCode, cur.version) : null;
    if (acc) {
      const sent = typeof i.program.updatedAt === 'string' ? Date.parse(i.program.updatedAt) : NaN;
      if (!(sent > acc.at.getTime())) {
        throw Errors.conflict(`Kế toán có bản mới hơn cho cửa hàng ${i.branchCode} (bản ${cur!.version}, ${acc.by} phát hành lúc ${vnTime(acc.at)}) — không nhận bản website gửi`,
          { reason: REASONS.older, current: cur!.version, publishedAt: acc.at.toISOString() });
      }
    }
    const changed = await saveProgram(tx, ctx.tenant.id, { branchCode: i.branchCode, version: i.program.version, storeId: i.storeId, program: i.program as unknown as LoyaltyProgram, by: ctx.actor.name });
    return { branchCode: i.branchCode, version: i.program.version, changed };
  }),
});
