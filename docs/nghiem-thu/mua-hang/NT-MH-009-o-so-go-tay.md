# NT-MH-009 · Tồn max (MH16, MH17): ô số gõ tay nhận số lẻ đúng ("1.5" không còn thành 15)
<!-- [2026-11-25 kiennt] NGHIEM-THU — tạo phiếu theo yêu cầu người dùng (đóng góp) -->

| | |
|---|---|
| Phân hệ | Mua hàng |
| Màn hình | MH16 Tồn max (ô Max, Min; cài riêng mã: Số ngày cần đủ hàng); MH17 Phiếu đăng ký (ô Max đề nghị; phiếu hàng mới: ô max từng shop) |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 25/11/2026 |
| Trạng thái | Đã chốt (kiennt, 25/11/2026) |

## 1. Lỗi

Ô số gõ tay đọc lại số sau **mỗi phím** và coi **mọi dấu chấm là dấu nghìn**: gõ "1." thì dấu bị nuốt (thành 1), gõ tiếp "5" thành **15**. Gõ "1,5" cũng mất dấu phẩy. Không có cảnh báo — max sai gấp 10 lần. (Nhập Excel đã sửa ở NT-MH-006 / 008; ô gõ tay chưa.) Ô Số ngày cần đủ hàng (cài riêng mã) cũng đọc "3.5" thành 35.

## 2. Sửa

- Ô số **giữ nguyên chữ đang gõ**; đọc như nhập Excel: **"1.500" / "1,500" = 1.500** (nghìn), **"1.5" / "1,5" = 1,5**; dấu ở cuối khi đang gõ ("1,") bỏ qua.
- Chữ / số âm → **viền đỏ**, giá trị không đổi (rê chuột: "Không phải số ≥ 0"). Rời ô → hiện lại số đã nhận (thập phân dấu phẩy, vd "1,5").
- Xoá hết chữ = 0 (như cũ). Ô max / min MH16 vẫn để trống khi bằng 0 (như cũ).
- Số ngày cần đủ hàng: đọc cùng cách; không phải số > 0 → báo lỗi, không lưu.

## 3. Phạm vi

`apps/web/src/phan-he/mua-hang/ton-max/chung.tsx` (thêm ô số dùng chung `OSo`), `apps/web/src/phan-he/mua-hang/ton-max/TonMaxPage.tsx`, `apps/web/src/phan-he/mua-hang/ton-max/DangKyMaxPage.tsx` (của Nguyễn Văn Thủy; đóng góp). Chỉ giao diện; API không đổi.

## 4. Kết quả mong đợi

| # | Thao tác | Mong đợi |
|---|---|---|
| 1 | MH16 gõ ô Max "1,5" / "1.5" | Nhận 1,5; rời ô hiện "1,5"; nút Lưu đếm 1 dòng sửa |
| 2 | MH16 gõ "1.500" | Nhận 1500 |
| 3 | MH16 gõ "abc" | Viền đỏ, giá trị không đổi |
| 4 | MH17 phiếu shop gõ Max đề nghị "2,5" | Nhận 2,5; cột Chênh tính đúng |
| 5 | MH16 cài riêng mã: Số ngày cần đủ hàng "3,5" | Lưu 3,5 (không phải 35) |

## 5. Kết quả chạy
| | |
|---|---|
| Ngày chạy | 25/11/2026 (máy dev, DB local, trình duyệt tự động, chặn lệnh ghi) |
| Bản code (commit) | nhánh `feat/nt-mh-009-o-so-go-tay` |
| Kết quả | Bước 1–4 đạt: "1,5" → 1,5; "1.5" → 1,5; "1.500" → 1500; "12" → 12; "abc" viền đỏ; MH17 "2,5" → 2,5, Chênh −32,5 (max hiện tại 35). Bước 5 chưa chạy. Typecheck web sạch |

## 6. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 7. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 25/11/2026 | Tạo và chốt theo yêu cầu |
