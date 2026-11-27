// [2026-11-25 09:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-039: nháp chính sách tích điểm (lập / sửa / gửi duyệt / duyệt = phát hành / từ chối), nhật ký (đóng góp)
/**
 * Nháp chính sách tích điểm theo cửa hàng (phiếu NT-BH-039), chép mẫu nháp → duyệt của khuyến mại (module pos, NT-BH-025) — không import
 * chéo module. Bảng mod_loyalty.program_drafts / approval_log. Phát hành = thêm dòng mod_loyalty.programs (phiên bản = băm nội dung,
 * received_by = người duyệt); bộ tính vẫn dùng bản mới nhất theo received_at như trước.
 */
import { randomUUID } from 'node:crypto';
import { Errors, sql, type ActionContext } from '@bizcity/module-sdk';
import { DEFAULT_CONTENT, checkProgram, contentOf, contentVersion, giftSkus, mergePolicies, type ProgramContent } from './domain/program-draft.js';
import { branchExists, latestProgram, type Tx } from './store.js';

export type DraftStatus = 'draft' | 'pending' | 'published' | 'rejected';

export const REASONS = {
  /** Người khác vừa sửa nháp (Q-CHUNG-03). */
  changed: 'LOYALTY_DRAFT_CHANGED',
  /** Trạng thái không cho thao tác (đã phát hành / đang mở nháp khác…). */
  state: 'LOYALTY_DRAFT_STATE',
  /** Cửa hàng đã có nháp đang mở. */
  open: 'LOYALTY_DRAFT_OPEN',
  /** Website đẩy chính sách khi cửa hàng đã có bản kế toán phát hành (Q4 — chỉ nhận chính sách khai ở kế toán). */
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
export async function openProgramDrafts(tx: Tx, ctx: ActionContext, i: { branchCodes: string[]; program?: ProgramContent | undefined; submit?: boolean }) {
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
    const content = i.program ? mergePolicies(base.content, i.program) : (base.content ?? DEFAULT_CONTENT);
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
 * không phải bản đang chạy → thêm đuôi mã nháp để bản này thành mới nhất), received_by = người duyệt. Người có quyền duyệt tự duyệt được (NT-BH-059).
 */
export async function approveDrafts(tx: Tx, ctx: ActionContext, ids: string[], note?: string) {
  const out: Draft[] = [];
  for (const id of [...new Set(ids)]) {
    const r = await getRow(tx, id, true);
    if (r.status !== 'pending') throw Errors.conflict(`Nháp cửa hàng ${r.branch_code} đang ở trạng thái "${r.status}" — chỉ duyệt nháp đã gửi duyệt`, { reason: REASONS.state, status: r.status, id });
    // [2026-11-28 02:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-059: người có quyền duyệt tự lập tự duyệt chương trình (như khuyến mại, Hoàng 28/11) — bỏ chặn người lập (đóng góp)
    await lockKey(tx, `loyalty:program-draft:${r.branch_code}`);
    const base = await baseOf(tx, r.branch_code);
    await assertValid(tx, r.program, base.content, r.branch_code);
    await publishRow(tx, ctx, { id, branch: r.branch_code, storeId: Number(r.store_id), program: r.program, baseVersion: base.version, note });
    out.push(toDraft(await getRow(tx, id)));
  }
  return out;
}

/** Phát hành nội dung của một dòng nháp: thêm phiên bản programs (nếu khác bản đang chạy), đánh dấu nháp published, ghi nhật ký. */
async function publishRow(tx: Tx, ctx: ActionContext, r: { id: string; branch: string; storeId: number; program: ProgramContent; baseVersion: string | null; note?: string | undefined }) {
  let version = contentVersion(r.program, r.storeId);
  const exists = (await sql<{ v: string }>`SELECT version AS v FROM mod_loyalty.programs WHERE branch_code = ${r.branch} AND version = ${version}`.execute(tx)).rows[0];
  if (exists && r.baseVersion !== version) version = `${version}-${r.id.slice(0, 8)}`;
  const by = ctx.actor.name || ctx.actor.id;
  if (r.baseVersion !== version) {
    await sql`INSERT INTO mod_loyalty.programs (tenant_id, branch_code, version, store_id, program, received_by)
      VALUES (${ctx.tenant.id}, ${r.branch}, ${version}, ${r.storeId}, ${JSON.stringify({ ...r.program, version })}::jsonb, ${by})`.execute(tx);
  }
  await sql`UPDATE mod_loyalty.program_drafts SET status = 'published', published_version = ${version}, approved_by = ${ctx.actor.id},
      approved_by_name = ${ctx.actor.name || null}, approved_at = now(), updated_by = ${ctx.actor.id}, updated_by_name = ${ctx.actor.name || null}, updated_at = now()
    WHERE draft_id = ${r.id}::uuid`.execute(tx);
  await writeLog(tx, ctx, { type: 'program', id: r.id, branch: r.branch, action: 'approve', note: [`phát hành bản ${version}`, r.note].filter(Boolean).join(' · ') });
  return version;
}

/** Từ chối (kèm lý do) — người lập sửa rồi gửi lại. */
export async function rejectDrafts(tx: Tx, ctx: ActionContext, ids: string[], reason: string) {
  const out: Draft[] = [];
  for (const id of [...new Set(ids)]) {
    const r = await getRow(tx, id, true);
    if (r.status !== 'pending') throw Errors.conflict(`Nháp cửa hàng ${r.branch_code} đang ở trạng thái "${r.status}" — chỉ từ chối nháp đã gửi duyệt`, { reason: REASONS.state, status: r.status, id });
    await sql`UPDATE mod_loyalty.program_drafts SET status = 'rejected', reject_reason = ${reason}, updated_by = ${ctx.actor.id},
        updated_by_name = ${ctx.actor.name || null}, updated_at = now() WHERE draft_id = ${id}::uuid`.execute(tx);
    await writeLog(tx, ctx, { type: 'program', id, branch: r.branch_code, action: 'reject', note: reason });
    out.push(toDraft(await getRow(tx, id)));
  }
  return out;
}

/**
 * Lần phát hành gần nhất của kế toán cho cửa hàng (bất kỳ bản nào) — có thì chính sách cửa hàng chỉ khai ở kế toán, website không đẩy đè
 * được (Q4, chốt lại 25/11: "từ chối, chỉ nhận policy ở open-ketoan").
 */
export async function publishedByAccounting(tx: Tx, branch: string): Promise<{ at: Date; by: string; version: string } | null> {
  const r = (await sql<{ approved_at: Date; approved_by_name: string | null; approved_by: string; published_version: string }>`
    SELECT approved_at, approved_by_name, approved_by, published_version FROM mod_loyalty.program_drafts
     WHERE branch_code = ${branch} AND status = 'published' ORDER BY approved_at DESC LIMIT 1`.execute(tx)).rows[0];
  return r ? { at: r.approved_at, by: r.approved_by_name || r.approved_by, version: r.published_version } : null;
}

/** Chi nhánh của các nháp (branchOf — Core so phạm vi chi nhánh của người gọi trước khi chạy). */
export async function draftBranches(tx: Tx, ids: string[]): Promise<string[]> {
  const ok = ids.filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  if (!ok.length) return [];
  return (await sql<{ b: string }>`SELECT DISTINCT branch_code AS b FROM mod_loyalty.program_drafts WHERE draft_id IN (${sql.join(ok.map((x) => sql`${x}::uuid`))})`.execute(tx)).rows.map((r) => r.b);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// [2026-11-28 02:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-059: khai theo chương trình (một chương trình áp cho Tất cả / chọn cửa hàng) thay vì theo
// từng cửa hàng — máy chủ vẫn lưu nội dung theo cửa hàng (bộ tính, máy bán đọc chính sách của chi nhánh mình), nên phạm vi cửa hàng được áp
// đúng ở máy chủ và máy bán; đây là lớp gom / rải giữa màn khai và nháp từng cửa hàng (đóng góp)
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export type SaveMode = 'draft' | 'submit' | 'approve';
export type Target = { all: boolean; branchCodes: string[] };
type Pol = ProgramContent['policies'][number];

/** Cửa hàng đang dùng (bizcity_read.branches, chưa ngừng), theo mã. */
export async function activeBranches(tx: Tx): Promise<{ code: string; name: string }[]> {
  return (await sql<{ code: string; name: string | null }>`SELECT code, name FROM bizcity_read.branches WHERE is_active IS NOT FALSE ORDER BY code`.execute(tx)).rows
    .map((r) => ({ code: r.code, name: r.name ?? '' }));
}

/** Bản đang chạy mới nhất của mọi cửa hàng (một dòng / cửa hàng). */
async function latestAll(tx: Tx): Promise<Map<string, { version: string; content: ProgramContent }>> {
  const rows = (await sql<{ branch_code: string; version: string; program: ProgramContent & { version?: string } }>`
    SELECT DISTINCT ON (branch_code) branch_code, version, program FROM mod_loyalty.programs ORDER BY branch_code, received_at DESC`.execute(tx)).rows;
  return new Map(rows.map((r) => [r.branch_code, { version: r.version, content: contentOf(r.program) }]));
}

/** Nháp đang mở (nháp / chờ duyệt / bị từ chối) của mọi cửa hàng. */
async function openAll(tx: Tx): Promise<Map<string, DraftRow>> {
  const rows = (await sql<DraftRow>`SELECT ${COLS} FROM mod_loyalty.program_drafts WHERE status IN ('draft', 'pending', 'rejected')`.execute(tx)).rows;
  return new Map(rows.map((r) => [r.branch_code, r]));
}

const up = (s: string) => s.trim().toUpperCase();
const nowSec = () => Math.floor(Date.now() / 1000);
/** Chính sách đang áp lúc này: bật, đã tới ngày, chưa tới ngày ngừng. */
const isLive = (p: Pol, now: number) => p.status === 1 && (!p.startDate || p.startDate <= now) && (!p.endDate || p.endDate >= now);

export type PolicyState = 'draft' | 'pending' | 'rejected' | 'active' | 'scheduled' | 'stopped';
export type BranchUse = { branchCode: string; state: PolicyState; published: boolean };

/**
 * Tổng hợp cho màn khai: mỗi chương trình (gom theo mã) — nội dung mới nhất (nháp nếu có, không thì bản đang chạy), cửa hàng đang có và
 * trạng thái từng nơi; cài đặt + hạng từng cửa hàng; số nháp chờ duyệt.
 */
export async function overview(tx: Tx) {
  const branches = await activeBranches(tx);
  const live = await latestAll(tx);
  const open = await openAll(tx);
  const now = nowSec();
  const byCode = new Map<string, { policy: Pol; fromDraft: boolean; uses: BranchUse[] }>();
  const codes = new Set([...live.keys(), ...open.keys()]);
  for (const b of [...codes].sort()) {
    const pub = live.get(b)?.content.policies ?? [];
    const dr = open.get(b);
    const pubCodes = new Set(pub.map((p) => up(p.code)));
    const list: { p: Pol; draft: boolean }[] = dr ? dr.program.policies.map((p) => ({ p, draft: true })) : pub.map((p) => ({ p, draft: false }));
    for (const { p, draft } of list) {
      const k = up(p.code);
      if (!k) continue;
      const same = JSON.stringify(pub.find((x) => up(x.code) === k)) === JSON.stringify(p);
      const changed = Boolean(draft && dr && !(dr.status === 'draft' && same) && !same);
      const pendingHere = Boolean(draft && dr && dr.status !== 'draft' && !same);
      const state: PolicyState = changed || pendingHere
        ? (dr!.status === 'pending' ? 'pending' : dr!.status === 'rejected' ? 'rejected' : 'draft')
        : isLive(p, now) ? 'active' : p.status === 1 && p.startDate > now ? 'scheduled' : 'stopped';
      const cur = byCode.get(k);
      const use: BranchUse = { branchCode: b, state, published: pubCodes.has(k) };
      if (!cur) byCode.set(k, { policy: p, fromDraft: draft && !same, uses: [use] });
      else { cur.uses.push(use); if (draft && !same && !cur.fromDraft) { cur.policy = p; cur.fromDraft = true; } }
    }
  }
  const rank: PolicyState[] = ['pending', 'rejected', 'draft', 'active', 'scheduled', 'stopped'];
  const activeCodes = new Set(branches.map((b) => b.code));
  const policies = [...byCode.values()].map(({ policy, uses }) => {
    const on = uses.filter((u) => u.state !== 'stopped');
    return {
      ...policy, uses,
      state: rank.find((s) => uses.some((u) => u.state === s)) ?? 'stopped',
      allBranches: activeCodes.size > 0 && [...activeCodes].every((c) => on.some((u) => u.branchCode === c)),
    };
  }).sort((a, b) => a.type - b.type || a.code.localeCompare(b.code));
  const settings = [...codes].sort().map((b) => {
    const dr = open.get(b);
    const c = dr ? dr.program : live.get(b)?.content;
    return { branchCode: b, settings: c?.settings ?? null, tiers: c?.tiers ?? [], version: live.get(b)?.version ?? null, draftStatus: dr?.status ?? null };
  });
  const pending = [...open.values()].filter((d) => d.status === 'pending').length;
  return { branches, policies, settings, pending };
}

/** Thay / thêm một chính sách theo mã vào nội dung (giữ số thứ tự nếu đã có, cấp số mới nếu trùng chính sách khác). */
function putPolicy(c: ProgramContent, p: Pol): ProgramContent {
  return mergePolicies(c, { settings: c.settings, tiers: c.tiers, policies: [{ ...p, applyToBlogIds: [] }] });
}

/** Bỏ chương trình khỏi một cửa hàng: đã phát hành ở đó → ngừng (không xoá — Q-DM-01); mới có ở nháp → bỏ khỏi nháp. */
function stopPolicy(c: ProgramContent, code: string, published: boolean): ProgramContent {
  if (!published) return { ...c, policies: c.policies.filter((x) => up(x.code) !== code) };
  const stopAt = nowSec() - 1;
  return { ...c, policies: c.policies.map((x) => (up(x.code) === code ? { ...x, status: 0, endDate: x.endDate && x.endDate < stopAt ? x.endDate : stopAt } : x)) };
}

/**
 * Lưu một chương trình (hoặc cài đặt + hạng) cho Tất cả / các cửa hàng chọn, theo một lần bấm:
 *   - mỗi cửa hàng nhận: có nháp đang mở thì gộp vào nháp đó (giữ thay đổi khác của nháp), không thì lập nháp chép bản đang chạy rồi gộp;
 *   - chương trình: cửa hàng KHÔNG còn trong phạm vi mà đang có mã này → ngừng ở đó (đã phát hành) / bỏ khỏi nháp (chưa phát hành);
 *   - mode draft = lưu nháp; submit = gửi duyệt; approve = gửi + duyệt phát hành ngay (người có quyền duyệt — tự lập tự duyệt, Hoàng 28/11).
 * Tất cả = mọi cửa hàng đang dùng lúc lưu (cửa hàng mở sau thì áp lại chương trình cho cửa hàng đó).
 */
export async function saveAcross(tx: Tx, ctx: ActionContext, i: {
  policy?: Pol | undefined; config?: { settings: ProgramContent['settings']; tiers: ProgramContent['tiers'] } | undefined; target: Target; mode: SaveMode;
}) {
  const block = (field: string, title: string, code = 'LOYALTY_FIELD_REQUIRED') => Errors.validation(title, { findings: [{ code, field, title, level: 'block' }] });
  if (!i.policy === !i.config) throw block('policy', 'Gửi một chương trình hoặc một bộ cài đặt + hạng');
  if (i.mode === 'approve' && !ctx.can('loyalty:chinh-sach-duyet')) throw Errors.forbidden('Cần quyền Duyệt chính sách tích điểm để phát hành ngay — bấm Gửi duyệt');
  const all = await activeBranches(tx);
  const known = new Set(all.map((b) => b.code));
  const targets = i.target.all ? [...known] : [...new Set(i.target.branchCodes)];
  const unknown = targets.filter((b) => !known.has(b));
  if (unknown.length) throw block('target', `Chưa có cửa hàng ${unknown.join(', ')} ở danh mục chi nhánh`, 'LOYALTY_BRANCH_UNKNOWN');
  if (!targets.length) throw block('target', 'Chọn ít nhất một cửa hàng áp dụng (hoặc Tất cả cửa hàng)');

  const live = await latestAll(tx);
  const open = await openAll(tx);
  const code = i.policy ? up(i.policy.code) : '';
  if (i.policy && !code) throw block('policies.0.code', 'Nhập mã chương trình');
  const holders = new Set<string>();
  if (i.policy) {
    for (const [b, v] of live) if (v.content.policies.some((p) => up(p.code) === code)) holders.add(b);
    for (const [b, d] of open) if (d.program.policies.some((p) => up(p.code) === code)) holders.add(b);
  }
  const stops = [...holders].filter((b) => !targets.includes(b));
  const touched = [...new Set([...targets, ...stops])].sort();
  for (const b of touched) await lockKey(tx, `loyalty:program-draft:${b}`);

  const batch = touched.length > 1 ? randomUUID() : null;
  const approve = i.mode === 'approve';
  const status: DraftStatus = i.mode === 'draft' ? 'draft' : 'pending';
  const note = i.policy ? `chương trình ${i.policy.code}` : 'cài đặt + hạng';
  const apply = (c: ProgramContent, b: string, live: ProgramContent | null): ProgramContent => (i.config ? { ...c, settings: i.config.settings, tiers: i.config.tiers }
    : targets.includes(b) ? putPolicy(c, i.policy!) : stopPolicy(c, code, Boolean(live?.policies.some((p) => up(p.code) === code))));
  type Plan = { b: string; base: Awaited<ReturnType<typeof baseOf>>; row: DraftRow | undefined; next: ProgramContent; draftNext: ProgramContent | null };
  const plans: Plan[] = [];
  const problems: { branch: string; title: string; field: string; code: string }[] = [];
  for (const b of touched) {
    const base = await baseOf(tx, b);
    const row = (await sql<DraftRow>`SELECT ${COLS} FROM mod_loyalty.program_drafts WHERE branch_code = ${b} AND status IN ('draft', 'pending', 'rejected') FOR UPDATE`.execute(tx)).rows[0];
    // Duyệt ngay: phát hành BẢN ĐANG CHẠY + đúng thay đổi này — thay đổi khác còn ở nháp của cửa hàng không bị phát hành theo (chúng vẫn chờ
    // gửi / duyệt riêng); nháp đang mở được gộp thêm thay đổi này để lần duyệt sau không làm mất nó.
    const start: ProgramContent = approve ? (base.content ?? row?.program ?? DEFAULT_CONTENT) : row ? row.program : (base.content ?? DEFAULT_CONTENT);
    const next = apply(start, b, base.content);
    const draftNext = approve && row ? apply(row.program, b, base.content) : null;
    // Không đổi gì ở cửa hàng (vd đã ngừng sẵn) → không lập nháp / phiên bản thừa.
    if (JSON.stringify(next) === JSON.stringify(start) && (!row || approve)) {
      if (draftNext && JSON.stringify(draftNext) !== JSON.stringify(row!.program)) plans.push({ b, base, row, next: start, draftNext });
      continue;
    }
    const findings = i.mode === 'draft'
      ? checkProgram(next, base.content).filter((x) => x.code === 'LOYALTY_POLICY_CODE_DUP' || x.code === 'LOYALTY_POLICY_REMOVED')
      : checkProgram(next, base.content, await activeSkus(tx, giftSkus(next)));
    // Lỗi của chính chương trình đang lưu chỉ ra một lần (cùng nội dung ở mọi cửa hàng) — đường dẫn ô đổi về policies.0.* của form.
    const idx = next.policies.findIndex((p) => up(p.code) === code);
    for (const x of findings) {
      const field = i.policy && idx >= 0 && x.field.startsWith(`policies.${idx}.`) ? x.field.replace(`policies.${idx}.`, 'policies.0.') : x.field;
      if (!problems.some((y) => y.field === field && y.title === x.title)) problems.push({ branch: b, title: x.title, field, code: x.code });
    }
    plans.push({ b, base, row, next, draftNext });
  }
  if (problems.length) {
    throw Errors.validation(`Còn ${problems.length} chỗ chưa đúng: ${problems[0]!.title}${problems.length > 1 ? '…' : ''}`,
      { findings: problems.map((p) => ({ code: p.code, field: p.field, title: `${p.title}${touched.length > 1 ? ` (cửa hàng ${p.branch})` : ''}`, level: 'block' })) });
  }
  const items: Draft[] = [];
  for (const { b, base, row, next, draftNext } of plans) {
    if (approve) {
      if (row && draftNext) {
        await sql`UPDATE mod_loyalty.program_drafts SET program = ${JSON.stringify(draftNext)}::jsonb, revision = revision + 1,
            updated_by = ${ctx.actor.id}, updated_by_name = ${ctx.actor.name || null}, updated_at = now() WHERE draft_id = ${row.draft_id}::uuid`.execute(tx);
        await writeLog(tx, ctx, { type: 'program', id: row.draft_id, branch: b, action: 'update', note: `gộp ${note} vừa duyệt phát hành` });
      }
      const start = base.content ?? row?.program ?? DEFAULT_CONTENT;
      if (JSON.stringify(next) === JSON.stringify(start) && base.content) continue;
      const id = randomUUID();
      await sql`INSERT INTO mod_loyalty.program_drafts (draft_id, tenant_id, branch_code, store_id, program, base_version, batch_id, status,
          created_by, created_by_name, updated_by, updated_by_name)
        VALUES (${id}::uuid, ${ctx.tenant.id}, ${b}, ${base.storeId}, ${JSON.stringify(next)}::jsonb, ${base.version}, ${batch}::uuid, 'published',
          ${ctx.actor.id}, ${ctx.actor.name || null}, ${ctx.actor.id}, ${ctx.actor.name || null})`.execute(tx);
      await writeLog(tx, ctx, { type: 'program', id, branch: b, action: 'create', note: `${note} — lập và duyệt ngay` });
      await publishRow(tx, ctx, { id, branch: b, storeId: base.storeId, program: next, baseVersion: base.version });
      items.push(toDraft(await getRow(tx, id)));
    } else if (row) {
      await sql`UPDATE mod_loyalty.program_drafts SET program = ${JSON.stringify(next)}::jsonb, status = ${status}, revision = revision + 1, reject_reason = NULL,
          updated_by = ${ctx.actor.id}, updated_by_name = ${ctx.actor.name || null}, updated_at = now() WHERE draft_id = ${row.draft_id}::uuid`.execute(tx);
      await writeLog(tx, ctx, { type: 'program', id: row.draft_id, branch: b, action: i.mode === 'draft' ? 'update' : 'submit', note });
      items.push(toDraft(await getRow(tx, row.draft_id)));
    } else {
      const id = randomUUID();
      await sql`INSERT INTO mod_loyalty.program_drafts (draft_id, tenant_id, branch_code, store_id, program, base_version, batch_id, status,
          created_by, created_by_name, updated_by, updated_by_name)
        VALUES (${id}::uuid, ${ctx.tenant.id}, ${b}, ${base.storeId}, ${JSON.stringify(next)}::jsonb, ${base.version}, ${batch}::uuid, ${status},
          ${ctx.actor.id}, ${ctx.actor.name || null}, ${ctx.actor.id}, ${ctx.actor.name || null})`.execute(tx);
      await writeLog(tx, ctx, { type: 'program', id, branch: b, action: 'create', note });
      if (status === 'pending') await writeLog(tx, ctx, { type: 'program', id, branch: b, action: 'submit' });
      items.push(toDraft(await getRow(tx, id)));
    }
  }
  return { items, targets, stopped: stops, published: i.mode === 'approve' };
}
