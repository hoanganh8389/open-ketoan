# Phiếu xuất điều chỉnh (`xuat-dieu-chinh`) — BH06

<!-- [2026-11-26 03:10 PM Võ Hoàng] NGHIEM-THU — NT-BH-044: nghiệp vụ module xuat-dieu-chinh (đóng góp) -->

Phiếu xuất hàng không bán (dùng nội bộ, tặng, dùng thử, huỷ hỏng…) **lập ở kế toán** — một chỗ lập duy nhất (phiếu nghiệm thu
[NT-BH-044](../../docs/nghiem-thu/ban-hang/NT-BH-044-xuat-dieu-chinh-lap-o-ke-toan.md)). Máy bán POS về sau gọi cùng action (PR open-pos riêng).

## Nghiệp vụ

| Bước | Làm gì |
|---|---|
| Lưu nháp | Phiếu chỉ ở bảng module (`mod_xuat_dieu_chinh.phieu`, trạng thái `draft`), chưa vào sổ, chưa trừ kho. Người lập hoặc kế toán sửa / xoá; sửa kèm `version` — người lưu sau với phiên bản cũ nhận `CONFLICT` |
| Lưu (ghi sổ) | Kiểm (kho của chi nhánh, lý do, dòng, quá tồn của kho) rồi nộp `ctx.ledger.submit` trong cùng giao dịch. **0 đ** → `stock_adjustment` `direction: decrease`, `amount: 0`, `purposeCode` theo bảng lý do → mục đích của module. **Có giá** → `sale` `internalOnly: true` (không hoá đơn điện tử), `payments: []` (công nợ người nhận), giá gồm thuế tách thuế theo danh mục. `sourceRef = { type: 'export_adjust' }`, `docKey = xuat-dieu-chinh:<doc_id>`. Module không gửi số tài khoản, không tính giá vốn |
| Huỷ | Lý do bắt buộc → `ctx.ledger.cancel` (bút toán đảo, gỡ thẻ kho). Kỳ khoá → `PERIOD_LOCKED` |
| Chép thành phiếu mới | Màn mở form nháp mới cùng nội dung, lưu kèm `copiedFrom` (liên kết `source` ở sổ chứng từ chung) |

Số phiếu `XDC-<chi nhánh>-<yyMM>-<số>` (bộ đếm `code_counters`), phiếu vào sổ chứng từ chung (`business_documents`, `inventory.issue`) bằng trigger.

Bảng lý do → mục đích (`api/domain/phieu.ts`, `PURPOSE_OF_REASON`) chép từ cầu nối PHP: chỉ mã, không tài khoản. Bỏ khi Core tự suy mục đích từ lý do (đề xuất mức 4 P1).

## Action

| Action | HTTP (`/api/v1/m/xuat-dieu-chinh`) | Quyền |
|---|---|---|
| `xuat-dieu-chinh.phieu.list` | `GET /phieu` | `xuat-dieu-chinh:phieu-xem` |
| `xuat-dieu-chinh.phieu.get` | `GET /phieu/:id` | `xuat-dieu-chinh:phieu-xem` |
| `xuat-dieu-chinh.phieu.save` | `POST /phieu` (mode `draft` / `post`) | `xuat-dieu-chinh:phieu-lap` |
| `xuat-dieu-chinh.phieu.delete` | `DELETE /phieu/:id` | `xuat-dieu-chinh:phieu-lap` |
| `xuat-dieu-chinh.phieu.cancel` | `POST /phieu/:id/cancel` | `xuat-dieu-chinh:phieu-huy` |
| `xuat-dieu-chinh.danh-muc.get` | `GET /danh-muc` | `xuat-dieu-chinh:phieu-xem` |
| `xuat-dieu-chinh.hang.get` | `GET /hang` | `xuat-dieu-chinh:phieu-xem` |

Action theo mã phiếu khai `branchOf` (chi nhánh đọc ở bảng module); lưu khai cả chi nhánh đích. Danh sách lọc theo `ctx.branchScope`.

## Sự kiện

Chưa phát, chưa nghe. Bản sao website nhận phiếu qua bản sao sổ như phiếu bán (§5 mục 8 của phiếu).

## Màn

| Mã | Đường dẫn | Màn |
|---|---|---|
| BH06 | `/app/xuat-dieu-chinh` | Danh sách (phiếu module + phiếu cũ cầu nối), form lập (`PhieuXuatForm`, bản đồ lỗi `PhieuXuatForm.failure-map.json`), in 02-VT |

## Chưa có ở Core (đề xuất mức 4 — phiếu §6)

P1 suy mục đích từ lý do · P3 tồn theo lô cho module · P4 huỷ chứng từ nguồn khác (cầu nối) qua module · P5 cờ ĐVT cho số lẻ · P6 lý do "đủ tài khoản" theo từng lý do · P7 kỳ khoá với phiếu kho không có bút toán.
