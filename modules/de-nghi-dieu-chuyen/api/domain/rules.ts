/**
 * Luật thuần của đề nghị điều chuyển (NT-BH-056) — không đọc CSDL, test được riêng (test/rules.test.ts).
 * Giữ đúng hành vi máy bán cũ (tgs_pos TGS_POS_Ajax_PO_Request): dòng có mã + SL > 0, SL cộng theo mã ≤ tồn kho xuất, hạn dùng đúng dạng,
 * chi nhánh nhận bắt buộc; sửa chỉ khi còn chờ duyệt (máy bán: chỉ đề nghị của chính cửa hàng, lập hôm nay).
 */
// [2026-11-28 10:00 AM Võ Hoàng] NGHIEM-THU — NT-BH-056: luật đề nghị điều chuyển (đóng góp)

export type Status = 'pending' | 'approved' | 'converted' | 'rejected' | 'cancelled';
export const STATUS_LABEL: Record<Status, string> = {
  pending: 'Chờ duyệt', approved: 'Đang lập chuyển kho', converted: 'Đã lập chuyển kho', rejected: 'Từ chối', cancelled: 'Đã huỷ',
};

export type LineIn = { sku: string; name?: string; unit?: string; qty: number; unitPrice?: number; note?: string; lotNo?: string; expDate?: string };
export type Line = { lineKey: string; sku: string; name: string; unit: string; qty: number; stock: number; unitPrice: number | null; note: string; lotNo: string; expDate: string | null };
export type Finding = { field: string; code: string; title: string; level: 'block' };

/** Tháng yyMM của ngày YYYY-MM-DD. */
export const periodOf = (date: string) => `${date.slice(2, 4)}${date.slice(5, 7)}`;
/** Số đề nghị DNDC-<chi nhánh>-<yyMM>-<4 số>. */
export const formatNo = (branch: string, period: string, n: number) => `DNDC-${branch}-${period}-${String(n).padStart(4, '0')}`;

/** Ngày hôm nay theo giờ Việt Nam (YYYY-MM-DD). */
export const vnToday = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

