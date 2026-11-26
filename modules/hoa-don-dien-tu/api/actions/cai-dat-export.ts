/**
 * GET /api/v1/m/hoa-don-dien-tu/cai-dat/export?branchCode= — cài đặt hiệu lực theo chi nhánh cho cầu nối / plugin Viettel (S-HD-4).
 * KHÔNG có bí mật: mật khẩu / token đọc riêng qua GET /api/v1/m/hoa-don-dien-tu/secrets/read (khoá app có secrets:read:hoa-don-dien-tu).
 */
// [2026-11-26 09:00 PM Võ Hoàng] NGHIEM-THU — NT-BH-048: xuất cài đặt cho cầu nối (đóng góp)
// [2026-11-26 11:40 PM Võ Hoàng] NGHIEM-THU — NT-BH-048 M9: quyền Core reports:read (khoá kt_ của cầu nối mang sẵn; quyền module không cấp được cho khoá) — không có bí mật (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { exportFor } from '../service.js';

export default defineAction({
  id: 'hoa-don-dien-tu.cai-dat.export', title: 'Cài đặt hoá đơn điện tử theo chi nhánh (cho cầu nối)', tags: ['Hoá đơn điện tử'],
  permission: 'reports:read', effect: 'read', idempotency: 'none', errors: ['NOT_FOUND', 'FORBIDDEN'],
  input: z.object({ branchCode: z.string().trim().max(32).optional() }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'GET', path: '/cai-dat/export' }, mcp: true, ai: 'read' },
  handler: async (ctx, i) => exportFor(ctx, i.branchCode || undefined),
});
