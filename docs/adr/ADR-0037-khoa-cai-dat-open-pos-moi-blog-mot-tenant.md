# ADR-0037 · Khoá cài đặt open-pos: một khoá cho cả mạng cửa hàng, mỗi blog vẫn là một tenant
<!-- [2026-11-23 07:40 AM Johnny Chu - Chu Hoàng Anh] OKT-SET-1 — ADR-0037 đề xuất: khoá cài đặt (installation key) theo luật tối thượng P-0 ý 2 (a); ngoại lệ có kiểm soát của R-TEN-4; ghép blog ↔ tenant bằng mã nối một lần do người của tenant đích nhập. -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.

- Trạng thái: **Đề xuất** — có hiệu lực khi chủ dự án merge PR chứa tệp này vào `main` (R-FLOW-2, R-FLOW-7).
- Nguồn: luật tối thượng **P-0** của chủ dự án 2026-11-23 ([RULE-OPEN-POS-CONNECTION](../rules/RULE-OPEN-POS-CONNECTION.md) mục P-0): *"Bên ngoài hệ thống bizcity, người dùng cài selfhost, sẽ ưu tiên khóa chung cho cả mạng để người dùng có thể setup chuỗi nhiều cửa hàng dùng POS nhưng vẫn về 1 open-ketoan tương ứng mỗi tenant id = blog_id"*; chủ chốt nghĩa **(a)**: *"Một bản open-ketoan, một khoá chung, nhưng mỗi blog là một tenant riêng bên trong bản open-ketoan đó (tenant id ứng với blog_id). Mỗi cửa hàng có sổ riêng, cùng nằm trên một máy kế toán."*
- Ngày: 2026-11-23 · Người quyết: Johnny Chu – Chu Hoàng Anh · Mức Kernel: **K0** (nguyên tắc + ranh giới); thi hành **K3** (migration, xác thực).
- Luật liên quan: [R-TEN](../rules/RULE-TENANT-SECURITY.md) (sửa R-TEN-4), [R-OKT-CONN](../rules/RULE-OPEN-POS-CONNECTION.md) (P-0), [R-DB](../rules/RULE-DATABASE.md). Nền: [ADR-0011](ADR-0011-plugin-ba-muc-tin-cay.md) (khoá app), [ADR-0036](ADR-0036-mot-ban-ma-moi-site-mot-database.md) (mỗi site một database).
- Phía gọi: `open-ketoan-bridge` (WordPress). Đặc tả hai phía: `bizcity-open-setup` `docs/chuong-trinh/OKT/82-CAI-DAT-KET-NOI-BA-MO-HINH.md` §3 (K-1…K-7), mockup `mockups/okt-cai-dat-ket-noi.html`.

## Bối cảnh

Hôm nay một khoá API thuộc đúng **một** tenant (`api_keys.tenant_id`, R-TEN-4); mỗi yêu cầu chạy trong tenant của khoá (RLS, `packages/platform/src/core/auth.ts` `resolveAuth`). Ba mô hình triển khai của P-0 đều là **một blog = một tenant = một sổ**:

| Mô hình | Khoá | Blog → tenant |
|---|---|---|
| bizcity.vn (demo) | một khoá API **mỗi tenant** | khoá → tenant (như hôm nay) |
| **Tự cài nhiều cửa hàng** | **một khoá cho cả mạng WordPress** | **cần mới**: (khoá cài đặt, blog) → tenant |
| Tự cài một cửa hàng | một khoá API của tenant | khoá → tenant |

Chủ chuỗi có một máy open-ketoan (một site theo ADR-0036), N cửa hàng = N tenant trong site đó, và chỉ muốn quản **một** khoá ở WordPress.

## Quyết định

### 1. Khoá cài đặt là một loại khoá mới, không phải khoá API của tenant

- Bảng `pos_installations` (migration `0180`): `id`, `code` (`inst_` + ULID, hiện cho người), `name`, `site_url`, `key_prefix` (`okti_`), `key_hash`, `owner_tenant_id` (tenant của người tạo khoá), `scopes` (như R-TEN §3: `documents:write`, `reports:read`, `catalog:write`), `status` (`active` · `revoked`), `created_by`, `created_at`, `revoked_at`, `last_seen_at`. RLS theo `owner_tenant_id`.
- Tạo / thu hồi ở **Hệ thống → Kết nối open-pos** của tenant chủ, quyền mới `pos-installation:manage`. Khoá chỉ hiện một lần; lưu băm (R-TEN-4, R-TEN-8).

### 2. Mỗi blog một dòng đăng ký; nối vào tenant bằng **mã nối một lần do người của tenant đích nhập**