/** Hạn dùng: yyyy-mm-dd hoặc dd/mm/yyyy → yyyy-mm-dd; trống → null; sai dạng → undefined. */
export function normalizeExp(raw: string | undefined | null): string | null | undefined {
  const s = (raw ?? '').trim();
  if (!s) return null;
  let y: number; let m: number; let d: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const vn = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (iso) { y = +iso[1]!; m = +iso[2]!; d = +iso[3]!; } else if (vn) { y = +vn[3]!; m = +vn[2]!; d = +vn[1]!; } else return undefined;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return undefined;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/**
 * Chuẩn hoá + kiểm dòng: bỏ dòng thiếu mã hoặc SL ≤ 0 (như máy bán cũ), kiểm hạn dùng, mã có trong danh mục, SL cộng theo mã ≤ tồn kho xuất.
 * @param names tên / ĐVT nhỏ nhất theo danh mục (mã không có → chặn)
 * @param stock tồn kho xuất theo mã (ĐVT nhỏ nhất)
 */
export function checkLines(input: readonly LineIn[], names: ReadonlyMap<string, { name: string; unit: string; active: boolean }>, stock: ReadonlyMap<string, number>) {
  const findings: Finding[] = [];
  const kept = input.map((l, i) => ({ l, i })).filter(({ l }) => l.sku.trim() !== '' && Number(l.qty) > 0);
  if (!kept.length) findings.push({ field: 'lines', code: 'DNDC_NO_LINES', title: 'Đề nghị chưa có dòng hàng hợp lệ (mã + số lượng > 0)', level: 'block' });
  const lines: Line[] = [];
  const sum = new Map<string, number>();
  kept.forEach(({ l, i }, n) => {
    const sku = l.sku.trim();
    const exp = normalizeExp(l.expDate);
    if (exp === undefined) findings.push({ field: `lines[${i}].expDate`, code: 'DNDC_EXP_FORMAT', title: `Dòng ${i + 1}: hạn dùng phải theo dạng dd/mm/yyyy hoặc yyyy-mm-dd`, level: 'block' });
    const cat = names.get(sku);
    if (!cat) findings.push({ field: `lines[${i}].sku`, code: 'DNDC_SKU_UNKNOWN', title: `Dòng ${i + 1}: mã ${sku} không có trong danh mục mặt hàng`, level: 'block' });
    else if (!cat.active) findings.push({ field: `lines[${i}].sku`, code: 'DNDC_SKU_INACTIVE', title: `Dòng ${i + 1}: mã ${sku} đã ngừng theo dõi`, level: 'block' });
    sum.set(sku, round4((sum.get(sku) ?? 0) + Number(l.qty)));
    lines.push({
      lineKey: `L${n + 1}`, sku, name: (l.name ?? '').trim() || cat?.name || sku, unit: cat?.unit || (l.unit ?? '').trim(), qty: round4(Number(l.qty)),
      stock: stock.get(sku) ?? 0, unitPrice: l.unitPrice === undefined || l.unitPrice === null || !Number.isFinite(Number(l.unitPrice)) ? null : Number(l.unitPrice),
      note: (l.note ?? '').trim(), lotNo: (l.lotNo ?? '').trim(), expDate: exp ?? null,
    });
  });
  for (const [sku, qty] of sum) {
    const have = stock.get(sku) ?? 0;
    if (qty > have) {
      const i = kept.find(({ l }) => l.sku.trim() === sku)?.i ?? 0;
      findings.push({ field: `lines[${i}].qty`, code: 'DNDC_OVER_STOCK', title: `Sản phẩm ${sku} chỉ còn ${have}, không thể điều chuyển ${qty}`, level: 'block' });
    }
  }
  return { lines, findings, totalItems: lines.length, totalQty: round4(lines.reduce((s, l) => s + l.qty, 0)) };
}

/** Chi nhánh nhận được chọn: cùng chi nhánh cha (anh em) + chính chi nhánh cha; bỏ chi nhánh đang lập. Không có cha → các chi nhánh gốc khác. */
export function receiveCandidates(branch: string, all: readonly { code: string; name: string; parentCode: string | null; active: boolean }[]) {
  const me = all.find((b) => b.code === branch);
  const parent = me?.parentCode ?? null;
  const active = all.filter((b) => b.active && b.code !== branch);
  const list = parent
    ? active.filter((b) => b.parentCode === parent || b.code === parent)
    : active.filter((b) => !b.parentCode);
  return list.map((b) => ({ code: b.code, name: b.name, isParent: b.code === parent }))
    .sort((a, b) => Number(b.isParent) - Number(a.isParent) || a.code.localeCompare(b.code));
}

/** Ai sửa / huỷ được đề nghị đang chờ: người có quyền duyệt (kế toán) mọi lúc; người lập khác thì chỉ đề nghị của chi nhánh mình, lập hôm nay. */
export function canChange(p: { status: Status; branchCode: string; docDate: string }, who: { approver: boolean; branches: readonly string[] | null; today: string }) {
  if (p.status !== 'pending') return { ok: false, why: `Đề nghị đang ở trạng thái "${STATUS_LABEL[p.status]}" — chỉ sửa / huỷ đề nghị Chờ duyệt` };
  if (who.approver) return { ok: true, why: '' };
  if (who.branches && !who.branches.includes(p.branchCode)) return { ok: false, why: `Đề nghị của chi nhánh ${p.branchCode} — chỉ sửa / huỷ đề nghị của chi nhánh mình` };
  if (p.docDate !== who.today) return { ok: false, why: 'Chỉ sửa / huỷ đề nghị lập hôm nay — đề nghị cũ nhờ người duyệt xử lý' };
  return { ok: true, why: '' };
}
