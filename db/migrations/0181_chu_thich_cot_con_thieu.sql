-- [2026-11-23 01:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-040 — B10d-a (S040-25): COMMENT ON cho cột còn thiếu (SC-DATA-3, R-DB-5) — chỉ thêm chú thích, không đổi dữ liệu / cấu trúc
-- =============================================================================
-- 0181 Chú thích cột còn thiếu.
--      99 cột của 15 bảng đang dùng thiếu COMMENT ON COLUMN (đo selfcheck trên main 6d61629d, 2026-11-23). Chỉ thêm chú thích
--      tiếng Việt; không ALTER, không UPDATE. Chạy lại vô hại (COMMENT ON ghi đè chú thích cũ của chính cột đó).
--      _run_log_export là bảng tạm của 0163 mà ứng dụng tự xoá ở lần khởi động đầu → chú thích trong khối kiểm bảng còn tồn tại.
--      Bảng / cột đã xoá ở migration sau (account_default_types, item_class_history, costing_runs.org_unit_id) không chú thích:
--      bộ đọc migration của bộ kiểm chuẩn nay hiểu DROP (tests/conformance/lib/sql.mjs).
-- =============================================================================

-- ── Định danh đơn vị / phân kho / bộ phận trên chứng từ (0173 cơ cấu một bảng) ────────────────────────────────────────
COMMENT ON COLUMN purchase_documents.branch_uid IS 'Định danh bất biến đơn vị cn_… của phiếu mua (0173), trigger điền theo branch_code.';
COMMENT ON COLUMN purchase_documents.warehouse_uid IS 'Định danh bất biến phân kho kho_… (0173); không chọn phân kho = phân kho mặc định của đơn vị.';
COMMENT ON COLUMN purchase_documents.department_uid IS 'Định danh bất biến bộ phận pb_… (0173); không chọn bộ phận = bộ phận mặc định của đơn vị.';
COMMENT ON COLUMN stock_max_requests.branch_uid IS 'Định danh bất biến đơn vị cn_… của đề nghị đặt hàng theo tồn tối đa (0173).';
COMMENT ON COLUMN stock_max_requests.department_uid IS 'Định danh bất biến bộ phận pb_… (0173); trống = bộ phận mặc định của đơn vị.';
COMMENT ON COLUMN transfer_requests.from_branch_uid IS 'Định danh bất biến đơn vị chuyển đi cn_… của đề nghị điều chuyển (0173).';
COMMENT ON COLUMN transfer_requests.from_warehouse_uid IS 'Định danh bất biến phân kho chuyển đi kho_… (0173).';
COMMENT ON COLUMN transfer_requests.to_branch_uid IS 'Định danh bất biến đơn vị nhận cn_… (0173).';
COMMENT ON COLUMN transfer_requests.to_warehouse_uid IS 'Định danh bất biến phân kho nhận kho_… (0173).';
COMMENT ON COLUMN transfer_requests.department_uid IS 'Định danh bất biến bộ phận pb_… lập đề nghị (0173).';
COMMENT ON COLUMN stock_transfer_docs.from_branch_uid IS 'Định danh bất biến đơn vị chuyển đi cn_… của phiếu chuyển kho (0173).';
COMMENT ON COLUMN stock_transfer_docs.from_warehouse_uid IS 'Định danh bất biến phân kho xuất kho_… (0173).';
COMMENT ON COLUMN stock_transfer_docs.to_branch_uid IS 'Định danh bất biến đơn vị nhận cn_… (0173).';
COMMENT ON COLUMN stock_transfer_docs.to_warehouse_uid IS 'Định danh bất biến phân kho nhập kho_… (0173).';
COMMENT ON COLUMN stock_transfer_docs.department_uid IS 'Định danh bất biến bộ phận pb_… lập phiếu (0173).';
COMMENT ON COLUMN stock_counts.branch_uid IS 'Định danh bất biến đơn vị cn_… của phiếu kiểm kê (0173).';
COMMENT ON COLUMN stock_counts.department_uid IS 'Định danh bất biến bộ phận pb_… (0173); trống = bộ phận mặc định của đơn vị.';
COMMENT ON COLUMN business_documents.branch_uid IS 'Định danh bất biến đơn vị cn_… của chứng từ (0173), trigger điền theo branch_code.';
COMMENT ON COLUMN business_documents.warehouse_uid IS 'Định danh bất biến phân kho kho_… (0173), theo meta.warehouseCode / fromWarehouse.';
COMMENT ON COLUMN business_documents.department_uid IS 'Định danh bất biến bộ phận pb_… (0173), theo meta.departmentCode.';

-- ── Sổ chứng từ chung (0158) ─────────────────────────────────────────────────────────────────────────────────────────────
COMMENT ON COLUMN business_documents.doc_date IS 'Ngày chứng từ (ngày ghi trên phiếu, theo bảng nguồn); trống khi bảng nguồn chưa có ngày.';
COMMENT ON COLUMN business_documents.created_by IS 'Người lập chứng từ (theo bảng nguồn): user:<id> hoặc tên hiển thị.';

-- ── Phiên bản MST và cơ cấu theo ngày hiệu lực (0121) ───────────────────────────────────────────────────────────────────
COMMENT ON COLUMN tax_id_versions.scope IS 'Đối tượng mang MST: warehouse = kho, branch = chi nhánh / đơn vị, org_unit = nút cơ cấu cũ (0121).';
COMMENT ON COLUMN tax_id_versions.ref_id IS 'id của kho / chi nhánh / nút theo scope.';
COMMENT ON COLUMN tax_id_versions.tax_id IS 'Mã số thuế có hiệu lực trong khoảng ngày; trống = theo cấp gần nhất có khai.';
COMMENT ON COLUMN tax_id_versions.valid_from IS 'Ngày bắt đầu hiệu lực (gồm ngày này).';
COMMENT ON COLUMN tax_id_versions.valid_to IS 'Ngày hết hiệu lực, loại trừ (= valid_from của phiên bản sau); trống = đang hiệu lực.';
COMMENT ON COLUMN tax_id_versions.changed_by IS 'Người khai phiên bản này.';
COMMENT ON COLUMN tax_id_versions.changed_at IS 'Lúc khai phiên bản này.';
COMMENT ON COLUMN org_link_versions.scope IS 'Loại liên kết: branch_org (0121, cũ), branch_parent = kho tổng mua hàng, org_parent (0121, cũ), unit_parent = đơn vị cha (0174).';
COMMENT ON COLUMN org_link_versions.ref_id IS 'id của đối tượng con theo scope (chi nhánh / đơn vị / nút).';
COMMENT ON COLUMN org_link_versions.parent_id IS 'id của đối tượng cha trong khoảng ngày; trống = không có cha (gốc).';
COMMENT ON COLUMN org_link_versions.valid_from IS 'Ngày bắt đầu hiệu lực (gồm ngày này).';
COMMENT ON COLUMN org_link_versions.valid_to IS 'Ngày hết hiệu lực, loại trừ (= valid_from của phiên bản sau); trống = đang hiệu lực.';
COMMENT ON COLUMN org_link_versions.changed_by IS 'Người đổi liên kết.';
COMMENT ON COLUMN org_link_versions.changed_at IS 'Lúc đổi liên kết.';

-- ── Loại kho (0128) ──────────────────────────────────────────────────────────────────────────────────────────────────────
COMMENT ON COLUMN warehouse_types.code IS 'Mã loại kho (chữ hoa, số, gạch dưới; 2–12 ký tự), duy nhất trong đơn vị.';
COMMENT ON COLUMN warehouse_types.name IS 'Tên loại kho hiện trên màn.';
COMMENT ON COLUMN warehouse_types.purpose IS 'Mô tả công dụng của loại kho.';
COMMENT ON COLUMN warehouse_types.can_sell IS 'Hàng ở kho loại này được bán, tính vào tồn khả dụng (chỉ khi thuộc sở hữu — CHECK).';
COMMENT ON COLUMN warehouse_types.owned IS 'Hàng thuộc sở hữu của đơn vị: tính giá vốn, ghi sổ kho; false = chỉ theo dõi số lượng (nhận giữ hộ).';
COMMENT ON COLUMN warehouse_types.track_expiry IS 'Theo dõi hạn dùng, cảnh báo hàng cận / hết hạn ở kho loại này.';
COMMENT ON COLUMN warehouse_types.account_prefix IS 'Đầu số tài khoản kho của loại này (vd 156, 157); trống = theo Quy tắc hạch toán.';
COMMENT ON COLUMN warehouse_types.is_system IS 'Loại gốc của hệ thống (không xoá được).';
COMMENT ON COLUMN warehouse_types.is_active IS 'Đang dùng; false = ẩn khỏi lựa chọn, dữ liệu cũ giữ nguyên.';
COMMENT ON COLUMN warehouse_types.sort_order IS 'Thứ tự hiện trong danh sách.';
COMMENT ON COLUMN warehouse_types.updated_by IS 'Người sửa gần nhất.';
COMMENT ON COLUMN warehouse_type_ops.op IS 'Mã nghiệp vụ dùng kho (nhập mua, bán, khách trả, chuyển kho…).';
COMMENT ON COLUMN warehouse_type_ops.type_codes IS 'Các mã loại kho nghiệp vụ này được dùng, theo thứ tự ưu tiên: màn tự chọn kho thuộc loại đứng đầu; kho loại ngoài danh sách bị chặn.';
COMMENT ON COLUMN warehouse_type_ops.updated_by IS 'Người sửa gần nhất.';

-- ── Mục đích xuất kho (0140) ─────────────────────────────────────────────────────────────────────────────────────────────
COMMENT ON COLUMN stock_purposes.code IS 'Mã mục đích xuất (chữ hoa, số, gạch), duy nhất trong đơn vị.';
COMMENT ON COLUMN stock_purposes.name IS 'Tên mục đích (hủy hàng hỏng, dùng cho bộ phận, tặng khách…).';
COMMENT ON COLUMN stock_purposes.is_active IS 'Đang dùng; false = ẩn khỏi lựa chọn, phiếu cũ giữ nguyên.';
COMMENT ON COLUMN stock_purposes.sort_order IS 'Thứ tự hiện trong danh sách.';
COMMENT ON COLUMN stock_purposes.updated_by IS 'Người sửa gần nhất.';

-- ── Thùng rác danh mục (0146, 0159, 0162) ────────────────────────────────────────────────────────────────────────────────
COMMENT ON COLUMN catalog_trash.catalog IS 'Loại mục: tên danh mục đã xoá (vd unit-names), tombstone.<thực thể> = dấu xoá, backup.default-data = ảnh chụp trước khi nạp dữ liệu gốc (0162).';
COMMENT ON COLUMN catalog_trash.row_key IS 'Khoá của mục đã xoá trong danh mục (mã, id, hoặc tên bộ dữ liệu với bản sao lưu).';
COMMENT ON COLUMN catalog_trash.label IS 'Tên dễ đọc của mục, hiện ở màn thùng rác.';
COMMENT ON COLUMN catalog_trash.payload IS 'Nguyên dòng đã xoá { "<bảng>": [dòng to_jsonb …] } theo thứ tự chèn lại khi khôi phục.';
COMMENT ON COLUMN catalog_trash.deleted_by IS 'Người xoá.';
COMMENT ON COLUMN catalog_trash.deleted_at IS 'Lúc xoá.';

-- ── Lần tính giá vốn (0152, 0155, 0157) ─────────────────────────────────────────────────────────────────────────────────
COMMENT ON COLUMN costing_runs.center_code IS 'Mã điểm tính giá vốn (chi nhánh) lúc tính.';
COMMENT ON COLUMN costing_runs.center_name IS 'Tên điểm tính giá vốn lúc tính.';
COMMENT ON COLUMN costing_runs.year IS 'Năm của kỳ tính.';
COMMENT ON COLUMN costing_runs.month IS 'Tháng của kỳ tính (1–12).';
COMMENT ON COLUMN costing_runs.date_from IS 'Ngày đầu khoảng tính (trong tháng).';
COMMENT ON COLUMN costing_runs.date_to IS 'Ngày cuối khoảng tính (trong tháng).';
COMMENT ON COLUMN costing_runs.items IS 'Số mã hàng đã tính giá vốn.';
COMMENT ON COLUMN costing_runs.total IS 'Tổng giá vốn của lần tính (cộng các chi nhánh trong điểm tính).';
COMMENT ON COLUMN costing_runs.imported IS 'Số mã lấy đơn giá nhập từ tệp (không tự tính).';
COMMENT ON COLUMN costing_runs.vouchers IS 'Danh sách phiếu giá vốn đã sinh ở lần tính (JSON).';
COMMENT ON COLUMN costing_runs.run_by IS 'Người bấm Tính giá vốn.';
COMMENT ON COLUMN costing_runs.run_at IS 'Lúc tính.';
COMMENT ON COLUMN costing_runs.formula_code IS 'Mã công thức giá vốn đã dùng ở lần tính (0155).';
COMMENT ON COLUMN costing_runs.formula_name IS 'Tên công thức đã dùng (0155).';
COMMENT ON COLUMN costing_runs.formula IS 'Ảnh chụp tuỳ chọn công thức lúc tính (0155) — đổi công thức sau không đổi lần tính cũ.';
COMMENT ON COLUMN costing_runs.separate_types IS 'Các loại kho tính giá vốn riêng ở lần tính (0157).';
COMMENT ON COLUMN costing_run_lines.run_id IS 'Lần tính giá vốn chứa dòng này.';
COMMENT ON COLUMN costing_run_lines.sku IS 'Mã hàng lúc tính.';
COMMENT ON COLUMN costing_run_lines.item_id IS 'Định danh bất biến mặt hàng (item_id).';
COMMENT ON COLUMN costing_run_lines.opening_qty IS 'Số lượng tồn đầu kỳ.';
COMMENT ON COLUMN costing_run_lines.opening_value IS 'Giá trị tồn đầu kỳ.';
COMMENT ON COLUMN costing_run_lines.in_qty IS 'Số lượng nhập trong kỳ.';
COMMENT ON COLUMN costing_run_lines.in_value IS 'Giá trị nhập trong kỳ.';
COMMENT ON COLUMN costing_run_lines.unit_cost IS 'Đơn giá vốn của kỳ (bình quân hoặc nhập tay theo cost_source).';
COMMENT ON COLUMN costing_run_lines.out_qty IS 'Số lượng xuất trong kỳ.';
COMMENT ON COLUMN costing_run_lines.closing_qty IS 'Số lượng tồn cuối kỳ.';
COMMENT ON COLUMN costing_run_lines.closing_value IS 'Giá trị tồn cuối kỳ.';
COMMENT ON COLUMN costing_run_lines.gift_qty IS 'Số lượng tồn quà giá vốn 0 cuối kỳ (quà KM người tiêu dùng nhận kèm phiếu mua), mang sang tháng sau.';
COMMENT ON COLUMN costing_run_lines.cost_source IS 'Nguồn đơn giá: computed = tính, import = nhập tay từ tệp.';
COMMENT ON COLUMN costing_run_lines.detail IS 'Chi tiết cách tính của dòng (đầu kỳ, các khoản phân bổ) dạng JSON (0154).';
COMMENT ON COLUMN costing_run_lines.wh_type IS 'Loại kho của dòng khi loại đó tính riêng (0157); trống = gộp chung.';

-- ── Công thức giá vốn (0155) ─────────────────────────────────────────────────────────────────────────────────────────────
COMMENT ON COLUMN costing_formulas.code IS 'Mã công thức (CT<yyyymm> theo tháng bắt đầu áp dụng), duy nhất trong đơn vị.';
COMMENT ON COLUMN costing_formulas.name IS 'Tên công thức hiện trên màn.';
COMMENT ON COLUMN costing_formulas.options IS 'Tuỳ chọn công thức: giá gồm / không gồm VAT, phân bổ chi phí, phân bổ chiết khấu, cách lấy giá chuyển kho / điều chỉnh / trả NCC (JSON).';
COMMENT ON COLUMN costing_formulas.is_default IS 'Công thức mặc định khi chưa có công thức theo tháng.';
COMMENT ON COLUMN costing_formulas.apply_from IS 'Tháng bắt đầu áp dụng YYYY-MM; trống = không còn áp tháng nào (đã bị thay).';
COMMENT ON COLUMN costing_formulas.note IS 'Ghi chú lý do đổi công thức.';
COMMENT ON COLUMN costing_formulas.updated_by IS 'Người đổi công thức gần nhất.';

-- ── Bảng tạm nhật ký cũ (0163) — ứng dụng xoá bảng ở lần khởi động đầu, nên chỉ chú thích khi bảng còn ──────────────
DO $$
BEGIN
  IF to_regclass('public._run_log_export') IS NOT NULL THEN
    COMMENT ON COLUMN _run_log_export.stream IS 'Luồng nhật ký JSONL đích (thư mục của luồng trong nơi lưu nhật ký chạy, run-log).';
    COMMENT ON COLUMN _run_log_export.at IS 'Thời điểm của dòng nhật ký gốc.';
    COMMENT ON COLUMN _run_log_export.data IS 'Nội dung dòng nhật ký gốc (JSON), ghi ra tệp nguyên văn.';
  END IF;
END $$;
