# NT-BH-061 · Chiết khấu thương mại ghi ở quy tắc Bán hàng (voucher đổi điểm → 5211 qua lớp kế toán)
<!-- [2026-11-28 08:30 PM Võ Hoàng] NGHIEM-THU — tạo phiếu, thay NT-BH-060 (đóng góp). -->

| | |
|---|---|
| Phân hệ | Bán hàng (máy bán POS, module `pos`) · Kế toán (Quy tắc hạch toán) |
| Màn hình | Quy tắc hạch toán ACC41 (Bán hàng, Hàng bán trả lại); máy bán POS — dùng voucher đổi điểm; sổ cái ACC88 |
| Bộ phận yêu cầu | Bán hàng / Kế toán |
| Ngày tạo | 28/11/2026 |
| Trạng thái | Đã chốt — Hoàng 28/11 |
| Trụ cột / tiêu chí | không đổi mức trụ cột (sửa cách ghi sổ) |
| Thay cho | NT-BH-060 (bỏ phiếu kế toán `-VD` do module tự lập) |

## 1. Mục đích quản trị
Giữ đúng nguyên tắc Hoàng chốt 28/11: **máy bán / module không tự ghi bút toán; chứng từ vào kế toán rồi lớp hạch toán ghi theo
Quy tắc hạch toán.** NT-BH-060 làm sai nguyên tắc này: module `pos` tự lập thêm phiếu kế toán `<mã đơn>-VD` (lý do POS-VOUCHER-DIEM),
lý do đó không khai được trên giao diện nên phiếu kẹt ở ACC14 "Không định khoản được" (thử giao diện 28/11, báo cáo 95).

Làm lại: phiếu bán mang **số tiền chiết khấu thương mại** trên dòng (phần chưa thuế của voucher đổi điểm). Quy tắc **Bán hàng** có thêm
dòng "Chiết khấu thương mại": Nợ TK chiết khấu (kế toán chọn ở ACC41, gợi ý 52111) / Có Doanh thu — doanh thu ghi đủ giá bán.
Quy tắc **Hàng bán trả lại** đảo phần chiết khấu của dòng trả. Hủy chứng từ đảo cả phiếu như mọi chứng từ. Không còn lý do / phiếu riêng.

Voucher loại khác (BH21, mã khuyến mại) giữ như cũ: giảm trên dòng, không ghi chiết khấu riêng.

## 2. Khai báo trước
**Quy tắc hạch toán (ACC41)** → tài khoản của quy tắc **"Chiết khấu thương mại"** (khoá `sale_discount`, đầu số 521) = **52111**.

Chưa đặt: phiếu bán vẫn ghi bình thường, không có dòng chiết khấu (doanh thu ghi theo giá sau giảm như trước) — **không kẹt chứng từ**;
ACC41 hiện "Chưa đặt" để kế toán biết. Đặt là tài khoản tổng hợp (521) → báo lỗi định khoản như mọi khoá khác (chọn TK chi tiết).

Dữ liệu như NT-BH-020: chương trình điểm có quà đổi voucher VC50K (100 điểm lấy voucher 50.000đ), mặt hàng 100021001 thuế R08 giá 325.000.

## 3. Các bước thao tác
1. ACC41 → Bán hàng → đặt "Chiết khấu thương mại" = 52111.
2. Khách có đủ điểm đổi VC50K ở một đơn → nhận mã TGS50-….
3. Đơn sau, thu ngân nhập mã voucher, bán 1 lon 325.000 → khách trả 275.000 tiền mặt.
4. Xem sổ cái ACC88 theo chứng từ của đơn (chỉ phiếu bán + phiếu thu, không có phiếu `-VD`).
5. Khách trả lại lon đó → xem sổ của phiếu trả.
6. Đơn QR chưa nhận tiền dùng voucher rồi hủy → xem sổ của đơn.

## 4. Số liệu đầu vào

| Mục | Số |
|---|---|
| Giá bán (đã thuế 8%) | 325.000 |
| Voucher đổi điểm | 50.000 (đã thuế) → 46.296 chưa thuế |
| Khách trả | 275.000 |
| Thành tiền chưa thuế sau voucher / thuế | 254.630 / 20.370 |

## 5. Kết quả mong đợi

