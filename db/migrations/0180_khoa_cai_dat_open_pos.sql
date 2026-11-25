-- [2026-11-23 08:30 AM Johnny Chu - Chu Hoàng Anh] OKT-SET-1 — ADR-0037: khoá cài đặt open-pos (một khoá cho cả mạng cửa hàng, mỗi blog một tenant; nối bằng mã nối một lần do người của tenant đích nhập)
-- =============================================================================
-- 0180 Khoá cài đặt open-pos (ADR-0037, luật tối thượng P-0 ý 2).
--      pos_installations        khoá cài đặt (okti_…) — tenant_id = tenant chủ (người tạo); băm, thu hồi được.
--      pos_installation_blogs   mỗi blog WordPress một dòng: chờ → (mã nối do người của tenant đích nhập) → active, tenant_id.
--                               UNIQUE (tenant_id) WHERE active: một tenant chỉ nối một blog (một blog = một tenant).
--      pos_connections          ping của khoá API thường (bizcity / một cửa hàng): tenant ↔ blog, phiên bản, hàng chờ.
--      pos_installation_link()  hàm SECURITY DEFINER (chủ: ketoan_pos_link, NOLOGIN, không BYPASSRLS): kiểm mã nối, nối blog vào tenant
--                               của người gọi, ghi audit_logs ở tenant đích. Chỉ ketoan_app được EXECUTE.
-- RLS: bảng khoá theo tenant_id (tenant chủ); bảng blog thấy được bởi tenant chủ HOẶC tenant đã nối, và bởi chủ hàm nối (current_user).
-- =============================================================================

CREATE TABLE pos_installations (
  id              bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       bigint      NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code            text        NOT NULL UNIQUE CHECK (code ~ '^inst_[0-9A-Z]{26}$'),
  name            text        NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  site_url        text        NOT NULL DEFAULT '' CHECK (length(site_url) <= 300),
  key_prefix      text        NOT NULL,
  key_hash        text        NOT NULL UNIQUE,
  scopes          text[]      NOT NULL DEFAULT '{documents:write,reports:read,catalog:write}',
  status          text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_by      text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  revoked_by      text,
  revoked_at      timestamptz,
  last_seen_at    timestamptz
);
COMMENT ON TABLE pos_installations IS 'Khoá cài đặt open-pos (ADR-0037): một khoá cho cả mạng cửa hàng WordPress tự cài; mỗi yêu cầu vẫn chạy trong đúng một tenant chọn bằng blog đã nối.';
COMMENT ON COLUMN pos_installations.tenant_id IS 'Tenant chủ: tenant của người tạo khoá. Route của bản cài (không mang X-OKT-Blog) chạy trong tenant này.';
COMMENT ON COLUMN pos_installations.code IS 'Mã bản cài hiện cho người (inst_ + ULID), bridge gửi kèm X-OKT-Install.';
COMMENT ON COLUMN pos_installations.key_hash IS 'Băm khoá (hashApiKey). Khoá chỉ hiện một lần lúc tạo (R-TEN-4, R-TEN-8).';
COMMENT ON COLUMN pos_installations.scopes IS 'Phạm vi như khoá API (R-TEN §3) — áp cho yêu cầu mang X-OKT-Blog của blog đã nối.';

