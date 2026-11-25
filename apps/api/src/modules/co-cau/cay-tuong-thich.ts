// @bizcity-layer M data/masterdata
// [2026-11-20 Nguyễn Văn Thủy] Cây đơn vị cho các màn đọc dạng "nút + chi nhánh" (bộ lọc báo cáo, tồn max, giá bán) — tính thẳng từ branches (0174) (đóng góp)
/**
 * Cơ cấu chỉ còn một cây: bảng đơn vị branches (0173, 0174). File này dựng lại DẠNG DỮ LIỆU CŨ cho các màn đang đọc
 * GET /api/v1/org-units/tree và /purchase-units, để chúng chạy tiếp không phải sửa:
 *   nút        = đơn vị nhóm (có đơn vị con, hoặc chưa có phân kho mà mang tên gọi cấp nhóm: Công ty, Miền, Chi nhánh…)
 *   chi nhánh  = đơn vị có phân kho hoặc không có đơn vị con; thuộc nút = chính nó (nếu cũng là nút) hoặc đơn vị cha
 *   level      = cấp đơn vị - 1 (công ty = 0); path = đường dẫn mã nối bằng "\"
 *
 * Phân cấp mua hàng (syncBranchLevels): mỗi đơn vị cấp 3 (như "Chi nhánh Phú Thọ") tự lấy kho tổng = đơn vị mã xx000 (hoặc tên có chữ
 * "Kho") nhiều phân kho nhất trong nhánh (branches.purchase_branch_id); đơn vị trong nhánh là shop của kho tổng đó (branches.level / parent_id).
 * Cửa hàng chưa thuộc kho tổng nào thì gom theo đơn vị cha trực tiếp (NT-MH-012).
 */
import { sql } from 'kysely';
import type { Db } from '../../db/client.js';

const SEP = '\\';

export interface OrgWarehouseDto { code: string; name: string; isDefault: boolean; isActive: boolean }
export interface OrgNodeDto {
  taxId?: string; kind?: string;
  code: string; shortCode: string; name: string; alias: string; note: string;
  parentCode: string | null; level: number; path: string; sortOrder: number; isActive: boolean;
  /** Đơn vị mua hàng: mã kho tổng (null = không phải). */
  purchaseBranchCode: string | null;
  /** Đơn vị mua hàng gần nhất (chính nút hoặc phía trên). */
  purchaseUnitCode: string | null;
  directBranches: number; totalBranches: number; activeBranches: number;
}
export interface OrgBranchDto {
  code: string; name: string; isActive: boolean; orgCode: string | null;
  /** branch = kho tổng của một đơn vị mua hàng, shop = thuộc đơn vị mua hàng, '' = chưa thuộc. */
  level: string; parentCode: string | null; purchaseUnitCode: string | null;
  warehouses: OrgWarehouseDto[];
}
export interface OrgTreeDto { nodes: OrgNodeDto[]; branches: OrgBranchDto[]; unassigned: number }
export interface PurchaseUnitDto {
  orgCode: string; orgName: string; path: string; level: number;
  branchCode: string; branchName: string;
  childUnits: number; branches: number; activeBranches: number;
}

interface URow {
  id: string; code: string; name: string; note: string; tax_code: string; is_active: boolean; unit_parent_id: string | null; unit_path: string; unit_level: number;
  level_label: string; sort_order: number; purchase_branch_id: string | null; level: string | null; parent_id: string | null;
}
interface WRow { branch_id: string; code: string; name: string; is_default: boolean; is_active: boolean }

