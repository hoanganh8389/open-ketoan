# NT-BH-046 · BH11 Hàng bán trả lại — trả theo phiếu gốc, chọn dòng còn trả, không tự thêm dòng
<!-- [2026-11-26 07:30 PM Võ Hoàng] NGHIEM-THU — lập phiếu NT-BH-046, ghi chốt của bộ phận Bán hàng 26/11 (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng — module `modules/phieu-ban` (phiếu trả `sale_return`), màn dùng chung `apps/web/src/components/phieu-hang/` |
| Màn hình | BH11 Hàng bán trả lại (`/ban-hang/tra-lai`) |
| Bộ phận yêu cầu | Bán hàng (kế toán bán hàng) |
| Ngày tạo | 26/11/2026 |
| Trạng thái | **Đã chốt** (bộ phận Bán hàng chốt 26/11/2026 — §2) |
| Trụ cột / tiêu chí | không |

## 1. Mục đích quản trị
Hiện BH11 chọn khách rồi tự gõ dòng hàng bất kỳ — trả được hàng khách không mua, trả quá số đã bán, giá tự gõ. Phiếu trả phải
**bám đúng phiếu bán gốc**: chỉ trả hàng có trên phiếu gốc, không quá số còn trả, giá / chiết khấu / thuế đúng như lúc bán — để
doanh thu, công nợ, tồn kho và giá vốn hàng trả về không lệch.

## 2. Quyết định đã chốt (26/11/2026)

| # | Câu hỏi | Chốt |
|---|---|---|
| 1 | Cách lập | Chọn **khách** → danh sách **phiếu gốc đã duyệt** của khách → chọn phiếu → **tích dòng cần trả**, gõ SL trả. Không có nút "+ Thêm dòng", không gõ mã hàng tay |
| 2 | Khách lẻ | Gõ **số phiếu gốc** vào ô Phiếu gốc để tìm (cùng cửa hàng) |
| 3 | Nguồn phiếu gốc | **Phiếu bán BH10 đã duyệt** và **bill bán ở máy POS**. Bước 1 (phiếu này, PR đầu): phiếu BH10. Bước 2: bill POS — xem §7 "Còn mở" |
| 4 | Kiểm số lượng | SL trả của **từng dòng** ≤ SL dòng gốc − SL đã trả của dòng đó ở các phiếu trả đã duyệt. Kiểm ở màn **và** máy chủ (lúc Ghi và lúc Duyệt) |
| 5 | Giá | Đơn giá, thuế suất của dòng trả **lấy đúng dòng gốc, không sửa được**. Chiết khấu trả = chiết khấu dòng gốc × SL trả ÷ SL gốc (làm tròn đồng; trả hết dòng thì lấy phần còn lại để tổng khớp) |
| 6 | Kho nhận hàng trả | Mặc định **kho đã xuất** ở phiếu gốc, **đổi được** (vd kho hàng lỗi) |
| 7 | Quà kèm | Như hiện nay: dòng quà không trả riêng (không hiện trong danh sách chọn) |

## 3. Các bước thao tác
1. BH11 → **+ Thêm** → chọn cửa hàng, chọn **khách** KH001.
2. Bấm **Chọn phiếu gốc** → hộp liệt kê phiếu bán đã duyệt của KH001 tại cửa hàng (ngày, số, tổng tiền, còn trả) → chọn phiếu.
3. Bảng dòng của phiếu gốc: mã, tên, ĐVT, SL bán, đã trả, **còn trả**, đơn giá → tích dòng, gõ SL trả → **Đưa vào phiếu**.
4. Phiếu trả điền sẵn: Phiếu gốc, khách, kho nhận = kho đã xuất (đổi được), dòng hàng khoá giá.
5. **Ghi** → **Duyệt (ghi sổ)**.
6. Khách lẻ: để trống khách, gõ số phiếu gốc ở ô Phiếu gốc → **Tìm** → như bước 3.

## 4. Số liệu đầu vào

| Phiếu gốc BH2611000001 (cửa hàng 08004, kho 08004-KHH, khách KH001, đã duyệt) | SL | Đơn giá trước thuế | Chiết khấu | Thuế |
|---|---|---|---|---|
| Dòng 1 — mã 1001 | 10 | 100.000 | 50.000 | 8% |
| Dòng 2 — mã 1002 | 4 | 25.000 | 0 | 8% |
| Dòng 3 — mã 1001 (dòng thứ hai cùng mã) | 2 | 90.000 | 0 | 8% |

## 5. Kết quả mong đợi

| Tình huống | Mong đợi |
|---|---|
| Trả lần 1: dòng 1 SL 4 | Dòng trả: 1001, SL 4, đơn giá 100.000, chiết khấu 20.000, tiền trước thuế 380.000, thuế 30.400 |
| Còn trả sau lần 1 (đã duyệt) | Dòng 1 còn 6; dòng 2 còn 4; dòng 3 còn 2 |
| Trả lần 2: dòng 1 SL 6 | Chiết khấu = 50.000 − 20.000 = 30.000 (phần còn lại), tiền trước thuế 570.000 |
| Trả dòng 3 SL 3 | Chặn: "Dòng 3 (1001): trả 3, còn trả được 2" — dù mã 1001 vẫn còn ở dòng 1 |
| Phiếu trả mang `originalDocKey` | `phieu-ban:<id phiếu gốc>` (như NT-BH-015) |

**Bút toán:** như NT-BH-015 phiếu trả (`sale_return`), số tiền theo bảng trên.

**Sai số làm tròn chấp nhận:** 0 đ — tổng chiết khấu các lần trả của một dòng = chiết khấu dòng gốc.

## 6. Trường hợp lệch chuẩn

| # | Làm thế này | Phần mềm phải |
|---|---|---|
| 1 | Gửi phiếu trả không có phiếu gốc (gọi API thẳng) | Chặn: "Phiếu trả phải chọn phiếu bán gốc" |
| 2 | Dòng trả không thuộc phiếu gốc / sai mã so với dòng gốc | Chặn, nêu dòng |
| 3 | Sửa đơn giá / thuế của dòng trả (gọi API thẳng) | Máy chủ lấy lại theo dòng gốc |
| 4 | Phiếu gốc chưa duyệt / đã bỏ duyệt | Không hiện trong danh sách chọn; duyệt phiếu trả bị chặn |
| 5 | Hai phiếu trả nháp cùng trả hết một dòng | Phiếu duyệt sau bị chặn "còn trả được 0" |
| 6 | Phiếu gốc của cửa hàng khác | Không tìm thấy (chỉ tìm trong cửa hàng của phiếu trả) |
| 7 | Phiếu trả cũ (trước phiếu này) không có khoá dòng gốc | Vẫn mở / bỏ duyệt được; khi tính còn trả, số đã trả của phiếu cũ trừ theo mã hàng vào các dòng cùng mã (dòng trước trước) |

## 7. Kết quả chạy
| | |
|---|---|
| Ngày chạy | |
| Bản code (commit) | |
| Test tự động | `apps/api/test/nt-bh-046-*.test.ts`, `modules/phieu-ban/test/doc.test.ts` |
| Tiêu chí lên mức | không đổi mức |

Còn mở (Bước 2 — bill máy POS làm phiếu gốc): cần sửa **cả hai module** để không trả trùng: module `pos` tính "còn trả" của bill phải
trừ cả phiếu trả BH11 đã duyệt nối bill đó, module `phieu-ban` phải trừ cả phiếu trả ở máy POS; lệnh tra bill của máy POS đang đòi quyền
`pos:sell` / `pos:return` (kế toán có thể không có). Làm ở phiếu / PR riêng sau khi chốt cách gác quyền.

## 8. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 9. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 26/11/2026 | Lập phiếu, ghi chốt 7 mục §2 |
