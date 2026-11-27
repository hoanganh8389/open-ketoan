# NT-BH-060 · Voucher đổi điểm ghi chiết khấu thương mại 5211, doanh thu ghi đủ giá
<!-- [2026-11-28 05:30 PM Võ Hoàng] NGHIEM-THU — tạo phiếu (đóng góp). -->

| | |
|---|---|
| Phân hệ | Bán hàng (máy bán POS, module `pos`) |
| Màn hình | Máy bán POS — dùng voucher đổi điểm; Quy tắc hạch toán ACC41 (lý do); sổ cái ACC88 |
| Bộ phận yêu cầu | Bán hàng / Kế toán |
| Ngày tạo | 28/11/2026 |
| Trạng thái | Đã chốt tạm — Hoàng 28/11: voucher đổi điểm ghi chiết khấu thương mại 5211, doanh thu ghi đủ; kế toán xác nhận sau |
| Trụ cột / tiêu chí | không đổi mức trụ cột (sửa cách ghi sổ) |

## 1. Mục đích quản trị
Khách dùng voucher đổi điểm (đổi điểm tích lũy lấy voucher tiền) ở đơn máy POS. Trước đây phiếu bán chia tiền voucher vào dòng hàng
nên doanh thu 511 ghi theo giá SAU voucher (kiểm thật trên đơn CN02BT10079) — báo cáo doanh thu thấp hơn giá bán, không thấy được
chi phí chương trình điểm. Chốt: doanh thu 511 ghi đủ giá bán, phần voucher (chưa thuế) ghi Nợ chiết khấu thương mại 5211.
Kế toán đọc 5211 để biết tiền chương trình điểm đã trả cho khách theo kỳ / chi nhánh.

Chỉ đơn máy POS bị ảnh hưởng (BH10 không có voucher đổi điểm). Voucher loại khác (BH21, mã khuyến mại) giữ như cũ.

## 2. Khai báo trước
Ở **Quy tắc hạch toán (ACC41)**, thêm 2 lý do loại *Bút toán (journal)* — cặp tài khoản do kế toán chọn, phần mềm không ghi cứng:

| Mã lý do | Tên | Nợ | Có | Dùng khi |
|---|---|---|---|---|
| `POS-VOUCHER-DIEM` | Voucher đổi điểm — chiết khấu thương mại | 52111 | 51111 | đơn có voucher đổi điểm |
| `POS-VOUCHER-DIEM-TRA` | Trả hàng có voucher đổi điểm — giảm chiết khấu | 52131 (đề xuất) | 52111 | trả hàng của đơn đó |

Phiếu trả hàng máy POS ghi Nợ 5213 theo giá sau voucher; lý do trả đề xuất Nợ 5213 / Có 5211 để hàng trả ghi đủ giá và 5211 về 0.
Kế toán muốn đảo thẳng doanh thu thì khai Nợ 51111 / Có 52111 — tổng lãi lỗ như nhau.

Chưa khai lý do → đơn vẫn bán bình thường, sổ như cũ (511 ghi giá sau voucher), ảnh chụp đơn ghi `pointVoucherJournal.status = not_created`.
Khai lý do xong chỉ áp cho đơn bán sau đó (không ghi lại đơn cũ).

Khai thêm như NT-BH-020: chương trình điểm có quà đổi voucher (VC50K — 100 điểm lấy voucher 50.000đ), mặt hàng 100021001 thuế R08 giá 325.000.

## 3. Các bước thao tác
1. Khách có đủ điểm đổi VC50K ở một đơn → nhận mã TGS50-….
2. Đơn sau, thu ngân nhập mã voucher, bán 1 lon 325.000 → khách trả 275.000 tiền mặt.
3. Xem sổ cái ACC88 theo chứng từ của đơn: phiếu bán + phiếu kế toán số `<mã đơn>-VD`.
4. Khách trả lại lon đó → phiếu trả + phiếu kế toán `<mã phiếu trả>-VD`.
5. Đơn QR chưa nhận tiền dùng voucher rồi hủy → phiếu kế toán `-VD` hủy theo.

## 4. Số liệu đầu vào

