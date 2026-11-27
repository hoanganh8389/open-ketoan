-- [2026-11-27 11:30 AM Nguyễn Văn Thủy] SO-DU — câu kiểm số dư đầu kỳ chạy trên máy chủ (chỉ đọc, không sửa gì) (đóng góp)
-- Chạy:  docker compose exec -T db psql -U ketoan -d ketoan < scripts/kiem/so-du-dau-ky.sql
-- Kết quả đúng: 1) và 2) không có dòng nào; 3) cột Chênh lệch tổng = 0 khi đã nhập đủ mọi chi nhánh.

\echo '1) Phiếu số dư có TK cân đối là tài khoản THẬT (mới phải là 999). Phiếu cân Nợ = Có thì không ảnh hưởng; phiếu lệch: mở phiếu → Sửa → Ghi lại'
SELECT e.doc_no AS "Phiếu", b.code AS "Chi nhánh", e.doc_date AS "Ngày chốt",
       e.payload->>'balancingAccount' AS "TK cân đối cũ"
FROM accounting_events e JOIN branches b ON b.id = e.branch_id
WHERE e.doc_type = 'opening' AND e.status <> 'cancelled'
  AND coalesce(e.payload->>'balancingAccount', '') <> ''
  AND (e.payload->>'balancingAccount' !~ '^9' OR e.payload->>'balancingAccount' ~ '^911')
ORDER BY e.doc_no;

\echo '2) Tiền mặt / tiền gửi / tiền đang chuyển (111, 112, 113) bị Dư Có ở số dư đầu kỳ (sai)'
SELECT b.code AS "Chi nhánh", l.account_code AS "Tài khoản",
       sum(l.debit) AS "Nợ", sum(l.credit) AS "Có", sum(l.debit - l.credit) AS "Dư (Nợ - Có)"
FROM ledger_lines l
JOIN ledger_entries le ON le.id = l.entry_id
JOIN branches b ON b.id = l.branch_id
WHERE le.doc_type = 'opening' AND l.account_code ~ '^11[123]'
GROUP BY b.code, l.account_code
HAVING sum(l.debit - l.credit) < 0
ORDER BY 1, 2;

\echo '3) Tài khoản trung gian 999 theo chi nhánh (nhập đủ mọi chi nhánh thì tổng = 0)'
SELECT coalesce(b.code, 'TỔNG') AS "Chi nhánh", sum(l.debit - l.credit) AS "Chênh lệch (Nợ - Có)"
FROM ledger_lines l
JOIN ledger_entries le ON le.id = l.entry_id
JOIN branches b ON b.id = l.branch_id
WHERE le.doc_type = 'opening' AND l.account_code LIKE '999%'
GROUP BY ROLLUP (b.code)
ORDER BY b.code NULLS LAST;
