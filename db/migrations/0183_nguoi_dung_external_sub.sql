-- [2026-11-24 10:10 PM Johnny Chu - Chu Hoàng Anh] SPINE-5 — C-9-13 (chủ duyệt bizcity_identity@1 1.0.0, 2026-11-24): users.external_sub lưu danh tính WordPress (sub = wp:<id> hoặc biz:<id>) của người dùng đăng nhập một lần. Chữ chốt: docs/contracts/BIZCITY-API-v1.md §5.2. Chỉ thêm cột + ràng buộc + chỉ mục; không UPDATE dữ liệu sẵn có, không chạm bảng sổ.
-- =============================================================================
-- 0183 users.external_sub — khoá danh tính xuyên app của người dùng.
--      WordPress (bizcity) nói người này là ai bằng `sub`; email có thể đổi, `sub` không đổi. Đăng nhập bằng vé
--      WordPress khớp theo `external_sub` trước, theo email sau (modules/auth/wp-sso.ts). Người dùng cũ chưa có
--      `external_sub` được gắn ở lần đăng nhập SSO kế tiếp; không điền hàng loạt (không có nguồn để điền).
--      Chạy lại vô hại (IF NOT EXISTS).
-- =============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS external_sub text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_external_sub_format') THEN
    ALTER TABLE users ADD CONSTRAINT users_external_sub_format
      CHECK (external_sub IS NULL OR external_sub ~ '^(wp:[0-9]+|biz:[A-Za-z0-9_-]{1,64})$');
  END IF;
END $$;

-- Một danh tính WordPress chỉ gắn một người dùng trong một đơn vị (chặn hai tài khoản cùng `sub`).
CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_external_sub_uq ON users (tenant_id, external_sub) WHERE external_sub IS NOT NULL;

COMMENT ON COLUMN users.external_sub IS 'Danh tính WordPress của người dùng (0183, bizcity_identity@1): wp:<id> hoặc biz:<id>; NULL = chưa đăng nhập bằng vé WordPress. Khớp người dùng khi đăng nhập một lần: theo cột này trước, email sau.';
