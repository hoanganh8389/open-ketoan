/**
 * Chương trình khuyến mại (phiếu NT-BH-025) — hàm thuần, không đọc CSDL: khuôn nháp, mã hàng của chương trình, cảnh báo trùng
 * (cùng mã hàng, cùng cửa hàng, giao thời gian), hạn mức lượt theo cửa hàng, lượt dùng của một đơn.
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-025: hàm thuần nháp / trùng / hạn mức khuyến mại (đóng góp)
import { z } from '@bizcity/module-sdk';

/** Khuôn khuyến mại nội tuyến của màn BH18 (Core kiểm lại nội dung khi phát hành). */
// [2026-11-27 Võ Hoàng] NGHIEM-THU — NT-BH-049: mở ba khuôn @2 (NT-BH-040) cho bản nháp — trước đây màn có loại @2 nhưng lưu bị từ chối (đóng góp)
export const PROMO_CONTRACTS = [
  'sale.promo.tiered@1', 'sale.promo.order_discount@1', 'sale.promo.order_gift@1',
  'sale.promo.combo@1', 'sale.promo.cheapest_free@1', 'sale.promo.buy_x_get_y@1',
  'sale.promo.price_lines@2', 'sale.promo.buy_x_get_y@2', 'sale.promo.order_gift@2',
  // [2026-11-27 Võ Hoàng] NGHIEM-THU — NT-BH-049 (S-CD-16): combo bộ sản phẩm (pool) — loại 13 của plugin cũ (đóng góp)
  'sale.promo.pool_combo@2',
] as const;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');
export const quotaSchema = z.object({
  /** Số lượt (đơn) mỗi cửa hàng — áp cho mọi cửa hàng của chương trình chưa khai riêng. */
  perBranch: z.number().int().min(0).max(1_000_000).optional(),
  /** Số lượt riêng từng cửa hàng: { "CN01": 2 }. */
  branches: z.record(z.string().trim().min(1).max(32), z.number().int().min(0).max(1_000_000)).optional(),
  // [2026-11-27 Võ Hoàng] NGHIEM-THU — NT-BH-049 (K6): số lượt tối đa mỗi khách (đơn có khách; khách lẻ không giới hạn) (đóng góp)
  perCustomer: z.number().int().min(1).max(1_000_000).optional(),
});
export type Quota = z.infer<typeof quotaSchema>;

export const draftContentSchema = z.object({
  key: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/, 'Mã khuyến mại: 2–64 ký tự chữ, số, dấu chấm, gạch'),
  ruleContract: z.enum(PROMO_CONTRACTS),
  params: z.record(z.unknown()),
  branchCodes: z.array(z.string().trim().min(1).max(32)).max(500).default([]),
  effectiveFrom: day,
  reason: z.string().trim().max(500).optional(),
  quota: quotaSchema.nullable().optional(),
});
export type DraftContent = z.infer<typeof draftContentSchema>;

/** Mã hàng chương trình xét đến; `null` = cả đơn (khuyến mại theo tổng đơn không giới hạn nhóm hàng). */
export function skusOf(contract: string, p: Record<string, unknown>): string[] | null {
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  const sku = (v: unknown) => (v && typeof v === 'object' && typeof (v as { sku?: unknown }).sku === 'string' ? [(v as { sku: string }).sku] : []);
  switch (contract) {
    case 'sale.promo.combo@1': return [...new Set((Array.isArray(p.items) ? p.items : []).flatMap(sku))];
    case 'sale.promo.buy_x_get_y@1': return [...new Set([...sku(p.buy), ...sku(p.get)])];
    // NT-BH-049: khuôn @2 — mã của dòng / mã mua + quà / mã lẻ của phạm vi; phạm vi chỉ nhóm / nhãn (không mã lẻ) coi như cả đơn.
    case 'sale.promo.price_lines@2': return [...new Set((Array.isArray(p.lines) ? p.lines : []).flatMap(sku))];
    case 'sale.promo.buy_x_get_y@2': {
      const b = (p.buy ?? {}) as { items?: unknown[] }, g = (p.get ?? {}) as { options?: unknown[] };
      const sc = list(((p.scope ?? {}) as { skus?: unknown }).skus);
      const s = [...new Set([...(b.items ?? []).flatMap(sku), ...sc])];
      return s.length ? [...new Set([...s, ...(g.options ?? []).flatMap(sku)])] : null;
    }
    case 'sale.promo.order_gift@2': { const s = list(((p.scope ?? {}) as { skus?: unknown }).skus); return s.length ? s : null; }
    case 'sale.promo.order_discount@1':
    case 'sale.promo.order_gift@1': { const s = list(p.skus); return s.length ? s : null; }
    default: return list(p.skus);
  }
}

