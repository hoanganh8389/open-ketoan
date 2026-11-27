# NT-BH-053 · Báo cáo tồn kho và Thẻ kho chi tiết của máy POS đọc sổ kho kế toán (chỉ số lượng)
<!-- [2026-11-28 Võ Hoàng] NGHIEM-THU — tạo phiếu, Đã chốt (Hoàng giao 28/11) (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng (máy POS) |
| Màn hình | Máy bán: Báo cáo tồn kho, Thẻ kho chi tiết (mở từ Sổ kho theo mặt hàng) |
| Bộ phận yêu cầu | Bán hàng |
| Ngày tạo | 28/11/2026 |
| Trạng thái | Đã chốt — "báo cáo tồn / thẻ kho POS đọc kế toán, chỉ số lượng; nhân viên POS chỉ cần biết tồn và giá bán" (Hoàng giao 28/11) |
| Trụ cột / tiêu chí | không đổi mức trụ cột (một nguồn số liệu kho) |

## 1. Mục đích quản trị
Thu ngân xem tồn và thẻ kho ở máy bán thấy **đúng số của kế toán** (cùng MH24 "Sổ kho theo mặt hàng"), không còn số của sổ kho
website (sổ website thiếu nhập mua / chuyển kho / điều chỉnh / kiểm kê lập ở kế toán). Máy bán **không thấy giá vốn**.

## 2. Khai báo trước
Không khai thêm. Vé đăng nhập POS có `pos:sell` (thẻ kho) và `mua-hang:so-kho-xem` (Báo cáo tồn kho đọc MH24).

## 3. Các bước thao tác
1. Máy bán → Sổ kho theo mặt hàng → bấm một dòng → Thẻ kho chi tiết của mã đó, khoảng ngày như Sổ kho.
2. Máy bán → Báo cáo tồn kho: tồn từng mã của cửa hàng tới hôm nay, giá bán, SL theo ĐVT bán, tồn max, SL cần nhập.

## 4. Số liệu đầu vào
Mã TK01 (Hộp): CN01 nhập mua 50 (tháng trước); hôm nay bán 3, khách trả 1. CN02 nhập 20.

## 5. Kết quả mong đợi
- **Thẻ kho** (`GET /api/v1/m/pos/reports/stock-card?sku&from&to&branch`, action `pos.report.stock-card`, khung nhìn đọc `bizcity_read.stock_moves` 0187):
  - kỳ hôm nay CN01: tồn đầu 50; Xuất bán 3 (tồn 47); Khách trả hàng 1 (tồn 48); tồn cuối 48;
  - kỳ gồm ngày nhập: tồn đầu 0, dòng Nhập mua 50 kèm tên nhà cung cấp;
  - tồn đầu / tồn cuối **bằng** MH24 cùng chi nhánh, cùng kỳ (mọi kho của chi nhánh);
  - không có cột tiền nào (đơn giá, thành tiền, giá vốn); khung nhìn không có cột tiền.
- **Báo cáo tồn kho**: tồn = tồn cuối MH24 tới hôm nay của chi nhánh máy; giá bán = bảng giá đang áp của cửa hàng (danh mục bán máy POS)
  tính cho ĐVT nhỏ nhất; tồn max = max hiện tại MH17; SL cần nhập = max − tồn. "Kiểm đặc biệt" lấy mã có phát sinh trong khoảng ngày
  từ MH24.
- Không bút toán, không đổi sổ.

## 6. Trường hợp lệch chuẩn
| Trường hợp | Mong đợi |
|---|---|
| Thu ngân chỉ `pos:sell` xem chi nhánh khác | 403 (như báo cáo bán hàng NT-BH-043) |
| Khoảng ngày > 366 ngày / đảo ngược / sai khuôn | 400, báo ở ô ngày |
| Chưa chọn mã | thẻ rỗng, 200 |
| Mặc định đã áp (M1) | "SL đi đường" và "nhóm hàng chiến lược" của trang cũ không có ở kế toán → Báo cáo tồn kho bỏ SL đi đường, lọc nhóm theo nhóm hàng của danh mục kế toán |
| Mặc định đã áp (M2) | Bấm một dòng thẻ kho chỉ hiện thông tin dòng (số phiếu, loại, đối tượng) — xem chứng từ đầy đủ ở kế toán |

## 7. Kết quả chạy
- `apps/api/test/nt-bh-053-the-kho-pos.test.ts` 6/6 (gồm so MH24), `modules/pos/test/stock-card.test.ts` 3/3; `sdk-modules.contract` đạt; `npx bizcity module check pos` ĐẠT — thử trên máy local 28/11. (đề xuất — tệp test ở nhánh code)

## 8. Biên bản nghiệm thu
Chờ chạy trên UAT.

## 9. Lịch sử thay đổi
- 28/11/2026 — tạo phiếu, Đã chốt (Hoàng giao).
