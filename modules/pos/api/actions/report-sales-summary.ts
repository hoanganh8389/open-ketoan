/**
 * GET /api/v1/m/pos/reports/sales-summary?from&to&kind&q&page&pageSize&branch — Tổng hợp bán hàng máy POS: một dòng một phiếu bán / trả
 * (thu ngân, ghi chú phiếu, thêm quà thủ công, đã trả, còn nợ), chia trang ở máy chủ, meta.sums của cả khoảng lọc (phiếu NT-BH-043).
 */
// [2026-11-25 11:55 PM Võ Hoàng] NGHIEM-THU — NT-BH-043: action đọc Tổng hợp bán hàng gom ở máy chủ (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { PAGE_MAX } from '../domain/sales-report.js';
import { todayVn } from '../read.js';
import { allowedBranch, checkRange, salesSummary } from '../sales-report.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export default defineAction({
  id: 'pos.report.sales-summary', title: 'Tổng hợp bán hàng máy POS (phiếu)', tags: ['Máy bán POS'],
  permission: 'pos:sell', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR', 'FORBIDDEN'],
  input: z.object({
    from: day.optional(), to: day.optional(), kind: z.enum(['sale', 'return', 'all']).default('all'), q: z.string().max(100).optional(),
    page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(PAGE_MAX).default(PAGE_MAX),
    branch: z.string().trim().max(32).optional(),
  }),
  output: z.array(z.record(z.unknown())),
  expose: { http: { method: 'GET', path: '/reports/sales-summary' }, mcp: false, ai: 'read' },
  branchOf: async (_ctx, i) => i.branch || null,
  handler: async (ctx, i) => {
    const from = i.from ?? todayVn();
    const to = i.to ?? from;
    checkRange(from, to);
    return ctx.data.module(async (tx) => {
      const branch = await allowedBranch(ctx, tx, i.branch || undefined);
      const r = await salesSummary(tx, { branch, from, to, kind: i.kind, q: i.q, page: i.page, pageSize: i.pageSize });
      ctx.meta('page', r.meta.page);
      ctx.meta('pageSize', r.meta.pageSize);
      ctx.meta('total', r.meta.total);
      ctx.meta('sums', r.meta.sums);
      ctx.meta('branch', branch);
      return r.items;
    });
  },
});
