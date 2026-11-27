# NT-BH-057 · Đơn QR chưa nhận tiền: chỉ ghi doanh thu + công nợ, thu tiền ghi khi xác nhận
<!-- [2026-11-28 03:00 PM Võ Hoàng] NGHIEM-THU — tạo phiếu (đóng góp). -->

| | |
|---|---|
| Phân hệ | Bán hàng (máy bán POS, module `pos`) |
| Màn hình | Máy bán POS — thanh toán QR; sổ cái ACC88; ACC51 / ACC54 |
| Bộ phận yêu cầu | Bán hàng |
| Ngày tạo | 28/11/2026 |
| Trạng thái | Đã chốt — Hoàng 28/11: đơn QR chưa nhận tiền chỉ ghi doanh thu + công nợ, thu tiền ghi khi xác nhận |
| Trụ cột / tiêu chí | không đổi mức trụ cột (sửa lỗi ghi sổ) |

## 1. Mục đích quản trị
Đơn máy POS trả bằng QR chuyển khoản: lúc bán ghi nhận doanh thu là đúng, nhưng tiền chưa về. Trước đây phiếu bán mang luôn dòng
thu tiền QR nên sổ cái (ACC88) có bút toán "Thu tiền bán hàng" Nợ TK của hình thức QR / Có 131 ngay khi đơn còn **chờ thanh toán**
(thấy ở đơn HD2611000039: Nợ 11210007 / Có 1311 325.000 khi đơn chưa trả). Kế toán cần: tiền chỉ vào sổ khi ngân hàng báo có hoặc thu
ngân bấm "Xác nhận đã nhận tiền"; đơn huỷ trước khi tiền về không để lại bút toán tiền.

## 2. Khai báo trước
- Hình thức thanh toán QR (DM05) có tài khoản hạch toán (vd 1121x, hoặc 13681 nếu QR vào tài khoản công ty nhận hộ).
- Mặt hàng có giá ở bảng giá, có tồn ở kho bán (như NT-BH-009).

## 3. Các bước thao tác
1. Máy bán: bán đơn, chọn QR (trả hết) hoặc chia tiền TM + QR.
2. Xem sổ cái của đơn (ACC88): chỉ có doanh thu, thuế, công nợ 131 (và phần TM nếu chia tiền).
3. Bấm "Xác nhận đã nhận tiền" (hoặc ngân hàng báo có) → có phiếu thu tiền khách của phần QR; công nợ 131 của đơn về 0.
4. Đơn khác: huỷ khi còn chờ tiền → doanh thu, thuế, công nợ đảo hết; không có phiếu thu.

## 4. Số liệu đầu vào (test `apps/api/test/nt-bh-057-qr-chua-nhan-tien.test.ts`) (đề xuất — tệp test ở nhánh code)

| Đơn | Hàng | Thanh toán |
|---|---|---|
| 1 | 2 × SUA330 330.000 | QR trả hết 660.000 |
| 2 | 2 × SUA330 | TM 330.000 + QR 330.000 |
| 3 | 1 × SUA330 | QR, huỷ trước khi tiền về |

## 5. Kết quả mong đợi

**Trên chứng từ / màn hình:**

| Mục | Mong đợi |
|---|---|
| Đơn 1 lúc bán | `awaiting_payment`; `qr.parts` = [QR 660.000]; phiếu bán không có dòng thu tiền |
| Đơn 1 xác nhận | `completed`; một chứng từ `customer_payment` mã `pos:CN01:qr-receipt:<đơn>:QR`, đối trừ đúng phiếu bán; gọi lại không thêm |
| Đơn 2 lúc bán | chỉ ghi thu TM 330.000; còn nợ 330.000 trên 131 |
| Đơn 3 huỷ | sổ của đơn về 0, không có phiếu thu |

**Bút toán:**

| Nợ | Có | Số tiền | Ghi chú |
|---|---|---|---|
| 131 | 511 / 3331 | 660.000 | lúc bán (đơn 1) |
| TK của hình thức QR | 131 | 660.000 | lúc xác nhận — phiếu thu tiền khách (ngày = ngày tiền về) |
| 111 | 131 | 330.000 | đơn 2 lúc bán (phần TM) |
| TK của hình thức QR | 131 | 330.000 | đơn 2 lúc xác nhận |

## 6. Lệch chuẩn / mặc định đã áp
- M1: phiếu thu tiền QR là chứng từ riêng `customer_payment` (chiều in), số chứng từ = mã giao dịch ngân hàng nếu có, không thì mã đơn;
  ngày chứng từ = ngày tiền về (giờ VN).
- M2: đơn tạo TRƯỚC bản sửa (ảnh chụp đơn không có `qr.parts`) đã ghi thu tiền lúc bán → xác nhận không gửi thêm phiếu thu (tránh ghi
  hai lần). Các đơn cũ còn chờ tiền đang có bút toán thu tiền sai: huỷ đơn thì đảo cả; muốn sửa sổ đơn cũ thì kế toán lập phiếu điều chỉnh tay.
- M3: khách lẻ: công nợ 131 và phiếu thu không gắn đối tượng (như bán khách lẻ trả ngay trước đây).
- M4: gửi phiếu thu TRƯỚC khi chuyển đơn sang hoàn tất (mã chứng từ cố định nên gọi lại an toàn).

## 7. Kết quả chạy
- `apps/api/test/nt-bh-057-qr-chua-nhan-tien.test.ts` 4/4; hồi quy nt-bh-009 / 010 / 027 / 033 đạt (nt-bh-009 sửa khẳng định cũ "phiếu bán mang dòng thu QR"). (đề xuất — tệp test ở nhánh code)
- `modules/pos/test/qr-receipt.test.ts` 3/3, test hàm module pos 164/164; `npx bizcity module check pos` ĐẠT. (đề xuất — tệp test ở nhánh code)

## 8. Biên bản

| Ngày | Người | Nội dung |
|---|---|---|
| 28/11/2026 | Hoàng | Chốt: đơn QR chưa nhận tiền chỉ ghi doanh thu + công nợ, thu tiền ghi khi xác nhận |

## 9. Lịch sử
- 28/11/2026 — tạo phiếu, sửa module pos (`domain/order.ts`, `domain/qr-receipt.ts`, `actions/order-qr-confirm.ts`).
