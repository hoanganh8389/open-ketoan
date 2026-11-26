-- Phiếu xuất điều chỉnh BH06 (module xuat-dieu-chinh, phiếu NT-BH-044). Chạy bằng vai trò mod_xuat_dieu_chinh_owner trong schema
-- mod_xuat_dieu_chinh (`npm run module -w @ketoan/api -- migrate xuat-dieu-chinh`): không tạo / sửa bảng Core. Mọi bảng: tenant_id, RLS, COMMENT.
-- Nháp chỉ ở bảng module (chưa vào sổ); Lưu = nộp chứng từ qua ctx.ledger.submit (docKey xuat-dieu-chinh:<doc_id>). Phiếu vào sổ chứng từ
-- chung (business_documents, NT-BH-033) bằng trigger gọi public.bizcity_doc_put / public.bizcity_doc_link (SECURITY DEFINER, 0167):
--   xuat-dieu-chinh.phieu:<doc_id>  inventory.issue   draft → draft · posted → done · cancelled / deleted → cancelled
-- Liên kết: ledger → ledger.event:xuat-dieu-chinh:<doc_id> khi đã ghi sổ; source → phiếu gốc khi "Chép thành phiếu mới".
-- [2026-11-26 03:10 PM Võ Hoàng] NGHIEM-THU — NT-BH-044: bảng phiếu xuất điều chỉnh, bộ đếm số, đồng bộ sổ chứng từ chung (đóng góp)

