// [2026-11-25 09:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-039: điều chỉnh điểm tay có duyệt (lập → người khác duyệt → dòng adjust ở sổ điểm) (đóng góp)
/**
 * Điều chỉnh điểm tay (phiếu NT-BH-039 L4, Q-CD-3): yêu cầu cộng / trừ, bắt buộc lý do → người KHÁC có quyền duyệt → một dòng `adjust` ở
 * sổ điểm (ref manual = mã yêu cầu). Không trần (Q2). Trừ quá số điểm dùng được → chặn (không để số dư âm), kiểm cả lúc lập và lúc duyệt.
 * Cộng = lô không hết hạn; trừ = phân bổ theo lô hết hạn sớm nhất trước (như đổi điểm).
 */
import { randomUUID } from 'node:crypto';
import { Errors, sql, type ActionContext } from '@bizcity/module-sdk';
import { availableOf, planDeduction } from './domain/ledger.js';
import { logOf, writeLog } from './drafts.js';
import { branchExists, entriesOf, insertEntry, lockCustomer, partnerExists, type Tx } from './store.js';

export const ADJUST_REASONS = {
  /** Trừ quá số điểm dùng được của khách. */
  overBalance: 'LOYALTY_ADJUST_OVER_BALANCE',
  /** Yêu cầu không còn chờ duyệt. */
  state: 'LOYALTY_ADJUST_STATE',
} as const;

type Row = {
  adjustment_id: string; code: string; partner_code: string; points: string; reason: string; branch_code: string | null; status: 'pending' | 'approved' | 'rejected';
  created_by: string; created_by_name: string | null; created_at: Date; approved_by: string | null; approved_by_name: string | null; approved_at: Date | null;
  reject_reason: string | null; entry_id: string | null;
};
const COLS = sql`adjustment_id::text AS adjustment_id, code, partner_code, points, reason, branch_code, status, created_by, created_by_name, created_at,
  approved_by, approved_by_name, approved_at, reject_reason, entry_id::text AS entry_id`;
const toAdj = (r: Row) => ({
  id: r.adjustment_id, code: r.code, customerCode: r.partner_code, points: Number(r.points), reason: r.reason, branchCode: r.branch_code, status: r.status,
  createdBy: r.created_by, createdByName: r.created_by_name ?? '', createdAt: r.created_at.toISOString(),
  approvedBy: r.approved_by, approvedByName: r.approved_by_name ?? '', approvedAt: r.approved_at?.toISOString() ?? null,
  rejectReason: r.reject_reason ?? '', entryId: r.entry_id,
});

async function getRow(tx: Tx, id: string, lock = false): Promise<Row> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw Errors.notFound(`yêu cầu điều chỉnh điểm ${id}`);
  const r = (await sql<Row>`SELECT ${COLS} FROM mod_loyalty.adjustments WHERE adjustment_id = ${id}::uuid ${lock ? sql`FOR UPDATE` : sql``}`.execute(tx)).rows[0];
  if (!r) throw Errors.notFound(`yêu cầu điều chỉnh điểm ${id}`);
  return r;
}

export async function listAdjustments(tx: Tx, f: { status?: string | undefined; customer?: string | undefined }) {
  return (await sql<Row>`SELECT ${COLS} FROM mod_loyalty.adjustments WHERE true
      ${f.status ? sql`AND status = ${f.status}` : sql``} ${f.customer ? sql`AND partner_code = ${f.customer}` : sql``}
      ORDER BY created_at DESC LIMIT 500`.execute(tx)).rows.map(toAdj);
}

export async function getAdjustment(tx: Tx, id: string) {
  return { ...toAdj(await getRow(tx, id)), log: await logOf(tx, 'adjustment', id) };
}

const overMsg = (need: number, have: number, code: string) => `Không trừ quá số điểm khách đang có: cần trừ ${need}, khách ${code} chỉ còn ${have} điểm dùng được`;

