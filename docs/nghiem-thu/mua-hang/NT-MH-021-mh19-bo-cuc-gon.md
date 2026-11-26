# NT-MH-021 · Chuyển hàng xuống shop (MH19): bố cục gọn, bỏ dải ô đếm
<!-- [2026-11-26 kiennt] NGHIEM-THU — tạo phiếu theo yêu cầu người dùng (đóng góp) -->

| | |
|---|---|
| Phân hệ | Mua hàng |
| Màn hình | MH19 Chuyển hàng xuống shop — thẻ **Đề xuất chuyển** |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 26/11/2026 |
| Trạng thái | Đã chốt (kiennt, 26/11/2026) |

## 1. Yêu cầu

Thẻ Đề xuất chuyển đang rối: 4 hàng điều khiển (kho / làm tròn / khi kho không đủ · ngưỡng thùng + nút · chọn shop · 4 ô đếm). Thiết kế lại, **bỏ dải ô đếm**:

| Hàng | Nội dung |
|---|---|
| 1 | Chi nhánh · [Đề xuất chuyển \| Đề nghị đã chốt] (như cũ) |
| 2 | Xuất từ kho · Làm tròn · Khi kho không đủ (độ rộng cố định, không giãn) |
| 3 | Shop: [Tất cả shop] [1. shop…] — bên phải: **Hiện** · Xuất Excel · **Chốt đề nghị (n shop · n dòng · SL x)** |

- Ô đếm → chỗ khác: *Shop cần chia hàng*, *Tổng SL chuyển* lên nhãn nút Chốt; *Dòng đề xuất*, *Dòng thiếu do kho hết* (vốn là lọc nhanh) thành ô chọn **Hiện**: Tất cả dòng (n) · Thiếu do kho hết (n).
- Chữ "Ngưỡng thùng 50%" → chú thích khi rê chuột ô Làm tròn (kèm "đổi ở Công thức đặt hàng MH18").
- Cách tính, chia hàng, chốt đề nghị: không đổi.

## 2. Phạm vi

`apps/web/src/phan-he/mua-hang/ton-max/ChuyenShopPage.tsx` (của Nguyễn Văn Thủy — bố cục thanh công cụ; đóng góp). Chỉ giao diện.

## 3. Kết quả mong đợi

| # | Thao tác | Mong đợi |
|---|---|---|
| 1 | Mở MH19 → Đề xuất chuyển | Không còn dải ô đếm, không còn chữ "Ngưỡng thùng"; 3 hàng như bảng trên |
| 2 | Hiện = Thiếu do kho hết | Chỉ dòng thiếu do kho hết |
| 3 | Nút Chốt | Ghi số shop · số dòng · tổng SL chuyển |
| 4 | Rê chuột "Làm tròn" | Có ngưỡng thùng |

## 4. Kết quả chạy
| | |
|---|---|
| Ngày chạy | 26/11/2026 (máy dev, DB local `ketoan_otchuong`, Hà Nội, trình duyệt tự động, chặn lệnh ghi) |
| Bản code (commit) | nhánh `feat/nt-mh-020-mh16-bo-theo-ma-hang` |
| Kết quả | Bước 1: không còn ô đếm / chữ ngưỡng thùng; màn 1600px: hàng 2 ba ô chọn, hàng 3 shop bên trái — Hiện · Xuất Excel · Chốt bên phải. Bước 2: "Tất cả dòng (22)" · "Thiếu do kho hết (21)", lọc đúng. Bước 3: "Chốt đề nghị (2 shop · 3 dòng · SL 40)". Bước 4: chú thích "… — ngưỡng thùng 50% (đổi ở Công thức đặt hàng MH18)". Typecheck web sạch |

## 5. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 6. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 26/11/2026 | Tạo và chốt theo yêu cầu |
