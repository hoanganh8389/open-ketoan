/**
 * Đọc / ghi CSDL của module de-nghi-dieu-chuyen: bảng mod_de_nghi_dieu_chuyen.phieu, bộ đếm số, danh mục chuẩn qua bizcity_read.*.
 * Chạy trong ctx.data.module (RLS lọc theo đơn vị). Không chạm bảng của Core.
 */
// [2026-11-28 10:00 AM Võ Hoàng] NGHIEM-THU — NT-BH-056: kho dữ liệu đề nghị điều chuyển (đóng góp)
import { Errors, sql, type ActionContext } from '@bizcity/module-sdk';
import { STATUS_LABEL, formatNo, periodOf, type Line, type Status } from './domain/rules.js';

export type Tx = Parameters<Parameters<ActionContext['data']['module']>[0]>[0];

export type PhieuRow = {
  id: string; doc_no: string; doc_date: string; branch_code: string; warehouse_code: string; to_branch_code: string; to_branch_name: string;
  partner_code: string | null; partner_name: string | null; reason_code: string | null; staff_name: string; note: string; lines: Line[];
  total_items: number; total_qty: string; status: Status; row_version: number; source: 'ketoan' | 'pos';
  intent: { by: string; byName?: string; at: string } | null; transfer: { id: string; docNo: string; status?: string } | null;
  reject_reason: string | null; cancel_reason: string | null; decided_by: string | null; decided_by_name: string | null; decided_at: Date | null;
  created_by: string; created_by_name: string; created_at: Date; updated_by: string; updated_at: Date;
};

const COLS = sql`id::text, doc_no, doc_date::text, branch_code, warehouse_code, to_branch_code, to_branch_name, partner_code, partner_name, reason_code,
  staff_name, note, lines, total_items, total_qty, status, row_version, source, intent, transfer, reject_reason, cancel_reason, decided_by, decided_by_name,
  decided_at, created_by, created_by_name, created_at, updated_by, updated_at`;

const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);

/** Khuôn đề nghị trả cho màn (không có giá vốn — chỉ giá bán tham khảo máy bán gửi). */
export function toPhieu(r: PhieuRow) {
  return {
    id: r.id, docNo: r.doc_no, docDate: r.doc_date, branchCode: r.branch_code, warehouseCode: r.warehouse_code, toBranchCode: r.to_branch_code,
    toBranchName: r.to_branch_name, partner: r.partner_code ? { code: r.partner_code, name: r.partner_name ?? '' } : null, reasonCode: r.reason_code,
    staffName: r.staff_name, note: r.note, lines: r.lines, totalItems: r.total_items, totalQty: Number(r.total_qty), status: r.status,
    statusLabel: STATUS_LABEL[r.status], version: r.row_version, source: r.source, transfer: r.transfer, rejectReason: r.reject_reason,
    cancelReason: r.cancel_reason, decidedBy: r.decided_by, decidedByName: r.decided_by_name, decidedAt: iso(r.decided_at), createdBy: r.created_by,
    createdByName: r.created_by_name, createdAt: iso(r.created_at)!, updatedAt: iso(r.updated_at)!,
  };
}
export type Phieu = ReturnType<typeof toPhieu>;

const idOk = (id: string) => /^\d{1,18}$/.test(id);

export async function getPhieu(tx: Tx, id: string, lock = false): Promise<PhieuRow> {
  if (!idOk(id)) throw Errors.notFound(`đề nghị điều chuyển ${id}`);
  const r = (await sql<PhieuRow>`SELECT ${COLS} FROM mod_de_nghi_dieu_chuyen.phieu WHERE id = ${id}::bigint ${lock ? sql`FOR UPDATE` : sql``}`.execute(tx)).rows[0];
  if (!r) throw Errors.notFound(`đề nghị điều chuyển ${id}`);
  return r;
}

/** Chi nhánh của đề nghị (branchOf — Core so phạm vi chi nhánh người gọi trước handler). Không thấy → null (handler báo không có). */
export async function branchOfPhieu(tx: Tx, id: string): Promise<string | null> {
  if (!idOk(id)) return null;
  return (await sql<{ b: string }>`SELECT branch_code AS b FROM mod_de_nghi_dieu_chuyen.phieu WHERE id = ${id}::bigint`.execute(tx)).rows[0]?.b ?? null;
}

/**
 * Chi nhánh của lệnh theo mã đề nghị (branchOf): chi nhánh lập của đề nghị. Thân lệnh mang `branchCode` (để lớp phân quyền cộng quyền
 * tại đúng chi nhánh đó) thì phải trùng chi nhánh của đề nghị — không mượn quyền của chi nhánh khác.
 */
export async function branchOfClaim(tx: Tx, id: string, claimed: string | undefined): Promise<string | null> {
  const b = await branchOfPhieu(tx, id);
  if (b && claimed && claimed !== b) throw Errors.validation(`Đề nghị thuộc chi nhánh ${b}, không phải ${claimed}`, { field: 'branchCode' });
  return b;
}

