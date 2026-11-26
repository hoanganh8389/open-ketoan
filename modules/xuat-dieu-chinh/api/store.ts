/**
 * Đọc / ghi CSDL của module xuat-dieu-chinh (một tệp): bảng mod_xuat_dieu_chinh.phieu, bộ đếm số, và danh mục chuẩn qua bizcity_read.*.
 * Chạy trong ctx.data.module (RLS lọc theo đơn vị). Không chạm bảng của Core.
 */
// [2026-11-26 03:10 PM Võ Hoàng] NGHIEM-THU — NT-BH-044: kho dữ liệu phiếu xuất điều chỉnh (đóng góp)
import { Errors, sql, type ActionContext } from '@bizcity/module-sdk';
import { formatNo, periodOf, type CatalogItem, type Line } from './domain/phieu.js';

export type Tx = Parameters<Parameters<ActionContext['data']['module']>[0]>[0];
export type Status = 'draft' | 'posted' | 'cancelled' | 'deleted';

export type PhieuRow = {
  doc_id: string; branch_code: string; warehouse_code: string; doc_no: string; doc_date: string; reason_code: string; purpose_code: string | null;
  priced: boolean; partner_code: string | null; partner_name: string | null; receiver_name: string; employee_name: string; description: string;
  lines: Line[]; total: string; status: Status; row_version: number; ledger_status: string | null; copied_from: string | null;
  below_cost: { sku: string; unitPrice: number; unitCost: number }[] | null; cancel_reason: string | null; cancelled_by: string | null; cancelled_at: Date | null;
  posted_by: string | null; posted_at: Date | null; created_by: string; created_by_name: string; created_at: Date; updated_by: string; updated_at: Date;
};

const COLS = sql`doc_id::text, branch_code, warehouse_code, doc_no, doc_date::text, reason_code, purpose_code, priced, partner_code, partner_name,
  receiver_name, employee_name, description, lines, total, status, row_version, ledger_status, copied_from::text, below_cost, cancel_reason, cancelled_by,
  cancelled_at, posted_by, posted_at, created_by, created_by_name, created_at, updated_by, updated_at`;

const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);
/** Khuôn phiếu trả cho màn. */
export function toPhieu(r: PhieuRow) {
  return {
    id: r.doc_id, docNo: r.doc_no, docDate: r.doc_date, branchCode: r.branch_code, warehouseCode: r.warehouse_code, reasonCode: r.reason_code,
    purposeCode: r.purpose_code, priced: r.priced, kind: r.priced ? 'priced' as const : 'zero' as const,
    partner: r.partner_code ? { code: r.partner_code, name: r.partner_name ?? '' } : null, receiverName: r.receiver_name, employeeName: r.employee_name,
    description: r.description, lines: r.lines, total: Number(r.total), status: r.status, version: r.row_version, ledgerStatus: r.ledger_status,
    copiedFrom: r.copied_from, belowCost: r.below_cost ?? [], cancelReason: r.cancel_reason, cancelledBy: r.cancelled_by, cancelledAt: iso(r.cancelled_at),
    postedBy: r.posted_by, postedAt: iso(r.posted_at), createdBy: r.created_by, createdByName: r.created_by_name, createdAt: iso(r.created_at)!,
    updatedAt: iso(r.updated_at)!, source: 'module' as const,
  };
}
export type Phieu = ReturnType<typeof toPhieu>;

export async function getPhieu(tx: Tx, id: string, lock = false): Promise<PhieuRow> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw Errors.notFound(`phiếu xuất điều chỉnh ${id}`);
  const r = (await sql<PhieuRow>`SELECT ${COLS} FROM mod_xuat_dieu_chinh.phieu WHERE doc_id = ${id}::uuid AND status <> 'deleted' ${lock ? sql`FOR UPDATE` : sql``}`.execute(tx)).rows[0];
  if (!r) throw Errors.notFound(`phiếu xuất điều chỉnh ${id}`);
  return r;
}

