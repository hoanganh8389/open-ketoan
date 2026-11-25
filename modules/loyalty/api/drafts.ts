// [2026-11-25 09:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-039: nháp chính sách tích điểm (lập / sửa / gửi duyệt / duyệt = phát hành / từ chối), nhật ký (đóng góp)
/**
 * Nháp chính sách tích điểm theo cửa hàng (phiếu NT-BH-039), chép mẫu nháp → duyệt của khuyến mại (module pos, NT-BH-025) — không import
 * chéo module. Bảng mod_loyalty.program_drafts / approval_log. Phát hành = thêm dòng mod_loyalty.programs (phiên bản = băm nội dung,
 * received_by = người duyệt); bộ tính vẫn dùng bản mới nhất theo received_at như trước.
 */
import { randomUUID } from 'node:crypto';
import { Errors, sql, type ActionContext } from '@bizcity/module-sdk';
import { DEFAULT_CONTENT, checkProgram, contentOf, contentVersion, giftSkus, mergeInto, type ProgramContent } from './domain/program-draft.js';
import { branchExists, latestProgram, type Tx } from './store.js';

export type DraftStatus = 'draft' | 'pending' | 'published' | 'rejected';

export const REASONS = {
  /** Người khác vừa sửa nháp (Q-CHUNG-03). */
  changed: 'LOYALTY_DRAFT_CHANGED',
  /** Trạng thái không cho thao tác (đã phát hành / đang mở nháp khác…). */
  state: 'LOYALTY_DRAFT_STATE',
  /** Cửa hàng đã có nháp đang mở. */
  open: 'LOYALTY_DRAFT_OPEN',
  /** Website đẩy bản cũ hơn bản kế toán đã phát hành (Q4). */
  older: 'LOYALTY_PROGRAM_OLDER',
} as const;

