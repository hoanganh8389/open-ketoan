# NT-MH-020 · Tồn max (MH16): bỏ chế độ "Theo mã hàng", luôn xem theo chi nhánh / shop
<!-- [2026-11-26 kiennt] NGHIEM-THU — tạo phiếu theo yêu cầu người dùng (đóng góp) -->

| | |
|---|---|
| Phân hệ | Mua hàng |
| Màn hình | MH16 Tồn max (kế toán mua hàng) |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 26/11/2026 |
| Trạng thái | Đã chốt (kiennt, 26/11/2026) |

## 1. Yêu cầu

Bỏ nút chuyển **"Theo chi nhánh / shop" · "Theo mã hàng"** và bỏ chế độ xem theo mã hàng. Màn luôn xem theo chi nhánh / shop (chọn kho chi nhánh hoặc shop → mỗi mã một dòng) như mặc định hiện nay.

- Hàng công cụ còn: Chi nhánh · ô shop · Phân kho · Nhóm hàng · Thêm mã · Gợi ý cho mã chưa có max · Áp gợi ý cho dòng đang lọc · Nhập Excel · Lưu.
- Cách xếp cột / độ rộng người dùng đã lưu ở chế độ chi nhánh / shop giữ nguyên.
- Đường dẫn `?sku=` (chế độ theo mã) không còn dùng (không màn nào dẫn tới).
- Trang hướng dẫn MH16: bỏ mục "Xem theo mã hàng"; mục "Ô màu trên cùng" (dải ô đếm đã bỏ ở NT-MH-007) thay bằng "Lọc trên lưới".

## 2. Phạm vi

- `apps/web/src/phan-he/mua-hang/ton-max/TonMaxPage.tsx` (của Nguyễn Văn Thủy — bỏ nhánh mã hàng; đóng góp).
- `docs/huong-dan/mua-hang-ton-max.md` (của Nguyễn Văn Thủy; đóng góp).
- API không đổi (`GET /stock/max-board?sku=` vẫn còn cho máy khách khác).

## 3. Kết quả mong đợi

| # | Thao tác | Mong đợi |
|---|---|---|
| 1 | Mở MH16 | Không còn nút "Theo chi nhánh / shop", "Theo mã hàng" |
| 2 | Chọn chi nhánh | Xem kho chi nhánh: lưới mỗi mã một dòng, cột Max của kho |
| 3 | Chọn shop | Lưới của shop, cột Max của shop |
| 4 | Thêm mã, Nhập Excel, Tải file mẫu | Như cũ |

## 4. Kết quả chạy
| | |
|---|---|
| Ngày chạy | 26/11/2026 (máy dev, DB local `ketoan_otchuong`, trình duyệt tự động, chặn lệnh ghi) |
| Bản code (commit) | nhánh `feat/nt-mh-019-lap-phieu-chuyen-kho-tu-de-nghi` |
| Kết quả | Bước 1: không còn hai nút. Bước 2: Hà Nội — kho chi nhánh, 110011001 Max của kho 125 (= DB). Bước 3: shop 07001 — Max của shop 19 (= DB). Bước 4: Thêm mã, Nhập Excel có; Tải file mẫu chạy (07001 đã có max mọi mã → báo, không tải tệp rỗng). Typecheck web sạch |

## 5. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 6. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 26/11/2026 | Tạo và chốt theo yêu cầu |