| Mục | Số |
|---|---|
| Giá bán (đã thuế 8%) | 325.000 |
| Voucher đổi điểm | 50.000 (đã thuế) → 46.296 chưa thuế |
| Khách trả | 275.000 |
| Thành tiền chưa thuế sau voucher / thuế | 254.630 / 20.370 |

## 5. Kết quả mong đợi

**Trên chứng từ / màn hình:** đơn vẫn tổng 275.000, bill không đổi; ảnh chụp đơn có `pointVoucherJournal` (số `-VD`, 46.296, `posted`).

**Bút toán (đơn):**

| Nợ | Có | Số tiền | Ghi chú |
|---|---|---|---|
| 1111 | 51111 | 254.630 | phiếu bán (như cũ) |
| 1111 | 33311 | 20.370 | thuế (như cũ) |
| 52111 | 51111 | 46.296 | phiếu kế toán `-VD` — lý do POS-VOUCHER-DIEM |

→ 51111 Có 300.926 (đủ giá chưa thuế), 52111 Nợ 46.296, tiền 275.000, thuế 20.370 không đổi.

**Bút toán (trả cả lon):**

| Nợ | Có | Số tiền | Ghi chú |
|---|---|---|---|
| 52131 | 1111 | 254.630 | phiếu trả (như cũ) |
| 33311 | 1111 | 20.370 | thuế (như cũ) |
| 52131 | 52111 | 46.296 | phiếu kế toán `-VD` — lý do POS-VOUCHER-DIEM-TRA, theo tỉ lệ SL trả / SL bán |

→ 52111 về 0, 52131 Nợ 300.926 (đủ giá).

**Báo cáo phải thấy:** sổ cái 511 theo giá bán đủ; 5211 = tiền voucher đổi điểm chưa thuế của kỳ.

**Sai số làm tròn chấp nhận:** ≤ 1đ mỗi phiếu trả một phần (chia theo tỉ lệ số lượng).

## 6. Trường hợp lệch chuẩn

| # | Làm thế này | Phần mềm phải |
|---|---|---|
| 1 | Chưa khai lý do POS-VOUCHER-DIEM | bán bình thường, không lập phiếu `-VD`, ghi `not_created` trên ảnh chụp đơn |
| 2 | Đơn không dùng voucher đổi điểm (hoặc dùng voucher loại khác) | không lập phiếu `-VD` |
| 3 | Hủy đơn (QR chưa nhận tiền) có phiếu `-VD` | hủy phiếu `-VD` cùng phiếu bán |
| 4 | Trả hàng đơn bán trước khi có NT-BH-060 | không lập phiếu đảo (đơn cũ không có phần voucher trên dòng) |
| 5 | Trả nhiều lần một phần | mỗi lần đảo theo tỉ lệ SL trả; có thể lệch ≤ 1đ tổng các lần |

## 7. Kết quả chạy
| | |
|---|---|
| Ngày chạy | 28/11/2026 — thử trên máy local |
| Bản code (commit) | nhánh `feat/nt-bh-060-voucher-diem-5211` |
| Test tự động | `apps/api/test/nt-bh-060-voucher-diem-5211.test.ts`; `modules/pos/test/voucher-diem.test.ts` |
| Tiêu chí lên mức | không đổi mức |

| Mục | Mong đợi | Phần mềm | Chênh | Giải thích |
|---|---|---|---|---|
| Chưa khai lý do | bán được, `not_created` | đúng | 0 | |
| 51111 của đơn | Có 300.926 | Có 300.926 | 0 | |
| 52111 của đơn | Nợ 46.296 | Nợ 46.296 | 0 | |
| Tiền mặt / thuế | 275.000 / 20.370 | 275.000 / 20.370 | 0 | |
| Trả hàng | 52131 Nợ 300.926, 52111 về 0 | đúng | 0 | |
| Hủy đơn QR | phiếu `-VD` hủy, số ròng 0 | đúng | 0 | |

## 8. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|
| 28/11/2026 | Hoàng | Chốt tạm | kế toán xác nhận cặp tài khoản sau; sai thì đổi ở ACC41, không sửa code |

## 9. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 28/11/2026 | Tạo phiếu, chốt tạm |
