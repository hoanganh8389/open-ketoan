-- [2026-11-22 10:48 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B5a (D039-10, D039-14): Provisioning API — khoá prov_… (lưu băm) và việc có trạng thái + Idempotency-Key

CREATE TABLE IF NOT EXISTS provision_keys (
  id          text PRIMARY KEY,
  prefix      text NOT NULL,
  key_hash    text NOT NULL UNIQUE,
  label       text NOT NULL DEFAULT '',
  allowed_ips text[] NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz
);

COMMENT ON TABLE provision_keys IS 'Khoá gọi Provisioning API /_sites/v1 (máy chủ gọi máy chủ, vd Site Manager Frappe). Chỉ lưu băm SHA-256; khoá hiện một lần lúc tạo';
COMMENT ON COLUMN provision_keys.prefix IS 'Đầu khoá (prov_xxxxxx) để nhận ra khoá trên màn quản trị, không đủ để dùng';
COMMENT ON COLUMN provision_keys.key_hash IS 'SHA-256 của khoá, dạng hex';
COMMENT ON COLUMN provision_keys.allowed_ips IS 'IP được gọi bằng khoá này; rỗng = không giới hạn IP';
COMMENT ON COLUMN provision_keys.revoked_at IS 'Thời điểm thu hồi; có giá trị = khoá không dùng được';

CREATE TABLE IF NOT EXISTS site_jobs (
  id               text PRIMARY KEY,
  key_id           text NOT NULL REFERENCES provision_keys (id),
  idempotency_key  text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
  request_hash     text NOT NULL,
  kind             text NOT NULL CHECK (kind IN ('provision', 'suspend', 'resume', 'backup', 'restore', 'delete', 'migrate')),
  site_id          text,
  status           text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  steps            jsonb NOT NULL DEFAULT '[]',
  error_code       text,
  error_message    text,
  result_enc       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (key_id, idempotency_key)
);

COMMENT ON TABLE site_jobs IS 'Việc của Provisioning API (R-JOB-1): mỗi lệnh ghi một dòng; cùng khoá gọi + cùng Idempotency-Key trả đúng việc cũ (R-IDEM-1)';
COMMENT ON COLUMN site_jobs.request_hash IS 'SHA-256 của thân lệnh; cùng Idempotency-Key mà thân khác → 422 IDEMPOTENCY_KEY_REUSED';
COMMENT ON COLUMN site_jobs.steps IS 'Các bước đã chạy [{key, status}] để phía gọi hiện tiến trình';
COMMENT ON COLUMN site_jobs.error_message IS 'Câu dễ hiểu cho người dùng; không chứa mật khẩu, chuỗi kết nối';
COMMENT ON COLUMN site_jobs.result_enc IS 'Kết quả bí mật (mật khẩu ban đầu của chủ site) mã hoá bằng SITE_SECRET_KEY; xoá ngay sau lần đọc đầu (trả một lần)';

CREATE INDEX IF NOT EXISTS site_jobs_site ON site_jobs (site_id);
