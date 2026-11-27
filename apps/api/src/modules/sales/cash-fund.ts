// @bizcity-layer D modules/ban-hang
// [2026-11-28 Võ Hoàng] NGHIEM-THU — NT-BH-054: sổ quỹ két của cửa hàng cho máy bán (thay sổ quỹ website) — đọc sổ cái TK 111 của chi nhánh (đóng góp)
/**
 * SỔ QUỸ KÉT CỬA HÀNG (chỉ đọc).
 *   GET /api/v1/cash-fund?branchCode=&from=&to=     ban-hang.cash-fund.get
 *
 * Máy bán (màn "Quản lý quỹ két") trước đọc sổ quỹ ghi ở website. Nay đọc sổ cái kế toán: tiền mặt (TK 111*) của chi nhánh cửa hàng —
 * tồn đầu kỳ (cộng dồn trước "từ ngày"), từng ngày: doanh thu tiền mặt (đơn bán), hoàn tiền khách (phiếu trả), chuyển / nộp tiền
 * (phiếu chuyển tiền), thu / chi khác (phiếu thu chi, chênh lệch két…), tồn cuối ngày; kèm danh sách chứng từ không phải đơn bán / phiếu
 * trả (lịch sử quỹ). Số ròng theo chứng từ (bút toán đảo cộng vào cùng chứng từ → chứng từ đã huỷ ra 0, không hiện). Không ghi gì.
 * Quyền: thu ngân máy bán (pos:sell) hoặc người xem chứng từ (documents:read); phạm vi chi nhánh do Core so qua branchOf.
 */
import { sql } from 'kysely';
import { z } from 'zod';
import { toNumber } from '../../db/client.js';
import { Errors } from '../../core/errors.js';
import { defineAction, type AnyActionDef } from '../../core/actions.js';

const tags = ['Bán hàng'];
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const SALE = 'sale';
const RETURN = 'sale_return';
const TRANSFER = 'cash_transfer';

const LABEL: Record<string, string> = {
  sale: 'Bán hàng', sale_return: 'Trả hàng', cash_transfer: 'Chuyển tiền', receipt: 'Phiếu thu', payment: 'Phiếu chi',
  customer_payment: 'Thu tiền khách', supplier_payment: 'Trả tiền NCC', manual_journal: 'Phiếu kế toán',
};

const bookRow = z.object({
  date: z.string(), opening: z.number(), cashSale: z.number(), cashRefund: z.number(), transferOut: z.number(), transferIn: z.number(),
  otherIn: z.number(), otherOut: z.number(), closing: z.number(),
});
const entryRow = z.object({
  id: z.string(), docType: z.string(), typeLabel: z.string(), docNo: z.string(), docDate: z.string(), thu: z.number(), chi: z.number(),
  description: z.string(), counterparty: z.string(),
});

