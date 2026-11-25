# NT-MH-007 · Tồn max: phiếu hàng mới (MH17) chi nhánh lên tiêu đề, bỏ nhãn vàng; MH16 bỏ dải ô đếm
<!-- [2026-11-25 kiennt] NGHIEM-THU — tạo phiếu theo yêu cầu người dùng (đóng góp) -->

| | |
|---|---|
| Phân hệ | Mua hàng |
| Màn hình | MH17 — cửa sổ phiếu đăng ký max hàng mới; MH16 Tồn max |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 25/11/2026 |
| Trạng thái | Đã chốt (kiennt, 25/11/2026) |

## 1. Yêu cầu

Bỏ nhãn vàng "Chi nhánh 08000 · 2 shop" đầu phiếu hàng mới; đưa thông tin đó lên tiêu đề cửa sổ: **"Phiếu đăng ký max hàng mới — Kho tổng Phú Thọ (08000) · 2 shop"** (phiếu đã lưu: số phiếu ở đầu, trạng thái ở cuối như cũ). Phần khác của phiếu không đổi.

**Bổ sung (25/11):** **MH16 Tồn max** bỏ dải ô đếm (Số mã / Đã có max / Đang dưới max / Có bán, chưa có max / Max lệch gợi ý > 30%) — các ô này kiêm lọc nhanh; nay lọc bằng ô lọc từng cột của lưới (Tồn, Gợi ý max, Tồn max…) và Nhóm hàng. Dòng chú thích "Đang xem kho … · bán / ngày đo trong …" giữ nguyên.

## 2. Phạm vi

`apps/web/src/phan-he/mua-hang/ton-max/DangKyMaxPage.tsx`, `apps/web/src/phan-he/mua-hang/ton-max/TonMaxPage.tsx` (của Nguyễn Văn Thủy; đóng góp). Chỉ giao diện.

## 3. Kết quả mong đợi

| # | Thao tác | Mong đợi |
|---|---|---|
| 1 | MH17 → Phiếu hàng mới | Tiêu đề cửa sổ có tên, mã chi nhánh, số shop; không còn nhãn vàng |
| 2 | Mở lại phiếu hàng mới đã lưu | Tiêu đề: số phiếu · … — trạng thái |
| 3 | Phiếu shop đăng ký max | Không đổi |
| 4 | Mở MH16 | Không còn dải ô đếm; lưới, lọc cột, Nhóm hàng, Lưu như cũ |

## 4. Kết quả chạy
| | |
|---|---|
| Ngày chạy | 25/11/2026 (máy dev, DB local, trình duyệt tự động) — bước 1: tiêu đề "Phiếu đăng ký max hàng mới — Kho tổng Phú Thọ (08000) · 2 shop", không còn nhãn vàng; typecheck sạch |
| Bản code (commit) | nhánh `feat/nt-mh-007-nhan-chi-nhanh-len-tieu-de` |

## 5. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 6. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 25/11/2026 | Tạo và chốt theo yêu cầu |
| 25/11/2026 | Bổ sung: MH16 bỏ dải ô đếm |
