// @bizcity-layer M data/masterdata
// [2026-11-24 07:10 PM Johnny Chu - Chu Hoàng Anh] SPINE-3 — Q-SPINE-3 (chủ duyệt 2026-11-24): changefeed + digest danh mục theo bizcity_sync@1 (chuẩn xương sống bizcity_spine@1 §4.1) — chủ mở cho app khác (bridge, cake) kéo bản sao theo con trỏ và đối chiếu. Chỉ đọc; không chạm bảng sổ.
/**
 * Ba trục chủ của open-ketoan mở cho đồng bộ: items (kèm codes + units), partners, branches.
 *   page(axis, tenant, since, limit)  → { data: ChangeRow[], meta: { cursor, as_of, has_more } }
 *   digest(axis, tenant, since)       → DigestRow[]  (so băm theo id, không kéo payload)
 * Con trỏ = `<updated_at ISO>|<id>`; thứ tự (updated_at, id) ổn định; dòng ngừng vẫn có mặt với deleted = true
 * (items: status = retired; partners / branches: is_active = false). Xoá vật lý (chỉ cho dòng chưa từng
 * được tham chiếu) không vào feed — digest sẽ thiếu id, app đối chiếu tự biết.
 */
import { sql, type RawBuilder } from 'kysely';
import { db } from '../../db/client.js';

export const SYNC_AXES = ['items', 'partners', 'branches'] as const;
export type SyncAxis = (typeof SYNC_AXES)[number];

export interface ChangeRow { id: string; version: number; updated_at: string; deleted: boolean; data: Record<string, unknown> }
export interface ChangePageMeta { cursor: string; as_of: string; has_more: boolean }
export interface ChangePage { data: ChangeRow[]; meta: ChangePageMeta }
export interface DigestRow { id: string; version: number; deleted: boolean }

export const SYNC_MAX_LIMIT = 1000;
const DIGEST_CAP = 50000;
const EPOCH = '1970-01-01T00:00:00Z';
// [2026-11-24 08:40 PM Johnny Chu - Chu Hoàng Anh] SPINE-4 — sửa: danh mục trống và chưa có con trỏ thì meta.cursor từng là '' (trái bizcity_sync@1: cursor bắt buộc, không rỗng). Bộ kiểm hộp đen bizcity-platform tools/spine-contract.mjs (SC-SPINE-5) bắt được. Nay trả con trỏ "từ đầu"; gửi lại con trỏ này cho cùng kết quả như không gửi.
export const START_CURSOR = `${EPOCH}|`;

interface AxisSql { from: RawBuilder<unknown>; tenant: RawBuilder<unknown>; id: RawBuilder<unknown>; ts: RawBuilder<unknown>; deleted: RawBuilder<unknown>; data: RawBuilder<unknown> }

/** Mỗi trục: bảng, cột định danh (text), cột thời điểm, cờ ngừng, payload cho bản sao. Chỉ mảnh SQL tĩnh, không giá trị ngoài. */
const AXES: Record<SyncAxis, AxisSql> = {
  items: {
    from: sql`items i`, tenant: sql`i.tenant_id`, id: sql`i.item_id`, ts: sql`i.updated_at`, deleted: sql`(i.status = 'retired')`,
    data: sql`jsonb_build_object(
      'name', i.name, 'unit_base', i.unit_base, 'status', i.status, 'parent_item_id', i.parent_item_id,
      'merged_into_item_id', i.merged_into_item_id, 'root_item_id', i.root_item_id, 'attributes', i.attributes,
      'source_system', i.source_system, 'retired_at', i.retired_at,
      'codes', COALESCE((SELECT jsonb_agg(jsonb_build_object('kind', c.kind, 'code', c.code, 'valid_from', c.valid_from, 'valid_to', c.valid_to) ORDER BY c.valid_from, c.kind, c.code)
                         FROM item_codes c WHERE c.tenant_id = i.tenant_id AND c.item_id = i.item_id), '[]'::jsonb),
      'units', COALESCE((SELECT jsonb_agg(jsonb_build_object('uom', u.unit, 'ratio', u.ratio, 'is_default', u.is_default) ORDER BY u.is_default DESC, u.unit)
                         FROM product_units u WHERE u.tenant_id = i.tenant_id
                          AND u.sku IN (SELECT c2.code FROM item_codes c2 WHERE c2.tenant_id = i.tenant_id AND c2.item_id = i.item_id AND c2.kind = 'sku' AND c2.valid_to IS NULL)), '[]'::jsonb)
    )`,
  },
  partners: {
    from: sql`partners p`, tenant: sql`p.tenant_id`, id: sql`p.id::text`, ts: sql`p.updated_at`, deleted: sql`(NOT p.is_active)`,
    data: sql`jsonb_build_object(
      'code', p.code, 'name', p.name, 'kind', p.kind, 'also_kinds', p.also_kinds, 'tax_code', p.tax_code, 'address', p.address,
      'email', p.email, 'phone', p.phone, 'mobile', p.mobile, 'group_code', p.group_code, 'is_active', p.is_active,
      'uid', p.uid, 'parent_uid', p.parent_uid, 'short_name', p.short_name, 'company_name', p.company_name, 'contact_name', p.contact_name
    )`,
  },
  branches: {
    from: sql`branches b`, tenant: sql`b.tenant_id`, id: sql`b.id::text`, ts: sql`b.updated_at`, deleted: sql`(NOT b.is_active)`,
    data: sql`jsonb_build_object(
      'code', b.code, 'name', b.name, 'address', b.address, 'external_ref', b.external_ref, 'is_active', b.is_active,
      'department_code', b.department_code, 'level', b.level, 'uid', b.uid, 'unit_path', b.unit_path,
      'parent_code', (SELECT pb.code FROM branches pb WHERE pb.id = b.parent_id),
      'company_name', b.company_name, 'tax_code', b.tax_code, 'phone', b.phone
    )`,
  },
};

