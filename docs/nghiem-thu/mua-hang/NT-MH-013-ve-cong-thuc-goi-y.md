# NT-MH-013 · Công thức đặt hàng (MH18): nút "Về công thức chuẩn" đổi tên "Về công thức gợi ý"
<!-- [2026-11-25 kiennt] NGHIEM-THU — tạo phiếu theo yêu cầu người dùng (đóng góp) -->

| | |
|---|---|
| Phân hệ | Mua hàng |
| Màn hình | MH18 Công thức đặt hàng |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 25/11/2026 |
| Trạng thái | Đã chốt (kiennt, 25/11/2026) |

## 1. Yêu cầu

Nút **Về công thức chuẩn** (đưa cấu hình đang sửa về công thức mặc định, giữ nguyên kho đã chọn) đổi tên thành **Về công thức gợi ý**. Cách hoạt động không đổi.

## 2. Phạm vi

`apps/web/src/phan-he/mua-hang/ton-max/CongThucPage.tsx` (của Nguyễn Văn Thủy — đổi chữ trên nút; đóng góp). Chỉ giao diện.

## 3. Kết quả mong đợi

| # | Thao tác | Mong đợi |
|---|---|---|
| 1 | Mở MH18 | Nút ghi "Về công thức gợi ý" |
| 2 | Bấm nút | Như trước: cấu hình về mặc định, kho đã chọn giữ nguyên, chưa lưu cho tới khi bấm Lưu |

## 4. Kết quả chạy
| | |
|---|---|
| Ngày chạy | 25/11/2026 (máy dev, DB local `ketoan_otchuong`, trình duyệt tự động, chặn lệnh ghi) |
| Bản code (commit) | nhánh `feat/nt-mh-013-ve-cong-thuc-goi-y` |
| Kết quả | Bước 1: nút ghi "Về công thức gợi ý", không còn nút "Về công thức chuẩn". Bước 2: bật Tồn min kho → công thức đổi; bấm nút → công thức về mặc định, không có lệnh lưu nào gửi đi. Typecheck web sạch |

## 5. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 6. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 25/11/2026 | Tạo và chốt theo yêu cầu |
| 25/11/2026 | Đổi số NT-MH-011 → NT-MH-013 (số 011 đã dùng cho "Bản đồ lỗi phiếu mua") |
