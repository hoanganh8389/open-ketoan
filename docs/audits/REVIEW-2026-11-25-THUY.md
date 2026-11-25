# Rà soát việc của người đóng góp — Nguyễn Văn Thủy · 2026-11-25 (HT20 Lỗi hệ thống, tự sửa lỗi)
<!-- [2026-11-25 09:21 PM Johnny Chu - Chu Hoàng Anh] R-REV — biên bản rà 2 commit HT20 / TU-DONG-SUA-LOI của Nguyễn Văn Thủy (7a02302e, b9e1732b): KHÔNG ĐẠT; ghi chú của chủ dự án gửi Thủy kèm việc phải làm -->

> **Luật:** [RULE-REVIEW](../rules/RULE-REVIEW.md) · **Khoảng:** `7a02302e^..b9e1732b` (đã vào `main` và `dev`) · **Công cụ:** `node scripts/ra-soat-dong-gop.mjs --range 7a02302e^..b9e1732b --author "Nguyễn Văn Thủy"` + `node tests/conformance/selfcheck.mjs`
> **Nội dung:** màn HT20 Lỗi hệ thống, API `/api/v1/system/loi*` và `/api/v1/ket-noi/*` (khoá kết nối), `scripts/loi/keo-loi.mjs`, `scripts/loi/dung-lai-theo-yeu-cau.sh` (cron dựng lại), [TU-DONG-SUA-LOI](../ops/TU-DONG-SUA-LOI.md) — 13 tệp, 754 dòng thêm
> **Kết luận:** 🔴 **KHÔNG ĐẠT** — ý tưởng đúng hướng, nhưng đẩy thẳng `main`, làm đỏ thêm bộ kiểm, mở một quyết định chủ dự án đang hoãn và tự dựng cơ chế xác thực riêng. Thủy sửa theo §2 rồi mở PR; trước khi sửa xong: **tắt công tắc Tự sửa, chưa đặt cron dựng lại, tắt route `tra-ma`**.

## 1. Ghi chú của Johnny Chu gửi Thủy

Thủy,

Mình đã đọc HT20 và [TU-DONG-SUA-LOI](../ops/TU-DONG-SUA-LOI.md). Hướng đi rất đúng thứ mình muốn: lỗi trên con dev được tự phát hiện, gom theo phân hệ, có người nhận, có giữ chỗ để không sửa trùng, cấm `--force`, có công tắc đóng băng trước buổi demo. Mẹo đặt `COMPOSE_FILE` trong `.env` để mọi lệnh compose tự ghép bộ giám sát cũng hay. Mình muốn giữ những phần đó.

Nhưng có mấy điều mình phải nhắc, vì chúng đụng tới nguyên tắc của dự án chứ không chỉ là chi tiết mã:

1. **Không đẩy thẳng `main`.** Lần rà 31/10 mình đã nhắc ([REVIEW-2026-10-31-THUY](REVIEW-2026-10-31-THUY.md)), lần này lặp lại. Mọi việc đi nhánh riêng → giữ chỗ ở [CLAIMS](../phases/CLAIMS.md) → PR → người duyệt. Từ hôm nay repo có `node scripts/moi-truong-dev.mjs --sua`: chạy một lần, máy Thủy có hook trước khi đẩy, chặn đúng những lỗi bộ kiểm bắt được dưới đây.
2. **Không để `main` đỏ thêm.** Hai commit này để lại phát hiện ở 10 kiểm (§3). Luật là selfcheck phải đạt trước khi đẩy (R-FLOW-5); đỏ có sẵn của người khác thì không sao, đỏ mới do mình thì phải sửa trước.
3. **Đừng tự mở việc mình đang hoãn.** Route `/api/v1/ket-noi/tra-ma` trả log kèm stack cho bất kỳ máy hay AI nào cầm khoá. Đó đúng là D019-8 (2) — "agent tự tra trace" — mình đã ghi **để sau, quyết riêng** ở [PHASE-019](../phases/PHASE-019-BAN-DIEU-TRA-NHA-PHAT-TRIEN/00-MASTER-PLAN.md); và trái với Q019-3 (chế độ Đơn vị không xem stack), D019-3 (agent không tự gọi devtools). Muốn mở thì viết đề xuất, mình quyết; trước đó **tắt route này**.
4. **Không tự làm cơ chế xác thực riêng.** Khoá đang lưu chữ rõ trong `tenants.settings`, route khai `public: true`, so khoá bằng câu SQL. Nền đã có `api_keys` (băm, có phạm vi quyền) — dùng nó.
5. **Mã do AI viết không tự lên máy chạy mà không ai duyệt.** Lịch tự sửa đẩy thẳng `dev`, cron kéo `dev` dựng lại mỗi phút ⇒ mã chưa ai đọc chạy trên con dev. AI tự sửa thì đẩy **nhánh riêng và mở PR vào `dev`**; người duyệt bấm gộp rồi mới dựng lại.
6. **Máy dev là máy cPanel hay kẹt Docker.** Cron đang gọi `cap-nhat.sh --yes` (`docker compose up -d --build` cả bộ) — đúng thứ [DEPLOY §5](../ops/DEPLOY.md) cảnh báo làm web sập. Dùng `scripts/cap-nhat-cpanel.sh`.

Những điều trên không phải để chặn Thủy làm — mình muốn tính năng này vào, nhưng vào đúng cửa. Làm xong §2 thì mở PR, mình rà lại.

— Johnny Chu (Chu Hoàng Anh)

## 2. Việc Thủy phải làm

| # | Việc | Luật | Cách làm đúng · tệp mẫu | Mức |
|---|---|---|---|---|
| a | Ngay: tắt công tắc **Tự sửa** ở HT20; **chưa** đặt cron `dung-lai-theo-yeu-cau.sh`; tắt route `GET /api/v1/ket-noi/tra-ma` (trả 404 / bỏ khỏi đăng ký) | D019-8, Q019-3 | — | chặn |
| b | Giữ chỗ ở CLAIMS cho HT20 rồi làm trên nhánh riêng + PR; chạy `node scripts/moi-truong-dev.mjs --sua` để có hook trước khi đẩy | R-FLOW, R-REV-1 | [AGENTS.md](../../AGENTS.md) "Đầu mỗi phiên", "Bước 0" | chặn |
| c | Route ghi qua `defineAction` (quyền, zod, Idempotency-Key, bằng chứng); route đọc khai `requirePermission` | SC-ACT-1, SC-API-3 | `apps/api/src/modules/catalog/item.actions.ts` | chặn |
| d | Bỏ khoá tự chế: máy ngoài dùng khoá của `api_keys` với phạm vi riêng (vd `loi:doc`, `loi:danh-dau`, `loi:dung-lai`); không trả khoá ở dạng rõ qua `GET /api/v1/system/cong-cu` | R-SEC, bizcity_users@1 | `packages/platform/src/core/auth.ts` (khoá API) | chặn |
| e | Tự sửa bằng AI: đẩy nhánh `loi/<mã-mục>` + mở PR vào `dev`, không `git push origin HEAD:dev`; cron chỉ dựng lại sau khi PR đã gộp | R-REV-5, R-FLOW | — | chặn |
| f | Cron dựng lại gọi `scripts/cap-nhat-cpanel.sh` trên máy cPanel, không `cap-nhat.sh` | DEPLOY §5 | `scripts/cap-nhat-cpanel.sh` | chặn |
| g | Test cho API mới: danh sách / đổi trạng thái / giữ chỗ 30 phút / từ chối khi máy khác giữ / khoá sai | R-QG-2 | `apps/api/test/helpers.ts` (`setupTenant`, `call`) | chặn |
| h | Ghi tệp qua `appendRunLog` / `readRunLog` sẵn có thay vì tự viết JSONL; quét nền theo khuôn hẹn giờ của Platform | SC-EVD-1, SC-EVT-1, R-KER-8 | `packages/platform/src/core/run-log.ts` | cảnh báo |
| i | Tính năng mới, độc lập → `modules/<key>/` (vd `modules/loi-he-thong/`), không thêm vào `apps/api/src/modules/system`, không sửa `phan-he/loi.ts` đang đóng băng | ADR-0024 | `templates/starter-module/` | cảnh báo |
| j | Dấu R-SIG đúng khuôn `[YYYY-MM-DD HH:MM AM/PM Nguyễn Văn Thủy] <MÃ> — <mô tả>` ở mọi tệp đã sửa; tệp framework cần chủ dự án duyệt | SC-SIG-1, SC-SIG-2 | [RULE-SIGNATURE](../rules/RULE-SIGNATURE.md) | chặn |
| k | Trang hướng dẫn `docs/huong-dan/loi-he-thong.md` cho HT20; khai `LOI_QUET` ở `.env.example`; nút bị khoá ở HT20 nói lý do (`BlockedHint`); màn HT13 không trỏ trình duyệt thẳng tới Loki / Tempo | SC-DOC-6, SC-CON-7, SC-UI-1, SC-DEV-1 | `docs/huong-dan/nhat-ky-kiem.md` | cảnh báo |
| l | Xem lại chỗ trùng với **DEV04 "Lỗi theo module"** (đã gom lỗi theo phân hệ): HT20 dùng lại phần gom của DEV04 hoặc nói rõ khác gì | R-KER-8, REUSE-MAP | — | gợi ý |