/** Chi nhánh của phiếu (branchOf — Core so phạm vi chi nhánh người gọi trước handler). Không thấy → null (handler báo không có). */
export async function branchOfPhieu(tx: Tx, id: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return (await sql<{ b: string }>`SELECT branch_code AS b FROM mod_xuat_dieu_chinh.phieu WHERE doc_id = ${id}::uuid`.execute(tx)).rows[0]?.b ?? null;
}

export type ListFilter = { from?: string; to?: string; branches: string[] | null; status?: Status; kind?: 'zero' | 'priced'; search?: string };
export async function listPhieu(tx: Tx, f: ListFilter): Promise<PhieuRow[]> {
  const q = f.search?.trim();
  return (await sql<PhieuRow>`SELECT ${COLS} FROM mod_xuat_dieu_chinh.phieu
    WHERE status <> 'deleted'
      ${f.from ? sql`AND doc_date >= ${f.from}::date` : sql``} ${f.to ? sql`AND doc_date <= ${f.to}::date` : sql``}
      ${f.branches ? (f.branches.length ? sql`AND branch_code IN (${sql.join(f.branches)})` : sql`AND false`) : sql``}
      ${f.status ? sql`AND status = ${f.status}` : sql``}
      ${f.kind ? sql`AND priced = ${f.kind === 'priced'}` : sql``}
      ${q ? sql`AND (doc_no ILIKE ${`%${q}%`} OR description ILIKE ${`%${q}%`} OR coalesce(partner_name, '') ILIKE ${`%${q}%`})` : sql``}
    ORDER BY doc_date DESC, created_at DESC LIMIT 2000`.execute(tx)).rows;
}

/** Cấp số kế tiếp của chi nhánh × tháng (khoá dòng bộ đếm trong giao dịch — hai người lưu cùng lúc không trùng). */
export async function takeNo(tx: Tx, tenantId: string, branch: string, docDate: string): Promise<string> {
  const period = periodOf(docDate);
  const n = (await sql<{ last_no: number }>`
    INSERT INTO mod_xuat_dieu_chinh.code_counters (tenant_id, branch_code, period, last_no) VALUES (${tenantId}, ${branch}, ${period}, 1)
    ON CONFLICT (tenant_id, branch_code, period) DO UPDATE SET last_no = mod_xuat_dieu_chinh.code_counters.last_no + 1, updated_at = now()
    RETURNING last_no`.execute(tx)).rows[0]!.last_no;
  return formatNo(branch, period, n);
}

export type SaveRow = {
  docId: string; tenantId: string; branchCode: string; warehouseCode: string; docNo: string; docDate: string; reasonCode: string; purposeCode: string | null;
  priced: boolean; partnerCode: string | null; partnerName: string | null; receiverName: string; employeeName: string; description: string; lines: Line[]; total: number;
  copiedFrom: string | null; belowCost: unknown[] | null; actor: string; actorName: string;
};

export async function insertPhieu(tx: Tx, d: SaveRow): Promise<void> {
  await sql`INSERT INTO mod_xuat_dieu_chinh.phieu (doc_id, tenant_id, branch_code, warehouse_code, doc_no, doc_date, reason_code, purpose_code, priced, partner_code,
      partner_name, receiver_name, employee_name, description, lines, total, copied_from, below_cost, created_by, created_by_name, updated_by)
    VALUES (${d.docId}::uuid, ${d.tenantId}, ${d.branchCode}, ${d.warehouseCode}, ${d.docNo}, ${d.docDate}::date, ${d.reasonCode}, ${d.purposeCode}, ${d.priced},
      ${d.partnerCode}, ${d.partnerName}, ${d.receiverName}, ${d.employeeName}, ${d.description}, ${JSON.stringify(d.lines)}::jsonb, ${d.total},
      ${d.copiedFrom}::uuid, ${d.belowCost ? JSON.stringify(d.belowCost) : null}::jsonb, ${d.actor}, ${d.actorName}, ${d.actor})`.execute(tx);
}

