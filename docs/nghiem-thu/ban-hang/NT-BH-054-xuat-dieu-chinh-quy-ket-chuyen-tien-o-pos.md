# NT-BH-054 · Máy bán: xuất điều chỉnh, quỹ két, phiếu chuyển tiền đọc / ghi ở kế toán
<!-- [2026-11-28 Võ Hoàng] NGHIEM-THU — tạo phiếu, Đã chốt (Hoàng giao 28/11) (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng (máy bán) / Quỹ |
| Màn hình | Máy bán: "Phiếu xuất điều chỉnh", "Quản lý quỹ két", "Phiếu chuyển tiền" — đọc / ghi ở kế toán (BH06 module `xuat-dieu-chinh`, chứng từ `cash_transfer`, sổ cái TK 111) |
| Bộ phận yêu cầu | Bán hàng (Hoàng) |
| Ngày tạo | 28/11/2026 |
| Trạng thái | Đã chốt — "xuất điều chỉnh, quỹ két, chuyển tiền ở POS đọc / ghi kế toán" (Hoàng giao 28/11) |
| Trụ cột / tiêu chí | không đổi mức trụ cột (máy bán thôi dùng sổ website) |

## 1. Mục đích quản trị
Ba màn của máy bán trước đọc / ghi sổ website (sổ website chỉ còn bản sao đơn bán, không thấy nghiệp vụ lập ở kế toán). Từ phiếu này:
- **Phiếu xuất điều chỉnh**: thu ngân lập / xem phiếu ở module BH06 của kế toán (cùng phiếu kế toán thấy ở BH06), trừ kho ngay khi ghi sổ.
- **Phiếu chuyển tiền**: thu ngân lập chứng từ `cash_transfer` (trạng thái "đã gửi", kế toán xác nhận đã nhận tiền ở kế toán).
- **Quản lý quỹ két**: sổ quỹ tiền mặt của cửa hàng đọc sổ cái TK 111 của chi nhánh (`GET /api/v1/cash-fund`).
- Máy bán không bao giờ thấy giá vốn: module BH06 bỏ giá vốn khỏi dữ liệu trả cho người không có quyền ghi chứng từ (`documents:write`).

## 2. Khai báo trước
Vé đăng nhập máy bán mang thêm quyền: `xuat-dieu-chinh:phieu-xem`, `xuat-dieu-chinh:phieu-lap`, `quy:chuyen-tien-xem`, `quy:chuyen-tien-lap`.
Hình thức thanh toán TM gắn TK 111x; ngân hàng nhận khai ở danh mục tài khoản ngân hàng.

## 3. Các bước thao tác
1. Máy bán → Phiếu xuất điều chỉnh → Tạo phiếu: chọn lý do, kho, mã, SL → Lưu (ghi sổ). Phiếu hiện ở BH06 của kế toán.
2. Máy bán → Phiếu chuyển tiền → Tạo: chi nhánh nhận, hình thức / ngân hàng nhận, số tiền → Lưu. Kế toán thấy phiếu "chờ xác nhận".
3. Máy bán → Quản lý quỹ két: chọn khoảng ngày → sổ quỹ từng ngày + lịch sử quỹ.

## 4. Số liệu đầu vào (test `apps/api/test/nt-bh-054-quy-ket-pos.test.ts`)

| Chứng từ | Ngày | Hình thức | Số tiền |
|---|---|---|---|
| Đơn bán HD0000 | 30/09 | TM | 200.000 |
| Đơn bán HD0001 | 05/10 | TM | 200.000 |
| Đơn bán HD0002 | 05/10 | CK | 200.000 |
| Phiếu trả TH0001 | 06/10 | TM (hoàn) | 50.000 |
| Phiếu chuyển tiền CT0001 | 07/10 | TM → CK cùng chi nhánh | 100.000 |

## 5. Kết quả mong đợi
- Sổ quỹ 01–07/10 CN01: tồn đầu 200.000; 05/10 bán tiền mặt 200.000 → 400.000; 06/10 hoàn 50.000 → 350.000; 07/10 chuyển 100.000 → 250.000. Đơn chuyển khoản không vào két.
- Lịch sử quỹ chỉ có CT0001 (Chuyển tiền, chi 100.000).
- Phiếu xuất điều chỉnh: kế toán thấy giá vốn ở cảnh báo dưới giá vốn; thu ngân chỉ thấy mã + giá bán.

## 6. Mặc định đã áp (Hoàng xem lại)
- M1 Quỹ két chỉ xem ở máy bán; thu / chi tiền mặt thủ công lập phiếu thu / chi ở kế toán (máy bán không lập phiếu thu chi).
- M2 Cài đặt cảnh báo quỹ (ngưỡng tiền, số ngày) của màn cũ chưa chuyển — đề xuất khai ở kế toán sau.
- M3 Vé máy bán chưa mang chi nhánh → các màn đọc theo chi nhánh của cửa hàng do máy bán gửi; chặn xem chi nhánh khác cần vé có phạm vi chi nhánh (việc riêng).
- M4 Sửa phiếu chuyển tiền ở máy bán: gửi bản mới cùng mã phiếu khi kế toán chưa xác nhận.

## 7. Kết quả chạy
- `nt-bh-054-quy-ket-pos.test.ts` 4/4; `nt-bh-044-xuat-dieu-chinh.test.ts` 29/29 (1 todo); `nt-bh-052-tien-tu-chung-tu.test.ts` 4/4.