CREATE TABLE phieu (
  doc_id         uuid          PRIMARY KEY,
  tenant_id      bigint        NOT NULL,
  branch_code    text          NOT NULL,
  warehouse_code text          NOT NULL,
  doc_no         text          NOT NULL,
  doc_date       date          NOT NULL,
  reason_code    text          NOT NULL,
  purpose_code   text,
  priced         boolean       NOT NULL DEFAULT false,
  partner_code   text,
  partner_name   text,
  receiver_name  text          NOT NULL DEFAULT '',
  employee_name  text          NOT NULL DEFAULT '',
  description    text          NOT NULL DEFAULT '',
  lines          jsonb         NOT NULL DEFAULT '[]'::jsonb,
  total          numeric(18,2) NOT NULL DEFAULT 0,
  status         text          NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'cancelled', 'deleted')),
  row_version    integer       NOT NULL DEFAULT 1,
  ledger_status  text,
  copied_from    uuid,
  below_cost     jsonb,
  cancel_reason  text,
  cancelled_by   text,
  cancelled_at   timestamptz,
  posted_by      text,
  posted_at      timestamptz,
  created_by     text          NOT NULL,
  created_by_name text         NOT NULL DEFAULT '',
  created_at     timestamptz   NOT NULL DEFAULT now(),
  updated_by     text          NOT NULL,
  updated_at     timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_code, doc_no)
);
CREATE INDEX phieu_ngay ON phieu (tenant_id, doc_date DESC);
ALTER TABLE phieu ENABLE ROW LEVEL SECURITY;
ALTER TABLE phieu FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON phieu USING (public.bizcity_tenant_visible(tenant_id)) WITH CHECK (public.bizcity_tenant_visible(tenant_id));
COMMENT ON TABLE phieu IS 'Phiếu xuất điều chỉnh BH06 (NT-BH-044): nháp ở đây; Lưu = nộp sổ (0 đ → stock_adjustment giảm kho, có giá → sale nội bộ). Không xoá phiếu đã ghi sổ — huỷ = bút toán đảo.';
COMMENT ON COLUMN phieu.doc_id IS 'Định danh phiếu (docKey trong sổ = xuat-dieu-chinh:<doc_id>).';
COMMENT ON COLUMN phieu.tenant_id IS 'Đơn vị (RLS).';
COMMENT ON COLUMN phieu.branch_code IS 'Chi nhánh (cửa hàng) của phiếu — phạm vi chi nhánh của người lập so theo cột này.';
COMMENT ON COLUMN phieu.warehouse_code IS 'Kho xuất (kho đang dùng của chi nhánh; mặc định kho bán, chọn được kho quà KKM).';
COMMENT ON COLUMN phieu.doc_no IS 'Số phiếu XDC-<chi nhánh>-<yyMM>-<số>, duy nhất trong chi nhánh.';
COMMENT ON COLUMN phieu.doc_date IS 'Ngày phiếu (thu ngân chỉ hôm nay; kế toán lùi được trong kỳ chưa khoá).';
COMMENT ON COLUMN phieu.reason_code IS 'Mã lý do xuất (kind out của gói định khoản), gửi làm reasonCode.';
COMMENT ON COLUMN phieu.purpose_code IS 'Mã mục đích xuất theo bảng ánh xạ của module (chỉ phiếu 0 đ) — gửi purposeCode, Kernel tra tài khoản.';
COMMENT ON COLUMN phieu.priced IS 'true = phiếu có giá (bán nội bộ, không hoá đơn điện tử); false = phiếu 0 đ (điều chỉnh giảm kho).';
COMMENT ON COLUMN phieu.partner_code IS 'Mã người nhận (bắt buộc với phiếu có giá — công nợ 131).';
COMMENT ON COLUMN phieu.partner_name IS 'Tên người nhận lúc lập.';
COMMENT ON COLUMN phieu.receiver_name IS 'Người nhận hàng ghi tay (phiếu 0 đ, không bắt buộc).';
COMMENT ON COLUMN phieu.employee_name IS 'Nhân viên (không bắt buộc).';
COMMENT ON COLUMN phieu.description IS 'Diễn giải.';
COMMENT ON COLUMN phieu.lines IS 'Dòng hàng: lineKey, sku, name, unit, unitRatio, unitQty, qty (ĐVT nhỏ nhất), lotNo, expDate, unitPrice, taxCode, taxRate, amountBeforeTax, taxAmount.';
COMMENT ON COLUMN phieu.total IS 'Tổng tiền (0 với phiếu 0 đ).';
COMMENT ON COLUMN phieu.status IS 'draft = nháp · posted = đã ghi sổ · cancelled = đã huỷ (bút toán đảo) · deleted = nháp đã xoá.';
COMMENT ON COLUMN phieu.row_version IS 'Phiên bản dòng để kiểm hai người sửa cùng một nháp (người lưu sau → CONFLICT).';
COMMENT ON COLUMN phieu.ledger_status IS 'Trạng thái chứng từ trong sổ lúc ghi / huỷ (posted, pending, cancelled, cancel_requested).';
COMMENT ON COLUMN phieu.copied_from IS 'Phiếu gốc khi lập bằng "Chép thành phiếu mới".';
COMMENT ON COLUMN phieu.below_cost IS 'Dòng có đơn giá dưới giá vốn bình quân lúc lưu (cảnh báo, không chặn): [{ sku, unitPrice, unitCost }].';
COMMENT ON COLUMN phieu.cancel_reason IS 'Lý do huỷ (bắt buộc khi huỷ).';
COMMENT ON COLUMN phieu.cancelled_by IS 'Người huỷ (actor id).';
COMMENT ON COLUMN phieu.cancelled_at IS 'Lúc huỷ.';
COMMENT ON COLUMN phieu.posted_by IS 'Người ghi sổ (actor id).';
COMMENT ON COLUMN phieu.posted_at IS 'Lúc ghi sổ.';
COMMENT ON COLUMN phieu.created_by IS 'Người lập (actor id) — người lập hoặc kế toán sửa / xoá nháp.';
COMMENT ON COLUMN phieu.created_by_name IS 'Tên người lập lúc lập.';
COMMENT ON COLUMN phieu.created_at IS 'Lúc lập.';
COMMENT ON COLUMN phieu.updated_by IS 'Người sửa gần nhất (actor id).';
COMMENT ON COLUMN phieu.updated_at IS 'Lúc sửa gần nhất.';

