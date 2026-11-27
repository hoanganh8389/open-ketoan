/**
 * Báo cáo bán hàng máy POS gom ở máy chủ (phiếu NT-BH-043): Báo cáo bán hàng (dòng), Tổng hợp bán hàng (phiếu), Thu tiền bán hàng,
 * Bán hàng theo danh mục, Doanh số theo ngày. Đọc bảng của module + khung nhìn bizcity_read (nhóm hàng, lô theo chứng từ, đơn giá vốn
 * tháng — 0186). Chạy trong ctx.data.module (RLS lọc theo đơn vị). Chỉ đơn `completed` (R-2), lọc theo ngày kinh doanh (R-3).
 * Tổng (meta.sums) tính trên TOÀN BỘ kết quả lọc, không chỉ trang đang xem.
 */
// [2026-11-25 11:55 PM Võ Hoàng] NGHIEM-THU — NT-BH-043: SQL đọc báo cáo bán hàng máy POS (đóng góp)
import { Errors, roundMoney, sql, type ActionContext } from '@bizcity/module-sdk';
import { paymentKind } from './domain/order.js';
import {
  assignLots, collectedParts, collectionReason, customerNameOf, dailyRows, expandGroups, groupPath, isManualGift, lineCost, paidOf,
  paymentText, rangeProblem, RETURN_REASON, SALE_REASON,
  type DocLot, type GroupRow, type PayMethod, type SnapPayment, type SnapVoucherUse,
} from './domain/sales-report.js';

type Tx = Parameters<Parameters<ActionContext['data']['module']>[0]>[0];
type Num = string | number | null;
const n = (v: Num) => (v === null || v === undefined ? 0 : Number(v));

export type ReportKind = 'sale' | 'return' | 'all';

/** Kiểm khoảng ngày (Q6) — VALIDATION_ERROR có `field` + `fields` để màn báo ở ô ngày. */
export function checkRange(from: string, to: string): void {
  const p = rangeProblem(from, to);
  if (p) throw Errors.validation(p.message, { field: p.field, fields: { [p.field]: p.message } });
}

/**
 * Chi nhánh được xem (Q-CHUNG-01; NT-BH-055 — phân quyền theo tài khoản: nhân viên shop nào xem mọi màn của shop đó, quản trị xem hết):
 *   - có `pos:report` (quản trị — vé máy bán cấp cho quản trị mạng) → chi nhánh hỏi (phạm vi chi nhánh do Core so qua branchOf);
 *   - chỉ `pos:sell` (nhân viên) → chi nhánh của TÀI KHOẢN: phạm vi chi nhánh được gán ở Phân quyền (vai trò tại chi nhánh) nếu có;
 *     không gán thì MỌI chi nhánh tài khoản đã mở ca hoặc đã bán (không chỉ ca gần nhất — một người bán ở nhiều shop vẫn xem được
 *     từng shop của mình); chưa mở ca / bán lần nào thì đơn vị chỉ có một chi nhánh. Chi nhánh khác → 403 kèm lý do dễ hiểu.
 */
// [2026-11-28 10:30 AM Võ Hoàng] NGHIEM-THU — NT-BH-055: chi nhánh của tài khoản = phạm vi gán, không thì mọi chi nhánh đã mở ca / đã bán (đóng góp)
export async function ownBranches(ctx: ActionContext, tx: Tx, branches: readonly string[]): Promise<string[]> {
  if (ctx.branchScope) return [...ctx.branchScope];
  const rows = (await sql<{ branch_code: string }>`
    SELECT branch_code FROM mod_pos.shifts WHERE opened_by = ${ctx.actor.id}
    UNION SELECT branch_code FROM mod_pos.orders WHERE created_by = ${ctx.actor.id}`.execute(tx)).rows.map((r) => r.branch_code);
  const own = [...new Set(rows)].filter((c) => branches.includes(c)).sort();
  return own.length ? own : branches.length === 1 ? [...branches] : [];
}

