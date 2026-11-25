# Canon chung và xương sống xuyên app — áp cho open-ketoan

<!-- [2026-11-24 06:05 PM Johnny Chu - Chu Hoàng Anh] SPINE-2 — chỗ trỏ tới canon chung (open-hub) và chuẩn bizcity_spine@1 (bizcity-platform, chủ duyệt 2026-11-24); khai trục ở bizcity.app.json. Tài liệu thuần, không đổi mã; luật kỹ thuật gốc của repo vẫn ở docs/00-CANON.md và docs/rules/. -->

Repo này là **nguồn luật kỹ thuật gốc** (R-*, hợp đồng `bizcity_*@1`); hai tài liệu cấp trên đứng ngoài repo:

| Tài liệu | Ở đâu | Quan hệ với repo này |
|---|---|---|
| **BIZCITY OPEN CANON** | [open-hub/docs/canon](https://github.com/hoanganh8389/open-hub/blob/main/docs/canon/README.md) | bốn trục dữ liệu, một app một trục, B2B, Twin Brain là não không là chủ dữ liệu. Canon §3 lấy chuẩn gốc **từ repo này** (`bizcity_item_master@1`, `bizcity_master_data@1`, `bizcity_document@1`) |
| **`bizcity_spine@1`** — xương sống xuyên app | [bizcity-platform/docs/standard/BIZCITY-SPINE-v1.md](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-SPINE-v1.md) · schema máy đọc ở repo bizcity-platform (thư mục schema/spine của gói contracts) · kiểm `tools/spine-check.mjs` | đặt tên chung cho định danh, bản sao, gửi sau, đối chiếu để app PHP / Python nối vào lõi này cùng một cách |

## open-ketoan trong xương sống (`bizcity.app.json` ở gốc repo)

| | |
|---|---|
| Làm chủ | `item` (`item_id` ULID, `item_codes` có hiệu lực — ADR-0017), `uom` (`product_units`), `branch` (`branches.code`), `partner` (`partners.code`; `partner_id` bigint nội bộ), sổ cái (`ledger`), chứng từ `bizcity.ledger.event:<docKey>` và chứng từ các module |
| Dùng | `tenant` (slug = `tenants.code`; `tenant_id` bigint nội bộ không lộ ra dây), `user` (`sub = wp:<id>` qua SSO; vai và quyền ở đây, `bizcity_authorization@1`) |
| Mở cho app khác | tra mã (`core.item.*`, `PUT /api/v1/partners/:code`), `Idempotency-Key` ở route ghi, `document_links`; **sắp có** (Q-SPINE-3): changefeed `?since=<cursor>` + `digest` cho `items`, `partners`, `branches` |
| Không làm | không giữ `contact_id` (trục của open-cake); không nhận `id` lạ từ ngoài (`IN-ITEM-008`); không tự tạo mặt hàng từ chứng từ (R-ITEM-6) |

## Kiểm

```bash
node ../bizcity-platform/tools/spine-check.mjs --manifest bizcity.app.json   # SC-SPINE-1, phải ĐẠT
node tests/conformance/selfcheck.mjs                                         # bộ kiểm của repo, như cũ
```

Thay đổi hợp đồng gốc ở đây (`docs/contracts/`) mà làm đổi dạng ID / hình `*Ref` thì phải đổi chuẩn spine cùng lúc (ADR ở bizcity-platform), rồi canon open-hub trỏ theo.

## Chuẩn nền của hệ (bizcity-platform)

<!-- [2026-11-25 10:04 AM Johnny Chu - Chu Hoàng Anh] STD-2 — trỏ về bản đồ chuẩn nền bizcity_standard_map@1 (bản nháp chờ duyệt) để repo này đi cùng hướng với cả hệ. Không đổi mã. -->

Repo này theo **[bản đồ chuẩn nền `bizcity_standard_map@1`](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/README.md)**: bốn trục dữ liệu (master data, chứng từ, khách 360, người dùng) và mười hai trụ cột kỹ thuật. Bức tranh toàn hệ: [ARCHITECTURE](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/ARCHITECTURE.md). Thứ tự luật: canon chung (open-hub) → chuẩn nền (bizcity-platform) → luật của repo này; luật của repo **không được nới** hai tầng trên.

| Việc ở repo này | Chuẩn |
|---|---|
| Khuôn repo, manifest, nếp làm việc | [APP-SKELETON](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-APP-SKELETON-v1.md) |
| API, kiểm đầu vào / đầu ra | [API-PROFILE](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-API-PROFILE-v1.md) |
| Người dùng, vai, quyền, đăng nhập một lần | [USERS-ROLES](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-USERS-ROLES-v1.md) · [IDENTITY](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-IDENTITY-v1.md) |
| Bảo mật · quan sát và truy lỗi · đệm | [SECURITY](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-SECURITY-v1.md) · [OBSERVABILITY](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-OBSERVABILITY-v1.md) · [CACHE](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-CACHE-v1.md) |
| Kiểm thử · phiên bản, migration, sao lưu, nâng cấp | [TESTING](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-TESTING-v1.md) · [RELEASE](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-RELEASE-v1.md) |
| Giao diện React (model · view · controller), mockup | [WEB](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-WEB-v1.md) |
| Nhiều site / nhiều CSDL · Hub, khoá, 1API | [MULTISITE](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-MULTISITE-v1.md) · [HUB](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-HUB-v1.md) |

Kiểm khuôn repo (mức S0–S3):

```bash
node ../bizcity-platform/tools/standard-check.mjs --repo .
```

Lần kiểm 2026-11-25: không còn phát hiện nào ngoài liên kết này.
