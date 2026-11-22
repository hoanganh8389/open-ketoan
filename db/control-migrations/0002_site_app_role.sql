-- [2026-11-22 10:26 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B4a (D039-19, R-SITE-2): vai trò ứng dụng riêng từng site, mật khẩu mã hoá
-- Mật khẩu KHÔNG lưu dạng đọc được: mã hoá AES-256-GCM bằng SITE_SECRET_KEY (biến môi trường, không nằm trong database).

ALTER TABLE sites ADD COLUMN IF NOT EXISTS db_app_role text CHECK (db_app_role IS NULL OR db_app_role ~ '^[a-z_][a-z0-9_]{0,62}$');
ALTER TABLE sites ADD COLUMN IF NOT EXISTS db_secrets_enc text;

COMMENT ON COLUMN sites.db_app_role IS 'Vai trò PostgreSQL mà API dùng để kết nối database của site (kt_<slug>_app); chỉ có CONNECT vào database của site này';
COMMENT ON COLUMN sites.db_secrets_enc IS 'Mật khẩu vai trò của site, mã hoá AES-256-GCM bằng SITE_SECRET_KEY (dạng v1:<base64>); trống = dùng thông tin đăng nhập của DATABASE_URL';