async function load(trx: Db, tenantId: string) {
  const units = (await sql<URow>`
    SELECT id::text, code, name, note, tax_code, is_active, unit_parent_id::text, unit_path, unit_level, level_label, sort_order,
           purchase_branch_id::text, level, parent_id::text
      FROM branches WHERE tenant_id = ${tenantId} ORDER BY sort_order, code`.execute(trx)).rows;
  const whs = (await sql<WRow>`SELECT branch_id::text, code, name, is_default, is_active FROM warehouses WHERE tenant_id = ${tenantId} ORDER BY code`.execute(trx)).rows;
  const byId = new Map(units.map((u) => [u.id, u]));
  const kids = new Map<string, URow[]>();
  for (const u of units) if (u.unit_parent_id && byId.has(u.unit_parent_id)) (kids.get(u.unit_parent_id) ?? kids.set(u.unit_parent_id, []).get(u.unit_parent_id)!).push(u);
  const whOf = new Map<string, WRow[]>();
  for (const w of whs) (whOf.get(w.branch_id) ?? whOf.set(w.branch_id, []).get(w.branch_id)!).push(w);
  /** Đơn vị nhóm (hiện thành nút): có đơn vị con, hoặc chưa có phân kho mà mang tên gọi cấp nhóm (Công ty, Miền, Chi nhánh…). */
  const isNode = (u: URow) => !!kids.get(u.id)?.length || (!whOf.get(u.id)?.length && u.level_label !== '' && u.level_label !== 'Cửa hàng');
  /** Đơn vị hiện thành chi nhánh (có phân kho hoặc là lá). */
  const isBranch = (u: URow) => !!whOf.get(u.id)?.length || !kids.get(u.id)?.length;
  /** Nút chứa một chi nhánh: chính nó nếu cũng là nút, không thì đơn vị cha. */
  const nodeOf = (u: URow): URow | null => (isNode(u) ? u : u.unit_parent_id ? byId.get(u.unit_parent_id) ?? null : null);
  const nearestPurchase = (u: URow | null): URow | null => {
    for (let x = u, n = 0; x && n < 40; x = x.unit_parent_id ? byId.get(x.unit_parent_id) ?? null : null, n++) if (x.purchase_branch_id && x.is_active) return x;
    return null;
  };
  const subtree = (id: string): URow[] => { const out: URow[] = []; const st = [...(kids.get(id) ?? [])]; while (st.length) { const x = st.pop()!; out.push(x); st.push(...(kids.get(x.id) ?? [])); } return out; };
  return { units, byId, kids, whOf, isNode, isBranch, nodeOf, nearestPurchase, subtree };
}

export async function orgTree(trx: Db, tenantId: string): Promise<OrgTreeDto> {
  const t = await load(trx, tenantId);
  const branchUnits = t.units.filter(t.isBranch);
  const direct = new Map<string, URow[]>();
  for (const b of branchUnits) { const n = t.nodeOf(b); if (n) (direct.get(n.id) ?? direct.set(n.id, []).get(n.id)!).push(b); }
  const nodes: OrgNodeDto[] = t.units.filter(t.isNode).map((n) => {
    const all = [n, ...t.subtree(n.id)].flatMap((x) => direct.get(x.id) ?? []);
    const parent = n.unit_parent_id ? t.byId.get(n.unit_parent_id) : undefined;
    return {
      kind: parent ? 'unit' : 'company', code: n.code, shortCode: '', name: n.name, alias: '', note: n.note, taxId: n.tax_code,
      parentCode: parent?.code ?? null, level: n.unit_level - 1, path: n.unit_path.split('/').join(SEP), sortOrder: n.sort_order, isActive: n.is_active,
      purchaseBranchCode: n.purchase_branch_id ? t.byId.get(n.purchase_branch_id)?.code ?? null : null,
      purchaseUnitCode: t.nearestPurchase(n)?.code ?? null,
      directBranches: direct.get(n.id)?.length ?? 0, totalBranches: all.length, activeBranches: all.filter((b) => b.is_active).length,
    };
  });
  const branches: OrgBranchDto[] = branchUnits.map((b) => ({
    code: b.code, name: b.name, isActive: b.is_active, orgCode: t.nodeOf(b)?.code ?? null,
    level: b.level ?? '', parentCode: b.parent_id ? t.byId.get(b.parent_id)?.code ?? null : null,
    purchaseUnitCode: t.nearestPurchase(t.nodeOf(b))?.code ?? null,
    warehouses: (t.whOf.get(b.id) ?? []).map((w) => ({ code: w.code, name: w.name, isDefault: w.is_default, isActive: w.is_active })),
  }));
  return { nodes, branches, unassigned: branches.filter((b) => !b.orgCode).length };
}

/** Đơn vị mua hàng (ô chọn ở MH02 / MH16 / MH18 / MH19): đơn vị nhóm có kho tổng + số cửa hàng thuộc nó. */
export async function purchaseUnits(trx: Db, tenantId: string): Promise<PurchaseUnitDto[]> {
  const tree = await orgTree(trx, tenantId);
  const byCode = new Map(tree.branches.map((b) => [b.code, b]));
  return tree.nodes.filter((n) => n.purchaseBranchCode && n.isActive).map((n) => {
    const mine = tree.branches.filter((b) => b.purchaseUnitCode === n.code);
    return {
      orgCode: n.code, orgName: n.name, path: n.path, level: n.level,
      branchCode: n.purchaseBranchCode!, branchName: byCode.get(n.purchaseBranchCode!)?.name ?? '',
      childUnits: tree.nodes.filter((c) => c.parentCode === n.code && c.isActive).length,
      branches: mine.length, activeBranches: mine.filter((b) => b.isActive && !/_OFF$/i.test(b.code)).length,
    };
  });
}

