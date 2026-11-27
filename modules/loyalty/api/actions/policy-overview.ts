// [2026-11-28 02:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-059: tổng hợp chương trình tích điểm / đổi điểm theo mã cho màn khai (đóng góp)
/**
 * GET /api/v1/m/loyalty/policies — mỗi chương trình (gom theo mã qua mọi cửa hàng): nội dung mới nhất (nháp nếu có), cửa hàng đang có và trạng
 * thái từng nơi (nháp / chờ duyệt / bị từ chối / đang áp / chưa tới ngày / ngừng), cờ áp cho tất cả cửa hàng; cài đặt + hạng từng cửa hàng;
 * danh sách cửa hàng đang dùng; số nháp chờ duyệt. Chỉ đọc.
 */
import { defineAction, z } from '@bizcity/module-sdk';
import { overview } from '../drafts.js';

export default defineAction({
  id: 'loyalty.policy.overview', title: 'Tổng hợp chương trình tích điểm theo mã', tags: ['Điểm thành viên'],
  permission: 'loyalty:read', effect: 'read', idempotency: 'none',
  input: z.object({}),
  output: z.object({ branches: z.array(z.record(z.unknown())), policies: z.array(z.record(z.unknown())), settings: z.array(z.record(z.unknown())), pending: z.number() }),
  expose: { http: { method: 'GET', path: '/policies' }, mcp: false, ai: 'read' },
  handler: async (ctx) => ctx.data.module((tx) => overview(tx)),
});
