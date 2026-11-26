-- [2026-11-25 11:55 PM Võ Hoàng] NGHIEM-THU — NT-BH-043 §3b: ba khung nhìn đọc cho báo cáo bán hàng máy POS — nhóm hàng, lô / hạn dùng theo chứng từ, đơn giá vốn bình quân tháng (Nguyễn Văn Thủy rà) (đóng góp)
-- =============================================================================
-- 0186 Khung nhìn đọc cho báo cáo bán hàng máy POS (phiếu NT-BH-043 §3b, chốt 25/11 Q1, Q5).
--   Module chỉ đọc được bizcity_read.* (data.read-views). Báo cáo bán hàng của máy bán cần tên / cây nhóm hàng, số lô + hạn dùng đã
--   xuất của từng chứng từ và đơn giá vốn bình quân tháng — ba thứ đang chỉ có ở bảng lõi.
--   Cùng khuôn 0044 / 0109: security_invoker (RLS đơn vị của bảng gốc vẫn áp), trigger chặn ghi, COMMENT từng cột. Chỉ đọc bảng gốc,
--   không lồng khung nhìn khác — ensureModuleDb cấp SELECT đúng các cột khung nhìn dùng trên bảng gốc.
--   Không đổi bảng, không chạm sổ, không đổi định khoản. Giá vốn chỉ là tham chiếu (bút toán giá vốn ở ACC49).
-- =============================================================================

-- ── Nhóm hàng (cây) ──────────────────────────────────────────────────────────────────────────────────────────────────────
-- item_classes kind = 'group'. Gốc của cây: parent_code trống hoặc trỏ chính nó → NULL.
CREATE OR REPLACE VIEW bizcity_read.item_groups WITH (security_invoker = true) AS
SELECT tenant_id, code, name, full_name,
       CASE WHEN parent_code IS NULL OR parent_code = '' OR parent_code = code THEN NULL ELSE parent_code END AS parent_code,
       is_active
  FROM public.item_classes
 WHERE kind = 'group';

COMMENT ON VIEW bizcity_read.item_groups IS 'Nhóm hàng dạng cây (chỉ đọc, 0186): mã, tên, tên đầy đủ, nhóm cha. bizcity_read.products.group_code trỏ code.';
COMMENT ON COLUMN bizcity_read.item_groups.tenant_id IS 'Đơn vị (RLS của bảng gốc).';
COMMENT ON COLUMN bizcity_read.item_groups.code IS 'Mã nhóm hàng (products.group_code).';
COMMENT ON COLUMN bizcity_read.item_groups.name IS 'Tên nhóm hiện trên cây.';
COMMENT ON COLUMN bizcity_read.item_groups.full_name IS 'Tên đầy đủ của nhóm (ghép các cấp, 0118); có thể trống.';
COMMENT ON COLUMN bizcity_read.item_groups.parent_code IS 'Mã nhóm cha; NULL = nhóm gốc.';
COMMENT ON COLUMN bizcity_read.item_groups.is_active IS 'false = nhóm đã ngừng dùng (đơn cũ vẫn hiện tên).';

CREATE TRIGGER bizcity_read_only INSTEAD OF INSERT OR UPDATE OR DELETE ON bizcity_read.item_groups
  FOR EACH ROW EXECUTE FUNCTION bizcity_read.reject_write();

-- ── Lô / hạn dùng theo chứng từ ─────────────────────────────────────────────────────────────────────────────────────────
-- Phân lô của Kernel (0098, lot.service): mỗi dòng hàng vào / ra kho của chứng từ chia vào các lô. Gom theo chứng từ × dòng × lô.
-- line_no = thứ tự dòng trên chứng từ đã nộp (1 = dòng đầu); dòng dịch vụ không ghi kho nên không có lô.
CREATE OR REPLACE VIEW bizcity_read.document_lots WITH (security_invoker = true) AS
SELECT e.tenant_id, e.doc_key, m.line_no, m.sku, m.item_id, l.lot_no, l.exp_date, sum(lm.qty) AS qty
  FROM public.inventory_lot_moves lm
  JOIN public.accounting_events e ON e.id = lm.event_id
  JOIN public.inventory_movements m ON m.id = lm.movement_id
  JOIN public.item_lots l ON l.id = lm.lot_id
 GROUP BY e.tenant_id, e.doc_key, m.line_no, m.sku, m.item_id, l.lot_no, l.exp_date;

