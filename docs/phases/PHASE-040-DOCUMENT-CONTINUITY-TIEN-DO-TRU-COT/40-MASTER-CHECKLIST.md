# PHASE-040 · 40 — Checklist
<!-- [2026-11-22 04:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-040 — việc con S040-*, ca T040-* (ở 10 §3), nhật ký -->

Ký hiệu: ☐ chưa · 🟡 đang · ✅ xong · ⛔ chờ người ngoài nhóm.

## Việc

| ID | Việc | Đợt | Ưu tiên | Code? | Trạng thái |
|---|---|---|---|---|---|
| S040-1 | README, [00](00-MASTER-PLAN.md), [10](10-MA-TRAN-CHUNG-TU.md), [20](20-CHAM-DIEM-TIEN-DO.md), checklist; đo trên `main` `3a551921`: số bảng, CI, bảo vệ nhánh, selfcheck, mốc trụ cột | W0 | P0 | không | ✅ 2026-11-22 |
| S040-2 | Chủ dự án duyệt D040-1..12, trả Q040-1..6 | W0 | P0 | không | ✅ 2026-11-22 |
| S040-3 | B1 — `bizcity_document@1` 1.5.0-draft: STD-DOC-4 sáu nhóm, §5 ghi "Trình" là `pending` bỏ qua được; CONF-MAN-4; CANON §4 {chung-tu} | W1 | P0 | không | ✅ 2026-11-22 — `BIZCITY-DOCUMENT-v1.md` 1.5.0-draft (§5, §5.2, STD-DOC-4, STD-DOC-9), CONF-MAN-4, `bizcity-standard.json` |
| S040-4 | B1 — ADR-0038 Document Continuity; `docs/rules/RULE-DOCUMENT-CONTINUITY.md` (R-DOC-CONT-0..9); CANON §0.14 + danh mục luật {chung-tu} | W1 | P0 | không | ✅ 2026-11-22 — ADR-0038, RULE-DOCUMENT-CONTINUITY.md, CANON v1.12 (§0.2 dòng X, §0.14, §3 R-DOC-CONT) |
| S040-5 | B1 — trụ cột X vào `tru-cot.json` (DC-1..11, [00 §2.2](00-MASTER-PLAN.md)); mã IX → `TV-*`; xác minh T040-24..27 {he-thong} | W1 | P0 | có | ✅ 2026-11-22 — X: 11 tiêu chí (1 đạt · 6 một phần · 2 tài liệu · 2 chưa = 41 %); IX → `TV-*`; SC-PILLAR-1 đạt; T040-24..26 ✅, T040-27 🟡 ([10 §3](10-MA-TRAN-CHUNG-TU.md)) |
| S040-6 | B2 — `scripts/cham-pr.mjs` chỉ đọc theo [20 §5](20-CHAM-DIEM-TIEN-DO.md); ma trận DOC sang dạng máy đọc {he-thong} | W2 | P0 | có | ☐ |
| S040-7 | B2 — `docs/reviews/tien-do/PR-*.json` + `docs/reviews/TIEN-DO-PR.md`; chạy lùi 10 PR gần nhất; T040-35 {he-thong} | W2 | P0 | có | ☐ |
| S040-8 | B3 — `.github/pull_request_template.md` khối *Bằng chứng chạy máy*; `nhan-viec.mjs kiem` nhắc khi thiếu {he-thong} | W3 | P0 | có | ☐ |
| S040-9 | B3 — `.mailmap` gộp danh tính người đóng góp {he-thong} | W3 | P1 | không | ☐ |
| S040-10 | B9 — đếm bảng hai chế độ trong `kiem-nang-cap.sh`; sửa báo cáo 135 → 134; T040-34 {he-thong} | W9 | P0 | có | ☐ |
| S040-11 | B4 — họ `IN-DOC-*` ([00 §6](00-MASTER-PLAN.md)) vào `intake-findings.ts`, kiểm trùng, có căn cứ; trang tra mã {chung-tu} | W4 | P0 | có | ☐ |
| S040-12 | B4 — thống kê HT19: gom theo mã · loại chứng từ · phân hệ · bước · tuần; thẻ "Lỗi hay gặp"; T040-29..31 {chung-tu} | W4 | P0 | có | ☐ |
| S040-13 | B5 — số HĐ + `applies` trên mọi phiếu chuỗi mua ([00 §4.1](00-MASTER-PLAN.md)); nhắc thiếu HĐ — @Thuy2k {mua-hang} | W5 | P0 | có | ☐ |
| S040-14 | B5 — dải chuỗi trên đầu phiếu mua (HĐ · PO · NCC · bước trước / sau), ghi đè có căn cứ — @Thuy2k {mua-hang} | W5 | P0 | có | ☐ |
| S040-15 | B6 — màn hợp đồng từng bước A → K, lập chứng từ kế tiếp từ chứng từ trước; T040-2 — @Thuy2k {mua-hang} | W6 | P0 | có | ☐ |
| S040-16 | B6 — bảng sẵn sàng thanh lý theo hợp đồng; `IN-DOC-CLOSE-OPEN-ITEMS`; T040-14 — @Thuy2k {mua-hang} | W6 | P0 | có | ☐ |
| S040-17 | B7 — `sale_programs` → `pricing.sale_program`; `applies` từ đơn / phiếu bán / đơn POS; Doc 26 §3, §6; T040-15; chạy lại NT-BH-033 — @H-Joyy {ban-hang} | W7 | P0 | có | ☐ |
| S040-18 | B8 — trạng thái kế toán suy ra trên HT18; chẩn đoán mồ côi nguồn, hoàn tất thiếu sổ, tệp đổi băm, `doc_ref` ≠ `doc_key`; T040-28 {chung-tu} | W8 | P1 | có | ☐ |
| S040-19 | B9 — review R2 (quá hạn từ sau PHASE-034) dùng bộ chấm B2; biên bản `docs/reviews/REVIEW-R2-*.md` {he-thong} | W9 | P0 | không | ☐ |
| S040-20 | Chủ tài khoản: mở lại GitHub Actions (Q040-3); bật bảo vệ `main` — PR + 1 người duyệt, check bắt buộc sau khi CI chạy được (Q040-4) {he-thong} | — | P0 | không | ⛔ chủ tài khoản GitHub |
| S040-21 | Sau phase — đưa vào sổ các dòng ☐ "sau phase" ở [10 §2](10-MA-TRAN-CHUNG-TU.md) {kho, quy, ban-hang} | — | P1 | có | ☐ |

## Ca nghiệm thu

T040-1..36 ở [10 §3](10-MA-TRAN-CHUNG-TU.md). Xác minh ca nào thì ghi tên tệp test + SHA vào ô "Trạng thái" của việc tương ứng.

## Nhật ký

| Ngày | Việc |
|---|---|
| 2026-11-22 | W0: mở phase từ đề bài chủ dự án. Đo trên `main` `3a551921`: `public` 134 bảng (báo cáo 135 còn `org_units`, đã xoá ở 0174) + 26 bảng schema module; GitHub Actions 0 / 3 594 lượt chạy thành công (khoá thanh toán, job không chạy bước nào); `main` chưa bảo vệ; 0 / 30 PR merge gần nhất có review; selfcheck không CSDL KHÔNG ĐẠT (28 check), ma trận C 73 %; mốc trụ cột: nền móng 68 %, trụ cột I–VIII 62 % |
| 2026-11-22 | W0: [30](30-PHAN-TICH-CAU-HOI-MO.md) phân tích Q040-1..6. Đo thêm: repo công khai, runner `ubuntu-latest` (khoá là khoá thanh toán, không phải hết phút); 30 / 30 PR merge gần nhất do tài khoản chủ dự án mở → đổi mặc định Q040-4 (bảo vệ theo bậc), Q040-5 (điểm người không commit); `R-CONT` đã là trụ cột III → Q040-2 giữ `R-DOC-CONT` |
| 2026-11-22 | S040-2 chốt: chủ dự án đồng ý D040-1..12 và đề xuất Q040-1..6 ([30](30-PHAN-TICH-CAU-HOI-MO.md)). Mã IX đổi sang `TV-*` thay `LIB-*` (trùng mã phát hiện thư viện). Giữ chỗ B1 (S040-3, 4, 5) ở CLAIMS.md |
| 2026-11-22 | B1 xong (S040-3, 4, 5). Bằng chứng chạy máy trên CSDL test riêng `ketoan_test_040` (okt-thu-db-1): `so-chung-tu`, `lich-su-chung-tu`, `hop-dong-mua`, `dinh-kem-chung-tu`, `cong-no-theo-hop-dong`, `nt-bh-033-so-chung-tu-ban`, `nen-mong`, `engines` đều qua; `gates.test` lỗi 1 ca "mỗi mã có trụ cột…" — **lỗi có sẵn trên main**, chạy lại không có thay đổi B1 vẫn lỗi y như vậy. Selfcheck: chỉ khác main ở SC-CON-4 (đã sửa bằng `bizcity-standard.json`). Mức trụ cột X khởi điểm: (1 + 6·½ + 2·¼) / 11 = 41 %; nhóm nền móng (0, V, IX, X) 68 % → 60 % vì thêm X — đúng điều muốn thấy |
