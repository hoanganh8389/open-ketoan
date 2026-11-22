# Chạy nhiều site trên một bản cài (SITE_MODE=multi)
<!-- [2026-11-22 12:37 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B2a: sổ tay vận hành chế độ nhiều site — SITE_MODE, CONTROL_DATABASE_URL, thêm site bằng tay, kiểm sống -->

> **Kiến trúc:** [ADR-0036](../adr/ADR-0036-mot-ban-ma-moi-site-mot-database.md), luật [R-SITE](../rules/RULE-SITE.md), [PHASE-039](../phases/PHASE-039-NHIEU-CSDL-SITE-REGISTRY/README.md).
<!-- [2026-11-22 10:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B4a: Site Provisioner, biến SITE_TEMPLATE_DB, SITE_SECRET_KEY, PROVISION_DATABASE_URL, SITE_APP_PARENT_ROLE -->
> **Trạng thái (2026-11-22):** có mã tới B4a (Site Provisioner). <!-- [2026-11-22 11:11 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B2c: việc nền theo site; còn thiếu B3 -->
<!-- [2026-11-22 11:19 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B3: nâng cấp theo site; còn thiếu sao lưu theo lịch / khôi phục (B6), cap-nhat.sh nhiều site (B7) -->
**Chạy được, nâng cấp bằng lệnh:** `bizcity site migrate` nâng database mẫu rồi từng site, có cổng lược đồ (B3, §6). Chưa có: sao lưu theo lịch và lệnh khôi phục (B6), `cap-nhat.sh` chế độ nhiều site (B7) — trước B7, nâng cấp làm tay theo §6. Đã có: nhận site theo tên miền (B2a), vé gắn site (B2b), việc nền theo site (B2c), bộ đệm có mã site (B2d), vai trò ứng dụng riêng từng site (B4a), tạo site có chủ site (B4b), Provisioning API (B5a).

## 1. Biến môi trường

| Biến | Mặc định | Nghĩa |
|---|---|---|
| `SITE_MODE` | `single` | `single`: bản cài một công ty, một database (`DATABASE_URL`), như trước PHASE-039. `multi`: nhiều site, mỗi site một database, nhận site theo tên miền của yêu cầu |
| `CONTROL_DATABASE_URL` | — | Database điều khiển giữ Site Registry (bảng `sites`, `site_domains`). **Bắt buộc** khi `SITE_MODE=multi`; thiếu thì API không khởi động |
| `SITE_TEMPLATE_DB` | `kt_template` | Database mẫu đã chạy đủ migration; site mới tạo bằng `CREATE DATABASE … TEMPLATE`. Không để phiên nào kết nối vào nó |
| `SITE_SECRET_KEY` | — | Khoá (≥ 32 ký tự) mã hoá mật khẩu vai trò của từng site trong registry. Thiếu thì không tạo site được và không mở được kết nối tới site có vai trò riêng. **Mất khoá = mất mật khẩu của mọi site**: sao lưu khoá riêng, ngoài database |
| `PROVISION_DATABASE_URL` | `DATABASE_URL` | Kết nối có quyền `CREATEDB` + `CREATEROLE` để tạo database và vai trò của site |
| `SITE_APP_PARENT_ROLE` | `ketoan_app` | Vai trò cha: vai trò ứng dụng của mỗi site là thành viên của nó, nên thừa hưởng quyền trên bảng mà migration cấp |
| `SITE_ADMIN_HOST` | — | Tên miền điều hành: Provisioning API `/_sites/v1` chỉ trả lời trên tên miền này (chế độ `multi`). Trống = tắt Provisioning API |

`DATABASE_URL` vẫn cần ở chế độ `multi`: đó là site ngầm định, dùng cho kiểm sống / sẵn sàng / số đo và lúc khởi động. **Không được trỏ vào `SITE_TEMPLATE_DB`** (API từ chối khởi động): kết nối giữ ở database mẫu làm `CREATE DATABASE … TEMPLATE` hỏng. Dùng một database nhỏ riêng. Việc nền không chạy trên site ngầm định ở chế độ `multi`. Site tạo bằng Site Provisioner kết nối bằng vai trò riêng; site ghi tay (§3b) chưa có vai trò riêng thì dùng tên đăng nhập + mật khẩu của `DATABASE_URL`.

## 2. Database điều khiển

- Migration riêng ở `db/control-migrations/`, không lẫn `db/migrations/` của site. API tự áp khi nhận yêu cầu đầu tiên (khoá tư vấn `727039`, chạy lại không hại), ghi vào bảng `control_migrations`.
- Không chứa dữ liệu kế toán. Sao lưu cùng lịch với các site.

## 3. Tạo site bằng Site Provisioner (B4a)

Chuẩn bị một lần: tạo database `SITE_TEMPLATE_DB`, chạy `npm run db:migrate` với `DATABASE_URL` trỏ tới nó, **rồi** `bizcity site migrate --all` <!-- [2026-11-22 11:19 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B3: db:migrate chỉ áp migration lõi; site migrate thêm migration module + registry module -->: `db:migrate` chỉ áp migration lõi; `site migrate` áp thêm migration của module (POS, phiếu bán, voucher, loyalty…) và ghi registry module vào mẫu — thiếu bước này, site tạo từ mẫu không có bảng của module. Sau mỗi lần nâng cấp, `site migrate` nâng mẫu trước (R-SITE-8).

`createSite({ slug, domain, displayName, ownerEmail })` (`packages/platform/src/db/site-provisioner.ts`) làm: ghi registry → tạo vai trò `kt_<slug>_app` (thành viên `SITE_APP_PARENT_ROLE`, mật khẩu ngẫu nhiên) → `CREATE DATABASE kt_<slug> TEMPLATE …` → thu `CONNECT` khỏi `PUBLIC`, chỉ cấp cho vai trò của site → mã hoá mật khẩu vào registry → `active`. Hỏng ở bước nào thì dọn ngược hết.

<!-- [2026-11-22 10:43 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B4b: lệnh bizcity site create / list -->
**Lệnh (B4b):**

```bash
bizcity site create --slug congtya --domain congtya.<tên miền gốc> --name "Công ty A" --email chu@congtya.vn
bizcity site list
```

`site create` tạo thêm **đơn vị đầu** (mã = slug, tên công ty) và **tài khoản chủ site** (email của khách, vai trò `owner`, mật khẩu tự sinh **in một lần ra màn hình của người chạy lệnh**, không ghi vào nhật ký), hệ thống tài khoản và danh mục gốc — bằng `seed()` của Kernel, chạy bằng kết nối quản trị tới database của site. Không tự tạo khoá API tích hợp. Thiếu `--email` thì chủ site là `admin@<tên miền>`.

Lưu ý: bản cài đặt `DB_SET_ROLE` thì kết nối quản trị cũng bị chuyển vai trò và bước khởi tạo hỏng (dọn sạch, báo `SITE_PROVISION_FAILED`) — chạy `site create` không đặt `DB_SET_ROLE`.

## 3b. Thêm một site bằng tay (site đã có database)

1. Tạo database của site và chạy migration của Open Kế Toán lên nó (như cài mới, với `DATABASE_URL` trỏ tới database đó).
2. Ghi vào database điều khiển:

```sql
INSERT INTO sites (id, slug, display_name, status, db_host, db_port, db_name)
VALUES ('01JD…', 'congtya', 'Công ty A', 'active', 'db', 5432, 'kt_congtya');
INSERT INTO site_domains (domain, site_id, is_primary) VALUES ('congtya.<tên miền gốc>', '01JD…', true);
```

3. Tối đa 30 giây sau (bộ đệm tên miền) site nhận yêu cầu. Một site có thể có nhiều tên miền, thuộc các tên miền gốc khác nhau.

Chỉ site `active` hoặc `suspended` được phục vụ. `provisioning`, `upgrading`, `migration_failed`, `deleted` trả 404 `SITE_NOT_FOUND`.

## 4. Kiểm sống và bộ cân bằng tải

`/api/v1/system/health`, `/api/v1/system/health/ready`, `/metrics` không cần tên miền của site: chạy trên site ngầm định (`DATABASE_URL`). Mọi đường dẫn khác gọi bằng tên miền lạ hoặc địa chỉ máy đều nhận **404 `SITE_NOT_FOUND`**, không truy vấn nào chạy (R-SITE-3).

Đặt proxy (Apache / nginx / Cloudflare) **giữ nguyên tên miền** (`ProxyPreserveHost On`, `proxy_set_header Host $host`): API nhận site theo tên miền của yêu cầu.

## 5. Việc nền (dispatcher sự kiện, đồng hồ)
<!-- [2026-11-22 11:11 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B2c -->

Mỗi giây dispatcher chạy lần lượt qua **mọi site `active` / `suspended`** trong registry (đọc lại registry tối đa mỗi 30 giây, nên site mới tạo được giao sự kiện trong vòng 30 giây); đồng hồ mỗi phút cũng vậy. Mỗi lượt chạy trong ngữ cảnh của site đó. Một site lỗi kết nối: ghi `bizcity.event.runtime_failed` kèm `site`, các site khác vẫn chạy. Pool của mỗi site tối đa 4 kết nối, kết nối rảnh 30 giây thì đóng. Nhiều trăm site: cân nhắc PgBouncer (Q039-3).

## 6. Nâng cấp: `bizcity site migrate`
<!-- [2026-11-22 11:19 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B3 (D039-11, D039-12, R-SITE-8..10) -->

```bash
bizcity site migrate --all                       # database mẫu, rồi mọi site
bizcity site migrate --slug congty-a,congty-b    # chỉ các site này (mẫu vẫn nâng trước)
  [--backup-dir backups/sites] [--skip-backup] [--drain-seconds 35] [--json]
```

Chạy bằng ảnh **mới** (mã mới, migration mới), trước khi chuyển ứng dụng sang ảnh mới. Lệnh dùng kết nối quản trị (`PROVISION_DATABASE_URL`, trống = `DATABASE_URL`) và cần `CONTROL_DATABASE_URL`, `SITE_SECRET_KEY`, `SITE_TEMPLATE_DB`.

1. **Sao lưu:** cần `pg_dump` cùng bản PostgreSQL trên máy chạy lệnh; thiếu thì lệnh dừng trước khi chạm gì. `--skip-backup` chỉ khi đã có bản sao lưu khác (vd PITR).
2. **Database mẫu** nâng trước (lõi + module + registry module). Mẫu lỗi: lệnh dừng, **không site nào bị chạm**.
3. Site cần nâng (lược đồ khác bản mới, hoặc đang `upgrading` / `migration_failed`) chuyển sang `upgrading`; lệnh đợi 35 giây để ứng dụng đang chạy thôi phục vụ (bộ đệm tên miền 30 giây). Site đã ở bản mới: bỏ qua ("đã mới").
4. Từng site, tuần tự: sao lưu (`<backup-dir>/<slug>-<giờ UTC>.dump`) → migration lõi → migration module → registry module. Xong: trạng thái cũ (`active` / `suspended`) + `schema_version` mới. Lỗi: `migration_failed`, câu lỗi ở `sites.migration_error`, **đi tiếp site sau**.
5. In bảng tổng kết; có site lỗi thì mã thoát 1. Sửa nguyên nhân rồi chạy lại **cùng lệnh**: site đã xong được bỏ qua, site lỗi chạy lại. Lùi một site = khôi phục bản `.dump` vừa in (không có migration lùi, R-REL-5).

**Cổng lược đồ (R-SITE-9).** Ứng dụng chỉ phục vụ site có `schema_version` đúng bằng migration lõi cuối cùng trong ảnh của nó:

| Tình huống | Trả về |
|---|---|
| site đang `upgrading` | 503 `SITE_UPGRADING` |
| site `migration_failed` | 503 `SITE_MIGRATION_FAILED` |
| ứng dụng cũ gặp site đã nâng / ứng dụng mới gặp site chưa nâng | 503 `SITE_UPGRADING` |
| `schema_version` trống (site ghi tay trước B3) | phục vụ như thường; lần `site migrate` đầu tiên ghi giá trị |

503 có `Retry-After: 60`, không route nào chạy. Việc nền (dispatcher, đồng hồ) bỏ site bị chặn, đọc lại trạng thái mỗi giây.

**Trình tự một lần nâng cấp (trước khi có `cap-nhat.sh` nhiều site, B7):** kéo mã + build ảnh mới + test → sao lưu database điều khiển (`pg_dump` của `CONTROL_DATABASE_URL`) → `bizcity site migrate --all` bằng ảnh mới → chuyển ứng dụng sang ảnh mới. Từ lúc một site được nâng tới lúc chuyển ảnh, site đó báo "đang nâng cấp" — chuyển ảnh ngay sau khi lệnh xong.