export async function allowedBranch(ctx: ActionContext, tx: Tx, asked: string | undefined): Promise<string> {
  const branches = (await sql<{ code: string }>`SELECT code FROM bizcity_read.branches WHERE is_active IS NOT FALSE ORDER BY code`.execute(tx)).rows.map((r) => r.code);
  if (asked && !branches.includes(asked)) throw Errors.validation(`Không có chi nhánh ${asked} trong danh mục kế toán`, { reason: 'POS_UNKNOWN_BRANCH', branchCode: asked, field: 'branch' });
  if (ctx.can('pos:report')) {
    if (asked) return asked;
    if (branches.length === 1) return branches[0]!;
    throw Errors.validation('Chọn chi nhánh cần xem', { reason: 'POS_BRANCH_REQUIRED', field: 'branch' });
  }
  const own = await ownBranches(ctx, tx, branches);
  const want = asked ?? (own.length === 1 ? own[0] : undefined);
  if (!want) throw Errors.validation('Máy bán phải gửi chi nhánh (branch)', { reason: 'POS_BRANCH_REQUIRED', field: 'branch' });
  if (!own.includes(want)) {
    throw Errors.forbidden(own.length
      ? `Tài khoản này chỉ xem được số của chi nhánh ${own.join(', ')} — không xem được ${want}. Cần xem mọi chi nhánh thì dùng tài khoản quản trị.`
      : `Tài khoản này chưa thuộc chi nhánh nào: gán chi nhánh ${want} cho tài khoản ở Phân quyền (vai trò tại chi nhánh) của phần mềm kế toán, hoặc mở ca bán hàng tại cửa hàng này trước.`);
  }
  return want;
}

async function payMethods(tx: Tx): Promise<{ list: PayMethod[]; cashCode: string; qrCode: string }> {
  const list = (await sql<{ code: string; name: string; is_receivable: boolean | null; bank_account_code: string | null; is_active: boolean | null }>`
    SELECT code, name, is_receivable, bank_account_code, is_active FROM bizcity_read.payment_methods ORDER BY sort_order NULLS LAST, code`.execute(tx)).rows;
  const methods = list.map((m) => ({ code: m.code, name: m.name, isReceivable: m.is_receivable === true, bankAccountCode: m.bank_account_code }));
  const active = list.filter((m) => m.is_active !== false);
  return {
    list: methods,
    cashCode: active.find((m) => paymentKind(m.code) === 'cash')?.code ?? 'TM',
    qrCode: active.find((m) => paymentKind(m.code) === 'qr')?.code ?? 'QR',
  };
}

export async function itemGroups(tx: Tx): Promise<GroupRow[]> {
  return (await sql<{ code: string; name: string; full_name: string | null; parent_code: string | null; is_active: boolean | null }>`
    SELECT code, name, full_name, parent_code, is_active FROM bizcity_read.item_groups ORDER BY code`.execute(tx)).rows
    .map((g) => ({ code: g.code, name: g.name, fullName: g.full_name ?? '', parentCode: g.parent_code, isActive: g.is_active !== false }));
}

/** Mã nhóm lọc (đã gồm nhóm con) hoặc null = không lọc. */
async function groupFilter(tx: Tx, selected: readonly string[]): Promise<{ codes: string[] | null; groups: GroupRow[] }> {
  const groups = await itemGroups(tx);
  return { codes: selected.length ? expandGroups(selected, groups) : null, groups };
}

// ── Dòng bán + trả (dùng chung cho dòng / danh mục / ngày) ──────────────────────────────────────────────────────────────

type LineFilter = { branch: string; from: string; to: string; kind: ReportKind; groups: string[] | null; q?: string };

/**
 * CTE `x`: một dòng một mặt hàng của phiếu bán (completed) và phiếu trả trong khoảng, kèm SL ĐVT nhỏ nhất, nhóm hàng (theo item_id,
 * không có thì theo mã). Tiền dòng bán = order_lines (gồm thuế, sau giảm); dòng trả = return_lines (tiền hoàn).
 */
