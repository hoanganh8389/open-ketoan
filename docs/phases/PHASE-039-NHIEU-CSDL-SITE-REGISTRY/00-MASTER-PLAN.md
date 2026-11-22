# PHASE-039 · 00 — Kế hoạch & thiết kế
<!-- [2026-11-21 07:29 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — W0: sự thật đọc mã trên main 0734feef; thiết kế Site Registry, Database Router, Site Provisioner, Migration Runner, Backup Manager; quy trình cập nhật nhiều site; B1..B7 -->

## 1. Sự thật đọc mã (main `0734feef`, 2026-11-21)

| # | Sự thật | Ở đâu |
|---|---|---|
| F1 | Một pool cho cả ứng dụng: `new pg.Pool({ connectionString: env.DATABASE_URL, max: 10 })`. `db` (Kysely) là **một biến xuất ra**, mọi repository dùng nó | `packages/platform/src/db/client.ts` |
| F2 | Mỗi lần mượn kết nối, pool đặt `bizcity.tenant_id` (và chi nhánh làm việc) theo `currentRequest()` — ngữ cảnh yêu cầu bằng `AsyncLocalStorage` | `client.ts`, `packages/platform/src/core/request-context.ts` |
| F3 | Migration mở kết nối **riêng** bằng `env.DATABASE_URL`, khoá `pg_advisory_lock(727001)`, ghi `schema_migrations`. Migration của module cũng vậy | `packages/platform/src/db/migrate.ts`, `module-db.ts` |
| F4 | Tiến trình nền: hai `setInterval` (dispatcher sự kiện mỗi 1 giây, đồng hồ mỗi 60 giây) chạy trên pool chung | `packages/platform/src/core/events.ts` |
| F5 | Vé đăng nhập ký HS256, claim `tid` (đơn vị), `role`, `name`, `sv`; **không có** mã site. Vé ứng dụng cũng chỉ có `tid` | `packages/platform/src/core/security/tokens.ts`, `core/apps.ts` |
| F6 | Ngoài `client.ts`, chỉ còn **một** tệp gọi thẳng `pool.query` / `pool.connect` | `apps/api/src/db/setup.ts` |
| F7 | Sao lưu: `pg_dump` database `ketoan`, tự kiểm (`--kiem`); cập nhật: `cap-nhat.sh` sao lưu → kiểm → kéo mã → `docker compose up -d --build` (job `db-migrate` chạy trước API) | `scripts/sao-luu.sh`, `scripts/cap-nhat.sh` |
| F8 | `docker-compose.yml` ghi cứng tên database `ketoan` cho cả job migrate (vai trò chủ) và API (vai trò `ketoan_app`) | `docker-compose.yml` |
| F9 | Không có chỗ nào đọc tên miền của yêu cầu để chọn dữ liệu | tìm `hostname`, `x-forwarded-host` trong `apps/api/src`, `packages/` |

Kiểm kê chi tiết ở §1b.

### 1b. Kiểm kê B1 (S039-3, main `ccc47fae`, 2026-11-21)
<!-- [2026-11-21 10:34 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — S039-3: kiểm kê chỗ gọi thẳng pool, bộ đệm cấp tệp, script tự mở kết nối -->

**Chỗ dùng thẳng `pool` (không qua `db`):** ở B1 `pool` là pool của site ngầm định nên vẫn đúng. Từ B2 mỗi chỗ phải nhận site:

| Tệp | Dùng để | Việc ở bước |
|---|---|---|
| `packages/platform/src/db/migrate.ts`, `apps/api/src/db/migrate.ts` | chạy migration, đóng pool | B3 (`runMigrations(connectionString)`) |
| `apps/api/src/db/setup.ts` | tạo / đặt mật khẩu vai trò `ketoan_app`, `ketoan_monitor` | B4 (vai trò riêng từng site, D039-19) |
| `apps/api/src/cli/module.ts` | lệnh cài module, đóng pool | B3 (migration module theo site) |
| `apps/api/src/modules/system/metrics.routes.ts` | số đo CSDL | B7 (số đo có nhãn site) |

**Script tự mở kết nối:** `packages/platform/src/db/migrate.ts`, `module-db.ts` (`new pg.Client(env.DATABASE_URL)`, B3); `scripts/kiem-nang-cap.sh`, `scripts/mua-hang/nap-25-truong-hop.mjs` (công cụ dev, chạy trên một database — giữ nguyên).

**Bộ đệm cấp tệp (biến `Map` / `Set` toàn cục) giữ dữ liệu lấy từ database** — khoá theo `tenantId` / `userId` có thể trùng giữa hai database, phải thêm mã site ở B2 (S039-8, R-SITE-6):

| Tệp | Biến | Khoá hôm nay |
|---|---|---|
| `apps/api/src/modules/branches/branch-sites.ts` | `cache` | `tenantId` |
| `apps/api/src/modules/system/presence.ts` | `tenants`, `today` | `tenantId` |
| `packages/platform/src/core/authz/shadow.ts` | `enabledCache`, `byTenant` | `tenantId` |
| `packages/platform/src/core/module-registry.ts` | `cache` | `tenantId` |
| `packages/platform/src/core/security/role-assignments.ts` | `cache` | `userId` |
| `packages/platform/src/core/security/session-state.ts` | `cache` | `userId` |
| `packages/platform/src/core/libraries/usage.ts` | `buffer` (đệm rồi ghi xuống database) | `tenantId` + ngày + thư viện…; **lúc ghi phải về đúng site** |
| `packages/kernel/src/modules/intake/trial-posting.ts` | `hits` (giới hạn tần suất) | `tenantId:actor` |

<!-- [2026-11-22 10:16 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B2d: kết quả xử lý bộ đệm -->
**B2d (2026-11-22):** 6 / 8 bộ đệm trên đã khoá theo `siteScopedKey()` (`db/site.ts`): `branch-sites`, `presence`, `authz/shadow` (lệch gần nhất ghi thêm `siteId`), `module-registry`, `session-state`, `trial-posting`. Còn lại: `role-assignments.ts` (trong giữ chỗ NT-HT-003); `libraries/usage.ts` — từ migration 0161 không còn ghi database mà ghi nhật ký JSONL theo đơn vị (`run-log`), nên khoá trong bộ nhớ không đủ: nhật ký có site là việc của B7 (S039-19). Phép kiểm tĩnh chặn bộ đệm theo đơn vị thiếu site: chưa làm (cần đường kiểm mới ở `tests/conformance/checks/`).

**Không cần đổi:** sổ đăng ký trong mã (`registry`, `hooks`, `modulePermissions`, `documentTypes`, `collectors`, `readers`…), bộ đệm đọc tệp (`default-data.service.ts` theo đường dẫn, `libraries/context.ts` theo thư mục), giới hạn tần suất theo email / IP / người gọi (`auth.routes.ts`, `devtools.sources.ts`), tra mã số thuế qua mạng (`tra-mst.ts`).

**Giới hạn của lần kiểm kê:** chỉ quét biến `Map` / `Set` khai ở cấp tệp. Bộ đệm nằm trong lớp, trong bao đóng, hay bộ đệm dạng khác chưa quét: S039-8 thêm phép kiểm tĩnh để bắt phần còn lại.

**Việc nền:** `packages/platform/src/core/events.ts` có hai `setInterval` (dispatcher sự kiện, đồng hồ) gọi `withRequestContext` với ngữ cảnh mới không có `siteId` → dùng site ngầm định. Đúng ở B1; B2 bọc bằng `forEachSite` (S039-7).


## 2. Từ vựng

| Từ | Nghĩa | Ví dụ |
|---|---|---|
| **Site** | Một tên miền + một database. Một doanh nghiệp hoặc một chuỗi | `a.<miền>` → `kt_a` |
| **Đơn vị** (`tenant_id`) | Pháp nhân / đơn vị hạch toán **trong** một site. Giữ nguyên | chuỗi 500 cửa hàng = 1 site, 1 hoặc vài đơn vị, 500 chi nhánh |
| **Database điều khiển** | Database nhỏ của Open Kế Toán giữ Site Registry | `ketoan_control` |
| **Database mẫu** | Database trống đã chạy đủ migration, dùng làm khuôn tạo site | `kt_template` |

## 3. Bức tranh

```text
                    Host: a.<miền>                      Host: <SITE_ADMIN_HOST>
                          │                                      │  khoá prov_…
                          ▼                                      ▼
                 ┌─ Site Resolver ─┐                  ┌─ Provisioning API ─┐
                 │ Host → site     │                  │ /_sites/v1/*       │
                 └────────┬────────┘                  └─────────┬──────────┘
        xác thực (vé có sid = site)                             │
                          ▼                                     ▼
   ngữ cảnh yêu cầu { siteId, tenantId }            Site Provisioner · Migration Runner
                          ▼                          Backup Manager  (việc có trạng thái)
                 ┌─ Database Router ─┐                          │
                 │ pool theo site    │◄──── Site Registry ◄─────┘
                 └───┬─────┬─────┬───┘      (ketoan_control)
                     ▼     ▼     ▼
                  kt_a   kt_b   kt_c         kt_template
```

Mã nghiệp vụ, Accounting Kernel, Module SDK, Rulepack: **không đổi**. Chúng dùng `db` như hôm nay.

## 4. Năm thành phần

### 4.1 Site Registry

Database điều khiển `ketoan_control`, migration riêng ở `db/control-migrations/` (không lẫn với `db/migrations/` của site).

| Bảng | Cột chính |
|---|---|
| `sites` | `id` (ULID), `slug` (duy nhất), `display_name`, `status` (`provisioning` · `active` · `suspended` · `upgrading` · `migration_failed` · `deleted`), `db_host`, `db_port`, `db_name`, `db_owner_role`, `db_app_role`, `db_secrets_enc` (mật khẩu hai vai trò, mã hoá bằng `SITE_SECRET_KEY`), `schema_version`, `app_version`, `created_at`, `suspended_at`, `deleted_at`, `owner_email`, `external_ref` |
| `site_domains` | `domain` (khoá chính, chữ thường), `site_id`, `is_primary` |
| `site_jobs` | `id`, `site_id`, `kind` (`provision` · `migrate` · `backup` · `restore` · `suspend` · `resume` · `delete`), `idempotency_key` (duy nhất theo khoá gọi), `status`, `steps` (jsonb), `error_code`, `error_message`, thời điểm |
| `site_backups` | `id`, `site_id`, `file`, `bytes`, `schema_version`, `verified`, `created_at` |
| `provision_keys` | `id`, `prefix`, `key_hash`, `label`, `allowed_ips`, `revoked_at` |

<!-- [2026-11-21 08:12 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — D039-19: vai trò riêng từng site -->
Mỗi site một cặp vai trò riêng (D039-19, R-SITE-2): `kt_<slug>_owner` (sở hữu bảng, chạy migration) và `kt_<slug>_app` (API, không superuser). Mật khẩu sinh ngẫu nhiên, lưu mã hoá trong `sites.db_secrets_enc`; khoá giải mã `SITE_SECRET_KEY` chỉ ở biến môi trường của ứng dụng, không nằm trong database. `REVOKE CONNECT … FROM PUBLIC` trên mỗi database site.

### 4.2 Database Router

1. **Site Resolver** (hook `onRequest`, trước xác thực): lấy `Host` (qua `X-Forwarded-Host` chỉ khi proxy được tin), tra `site_domains` (bộ đệm 30 giây). Không thấy → 404 `SITE_NOT_FOUND`. Đặt `siteId` vào ngữ cảnh yêu cầu.
2. **Cổng trạng thái:** `suspended` → theo Q039-1 (chỉ đọc); `upgrading` / lệch `schema_version` → 503 `SITE_UPGRADING`; `migration_failed` → 503 `SITE_MIGRATION_FAILED`.
3. **Xác thực gắn site:** vé có `sid`; `sid ≠ siteId` → 401. Vé cũ không có `sid` chỉ được nhận ở `SITE_MODE=single`.
4. **Pool theo site:** `poolOf(siteId)` tạo khi cần (tối đa 4, rảnh 5 phút thì đóng, có trần tổng). Việc đặt `bizcity.tenant_id` mỗi lần mượn kết nối giữ nguyên.
5. **`db` uỷ quyền:** `db` vẫn là một giá trị xuất ra; mỗi truy vấn hỏi ngữ cảnh lấy site hiện tại. Không có site ở chế độ `multi` → ném `SITE_CONTEXT_MISSING`.
6. **Tiến trình nền:** `forEachSite(fn)` lặp các site `active`, mỗi lượt `withSiteContext(site, fn)`; lỗi của một site được ghi và bỏ qua lượt đó.

Chế độ `single`: registry trong bộ nhớ có một site `default` lấy từ `DATABASE_URL`; Site Resolver luôn trả site đó. Cùng đường mã.

### 4.3 Site Provisioner

Các bước của việc `provision` (mỗi bước ghi vào `site_jobs.steps`):

| # | Bước | Hỏng thì |
|---|---|---|
| 1 | Kiểm `slug` (`^[a-z][a-z0-9-]{2,29}$`, danh sách cấm), tên miền chưa dùng | từ chối, không tạo gì |
| 2 | Ghi `sites` (`provisioning`) + `site_domains` | xoá dòng |
| 3 | Tạo vai trò `kt_<slug>_owner`, `kt_<slug>_app` (mật khẩu ngẫu nhiên); `CREATE DATABASE kt_<slug> OWNER kt_<slug>_owner TEMPLATE kt_template`; `REVOKE CONNECT … FROM PUBLIC`; chuyển quyền sở hữu bảng sang `kt_<slug>_owner`, cấp quyền cho `kt_<slug>_app` theo khuôn của `ketoan_app` | `DROP DATABASE`, `DROP ROLE` nếu đã tạo |
| 4 | Tạo đơn vị đầu + tài khoản quản trị (email của khách, mật khẩu đặt qua liên kết một lần); nạp gói mẫu khi được yêu cầu (đường `core.setup.apply` của PHASE-036) | `DROP DATABASE` |
| 5 | Ghi `schema_version`, `app_version`; `status = active`; xoá bộ đệm registry | — |

Tên database luôn do Provisioner tự dựng từ `slug` đã kiểm; không nhận tên database từ bên ngoài.

### 4.4 Migration Runner

- `runMigrations(connectionString, log)`: tham số hoá chỗ đang đọc `env.DATABASE_URL`; chạy bằng vai trò `kt_<slug>_owner` của site. Khoá tư vấn giữ nguyên (khoá theo từng database). Migration không ghi cứng tên vai trò `ketoan` / `ketoan_app` (R-SITE-11): quyền cho vai trò ứng dụng lấy từ tham số của runner.
- `site migrate <slug>` / `site migrate --all`: với từng site → `status = upgrading` → sao lưu (bỏ qua được bằng cờ khi vừa sao lưu) → migration lõi → migration module → ghi `schema_version` → `active`. Lỗi → `migration_failed`, **dừng site đó**, đi tiếp site sau, cuối cùng in bảng tổng kết và thoát mã khác 0.
- `kt_template` được nâng trước tiên. Template lỗi → dừng cả lượt (chưa site nào bị đụng).
- `schema_version` = tên migration cuối đã áp (ví dụ `0177_…`), so với bản ứng dụng cần (tên migration cuối trong ảnh).

### 4.5 Backup Manager

- `site backup <slug>`: `pg_dump -Fc` database của site → tệp `backups/<slug>/<slug>-<thời điểm>.dump` → tự kiểm (đọc được, có `ledger_entries`, đếm bảng) → ghi `site_backups`.
- Lịch hằng đêm: lặp registry, mỗi site một tệp, giữ theo chính sách (mặc định 14 bản ngày).
- `site restore <slug> --backup <id>`: khôi phục vào `kt_<slug>_khoiphuc_<thời điểm>` → kiểm đối chiếu sổ → khoá site → đổi tên hai database → mở site. Database cũ giữ 7 ngày.
- PITR (PHASE-008) là mức cả cụm: lấy lại một site ở một thời điểm = dựng cụm tạm, `pg_dump` site đó, rồi `site restore`. Ghi thành sổ tay ở B6.

## 5. Bảo mật

| Điểm | Cách giữ |
|---|---|
| Vé của site A dùng ở site B | claim `sid` + so với site của tên miền (D039-5) |
| Khoá bản quyền `biz-…` | không phải cửa xác thực; chỉ dùng để hiện cảnh báo. Giá trị khoá lưu dạng băm, không ghi vào nhật ký (D039-17) <!-- [2026-11-21 07:46 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — D039-17 viết lại --> |
| Rơi về database mặc định | cấm ở chế độ `multi` (D039-6) |
| Provisioning API bị gọi từ ngoài | chỉ trả lời trên `SITE_ADMIN_HOST`, khoá `prov_…` băm, danh sách IP, giới hạn tần suất |
| Lộ mật khẩu một site | vai trò riêng từng site, không `CONNECT` chéo; mật khẩu mã hoá bằng khoá ngoài database (D039-19) |
| Chèn tên database | tên dựng từ `slug` đã kiểm; dùng định danh có trích dẫn, không ghép chuỗi tự do |
| Bộ đệm trong bộ nhớ lẫn giữa hai site | khoá bộ đệm thêm `siteId` (S039-3 kiểm kê, phép kiểm tĩnh mới) |
| Nhật ký, số đo | thêm trường `site`; nhãn `site` trên số đo có trần số nhãn |
| Xoá nhầm | xoá mềm, cần khoá + sao lưu mới (D039-15) |

## 6. Quy trình cập nhật nhiều site

```text
GitHub: open-ketoan
        ↓
Kéo mã · build ảnh mới · chạy test          (ứng dụng cũ vẫn phục vụ)
        ↓
Sao lưu database điều khiển + từng site
        ↓
Migration: kt_template → từng site          (site đã nâng tạm báo "đang nâng cấp")
        ↓
Chuyển ứng dụng sang ảnh mới                (mọi site đã nâng mở lại)
        ↓
Tất cả site dùng chung mã mới
```

Cổng lược đồ (D039-11) làm quy trình này an toàn mà không cần luật riêng:

- Ứng dụng **cũ** chỉ phục vụ site ở lược đồ cũ. Site vừa nâng xong sẽ báo `SITE_UPGRADING` cho tới khi chuyển ảnh.
- Ứng dụng **mới** chỉ phục vụ site ở lược đồ mới. Site nâng lỗi báo `SITE_MIGRATION_FAILED`, các site khác không bị ảnh hưởng.
- Thời gian gián đoạn của mỗi site = từ lúc nó được nâng tới lúc chuyển ảnh. `cap-nhat.sh` nâng xong hết rồi chuyển ngay.
- Lùi: site lỗi khôi phục từ bản sao lưu vừa tạo; lùi cả cụm = ảnh cũ + khôi phục các site đã nâng (script in đúng lệnh, như hôm nay).

`cap-nhat.sh` ở chế độ `single` chạy như hôm nay.

## 7. Cái không làm ở phase này

- Chia một site ra nhiều database, hay gộp nhiều site vào một.
- Đặt site ở nhiều máy chủ PostgreSQL (registry đã có `db_host` để sau này làm được).
- Nâng cấp không gián đoạn (mở rộng / thu hẹp lược đồ). Để sau khi có số đo thật.
- Giao diện quản lý site: thuộc Site Manager (repo `bizcity-open-setup`).

## 8. Bước thắng nhỏ

| Bước | Việc | Người dùng thấy gì | Mức |
|---|---|---|---|
| **B1** | Thêm `siteId` vào ngữ cảnh yêu cầu; `db` đi qua `poolOf(site)`; chế độ `single` với site `default`. Kiểm kê F6, bộ đệm, script (S039-3) | Không gì đổi; toàn bộ test hiện có xanh | K3 |

<!-- [2026-11-21 10:34 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — chữ chốt B1 -->
**Chữ chốt B1 (đã làm):** tệp mới `packages/platform/src/db/site.ts` — `DEFAULT_SITE_ID`, `registerSitePool`, `listSiteIds`, `currentSiteId`, `poolOf` (site lạ → `SiteRoutingError` `SITE_NOT_FOUND`, không rơi về site khác), `withSite`, `forEachSite` (có `onError` thì lỗi một site không chặn site sau), `endAllSitePools`. `db/client.ts`: `pool` đăng ký làm site ngầm định; `tenantPool.connect()` lấy `poolOf()` của site đang chạy; `end` đóng mọi pool site. `RequestContext.siteId` (chưa ai gắn ở B1). Chưa có biến `SITE_MODE`: thêm cùng B2 khi có chế độ nhiều site, để không có công tắc chưa làm gì. Ca: `apps/api/test/site-context.test.ts` (6 ca).
| **B2** | Database điều khiển + Site Registry; Site Resolver theo `Host`; `sid` trong vé; tiến trình nền `forEachSite`; `SITE_MODE=multi` | Hai tên miền trên một bản chạy ra hai sổ khác nhau | K3 |

<!-- [2026-11-22 12:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — chữ chốt B2a; tách B2 thành B2a..B2d -->
**B2 tách bốn PR (small win):** **B2a** registry + nhận site theo tên miền (S039-5) · **B2b** `sid` trong vé (S039-6) · **B2c** việc nền `forEachSite` + trần pool (S039-7) · **B2d** bộ đệm có mã site + phép kiểm tĩnh (S039-8). `SITE_MODE=multi` chỉ dùng cho bản cài thật khi xong B2c.

<!-- [2026-11-22 11:11 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — chữ chốt B2c -->
<!-- [2026-11-22 11:19 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — chữ chốt B3 -->
<!-- [2026-11-22 11:43 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — chữ chốt B3b -->
<!-- [2026-11-22 12:35 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — chữ chốt B6a -->
<!-- [2026-11-22 01:18 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — chữ chốt B6b -->
<!-- [2026-11-22 01:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — chữ chốt B5b -->
**Chữ chốt B5b (đã làm):** `provisioning.service.ts`: một trình chạy việc `startJob` / `runJob` cho tạo site + `startSiteJob` (khoá / mở / sao lưu / khôi phục / xoá mềm) — Idempotency-Key băm (loại + site + thân), một site một việc vòng đời cùng lúc (`409 SITE_BUSY`), việc kẹt > 2 giờ → `JOB_INTERRUPTED` (thay cho "quét việc kẹt khi khởi động": không hẹn giờ, SC-EVT-1); xoá mềm báo ngay `SITE_NOT_SUSPENDED` / `SITE_BACKUP_REQUIRED`. Tên miền `addSiteDomain` / `removeSiteDomain` (`site-lifecycle.ts`). `Site` có trường sức khoẻ + `attention`; `GET /sites/{id}` thử kết nối database thật; `?attention=1`; `/health` thêm `appVersion`, `requiredSchema`, đếm dấu. `SITE_BACKUP_DIR`. 7 dòng `route-giu.json` lớp `giao-thuc`. Chủ dự án 2026-11-22: **chưa làm giao diện quản lý site**, phía WordPress gọi API. **Còn:** `biz-…` (S039-14), phân trang con trỏ, chuyển hợp đồng sang `docs/contracts/`.

**Chữ chốt B6b (đã làm):** `site-lifecycle.ts` (mới): `suspendSite` / `resumeSite` (gọi lại không hại), `deleteSite` (đang khoá + bản sao lưu đã kiểm ≤ 24 giờ → thu CONNECT, đổi tên `_xoa_`, gỡ pool), `undeleteSite`, `sweepSites` (`_cu_` > 7 ngày, `_kp_` > 1 ngày, xoá mềm > 30 ngày; `dryRun`; chỉ tên dựng từ `db_name` trong registry). Migration điều khiển 0006 (`suspend_reason`, `deleted_db`, `purged_at`). Khoá = chỉ đọc **ở tầng HTTP** (Q039-1): `resolveSiteByHost` trả `readOnly`, `request-context` trả 423 `SITE_SUSPENDED` cho yêu cầu ghi trừ đăng nhập / đổi mật khẩu / `…/preview` — không đặt database chỉ đọc vì đăng nhập ghi phiên. CLI `site suspend / resume / delete --yes / undelete / sweep`. Sổ tay §9. **Còn:** `site adopt` (Q039-4), lệnh vòng đời qua Provisioning API (B5b).

**Chữ chốt B6a (đã làm):** `site-backup.ts` (mới): `PgTools` (pg_dump / pg_restore, thay được cho ca kiểm), `backupSite` (dump → `inspectBackup` qua `pg_restore --list` → `site_backups`, `keep`), `importBackup`, `listBackups`, `restoreSite` (database tạm từ template0 → đối chiếu → chặn site → ngắt kết nối + đổi tên, thử lại khi 55006 → trả trạng thái; hỏng trước khi đổi tên thì xoá database tạm, site như cũ). Migration điều khiển 0005 (`site_backups`; `sites.restored_at`, `restored_from`, `previous_db`). `site-migrate.ts` sao lưu qua `backupSite` (lý do `migrate`). `site-registry.ts` `ensurePool`: bắt `error` của pool — **lỗi có sẵn**: kết nối rảnh bị ngắt (khôi phục, `pg_terminate_backend`) làm sập tiến trình API; thử bỏ trình bắt thì ca kiểm báo `terminating connection due to administrator command` không ai bắt. CLI `site backup / backups / backup-import / restore`. Sổ tay §8 (lịch đêm, khôi phục, PITR một site). R-SITE-2, ADR-0036 §3 sửa theo D039-20. **B6b:** khoá site chỉ đọc (Q039-1), xoá mềm (D039-15), dọn `_cu_` sau 7 ngày.

**Chữ chốt B3b (đã làm):** `docker/api.Dockerfile` tầng chạy: `apk add postgresql16-client` (`pg_dump` cho `site migrate`), `COPY db/control-migrations` — **lỗi từ B2a**: ảnh thiếu thư mục này nên `SITE_MODE=multi` trong Docker hỏng ở lần đọc registry đầu; test chạy từ mã nguồn không thấy. Sổ tay `NHIEU-SITE.md` §7: lệnh `site` chạy bằng dịch vụ `db-migrate` (`--entrypoint node … dist/cli/site.js`), gắn thư mục sao lưu. D039-20: hoãn `kt_<slug>_owner` (README).

**Chữ chốt B3 (đã làm):** `migrate.ts`: `runMigrations(log, { connectionString, dir })`, `requiredSchemaVersion(dir)` (migration lõi cuối cùng), `appliedSchemaVersion(client)`; `module-db.ts`: `runModuleMigrations(…, { connectionString })`. `site-migrate.ts` (mới): `migrateSites()` — kiểm sao lưu (`pg_dump`) trước, mẫu trước (lỗi → dừng hẳn), đánh dấu `upgrading` + nhớ `resume_status`, đợi 35 giây, từng site sao lưu → lõi → module (`extra` do lớp gọi truyền) → kiểm lược đồ; lỗi → `migration_failed` + `migration_error`, đi tiếp. Migration điều khiển 0004 (`resume_status`, `migrated_at`, `migration_error`). `site-registry.ts`: `siteGate()`, `resolveSiteByHost()` (site / mã cổng / null), `gatedSiteIds()` (mỗi giây); `request-context.ts`: 503 + `Retry-After`; `events.ts` `eachSite` bỏ site bị chặn. `site-provisioner.ts`: site mới ghi `schema_version` của mẫu; `adminUrlFor()`, `provisionerConfig()`. CLI `bizcity site migrate` (migration module SDK + `syncBundled` trên pool tạm `prov:migrate:…`). **Phát hiện:** mẫu dựng bằng `db:migrate` thiếu migration module và registry module — site tạo trước B3 không có bảng module; `site migrate --all` bù. **B3b:** vai trò sở hữu riêng `kt_<slug>_owner` (database và bảng hiện thuộc vai trò quản trị).

**Chữ chốt B2c (đã làm):** `events.ts`: `eachSite` / `dispatchAllSites` — chế độ multi gọi `registerActiveSitePools()` (registry, tối đa mỗi 30 giây) rồi `forEachSite`; `startEventRuntime` chạy dispatcher + đồng hồ qua đó, lỗi một site ghi log kèm `site` (R-SITE-10); hai chỗ `withRequestContext` của lần giao sự kiện giữ `siteId`. `site.ts`: `backgroundSiteIds()` bỏ pool tạm `prov:…` và (multi) site ngầm định. `site-registry.ts`: pool site `idleTimeoutMillis` 30 giây. `env.ts`: multi cấm `DATABASE_URL` trùng `SITE_TEMPLATE_DB`. `main.ts`: `buildApp()` chạy trong ngữ cảnh site ngầm định. Khởi động thật ở multi: kiểm sống 200, tên miền lạ `SITE_NOT_FOUND`, 0 lỗi `SITE_CONTEXT_MISSING` sau 8 giây dispatcher chạy.

**Chữ chốt B2a (đã làm):** `env.ts` thêm `SITE_MODE` (`single` mặc định) và `CONTROL_DATABASE_URL` (bắt buộc khi `multi`). `db/control-migrations/0001_site_registry.sql`: `sites` (slug theo khuôn `^[a-z][a-z0-9-]{2,29}$`, trạng thái, máy chủ / cổng / tên database), `site_domains` (tên miền → site, một tên miền chính). `site-registry.ts`: tự áp migration điều khiển (khoá tư vấn 727039), `resolveSiteIdByHost` (chuẩn hoá tên miền, bộ đệm 30 giây, chỉ phục vụ `active` / `suspended`, mở pool tối đa 4 kết nối khi site được nhận lần đầu; đăng nhập bằng thông tin của `DATABASE_URL` tới B4). `site.ts`: `siteMode()`; chế độ multi thiếu site → `SITE_CONTEXT_MISSING`. Hook ngữ cảnh yêu cầu: multi → nhận site theo `req.host` trước mọi hook khác; tên miền lạ → 404 `SITE_NOT_FOUND`; `/api/v1/system/health`, `/health/ready`, `/metrics` chạy trên site ngầm định. Không sửa `app.ts`, `events.ts`, `migrate.ts` (đang trong giữ chỗ của phiên khác).
| **B3** | `runMigrations(connectionString)`; `site migrate`; cổng lược đồ (`SITE_UPGRADING`) | Nâng cấp từng site, site lỗi không kéo site khác | K3 |
| **B4** | Site Provisioner + `kt_template`; CLI `bizcity site create / list / migrate / suspend / resume / drop / adopt` | Một lệnh có site mới trong vài giây | K2 |

<!-- [2026-11-22 10:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — chữ chốt B4a -->
**Chữ chốt B4a (đã làm):** `site-provisioner.ts` `createSite()` theo §4.3 bước 1–3, 5; vai trò ứng dụng `kt_<slug>_app` là **thành viên** `SITE_APP_PARENT_ROLE` (`ketoan_app`): 47 migration cấp quyền thẳng cho `ketoan_app` nên thừa hưởng là cách không phải sửa migration; `CONNECT` thu khỏi `PUBLIC` và vai trò cha, chỉ cấp cho vai trò của site. Mật khẩu mã hoá AES-256-GCM (`SITE_SECRET_KEY`) ở `sites.db_secrets_enc` (migration điều khiển 0002); registry mở kết nối bằng vai trò của site. Database vẫn thuộc vai trò quản trị: vai trò sở hữu riêng `kt_<slug>_owner` (D039-19) làm cùng B3, vì cần chạy migration theo site. **B4b:** đơn vị đầu + tài khoản chủ site, CLI `bizcity site`.

<!-- [2026-11-22 10:43 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — chữ chốt B4b -->
**Chữ chốt B4b (đã làm):** `createSite(input, initialize?)` — bước 4b chạy hàm khởi tạo của lớp gọi trong ngữ cảnh site tạm `prov:<siteId>` (pool quản trị tới database mới, gỡ ngay sau đó; `unregisterSitePool` ở `site.ts`); Platform không gọi Kernel. `apps/api/src/db/site-create.ts` (lớp `apps/api`, cùng `db/setup.ts`; lớp `cli` không được gọi Kernel): `createSiteWithOwner` truyền `seed({ tenantCode: slug, tenantName, adminEmail, adminPassword, quiet: true, apiKey: false })`; `site list`. `seed()` thêm `quiet` (không in mật khẩu / khoá) và `apiKey: false` (không tự tạo khoá API) — bản cài một công ty không đổi. `bizcity site create / list` gọi thẳng `tsx` (không sửa `apps/api/package.json`, đang trong giữ chỗ MH22). Còn của S039-12: `suspend / resume / drop / adopt`.
| **B5** | Provisioning API `/_sites/v1` + khoá `prov_…` + `Idempotency-Key`; gắn khoá bản quyền `biz-…` cho site, dải đỏ cảnh báo khi hết hạn (D039-17) | Site Manager (Frappe) tạo được site; site hết hạn vẫn dùng được, có dải đỏ | K2 |

<!-- [2026-11-22 10:56 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — chữ chốt B5a -->
**Chữ chốt B5a (đã làm):** `apps/api/src/modules/sites/` — `provisioning.routes.ts` (5 đường, `public: true` + cổng riêng: `SITE_MODE=multi`, tên miền = `SITE_ADMIN_HOST`, khoá `prov_…`), `provisioning.service.ts` (khoá băm SHA-256 + IP cho phép; `site_jobs` khoá duy nhất (khoá gọi, Idempotency-Key), cùng thân → việc cũ, thân khác → 422; tạo site chạy nền trong tiến trình API qua `createSiteWithOwner`; mật khẩu chủ site mã hoá, trả một lần). Migration điều khiển 0003 (`provision_keys`, `site_jobs`). Hook ngữ cảnh: `/_sites/` không gắn site. Route vào `CORE_ROUTES` (`phan-he/loi.ts`), không sửa `app.ts`; một dòng lớp `giao-thuc` ở `route-giu.json`. Lệnh `bizcity site key-create`. **B5b:** khoá / mở / xoá mềm / tên miền / bản quyền `biz-…`, quét việc kẹt `running` khi khởi động, chuyển hợp đồng sang `docs/contracts/`.
| **B6** | Backup Manager theo site; lịch đêm; khôi phục thử; sổ tay | Khôi phục một khách không đụng khách khác | K2 |
| **B7** | `cap-nhat.sh` nhiều site; số đo / nhật ký có `site`; nghiệm thu T039-* | Cập nhật một lần, mọi site dùng mã mới | K2 |

B1 làm trước và đứng riêng: nó là thay đổi nền, và vì hành vi không đổi nên toàn bộ bộ test hiện có là lưới an toàn.
