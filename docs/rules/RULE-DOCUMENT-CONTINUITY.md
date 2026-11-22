# RULE · Liên tục chứng từ — Document Continuity (R-DOC-CONT)
<!-- [2026-11-22 06:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-040 — luật R-DOC-CONT theo ADR-0038: trụ cột X, chứng từ nối nhau qua bốn bảng Document Kernel, hợp đồng xuyên suốt chuỗi mua, hoàn tất ≠ ghi sổ -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> **Cấp:** Tier 0 cho R-DOC-CONT-0, -1, -9; Tier 1 cho phần còn lại · **Trạng thái:** chấp nhận 2026-11-22 ([ADR-0038](../adr/ADR-0038-document-continuity-lien-tuc-chung-tu.md)), thi hành từng bước · **Thi hành:** [PHASE-040](../phases/PHASE-040-DOCUMENT-CONTINUITY-TIEN-DO-TRU-COT/README.md).
> Nền: [`bizcity_document@1`](../contracts/BIZCITY-DOCUMENT-v1.md) (STD-DOC-*), [R-WF](RULE-WORKFLOW.md) (máy trạng thái, duyệt ≠ ghi sổ), [R-GATE](RULE-GATE.md) (mặc định cho phép, nhắc khi sai; thư viện mã), [R-LOG](RULE-LOG.md) (lỗi để lại dấu). Sổ tay nghiệp vụ: [Doc 26 · Sổ chứng từ quy chuẩn](../nghiep-vu/26-so-chung-tu-quy-chuan.md).

## Nguyên tắc một câu

**Không chứng từ nào được coi là xong khi không trả lời được: ai lập, dựa trên gì, gửi / nhận cho ai, duyệt lúc nào, hàng / tiền đi đâu, ghi sổ ở đâu, bản gốc lưu đâu, vì sao đổi — và câu trả lời đọc được từ bốn bảng Document Kernel (`business_documents`, `document_versions`, `document_links`, `document_attachments`) cộng sổ, không từ trí nhớ.**

## Ranh giới với trụ cột III (R-CONT)

| | Trụ cột III · Liên tục kế toán ([R-CONT](RULE-CONTINUITY.md)) | Trụ cột X · Liên tục chứng từ (R-DOC-CONT) |
|---|---|---|
| Giữ chuỗi của | **con số**: dòng sổ, lớp giá vốn, phân bổ | **chứng từ**: hợp đồng → đơn → phiếu → hoá đơn → thanh toán → thanh lý |
| Bắt đầu từ | lúc vào sổ (`accounting_events`) | lúc lập nháp |
| Nối nhau ở | liên kết `ledger` (`doc_ref` = `doc_key`): X là đầu vào của III, không lặp luật của III | |

Nền móng MDG giữ định danh của **đối tượng** (`item_id`, `partner_id`, chi nhánh, kho); X giữ định danh và chuỗi của **chứng từ** (`doc_ref`, phiên bản, liên kết).

## Luật

| Mã | Luật | Kiểm bằng |
|---|---|---|
| R-DOC-CONT-0 | **Mọi chứng từ vào sổ chứng từ chung.** Mọi chứng từ nghiệp vụ có một dòng `business_documents`, ghi bằng trigger trên bảng nguồn (không ghi tay từ mã) — mọi đường vào (giao diện, API, Excel, MCP, module) đều vào sổ | sẽ có: SC mới — bảng nguồn khai ở Doc 26 §3 phải có trigger đồng bộ (S040-21) |
| R-DOC-CONT-1 | **`doc_ref` bất biến**, khuôn `<module>.<loại>:<id>`, theo đơn vị; module ghi qua `bizcity_doc_put` / `bizcity_doc_link` (`SECURITY DEFINER`, kiểm đơn vị, 0167). Chứng từ có nộp sổ thì `doc_ref` = `doc_key` | test `so-chung-tu`; sẽ có: chẩn đoán `doc_ref` ≠ `doc_key` (S040-18) |
| R-DOC-CONT-2 | **Sáu nhóm trạng thái** (`draft` · `pending` · `approved` · `in_progress` · `done` · `cancelled`, STD-DOC-4); `status_raw` giữ trạng thái riêng của phân hệ; chuyển trạng thái qua workflow khai báo (R-WF), không UPDATE viết cứng | `parseWorkflow` (`STATUS_GROUPS`), CONF-MAN-4 |
| R-DOC-CONT-3 | **Phiên bản khi nội dung đổi.** Nội dung đổi → `version` tăng + `content_hash`; chỉ đổi trạng thái → không tăng. Đã ghi sổ thì sửa = chứng từ điều chỉnh + phiên bản mới, Kernel đảo bút toán cũ (STD-DOC-5) | test `so-chung-tu` |
| R-DOC-CONT-4 | **Liên kết có nghĩa.** Chỉ dùng chín vai (`source`, `applies`, `uses`, `ledger`, `settles`, `reverses`, `replaces`, `attachesTo`, `adjusts`); chứng từ lập từ chứng từ khác phải có `source`; áp chính sách / thuộc hợp đồng phải có `applies` | test `lich-su-chung-tu`; sẽ có: chẩn đoán "mồ côi nguồn" theo loại (S040-18) |
| R-DOC-CONT-5 | **Hợp đồng xuyên suốt chuỗi mua.** Chứng từ thuộc chuỗi mua theo hợp đồng mang `meta.contract` + liên kết `applies` tới `hop-dong.contract:<số>`; mua không hợp đồng ghi `meta.contractException` (lý do, người cho phép) — không gắn hợp đồng giả. Thiếu cả hai: **nhắc** `IN-DOC-CONTRACT-REQ`; chặn chỉ khi kế toán trưởng bật cho đơn vị (R-GATE-9), có thể kèm ngưỡng tiền (STD-DOC-9) | sẽ có: `IN-DOC-CONTRACT-REQ` (S040-11, S040-13) |
| R-DOC-CONT-6 | **Hoàn tất ≠ ghi sổ.** `done` là xong việc nghiệp vụ. Trạng thái kế toán (không áp dụng · chờ ghi sổ · đã ghi sổ · đã đảo) **suy ra khi đọc**, không thêm cột; điểm ghi sổ theo `ledger[].on` của workflow từng loại | sẽ có: chẩn đoán "đã hoàn tất, loại phải ghi sổ, không có liên kết `ledger`" (S040-18) |
| R-DOC-CONT-7 | **Bản gốc giữ nguyên.** Đính kèm có `sha256`, không ghi đè; tệp đổi = bản mới | test `dinh-kem-chung-tu` |
| R-DOC-CONT-8 | **Lỗi có mã, có dấu.** Mọi lần bị từ chối có mã `IN-*` / `ERR_*` + `requestId`, lưu ở nhật ký kiểm HT19; thống kê được theo mã · loại chứng từ · phân hệ · tuần | nhật ký HT19 (`/api/v1/validation-log`); sẽ có: họ `IN-DOC-*` và thống kê (S040-11, S040-12) |
| R-DOC-CONT-9 | **Không bảng mới** cho lịch sử, phiên bản, đính kèm, liên kết, trạng thái gửi / nhận của chứng từ; ngoại lệ bằng ADR | duyệt PR; `ra-soat-dong-gop.mjs` (H-MD-TABLE) |

## Ba chiều trạng thái

Chỉ chiều nghiệp vụ được lưu ([`bizcity_document@1` §5.2](../contracts/BIZCITY-DOCUMENT-v1.md)):

```text
Nghiệp vụ (lưu)     draft → pending → approved → in_progress → done   (+ cancelled; pending bỏ qua được)
Gửi / nhận (vết)    nhật ký + document_attachments (biên nhận) + meta.exchange — không đè status
Kế toán (suy ra)    từ ledger[].on của loại · liên kết ledger · accounting_events · khoá kỳ
```

## Thể hiện khi làm việc

| Ai | Thấy gì |
|---|---|
| Kế toán mua | trên đầu mọi phiếu mua: số hợp đồng · đơn đặt · nhà cung cấp · bước trước / bước sau; thiếu hợp đồng thì được nhắc, có cách ghi ngoại lệ (S040-13, S040-14) |
| Kế toán trưởng | công tắc "bắt buộc số hợp đồng" cho đơn vị; bảng sẵn sàng thanh lý theo hợp đồng (S040-16); thẻ "Lỗi hay gặp" (S040-12) |
| Dev / module | ghi qua `bizcity_doc_put` / `bizcity_doc_link`; khai `ledger[].on`; không thêm bảng lịch sử riêng |
| Chủ dự án | trụ cột X ở HT10 với mức đạt từng tiêu chí DC-1..11, đi theo bằng chứng |
