/**
 * GET /api/v1/m/pos/reports/by-category?from&to&groups&view&branch — Bán hàng theo danh mục máy POS: gom theo mã hàng (SL trừ dòng trả,
 * doanh thu dòng trả âm), lọc cây nhóm hàng (chọn cha lấy cả con); không chia trang (số dòng = số mã). meta.groups: cây nhóm hàng cho bộ
 * chọn (phiếu NT-BH-043).
 */
// [2026-11-25 11:55 PM Võ Hoàng] NGHIEM-THU — NT-BH-043: action đọc Bán hàng theo danh mục (cây nhóm hàng) (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { codeList } from '../domain/sales-report.js';
import { todayVn } from '../read.js';
import { allowedBranch, byCategory, checkRange, itemGroups } from '../sales-report.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export default defineAction({
  id: 'pos.report.by-category', title: 'Bán hàng theo danh mục máy POS', tags: ['Máy bán POS'],
  permission: 'pos:sell', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR', 'FORBIDDEN'],
  input: z.object({
    from: day.optional(), to: day.optional(), groups: z.string().max(4000).optional(),
    /** Như POS cũ: all = cả SL và doanh thu; qty / revenue = màn chỉ hiện một cột (số trả về như nhau). */
    view: z.enum(['all', 'qty', 'revenue']).default('all'),
    branch: z.string().trim().max(32).optional(),
  }),
  output: z.array(z.record(z.unknown())),
  expose: { http: { method: 'GET', path: '/reports/by-category' }, mcp: false, ai: 'read' },
  branchOf: async (_ctx, i) => i.branch || null,
  handler: async (ctx, i) => {
    const from = i.from ?? todayVn();
    const to = i.to ?? from;
    checkRange(from, to);
    return ctx.data.module(async (tx) => {
      const branch = await allowedBranch(ctx, tx, i.branch || undefined);
      const r = await byCategory(tx, { branch, from, to, kind: 'all', groups: null, selectedGroups: codeList(i.groups) });
      ctx.meta('total', r.items.length);
      ctx.meta('sums', r.sums);
      ctx.meta('view', i.view);
      ctx.meta('branch', branch);
      ctx.meta('groups', (await itemGroups(tx)).filter((g) => g.isActive));
      return r.items;
    });
  },
});
