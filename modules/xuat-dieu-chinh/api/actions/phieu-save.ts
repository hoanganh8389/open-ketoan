/**
 * POST /api/v1/m/xuat-dieu-chinh/phieu — lưu phiếu: mode draft = Lưu nháp (chỉ bảng module, chưa vào sổ); mode post = Lưu (ghi sổ, trừ kho ngay).
 * Có id = sửa nháp (kèm version — người lưu sau với phiên bản cũ nhận CONFLICT). Idempotency-Key bắt buộc: bấm hai lần một kết quả.
 */
// [2026-11-26 03:10 PM Võ Hoàng] NGHIEM-THU — NT-BH-044: lưu nháp / ghi sổ phiếu BH06 (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { save } from '../service.js';
import { branchOfPhieu } from '../store.js';

const line = z.object({
  lineKey: z.string().trim().max(64).optional(), sku: z.string().trim().max(64), unit: z.string().trim().max(32).optional(), unitQty: z.coerce.number(),
  lotNo: z.string().trim().max(64).optional(), expDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), unitPrice: z.coerce.number().optional(),
});

export default defineAction({
  id: 'xuat-dieu-chinh.phieu.save', title: 'Lưu phiếu xuất điều chỉnh (nháp / ghi sổ)', tags: ['Phiếu xuất điều chỉnh'],
  description: 'Lưu nháp hoặc Lưu = ghi sổ: phiếu 0 đ → stock_adjustment giảm kho (purposeCode theo lý do), phiếu có giá → sale nội bộ, không hoá đơn điện tử, công nợ người nhận. Chặn xuất quá tồn của kho.',
  permission: 'xuat-dieu-chinh:phieu-lap', effect: 'write', sideEffects: ['documents', 'ledger'], idempotency: 'required',
  errors: ['VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND', 'FORBIDDEN', 'PERIOD_LOCKED', 'POSTING_FAILED'],
  input: z.object({
    id: z.string().trim().max(64).optional(), version: z.coerce.number().int().optional(), mode: z.enum(['draft', 'post']).default('post'),
    copiedFrom: z.string().uuid().optional(),
    branchCode: z.string().trim().max(32).default(''), warehouseCode: z.string().trim().max(64).default(''), docDate: z.string().trim().max(10).default(''),
    reasonCode: z.string().trim().max(32).default(''), priced: z.boolean().default(false), partnerCode: z.string().trim().max(64).optional(),
    receiverName: z.string().trim().max(255).optional(), employeeName: z.string().trim().max(255).optional(), description: z.string().trim().max(1000).optional(),
    lines: z.array(line).max(500).default([]),
  }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'POST', path: '/phieu' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'xuat-dieu-chinh.phieu', objectId: (_i, o) => String((o as { id?: string }).id ?? '') || undefined },
  // Chi nhánh của phiếu đang sửa (đọc ở bảng module) + chi nhánh sẽ ghi: người bị giới hạn chi nhánh không lập / chuyển phiếu sang chi nhánh khác.
  branchOf: async (ctx, i) => {
    const cur = i.id ? await ctx.data.module((tx) => branchOfPhieu(tx, i.id!)) : null;
    return [...new Set([cur, i.branchCode].filter((b): b is string => Boolean(b)))];
  },
  handler: async (ctx, i) => save(ctx, i),
});
