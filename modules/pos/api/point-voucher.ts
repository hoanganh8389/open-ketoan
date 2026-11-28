/**
 * Nộp / huỷ phiếu kế toán phân loại voucher đổi điểm sang chiết khấu thương mại (NT-BH-060). Dựng phiếu ở domain/point-voucher.ts.
 * Như phiếu chênh lệch két (cash-diff.ts): nộp trong SAVEPOINT của giao dịch action; Core từ chối (lý do chưa khai / thiếu tài khoản
 * → POSTING_FAILED; khuôn sai → VALIDATION_ERROR) thì bỏ đúng phần phiếu, KHÔNG chặn đơn bán / phiếu trả — trạng thái ghi vào ảnh chụp.
 */
// [2026-11-28 05:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-060: nộp phiếu chiết khấu voucher đổi điểm, lỗi nhận không chặn bán (đóng góp)
import { AppError, sql, type ActionContext } from '@bizcity/module-sdk';

export type PointVoucherJournalState = { docKey: string; docNo: string; reasonCode: string; amount: number; status: string; error?: string };
type JournalDoc = { docType: string; docKey: string; docNo: string; lines: { reasonCode: string }[]; totals: { total: number } };

/** Trạng thái đã có phiếu trong sổ / trạm chứng từ (huỷ đơn thì phải huỷ theo). */
const LIVE = new Set(['posted', 'pending', 'unchanged', 'error']);

export async function submitPointVoucherJournal(ctx: ActionContext, doc: JournalDoc & Record<string, unknown>): Promise<PointVoucherJournalState> {
  const head = { docKey: doc.docKey, docNo: doc.docNo, reasonCode: doc.lines[0]!.reasonCode, amount: doc.totals.total };
  await ctx.data.module((tx) => sql`SAVEPOINT pos_point_voucher`.execute(tx));
  try {
    const r = await ctx.ledger.submit(doc);
    await ctx.data.module((tx) => sql`RELEASE SAVEPOINT pos_point_voucher`.execute(tx));
    return { ...head, status: r.status, ...('error' in r && r.error ? { error: r.error.message } : {}) };
  } catch (err) {
    if (!(err instanceof AppError) || (err.code !== 'POSTING_FAILED' && err.code !== 'VALIDATION_ERROR')) throw err;
    await ctx.data.module((tx) => sql`ROLLBACK TO SAVEPOINT pos_point_voucher`.execute(tx));
    return { ...head, status: 'not_created', error: err.message };
  }
}

/** Huỷ phiếu chiết khấu voucher khi huỷ đơn (đảo bút toán). Chưa có phiếu trong sổ thì thôi. */
export async function cancelPointVoucherJournal(ctx: ActionContext, state: PointVoucherJournalState | undefined | null, reason: string): Promise<void> {
  if (!state || !LIVE.has(state.status)) return;
  await ctx.ledger.cancel(state.docKey, reason);
}
