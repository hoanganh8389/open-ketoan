# NT-KHO-006 · Phiếu chuyển kho (KHO01): ô "Tổng số lượng" ở góc phải như các phiếu khác
<!-- [2026-11-27 kiennt] NGHIEM-THU — tạo phiếu theo yêu cầu người dùng (đóng góp) -->

| | |
|---|---|
| Phân hệ | Kho |
| Màn hình | KHO01 Phiếu chuyển kho — hộp thoại lập / sửa phiếu |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 27/11/2026 |
| Trạng thái | Chờ nghiệm thu |

## 1. Yêu cầu

Trên đầu hộp thoại Phiếu chuyển kho, ô **Tổng số lượng** (chữ lớn) đang nằm **giữa**. Các phiếu khác, ví dụ đơn đặt hàng "Phải trả NCC", để tổng ở **góc phải**, sát nút Hướng dẫn. Cần đưa về bên phải cho giống.

Nguyên nhân: ô tổng và nút "? Hướng dẫn" của hộp thoại chứng từ dùng chung đều có `margin-left: auto`. Hai bên chia đôi khoảng trống nên ô tổng rơi vào giữa.

Sửa: khi nút Hướng dẫn đứng ngay sau ô tổng thì nút không tự đẩy sang phải nữa. Ô tổng sang phải, sát nút Hướng dẫn. Áp cho mọi hộp thoại chứng từ có ô tổng; hiện chỉ có Phiếu chuyển kho dùng. Các hộp thoại khác không đổi.

## 2. Phạm vi

| Tệp | Thay đổi |
|---|---|
| `apps/web/src/styles/giao-dien-xanh.css` | Thêm một quy tắc: `.ct-total + .modal-help { margin-left: 0; }` |

Chỉ giao diện.

## 3. Kết quả mong đợi

| # | Thao tác | Mong đợi |
|---|---|---|
| 1 | KHO01 → + Thêm | Ô "Tổng số lượng" ở góc phải đầu hộp thoại, ngay trước "? Hướng dẫn" |
| 2 | Mở một phiếu chuyển kho đã có | Như bước 1 |

## 4. Kết quả chạy

| | |
|---|---|
| Ngày chạy | 27/11/2026 (máy dev, DB local `ketoan_otchuong`, cửa sổ 1500px, trình duyệt tự động, chặn lệnh ghi) |
| Bản code (commit) | nhánh `feat/nt-mh-029-kho-006-tra-cho` |
| Kết quả | Bước 1 **đạt**: hộp rộng 1484px, ô tổng ở x = 1205–1294 (trước đây ở giữa, khoảng x ≈ 700), nút Hướng dẫn ở x = 1304. Bước 2 **chưa chạy**, dùng chung đầu hộp thoại. Typecheck không cần, vì chỉ sửa CSS |

## 5. Biên bản nghiệm thu

| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 6. Lịch sử thay đổi

| Ngày | Thay đổi |
|---|---|
| 27/11/2026 | Tạo theo yêu cầu (ảnh Phiếu chuyển kho mới trên máy dev) |