CREATE TABLE pos_installation_blogs (
  installation_id      bigint      NOT NULL REFERENCES pos_installations(id) ON DELETE CASCADE,
  blog_id              integer     NOT NULL CHECK (blog_id > 0),
  owner_tenant_id      bigint      NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  blog_name            text        NOT NULL DEFAULT '' CHECK (length(blog_name) <= 200),
  blog_url             text        NOT NULL DEFAULT '' CHECK (length(blog_url) <= 300),
  tenant_id            bigint      REFERENCES tenants(id) ON DELETE SET NULL,
  status               text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'revoked')),
  link_code_hash       text,
  link_code_expires_at timestamptz,
  linked_by            text,
  linked_at            timestamptz,
  last_ping_at         timestamptz,
  last_ping_ms         integer,
  bridge_version       text        NOT NULL DEFAULT '' CHECK (length(bridge_version) <= 40),
  queue_groups         integer,
  pending_docs         integer,
  created_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (installation_id, blog_id),
  CHECK ((status = 'active') = (tenant_id IS NOT NULL))
);
CREATE UNIQUE INDEX pos_installation_blogs_one_blog_per_tenant ON pos_installation_blogs (tenant_id) WHERE status = 'active';
CREATE INDEX pos_installation_blogs_link_code ON pos_installation_blogs (link_code_hash) WHERE link_code_hash IS NOT NULL;
COMMENT ON TABLE pos_installation_blogs IS 'Mỗi blog WordPress của một khoá cài đặt (ADR-0037). pending → active khi người của tenant đích nhập mã nối; một tenant một blog.';
COMMENT ON COLUMN pos_installation_blogs.tenant_id IS 'Tenant đã nối (NULL khi chờ). Chỉ đặt qua pos_installation_link() — không nhận tenantId từ đầu vào (R-TEN-1).';
COMMENT ON COLUMN pos_installation_blogs.link_code_hash IS 'Băm mã nối một lần (8 ký tự, 24 giờ) — bridge nhận mã khi đăng ký blog, người của tenant đích nhập.';

CREATE TABLE pos_connections (
  tenant_id      bigint      NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  blog_id        integer     NOT NULL CHECK (blog_id > 0),
  blog_name      text        NOT NULL DEFAULT '' CHECK (length(blog_name) <= 200),
  blog_url       text        NOT NULL DEFAULT '' CHECK (length(blog_url) <= 300),
  bridge_version text        NOT NULL DEFAULT '' CHECK (length(bridge_version) <= 40),
  last_ping_at   timestamptz NOT NULL DEFAULT now(),
  last_ping_ms   integer,
  queue_groups   integer,
  pending_docs   integer,
  PRIMARY KEY (tenant_id, blog_id)
);
COMMENT ON TABLE pos_connections IS 'Ping của open-pos dùng khoá API thường (bizcity / một cửa hàng — ADR-0037 §4): blog nào đang nối tenant này, lần ping cuối.';

COMMENT ON COLUMN pos_installations.id IS 'Khoá nội bộ.';
COMMENT ON COLUMN pos_installations.name IS 'Tên bản cài do người tạo đặt (vd tên chuỗi cửa hàng).';
COMMENT ON COLUMN pos_installations.site_url IS 'Địa chỉ mạng WordPress (tham khảo, không dùng để xác thực).';
COMMENT ON COLUMN pos_installations.key_prefix IS 'Mười ký tự đầu của khoá (okti_…) để nhận ra khoá khi hiện danh sách.';
COMMENT ON COLUMN pos_installations.status IS 'active · revoked. Thu hồi → mọi yêu cầu bằng khoá này 401.';
COMMENT ON COLUMN pos_installations.created_by IS 'Người tạo (actor user:<id>).';
COMMENT ON COLUMN pos_installations.created_at IS 'Lúc tạo.';
COMMENT ON COLUMN pos_installations.revoked_by IS 'Người thu hồi.';
COMMENT ON COLUMN pos_installations.revoked_at IS 'Lúc thu hồi.';
COMMENT ON COLUMN pos_installations.last_seen_at IS 'Lần cuối khoá được dùng.';
COMMENT ON COLUMN pos_installation_blogs.installation_id IS 'Bản cài (pos_installations.id).';
COMMENT ON COLUMN pos_installation_blogs.blog_id IS 'Số blog WordPress (blog_id của multisite; một site = 1).';
COMMENT ON COLUMN pos_installation_blogs.owner_tenant_id IS 'Tenant chủ của bản cài (bằng pos_installations.tenant_id) — route của bản cài chạy trong tenant này.';
COMMENT ON COLUMN pos_installation_blogs.blog_name IS 'Tên blog bridge báo.';
COMMENT ON COLUMN pos_installation_blogs.blog_url IS 'Địa chỉ blog bridge báo.';
COMMENT ON COLUMN pos_installation_blogs.status IS 'pending (chờ mã nối) · active (đã nối, tenant_id có) · revoked.';
COMMENT ON COLUMN pos_installation_blogs.link_code_expires_at IS 'Hạn mã nối (24 giờ).';
COMMENT ON COLUMN pos_installation_blogs.linked_by IS 'Người nối (actor user:<id> ở tenant đích).';
COMMENT ON COLUMN pos_installation_blogs.linked_at IS 'Lúc nối.';
COMMENT ON COLUMN pos_installation_blogs.last_ping_at IS 'Lần ping cuối của blog.';
COMMENT ON COLUMN pos_installation_blogs.last_ping_ms IS 'Độ trễ bridge đo ở lần ping cuối (ms).';
COMMENT ON COLUMN pos_installation_blogs.bridge_version IS 'Phiên bản open-ketoan-bridge của blog.';
COMMENT ON COLUMN pos_installation_blogs.queue_groups IS 'Số nhóm hàng chờ bridge đang giữ.';
COMMENT ON COLUMN pos_installation_blogs.pending_docs IS 'Số chứng từ bridge chưa gửi được.';
COMMENT ON COLUMN pos_installation_blogs.created_at IS 'Lúc đăng ký blog.';
COMMENT ON COLUMN pos_connections.tenant_id IS 'Tenant của khoá API thường đã ping.';
COMMENT ON COLUMN pos_connections.blog_id IS 'Số blog WordPress bridge báo.';
COMMENT ON COLUMN pos_connections.blog_name IS 'Tên blog bridge báo.';
COMMENT ON COLUMN pos_connections.blog_url IS 'Địa chỉ blog bridge báo.';
COMMENT ON COLUMN pos_connections.bridge_version IS 'Phiên bản open-ketoan-bridge.';
COMMENT ON COLUMN pos_connections.last_ping_at IS 'Lần ping cuối.';
COMMENT ON COLUMN pos_connections.last_ping_ms IS 'Độ trễ bridge đo (ms).';
COMMENT ON COLUMN pos_connections.queue_groups IS 'Số nhóm hàng chờ bridge đang giữ.';
COMMENT ON COLUMN pos_connections.pending_docs IS 'Số chứng từ bridge chưa gửi được.';

