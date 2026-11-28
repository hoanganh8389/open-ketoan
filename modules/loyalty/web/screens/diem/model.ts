// [2026-11-25 09:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-039: kiểu dữ liệu + tiện ích chung của các thẻ khai chính sách tích điểm (BH19) (đóng góp)
import { useEffect } from 'react';

export const M = '/api/v1/m/loyalty';

export type Rules = Record<string, unknown>;
export type Policy = {
  id: number; code: string; title: string; type: number; priority: number; status: number; autoApply: boolean;
  startDate: number; endDate: number; applyToBlogIds: number[]; rules: Rules; notes?: string;
};
export type Tier = { key: string; name: string; minPoints: number; multiplier: number; color?: string };
export type Settings = { enablePosEarn: boolean; enablePosRedeem: boolean; enableTierMultiplier: boolean; minRedeemPoints: number; pointLabel: string };
export type Content = { settings: Settings; tiers: Tier[]; policies: Policy[] };
export type LogRow = { action: string; actorName: string; note: string; at: string };
export type Draft = {
  id: string; branchCode: string; program: Content; baseVersion: string | null; batchId: string | null; revision: number;
  status: 'draft' | 'pending' | 'published' | 'rejected'; createdBy: string; createdByName: string; updatedByName: string; updatedAt: string;
  approvedByName: string; rejectReason: string; publishedVersion: string | null; log?: LogRow[];
};
export type Adjustment = {
  id: string; code: string; customerCode: string; points: number; reason: string; branchCode: string | null; status: 'pending' | 'approved' | 'rejected';
  createdBy: string; createdByName: string; createdAt: string; approvedByName: string; rejectReason: string;
};
/** Lỗi ô từ máy chủ: đường dẫn ô → lời nhắc. */
export type FieldErrors = Record<string, string>;

export const PERM = {
  lap: 'loyalty:chinh-sach-lap', sua: 'loyalty:chinh-sach-sua', duyet: 'loyalty:chinh-sach-duyet',
  dcLap: 'loyalty:dieu-chinh-lap', dcDuyet: 'loyalty:dieu-chinh-duyet',
} as const;

export const TYPE_LABEL: Record<number, string> = {
  1: 'Theo tiền (điểm / số tiền)', 2: 'Theo mã hàng', 3: 'Nhân điểm', 4: 'Thưởng theo mức đơn', 5: 'Đổi quà', 6: 'Đổi voucher',
};
export const STATUS_LABEL: Record<string, string> = { draft: 'Nháp', pending: 'Chờ duyệt', published: 'Đã phát hành', rejected: 'Bị từ chối', approved: 'Đã duyệt' };
export const ACTION_LABEL: Record<string, string> = { create: 'Lập', update: 'Sửa', submit: 'Gửi duyệt', approve: 'Duyệt', reject: 'Từ chối' };

/** Ngày (YYYY-MM-DD) ↔ giây "đồng hồ treo tường" như website lưu startDate / endDate (0 = không giới hạn). */
export const dayToStart = (d: string) => (d ? Math.floor(Date.parse(`${d}T00:00:00Z`) / 1000) : 0);
export const startToDay = (s: number) => (s > 0 ? new Date(s * 1000).toISOString().slice(0, 10) : '');
/** "Ngừng từ ngày D" = kết thúc cuối ngày trước D. */
export const stopDayToEnd = (d: string) => (d ? Math.floor(Date.parse(`${d}T00:00:00Z`) / 1000) - 1 : 0);
export const endToStopDay = (e: number) => (e > 0 ? new Date((e + 1) * 1000).toISOString().slice(0, 10) : '');

export const rec = (v: unknown): Rules => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rules) : {});
export const arr = (v: unknown): Rules[] => (Array.isArray(v) ? (v as Rules[]) : []);

export function newPolicy(type: number, list: Policy[]): Policy {
  const id = Math.max(0, ...list.map((p) => p.id)) + 1;
  const rules: Rules = type === 1 || type === 3 ? { earn_rate: 1, earn_unit: 10000, point_expiry_days: 365, ...(type === 3 ? { rules: { multiplier: 2 } } : {}) }
    : type === 2 || type === 4 ? { point_expiry_days: 365, rules: [] }
      : { rules: { rewards: [] } };
  return { id, code: '', title: '', type, priority: id, status: 1, autoApply: true, startDate: 0, endDate: 0, applyToBlogIds: [], rules };
}

/** Lỗi ô từ phản hồi máy chủ (details.findings — mọi lỗi một lần, Q-CHUNG-06). */
export function fieldErrorsOf(err: unknown): FieldErrors {
  const fs = (err as { details?: { findings?: { field?: string; title?: string }[] } } | null)?.details?.findings;
  const out: FieldErrors = {};
  for (const f of Array.isArray(fs) ? fs : []) if (f.field && !out[f.field]) out[f.field] = f.title ?? '';
  return out;
}
export const reasonOf = (err: unknown) => (err as { details?: { reason?: string } } | null)?.details?.reason ?? '';

/** Rời trang khi còn thay đổi chưa lưu → trình duyệt hỏi lại (Q-CHUNG-07). */
export function useLeaveGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return undefined;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);
}

/** Viền đỏ cho ô có lỗi. */
export const bad = (errs: FieldErrors, path: string) => (errs[path] ? { borderColor: 'var(--bad, #dc2626)' } : undefined);

