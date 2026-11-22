# PHASE-038 — Checklist
<!-- [2026-11-21 01:29 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — W0: checklist bước thắng nhỏ, mỗi bước một PR người vận hành dùng được -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> Thiết kế: [README](README.md). Giữ chỗ trước khi code: [CLAIMS.md](../CLAIMS.md) (R-FLOW).

Thứ tự theo giá trị: B1 một mình đã giải được sự cố 2026-11-21 (biết vì sao API không lên).

| Mã | Bước | Việc | Phạm vi | Xong khi | Trạng thái |
|---|---|---|---|---|---|
| S038-1 | W0 | Phase, quyết định D038-1..4 | `docs/phases/PHASE-038-*/**`; `docs/phases/README.md` | chủ dự án duyệt | ✅ 2026-11-21 |
| S038-2 | B1 | `logging:` json-file có trần cho mọi dịch vụ; bind mount `${LOG_HOST_DIR:-./logs}` → `/app/logs` cho `api`, `db-migrate`; `LOG_DIR`, `LOG_FILE_LEVEL` vào `env.ts`; `.gitignore` `logs/` | `docker-compose.yml`; `packages/platform/src/config/env.ts`; `.env.example`; `.gitignore` | `docker compose config` hợp lệ; dựng lại không mất log cũ | ✅ 2026-11-21 (#522) |
| S038-3 | B1 | Logger multistream → `logs/api-loi.log` (≥ warn, xoay vòng, cùng `redact`) | `apps/api/src/app.ts`; `packages/platform/src/core/**` (logger) | test: 5xx ghi một dòng có `reqId`, `traceId`, `err.stack`, không có thân yêu cầu | ✅ 2026-11-21 (#522) |
| S038-4 | B1 | Lỗi khởi động ghi `fatal` đồng bộ vào `api-loi.log` với `evt: bizcity.system.start_failed` + `reason` | `apps/api/src/main.ts` | test: còn migration chưa áp → dòng `MIGRATION_PENDING` có trong tệp trước khi thoát | ✅ 2026-11-21 (#522) |
| S038-5 | B1 | Job `db-migrate` ghi `logs/db-migrate.log` (commit, migration áp, lỗi đầy đủ) | `apps/api/src/db/setup.ts` | migration hỏng → tệp có tên migration + mã PG | ✅ 2026-11-21 (#522) |
| S038-6 | B2 | nginx `web`: `web-loi.log` (error_log + truy cập ≥ 500); `error_page 502 503` trả JSON (không 504 — báo cáo chạy lâu) `GATEWAY_UNAVAILABLE` | `docker/nginx.conf`; `docker-compose.yml` (mount); `packages/contracts/src/errors.ts` | dừng `api` → `/api/v1/system/health` trả JSON có mã; tệp có dòng upstream | ✅ 2026-11-22 (#544) |
| S038-7 | B3 | `scripts/lay-log.sh` theo README §4.4 | `scripts/lay-log.sh` | chạy được khi `api` chết; gói không chứa giá trị `.env` | ✅ 2026-11-22 (#528) |
| S038-8 | B3 | Sổ tay: mục "Lấy log gửi về" trong runbook aaPanel + DEPLOY §4; OBSERVABILITY §2 thêm `logs/`; log aaPanel `/www/wwwlogs/` | `docs/trien-khai.md`; `docs/ops/DEPLOY.md`; `docs/ops/OBSERVABILITY.md`; `docs/ops/SO-TAY-DIEU-TRA-LOI.md` | người vận hành làm theo không cần hỏi | ✅ 2026-11-22 (#528) |
| S038-9 | B4 | Giao diện: một khay "Không kết nối được máy chủ phần mềm" cho `GATEWAY_UNAVAILABLE` / 5xx không JSON; lùi dần lời gọi lặp | `apps/web/src/lib/api.ts`; khay lỗi; `presence` | 29 yêu cầu hỏng → 1 khay; ping không dội | ✅ 2026-11-22 (#552) |
| S038-10 | B5 | Thi hành R-LOG-9 (bản cài có `logs/` cố định, có trần; luật đã khai ở RULE-LOG) + check SC-OBS-3 (compose khai `logging:` và mount `LOG_HOST_DIR`) + CHANGELOG "Nâng cấp cần làm" | `docs/rules/**`; `tests/conformance/**`; `CHANGELOG.md` | SC-OBS-3 xanh trên main | ☐ |

<!-- [2026-11-21 02:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — thêm S038-11..15 từ nghiên cứu 10 (lỗ hổng G2–G13) -->
| Mã | Bước | Việc | Phạm vi | Xong khi | Trạng thái |
|---|---|---|---|---|---|
| S038-11 | B1 | Bộ bắt `uncaughtException` / `unhandledRejection` ghi `fatal` đồng bộ (R-LOG-3); `version`, `commit` trong mọi dòng (R-LOG-5); Node `--enable-source-maps` + giữ `.map` trong ảnh (R-LOG-8) | `apps/api/src/main.ts`; `apps/api/src/app.ts`; `docker/api.Dockerfile`; `docker/api-entrypoint.sh` | stack trong log trỏ tệp `.ts`; promise không bắt → dòng `fatal` trong tệp | 🟡 mã ở nhánh `feat/phase-038-b1-nhat-ky-loi` |
| S038-12 | B1b | `logError` chung: `err` chuẩn (type, stack, `cause` lồng, `pgCode`), `errFp`, `evt`; `redact` một danh sách dùng chung; sửa `events.ts` bỏ `String(err)` | `packages/platform/src/core/**` (logger); `packages/platform/src/core/events.ts` | test che từng trường nhạy cảm; subscriber lỗi có stack + `traceId` sự kiện gốc | ✅ 2026-11-22 (#535) |
| S038-13 | B4b | (D038-5 đã duyệt) ErrorBoundary theo màn, `window.onerror`, `unhandledrejection` → `POST /api/v1/system/client-errors` → `logs/web-client.log` | `apps/web/src/**` (khung app); `apps/api/src/modules/system/**` | lỗi render → màn có mã tra cứu, không trắng; một dòng trong tệp | ✅ 2026-11-22 (#557) |
| S038-14 | B5 | Luật R-LOG-1..11 + SC-LOG-1..3; rà 16 chỗ nuốt lỗi (ghi `warn` hoặc chú thích `nuot-loi:`) | `docs/rules/RULE-LOG.md`; `tests/conformance/**`; các tệp ở 10 §4 G6 | SC-LOG xanh trên main | ☐ |
| S038-15 | ngoài | Promtail (hết hỗ trợ 2026-03-02) → Grafana Alloy; sửa cảnh báo / dashboard dùng số đo Promtail | `infrastructure/monitoring/**` — giao chủ PHASE-018 | log vẫn vào Loki, dashboard 06 chạy | ☐ |
| S038-16 | B6 | (D038-7) Nhật ký lỗi chia theo ngày, mỗi dịch vụ một thư mục: `logs/{api,db-migrate,web,web-client}/<YYYY-MM-DD>.log`; giữ 30 ngày, trần từng thư mục (10 §7.3); dọn tệp kiểu cũ ở gốc `logs/`; `lay-log.sh` gom theo thư mục | `packages/platform/src/core/logger.ts`; `apps/api/src/db/setup.ts`; `apps/api/src/modules/system/client-errors.routes.ts`; `docker/nginx.conf`; `docker/web-xoay-log.sh`; `scripts/lay-log.sh`; sổ tay | ghi sang ngày mới thì tệp mới; tệp quá 30 ngày / vượt trần bị xoá; gói gửi về có đủ các thư mục | ☐ |

## Nhật ký

<!-- [2026-11-22 06:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — D038-7 -->
- 2026-11-22 — Chủ dự án quy định (D038-7): nhật ký lỗi chia theo ngày, mỗi dịch vụ một thư mục cố định (`logs/web-client/<ngày>.log`…), dọn sau 30 ngày — "giới hạn tệp log sẽ ổn hơn". Thêm S038-16 (B6). Sửa luật R-LOG-9, CANON §0.12 (v1.11), README §4.1 / §5, 10 §7.3, `AGENTS.md`.

<!-- [2026-11-22 05:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — B4b -->
- 2026-11-22 — B4b (S038-13): `LoiManHinh` bọc `<Routes>` của mỗi thẻ (`TabWorkspace`) và gốc ứng dụng — lỗi render thành khung "Màn này gặp lỗi" có mã tra cứu (`cid`), nút Mở lại màn / Chép mã; thẻ khác vẫn dùng được. `window.onerror` / `unhandledrejection` → `POST /api/v1/system/client-errors` (công khai, khuôn chặt, ≤ 8 KB, 10 / phút / phiên, trần 120 / phút) → `logs/web-client.log` 5 MB × 3. Che ở cả hai đầu (`@ketoan/contracts` `loi-trinh-duyet.ts`): email, chuỗi ≥ 6 chữ số, mã định danh, chuỗi dài; chỉ khung của mã web; màn đã làm sạch. Không gửi lỗi API (đã có khay Mã tra cứu). Test 16. Ghi nhận: app chưa bật `trustProxy` nên `req.ip` sau nginx là địa chỉ cổng vào (cả giới hạn đăng nhập) — việc riêng.

<!-- [2026-11-22 03:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — B4 -->
- 2026-11-22 — B4 (S038-9): một khay "Không kết nối được máy chủ phần mềm" (`KhayMatKetNoi`) cho `GATEWAY_UNAVAILABLE` / 502 / 503 không JSON; 504 (báo cáo chạy lâu) và 5xx JSON của api **không** gộp. Khay Mã tra cứu ghi một lần cho N lời gọi hỏng. Tự thử `/system/health` giãn dần 5 → 60 giây (một vòng cho cả tab), nút Thử lại ngay, sau 60 giây hiện hướng dẫn `lay-log.sh`; nối lại thì báo vài giây và react-query tải lại các màn. React-query không thử lại lỗi này; ping hiện diện tạm dừng. Logic ở `@ketoan/contracts` (`ket-noi.ts`: `laMatKetNoi`, `choThuLai`, `taoKhoKetNoi`), test 16. Khi viết B4 phát hiện B2 gộp nhầm 504 — đã sửa ở #544.

<!-- [2026-11-22 12:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — B2 -->
- 2026-11-22 — B2 (S038-6): nginx trả JSON `GATEWAY_UNAVAILABLE` (503, `requestId` = `$request_id`, `Retry-After`) khi api không trả lời, cho `/api/` và `/mcp`; 5xx của chính api đi nguyên (không `proxy_intercept_errors`). `logs/web-loi.log`: `error_log` warn + dòng truy cập mã ≥ 500 (ghi `$uri`, không chuỗi truy vấn), xoay 10 MB × 3 bằng `docker/web-xoay-log.sh`. Tên `api` phân giải lúc chạy (resolver Docker): thử thật — dựng lại api đổi IP, web không khởi động lại vẫn gọi đúng.

<!-- [2026-11-22 01:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-038 — B1b -->
- 2026-11-22 — B1b (S038-12): `logError` + `errFp` (băm loại lỗi + 3 khung stack trong `apps/` · `packages/`, chuẩn hoá đường dẫn); logger của Platform có `serializers.err`, `mixin` gắn `errFp` cho mọi dòng ≥ error, `redact` một danh sách `REDACT_PATHS`; lỗi Postgres giữ mã / bảng / ràng buộc, **không** `detail`. Lỗi subscriber vào log (warn khi còn lượt, error khi dead) có `job`, `fn`, `attempt`, `eventId`, `traceId` của sự kiện gốc; vòng sự kiện bỏ `String(err)` (G4). Migration lỗi giữ `cause` (G12). Test: 41 không CSDL, 2 có CSDL.

<!-- [2026-11-21 08:55 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — B3 -->
- 2026-11-21 — B3 (S038-7, S038-8): `scripts/lay-log.sh` gom commit, trạng thái container, kiểm sức khoẻ, log Docker, `logs/*.log`, tên biến `.env` thành một gói; che mọi giá trị `.env` ≥ 8 ký tự, còn sót thì không tạo gói. `cap-nhat.sh` đặt `BIZCITY_GIT_SHA`, lỗi thì nhắc gom log trước khi lùi. Sổ tay: `docs/trien-khai.md` §7b, DEPLOY §4, SO-TAY-DIEU-TRA-LOI §0.0, OBSERVABILITY §2. Cần B1 (#522) merge trước: compose mới chuyển `BIZCITY_GIT_SHA` vào container.

<!-- [2026-11-21 04:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — luật R-LOG, CANON §0.12, chỉ dẫn agent -->
- 2026-11-21 — Chủ dự án yêu cầu: ra luật chính thức và chỉ dẫn agent nhắc người đóng góp. Thêm [RULE-LOG](../../rules/RULE-LOG.md) (R-LOG-1..11, chấp nhận), CANON §0.12 + dòng §3 / §5 + v1.9, mục R-LOG trong `AGENTS.md` (Claude Code / Codex / Cursor đọc qua `CLAUDE.md`) và `.github/copilot-instructions.md`, trỏ ở OBSERVABILITY §2. Phần tài liệu của S038-14 xong; còn SC-LOG-1..3 và rà 16 chỗ nuốt lỗi (B5).

<!-- [2026-11-21 03:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — B1: ghi nhật ký đợt -->
- 2026-11-21 — B1 có mã: `packages/platform/src/core/logger.ts` (tệp xoay vòng, tách mức, ghi đồng bộ, bắt lỗi tiến trình), `env.ts` ném `EnvError` thay `process.exit`, `main.ts` / `db/setup.ts` nạp động để lỗi lúc nạp cũng vào tệp, compose (`x-logging` 10 MB × 3, gắn `./logs`), Dockerfile `--enable-source-maps`. Để lại: `db/migrate.ts` bọc lỗi migration chưa giữ `cause` (mã PG) → B1b (S038-12); `cap-nhat.sh` tự đặt `BIZCITY_GIT_SHA` → B3 (S038-7).

- 2026-11-21 — W0 chốt: chủ dự án đồng ý mọi đề xuất (D038-1..6, D038-2b). Giữ chỗ B1 (S038-2..5, S038-11).

- 2026-11-21 — Nghiên cứu [10](10-NGHIEN-CUU-GHI-LOG.md): 13 lỗ hổng G1–G13, chuẩn R-LOG nháp, trần `logs/` 200 MB (D038-2 chốt).

- 2026-11-21 — W0 mở sau sự cố go-live ketoan.btnet.vn (503 toàn bộ `/api/v1/*`).
