# NT-MH-010 · Phân tích đặt hàng (MH02): bỏ dải ô đếm, lọc nhanh thành ô chọn "Hiện"
<!-- [2026-11-25 kiennt] NGHIEM-THU — tạo phiếu theo yêu cầu người dùng (đóng góp) -->

| | |
|---|---|
| Phân hệ | Mua hàng |
| Màn hình | MH02 Phân tích đặt hàng |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 25/11/2026 |
| Trạng thái | Đã chốt (kiennt, 25/11/2026) |

## 1. Yêu cầu

Bỏ dải ô đếm (Tổng mã đang phân tích / Mã cần nhập / Mã đang dư / Đang có đơn chưa về / Chưa rõ NCC) như MH16, MH17.

- Các ô này **kiêm lọc nhanh** và màn mặc định chỉ hiện **Mã cần nhập** — bỏ hẳn thì không đổi lọc được. Lọc nhanh chuyển thành ô chọn **Hiện** trên hàng công cụ (cạnh ô tìm), có số mã từng loại: *Mã cần nhập (n)* (mặc định) · *Mã đang dư* · *Đang có đơn chưa về* · *Chưa rõ NCC* · *Tất cả mã*.
- Cách lọc, số liệu, lập đơn đặt: không đổi.

## 2. Phạm vi

`apps/web/src/phan-he/mua-hang/dat-hang/DatHangPage.tsx` (đóng góp). Chỉ giao diện.

## 3. Kết quả mong đợi

| # | Thao tác | Mong đợi |
|---|---|---|
| 1 | Mở MH02 | Không còn dải ô đếm; ô Hiện = Mã cần nhập (số mã) |
| 2 | Đổi Hiện: Mã đang dư / Tất cả mã | Lưới lọc đúng như bấm ô đếm trước đây |

## 4. Kết quả chạy
| | |
|---|---|
| Ngày chạy | 25/11/2026 (máy dev, DB local, trình duyệt tự động) |
| Bản code (commit) | nhánh `feat/nt-mh-010-mh02-bo-o-dem` |
| Kết quả | Chi nhánh Hà Nội: không còn ô đếm; Hiện: Mã cần nhập (8) → 8 dòng, Mã đang dư (0) → 0 dòng, Tất cả mã (8) → 8 dòng. Typecheck web sạch |

## 5. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 6. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 25/11/2026 | Tạo và chốt theo yêu cầu |
