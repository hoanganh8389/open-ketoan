# NT-MH-006 · Phiếu shop đăng ký tồn max (MH17): nhập Excel, tệp mẫu có sẵn danh sách mặt hàng
<!-- [2026-11-25 kiennt] NGHIEM-THU — tạo phiếu theo yêu cầu người dùng (đóng góp) -->

| | |
|---|---|
| Phân hệ | Mua hàng |
| Màn hình | MH17 Phiếu đăng ký tồn max — phiếu **shop đăng ký max** (mã có sẵn) |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 25/11/2026 |
| Trạng thái | Đã chốt (kiennt, 25/11/2026) |

## 1. Yêu cầu

Phiếu shop đăng ký max hiện chỉ điền sẵn các mã shop đang có max / tồn / bán; mã khác phải bấm "Thêm mã" từng mã, không có nhập Excel. Thêm:

- Nút **Nhập Excel** trên phiếu shop đăng ký max (sau khi chọn shop, phiếu chưa duyệt / chưa huỷ).
- **Tải file mẫu** có sẵn các **mặt hàng đang dùng chưa có max ở shop đang chọn** (bổ sung 25/11, kiennt chốt), mỗi mã một dòng. Shop chỉ cần điền cột **Max đề nghị**. Mã đã có max nằm sẵn trên phiếu (sửa trên phiếu, hoặc tự thêm dòng mã đó vào tệp — vẫn nhận). Mọi mã đã có max → báo, không tải tệp rỗng.

| Cột | Bắt buộc | Ghi chú |
|---|---|---|
| Mã hàng | có | khoá dòng |
| Tên hàng · ĐVT · Tồn · Bán / ngày · Max hiện tại · Max gợi ý | — | chỉ để xem (theo shop đang chọn); nhập vào bỏ qua |
| Max đề nghị | — | số ≥ 0 (theo ĐVT nhỏ nhất). **Trống = dòng bỏ qua** (không báo lỗi) |
| Ghi chú | — | |

- Nhập: mã đã có trên phiếu → thay Max đề nghị (và ghi chú nếu có); mã chưa có → thêm dòng. Mã không có trong danh mục / max không phải số → dòng đỏ, không đưa vào. Trùng mã trong tệp → lấy dòng sau.
- Lưu / Gửi duyệt / Duyệt: như cũ (chỉ ghi các dòng đổi max so với hiện tại).
- **Bổ sung (25/11):** danh sách phiếu MH17 **bỏ dải ô đếm** (Tất cả / Chờ duyệt / Nháp / Đã duyệt / Hàng mới chờ gắn mã). Lọc theo trạng thái bằng ô lọc cột **Trạng thái**; phiếu hàng mới chưa gắn mã xem ở cột **Chưa có mã**.
- **Bổ sung (25/11):** bỏ dải **"Hai cách đặt tồn max"** (① Shop lập phiếu… / ② Kế toán mua hàng sửa thẳng…) ở đầu **MH17** và **MH16** — hai màn riêng, dải này chiếm chỗ. Lối qua lại giữa hai màn: menu Mua hàng › Đặt hàng.
- Khung nhập Excel dùng chung của Mua hàng nhận thêm tuỳ chọn **mẫu có sẵn dòng** và **dòng trống bỏ qua** — các màn khác không đổi.

## 2. Phạm vi

`apps/web/src/phan-he/mua-hang/ton-max/DangKyMaxPage.tsx` (của Nguyễn Văn Thủy — thêm nút và khuôn nhập; đóng góp), `apps/web/src/phan-he/mua-hang/thanh-phan/NhapExcelChung.tsx`, `apps/web/src/phan-he/mua-hang/thanh-phan/ExcelGuide.tsx` (tuỳ chọn thêm, mặc định như cũ); bỏ dải hai cách: `ton-max/TonMaxPage.tsx`, `ton-max/chung.tsx`, `ton-max/ton-max.css` (của Nguyễn Văn Thủy; đóng góp). Chỉ giao diện; API không đổi.

## 3. Kết quả mong đợi

| # | Thao tác | Mong đợi |
|---|---|---|
| 1 | MH17 → Phiếu shop đăng ký max → chọn shop → Nhập Excel → Tải file mẫu | Tệp có các mặt hàng đang dùng chưa có max ở shop này (mã có tồn / bán kèm Tồn, Bán / ngày, Max gợi ý); mã đã có max không có trong tệp; Max đề nghị trống |
| 2 | Điền Max đề nghị vài dòng, nhập lại | Chỉ các dòng đã điền vào phiếu; dòng trống không hiện đỏ |
| 3 | Dòng mã không có trong danh mục / max "abc" | Dòng đỏ, ghi lý do, không đưa vào |
| 4 | Lưu & duyệt | Max ghi đúng các mã đã điền (MH16 thấy) |
| 5 | Phiếu hàng mới, các màn nhập Excel khác của Mua hàng | Không đổi |
| 6 | Mở MH17 | Không còn dải ô đếm; lọc cột Trạng thái vẫn dùng được |
| 7 | Mở MH17, MH16 | Không còn dải "Hai cách đặt tồn max" |

## 4. Kết quả chạy
| | |
|---|---|
| Ngày chạy | 25/11/2026 (máy dev, DB local `ketoan_otchuong`, trình duyệt tự động) |
| Bản code (commit) | nhánh `feat/nt-mh-006-mau-dang-ky-max` |
| Kết quả | Bước 1: tệp mẫu shop 08001 có đủ 4 mặt hàng đang dùng, Max đề nghị trống. Bước 2: điền 2 dòng → 2 dòng vào phiếu (12; "1.500" = 1500, kèm ghi chú), 2 dòng trống không hiện. Bước 3: mã KHONGCO99 và max "abc" đỏ, ghi lý do. Bước 4 (Lưu & duyệt) chưa chạy — không ghi vào DB test. Typecheck web sạch |

## 5. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 6. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 25/11/2026 | Tạo và chốt theo yêu cầu |
| 25/11/2026 | Tệp mẫu chỉ gồm mặt hàng chưa có max ở shop |
| 25/11/2026 | Bỏ dải ô đếm trạng thái ở danh sách MH17 |
| 25/11/2026 | Bỏ dải "Hai cách đặt tồn max" ở MH17, MH16 |
