# NT-MH-024 · Chuyển hàng xuống shop (MH19): bỏ khung cảnh báo vàng, tab theo kho nhận thay tab NCC, thanh công cụ gọn
<!-- [2026-11-26 kiennt] NGHIEM-THU — tạo phiếu theo yêu cầu người dùng (đóng góp) -->

| | |
|---|---|
| Phân hệ | Mua hàng |
| Màn hình | MH19 Chuyển hàng xuống shop |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 26/11/2026 |
| Trạng thái | Chờ nghiệm thu |

## 1. Yêu cầu

Trên máy dev (chi nhánh Phú Thọ, 12 shop, màn ~1470px), bảng thông tin quá nhỏ. Phía trên bảng có các phần chiếm chỗ:
- khung cảnh báo vàng "Chưa nhận được kho tổng…";
- nút Đề xuất / Đã chốt nằm riêng một hàng;
- 12 nút shop tràn thêm một hàng;
- nút Cách chia rơi xuống hàng riêng;
- tab NCC bị ép còn 2 tab vì phải nhường chỗ cho các nút bên phải.

Yêu cầu: **bỏ khung cảnh báo vàng** và sắp xếp lại cho gọn. Bổ sung cùng ngày: **bỏ tab nhà cung cấp ở MH19**. Tab theo NCC đúng chỗ là Phân tích đặt hàng (MH02), làm ở phiếu riêng. MH19 chia hàng từ kho xuống shop, không theo NCC.

Thanh công cụ còn **một hàng, theo bố cục MH02** (Hiện · Tìm · nút phụ · Xuất Excel · nút chính):

`[Đề xuất chuyển | Đề nghị đã chốt]` · **Hiện ▾** (Tất cả dòng (n) / Thiếu do kho hết (n)) · ô **Tìm mã, tên hàng…** (không dấu) · **Tuỳ chọn chia ▾** · **Xuất Excel** · **Chốt đề nghị (n shop · n dòng · SL x)**

- **Tuỳ chọn chia ▾**: ô bật ra gồm **Kho xuất**, **Shop** (danh sách shop, bấm theo thứ tự ưu tiên, nút Tất cả shop), **Làm tròn** kèm ngưỡng thùng, và **Khi kho không đủ**.
- Đang chọn shop thì nút hiện huy hiệu "n shop".
- Rê chuột vào nút xem tóm tắt kho xuất · shop · làm tròn · cách chia.

Bỏ khỏi MH19 (vốn có từ NT-MH-023):
- dải tab NCC;
- cột NCC;
- việc chốt theo tab;
- việc API `transfer-suggest` tra NCC từng mã.

Hàm `nccMacDinh` dùng chung với MH02 vẫn giữ.

**Mỗi kho nhận một tab** (thay tab NCC):
- Dưới thanh công cụ có dải tab **Tất cả kho nhận (n)** · `07001-KHH Shop Hà Nội 1 (n)` · …, mỗi shop có dòng đề xuất một tab. Tab ghi mã kho nhận, tên shop và số dòng.
- Bấm tab thì bảng chỉ còn dòng của kho đó. Ô *Thiếu do kho hết*, nút **Chốt đề nghị** (số shop · dòng · SL) và Xuất Excel tính theo tab.
- Chốt ở tab Tất cả thì sang *Đề nghị đã chốt* như cũ. Chốt ở một tab kho thì **ở lại** để chốt tiếp kho khác. Dòng vừa chốt tự ẩn, vì đã tính là đề nghị chưa làm.
- Phần Shop trong **Tuỳ chọn chia** vẫn giữ: dùng để chọn shop đưa vào tính và thứ tự ưu tiên khi kho xuất không đủ. Tab chỉ để xem và chốt từng kho.

- Thẻ **Đề nghị đã chốt**: nút chuyển thẻ và ô trạng thái nằm cùng một hàng.
- Khung cảnh báo "Chưa nhận được kho tổng" **chỉ bỏ ở MH19**. MH16, MH17, MH18, MH02 vẫn hiện, sửa cây ở DM16.
- Cách tính, chia hàng, chốt: không đổi.

## 2. Phạm vi

