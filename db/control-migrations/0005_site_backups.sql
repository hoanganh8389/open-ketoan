-- [2026-11-22 12:06 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B6a (D039-13): Backup Manager theo site — bản sao lưu đã kiểm, lần khôi phục gần nhất
-- Tệp sao lưu nằm trên đĩa của máy chạy lệnh (thư mục sao lưu); bảng chỉ ghi đường dẫn và kết quả tự kiểm.

CREATE TABLE IF NOT EXISTS site_backups (
  id              text PRIMARY KEY,
  site_id         text NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
  file            text NOT NULL,
  bytes           bigint NOT NULL CHECK (bytes >= 0),
  tables          integer NOT NULL CHECK (tables >= 0),
  schema_version  text,
  reason          text NOT NULL DEFAULT 'manual' CHECK (reason IN ('manual', 'schedule', 'migrate', 'import')),
  verified        boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE site_backups IS 'Bản sao lưu của từng site (pg_dump -Fc), đã tự kiểm: đọc được, có dữ liệu sổ cái, số bảng';
COMMENT ON COLUMN site_backups.file IS 'Đường dẫn tệp trên máy chạy lệnh sao lưu';
COMMENT ON COLUMN site_backups.tables IS 'Số bảng trong bản sao lưu — khôi phục xong phải khớp';
COMMENT ON COLUMN site_backups.schema_version IS 'Lược đồ của site lúc sao lưu (khôi phục bản cũ → chạy site migrate)';
COMMENT ON COLUMN site_backups.reason IS 'manual (lệnh tay), schedule (lịch đêm), migrate (trước khi nâng lược đồ), import (tệp làm ngoài lệnh, vd lấy từ PITR)';

CREATE INDEX IF NOT EXISTS site_backups_site ON site_backups (site_id, created_at DESC);

ALTER TABLE sites ADD COLUMN IF NOT EXISTS restored_at timestamptz;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS restored_from text;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS previous_db text;

COMMENT ON COLUMN sites.restored_at IS 'Lần khôi phục gần nhất';
COMMENT ON COLUMN sites.restored_from IS 'Mã bản sao lưu (site_backups.id) của lần khôi phục gần nhất';
COMMENT ON COLUMN sites.previous_db IS 'Database trước lần khôi phục gần nhất, giữ lại để lùi (kt_<slug>_cu_<giờ>); xoá tay sau 7 ngày';
