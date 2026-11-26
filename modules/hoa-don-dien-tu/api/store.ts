/**
 * Đọc / ghi CSDL của module hoa-don-dien-tu: bảng mod_hoa_don_dien_tu.so / chi_nhanh / nhat_ky và danh mục chi nhánh qua bizcity_read.branches.
 * Chạy trong ctx.data.module (RLS lọc theo đơn vị). Không chạm bảng Core; bí mật đi qua ctx.secrets, không bao giờ vào các bảng này.
 */
// [2026-11-26 09:00 PM Võ Hoàng] NGHIEM-THU — NT-BH-048: kho dữ liệu cài đặt hoá đơn điện tử (đóng góp)
import { sql, type ActionContext } from '@bizcity/module-sdk';
import type { ChiNhanhFields, SoFields } from './domain/cai-dat.js';

export type Tx = Parameters<Parameters<ActionContext['data']['module']>[0]>[0];

type SoRow = {
  trang_thai: SoFields['trangThai']; mst: string; ten_phap_ly: string; dia_chi: string; dien_thoai: string; api_base_url: string;
  auth_mode: SoFields['authMode']; username: string; ssl_verify: boolean; template_code: string; invoice_series: string; payment_method: string;
  auto_enabled: boolean; auto_mode: SoFields['autoMode']; row_version: number; updated_by: string; updated_by_name: string; updated_at: Date;
};
type CnRow = {
  branch_code: string; template_code: string; invoice_series: string; portal_enabled: boolean; portal_account: string; portal_supplier_id: string;
  active: boolean; row_version: number; updated_by_name: string; updated_at: Date;
};

export type SoRec = SoFields & { version: number; updatedByName: string; updatedAt: string };
export type CnRec = ChiNhanhFields & { branchCode: string; version: number; updatedByName: string; updatedAt: string };

const toSo = (r: SoRow): SoRec => ({
  trangThai: r.trang_thai, mst: r.mst, tenPhapLy: r.ten_phap_ly, diaChi: r.dia_chi, dienThoai: r.dien_thoai, apiBaseUrl: r.api_base_url,
  authMode: r.auth_mode, username: r.username, sslVerify: r.ssl_verify, templateCode: r.template_code, invoiceSeries: r.invoice_series,
  paymentMethod: r.payment_method, autoEnabled: r.auto_enabled, autoMode: r.auto_mode, version: r.row_version, updatedByName: r.updated_by_name,
  updatedAt: new Date(r.updated_at).toISOString(),
});
const toCn = (r: CnRow): CnRec => ({
  branchCode: r.branch_code, templateCode: r.template_code, invoiceSeries: r.invoice_series, portalEnabled: r.portal_enabled, portalAccount: r.portal_account,
  portalSupplierId: r.portal_supplier_id, active: r.active, version: r.row_version, updatedByName: r.updated_by_name, updatedAt: new Date(r.updated_at).toISOString(),
});

export async function getSo(tx: Tx, lock = false): Promise<SoRec | null> {
  const r = (await sql<SoRow>`SELECT trang_thai, mst, ten_phap_ly, dia_chi, dien_thoai, api_base_url, auth_mode, username, ssl_verify, template_code,
      invoice_series, payment_method, auto_enabled, auto_mode, row_version, updated_by, updated_by_name, updated_at
    FROM mod_hoa_don_dien_tu.so ${lock ? sql`FOR UPDATE` : sql``}`.execute(tx)).rows[0];
  return r ? toSo(r) : null;
}

export async function upsertSo(tx: Tx, tenantId: string, f: SoFields, actor: { id: string; name: string }): Promise<number> {
  const r = await sql<{ v: number }>`
    INSERT INTO mod_hoa_don_dien_tu.so (tenant_id, trang_thai, mst, ten_phap_ly, dia_chi, dien_thoai, api_base_url, auth_mode, username, ssl_verify,
      template_code, invoice_series, payment_method, auto_enabled, auto_mode, updated_by, updated_by_name)
    VALUES (${tenantId}, ${f.trangThai}, ${f.mst}, ${f.tenPhapLy}, ${f.diaChi}, ${f.dienThoai}, ${f.apiBaseUrl}, ${f.authMode}, ${f.username}, ${f.sslVerify},
      ${f.templateCode}, ${f.invoiceSeries}, ${f.paymentMethod}, ${f.autoEnabled}, ${f.autoMode}, ${actor.id}, ${actor.name})
    ON CONFLICT (tenant_id) DO UPDATE SET trang_thai = EXCLUDED.trang_thai, mst = EXCLUDED.mst, ten_phap_ly = EXCLUDED.ten_phap_ly,
      dia_chi = EXCLUDED.dia_chi, dien_thoai = EXCLUDED.dien_thoai, api_base_url = EXCLUDED.api_base_url, auth_mode = EXCLUDED.auth_mode,
      username = EXCLUDED.username, ssl_verify = EXCLUDED.ssl_verify, template_code = EXCLUDED.template_code, invoice_series = EXCLUDED.invoice_series,
      payment_method = EXCLUDED.payment_method, auto_enabled = EXCLUDED.auto_enabled, auto_mode = EXCLUDED.auto_mode,
      row_version = so.row_version + 1, updated_by = EXCLUDED.updated_by, updated_by_name = EXCLUDED.updated_by_name, updated_at = now()
    RETURNING row_version AS v`.execute(tx);
  return r.rows[0]!.v;
}

