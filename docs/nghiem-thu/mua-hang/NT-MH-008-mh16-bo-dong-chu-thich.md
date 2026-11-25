# NT-MH-008 · Tồn max (MH16): bỏ dòng chú thích "Đang xem … · bán / ngày đo trong …"
<!-- [2026-11-25 kiennt] NGHIEM-THU — tạo phiếu theo yêu cầu người dùng (đóng góp) -->

| | |
|---|---|
| Phân hệ | Mua hàng |
| Màn hình | MH16 Tồn max |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 25/11/2026 |
| Trạng thái | Đã chốt (kiennt, 25/11/2026) |

## 1. Yêu cầu

Bỏ dòng chú thích dưới hàng nút: *"Đang xem kho HH của Kho tổng Phú Thọ · bán / ngày đo trong 7 ngày, max shop gợi ý = bán / ngày × 7 ngày; max kho gợi ý = tổng max shop + 10% (đổi ở Công thức đặt hàng; riêng mã: nút ⚙ cuối dòng)."*

- Kho / shop đang xem đã có ở các ô chọn phía trên; cách tính gợi ý xem ở MH18 Công thức đặt hàng và khi rê chuột ô Gợi ý max; nút ⚙ cuối dòng giữ nguyên.
- Thông báo "Kho … là kho phụ: không gợi ý max" (khi chọn kho phụ) giữ nguyên.

## 2. Phạm vi

`apps/web/src/phan-he/mua-hang/ton-max/TonMaxPage.tsx` (của Nguyễn Văn Thủy; đóng góp). Chỉ giao diện.

## 3. Kết quả mong đợi

| # | Thao tác | Mong đợi |
|---|---|---|
| 1 | Mở MH16 (kho tổng / shop / theo mã) | Không còn dòng chú thích; lưới, nút, tên tệp Xuất Excel như cũ |
| 2 | Chọn kho phụ (KM) | Vẫn có thông báo kho phụ không gợi ý max |

## 4. Kết quả chạy
| | |
|---|---|
| Ngày chạy | 25/11/2026 (máy dev, DB local, trình duyệt tự động) — bước 1: MH16 kho tổng Phú Thọ không còn dòng chú thích, lưới hiện dữ liệu, không lỗi; typecheck sạch. Bước 2 chưa chạy |
| Bản code (commit) | nhánh `feat/nt-mh-008-mh16-bo-dong-chu-thich` |

## 5. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 6. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 25/11/2026 | Tạo và chốt theo yêu cầu |
