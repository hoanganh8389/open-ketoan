/**
 * GET /api/v1/m/pos/reports/collections?from&to&method&page&pageSize&branch — Thu tiền bán hàng máy POS: một dòng một khoản thu tiền
 * như bút toán thu tiền của sổ (bỏ phần đối trừ đổi hàng, ghi nợ); số phiếu thu = mã tham chiếu thanh toán, không có thì số đơn
 * (phiếu NT-BH-043 Q4, ca 13). meta.sums: tổng thu, theo hình thức.
 */
// [2026-11-25 11:55 PM Võ Hoàng] NGHIEM-THU — NT-BH-043: action đọc Thu tiền bán hàng khớp sổ (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { PAGE_MAX } from '../domain/sales-report.js';
import { todayVn } from '../read.js';
import { allowedBranch, checkRange, collections } from '../sales-report.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export default defineAction({
  id: 'pos.report.collections', title: 'Thu tiền bán hàng máy POS', tags: ['Máy bán POS'],
  permission: 'pos:sell', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR', 'FORBIDDEN'],
  input: z.object({
    from: day.optional(), to: day.optional(), method: z.string().trim().max(32).optional(),
    page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(PAGE_MAX).default(PAGE_MAX),
    branch: z.string().trim().max(32).optional(),
  }),
  output: z.array(z.record(z.unknown())),
  expose: { http: { method: 'GET', path: '/reports/collections' }, mcp: false, ai: 'read' },
  branchOf: async (_ctx, i) => i.branch || null,
  handler: async (ctx, i) => {
    const from = i.from ?? todayVn();
    const to = i.to ?? from;
    checkRange(from, to);
    return ctx.data.module(async (tx) => {
      const branch = await allowedBranch(ctx, tx, i.branch || undefined);
      const r = await collections(tx, { branch, from, to, method: i.method || undefined, page: i.page, pageSize: i.pageSize });
      ctx.meta('page', r.meta.page);
      ctx.meta('pageSize', r.meta.pageSize);
      ctx.meta('total', r.meta.total);
      ctx.meta('sums', r.meta.sums);
      ctx.meta('branch', branch);
      return r.items;
    });
  },
});
