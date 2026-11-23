# NT-<MÃ>-<số> · <Tên tính năng>
<!-- [YYYY-MM-DD HH:MM AM/PM <người viết>] NGHIEM-THU — tạo phiếu. -->

| | |
|---|---|
| Phân hệ | <mua hàng / bán hàng / kho / …> |
| Màn hình | <mã màn, vd MH11> |
| Bộ phận yêu cầu | <Phòng kế toán / Kho / Mua hàng / …> |
| Ngày tạo | <dd/mm/yyyy> |
| Trạng thái | Nháp |
| Trụ cột / tiêu chí | <mã ở docs/standard/tru-cot.json, vd X/DC-6 — mức hiện tại → mức đích (vd một phần → đạt); hoặc "không"> |
<!-- [2026-11-23 05:13 PM Johnny Chu - Chu Hoàng Anh] PHASE-040 — B12 (S040-28): phiếu bắt đầu từ tiêu chí trụ cột — chọn ở màn HT10 / thẻ "Trụ cột" của phân hệ; xem docs/nghiem-thu/README.md §Phiếu và trụ cột -->

## 1. Mục đích quản trị
<Làm để biết / kiểm soát cái gì, ai dùng, dùng khi nào. 2–4 dòng.>

## 2. Khai báo trước
<Danh mục, chính sách, cấu hình cần có trước khi chạy tình huống (mã hàng, NCC, ĐVT, chính sách, kỳ…).>

## 3. Các bước thao tác
1. <Vào màn …, bấm …>
2. <Nhập …>
3. <Lưu / Duyệt …>

## 4. Số liệu đầu vào

| … | … | … |
|---|---|---|

## 5. Kết quả mong đợi

**Trên chứng từ / màn hình:**

| Mục | Mong đợi |
|---|---|

**Bút toán:**

| Nợ | Có | Số tiền | Ghi chú |
|---|---|---|---|

**Báo cáo phải thấy:** <báo cáo nào, dòng nào, số nào>

**Sai số làm tròn chấp nhận:** <vd 0đ / ≤ 1đ mỗi dòng>

## 6. Trường hợp lệch chuẩn
| # | Làm thế này | Phần mềm phải |
|---|---|---|
| 1 | <ngày chứng từ ngoài thời gian chương trình> | <không áp chương trình> |
| 2 | <nhập số âm / để trống> | <chặn, báo …> |
| 3 | <sửa sau khi duyệt> | <bỏ duyệt → đảo bút toán, không xoá> |

## 7. Kết quả chạy
| | |
|---|---|
| Ngày chạy | |
| Bản code (commit) | |
| Test tự động | `apps/api/test/<tệp>.test.ts` |
| Tiêu chí lên mức | <X/DC-6: một phần → đạt — test / check nào chứng minh; hoặc "không đổi mức" kèm lý do> |

| Mục | Mong đợi | Phần mềm | Chênh | Giải thích |
|---|---|---|---|---|

## 8. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 9. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
