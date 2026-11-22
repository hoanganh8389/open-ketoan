-- [2026-11-22 11:19 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B3 (D039-12, R-SITE-8, R-SITE-10): nâng cấp từng site — trạng thái trả lại sau khi nâng, lỗi lần nâng cuối
-- Lệnh `bizcity site migrate` chuyển site sang `upgrading` rồi trả về trạng thái cũ (`active` / `suspended`) khi nâng xong.
-- Nâng lỗi: `migration_failed`, giữ `resume_status` để lần chạy lại trả đúng trạng thái.

ALTER TABLE sites ADD COLUMN IF NOT EXISTS resume_status text CHECK (resume_status IS NULL OR resume_status IN ('active', 'suspended'));
ALTER TABLE sites ADD COLUMN IF NOT EXISTS migrated_at timestamptz;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS migration_error text;

COMMENT ON COLUMN sites.resume_status IS 'Trạng thái trả lại sau khi nâng cấp xong (active / suspended); trống khi site không đang nâng';
COMMENT ON COLUMN sites.migrated_at IS 'Lần nâng lược đồ thành công gần nhất';
COMMENT ON COLUMN sites.migration_error IS 'Lỗi của lần nâng cuối (câu ngắn, không có mật khẩu / chuỗi kết nối); trống khi nâng xong';
