-- [2026-11-25 09:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-039: khai chính sách tích điểm ở kế toán (nháp → duyệt → phát hành), điều chỉnh điểm tay có duyệt (đóng góp)
-- Module loyalty (phiếu NT-BH-039). Chạy bằng vai trò mod_loyalty_owner trong schema mod_loyalty: không chạm bảng Core, không đổi bảng programs.
-- Phát hành = thêm một dòng mới vào programs (phiên bản = băm nội dung, received_by = người duyệt); điều chỉnh đã duyệt = một dòng adjust
-- ở sổ điểm entries. Mọi bảng: tenant_id, RLS (ENABLE + FORCE + bizcity_tenant_visible), COMMENT ON từng cột.

CREATE TABLE program_drafts (
  draft_id          uuid        NOT NULL PRIMARY KEY,
  tenant_id         bigint      NOT NULL,
  branch_code       text        NOT NULL,
  store_id          integer     NOT NULL DEFAULT 0,
  program           jsonb       NOT NULL,
  base_version      text,
  batch_id          uuid,
  revision          integer     NOT NULL DEFAULT 1,
  status            text        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'published', 'rejected')),
  created_by        text        NOT NULL,
  created_by_name   text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        text        NOT NULL,
  updated_by_name   text,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  approved_by       text,
  approved_by_name  text,
  approved_at       timestamptz,
  reject_reason     text,
  published_version text
);
CREATE UNIQUE INDEX program_drafts_open_branch ON program_drafts (tenant_id, branch_code) WHERE status IN ('draft', 'pending', 'rejected');
CREATE INDEX program_drafts_published ON program_drafts (tenant_id, branch_code, published_version) WHERE status = 'published';
CREATE INDEX program_drafts_list ON program_drafts (tenant_id, status, updated_at DESC);
ALTER TABLE program_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_drafts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON program_drafts USING (public.bizcity_tenant_visible(tenant_id)) WITH CHECK (public.bizcity_tenant_visible(tenant_id));
COMMENT ON TABLE program_drafts IS 'Bản nháp chính sách tích điểm của một cửa hàng (NT-BH-039): nháp → chờ duyệt → đã phát hành (thêm dòng programs) / bị từ chối (sửa rồi gửi lại). Mỗi cửa hàng một nháp đang mở; bản đã phát hành không sửa, muốn đổi thì lập nháp mới từ bản hiện hành.';
COMMENT ON COLUMN program_drafts.draft_id IS 'Định danh bản nháp (uuid).';
COMMENT ON COLUMN program_drafts.tenant_id IS 'Đơn vị (RLS).';
COMMENT ON COLUMN program_drafts.branch_code IS 'Mã chi nhánh (cửa hàng) áp chính sách — bizcity_read.branches.code.';
COMMENT ON COLUMN program_drafts.store_id IS 'Mã site cửa hàng ở website (blog_id) chép từ bản hiện hành — bộ tính lọc chính sách theo applyToBlogIds.';
COMMENT ON COLUMN program_drafts.program IS 'Nội dung LoyaltyProgram đang soạn: settings, tiers, policies loại 1–6 (version gán lúc phát hành).';
COMMENT ON COLUMN program_drafts.base_version IS 'Phiên bản programs đã chép làm nháp ("Sửa từ bản hiện hành"); NULL = cửa hàng chưa có chính sách.';
COMMENT ON COLUMN program_drafts.batch_id IS 'Lần áp cho nhiều cửa hàng một lúc: các nháp lập cùng lần có cùng mã.';
COMMENT ON COLUMN program_drafts.revision IS 'Số lần sửa — màn gửi kèm khi lưu; lệch = người khác vừa sửa (chặn, tải lại).';
COMMENT ON COLUMN program_drafts.status IS 'draft nháp · pending chờ duyệt · published đã phát hành · rejected bị từ chối (sửa rồi gửi lại).';
COMMENT ON COLUMN program_drafts.created_by IS 'Người lập (actor id) — không tự duyệt.';
COMMENT ON COLUMN program_drafts.created_by_name IS 'Tên người lập (ảnh chụp).';
COMMENT ON COLUMN program_drafts.created_at IS 'Lúc lập.';
COMMENT ON COLUMN program_drafts.updated_by IS 'Người sửa gần nhất (actor id).';
COMMENT ON COLUMN program_drafts.updated_by_name IS 'Tên người sửa gần nhất.';
COMMENT ON COLUMN program_drafts.updated_at IS 'Lúc sửa gần nhất.';
COMMENT ON COLUMN program_drafts.approved_by IS 'Người duyệt (actor id).';
COMMENT ON COLUMN program_drafts.approved_by_name IS 'Tên người duyệt (ảnh chụp) — cũng là received_by của dòng programs phát hành.';
COMMENT ON COLUMN program_drafts.approved_at IS 'Lúc duyệt = lúc phát hành.';
COMMENT ON COLUMN program_drafts.reject_reason IS 'Lý do từ chối gần nhất.';
COMMENT ON COLUMN program_drafts.published_version IS 'Phiên bản programs đã phát hành từ nháp này (băm nội dung).';

