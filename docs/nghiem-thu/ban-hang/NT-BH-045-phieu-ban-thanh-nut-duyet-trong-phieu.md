# NT-BH-045 · BH10 / BH11 — thanh nút như màn Kho, Duyệt trong phiếu như phiếu mua, ô Khách hàng chỉ hiện khách
<!-- [2026-11-26 07:30 PM Võ Hoàng] NGHIEM-THU — lập phiếu NT-BH-045, ghi chốt của bộ phận Bán hàng 26/11 (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng — màn dùng chung `apps/web/src/components/phieu-hang/` (chỉ BH10, BH11 dùng), dữ liệu module `modules/phieu-ban` |
| Màn hình | BH10 Phiếu bán hàng (`/ban-hang/phieu-ban`), BH11 Hàng bán trả lại (`/ban-hang/tra-lai`) |
| Bộ phận yêu cầu | Bán hàng (kế toán bán hàng) |
| Ngày tạo | 26/11/2026 |
| Trạng thái | **Đã chốt** (bộ phận Bán hàng chốt 26/11/2026 — §2) |
| Trụ cột / tiêu chí | không |

## 1. Mục đích quản trị
Người lập phiếu bán / trả thao tác giống các màn chứng từ khác (Kho KHO01, phiếu mua MH): nút ở danh sách ẩn theo quyền, việc
duyệt (ghi sổ) làm ngay trong phiếu đang mở — xem đủ dòng hàng rồi mới duyệt — thay vì duyệt "mù" từ danh sách. Ô Khách hàng
chỉ cho chọn khách, tránh lập nhầm phiếu bán cho nhà cung cấp.

## 2. Quyết định đã chốt (26/11/2026)

| # | Câu hỏi | Chốt |
|---|---|---|
| 1 | Thanh nút danh sách | Như màn Kho (KHO01 Phiếu chuyển kho): **+ Thêm · Sửa / Xem · In · Nạp · Xuất Excel**, nút ẩn theo quyền của màn (`ban-hang.phieu-ban` / `ban-hang.tra-lai` ở HT12). Chứng từ **không xoá** (§7 HUONG-DAN-LAM-VIEC): không có nút Xoá |
| 2 | Duyệt ở đâu | **Trong phiếu**, chân phiếu như phiếu mua: **Ghi · Sửa · Duyệt (ghi sổ) · Bỏ duyệt · In · Thoát**. Bỏ nút Duyệt / Bỏ duyệt ở danh sách. Phiếu chưa lưu / đang sửa mà bấm Duyệt → tự **Ghi rồi Duyệt** |
| 3 | Luồng trạng thái | Giữ 2 trạng thái **Nháp → Đã duyệt** (không thêm Chờ duyệt). Bỏ duyệt = huỷ chứng từ trong sổ (bút toán đảo), phiếu về Nháp |
| 4 | Quyền Duyệt | Nút Duyệt / Bỏ duyệt hiện theo quyền thao tác **Duyệt / bỏ duyệt** của màn (`ban-hang:hoa-don-duyet`, `ban-hang:tra-hang-duyet`) |
| 5 | Ô Khách hàng | Chỉ hiện đối tượng là **khách hàng** (kể cả đối tượng vừa là NCC vừa là khách — `also_kinds`); thêm nhanh (F9) tạo khách hàng |

## 3. Các bước thao tác
1. Vào BH10 → chọn một phiếu nháp → **Sửa** (hoặc bấm đúp) → phiếu mở.
2. Kiểm dòng hàng → bấm **Duyệt (ghi sổ)** ở chân phiếu → phiếu chuyển Đã duyệt, chứng từ vào sổ, phiếu ở lại màn ở chế độ xem.
3. Phiếu đã duyệt → **Bỏ duyệt** ở chân phiếu (hỏi xác nhận) → phiếu về Nháp, sổ có bút toán đảo.
4. Lập phiếu mới, gõ ở ô Khách hàng tên một nhà cung cấp → không thấy trong danh sách.

## 4. Số liệu đầu vào

| Mục | Giá trị |
|---|---|
| Phiếu bán nháp | Cửa hàng 08004, kho 08004-KHH, khách KH001, 1 dòng mã 1001 SL 2 × 100.000 (thuế 8%) |
| Đối tượng | KH001 (khách), NCC001 (nhà cung cấp), DT001 (vừa NCC vừa khách) |

## 5. Kết quả mong đợi

| Mục | Mong đợi |
|---|---|
| Thanh nút danh sách | Không còn nút Duyệt / Bỏ duyệt. Người không có quyền Thêm / Sửa / Xuất Excel không thấy nút tương ứng |
| Chân phiếu nháp | Có **Duyệt (ghi sổ)**; người không có quyền Duyệt không thấy nút |
| Duyệt khi đang sửa chưa ghi | Phiếu được ghi (bản mới nhất) rồi duyệt — chứng từ trong sổ đúng số đang thấy trên màn |
| Duyệt có cảnh báo kiểm chuẩn ngày phiếu | Hỏi xác nhận như danh sách cũ (một dòng bằng chứng) |
| Chân phiếu đã duyệt | Có **Bỏ duyệt**; bấm → hỏi xác nhận → phiếu về Nháp, chứng từ trong sổ huỷ (đảo) |
| Ô Khách hàng | Thấy KH001, DT001; **không** thấy NCC001 |

**Bút toán:** không đổi so với NT-BH-015 (duyệt ở trong phiếu gọi đúng lệnh duyệt cũ).

**Sai số làm tròn chấp nhận:** 0 đ.

## 6. Trường hợp lệch chuẩn

| # | Làm thế này | Phần mềm phải |
|---|---|---|
| 1 | Duyệt phiếu đang có lỗi (thiếu chi nhánh, dòng thiếu SL…) | Nút Duyệt khoá, rê chuột thấy lý do; không gửi lệnh |
| 2 | Duyệt bị máy chủ từ chối (bán quá tồn khi bật chặn, voucher đã dùng…) | Báo lỗi ở chân phiếu, phiếu vẫn mở, giữ Nháp |
| 3 | Bỏ duyệt phiếu bán đã có phiếu trả đã duyệt | Báo "bỏ duyệt phiếu trả trước", phiếu giữ Đã duyệt |
| 4 | Người chỉ có quyền Xem | Không thấy Thêm / Sửa / Duyệt; mở phiếu chỉ xem |

## 7. Kết quả chạy
| | |
|---|---|
| Ngày chạy | |
| Bản code (commit) | |
| Test tự động | `apps/api/test/nt-bh-045-*.test.ts` |
| Tiêu chí lên mức | không đổi mức |

Còn mở (ngoài phạm vi phiếu này): máy chủ gác lệnh duyệt / bỏ duyệt của module `phieu-ban` theo quyền thao tác Duyệt của màn
(hiện lệnh đòi `phieu-ban:write`) — tệp đăng ký màn `apps/api/src/phan-he/ban-hang/man-hinh-ban-hang.ts` thuộc dòng giữ chỗ NT-HT-003
(GĐ4 móc quyền màn vào lệnh module), làm sau khi dòng đó xong.

## 8. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 9. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 26/11/2026 | Lập phiếu, ghi chốt 5 mục §2 |
