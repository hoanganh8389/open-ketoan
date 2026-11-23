# Pull Request
<!-- [2026-11-03 08:05 PM Johnny Chu - Chu Hoàng Anh] SC-DOC-4 — sửa tham chiếu đường dẫn lỗi thời sau khi tách Kernel / Platform (mã đã dời; gói đích chưa tách ghi rõ "chưa tách") -->

## Mô tả

<!-- 1–2 câu: làm gì, vì sao. Liên kết việc / mục audit (A-xx) / giai đoạn lộ trình nếu có. -->

<!-- [2026-11-23 11:28 AM Johnny Chu - Chu Hoàng Anh] PHASE-040 — B11 (S040-27): tiêu chí trụ cột PR đẩy — mã ở docs/standard/tru-cot.json dạng <trụ cột>/<mã>, ví dụ X/DC-3, VIII/M-2;
     PR không đẩy tiêu chí nào thì ghi "không". Đổi mức tiêu chí trong tru-cot.json cùng PR (hoặc để người duyệt đổi).
     Thiếu dòng này mà PR chạm trụ cột → bộ chấm ghi việc tiếp "khai tiêu chí" và trụ cột không được tính tiến độ. -->
**Trụ cột / tiêu chí:** <mã, ví dụ X/DC-3 — hoặc "không">

## Tầng bị đụng

- [ ] T0 Nhân (`core/`, `modules/{documents,posting,ledger}`, `packages/contracts`, trigger sổ cái) → **1 người duyệt**; ghi mức K0–K3 và (K2 / K3) mục **K**: đụng gì, số đo, đường lui
- [ ] T1 Dịch vụ lõi (`modules/*` khác, `features/`, `components/`)
- [ ] T2 Phân hệ: `<key>`
- [ ] T3 Add-in: `<id>`
- [ ] Chỉ tài liệu / vận hành

**Mức thay đổi Kernel** (bắt buộc nếu đụng T0 — [RULE-KERNEL](../docs/rules/RULE-KERNEL.md)): K0 / K1 / K2 / K3 → `…`

## Tuân thủ luật (tick cái đã kiểm; bỏ qua cái không liên quan)

- [ ] **R-LEDGER** — Không ghi `ledger_*` ngoài `modules/ledger`; sửa / huỷ bằng bút toán đảo; không thêm cờ bỏ qua kiểm tra vào `post()`.
- [ ] **R-EVENT** — Dữ liệu tài chính mới đi qua `postDocumentIn` / `eventStore.commit`; có `docKey` bất biến + `version`.
- [ ] **R-POST** — Không viết số tài khoản trong luật; thiếu cấu hình báo qua resolver; `docType` mới có khuôn + luật + lý do mặc định + test.
- [ ] **R-MD** — Danh mục tham chiếu bằng mã; không xoá cái đã dùng.
- [ ] **R-MATRIX** — Khoá cấu hình mới đã thêm vào `docs/contracts/bizcity-settings.registry.json`; đọc qua hàm kiểm khuôn.
- [ ] **R-BOUND** — Phân hệ không import phân hệ khác, không ghi bảng nhân.
- [ ] **R-API** — Phản hồi `{ ok, data | error }`; lỗi bằng `Errors.*`; route có `requirePermission`.
- [ ] **R-DB** — Migration mới, số kế tiếp không trùng, có `COMMENT ON` tiếng Việt, đã cập nhật `packages/platform/src/db/types.ts` + `schema-catalog.ts`.
- [ ] **R-TEN** — Lọc `tenant_id`; thao tác ghi có `writeAudit`.
- [ ] **R-WF** — Chỉ trạng thái đã duyệt mới nộp sự việc.
- [ ] **Hợp đồng** — Đổi `packages/contracts` / API công khai → đã cập nhật `docs/contracts/*` (tăng phiên bản, changelog) và `docs/api/` + JSON mẫu.
- [ ] **CANON §5** — Đã sửa các tài liệu tương ứng với phần code bị đổi.
- [ ] **R-SIG** — Mỗi phần đổi có chức năng trong tệp framework có dấu `[YYYY-MM-DD HH:MM AM/PM <người chỉ đạo>] <MÃ> — <mô tả>` (`node scripts/ky-dau.mjs`); không xoá dấu cũ, không ghi tên agent ([RULE-SIGNATURE](../docs/rules/RULE-SIGNATURE.md)).
- [ ] **R-SEC** — Không bí mật trong code; không ghép đầu vào vào SQL (`sql.raw`); tệp tải lên có trần; không PII trong log / PR.
- [ ] **R-REL** — Đã thêm dòng vào `CHANGELOG.md` mục `[Chưa phát hành]` (đổi định khoản K2+ ghi ở mục riêng).
- [ ] **Bộ kiểm** — `bash scripts/kiem-chuan.sh` ĐẠT (không thêm lỗi mới so với `main`); ghi kết quả `selfcheck --strict` vào khối bằng chứng dù ĐẠT hay KHÔNG ĐẠT; không thêm nợ vào `baseline.json` (trừ khi nhóm Lõi duyệt, có `ref`). <!-- [2026-11-23 11:28 AM Johnny Chu - Chu Hoàng Anh] PHASE-040 — B11 (S040-27), D040-13 -->

## Bằng chứng chạy máy
<!-- [2026-11-22 09:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-040 — B3 (S040-8): khối bằng chứng mọi PR, cùng khuôn scripts/cham-pr.mjs đọc (PHASE-040 · 20 §4, D040-8) -->

<!-- Bắt buộc với mọi PR có mã khi CI chưa chạy được; với T0 thêm dòng diagnostics (docs/ops/DIAGNOSTICS.md §4).
     In khối điền sẵn SHA: node scripts/cham-pr.mjs --mau-bang-chung
     Thiếu khối hoặc thiếu dòng kiem-chuan / selfcheck → bộ chấm ghi PR là UNVERIFIED; khối dán khác kết quả chạy lại → ghi phát hiện.
     [2026-11-23 11:28 AM Johnny Chu - Chu Hoàng Anh] PHASE-040 — B11 (S040-27), D040-13 / D040-14: VERIFIED = kiem-chuan ĐẠT + dòng selfcheck đã điền (main còn nợ thì KHÔNG ĐẠT là trung thực)
     + một người khác tác giả bấm Approve hoặc merge. Tự merge PR của mình → UNVERIFIED. -->

```text
== BẰNG CHỨNG ==
head: <sha>   gộp main: <sha origin/main lúc chạy>
bash scripts/kiem-chuan.sh                       → ĐẠT | KHÔNG ĐẠT (<số phát hiện mới>)
node tests/conformance/selfcheck.mjs --strict    → ĐẠT | KHÔNG ĐẠT; tuân chuẩn <x>; C <y>%
(cd apps/api && npx vitest run <tệp>)            → <qua>/<tổng> qua   CSDL: <tên CSDL test>
npm run typecheck                                → <số> lỗi
diagnostics (T0)                                 → <DG-* đạt / không đạt>
migration (nếu có): bảng trước <n> → sau <m> (sạch + nâng cấp)
ghi chú:
```
