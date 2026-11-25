# NT-MH-007 · Phiếu đăng ký max hàng mới (MH17): chi nhánh lên tiêu đề cửa sổ, bỏ nhãn vàng
<!-- [2026-11-25 kiennt] NGHIEM-THU — tạo phiếu theo yêu cầu người dùng (đóng góp) -->

| | |
|---|---|
| Phân hệ | Mua hàng |
| Màn hình | MH17 — cửa sổ phiếu đăng ký max hàng mới |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 25/11/2026 |
| Trạng thái | Đã chốt (kiennt, 25/11/2026) |

## 1. Yêu cầu

Bỏ nhãn vàng "Chi nhánh 08000 · 2 shop" đầu phiếu hàng mới; đưa thông tin đó lên tiêu đề cửa sổ: **"Phiếu đăng ký max hàng mới — Kho tổng Phú Thọ (08000) · 2 shop"** (phiếu đã lưu: số phiếu ở đầu, trạng thái ở cuối như cũ). Phần khác của phiếu không đổi.

## 2. Phạm vi

`apps/web/src/phan-he/mua-hang/ton-max/DangKyMaxPage.tsx` (của Nguyễn Văn Thủy; đóng góp). Chỉ giao diện.

## 3. Kết quả mong đợi

| # | Thao tác | Mong đợi |
|---|---|---|
| 1 | MH17 → Phiếu hàng mới | Tiêu đề cửa sổ có tên, mã chi nhánh, số shop; không còn nhãn vàng |
| 2 | Mở lại phiếu hàng mới đã lưu | Tiêu đề: số phiếu · … — trạng thái |
| 3 | Phiếu shop đăng ký max | Không đổi |

## 4. Kết quả chạy
| | |
|---|---|
| Ngày chạy | 25/11/2026 (máy dev, DB local, trình duyệt tự động) — bước 1: tiêu đề "Phiếu đăng ký max hàng mới — Kho tổng Phú Thọ (08000) · 2 shop", không còn nhãn vàng; typecheck sạch |
| Bản code (commit) | nhánh `feat/nt-mh-007-nhan-chi-nhanh-len-tieu-de` |

## 5. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 6. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 25/11/2026 | Tạo và chốt theo yêu cầu |
