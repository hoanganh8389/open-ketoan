// [2026-11-27 Võ Hoàng] NGHIEM-THU — NT-BH-051: thẻ Thành viên — danh sách khách có điểm (như admin-views/members.php) (đóng góp)
/**
 * GET /api/v1/m/loyalty/members?q=&tier=&page=&pageSize= — mỗi khách có sổ điểm một dòng: mã, tên, SĐT (danh mục đối tượng), hạng (theo
 * tổng đã tích, bảng hạng chính sách mới nhất), điểm hiện tại, tổng tích, tổng đổi. Tìm theo mã / tên / SĐT (không dấu), lọc hạng, chia trang.
 */
import { defineAction, z } from '@bizcity/module-sdk';
import { filterMembers, memberRows } from '../domain/members.js';
import { normalizeTiers } from '../domain/engine.js';
import { latestAnyProgram, memberAggs, partnersByCodes } from '../store.js';

export default defineAction({
  id: 'loyalty.member.list', title: 'Danh sách thành viên có điểm', tags: ['Điểm thành viên'],
  permission: 'loyalty:read', effect: 'read', idempotency: 'none',
  input: z.object({
    q: z.string().trim().max(100).optional(), tier: z.string().trim().max(50).optional(),
    page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(500).default(50),
  }),
  output: z.record(z.unknown()),
  expose: { http: { method: 'GET', path: '/members' }, mcp: false, ai: 'read' },
  handler: async (ctx, i) => ctx.data.module(async (tx) => {
    const program = await latestAnyProgram(tx);
    const tiers = program?.program.tiers ?? [];
    const aggs = await memberAggs(tx);
    const partners = await partnersByCodes(tx, aggs.map((a) => a.partnerCode));
    const r = filterMembers(memberRows(aggs, partners, tiers), { ...(i.q ? { q: i.q } : {}), ...(i.tier ? { tier: i.tier } : {}), page: i.page, pageSize: i.pageSize });
    return { ...r, tiers: normalizeTiers(tiers).map((t) => ({ key: t.key, name: t.name, color: t.color ?? '' })) };
  }),
});
