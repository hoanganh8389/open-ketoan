# NT-BH-062 · Mặt hàng tạo / sửa ở kế toán về website ngay
<!-- [2026-11-28 08:50 PM Võ Hoàng] NGHIEM-THU — tạo phiếu (đóng góp). -->

| | |
|---|---|
| Phân hệ | Bán hàng (website TGS nối qua app `tgs-wp`); Danh mục |
| Màn hình | DM10 Mặt hàng, DM11 Nhóm hàng; HT Ứng dụng (kết nối app Website bán hàng TGS); website: máy bán POS |
| Bộ phận yêu cầu | Bán hàng |
| Ngày tạo | 28/11/2026 |
| Trạng thái | Đã chốt — Hoàng 28/11: mặt hàng tạo ở kế toán "về ngay qua webhook", không chờ lịch kéo 5 phút |
| Trụ cột / tiêu chí | không đổi mức trụ cột (sửa đường báo danh mục đổi) |

## 1. Mục đích quản trị
Từ 28/11 danh mục hàng chỉ khai ở kế toán (website chỉ đọc). Kế toán tạo mặt hàng mới ở DM10 thì thu ngân phải thấy và bán được
ngay trên máy bán. Thử thật trên máy local (báo cáo 95, lỗi 5): mặt hàng mới chỉ về website khi lịch kéo 5 phút của website chạy —
trên máy chủ không có cron thật, lịch đó chỉ chạy khi có người mở trang, có lúc chậm hơn 14 phút.

Nguyên nhân: kế toán đã phát sự kiện `bizcity.masterdata.catalog.changed` mỗi lần đổi danh mục, nhưng chỉ báo theo kết nối cổng
chờ ở ACC14. Website TGS nối với kế toán qua app `tgs-wp` (webhook) — đường chứng từ bán về website — nên không được báo.

## 2. Khai báo trước
- Đơn vị đã kết nối app "Website bán hàng TGS (WordPress)" (`tgs-wp`), webhook trỏ tới website (`APP_WEBHOOK_URL_TGS_WP`).
- Kết nối có từ trước bản này (app 0.1.0): chủ đơn vị bấm **Đồng ý lại** ở màn Ứng dụng (POST /api/v1/apps/:key/scope, key = tgs-wp) để kết
  nối nhận thêm loại sự kiện mới. Chưa đồng ý lại thì vẫn chạy như cũ (chờ lịch 5 phút), không lỗi.
- Website: cầu nối open-ketoan-bridge bản có xử lý sự kiện danh mục đổi (`TGS_Acc_Ketoan_Events`).

## 3. Các bước thao tác
1. Kế toán: DM10 tạo mặt hàng mới (có ĐVT, giá ở bảng giá).
2. Kế toán gửi sự kiện danh mục đổi qua webhook app `tgs-wp` (Ứng dụng → nhật ký giao sự kiện: `tgs-wp.webhook` xong).
3. Website nhận sự kiện → kéo danh mục ngay (không chờ lịch).
4. Máy bán: tìm mã mới → thấy mặt hàng, bán được (khi có tồn).
5. DM11: thêm nhóm con — tên ô đúng cấp: Tên ngành (cấp 1), Tên nhãn (cấp 2), Tên nhóm (cấp 3 trở xuống).

## 4. Số liệu đầu vào (test `apps/api/test/nt-bh-062-danh-muc-ve-website.test.ts`)

| Ca | Điều kiện | Thao tác |
|---|---|---|
| 1 | — | đọc manifest app `tgs-wp` |
| 2 | đơn vị chưa kết nối app | PUT /api/v1/products/:sku (mã NT062-…) |
| 3 | đã kết nối app (0.2.0) | PUT /api/v1/products/:sku (mã NT062-…) |
| 4 | kết nối cũ chưa có loại sự kiện này | đổi danh mục; rồi đồng ý lại; đổi danh mục lần nữa |

## 5. Kết quả mong đợi

| Mục | Mong đợi |
|---|---|
| Manifest | bản 0.2.0; `events.subscribes` có `bizcity.masterdata.catalog.changed` v1 |
| Ca 2 | sự kiện danh mục đổi không có việc giao cho `tgs-wp.webhook` |
| Ca 3 | có việc giao `tgs-wp.webhook` (chờ gửi), bên cạnh `catalog.notify-sales` |
| Ca 4 | trước đồng ý lại: không có việc giao; sau đồng ý lại: có |
| Website | nhận sự kiện → trả `ok`, hẹn kéo danh mục chạy ngay (lỗi kéo không làm hỏng việc nhận; lịch 5 phút vẫn là lưới an toàn) |

**Bút toán:** không có (chỉ danh mục).

## 6. Lệch chuẩn / mặc định đã áp
- M1: không sửa `catalog-notify.ts` (đường báo cổng chờ ACC14 giữ nguyên); thêm loại sự kiện vào app `tgs-wp` — dùng cơ chế webhook
  app có sẵn (ký HMAC, thử lại, dead, replay).
- M2: sự kiện gom theo khung 5 giây như cũ → sửa nhiều mặt hàng liền nhau website chỉ kéo một lần.
- M3: đổi nhãn ô tên ở form nhóm hàng DM11 theo cấp (lỗi 9 báo cáo 95) — chỉ chữ hiện, không đổi dữ liệu.

## 7. Phạm vi tệp
`apps/api/src/ung-dung/tgs-wp/bizcity.module.json`; `apps/web/src/features/catalog/NhomHangPage.tsx`;
`apps/api/test/nt-bh-062-danh-muc-ve-website.test.ts`; `apps/api/test/nt-bh-005-pos-hoan-doi.test.ts` (danh sách sự kiện app);
`docs/nghiem-thu/ban-hang/NT-BH-062-danh-muc-ve-website-ngay.md`. Website: repo open-ketoan-bridge.
