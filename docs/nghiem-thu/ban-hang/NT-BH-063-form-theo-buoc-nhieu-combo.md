<!-- [2026-11-29 01:30 AM Võ Hoàng] NGHIEM-THU — NT-BH-063: phiếu Mua X tặng Y nhiều combo, khoảng ngày khuyến mãi, form khuyến mại / tích điểm / voucher chia bước ngang (đóng góp) -->
# NT-BH-063 · Mua X tặng Y nhiều combo; khoảng ngày khuyến mãi; BH18 / BH19 / BH21 chia bước ngang

| | |
|---|---|
| Phân hệ | Bán hàng — BH18 Khuyến mại (module `pos`), BH19 Điểm thành viên (module `loyalty`), BH21 Voucher (module `voucher`); khuôn `sale.promo.buy_x_get_y@2` |
| Ngày tạo | 29/11/2026 |
| Trạng thái | **Đã chốt — Hoàng 29/11**: (1) Mua X tặng Y phải có nhiều combo mua – tặng khác nhau trong một chương trình như plugin cũ; (2) khối "Chọn thời gian khuyến mãi" chỉ mở ô Từ – Đến khi tích "Chỉ áp dụng trong khoảng thời gian", bỏ ô "Áp dụng từ ngày (bản phát hành)", ngày áp lấy từ ô trên; (3) BH18 / BH19 / BH21 chia bước như MH29 nhưng thanh bước nằm ngang ở trên (màn nhỏ) |
| Căn cứ | NT-BH-049 (BH18 theo mẫu plugin cũ), NT-BH-059 (BH19 theo luồng), NT-BH-050 (BH21); plugin cũ `tgs_selling_policy` loại 2 (mỗi rule `buy_x_get_y` một bộ hàng mua + quà) |

## 1. Vì sao cần

- Plugin cũ cho một chương trình "Mua X tặng Y" có **nhiều rule**, mỗi rule một bộ hàng mua và quà riêng (vd mua 2 Dielac tặng 1 bình; mua 1 Optimum tặng 2 khăn). Form BH18 của NT-BH-049 chỉ có **một** bảng hàng mua và một bảng quà → phải lập nhiều chương trình, khó theo dõi.
- Khối thời gian luôn hiện ô ngày dù chưa tích; thêm ô "Áp dụng từ ngày (bản phát hành)" trùng nghĩa với "Từ ngày" làm người khai nhầm.
- Form BH18 / BH19 / BH21 dài, dồn trong 2 thẻ; màn nhỏ phải cuộn nhiều. MH29 chia bước rõ, nhưng thanh bước dọc bên trái chiếm chỗ.

## 2. Làm

