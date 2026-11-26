-- Module pos (phiếu NT-BH-049, K6): giới hạn lượt khuyến mại theo KHÁCH (plugin cũ: per_customer). Lượt dùng ghi thêm mã khách của đơn;
-- hạn mức theo khách lưu ở promo_quotas với branch_code = '@khach' (một dòng mỗi chương trình, không trùng mã cửa hàng thật).
-- Chạy bằng vai trò mod_pos_owner trong schema mod_pos: chỉ thêm cột / chỉ mục vào bảng của module, không đụng bảng Core.
-- Dòng cũ để trống mã khách (không tính vào hạn mức theo khách — chưa biết khách).
-- [2026-11-27 Võ Hoàng] NGHIEM-THU — NT-BH-049: lượt khuyến mại theo khách (đóng góp)

ALTER TABLE promo_uses ADD COLUMN IF NOT EXISTS customer_ref text;
COMMENT ON COLUMN promo_uses.customer_ref IS 'Mã khách của đơn / phiếu (mã đối tượng); trống = khách lẻ hoặc dòng cũ — không tính vào hạn mức theo khách.';
CREATE INDEX IF NOT EXISTS promo_uses_customer ON promo_uses (tenant_id, policy_key, customer_ref) WHERE released_at IS NULL AND customer_ref IS NOT NULL;
