# Chạy nhiều site trên một bản cài (SITE_MODE=multi)
<!-- [2026-11-22 12:37 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B2a: sổ tay vận hành chế độ nhiều site — SITE_MODE, CONTROL_DATABASE_URL, thêm site bằng tay, kiểm sống -->

> **Kiến trúc:** [ADR-0036](../adr/ADR-0036-mot-ban-ma-moi-site-mot-database.md), luật [R-SITE](../rules/RULE-SITE.md), [PHASE-039](../phases/PHASE-039-NHIEU-CSDL-SITE-REGISTRY/README.md).
> **Trạng thái (2026-11-22):** có mã tới B2a. **Chưa dùng cho bản cài thật**: việc nền (dispatcher sự kiện, đồng hồ) chưa chạy theo site (B2c), vé đăng nhập chưa gắn site (B2b), chưa có vai trò PostgreSQL riêng từng site (B4).

## 1. Biến môi trường

| Biến | Mặc định | Nghĩa |
|---|---|---|
| `SITE_MODE` | `single` | `single`: bản cài một công ty, một database (`DATABASE_URL`), như trước PHASE-039. `multi`: nhiều site, mỗi site một database, nhận site theo tên miền của yêu cầu |
| `CONTROL_DATABASE_URL` | — | Database điều khiển giữ Site Registry (bảng `sites`, `site_domains`). **Bắt buộc** khi `SITE_MODE=multi`; thiếu thì API không khởi động |

`DATABASE_URL` vẫn cần ở chế độ `multi`: đó là site ngầm định, dùng cho kiểm sống / sẵn sàng / số đo, và (tới B4) cung cấp tên đăng nhập + mật khẩu để mở kết nối tới database của các site.

## 2. Database điều khiển

- Migration riêng ở `db/control-migrations/`, không lẫn `db/migrations/` của site. API tự áp khi nhận yêu cầu đầu tiên (khoá tư vấn `727039`, chạy lại không hại), ghi vào bảng `control_migrations`.
- Không chứa dữ liệu kế toán. Sao lưu cùng lịch với các site.

## 3. Thêm một site bằng tay (tới khi có lệnh `bizcity site create` ở B4)

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
