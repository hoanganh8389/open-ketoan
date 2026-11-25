# NT-MH-008 · Tồn max (MH16): bỏ dòng chú thích; tệp mẫu nhập Excel có sẵn mặt hàng chưa có max
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

**Bổ sung (25/11) — Nhập Excel tồn max: tệp mẫu có sẵn mặt hàng.** Đang xem theo chi nhánh / shop: **Tải file mẫu** có sẵn **mặt hàng đang dùng chưa có max ở kho / shop đang xem**, cột Mã chi nhánh, Mã kho điền sẵn; cột chỉ để xem: Tên hàng, ĐVT, Tồn, Gợi ý max. Người dùng chỉ điền **Tồn max** (và Tồn min nếu cần). Mọi mã đã có max → báo, không tải tệp rỗng. Xem theo mã hàng: tệp mẫu một dòng ví dụ như cũ.
- **Tồn max để trống = bỏ qua dòng** (trước đây ghi max = 0 — xoá max cũ). Tồn min trống = 0.
- Đọc số như NT-MH-006: "1.500" / "1,500" = nghìn, "1.5" / "1,5" = 1,5; chữ / số âm → dòng đỏ (lời báo có mã hàng). Hàm đọc số chuyển về `ton-max/api.ts` dùng chung MH16, MH17.

## 2. Phạm vi

`apps/web/src/phan-he/mua-hang/ton-max/TonMaxPage.tsx`, `apps/web/src/phan-he/mua-hang/ton-max/api.ts`, `apps/web/src/phan-he/mua-hang/ton-max/DangKyMaxPage.tsx` (chỉ dời hàm đọc số) (của Nguyễn Văn Thủy; đóng góp). Chỉ giao diện; API không đổi.

## 3. Kết quả mong đợi

| # | Thao tác | Mong đợi |
|---|---|---|
| 1 | Mở MH16 (kho tổng / shop / theo mã) | Không còn dòng chú thích; lưới, nút, tên tệp Xuất Excel như cũ |
| 2 | Chọn kho phụ (KM) | Vẫn có thông báo kho phụ không gợi ý max |
| 3 | MH16 → Nhập Excel → Tải file mẫu | Có sẵn mặt hàng chưa có max ở kho / shop đang xem, mã chi nhánh + mã kho điền sẵn; mọi mã có max → báo |
| 4 | Điền Tồn max vài dòng, để trống dòng khác, nhập lại | Chỉ dòng đã điền được ghi; dòng trống không đổi max cũ; chữ / âm / min > max đỏ |

## 4. Kết quả chạy
| | |
|---|---|
| Ngày chạy | 25/11/2026 (máy dev, DB local, trình duyệt tự động) — bước 1: MH16 kho tổng Phú Thọ không còn dòng chú thích, lưới hiện dữ liệu, không lỗi; typecheck sạch. Bước 3, 4 (DB local: Hà Nội 07000 đủ max 11 mã → báo đúng; giả lập thêm 2 mã chưa có max, chặn lệnh ghi): tệp mẫu 2 dòng, mã chi nhánh 07000, kho 07000-KHH điền sẵn; điền 1 dòng → chỉ gửi ghi 1 dòng; dòng trống bỏ qua; "abc", min > max đỏ. Bước 2 chưa chạy |
| Bản code (commit) | nhánh `feat/nt-mh-008-mh16-bo-dong-chu-thich` |

## 5. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 6. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 25/11/2026 | Tạo và chốt theo yêu cầu |
| 25/11/2026 | Bổ sung: tệp mẫu nhập Excel MH16 có sẵn mặt hàng chưa có max; max trống = bỏ qua |