## 3. Bằng chứng rà

**Lượt tự động** (`ra-soat-dong-gop.mjs`): 2 commit · 13 tệp · 0 chặn · 7 cảnh báo.

| Mã | Kết luận |
|---|---|
| H-DIRECT-MAIN (2 / 2 commit) | **đúng**, lặp lại lần rà 31/10 → việc b |
| H-FRAMEWORK × 5 (`cong-cu.routes.ts`, `loi-he-thong.ts`, `phan-he/loi.ts`, `TU-DONG-SUA-LOI.md`, `tool-password.ts`) | **đúng** — tệp framework, chưa có dấu chủ dự án / chưa được duyệt → việc j |
| H-NO-TEST | **đúng** — 292 dòng API mới, không test → việc g |

**Selfcheck trên `main`** — phát hiện nằm trong tệp của hai commit:

| Kiểm | Số | Ví dụ |
|---|---|---|
| SC-ACT-1 | 8 | `POST /api/v1/system/loi/trang-thai` là route ghi thô |
| SC-API-3 | 7 | `GET /api/v1/ket-noi/loi` không khai quyền |
| SC-SIG-2 | 6 | dấu `[2026-11-25 Nguyễn Văn Thủy]` thiếu giờ, mã, mô tả |
| SC-DEV-1 | 4 | HT13 trỏ trình duyệt thẳng tới nguồn quan sát |
| SC-EVD-1 | 3 | ghi tệp ngoài cổng bằng chứng |
| SC-SIG-1 | 3 | tệp framework chưa có dấu chủ dự án |
| SC-EVT-1 | 2 | `setInterval` quét nền trong API |
| SC-CON-7, SC-DOC-6, SC-UI-1 | 1 mỗi kiểm | `LOI_QUET` chưa khai; thiếu trang hướng dẫn HT20; nút khoá không nói lý do |

**Chấm trục** (RULE-REVIEW §7, 0–3): T1 sự thật kế toán 3 · T2 ranh giới Kernel 3 · T4 bảo mật **1** · T5 kiểm đầu vào 2 · T10 kiểm thử **0** · T11 Core gọn 1. Không trục cổng nào bằng 0; kết luận KHÔNG ĐẠT theo các phát hiện chặn ở §2.

**Không âm thầm sửa** (R-REV-5): Nhóm Lõi không sửa mã của hai commit này; Thủy làm theo §2. Đề xuất cho chủ dự án: bật bảo vệ nhánh `main` (chỉ gộp qua PR) để H-DIRECT-MAIN không lặp lại lần ba.
