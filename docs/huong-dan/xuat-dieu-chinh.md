# Phiếu xuất điều chỉnh (BH06)

<!-- [2026-11-26 03:10 PM Võ Hoàng] NGHIEM-THU — NT-BH-044: hướng dẫn màn BH06 mới (module xuat-dieu-chinh) (đóng góp) -->

Phiếu xuất hàng **không phải để bán**: dùng nội bộ, tặng, dùng thử, huỷ hỏng, đào tạo… Lập **ngay ở kế toán** (một chỗ lập duy nhất; máy bán POS sẽ gọi cùng lệnh này). Mở ở menu **Bán hàng → Phiếu xuất điều chỉnh** (BH06). Đường cũ *Bán hàng → Xuất điều chỉnh* tự chuyển sang màn này.

## Hai loại phiếu

| Loại | Khi nào | Vào sổ |
|---|---|---|
| **0 đ** (mặc định) | Xuất dùng, tặng, huỷ hỏng… không thu tiền | Phiếu điều chỉnh giảm kho. Giá trị = giá vốn bình quân, có khi **Tính giá vốn** tháng. Tài khoản đối ứng theo **mục đích xuất** của lý do (vd XSD1 → dùng cho bộ phận bán hàng, XHH01 → huỷ hàng hỏng) |
| **Có giá** (tích *Phiếu có giá*) | Xuất có thu tiền / ghi nợ (tặng có tính giá, bán nội bộ) | Phiếu bán **nội bộ**: không hoá đơn điện tử, không tính vào báo cáo bán hàng; ghi **công nợ 131** cho người nhận |

## Lập phiếu

1. Bấm **Thêm**. Form điền sẵn: chi nhánh đang chọn, **kho bán** của chi nhánh, lý do **XSD1**, ngày **hôm nay**.
2. Chọn **Kho xuất** (kho đang dùng của chi nhánh; chọn được **kho quà KKM**).
3. Chọn **Lý do xuất**. Danh sách không có lý do đã có màn riêng (bán XBA / XBB, chuyển kho XCKho, kiểm kê XKK, XCN, XCN3, XNB…). Phiếu 0 đ chỉ hiện lý do đã có mục đích xuất. Kế toán có quyền cấu hình thấy lối **+ Thêm lý do**.
4. **Ngày phiếu**: kế toán chọn được ngày lùi (trong kỳ chưa khoá); thu ngân / nhân viên cửa hàng chỉ lập ngày hôm nay.
5. Dòng hàng: chọn mặt hàng (chỉ mặt hàng đang dùng; người có quyền danh mục thấy **+ Thêm mặt hàng**), **ĐVT** (chọn ĐVT quy đổi — vd thùng = 24 hộp), **SL** (số nguyên), **Lô** (để trống = phần mềm tự lấy lô hạn sớm nhất; chọn lô cụ thể thì chỉ trừ lô đó), hạn dùng điền theo lô.
6. Phiếu có giá: **Người nhận** bắt buộc (mã khách hàng); **Đơn giá** gợi ý từ bảng giá, sửa được; thuế theo danh mục hàng. Giá dưới giá vốn → cảnh báo **Dưới giá vốn**, vẫn lưu được, có ghi nhật ký.
7. Bấm **Lưu nháp** (chưa vào sổ, chưa trừ kho) hoặc **Lưu (ghi sổ)** (vào sổ và trừ kho ngay).

Phần mềm báo **ngay tại ô** khi: thiếu kho / lý do / dòng, SL ≤ 0 hoặc số lẻ, **SL vượt tồn** của kho (quy về đơn vị nhỏ nhất), phiếu có giá chưa có người nhận. Máy chủ kiểm lại và báo hết các ô sai một lần. Đóng form khi còn thay đổi chưa lưu → hỏi *Bỏ thay đổi chưa lưu?*.

Số phiếu tự cấp: **XDC-‹mã chi nhánh›-‹năm tháng›-‹số›**, vào sổ chứng từ chung.

## Phiếu đã lưu

- **Không sửa** phiếu đã ghi sổ. Có hai nút:
  - **Huỷ phiếu**: nhập **lý do huỷ** (bắt buộc) → bút toán đảo, hàng về lại kho. Kỳ đã khoá thì không huỷ được. Chỉ kế toán, kế toán trưởng, chủ đơn vị có nút này.
  - **Chép thành phiếu mới**: mở form nháp mới cùng nội dung, chưa vào sổ.
- **Nháp**: người lập hoặc kế toán sửa / xoá. Hai người cùng sửa một nháp: người lưu sau được báo *Phiếu đã được người khác sửa — tải lại*.
- Bấm Lưu hai lần (hoặc mạng gửi lại) vẫn chỉ ra một phiếu.

## Danh sách

Lọc **Từ ngày – Đến ngày**, **Chi nhánh**, **Loại** (0 đ / Có giá), **Trạng thái** (Nháp / Đã ghi sổ / Đã huỷ). Danh sách gồm cả **phiếu cũ do cầu nối gửi** (cột Nguồn *Cầu nối (cũ)* — cần quyền xem chứng từ); phiếu cũ mở ra xem và huỷ được (kế toán có quyền huỷ). Cột **Tổng tiền** có dòng cộng.

Tích các phiếu rồi bấm **In 02-VT**: phiếu xuất kho (chi nhánh — kho, lý do + diễn giải, người nhận, dòng hàng kèm lô / hạn dùng).

## Quyền (gán lại ở Phân quyền HT12)

| Quyền | Mặc định |
|---|---|
| Xem, in | Chủ đơn vị, kế toán trưởng, kế toán, nhân viên (theo chi nhánh được gán) |
| Lập, lưu nháp, ghi sổ | Như trên |
| Huỷ phiếu | Chủ đơn vị, kế toán trưởng, kế toán |

Xem thêm: [Màn cũ (chỉ xem)](export-adjust.md) · [Quy trình bán hàng](ban-hang-quy-trinh.md) · [Nhập xuất tồn](nhap-xuat-ton.md)
