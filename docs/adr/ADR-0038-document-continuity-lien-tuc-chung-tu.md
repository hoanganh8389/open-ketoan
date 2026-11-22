# ADR-0038 · Document Continuity — Liên tục chứng từ là trụ cột X
<!-- [2026-11-22 06:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-040 — ADR-0038: trụ cột X Liên tục chứng từ đứng cạnh nền móng MDG; sáu nhóm trạng thái; ba chiều trạng thái; hợp đồng xuyên suốt chuỗi mua; không bảng mới -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.

- Trạng thái: **Chấp nhận** — chủ dự án đồng ý D040-1..12 ngày 2026-11-22 ([PHASE-040 README §Câu hỏi](../phases/PHASE-040-DOCUMENT-CONTINUITY-TIEN-DO-TRU-COT/README.md)); có hiệu lực khi PR chứa tệp này vào `main` (R-FLOW-7).
- Ngày: 2026-11-22 · Người quyết: Johnny Chu – Chu Hoàng Anh · Mức Kernel: **K0** (nguyên tắc, chuẩn); thi hành K1–K2 theo bước B4–B8 của PHASE-040.
- Luật: [R-DOC-CONT](../rules/RULE-DOCUMENT-CONTINUITY.md). Hợp đồng: [`bizcity_document@1`](../contracts/BIZCITY-DOCUMENT-v1.md) 1.5.0-draft. Nền: [ADR-0021](ADR-0021-accounting-continuity-lien-tuc-ke-toan.md) (trụ cột III), [ADR-0022](ADR-0022-quan-tri-du-lieu-goc-nen-mong.md) (nền móng MDG, bảng trụ cột), [ADR-0029](ADR-0029-loi-bat-bien-nghiep-vu-linh-hoat.md) (duyệt ≠ ghi sổ), [ADR-0020](ADR-0020-ton-chi-core-nguoi-dung-quyet-dinh-mot-ngon-ngu-ma.md) (một ngôn ngữ mã).

## Bối cảnh

Từ 0158 tới 0179 Document Kernel đã có bốn bảng chung (`business_documents`, `document_versions`, `document_links`, `document_attachments`), hàm ghi `SECURITY DEFINER` cho module (0167) và chín vai liên kết; Doc 26 hướng dẫn đưa từng loại chứng từ vào sổ. Nhưng:

- Bảng trụ cột (`docs/standard/tru-cot.json`) không có trụ cột nào đo chuỗi **chứng từ**; trụ cột III đo chuỗi **con số** sau khi vào sổ. Không đo thì không biết còn thiếu gì.
- Hợp đồng `bizcity_document@1` ghi "5 nhóm trạng thái" trong khi mã (`STATUS_GROUPS`) và Doc 26 đã có sáu nhóm từ 0166.
- "Hoàn tất" và "đã ghi sổ" dễ bị đánh đồng; nếu thêm cột trạng thái kế toán sẽ thành nguồn thứ hai lệch nhau.
- Chuỗi mua theo hợp đồng mới có nền (0165: hợp đồng là chiều phân tích, `applies`, `dims.contract`), chưa có luật bắt mọi phiếu mang số hợp đồng.

Chi tiết số đo: [PHASE-040 · 00 §1](../phases/PHASE-040-DOCUMENT-CONTINUITY-TIEN-DO-TRU-COT/00-MASTER-PLAN.md); ma trận 61 loại chứng từ: [PHASE-040 · 10](../phases/PHASE-040-DOCUMENT-CONTINUITY-TIEN-DO-TRU-COT/10-MA-TRAN-CHUNG-TU.md).

## Quyết định

1. **Trụ cột X · Liên tục chứng từ**, khoá `document`, vai "nền móng", đứng cạnh MDG trong `tru-cot.json`; tiêu chí DC-1..DC-11, mức đạt theo bằng chứng (SC-PILLAR-1). Luật R-DOC-CONT-0..9.
2. **Sáu nhóm trạng thái** là chuẩn duy nhất: `draft` · `pending` · `approved` · `in_progress` · `done` · `cancelled`; `pending` bỏ qua được. Hợp đồng lên 1.5.0-draft, CONF-MAN-4 sửa theo.
3. **Ba chiều trạng thái:** nghiệp vụ (lưu ở `status`), gửi / nhận (ghi vết, không đè `status`), kế toán (suy ra khi đọc). **Không thêm cột** trạng thái kế toán. `accounting_events` giữ nguyên, chỉ được ghi khi chứng từ tới điểm `ledger[].on`.
4. **Hợp đồng xuyên suốt chuỗi mua** (`meta.contract` + `applies`), mặc định **nhắc** khi thiếu (R-GATE-9); kế toán trưởng bật chặn cho đơn vị, có thể kèm ngưỡng tiền; mua không hợp đồng ghi ngoại lệ có lý do.
5. **Không bảng mới** cho lịch sử / phiên bản / đính kèm / liên kết / gửi nhận của chứng từ; ngoại lệ bằng ADR.
6. **Lỗi theo mã** họ `IN-DOC-*` trong thư viện mã hiện có (`packages/contracts/src/intake-findings.ts`), lưu ở nhật ký HT19 hiện có; không khung bắt lỗi thứ hai.
7. Mã tiêu chí trụ cột IX đổi `L-1..L-8` → `TV-1..TV-8` (trùng mã tiêu chí trụ cột I; `LIB-*` đã là mã phát hiện của thư viện).

## Hệ quả

- HT10 hiện thêm trụ cột X (màn đọc `tru-cot.json`, không đổi mã giao diện). Mốc khởi điểm của X thấp — đó là điều muốn thấy, không phải lỗi.
- Doc 26 §4 hiện ghi `done` kèm ví dụ "phiếu nhập / xuất đã ghi sổ": đọc theo R-DOC-CONT-6 là *ví dụ* hoàn tất, không phải định nghĩa. Sửa câu chữ khi làm S040-18.
- Bán hàng và chính sách bán (BH12 → `pricing.sale_program`, `applies` từ đơn bán) theo cùng luật, do người làm bán hàng thi hành (S040-17).
- Không migration, không đổi mã chạy trong bước chuẩn hoá này.

## Phương án đã loại

| Phương án | Lý do loại |
|---|---|
| Gộp vào trụ cột III (`R-CONT`) | III bắt đầu từ lúc vào sổ; chứng từ chưa ghi sổ (hợp đồng, đơn đặt, đề nghị thanh toán) nằm ngoài; mã `R-CONT` đã có chủ |
| Cột `accounting_status` trên `business_documents` | nguồn thứ hai lệch với sổ; suy ra được từ dữ liệu sẵn có |
| Bảng `document_contracts` riêng | 0165 đã có hợp đồng là chiều phân tích + `applies`; thêm bảng trái R-DOC-CONT-9 |
| Chặn mặc định khi thiếu hợp đồng | trái R-GATE-9; chặn mua lẻ, buộc hợp đồng giả |
