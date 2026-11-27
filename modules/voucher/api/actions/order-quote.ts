// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: module pos / phieu-ban hỏi trước khi nhận đơn có voucher (đóng góp)
// [2026-11-27 09:00 AM Võ Hoàng] NGHIEM-THU — NT-BH-050: voucher % (faceValue = tiền trừ được của đơn này, đã tính trần), mã lô không SĐT, mỗi khách tối đa N mã, cửa hàng (đóng góp)
/**
 * Action đọc `voucher.order.quote` — module pos (đơn máy bán) và phieu-ban (duyệt BH10) gọi chéo bằng ctx.actions.call, quyền của người bán
 * (`voucher:use`). Không ghi gì:
 * - `codes`: từng mã có dùng được cho đơn này không (của khách này — mã lô không gắn SĐT thì ai cũng dùng, chưa dùng ở đơn khác, còn hạn, đúng
 *   cửa hàng, khách chưa quá số mã tối đa của đợt, đủ đơn tối thiểu, giỏ có sản phẩm / nhãn áp dụng); được → `faceValue` = TIỀN TRỪ ĐƯỢC của
 *   đơn này (voucher tiền: mệnh giá; voucher %: % × tiền áp dụng, làm tròn xuống, tối đa trần), người phát, mã hàng trong giỏ được trừ.
 *   Bên bán giữ nguyên luật: trừ tối đa `faceValue`, tối đa phần còn phải trả — không phải biết voucher %.
 * - `issue: true` (máy bán): đợt tự phát "lần mua sau" mà giỏ đủ điều kiện → mã sẽ phát (định theo đơn × đợt, in trên bill).
 * Đánh dấu đã dùng / phát mã làm khi nhận sự kiện đơn / phiếu đã ghi sổ (subscriber). Bên gọi khoá theo mã
 * (pg_advisory_xact_lock(hashtext('voucher:'||mã))) và kiểm lần dùng chưa tới module này (bảng dùng của chính nó) trong giao dịch của đơn.
 * Không mở HTTP: chỉ module gọi chéo.
 */
import { defineAction, z } from '@bizcity/module-sdk';
import { autoCode, autoEligible, checkCode, expiryOf, normalizeCode, normalizePhone, valueLabel, voucherBase, voucherValue, type Problem } from '../domain/voucher.js';
import { autoCampaigns, campaignsByIds, cartOf, codesByCode, itemsToSkus, phonesOf, usedByCustomer } from '../store.js';

export default defineAction({
  id: 'voucher.order.quote', title: 'Kiểm voucher / voucher sẽ phát cho một đơn', tags: ['Voucher'],
  permission: 'voucher:use', effect: 'read', idempotency: 'none',
  errors: ['VALIDATION_ERROR'],
  input: z.object({
    customer: z.string().trim().max(64).optional(), phone: z.string().trim().max(20).optional(), branch: z.string().trim().min(1).max(32),
    refId: z.string().trim().min(1).max(64), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), orderTotal: z.number().nonnegative(),
    codes: z.array(z.string().trim().min(1).max(64)).max(10).default([]),
    items: z.array(z.object({ sku: z.string().max(64), qty: z.number(), amount: z.number() })).max(500).default([]),
    issue: z.boolean().default(false),
  }),
  output: z.object({ vouchers: z.array(z.record(z.unknown())), problems: z.array(z.record(z.unknown())), issue: z.array(z.record(z.unknown())) }),
  expose: { mcp: false, ai: 'deny' },
  handler: async (ctx, i) => ctx.data.module(async (tx) => {
    const codes = [...new Set(i.codes.map(normalizeCode))];
    const phones = await phonesOf(tx, i.customer, i.phone);
    const cart = await cartOf(tx, i.items);
    const rows = await codesByCode(tx, codes);
    const camps = await campaignsByIds(tx, [...rows.values()].map((r) => r.campaignId));
    const used = await usedByCustomer(tx, [...camps.values()].filter((c) => c.perCustomer).map((c) => c.id), phones, i.customer, i.refId);
    const inOrder = new Map<string, number>();
    const vouchers: Record<string, unknown>[] = [];
    const problems: Problem[] = [];
    for (const code of codes) {
      const row = rows.get(code) ?? null;
      const c = row ? camps.get(row.campaignId) ?? null : null;
      const customerUsed = c ? (used.get(c.id) ?? 0) + (inOrder.get(c.id) ?? 0) : 0;
      const r = checkCode(code, row, c, { phones, customerCode: i.customer ?? null, refId: i.refId, date: i.date, orderTotal: i.orderTotal, cart, branch: i.branch, customerUsed });
      if ('problem' in r) { problems.push(r.problem); continue; }
      inOrder.set(c!.id, (inOrder.get(c!.id) ?? 0) + 1);
      vouchers.push({
        code, campaignId: c!.id, campaignCode: c!.code, campaignName: c!.name, kind: c!.kind, issuer: c!.issuer, issuerPartnerCode: c!.issuerPartnerCode,
        paymentMethodCode: c!.paymentMethodCode, faceValue: voucherValue(c!, voucherBase(r.applicableSkus, i.orderTotal, cart)), applicableSkus: r.applicableSkus,
        expiresOn: row!.expiresOn, discountType: c!.discountType, discountPercent: c!.discountPercent, maxDiscount: c!.maxDiscount, valueLabel: valueLabel(c!),
      });
    }
    const issue: Record<string, unknown>[] = [];
    const phone = normalizePhone(i.phone) || [...phones][0];
    if (i.issue && phone) {
      for (const c of autoEligible(await autoCampaigns(tx), { branch: i.branch, date: i.date, cart })) {
        issue.push({
          code: autoCode(i.refId, c.id), campaignId: c.id, campaignCode: c.code, campaignName: c.name, kind: c.kind, issuer: c.issuer, faceValue: c.faceValue,
          discountType: c.discountType, discountPercent: c.discountPercent, maxDiscount: c.maxDiscount, valueLabel: valueLabel(c),
          minOrder: c.minOrder, expiresOn: expiryOf(c, i.date), phone, skus: await itemsToSkus(tx, c.itemIds), brandCodes: c.brandCodes,
        });
      }
    }
    return { vouchers, problems, issue };
  }),
});
