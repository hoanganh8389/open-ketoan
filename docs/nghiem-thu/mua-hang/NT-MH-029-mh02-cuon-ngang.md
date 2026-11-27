# NT-MH-029 · Mua hàng (MH02, MH16, MH19): màn nhỏ / phóng to chữ — tên nhóm không trôi khi cuộn ngang, thanh công cụ gọn
<!-- [2026-11-27 kiennt] NGHIEM-THU — tạo phiếu theo yêu cầu người dùng (đóng góp) -->

| | |
|---|---|
| Phân hệ | Mua hàng |
| Màn hình | MH02 Phân tích đặt hàng; đi theo: MH16 Tồn max, MH19 Chuyển hàng xuống shop (cùng kiểu lưới) |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 27/11/2026 |
| Trạng thái | Chờ nghiệm thu |

## 1. Yêu cầu

Trên máy màn nhỏ hoặc đặt tỉ lệ phóng to chữ (125–150%), MH02 khó nhìn:
- Bảng nhiều cột phải cuộn ngang. Cuộn sang phải thì **tên nhóm** (nhãn · NCC · công nợ) trôi ra ngoài, chỉ còn các dải xám trống, không biết dòng nào thuộc NCC nào.
- Cột **SL đặt**: mã không có quy cách thùng vẫn hiện thêm một nút gợi ý, trùng đúng số đang nhập.
- Ở bề ngang khoảng 1100px, thanh công cụ bị gãy: nút **Lập đơn đặt** rớt xuống hàng hai.

Sửa:
1. Dòng tên nhóm **bám mép trái khung nhìn** khi cuộn ngang. Thông tin dài (công nợ, hạn mức, điều khoản) thì xuống dòng. Áp cho mọi lưới mua hàng cùng kiểu: MH02, MH16, MH19.
2. SL đặt: **bỏ nút gợi ý khi chỉ có một gợi ý và đúng bằng số đang nhập**. Mã có thùng vẫn hai nút làm tròn xuống / lên như cũ.
3. Thanh công cụ MH02: ô **Hiện** rộng cố định 200px, ô tìm co được tới 140px. Ở 1100px vẫn nằm một hàng.

## 2. Phạm vi

| Tệp | Thay đổi |
|---|---|
| `apps/web/src/phan-he/mua-hang/ton-max/ton-max.css` | Dòng nhóm của `.tm-grid` bám mép trái khi cuộn ngang, giới hạn rộng theo màn hình, xuống dòng khi dài |
| `apps/web/src/phan-he/mua-hang/dat-hang/DatHangPage.tsx` | Ẩn nút gợi ý trùng ở SL đặt; ô Hiện / ô tìm gọn hơn |

Chỉ giao diện.

## 3. Kết quả mong đợi

| # | Thao tác | Mong đợi |
|---|---|---|
| 1 | MH02 ở màn 1100px (hoặc phóng to chữ 125–150%), Hiện = Tất cả mã, cuộn bảng hết sang phải | Mọi dòng tên nhóm vẫn hiện ở mép trái khung bảng |
| 2 | Xem cột SL đặt | Mã không có thùng: chỉ ô nhập. Mã có thùng (vd 6/Thùng): ô nhập + 2 nút làm tròn |
| 3 | Thanh công cụ ở 1100px | Hiện · Tìm · Công thức · Xuất Excel · Lập đơn đặt cùng một hàng |

## 4. Kết quả chạy

| | |
|---|---|
| Ngày chạy | 27/11/2026 (máy dev, DB local `ketoan_otchuong`, Hà Nội, cửa sổ 1100×800, trình duyệt tự động, chặn lệnh ghi) |
| Bản code (commit) | nhánh `feat/nt-mh-029-kho-006-tra-cho` |
| Kết quả | Bước 1 **đạt**: cuộn hết sang phải, 8 dòng nhóm (Anlene, Aptamil, Goon ×2, Nhóm mới 3061, Vinamilk ×2…) đều ở mép trái khung (x = mép khung + 10px). Lần đầu thử, 2 nhóm có dòng công nợ dài vẫn bị đẩy ra ngoài; đã sửa bằng cách giới hạn rộng và cho xuống dòng. Bước 2 **đạt**: số nút gợi ý mỗi dòng 0 (mã không thùng) hoặc 1–2 (mã có thùng). Bước 3 **đạt**: thanh công cụ một hàng. Typecheck web sạch |

## 5. Biên bản nghiệm thu

| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 6. Lịch sử thay đổi

| Ngày | Thay đổi |
|---|---|
| 27/11/2026 | Tạo theo yêu cầu (ảnh MH02 trên máy tỉ lệ màn hình lớn) |
