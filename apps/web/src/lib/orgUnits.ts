// [2026-11-03 10:39 AM Nguyễn Văn Thủy] SDTC — dữ liệu sơ đồ tổ chức dùng chung: cây, đơn vị mua hàng, chỉ mục cha – con, chi nhánh / kho dưới một nút
/**
 * Sơ đồ tổ chức (DM16): gốc Công ty → Miền → Chi nhánh → Tỉnh → điểm kinh doanh (chi nhánh) → kho.
 * Một chỗ gọi API + dựng chỉ mục cây cho màn DM16, bộ lọc cây chi nhánh / kho và ô chọn chi nhánh ở màn đặt hàng.
 */
import { useEffect, useMemo } from 'react';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { useWorkBranch } from '@/lib/workBranch';
import { api } from '@/lib/api';
import { plain } from '@/components/pickers';

export interface OrgWarehouse { code: string; name: string; isDefault: boolean; isActive: boolean }
export interface OrgNode {
  code: string; shortCode: string; name: string; alias: string; note: string; taxId?: string;
  /** Loại nút: company = công ty, unit = đơn vị cơ cấu (0131). */
  kind?: 'company' | 'unit';
  parentCode: string | null; level: number; path: string; sortOrder: number; isActive: boolean;
  purchaseBranchCode: string | null; purchaseUnitCode: string | null;
  directBranches: number; totalBranches: number; activeBranches: number;
}
export interface OrgBranch {
  code: string; name: string; isActive: boolean; orgCode: string | null;
  level: string; parentCode: string | null; purchaseUnitCode: string | null; warehouses: OrgWarehouse[];
}
export interface OrgTree { nodes: OrgNode[]; branches: OrgBranch[]; unassigned: number }
export interface PurchaseUnit { orgCode: string; orgName: string; path: string; level: number; branchCode: string; branchName: string; childUnits: number; branches: number; activeBranches: number }

/** Tên cấp theo số cấp (cấp 0 là gốc Công ty, không tính cấp). */
export const LEVEL_NAMES = ['Công ty', 'Miền', 'Chi nhánh', 'Tỉnh'];
export const levelName = (l: number) => LEVEL_NAMES[l] ?? `Cấp ${l}`;

export function useOrgTree() {
  return useQuery({ queryKey: ['org-tree'], queryFn: () => api.get<OrgTree>('/api/v1/org-units/tree'), staleTime: 60_000 });
}
export function usePurchaseUnits() {
  return useQuery({ queryKey: ['purchase-units'], queryFn: () => api.get<PurchaseUnit[]>('/api/v1/org-units/purchase-units'), staleTime: 60_000 });
}
/** Đổi cây / gắn chi nhánh / đơn vị mua hàng → làm mới mọi nơi đọc phân cấp. */
export function invalidateOrg(qc: QueryClient) {
  for (const key of [['org-tree'], ['purchase-units'], ['branches'], ['ton-max', 'hierarchy']]) void qc.invalidateQueries({ queryKey: key });
}

/** Chi nhánh / shop đã ngừng: tắt ở danh mục hoặc mã có đuôi _OFF. */
export const branchOff = (b: { code: string; isActive: boolean }) => !b.isActive || /_OFF$/i.test(b.code);

export interface OrgIndex {
  root: OrgNode | null;
  /** [2026-11-13 Nguyễn Văn Thủy] mọi gốc (được nhiều công ty cha, 0131); root = gốc đầu tiên (đóng góp) */
  roots: OrgNode[];
  byCode: Map<string, OrgNode>;
  kids: Map<string, OrgNode[]>;
  /** Chi nhánh gắn thẳng vào nút. */
  branchesAt: Map<string, OrgBranch[]>;
  /** Mọi chi nhánh trong nhánh (gồm nút con). */
  branchesUnder: (code: string) => OrgBranch[];
  /** Các mã nút trong nhánh (gồm chính nút). */
  subtree: (code: string) => Set<string>;
  unassigned: OrgBranch[];
}

export function indexOrg(tree: OrgTree | undefined): OrgIndex {
  const nodes = tree?.nodes ?? [];
  const byCode = new Map(nodes.map((n) => [n.code, n]));
  const kids = new Map<string, OrgNode[]>();
  for (const n of nodes) if (n.parentCode) (kids.get(n.parentCode) ?? kids.set(n.parentCode, []).get(n.parentCode)!).push(n);
  for (const list of kids.values()) list.sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
  const branchesAt = new Map<string, OrgBranch[]>();
  const unassigned: OrgBranch[] = [];
  for (const b of tree?.branches ?? []) {
    if (b.orgCode && byCode.has(b.orgCode)) (branchesAt.get(b.orgCode) ?? branchesAt.set(b.orgCode, []).get(b.orgCode)!).push(b);
    else unassigned.push(b);
  }
  const subtree = (code: string) => {
    const out = new Set<string>([code]);
    const stack = [code];
    while (stack.length) for (const k of kids.get(stack.pop()!) ?? []) if (!out.has(k.code)) { out.add(k.code); stack.push(k.code); }
    return out;
  };
  const branchesUnder = (code: string) => [...subtree(code)].flatMap((c) => branchesAt.get(c) ?? []);
  const roots = nodes.filter((n) => !n.parentCode).sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
  return { root: roots[0] ?? null, roots, byCode, kids, branchesAt, branchesUnder, subtree, unassigned };
}

