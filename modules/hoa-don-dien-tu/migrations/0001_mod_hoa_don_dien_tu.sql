-- Hoá đơn điện tử (module hoa-don-dien-tu, phiếu NT-BH-048): cài đặt Viettel khai ở kế toán. Chạy bằng vai trò mod_hoa_don_dien_tu_owner trong
-- schema mod_hoa_don_dien_tu (`npm run module -w @ketoan/api -- migrate hoa-don-dien-tu`): không tạo / sửa bảng Core. Mọi bảng: tenant_id, RLS, COMMENT.
-- KHÔNG có cột mật khẩu / token: bí mật lưu mã hoá ở public.tenant_secrets qua ctx.secrets (platform.secrets, migration 0184) —
--   hoa-don-dien-tu.viettel.password, hoa-don-dien-tu.viettel.token (cả đơn vị = cả sổ, P-0), hoa-don-dien-tu.portal.password (theo chi nhánh).
-- [2026-11-26 09:00 PM Võ Hoàng] NGHIEM-THU — NT-BH-048: bảng sổ, chi nhánh, nhật ký cài đặt hoá đơn điện tử (đóng góp)

CREATE TABLE so (
  tenant_id       bigint      PRIMARY KEY,
  trang_thai      text        NOT NULL DEFAULT 'nhap' CHECK (trang_thai IN ('nhap', 'dang-dung', 'ngung')),
  mst             text        NOT NULL DEFAULT '',
  ten_phap_ly     text        NOT NULL DEFAULT '',
  dia_chi         text        NOT NULL DEFAULT '',
  dien_thoai      text        NOT NULL DEFAULT '',
  api_base_url    text        NOT NULL DEFAULT '',
  auth_mode       text        NOT NULL DEFAULT 'basic' CHECK (auth_mode IN ('basic', 'token')),
  username        text        NOT NULL DEFAULT '',
  ssl_verify      boolean     NOT NULL DEFAULT true,
  template_code   text        NOT NULL DEFAULT '',
  invoice_series  text        NOT NULL DEFAULT '',
  payment_method  text        NOT NULL DEFAULT '',
  auto_enabled    boolean     NOT NULL DEFAULT false,
  auto_mode       text        NOT NULL DEFAULT 'draft' CHECK (auto_mode IN ('draft', 'issue')),
  row_version     integer     NOT NULL DEFAULT 1,
  updated_by      text        NOT NULL,
  updated_by_name text        NOT NULL DEFAULT '',
  updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE so ENABLE ROW LEVEL SECURITY;
ALTER TABLE so FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON so USING (public.bizcity_tenant_visible(tenant_id)) WITH CHECK (public.bizcity_tenant_visible(tenant_id));
COMMENT ON TABLE so IS 'Cài đặt hoá đơn điện tử theo SỔ (một đơn vị = một sổ = một pháp nhân, P-0): người bán, tài khoản Viettel (không có mật khẩu), mặc định mẫu số / ký hiệu / thanh toán / tự động. NT-BH-048.';
COMMENT ON COLUMN so.tenant_id IS 'Đơn vị (RLS) — một dòng mỗi đơn vị.';
COMMENT ON COLUMN so.trang_thai IS 'nhap = đang khai (website chưa dùng); dang-dung = website dùng để phát hành; ngung = tạm ngừng phát hành.';
COMMENT ON COLUMN so.mst IS 'Mã số thuế người bán (10 số hoặc 0123456789-001).';
COMMENT ON COLUMN so.ten_phap_ly IS 'Tên pháp lý người bán in trên hoá đơn.';
COMMENT ON COLUMN so.dia_chi IS 'Địa chỉ pháp lý người bán.';
COMMENT ON COLUMN so.dien_thoai IS 'Điện thoại người bán.';
COMMENT ON COLUMN so.api_base_url IS 'Địa chỉ API hoá đơn Viettel (https://…).';
COMMENT ON COLUMN so.auth_mode IS 'Cách xác thực: basic = tên đăng nhập + mật khẩu; token = access token (Bearer).';
COMMENT ON COLUMN so.username IS 'Tên đăng nhập Viettel (mật khẩu ở tenant_secrets hoa-don-dien-tu.viettel.password).';
COMMENT ON COLUMN so.ssl_verify IS 'Kiểm chứng chỉ SSL khi gọi Viettel (chỉ tắt khi môi trường thử dùng chứng chỉ tự ký).';
COMMENT ON COLUMN so.template_code IS 'Mẫu số mặc định (chi nhánh không khai thì dùng).';
COMMENT ON COLUMN so.invoice_series IS 'Ký hiệu mặc định (chi nhánh không khai thì dùng).';
COMMENT ON COLUMN so.payment_method IS 'Phương thức thanh toán mặc định ghi trên hoá đơn (vd TM/CK).';
COMMENT ON COLUMN so.auto_enabled IS 'Website tự xử lý hoá đơn khi bán xong (true) hay phát hành tay (false).';
COMMENT ON COLUMN so.auto_mode IS 'Khi tự xử lý: draft = tạo nháp trên Viettel; issue = phát hành và gửi cơ quan thuế.';
COMMENT ON COLUMN so.row_version IS 'Phiên bản dòng — lưu kèm phiên bản cũ thì báo có người sửa trước.';
COMMENT ON COLUMN so.updated_by IS 'Người sửa cuối (actor id).';
COMMENT ON COLUMN so.updated_by_name IS 'Tên người sửa cuối.';
COMMENT ON COLUMN so.updated_at IS 'Lúc sửa cuối.';

CREATE TABLE chi_nhanh (
  tenant_id          bigint      NOT NULL,
  branch_code        text        NOT NULL,
  template_code      text        NOT NULL DEFAULT '',
  invoice_series     text        NOT NULL DEFAULT '',
  portal_enabled     boolean     NOT NULL DEFAULT false,
  portal_account     text        NOT NULL DEFAULT '',
  portal_supplier_id text        NOT NULL DEFAULT '',
  active             boolean     NOT NULL DEFAULT true,
  row_version        integer     NOT NULL DEFAULT 1,
  updated_by         text        NOT NULL,
  updated_by_name    text        NOT NULL DEFAULT '',
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, branch_code)
);
ALTER TABLE chi_nhanh ENABLE ROW LEVEL SECURITY;
ALTER TABLE chi_nhanh FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chi_nhanh USING (public.bizcity_tenant_visible(tenant_id)) WITH CHECK (public.bizcity_tenant_visible(tenant_id));
COMMENT ON TABLE chi_nhanh IS 'Cài đặt hoá đơn điện tử theo CHI NHÁNH: mẫu số / ký hiệu riêng (trống = theo sổ), portal gửi mail (mật khẩu portal ở tenant_secrets phạm vi chi nhánh). NT-BH-048.';
COMMENT ON COLUMN chi_nhanh.tenant_id IS 'Đơn vị (RLS).';
COMMENT ON COLUMN chi_nhanh.branch_code IS 'Mã chi nhánh (danh mục chi nhánh của Core).';
COMMENT ON COLUMN chi_nhanh.template_code IS 'Mẫu số của chi nhánh; trống = dùng mẫu số mặc định của sổ.';
COMMENT ON COLUMN chi_nhanh.invoice_series IS 'Ký hiệu của chi nhánh; trống = dùng ký hiệu mặc định của sổ.';
COMMENT ON COLUMN chi_nhanh.portal_enabled IS 'Gửi hoá đơn cho nhiều email qua portal Viettel.';
COMMENT ON COLUMN chi_nhanh.portal_account IS 'Tài khoản portal Viettel (vd 0106933743-026_QT).';
COMMENT ON COLUMN chi_nhanh.portal_supplier_id IS 'Mã người bán nội bộ trên portal (supplier ID).';
COMMENT ON COLUMN chi_nhanh.active IS 'false = chi nhánh không phát hành hoá đơn điện tử.';
COMMENT ON COLUMN chi_nhanh.row_version IS 'Phiên bản dòng — lưu kèm phiên bản cũ thì báo có người sửa trước.';
COMMENT ON COLUMN chi_nhanh.updated_by IS 'Người sửa cuối (actor id).';
COMMENT ON COLUMN chi_nhanh.updated_by_name IS 'Tên người sửa cuối.';
COMMENT ON COLUMN chi_nhanh.updated_at IS 'Lúc sửa cuối.';