| # | Việc | Chỗ |
|---|---|---|
| C1 | Khuôn `buy_x_get_y@2` thêm `combos[]` (2–20 combo, mỗi combo `buy` + `get` như khuôn); có `combos` thì **tính từng combo riêng** rồi cộng quà; điều kiện chung (thời gian, đơn tối thiểu…) xét một lần; quà lựa chọn lọc theo quà của từng combo; combo chưa chọn quà → `pendingChoice` của combo đó (máy bán hỏi lần lượt). `buy` / `get` giữ bằng combo 1 cho bản cũ | `apps/api/src/modules/system/rule-contracts/sale-promo-v2.ts` (+ 3 ca mẫu) |
| C2 | Module pos: mã hàng của chương trình (`skusOf` — đối chiếu chương trình trùng, hạn mức) gồm mã mua / quà của mọi combo. **Chưa làm:** hàng chính khi trả (`policyMainSkus` ở `returns.ts`) vẫn đọc combo 1 — tệp đang thuộc dòng NT-BH-061; làm khi 061 vào | `modules/pos/api/domain/promo.ts` |
| C3 | BH18 loại Mua X tặng Y: nút **+ Thêm combo mua – tặng**, mỗi combo một bảng hàng mua + bảng quà (Mã SKU, Tên, SL, Đơn vị), Xoá combo; kiểm: combo thiếu hàng mua / quà, mã mua trùng giữa các combo | `modules/pos/web/screens/khuyen-mai/PolicyForm.tsx`, `old-types.ts` |
| T1 | "Chọn thời gian khuyến mãi": ô Từ ngày – Đến ngày chỉ hiện khi tích "Chỉ áp dụng trong khoảng thời gian" (khung giờ, ngày trong tuần cũng vậy); **bỏ** ô "Áp dụng từ ngày (bản phát hành)". Ngày áp của bản phát hành = Từ ngày (nếu tích và muộn hơn) — không tích thì ngày duyệt (sửa chương trình đang chạy: từ ngày mai như trước) | `PolicyForm.tsx` |
| B1 | Thanh bước ngang dùng lớp `.nx-steps` của khung (cùng kiểu `Steps` ui-kit), bấm / phím ← → để chuyển, ⚠ ở bước còn ô sai; nút Bước trước / Bước tiếp | `ThanhBuoc.tsx` (pos, loyalty, voucher — module không nhập chéo) |
| B2 | BH18: 1 Thông tin chung · 2 Thời gian & điều kiện · 3 Đối tượng áp dụng · 4 Hàng & quà | `PolicyForm.tsx` |
| B3 | BH19 (hộp chương trình tích / đổi điểm): 1 Loại & thông tin chung · 2 Thời gian & áp dụng cho · 3 Cách tính điểm / Phần thưởng; máy chủ báo lỗi thì tự chuyển tới bước có ô sai | `modules/loyalty/web/screens/diem/ChuongTrinhModal.tsx` |
| B4 | BH21 (đợt voucher): 1 Thông tin đợt · 2 Thời gian & cửa hàng · 3 Giá trị & điều kiện · 4 Cách phát; giữ khung DocSheet + trợ lý bên phải | `modules/voucher/web/screens/VoucherPage.tsx` |

## 3. Các bước nghiệm thu (thử trên máy local)

1. BH18 → Tạo chương trình mới → loại **Mua X tặng Y**: thanh bước 4 bước nằm ngang; bước 4 có Combo 1 + nút Thêm combo.
2. Combo 1: mua 2 mã A tặng 1 quà QA; combo 2: mua 1 mã B tặng 1 quà QB → Duyệt (phát hành).
3. Máy bán shop: bán 2 A + 1 B → giỏ có quà QA và QB; bán chỉ 1 B → chỉ có QB.
4. Bước 2: không tích "Chỉ áp dụng trong khoảng thời gian" → không có ô ngày; tích → hiện Từ ngày – Đến ngày; không còn ô "Áp dụng từ ngày (bản phát hành)".
5. Chương trình Từ ngày = ngày mai → Duyệt → máy bán hôm nay **không** áp; danh sách hiện ngày bắt đầu là ngày mai.
6. BH19 → Thêm chương trình tích điểm: 3 bước ngang; để trống Tên rồi Duyệt → bước 1 có ⚠ và tự chuyển về bước 1.
7. BH21 → Thêm đợt: 4 bước ngang; trợ lý bên phải vẫn kiểm.

## 4. Số liệu mong đợi (test `apps/api/test/sale-promo-v2.test.ts` — bộ ca mẫu của khuôn)

| Ca | Kết quả |
|---|---|
| 2 combo: mua 4 A (2 A / lần → QA) + 1 B (→ 2 QB) | quà QA × 2, QB × 2 |
| 2 combo, chỉ đủ combo 2 | chỉ QB, dòng chạm chỉ B |
| combo 2 có 2 quà lựa chọn, khách chọn QB2 | quà QA + QB2 |

## 5. Mặc định đã áp (rà khi nghiệm thu)

| Mã | Mặc định | Lý do |
|---|---|---|
| M1 | Các combo **cộng dồn** (mua đủ combo nào được quà combo đó) | Giống plugin cũ: mỗi rule tính riêng |
| M2 | Một mã mua **không** được nằm ở hai combo | Tránh một món hàng được tính quà hai lần |
| M3 | Combo 2.. bỏ trống cả hai bảng thì bỏ qua khi lưu | Thêm nhầm combo không chặn lưu |
| M4 | Không tích khoảng thời gian → áp từ ngày duyệt, không hạn | Bỏ ô ngày phát hành trùng nghĩa |
