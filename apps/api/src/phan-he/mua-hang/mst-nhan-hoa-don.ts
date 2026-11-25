// @bizcity-layer D modules/mua-hang
// [2026-11-23 01:40 PM Nguyễn Văn Thủy] MH22 — danh sách MST nhận hoá đơn đầu vào: một trang gom hoá đơn của nhiều công ty / chi nhánh (đóng góp)
/**
 * MST NHẬN HOÁ ĐƠN ĐẦU VÀO: trang này nhận hoá đơn mua vào có MST người mua nào.
 *   Cấu hình   cài đặt mua hàng của đơn vị (khoá bizcity.mua_hang.settings, trường invoiceBuyerTaxCodes) — sửa ở MH22
 *   Khớp       MST gốc (0106933743) nhận mọi chi nhánh 0106933743-xxx; MST có đuôi (0106933743-008) chỉ nhận đúng chi nhánh đó
 *   Để trống   như trước: theo MST đơn vị ở HT03, cùng MST gốc là nhận; đơn vị chưa khai MST thì không chặn
 * Dùng ở: ingest-xml (chặn "sai người mua"), whoami (cầu nối biết trang nhận công ty nào), MH22 (cấu hình + gợi ý).
 */
import { sql } from 'kysely';
import type { Db } from '../../db/client.js';
import { loadSettings, saveSettings } from './analysis.js';

/** MST doanh nghiệp: 10 số, chi nhánh thêm "-" và 3 số. */
export const MST_RE = /^\d{10}(-\d{3})?$/;
export const MAX_MST_NHAN = 200;

export const chuanMst = (s: string) => s.replace(/\s+/g, '').trim();
const gocMst = (s: string) => chuanMst(s).split('-')[0]!;

/** Dòng nào trong danh sách nhận MST này (MST gốc nhận cả chi nhánh; MST có đuôi chỉ nhận đúng nó); không dòng nào thì null. */
export function khopMst(danhSach: readonly string[], mst: string): string | null {
  const m = chuanMst(mst);
  if (!m) return null;
  for (const e of danhSach) {
    const x = chuanMst(e);
    if (x.includes('-') ? x === m : gocMst(m) === x) return x;
  }
  return null;
}

export interface MstNhan {
  /** Danh sách đã cấu hình ở MH22 (có thể trống). */
  list: string[];
  /** Danh sách đang áp: đã cấu hình, hoặc MST gốc của đơn vị (HT03) khi để trống; trống hẳn = không chặn. */
  effective: string[];
  /** MST đơn vị ở HT03. */
  tenantTaxCode: string;
}

export async function mstNhan(trx: Db, tenantId: string): Promise<MstNhan> {
  const s = await loadSettings(trx, tenantId);
  const list = (s.invoiceBuyerTaxCodes ?? []).map(chuanMst).filter(Boolean);
  const t = await trx.selectFrom('tenants').select(['tax_code']).where('id', '=', tenantId).executeTakeFirst();
  const tenantTaxCode = chuanMst(t?.tax_code ?? '');
  return { list, effective: list.length ? list : tenantTaxCode ? [gocMst(tenantTaxCode)] : [], tenantTaxCode };
}

/** null = nhận; chuỗi = lý do không nhận (MST người mua không thuộc danh sách). Hoá đơn không ghi MST người mua thì không chặn. */
export async function kiemNguoiMua(trx: Db, tenantId: string, buyerTaxCode: string | undefined): Promise<string | null> {
  if (!buyerTaxCode || !chuanMst(buyerTaxCode)) return null;
  const m = await mstNhan(trx, tenantId);
  if (!m.effective.length || khopMst(m.effective, buyerTaxCode)) return null;
  return m.list.length
    ? `Người mua trên hoá đơn có MST ${buyerTaxCode}, không có trong danh sách MST nhận hoá đơn (${m.list.join(', ')}) — thêm ở MH22 → MST nhận hoá đơn nếu đúng`
    : `Người mua trên hoá đơn có MST ${buyerTaxCode}, khác đơn vị (${m.tenantTaxCode}) — thêm ở MH22 → MST nhận hoá đơn nếu trang này nhận cả công ty đó`;
}