const shift = (ymd: string, days: number) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export const cashFundActions: AnyActionDef[] = [
  defineAction({
    id: 'ban-hang.cash-fund.get', title: 'Sổ quỹ két cửa hàng (tiền mặt TK 111 của chi nhánh)', tags,
    permission: 'pos:sell', effect: 'read', idempotency: 'none',
    input: z.object({ branchCode: z.string().trim().min(1).max(32), from: day, to: day }),
    output: z.object({ branchCode: z.string(), from: z.string(), to: z.string(), opening: z.number(), balance: z.number(), book: z.array(bookRow), entries: z.array(entryRow) }),
    expose: { http: { method: 'GET', path: '/api/v1/cash-fund' }, mcp: false, ai: 'read' },
    branchOf: async (_ctx, i) => i.branchCode,
    handler: async (ctx, i) => {
      if (i.from > i.to) throw Errors.validation('Từ ngày phải trước hoặc bằng đến ngày');
      const tx = ctx.data.tx;
      const tenant = ctx.tenant.id;
      const br = (await sql<{ id: string }>`SELECT id FROM branches WHERE tenant_id = ${tenant} AND code = ${i.branchCode}`.execute(tx)).rows[0];
      if (!br) throw Errors.notFound(`chi nhánh ${i.branchCode}`);
      // Tồn đầu: cộng dồn tiền mặt của chi nhánh trước "từ ngày" (theo ngày ghi sổ).
      const open = (await sql<{ v: string | null }>`
        SELECT sum(l.debit - l.credit) AS v FROM bizcity_read.ledger_lines l
         WHERE l.tenant_id = ${tenant} AND l.branch_id = ${br.id} AND l.account_code LIKE '111%' AND l.posting_date < ${i.from}::date`.execute(tx)).rows[0];
      const opening = toNumber(open?.v ?? 0);
      // Phát sinh trong kỳ: số ròng theo chứng từ (bút toán đảo cùng chứng từ triệt tiêu).
      const rows = (await sql<{
        id: string; doc_type: string; doc_no: string; day: string; thu: string; chi: string; description: string | null; counterparty: string | null;
      }>`
        SELECT d.id, d.doc_type, d.doc_no, to_char(min(l.posting_date), 'YYYY-MM-DD') AS day,
               GREATEST(sum(l.debit - l.credit), 0) AS thu, GREATEST(sum(l.credit - l.debit), 0) AS chi,
               d.payload->>'description' AS description, COALESCE(p.name, d.payload->>'counterparty') AS counterparty
          FROM bizcity_read.ledger_lines l
          JOIN bizcity_read.ledger_entries e ON e.id = l.entry_id
          JOIN accounting_events d ON d.id = e.event_id
          LEFT JOIN partners p ON p.id = d.partner_id
         WHERE l.tenant_id = ${tenant} AND l.branch_id = ${br.id} AND l.account_code LIKE '111%'
           AND l.posting_date BETWEEN ${i.from}::date AND ${i.to}::date
         GROUP BY d.id, d.doc_type, d.doc_no, d.payload->>'description', p.name, d.payload->>'counterparty'
        HAVING sum(l.debit - l.credit) <> 0
         ORDER BY min(l.posting_date), d.doc_no`.execute(tx)).rows;
      const byDay = new Map<string, z.infer<typeof bookRow>>();
      for (let d = i.from; d <= i.to; d = shift(d, 1)) {
        byDay.set(d, { date: d, opening: 0, cashSale: 0, cashRefund: 0, transferOut: 0, transferIn: 0, otherIn: 0, otherOut: 0, closing: 0 });
        if (byDay.size > 400) break;
      }
      const entries: z.infer<typeof entryRow>[] = [];
      for (const r of rows) {
        const b = byDay.get(r.day);
        const thu = toNumber(r.thu);
        const chi = toNumber(r.chi);
        if (b) {
          if (r.doc_type === SALE) { b.cashSale += thu; b.cashRefund += chi; }
          else if (r.doc_type === RETURN) { b.cashRefund += chi; b.cashSale += thu; }
          else if (r.doc_type === TRANSFER) { b.transferOut += chi; b.transferIn += thu; }
          else { b.otherIn += thu; b.otherOut += chi; }
        }
        if (r.doc_type !== SALE && r.doc_type !== RETURN) {
          entries.push({
            id: r.id, docType: r.doc_type, typeLabel: LABEL[r.doc_type] ?? r.doc_type, docNo: r.doc_no, docDate: r.day, thu, chi,
            description: r.description ?? '', counterparty: r.counterparty ?? '',
          });
        }
      }
      let run = opening;
      const book = [...byDay.values()].map((b) => {
        const o = run;
        run = o + b.cashSale - b.cashRefund - b.transferOut + b.transferIn + b.otherIn - b.otherOut;
        return { ...b, opening: o, closing: run };
      });
      return { branchCode: i.branchCode, from: i.from, to: i.to, opening, balance: run, book, entries: entries.reverse() };
    },
  }),
];
