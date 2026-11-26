# Phiếu bán hàng, trả lại, chuyển kho

> Mua hàng, trả hàng nhà cung cấp làm ở **Mua hàng → Tổng hợp mua hàng (MH11)**.

Các màn dùng chung một cách làm:

| Màn | Mã | Phân hệ |
|---|---|---|
| Phiếu bán hàng | BH10 | Bán hàng |
| Hàng bán trả lại | BH11 | Bán hàng |
| Phiếu chuyển kho | KHO01 | Kho |

> **Đang chạy DỮ LIỆU GIẢ** (dải xanh trên đầu màn): phiếu lưu ở trình duyệt máy này, **chưa vào sổ kế toán**, người khác không thấy. Dùng để xem trước cách nhập trong lúc chờ API thật. Khi có API: **API → Nguồn dữ liệu màn hình** bật "API thật".

## Danh sách

- Lọc: khoảng ngày (mặc định từ đầu tháng), chi nhánh, trạng thái (Nháp / Đã duyệt), ô tìm (số phiếu, đối tượng, số hoá đơn, ghi chú).
- Nút (BH10, BH11 — như màn Kho): **+ Thêm** · **Sửa** (hoặc bấm đúp dòng; phiếu đã duyệt chỉ **Xem**) · **In** · **Nạp** · **Xuất Excel**. Nút chỉ hiện khi tài khoản có quyền thao tác đó của màn (Hệ thống → Phân quyền, HT12). Chứng từ không xoá — phiếu đã duyệt thì **Bỏ duyệt** trong phiếu.
- Cột: ngày, số phiếu, chi nhánh, kho, khách, hoá đơn, số dòng, tiền hàng, thuế, tổng, trạng thái, **phiếu gốc** (BH11), **đã thu / còn nợ** (BH11: đã trả / trừ công nợ), **người lập, người duyệt, ngày duyệt**, ghi chú.
- Phiếu nháp hiện chữ mờ; dòng cuối cộng tiền hàng, thuế, tổng.

## Nhập phiếu

| Phần | Cách nhập |
|---|---|
| Số phiếu | Để trống: tự cấp khi ghi (BH / TL / MH / TN / CK + năm + số thứ tự) |
| Ngày, Chi nhánh | Bắt buộc. Chuyển kho: chi nhánh **xuất** và chi nhánh **nhận** |
| Kho | Chọn ở đầu phiếu, **mọi dòng đi theo** (cột Kho trên bảng hàng chỉ để xem): phiếu bán = kho xuất hàng, hàng trả lại = kho nhận hàng trả, chuyển kho = **kho xuất** và **kho nhận**. Tự chọn kho mặc định của chi nhánh; chi nhánh chưa khai kho (DM12) thì ghi vào kho mặc định. Chuyển giữa hai kho trong **cùng chi nhánh**: chọn chi nhánh nhận trùng chi nhánh xuất, kho nhận phải khác kho xuất |
| Đối tượng | Bán / trả lại: khách hàng (trống = khách lẻ). Mua / trả NCC: nhà cung cấp (bắt buộc) |
| Phiếu gốc | **Hàng bán trả lại (BH11): bắt buộc**, xem mục "Trả hàng theo phiếu gốc" dưới. Trả NCC: số phiếu mua gốc (tham khảo) |
| Hạn thanh toán | Mua / trả NCC |
| Hoá đơn | Số hoá đơn, ký hiệu, ngày (nếu có) |
| Dòng hàng | **+ Thêm dòng** → chọn mã hàng: tự điền tên, ĐVT bán chính, loại thuế; bán hàng điền sẵn **đơn giá trước thuế** (giá bảng giá công ty đã gồm thuế, quy về trước thuế). Mua hàng: gõ đơn giá theo hoá đơn. Sửa SL, đơn giá, chiết khấu → tiền hàng, tiền thuế tự tính (làm tròn đồng). Chuyển kho: chỉ mã hàng + số lượng |
| Thu tiền / trả tiền khách | Bán / trả lại: thêm các khoản theo hình thức thanh toán (TM, CK, QR…). Để trống = ghi công nợ |

Nút **Ghi** sáng khi đủ thông tin; rê chuột vào nút (hoặc xem dòng chữ cuối form) để biết còn thiếu gì.

### Bảng dòng hàng (BH10, BH11)

| Cột | Ý nghĩa |
|---|---|
| ĐVT | Xổ đủ đơn vị tính của mã (danh mục mặt hàng); dưới ô là quy cách, vd "1 Thùng = 12 Hộp". Đổi ĐVT thì đơn giá quy theo tỉ lệ (sửa tay nếu bảng giá khác) |
| CK % / Chiết khấu | Gõ CK % thì tiền chiết khấu tự tính trên SL × đơn giá; gõ tiền chiết khấu thì CK % tính lại |
| Thành tiền gồm thuế | Tiền hàng + tiền thuế của dòng |
| Phân kho, Số lô, Hạn dùng | **Chỉ xem.** Lô do phần mềm cấp lúc duyệt (lô hạn gần trước); phiếu nháp để trống. Dòng nhiều lô ghi "L05 (20), L06 (10)", hạn dùng là hạn sớm nhất |
| Ghi chú | Ghi chú của từng dòng |

Nút **Chọn cột ▾** (góc phải trên bảng) ẩn / hiện các cột tuỳ chọn — máy nhớ lựa chọn.

### Trả hàng theo phiếu gốc (BH11)

1. Chọn cửa hàng, chọn **khách** (khách lẻ: để trống, gõ số phiếu bán gốc vào ô **Phiếu gốc**).
2. Bấm **Chọn phiếu gốc** → danh sách phiếu bán **đã duyệt** của khách tại cửa hàng (còn dòng trả được) → chọn phiếu.
3. Bảng dòng của phiếu gốc: SL bán, đã trả, **còn trả** → tích dòng khách trả, gõ SL trả → **Đưa vào phiếu**.
4. Phiếu trả điền sẵn khách, kho nhận = kho đã xuất của phiếu gốc (**đổi được**, vd kho hàng lỗi). Dòng trả chỉ sửa **số lượng**; đơn giá, thuế theo dòng gốc, chiết khấu theo tỉ lệ dòng gốc (trả nốt dòng thì lấy đúng phần chiết khấu còn lại).
5. Không thêm dòng tay được. Trả quá **còn trả** của dòng bị chặn ngay khi Ghi và kiểm lại khi Duyệt (hai phiếu trả nháp cùng trả hết một dòng thì phiếu duyệt sau bị chặn).

Dòng quà của phiếu gốc chọn trả được như dòng thường (0 đ), về kho quà của cửa hàng. Bill bán ở máy POS trả ở máy POS (BH11 chưa nhận bill POS làm phiếu gốc).

## Duyệt (trong phiếu)

- **Duyệt (ghi sổ)** ở chân phiếu (như phiếu mua): phiếu chốt lại, vào kế toán (định khoản, công nợ, kho). Phiếu mới / đang sửa chưa ghi thì phần mềm **Ghi trước rồi Duyệt** — sổ nhận đúng nội dung đang thấy. Còn lỗi thì nút khoá, rê chuột để xem lý do.
- **Bỏ duyệt** ở chân phiếu đã duyệt (hỏi xác nhận): huỷ chứng từ trong sổ bằng bút toán đảo, phiếu về Nháp để sửa. Phiếu bán đã có phiếu trả đã duyệt thì phải bỏ duyệt phiếu trả trước.
- Nút Duyệt / Bỏ duyệt chỉ hiện với tài khoản có quyền **Duyệt / bỏ duyệt** của màn.