function linesCte(f: LineFilter) {
  const q = f.q?.trim();
  return sql`
    s AS (
      SELECT false AS is_return, o.order_id, NULL::text AS return_id, o.code AS doc, o.doc_key, o.business_date, o.created_at, o.created_by, o.cashier_name,
             l.id AS lid, l.line_key, l.sku, l.item_id, l.item_name, l.unit_name, l.unit_qty, l.unit_ratio,
             l.amount, l.amount_before_tax AS before_tax, l.tax_amount AS tax, o.snapshot->'customer' AS customer,
             row_number() OVER (PARTITION BY o.order_id, COALESCE(l.item_id, 'sku:' || l.sku) ORDER BY l.id) AS nth
        FROM mod_pos.orders o JOIN mod_pos.order_lines l ON l.tenant_id = o.tenant_id AND l.order_id = o.order_id
       WHERE ${f.kind !== 'return'} AND o.branch_code = ${f.branch} AND o.status = 'completed' AND o.business_date BETWEEN ${f.from} AND ${f.to}
      UNION ALL
      SELECT true, r.order_id, r.return_id, r.code, r.doc_key, r.business_date, r.created_at, r.created_by, r.cashier_name,
             rl.id, rl.line_key, rl.sku, rl.item_id, COALESCE(ol.item_name, rl.sku), COALESCE(ol.unit_name, ''), rl.unit_qty, COALESCE(ol.unit_ratio, 1),
             rl.refund, rl.refund_net, rl.refund_tax, o.snapshot->'customer',
             row_number() OVER (PARTITION BY r.return_id, COALESCE(rl.item_id, 'sku:' || rl.sku) ORDER BY rl.id)
        FROM mod_pos.returns r JOIN mod_pos.return_lines rl ON rl.tenant_id = r.tenant_id AND rl.return_id = r.return_id
        JOIN mod_pos.orders o ON o.tenant_id = r.tenant_id AND o.order_id = r.order_id
        LEFT JOIN mod_pos.order_lines ol ON ol.tenant_id = rl.tenant_id AND ol.order_id = rl.order_id AND ol.line_key = rl.line_key
       WHERE ${f.kind !== 'sale'} AND r.branch_code = ${f.branch} AND r.business_date BETWEEN ${f.from} AND ${f.to}
    ),
    x AS (
      SELECT s.*, s.unit_qty * s.unit_ratio AS base_qty, COALESCE(p1.group_code, p2.group_code, '') AS group_code, COALESCE(p1.unit, p2.unit) AS base_unit
        FROM s
        LEFT JOIN bizcity_read.products p1 ON p1.item_id = s.item_id
        LEFT JOIN bizcity_read.products p2 ON p2.sku = s.sku
       WHERE true
       ${f.groups ? (f.groups.length ? sql`AND COALESCE(p1.group_code, p2.group_code) IN (${sql.join(f.groups)})` : sql`AND false`) : sql``}
       ${q ? sql`AND (s.doc ILIKE ${`%${q}%`} OR s.sku ILIKE ${`%${q}%`} OR s.item_name ILIKE ${`%${q}%`}
                 OR s.customer->>'phone' ILIKE ${`%${q}%`} OR s.customer->>'name' ILIKE ${`%${q}%`})` : sql``}
    )`;
}

/** CTE đơn giá vốn tháng của chi nhánh (lần tính mới nhất; loại kho chung trước) — theo định danh và theo mã. */
function costCte(branch: string, from: string, to: string) {
  const ym = (d: string) => Number(d.slice(0, 4)) * 100 + Number(d.slice(5, 7));
  return sql`
    cm AS (
      SELECT year, month, item_id, sku, wh_type, unit_cost FROM bizcity_read.monthly_unit_costs
       WHERE branch_code = ${branch} AND year * 100 + month BETWEEN ${ym(from)} AND ${ym(to)}
    ),
    c1 AS (SELECT DISTINCT ON (year, month, item_id) year, month, item_id, unit_cost FROM cm WHERE item_id IS NOT NULL ORDER BY year, month, item_id, (wh_type = '') DESC, wh_type),
    c2 AS (SELECT DISTINCT ON (year, month, sku) year, month, sku, unit_cost FROM cm ORDER BY year, month, sku, (wh_type = '') DESC, wh_type),
    runs AS (SELECT DISTINCT year, month FROM cm),
    xc AS (
      SELECT x.*, (r.year IS NOT NULL) AS month_run, COALESCE(c1.unit_cost, c2.unit_cost) AS unit_cost
        FROM x
        LEFT JOIN runs r ON r.year = extract(year FROM x.business_date) AND r.month = extract(month FROM x.business_date)
        LEFT JOIN c1 ON c1.year = r.year AND c1.month = r.month AND c1.item_id = x.item_id
        LEFT JOIN c2 ON c2.year = r.year AND c2.month = r.month AND c2.sku = x.sku
    )`;
}

