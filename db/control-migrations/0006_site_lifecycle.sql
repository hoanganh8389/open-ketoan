-- [2026-11-22 01:18 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B6b (D039-15, Q039-1): vòng đời site — khoá chỉ đọc, xoá mềm giữ 30 ngày, dọn
-- Xoá mềm: database đổi tên thành kt_<slug>_xoa_<giờ>, giữ 30 ngày (lấy lại được), rồi lệnh dọn mới DROP.

ALTER TABLE sites ADD COLUMN IF NOT EXISTS suspend_reason text;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS deleted_db text;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS purged_at timestamptz;

COMMENT ON COLUMN sites.suspend_reason IS 'Lý do khoá (câu ngắn của người vận hành / phía gọi); trống khi không khoá';
COMMENT ON COLUMN sites.deleted_db IS 'Tên database sau khi xoá mềm (kt_<slug>_xoa_<giờ>); lấy lại được tới khi dọn';
COMMENT ON COLUMN sites.purged_at IS 'Lúc lệnh dọn DROP database đã xoá mềm (sau 30 ngày); từ đó không lấy lại được';
