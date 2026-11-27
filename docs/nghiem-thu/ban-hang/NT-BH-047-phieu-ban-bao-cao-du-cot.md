# NT-BH-047 · BH10 / BH11 và báo cáo bán hàng — đủ cột như Mua hàng (ĐVT, CK %, tiền gồm thuế, phân kho, lô, hạn dùng)
<!-- [2026-11-26 07:30 PM Võ Hoàng] NGHIEM-THU — lập phiếu NT-BH-047, ghi chốt của bộ phận Bán hàng 26/11 (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng — màn dùng chung `apps/web/src/components/phieu-hang/`, báo cáo `apps/web/src/phan-he/ban-hang/sales/`, truy vấn `apps/api/src/modules/sales/` |
| Màn hình | BH10, BH11 (bảng dòng hàng + danh sách), BH01 Báo cáo bán hàng, BH02 Tổng hợp bán hàng |
| Bộ phận yêu cầu | Bán hàng (kế toán bán hàng) |
| Ngày tạo | 26/11/2026 |
| Trạng thái | **Đã chốt** (bộ phận Bán hàng chốt 26/11/2026 — §2) |
| Trụ cột / tiêu chí | không |

## 1. Mục đích quản trị
Phiếu bán / trả và báo cáo bán hàng thiếu nhiều cột so với phiếu mua (MH) — không thấy hàng ra **kho nào, lô nào, hạn dùng bao
nhiêu**, không thấy tiền gồm thuế từng dòng, không chọn được cột cần xem. Kế toán phải mở thẻ kho / tra lô riêng để đối chiếu.

## 2. Quyết định đã chốt (26/11/2026)

| # | Câu hỏi | Chốt |
|---|---|---|
| 1 | Lô / HSD trên dòng phiếu bán, trả | **Tự chọn lô** (Kernel cấp lô hạn gần trước — FEFO — lúc ghi sổ). Cột **Phân kho, Số lô, Hạn dùng chỉ xem**, hiện khi phiếu **đã duyệt** (đọc phân lô của chứng từ `GET /api/v1/lots/document`). Không thêm ô chọn lô tay, không đổi khuôn phiếu |
| 2 | Bảng dòng hàng BH10 / BH11 | Thêm: **ĐVT chọn theo danh mục** (kèm quy cách "1 Thùng = 48 Hộp"), **CK %**, **Thành tiền gồm thuế**, **Ghi chú dòng**, nút **Chọn cột** (ẩn / hiện cột, nhớ theo máy) |
| 3 | Danh sách BH10 / BH11 | Thêm: **Người duyệt / ngày duyệt**, **Phiếu gốc** (BH11), **Đã thu / Còn nợ** (BH10; BH11: Đã trả / Còn trừ nợ) |
| 4 | BH01 Báo cáo bán hàng (chi tiết dòng) | Thêm: **Kho**, **Nhóm hàng**, **Số lô**, **Hạn dùng**, **SL theo ĐVT nhỏ nhất** |
| 5 | BH02 Tổng hợp bán hàng | Thêm cách xem **Theo kho** |
| 6 | BH06 (module `xuat-dieu-chinh`) | Đã có Tồn, Lô, Hạn dùng — chỉ kiểm, không sửa |

## 3. Các bước thao tác
1. BH10 → mở phiếu đã duyệt BH2611000001 → bảng dòng có Phân kho, Số lô, Hạn dùng; bấm **Chọn cột** ẩn cột Ghi chú → mở lại vẫn ẩn.
2. Lập phiếu mới: chọn mã 1001 → ô ĐVT xổ đủ đơn vị của mã, dưới ô hiện quy cách; gõ CK % = 5 → ô Chiết khấu tự tính.
3. BH01 → khoảng ngày có phiếu trên → thấy cột Kho, Nhóm hàng, Số lô, Hạn dùng, SL ĐVT nhỏ nhất.
4. BH02 → Xem theo **Kho**.

## 4. Số liệu đầu vào

| Phiếu BH2611000001 (đã duyệt) | ĐVT | SL | Quy đổi | Lô cấp (FEFO) |
|---|---|---|---|---|
| 1001 Sữa bột 900g | Thùng | 1 | 1 Thùng = 12 Hộp | L01 HSD 31/12/2026: 12 Hộp |
| 1002 Sữa nước 180ml | Hộp | 30 | — | L05 HSD 15/12/2026: 20; L06 HSD 20/01/2027: 10 |

## 5. Kết quả mong đợi

| Mục | Mong đợi |
|---|---|
| Phiếu đã duyệt — dòng 1001 | Phân kho 08004-KHH · Số lô L01 · HSD 31/12/2026 |
| Phiếu đã duyệt — dòng 1002 | Số lô "L05 (20), L06 (10)" · HSD 15/12/2026 (hạn gần nhất) |
| CK % = 5 trên dòng 2 × 100.000 | Chiết khấu 10.000; sửa ô Chiết khấu tay thì CK % tính lại |
| Thành tiền gồm thuế dòng (8%) | Tiền trước thuế + tiền thuế của dòng |
| BH01 dòng 1001 | Kho 08004-KHH · SL ĐVT nhỏ nhất 12 · Lô L01 · HSD 31/12/2026 |
| BH02 theo kho | Một dòng 08004-KHH, tổng khớp tổng theo chi nhánh 08004 |

**Bút toán:** không đổi (chỉ thêm cột xem).

**Sai số làm tròn chấp nhận:** 0 đ.

## 6. Trường hợp lệch chuẩn

| # | Làm thế này | Phần mềm phải |
|---|---|---|
| 1 | Phiếu nháp | Cột Lô / HSD để trống, rê chuột: "Lô cấp lúc duyệt (hạn gần trước)" |
| 2 | Mặt hàng không theo dõi lô | Cột Lô / HSD trống |
| 3 | CK % > 100 hoặc âm | Chặn ở ô |
| 4 | Dòng không ghi kho (kho mặc định) ở BH01 | Kho = kho mặc định của chi nhánh |

## 7. Kết quả chạy
| | |
|---|---|
| Ngày chạy | |
| Bản code (commit) | |
| Test tự động | `apps/api/test/nt-bh-047-*.test.ts` |
| Tiêu chí lên mức | không đổi mức |

## 8. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 9. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 26/11/2026 | Lập phiếu, ghi chốt 6 mục §2 |