/** Cửa sổ chiến dịch: từ max(ngày áp, validFrom) tới min(effectiveTo, validTo); trống = không hạn. */
export function windowOf(p: Record<string, unknown>, effectiveFrom: string | null, effectiveTo: string | null = null): { from: string; to: string | null } {
  const vf = typeof p.validFrom === 'string' ? p.validFrom : '';
  const vt = typeof p.validTo === 'string' ? p.validTo : null;
  const from = [vf, effectiveFrom ?? ''].sort().pop() ?? '';
  const to = [vt, effectiveTo].filter((x): x is string => Boolean(x)).sort()[0] ?? null;
  return { from, to };
}

export type PromoShape = { key: string; contract: string; params: Record<string, unknown>; branchCodes: string[]; from: string; to: string | null };
export type Overlap = { key: string; source: 'published' | 'draft'; status: string; name: string; branches: string[]; from: string; to: string | null; skus: string[] | null };

/** Hai chương trình trùng: cùng mã hàng (cả đơn coi như trùng mọi mã), cùng cửa hàng (rỗng = mọi cửa hàng), thời gian giao nhau. */
export function overlapOf(a: PromoShape, b: PromoShape): { skus: string[] | null; branches: string[] } | null {
  if (a.key === b.key) return null;
  const sa = skusOf(a.contract, a.params);
  const sb = skusOf(b.contract, b.params);
  let skus: string[] | null = null;
  if (sa && sb) {
    skus = sa.filter((s) => sb.includes(s));
    if (!skus.length) return null;
  } else skus = sa ?? sb;
  let branches: string[] = [];
  if (a.branchCodes.length && b.branchCodes.length) {
    branches = a.branchCodes.filter((x) => b.branchCodes.includes(x));
    if (!branches.length) return null;
  } else branches = a.branchCodes.length ? a.branchCodes : b.branchCodes;
  if (a.to && b.from && a.to < b.from) return null;
  if (b.to && a.from && b.to < a.from) return null;
  return { skus, branches };
}

/** Dòng hạn mức theo khách trong promo_quotas (NT-BH-049, K6) — không trùng mã cửa hàng thật. */
export const CUSTOMER_QUOTA = '@khach';

/** Hạn mức thành dòng bảng promo_quotas: cửa hàng `*` = mặc định; `@khach` = lượt mỗi khách. */
export function quotaRows(q: Quota | null | undefined): { branch: string; quota: number }[] {
  if (!q) return [];
  const rows = Object.entries(q.branches ?? {}).map(([branch, quota]) => ({ branch, quota }));
  if (q.perBranch !== undefined) rows.push({ branch: '*', quota: q.perBranch });
  if (q.perCustomer !== undefined) rows.push({ branch: CUSTOMER_QUOTA, quota: q.perCustomer });
  return rows;
}

/** Hạn mức của cửa hàng: dòng riêng, không thì dòng `*`; không có = không giới hạn (undefined). */
export function quotaFor(rows: readonly { branch_code: string; quota: number }[], branch: string): number | undefined {
  return (rows.find((r) => r.branch_code === branch && branch !== CUSTOMER_QUOTA) ?? rows.find((r) => r.branch_code === '*'))?.quota;
}

export type PromoUse = { key: string; discount: number; giftQty: number };

/** Lượt dùng của một đơn theo chương trình: dòng mang policyRef; tiền giảm = promoDiscount / discount của dòng, quà = SL dòng quà. */
export function usesOf(lines: readonly { policyRef?: { key: string } | undefined; isGift?: boolean | undefined; qty: number; discount?: number | undefined }[]): PromoUse[] {
  const m = new Map<string, PromoUse>();
  for (const l of lines) {
    const key = l.policyRef?.key;
    if (!key) continue;
    const u = m.get(key) ?? { key, discount: 0, giftQty: 0 };
    if (l.isGift) u.giftQty = Math.round((u.giftQty + l.qty) * 10_000) / 10_000;
    else u.discount += Math.max(0, l.discount ?? 0);
    m.set(key, u);
  }
  return [...m.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export type QuotaShort = { key: string; quota: number; used: number };

/** Câu báo hết lượt: "KM-BAC hết lượt ở CN01 (đã dùng 2/2)". */
export function quotaMessage(short: readonly QuotaShort[], branch: string): string {
  return `Chương trình khuyến mại hết lượt ở ${branch}: ${short.map((s) => `${s.key} (đã dùng ${s.used}/${s.quota})`).join('; ')} — bỏ khuyến mại đó khỏi đơn rồi thanh toán lại`;
}

export const DRAFT_STATUS = ['draft', 'pending', 'approved', 'published', 'rejected'] as const;
export type DraftStatus = (typeof DRAFT_STATUS)[number];
/** Trạng thái còn sửa được (nháp đang mở). */
export const EDITABLE: readonly DraftStatus[] = ['draft', 'pending', 'rejected'];