// [2026-11-25 kiennt] NT-MH-012 — theo loại đơn vị (Chi nhánh / Cửa hàng / Kho tổng) trước; còn lại quy tắc lai: giữ cấp 3 (cả nhánh một kho tổng, vd Lào Cai lấy hàng 08000 Phú Thọ); kho tổng nhận thêm
// đơn vị tên có chữ "Kho"; cửa hàng chưa thuộc kho tổng nào thì gom theo đơn vị cha trực tiếp (cây 2 cấp, nhánh cấp 3 thiếu kho tổng) (đóng góp)
/** Mã kho tổng theo quy ước: 5 số, đuôi 000 (07000, 08000). */
const MA_KHO_TONG = /^\d{2}000$/;
/** Tên có chữ "Kho" đứng riêng (Kho tổng Phú Thọ) — không bắt "Khoa", "Khoái". */
const TEN_KHO = /(^|[\s\-–(])kho($|[\s\-–)])/i;

/**
 * Tính lại kho tổng của các đơn vị mua hàng và phân cấp shop (branches.purchase_branch_id, level, parent_id).
 *   0. Theo loại đơn vị: đơn vị loại "Chi nhánh" có "Cửa hàng" bên dưới là đơn vị mua hàng; cửa hàng thuộc chi nhánh gần nhất phía
 *      trên; kho tổng = chính chi nhánh nếu có phân kho, không thì đơn vị bên dưới (không phải cửa hàng) có phân kho: loại "Kho tổng" /
 *      "Kho trung gian" → mã xx000 → tên có chữ "Kho" → nhiều phân kho. Đơn vị khác dưới chi nhánh (kho, văn phòng) không là shop.
 *   1. (Phần còn lại) Đơn vị cấp 3 (cấp 2 tính từ công ty = 0, như "Chi nhánh Phú Thọ") lấy kho tổng trong cả nhánh: mã xx000 → tên có chữ "Kho"
 *      (có phân kho) → nhiều phân kho nhất → mã nhỏ hơn. Mọi cửa hàng trong nhánh là shop của kho tổng đó.
 *   2. Dự phòng: cửa hàng (đơn vị cuối cây không phải nhóm, có hay chưa có phân kho) chưa thuộc kho tổng nào sau bước 1 → gom theo đơn vị cha trực tiếp; cha thành đơn vị
 *      mua hàng nếu chính nó có phân kho, hoặc có đơn vị con trực tiếp có phân kho mã xx000 / tên có chữ "Kho".
 * Chưa có đơn vị mua hàng nào thì không đổi phân cấp cũ.
 */
