# NT-MH-015 · Đơn đặt hàng đã duyệt: nút "Lập phiếu nhập kho từ đơn" bấm được
<!-- [2026-11-26 kiennt] NGHIEM-THU — tạo phiếu theo yêu cầu người dùng (đóng góp) -->

| | |
|---|---|
| Phân hệ | Mua hàng |
| Màn hình | MH11 Chứng từ mua hàng — hộp thoại **Đơn đặt hàng** (Trợ lý mua hàng › Tiến độ giao hàng của đơn) |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 26/11/2026 |
| Trạng thái | Đã chốt (kiennt, 26/11/2026) |

## 1. Yêu cầu

**Lỗi:** mở đơn đặt **đã duyệt** (vd DH26110003), nút **"Lập phiếu nhập kho từ đơn (chép phần còn lại)"** bị xám, bấm không được.

- Nguyên nhân: đơn đã duyệt luôn mở ở chế độ xem; chế độ xem khoá mọi nút trong hộp thoại trừ nút gắn "bấm được khi xem" (`data-view-ok`). Nút chỉ hiện khi đơn đã duyệt nhưng thiếu dấu này → không bao giờ bấm được. Cùng lỗi với các nút **"Phiếu nhập {chi nhánh}"** (đơn giao nhiều chi nhánh).
- Sửa: gắn `data-view-ok` cho các nút đó. Bấm → mở phiếu Nhập mua mới (nháp, chưa ghi) chép phần còn lại của đơn, như thiết kế. Không đổi điều kiện hiện nút, không đổi cách chép.

## 2. Phạm vi

`apps/web/src/phan-he/mua-hang/chung-tu/PhieuMuaForm.tsx` (của Nguyễn Văn Thủy — thêm dấu trên 2 nút; đóng góp). Chỉ giao diện.

## 3. Kết quả mong đợi

| # | Thao tác | Mong đợi |
|---|---|---|
| 1 | Mở đơn đặt đã duyệt, còn hàng chưa nhận | Nút "Lập phiếu nhập kho từ đơn" sáng, bấm được |
| 2 | Bấm nút | Mở phiếu Nhập mua mới (nháp): theo đơn đặt = đơn đó, dòng = phần còn lại (gồm hàng tặng), kho / NCC / giá theo đơn |
| 3 | Đơn giao nhiều chi nhánh | Các nút "Phiếu nhập {chi nhánh}" bấm được, mỗi nút chỉ dòng của chi nhánh đó |
| 4 | Các nút khác của đơn đã duyệt | Vẫn khoá như cũ (chế độ xem) |

## 4. Kết quả chạy
| | |
|---|---|
| Ngày chạy | 26/11/2026 (máy dev, DB local `ketoan_otchuong`, trình duyệt tự động, chặn lệnh ghi) |
| Bản code (commit) | nhánh `feat/nt-mh-014-018-ton-max-sua-loi` |
| Kết quả | Bước 1: đơn DH26110003 (đã duyệt, còn thiếu 70) — nút sáng (độ mờ 1), không khoá. Bước 2: bấm → "Nhập mua (mới) · Nháp · chưa ghi": theo đơn DH26110003, phân kho DNHH, NCC 300AA000003, dòng 110011003 × 70 Lon giá 20.000, phải trả 1.512.000; không ghi phiếu. Bước 3: chưa có đơn giao nhiều chi nhánh để thử (cùng cách sửa). Typecheck web sạch |

## 5. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 6. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 26/11/2026 | Tạo và chốt theo yêu cầu |
