# NT-DM-019 · Nhập mặt hàng từ Excel: bước kiểm tra hiện mã ngành / nhãn / nhóm như DM11
<!-- [2026-11-27 kiennt] NGHIEM-THU — tạo phiếu theo yêu cầu người dùng (đóng góp) -->

| | |
|---|---|
| Phân hệ | Danh mục |
| Màn hình | DM10 Danh mục mặt hàng → Nhập Excel → bước 3 "Kiểm tra dữ liệu" |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 27/11/2026 |
| Trạng thái | Chờ nghiệm thu |

## 1. Yêu cầu

Ở bước **Kiểm tra dữ liệu** khi nhập mặt hàng từ Excel, các cột Ngành hàng / Nhãn hàng / Nhóm hàng hiện dạng "**2 — Sữa bột**", "**18 — Vinamilk**", "**26 — Sữa bà bầu**". Các số 2 / 18 / 26 là **mã nội bộ** do phần mềm tự đánh số. Người dùng không thấy chúng ở đâu khác, và chúng **không khớp** với mã trên **Danh mục nhóm hàng (DM11)**: Sữa bột **11**, Vinamilk **001**, Sữa bà bầu **1**.

Sửa: bước kiểm tra hiện **mã như DM11**, tức đoạn mã dùng ghép mã hàng (`sku_code`), kèm tên. Ví dụ `11 — Sữa bột`, `001 — Vinamilk`, `1 — Sữa bà bầu`.
- Ngành / nhãn lưu ở loại riêng mà không có mã DM11 thì lấy mã của **nút cùng mã trên cây nhóm hàng**.
- Mục không có mã DM11 (mã tự đặt kiểu cũ như `NH-IMP`) thì hiện mã như trước.
- Áp cho cả cột giá trị sẽ ghi lẫn cột "trước khi sửa" của dòng cập nhật.
- **Chỉ đổi phần hiển thị.** Cách khớp dữ liệu không đổi: cột Ngành / Nhãn / Nhóm khớp theo **tên**; cột Mã ngành / Mã nhãn / Mã nhóm khớp theo **mã DM11**. Mặt hàng vẫn gắn đúng mục như trước.

## 2. Phạm vi

| Tệp | Thay đổi |
|---|---|
| `apps/api/src/modules/catalog/catalog-import.ts` | `showClass`: hiện `sku_code` (của chính mục, hoặc nút cùng mã trên cây nhóm hàng) thay cho mã nội bộ |
| `apps/api/test/nt-dm-014-sua-loi-danh-muc.test.ts` | Hai chỗ kiểm chuỗi hiển thị đổi sang mã DM11 + tên. Ý định giữ nguyên: chọn đúng nhóm, tên nhóm là duy nhất |

## 3. Kết quả mong đợi

| # | Thao tác | Mong đợi |
|---|---|---|
| 1 | DM10 → Nhập Excel, tệp có mã 110051001 (Sữa bột / Vinamilk / Sữa bà bầu), đến bước Kiểm tra | Cột Ngành / Nhãn / Nhóm: `11 — Sữa bột` · `001 — Vinamilk` · `1 — Sữa bà bầu`, khớp DM11 |
| 2 | Nhãn mã tự đặt kiểu cũ (vd `NH-IMP`) | Hiện `NH-IMP — tên` như trước |
| 3 | Nhập xong | Mặt hàng gắn đúng ngành / nhãn / nhóm như trước khi sửa |

## 4. Kết quả chạy

| | |
|---|---|
| Ngày chạy | 27/11/2026. Hàm kiểm tra chạy từ mã nguồn vào DB local `ketoan_otchuong` ở chế độ kiểm tra, trong giao dịch huỷ (không ghi). Test API trên CSDL test mới |
| Bản code (commit) | nhánh `fix/nt-dm-019-ma-nhom-khi-nhap-excel` |
| Kết quả | Bước 1 **đạt** trên dữ liệu thật: 110011001 → `11 — Sữa bột · 001 — Vinamilk · 1 — Sữa bà bầu`; 190031001 → `19 — Bỉm/Tã · 003 — Goon · 1 — Miếng lót Newborn trẻ em`. Trước đây hiện `8 — … · 51 — … · 64 — …`. Bước 2 **đạt**: `catalog-import.test.ts` vẫn `NH-IMP — Nhãn nhập thử`. Bước 3 **đạt**: test nhập Excel mặt hàng (catalog-import, nt-dm-003, nt-dm-012, nt-dm-013, nt-dm-014) 35/35, nhập đối tượng 5/5 |

## 5. Biên bản nghiệm thu

| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 6. Lịch sử thay đổi

| Ngày | Thay đổi |
|---|---|
| 27/11/2026 | Tạo theo yêu cầu (ảnh bước Kiểm tra dữ liệu và DM11) |