- Bảng `pos_installation_blogs`: `installation_id`, `blog_id` (số blog WordPress), `blog_name`, `blog_url`, `owner_tenant_id`, `tenant_id` (NULL khi chờ), `status` (`pending` · `active` · `revoked`), `link_code_hash` + `link_code_expires_at` (mã nối 8 ký tự, 24 giờ), `linked_by`, `linked_at`, `last_ping_at`, `last_ping_ms`, `bridge_version`, `queue_groups`, `pending_docs`.
  `UNIQUE (installation_id, blog_id)`; `UNIQUE (tenant_id) WHERE status = 'active'` — **một tenant chỉ nối một blog** (một blog = một tenant, I-1).
- Bridge đăng ký blog (`pending`) và nhận **mã nối** cho từng blog; admin cửa hàng đưa mã cho kế toán.
- Kế toán **đăng nhập tenant đích X**, nhập mã nối ở **Kết nối open-pos → Nhận cửa hàng** (quyền `pos-installation:link` trong X) → dòng thành `active`, `tenant_id = X`. Không ai gắn được cửa hàng vào sổ của tenant mà mình không có quyền. Thao tác này viết qua một hàm CSDL kiểm mã nối (không mở RLS cho người khác); có `writeAudit` ở cả tenant chủ và tenant đích (R-TEN-5).
- Tenant chủ cũng nhận được cửa hàng vào chính nó bằng cùng cách (vd cửa hàng đầu tiên).
- **Không tự tạo tenant.** Tạo sổ mới theo đường hiện có (thiết lập đơn vị / Site Manager ADR-0036).

### 3. Xác thực: (khoá cài đặt, blog đã nối) → đúng MỘT tenant

`resolveAuth`, nhánh `X-Api-Key` bắt đầu `okti_`:

| Yêu cầu | Kết quả |
|---|---|
| có `X-OKT-Blog: <n>`, dòng `active` | `AuthContext { tenantId: dòng.tenant_id, actor: "install:<code>:blog:<n>", kind: "apikey", permissions: theo scopes }` → RLS đặt tenant đó như khoá thường |
| có `X-OKT-Blog`, dòng `pending` | `403 BLOG_NOT_LINKED` (bridge xếp hàng, không mất đơn — R-OKT-CONN-11) |
| có `X-OKT-Blog`, dòng `revoked` / không có | `403 BLOG_NOT_LINKED` / `404 BLOG_UNKNOWN` |
| **không** có `X-OKT-Blog` | chỉ được gọi các route **của bản cài** (§4), chạy trong `owner_tenant_id` |
| khoá thu hồi | `401` |

**R-TEN-1 giữ nguyên:** đầu vào là **số blog**, không phải `tenantId`; tenant chỉ tra từ dòng đã được người của tenant đó nối. **R-TEN-4 sửa** thành: *"Khoá API gắn một đơn vị. Ngoại lệ duy nhất: khoá cài đặt open-pos (ADR-0037) — mỗi yêu cầu vẫn chạy trong đúng một tenant, chọn bằng (khoá cài đặt, blog) đã được người có quyền ở tenant đó nối."*

### 4. API của bản cài (không mang `X-OKT-Blog`, chạy trong tenant chủ)

| Route | Việc |
|---|---|
| `POST /api/v1/pos-installation/blogs` | đăng ký / cập nhật danh sách blog (`blogId`, `name`, `url`); trả trạng thái + mã nối cho blog `pending` |
| `GET /api/v1/pos-installation/blogs` | trạng thái từng blog (đã nối, tenant code, lần ping) |
| `POST /api/v1/pos-installation/ping` | một lượt cho cả bản cài: từng blog `bridgeVersion`, `queueGroups`, `pendingDocs`, `latencyMs` |
| `POST /api/v1/connection/ping` | khoá API thường (bizcity / một cửa hàng): ping của blog đó |

Gắn qua `apps/api/src/modules/connections/connection.routes.ts` (module "Kết nối hệ thống khác" đã có trong `phan-he/loi.ts`) — không đụng `app.ts`.

### 5. Màn "Hệ thống → Kết nối open-pos" (K-6)

Tenant chủ: danh sách bản cài, cửa hàng ↔ tenant, trạng thái, ping cuối (vàng khi trễ > 15 phút), tạo / thu hồi khoá. Mọi tenant: cửa hàng đã nối vào mình + ô **Nhận cửa hàng** (mã nối). Làm ở đợt sau (OKT-SET-3), sau khi NT-HT-003 trả `useAppMenu.ts`.

### 6. Quan hệ với ADR-0036 và P-0 ý 3

