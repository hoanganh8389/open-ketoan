// [2026-11-25 09:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-039: kiểm nội dung nháp chính sách tích điểm, phiên bản = băm nội dung, áp cho nhiều cửa hàng (đóng góp)
/**
 * Hàm thuần của nháp chính sách tích điểm (không I/O). Nội dung vẫn là khuôn LoyaltyProgram (settings, tiers, policies loại 1–6) nên
 * máy bán và bộ tính (engine.ts) không đổi. Kiểm trả MỌI lỗi một lần (Q-CHUNG-06), mỗi lỗi chỉ đúng ô (`field`) và có mã riêng.
 */
import { createHash } from 'node:crypto';
import type { LoyaltyPolicy, LoyaltyProgram } from './engine.js';

/** Nội dung soạn được (version gán lúc phát hành). */
export type ProgramContent = Omit<LoyaltyProgram, 'version'>;
export type Finding = { code: string; field: string; title: string };

export const DRAFT_CODES = {
  /** Mã chính sách trùng trong cùng cửa hàng (Q-DM-02). */
  codeDup: 'LOYALTY_POLICY_CODE_DUP',
  /** Thiếu / sai một ô bắt buộc. */
  required: 'LOYALTY_FIELD_REQUIRED',
  /** Chính sách đã phát hành bị bỏ khỏi nháp — chỉ được "Ngừng từ ngày" (Q-DM-01). */
  removed: 'LOYALTY_POLICY_REMOVED',
  /** Hạng trùng khoá / hạng tối thiểu của quà không có trong bảng hạng. */
  tier: 'LOYALTY_TIER_INVALID',
  /** Mã hàng quà không có hoặc đã ngừng ở danh mục (Q-CHUNG-08). */
  item: 'LOYALTY_ITEM_INACTIVE',
} as const;

export const DEFAULT_CONTENT: ProgramContent = {
  settings: { enablePosEarn: true, enablePosRedeem: true, enableTierMultiplier: false, minRedeemPoints: 0, pointLabel: 'điểm' },
  tiers: [{ key: 'member', name: 'Thành viên', minPoints: 0, multiplier: 1 }],
  policies: [],
};

const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Mã hàng quà (loại 5) cần kiểm ở danh mục. */
export function giftSkus(p: Pick<ProgramContent, 'policies'>): string[] {
  const out = new Set<string>();
  for (const pol of p.policies) if (pol.type === 5) for (const r of arr(rec(rec(pol.rules).rules).rewards)) { const s = text(rec(r).sku); if (s) out.add(s); }
  return [...out];
}

/**
 * Kiểm nội dung nháp. `base`: bản đang chạy của cửa hàng (để chặn bỏ chính sách đã phát hành); `activeSkus`: mã hàng đang dùng
 * trong các mã quà của nháp (undefined = không kiểm danh mục).
 */
