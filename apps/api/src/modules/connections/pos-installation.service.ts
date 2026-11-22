// @bizcity-layer A adapters/wordpress
// [2026-11-23 09:30 AM Johnny Chu - Chu Hoàng Anh] OKT-SET-1 — ADR-0037: khoá cài đặt open-pos — tạo / thu hồi, đăng ký blog + mã nối, nối blog vào tenant đang đứng, ping
/**
 * Khoá cài đặt open-pos (ADR-0037, luật tối thượng P-0 ý 2): một khoá cho cả mạng WordPress tự cài nhiều cửa hàng, mỗi blog một tenant.
 *   - Người của tenant chủ tạo / thu hồi khoá (khoá chỉ hiện một lần, lưu băm).
 *   - Bridge (khoá, không X-OKT-Blog) đăng ký blog → blog `pending` + mã nối một lần (8 ký tự, 24 giờ).
 *   - Kế toán đăng nhập tenant đích nhập mã nối → hàm CSDL pos_installation_link() nối blog vào ĐÚNG tenant đang đứng.
 * Không suy pháp nhân từ tenant (P-0 ý 3): ở đây chỉ chọn tenant kỹ thuật để ghi.
 */
import { randomBytes } from 'node:crypto';
import { sql } from 'kysely';
import { db, type Db } from '../../db/client.js';
import type { AuthContext } from '../../core/auth.js';
import { INSTALLATION_KEY_PREFIX } from '../../core/auth.js';
import { Errors } from '../../core/errors.js';
import { hashApiKey } from '@bizcity/platform/core/security/password';

type Tx = Db;
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
/** Mã nối dễ đọc: bỏ I, L, O, U (Crockford) — đọc qua điện thoại không nhầm. */
const LINK_CODE_LEN = 8;
const LINK_CODE_TTL_MS = 24 * 3600 * 1000;
/** Ping trễ quá mốc này → màn K-6 tô vàng (ADR-0037 §5). */
export const PING_STALE_MS = 15 * 60 * 1000;

function crockford(n: number): string {
  const b = randomBytes(n);
  let s = '';
  for (let i = 0; i < n; i++) s += CROCKFORD[b[i]! & 31];
  return s;
}
/** Mã bản cài `inst_` + 26 ký tự Crockford (khuôn ULID, ngẫu nhiên hoàn toàn — không lộ thời điểm tạo). */
const newInstallationCode = () => `inst_${crockford(26)}`;
/** Chuẩn hoá mã nối người nhập: bỏ khoảng trắng / gạch, in hoa, đổi I L → 1, O → 0 (Crockford). */
export function normalizeLinkCode(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
}
const hashLinkCode = (code: string) => hashApiKey(`okt-link:${normalizeLinkCode(code)}`);

function onlyUser(auth: AuthContext): void {
  if (auth.kind !== 'user') throw Errors.forbidden('Chỉ người dùng đăng nhập làm được việc này (ADR-0037), không dùng bằng khoá API');
}
function installationOf(auth: AuthContext): { id: string; code: string } {
  if (!auth.installation || auth.installation.blogId !== null) throw Errors.forbidden('Chỉ dùng bằng khoá cài đặt open-pos, không mang X-OKT-Blog');
  return auth.installation;
}

export interface BlogInput { blogId: number; name?: string; url?: string; renewLinkCode?: boolean }
export interface PingBlogInput { blogId: number; bridgeVersion?: string; queueGroups?: number; pendingDocs?: number; latencyMs?: number }

