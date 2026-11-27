// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: voucher theo đơn máy bán (đóng góp)
// [2026-11-27 09:00 AM Võ Hoàng] NGHIEM-THU — NT-BH-050: ghi SĐT / mã khách đã dùng (giới hạn mỗi khách), số lượng đủ điều kiện lúc tự phát (thu hồi khi trả một phần) (đóng góp)
/**
 * Nghe `pos.order.recorded` / `pos.order.cancelled` của module pos:
 * - Đơn HOÀN TẤT: mã khách dùng (order.voucherUses — module pos đã kiểm qua voucher.order.quote + khoá theo mã) → đánh dấu đã dùng ở đơn đó
 *   (số tiền thực trừ; phần dư mất; SĐT / mã khách của đơn — đếm "mỗi khách tối đa"). Mã đã dùng ở nơi khác → nhật ký "dùng trùng", giữ lần đầu.
 *   Mã tự phát "lần mua sau" (order.issuedVouchers — đã in trên bill) → thêm mã gắn SĐT khách, kèm số lượng hàng đủ điều kiện của đơn.
 * - Huỷ đơn chờ thanh toán: mã đã dùng về "còn"; mã tự phát của đơn (nếu có) thu hồi.
 * Mỗi việc một lần (mã đã dùng ở chính đơn / mã tự phát đã có → bỏ qua): phiên bản sau của đơn, giao lại sự kiện không làm thêm.
 */
import { defineSubscriber } from '@bizcity/module-sdk';
import { qualifyingQty } from '../domain/voucher.js';
import { activeIssuedBy, campaignsByIds, cartOf, insertAuto, markUsed, releaseUsed, revokeCode, type Tx } from '../store.js';

type Use = { code: string; amount: number };
type Issued = { code: string; campaignId: string; phone: string; expiresOn: string | null };
type Line = { sku?: string; unitQty?: number; unitRatio?: number; isGift?: boolean; amount?: number };
type Data = {
  orderId: string; code: string; branchCode: string;
  order?: {
    status?: string; businessDate?: string; customer?: { id?: string; phone?: string }; voucherUses?: Use[]; issuedVouchers?: Issued[];
    lines?: Line[]; zBill?: { lines?: Line[] };
  };
};

export default defineSubscriber({
  id: 'voucher.pos-order', module: 'voucher', on: ['pos.order.recorded', 'pos.order.cancelled'],
  handle: async (ctx, evt) => {
    const d = evt.data as Data;
    await ctx.module(async (raw) => {
      const tx = raw as unknown as Tx;
      if (evt.type === 'pos.order.cancelled') {
        await releaseUsed(tx, ctx.tenantId, 'pos', d.orderId, `Huỷ đơn ${d.code} chờ thanh toán`);
        for (const code of await activeIssuedBy(tx, d.orderId)) await revokeCode(tx, ctx.tenantId, code, `Huỷ đơn gốc ${d.code}`, 'system', { source: 'pos', refId: d.orderId, refCode: d.code, branch: d.branchCode });
        return;
      }
      const o = d.order;
      if (o?.status !== 'completed') return;
      const date = o.businessDate ?? new Date().toISOString().slice(0, 10);
      for (const u of o.voucherUses ?? []) {
        await markUsed(tx, ctx.tenantId, {
          code: u.code, source: 'pos', refId: d.orderId, refCode: d.code, branch: d.branchCode, date, amount: Number(u.amount),
          phone: o.customer?.phone ?? null, customer: o.customer?.id || null,
        });
      }
      const issued = o.issuedVouchers ?? [];
      if (!issued.length) return;
      // Số lượng đủ điều kiện của đơn (hàng bán, không tính quà) theo điều kiện tự phát của từng đợt — để trả một phần biết còn đủ ngưỡng.
      const lines = [...(o.lines ?? []), ...(o.zBill?.lines ?? [])].filter((l) => l.sku && !l.isGift);
      const cart = await cartOf(tx, lines.map((l) => ({ sku: l.sku!, qty: Number(l.unitQty ?? 0) * Number(l.unitRatio ?? 1), amount: Number(l.amount ?? 0) })));
      const camps = await campaignsByIds(tx, issued.map((v) => v.campaignId));
      for (const v of issued) {
        const rule = camps.get(v.campaignId)?.autoRule;
        await insertAuto(tx, ctx.tenantId, {
          code: v.code, campaignId: v.campaignId, phone: v.phone, partnerCode: o.customer?.id || null, expiresOn: v.expiresOn, orderId: d.orderId, orderCode: d.code, branch: d.branchCode,
          basisQty: rule && lines.length ? qualifyingQty(rule, cart) : null,
        });
      }
    });
  },
});
