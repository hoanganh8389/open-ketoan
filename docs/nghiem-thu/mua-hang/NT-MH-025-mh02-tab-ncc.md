# NT-MH-025 · Phân tích đặt hàng (MH02): mỗi nhà cung cấp một tab
<!-- [2026-11-26 kiennt] NGHIEM-THU — tạo phiếu theo yêu cầu người dùng (đóng góp) -->

| | |
|---|---|
| Phân hệ | Mua hàng |
| Màn hình | MH02 Phân tích đặt hàng |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 26/11/2026 |
| Trạng thái | Chờ nghiệm thu |

## 1. Yêu cầu

File Excel *Công thức đặt hàng hoá* đang dùng chia **mỗi nhà cung cấp / nhãn một sheet** (Bỉm Dokma, Bỉm Huggies, Moaz bé bé…), mỗi lần làm đơn cho một NCC. MH02 là màn lập đơn đặt nên tab theo NCC đặt ở đây. MH19 chia hàng xuống shop thì tab theo kho nhận (NT-MH-024).

- Dưới hàng công cụ có dải tab **Tất cả NCC (n)** · từng NCC (số mã) · **Chưa rõ NCC (n)**, kiểu tab sheet Excel.
  - NCC xếp theo tên. *Chưa rõ NCC* đứng cuối, chữ màu cam.
  - Tên dài bị cắt bớt; rê chuột vào tab xem mã và tên đủ.
- Số mã trên tab đếm theo các mã **đang hiện**, tức đã qua ô **Hiện** (Mã cần nhập, Đang dư…), ô tìm và Nhóm hàng.
- NCC của mã lấy theo cột NCC đang có của MH02: lần nhập gần nhất, chưa nhập thì NCC có bảng giá đang hiệu lực. Không đổi API.
- Bấm một tab thì lưới chỉ còn mã của NCC đó, vẫn nhóm theo nhãn.
- Nút **Lập đơn đặt (n mã · tiền)** ở một tab NCC chỉ lấy các mã đã tích **của tab đó**, nên ra một đơn cho NCC đó. Ở tab Tất cả NCC thì như cũ: mọi mã đã tích, mỗi NCC một đơn.
- Xuất Excel ở một tab NCC: tên tệp có mã NCC.

## 2. Phạm vi

| Tệp | Thay đổi |
|---|---|
| `apps/web/src/phan-he/mua-hang/dat-hang/DatHangPage.tsx` | Dải tab NCC; lọc lưới, Lập đơn, Xuất Excel theo tab |
| `apps/web/src/phan-he/mua-hang/mua-hang.css` | Kiểu tab `.mh02-tabs` |
| `docs/huong-dan/mua-hang-dat-hang.md` | Cách dùng tab NCC |

Chỉ giao diện.

## 3. Kết quả mong đợi

| # | Thao tác | Mong đợi |
|---|---|---|
| 1 | Mở MH02, chọn chi nhánh | Có dải tab: Tất cả NCC (n) · từng NCC (số mã) · Chưa rõ NCC cuối (nếu có) |
| 2 | Đổi ô Hiện | Số mã trên tab đổi theo |
| 3 | Tích mã ở tab Tất cả, bấm tab một NCC | Lưới chỉ còn mã NCC đó; nút Lập đơn chỉ đếm mã đã tích của NCC đó và tiền của chúng |
| 4 | Bấm Lập đơn ở tab NCC | Một đơn đặt nháp cho NCC đó |
| 5 | Về Tất cả NCC | Nút Lập đơn đếm lại mọi mã đã tích |

## 4. Kết quả chạy

| | |
|---|---|
| Ngày chạy | 26/11/2026 (máy dev, DB local `ketoan_otchuong`, chi nhánh Hà Nội, màn 1470px, trình duyệt tự động, chặn lệnh ghi) |
| Bản code (commit) | nhánh `feat/nt-mh-024-025-mh19-mh02` |
| Kết quả | Bước 1 **đạt**, dữ liệu thật, Hiện = Mã cần nhập: "Tất cả NCC 8 · Công ty Bắc Anh 2 · Công ty dược Mỹ phẩm May 2 · Công ty TNHH Tân Bảo Minh 1 · Đại lý bỉm Bao Bắc 1 · NPP Trí Vinh 2". Bước 3 **đạt**: tích cả 8 mã, bấm Bắc Anh thì lưới còn 2 mã; nút từ "Lập đơn đặt (8 mã · 231.981.500đ)" thành "(2 mã · 40.708.500đ)". Bước 5 **đạt**: về Tất cả thì nút về lại 8 mã. Bước 4 **chưa chạy**, vì lần chạy chặn lệnh ghi; phần lập đơn dùng code cũ, mỗi NCC một đơn. Typecheck web sạch |

## 5. Biên bản nghiệm thu

| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 6. Lịch sử thay đổi

| Ngày | Thay đổi |
|---|---|
| 26/11/2026 | Tạo theo yêu cầu (tab NCC chuyển từ MH19 sang MH02) |
| 26/11/2026 | Tab gọn: cao 26px, chữ 12.5px, số mã trong ô tròn nhỏ; tab đang mở nền trắng, viền xanh trên, nối liền với bảng (kiểu sheet Excel) |
