-- [2026-11-24 07:10 PM Johnny Chu - Chu Hoàng Anh] SPINE-3 — Q-SPINE-3 (chủ duyệt 2026-11-24): changefeed danh mục theo bizcity_sync@1 (chuẩn xương sống bizcity_spine@1 §4.1). branches.updated_at có mặc định, không NULL; trigger giữ updated_at đúng khi UPDATE items / partners / branches và khi mã (item_codes) hay ĐVT (product_units) của mặt hàng đổi; chỉ mục (tenant_id, updated_at, id) cho ba bảng. Không đụng bảng sổ.
-- =============================================================================
-- 0182 Changefeed danh mục: updated_at tin được trên items / partners / branches.
--      App khác (bridge, cake) kéo bản sao theo con trỏ (updated_at, id) và đối chiếu bằng digest
--      (GET /api/v1/sync/:axis, /digest). Muốn vậy mọi thay đổi đáng kể của một dòng danh mục phải
--      đẩy updated_at của dòng đó lên:
--        • UPDATE trực tiếp items / partners / branches  → trigger BEFORE UPDATE đặt now() khi mã gọi không tự đặt;
--        • đổi mã hàng (item_codes) hay ĐVT (product_units) → trigger AFTER chạm items.updated_at của mặt hàng đó
--          (app khác thấy "mặt hàng đổi" và kéo lại cả codes + units trong cùng dòng feed).
--      branches.updated_at: 0001 không khai; trên CSDL đang chạy cột có thể đã có nhưng NULL, không mặc định
--      (đo trên CSDL test 2026-11-24: 100% NULL) → thêm nếu thiếu, đặt mặc định, điền dòng trống bằng created_at
--      (một lần, chỉ cột này), rồi NOT NULL. items / partners đã NOT NULL DEFAULT now() từ 0002 / 0065.
--      Chạy lại vô hại (IF NOT EXISTS / OR REPLACE / UPDATE chỉ dòng NULL).
-- =============================================================================

ALTER TABLE branches ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE branches ALTER COLUMN updated_at SET DEFAULT now();
UPDATE branches SET updated_at = COALESCE(created_at, now()) WHERE updated_at IS NULL;
ALTER TABLE branches ALTER COLUMN updated_at SET NOT NULL;
COMMENT ON COLUMN branches.updated_at IS 'Lần đổi gần nhất (0182); trigger bizcity_touch_updated_at tự đặt khi UPDATE. Dùng làm con trỏ changefeed /api/v1/sync/branches.';

-- ── Chạm updated_at khi UPDATE mà mã gọi không tự đặt ──────────────────────────────────────
CREATE OR REPLACE FUNCTION bizcity_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END $$;
COMMENT ON FUNCTION bizcity_touch_updated_at() IS 'BEFORE UPDATE: đặt updated_at = now() nếu câu UPDATE không tự đổi cột này (0182, changefeed danh mục).';

CREATE OR REPLACE TRIGGER bizcity_touch_updated_at BEFORE UPDATE ON items    FOR EACH ROW EXECUTE FUNCTION bizcity_touch_updated_at();
CREATE OR REPLACE TRIGGER bizcity_touch_updated_at BEFORE UPDATE ON partners FOR EACH ROW EXECUTE FUNCTION bizcity_touch_updated_at();
CREATE OR REPLACE TRIGGER bizcity_touch_updated_at BEFORE UPDATE ON branches FOR EACH ROW EXECUTE FUNCTION bizcity_touch_updated_at();

-- ── Mã hàng đổi → mặt hàng đổi ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION bizcity_touch_item_from_code() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE items SET updated_at = now()
   WHERE tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id) AND item_id = COALESCE(NEW.item_id, OLD.item_id);
  RETURN NULL;
END $$;
COMMENT ON FUNCTION bizcity_touch_item_from_code() IS 'AFTER INSERT/UPDATE/DELETE item_codes: chạm items.updated_at của mặt hàng để changefeed thấy mã đổi (0182).';
CREATE OR REPLACE TRIGGER bizcity_touch_item_from_code AFTER INSERT OR UPDATE OR DELETE ON item_codes FOR EACH ROW EXECUTE FUNCTION bizcity_touch_item_from_code();

-- ── ĐVT đổi → mặt hàng đổi (product_units nối mặt hàng qua mã sku đang hiệu lực) ───────────
CREATE OR REPLACE FUNCTION bizcity_touch_item_from_unit() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE items i SET updated_at = now()
    FROM item_codes c
   WHERE c.tenant_id = i.tenant_id AND c.item_id = i.item_id AND c.kind = 'sku' AND c.valid_to IS NULL
     AND c.tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id) AND c.code = COALESCE(NEW.sku, OLD.sku);
  RETURN NULL;
END $$;
COMMENT ON FUNCTION bizcity_touch_item_from_unit() IS 'AFTER INSERT/UPDATE/DELETE product_units: chạm items.updated_at của mặt hàng mang sku đó để changefeed thấy ĐVT đổi (0182).';
CREATE OR REPLACE TRIGGER bizcity_touch_item_from_unit AFTER INSERT OR UPDATE OR DELETE ON product_units FOR EACH ROW EXECUTE FUNCTION bizcity_touch_item_from_unit();

-- ── Chỉ mục con trỏ changefeed ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS items_sync_cursor_idx    ON items    (tenant_id, updated_at, item_id);
CREATE INDEX IF NOT EXISTS partners_sync_cursor_idx ON partners (tenant_id, updated_at, id);
CREATE INDEX IF NOT EXISTS branches_sync_cursor_idx ON branches (tenant_id, updated_at, id);
