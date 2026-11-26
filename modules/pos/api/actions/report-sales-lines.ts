/**
 * GET /api/v1/m/pos/reports/sales-lines?from&to&kind&groups&q&page&pageSize&branch — Báo cáo bán hàng máy POS: một dòng một mặt hàng của
 * phiếu bán / trả, chia trang ở máy chủ, meta.sums của cả khoảng lọc (phiếu NT-BH-043). Cột giá vốn chỉ khi có `pos:report` (Q3).
 */
// [2026-11-25 11:55 PM Võ Hoàng] NGHIEM-THU — NT-BH-043: action đọc Báo cáo bán hàng gom ở máy chủ (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { codeList, PAGE_MAX } from '../domain/sales-report.js';
import { todayVn } from '../read.js';
import { allowedBranch, checkRange, salesLines } from '../sales-report.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export default defineAction({
  id: 'pos.report.sales-lines', title: 'Báo cáo bán hàng máy POS (dòng hàng)', tags: ['Máy bán POS'],
  permission: 'pos:sell', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR', 'FORBIDDEN'],
  input: z.object({
    from: day.optional(), to: day.optional(), kind: z.enum(['sale', 'return', 'all']).default('all'),
    groups: z.string().max(4000).optional(), q: z.string().max(100).optional(),
    page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(PAGE_MAX).default(PAGE_MAX),
    branch: z.string().trim().max(32).optional(),
  }),
  output: z.array(z.record(z.unknown())),
  expose: { http: { method: 'GET', path: '/reports/sales-lines' }, mcp: false, ai: 'read' },
  branchOf: async (_ctx, i) => i.branch || null,
  handler: async (ctx, i) => {
    const from = i.from ?? todayVn();
    const to = i.to ?? from;
    checkRange(from, to);
    return ctx.data.module(async (tx) => {
      const branch = await allowedBranch(ctx, tx, i.branch || undefined);
      const canCost = ctx.can('pos:report');
      const r = await salesLines(tx, { branch, from, to, kind: i.kind, q: i.q, groups: null, selectedGroups: codeList(i.groups), page: i.page, pageSize: i.pageSize, canCost });
      ctx.meta('page', r.meta.page);
      ctx.meta('pageSize', r.meta.pageSize);
      ctx.meta('total', r.meta.total);
      ctx.meta('sums', r.meta.sums);
      ctx.meta('branch', branch);
      ctx.meta('cost', canCost);
      return r.items;
    });
  },
});