-- ── Cô lập đơn vị ──────────────────────────────────────────────────────────────
ALTER TABLE pos_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_installations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pos_installations
  USING (bizcity_tenant_visible(tenant_id) OR current_user = 'ketoan_pos_link')
  WITH CHECK (bizcity_tenant_visible(tenant_id));
-- Tenant đích (đã nhận cửa hàng của bản cài) được ĐỌC dòng bản cài để hiện tên / mã ở màn Kết nối open-pos; ghi vẫn chỉ tenant chủ.
-- (key_hash là băm của khoá ngẫu nhiên 192 bit — không dùng ngược lại được; route chỉ trả mã, tên, trạng thái.)
CREATE POLICY linked_tenant_read ON pos_installations FOR SELECT
  USING (EXISTS (SELECT 1 FROM pos_installation_blogs b
                  WHERE b.installation_id = pos_installations.id AND b.status = 'active' AND b.tenant_id IS NOT NULL AND bizcity_tenant_visible(b.tenant_id)));

ALTER TABLE pos_installation_blogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_installation_blogs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pos_installation_blogs
  USING (bizcity_tenant_visible(owner_tenant_id) OR (tenant_id IS NOT NULL AND bizcity_tenant_visible(tenant_id)) OR current_user = 'ketoan_pos_link')
  WITH CHECK (bizcity_tenant_visible(owner_tenant_id) OR (tenant_id IS NOT NULL AND bizcity_tenant_visible(tenant_id)) OR current_user = 'ketoan_pos_link');

ALTER TABLE pos_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_connections FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pos_connections USING (bizcity_tenant_visible(tenant_id)) WITH CHECK (bizcity_tenant_visible(tenant_id));

-- ── Vai trò chủ hàm nối (khuôn 0091) ────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_pos_link') THEN
    BEGIN
      CREATE ROLE ketoan_pos_link NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE EXCEPTION 'Migration 0180 dừng: % không có quyền tạo vai trò ketoan_pos_link. Nhờ quản trị CSDL chạy: CREATE ROLE ketoan_pos_link NOLOGIN NOBYPASSRLS; rồi chạy lại.', current_user;
    END;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO ketoan_pos_link;
