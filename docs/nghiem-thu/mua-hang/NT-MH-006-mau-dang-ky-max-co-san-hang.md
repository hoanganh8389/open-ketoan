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
- **Tải file mẫu** có sẵn **mọi mặt hàng đang dùng** của danh mục, mỗi mã một dòng. Shop chỉ cần điền cột **Max đề nghị**.

| Cột | Bắt buộc | Ghi chú |
|---|---|---|
| Mã hàng | có | khoá dòng |
| Tên hàng · ĐVT · Tồn · Bán / ngày · Max hiện tại · Max gợi ý | — | chỉ để xem (theo shop đang chọn); nhập vào bỏ qua |
| Max đề nghị | — | số ≥ 0 (theo ĐVT nhỏ nhất). **Trống = dòng bỏ qua** (không báo lỗi) |
| Ghi chú | — | |

- Nhập: mã đã có trên phiếu → thay Max đề nghị (và ghi chú nếu có); mã chưa có → thêm dòng. Mã không có trong danh mục / max không phải số → dòng đỏ, không đưa vào. Trùng mã trong tệp → lấy dòng sau.
- Lưu / Gửi duyệt / Duyệt: như cũ (chỉ ghi các dòng đổi max so với hiện tại).
- Khung nhập Excel dùng chung của Mua hàng nhận thêm tuỳ chọn **mẫu có sẵn dòng** và **dòng trống bỏ qua** — các màn khác không đổi.

## 2. Phạm vi

`apps/web/src/phan-he/mua-hang/ton-max/DangKyMaxPage.tsx` (của Nguyễn Văn Thủy — thêm nút và khuôn nhập; đóng góp), `apps/web/src/phan-he/mua-hang/thanh-phan/NhapExcelChung.tsx`, `apps/web/src/phan-he/mua-hang/thanh-phan/ExcelGuide.tsx` (tuỳ chọn thêm, mặc định như cũ). Chỉ giao diện; API không đổi.

## 3. Kết quả mong đợi

| # | Thao tác | Mong đợi |
|---|---|---|
| 1 | MH17 → Phiếu shop đăng ký max → chọn shop → Nhập Excel → Tải file mẫu | Tệp có mọi mặt hàng đang dùng; mã shop đã có max / tồn / bán có số Tồn, Bán / ngày, Max hiện tại, Max gợi ý; Max đề nghị trống |
| 2 | Điền Max đề nghị vài dòng, nhập lại | Chỉ các dòng đã điền vào phiếu; dòng trống không hiện đỏ |
| 3 | Dòng mã không có trong danh mục / max "abc" | Dòng đỏ, ghi lý do, không đưa vào |
| 4 | Lưu & duyệt | Max ghi đúng các mã đã điền (MH16 thấy) |
| 5 | Phiếu hàng mới, các màn nhập Excel khác của Mua hàng | Không đổi |

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