// [2026-11-28 03:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-059: khai theo chương trình (Tất cả / chọn cửa hàng), mã tự sinh, trạng thái, mô tả loại dễ hiểu (đóng góp)
export type PolicyState = 'draft' | 'pending' | 'rejected' | 'active' | 'scheduled' | 'stopped';
export type BranchUse = { branchCode: string; state: PolicyState; published: boolean };
export type OvPolicy = Policy & { uses: BranchUse[]; state: PolicyState; allBranches: boolean };
export type Branch = { code: string; name: string };
export type BranchConfig = { branchCode: string; settings: Settings | null; tiers: Tier[]; version: string | null; draftStatus: string | null };
export type Overview = { branches: Branch[]; policies: OvPolicy[]; settings: BranchConfig[]; pending: number };
/** Áp dụng cho: tất cả cửa hàng đang hoạt động, hoặc danh sách chọn. */
export type Target = { all: boolean; branchCodes: string[] };
export type SaveMode = 'draft' | 'submit' | 'approve';

/** Nhãn + lớp badge Core theo trạng thái chương trình. */
export const STATE_BADGE: Record<PolicyState, { label: string; cls: string; tip: string }> = {
  draft: { label: 'Nháp', cls: 'badge', tip: 'Đã ghi, chưa gửi duyệt — máy bán chưa áp' },
  pending: { label: 'Chờ duyệt', cls: 'badge badge-warn', tip: 'Đã gửi — chờ người có quyền duyệt; máy bán vẫn tính theo bản cũ' },
  rejected: { label: 'Bị từ chối', cls: 'badge badge-bad', tip: 'Người duyệt trả lại — sửa rồi gửi lại' },
  active: { label: 'Đang áp', cls: 'badge badge-ok', tip: 'Máy bán đang tính theo chương trình này' },
  scheduled: { label: 'Chờ ngày áp', cls: 'badge badge-info', tip: 'Đã phát hành, chưa tới ngày bắt đầu' },
  stopped: { label: 'Ngừng', cls: 'badge', tip: 'Đã ngừng / hết hạn / bỏ tích Đang chạy' },
};

/** Mô tả loại bằng lời thường (hộp chọn loại). */
export const TYPE_HINT: Record<number, string> = {
  1: 'Cứ mỗi số tiền mua được bấy nhiêu điểm — vd 1 điểm cho mỗi 10.000đ.',
  2: 'Mua mã hàng nào được cộng điểm cố định theo số lượng — vd mỗi lon Dielac +5 điểm.',
  3: 'Nhân điểm theo tiền trong một dịp — vd x2 điểm dịp Tết.',
  4: 'Đơn đạt mức tiền được thưởng thêm điểm — vd đơn từ 1 triệu +10 điểm.',
  5: 'Khách dùng điểm đổi quà (mặt hàng ở danh mục), có thể giới hạn theo hạng.',
  6: 'Khách dùng điểm đổi voucher giảm tiền / % cho lần mua sau.',
};
export const EARN_TYPES = [1, 2, 3, 4] as const;
export const REDEEM_TYPES = [5, 6] as const;

export const vnToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/** Mã kế tiếp của tháng: <TIỀN TỐ>_<MMYY>_<NN> (TD = tích điểm, DD = đổi điểm), NN = số lớn nhất đang có + 1; vẫn sửa được. */
export function nextLoyaltyCode(codes: readonly string[], today: string, prefix: 'TD' | 'DD'): string {
  const mmyy = `${today.slice(5, 7)}${today.slice(2, 4)}`;
  const re = new RegExp(`^${prefix}_${mmyy}_([0-9]+)$`, 'i');
  const max = codes.reduce((m, k) => { const x = re.exec(k.trim()); return x ? Math.max(m, Number(x[1])) : m; }, 0);
  return `${prefix}_${mmyy}_${String(max + 1).padStart(2, '0')}`;
}

/** Áp dụng cho hiện tại của một chương trình: các cửa hàng còn áp (không tính nơi đã ngừng). */
export const targetOf = (p: OvPolicy): Target => (p.allBranches
  ? { all: true, branchCodes: [] }
  : { all: false, branchCodes: p.uses.filter((u) => u.state !== 'stopped').map((u) => u.branchCode) });

/** Tóm tắt cách tính một dòng cho bảng. */
export function ruleSummary(p: Policy): string {
  const r = p.rules;
  const n = (v: unknown) => Number(v ?? 0).toLocaleString('vi-VN');
  switch (p.type) {
    case 1: return `${n(r.earn_rate)} điểm / ${n(r.earn_unit)}đ`;
    case 2: return `${arr(r.rules).length} mã hàng`;
    case 3: return `x${n(rec(r.rules).multiplier ?? 2)} (${n(r.earn_rate)} điểm / ${n(r.earn_unit)}đ)`;
    case 4: return arr(r.rules).map((x) => `từ ${n(x.min_amount)}đ +${n(x.bonus_points)}`).join(' · ') || 'chưa có mức';
    default: { const w = arr(rec(r.rules).rewards); return w.length ? w.map((x) => `${String(x.name ?? x.reward_code ?? '')} ${n(x.points_required)} điểm`).slice(0, 3).join(' · ') + (w.length > 3 ? ` +${w.length - 3}` : '') : 'chưa có phần thưởng'; }
  }
}