| Tệp | Thay đổi |
|---|---|
| `apps/web/src/phan-he/mua-hang/ton-max/ChuyenShopPage.tsx` | Bố cục thanh công cụ; thêm thành phần `Pop` (ô bật ra, bấm ngoài thì đóng); bỏ `ChuaPhanCap`; bỏ tab NCC, cột NCC |
| `apps/web/src/phan-he/mua-hang/ton-max/api.ts` | Bỏ `partnerCode`, `partnerName` khỏi dòng đề xuất |
| `apps/api/src/phan-he/mua-hang/ton-max.ts` | `transferSuggest` thôi tra NCC (bớt truy vấn phiếu nhập / bảng giá) |
| `apps/web/src/phan-he/mua-hang/ton-max/ton-max.css` | Kiểu ô bật ra, danh sách shop, tab NCC |
| `docs/huong-dan/mua-hang-chuyen-shop.md` | Cách chọn shop mới; bỏ mục "Xem theo nhà cung cấp" |

API chỉ bớt trường NCC vừa thêm ở NT-MH-023, không đổi cách tính.

## 3. Kết quả mong đợi

| # | Thao tác | Mong đợi |
|---|---|---|
| 1 | Mở MH19 | Không còn khung vàng; Đề xuất/Đã chốt · Hiện · Tìm · Tuỳ chọn chia · Xuất Excel · Chốt trên **một hàng** như MH02 (màn 1470px) |
| 2 | Tuỳ chọn chia ▾ → bấm một shop | Ô bật ra có Kho xuất, Shop, Làm tròn, Khi kho không đủ; shop chọn có số 1; nút có huy hiệu "1 shop"; bảng chỉ còn shop đó |
| 3 | Bấm "Tất cả shop"; gõ "sua bau" ở ô Tìm; Hiện = Thiếu do kho hết | Bỏ chọn shop; ô Tìm lọc không dấu; Hiện lọc đúng |
| 4 | Thẻ Đề nghị đã chốt | Nút chuyển thẻ + ô trạng thái cùng hàng |
| 5 | Xem bảng | Không còn tab NCC / cột NCC |
| 6 | Bấm tab một kho nhận | Bảng chỉ còn dòng của shop đó; nút Chốt đếm theo tab; tab Tất cả kho nhận thì đủ dòng |

## 4. Kết quả chạy

| | |
|---|---|
| Ngày chạy | 26/11/2026 (máy dev, DB local `ketoan_otchuong`, Hà Nội 2 shop, màn 1470×880, trình duyệt tự động, chặn lệnh ghi; tên NCC giả lập dài như máy dev) |
| Bản code (commit) | nhánh `feat/nt-mh-024-025-mh19-mh02` |
| Kết quả | Bước 1 **đạt**: không còn khung vàng; 5 phần cùng một hàng (lệch ≤ 3px). Bảng bắt đầu ở y≈320, trước đây ≈540 trên ảnh máy dev. Bước 1 (bố cục MH02) **đạt**: 6 phần cùng một hàng, lệch ≤ 3px. Bước 2 **đạt**: ô bật ra đủ 3 ô chọn + danh sách shop, không tràn màn; chọn shop thì nút có "1 shop". Bước 3 **đạt**: tìm "sua bau" từ 23 còn 2 hàng. Bước 4, 5 **đạt**. Bước 6 **đạt**: tab hiện "Tất cả kho nhận 21 · 07001-KHH Shop Hà Nội 1 11 · 07002-KHH Shop Hà Nội 2 10"; bấm 07001 thì bảng từ 23 còn 12 hàng (11 dòng + 1 nhóm); về Tất cả thì đủ. Typecheck api và web sạch |

## 5. Biên bản nghiệm thu

| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 6. Lịch sử thay đổi

| Ngày | Thay đổi |
|---|---|
| 26/11/2026 | Tạo theo yêu cầu (ảnh màn máy dev, chi nhánh Phú Thọ) |
| 26/11/2026 | Bổ sung: bỏ tab NCC ở MH19 (tab NCC chuyển sang MH02, phiếu NT-MH-025); MH19 có tab theo kho nhận |
| 26/11/2026 | Thanh công cụ theo bố cục MH02: Hiện ▾ · Tìm · Tuỳ chọn chia ▾ (gộp Kho xuất, Shop, Làm tròn, Khi kho không đủ) · Xuất Excel · Chốt |
| 26/11/2026 | Tab gọn: cao 26px, chữ 12.5px, số dòng trong ô tròn nhỏ; tab đang mở nền trắng, viền xanh trên, nối liền với bảng (kiểu sheet Excel) |
