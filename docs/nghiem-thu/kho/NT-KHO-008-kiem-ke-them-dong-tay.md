# NT-KHO-008 · Biên bản kiểm kê: nút "+ Thêm dòng" cho hàng / lô không có trong sổ
<!-- [2026-11-27 kiennt] NGHIEM-THU — tạo phiếu theo yêu cầu người dùng (đóng góp) -->

| | |
|---|---|
| Phân hệ | Kho |
| Màn hình | Kiểm kê kho → Biên bản kiểm kê |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 27/11/2026 |
| Trạng thái | Chờ nghiệm thu |

## 1. Yêu cầu

Khi kiểm kê, ở cửa hàng có thể còn hàng mà sổ không có:
- số lô / HSD **đã hết** trong sổ (đã xuất hết theo sổ nhưng thực tế còn);
- số lô / HSD **chưa từng có** trong hệ thống;
- mã hàng chưa có trong danh sách "Lấy số tồn" vì sổ đang 0.

Trước đây chỉ thêm được **lô mới của mã đã có trên biên bản**, và phải qua "Nhập kết quả từ Excel". Mã chưa có trên biên bản thì bị báo lỗi.

Thêm nút **"+ Thêm dòng"** cạnh "Lấy số tồn" / "Nhập kết quả từ Excel". Nút chỉ hiện khi biên bản đang nháp và đã chọn chi nhánh. Bấm nút thì **có ngay một dòng trống ở cuối bảng, sửa trực tiếp trên dòng**, không mở hộp thoại:
- **Mã hàng** và **Tên hàng** đều là **ô tìm**: gõ mã, tên hoặc mã vạch. Chọn ở ô nào thì cả mã, tên, ĐVT cũng tự điền. Ô Tên hàng hiện tên khi không gõ.
- **Số lô**: gõ tay. Để trống = không theo lô.
- **HSD**: gõ / chọn ngày. HSD sổ và HSD thực tế lấy cùng ngày.
- **Theo kiểm kê**, **Không đủ chất lượng**, **Ghi chú**: như các dòng khác. Theo sổ = 0, Chênh lệch = số kiểm kê (thừa).
- Nút **×** cạnh số thứ tự để xoá dòng thêm tay.
- Dòng chưa chọn mã, hoặc trùng mã + lô với dòng khác, thì báo đỏ dưới bảng ("Dòng 3 chưa chọn mã hàng…", "Dòng 4 trùng mã … với dòng 2") và **không cho Ghi / Ghi nhận chênh lệch**.
- Bấm **Lấy số tồn** lại thì dòng thêm tay vẫn giữ.
- **Ghi nhận chênh lệch** dùng cách sẵn có: nhập thừa đúng **số lô + HSD đã khai**. Lô chưa có thì tạo lô mới với HSD đó. Phần không đủ chất lượng chuyển kho cách ly như các dòng khác.

## 2. Phạm vi

| Tệp | Thay đổi |
|---|---|
| `apps/web/src/phan-he/kho/kiem-ke/BienBanKiemKe.tsx` | Nút "+ Thêm dòng" thêm dòng trống; dòng thêm tay sửa ngay trên bảng (ô tìm Mã hàng / Tên hàng, Số lô, HSD, nút ×); chặn Ghi khi dòng thiếu mã / trùng mã + lô |
| `apps/web/src/phan-he/kho/kiem-ke/kiem-ke.css` | Kiểu nút × xoá dòng |
| `apps/api/test/kiem-ke-them-tay.test.ts` | Test: dòng thêm tay → ghi nhận chênh lệch nhập đúng lô + HSD |

API không đổi: máy chủ đã nhận dòng `newLot`, dòng thừa dùng HSD thực tế.

## 3. Kết quả mong đợi

| # | Thao tác | Mong đợi |
|---|---|---|
| 1 | Biên bản mới, chi nhánh 07000, Lấy số tồn → + Thêm dòng | Thêm một dòng trống cuối bảng có ô Mã hàng, Tên hàng, Số lô, HSD; báo "chưa chọn mã hàng" |
| 2 | Ở ô Tên hàng gõ "sữa bột", chọn | Mã 110011003, tên, ĐVT Lon tự điền |
| 3 | Số lô LX7, HSD 31/05/2027, kiểm 6 | Theo sổ 0, Chênh lệch +6; hết báo lỗi |
| 4 | + Thêm dòng rồi bấm × | Dòng bị xoá |
| 5 | Bấm Lấy số tồn lại | Dòng thêm tay vẫn còn |
| 6 | Ghi nhận chênh lệch (sổ: lô A1 10; thêm tay lô B9 HSD 30/06/2027 đếm 4) | Tồn sau ghi nhận: A1 = 10 (HSD 31/03/2027), **B9 = 4 (HSD 30/06/2027)** |

## 4. Kết quả chạy

| | |
|---|---|
| Ngày chạy | 27/11/2026. Bước 1–3: máy dev, DB local `ketoan_otchuong`, trình duyệt tự động, chặn lệnh ghi. Bước 4: test API trên CSDL test mới |
| Bản code (commit) | nhánh `feat/nt-kho-007-kiem-ke-khong-du-chat-luong` |
| Test tự động | `apps/api/test/kiem-ke-them-tay.test.ts` 1/1 đạt; `kiem-ke-kho.test.ts` 13/13 vẫn đạt |
| Kết quả | Bước 1 **đạt**. Bước 2 **đạt**: gõ "sữa bột" ở ô Tên hàng → mã 110011003, tên VNM sữa bột, ĐVT Lon. Bước 3 **đạt**: dòng `0 · 6 · +6`, hết báo lỗi. Bước 4 **đạt**. Bước 5 **đạt** (lần thử hộp thoại trước; logic giữ dòng `newLot` không đổi). Bước 6 **đạt** (test API): tồn theo lô `A1 = 10 (2027-03-31), B9 = 4 (2027-06-30)`. Typecheck web sạch; typecheck api không thêm lỗi (lỗi có sẵn ở `nt-bh-054` trên dev) |

## 5. Biên bản nghiệm thu

| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 6. Lịch sử thay đổi

| Ngày | Thay đổi |
|---|---|
| 27/11/2026 | Tạo theo yêu cầu (lô / HSD đã hết hoặc không có trong hệ thống nhưng cửa hàng vẫn còn hàng) |
| 27/11/2026 | Đổi từ hộp thoại sang dòng sửa ngay trên bảng; Mã hàng và Tên hàng đều là ô tìm |
