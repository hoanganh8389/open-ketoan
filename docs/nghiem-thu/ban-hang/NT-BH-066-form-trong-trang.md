<!-- [2026-11-29 05:45 PM Võ Hoàng] NGHIEM-THU — NT-BH-066: phiếu form khuyến mại / tích điểm / voucher mở ngay trên màn như MH29, khung FormPage dùng chung (đóng góp) -->
# NT-BH-066 · BH18 / BH19 / BH21: form mở ngay trên màn như MH29, khung dùng chung

| | |
|---|---|
| Phân hệ | Bán hàng — BH18 Khuyến mại (module `pos`), BH19 Điểm thành viên (module `loyalty`), BH21 Voucher (module `voucher`); khung `@bizcity/ui-kit` |
| Ngày tạo | 29/11/2026 |
| Trạng thái | **Đã chốt — Hoàng 29/11**: "giao diện xấu quá, đối với modal mà thừa quá nhiều khoảng trắng, yêu cầu làm giống như bên Mua hàng, khi bấm Thêm hợp đồng thì không ra modal nữa mà chuyển trang, vẫn ở MH29 nhưng sang component khác, tạo component chung cho 3 phần policy, voucher & tích điểm để dùng chung" |
| Căn cứ | MH29 Hợp đồng mua hàng (trang một hợp đồng: đầu trang ← · tiêu đề · Ghi / Huỷ; danh sách bước; lưới 3 cột); NT-BH-063 (thanh bước ngang ở trên — màn nhỏ) |

## 1. Vì sao cần

- Form khai khuyến mại / chương trình tích điểm / đợt voucher mở trong hộp thoại lớn: nhiều khoảng trắng, nút Ghi ở chân hộp, màn nhỏ phải cuộn.
- MH29 đã quen tay người dùng: bấm "+ Thêm hợp đồng" là sang trang form ngay trên màn, đầu trang có ← và nút Ghi / Huỷ.
- Ba màn đang có ba bản thanh bước giống nhau (NT-BH-063) — gộp về một khung chung.

## 2. Làm

| # | Việc | Chỗ |
|---|---|---|
| 1 | Khung **FormPage** dùng chung: đầu trang (← về danh sách, tiêu đề, dòng phụ, nút bên phải), câu báo dưới đầu trang, thanh bước **ngang** (bấm / ← → chuyển bước, ⚠ bước còn lỗi), thẻ thân, Bước trước / Bước tiếp; cột phải tuỳ chọn (trợ lý); Esc về danh sách, Ctrl + S ghi. **FormGrid**: lưới 3 cột kín như MH29. **useFormParam**: giữ `?…=` trên URL để tải lại / Back của trình duyệt về đúng chỗ (không cần router). Vẽ bằng lớp sẵn có (`.card`, `.btn`, `.nx-steps`), không thêm CSS | `packages/ui-kit/src/form-page.tsx`, `packages/ui-kit/src/index.tsx` |
| 2 | BH18: Thêm / bấm đúp / Nhân bản / mở nháp → form ngay trên màn (`?ct=<mã>` / `?ct=moi`); Ghi · Gửi duyệt · Duyệt (phát hành) · Thoát ở đầu trang | `modules/pos/web/screens/KhuyenMaiPage.tsx`, `modules/pos/web/screens/khuyen-mai/PolicyForm.tsx` |
| 3 | BH19: Thêm / Sửa / bấm đúp chương trình tích điểm (và danh mục đổi điểm) → form ngay trên thẻ (`?ct=`); Ghi · Gửi duyệt · Duyệt · Thoát ở đầu trang | `modules/loyalty/web/screens/diem/ChuongTrinhTab.tsx`, `modules/loyalty/web/screens/diem/ChuongTrinhModal.tsx` |
| 4 | BH21: Thêm đợt / Sửa đợt → form ngay trên thẻ Đợt phát (`?dot=<id>` / `?dot=moi`), bỏ khung DocSheet; ô xếp lưới 3 cột kín; Trợ lý (Kiểm tra / Tóm tắt) ở cột phải; Ghi · Huỷ ở đầu trang | `modules/voucher/web/screens/VoucherPage.tsx` |
| 5 | Bỏ 3 bản `ThanhBuoc.tsx` (NT-BH-063) — thay bằng thanh bước của FormPage | `modules/{pos,loyalty,voucher}/web/screens/**/ThanhBuoc.tsx` |

## 3. Các bước nghiệm thu (thử trên máy local)

1. BH18 → **+ Thêm**: màn đổi sang form (không hộp thoại), URL có `?ct=`; đầu trang ← · "Tạo chương trình mới …" · Ghi / Gửi duyệt / Duyệt / Thoát. Đi 4 bước bằng thanh bước và Bước tiếp; Duyệt → về danh sách, có chương trình mới.
2. Bấm đúp một khuyến mại → form sửa đúng nội dung; tải lại trang (F5) → vẫn mở đúng chương trình; Back của trình duyệt → về danh sách.
3. BH19 → Thêm chương trình tích điểm → form trên thẻ; Thoát / Esc → về danh sách.
4. BH21 → **+ Thêm đợt** → form trên thẻ, lưới 3 cột, Trợ lý bên phải; Ghi (hoặc Ctrl + S) → về danh sách có đợt mới; Sửa → form mở lại đúng đợt.
5. Màn 1366 px: không còn khoảng trắng lớn như hộp thoại cũ; thanh bước nằm ngang trên thẻ.
6. Hồi quy: chương trình vừa duyệt áp đúng trên máy bán POS.

## 4. Kết quả chạy

- Test: `modules/pos/test/form-trong-trang.test.ts` (trạng thái bước, đọc tham số URL); module pos / loyalty / voucher chạy đủ.
- Thử giao diện: xem báo cáo `docs123/docs/module-pos/98-KET-QUA-THU-066.md` (máy local).

## 5. Mặc định đã áp (rà khi nghiệm thu)

- M1: Nút ở đầu trang giữ đúng bộ nút của từng màn (KM: Ghi / Gửi duyệt / Duyệt / Thoát — Duyệt trong phiếu như chốt 28/11; voucher: Ghi / Huỷ như MH29).
- M2: Hộp nhỏ (chọn loại có hạn mức, chi tiết đợt voucher, ngừng, thử tính, duyệt chờ) giữ là hộp thoại — không phải form khai.
- M3: Chương trình loại mới ẩn (KmForm, hạn mức) vẫn mở hộp cũ — đã ẩn khỏi Thêm từ NT-BH-049.
