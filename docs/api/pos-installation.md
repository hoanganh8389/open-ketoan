# Khoá cài đặt open-pos — một khoá cho cả mạng cửa hàng
<!-- [2026-11-23 10:50 AM Johnny Chu - Chu Hoàng Anh] OKT-SET-1 — tài liệu API khoá cài đặt open-pos (ADR-0037, luật tối thượng P-0 ý 2) -->

Dành cho: người viết bridge / tích hợp WordPress (open-ketoan-bridge) và quản trị open-ketoan. Quyết định: [ADR-0037](../adr/ADR-0037-khoa-cai-dat-open-pos-moi-blog-mot-tenant.md).

## Khi nào dùng

| Mô hình (P-0) | Khoá | Header |
|---|---|---|
| bizcity.vn — mỗi blog một sổ demo | khoá API thường **của từng tenant** (`kt_…`) | `X-Api-Key` |
| **Tự cài nhiều cửa hàng** — một máy open-ketoan, mỗi cửa hàng một sổ | **một khoá cài đặt** (`okti_…`) cho cả mạng WordPress | `X-Api-Key` + `X-OKT-Blog: <số blog>` (+ `X-OKT-Install: <mã bản cài>` nên gửi) |
| Tự cài một cửa hàng | khoá API thường của tenant | `X-Api-Key` |

Một blog = một tenant = một sổ. Pháp nhân (tên, mã số thuế) là của **sổ**, không suy từ tenant hay khoá (P-0 ý 3).

## Luồng nối một cửa hàng

1. Quản trị ở **tenant chủ** tạo khoá: `POST /api/v1/pos-installations` → nhận `key` (**chỉ hiện một lần**) và `code` (`inst_…`). Dán vào bridge.
2. Bridge đăng ký các blog: `POST /api/v1/pos-installation/blogs` (không mang `X-OKT-Blog`). Blog mới → `pending` + `linkCode` 8 ký tự, hạn 24 giờ.
3. Admin cửa hàng đưa mã nối cho kế toán. Kế toán **đăng nhập đúng sổ của cửa hàng đó** → nhập mã: `POST /api/v1/pos-installations/link`. Blog thành `active`, gắn vào sổ đang đứng.
4. Từ đó bridge gửi chứng từ như cũ, thêm `X-OKT-Blog`. Yêu cầu chạy trong sổ của blog, quyền theo phạm vi của khoá (`documents:write`, `reports:read`, `catalog:write`).

Không ai gắn được cửa hàng vào sổ mà mình không đăng nhập được. Một sổ chỉ nhận **một** cửa hàng.

## Xác thực bằng khoá cài đặt

| Yêu cầu | Kết quả |
|---|---|
| `X-OKT-Blog` của blog đã nối | chạy trong sổ của blog |
| `X-OKT-Blog` của blog chờ / đã thu hồi | `403 FORBIDDEN`, `details.reason = BLOG_NOT_LINKED` — **bridge giữ hàng chờ, không bỏ đơn** |
| `X-OKT-Blog` của blog chưa đăng ký | `403 FORBIDDEN`, `details.reason = BLOG_UNKNOWN` — gọi đăng ký blog trước |
| `X-OKT-Blog` không phải số nguyên dương | `400 VALIDATION_ERROR` |
| không có `X-OKT-Blog`, route ngoài ba route của bản cài | `403 FORBIDDEN`, `details.reason = BLOG_REQUIRED` |
| khoá đã thu hồi, hoặc `X-OKT-Install` khác mã của khoá | `401 UNAUTHORIZED` |

## Route của bản cài (khoá cài đặt, không `X-OKT-Blog`)

### `POST /api/v1/pos-installation/blogs`

```json
{ "blogs": [ { "blogId": 2, "name": "Shop A", "url": "https://shop-a.example", "renewLinkCode": false } ] }
```

Tối đa 500 blog một lần. Gửi lại được (đặt trạng thái tuyệt đối). `linkCode` chỉ có trong trả lời **lúc sinh**: blog mới, mã cũ hết hạn, hoặc `renewLinkCode: true` cho blog đang chờ. Bridge lưu mã để hiện cho admin.

Trả: `{ installationCode, blogs: [ { blogId, name, url, status, tenantCode, linkCode?, linkCodeExpiresAt, linkedAt, lastPingAt, lastPingMs, stale, bridgeVersion, queueGroups, pendingDocs } ] }`.

### `GET /api/v1/pos-installation/blogs`

Trạng thái từng blog như trên (không có `linkCode`), kèm `pingStaleMinutes` (15).

### `POST /api/v1/pos-installation/ping`

```json
{ "blogs": [ { "blogId": 2, "bridgeVersion": "1.9.0", "queueGroups": 0, "pendingDocs": 1, "latencyMs": 42 } ] }
```

Một lượt cho cả bản cài. Blog chưa đăng ký nằm trong `unknown`. Trả `accepted`, `unknown`, `serverTime`, `blogs`.

## Ping của khoá thường (bizcity / một cửa hàng)

`POST /api/v1/connection/ping` — `X-Api-Key: kt_…` (quyền `documents:write`):

```json
{ "blogId": 5, "name": "Shop riêng", "url": "https://…", "bridgeVersion": "1.9.0", "queueGroups": 0, "pendingDocs": 0, "latencyMs": 30 }
```

Trả `{ blogId, tenantCode, serverTime }`. Khoá cài đặt không dùng route này.

## Route cho người dùng (đăng nhập, quyền `settings:write`)

| Route | Việc |
|---|---|
| `GET /api/v1/pos-installations` | `installations` (bản cài của sổ này + từng blog), `linkedHere` (cửa hàng đã nối vào sổ này), `directKeys` (blog dùng khoá thường đã ping) |
| `POST /api/v1/pos-installations` | tạo khoá: `{ name, siteUrl? }` → `201` có `key` một lần. Cần `Idempotency-Key` |
| `POST /api/v1/pos-installations/:code/revoke` | thu hồi — mọi yêu cầu bằng khoá này `401` ngay |
| `POST /api/v1/pos-installations/link` | nhận cửa hàng: `{ linkCode }` (không phân biệt hoa thường, bỏ qua `-` và khoảng trắng; I/L đọc là 1, O là 0) |

Lỗi khi nhận cửa hàng: mã sai / đã dùng / hết hạn / khoá đã thu hồi → `400`, `reason = POS_LINK_CODE_INVALID`; sổ đã nối cửa hàng khác → `409`, `reason = TENANT_ALREADY_LINKED`. Khoá API (kể cả khoá cài đặt) không gọi được các route này.

`stale = true` khi chưa ping hoặc lần ping cuối quá 15 phút — màn Kết nối open-pos (K-6, đợt sau) tô vàng.