CREATE TABLE adjustments (
  adjustment_id     uuid          NOT NULL PRIMARY KEY,
  tenant_id         bigint        NOT NULL,
  code              text          NOT NULL,
  partner_code      text          NOT NULL,
  points            numeric(14,2) NOT NULL CHECK (points <> 0),
  reason            text          NOT NULL CHECK (length(btrim(reason)) > 0),
  branch_code       text,
  status            text          NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_by        text          NOT NULL,
  created_by_name   text,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  approved_by       text,
  approved_by_name  text,
  approved_at       timestamptz,
  reject_reason     text,
  entry_id          uuid,
  UNIQUE (tenant_id, code)
);
CREATE INDEX adjustments_list ON adjustments (tenant_id, status, created_at DESC);
ALTER TABLE adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE adjustments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON adjustments USING (public.bizcity_tenant_visible(tenant_id)) WITH CHECK (public.bizcity_tenant_visible(tenant_id));
COMMENT ON TABLE adjustments IS 'Yêu cầu điều chỉnh điểm tay (NT-BH-039 L4): cộng / trừ, bắt buộc lý do → người khác có quyền duyệt → ghi dòng adjust vào sổ điểm. Không trần (Q2); trừ quá số dùng được thì chặn.';
COMMENT ON COLUMN adjustments.adjustment_id IS 'Định danh yêu cầu (uuid) — cũng là ref_id của dòng sổ điểm (ref_type manual).';
COMMENT ON COLUMN adjustments.tenant_id IS 'Đơn vị (RLS).';
COMMENT ON COLUMN adjustments.code IS 'Số yêu cầu để in / tra (DCyyyyMMdd-xxxx), duy nhất trong đơn vị.';
COMMENT ON COLUMN adjustments.partner_code IS 'Mã khách (bizcity_read.partners.code; máy bán: SĐT).';
COMMENT ON COLUMN adjustments.points IS 'Số điểm có dấu: > 0 cộng (lô không hạn), < 0 trừ (theo lô hết hạn sớm nhất trước).';
COMMENT ON COLUMN adjustments.reason IS 'Lý do điều chỉnh (bắt buộc) — ghi vào ghi chú dòng sổ điểm.';
COMMENT ON COLUMN adjustments.branch_code IS 'Chi nhánh liên quan (không bắt buộc).';
COMMENT ON COLUMN adjustments.status IS 'pending chờ duyệt · approved đã duyệt (đã ghi sổ điểm) · rejected bị từ chối.';
COMMENT ON COLUMN adjustments.created_by IS 'Người lập (actor id) — không tự duyệt.';
COMMENT ON COLUMN adjustments.created_by_name IS 'Tên người lập (ảnh chụp).';
COMMENT ON COLUMN adjustments.created_at IS 'Lúc lập.';
COMMENT ON COLUMN adjustments.approved_by IS 'Người duyệt / từ chối (actor id).';
COMMENT ON COLUMN adjustments.approved_by_name IS 'Tên người duyệt / từ chối (ảnh chụp).';
COMMENT ON COLUMN adjustments.approved_at IS 'Lúc duyệt / từ chối.';
COMMENT ON COLUMN adjustments.reject_reason IS 'Lý do từ chối.';
COMMENT ON COLUMN adjustments.entry_id IS 'Dòng sổ điểm (entries.entry_id) đã ghi khi duyệt.';

CREATE TABLE approval_log (
  id          bigserial   PRIMARY KEY,
  tenant_id   bigint      NOT NULL,
  object_type text        NOT NULL CHECK (object_type IN ('program', 'adjustment')),
  object_id   uuid        NOT NULL,
  branch_code text,
  action      text        NOT NULL,
  actor       text        NOT NULL,
  actor_name  text,
  note        text,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX approval_log_object ON approval_log (tenant_id, object_type, object_id, at);
ALTER TABLE approval_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_log FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON approval_log USING (public.bizcity_tenant_visible(tenant_id)) WITH CHECK (public.bizcity_tenant_visible(tenant_id));
COMMENT ON TABLE approval_log IS 'Nhật ký lập / sửa / gửi duyệt / duyệt / từ chối của nháp chính sách và yêu cầu điều chỉnh điểm (NT-BH-039), chỉ thêm.';
COMMENT ON COLUMN approval_log.id IS 'Số thứ tự dòng nhật ký.';
COMMENT ON COLUMN approval_log.tenant_id IS 'Đơn vị (RLS).';
COMMENT ON COLUMN approval_log.object_type IS 'program nháp chính sách · adjustment yêu cầu điều chỉnh điểm.';
COMMENT ON COLUMN approval_log.object_id IS 'Định danh nháp / yêu cầu.';
COMMENT ON COLUMN approval_log.branch_code IS 'Chi nhánh của nháp / yêu cầu (để lọc).';
COMMENT ON COLUMN approval_log.action IS 'create lập · update sửa · submit gửi duyệt · approve duyệt (phát hành / ghi sổ điểm) · reject từ chối.';
COMMENT ON COLUMN approval_log.actor IS 'Người làm (actor id).';
COMMENT ON COLUMN approval_log.actor_name IS 'Tên người làm (ảnh chụp).';
COMMENT ON COLUMN approval_log.note IS 'Ghi chú (lý do từ chối, phiên bản đã phát hành…).';
COMMENT ON COLUMN approval_log.at IS 'Lúc làm.';
