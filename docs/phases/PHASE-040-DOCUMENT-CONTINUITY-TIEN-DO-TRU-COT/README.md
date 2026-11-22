# PHASE-040 — Document Continuity (trụ cột X) và chấm tiến độ trụ cột theo từng PR merge
<!-- [2026-11-22 04:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-040 — W0: đề bài chủ dự án 2026-11-22 — thêm trụ cột "chứng từ xuyên suốt" theo bizcity_document@1 bên cạnh MDG; mua hàng xuyên suốt hợp đồng → thanh lý, phiếu nào cũng mang số hợp đồng; mã lỗi dùng lại bộ Gate B / HT19; mỗi lần PR merge chấm tiến độ theo trụ cột, nền móng, ma trận tuân thủ -->
> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> **Việc lộ trình:** — (mở rộng PHASE-026 bảng trụ cột, PHASE-029 truy vết chứng từ, docs/reviews nhịp review)
> **Phân hệ:** chung-tu · mua-hang · ban-hang · he-thong
> **Checklist công bố:** —
> **Trạng thái:** 🟡 **W0 đề xuất 2026-11-22** — chờ chủ dự án duyệt D040-1..12, trả Q040-1..6 (S040-2). Chưa có mã.
> **Mức Kernel:** W0 K0 (tài liệu). B1–B3 K0–K1 (tài liệu chuẩn, `tru-cot.json`, công cụ chỉ đọc). B4–B8 K1–K2 (mã lỗi, meta chứng từ, màn, chẩn đoán). **Không migration tạo bảng** (D040-3).
> **Nền:** [Doc 26 Sổ chứng từ chung](../../nghiep-vu/26-so-chung-tu-quy-chuan.md) · [Doc 25 Mã lỗi khai báo](../../nghiep-vu/25-quy-tac-ma-loi-khai-bao.md) · [bizcity_document@1](../../contracts/BIZCITY-DOCUMENT-v1.md) · [R-WF](../../rules/RULE-WORKFLOW.md) · [R-REV §7](../../rules/RULE-REVIEW.md) · [bảng trụ cột](../../standard/tru-cot.json) · [docs/reviews](../../reviews/README.md) · tài liệu làm việc *BIZCITY-DOCUMENT-CONTINUITY-CONFORMANCE-v1* (bản làm việc ngoài repo, R-FLOW-7: phase này là bản có hiệu lực khi đã vào `main`)
> **Phụ thuộc:** PHASE-029 (lịch sử chứng từ, `document_links`), PHASE-026 (bảng trụ cột HT10), PHASE-031 (chính sách), PHASE-038 (R-LOG)
> **Người làm chính:** mua hàng → @Thuy2k (Nguyễn Văn Thủy) · bán hàng, chính sách bán BH12 → @H-Joyy (Võ Việt Hoàng) · công cụ chấm tiến độ, chuẩn → Nhóm Lõi

| Tệp | Một câu |
|---|---|
| [00-MASTER-PLAN](00-MASTER-PLAN.md) | sự thật đo trên `main` hôm nay, trụ cột X và luật R-DOC-CONT, ba chiều trạng thái, mua hàng hợp đồng → thanh lý, bán hàng, mã lỗi, bước thắng nhỏ |
| [10-MA-TRAN-CHUNG-TU](10-MA-TRAN-CHUNG-TU.md) | ma trận chứng từ toàn luồng DOC-001..061 đối chiếu với sổ thật (đã có / dùng lại loại có sẵn / đề xuất), ca nghiệm thu T040-* |
| [20-CHAM-DIEM-TIEN-DO](20-CHAM-DIEM-TIEN-DO.md) | mỗi PR merge chấm ba mặt (nền móng · trụ cột · ma trận tuân thủ) + 12 trục R-REV, cổng, `UNVERIFIED`, điểm người đóng góp, ảnh chụp đầu tiên #576–#578 |
| [30-PHAN-TICH-CAU-HOI-MO](30-PHAN-TICH-CAU-HOI-MO.md) | phương án + đề xuất cho Q040-1..6, số đo thêm trên GitHub |
| [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md) | việc `S040-*`, ca `T040-*`, nhật ký |

## Đề bài (chủ dự án, 2026-11-22)

1. **Trụ cột mới bên cạnh dữ liệu gốc xuyên suốt: chứng từ xuyên suốt**, theo hợp đồng `bizcity_document@1`. Mọi chứng từ vào Document Kernel (`business_documents`, `document_versions`, `document_links`, `document_attachments`); vòng đời Nháp → Duyệt → Đang thực hiện → Hoàn tất (+ Huỷ). `accounting_events` giữ nguyên, chỉ khi ghi sổ mới vào.
2. **Mua hàng xuyên suốt từ hợp đồng đến thanh lý.** Giao diện đi từng bước khai báo; phiếu nào cũng mang số hợp đồng.
3. **Mã lỗi:** báo lỗi theo mã, lưu lại mọi lần lỗi, thống kê lỗi hay gặp — dùng lại bộ bắt lỗi đã có (Doc 25, Gate B, HT19).
4. **Bán hàng, chính sách bán:** Hoàng pull `main` về, đưa vào sổ theo Doc 26 (phần còn thiếu: BH12 `sale_programs` và liên kết `applies`).
5. **Theo dõi tiến độ:** mỗi lần PR của dev merge, chấm và cập nhật tiến độ theo bộ trụ cột, nền móng, ma trận tuân thủ; chấm điểm mức hoàn thành từng trụ cột — dựa trên changelog, tài liệu, mã.

## Trả lời ngắn

| Câu hỏi | Trả lời | Ở đâu |
|---|---|---|
| Có phải thêm bảng không? | **Không.** Bốn bảng Document Kernel + bảng phân hệ + nhật ký có sẵn đủ. `document.exchange`, `document.finding`, `finance.ap_recognition`… là **khái niệm** để kiểm, không phải bảng hay `doc_type` mới | D040-3, [10 §1](10-MA-TRAN-CHUNG-TU.md) |
| 147 → 135 bảng đúng chưa? | **Lệch 1.** Đo trên CSDL test ở migration 0179 (mới nhất trên `main`): `public` có **134** bảng; danh sách báo cáo còn `org_units`, bảng này đã bị xoá ở `0174_bo_cay_cu.sql:267`. Cộng 26 bảng ở schema module (`mod_pos` 15, `mod_phieu_ban` 5, `mod_loyalty` 3, `mod_voucher` 3). CSDL nâng cấp từ bản cũ và production **chưa đo** | [00 §1.2](00-MASTER-PLAN.md), S040-10 |
| Vòng đời mấy nhóm? | **Sáu** theo Doc 26 (`draft`, `pending`, `approved`, `in_progress`, `done`, `cancelled`). Hợp đồng `bizcity_document@1` STD-DOC-4 còn ghi "5 nhóm": sửa trong một PR chuẩn hoá (B1) | D040-2 |
| `done` có nghĩa đã ghi sổ? | **Không.** Hoàn tất nghiệp vụ ≠ đã ghi sổ. Trạng thái kế toán (`chưa áp dụng / chưa đủ / sẵn sàng / đã ghi / đã đối chiếu / đã đảo`) **suy ra** từ liên kết `ledger` và sổ, không lưu cột thứ hai | D040-4 |
| Số hợp đồng trên mọi phiếu mua làm sao? | Đã có nền ở 0165: hợp đồng = Danh mục hợp đồng (`dimensions` kind `contract`, sổ `hop-dong.contract:<số>`), phiếu mua có `data.contractCode` → liên kết `applies`, dòng sổ mang `dims.contract`. Còn thiếu: mọi phiếu **trong chuỗi** (hoá đơn NCC, đề nghị TT, chi tiền, trả NCC, thưởng) đều mang và hiện số HĐ; thiếu thì **nhắc**, đơn vị bật chặt thì **chặn** | D040-5, [00 §4](00-MASTER-PLAN.md) |
| Thiếu hợp đồng thì chặn hay nhắc? | **Mặc định nhắc** (R-GATE-9: mặc định cho phép, nhắc khi sai); kế toán trưởng bật chặt cho đơn vị mình. Mua lẻ không hợp đồng = ngoại lệ có lý do + người cho phép, không gắn hợp đồng giả | D040-5, Q040-1 |
| Mã lỗi có làm khung mới không? | **Không.** Thêm họ `IN-DOC-*` vào thư viện phát hiện có sẵn (`packages/contracts/src/intake-findings.ts`, 109 mã), mỗi mã có căn cứ (R-GATE-11); mọi lần bị từ chối đã tự ghi HT19 (`nhat-ky-kiem.ts`); thêm phần thống kê theo mã / loại chứng từ / bước / tuần | D040-6, [00 §6](00-MASTER-PLAN.md) |
| Chấm tiến độ mỗi PR thế nào? | Một lệnh chỉ đọc chạy trên commit trước và sau merge: **ba mặt** (nền móng · trụ cột I–X · ma trận tuân thủ C-1..C-9) đo từ `tru-cot.json` + bộ kiểm chuẩn, cộng **12 trục** R-REV (11 trục có sẵn + T12 Liên tục chứng từ). Kết quả là tệp sinh ra trong `docs/reviews/tien-do/`, không gõ tay | D040-7, [20](20-CHAM-DIEM-TIEN-DO.md) |
| CI hiện có chấm được không? | **Không.** GitHub Actions **chưa chạy được job nào** từ ngày lập repo: 3 594 lượt chạy, 0 thành công; job dừng với "account is locked due to a billing issue" (0 bước được chạy). `main` chưa bật bảo vệ nhánh; 0 / 30 PR merge gần nhất có review. Đỏ ở PR #576 là **CI không chạy**, không phải mã hỏng — nhưng cũng nghĩa là mọi PR từ đầu tới nay **chưa có bằng chứng CI** | D040-8, [00 §1.3](00-MASTER-PLAN.md), Q040-3, Q040-4 |
| Điểm người đóng góp? | Chỉ từ điểm PR đã merge có bằng chứng, ≥ 3 PR hoặc ≥ 4 tuần; không đếm dòng mã / số commit / giờ online; không bảng xếp hạng công khai. Cần `.mailmap` gộp danh tính (vd `kiennt` / `TrongKien125`, `Võ Hoàng` / `H-Joyy`) | D040-9, [20 §6](20-CHAM-DIEM-TIEN-DO.md) |

## Quyết định đề xuất

| Mã | Quyết định | Vì sao |
|---|---|---|
| D040-1 | **Trụ cột X · Liên tục chứng từ (Document Continuity)**, khoá `document`, thêm vào `docs/standard/tru-cot.json` sau trụ cột IX; luật mới `R-DOC-CONT` ở `docs/rules/RULE-DOCUMENT-CONTINUITY.md`; CANON §0.14; ADR-0038. Tiêu chí DC-1..DC-10 ([00 §2](00-MASTER-PLAN.md)) với mức đạt **ghi thật** (đa số `mot-phan` / `tai-lieu`), qua SC-PILLAR-1 | Trụ cột không có tiêu chí và bằng chứng thì không đo được tiến độ |
| D040-2 | Sáu nhóm trạng thái của Doc 26 là chuẩn vận hành. B1 sửa `bizcity_document@1` → 1.5.0-draft (STD-DOC-4 "6 nhóm", §5), CONF-MAN-4, CANON §4 trong **một** PR | Ba tài liệu đang nói ba điều khác nhau |
| D040-3 | **Không bảng mới.** Mọi chứng từ / trạng thái / liên kết đi qua bốn bảng Document Kernel + bảng phân hệ. Ngoại lệ chỉ bằng ADR nêu vì sao bốn bảng không đáp ứng | CANON §0.8 Small Core; Doc 26 §1.3 |
| D040-4 | **Ba chiều trạng thái tách nhau.** (1) nghiệp vụ = `business_documents.status` sáu nhóm; (2) gửi / nhận (đã gửi, NCC xác nhận, lỗi, thử lại) = nhật ký / bằng chứng, không đè `status`; (3) kế toán và lưu trữ = **suy ra** khi đọc (liên kết `ledger`, sổ, `document_attachments.sha256`), không lưu cột | Không tạo sổ thứ hai (R-CONT-2 tinh thần), `done` ≠ đã ghi sổ |
| D040-5 | **Hợp đồng xuyên suốt chuỗi mua:** mọi chứng từ thuộc chuỗi mua theo hợp đồng mang `meta.contract` (số HĐ, ảnh chụp lúc lập) + liên kết `applies` tới `hop-dong.contract:<số>`; thiếu → mã `IN-DOC-CONTRACT-REQ` mức **nhắc** mặc định, đơn vị bật chặt. Mua lẻ không HĐ: `meta.contractException` (lý do, người cho phép). Không áp cho bill POS khách lẻ | Đề bài mục 2; R-GATE-9 |
| D040-6 | **Mã lỗi dùng lại Gate B / HT19.** Họ `IN-DOC-*` thêm vào `intake-findings.ts` sau khi kiểm trùng; ghi qua nhật ký có sẵn; thống kê thêm vào `GET /api/v1/validation-log`. JSONL vận hành giữ theo R-LOG (30 ngày); bằng chứng chứng từ pháp lý ở `audit_logs` / sổ, theo thời hạn lưu trữ riêng | Đề bài mục 3; CANON §0 một ngôn ngữ mã |
| D040-7 | **Chấm tiến độ theo PR merge = sinh từ `main`, không gõ tay.** `scripts/cham-pr.mjs` (mới, chỉ đọc) ghép công cụ có sẵn: `selfcheck` (ma trận C-*, bảng điểm), `tru-cot.json` + SC-PILLAR-1 (trụ cột, nền móng), `ra-soat-dong-gop.mjs` (luật dò H-*), `bang-viec.mjs` (việc đóng). Ra `docs/reviews/tien-do/PR-<số>.json` + bảng tổng `docs/reviews/TIEN-DO-PR.md` | R-FLOW-8 một nguồn; R-CONT-7 không tích tay |
| D040-8 | **Bằng chứng khi CI không chạy.** Cho tới khi GitHub Actions chạy được: PR phải có khối *Bằng chứng chạy máy* (SHA, lệnh, kết quả `kiem-chuan.sh`, `selfcheck --strict`, test có CSDL); thiếu thì điểm PR là `UNVERIFIED`, không quy ra hạng. Không ghi "CI xanh" khi CI không chạy | Không bịa bằng chứng |
| D040-9 | **Điểm người đóng góp** chỉ là tổng hợp điểm PR đã nghiệm thu, cần đủ mẫu; thêm `.mailmap`; người đóng góp có quyền phản biện từng phát hiện; không dùng làm đánh giá nhân sự duy nhất | Tránh chấm sai người, sai việc |
| D040-10 | **Phân việc:** chuỗi mua (B5, B6) → @Thuy2k; bán hàng + BH12 (B7) → @H-Joyy pull `main`, làm theo Doc 26 §6; chuẩn, công cụ chấm (B1–B4, B8) → Nhóm Lõi | Người sở hữu phân hệ (bộ nhớ dự án: Thuy2k giữ MDG / mua / kho / giá vốn) |
| D040-11 | **Số bảng đo bằng SQL, không suy từ số migration.** Mỗi PR có migration ghi danh sách bảng trước / sau (CSDL sạch + CSDL nâng cấp) bằng `scripts/kiem-nang-cap.sh` mở rộng | 135 báo cáo vs 134 đo được |
| D040-12 | **Review R2 đã quá hạn** (nhịp 3 phase / 1 review: R2 phải chạy sau PHASE-034; nay đã mở tới 039). B9 dùng bộ chấm của phase này chạy R2 | docs/reviews/README §Nhịp |

## Câu hỏi cho chủ dự án

<!-- [2026-11-22 05:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-040 — mặc định Q040-3..6 cập nhật theo phân tích ở 30 -->
Phương án + đề xuất từng câu: [30-PHAN-TICH-CAU-HOI-MO](30-PHAN-TICH-CAU-HOI-MO.md). Q040-4 và Q040-5 đã đổi mặc định sau khi đo thêm: 30 / 30 PR merge gần nhất do tài khoản chủ dự án mở (không tự duyệt được), và repo công khai (tệp trong repo ai cũng đọc được).

| Mã | Câu hỏi | Mặc định tạm (nếu chưa trả lời) |
|---|---|---|
| Q040-1 | Thiếu số hợp đồng trên phiếu mua: mặc định nhắc hay chặn? | **Nhắc** (R-GATE-9); kế toán trưởng bật chặt |
| Q040-2 | Tên luật: `R-DOC-CONT` (tệp `RULE-DOCUMENT-CONTINUITY.md`)? | Dùng tên này |
| Q040-3 | CI: mở khoá thanh toán GitHub, hay dựng runner tự quản (self-hosted)? | Đề xuất: **gỡ khoá thanh toán**, đặt giới hạn chi Actions 0 USD (repo công khai + `ubuntu-latest` = miễn phí); không dùng self-hosted khi repo công khai. Trong lúc chờ: D040-8 |
| Q040-4 | Bật bảo vệ `main` thế nào, khi nào? | **Bậc 1 ngay**: cấm push thẳng / force-push / xoá, bắt buộc PR, CODEOWNERS theo vùng (chưa bắt buộc duyệt). Bậc 2 sau Q040-3: check bắt buộc. Bậc 3 khi có ≥ 2 người rà: 1 duyệt từ CODEOWNERS |
| Q040-5 | Điểm người đóng góp hiện cho ai xem? | Trong repo chỉ có điểm theo PR / trụ cột; điểm theo người sinh **cục bộ** (`cham-pr.mjs --nguoi`), không commit |
| Q040-6 | Bảng tiến độ PR để ở `docs/reviews/tien-do/` (cạnh `review-board.json`)? | Để ở đó; mỗi `PR-<n>.json` ≤ 4 KB, `TIEN-DO-PR.md` giữ 50 PR gần nhất |
