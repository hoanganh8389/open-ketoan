# NT-MH-011 · Bản đồ lỗi của phiếu mua hàng — chỉ đúng chỗ khi không lưu / không ghi sổ được
<!-- [2026-11-25 05:27 PM Johnny Chu - Chu Hoàng Anh] NGHIEM-THU — tạo phiếu; màn thử chuẩn bizcity_failure_map@1 (bizcity-platform STD-10, #23). Chủ chọn 2026-11-25: giữ phiếu mua, tách hai giai đoạn — GĐ1 không sửa PhieuMuaForm.tsx (đang thuộc dòng PHASE-026). -->

| | |
|---|---|
| Phân hệ | mua hàng |
| Màn hình | MH05 — phiếu mua hàng (`apps/web/src/phan-he/mua-hang/chung-tu/PhieuMuaForm.tsx`) |
| Bộ phận yêu cầu | Phòng kế toán (kế toán trưởng) · Mua hàng · Kho |
| Ngày tạo | 25/11/2026 |
| Trạng thái | Nháp |
| Trụ cột / tiêu chí | IV (một cửa nạp, các cổng kiểm, một ngôn ngữ mã) — GĐ1 không đổi mức; lý do: mới có bản đồ + test, màn chưa nối |

## 1. Mục đích quản trị

Khi phiếu mua **không lưu, không ghi sổ, không duyệt được**, người lập biết ngay **ô nào, danh sách chọn nào, nguồn gốc số nào (hợp đồng mua, phân tích mua, tồn tối đa), bước nào của luồng kho** sai, và sửa tại chỗ. Không phải gọi dev. Kế toán trưởng duyệt mức chặn / cảnh báo của từng tình huống có ý nghĩa kế toán. Dev và tester có một lệnh trả lời "đã đủ tình huống chưa, có test chưa": `node ../bizcity-platform/tools/failure-check.mjs --repo . --report`.

Chuẩn: [bizcity-platform BIZCITY-FAILURE-MAP-v1](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-FAILURE-MAP-v1.md).

## 2. Khai báo trước

Đơn vị sạch trên CSDL test có:
- một NCC đang dùng và một NCC ngừng dùng;
- một mặt hàng đang dùng và một mặt hàng nháp;
- hai chi nhánh, mỗi chi nhánh một kho;
- một kỳ đã khoá;
- một hợp đồng mua còn số lượng;
- mức tồn tối đa cho một mặt hàng.

## 3. Các bước thao tác

**Giai đoạn 1 (phiếu này, không sửa form):**
1. Dựng khung `PhieuMuaForm.failure-map.json` bằng `failure-check --scaffold` (72 tình huống khung).
2. Rà từng dòng: bỏ dòng không áp dụng, gán mã có sẵn (`ERROR_CATALOG`, `IN-*`, mã chi tiết). Mã còn thiếu: ghi thành việc thêm mã, **không** tự đặt chuỗi.
3. Viết lời nhắc tiếng Việt cho từng dòng.
4. Kế toán trưởng duyệt mức của các dòng kỳ / thuế / kho / giá vốn / công nợ.
5. Test API `apps/api/test/phieu-mua-ban-do-loi.test.ts`: mỗi dòng chặn bắt ở máy chủ có một ca gây đúng mã, đúng `error.fields[].path`.
6. `error.fields[]` có thêm `code` (chữ chốt §10).

**Giai đoạn 2 (sau khi PHASE-026 xong `PhieuMuaForm.tsx`):** màn đọc bản đồ để báo trước khi bấm, tô / cuộn tới ô, mở danh sách chọn với nút thêm / sửa tại chỗ, mở nguồn gốc. Mở phiếu riêng.

## 4. Số liệu đầu vào

Dữ liệu giả trong test (R-SEC-10). Không dùng số liệu của đơn vị thật.

## 5. Kết quả mong đợi

**Trên màn hình / phản hồi API:**

| Mục | Mong đợi |
|---|---|
| Bản đồ | `failure-check --repo .` không còn phát hiện chặn trên `PhieuMuaForm.failure-map.json` |
| Mỗi dòng chặn bắt ở máy chủ | API trả đúng `error.code` hoặc mã phát hiện, và `error.fields[]` có `{ path, message, code }` đúng toạ độ chứng từ (vd `lines.0.itemId`) |
| Lời nhắc | Cùng câu với bản đồ; không SQL / tên bảng / stack |

**Bút toán:** không có. Tình huống lỗi không được sinh bút toán nào; test khẳng định sổ không đổi.

**Báo cáo phải thấy:** `failure-check --report` cho MH05 có số tình huống, % đủ mã + test, % bắt ở giao diện (GĐ1: bắt ở giao diện chưa tính).

**Sai số làm tròn chấp nhận:** không áp dụng.

## 6. Trường hợp lệch chuẩn

| # | Làm thế này | Phần mềm phải |
|---|---|---|
| 1 | Ngày phiếu thuộc kỳ đã khoá | chặn `PERIOD_LOCKED`, `fields` trỏ `docDate`, sổ không đổi |
| 2 | Dòng hàng chọn mặt hàng nháp | chặn `IN-ITEM-009`, trỏ `lines.<i>.<ô mặt hàng>` |
| 3 | NCC ngừng dùng | chặn, trỏ ô NCC (mã gán ở bước 2) |
| 4 | Kho nhận không thuộc chi nhánh của phiếu | chặn hoặc cảnh báo theo duyệt của kế toán trưởng, trỏ ô kho của dòng |
| 5 | Vượt số còn lại của hợp đồng mua / vượt tồn tối đa | cảnh báo kèm nguồn gốc (mã hợp đồng / mức tối đa) |
| 6 | Sửa / xoá phiếu đã ghi sổ | chặn, nói làm phiếu đảo; không xoá sổ |
| 7 | Không đủ quyền | `FORBIDDEN`, không lộ dữ liệu |

## 7. Kết quả chạy

| | |
|---|---|
| Ngày chạy | |
| Bản code (commit) | |
| Test tự động | `apps/api/test/phieu-mua-ban-do-loi.test.ts` |
| Tiêu chí lên mức | không đổi mức ở GĐ1 (màn chưa nối) |

| Mục | Mong đợi | Phần mềm | Chênh | Giải thích |
|---|---|---|---|---|

## 8. Biên bản nghiệm thu

| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 9. Lịch sử thay đổi

| Ngày | Thay đổi |
|---|---|
| 25/11/2026 | Tạo phiếu (Nháp); chữ chốt thiết kế GĐ1 ở §10 |

## 10. Chữ chốt thiết kế (R-FLOW-2)
<!-- [2026-11-25 05:27 PM Johnny Chu - Chu Hoàng Anh] NGHIEM-THU — chữ chốt đổi thứ dùng chung: error.fields[].code (packages/platform/src/core/http.ts) -->

Đổi thứ dùng chung duy nhất của GĐ1 là **khuôn phản hồi lỗi**. Đây là thay đổi **minor, chỉ thêm**:

1. `error.fields[]` từ `{ path, message }` thành `{ path, message, code? }`:
   - lỗi từ `details.findings` (có `field`): `code` = mã phát hiện; `message` giữ nguyên như đang trả;
   - lỗi khuôn zod / kiểm route: `code` = `VALIDATION_ERROR`.

   Bên gọi cũ chỉ đọc `path` / `message`, không vỡ; chữ của `message` không đổi.
2. Ghi `fields` vào [BIZCITY-ERRORS-v1 §1](../../contracts/BIZCITY-ERRORS-v1.md) (trường đang chạy từ 11/2026 nhưng chưa có trong hợp đồng).
3. **Không** thêm mã lỗi mới trong GĐ1. Mã còn thiếu ghi thành việc riêng theo R-ERR-1 / R-INTAKE-11.
4. **Không** thêm phép kiểm chặn vào selfcheck. `failure-check` chạy tay / trong CI của bizcity-platform; nối selfcheck là việc sau, có chữ chốt riêng.
5. **Không** sửa `PhieuMuaForm.tsx` (dòng PHASE-026) và tệp `mua-hang-*.test.ts`.
