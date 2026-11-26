# NT-MH-017 · MH18, MH16: chọn lại đúng chi nhánh đang xem không treo / không mất số đang sửa
<!-- [2026-11-26 kiennt] NGHIEM-THU — tạo phiếu theo yêu cầu người dùng (đóng góp) -->

| | |
|---|---|
| Phân hệ | Mua hàng |
| Màn hình | MH18 Công thức đặt hàng · MH16 Tồn max |
| Bộ phận yêu cầu | Phòng kế toán (lỗi B1 khi kiểm thử MH16–MH19, 26/11/2026) |
| Ngày tạo | 26/11/2026 |
| Trạng thái | Đã chốt (kiennt, 26/11/2026) |

## 1. Yêu cầu

**Lỗi B1 (MH18):** ô Chi nhánh đang là Hà Nội, bấm chọn lại Hà Nội → màn **treo "Đang tải…"** tới khi tải lại trang. Nguyên nhân: đổi chi nhánh thì xoá cấu hình đang hiện rồi chờ tải công thức chi nhánh mới; chọn lại đúng chi nhánh cũ thì không có lần tải mới nên cấu hình không nạp lại.

**Cùng gốc ở MH16:** chọn lại đúng chi nhánh đang xem → về kho chi nhánh, **xoá các số max đang sửa chưa lưu** không báo.

**Sửa:** ô Chi nhánh ở MH18, MH16: chọn lại đúng chi nhánh đang xem thì không làm gì (giữ công thức đang sửa / shop, kho, số đang sửa). Đổi sang chi nhánh khác: như cũ.

## 2. Phạm vi

`apps/web/src/phan-he/mua-hang/ton-max/CongThucPage.tsx`, `apps/web/src/phan-he/mua-hang/ton-max/TonMaxPage.tsx` (của Nguyễn Văn Thủy — một điều kiện ở ô Chi nhánh; đóng góp). Chỉ giao diện. MH02, MH17, MH19 không xoá gì khi chọn lại nên không đổi.

## 3. Kết quả mong đợi

| # | Thao tác | Mong đợi |
|---|---|---|
| 1 | MH18: chọn lại đúng chi nhánh đang xem | Công thức vẫn hiện, không "Đang tải…" |
| 2 | MH18: đổi chi nhánh khác rồi đổi về | Mỗi lần hiện công thức đúng chi nhánh |
| 3 | MH16: đang sửa max (nút "Lưu (1)") → chọn lại đúng chi nhánh | Giữ shop đang xem và số đang sửa, vẫn "Lưu (1)" |
| 4 | MH16: đổi sang chi nhánh khác | Bỏ số đang sửa như cũ |

## 4. Kết quả chạy
| | |
|---|---|
| Ngày chạy | 26/11/2026 (máy dev, DB local `ketoan_otchuong`, trình duyệt tự động, chặn lệnh ghi) |
| Bản code (commit) | nhánh `feat/nt-mh-014-018-ton-max-sua-loi` |
| Kết quả | Bước 1: chọn lại Hà Nội → công thức hiện, không "Đang tải…" (trước khi sửa: treo). Bước 2: Hà Nội → Phú Thọ → Hà Nội đều hiện công thức. Bước 3: shop 07001 sửa 110011001 = 77 ("Lưu (1)") → chọn lại Hà Nội: giữ 07001, ô vẫn 77, "Lưu (1)". Bước 4: sang Phú Thọ → không còn số đang sửa. Typecheck web sạch |

## 5. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 6. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 26/11/2026 | Tạo và chốt theo yêu cầu (sửa lỗi B1) |
