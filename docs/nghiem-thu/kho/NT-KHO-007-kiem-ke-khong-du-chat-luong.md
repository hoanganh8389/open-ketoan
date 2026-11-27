# NT-KHO-007 · Biên bản kiểm kê: gộp "Kém PC" và "Mất PC" thành "Không đủ chất lượng"
<!-- [2026-11-27 kiennt] NGHIEM-THU — tạo phiếu theo yêu cầu người dùng (đóng góp) -->

| | |
|---|---|
| Phân hệ | Kho |
| Màn hình | Kiểm kê kho → Biên bản kiểm kê (danh sách + hộp thoại) |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 27/11/2026 |
| Trạng thái | Chờ nghiệm thu |

## 1. Yêu cầu

Bảng hàng của biên bản kiểm kê đang có hai cột **Kém PC** (kém phẩm chất) và **Mất PC** (mất phẩm chất). Hai cột lấy theo mẫu 05-VT:
- kém phẩm chất: hàng còn dùng / bán được nhưng giảm chất lượng (móp, bạc màu, cận hạn…);
- mất phẩm chất: hàng hỏng hẳn, không còn giá trị sử dụng.

Trong phần mềm, hai cột này **xử lý giống hệt nhau**:
- cộng lại, phải ≤ số kiểm kê;
- khi Ghi nhận chênh lệch, tổng hai cột được chuyển sang **kho cách ly**, không ghi giảm 156;
- không có bút toán riêng hay mẫu in riêng cho từng loại.

Người dùng thấy rối, nên gộp lại thành **một cột "Không đủ chất lượng"**.

- Bảng hàng: một cột **Không đủ chất lượng**, rê chuột vào tiêu đề có giải thích. Dòng Tổng thẳng cột.
- **Nhập kết quả từ Excel**: mẫu mới là *Mã hàng · Số lô · Số kiểm kê · Không đủ chất lượng · HSD thực tế*. Tệp mẫu cũ 6 cột (Kém PC · Mất PC) vẫn nhận được, hai số được cộng lại.
- Danh sách biên bản: cột "Kém / mất PC" đổi thành **Không đủ CL**.
- Dữ liệu và API **không đổi**: vẫn hai trường. Số nhập mới ghi vào trường kém phẩm chất, mất phẩm chất = 0. Biên bản cũ hiện tổng hai số. Cách ghi nhận chênh lệch, kho cách ly, xác minh, quyết định xử lý không đổi.

## 2. Phạm vi

| Tệp | Thay đổi |
|---|---|
| `apps/web/src/phan-he/kho/kiem-ke/BienBanKiemKe.tsx` | Một cột; dán Excel nhận mẫu mới 5 cột và mẫu cũ 6 cột; sửa số cột của dòng tổng và dòng trống |
| `apps/web/src/phan-he/kho/kiem-ke/KiemKePage.tsx` | Tiêu đề cột danh sách |
| `docs/huong-dan/kiem-ke-kho.md` | Hướng dẫn theo cột mới |

Chỉ giao diện.

## 3. Kết quả mong đợi

| # | Thao tác | Mong đợi |
|---|---|---|
| 1 | Kiểm kê → + Thêm → chọn chi nhánh → Lấy số tồn | Bảng có cột "Không đủ chất lượng", không còn Kém PC / Mất PC |
| 2 | Nhập kết quả từ Excel, mẫu cũ: `mã · lô · 30 · 3 · 2 · HSD` | Không đủ chất lượng = 5 |
| 3 | Nhập kết quả từ Excel, mẫu mới: `mã · lô · 30 · 4 · HSD` | Không đủ chất lượng = 4; dòng Tổng = 4, đúng cột |
| 4 | Mở biên bản cũ có Kém 2 + Mất 1 | Cột hiện 3 |
| 5 | Ghi nhận chênh lệch | Chuyển số "Không đủ chất lượng" sang kho cách ly như trước |

## 4. Kết quả chạy

| | |
|---|---|
| Ngày chạy | 27/11/2026 (máy dev, DB local `ketoan_otchuong`, chi nhánh 07000, trình duyệt tự động, chặn lệnh ghi) |
| Bản code (commit) | nhánh `feat/nt-kho-007-kiem-ke-khong-du-chat-luong` |
| Kết quả | Bước 1 **đạt**: tiêu đề `… Theo sổ · Theo kiểm kê · Chênh lệch · Không đủ chất lượng · Ghi chú`. Bước 2 **đạt**: ô = 5. Bước 3 **đạt**: ô = 4, dòng Tổng `45 · 70 · +25 · 4`, đúng cột. Bước 4 **chưa chạy**: ô hiện tổng hai trường. Bước 5 **chưa chạy**: API không đổi, phép cộng hai trường giữ nguyên. Typecheck web sạch |

## 5. Biên bản nghiệm thu

| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 6. Lịch sử thay đổi

| Ngày | Thay đổi |
|---|---|
| 27/11/2026 | Tạo theo yêu cầu (ảnh biên bản kiểm kê trên máy dev) |