const noCostCte = sql`xc AS (SELECT x.*, false AS month_run, NULL::numeric AS unit_cost FROM x)`;

type XRow = {
  is_return: boolean; order_id: string; return_id: string | null; doc: string; doc_key: string; business_date: string; created_at: Date; created_by: string;
  cashier_name: string | null; lid: string; line_key: string; sku: string; item_id: string | null; item_name: string; unit_name: string;
  unit_qty: Num; unit_ratio: Num; amount: Num; before_tax: Num; tax: Num; customer: { id?: string; name?: string; phone?: string } | null;
  base_qty: Num; group_code: string; base_unit: string | null; month_run: boolean; unit_cost: Num; nth: Num;
};

type SnapLine = { lineId: string; unitPrice?: number; note?: string; isGift?: boolean; policyRef?: unknown };
type OrderSnapR = { code: string; total: number; payment: SnapPayment; saleSource?: string; saleSourceName?: string; lines?: SnapLine[]; zBill?: { code: string; lines?: SnapLine[] }; voucherUses?: SnapVoucherUse[]; qr?: { paidAt?: string; paymentRef?: string } };

/** Báo cáo bán hàng — một dòng một mặt hàng của phiếu (§3a pos.report.sales-lines). */
export async function salesLines(tx: Tx, f: LineFilter & { selectedGroups: string[]; page: number; pageSize: number; canCost: boolean }) {
  const { codes, groups } = await groupFilter(tx, f.selectedGroups);
  const lf = { ...f, groups: codes };
  const ctes = sql`WITH ${linesCte(lf)}, ${f.canCost ? costCte(f.branch, f.from, f.to) : noCostCte}`;
  const signedCost = sql`CASE WHEN xc.unit_cost IS NULL THEN 0 ELSE round(xc.base_qty * xc.unit_cost) * (CASE WHEN xc.is_return THEN -1 ELSE 1 END) END`;
  const agg = (await sql<{ n: Num; qty: Num; amount: Num; revenue: Num; tax: Num; before_tax: Num; cost: Num; missing: Num }>`
    ${ctes}
    SELECT count(*) AS n, sum(base_qty) AS qty, sum(amount) AS amount, sum(CASE WHEN is_return THEN -amount ELSE amount END) AS revenue,
           sum(tax) AS tax, sum(before_tax) AS before_tax, sum(${signedCost}) AS cost, count(*) FILTER (WHERE unit_cost IS NULL) AS missing
      FROM xc`.execute(tx)).rows[0]!;
  const rows = (await sql<XRow>`
    ${ctes}
    SELECT xc.*, xc.business_date::text AS business_date FROM xc
     ORDER BY xc.business_date, xc.created_at, xc.doc, xc.is_return, xc.lid
     LIMIT ${f.pageSize} OFFSET ${(f.page - 1) * f.pageSize}`.execute(tx)).rows;

  const { list: methods } = await payMethods(tx);
  const orderIds = [...new Set(rows.map((r) => r.order_id))];
  const returnIds = [...new Set(rows.filter((r) => r.return_id).map((r) => r.return_id!))];
  const orders = new Map(orderIds.length ? (await sql<{ order_id: string; snapshot: OrderSnapR }>`
    SELECT order_id, snapshot FROM mod_pos.orders WHERE order_id IN (${sql.join(orderIds)})`.execute(tx)).rows.map((r) => [r.order_id, r.snapshot]) : []);
  const returns = new Map(returnIds.length ? (await sql<{ return_id: string; refund_method: string; reason: string }>`
    SELECT return_id, refund_method, reason FROM mod_pos.returns WHERE return_id IN (${sql.join(returnIds)})`.execute(tx)).rows.map((r) => [r.return_id, r]) : []);
  const docKeys = [...new Set(rows.map((r) => r.doc_key).filter(Boolean))];
  const lots: DocLot[] = docKeys.length ? (await sql<{ doc_key: string; line_no: number; sku: string; item_id: string | null; lot_no: string; exp_date: string | null; qty: Num }>`
    SELECT doc_key, line_no, sku, item_id, lot_no, exp_date::text AS exp_date, qty FROM bizcity_read.document_lots WHERE doc_key IN (${sql.join(docKeys)})`.execute(tx)).rows
    .map((l) => ({ docKey: l.doc_key, lineNo: l.line_no, sku: l.sku, itemId: l.item_id, lotNo: l.lot_no, expDate: l.exp_date, qty: n(l.qty) })) : [];
  const keyOf = (r: XRow) => `${r.is_return ? r.return_id : r.order_id}:${r.line_key}`;
  // nth: thứ tự dòng cùng mặt hàng trên chứng từ (id dòng = thứ tự ghi = thứ tự dòng đã nộp).
  const lineLots = assignLots(rows.map((r) => ({ key: keyOf(r), docKey: r.doc_key, sku: r.sku, itemId: r.item_id, nth: n(r.nth) })), lots);
  const groupMap = new Map(groups.map((g) => [g.code, g]));

  const items = rows.map((r) => {
    const snap = orders.get(r.order_id);
    const zLine = snap?.zBill?.lines?.find((l) => l.lineId === r.line_key);
    const sLine = zLine ?? snap?.lines?.find((l) => l.lineId === r.line_key);
    const ret = r.return_id ? returns.get(r.return_id) : undefined;
    const qty = n(r.unit_qty);
    const ratio = n(r.unit_ratio) || 1;
    const baseQty = n(r.base_qty);
    const amount = n(r.amount);
    const unitPrice = r.is_return ? (qty ? roundMoney(amount / qty) : 0) : sLine?.unitPrice ?? (qty ? roundMoney(amount / qty) : 0);
    const cost = f.canCost ? lineCost({ baseQty, isReturn: r.is_return, businessDate: r.business_date, monthRun: r.month_run, unitCost: r.unit_cost === null ? null : n(r.unit_cost) }) : null;
    return {
      key: keyOf(r),
      orderId: r.order_id,
      ...(r.return_id ? { returnId: r.return_id } : {}),
      sku: r.sku,
      name: r.item_name,
      groupCode: r.group_code,
      groupName: groupMap.get(r.group_code)?.name ?? '',
      group: groupPath(r.group_code, groupMap),
      businessDate: r.business_date,
      createdAt: r.created_at.toISOString(),
      doc: !r.is_return && zLine && snap?.zBill ? snap.zBill.code : r.doc,
      reason: r.is_return ? RETURN_REASON : SALE_REASON,
      isReturn: r.is_return,
      returnText: r.is_return ? 'Có' : '',
      baseQty,
      baseUnit: r.base_unit ?? (ratio === 1 ? r.unit_name : ''),
      basePrice: baseQty ? roundMoney(amount / baseQty) : 0,
      unitPrice,
      discount: r.is_return ? 0 : Math.max(0, roundMoney(unitPrice * qty - amount)),
      amount,
      revenue: r.is_return ? -amount : amount,
      tax: n(r.tax),
      beforeTax: n(r.before_tax),
      customerName: customerNameOf(r.customer ?? undefined),
      phone: r.customer?.phone ?? '',
      saleUnit: r.unit_name,
      saleQty: qty,
      payment: r.is_return ? (methods.find((m) => m.code === ret?.refund_method)?.name ?? ret?.refund_method ?? '') : snap ? paymentText(snap.payment, methods) : '',
      channel: r.is_return ? '' : snap?.saleSourceName ?? snap?.saleSource ?? '',
      note: r.is_return ? ret?.reason ?? '' : sLine?.note ?? '',
      // Q2: Nhân viên = thu ngân lập phiếu (tên lúc lập; phiếu trước 0005 trống), Mã NV = định danh người lập.
      cashier: r.cashier_name ?? '',
      cashierId: r.created_by ?? '',
      lots: lineLots.get(keyOf(r)) ?? [],
      // Q3: cột giá vốn chỉ có khi người xem có pos:report — không có thì không trả trường (R-4: xuất Excel không lộ).
      ...(cost ? cost : {}),
    };
  });
  return {
    items,
    meta: {
      page: f.page, pageSize: f.pageSize, total: n(agg.n),
      sums: {
        qty: n(agg.qty), amount: n(agg.amount), revenue: n(agg.revenue), tax: n(agg.tax), beforeTax: n(agg.before_tax),
        ...(f.canCost ? { cost: n(agg.cost), costMissingLines: n(agg.missing) } : {}),
      },
    },
  };
}