export function checkProgram(p: ProgramContent, base: Pick<ProgramContent, 'policies'> | null, activeSkus?: ReadonlySet<string>): Finding[] {
  const f: Finding[] = [];
  const add = (code: string, field: string, title: string) => f.push({ code, field, title });
  if (!text(p.settings.pointLabel)) add(DRAFT_CODES.required, 'settings.pointLabel', 'Nhập tên gọi điểm (vd "điểm")');
  if (!(num(p.settings.minRedeemPoints) >= 0)) add(DRAFT_CODES.required, 'settings.minRedeemPoints', 'Điểm tối thiểu để đổi phải ≥ 0');

  const tierKeys = new Set<string>();
  if (!p.tiers.length) add(DRAFT_CODES.tier, 'tiers', 'Cần ít nhất một hạng (vd Thành viên, từ 0 điểm)');
  p.tiers.forEach((t, i) => {
    const key = text(t.key);
    if (!key) add(DRAFT_CODES.required, `tiers.${i}.key`, `Hạng dòng ${i + 1}: nhập mã hạng`);
    else if (tierKeys.has(key)) add(DRAFT_CODES.tier, `tiers.${i}.key`, `Mã hạng ${key} trùng — mỗi hạng một mã`);
    tierKeys.add(key);
    if (!text(t.name)) add(DRAFT_CODES.required, `tiers.${i}.name`, `Hạng dòng ${i + 1}: nhập tên hạng`);
    if (!(num(t.minPoints) >= 0)) add(DRAFT_CODES.required, `tiers.${i}.minPoints`, `Hạng ${key || i + 1}: điểm tối thiểu phải ≥ 0`);
    if (!(num(t.multiplier) > 0)) add(DRAFT_CODES.required, `tiers.${i}.multiplier`, `Hạng ${key || i + 1}: hệ số nhân phải > 0`);
  });

  const codes = new Map<string, number>();
  const ids = new Set<number>();
  p.policies.forEach((pol, i) => {
    const at = `policies.${i}`;
    const code = text(pol.code);
    if (!code) add(DRAFT_CODES.required, `${at}.code`, `Chính sách dòng ${i + 1}: nhập mã`);
    else if (codes.has(code.toUpperCase())) add(DRAFT_CODES.codeDup, `${at}.code`, `Mã chính sách ${code} trùng với dòng ${codes.get(code.toUpperCase())! + 1} — đặt mã khác`);
    else codes.set(code.toUpperCase(), i);
    if (ids.has(pol.id)) add(DRAFT_CODES.codeDup, `${at}.id`, `Chính sách ${code}: số thứ tự ${pol.id} trùng`);
    ids.add(pol.id);
    if (!text(pol.title)) add(DRAFT_CODES.required, `${at}.title`, `Chính sách ${code || i + 1}: nhập tên`);
    if (pol.startDate > 0 && pol.endDate > 0 && pol.endDate < pol.startDate) add(DRAFT_CODES.required, `${at}.endDate`, `Chính sách ${code}: ngày kết thúc trước ngày bắt đầu`);
    const rules = rec(pol.rules);
    const name = code || `dòng ${i + 1}`;
    if (pol.type === 1 || pol.type === 3) {
      if (!(num(rules.earn_unit) > 0)) add(DRAFT_CODES.required, `${at}.rules.earn_unit`, `Chính sách ${name}: số tiền cho mỗi lần tích phải > 0`);
      if (!(num(rules.earn_rate) > 0)) add(DRAFT_CODES.required, `${at}.rules.earn_rate`, `Chính sách ${name}: số điểm mỗi lần tích phải > 0`);
      if (pol.type === 3 && !(num(rec(rules.rules).multiplier) > 1)) add(DRAFT_CODES.required, `${at}.rules.rules.multiplier`, `Chính sách ${name}: hệ số nhân điểm phải > 1`);
    } else if (pol.type === 2) {
      const rows = arr(rules.rules);
      if (!rows.length) add(DRAFT_CODES.required, `${at}.rules.rules`, `Chính sách ${name}: thêm ít nhất một mã hàng và số điểm`);
      rows.forEach((r, j) => {
        if (!text(rec(r).sku)) add(DRAFT_CODES.required, `${at}.rules.rules.${j}.sku`, `Chính sách ${name}, dòng ${j + 1}: chọn mã hàng`);
        if (!(num(rec(r).points) > 0)) add(DRAFT_CODES.required, `${at}.rules.rules.${j}.points`, `Chính sách ${name}, dòng ${j + 1}: số điểm phải > 0`);
      });
    } else if (pol.type === 4) {
      const rows = arr(rules.rules);
      if (!rows.length) add(DRAFT_CODES.required, `${at}.rules.rules`, `Chính sách ${name}: thêm ít nhất một mức đơn và điểm thưởng`);
      rows.forEach((r, j) => {
        if (!(num(rec(r).min_amount) >= 0)) add(DRAFT_CODES.required, `${at}.rules.rules.${j}.min_amount`, `Chính sách ${name}, mức ${j + 1}: mức đơn phải ≥ 0`);
        if (!(num(rec(r).bonus_points) > 0)) add(DRAFT_CODES.required, `${at}.rules.rules.${j}.bonus_points`, `Chính sách ${name}, mức ${j + 1}: điểm thưởng phải > 0`);
      });
    } else if (pol.type === 5 || pol.type === 6) {
      const rewards = arr(rec(rules.rules).rewards);
      if (!rewards.length) add(DRAFT_CODES.required, `${at}.rules.rules.rewards`, `Chính sách ${name}: thêm ít nhất một ${pol.type === 5 ? 'quà' : 'voucher'}`);
      const rcodes = new Set<string>();
      rewards.forEach((raw, j) => {
        const r = rec(raw);
        const w = `${at}.rules.rules.rewards.${j}`;
        const rn = text(r.name) || `dòng ${j + 1}`;
        if (!text(r.name)) add(DRAFT_CODES.required, `${w}.name`, `Chính sách ${name}, phần thưởng ${j + 1}: nhập tên`);
        const rc = text(r.reward_code).toLowerCase();
        if (!rc) add(DRAFT_CODES.required, `${w}.reward_code`, `Phần thưởng ${rn}: nhập mã phần thưởng`);
        else if (rcodes.has(rc)) add(DRAFT_CODES.codeDup, `${w}.reward_code`, `Phần thưởng ${rn}: mã ${rc} trùng trong chính sách`);
        rcodes.add(rc);
        if (!(Number.isInteger(num(r.points_required)) && num(r.points_required) > 0)) add(DRAFT_CODES.required, `${w}.points_required`, `Phần thưởng ${rn}: số điểm đổi phải là số nguyên > 0`);
        const minTier = text(r.min_tier);
        if (minTier && tierKeys.size && !tierKeys.has(minTier)) add(DRAFT_CODES.tier, `${w}.min_tier`, `Phần thưởng ${rn}: hạng tối thiểu ${minTier} không có trong bảng hạng`);
        if (pol.type === 5) {
          const sku = text(r.sku);
          if (!sku) add(DRAFT_CODES.required, `${w}.sku`, `Quà ${rn}: chọn mã hàng quà`);
          else if (activeSkus && !activeSkus.has(sku)) add(DRAFT_CODES.item, `${w}.sku`, `Quà ${rn}: mã hàng ${sku} không có hoặc đã ngừng ở danh mục mặt hàng`);
          if (!(num(r.quantity ?? 1) >= 1)) add(DRAFT_CODES.required, `${w}.quantity`, `Quà ${rn}: số lượng phải ≥ 1`);
        } else {
          if (!(num(r.discount_value) > 0)) add(DRAFT_CODES.required, `${w}.discount_value`, `Voucher ${rn}: giá trị giảm phải > 0`);
          if (r.discount_type === 'percent' && num(r.discount_value) > 100) add(DRAFT_CODES.required, `${w}.discount_value`, `Voucher ${rn}: giảm theo % không quá 100`);
        }
      });
    }
  });

  // Q-DM-01: chính sách đã phát hành không xoá — chỉ "Ngừng từ ngày" (bản mới có ngày kết thúc).
  for (const old of base?.policies ?? []) {
    if (!p.policies.some((x) => text(x.code).toUpperCase() === text(old.code).toUpperCase())) {
      add(DRAFT_CODES.removed, 'policies', `Chính sách ${old.code} đã phát hành — không xoá được, đặt "Ngừng từ ngày" thay cho xoá`);
    }
  }
  return f;
}

