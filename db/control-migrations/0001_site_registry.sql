-- [2026-11-22 12:37 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B2a (ADR-0036, D039-2): Site Registry trong database điều khiển — sites, site_domains
-- [2026-11-22 10:16 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B2d: chú thích cột slug bỏ mã R-SLUG-1 (luật của repo bizcity-open-setup, không định nghĩa ở đây — SC-CON-5); migration chưa phát hành
-- Database ĐIỀU KHIỂN (CONTROL_DATABASE_URL), KHÔNG phải database của một site: thư mục migration riêng, không lẫn db/migrations.
-- Mật khẩu vai trò của site KHÔNG nằm ở bảng này ở B2a (thêm mã hoá ở B4, D039-19).

CREATE TABLE IF NOT EXISTS sites (
  id              text PRIMARY KEY,
  slug            text NOT NULL UNIQUE CHECK (slug ~ '^[a-z][a-z0-9-]{2,29}$' AND slug !~ '-$' AND slug !~ '--'),
  display_name    text NOT NULL DEFAULT '',
  status          text NOT NULL DEFAULT 'provisioning'
                  CHECK (status IN ('provisioning', 'active', 'suspended', 'upgrading', 'migration_failed', 'deleted')),
  db_host         text NOT NULL,
  db_port         integer NOT NULL DEFAULT 5432 CHECK (db_port BETWEEN 1 AND 65535),
  db_name         text NOT NULL UNIQUE CHECK (db_name ~ '^[a-z_][a-z0-9_]{0,62}$'),
  schema_version  text,
  app_version     text,
  owner_email     text,
  external_ref    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  suspended_at    timestamptz,
  deleted_at      timestamptz
);

COMMENT ON TABLE sites IS 'Site Registry (ADR-0036): một dòng một site = một database PostgreSQL. Open Kế Toán là chủ bảng này (R-SITE-7).';
COMMENT ON COLUMN sites.id IS 'Mã site (ULID), dùng trong vé đăng nhập (claim sid) và Provisioning API';
COMMENT ON COLUMN sites.slug IS 'Tên ngắn của site (chữ thường, số, gạch nối; 3–30 ký tự); tên database dựng từ đây ở B4';
COMMENT ON COLUMN sites.status IS 'Trạng thái: provisioning, active, suspended, upgrading, migration_failed, deleted. Chỉ active được phục vụ đầy đủ';
COMMENT ON COLUMN sites.db_host IS 'Máy chủ PostgreSQL của site';
COMMENT ON COLUMN sites.db_name IS 'Tên database của site; chỉ chữ thường, số, gạch dưới';
COMMENT ON COLUMN sites.schema_version IS 'Tên migration cuối đã áp cho database của site (cổng lược đồ, R-SITE-9, làm ở B3)';

CREATE TABLE IF NOT EXISTS site_domains (
  domain      text PRIMARY KEY CHECK (domain = lower(domain) AND domain ~ '^[a-z0-9.-]{3,253}$'),
  site_id     text NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
  is_primary  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE site_domains IS 'Tên miền → site (D039-18: tên miền gốc là cấu hình động; một site có thể có nhiều tên miền)';
COMMENT ON COLUMN site_domains.domain IS 'Tên miền đầy đủ, chữ thường, không cổng';
COMMENT ON COLUMN site_domains.is_primary IS 'Tên miền chính của site (mỗi site một)';

CREATE UNIQUE INDEX IF NOT EXISTS site_domains_one_primary ON site_domains (site_id) WHERE is_primary;
CREATE INDEX IF NOT EXISTS site_domains_site ON site_domains (site_id);
