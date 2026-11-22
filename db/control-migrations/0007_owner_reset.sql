-- [2026-11-22 08:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B8 (S039-22): việc `reset_owner_password` (lệnh POST /_sites/v1/sites/{siteId}/owner/reset-password)
-- Chỉ nới danh sách loại việc; không đổi dữ liệu.
ALTER TABLE site_jobs DROP CONSTRAINT IF EXISTS site_jobs_kind_check;
ALTER TABLE site_jobs ADD CONSTRAINT site_jobs_kind_check
  CHECK (kind IN ('provision', 'suspend', 'resume', 'backup', 'restore', 'delete', 'migrate', 'reset_owner_password'));