**Trên chứng từ:** dòng phiếu bán `amountBeforeTax` 254.630, `discount` (gồm cả voucher), `tradeDiscount` 46.296; tổng 275.000, bill / hoá đơn
điện tử không đổi. Không có phiếu kế toán `-VD`.

**Bút toán (đơn):**

| Nợ | Có | Số tiền | Ghi chú |
|---|---|---|---|
| 1311 | 51111 | 254.630 | doanh thu (như cũ) |
| 1311 | 33311 | 20.370 | thuế (như cũ) |
| 52111 | 51111 | 46.296 | **chiết khấu thương mại** — cùng bút toán của phiếu bán |
| 1111 | 1311 | 275.000 | thu tiền (như cũ) |

→ 51111 Có 300.926 (đủ giá chưa thuế), 52111 Nợ 46.296, tiền 275.000, thuế 20.370 không đổi.

**Bút toán (trả cả lon):**

| Nợ | Có | Số tiền | Ghi chú |
|---|---|---|---|
| 52131 | 1311 | 254.630 | hàng bán bị trả lại (như cũ) |
| 33311 | 1311 | 20.370 | thuế (như cũ) |
| 52131 | 52111 | 46.296 | **giảm chiết khấu thương mại** theo tỉ lệ SL trả / SL bán |
| 1311 | 1111 | 275.000 | trả tiền (như cũ) |

→ 52111 về 0, 52131 Nợ 300.926 (đủ giá).

**Hủy đơn:** cả bút toán phiếu bán đảo (kể cả dòng chiết khấu) — số ròng 0.

**Báo cáo phải thấy:** sổ cái 511 theo giá bán đủ; 5211 = tiền voucher đổi điểm chưa thuế của kỳ; dòng chiết khấu không mang mã thuế
(không làm thay đổi doanh thu tính thuế — thuế tính trên giá sau chiết khấu như hoá đơn).

**Sai số làm tròn chấp nhận:** ≤ 1đ mỗi phiếu trả một phần (chia theo tỉ lệ số lượng).

## 6. Trường hợp lệch chuẩn

| # | Làm thế này | Phần mềm phải |
|---|---|---|
| 1 | Chưa đặt "Chiết khấu thương mại" ở ACC41 | bán bình thường, không có dòng 5211, doanh thu theo giá sau giảm; không kẹt |
| 2 | Đặt "Chiết khấu thương mại" là TK tổng hợp 521 | báo lỗi định khoản nói rõ khoá `sale_discount`, gợi ý TK chi tiết |
| 3 | Đơn không dùng voucher đổi điểm (hoặc voucher loại khác) | không có dòng chiết khấu |
| 4 | Dòng quà / bill Z | không mang chiết khấu thương mại |
| 5 | Trả hàng đơn bán theo NT-BH-060 (đã có phiếu `-VD`) | phiếu trả đảo 5211 theo quy tắc mới; hủy đơn đó vẫn hủy phiếu `-VD` cũ |
| 6 | Trả nhiều lần một phần | mỗi lần đảo theo tỉ lệ SL trả; có thể lệch ≤ 1đ tổng các lần |

## 7. Kết quả chạy
| | |
|---|---|
| Ngày chạy | 28/11/2026 — thử trên máy local |
| Bản code (commit) | nhánh `feat/nt-bh-061-chiet-khau-thuong-mai` |
| Test tự động | `apps/api/test/nt-bh-061-chiet-khau-thuong-mai.test.ts`; `modules/pos/test/chiet-khau-thuong-mai.test.ts` | (đề xuất — tệp test ở nhánh code)
| Tiêu chí lên mức | không đổi mức |

| Mục | Mong đợi | Phần mềm | Chênh | Giải thích |
|---|---|---|---|---|
| Chưa đặt TK chiết khấu | bán được, 511 Có 254.630, không 5211 | | | |
| 51111 của đơn | Có 300.926 | | | |
| 52111 của đơn | Nợ 46.296 | | | |
| Tiền mặt / thuế | 275.000 / 20.370 | | | |
| Trả hàng | 52131 Nợ 300.926, 52111 về 0 | | | |
| Hủy đơn QR | số ròng 0 | | | |

## 8. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|
| 28/11/2026 | Hoàng | Chốt | Nguyên tắc: POS không ghi sổ, bút toán qua lớp kế toán; kế toán chọn TK chiết khấu ở ACC41 |

## 9. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 28/11/2026 | Tạo phiếu, thay NT-BH-060 |