export async function syncBranchLevels(trx: Db, tenantId: string): Promise<{ changed: number }> {
  let t = await load(trx, tenantId);
  const soKho = (u: URow) => t.whOf.get(u.id)?.length ?? 0;
  const laKhoTong = (u: URow) => u.is_active && ((MA_KHO_TONG.test(u.code) && t.isBranch(u)) || (TEN_KHO.test(u.name) && soKho(u) > 0));
  /** Ưu tiên: xx000 → tên "Kho" → nhiều phân kho → mã nhỏ. */
  const hang = (a: URow, b: URow) => Number(MA_KHO_TONG.test(b.code)) - Number(MA_KHO_TONG.test(a.code)) || Number(TEN_KHO.test(b.name)) - Number(TEN_KHO.test(a.name)) || soKho(b) - soKho(a) || a.code.localeCompare(b.code);
  const hubOf = new Map<string, string | null>();
  // Bước 0 — theo LOẠI đơn vị đã khai ở sơ đồ tổ chức: "Chi nhánh" có "Cửa hàng" bên dưới là đơn vị mua hàng; cửa hàng thuộc
  // chi nhánh GẦN NHẤT phía trên; kho tổng = chính chi nhánh (có phân kho) hoặc đơn vị bên dưới không phải cửa hàng, có phân kho.
  const loai = (u: URow) => (u.level_label ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').trim().toLowerCase();
  const laCN = (u: URow) => loai(u) === 'chi nhanh';
  const laCH = (u: URow) => loai(u) === 'cua hang';
  const laLoaiKho = (u: URow) => loai(u) === 'kho tong' || loai(u) === 'kho trung gian';
  const cha = (u: URow) => (u.unit_parent_id ? t.byId.get(u.unit_parent_id) : undefined);
  /** Chi nhánh (đang dùng) gần nhất phía trên — không tính chính nó. */
  const cnTren = (u: URow): URow | null => { for (let x = cha(u), n = 0; x && n < 40; x = cha(x), n++) if (laCN(x) && x.is_active) return x; return null; };
  const cuaHang = new Map<string, number>();
  for (const s of t.units) if (s.is_active && laCH(s)) { const cn = cnTren(s); if (cn) cuaHang.set(cn.id, (cuaHang.get(cn.id) ?? 0) + 1); }
  for (const cnId of cuaHang.keys()) {
    const cn = t.byId.get(cnId)!;
    const kho = t.subtree(cnId).filter((u) => cnTren(u)?.id === cnId && u.is_active && !laCH(u) && !laCN(u) && soKho(u) > 0)
      .sort((a, b) => Number(laLoaiKho(b)) - Number(laLoaiKho(a)) || hang(a, b));
    // Không tìm được kho tổng: để các bước sau thử (cấp 3 / dự phòng); màn tồn max cảnh báo nếu vẫn không có.
    const hub = soKho(cn) > 0 ? cn.id : kho[0]?.id ?? null;
    if (hub) hubOf.set(cnId, hub);
  }
  /** Đơn vị nằm dưới (hoặc là) chi nhánh đã có kho tổng ở bước 0 — các bước sau không đụng. */
  const cnCoKho = (u: URow) => { const cn = laCN(u) ? u : cnTren(u); return cn && hubOf.get(cn.id) ? cn : null; };
  const theoLoai = new Set(t.units.filter((u) => cnCoKho(u)).map((u) => u.id));
  // Bước 1 — cấp 3, như cũ.
  for (const n of t.units.filter(t.isNode)) {
    if (hubOf.has(n.id) || theoLoai.has(n.id)) continue;
    hubOf.set(n.id, n.unit_level === 3 && n.is_active ? t.subtree(n.id).filter(laKhoTong).sort(hang)[0]?.id ?? null : null);
  }
  // Bước 2 — dự phòng cho cửa hàng chưa thuộc kho tổng nào.
  const coKhoTong = (u: URow | undefined): boolean => { for (let x = u, n = 0; x && n < 40; x = x.unit_parent_id ? t.byId.get(x.unit_parent_id) : undefined, n++) if (hubOf.get(x.id)) return true; return false; };
  const choGom = new Set<string>();
  // Cửa hàng = đơn vị cuối cây không phải nhóm, có hay chưa có phân kho (như bước 1: cửa hàng chưa có kho vẫn là shop).
  for (const s of t.units) if (s.is_active && !t.kids.get(s.id)?.length && !t.isNode(s) && s.unit_parent_id && !coKhoTong(s)) choGom.add(s.unit_parent_id);
  for (const pid of choGom) {
    const p = t.byId.get(pid);
    if (!p || !p.is_active || hubOf.get(pid)) continue;
    const con = (t.kids.get(pid) ?? []).filter((c) => c.is_active && soKho(c) > 0 && (MA_KHO_TONG.test(c.code) || TEN_KHO.test(c.name))).sort(hang);
    hubOf.set(pid, soKho(p) > 0 ? p.id : con[0]?.id ?? null);
  }
  for (const n of t.units) {
    const hub = hubOf.get(n.id) ?? null;
    if (hub !== n.purchase_branch_id) await sql`UPDATE branches SET purchase_branch_id = ${hub} WHERE id = ${n.id}`.execute(trx);
  }
  t = await load(trx, tenantId);
  const hubs = new Set(t.units.filter((u) => u.purchase_branch_id && u.is_active).map((u) => u.purchase_branch_id!));
  if (!hubs.size) return { changed: 0 };
  const codes: string[] = [], levels: string[] = [], parents: (string | null)[] = [];
  for (const b of t.units) {
    const hub = t.nearestPurchase(t.nodeOf(b))?.purchase_branch_id ?? null;
    // Đơn vị nhóm không có phân kho không phải shop.
    let level = hubs.has(b.id) ? 'branch' : !t.isBranch(b) || (t.isNode(b) && !t.whOf.get(b.id)?.length) ? '' : hub ? 'shop' : '';
    // Dưới chi nhánh theo loại: chỉ "Cửa hàng" (hoặc đơn vị lá chưa khai loại) là shop — kho, văn phòng… không phải shop.
    if (level === 'shop' && theoLoai.has(b.id) && !laCH(b) && !(loai(b) === '' && !t.kids.get(b.id)?.length)) level = '';
    const parent = level === 'shop' ? hub : null;
    if (level !== (b.level ?? '') || parent !== b.parent_id) { codes.push(b.code); levels.push(level); parents.push(parent); }
  }
  if (!codes.length) return { changed: 0 };
  await sql`
    UPDATE branches b SET level = x.level, parent_id = x.parent_id
      FROM unnest(${codes}::text[], ${levels}::text[], ${parents}::bigint[]) AS x(code, level, parent_id)
     WHERE b.tenant_id = ${tenantId} AND b.code = x.code`.execute(trx);
  return { changed: codes.length };
}
