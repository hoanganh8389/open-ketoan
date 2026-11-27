# NT-MH-027 · Mua hàng: ẩn khung cảnh báo vàng "Chưa nhận được kho tổng"
<!-- [2026-11-27 kiennt] NGHIEM-THU — tạo phiếu theo yêu cầu người dùng (đóng góp) -->

| | |
|---|---|
| Phân hệ | Mua hàng |
| Màn hình | MH02 Phân tích đặt hàng · MH16 Tồn max · MH17 Phiếu đăng ký tồn max · MH18 Công thức đặt hàng · MH19 Chuyển hàng xuống shop |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 27/11/2026 |
| Trạng thái | Chờ nghiệm thu |

## 1. Yêu cầu

Khung cảnh báo vàng ở đầu các màn mua hàng chiếm nhiều chỗ, nên **ẩn đi**. Khung có hai dạng:
- "Chưa nhận được kho tổng cho: Quản lý kho (KHO) — 1 cửa hàng, …"
- "Chưa có sơ đồ tổ chức…"

Khung này có từ NT-MH-012. Ẩn ở cả 5 màn dùng chung nó: MH02, MH16, MH17, MH18, MH19.

- Cách chia đơn vị mua hàng / kho tổng / shop **không đổi**. Cửa hàng chưa thuộc kho tổng nào vẫn không vào phân tích, giống như trước.
- Muốn biết cửa hàng nào chưa có kho tổng thì xem ở **Sơ đồ tổ chức (DM16)**.

## 2. Phạm vi

| Tệp | Thay đổi |
|---|---|
| `apps/web/src/phan-he/mua-hang/ton-max/chung.tsx` | `ChuaPhanCap` không hiện gì nữa. Giữ tên component nên 5 màn không phải sửa. Bỏ import `Link` không còn dùng |

Chỉ giao diện.

## 3. Kết quả mong đợi

| # | Thao tác | Mong đợi |
|---|---|---|
| 1 | Mở lần lượt MH02, MH16, MH17, MH18, MH19 trên máy có chi nhánh chưa nhận kho tổng (vd dev: KHO, NB001, V002, V001) | Không còn khung vàng; phần còn lại của màn như cũ |

## 4. Kết quả chạy

| | |
|---|---|
| Ngày chạy | 27/11/2026 (máy dev, DB local `ketoan_otchuong`, trình duyệt tự động) |
| Bản code (commit) | nhánh `feat/nt-mh-024-027-mua-hang` |
| Kết quả | Mở 5 màn, không thấy chữ "Chưa nhận được kho tổng" hay "Chưa có sơ đồ tổ chức". DB local vốn không có chi nhánh thiếu kho tổng, nên lần chạy này chưa thử đúng tình huống trên ảnh dev. Code: `ChuaPhanCap` trả về rỗng ở mọi trường hợp. Typecheck web sạch. **Cần xem lại trên máy dev** |

## 5. Biên bản nghiệm thu

| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 6. Lịch sử thay đổi

| Ngày | Thay đổi |
|---|---|
| 27/11/2026 | Tạo theo yêu cầu (ảnh MH17 máy dev) |
