# NT-MH-005 · Menu: nhóm "Khai báo" của Mua hàng → "Danh mục"; MH12, BH17 gom vào Phần riêng → Cấu hình
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

**Bổ sung (21/11):** **Cài đặt mua hàng (MH12)** và **Cài đặt bán hàng (BH17)** bỏ khỏi menu của Mua hàng (nhóm Danh mục) và Bán hàng (mục Cài đặt), gom vào nhóm **Phần riêng**, mục mới **Cấu hình**. BH17 cũng bỏ khỏi mục Bán lẻ máy POS của Phần riêng (mỗi màn một chỗ). Ô sơ đồ quy trình mua / bán vẫn giữ lối tắt tới hai màn này.
- Đơn vị tắt nhóm Phần riêng (Cấu hình hệ thống, khoá `bizcity.ui.phan_rieng`) thì hai màn không hiện trên menu, vẫn mở bằng ô tìm (Ctrl + K) — như mọi màn của Phần riêng.

**Bổ sung (21/11) — Báo cáo bung ra:** trong bảng menu thả xuống, báo cáo của nhóm hiện danh sách như các mục khác (có ghim, mã màn, tô sáng màn đang mở). Nhóm có mục báo cáo trùng tên nhóm (Mua hàng, Bán hàng) **chỉ hiện mục đó**, tiêu đề **"Báo cáo"** — báo cáo công nợ phải trả / phải thu không hiện ở đây (xem ở Tổng hợp › Công nợ và trang Báo cáo chung). Nhóm khác (vd Tổng hợp nhiều mục) hiện mọi mục, tiêu đề "Báo cáo · <mục>". **Không** có dòng "Tất cả báo cáo" (trang Báo cáo chung mở ở dòng Báo cáo cuối menu trái). Số cột của bảng tính cả dòng báo cáo.

## 2. Phạm vi

`apps/web/src/layout/menu-gon.ts` (bảng thả xuống và menu trái: nhóm Mua hàng, Bán hàng, Phần riêng), `apps/web/src/phan-he/mua-hang/menu.ts` (menu trái), `apps/web/src/layout/SideNav.tsx` (bảng thả xuống: bung báo cáo), `apps/web/src/layout/so-do-nhom.ts` (chỉ nhóm của sơ đồ mua hàng; sơ đồ bán hàng giữ "Khai báo"). Chỉ đổi chữ.

## 3. Kết quả mong đợi

| # | Thao tác | Mong đợi |
|---|---|---|
| 1 | Mở menu Mua hàng | Cột phải: Định kỳ · **Danh mục** · Báo cáo |
| 2 | Bấm các mục trong Danh mục | Mở đúng MH01, MH29, MH04, MH12 như trước |
| 3 | Sơ đồ quy trình mua hàng | Nhóm đầu ghi Danh mục |
| 4 | Menu Mua hàng › Danh mục; menu Bán hàng | Không còn Cài đặt mua hàng (MH12) / mục Cài đặt (BH17) |
| 5 | Menu Phần riêng | Có mục **Cấu hình**: Cài đặt mua hàng (MH12), Cài đặt bán hàng (BH17); mở đúng màn |
| 6 | Rê chuột vào nhóm Mua hàng / Bán hàng | Mục **Báo cáo** chỉ gồm báo cáo của nhóm (Mua hàng: MH23, MH23A, MH21, ACC77, MH14, MH24, MH25, MH10); không có công nợ, không có Tất cả báo cáo — đã chụp màn kiểm 21/11 (code nhánh, API ketoan-dev) |
