# Đề nghị điều chuyển (KHO04)
<!-- [2026-11-28 10:00 AM Võ Hoàng] NGHIEM-THU — NT-BH-056: hướng dẫn màn mới (đóng góp) -->

Cửa hàng đề nghị chuyển hàng của mình sang chi nhánh cha hoặc cửa hàng cùng cha. Người duyệt bấm **Duyệt** thì kế toán lập luôn phiếu chuyển kho KHO01.

| Trạng thái | Ý nghĩa |
|---|---|
| Chờ duyệt | Vừa lập (máy bán hoặc kế toán); người lập còn sửa / huỷ trong ngày |
| Đã lập chuyển kho | Đã duyệt, đã có phiếu KHO01 (cột "Phiếu chuyển kho"); hàng đi đường tới khi chi nhánh nhận xác nhận ở KHO01 |
| Từ chối | Người duyệt từ chối, có lý do |
| Đã huỷ | Người lập / người duyệt huỷ khi còn chờ |

- **Chi nhánh nhận**: chi nhánh cha và các cửa hàng cùng cha. **Kho xuất**: kho mặc định của chi nhánh đề nghị; kho nhận: kho mặc định của chi nhánh nhận.
- SL mỗi mã không vượt tồn kho xuất (kiểm lúc lập và lại lúc duyệt).
- Quyền: xem / lập (thu ngân, quản lý cửa hàng); duyệt / từ chối (kế toán, kế toán trưởng, chủ đơn vị — cần thêm quyền lập chuyển kho).
- Máy bán đã nối kế toán lập đề nghị vào đây; chưa nối thì vẫn lưu ở website.
