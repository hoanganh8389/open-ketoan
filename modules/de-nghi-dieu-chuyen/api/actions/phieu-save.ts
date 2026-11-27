/**
 * POST /api/v1/m/de-nghi-dieu-chuyen/phieu — lập đề nghị (Chờ duyệt); có id = sửa đề nghị đang chờ (kèm version).
 * Kiểm như máy bán cũ: chi nhánh nhận bắt buộc (cùng cấp trên / cấp trên), dòng có mã + SL > 0, SL cộng theo mã ≤ tồn kho xuất (kiểm lại
 * phía máy chủ, khoá tồn tới hết giao dịch), hạn dùng đúng dạng; khách hàng không bắt buộc. Idempotency-Key bắt buộc.
 */
// [2026-11-28 10:00 AM Võ Hoàng] NGHIEM-THU — NT-BH-056: lập / sửa đề nghị điều chuyển (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { save } from '../service.js';
import { branchOfClaim } from '../store.js';

const line = z.object({
  sku: z.string().trim().max(64), name: z.string().trim().max(500).optional(), unit: z.string().trim().max(32).optional(), qty: z.coerce.number(),
  unitPrice: z.coerce.number().optional(), note: z.string().trim().max(500).optional(), lotNo: z.string().trim().max(64).optional(),
  expDate: z.string().trim().max(10).optional(),
});

export default defineAction({
  id: 'de-nghi-dieu-chuyen.phieu.save', title: 'Lập / sửa đề nghị điều chuyển', tags: ['Đề nghị điều chuyển'],
  permission: 'de-nghi-dieu-chuyen:lap', effect: 'write', sideEffects: ['documents'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND', 'FORBIDDEN'],
  input: z.object({
    id: z.string().trim().max(32).optional(), version: z.coerce.number().int().optional(),
    branchCode: z.string().trim().min(1, 'Thiếu chi nhánh đề nghị').max(32), toBranchCode: z.string().trim().max(32).default(''),
    partnerCode: z.string().trim().max(64).optional(), partnerName: z.string().trim().max(255).optional(), reasonCode: z.string().trim().max(32).optional(),
    staffName: z.string().trim().max(255).optional(), note: z.string().trim().max(2000).optional(), source: z.enum(['ketoan', 'pos']).default('ketoan'),
    lines: z.array(line).max(500).default([]),
  }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/phieu' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'de-nghi-dieu-chuyen.phieu', objectId: (_i, o) => String((o as { id?: string }).id ?? '') || undefined },
  branchOf: async (ctx, i) => (i.id ? ctx.data.module((tx) => branchOfClaim(tx, i.id!, i.branchCode)) : i.branchCode),
  handler: async (ctx, i) => save(ctx, i),
});
