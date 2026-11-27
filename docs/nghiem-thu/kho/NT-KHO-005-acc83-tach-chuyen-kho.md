# NT-KHO-005 · Tổng hợp tồn kho (ACC83): tách chuyển kho khỏi nhập / xuất, bỏ trùng chuyển kho nội bộ
<!-- [2026-11-27 kiennt] NGHIEM-THU — tạo phiếu theo yêu cầu người dùng (đóng góp) -->

| | |
|---|---|
| Phân hệ | Kho |
| Màn hình | ACC83 Tổng hợp tồn kho (mọi cách "Xem theo") |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 27/11/2026 |
| Trạng thái | Chờ nghiệm thu |

## 1. Yêu cầu

Kho tổng nhập hàng bằng phiếu **mua**. Shop nhập hàng bằng phiếu **chuyển kho** từ kho tổng xuống. Xem ACC83 gộp nhiều chi nhánh thì cột Nhập kho / Xuất kho **bị đếm trùng**: cùng một lô hàng chuyển xuống shop được tính một lần là "xuất" ở kho tổng, một lần là "nhập" ở shop.

Ví dụ: kho tổng mua 100, chuyển 60 xuống shop. Tổng cộng đang hiện nhập 160, xuất 60. Thực tế cả công ty chỉ nhập 100, chưa xuất. Tồn cuối 100 vẫn đúng.

Sửa:
1. **Tách cột.** Nhập kho tách thành **Nhập mua / khác** và **Nhập chuyển kho**. Xuất kho tách thành **Xuất bán / khác** và **Xuất chuyển kho**. Mỗi cột đều có Số lượng và Giá trị. Cột tổng **Tổng nhập** và **Tổng xuất** vẫn còn, mặc định ẩn, bật lại được ở nút Cột.
2. **Bỏ trùng.** Chuyển kho **nội bộ trong phạm vi đang xem** là phiếu chuyển có cả hai đầu (chuyển đi và nhận) cùng nằm trong các chi nhánh / kho đã chọn, và cùng phát sinh trong kỳ. Phần này không tính vào:
   - dòng **Tổng cộng**;
   - chế độ **Cộng gộp các kho**;
   - các cách xem gộp nhiều chi nhánh vào một dòng: nhãn, nhóm hàng, loại hàng, ngành hàng, nhóm hạch toán.
3. **Từng dòng chi nhánh giữ nguyên.** Với từng chi nhánh, nhận / chuyển kho là nhập / xuất thật, kể cả dòng "Cộng nhóm" của chi nhánh và cách xem theo Chi nhánh.
4. **Phần vẫn tính là nhập / xuất:**
   - chuyển sang / nhận từ chi nhánh **ngoài** phạm vi chọn;
   - hàng **đi đường**: đã chuyển đi nhưng chưa nhận, hoặc nhận ở kỳ khác.
5. **Tồn cuối không đổi**: luôn bằng đầu kỳ + mọi nhập − mọi xuất.

Hai đầu một phiếu chuyển là hai sự kiện kế toán riêng (chuyển đi, nhận), nối nhau bằng mã nhóm phiếu chuyển. Nguồn ghi cả hai đầu trong một sự kiện thì nối theo sự kiện.

## 2. Phạm vi

| Tệp | Thay đổi |
|---|---|
| `apps/api/src/modules/inventory/inventory-report.service.ts` | Đánh dấu chuyển kho nội bộ trong phạm vi xem (chỉ trong ACC83; `valuedMovements` dùng chung **không đổi**). Mỗi dòng trả thêm chuyển đến / đi và phần nội bộ. Gom theo nhãn, nhóm… thì trừ phần nội bộ ngay ở dòng. Tổng giá trị nhập / xuất bỏ phần nội bộ |
| `apps/web/src/phan-he/kho/inventory/InventoryPages.tsx` | Tách 4 nhóm cột; dòng Tổng cộng của cột chuyển kho / tổng nhập / tổng xuất trừ phần nội bộ; Cộng gộp các kho trừ phần nội bộ |

Không migration, không đổi số liệu sổ.

## 3. Kết quả mong đợi

| # | Thao tác | Mong đợi |
|---|---|---|
| 1 | ACC83, mọi chi nhánh, xem theo Mặt hàng | Có 4 nhóm cột Nhập mua / khác · Nhập chuyển kho · Xuất bán / khác · Xuất chuyển kho. Từng dòng chi nhánh: shop nhận hàng ghi ở Nhập chuyển kho, kho tổng chuyển đi ghi ở Xuất chuyển kho |
| 2 | Dòng Tổng cộng | Nhập / xuất chuyển kho chỉ còn phần đi / đến kho ngoài phạm vi và phần đi đường. Đầu kỳ + nhập − xuất = cuối kỳ |
| 3 | Xem theo Nhãn hiệu / Nhóm hàng | Dòng không còn chuyển kho nội bộ; tổng như bước 2 |
| 4 | Chỉ chọn một chi nhánh | Như trước: chuyển kho của chi nhánh đó là nhập / xuất |

## 4. Kết quả chạy

| | |
|---|---|
| Ngày chạy | 27/11/2026 (máy dev, DB local `ketoan_otchuong`, mọi chi nhánh, kỳ 01/11 – 27/11/2026. Hàm báo cáo chạy thẳng từ mã nguồn vào DB, chỉ đọc. Giao diện dùng đúng kết quả hàm đó, vì API docker chưa có code mới) |
| Bản code (commit) | nhánh `feat/nt-kho-005-acc83-tach-chuyen-kho` |
| Kết quả | Dữ liệu kỳ: mua 350; chuyển đi 305 (CK2600003 HY01 → HL-HH 285 Lon, đã nhận; CK2600001 07000 → 07002 20 Lon, chưa nhận). Bước 1 **đạt**: 4 nhóm cột; HL-HH ở Nhập chuyển kho 285, HY01 ở Xuất chuyển kho 285. Bước 2 **đạt**: Tổng cộng: Nhập mua / khác 486 · Nhập chuyển kho 0 · Xuất bán / khác 84 · Xuất chuyển kho 20 (đi đường) · Cuối kỳ 382. 0 + 486 − 104 = 382. Trước đây tổng nhập 771, tổng xuất 389. Bước 3 **đạt** (theo nhãn): Σ nhập 486, Σ xuất 104, chuyển đến 0, chuyển đi 20, cuối 382. Bước 4 **chưa chạy** (logic dòng chi nhánh giữ nguyên). Typecheck api và web sạch |

## 5. Biên bản nghiệm thu

| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 6. Lịch sử thay đổi

| Ngày | Thay đổi |
|---|---|
| 27/11/2026 | Tạo theo yêu cầu (ảnh ACC83: kho tổng nhập mua, shop nhập chuyển kho → nhập kho tổng cộng bị trùng) |