/** Lập yêu cầu (chờ duyệt). Mọi lỗi nhập trả một lần, chỉ đúng ô. */
export async function createAdjustment(tx: Tx, ctx: ActionContext, i: { customerCode: string; points: number; reason: string; branchCode?: string | undefined }) {
  const findings: { code: string; field: string; title: string; level: 'block' }[] = [];
  const bad = (code: string, field: string, title: string) => findings.push({ code, field, title, level: 'block' });
  const customer = i.customerCode.trim();
  const reason = i.reason.trim();
  if (!customer) bad('LOYALTY_FIELD_REQUIRED', 'customerCode', 'Chọn khách cần điều chỉnh');
  if (!reason) bad('LOYALTY_FIELD_REQUIRED', 'reason', 'Ghi lý do điều chỉnh (bắt buộc)');
  if (!i.points) bad('LOYALTY_FIELD_REQUIRED', 'points', 'Số điểm điều chỉnh khác 0 (số âm = trừ)');
  if (i.branchCode && !(await branchExists(tx, i.branchCode))) bad('LOYALTY_BRANCH_UNKNOWN', 'branchCode', `Chi nhánh ${i.branchCode} không có ở danh mục`);
  let history: Awaited<ReturnType<typeof entriesOf>> = [];
  if (customer) {
    history = await entriesOf(tx, customer);
    if (!history.length && !(await partnerExists(tx, customer))) bad('LOYALTY_CUSTOMER_UNKNOWN', 'customerCode', `Khách ${customer} không có ở danh mục đối tượng và chưa có điểm`);
  }
  if (i.points < 0 && customer) {
    const have = availableOf(history, new Date().toISOString());
    if (-i.points > have) bad(ADJUST_REASONS.overBalance, 'points', overMsg(-i.points, have, customer));
  }
  if (findings.length) throw Errors.validation(findings[0]!.title, { findings });
  const id = randomUUID();
  const code = `DC-${id.slice(0, 8).toUpperCase()}`;
  await sql`INSERT INTO mod_loyalty.adjustments (adjustment_id, tenant_id, code, partner_code, points, reason, branch_code, created_by, created_by_name)
    VALUES (${id}::uuid, ${ctx.tenant.id}, ${code}, ${customer}, ${i.points}, ${reason}, ${i.branchCode ?? null}, ${ctx.actor.id}, ${ctx.actor.name || null})`.execute(tx);
  await writeLog(tx, ctx, { type: 'adjustment', id, branch: i.branchCode ?? null, action: 'create', note: `${i.points > 0 ? '+' : ''}${i.points} điểm · ${reason}` });
  return toAdj(await getRow(tx, id));
}

/** Duyệt: người khác người lập; ghi dòng adjust (cộng = lô không hạn; trừ = theo lô, không đủ → chặn). */
export async function approveAdjustment(tx: Tx, ctx: ActionContext, id: string, note?: string) {
  const r = await getRow(tx, id, true);
  if (r.status !== 'pending') throw Errors.conflict(`Yêu cầu ${r.code} đã ${r.status === 'approved' ? 'duyệt' : 'bị từ chối'} — không duyệt lại`, { reason: ADJUST_REASONS.state, status: r.status });
  if (r.created_by === ctx.actor.id) throw Errors.forbidden(`Người lập yêu cầu điều chỉnh ${r.code} không tự duyệt — nhờ người có quyền Duyệt điều chỉnh điểm khác duyệt`);
  await lockCustomer(tx, r.partner_code);
  const now = new Date().toISOString();
  const points = Number(r.points);
  const history = await entriesOf(tx, r.partner_code);
  let allocations: { lotId: string; points: number }[] | undefined;
  if (points < 0) {
    const plan = planDeduction(history, -points, now);
    if (!plan) throw Errors.conflict(overMsg(-points, availableOf(history, now), r.partner_code), { reason: ADJUST_REASONS.overBalance, available: availableOf(history, now) });
    allocations = plan;
  }
  const entryId = randomUUID();
  await insertEntry(tx, ctx.tenant.id, {
    id: entryId, partnerCode: r.partner_code, kind: 'adjust', points, at: now, expiresAt: null, ...(allocations ? { allocations } : {}),
    ref: { type: 'manual', id: r.adjustment_id, code: r.code }, ...(r.branch_code ? { branchCode: r.branch_code } : {}), note: r.reason,
    meta: { adjustment: r.code, createdBy: r.created_by_name || r.created_by, approvedBy: ctx.actor.name || ctx.actor.id },
  });
  await sql`UPDATE mod_loyalty.adjustments SET status = 'approved', approved_by = ${ctx.actor.id}, approved_by_name = ${ctx.actor.name || null}, approved_at = now(),
      entry_id = ${entryId}::uuid WHERE adjustment_id = ${id}::uuid`.execute(tx);
  await writeLog(tx, ctx, { type: 'adjustment', id, branch: r.branch_code, action: 'approve', note });
  return toAdj(await getRow(tx, id));
}

export async function rejectAdjustment(tx: Tx, ctx: ActionContext, id: string, reason: string) {
  const r = await getRow(tx, id, true);
  if (r.status !== 'pending') throw Errors.conflict(`Yêu cầu ${r.code} không còn chờ duyệt`, { reason: ADJUST_REASONS.state, status: r.status });
  if (r.created_by === ctx.actor.id) throw Errors.forbidden(`Người lập yêu cầu điều chỉnh ${r.code} không tự từ chối / duyệt`);
  await sql`UPDATE mod_loyalty.adjustments SET status = 'rejected', reject_reason = ${reason}, approved_by = ${ctx.actor.id}, approved_by_name = ${ctx.actor.name || null},
      approved_at = now() WHERE adjustment_id = ${id}::uuid`.execute(tx);
  await writeLog(tx, ctx, { type: 'adjustment', id, branch: r.branch_code, action: 'reject', note: reason });
  return toAdj(await getRow(tx, id));
}
