-- [2026-11-25 11:30 PM Võ Hoàng] NT-BH-042 — C2: hai lý do phiếu kế toán chênh lệch két máy bán cho đơn vị đang có; không đè lý do đơn vị đã khai (đóng góp)
-- =============================================================================
-- 0185 Lý do chênh lệch két máy bán (docs/nghiem-thu/ban-hang/NT-BH-042-lech-ket-quy-tac-hach-toan.md, C2).
--      Module pos chốt ca lệch két nộp manual_journal một dòng reasonCode = POS-THIEU-KET (thiếu) / POS-THUA-KET (thừa);
--      tài khoản nằm trên lý do loại journal (0058), kế toán đổi ở Quy tắc hạch toán ACC41 (nghiệp vụ "Chênh lệch két máy bán").
--      Trước đây lý do chỉ có khi kế toán bấm Ghi ở BH17 — nay thêm sẵn cặp gợi ý:
--        POS-THIEU-KET  Nợ 1381 / Có 1111   flags.default = manual_journal:pos_cash_short
--        POS-THUA-KET   Nợ 1111 / Có 3381   flags.default = manual_journal:pos_cash_over
--      Chỉ THÊM khi đơn vị chưa có mã (ON CONFLICT DO NOTHING): đơn vị đã khai ở BH17 (vd Nợ 13881) giữ nguyên cặp của mình,
--      bút toán không đổi. Chỉ thêm khi cả hai tài khoản là tài khoản chi tiết đang dùng của đơn vị; thiếu (vd không có 1381)
--      thì không thêm — BH17 báo "Chưa khai tài khoản", kế toán khai ở ACC41 rồi "Lập lại phiếu" ở Sổ ca.
--      Chạy lại vô hại.
-- =============================================================================

INSERT INTO posting_reasons (tenant_id, code, name, kind, debit_account, credit_account, flags, is_active)
SELECT t.id, v.code, v.name, 'journal', v.debit, v.credit, v.flags::jsonb, true
  FROM tenants t
 CROSS JOIN (VALUES
   ('POS-THIEU-KET', 'Thiếu tiền két chờ xử lý (máy bán POS)', '1381', '1111', '{"default": "manual_journal:pos_cash_short", "module": "pos"}'),
   ('POS-THUA-KET',  'Thừa tiền két chờ xử lý (máy bán POS)',  '1111', '3381', '{"default": "manual_journal:pos_cash_over", "module": "pos"}')
 ) AS v(code, name, debit, credit, flags)
 WHERE EXISTS (SELECT 1 FROM accounts a WHERE a.tenant_id = t.id AND a.code = v.debit AND a.is_posting AND a.is_active)
   AND EXISTS (SELECT 1 FROM accounts a WHERE a.tenant_id = t.id AND a.code = v.credit AND a.is_posting AND a.is_active)
ON CONFLICT (tenant_id, code) DO NOTHING;