- Bảng của bản cài nằm trong database của **site** (ADR-0036); một bản cài thuộc một site; cách tìm site theo yêu cầu giữ nguyên.
- **P-0 ý 3** ("mỗi book là một pháp nhân, không có pháp nhân theo tenant id"): khoá cài đặt chỉ chọn **tenant kỹ thuật** để ghi; không đặt tên, không suy pháp nhân. Việc chuyển hồ sơ kế toán (`accounting_profiles`) sang khoá theo sổ là việc riêng (OKT-P0-3).

## Thi hành (OKT-SET-1): chỗ khác với bản đề xuất
<!-- [2026-11-23 10:55 AM Johnny Chu - Chu Hoàng Anh] OKT-SET-1 — ghi chỗ thi hành lệch đề xuất, chờ chủ dự án duyệt cùng PR code -->

| Đề xuất | Thi hành | Vì sao |
|---|---|---|
| Quyền mới `pos-installation:manage`, `pos-installation:link` | Dùng quyền có sẵn **`settings:write`**, chỉ người dùng đăng nhập (khoá API bị từ chối) | Thêm quyền Core phải sửa danh mục quyền (`authz/catalog.ts`), bảng vai trò và web — ngoài phạm vi đợt; tạo khoá / nhận cửa hàng là việc cài đặt của quản trị. Tách quyền riêng khi làm màn K-6 nếu cần |
| `pos_installations.owner_tenant_id` | Cột tên **`tenant_id`** (= tenant chủ) | Bảng nghiệp vụ phải có `tenant_id` (SC-DATA-5). `pos_installation_blogs` giữ `owner_tenant_id` + `tenant_id` (tenant đã nối) |
| Audit ở cả tenant chủ và tenant đích | Hàm `pos_installation_link()` ghi `audit_logs` ở **tenant đích** (mang `owner_tenant_id`, mã bản cài trong `after_data`); tạo / thu hồi khoá có biên nhận action ở tenant chủ | Hàm chạy với `bizcity.tenant_id` = tenant đích; ghi sang tenant chủ phải mở RLS chéo |
| Blog lạ → `404 BLOG_UNKNOWN` | **`403 FORBIDDEN`**, `details.reason` = `BLOG_UNKNOWN` / `BLOG_NOT_LINKED` / `BLOG_REQUIRED` | Một mã lỗi cho bridge xử lý, không lộ có hay không. Thêm 5 reason vào `ERROR_REASONS` (BIZCITY-ERRORS 1.23.0-draft §4c) |
| Route người dùng chưa đặt tên | `GET` / `POST /api/v1/pos-installations`, `POST …/:code/revoke`, `POST …/link` (số nhiều); route bridge `/api/v1/pos-installation/*` (số ít) | Khoá cài đặt không mang blog chỉ gọi danh sách đóng `INSTALLATION_ROUTES` (`auth.ts`) |
| — | Tenant đích **đọc** được dòng bản cài đã nối vào mình (policy `linked_tenant_read`, chỉ SELECT) | Hiện tên / mã bản cài ở màn của tenant đích; ghi vẫn chỉ tenant chủ. `key_hash` là băm của khoá ngẫu nhiên 192 bit |
| Mã nối 8 ký tự | Bảng chữ Crockford (bỏ I, L, O, U), nhập không phân biệt hoa thường, bỏ qua `-` / khoảng trắng | Đọc qua điện thoại không nhầm |

Tài liệu API: [docs/api/pos-installation.md](../api/pos-installation.md).

## Phương án đã loại

| Phương án | Vì sao loại |
|---|---|
| Khoá cài đặt kèm header `X-Tenant` | nhận tenant từ đầu vào — phá R-TEN-1 |
| Bridge tự tạo tenant khi đăng ký blog | sinh sổ rác; tạo đơn vị không phải việc của bên tích hợp |
| Người ở tenant chủ nối blog vào tenant khác | người dùng thuộc một tenant (`users.tenant_id`); nối sang sổ mình không có quyền là lỗ hổng |
| Một tenant cho cả chuỗi, blog = chi nhánh | chủ đã chọn (a): mỗi cửa hàng một sổ |

## Hệ quả

- Thêm 2 bảng (migration `0180`), 2 quyền (`pos-installation:manage`, `pos-installation:link`), 1 nhánh trong `resolveAuth`, 4 route. Khoá API thường không đổi.
- Test: khoá cài đặt + blog đã nối chỉ thấy dữ liệu tenant đó; blog chờ → 403; nối bằng mã sai / hết hạn / ở tenant không có quyền → từ chối; một tenant không nối hai blog; thu hồi khoá → 401 ngay.