CREATE TABLE code_counters (
  tenant_id   bigint      NOT NULL,
  branch_code text        NOT NULL,
  period      text        NOT NULL,
  last_no     integer     NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, branch_code, period)
);
ALTER TABLE code_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE code_counters FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON code_counters USING (public.bizcity_tenant_visible(tenant_id)) WITH CHECK (public.bizcity_tenant_visible(tenant_id));
COMMENT ON TABLE code_counters IS 'Bộ đếm số phiếu xuất điều chỉnh theo chi nhánh × tháng (ctx.documents.nextNumber chỉ đếm theo đơn vị × năm, không ghép được tiền tố XDC-<chi nhánh>-), tăng một chiều.';
COMMENT ON COLUMN code_counters.tenant_id IS 'Đơn vị (RLS).';
COMMENT ON COLUMN code_counters.branch_code IS 'Chi nhánh.';
COMMENT ON COLUMN code_counters.period IS 'Tháng yyMM.';
COMMENT ON COLUMN code_counters.last_no IS 'Số đã cấp gần nhất.';
COMMENT ON COLUMN code_counters.updated_at IS 'Lúc cấp gần nhất.';

-- Sổ chứng từ chung (NT-BH-033).
CREATE OR REPLACE FUNCTION mod_xuat_dieu_chinh.doc_put_phieu(d mod_xuat_dieu_chinh.phieu) RETURNS void
  LANGUAGE plpgsql SET search_path = mod_xuat_dieu_chinh, public, pg_temp AS $$
DECLARE
  v_ref text := 'xuat-dieu-chinh.phieu:' || d.doc_id;
BEGIN
  PERFORM public.bizcity_doc_put(d.tenant_id, v_ref, 'xuat-dieu-chinh', 'inventory.issue', d.doc_no, d.doc_date, d.branch_code,
    COALESCE(d.partner_code, ''), 'Phiếu xuất điều chỉnh', d.total, d.status,
    CASE d.status WHEN 'posted' THEN 'done' WHEN 'draft' THEN 'draft' ELSE 'cancelled' END,
    to_jsonb(d) - ARRAY['status', 'row_version', 'ledger_status', 'created_at', 'updated_at', 'updated_by', 'posted_by', 'posted_at',
      'cancelled_by', 'cancelled_at', 'cancel_reason'],
    jsonb_strip_nulls(jsonb_build_object('warehouse', d.warehouse_code, 'reason', d.reason_code, 'purpose', d.purpose_code,
      'priced', d.priced, 'cancelReason', d.cancel_reason)),
    COALESCE(NULLIF(d.created_by_name, ''), d.created_by), d.created_at, d.updated_at,
    CASE WHEN d.status = 'posted' THEN COALESCE(d.posted_by, '') ELSE '' END,
    CASE WHEN d.status = 'posted' THEN d.posted_at END);
  IF d.status IN ('posted', 'cancelled') AND d.posted_at IS NOT NULL THEN
    PERFORM public.bizcity_doc_link(d.tenant_id, v_ref, 'ledger.event:xuat-dieu-chinh:' || d.doc_id, 'ledger', COALESCE(d.posted_by, d.updated_by));
  END IF;
  PERFORM public.bizcity_doc_link(d.tenant_id, v_ref, 'xuat-dieu-chinh.phieu:' || d.copied_from, 'source', d.created_by);
END $$;
COMMENT ON FUNCTION mod_xuat_dieu_chinh.doc_put_phieu(mod_xuat_dieu_chinh.phieu) IS 'NT-BH-044: ghi phiếu xuất điều chỉnh vào sổ chứng từ chung (xuat-dieu-chinh.phieu:<doc_id>, inventory.issue) + liên kết ledger khi đã ghi sổ, source khi chép từ phiếu khác.';

CREATE OR REPLACE FUNCTION mod_xuat_dieu_chinh.doc_sync_phieu() RETURNS trigger
  LANGUAGE plpgsql SET search_path = mod_xuat_dieu_chinh, public, pg_temp AS $$
BEGIN
  PERFORM mod_xuat_dieu_chinh.doc_put_phieu(NEW);
  RETURN NULL;
END $$;
COMMENT ON FUNCTION mod_xuat_dieu_chinh.doc_sync_phieu() IS 'NT-BH-044: trigger đồng bộ phiếu xuất điều chỉnh vào sổ chứng từ chung.';

CREATE TRIGGER business_documents_sync AFTER INSERT OR UPDATE ON phieu FOR EACH ROW EXECUTE FUNCTION mod_xuat_dieu_chinh.doc_sync_phieu();
COMMENT ON TRIGGER business_documents_sync ON phieu IS 'NT-BH-044: mọi đường ghi phiếu xuất điều chỉnh đều vào sổ chứng từ chung.';