GRANT SELECT ON public.pos_installations, public.audit_logs TO ketoan_pos_link;
GRANT SELECT, UPDATE ON public.pos_installation_blogs TO ketoan_pos_link;
GRANT INSERT ON public.audit_logs TO ketoan_pos_link;
GRANT USAGE ON SEQUENCE public.audit_logs_id_seq TO ketoan_pos_link;

-- ── Hàm nối: mã nối → blog active ở tenant của NGƯỜI GỌI ─────────────────────────
-- p_tenant là tenant của yêu cầu đang chạy (auth.tenantId, người dùng đã đăng nhập tenant đó, quyền settings:write) — hàm kiểm lại
-- bằng bizcity.tenant_id của phiên: không nối được vào tenant khác tenant đang đứng.
CREATE FUNCTION public.pos_installation_link(p_code_hash text, p_tenant bigint, p_actor text)
  RETURNS TABLE (installation_code text, blog_id integer, blog_name text)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE
  v_row  record;
  v_sess text := current_setting('bizcity.tenant_id', true);
BEGIN
  IF p_code_hash IS NULL OR length(p_code_hash) < 16 OR p_tenant IS NULL OR coalesce(p_actor, '') = '' THEN
    RAISE EXCEPTION 'pos_installation_link: thiếu mã nối / tenant / người nối' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF coalesce(v_sess, '') <> p_tenant::text THEN
    RAISE EXCEPTION 'pos_installation_link: chỉ nối được vào tenant đang đứng' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT b.installation_id, b.blog_id, b.blog_name, b.owner_tenant_id, i.code, i.status AS inst_status
    INTO v_row
    FROM public.pos_installation_blogs b JOIN public.pos_installations i ON i.id = b.installation_id
   WHERE b.link_code_hash = p_code_hash AND b.status = 'pending' AND b.link_code_expires_at > now()
   FOR UPDATE OF b;
  IF NOT FOUND OR v_row.inst_status <> 'active' THEN
    RAISE EXCEPTION 'POS_LINK_CODE_INVALID' USING ERRCODE = 'no_data_found';
  END IF;
  UPDATE public.pos_installation_blogs b
     SET tenant_id = p_tenant, status = 'active', linked_by = p_actor, linked_at = now(), link_code_hash = NULL, link_code_expires_at = NULL
   WHERE b.installation_id = v_row.installation_id AND b.blog_id = v_row.blog_id;
  INSERT INTO public.audit_logs (tenant_id, actor, actor_kind, actor_via, module_id, action, object_type, object_id, before_data, after_data)
  VALUES (p_tenant, p_actor, 'user', 'db-function', 'kernel', 'pos-installation.link', 'pos_installation_blogs', v_row.code || ':' || v_row.blog_id,
          jsonb_build_object('status', 'pending'),
          jsonb_build_object('status', 'active', 'installation', v_row.code, 'blog_id', v_row.blog_id, 'owner_tenant_id', v_row.owner_tenant_id,
                             '_function', 'pos_installation_link'));
  RETURN QUERY SELECT v_row.code::text, v_row.blog_id::integer, v_row.blog_name::text;
END $$;
ALTER FUNCTION public.pos_installation_link(text, bigint, text) OWNER TO ketoan_pos_link;
REVOKE ALL ON FUNCTION public.pos_installation_link(text, bigint, text) FROM PUBLIC;
COMMENT ON FUNCTION public.pos_installation_link(text, bigint, text) IS 'ADR-0037: nối blog chờ vào tenant đang đứng bằng mã nối một lần; kiểm tenant của phiên = p_tenant; ghi audit_logs ở tenant đích. Chủ: ketoan_pos_link (NOBYPASSRLS).';

-- ── Quyền vai trò API (0032) ────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_app') THEN
    GRANT SELECT, INSERT, UPDATE ON pos_installations, pos_installation_blogs, pos_connections TO ketoan_app;
    GRANT EXECUTE ON FUNCTION public.pos_installation_link(text, bigint, text) TO ketoan_app;
  END IF;
END $$;
