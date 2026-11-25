# `bizcity_api@1` — Quy ước HTTP chung
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->
<!-- [2026-10-30 10:29 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — tự chẩn đoán L1 / L3, diagnostic_runs, khoá kỳ chặn khi sổ lỗi (PHASES 2.10). -->
<!-- [2026-10-30 11:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — runtime action defineAction, idempotency, dry-run (PHASES 2.5). -->
<!-- [2026-10-30 11:27 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — bằng chứng chỉ thêm, chuỗi băm theo đơn vị, biên nhận (PHASES 2.6). -->
<!-- [2026-10-30 11:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — MCP cho trợ lý AI: POST /mcp, công cụ sinh từ action, xác nhận trước khi ghi (PHASES 2.11, 2.12). -->

> **Phiên bản:** 1.0.0 · 2026-10-28 · **Trạng thái:** Ổn định · **Luật:** [R-API](../rules/RULE-API.md)
> **Nguồn sự thật:** `packages/contracts/src/api.ts`, `apps/api/src/core/{http,errors,auth}.ts` · **OpenAPI sống:** `/api/docs`

## 1. Địa chỉ, xác thực

| | |
|---|---|
| Gốc | `https://<máy chủ>/api/v1` |
| Người dùng | `Authorization: Bearer <jwt>` (hạn `JWT_TTL_HOURS`, mặc định 12 giờ) |
| Hệ thống | `X-Api-Key: <khoá>` — khoá gắn một đơn vị, có phạm vi (R-TEN-4) |
| Kiểu | JSON UTF-8 |
| Header tuỳ chọn | `X-Bizcity-Contract: <mã@major>` (Giai đoạn 2), `X-Request-Id` (truy vết), `Idempotency-Key` (8–128 ký tự; **bắt buộc** với action ghi khai `idempotency: required`, vd lập / chi yêu cầu thanh toán — [ACTION §8](BIZCITY-ACTION-v1.md)) |

## 2. Khuôn phản hồi

```json
{ "ok": true,  "data": { }, "meta": { "page": 1, "pageSize": 50, "total": 123 } }
{ "ok": false, "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [ "…" ] } }
```

## 3. Mã lỗi ổn định

| `code` | HTTP | Khi nào | Bên gọi nên |
|---|---|---|---|
| `VALIDATION_ERROR` | 400 | Sai khuôn, tổng tiền lệch | Sửa dữ liệu; không gửi lại y nguyên |
| `UNAUTHORIZED` | 401 | Thiếu / sai khoá, phiên hết hạn | Kiểm khoá |
| `FORBIDDEN` | 403 | Khoá / vai trò thiếu quyền | Xin phạm vi |
| `NOT_FOUND` | 404 | Không có bản ghi | — |
| `CONFLICT` | 409 | Phiên bản nhỏ hơn bản đang có; mã trùng; xoá danh mục đã dùng | Tăng `version`; đọc lại |
| `PERIOD_LOCKED` | 409 | Kỳ đã khoá | Báo kế toán |
| `POSTING_FAILED` | 422 | Thiếu cấu hình định khoản | Không cần gửi lại — kế toán sửa rồi định khoản lại |
| `UNBALANCED_ENTRY` | 422 | Bút toán không cân (lỗi luật) | Báo nhóm Lõi |
| `INTERNAL_ERROR` | 500 | Lỗi hệ thống | Thử lại sau, có giới hạn |
| `IDEMPOTENCY_CONFLICT` | 409 | Cùng `Idempotency-Key` cho cùng action nhưng khác nội dung ([ACTION §8](BIZCITY-ACTION-v1.md)) | Sinh khoá mới cho thao tác mới; gửi lại thì giữ nguyên khoá **và** nội dung |
| `CAPABILITY_MISSING` | 501 | Module cần năng lực Core chưa có (`planned`) | Nâng Core hoặc tắt module |
| `MODULE_DISABLED` | 403 | Module chưa bật cho đơn vị | Bật module |
| `RATE_LIMITED` | 429 | Quá hạn mức gọi (khoá API, AI) | Chờ rồi gửi lại, giãn nhịp |
| `NOT_READY` | 503 | Bản cài chưa sẵn sàng: còn migration chưa áp, mất trigger bảo vệ sổ, CSDL chỉ đọc (`GET /system/health/ready`, L1) | Bộ cân bằng tải ngừng gửi việc; vận hành chạy `db-migrate` |
| `GATEWAY_UNAVAILABLE` | 503 | Cổng vào (nginx, container `web`) không gọi được api: api dừng, đang khởi động lại hoặc quá giờ — **cổng vào trả, không phải api** <!-- [2026-11-22 12:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — B2 (S038-6) --> | Thử lại có giãn nhịp (`Retry-After`); vận hành chạy `./scripts/lay-log.sh`, xem `logs/web/<ngày>.log` |

Thêm mã = thay đổi tương thích; đổi nghĩa mã = phá vỡ.

## 4. Kiểu giá trị

| Kiểu | Quy ước |
|---|---|
| Tiền | `number`, đồng, đã làm tròn như hoá đơn; so sánh tới xu |
| Số lượng | `number`, được lẻ; quy về ĐVT nhỏ nhất |
| Ngày | `YYYY-MM-DD` hoặc ISO 8601 (lấy phần ngày) |
| Mã | chuỗi, cắt khoảng trắng hai đầu, phân biệt hoa thường |
| `id` | chuỗi số (`"123"`) — chỉ dùng nội bộ, không lưu ở hệ thống ngoài |
| true/false trên URL | `true`/`false`/`1`/`0` |

## 5. Phạm vi công khai cho plugin (cam kết ổn định)

| Nhóm | Endpoint | Phạm vi khoá |
|---|---|---|
| Sự việc | `POST /documents`, `POST /documents/batch`, `POST /documents/cancel`, `GET /documents?search=<docKey>` | `documents:write` |
| Danh mục đọc | `GET /branches`, `/partners`, `/products`, `/tax-codes`, `/posting/reasons`, `/posting/payment-methods` | `documents:write` hoặc `catalog:write` |
| Danh mục ghi | `POST /branches`, `PUT /partners/:code`, `PUT /products/:sku` | `catalog:write` |
| Đối chiếu | `GET /reports/sales-invoices`, `GET /reports/trial-balance` | `reports:read` |
| Hệ thống | `GET /system/health`, `GET /system/health/ready` (L1; 503 `NOT_READY` khi chưa sẵn sàng) | công khai |
| Hệ thống | `POST /system/client-errors` <!-- [2026-11-22 05:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — B4b --> — giao diện báo lỗi lập trình (loại, khung stack của mã web, màn; **không** dữ liệu nhập) → `logs/web-client/<ngày>.log`; 10 lỗi / phút / phiên, 429 `RATE_LIMITED` khi quá | công khai |
| Tự chẩn đoán | `GET /system/diagnostics` (L3 toàn vẹn sổ, [DIAGNOSTICS.md §2](../ops/DIAGNOSTICS.md)) | `reports:read` |
| Năng lực | `GET /system/capabilities` (bảng năng lực Standard của bản đang chạy) | mọi khoá / phiên đăng nhập |
| MCP | `POST /mcp` (JSON-RPC 2.0 — [bizcity_mcp@1](BIZCITY-MCP-v1.md)); đi qua nginx của container `web` | phiên / khoá API; công cụ lọc theo quyền |
| Bằng chứng | `GET /evidence/:id` (bản ghi + kiểm băm, nối chuỗi — kiểm biên nhận `meta.receipt` của action ghi) | `documents:read` |

### 5.1 Chính sách (bản nháp, chưa cam kết ổn định)
<!-- [2026-11-08 03:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W3a: endpoint chính sách cho nguồn ngoài; chưa vào bảng cam kết ổn định cho tới khi POS dùng thật -->

Chạy được từ PHASE-031 W3a, đặc tả ở [bizcity_policy@1](BIZCITY-POLICY-v1.md): `GET /policies`, `GET /rule-contracts`, `GET /rule-contracts/:id`, `POST /policies/evaluate` (quyền `catalog:read` — khoá `documents:write`, `reports:read`, `catalog:write` đều có), `POST /policies` (`settings:write`). Chưa nằm trong bảng trên vì chưa ai dùng thật; chuyển vào bảng khi POS dùng ổn định.

Mọi endpoint khác phục vụ giao diện nội bộ và **có thể đổi không báo** (R-API-8).

### 5.2 Đăng nhập một lần từ WordPress (`bizcity_identity@1`) <!-- [2026-11-24 09:50 PM Johnny Chu - Chu Hoàng Anh] SPINE-5 -->

<!-- [2026-11-24 09:50 PM Johnny Chu - Chu Hoàng Anh] SPINE-5 — chủ duyệt chuẩn bizcity_identity@1 1.0.0 ngày 2026-11-24 (bizcity-platform/docs/standard/BIZCITY-IDENTITY-v1.md). Đoạn này là chữ chốt phía open-ketoan trước PR mã (R-FLOW §3: migration mới). -->

`POST /api/v1/auth/wp-sso { ticket }` (đã có) nhận thêm hai trường trong vé và nhớ danh tính WordPress của người dùng:

| Trường vé | Việc |
|---|---|
| `sub` (`wp:<id>` hoặc `biz:<id>`) | **khoá danh tính xuyên app.** Lưu ở `users.external_sub`. Khớp người dùng theo `sub` **trước**, theo email sau |
| `aud` | phải bằng `WP_SSO_AUD` (mặc định `open-ketoan`); có `aud` mà sai ⇒ `UNAUTHORIZED`, không có giai đoạn chuyển |

Luật khớp người dùng (thay cho "khớp theo email" hiện nay):

1. Vé **có** `sub`, đã có người dùng mang `external_sub = sub` trong đơn vị ⇒ đăng nhập người đó; email trong vé đổi thì **không** đổi email cục bộ (email là khoá đăng nhập mật khẩu, đổi ở đó là việc của người dùng).
2. Vé **có** `sub`, chưa ai mang `sub`: tìm theo email. Gặp người dùng **chưa có** `external_sub` ⇒ gắn `sub` vào người đó (lần đầu nối). Gặp người dùng **đã mang `sub` khác** ⇒ `UNAUTHORIZED` (không để vé WordPress khác chiếm tài khoản qua email trùng). Không có ai ⇒ tạo người dùng mới (vai `viewer`, như hiện nay) mang `sub`.
3. Vé **không** có `sub` (plugin phát vé chưa cập nhật): hành vi cũ — khớp theo email. Khi `WP_SSO_REQUIRE_SUB=1` (mặc định **0**, bật sau 90 ngày kể từ khi plugin phát vé cập nhật — Q-IDENT-2) ⇒ `UNAUTHORIZED`.
4. `is_active = false` ở open-ketoan vẫn chặn dù vé hợp lệ (app là người gác cuối). Quyền trong phiên vẫn là `perms` của vé lọc về quyền đã khai (Q-IDENT-1) — không đổi.

Dữ liệu: **migration 0183** (đã có, PR #626): `users.external_sub text NULL` có CHECK khuôn `^(wp:[0-9]+|biz:[A-Za-z0-9_-]{1,64})$`, chỉ mục duy nhất `(tenant_id, external_sub)` khi khác NULL, `COMMENT ON COLUMN`. Không UPDATE dữ liệu sẵn có (người dùng cũ được gắn `sub` ở lần đăng nhập SSO kế tiếp, luật 2). Cấu hình mới: `WP_SSO_AUD`, `WP_SSO_REQUIRE_SUB` (`.env.example`, `docker-compose.yml`, `packages/platform/src/config/env.ts`). <!-- [2026-11-24 11:27 PM Johnny Chu - Chu Hoàng Anh] SPINE-5 — C-9-16: migration 0183 + WP_SSO_AUD / WP_SSO_REQUIRE_SUB đã vào mã (#626), bỏ chữ (đề xuất) -->

Bằng chứng (`audit_logs`) ghi người dùng theo `user:<id>` như cũ; ánh xạ `sub` → `users.external_sub` để truy ra. Không đổi quyền, không đổi vai, không chạm bảng sổ.


| | |
|---|---|
| Lô sự việc | 200 / lần |
| Dòng trên một sự việc | 2000 |
| Trang danh sách | `pageSize` có trần theo endpoint |

## 7. Changelog

- **1.0.0 (2026-10-28):** Đặt tên hợp đồng cho quy ước đang chạy; liệt kê phạm vi công khai.