/** Kiểm và chuẩn danh sách trước khi lưu: đúng khuôn MST, bỏ trùng, MST có đuôi đã nằm trong MST gốc cũng bỏ. */
export function chuanDanhSach(input: readonly string[]): { list: string[]; loi: string[] } {
  const loi: string[] = [];
  const sach = [...new Set(input.map(chuanMst).filter(Boolean))];
  for (const m of sach) if (!MST_RE.test(m)) loi.push(`"${m}" không phải MST (10 số, chi nhánh thêm -3 số)`);
  if (sach.length > MAX_MST_NHAN) loi.push(`Tối đa ${MAX_MST_NHAN} MST`);
  const goc = new Set(sach.filter((m) => !m.includes('-')));
  const list = sach.filter((m) => MST_RE.test(m) && !(m.includes('-') && goc.has(gocMst(m)))).sort();
  return { list, loi };
}

/** Lưu danh sách vào cài đặt mua hàng (giữ nguyên các mục khác). Trả trước / sau để ghi nhật ký. */
export async function luuMstNhan(trx: Db, tenantId: string, list: string[]): Promise<{ before: string[]; after: string[] }> {
  const s = await loadSettings(trx, tenantId);
  const before = s.invoiceBuyerTaxCodes ?? [];
  await saveSettings(trx, tenantId, { ...s, invoiceBuyerTaxCodes: list });
  return { before, after: list };
}

export interface GoiYMst { mst: string; ten: string; nguon: ('don_vi' | 'chi_nhanh' | 'hoa_don')[]; soHoaDon: number; dangNhan: boolean }

/**
 * Gợi ý để chọn nhanh ở MH22: MST đơn vị (HT03), MST khai ở chi nhánh / đơn vị trong cơ cấu (bỏ ô ghi sai khuôn),
 * MST người mua trên hoá đơn đã nhận. Kèm số hoá đơn đang có và đang được nhận hay không.
 */
export async function goiYMst(trx: Db, tenantId: string): Promise<GoiYMst[]> {
  const m = await mstNhan(trx, tenantId);
  const by = new Map<string, GoiYMst>();
  const them = (mst: string, ten: string, nguon: GoiYMst['nguon'][number]) => {
    const k = chuanMst(mst);
    if (!MST_RE.test(k)) return;
    const x = by.get(k) ?? by.set(k, { mst: k, ten: '', nguon: [], soHoaDon: 0, dangNhan: !m.effective.length || !!khopMst(m.effective, k) }).get(k)!;
    if (!x.nguon.includes(nguon)) x.nguon.push(nguon);
    if (ten && !x.ten) x.ten = ten;
  };
  const t = await trx.selectFrom('tenants').select(['tax_code', 'name']).where('id', '=', tenantId).executeTakeFirst();
  if (t?.tax_code) them(t.tax_code, t.name ?? '', 'don_vi');
  const cn = await trx.selectFrom('branches').select(['tax_code', 'name']).where('tenant_id', '=', tenantId).where('tax_code', '<>', '').orderBy('code').execute();
  const tenCn = new Map<string, string[]>();
  for (const r of cn) {
    const k = chuanMst(r.tax_code ?? '');
    if (!MST_RE.test(k)) continue;
    tenCn.set(k, [...(tenCn.get(k) ?? []), r.name]);
  }
  for (const [k, ten] of tenCn) them(k, ten.length > 3 ? `${ten.slice(0, 3).join(', ')} và ${ten.length - 3} đơn vị khác` : ten.join(', '), 'chi_nhanh');
  const hd = await sql<{ mst: string; ten: string; n: string }>`
    SELECT buyer_tax_code AS mst, MAX(data->>'buyerName') AS ten, COUNT(*) AS n FROM supplier_invoices
    WHERE tenant_id = ${tenantId} AND buyer_tax_code <> '' AND status = 'active' GROUP BY buyer_tax_code`.execute(trx);
  for (const r of hd.rows) {
    them(r.mst, r.ten ?? '', 'hoa_don');
    const x = by.get(chuanMst(r.mst));
    if (x) x.soHoaDon = Number(r.n);
  }
  for (const k of m.list) if (!by.has(k)) by.set(k, { mst: k, ten: '', nguon: [], soHoaDon: 0, dangNhan: true });
  return [...by.values()].sort((a, b) => a.mst.localeCompare(b.mst));
}