/** Bán hàng theo danh mục — gom theo mã hàng (§3a pos.report.by-category); không chia trang. */
export async function byCategory(tx: Tx, f: LineFilter & { selectedGroups: string[] }) {
  const { codes, groups } = await groupFilter(tx, f.selectedGroups);
  const rows = (await sql<{ sku: string; name: string; group_code: string; qty: Num; revenue: Num }>`
    WITH ${linesCte({ ...f, kind: 'all', groups: codes })}
    SELECT sku, max(item_name) AS name, max(group_code) AS group_code,
           sum(CASE WHEN is_return THEN -abs(base_qty) ELSE base_qty END) AS qty, sum(CASE WHEN is_return THEN -amount ELSE amount END) AS revenue
      FROM x GROUP BY sku ORDER BY sku`.execute(tx)).rows;
  const groupMap = new Map(groups.map((g) => [g.code, g]));
  const items = rows.map((r) => ({
    key: r.sku, sku: r.sku, name: r.name, groupCode: r.group_code, groupName: groupMap.get(r.group_code)?.name ?? '', group: groupPath(r.group_code, groupMap),
    qty: n(r.qty), revenue: n(r.revenue),
  })).sort((a, b) => a.sku.localeCompare(b.sku, 'vi', { numeric: true }));
  return { items, sums: { qty: items.reduce((s, r) => s + r.qty, 0), revenue: items.reduce((s, r) => s + r.revenue, 0) } };
}

