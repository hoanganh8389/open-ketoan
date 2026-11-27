# NT-MH-028 · Phân tích đặt hàng (MH02): lập nhiều đơn thì mở tất cả, mỗi đơn một ô ở thanh dưới; tab tên dài không đè nhau
<!-- [2026-11-27 kiennt] NGHIEM-THU — tạo phiếu theo yêu cầu người dùng (đóng góp) -->

| | |
|---|---|
| Phân hệ | Mua hàng |
| Màn hình | MH02 Phân tích đặt hàng → Lập đơn đặt |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 27/11/2026 |
| Trạng thái | Chờ nghiệm thu |

## 1. Yêu cầu

Tích mã của nhiều NCC rồi bấm **Lập đơn đặt** thì phần mềm lập mỗi NCC một đơn nháp. Hiện chỉ đơn đầu tiên được mở. Muốn xem các đơn khác, người dùng phải bấm từng số đơn trên dòng thông báo xanh, và mở đơn này thì đơn đang mở bị đóng.

Yêu cầu: lập nhiều đơn thì **mở tất cả**, mỗi đơn **một ô ở thanh dưới đáy màn**, giống ô "Đơn đặt hàng DH… Nháp ×" đang có:
- Đơn đầu tiên hiện ra, các đơn còn lại nằm thu nhỏ trên thanh dưới.
- Bấm một ô thì đơn đó hiện ra, đơn đang hiện tự thu nhỏ. Mỗi đơn giữ nguyên phần đang sửa dở.
- Dấu × trên ô đóng riêng đơn đó. Nút **Đóng tất cả** đóng hết, như thanh dưới vẫn làm.
- Bấm số đơn trên dòng thông báo: đơn đã mở thì đưa lên, chưa mở thì mở thêm. Không mở trùng.
- Từ một đơn mở sang phiếu khác (nút mở phiếu liên quan) thì phiếu đó cũng thành một ô mới.
- Tải lại trang thì mọi đơn đang dở đều mở lại, trước đây chỉ mở lại một đơn. Mỗi đơn nhớ mình đang thu nhỏ hay đang hiện.

**Sửa kèm: lỗi tab tên dài bị đè.** Ảnh trên máy dev: tab "CÔNG TY TNHH FONTERRA BRANDS (VIỆT NAM)" tràn chữ đè lên tab bên cạnh.
- Tên trong tab dài quá thì **cắt bằng "…"**, không tràn sang tab khác. Số mã vẫn hiện đủ.
- Rê chuột vào tab thì hiện tên đủ, kèm mã NCC và số mã.
- Tab kho nhận ở MH19 dùng chung kiểu nên cũng sửa luôn.

## 2. Phạm vi

| Tệp | Thay đổi |
|---|---|
| `apps/web/src/phan-he/mua-hang/dat-hang/DatHangPage.tsx` | Một đơn đang mở thành danh sách đơn đang mở. Lập đơn thì mở mọi đơn vừa lập; tải lại trang thì mở lại mọi đơn đã giữ. Tên NCC trong tab bọc riêng để cắt "…", thêm tooltip |
| `apps/web/src/phan-he/mua-hang/mua-hang.css`, `apps/web/src/phan-he/mua-hang/ton-max/ton-max.css` | Tab: chữ trong tab co lại và cắt bằng "…" |
| `apps/web/src/phan-he/mua-hang/ton-max/ChuyenShopPage.tsx` | Tab kho nhận MH19: mã kho và tên shop bọc riêng, thêm tooltip |

Thanh dưới (`WindowDock`) và form đơn (`PhieuMuaForm`) không đổi, vì đã hỗ trợ nhiều hộp thoại: mở hộp mới thì hộp cũ cùng thẻ tự thu nhỏ. Chỉ giao diện.

## 3. Kết quả mong đợi

| # | Thao tác | Mong đợi |
|---|---|---|
| 1 | Tích mã của 3 NCC → Lập đơn đặt | 3 đơn nháp; đơn của NCC đầu hiện ra; thanh dưới có 3 ô "Đơn đặt hàng DH… Nháp" |
| 2 | Bấm ô đơn thứ hai | Đơn thứ hai hiện ra, đơn đầu thu nhỏ |
| 3 | Bấm × trên một ô | Chỉ đóng đơn đó |
| 4 | Bấm số đơn trên dòng thông báo xanh | Đơn đó hiện ra, không mở thêm ô trùng |
| 5 | Tải lại trang (F5) khi đang mở 3 đơn | Thanh dưới vẫn đủ 3 ô |
| 6 | MH02 có NCC tên dài (vd CÔNG TY TNHH FONTERRA BRANDS (VIỆT NAM)) | Tab cắt tên bằng "…", không đè tab bên; rê chuột hiện tên đủ |

## 4. Kết quả chạy

| | |
|---|---|
| Ngày chạy | 27/11/2026 (máy dev, DB local `ketoan_otchuong`, Hà Nội, trình duyệt tự động; lệnh lưu đơn bị chặn, giả lập bằng các đơn nháp có sẵn DH26110007 / 08 / 09 nên không ghi DB) |
| Bản code (commit) | nhánh `feat/nt-mh-028-mh02-mo-nhieu-don` |
| Kết quả | Bước 1 **đạt**: tích 7 mã của 4 NCC → Lập đơn đặt; thanh dưới có 3 ô riêng, không trùng: DH26110009 · DH26110007 · DH26110008. Chỉ có 3 đơn để giả lập cho 4 lần lưu, nên một đơn bị trùng; mã đã tự bỏ ô trùng. Bước 2 **đạt**: bấm ô DH26110007 thì đơn đó hiện, đơn kia thu nhỏ. Bước 3–5 **chưa chạy**: dùng sẵn thanh dưới và cơ chế giữ hộp thoại, không đổi. Bước 6 **đạt**, dùng tên NCC dài giả lập như trên máy dev: 5 tab không đè nhau, chữ không tràn ra khỏi tab; tab FONTERRA hiện "CÔNG TY TNHH FONTERR… 2", rê chuột hiện "CÔNG TY TNHH FONTERRA BRANDS (VIỆT NAM) (mã NCC) — 2 mã". Typecheck web sạch. **Cần chạy lại trên máy dev với lệnh lưu thật** |

## 5. Biên bản nghiệm thu

| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 6. Lịch sử thay đổi

| Ngày | Thay đổi |
|---|---|
| 27/11/2026 | Tạo theo yêu cầu (ảnh MH02 + đơn DH26110009, ô thanh dưới) |
| 27/11/2026 | Sửa kèm: tab NCC / kho nhận tên dài bị đè → cắt "…" + tooltip |
