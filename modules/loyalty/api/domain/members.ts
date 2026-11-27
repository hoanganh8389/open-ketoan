// [2026-11-27 Võ Hoàng] NGHIEM-THU — NT-BH-051: thẻ Thành viên như admin-views/members.php của plugin cũ (đóng góp)
/**
 * Hàm thuần của thẻ Thành viên (BH19):
 * - memberRows: mỗi khách có sổ điểm một dòng — điểm hiện tại, tổng tích, tổng đổi, hạng (theo tổng đã tích như máy bán).
 * - filterMembers: tìm theo mã / tên / SĐT, lọc hạng, chia trang (như ô Tìm kiếm + Hạng + Trước / Sau của plugin cũ).
 * - historyRows: lịch sử điểm của một khách, mỗi dòng có điểm TRƯỚC / SAU (cột Trước / Sau của plugin cũ), mới nhất trước.
 */
import { determineTier, normalizeTiers, type LoyaltyTier } from './engine.js';
import { totalEarnedOf, type LedgerEntry, type LedgerKind } from './ledger.js';

export type MemberAgg = { partnerCode: string; balance: number; earned: number; reversed: number; redeemed: number; lastAt: string };
export type PartnerInfo = { code: string; name: string; phone: string };
export type MemberRow = {
  customerCode: string; name: string; phone: string; tierKey: string; tierName: string; tierColor: string;
  balance: number; totalEarned: number; totalRedeemed: number; lastAt: string;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function memberRows(aggs: readonly MemberAgg[], partners: ReadonlyMap<string, PartnerInfo>, tiers: readonly LoyaltyTier[]): MemberRow[] {
  const list = normalizeTiers(tiers);
  return aggs.map((a) => {
    // Tổng đã tích = tích + hoàn (hoàn là số âm) — cùng cách totalEarnedOf (hạng không tụt khi đổi điểm).
    const totalEarned = round2(a.earned + a.reversed);
    const tierKey = determineTier(list, totalEarned);
    const tier = list.find((t) => t.key === tierKey);
    const p = partners.get(a.partnerCode);
    return {
      customerCode: a.partnerCode, name: p?.name ?? '', phone: p?.phone ?? '', tierKey, tierName: tier?.name ?? tierKey, tierColor: tier?.color ?? '',
      balance: round2(a.balance), totalEarned, totalRedeemed: round2(a.redeemed), lastAt: a.lastAt,
    };
  });
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

export function filterMembers(rows: readonly MemberRow[], f: { q?: string; tier?: string; page: number; pageSize: number }) {
  const q = fold((f.q ?? '').trim());
  const hit = rows.filter((r) => (!f.tier || r.tierKey === f.tier)
    && (!q || fold(r.customerCode).includes(q) || fold(r.name).includes(q) || fold(r.phone).includes(q)))
    .sort((a, b) => b.balance - a.balance || a.customerCode.localeCompare(b.customerCode));
  const pages = Math.max(1, Math.ceil(hit.length / f.pageSize));
  const page = Math.min(Math.max(1, f.page), pages);
  return { total: hit.length, page, pages, pageSize: f.pageSize, items: hit.slice((page - 1) * f.pageSize, page * f.pageSize) };
}

export const KIND_LABEL: Record<LedgerKind, string> = {
  earn: 'Tích điểm', redeem: 'Đổi điểm', expire: 'Hết hạn', reverse: 'Hoàn khi trả hàng', adjust: 'Điều chỉnh tay',
};

export type HistoryRow = {
  id: string; at: string; kind: LedgerKind; kindLabel: string; points: number; before: number; after: number;
  refCode: string; branchCode: string; description: string; expiresAt: string | null;
};

/** Lịch sử có số dư trước / sau từng dòng (cộng dồn theo thời gian), trả mới nhất trước. */
export function historyRows(entries: readonly (LedgerEntry & { branchCode?: string | null })[]): HistoryRow[] {
  let run = 0;
  const out: HistoryRow[] = [];
  for (const e of [...entries].sort((a, b) => a.at.localeCompare(b.at))) {
    const before = run;
    run = round2(run + e.points);
    const meta = (e as { meta?: Record<string, unknown> }).meta ?? {};
    const reason = typeof meta.reason === 'string' ? meta.reason : '';
    out.push({
      id: e.id, at: e.at, kind: e.kind, kindLabel: KIND_LABEL[e.kind] ?? e.kind, points: e.points, before, after: run,
      refCode: e.ref?.code ?? '', branchCode: e.branchCode ?? '', expiresAt: e.expiresAt ?? null,
      description: [reason, e.note ?? ''].filter(Boolean).join(' · '),
    });
  }
  return out.reverse();
}

/** Tổng đã tích của một khách (để kiểm hạng trong lịch sử). */
export const totalEarned = (entries: readonly LedgerEntry[]) => totalEarnedOf(entries);
