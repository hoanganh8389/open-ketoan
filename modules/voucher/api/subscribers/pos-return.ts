// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: trả hàng đơn gốc → thu hồi voucher lần mua sau chưa dùng (đóng góp)
// [2026-11-27 09:00 AM Võ Hoàng] NGHIEM-THU — NT-BH-050 V5: trả một phần → cộng hàng đủ điều kiện đã trả, dưới ngưỡng thì thu hồi (đóng góp)
/**
 * Nghe `pos.return.recorded`:
 * - đơn gốc trả hết (`orderFullyReturned`) → mã tự phát "lần mua sau" của đơn đó chưa dùng bị thu hồi (Q6, như trước);
 * - trả MỘT PHẦN (V5): cộng số lượng hàng đủ điều kiện tự phát có trong phiếu trả vào từng mã tự phát chưa dùng của đơn; số còn lại (mua lúc phát
 *   − đã trả) dưới số lượng tối thiểu của đợt thì thu hồi. Mã cũ chưa lưu số lượng lúc phát: giữ (chỉ trả hết mới thu hồi).
 * Mã đã dùng thì giữ. Mỗi phiếu trả tính một lần (nhật ký 'return' theo phiếu).
 */
import { defineSubscriber } from '@bizcity/module-sdk';
import { qualifyingQty } from '../domain/voucher.js';
import { activeIssuedBy, applyPartialReturn, cartOf, revokeCode, type Tx } from '../store.js';

type Line = { sku?: string; qty?: number; unitRatio?: number; isGift?: boolean };
type Data = { returnId: string; code: string; orderId: string; orderCode: string; branchCode: string; orderFullyReturned?: boolean; return?: { lines?: Line[] } };

export default defineSubscriber({
  id: 'voucher.pos-return', module: 'voucher', on: ['pos.return.recorded'],
  handle: async (ctx, evt) => {
    const d = evt.data as Data;
    await ctx.module(async (raw) => {
      const tx = raw as unknown as Tx;
      if (d.orderFullyReturned) {
        for (const code of await activeIssuedBy(tx, d.orderId)) {
          await revokeCode(tx, ctx.tenantId, code, `Trả hàng đơn gốc ${d.orderCode} (phiếu ${d.code})`, 'system', { source: 'pos', refId: d.returnId, refCode: d.code, branch: d.branchCode });
        }
        return;
      }
      const lines = (d.return?.lines ?? []).filter((l) => l.sku && !l.isGift && Number(l.qty) > 0);
      if (!lines.length) return;
      const cart = await cartOf(tx, lines.map((l) => ({ sku: l.sku!, qty: Number(l.qty) * Number(l.unitRatio ?? 1), amount: 0 })));
      await applyPartialReturn(tx, ctx.tenantId, { orderId: d.orderId, orderCode: d.orderCode, returnId: d.returnId, returnCode: d.code, branch: d.branchCode },
        (c) => (c.autoRule ? qualifyingQty(c.autoRule, cart) : 0));
    });
  },
});