COMMENT ON VIEW bizcity_read.document_lots IS 'Số lô + hạn dùng đã xuất / nhập theo chứng từ × dòng (chỉ đọc, 0186). Đọc luôn lọc theo doc_key.';
COMMENT ON COLUMN bizcity_read.document_lots.tenant_id IS 'Đơn vị (RLS của bảng gốc).';
COMMENT ON COLUMN bizcity_read.document_lots.doc_key IS 'Khoá chứng từ nguồn (vd pos:CN01:sale:<id>).';
COMMENT ON COLUMN bizcity_read.document_lots.line_no IS 'Thứ tự dòng trên chứng từ đã nộp (1 = dòng đầu).';
COMMENT ON COLUMN bizcity_read.document_lots.sku IS 'Mã hàng lúc ghi kho.';
COMMENT ON COLUMN bizcity_read.document_lots.item_id IS 'Định danh bất biến của mặt hàng; NULL với dòng cũ chưa gắn item_id.';
COMMENT ON COLUMN bizcity_read.document_lots.lot_no IS 'Số lô; trống = lô không số (không ghi lô / thiếu tồn lô).';
COMMENT ON COLUMN bizcity_read.document_lots.exp_date IS 'Hạn dùng của lô; NULL = không hạn.';
COMMENT ON COLUMN bizcity_read.document_lots.qty IS 'Số lượng ĐVT nhỏ nhất, có dấu: xuất âm, nhập dương.';

CREATE TRIGGER bizcity_read_only INSTEAD OF INSERT OR UPDATE OR DELETE ON bizcity_read.document_lots
  FOR EACH ROW EXECUTE FUNCTION bizcity_read.reject_write();

-- ── Đơn giá vốn bình quân tháng ─────────────────────────────────────────────────────────────────────────────────────────
-- Lần Tính giá vốn MỚI NHẤT của mỗi điểm tính giá (accounting_units.code = costing_runs.center_code; chi nhánh chưa gắn = '')
-- × tháng (0152), trải ra từng chi nhánh của điểm tính giá. Tháng chưa tính → không có dòng (báo cáo để trống giá vốn).
CREATE OR REPLACE VIEW bizcity_read.monthly_unit_costs WITH (security_invoker = true) AS
SELECT b.tenant_id, b.code AS branch_code, r.center_code, r.year, r.month, cl.sku, cl.item_id, cl.wh_type, cl.unit_cost, r.run_at
  FROM public.branches b
  LEFT JOIN public.accounting_units u ON u.id = b.accounting_unit_id
  JOIN (SELECT DISTINCT ON (tenant_id, center_code, year, month) id, tenant_id, center_code, year, month, run_at
          FROM public.costing_runs
         ORDER BY tenant_id, center_code, year, month, run_at DESC, id DESC) r
    ON r.tenant_id = b.tenant_id AND r.center_code = COALESCE(u.code, '')
  JOIN public.costing_run_lines cl ON cl.run_id = r.id;

COMMENT ON VIEW bizcity_read.monthly_unit_costs IS 'Đơn giá vốn bình quân tháng của lần Tính giá vốn mới nhất, theo chi nhánh × tháng × mặt hàng (chỉ đọc, 0186). Chỉ tham chiếu; bút toán giá vốn ở ACC49.';
COMMENT ON COLUMN bizcity_read.monthly_unit_costs.tenant_id IS 'Đơn vị (RLS của bảng gốc).';
COMMENT ON COLUMN bizcity_read.monthly_unit_costs.branch_code IS 'Chi nhánh (cửa hàng) thuộc điểm tính giá vốn.';
COMMENT ON COLUMN bizcity_read.monthly_unit_costs.center_code IS 'Điểm tính giá vốn lúc tính (mã đơn vị hạch toán); trống = chi nhánh chưa gắn cơ cấu.';
COMMENT ON COLUMN bizcity_read.monthly_unit_costs.year IS 'Năm của kỳ tính giá.';
COMMENT ON COLUMN bizcity_read.monthly_unit_costs.month IS 'Tháng của kỳ tính giá (1–12).';
COMMENT ON COLUMN bizcity_read.monthly_unit_costs.sku IS 'Mã hàng tại lần tính.';
COMMENT ON COLUMN bizcity_read.monthly_unit_costs.item_id IS 'Định danh bất biến của mặt hàng; NULL với dòng chưa gắn item_id.';
COMMENT ON COLUMN bizcity_read.monthly_unit_costs.wh_type IS 'Loại kho tính giá riêng; trống = tính chung.';
COMMENT ON COLUMN bizcity_read.monthly_unit_costs.unit_cost IS 'Đơn giá vốn bình quân tháng (đồng / ĐVT nhỏ nhất).';
COMMENT ON COLUMN bizcity_read.monthly_unit_costs.run_at IS 'Thời điểm của lần tính được dùng (lần mới nhất của tháng).';

CREATE TRIGGER bizcity_read_only INSTEAD OF INSERT OR UPDATE OR DELETE ON bizcity_read.monthly_unit_costs
  FOR EACH ROW EXECUTE FUNCTION bizcity_read.reject_write();

-- ── Quyền: vai trò API chỉ SELECT (module nhận quyền qua data.reads → ensureModuleDb) ────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ketoan_app') THEN
    GRANT SELECT ON bizcity_read.item_groups, bizcity_read.document_lots, bizcity_read.monthly_unit_costs TO ketoan_app;
  END IF;
END $$;
