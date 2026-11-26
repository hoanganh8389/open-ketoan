# NT-BH-051 · Tích điểm ở kế toán đủ như plugin cũ (module `loyalty`)
<!-- [2026-11-27 Võ Hoàng] NGHIEM-THU — NT-BH-051: Hoàng giao 27/11 "lấy y nguyên chức năng phần mềm cũ, cứ làm, hỏi sau" (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng — module `loyalty` (sổ điểm NT-BH-020, khai / duyệt NT-BH-039) |
| Màn hình | BH19 Điểm thành viên (`/app/loyalty/diem`): thêm thẻ **Thành viên**; bổ sung ô ở thẻ Chương trình, Đổi điểm, Cài đặt + hạng |
| Bộ phận | Bán hàng |
| Ngày tạo | 27/11/2026 |
| Trạng thái | **Đã chốt 27/11/2026** — bộ phận Bán hàng giao làm đủ như plugin `tgs_loyalty_points`, các chỗ phải chọn ghi ở §6 "Mặc định đã áp" để rà khi nghiệm thu |
| Căn cứ | Kế hoạch 80 §2b L1–L5 (so plugin cũ ↔ module); plugin cũ: `admin-views/add.php`, `detail.php`, `list.php`, `members.php`, `settings.php`, `dashboard.php`, `includes/class-loyalty-engine.php` |

## 1. Mục đích quản trị

Màn tích điểm ở kế toán **không thiếu gì** so với plugin website đang dùng, để tắt hẳn màn khai ở website (shop POS React chỉ xem).

## 2. Khai báo trước

- Sổ có chính sách tích điểm đã phát hành cho ít nhất một cửa hàng (NT-BH-039), có bảng hạng (vd Thành viên 0, Vàng 1.000).
- Khách có sổ điểm (đã bán đơn có khách ở máy bán, hoặc nạp số dư cũ).

## 3. Các bước thao tác

1. **Chương trình**: mở nháp → mỗi chính sách tích có thêm ô **Tự động áp**, **Giá trị đổi (đ / điểm)** (loại 1, 3), **Mô tả** (loại 3 nhân điểm), **Ghi chú**.
2. **Đổi điểm**: mỗi danh mục có thêm **Ưu tiên**, **Tự động áp**, **Từ ngày**; quà có **Theo dõi tồn**; voucher có **Số lượng** (số voucher phát mỗi lần đổi).
3. **Cài đặt + hạng**: bảng hạng có thêm **Màu**.
4. **Thành viên** (thẻ mới): tìm theo mã / tên / SĐT, lọc hạng, trang Trước / Sau; mỗi khách: hạng (màu), điểm hiện tại, tổng tích, tổng đổi, phát sinh cuối; nút **Lịch sử**, **+ Cộng**, **− Trừ**.
5. Bấm **Lịch sử**: bảng giao dịch điểm có cột **Trước / Sau** (như plugin cũ), chứng từ, cửa hàng, mô tả, hạn lô.
6. Bấm **+ Cộng / − Trừ**: mở hộp lập yêu cầu điều chỉnh điền sẵn mã khách và chiều cộng / trừ → người khác duyệt mới ghi sổ (giữ luật NT-BH-039, Q-CD-3).

## 4. Số liệu đầu vào

| Khách | Tích | Hoàn | Đổi | Hạng (Vàng từ 1.000) |
|---|---|---|---|---|
| 0901111111 Nguyễn Văn Ánh | 1.200 | −100 | 300 | Vàng (tổng tích 1.100) |
| 0902222222 | 50 | 0 | 0 | Thành viên |
| 0903333333 | 999 | 0 | 999 | Thành viên (số dư 0, không tụt do đổi) |

Voucher đổi điểm `lp_3_vc50k` 100 điểm, `voucher_quantity` = 3.

## 5. Kết quả mong đợi

| # | Kiểm | Mong đợi |
|---|---|---|
| 1 | Hạng ở thẻ Thành viên | theo **tổng đã tích** = tích + hoàn (âm); đổi điểm không tụt hạng (giống máy bán) |
| 2 | Tìm "anh" | ra Nguyễn Văn **Ánh** (tìm không dấu) |
| 3 | Lọc hạng Thành viên | 0902222222, 0903333333 — xếp điểm hiện tại giảm dần |
| 4 | Trang 9 khi chỉ có 2 trang | trả trang cuối |
| 5 | Lịch sử: tích 150 → đổi −100 → điều chỉnh +20,5 | Trước / Sau = 0→150, 150→50, 50→70,5; mới nhất trước; mô tả = lý do điều chỉnh |
| 6 | Đổi voucher số lượng 3 | máy bán nhận **3 mã voucher khác nhau** (in trên bill), trừ **100 điểm một lần** |
| 7 | Voucher không khai số lượng | 1 mã như trước |
| 8 | Ô mới (tự động áp, mô tả, giá trị đổi, ghi chú, theo dõi tồn, màu hạng) | lưu vào nháp, duyệt = phát hành, máy bán đọc được (khuôn `LoyaltyProgram` giữ nguyên, ô thêm qua `passthrough`) |
| 9 | Tự động áp = tắt | bộ tính bỏ chính sách đó (đã có ở engine: `p.autoApply`) |

Kế toán: không đổi — điểm chỉ hạch toán lúc đổi (NT-BH-020).

## 6. Trường hợp lệch chuẩn / Mặc định đã áp

| # | Chỗ | Đã áp |
|---|---|---|
| M1 | "Cho phép điều chỉnh tay" của plugin cũ | không thêm công tắc: quyền `loyalty:dieu-chinh-lap` / `-duyet` ở HT12 thay công tắc (Q-CD-3 đã chốt phải duyệt) |
| M2 | "Giá trị đổi (đ/điểm)" | lưu như plugin cũ; plugin cũ **không dùng** trong bộ tính (dùng điểm chỉ qua quà / voucher), nên máy bán cũng không quy điểm ra tiền — L5 "dùng điểm thanh toán" = đổi quà / voucher như cũ |
| M3 | Hoàn điểm đã đổi khi khách trả quà đổi điểm | plugin cũ không hoàn — giữ như cũ (hoàn điểm đã **tích** theo tỉ lệ tiền trả vẫn chạy, NT-BH-020) |
| M4 | Voucher số lượng N | điểm trừ ở voucher đầu, các voucher sau 0 điểm cùng phần thưởng (sổ điểm một dòng đổi) |
| M5 | Tên / SĐT ở thẻ Thành viên | đọc danh mục đối tượng (`bizcity_read.partners`); khách chưa có ở danh mục thì trống, mã = SĐT |
| M6 | Dashboard cũ "phân loại chương trình" | thẻ Tổng quan giữ báo cáo kỳ + số dư theo hạng; đếm chương trình theo loại xem ở thẻ Chương trình / Đổi điểm |
| M7 | Màn tích điểm ở website (shop POS React) | chỉ xem + **chặn ghi ở máy chủ** (plugin `tgs_loyalty_points` e51c110) + nút "Mở Điểm thành viên ở kế toán" |

## 7. Kết quả chạy

- Test hàm `modules/loyalty/test/nt-bh-051.test.ts`: 5 ca đạt (cùng 29 ca cũ của module: 34/34).
- `npx bizcity module check loyalty`: luật module, kế toán, kiểu máy chủ, kiểu giao diện đạt; test hợp đồng (CSDL) chưa chạy được trên máy lúc làm (Docker tắt) — chạy lại trước khi merge.

## 8. Biên bản nghiệm thu

| Người kiểm | Ngày | Kết quả |
|---|---|---|
| | | |

## 9. Lịch sử thay đổi

- 27/11/2026 — Lập và chốt theo giao việc của bộ phận Bán hàng; làm cùng ngày.
