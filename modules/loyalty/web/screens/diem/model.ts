// [2026-11-25 09:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-039: kiểu dữ liệu + tiện ích chung của các thẻ khai chính sách tích điểm (BH19) (đóng góp)
import { useEffect } from 'react';

export const M = '/api/v1/m/loyalty';

export type Rules = Record<string, unknown>;
export type Policy = {
  id: number; code: string; title: string; type: number; priority: number; status: number; autoApply: boolean;
  startDate: number; endDate: number; applyToBlogIds: number[]; rules: Rules;
};
export type Tier = { key: string; name: string; minPoints: number; multiplier: number };
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
