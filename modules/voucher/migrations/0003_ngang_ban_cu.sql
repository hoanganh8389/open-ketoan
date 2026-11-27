-- Voucher đủ như phần mềm cũ (phiếu NT-BH-050, kế hoạch 80 S-CD-12 V1 / V2 / V5):
--   V1  giảm % có trần (discount_type = percent, discount_percent, max_discount) — mệnh giá tiền vẫn là loại amount như trước;
--   V2  lô mã KHÔNG gắn SĐT (tiền tố + số lượng, nguồn 'batch'; phone NULL) + mỗi khách tối đa N mã của đợt (per_customer, đếm theo
--       SĐT / mã khách ghi lúc dùng: used_phone, used_customer);
--   cửa hàng áp dụng của đợt (branch_codes; trống = mọi cửa hàng — như "cửa hàng" của chương trình ở plugin cũ);
--   V5  trả một phần đơn: số lượng đủ điều kiện lúc tự phát (basis_qty) và đã trả (returned_qty) → dưới ngưỡng thì thu hồi mã chưa dùng;
--       nhật ký thêm việc 'return' (mỗi phiếu trả một dòng — giao lại sự kiện không cộng hai lần).
-- Chạy bằng mod_voucher_owner trong schema mod_voucher. Chỉ thêm cột / nới ràng buộc; dữ liệu cũ giữ nguyên (đợt cũ = amount, mã cũ có SĐT).
-- [2026-11-27 09:00 AM Võ Hoàng] NGHIEM-THU — NT-BH-050: voucher giảm %, lô mã không SĐT, giới hạn mỗi khách, cửa hàng, thu hồi khi trả một phần (đóng góp)

ALTER TABLE campaigns ADD COLUMN discount_type text NOT NULL DEFAULT 'amount' CHECK (discount_type IN ('amount', 'percent'));
ALTER TABLE campaigns ADD COLUMN discount_percent numeric(5,2);
ALTER TABLE campaigns ADD COLUMN max_discount numeric(18,2);
ALTER TABLE campaigns ADD COLUMN per_customer integer CHECK (per_customer IS NULL OR per_customer > 0);
ALTER TABLE campaigns ADD COLUMN branch_codes jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE campaigns ALTER COLUMN face_value DROP NOT NULL;
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_face_value_check;
ALTER TABLE campaigns ADD CONSTRAINT campaigns_value_check CHECK (
  (discount_type = 'amount' AND face_value IS NOT NULL AND face_value > 0)
  OR (discount_type = 'percent' AND discount_percent > 0 AND discount_percent <= 100 AND (max_discount IS NULL OR max_discount > 0))
);
COMMENT ON COLUMN campaigns.discount_type IS 'Kiểu giá trị: amount = mệnh giá tiền (face_value); percent = giảm discount_percent % tiền áp dụng, tối đa max_discount (NT-BH-050 V1).';
COMMENT ON COLUMN campaigns.discount_percent IS 'Phần trăm giảm (0 < % ≤ 100) khi discount_type = percent; tính trên tổng đơn (tương đương tiền) hoặc tiền các dòng áp dụng (lần mua sau).';
COMMENT ON COLUMN campaigns.max_discount IS 'Giảm tối đa (đồng) của voucher %; NULL = không trần.';
COMMENT ON COLUMN campaigns.per_customer IS 'Mỗi khách dùng tối đa bao nhiêu mã của đợt (đếm SĐT / mã khách lúc dùng); NULL = không giới hạn (NT-BH-050 V2).';
COMMENT ON COLUMN campaigns.branch_codes IS 'Cửa hàng dùng được voucher của đợt (mã chi nhánh); [] = mọi cửa hàng.';
COMMENT ON COLUMN campaigns.face_value IS 'Mệnh giá (đồng) khi discount_type = amount; NULL với voucher %.';

ALTER TABLE codes ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE codes DROP CONSTRAINT IF EXISTS codes_source_check;
ALTER TABLE codes ADD CONSTRAINT codes_source_check CHECK (source IN ('generate', 'import', 'auto', 'batch'));
ALTER TABLE codes ADD COLUMN used_phone text;
ALTER TABLE codes ADD COLUMN used_customer text;
ALTER TABLE codes ADD COLUMN basis_qty numeric(18,4);
ALTER TABLE codes ADD COLUMN returned_qty numeric(18,4) NOT NULL DEFAULT 0;
CREATE INDEX codes_used_by ON codes (tenant_id, campaign_id, used_phone) WHERE status = 'used';
COMMENT ON COLUMN codes.phone IS 'SĐT khách được phát (chỉ khách đó dùng); NULL = mã lô không gắn khách (nguồn batch) — ai cầm mã cũng dùng, vẫn đếm giới hạn mỗi khách.';
COMMENT ON COLUMN codes.used_phone IS 'SĐT khách của đơn / phiếu đã dùng mã — đếm giới hạn mỗi khách của đợt.';
COMMENT ON COLUMN codes.used_customer IS 'Mã khách (danh mục đối tượng) của đơn / phiếu đã dùng mã.';
COMMENT ON COLUMN codes.basis_qty IS 'Mã tự phát: số lượng hàng đủ điều kiện của đơn lúc phát (đơn vị nhỏ nhất) — trả một phần xuống dưới ngưỡng thì thu hồi.';
COMMENT ON COLUMN codes.returned_qty IS 'Mã tự phát: số lượng hàng đủ điều kiện đã trả (cộng dồn các phiếu trả).';

ALTER TABLE code_log DROP CONSTRAINT IF EXISTS code_log_action_check;
ALTER TABLE code_log ADD CONSTRAINT code_log_action_check CHECK (action IN ('issue', 'use', 'release', 'revoke', 'conflict', 'return'));