/** Sửa nháp: tăng phiên bản dòng (người lưu sau với phiên bản cũ → CONFLICT ở service). */
export async function updateDraft(tx: Tx, d: SaveRow): Promise<void> {
  await sql`UPDATE mod_xuat_dieu_chinh.phieu SET branch_code = ${d.branchCode}, warehouse_code = ${d.warehouseCode}, doc_no = ${d.docNo}, doc_date = ${d.docDate}::date,
      reason_code = ${d.reasonCode}, purpose_code = ${d.purposeCode}, priced = ${d.priced}, partner_code = ${d.partnerCode}, partner_name = ${d.partnerName},
      receiver_name = ${d.receiverName}, employee_name = ${d.employeeName}, description = ${d.description}, lines = ${JSON.stringify(d.lines)}::jsonb, total = ${d.total},
      below_cost = ${d.belowCost ? JSON.stringify(d.belowCost) : null}::jsonb, row_version = row_version + 1, updated_by = ${d.actor}, updated_at = now()
    WHERE doc_id = ${d.docId}::uuid AND status = 'draft'`.execute(tx);
}

export async function markPosted(tx: Tx, id: string, ledgerStatus: string, actor: string): Promise<void> {
  await sql`UPDATE mod_xuat_dieu_chinh.phieu SET status = 'posted', ledger_status = ${ledgerStatus}, posted_by = ${actor}, posted_at = now(),
      row_version = row_version + 1, updated_by = ${actor}, updated_at = now() WHERE doc_id = ${id}::uuid`.execute(tx);
}

export async function markCancelled(tx: Tx, id: string, ledgerStatus: string, reason: string, actor: string): Promise<void> {
  await sql`UPDATE mod_xuat_dieu_chinh.phieu SET status = 'cancelled', ledger_status = ${ledgerStatus}, cancel_reason = ${reason}, cancelled_by = ${actor},
      cancelled_at = now(), row_version = row_version + 1, updated_by = ${actor}, updated_at = now() WHERE doc_id = ${id}::uuid`.execute(tx);
}

export async function markDeleted(tx: Tx, id: string, actor: string): Promise<void> {
  await sql`UPDATE mod_xuat_dieu_chinh.phieu SET status = 'deleted', row_version = row_version + 1, updated_by = ${actor}, updated_at = now()
    WHERE doc_id = ${id}::uuid AND status = 'draft'`.execute(tx);
}

export async function noTaken(tx: Tx, branch: string, docNo: string, exceptId?: string): Promise<boolean> {
  return (await sql<{ n: number }>`SELECT 1 AS n FROM mod_xuat_dieu_chinh.phieu WHERE branch_code = ${branch} AND doc_no = ${docNo}
    ${exceptId ? sql`AND doc_id <> ${exceptId}::uuid` : sql``} LIMIT 1`.execute(tx)).rows.length > 0;
}

// ── Danh mục chuẩn (bizcity_read.*) ───────────────────────────────────────────────────────────────────────────────────────

export async function branchActive(tx: Tx, code: string): Promise<boolean> {
  return (await sql<{ n: number }>`SELECT 1 AS n FROM bizcity_read.branches WHERE code = ${code} AND is_active`.execute(tx)).rows.length > 0;
}

export type Wh = { code: string; name: string; isDefault: boolean; isPromo: boolean };
/** Kho đang dùng của chi nhánh: kho mặc định (kho bán) trước, rồi kho quà (KKM), rồi theo mã. */
export async function warehousesOf(tx: Tx, branch: string): Promise<Wh[]> {
  return (await sql<{ code: string; name: string; is_default: boolean; is_promo: boolean }>`
    SELECT code, name, is_default, coalesce(is_promo, false) AS is_promo FROM bizcity_read.warehouses
     WHERE branch_code = ${branch} AND is_active ORDER BY is_default DESC, is_promo DESC, code`.execute(tx)).rows
    .map((w) => ({ code: w.code, name: w.name, isDefault: w.is_default, isPromo: w.is_promo }));
}

