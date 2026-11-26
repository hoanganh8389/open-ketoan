-- [2026-11-25 08:55 PM Võ Hoàng] FLOW — platform.secrets (BIZCITY-SECRETS-v1 §4): bảng tenant_secret_keys (khoá dữ liệu mỗi đơn vị, mã bằng khoá gốc) + tenant_secrets (bí mật mã hoá AES-256-GCM, không có cột bản rõ), RLS theo đơn vị (đóng góp)
-- =============================================================================
-- 0184 Bí mật mã hoá theo đơn vị cho module (platform.secrets, docs/contracts/BIZCITY-SECRETS-v1.md).
--      Mã hoá phong bì: một khoá gốc cho bản cài (biến môi trường BIZCITY_SECRETS_KEY, KHÔNG lưu trong CSDL) mã khoá dữ liệu
--      của từng đơn vị (tenant_secret_keys); khoá dữ liệu mã giá trị bí mật (tenant_secrets). Không cột nào chứa bản rõ.
--      Mất khoá gốc thì bí mật không đọc được — nhập lại là xong, không chạm sổ. Đổi khoá gốc: mã lại khoá dữ liệu, giá trị giữ nguyên.
--      Sao lưu (pg_dump) chỉ mang bản đã mã hoá. Không vào sổ chứng từ; nhật ký chỉ ghi "đã đổi", không ghi giá trị.
--      Chỉ tạo bảng mới; không đụng bảng sổ. Chạy lại vô hại (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- =============================================================================

CREATE TABLE IF NOT EXISTS tenant_secret_keys (
  tenant_id          bigint      PRIMARY KEY REFERENCES tenants(id),
  wrapped_key        bytea       NOT NULL CHECK (octet_length(wrapped_key) = 32),
  iv                 bytea       NOT NULL CHECK (octet_length(iv) = 12),
  tag                bytea       NOT NULL CHECK (octet_length(tag) = 16),
  key_version        integer     NOT NULL DEFAULT 1 CHECK (key_version > 0),
  master_fingerprint text        NOT NULL CHECK (master_fingerprint ~ '^[0-9a-f]{16}$'),
  created_at         timestamptz NOT NULL DEFAULT now(),
  rewrapped_at       timestamptz
);
COMMENT ON TABLE tenant_secret_keys IS 'Khoá dữ liệu của mỗi đơn vị cho bí mật (0184, platform.secrets): 32 byte ngẫu nhiên sinh ở lần ghi bí mật đầu tiên, lưu dạng đã mã bằng khoá gốc BIZCITY_SECRETS_KEY (AES-256-GCM). Đổi khoá gốc chỉ mã lại dòng ở đây.';
COMMENT ON COLUMN tenant_secret_keys.tenant_id IS 'Đơn vị sở hữu khoá dữ liệu (một đơn vị một khoá).';
COMMENT ON COLUMN tenant_secret_keys.wrapped_key IS 'Khoá dữ liệu đã mã bằng khoá gốc (AES-256-GCM, dữ liệu kèm = mã đơn vị). Không bao giờ lưu bản rõ.';
COMMENT ON COLUMN tenant_secret_keys.iv IS 'Vectơ khởi tạo 12 byte của lần mã khoá dữ liệu.';
COMMENT ON COLUMN tenant_secret_keys.tag IS 'Thẻ xác thực GCM 16 byte của lần mã khoá dữ liệu.';
COMMENT ON COLUMN tenant_secret_keys.key_version IS 'Phiên bản khoá dữ liệu; tenant_secrets.key_version ghi bí mật được mã bằng phiên bản nào.';
COMMENT ON COLUMN tenant_secret_keys.master_fingerprint IS 'Dấu vân khoá gốc đã mã khoá dữ liệu (HMAC-SHA256 rút gọn 16 hex, không suy ra được khoá): khác khoá gốc đang chạy → báo SECRETS_KEY_MISMATCH thay vì giải mã sai.';
COMMENT ON COLUMN tenant_secret_keys.created_at IS 'Lúc sinh khoá dữ liệu.';
COMMENT ON COLUMN tenant_secret_keys.rewrapped_at IS 'Lần cuối mã lại khoá dữ liệu bằng khoá gốc mới (đổi khoá gốc); null = chưa đổi lần nào.';

CREATE TABLE IF NOT EXISTS tenant_secrets (
  id          bigserial   PRIMARY KEY,
  tenant_id   bigint      NOT NULL REFERENCES tenants(id),
  module      text        NOT NULL CHECK (module ~ '^[a-z][a-z0-9-]*$'),
  name        text        NOT NULL CHECK (name ~ '^[a-z][a-z0-9-]*(\.[a-z0-9][a-z0-9_-]*)+$' AND left(name, length(module) + 1) = module || '.'),
  scope_type  text        NOT NULL CHECK (scope_type IN ('tenant', 'book', 'branch')),
  scope_id    text        NOT NULL DEFAULT '' CHECK ((scope_type = 'tenant') = (scope_id = '') AND length(scope_id) <= 64),
  ciphertext  bytea       NOT NULL,
  iv          bytea       NOT NULL CHECK (octet_length(iv) = 12),
  tag         bytea       NOT NULL CHECK (octet_length(tag) = 16),
  key_version integer     NOT NULL CHECK (key_version > 0),
  note        text        NOT NULL DEFAULT '' CHECK (length(note) <= 500),
  updated_by  text        NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name, scope_type, scope_id)
);
CREATE INDEX IF NOT EXISTS tenant_secrets_module_idx ON tenant_secrets (tenant_id, module);
COMMENT ON TABLE tenant_secrets IS 'Bí mật của module theo đơn vị (0184, platform.secrets — BIZCITY-SECRETS-v1): mật khẩu / khoá API của tích hợp ngoài, mã AES-256-GCM bằng khoá dữ liệu của đơn vị. Chỉ ghi / đọc qua packages/platform/src/core/secrets.ts (ctx.secrets); giao diện chỉ thấy "đã đặt lúc … bởi …", không có cột bản rõ.';
COMMENT ON COLUMN tenant_secrets.id IS 'Khoá dòng.';
COMMENT ON COLUMN tenant_secrets.tenant_id IS 'Đơn vị sở hữu bí mật (RLS tenant_isolation).';
COMMENT ON COLUMN tenant_secrets.module IS 'Module sở hữu bí mật; tên bí mật phải có tiền tố "<module>." — module chỉ đọc / ghi bí mật của mình.';
COMMENT ON COLUMN tenant_secrets.name IS 'Tên bí mật <module>.<tên> khai trong manifest secrets[], vd hoa-don.viettel.password.';
COMMENT ON COLUMN tenant_secrets.scope_type IS 'Phạm vi: tenant (cả đơn vị) · book (theo sổ / pháp nhân) · branch (theo chi nhánh).';
COMMENT ON COLUMN tenant_secrets.scope_id IS 'Mã sổ (book) hoặc mã chi nhánh (branch); rỗng khi phạm vi tenant.';
COMMENT ON COLUMN tenant_secrets.ciphertext IS 'Giá trị bí mật đã mã (AES-256-GCM, dữ liệu kèm = đơn vị + tên + phạm vi: chép sang dòng khác là không giải được).';
COMMENT ON COLUMN tenant_secrets.iv IS 'Vectơ khởi tạo 12 byte, mới cho mỗi lần ghi.';
COMMENT ON COLUMN tenant_secrets.tag IS 'Thẻ xác thực GCM 16 byte: sửa bản mã là bị phát hiện.';
COMMENT ON COLUMN tenant_secrets.key_version IS 'Phiên bản khoá dữ liệu của đơn vị đã mã giá trị (tenant_secret_keys.key_version).';
COMMENT ON COLUMN tenant_secrets.note IS 'Ghi chú không bí mật người đặt nhập kèm (≤ 500 ký tự); không ghi giá trị vào đây.';
COMMENT ON COLUMN tenant_secrets.updated_by IS 'Người đặt / đổi lần cuối (user:<id>, apikey:<id>…).';
COMMENT ON COLUMN tenant_secrets.updated_at IS 'Lúc đặt / đổi lần cuối.';

-- ── Cô lập đơn vị (khuôn 0041) ─────────────────────────────────────────────────
ALTER TABLE tenant_secret_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_secret_keys FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tenant_secret_keys;
CREATE POLICY tenant_isolation ON tenant_secret_keys USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

ALTER TABLE tenant_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_secrets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tenant_secrets;
CREATE POLICY tenant_isolation ON tenant_secrets USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_app') THEN
    GRANT SELECT, INSERT, UPDATE ON tenant_secret_keys TO ketoan_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_secrets TO ketoan_app;
    GRANT USAGE ON SEQUENCE tenant_secrets_id_seq TO ketoan_app;
  END IF;
END $$;