/** Doanh số theo ngày của một tháng (§3a pos.report.daily). */
export async function daily(tx: Tx, f: { branch: string; from: string; to: string; selectedGroups: string[] }) {
  const { codes } = await groupFilter(tx, f.selectedGroups);
  const rows = (await sql<{ d: string; qty: Num; revenue: Num }>`
    WITH ${linesCte({ branch: f.branch, from: f.from, to: f.to, kind: 'all', groups: codes })}
    SELECT business_date::text AS d, sum(CASE WHEN is_return THEN -abs(base_qty) ELSE base_qty END) AS qty,
           sum(CASE WHEN is_return THEN -amount ELSE amount END) AS revenue
      FROM x GROUP BY business_date`.execute(tx)).rows;
  const items = dailyRows(new Map(rows.map((r) => [r.d, { qty: n(r.qty), revenue: n(r.revenue) }])), f.from, f.to);
  return { items, sums: { qty: items.reduce((s, r) => s + r.qty, 0), revenue: items.reduce((s, r) => s + r.revenue, 0) } };
}

// ── Tổng hợp bán hàng: một dòng một phiếu ───────────────────────────────────────────────────────────────────────────────

/** Tổng hợp bán hàng — một dòng một phiếu bán / trả (§3a pos.report.sales-summary). */
export async function salesSummary(tx: Tx, f: { branch: string; from: string; to: string; kind: ReportKind; q?: string; page: number; pageSize: number }) {
  const q = f.q?.trim();
  const like = q ? `%${q}%` : '';
  const docs = sql`
    d AS (
      SELECT false AS is_return, o.order_id, NULL::text AS return_id, o.code AS doc, o.business_date, o.created_at, o.created_by, o.cashier_name,
             o.total, NULL::text AS refund_method, o.snapshot->'customer' AS customer, o.id AS rid
        FROM mod_pos.orders o
       WHERE ${f.kind !== 'return'} AND o.branch_code = ${f.branch} AND o.status = 'completed' AND o.business_date BETWEEN ${f.from} AND ${f.to}
      UNION ALL
      SELECT true, r.order_id, r.return_id, r.code, r.business_date, r.created_at, r.created_by, r.cashier_name,
             r.refund_total, r.refund_method, o.snapshot->'customer', r.id
        FROM mod_pos.returns r JOIN mod_pos.orders o ON o.tenant_id = r.tenant_id AND o.order_id = r.order_id
       WHERE ${f.kind !== 'sale'} AND r.branch_code = ${f.branch} AND r.business_date BETWEEN ${f.from} AND ${f.to}
    ),
    dx AS (
      SELECT * FROM d
       ${q ? sql`WHERE doc ILIKE ${like} OR customer->>'phone' ILIKE ${like} OR customer->>'name' ILIKE ${like}` : sql``}
    )`;
  const agg = (await sql<{ n: Num; total: Num }>`
    WITH ${docs} SELECT count(*) AS n, sum(CASE WHEN is_return THEN -total ELSE total END) AS total FROM dx`.execute(tx)).rows[0]!;
  const rows = (await sql<{ is_return: boolean; order_id: string; return_id: string | null; doc: string; business_date: string; created_at: Date; created_by: string; cashier_name: string | null; total: Num; refund_method: string | null; customer: { id?: string; name?: string; phone?: string } | null }>`
    WITH ${docs}
    SELECT dx.*, dx.business_date::text AS business_date FROM dx ORDER BY dx.business_date, dx.created_at, dx.is_return, dx.rid
     LIMIT ${f.pageSize} OFFSET ${(f.page - 1) * f.pageSize}`.execute(tx)).rows;
  const { list: methods } = await payMethods(tx);
  const ids = [...new Set(rows.filter((r) => !r.is_return).map((r) => r.order_id))];
  const orders = new Map(ids.length ? (await sql<{ order_id: string; snapshot: OrderSnapR; note: string | null }>`
    SELECT order_id, snapshot, draft->>'note' AS note FROM mod_pos.orders WHERE order_id IN (${sql.join(ids)})`.execute(tx)).rows.map((r) => [r.order_id, r]) : []);
  const retIds = [...new Set(rows.filter((r) => r.is_return).map((r) => r.return_id!))];
  const reasons = new Map(retIds.length ? (await sql<{ return_id: string; reason: string }>`
    SELECT return_id, reason FROM mod_pos.returns WHERE return_id IN (${sql.join(retIds)})`.execute(tx)).rows.map((r) => [r.return_id, r.reason]) : []);
  // Đã trả / còn nợ cộng trên cả kết quả lọc: tính lại từ bản chụp đơn (ít cột, không nặng như dòng).
  const paidAll = f.kind === 'return' ? 0 : (await sql<{ total: Num; payment: SnapPayment }>`
    WITH ${docs} SELECT o.total, o.snapshot->'payment' AS payment FROM dx JOIN mod_pos.orders o ON o.order_id = dx.order_id WHERE NOT dx.is_return`.execute(tx)).rows
    .reduce((s, r) => s + paidOf({ total: n(r.total), payment: r.payment }, methods), 0);
  const returnedAll = f.kind === 'sale' ? 0 : n((await sql<{ t: Num }>`WITH ${docs} SELECT sum(total) AS t FROM dx WHERE is_return`.execute(tx)).rows[0]?.t ?? 0);
  const items = rows.map((r) => {
    const total = n(r.total);
    const base = {
      key: r.is_return ? r.return_id! : r.order_id, orderId: r.order_id, ...(r.return_id ? { returnId: r.return_id } : {}), doc: r.doc,
      businessDate: r.business_date, createdAt: r.created_at.toISOString(), reason: r.is_return ? RETURN_REASON : SALE_REASON, isReturn: r.is_return,
      returnText: r.is_return ? 'Có' : '', customerName: customerNameOf(r.customer ?? undefined), phone: r.customer?.phone ?? '',
      cashier: r.cashier_name ?? '', cashierId: r.created_by ?? '',
    };
    if (r.is_return) {
      // Phiếu hoàn ở máy bán chi trả ngay theo hình thức hoàn (tiền mặt, đối trừ khi đổi hàng…) nên không còn nợ khách.
      return { ...base, payment: methods.find((m) => m.code === r.refund_method)?.name ?? r.refund_method ?? '', total: -total, revenue: -total, paid: total, debt: 0,
        channel: '', note: reasons.get(r.return_id!) ?? '', manualGift: false };
    }
    const o = orders.get(r.order_id);
    const snap = o?.snapshot;
    const paid = snap ? paidOf({ total, payment: snap.payment }, methods) : total;
    const lines = [...(snap?.lines ?? []), ...(snap?.zBill?.lines ?? [])];
    return { ...base, payment: snap ? paymentText(snap.payment, methods) : '', total, revenue: total, paid, debt: total - paid,
      channel: snap?.saleSourceName ?? snap?.saleSource ?? '', note: o?.note ?? '', manualGift: lines.some(isManualGift) };
  });
  return {
    items,
    meta: { page: f.page, pageSize: f.pageSize, total: n(agg.n), sums: { total: n(agg.total), revenue: n(agg.total), paid: paidAll + returnedAll, debt: n(agg.total) + returnedAll - paidAll } },
  };
}

