# NT-MH-005 · Menu Mua hàng: nhóm "Khai báo" đổi tên thành "Danh mục"
<!-- [2026-11-21 kiennt] NGHIEM-THU — tạo phiếu theo yêu cầu người dùng (đóng góp) -->

| | |
|---|---|
| Phân hệ | Mua hàng |
| Màn hình | Menu Mua hàng (bảng thả xuống, menu trái, sơ đồ quy trình) |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 21/11/2026 |
| Trạng thái | Đã chốt (kiennt, 21/11/2026) |

## 1. Yêu cầu

Nhóm **Khai báo** (Nhà cung cấp mua hàng MH01, Hợp đồng mua hàng MH29, Chính sách mua hàng MH04, Cài đặt mua hàng MH12) đổi tên thành **Danh mục**. Các mục bên trong, đường dẫn, mã màn, quyền: giữ nguyên.

## 2. Phạm vi

`apps/web/src/layout/menu-gon.ts` (bảng thả xuống), `apps/web/src/phan-he/mua-hang/menu.ts` (menu trái), `apps/web/src/layout/so-do-nhom.ts` (chỉ nhóm của sơ đồ mua hàng; sơ đồ bán hàng giữ "Khai báo"). Chỉ đổi chữ.

## 3. Kết quả mong đợi

| # | Thao tác | Mong đợi |
|---|---|---|
| 1 | Mở menu Mua hàng | Cột phải: Định kỳ · **Danh mục** · Báo cáo |
| 2 | Bấm các mục trong Danh mục | Mở đúng MH01, MH29, MH04, MH12 như trước |
| 3 | Sơ đồ quy trình mua hàng | Nhóm đầu ghi Danh mục |
