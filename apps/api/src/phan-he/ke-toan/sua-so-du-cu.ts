// [2026-11-27 12:05 PM Nguyễn Văn Thủy] SO-DU — sửa dữ liệu một lần khi khởi động: phiếu số dư đầu kỳ cũ lệch Nợ / Có mà phần lệch
// ghi vào tài khoản THẬT (vd 1111 → tiền mặt ra Dư Có) được ghi lại bản điều chỉnh, phần lệch chuyển sang TK trung gian 999 (đóng góp)
/**
 * Chạy mỗi lần API khởi động, tự dừng khi không còn phiếu sai (lặp lại an toàn): phiếu đã sửa không còn balancingAccount trong payload.
 *  - Chỉ phiếu doc_type 'opening' đang ghi sổ, có balancingAccount không phải 9xx (hoặc là 911) và Nợ ≠ Có (phiếu cân thì không ảnh hưởng, bỏ qua).
 *  - Sửa bằng đúng đường Sửa → Ghi lại của màn ACC15 (bản điều chỉnh: đảo bút toán cũ + ghi mới), người sửa = chủ đơn vị.
 *  - Lỗi một phiếu (vd kỳ đã khoá) chỉ ghi nhật ký, không chặn khởi động.
 */
import { sql } from 'kysely';
import { db } from '../../db/client.js';
import { rolePermissions, type AuthContext } from '../../core/auth.js';
import { voucherService } from '../../kernel/public.js';

type Log = { info: (m: string) => void; warn: (m: string) => void };

const cents = (v: unknown) => Math.round(Number(v || 0) * 100);

export async function suaSoDuDauKyCu(log: Log, tenantId?: string): Promise<number> {
  const rows = await sql<{ id: string; tenant_id: string; doc_no: string; payload: any }>`
    SELECT id, tenant_id, doc_no, payload FROM accounting_events
    WHERE doc_type = 'opening' AND status = 'posted'
      AND coalesce(payload->>'balancingAccount', '') <> ''
      AND (payload->>'balancingAccount' !~ '^9' OR payload->>'balancingAccount' ~ '^911')
      ${tenantId ? sql`AND tenant_id = ${tenantId}` : sql``}`.execute(db);
  let fixed = 0;
  for (const r of rows.rows) {
    const p = r.payload ?? {};
    const lines: any[] = Array.isArray(p.lines) ? p.lines : [];
    const no = lines.reduce((s, l) => s + cents(l.debit), 0);
    const co = lines.reduce((s, l) => s + cents(l.credit), 0);
    if (no === co) continue;
    try {
      const owner = await sql<{ id: string; full_name: string }>`SELECT id, full_name FROM users WHERE tenant_id = ${r.tenant_id} AND role = 'owner' ORDER BY id LIMIT 1`.execute(db);
      const u = owner.rows[0];
      const auth: AuthContext = { tenantId: String(r.tenant_id), actor: u ? `user:${u.id}` : 'system:sua-so-du', actorName: u?.full_name ?? 'Hệ thống', kind: 'user', role: 'owner', roles: ['owner'], permissions: rolePermissions('owner') };
      const { balancingAccount, ...input } = p;
      await voucherService.updateOpening(auth, String(r.id), { ...input, docNo: r.doc_no });
      fixed++;
      log.info(`Số dư đầu kỳ ${r.doc_no}: phần lệch chuyển từ TK ${balancingAccount} sang TK trung gian 999`);
    } catch (e) {
      log.warn(`Số dư đầu kỳ ${r.doc_no}: chưa tự sửa được (${(e as Error).message}) — mở phiếu ở ACC15, bấm Sửa → Ghi lại`);
    }
  }
  return fixed;
}
