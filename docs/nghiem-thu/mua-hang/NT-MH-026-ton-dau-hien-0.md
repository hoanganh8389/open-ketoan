# NT-MH-026 · Báo cáo kho: số lượng tồn không có thì ghi 0
<!-- [2026-11-27 kiennt] NGHIEM-THU — tạo phiếu theo yêu cầu người dùng (đóng góp) -->

| | |
|---|---|
| Phân hệ | Mua hàng / Kho |
| Màn hình | MH24 Sổ kho theo mặt hàng · MH25 Tồn kho theo mặt hàng · ACC83 Tổng hợp tồn kho |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 27/11/2026 |
| Trạng thái | Chờ nghiệm thu |

## 1. Yêu cầu

Ở các báo cáo kho, ô số lượng tồn bằng 0 đang để trống, người xem không biết là tồn 0 hay chưa có số liệu. **Số lượng tồn đầu không có thì phải ghi 0.** Các cột số lượng tồn khác cũng làm như vậy:

| Màn | Cột ghi 0 khi không có |
|---|---|
| MH24 Sổ kho theo mặt hàng | **Σ tồn đầu**, **Σ tồn cuối** |
| MH25 Tồn kho theo mặt hàng | **Số lượng** (tồn tại ngày "Đến ngày") |
| ACC83 Tổng hợp tồn kho (mọi cách "Xem theo") | **Đầu kỳ · Số lượng**, **Cuối kỳ · Số lượng** |

- Các cột phát sinh (nhập, xuất, nhập lại, nội bộ…) và cột giá trị vẫn để trống khi bằng 0, như cũ, để bảng dễ đọc.
- Xuất Excel lấy đúng số đang hiện.

## 2. Phạm vi

| Tệp | Thay đổi |
|---|---|
| `apps/web/src/phan-he/mua-hang/bao-cao-kho/BaoCaoKhoPages.tsx` | MH24: thêm hàm `tonCol` (cột tồn hiện 0), dùng cho Σ tồn đầu, Σ tồn cuối. MH25: cột Số lượng hiện 0 |
| `apps/web/src/phan-he/kho/inventory/InventoryPages.tsx` | ACC83: Đầu kỳ / Cuối kỳ · Số lượng hiện 0 |

Chỉ hiển thị, không đổi API, không đổi số liệu.

## 3. Kết quả mong đợi

| # | Thao tác | Mong đợi |
|---|---|---|
| 1 | MH24, kỳ đầu tháng → nay, Tìm kiếm | Cột Σ tồn đầu ghi 0 ở mã không có tồn đầu; Σ tồn cuối = 0 thì ghi 0 |
| 2 | MH25, Tìm kiếm | Dòng tồn 0 (vd HY-HH chỉ còn giá trị) cột Số lượng ghi 0 |
| 3 | ACC83, Tìm kiếm | Đầu kỳ · Số lượng ghi 0 khi không có tồn đầu; Cuối kỳ · Số lượng = 0 thì ghi 0 |

## 4. Kết quả chạy

| | |
|---|---|
| Ngày chạy | 27/11/2026 (máy dev, DB local `ketoan_otchuong`, mọi chi nhánh, kỳ 01/11 – 27/11/2026, trình duyệt tự động) |
| Bản code (commit) | nhánh `feat/nt-mh-024-027-mua-hang` |
| Kết quả | Bước 1 **đạt**: MH24 5 dòng, Σ tồn đầu "0 · 0 · 0 · 0 · 0" (trước để trống), Σ tồn cuối không ô nào trống. Bước 2 **đạt**: MH25 14 dòng, dòng tồn 0 ghi 0. Bước 3 **đạt**: ACC83 18 dòng, Đầu kỳ · Số lượng đều ghi 0. Typecheck web sạch |

## 5. Biên bản nghiệm thu

| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 6. Lịch sử thay đổi

| Ngày | Thay đổi |
|---|---|
| 27/11/2026 | Tạo theo yêu cầu (ảnh MH24, MH25, ACC83) |