/** Khớp tìm kiếm không dấu, nhiều từ (mã, tên, mã ngắn, alias). */
export function matchText(q: string, ...fields: (string | null | undefined)[]) {
  const words = plain(q).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const t = plain(fields.filter(Boolean).join(' '));
  return words.every((w) => t.includes(w));
}

/** Gợi ý ở ô chọn chi nhánh: "77 cửa hàng đang bán · kho 08000". */
export const purchaseUnitHint = (u: PurchaseUnit) => `${u.activeBranches} cửa hàng đang bán · kho ${u.branchCode}`;


// [2026-11-26 07:00 PM Nguyễn Văn Thủy] UX — bộ lọc dạng cây theo CHI NHÁNH ĐANG LÀM VIỆC: chỉ đơn vị đó và con cháu (đệ quy), đơn vị đó làm gốc —
// cấp cha phía trên không hiện, không tích được; 'Tất cả' = tất cả trong nhánh đó (đóng góp)
/** Cây cắt theo đơn vị w: giữ w + con cháu, w thành gốc. w rỗng, không có trong cây, hoặc là gốc công ty → null (không cắt). */
export function catCay(tree: OrgTree | undefined, w: string): OrgTree | null {
  if (!tree || !w) return null;
  const ix = indexOrg(tree);
  const node = ix.byCode.get(w);
  if (node) {
    if (!node.parentCode) return null;
    const keep = ix.subtree(w);
    return {
      nodes: tree.nodes.filter((n) => keep.has(n.code)).map((n) => (n.code === w ? { ...n, parentCode: null } : n)),
      branches: tree.branches.filter((b) => b.orgCode && keep.has(b.orgCode)),
      unassigned: 0,
    };
  }
  const b = tree.branches.find((x) => x.code === w);
  if (!b) return null;
  // Đơn vị lá (cửa hàng không có đơn vị con): một gốc chỉ có chính nó.
  const goc: OrgNode = { code: w, shortCode: '', name: b.name, alias: '', note: '', kind: 'unit', parentCode: null, level: 0, path: w, sortOrder: 0, isActive: b.isActive,
    purchaseBranchCode: null, purchaseUnitCode: null, directBranches: 1, totalBranches: 1, activeBranches: b.isActive ? 1 : 0 };
  return { nodes: [goc], branches: [{ ...b, orgCode: w }], unassigned: 0 };
}

/** Cây cho bộ lọc theo chi nhánh đang làm việc: tree để vẽ, allowed = mã chi nhánh được chọn (null = mọi chi nhánh, không cắt). */
export function useCayTheoLamViec(): { tree: OrgTree | undefined; allowed: string[] | null } {
  const q = useOrgTree();
  const w = useWorkBranch();
  return useMemo(() => {
    const cat = catCay(q.data, w);
    return cat ? { tree: cat, allowed: cat.branches.map((b) => b.code) } : { tree: q.data, allowed: null };
  }, [q.data, w]);
}

/** "Tất cả chi nhánh" của bộ lọc: không cắt → '' (mọi chi nhánh); cắt theo chi nhánh làm việc → liệt kê đúng các mã trong nhánh. */
export const tatCaCn = (allowed: string[] | null, all: string[]) => (allowed ? all.join(',') : '');
/**
 * Bộ lọc chi nhánh khi cắt theo chi nhánh làm việc: giá trị rỗng ('' = tất cả) hoặc có mã ngoài nhánh thì tự đổi thành các mã trong nhánh —
 * báo cáo không lấy số của chi nhánh ngoài nhánh đang làm việc.
 */
export function useGioiHanCn(value: string, onChange: ((v: string) => void) | undefined, all: string[], allowed: string[] | null, none = '-') {
  useEffect(() => {
    if (!allowed || !onChange || !all.length || value === none) return;
    const cur = value ? value.split(',') : [];
    const ok = cur.filter((c) => all.includes(c));
    if (!value || ok.length !== cur.length) onChange((ok.length ? ok : all).join(','));
  }, [allowed?.join(','), all.join(','), value]); // eslint-disable-line react-hooks/exhaustive-deps
}