const lockKey = async (tx: Tx, key: string) => { await sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`.execute(tx); };

type DraftRow = {
  draft_id: string; branch_code: string; store_id: number; program: ProgramContent; base_version: string | null; batch_id: string | null; revision: number;
  status: DraftStatus; created_by: string; created_by_name: string | null; created_at: Date; updated_by: string; updated_by_name: string | null; updated_at: Date;
  approved_by: string | null; approved_by_name: string | null; approved_at: Date | null; reject_reason: string | null; published_version: string | null;
};
const COLS = sql`draft_id::text AS draft_id, branch_code, store_id, program, base_version, batch_id::text AS batch_id, revision, status, created_by, created_by_name,
  created_at, updated_by, updated_by_name, updated_at, approved_by, approved_by_name, approved_at, reject_reason, published_version`;

const toDraft = (r: DraftRow) => ({
  id: r.draft_id, branchCode: r.branch_code, storeId: Number(r.store_id), program: r.program, baseVersion: r.base_version, batchId: r.batch_id,
  revision: Number(r.revision), status: r.status, createdBy: r.created_by, createdByName: r.created_by_name ?? '', createdAt: r.created_at.toISOString(),
  updatedBy: r.updated_by, updatedByName: r.updated_by_name ?? '', updatedAt: r.updated_at.toISOString(),
  approvedBy: r.approved_by, approvedByName: r.approved_by_name ?? '', approvedAt: r.approved_at?.toISOString() ?? null,
  rejectReason: r.reject_reason ?? '', publishedVersion: r.published_version,
});
export type Draft = ReturnType<typeof toDraft>;

async function getRow(tx: Tx, id: string, lock = false): Promise<DraftRow> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw Errors.notFound(`nháp chính sách tích điểm ${id}`);
  const r = (await sql<DraftRow>`SELECT ${COLS} FROM mod_loyalty.program_drafts WHERE draft_id = ${id}::uuid ${lock ? sql`FOR UPDATE` : sql``}`.execute(tx)).rows[0];
  if (!r) throw Errors.notFound(`nháp chính sách tích điểm ${id}`);
  return r;
}

export async function writeLog(tx: Tx, ctx: ActionContext, o: { type: 'program' | 'adjustment'; id: string; branch: string | null; action: string; note?: string | undefined }) {
  await sql`INSERT INTO mod_loyalty.approval_log (tenant_id, object_type, object_id, branch_code, action, actor, actor_name, note)
    VALUES (${ctx.tenant.id}, ${o.type}, ${o.id}::uuid, ${o.branch}, ${o.action}, ${ctx.actor.id}, ${ctx.actor.name || null}, ${o.note ?? null})`.execute(tx);
}

export async function logOf(tx: Tx, type: 'program' | 'adjustment', id: string) {
  return (await sql<{ action: string; actor: string; actor_name: string | null; note: string | null; at: Date }>`
    SELECT action, actor, actor_name, note, at FROM mod_loyalty.approval_log WHERE object_type = ${type} AND object_id = ${id}::uuid ORDER BY at, id`.execute(tx)).rows
    .map((l) => ({ action: l.action, actor: l.actor, actorName: l.actor_name ?? '', note: l.note ?? '', at: l.at.toISOString() }));
}

export async function listDrafts(tx: Tx, f: { status?: string | undefined; branch?: string | undefined }) {
  const rows = (await sql<DraftRow>`SELECT ${COLS} FROM mod_loyalty.program_drafts
     WHERE true ${f.status ? sql`AND status = ${f.status}` : sql`AND status <> 'published'`} ${f.branch ? sql`AND branch_code = ${f.branch}` : sql``}
     ORDER BY updated_at DESC LIMIT 500`.execute(tx)).rows;
  return rows.map(toDraft);
}

export async function getDraft(tx: Tx, id: string) {
  const r = await getRow(tx, id);
  return { ...toDraft(r), log: await logOf(tx, 'program', id) };
}

/** Mã hàng đang dùng (bizcity_read.products, is_active) trong danh sách. */
async function activeSkus(tx: Tx, skus: string[]): Promise<Set<string>> {
  if (!skus.length) return new Set();
  return new Set((await sql<{ sku: string }>`SELECT sku FROM bizcity_read.products WHERE sku IN (${sql.join(skus)}) AND is_active`.execute(tx)).rows.map((r) => r.sku));
}

/** Kiểm nội dung; có lỗi → VALIDATION_ERROR kèm mọi lỗi (details.findings → error.fields). */
async function assertValid(tx: Tx, p: ProgramContent, base: ProgramContent | null, branch: string) {
  const findings = checkProgram(p, base, await activeSkus(tx, giftSkus(p)));
  if (findings.length) throw Errors.validation(`Chính sách cửa hàng ${branch} còn ${findings.length} chỗ chưa đúng: ${findings[0]!.title}${findings.length > 1 ? '…' : ''}`, { findings: findings.map((x) => ({ ...x, level: 'block' })) });
}

/** Bản đang chạy của cửa hàng (nội dung, không version). */
async function baseOf(tx: Tx, branch: string): Promise<{ content: ProgramContent | null; version: string | null; storeId: number }> {
  const cur = await latestProgram(tx, branch);
  return cur ? { content: contentOf(cur.program), version: cur.version, storeId: cur.storeId } : { content: null, version: null, storeId: 0 };
}

/**
 * Lập nháp cho một hoặc nhiều cửa hàng. Không gửi nội dung → mỗi cửa hàng chép bản đang chạy của chính nó ("Sửa từ bản hiện hành", Q3).
 * Có nội dung → gộp chính sách theo mã vào bản đang chạy của từng cửa hàng (áp nhiều cửa hàng một lần). Cửa hàng đã có nháp đang mở → chặn.
 */
export async function createDrafts(tx: Tx, ctx: ActionContext, i: { branchCodes: string[]; program?: ProgramContent | undefined; submit?: boolean }) {
  const branches = [...new Set(i.branchCodes)].sort();
  for (const b of branches) await lockKey(tx, `loyalty:program-draft:${b}`);
  const unknown: string[] = [];
  for (const b of branches) if (!(await branchExists(tx, b))) unknown.push(b);
  if (unknown.length) throw Errors.validation(`Chưa có chi nhánh ${unknown.join(', ')} ở danh mục chi nhánh`, { findings: [{ code: 'LOYALTY_BRANCH_UNKNOWN', field: 'branchCodes', title: `Chi nhánh ${unknown.join(', ')} không có`, level: 'block' }] });
  const open = (await sql<{ branch_code: string; draft_id: string; status: string }>`
    SELECT branch_code, draft_id::text AS draft_id, status FROM mod_loyalty.program_drafts
     WHERE branch_code IN (${sql.join(branches)}) AND status IN ('draft', 'pending', 'rejected')`.execute(tx)).rows;
  if (open.length) {
    throw Errors.conflict(`Cửa hàng ${open.map((o) => o.branch_code).join(', ')} đang có nháp chưa duyệt — sửa nháp đó thay vì lập nháp mới`,
      { reason: REASONS.open, drafts: open.map((o) => ({ branchCode: o.branch_code, id: o.draft_id, status: o.status })) });
  }
  const batch = branches.length > 1 ? randomUUID() : null;
  const status: DraftStatus = i.submit ? 'pending' : 'draft';
  const out: Draft[] = [];
  for (const b of branches) {
    const base = await baseOf(tx, b);
    const content = i.program ? mergeInto(base.content, i.program) : (base.content ?? DEFAULT_CONTENT);
    if (i.program || i.submit) await assertValid(tx, content, base.content, b);
    const id = randomUUID();
    await sql`INSERT INTO mod_loyalty.program_drafts (draft_id, tenant_id, branch_code, store_id, program, base_version, batch_id, status,
        created_by, created_by_name, updated_by, updated_by_name)
      VALUES (${id}::uuid, ${ctx.tenant.id}, ${b}, ${base.storeId}, ${JSON.stringify(content)}::jsonb, ${base.version}, ${batch}::uuid, ${status},
        ${ctx.actor.id}, ${ctx.actor.name || null}, ${ctx.actor.id}, ${ctx.actor.name || null})`.execute(tx);
    await writeLog(tx, ctx, { type: 'program', id, branch: b, action: 'create', note: base.version ? `chép từ bản ${base.version}` : 'cửa hàng chưa có chính sách' });
    if (i.submit) await writeLog(tx, ctx, { type: 'program', id, branch: b, action: 'submit' });
    out.push(toDraft(await getRow(tx, id)));
  }
  return out;
}

const vnTime = (d: Date) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }).format(d);

/** Sửa nháp (nháp / chờ duyệt / bị từ chối). `revision` lệch = người khác vừa lưu → chặn (Q-CHUNG-03). `submit` = gửi duyệt. */
export async function saveDraft(tx: Tx, ctx: ActionContext, id: string, i: { program: ProgramContent; revision: number; submit?: boolean }) {
  const cur = await getRow(tx, id, true);
  if (!['draft', 'pending', 'rejected'].includes(cur.status)) {
    throw Errors.conflict(`Nháp cửa hàng ${cur.branch_code} đã phát hành — không sửa bản đã phát hành; bấm "Sửa từ bản hiện hành" để lập nháp mới`, { reason: REASONS.state, status: cur.status });
  }
  if (cur.revision !== i.revision) {
    throw Errors.conflict(`Nháp đã đổi lúc ${vnTime(cur.updated_at)} bởi ${cur.updated_by_name || cur.updated_by} — tải lại rồi sửa tiếp`, { reason: REASONS.changed, revision: cur.revision });
  }
  const base = await baseOf(tx, cur.branch_code);
  if (i.submit) await assertValid(tx, i.program, base.content, cur.branch_code);
  else {
    // Lưu nháp: vẫn chặn trùng mã / bỏ chính sách đã phát hành; ô còn trống cho lưu (gửi duyệt mới đòi đủ).
    const hard = checkProgram(i.program, base.content).filter((x) => x.code === 'LOYALTY_POLICY_CODE_DUP' || x.code === 'LOYALTY_POLICY_REMOVED');
    if (hard.length) throw Errors.validation(hard[0]!.title, { findings: hard.map((x) => ({ ...x, level: 'block' })) });
  }
  const status: DraftStatus = i.submit ? 'pending' : 'draft';
  await sql`UPDATE mod_loyalty.program_drafts SET program = ${JSON.stringify(i.program)}::jsonb, status = ${status}, revision = revision + 1,
      updated_by = ${ctx.actor.id}, updated_by_name = ${ctx.actor.name || null}, updated_at = now() WHERE draft_id = ${id}::uuid`.execute(tx);
  await writeLog(tx, ctx, { type: 'program', id, branch: cur.branch_code, action: i.submit ? 'submit' : 'update' });
  return toDraft(await getRow(tx, id));
}

/**
 * Duyệt một hoặc nhiều nháp (cùng lúc, case 8) = phát hành: thêm dòng programs (phiên bản = băm nội dung; trùng phiên bản cũ của cửa hàng mà
 * không phải bản đang chạy → thêm đuôi mã nháp để bản này thành mới nhất), received_by = người duyệt. Người lập không tự duyệt.
 */
export async function approveDrafts(tx: Tx, ctx: ActionContext, ids: string[], note?: string) {
  const out: Draft[] = [];
  for (const id of [...new Set(ids)]) {
    const r = await getRow(tx, id, true);
    if (r.status !== 'pending') throw Errors.conflict(`Nháp cửa hàng ${r.branch_code} đang ở trạng thái "${r.status}" — chỉ duyệt nháp đã gửi duyệt`, { reason: REASONS.state, status: r.status, id });
    if (r.created_by === ctx.actor.id) throw Errors.forbidden(`Người lập nháp chính sách cửa hàng ${r.branch_code} không tự duyệt — nhờ người có quyền Duyệt chính sách tích điểm khác duyệt`);
    await lockKey(tx, `loyalty:program-draft:${r.branch_code}`);
    const base = await baseOf(tx, r.branch_code);
    await assertValid(tx, r.program, base.content, r.branch_code);
    let version = contentVersion(r.program, Number(r.store_id));
    const exists = (await sql<{ v: string }>`SELECT version AS v FROM mod_loyalty.programs WHERE branch_code = ${r.branch_code} AND version = ${version}`.execute(tx)).rows[0];
    if (exists && base.version !== version) version = `${version}-${id.slice(0, 8)}`;
    const by = ctx.actor.name || ctx.actor.id;
    if (base.version !== version) {
      await sql`INSERT INTO mod_loyalty.programs (tenant_id, branch_code, version, store_id, program, received_by)
        VALUES (${ctx.tenant.id}, ${r.branch_code}, ${version}, ${Number(r.store_id)}, ${JSON.stringify({ ...r.program, version })}::jsonb, ${by})`.execute(tx);
    }
    await sql`UPDATE mod_loyalty.program_drafts SET status = 'published', published_version = ${version}, approved_by = ${ctx.actor.id},
        approved_by_name = ${ctx.actor.name || null}, approved_at = now(), updated_by = ${ctx.actor.id}, updated_by_name = ${ctx.actor.name || null}, updated_at = now()
      WHERE draft_id = ${id}::uuid`.execute(tx);
    await writeLog(tx, ctx, { type: 'program', id, branch: r.branch_code, action: 'approve', note: [`phát hành bản ${version}`, note].filter(Boolean).join(' · ') });
    out.push(toDraft(await getRow(tx, id)));
  }
  return out;
}

/** Từ chối (kèm lý do) — người lập sửa rồi gửi lại. Người lập không tự từ chối. */
export async function rejectDrafts(tx: Tx, ctx: ActionContext, ids: string[], reason: string) {
  const out: Draft[] = [];
  for (const id of [...new Set(ids)]) {
    const r = await getRow(tx, id, true);
    if (r.status !== 'pending') throw Errors.conflict(`Nháp cửa hàng ${r.branch_code} đang ở trạng thái "${r.status}" — chỉ từ chối nháp đã gửi duyệt`, { reason: REASONS.state, status: r.status, id });
    if (r.created_by === ctx.actor.id) throw Errors.forbidden(`Người lập nháp chính sách cửa hàng ${r.branch_code} không tự từ chối / duyệt`);
    await sql`UPDATE mod_loyalty.program_drafts SET status = 'rejected', reject_reason = ${reason}, updated_by = ${ctx.actor.id},
        updated_by_name = ${ctx.actor.name || null}, updated_at = now() WHERE draft_id = ${id}::uuid`.execute(tx);
    await writeLog(tx, ctx, { type: 'program', id, branch: r.branch_code, action: 'reject', note: reason });
    out.push(toDraft(await getRow(tx, id)));
  }
  return out;
}

/** Bản đang chạy của cửa hàng do kế toán phát hành (nháp đã phát hành có đúng phiên bản đó) — để chặn website đẩy bản cũ hơn (Q4). */
export async function publishedByAccounting(tx: Tx, branch: string, version: string): Promise<{ at: Date; by: string } | null> {
  const r = (await sql<{ approved_at: Date; approved_by_name: string | null; approved_by: string }>`
    SELECT approved_at, approved_by_name, approved_by FROM mod_loyalty.program_drafts
     WHERE branch_code = ${branch} AND status = 'published' AND published_version = ${version} ORDER BY approved_at DESC LIMIT 1`.execute(tx)).rows[0];
  return r ? { at: r.approved_at, by: r.approved_by_name || r.approved_by } : null;
}

/** Chi nhánh của các nháp (branchOf — Core so phạm vi chi nhánh của người gọi trước khi chạy). */
export async function draftBranches(tx: Tx, ids: string[]): Promise<string[]> {
  const ok = ids.filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  if (!ok.length) return [];
  return (await sql<{ b: string }>`SELECT DISTINCT branch_code AS b FROM mod_loyalty.program_drafts WHERE draft_id IN (${sql.join(ok.map((x) => sql`${x}::uuid`))})`.execute(tx)).rows.map((r) => r.b);
}