const blogView = (b: {
  blog_id: number; blog_name: string; blog_url: string; status: string; tenant_code: string | null; link_code_expires_at: Date | null;
  linked_at: Date | null; last_ping_at: Date | null; last_ping_ms: number | null; bridge_version: string; queue_groups: number | null; pending_docs: number | null;
}) => ({
  blogId: b.blog_id, name: b.blog_name, url: b.blog_url, status: b.status, tenantCode: b.tenant_code,
  linkCodeExpiresAt: b.link_code_expires_at, linkedAt: b.linked_at,
  lastPingAt: b.last_ping_at, lastPingMs: b.last_ping_ms, stale: !b.last_ping_at || Date.now() - b.last_ping_at.getTime() > PING_STALE_MS,
  bridgeVersion: b.bridge_version, queueGroups: b.queue_groups, pendingDocs: b.pending_docs,
});

async function blogsOf(q: Db, installationId: string) {
  const rows = await q.selectFrom('pos_installation_blogs as b')
    .leftJoin('tenants as t', 't.id', 'b.tenant_id')
    .select(['b.blog_id', 'b.blog_name', 'b.blog_url', 'b.status', 't.code as tenant_code', 'b.link_code_expires_at', 'b.linked_at',
      'b.last_ping_at', 'b.last_ping_ms', 'b.bridge_version', 'b.queue_groups', 'b.pending_docs'])
    .where('b.installation_id', '=', installationId).orderBy('b.blog_id').execute();
  return rows.map((r) => blogView({ ...r, tenant_code: r.tenant_code ?? null }));
}