/** Mặt hàng theo mã + ĐVT quy đổi + giá niêm yết của chi nhánh (bảng giá DM14). */
export async function catalogFor(tx: Tx, branch: string, skus: readonly string[]): Promise<Map<string, CatalogItem>> {
  const uniq = [...new Set(skus.map((s) => s.trim()).filter(Boolean))];
  const out = new Map<string, CatalogItem>();
  if (!uniq.length) return out;
  const prods = (await sql<{ sku: string; name: string; unit: string; tax_out_code: string | null; is_active: boolean }>`
    SELECT sku, name, unit, tax_out_code, is_active FROM bizcity_read.products WHERE sku IN (${sql.join(uniq)})`.execute(tx)).rows;
  for (const p of prods) out.set(p.sku, { sku: p.sku, name: p.name, baseUnit: p.unit, taxCode: p.tax_out_code, active: p.is_active, units: new Map() });
  const units = (await sql<{ sku: string; unit: string; ratio: string; price: string | null }>`
    SELECT sku, unit, ratio, price FROM bizcity_read.branch_prices WHERE branch_code = ${branch} AND sku IN (${sql.join(uniq)})`.execute(tx)).rows;
  for (const u of units) out.get(u.sku)?.units.set(u.unit, { ratio: Number(u.ratio), price: u.price === null ? null : Number(u.price) });
  return out;
}

export async function taxRates(tx: Tx): Promise<Map<string, number>> {
  const rows = (await sql<{ code: string; rate: string | number }>`
    SELECT code, rate FROM bizcity_read.tax_codes WHERE is_active IS NOT FALSE AND direction IS DISTINCT FROM 'input'`.execute(tx)).rows;
  return new Map(rows.map((r) => [r.code, Number(r.rate)]));
}

/** Tồn theo mã ở một kho của chi nhánh (ĐVT nhỏ nhất). Khoá theo (chi nhánh, kho, mã) tới hết giao dịch — hai phiếu cùng lúc không cùng lọt. */
export async function stockOf(tx: Tx, branch: string, warehouse: string, skus: readonly string[], lock = false): Promise<Map<string, number>> {
  const uniq = [...new Set(skus)].sort();
  if (!uniq.length) return new Map();
  if (lock) for (const s of uniq) await sql`SELECT pg_advisory_xact_lock(hashtext(${`xdc:${branch}:${warehouse}:${s}`}))`.execute(tx);
  const rows = (await sql<{ sku: string; q: string }>`
    SELECT sku, sum(qty)::text AS q FROM bizcity_read.stock_on_hand
     WHERE branch_code = ${branch} AND warehouse_code = ${warehouse} AND sku IN (${sql.join(uniq)}) GROUP BY sku`.execute(tx)).rows;
  return new Map(rows.map((r) => [r.sku, Number(r.q)]));
}

export async function partnerByCode(tx: Tx, code: string): Promise<{ code: string; name: string } | null> {
  return (await sql<{ code: string; name: string }>`SELECT code, name FROM bizcity_read.partners WHERE code = ${code} AND is_active IS NOT FALSE`.execute(tx)).rows[0] ?? null;
}

/** Đơn giá vốn bình quân của lần tính giá vốn mới nhất tới tháng của phiếu (tham chiếu cảnh báo dưới giá vốn; chưa tính → không có). */
export async function unitCosts(tx: Tx, branch: string, date: string, skus: readonly string[]): Promise<Map<string, number>> {
  const uniq = [...new Set(skus)];
  if (!uniq.length) return new Map();
  const y = Number(date.slice(0, 4)); const m = Number(date.slice(5, 7));
  const rows = (await sql<{ sku: string; c: string }>`
    SELECT DISTINCT ON (sku) sku, unit_cost::text AS c FROM bizcity_read.monthly_unit_costs
     WHERE branch_code = ${branch} AND sku IN (${sql.join(uniq)}) AND (year * 100 + month) <= ${y * 100 + m}
     ORDER BY sku, year DESC, month DESC, unit_cost DESC`.execute(tx)).rows;
  return new Map(rows.map((r) => [r.sku, Number(r.c)]));
}