interface Raw { id: string; version: string | number; updated_at: string; deleted: boolean; data: Record<string, unknown> }
interface RawDigest { id: string; version: string | number; deleted: boolean }

/** `<updated_at>|<id>` → hai phần; thiếu thì từ đầu. Khuôn đã kiểm ở route (zod). */
export function parseCursor(cursor?: string | null): { ts: string; id: string } {
  if (!cursor) return { ts: EPOCH, id: '' };
  const i = cursor.lastIndexOf('|');
  return i < 1 ? { ts: EPOCH, id: '' } : { ts: cursor.slice(0, i), id: cursor.slice(i + 1) };
}

export function makeCursor(row: Pick<ChangeRow, 'updated_at' | 'id'>): string {
  return `${row.updated_at}|${row.id}`;
}

function toRow(r: Raw): ChangeRow {
  return { id: r.id, version: Number(r.version), updated_at: r.updated_at, deleted: r.deleted, data: r.data };
}

async function asOf(): Promise<string> {
  const res = await sql<{ now: string }>`SELECT to_json(now())#>>'{}' AS now`.execute(db);
  return res.rows[0]!.now;
}

export const syncService = {
  async page(axis: SyncAxis, tenantId: string, since: string | undefined, limit: number): Promise<ChangePage> {
    const a = AXES[axis];
    const c = parseCursor(since);
    const n = Math.min(Math.max(1, limit), SYNC_MAX_LIMIT);
    const res = await sql<Raw>`
      SELECT ${a.id} AS id,
             (EXTRACT(EPOCH FROM ${a.ts}) * 1000)::bigint AS version,
             to_json(${a.ts})#>>'{}' AS updated_at,
             ${a.deleted} AS deleted,
             ${a.data} AS data
        FROM ${a.from}
       WHERE ${a.tenant} = ${tenantId}
         AND (${a.ts}, ${a.id}) > (${c.ts}::timestamptz, ${c.id})
       ORDER BY ${a.ts}, ${a.id}
       LIMIT ${n + 1}`.execute(db);
    const hasMore = res.rows.length > n;
    const data = res.rows.slice(0, n).map(toRow);
    const last = data[data.length - 1];
    return { data, meta: { cursor: last ? makeCursor(last) : (since || START_CURSOR), as_of: await asOf(), has_more: hasMore } };
  },

  async digest(axis: SyncAxis, tenantId: string, since?: string): Promise<DigestRow[]> {
    const a = AXES[axis];
    const c = parseCursor(since);
    const res = await sql<RawDigest>`
      SELECT ${a.id} AS id,
             (EXTRACT(EPOCH FROM ${a.ts}) * 1000)::bigint AS version,
             ${a.deleted} AS deleted
        FROM ${a.from}
       WHERE ${a.tenant} = ${tenantId}
         AND (${a.ts}, ${a.id}) > (${c.ts}::timestamptz, ${c.id})
       ORDER BY ${a.ts}, ${a.id}
       LIMIT ${DIGEST_CAP}`.execute(db);
    return res.rows.map((r) => ({ id: r.id, version: Number(r.version), deleted: r.deleted }));
  },
};
