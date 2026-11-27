# NT-BH-052 · Tiền của chứng từ bán / trả hàng hiện ở ACC51 (tiền mặt) và ACC54 (tiền gửi)
<!-- [2026-11-28 Võ Hoàng] NGHIEM-THU — tạo phiếu, Đã chốt (Hoàng giao 28/11) (đóng góp) -->

| | |
|---|---|
| Phân hệ | Quỹ / bán hàng |
| Màn hình | ACC51 Thu, chi tiền (`/quy/thu-chi`, `/nghiep-vu/phieu-thu`…), ACC54 Thu, chi tiền gửi (`/quy/thu-chi-tien-gui`…) |
| Bộ phận yêu cầu | Bán hàng (Hoàng) |
| Ngày tạo | 28/11/2026 |
| Trạng thái | Đã chốt — "chứng từ tiền của bán / trả phải lên ACC51 / ACC54" (Hoàng giao 28/11) |
| Trụ cột / tiêu chí | không đổi mức trụ cột (sửa chỗ thiếu hiển thị) |

## 1. Mục đích quản trị
Kế toán quỹ / ngân hàng xem ở ACC51 / ACC54 thấy **đủ** tiền vào / ra trong kỳ, gồm cả tiền thu khi bán (máy POS, phiếu bán BH10)
và tiền hoàn khi khách trả hàng — trước đây hai màn chỉ liệt kê phiếu thu / chi / báo có / báo nợ nên số tiền bán hàng không hiện.

## 2. Khai báo trước
Hình thức thanh toán (DM05) đã gắn tài khoản tiền: tiền mặt → 111x, chuyển khoản / QR → 112x. Không đổi quy tắc hạch toán.

## 3. Các bước thao tác
1. Bán một đơn tiền mặt và một đơn chuyển khoản (máy POS hoặc BH10, duyệt ghi sổ); trả một phần đơn tiền mặt (hoàn tiền mặt).
2. Mở ACC51 Thu, chi tiền: dưới danh sách phiếu thu chi có khung **"Tiền mặt từ chứng từ khác — bán hàng, trả hàng, thu tiền khách…"**.
3. Mở ACC54 Thu, chi tiền gửi: khung **"Tiền gửi từ chứng từ khác…"**. Bấm đúp một dòng mở chứng từ gốc.

## 4. Số liệu đầu vào

| Chứng từ | Hình thức | Số tiền |
|---|---|---|
| Đơn bán HD0001 | TM | 200.000 |
| Đơn bán HD0002 | CK | 200.000 |
| Phiếu trả TH0001 | hoàn TM | 50.000 |

## 5. Kết quả mong đợi

**Trên màn hình:**

| Màn | Dòng | Thu | Chi |
|---|---|---|---|
| ACC51 | HD0001 · Bán hàng · TK 1111 | 200.000 | |
| ACC51 | TH0001 · Hàng bán trả lại · TK 1111 | | 50.000 |
| ACC54 | HD0002 · Bán hàng · TK 112x | 200.000 | |

- Chỉ xem: không sửa / xoá; số đọc từ **sổ cái** (bút toán của chính chứng từ), số **ròng** theo chứng từ — chứng từ đã huỷ (bút toán đảo) ra 0 và không hiện; sửa phiếu chỉ còn số của bản đang trong sổ.
- Bốn loại phiếu tiền (phiếu thu / chi / báo có / báo nợ) vẫn ở danh sách chính, **không lặp lại** ở khung này (không đếm trùng).

**Bút toán:** không đổi (tiền đã ghi trong bút toán của đơn bán / phiếu trả: Nợ 111x / 112x — Có 131x, và ngược lại khi hoàn tiền).

## 6. Lệch chuẩn / mặc định đã áp
- M1: hiện thành **khung riêng dưới danh sách**, không trộn vào lưới phiếu thu chi (lưới đó có Sửa / Copy / Ký / Ghi sổ cho phiếu tiền; dòng bán hàng không áp được các nút này).
- M2: tài khoản tiền theo đầu số: 111% = tiền mặt, 112% = tiền gửi. Tiền đang chuyển (113) chưa hiện.
- M3: KPI đầu màn (tổng thu / chi) vẫn chỉ tính phiếu tiền; tổng của khung riêng ghi ở dòng tiêu đề khung.
- M4: API đọc `GET /api/v1/cash-movements?kind=cash|bank&from&to&branchCodes&search` (quyền `documents:read`), đọc khung nhìn `bizcity_read.ledger_*`.

## 7. Kết quả chạy
- `apps/api/test/nt-bh-052-tien-tu-chung-tu.test.ts`: 4/4 đạt (thử trên máy local).
- Màn thật: xem báo cáo của nhánh.

## 8. Biên bản
(chờ nghiệm thu)

## 9. Lịch sử
- 28/11/2026 — tạo, Đã chốt theo giao việc.