CREATE TABLE nhat_ky (
  id          bigint      GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  tenant_id   bigint      NOT NULL,
  at          timestamptz NOT NULL DEFAULT now(),
  actor       text        NOT NULL,
  actor_name  text        NOT NULL DEFAULT '',
  doi_tuong   text        NOT NULL,
  hanh_dong   text        NOT NULL,
  chi_tiet    jsonb       NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX nhat_ky_at ON nhat_ky (tenant_id, at DESC);
ALTER TABLE nhat_ky ENABLE ROW LEVEL SECURITY;
ALTER TABLE nhat_ky FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON nhat_ky USING (public.bizcity_tenant_visible(tenant_id)) WITH CHECK (public.bizcity_tenant_visible(tenant_id));
COMMENT ON TABLE nhat_ky IS 'Nhật ký cài đặt hoá đơn điện tử: ai, lúc nào, sửa ô nào, thử kết nối (mã HTTP). KHÔNG BAO GIỜ chứa giá trị mật khẩu / token (R-LOG-4). NT-BH-048.';
COMMENT ON COLUMN nhat_ky.tenant_id IS 'Đơn vị (RLS).';
COMMENT ON COLUMN nhat_ky.at IS 'Lúc ghi.';
COMMENT ON COLUMN nhat_ky.actor IS 'Người làm (actor id).';
COMMENT ON COLUMN nhat_ky.actor_name IS 'Tên người làm.';
COMMENT ON COLUMN nhat_ky.doi_tuong IS 'so = cài đặt sổ; chi-nhanh:<mã> = cài đặt chi nhánh; ket-noi = thử kết nối.';
COMMENT ON COLUMN nhat_ky.hanh_dong IS 'luu = lưu cài đặt; dat-bi-mat / xoa-bi-mat = đặt / xoá mật khẩu (không giá trị); thu-ket-noi.';
COMMENT ON COLUMN nhat_ky.chi_tiet IS 'Tên các ô đã đổi, tên bí mật đã đổi, mã HTTP khi thử kết nối — không có giá trị bí mật.';
