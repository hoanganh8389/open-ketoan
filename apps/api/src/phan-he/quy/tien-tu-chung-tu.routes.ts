// @bizcity-layer D modules/quy
// [2026-11-28 Võ Hoàng] NGHIEM-THU — NT-BH-052: tiền vào / ra quỹ, ngân hàng từ chứng từ không phải phiếu thu chi (bán, trả hàng, thu tiền khách…) — đọc từ sổ cái để hiện ở ACC51 / ACC54 (đóng góp)
/**
 * TIỀN TỪ CHỨNG TỪ KHÁC (chỉ đọc).
 *   GET /api/v1/cash-movements?kind=cash|bank&from=&to=&branchCodes=&search=     quy.cash-movement.list
 *
 * Đơn bán ở máy POS, phiếu bán BH10, phiếu trả BH11 / máy POS, thu tiền khách, chi trả NCC… ghi tiền thẳng trong bút toán của
 * chính chứng từ đó (dòng "Thu tiền" theo hình thức thanh toán: Nợ 111x / 112x — Có 131…), KHÔNG lập phiếu thu / báo có riêng.
 * Màn ACC51 / ACC54 trước chỉ liệt kê chứng từ loại phiếu thu / chi / báo có / báo nợ nên số tiền đó không hiện.
 * Action này đọc sổ cái (ledger_lines của bút toán có event_id) theo tài khoản tiền (111% = tiền mặt, 112% = tiền gửi) của các
 * chứng từ KHÁC bốn loại phiếu tiền, gom theo chứng từ, lấy số RÒNG (Nợ − Có): dương = Thu, âm = Chi. Bút toán đảo (huỷ / sửa) cộng vào cùng
 * chứng từ nên chứng từ đã huỷ ra 0 và bị bỏ; sửa phiếu chỉ còn số của bản đang trong sổ. Không ghi gì, không đổi cách định khoản — chỉ để kế toán thấy đủ tiền vào / ra (không đếm trùng
 * vì bốn loại phiếu tiền vẫn liệt kê riêng ở danh sách chính).
 */
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import { toNumber } from '../../db/client.js';
import { defineAction, mountActions, type AnyActionDef } from '../../core/actions.js';

const tags = ['Quỹ'];
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** Bốn loại phiếu tiền đã có ở danh sách chính ACC51 / ACC54 — không lấy lại. */
const CASH_DOC_TYPES = ['receipt', 'payment', 'bank_receipt', 'bank_payment'];

const rowSchema = z.object({
  id: z.string(), docType: z.string(), docNo: z.string(), docDate: z.string(), branchCode: z.string(), branchName: z.string(),
  partnerCode: z.string().nullable(), partnerName: z.string().nullable(), description: z.string().nullable(), sourceSystem: z.string().nullable(),
  accounts: z.string(), thu: z.number(), chi: z.number(),
});

export const cashMovementActions: AnyActionDef[] = [
  defineAction({
    id: 'quy.cash-movement.list', title: 'Tiền vào / ra quỹ, ngân hàng từ chứng từ khác (bán, trả hàng, thu tiền khách…)', tags,
    permission: 'documents:read', effect: 'read', idempotency: 'none',
    input: z.object({
      kind: z.enum(['cash', 'bank']).describe('cash = tài khoản 111*, bank = tài khoản 112*'),
      from: day, to: day,
      branchCodes: z.string().optional().describe('Mã chi nhánh, cách nhau dấu phẩy; trống = mọi chi nhánh; "-" = không chi nhánh nào'),
      search: z.string().optional(),
    }),
    output: z.array(rowSchema),
    expose: { http: { method: 'GET', path: '/api/v1/cash-movements' }, mcp: true, ai: 'read' },
    handler: async (ctx, i) => {
      const prefix = i.kind === 'cash' ? '111%' : '112%';
      const codes = i.branchCodes ? i.branchCodes.split(',').map((x) => x.trim()).filter((x) => x && x !== '-') : null;
      if (codes && !codes.length) return [];
      const s = i.search?.trim();
      const rows = await sql<{
        id: string; doc_type: string; doc_no: string; doc_date: string; branch_code: string; branch_name: string; partner_code: string | null;
        partner_name: string | null; description: string | null; source_system: string | null; accounts: string; thu: string; chi: string;
      }>`
        SELECT d.id, d.doc_type, d.doc_no, to_char(d.doc_date, 'YYYY-MM-DD') AS doc_date, b.code AS branch_code, b.name AS branch_name,
               p.code AS partner_code, p.name AS partner_name, d.payload->>'description' AS description, d.source_system,
               string_agg(DISTINCT l.account_code, ', ' ORDER BY l.account_code) AS accounts,
               GREATEST(sum(l.debit - l.credit), 0) AS thu, GREATEST(sum(l.credit - l.debit), 0) AS chi
          FROM bizcity_read.ledger_lines l
          JOIN bizcity_read.ledger_entries e ON e.id = l.entry_id
          JOIN accounting_events d ON d.id = e.event_id
          JOIN branches b ON b.id = d.branch_id
          LEFT JOIN partners p ON p.id = d.partner_id
         WHERE l.tenant_id = ${ctx.tenant.id}
           AND l.account_code LIKE ${prefix}
           AND d.doc_type <> ALL(${CASH_DOC_TYPES}::text[])
           AND d.doc_date BETWEEN ${i.from}::date AND ${i.to}::date
           ${codes ? sql`AND b.code = ANY(${codes}::text[])` : sql``}
           ${s ? sql`AND (d.doc_no ILIKE ${'%' + s + '%'} OR p.name ILIKE ${'%' + s + '%'} OR p.code = ${s})` : sql``}
         GROUP BY d.id, d.doc_type, d.doc_no, d.doc_date, b.code, b.name, p.code, p.name, d.payload->>'description', d.source_system
        HAVING sum(l.debit - l.credit) <> 0
         ORDER BY d.doc_date DESC, d.doc_no DESC
         LIMIT 5000`.execute(ctx.data.tx);
      return rows.rows.map((r) => ({
        id: r.id, docType: r.doc_type, docNo: r.doc_no, docDate: r.doc_date, branchCode: r.branch_code, branchName: r.branch_name,
        partnerCode: r.partner_code, partnerName: r.partner_name, description: r.description, sourceSystem: r.source_system,
        accounts: r.accounts, thu: toNumber(r.thu), chi: toNumber(r.chi),
      }));
    },
  }),
];

export async function cashMovementRoutes(app: FastifyInstance): Promise<void> {
  mountActions(app, cashMovementActions);
}
