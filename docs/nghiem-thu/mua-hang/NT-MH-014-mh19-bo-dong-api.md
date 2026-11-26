# NT-MH-014 · Chuyển hàng xuống shop (MH19): bỏ dòng chú thích API; cột Tồn kho xuất cạnh Thiếu / Chuyển
<!-- [2026-11-26 kiennt] NGHIEM-THU — tạo phiếu theo yêu cầu người dùng (đóng góp) -->

| | |
|---|---|
| Phân hệ | Mua hàng |
| Màn hình | MH19 Chuyển hàng xuống shop — thẻ **Đề xuất chuyển**, **Đề nghị đã chốt** |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 26/11/2026 |
| Trạng thái | Đã chốt (kiennt, 26/11/2026) |

## 1. Yêu cầu

Bỏ dòng chữ "Kho / POS đọc danh sách này qua API `GET /api/v1/stock/transfer-requests?status=open`." trên hàng lọc của thẻ Đề nghị đã chốt — thông tin kỹ thuật, người dùng không cần.

- API không đổi (kho / POS vẫn đọc được). Lọc ngày, trạng thái, bảng đề nghị: không đổi.
- **Bổ sung (26/11):** thẻ Đề xuất chuyển cần thấy **tồn kho** ngay khi chia hàng. Cột tồn kho đã có nhưng nằm cuối bảng ("Tồn kho (trước chia)", phải cuộn ngang). Chuyển lên **ngay sau cột Thiếu** (trước Làm tròn, Chuyển), đổi tên **"Tồn kho xuất"** (tồn ở kho đang chọn "Xuất từ kho", đã trừ đề nghị đã chốt chưa lên phiếu, trước khi chia cho các shop), **hiện cả số 0** (kho hết hàng). Người đã tự xếp cột ở màn này thì giữ thứ tự đã lưu — bấm Cột để đưa lại.

## 2. Phạm vi

`apps/web/src/phan-he/mua-hang/ton-max/ChuyenShopPage.tsx` (của Nguyễn Văn Thủy — bỏ một dòng chữ, đổi vị trí / tên cột; đóng góp). Chỉ giao diện; số liệu cột lấy sẵn từ API.

## 3. Kết quả mong đợi

| # | Thao tác | Mong đợi |
|---|---|---|
| 1 | MH19 → Đề nghị đã chốt | Hàng lọc chỉ còn Từ, Đến, Trạng thái; không còn dòng chữ API |
| 2 | Đổi ngày / trạng thái | Danh sách lọc như cũ |
| 3 | MH19 → Đề xuất chuyển | Cột "Tồn kho xuất" ngay sau Thiếu; kho hết hàng hiện 0; rê chuột tiêu đề có giải thích |

## 4. Kết quả chạy
| | |
|---|---|
| Ngày chạy | 26/11/2026 (máy dev) |
| Bản code (commit) | nhánh `feat/nt-mh-014-018-ton-max-sua-loi` |
| Kết quả | Trình duyệt tự động (DB local, chi nhánh Hà Nội, chặn lệnh ghi): bước 1 — thẻ Đề nghị đã chốt không còn dòng API; bước 3 — thứ tự cột Mã hàng · Tên hàng · Max shop · Tồn shop · Đi đường + đã đề nghị · Thiếu · **Tồn kho xuất** · Làm tròn · Chuyển · Thiếu do kho hết; mã 100011001: Thiếu 35, Tồn kho xuất 0, Thiếu do kho hết 35. Typecheck web sạch |

## 5. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 6. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 26/11/2026 | Tạo và chốt theo yêu cầu |
| 26/11/2026 | Bổ sung cột Tồn kho xuất cạnh Thiếu / Chuyển |
