# Phiếu xuất điều chỉnh (BH06)

<!-- [2026-11-23 11:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-040 — B10e (SC-DOC-6): hướng dẫn màn BH06 (helpKey export-adjust) -->
<!-- [2026-11-26 03:10 PM Võ Hoàng] NGHIEM-THU — NT-BH-044: màn BH06 đã chuyển sang module xuat-dieu-chinh (đóng góp) -->

> **Đã chuyển sang màn mới (NT-BH-044, 26/11/2026).** Phiếu xuất điều chỉnh nay **lập ngay ở kế toán** tại màn BH06 mới (`/app/xuat-dieu-chinh`,
> module `xuat-dieu-chinh`): danh sách đủ phiếu 0 đ và phiếu có giá, Thêm / Lưu nháp / Lưu (ghi sổ, trừ kho), Huỷ (bút toán đảo), Chép thành
> phiếu mới, In 02-VT. Đường cũ `/ban-hang/xuat-dieu-chinh` tự chuyển sang màn mới. Hướng dẫn: [Phiếu xuất điều chỉnh](xuat-dieu-chinh.md).
> Phần dưới mô tả màn cũ (chỉ xem, in), giữ để tra cứu.

Danh sách các phiếu cửa hàng xuất hàng **không phải để bán**: dùng nội bộ, tặng, dùng thử, huỷ hỏng… (bill giấy, không có hoá đơn điện tử). Mỗi phiếu là một phiếu bán nội bộ có **lý do xuất**, và **không tính vào báo cáo bán hàng**.

Màn này chỉ để xem và in. Phiếu do cửa hàng lập và gửi lên; ở đây không thêm hay sửa phiếu.

## Lọc

Bảng lọc bên trái: **Từ ngày**, **Đến ngày**, **Chi nhánh**.

## Cột

| Cột | Ý nghĩa |
|---|---|
| Ngày, Số phiếu | Ngày và số của phiếu |
| Chi nhánh, Tên chi nhánh | Cửa hàng lập phiếu |
| Lý do, Tên lý do | Lý do xuất ghi trên phiếu |
| Đối tượng | Người nhận, nếu phiếu có ghi |
| Diễn giải | Nội dung trên phiếu |
| Tổng tiền | Có dòng cộng ở cuối bảng |
| Trạng thái | *Chờ định khoản*, *Đã định khoản*, *Lỗi định khoản*, *Đã huỷ*, *Chờ huỷ* (cửa hàng xin huỷ, chưa xử lý), *Chờ định khoản lại* (phiếu đã sửa sau khi định khoản) |
| Nhân viên, Ngày nhận | Ẩn sẵn; bật ở nút chọn cột |

## Thao tác

- Bấm một dòng để mở **chi tiết phiếu**: xem trước nội dung và bút toán định khoản.
- Tích các phiếu rồi bấm **In**: in phiếu điều chỉnh giảm hoặc phiếu xuất kho (mẫu 02-VT).

Xem thêm: [Quy trình bán hàng](ban-hang-quy-trinh.md) · [Nhập xuất tồn](nhap-xuat-ton.md)