export async function listCn(tx: Tx): Promise<CnRec[]> {
  return (await sql<CnRow>`SELECT branch_code, template_code, invoice_series, portal_enabled, portal_account, portal_supplier_id, active, row_version,
      updated_by_name, updated_at FROM mod_hoa_don_dien_tu.chi_nhanh ORDER BY branch_code`.execute(tx)).rows.map(toCn);
}

export async function getCn(tx: Tx, branchCode: string, lock = false): Promise<CnRec | null> {
  const r = (await sql<CnRow>`SELECT branch_code, template_code, invoice_series, portal_enabled, portal_account, portal_supplier_id, active, row_version,
      updated_by_name, updated_at FROM mod_hoa_don_dien_tu.chi_nhanh WHERE branch_code = ${branchCode} ${lock ? sql`FOR UPDATE` : sql``}`.execute(tx)).rows[0];
  return r ? toCn(r) : null;
}

export async function upsertCn(tx: Tx, tenantId: string, branchCode: string, f: ChiNhanhFields, actor: { id: string; name: string }): Promise<number> {
  const r = await sql<{ v: number }>`
    INSERT INTO mod_hoa_don_dien_tu.chi_nhanh (tenant_id, branch_code, template_code, invoice_series, portal_enabled, portal_account, portal_supplier_id,
      active, updated_by, updated_by_name)
    VALUES (${tenantId}, ${branchCode}, ${f.templateCode}, ${f.invoiceSeries}, ${f.portalEnabled}, ${f.portalAccount}, ${f.portalSupplierId}, ${f.active},
      ${actor.id}, ${actor.name})
    ON CONFLICT (tenant_id, branch_code) DO UPDATE SET template_code = EXCLUDED.template_code, invoice_series = EXCLUDED.invoice_series,
      portal_enabled = EXCLUDED.portal_enabled, portal_account = EXCLUDED.portal_account, portal_supplier_id = EXCLUDED.portal_supplier_id,
      active = EXCLUDED.active, row_version = chi_nhanh.row_version + 1, updated_by = EXCLUDED.updated_by, updated_by_name = EXCLUDED.updated_by_name,
      updated_at = now()
    RETURNING row_version AS v`.execute(tx);
  return r.rows[0]!.v;
}

export type Branch = { code: string; name: string; level: string | null; parentCode: string | null };
/** Chi nhánh đang dùng của đơn vị (danh mục Core, chỉ đọc). */
export async function activeBranches(tx: Tx): Promise<Branch[]> {
  return (await sql<{ code: string; name: string; level: string | null; parent_code: string | null }>`
    SELECT code, name, level, parent_code FROM bizcity_read.branches WHERE is_active ORDER BY code`.execute(tx)).rows
    .map((b) => ({ code: b.code, name: b.name, level: b.level, parentCode: b.parent_code }));
}

export async function branchActive(tx: Tx, code: string): Promise<boolean> {
  return (await sql<{ n: number }>`SELECT 1 AS n FROM bizcity_read.branches WHERE code = ${code} AND is_active`.execute(tx)).rows.length > 0;
}

/** Ghi một dòng nhật ký. `chiTiet` chỉ mang tên ô / tên bí mật / mã HTTP — không giá trị bí mật. */
export async function ghiNhatKy(tx: Tx, tenantId: string, actor: { id: string; name: string }, doiTuong: string, hanhDong: string, chiTiet: Record<string, unknown>) {
  await sql`INSERT INTO mod_hoa_don_dien_tu.nhat_ky (tenant_id, actor, actor_name, doi_tuong, hanh_dong, chi_tiet)
    VALUES (${tenantId}, ${actor.id}, ${actor.name}, ${doiTuong}, ${hanhDong}, ${JSON.stringify(chiTiet)}::jsonb)`.execute(tx);
}

export type NhatKy = { id: string; at: string; actorName: string; doiTuong: string; hanhDong: string; chiTiet: Record<string, unknown> };
export async function listNhatKy(tx: Tx, limit: number): Promise<NhatKy[]> {
  return (await sql<{ id: string; at: Date; actor_name: string; actor: string; doi_tuong: string; hanh_dong: string; chi_tiet: Record<string, unknown> }>`
    SELECT id::text, at, actor, actor_name, doi_tuong, hanh_dong, chi_tiet FROM mod_hoa_don_dien_tu.nhat_ky ORDER BY at DESC, id DESC LIMIT ${limit}`.execute(tx)).rows
    .map((r) => ({ id: r.id, at: new Date(r.at).toISOString(), actorName: r.actor_name || r.actor, doiTuong: r.doi_tuong, hanhDong: r.hanh_dong, chiTiet: r.chi_tiet }));
}