/** JSON khoá xếp theo thứ tự — băm ổn định. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}

/** Phiên bản phát hành = băm nội dung (kèm mã site): cùng nội dung → cùng phiên bản. */
export function contentVersion(p: ProgramContent, storeId: number): string {
  return `kt-${createHash('sha256').update(stable({ storeId, settings: p.settings, tiers: p.tiers, policies: p.policies })).digest('hex').slice(0, 16)}`;
}

/** Bỏ trường version khỏi chương trình đang chạy (nháp đầu tiên chép từ bản hiện hành — Q3). */
export function contentOf(p: LoyaltyProgram | ProgramContent): ProgramContent {
  const { version: _v, ...rest } = p as LoyaltyProgram;
  return rest;
}

/**
 * Áp chính sách cho nhiều cửa hàng một lần: cài đặt + bảng hạng lấy theo nội dung áp; chính sách gộp theo mã vào bản đang chạy của
 * từng cửa hàng (cùng mã → thay, mã mới → thêm; số thứ tự trùng với chính sách khác thì cấp số mới). Chính sách riêng của cửa hàng giữ nguyên.
 */
export function mergeInto(base: ProgramContent | null, apply: ProgramContent): ProgramContent {
  if (!base) return apply;
  const policies: LoyaltyPolicy[] = [...base.policies];
  for (const pol of apply.policies) {
    const i = policies.findIndex((x) => x.code.toUpperCase() === pol.code.toUpperCase());
    if (i >= 0) { policies[i] = { ...pol, id: policies[i]!.id }; continue; }
    const id = policies.some((x) => x.id === pol.id) ? Math.max(0, ...policies.map((x) => x.id)) + 1 : pol.id;
    policies.push({ ...pol, id });
  }
  return { ...base, settings: apply.settings, tiers: apply.tiers, policies };
}
