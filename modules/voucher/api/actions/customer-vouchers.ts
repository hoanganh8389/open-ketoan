/**
 * GET /api/v1/m/voucher/customer?phone&customer&skus=A,B&total&refId&branch&code — voucher còn hạn của khách cho máy bán chọn ở bước thanh toán
 * (và kiểm một mã khách đọc / mã lô không gắn SĐT: `code`). Mỗi mã kèm giá trị (mệnh giá, hoặc % + trần — `discountType`, `discountPercent`,
 * `maxDiscount`, `valueLabel`), người phát (TGS = chiết khấu, hãng = dòng thanh toán theo hình thức), mã hàng trong giỏ được trừ, và lý do không
 * dùng được với giỏ này (đơn tối thiểu, cửa hàng, khách đã dùng đủ số mã của đợt, giỏ không có sản phẩm / nhãn áp dụng…).
 * `faceValue`: voucher tiền = mệnh giá; voucher % = tiền trừ trên `total` (máy tự tính lại theo dòng áp dụng). Máy chủ kiểm lại khi nhận đơn.
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: action voucher (đóng góp)
// [2026-11-27 09:00 AM Võ Hoàng] NGHIEM-THU — NT-BH-050: voucher %, mã lô không SĐT, mỗi khách tối đa, cửa hàng (đóng góp)
import { defineAction, z } from '@bizcity/module-sdk';
import { checkCode, normalizeCode, normalizePhone, valueLabel, voucherBase, voucherValue } from '../domain/voucher.js';
import { campaignsByIds, cartOf, codesByCode, listCodes, phonesOf, usedByCustomer } from '../store.js';
import { todayVn } from '../today.js';

export default defineAction({
  id: 'voucher.customer.available', title: 'Voucher còn hạn của khách (máy bán)', tags: ['Voucher'],
  permission: 'voucher:use', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR'],
  input: z.object({
    phone: z.string().trim().max(20).optional(), customer: z.string().trim().max(64).optional(), code: z.string().trim().max(64).optional(),
    skus: z.string().trim().max(4000).default(''), total: z.coerce.number().nonnegative().default(0), refId: z.string().trim().max(64).default(''),
    branch: z.string().trim().max(32).optional(),
  }),
  output: z.array(z.record(z.unknown())),
  expose: { http: { method: 'GET', path: '/customer' }, mcp: false, ai: 'read' },
  handler: async (ctx, i) => ctx.data.module(async (tx) => {
    const today = todayVn();
    const phones = await phonesOf(tx, i.customer, i.phone);
    const cart = await cartOf(tx, i.skus.split(',').map((s) => s.trim()).filter(Boolean).map((sku) => ({ sku, qty: 1, amount: 1 })));
    const rows = i.code
      ? [...(await codesByCode(tx, [normalizeCode(i.code)])).values()]
      : (await Promise.all([...phones].map((p) => listCodes(tx, { phone: p, status: 'active', today, limit: 200 })))).flat().filter((r) => r.status === 'active');
    const camps = await campaignsByIds(tx, rows.map((r) => r.campaignId));
    const used = await usedByCustomer(tx, [...camps.values()].filter((c) => c.perCustomer).map((c) => c.id), phones, i.customer, i.refId || '-');
    const phone = normalizePhone(i.phone);
    return rows.map((row) => {
      const c = camps.get(row.campaignId)!;
      const r = checkCode(row.code, row, c, {
        phones, customerCode: i.customer ?? null, refId: i.refId || '-', date: today, orderTotal: i.total, cart, ...(i.branch ? { branch: i.branch } : {}), customerUsed: used.get(c.id) ?? 0,
      });
      return {
        code: row.code, campaignId: c.id, campaignCode: c.code, campaignName: c.name, kind: c.kind, issuer: c.issuer, paymentMethodCode: c.paymentMethodCode,
        faceValue: c.discountType === 'percent' ? voucherValue(c, voucherBase(null, i.total, cart)) : c.faceValue,
        discountType: c.discountType, discountPercent: c.discountPercent, maxDiscount: c.maxDiscount, valueLabel: valueLabel(c), perCustomer: c.perCustomer,
        minOrder: c.minOrder, expiresOn: row.expiresOn, phone: row.phone !== null && row.phone === phone ? row.phone : undefined, bearer: row.phone === null,
        ...('problem' in r ? { usable: false, reason: r.problem.reason, message: r.problem.message } : { usable: true, applicableSkus: r.applicableSkus }),
      };
    });
  }),
});
