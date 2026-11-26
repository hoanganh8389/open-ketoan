/**
 * GET /api/v1/m/pos/reports/daily?year&month&groups&branch — Doanh số theo ngày máy POS: mỗi ngày của tháng một dòng (tháng đang chạy tới
 * hôm nay), SL trừ dòng trả, doanh thu, tỉ trọng (cộng 100 %); lọc cây nhóm hàng (phiếu NT-BH-043). Theo tháng nên không có trần 92 ngày.
 */
// [2026-11-25 11:55 PM Võ Hoàng] NGHIEM-THU — NT-BH-043: action đọc Doanh số theo ngày gom ở máy chủ (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { codeList, monthRange } from '../domain/sales-report.js';
import { todayVn } from '../read.js';
import { allowedBranch, daily } from '../sales-report.js';

export default defineAction({
  id: 'pos.report.daily', title: 'Doanh số theo ngày máy POS', tags: ['Máy bán POS'],
  permission: 'pos:sell', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR', 'FORBIDDEN'],
  input: z.object({
    year: z.coerce.number().int().min(2000).max(2100).optional(), month: z.coerce.number().int().min(1).max(12).optional(),
    groups: z.string().max(4000).optional(), branch: z.string().trim().max(32).optional(),
  }),
  output: z.array(z.record(z.unknown())),
  expose: { http: { method: 'GET', path: '/reports/daily' }, mcp: false, ai: 'read' },
  branchOf: async (_ctx, i) => i.branch || null,
  handler: async (ctx, i) => {
    const today = todayVn();
    const year = i.year ?? Number(today.slice(0, 4));
    const month = i.month ?? Number(today.slice(5, 7));
    const range = monthRange(year, month, today);
    return ctx.data.module(async (tx) => {
      const branch = await allowedBranch(ctx, tx, i.branch || undefined);
      ctx.meta('branch', branch);
      ctx.meta('year', year);
      ctx.meta('month', month);
      if (!range) {
        ctx.meta('sums', { qty: 0, revenue: 0 });
        return [];
      }
      const r = await daily(tx, { branch, ...range, selectedGroups: codeList(i.groups) });
      ctx.meta('from', range.from);
      ctx.meta('to', range.to);
      ctx.meta('sums', r.sums);
      return r.items;
    });
  },
});