export const posInstallationService = {
  // ── Người của tenant chủ ──────────────────────────────────────────────────────
  async create(tx: Tx, auth: AuthContext, input: { name: string; siteUrl?: string }) {
    onlyUser(auth);
    const key = `${INSTALLATION_KEY_PREFIX}${randomBytes(24).toString('base64url')}`;
    const row = await tx.insertInto('pos_installations').values({
      tenant_id: auth.tenantId, code: newInstallationCode(), name: input.name, site_url: input.siteUrl ?? '',
      key_prefix: key.slice(0, 10), key_hash: hashApiKey(key), created_by: auth.actor,
    }).returning(['id', 'code', 'name', 'site_url', 'key_prefix', 'scopes', 'created_at']).executeTakeFirstOrThrow();
    return { id: row.code, code: row.code, name: row.name, siteUrl: row.site_url, keyPrefix: row.key_prefix, scopes: row.scopes, createdAt: row.created_at,
      /** Chỉ hiện một lần. */ key };
  },

  async revoke(tx: Tx, auth: AuthContext, code: string) {
    onlyUser(auth);
    const row = await tx.updateTable('pos_installations').set({ status: 'revoked', revoked_by: auth.actor, revoked_at: new Date() })
      .where('code', '=', code).where('tenant_id', '=', auth.tenantId).where('status', '=', 'active')
      .returning(['code']).executeTakeFirst();
    if (!row) {
      const any = await tx.selectFrom('pos_installations').select('status').where('code', '=', code).where('tenant_id', '=', auth.tenantId).executeTakeFirst();
      if (!any) throw Errors.notFound('khoá cài đặt');
    }
    return { id: code, code, status: 'revoked' as const };
  },

  /** Bản cài của tenant này (chủ) + cửa hàng đã nối vào tenant này (từ bản cài của tenant khác). */
  async list(auth: AuthContext) {
    const insts = await db.selectFrom('pos_installations')
      .select(['id', 'code', 'name', 'site_url', 'key_prefix', 'status', 'created_at', 'revoked_at', 'last_seen_at'])
      .where('tenant_id', '=', auth.tenantId).orderBy('id').execute();
    const installations = [];
    for (const i of insts) {
      installations.push({ code: i.code, name: i.name, siteUrl: i.site_url, keyPrefix: i.key_prefix, status: i.status, createdAt: i.created_at,
        revokedAt: i.revoked_at, lastSeenAt: i.last_seen_at, blogs: await blogsOf(db, i.id) });
    }
    const linked = await db.selectFrom('pos_installation_blogs as b').innerJoin('pos_installations as i', 'i.id', 'b.installation_id')
      .select(['i.code', 'i.name', 'i.status as inst_status', 'b.blog_id', 'b.blog_name', 'b.blog_url', 'b.linked_at', 'b.linked_by', 'b.last_ping_at', 'b.last_ping_ms', 'b.bridge_version', 'b.pending_docs'])
      .where('b.tenant_id', '=', auth.tenantId).where('b.status', '=', 'active').execute();
    const direct = await db.selectFrom('pos_connections')
      .select(['blog_id', 'blog_name', 'blog_url', 'bridge_version', 'last_ping_at', 'last_ping_ms', 'queue_groups', 'pending_docs'])
      .where('tenant_id', '=', auth.tenantId).orderBy('blog_id').execute();
    return {
      installations,
      linkedHere: linked.map((l) => ({ installationCode: l.code, installationName: l.name, installationStatus: l.inst_status, blogId: l.blog_id, name: l.blog_name, url: l.blog_url,
        linkedAt: l.linked_at, linkedBy: l.linked_by, lastPingAt: l.last_ping_at, lastPingMs: l.last_ping_ms, bridgeVersion: l.bridge_version, pendingDocs: l.pending_docs,
        stale: !l.last_ping_at || Date.now() - l.last_ping_at.getTime() > PING_STALE_MS })),
      /** Khoá API thường (bizcity / một cửa hàng) báo ping về tenant này. */
      directKeys: direct.map((d) => ({ blogId: d.blog_id, name: d.blog_name, url: d.blog_url, bridgeVersion: d.bridge_version, lastPingAt: d.last_ping_at, lastPingMs: d.last_ping_ms,
        queueGroups: d.queue_groups, pendingDocs: d.pending_docs, stale: Date.now() - d.last_ping_at.getTime() > PING_STALE_MS })),
      pingStaleMinutes: PING_STALE_MS / 60000,
    };
  },

  /** Kế toán đang đứng ở tenant X nhập mã nối → blog nối vào X (hàm CSDL kiểm tenant phiên = X). */
  async link(tx: Tx, auth: AuthContext, linkCode: string) {
    onlyUser(auth);
    const code = normalizeLinkCode(linkCode);
    if (code.length !== LINK_CODE_LEN || [...code].some((c) => !CROCKFORD.includes(c))) {
      throw Errors.validation('Mã nối gồm 8 ký tự chữ / số', { reason: 'POS_LINK_CODE_INVALID' });
    }
    try {
      const r = await sql<{ installation_code: string; blog_id: number; blog_name: string }>`
        SELECT * FROM pos_installation_link(${hashLinkCode(code)}, ${auth.tenantId}::bigint, ${auth.actor})`.execute(tx);
      const row = r.rows[0]!;
      return { id: `${row.installation_code}:${row.blog_id}`, installationCode: row.installation_code, blogId: row.blog_id, name: row.blog_name, status: 'active' as const };
    } catch (e) {
      const pg = e as { code?: string };
      if (pg.code === 'P0002') throw Errors.validation('Mã nối không đúng, đã dùng hoặc đã hết hạn — xin bridge cấp mã mới', { reason: 'POS_LINK_CODE_INVALID' });
      if (pg.code === '23505') throw Errors.conflict('Sổ này đã nối một cửa hàng khác — mỗi cửa hàng một sổ (ADR-0037, P-0)', { reason: 'TENANT_ALREADY_LINKED' });
      throw e;
    }
  },

  // ── Bridge: khoá cài đặt, không X-OKT-Blog (chạy trong tenant chủ) ──────────
  async registerBlogs(auth: AuthContext, blogs: readonly BlogInput[]) {
    const inst = installationOf(auth);
    const codes = new Map<number, string>();
    await db.transaction().execute(async (tx) => {
      const now = Date.now();
      for (const b of blogs) {
        const cur = await tx.selectFrom('pos_installation_blogs').select(['status', 'link_code_expires_at'])
          .where('installation_id', '=', inst.id).where('blog_id', '=', b.blogId).forUpdate().executeTakeFirst();
        const needCode = !cur || (cur.status === 'pending' && (b.renewLinkCode || !cur.link_code_expires_at || cur.link_code_expires_at.getTime() <= now));
        const fresh = needCode ? crockford(LINK_CODE_LEN) : null;
        const codeCols = fresh ? { link_code_hash: hashLinkCode(fresh), link_code_expires_at: new Date(now + LINK_CODE_TTL_MS) } : {};
        if (!cur) {
          await tx.insertInto('pos_installation_blogs').values({
            installation_id: inst.id, blog_id: b.blogId, owner_tenant_id: auth.tenantId, blog_name: b.name ?? '', blog_url: b.url ?? '', ...codeCols,
          }).execute();
        } else {
          const set = { ...(b.name !== undefined ? { blog_name: b.name } : {}), ...(b.url !== undefined ? { blog_url: b.url } : {}), ...codeCols };
          if (Object.keys(set).length) {
            await tx.updateTable('pos_installation_blogs').set(set).where('installation_id', '=', inst.id).where('blog_id', '=', b.blogId).execute();
          }
        }
        if (fresh) codes.set(b.blogId, fresh);
      }
    });
    const list = await blogsOf(db, inst.id);
    return { installationCode: inst.code, blogs: list.map((b) => (codes.has(b.blogId) ? { ...b, linkCode: codes.get(b.blogId)! } : b)) };
  },

  async listBlogs(auth: AuthContext) {
    const inst = installationOf(auth);
    return { installationCode: inst.code, blogs: await blogsOf(db, inst.id), pingStaleMinutes: PING_STALE_MS / 60000 };
  },

  /** Một lượt ping cho cả bản cài. Blog chưa đăng ký bị bỏ qua (trả trong `unknown`). */
  async ping(auth: AuthContext, blogs: readonly PingBlogInput[]) {
    const inst = installationOf(auth);
    const unknown: number[] = [];
    const at = new Date();
    for (const b of blogs) {
      const r = await db.updateTable('pos_installation_blogs').set({
        last_ping_at: at, last_ping_ms: b.latencyMs ?? null, ...(b.bridgeVersion !== undefined ? { bridge_version: b.bridgeVersion } : {}),
        queue_groups: b.queueGroups ?? null, pending_docs: b.pendingDocs ?? null,
      }).where('installation_id', '=', inst.id).where('blog_id', '=', b.blogId).executeTakeFirst();
      if (!Number(r.numUpdatedRows)) unknown.push(b.blogId);
    }
    return { installationCode: inst.code, serverTime: at, accepted: blogs.length - unknown.length, unknown, blogs: await blogsOf(db, inst.id) };
  },

  // ── Khoá API thường (bizcity / một cửa hàng) ────────────────────────────────
  async directPing(tx: Tx, auth: AuthContext, b: PingBlogInput & { name?: string; url?: string }) {
    if (auth.kind !== 'apikey' || auth.installation || auth.app) throw Errors.forbidden('Ping này dành cho khoá API thường của open-pos; khoá cài đặt dùng POST /api/v1/pos-installation/ping');
    const at = new Date();
    const vals = {
      blog_name: b.name ?? '', blog_url: b.url ?? '', bridge_version: b.bridgeVersion ?? '', last_ping_at: at, last_ping_ms: b.latencyMs ?? null,
      queue_groups: b.queueGroups ?? null, pending_docs: b.pendingDocs ?? null,
    };
    await tx.insertInto('pos_connections').values({ tenant_id: auth.tenantId, blog_id: b.blogId, ...vals })
      .onConflict((oc) => oc.columns(['tenant_id', 'blog_id']).doUpdateSet(vals)).execute();
    const t = await tx.selectFrom('tenants').select('code').where('id', '=', auth.tenantId).executeTakeFirst();
    return { id: `${auth.tenantId}:${b.blogId}`, blogId: b.blogId, tenantCode: t?.code ?? null, serverTime: at };
  },
};