export type ListFilter = { from?: string; to?: string; branches: string[] | null; status?: Status; search?: string; side?: 'from' | 'to' | 'both' };
/** Danh sách: phạm vi chi nhánh so cả chi nhánh đề nghị lẫn chi nhánh nhận (như máy bán cũ: request / transfer / receive = shop). */
export async function listPhieu(tx: Tx, f: ListFilter): Promise<PhieuRow[]> {
  const q = f.search?.trim();
  const side = f.side ?? 'both';
  const inScope = f.branches
    ? (f.branches.length
      ? (side === 'from' ? sql`AND branch_code IN (${sql.join(f.branches)})`
        : side === 'to' ? sql`AND to_branch_code IN (${sql.join(f.branches)})`
          : sql`AND (branch_code IN (${sql.join(f.branches)}) OR to_branch_code IN (${sql.join(f.branches)}))`)
      : sql`AND false`)
    : sql``;
  return (await sql<PhieuRow>`SELECT ${COLS} FROM mod_de_nghi_dieu_chuyen.phieu
    WHERE true
      ${f.from ? sql`AND doc_date >= ${f.from}::date` : sql``} ${f.to ? sql`AND doc_date <= ${f.to}::date` : sql``}
      ${inScope}
      ${f.status ? sql`AND status = ${f.status}` : sql``}
      ${q ? sql`AND (doc_no ILIKE ${`%${q}%`} OR note ILIKE ${`%${q}%`} OR coalesce(partner_name, '') ILIKE ${`%${q}%`} OR to_branch_name ILIKE ${`%${q}%`})` : sql``}
    ORDER BY doc_date DESC, id DESC LIMIT 2000`.execute(tx)).rows;
}

/** Cấp số kế tiếp của chi nhánh × tháng (khoá dòng bộ đếm trong giao dịch). */
export async function takeNo(tx: Tx, tenantId: string, branch: string, docDate: string): Promise<string> {
  const period = periodOf(docDate);
  const n = (await sql<{ last_no: number }>`
    INSERT INTO mod_de_nghi_dieu_chuyen.code_counters (tenant_id, branch_code, period, last_no) VALUES (${tenantId}, ${branch}, ${period}, 1)
    ON CONFLICT (tenant_id, branch_code, period) DO UPDATE SET last_no = mod_de_nghi_dieu_chuyen.code_counters.last_no + 1, updated_at = now()
    RETURNING last_no`.execute(tx)).rows[0]!.last_no;
  return formatNo(branch, period, n);
}

export type Header = {
  docDate: string; branchCode: string; warehouseCode: string; toBranchCode: string; toBranchName: string; partnerCode: string | null; partnerName: string | null;
  reasonCode: string | null; staffName: string; note: string; lines: Line[]; totalItems: number; totalQty: number;
};

export async function insertPhieu(tx: Tx, tenantId: string, docNo: string, h: Header, source: 'ketoan' | 'pos', actor: string, actorName: string): Promise<string> {
  return (await sql<{ id: string }>`INSERT INTO mod_de_nghi_dieu_chuyen.phieu
    (tenant_id, doc_no, doc_date, branch_code, warehouse_code, to_branch_code, to_branch_name, partner_code, partner_name, reason_code, staff_name, note,
     lines, total_items, total_qty, status, source, created_by, created_by_name, updated_by)
    VALUES (${tenantId}, ${docNo}, ${h.docDate}::date, ${h.branchCode}, ${h.warehouseCode}, ${h.toBranchCode}, ${h.toBranchName}, ${h.partnerCode}, ${h.partnerName},
     ${h.reasonCode}, ${h.staffName}, ${h.note}, ${JSON.stringify(h.lines)}::jsonb, ${h.totalItems}, ${h.totalQty}, 'pending', ${source}, ${actor}, ${actorName}, ${actor})
    RETURNING id::text`.execute(tx)).rows[0]!.id;
}

export async function updatePhieu(tx: Tx, id: string, h: Header, actor: string): Promise<void> {
  await sql`UPDATE mod_de_nghi_dieu_chuyen.phieu SET warehouse_code = ${h.warehouseCode}, to_branch_code = ${h.toBranchCode}, to_branch_name = ${h.toBranchName},
    partner_code = ${h.partnerCode}, partner_name = ${h.partnerName}, reason_code = ${h.reasonCode}, staff_name = ${h.staffName}, note = ${h.note},
    lines = ${JSON.stringify(h.lines)}::jsonb, total_items = ${h.totalItems}, total_qty = ${h.totalQty}, row_version = row_version + 1,
    updated_by = ${actor}, updated_at = now() WHERE id = ${id}::bigint`.execute(tx);
}

