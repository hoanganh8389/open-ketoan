# NT-MH-018 · Tồn max (MH16) nhập Excel: kiểm mã hàng, mã kho trước khi ghi
<!-- [2026-11-26 kiennt] NGHIEM-THU — tạo phiếu theo yêu cầu người dùng (đóng góp) -->

| | |
|---|---|
| Phân hệ | Mua hàng |
| Màn hình | MH16 Tồn max — **Nhập Excel** |
| Bộ phận yêu cầu | Phòng kế toán (lỗi B4 khi kiểm thử MH16–MH19, 26/11/2026) |
| Ngày tạo | 26/11/2026 |
| Trạng thái | Đã chốt (kiennt, 26/11/2026) |

## 1. Yêu cầu

**Lỗi B4:** nhập Excel ở MH16, dòng có mã hàng **không có trong danh mục** vẫn hiện ✓ ở xem trước. Bấm "Đưa … dòng hợp lệ vào" thì máy chủ **từ chối cả tệp** (không ghi dòng nào, kể cả dòng đúng) và báo "Dòng 2: …" — số thứ tự trong danh sách gửi, không phải số dòng Excel.

**Sửa:** xem trước kiểm từng dòng như MH17 (khung nhập Excel dùng chung đã có bước kiểm `check`):
- Mã hàng phải có trong danh mục mặt hàng.
- Có ghi Mã kho: kho phải thuộc chi nhánh / shop của dòng. Để trống Mã kho mà chi nhánh chưa có kho nào → báo.
- Dòng sai: tô đỏ, ghi lý do, **không đưa vào**; nút chỉ đưa các dòng hợp lệ → máy chủ không còn từ chối cả tệp vì một dòng.

Các kiểm khác (chi nhánh có trong sơ đồ, max / min là số ≥ 0, min ≤ max, max trống = bỏ qua): như cũ.

## 2. Phạm vi

`apps/web/src/phan-he/mua-hang/ton-max/TonMaxPage.tsx` (của Nguyễn Văn Thủy — thêm bước kiểm cho khung nhập Excel; đóng góp). Chỉ giao diện; API không đổi (máy chủ vẫn kiểm lần hai).

## 3. Kết quả mong đợi

| # | Thao tác | Mong đợi |
|---|---|---|
| 1 | Nhập tệp có: dòng đúng, mã không có, kho không thuộc chi nhánh, chi nhánh chưa có kho | Dòng đúng ✓; 3 dòng đỏ, mỗi dòng ghi lý do; số dòng = dòng Excel |
| 2 | Bấm "Đưa … dòng hợp lệ vào" | Chỉ ghi dòng đúng; báo "Đã ghi n dòng" |

## 4. Kết quả chạy
| | |
|---|---|
| Ngày chạy | 26/11/2026 (máy dev, DB local `ketoan_otchuong` — dữ liệu test, trình duyệt tự động) |
| Bản code (commit) | nhánh `feat/nt-mh-014-018-ton-max-sua-loi` |
| Kết quả | Bước 1: tệp 5 dòng (Hà Nội, shop 07002) — dòng 2 (110011002 = 21) ✓, dòng 6 ("10.0" = 10) ✓; dòng 3 "Mã KHONGCO chưa có trong danh mục mặt hàng", dòng 4 "Kho 07001-KHH không thuộc 07002 (kho của 07002: 07002-KHH)", dòng 5 "HOA chưa có kho — khai ở Danh mục kho". Bước 2: "Đưa 2 dòng hợp lệ vào" → "Đã ghi 2 dòng tồn max từ Excel."; DB 07002 · 110011002 = 21, 110011001 = 10; 190033001 không đổi. Trước khi sửa: cùng tệp → không ghi dòng nào. Typecheck web sạch |

## 5. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 6. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 26/11/2026 | Tạo và chốt theo yêu cầu (sửa lỗi B4) |
