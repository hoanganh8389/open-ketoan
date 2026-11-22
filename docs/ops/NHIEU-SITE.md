# Chạy nhiều site trên một bản cài (SITE_MODE=multi)
<!-- [2026-11-22 12:37 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B2a: sổ tay vận hành chế độ nhiều site — SITE_MODE, CONTROL_DATABASE_URL, thêm site bằng tay, kiểm sống -->

> **Kiến trúc:** [ADR-0036](../adr/ADR-0036-mot-ban-ma-moi-site-mot-database.md), luật [R-SITE](../rules/RULE-SITE.md), [PHASE-039](../phases/PHASE-039-NHIEU-CSDL-SITE-REGISTRY/README.md).
<!-- [2026-11-22 10:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B4a: Site Provisioner, biến SITE_TEMPLATE_DB, SITE_SECRET_KEY, PROVISION_DATABASE_URL, SITE_APP_PARENT_ROLE -->
> **Trạng thái (2026-11-22):** có mã tới B4a (Site Provisioner). **Chưa dùng cho bản cài thật**: việc nền (dispatcher sự kiện, đồng hồ) chưa chạy theo site (B2c); migration theo site và vai trò sở hữu riêng chưa có (B3). Đã có: nhận site theo tên miền (B2a), vé gắn site (B2b), bộ đệm có mã site (B2d), vai trò ứng dụng riêng từng site (B4a).

## 1. Biến môi trường

| Biến | Mặc định | Nghĩa |
|---|---|---|
| `SITE_MODE` | `single` | `single`: bản cài một công ty, một database (`DATABASE_URL`), như trước PHASE-039. `multi`: nhiều site, mỗi site một database, nhận site theo tên miền của yêu cầu |
| `CONTROL_DATABASE_URL` | — | Database điều khiển giữ Site Registry (bảng `sites`, `site_domains`). **Bắt buộc** khi `SITE_MODE=multi`; thiếu thì API không khởi động |
| `SITE_TEMPLATE_DB` | `kt_template` | Database mẫu đã chạy đủ migration; site mới tạo bằng `CREATE DATABASE … TEMPLATE`. Không để phiên nào kết nối vào nó |
| `SITE_SECRET_KEY` | — | Khoá (≥ 32 ký tự) mã hoá mật khẩu vai trò của từng site trong registry. Thiếu thì không tạo site được và không mở được kết nối tới site có vai trò riêng. **Mất khoá = mất mật khẩu của mọi site**: sao lưu khoá riêng, ngoài database |
| `PROVISION_DATABASE_URL` | `DATABASE_URL` | Kết nối có quyền `CREATEDB` + `CREATEROLE` để tạo database và vai trò của site |
| `SITE_APP_PARENT_ROLE` | `ketoan_app` | Vai trò cha: vai trò ứng dụng của mỗi site là thành viên của nó, nên thừa hưởng quyền trên bảng mà migration cấp |

`DATABASE_URL` vẫn cần ở chế độ `multi`: đó là site ngầm định, dùng cho kiểm sống / sẵn sàng / số đo. Site tạo bằng Site Provisioner kết nối bằng vai trò riêng; site ghi tay (§3b) chưa có vai trò riêng thì dùng tên đăng nhập + mật khẩu của `DATABASE_URL`.

## 2. Database điều khiển

- Migration riêng ở `db/control-migrations/`, không lẫn `db/migrations/` của site. API tự áp khi nhận yêu cầu đầu tiên (khoá tư vấn `727039`, chạy lại không hại), ghi vào bảng `control_migrations`.
- Không chứa dữ liệu kế toán. Sao lưu cùng lịch với các site.

## 3. Tạo site bằng Site Provisioner (B4a)

Chuẩn bị một lần: tạo database `SITE_TEMPLATE_DB` rồi chạy `npm run db:migrate` với `DATABASE_URL` trỏ tới nó. Sau mỗi lần nâng cấp phải nâng mẫu trước (R-SITE-8).

`createSite({ slug, domain, displayName, ownerEmail })` (`packages/platform/src/db/site-provisioner.ts`) làm: ghi registry → tạo vai trò `kt_<slug>_app` (thành viên `SITE_APP_PARENT_ROLE`, mật khẩu ngẫu nhiên) → `CREATE DATABASE kt_<slug> TEMPLATE …` → thu `CONNECT` khỏi `PUBLIC`, chỉ cấp cho vai trò của site → mã hoá mật khẩu vào registry → `active`. Hỏng ở bước nào thì dọn ngược hết. Lệnh CLI `bizcity site create` và tài khoản chủ site: B4b.

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