export type Decision = { status: Status; reason?: string | null; actor: string; actorName: string };
export async function decide(tx: Tx, id: string, d: Decision): Promise<void> {
  await sql`UPDATE mod_de_nghi_dieu_chuyen.phieu SET status = ${d.status}, intent = NULL,
    reject_reason = ${d.status === 'rejected' ? (d.reason ?? '') : sql`reject_reason`}, cancel_reason = ${d.status === 'cancelled' ? (d.reason ?? '') : sql`cancel_reason`},
    decided_by = ${d.actor}, decided_by_name = ${d.actorName}, decided_at = now(), row_version = row_version + 1, updated_by = ${d.actor}, updated_at = now()
    WHERE id = ${id}::bigint`.execute(tx);
}

export async function setIntent(tx: Tx, id: string, intent: PhieuRow['intent'], status: Status, actor: string): Promise<void> {
  await sql`UPDATE mod_de_nghi_dieu_chuyen.phieu SET intent = ${intent ? JSON.stringify(intent) : null}::jsonb, status = ${status},
    updated_by = ${actor}, updated_at = now() WHERE id = ${id}::bigint`.execute(tx);
}

export async function setTransfer(tx: Tx, id: string, transfer: { id: string; docNo: string; status?: string }, actor: string, actorName: string): Promise<void> {
  await sql`UPDATE mod_de_nghi_dieu_chuyen.phieu SET transfer = ${JSON.stringify(transfer)}::jsonb, status = 'converted', intent = NULL,
    decided_by = ${actor}, decided_by_name = ${actorName}, decided_at = now(), row_version = row_version + 1, updated_by = ${actor}, updated_at = now()
    WHERE id = ${id}::bigint`.execute(tx);
}

// ------------------------------------------------------------------ danh mục (bizcity_read)

export type Branch = { code: string; name: string; parentCode: string | null; active: boolean };
export async function branches(tx: Tx): Promise<Branch[]> {
  return (await sql<{ code: string; name: string; parent_code: string | null; is_active: boolean | null }>`
    SELECT code, name, parent_code, is_active FROM bizcity_read.branches ORDER BY code`.execute(tx)).rows
    .map((b) => ({ code: b.code, name: b.name, parentCode: b.parent_code, active: b.is_active !== false }));
}

/** Kho mặc định đang dùng của chi nhánh (kho bán); không có cờ mặc định mà chỉ một kho → kho đó; không có → ''. */
export async function defaultWarehouse(tx: Tx, branch: string): Promise<string> {
  const ws = (await sql<{ code: string; is_default: boolean | null }>`
    SELECT code, is_default FROM bizcity_read.warehouses WHERE branch_code = ${branch} AND is_active IS DISTINCT FROM false ORDER BY is_default DESC NULLS LAST, code`.execute(tx)).rows;
  return (ws.find((w) => w.is_default) ?? (ws.length === 1 ? ws[0] : undefined))?.code ?? '';
}

export async function products(tx: Tx, skus: readonly string[]): Promise<Map<string, { name: string; unit: string; active: boolean }>> {
  const uniq = [...new Set(skus.map((s) => s.trim()).filter(Boolean))];
  if (!uniq.length) return new Map();
  const rows = (await sql<{ sku: string; name: string; unit: string; is_active: boolean | null }>`
    SELECT sku, name, unit, is_active FROM bizcity_read.products WHERE sku IN (${sql.join(uniq)})`.execute(tx)).rows;
  return new Map(rows.map((r) => [r.sku, { name: r.name, unit: r.unit, active: r.is_active !== false }]));
}

/**
 * Tồn theo mã ở kho xuất của chi nhánh (ĐVT nhỏ nhất). Dòng thẻ kho cũ không ghi kho tính vào kho mặc định (như báo cáo kho).
 * lock: khoá theo (chi nhánh, kho, mã) tới hết giao dịch — hai đề nghị cùng lúc không cùng lọt.
 */
export async function stockOf(tx: Tx, branch: string, warehouse: string, isDefault: boolean, skus: readonly string[], lock = false): Promise<Map<string, number>> {
  const uniq = [...new Set(skus)].sort();
  if (!uniq.length) return new Map();
  if (lock) for (const s of uniq) await sql`SELECT pg_advisory_xact_lock(hashtext(${`dndc:${branch}:${warehouse}:${s}`}))`.execute(tx);
  const rows = (await sql<{ sku: string; q: string }>`
    SELECT sku, sum(qty)::text AS q FROM bizcity_read.stock_on_hand
     WHERE branch_code = ${branch} AND (warehouse_code = ${warehouse} ${isDefault ? sql`OR warehouse_code IS NULL OR warehouse_code = ''` : sql``})
       AND sku IN (${sql.join(uniq)}) GROUP BY sku`.execute(tx)).rows;
  return new Map(rows.map((r) => [r.sku, Math.round(Number(r.q) * 10_000) / 10_000]));
}

export async function partnerByCode(tx: Tx, code: string): Promise<{ code: string; name: string } | null> {
  return (await sql<{ code: string; name: string }>`SELECT code, name FROM bizcity_read.partners WHERE code = ${code} AND is_active IS NOT FALSE`.execute(tx)).rows[0] ?? null;
}