// ── Thu tiền bán hàng: một dòng một lần thu ─────────────────────────────────────────────────────────────────────────────

/** Thu tiền bán hàng — một dòng một khoản thu tiền như sổ (§3a pos.report.collections, ca 13). */
export async function collections(tx: Tx, f: { branch: string; from: string; to: string; method?: string; page: number; pageSize: number }) {
  // Số khoản thu của một đơn chỉ biết sau khi tách hình thức → đọc đơn của khoảng (chỉ cột cần), tách, rồi chia trang trong bộ nhớ.
  // Khoảng tối đa 92 ngày của một chi nhánh: vài chục nghìn đơn, mỗi đơn vài trăm byte.
  const rows = (await sql<{ order_id: string; code: string; business_date: string; created_at: Date; created_by: string; cashier_name: string | null; total: Num; payment: SnapPayment; voucher_uses: SnapVoucherUse[] | null; customer: { id?: string; name?: string; phone?: string } | null; qr: { paidAt?: string; paymentRef?: string } | null }>`
    SELECT order_id, code, business_date::text AS business_date, created_at, created_by, cashier_name, total, snapshot->'payment' AS payment,
           snapshot->'voucherUses' AS voucher_uses, snapshot->'customer' AS customer, snapshot->'qr' AS qr
      FROM mod_pos.orders
     WHERE branch_code = ${f.branch} AND status = 'completed' AND business_date BETWEEN ${f.from} AND ${f.to}
     ORDER BY business_date, created_at, id`.execute(tx)).rows;
  const { list: methods, cashCode, qrCode } = await payMethods(tx);
  const bank = (code: string) => methods.find((m) => m.code === code)?.bankAccountCode ?? '';
  const all = rows.flatMap((o) => collectedParts({ code: o.code, total: n(o.total), payment: o.payment, voucherUses: o.voucher_uses ?? [] }, methods, cashCode, qrCode)
    .filter((p) => !f.method || p.method === f.method)
    .map((p, i) => ({
      key: `${o.order_id}:${i}`, orderId: o.order_id,
      receiptNo: p.receiptNo,
      receiptDate: (p.kind === 'qr' && o.qr?.paidAt) || o.created_at.toISOString(),
      saleCode: o.code, saleDate: o.created_at.toISOString(), businessDate: o.business_date,
      // Như POS cũ: báo cáo theo từng lần thu, đơn thu nhiều lần không lặp lại tổng đơn ở mỗi dòng.
      saleTotal: p.amount, paid: p.amount,
      customerCode: o.customer?.id ?? '', customerName: customerNameOf(o.customer ?? undefined),
      branch: f.branch, method: p.method, payment: methods.find((m) => m.code === p.method)?.name ?? p.method,
      bank: bank(p.method), ...(p.kind === 'qr' && o.qr?.paymentRef ? { paymentRef: o.qr.paymentRef } : {}),
      reason: collectionReason(p.kind), note: 'Thanh toán ngay', type: 'Phiếu thu tiền khách hàng',
      // Người thu = thu ngân lập đơn (Q2).
      createdBy: o.cashier_name ?? '', createdById: o.created_by ?? '',
    })));
  const byMethod = new Map<string, number>();
  for (const r of all) byMethod.set(r.method, (byMethod.get(r.method) ?? 0) + r.paid);
  return {
    items: all.slice((f.page - 1) * f.pageSize, f.page * f.pageSize),
    meta: {
      page: f.page, pageSize: f.pageSize, total: all.length,
      sums: {
        paid: all.reduce((s, r) => s + r.paid, 0),
        byMethod: [...byMethod].map(([method, amount]) => ({ method, name: methods.find((m) => m.code === method)?.name ?? method, amount })).sort((a, b) => b.amount - a.amount),
      },
    },
  };
}

