# NT-BH-049 · Khuyến mại BH18 đủ như plugin cũ — khuôn @2 dùng được thật, đủ cài đặt một chương trình, máy bán chọn quà
<!-- [2026-11-27 10:00 AM Võ Hoàng] NGHIEM-THU — NT-BH-049: chốt theo giao việc 27/11 "làm đủ như plugin cũ" (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng — BH18 Chương trình khuyến mại (module `pos`), bộ tính chính sách của Core (`core.policy.evaluate`), máy bán POS React |
| Ngày tạo | 27/11/2026 |
| Trạng thái | **Đã chốt 27/11/2026** (Võ Hoàng giao: "lấy y nguyên từ phần mềm cũ về chức năng, nhất là policy, cần đủ các setting cho 1 policy, có nhiều dòng") — các điểm tự chọn ghi ở §6 *Mặc định đã áp*, rà lại khi nghiệm thu |
| Căn cứ | Kế hoạch 80 (S-CD-6…11, K1–K11), NT-BH-040 (khuôn `sale.promo.*@2`), plugin cũ `tgs_selling_policy` |

## 1. Vì sao cần

NT-BH-040 đã có ba khuôn `@2` (giá riêng từng mã, mua nhiều mã + quà lựa chọn, quà theo tổng đơn nhân bội số) và form BH18 có ba loại đó,
nhưng **chưa dùng được thật**:

| Chỗ hở | Hậu quả |
|---|---|
| Danh sách khuôn của bản nháp (`modules/pos/api/domain/promo.ts` `PROMO_CONTRACTS`) chỉ có 6 khuôn `@1` | Chọn loại `@2` ở BH18, bấm Lưu → máy chủ từ chối; người dùng không bao giờ thấy chương trình nhiều dòng được lưu |
| Bộ tính (`policy-service.evaluatePolicies`) không điền nhóm / nhãn của dòng | Chương trình có phạm vi nhóm / nhãn luôn bị chặn "chưa biết nhóm / nhãn" |
| Bộ tính không nhận `giftChoice`, máy bán không có chỗ chọn quà | Chương trình quà lựa chọn không bao giờ ra quà ở máy bán |
| Còn thiếu cài đặt so với plugin cũ: ĐVT quy đổi, khung giờ qua đêm, sinh nhật theo ngày / tuần, loại đơn, lượt theo khách, cảnh báo hàng dưới 24 tháng, nhân bản, dán nhiều mã từ Excel, mẫu flash sale | Không khai được như trước |

## 2. Làm

| # | Việc | Chỗ |
|---|---|---|
| A1 | Mở ba khuôn `@2` cho bản nháp; mã hàng của chương trình `@2` cho cảnh báo trùng; hàng chính khi trả hàng | `modules/pos/api/domain/promo.ts`, `domain/returns.ts` |
| A2 | Bộ tính điền `groupCodes` (nhóm + mọi nhóm cha) và `brandCode` của dòng từ danh mục khi có chương trình `@2` phạm vi nhóm / nhãn; mã không có ở danh mục = không thuộc nhóm | `apps/api/.../rule-contracts/policy-service.ts` |
| A3 | Evaluate nhận `giftChoice` (theo mã chương trình) và `orderType`; chương trình chờ chọn quà trả `pendingChoices[]` (không im lặng) | `policy-service.ts`, `policy.routes.ts` |
| A4 | Máy bán: khung Khuyến mãi hiện "khách chọn N quà" với nút từng quà; chọn đủ thì Core tính lại, thêm dòng quà; thân evaluate kèm `orderType: retail` | `tgs_pos/react` (nhánh riêng, luồng bán) |
| K7 | Giá riêng từng mã: khai theo ĐVT quy đổi (`unit { name, ratio }`): bậc số lượng, tối đa, giá / giảm tiền mỗi cái tính theo ĐVT đó | khuôn `price_lines@2`, form |
| K9 | Khung giờ qua đêm (giờ bắt đầu sau giờ kết thúc); sinh nhật **đúng ngày / trong tuần / trong tháng**; **loại đơn** (lẻ / sỉ / đặt hàng); mã giảm giá = chỉ áp khi khách đọc mã (thay ô "Tự động áp" của plugin cũ) | `promoConditions` (thêm ô, không đổi nghĩa ô cũ), form |
| K6 | **Lượt tối đa mỗi khách** (mọi cửa hàng; khách lẻ không giới hạn); máy bán không nhận đơn khi khách đã dùng hết lượt | migration module `0013_promo_uses_customer.sql`, `promo.ts`, `order-service.ts` |
| K5 | Cảnh báo hàng dưới 24 tháng (cờ `is_under_24m` ở danh mục) ngay trên form — NĐ100/2014 | `GET /api/v1/products` trả thêm `isUnder24m`, KmForm |
| K10 | Mẫu dựng sẵn khi Thêm: Flash sale, Khai trương, Sinh nhật khách hàng | KhuyenMaiPage |
| K11 | **Nhân bản** khuyến mại đang chọn; **Dán từ Excel** nhiều mã vào "Giá riêng từng mã"; Xuất Excel danh sách (đã có) | KhuyenMaiPage, KmForm, `parsePriceLines` |
| — | Thử tính: chọn quà, loại đơn, ngày sinh khách | KhuyenMaiPage |

## 3. Các bước nghiệm thu (máy local)

1. BH18 → **+ Thêm → Giá riêng từng mã (nhiều mã)**, mã `KM-NHIEU-DONG`, áp từ hôm nay. Dòng 1: SP-A giảm 10 %. Dòng 2: SP-B giá chương trình 90.000.
   Dòng 3: SP-C theo bậc từ 3 cái giảm 5 %, từ 6 cái giảm 10 %. Dòng 4: SP-D ĐVT `Thùng` = 24, từ 2 thùng giá 2.000.000 / thùng. **Lưu và gửi duyệt** → được lưu.
2. Người khác có quyền Duyệt khuyến mại duyệt → phát hành. Thẻ Khuyến mại hiện `KM-NHIEU-DONG` "Đang chạy".
3. **Dán từ Excel**: dán 20 dòng (Mã ⇥ % ⇥ 5) → bảng có 20 mã.
4. **Mua nhiều mã tặng quà (quà lựa chọn)**: mua bất kỳ SP-A / SP-B tổng 3, khách chọn 1 trong Q1 / Q2 → duyệt.
   Máy bán: giỏ 2 SP-A + 1 SP-B → khung Khuyến mãi hiện "khách chọn 1 quà" + nút Q1 / Q2 → bấm Q2 → có dòng quà Q2 0 đ → thanh toán được.
5. Phạm vi nhóm: chương trình giá riêng có phạm vi nhóm `SUA` → mã thuộc nhóm con của `SUA` được giảm, mã nhóm khác không.
6. Điều kiện: khung 22:00–02:00 lúc 23:30 áp, 12:00 không; chỉ đơn sỉ → máy bán không áp; sinh nhật trong tuần (Thử tính, ngày sinh cùng tuần) áp.
7. Lượt mỗi khách = 1: khách K01 mua lần 1 được giảm; lần 2 cùng khách → máy bán báo "đã dùng hết lượt khuyến mại", bỏ khuyến mại rồi thanh toán.
8. Form có mã hàng dưới 24 tháng → khung "Hàng dưới 24 tháng" cảnh báo.
9. **Nhân bản** một khuyến mại → form Thêm điền sẵn, mã trống.

## 4. Số liệu mong đợi (ca chuẩn trong khuôn)

| Ca | Giỏ | Kết quả |
|---|---|---|
| ĐVT Thùng = 4, từ 2 thùng 360.000 / thùng | 8 hộp × 100.000 | giảm 80.000 (90.000 / hộp) |
| như trên | 7 hộp | không áp (chưa đủ 2 thùng) |
| Khung 22:00–02:00 | 23:30 | giảm 10 % |
| như trên | 12:00 | không áp "chỉ áp 22:00–02:00 (qua đêm)" |
| Chỉ đơn bán sỉ | đơn máy bán | không áp "chỉ áp đơn bán sỉ" |
| Sinh nhật đúng ngày 27/11 | ngày 27/11 | giảm 10 % |
| Sinh nhật trong tuần, sinh 25/11 | mua 27/11/2026 (cùng tuần thứ Hai 23/11) | giảm 10 % |
| Quà lựa chọn, chưa chọn | 2 A + 1 B | `pendingChoices` Q1 / Q2, chưa có quà |
| Quà lựa chọn, `giftChoice` Q2 | 2 A + 1 B | tặng 1 Q2 |

## 5. Kết quả mong đợi

- Chương trình `@2` lưu nháp → duyệt → phát hành được; máy bán áp đúng như Thử tính.
- Khuôn `@1` giữ nguyên ca chuẩn; ô điều kiện mới là ô thêm (không khai = như cũ). Riêng **giờ kết thúc trước giờ bắt đầu** trước đây bị chặn khi phát hành, nay hiểu là qua đêm.

## 6. Mặc định đã áp (rà khi nghiệm thu)

| Mã | Mặc định | Lý do |
|---|---|---|
| M1 | Hàng dưới 24 tháng: **chỉ cảnh báo** trên form, không chặn phát hành / không chặn ở bộ tính | Chặn ở bộ tính đổi hành vi các chương trình `@1` đang chạy; plugin cũ cũng là báo cáo + dừng tay |
| M2 | Lượt theo khách tính theo **mã khách** của đơn, gộp mọi cửa hàng; khách lẻ không giới hạn; dòng lượt cũ không có mã khách không tính | Plugin cũ `per_customer` theo khách thành viên |
| M3 | Lượt theo khách kiểm ở **máy bán** (khi nhận đơn). Phiếu bán BH10 chỉ ghi lượt (có mã khách), chưa chặn lúc duyệt | Phạm vi module phiếu bán thuộc dòng giữ chỗ khác |
| M4 | Nguồn không gửi loại đơn = **bán lẻ**; máy bán gửi `retail` | Máy bán chỉ bán lẻ |
| M5 | Sinh nhật theo tuần: tuần thứ Hai – Chủ nhật chứa ngày sinh **năm nay** | Như plugin cũ (theo tuần lịch) |
| M6 | "Tự động áp" của plugin cũ = không khai mã giảm giá; khai mã = chỉ áp khi khách đọc mã | Đúng nghĩa ô `couponCodes` sẵn có |
| M7 | Flash sale / Khai trương / Sinh nhật là **mẫu dựng sẵn** từ loại có sẵn (không thêm khuôn riêng); giới hạn tổng số lượng toàn chương trình dùng hạn mức lượt cửa hàng | Tránh khuôn mới trùng nghĩa |
| M8 | Chưa làm: lọc **lô / HSD** (K8 — máy bán chưa chọn lô lúc bán, lô cấp FEFO lúc ghi sổ), **nhóm (bộ) chương trình**, **nhập Excel cả chương trình**, báo cáo ma trận cửa hàng, tạo bằng AI | Làm đợt sau |
| M9 | **Màn theo mẫu plugin cũ (27/11, S-CD-14…17):** Thêm chỉ còn **7 loại plugin cũ cho tạo** (ACTIVE_POLICY_TYPES): 5 Chiết khấu · 2 Mua X tặng Y · 1 Giảm giá cố định · 10 Voucher / Mã giảm giá · 13 Combo bộ sản phẩm · 14 Quà tặng theo giá trị đơn · 15 Mua đủ tặng giá thấp nhất. **Ẩn, không xoá code:** bậc, tổng đơn, quà tổng đơn @1, combo món, món rẻ nhất @1 riêng, mua X tặng Y @1, giá riêng từng mã / quà lựa chọn / quà nhân bội số dạng cũ của màn, mẫu Flash sale / Khai trương / Sinh nhật. Chương trình đã có của loại ẩn vẫn hiện và mở bằng form cũ | Hoàng 27/11: "ẩn bớt, để như các policy hiện có ở plugin policy cũ" |
| M10 | Loại cũ **4 Theo lô hàng** và **12 Trường hợp đặc biệt (IT, JSON)** không hiện: 4 chờ lọc lô (K8); 12 là JSON thủ công của IT | Chưa có khuôn |
| M11 | Ánh xạ loại cũ → khuôn: 5 / 1 → `price_lines@2` (từ SL = bậc của mã; "Tối đa (đ)" = trần tiền giảm cả mã trên một đơn); 2 → `buy_x_get_y@2` kiểu **mỗi mã tính riêng** (`each`, như engine cũ: số lần = Σ floor(SL mã / SL dòng)), nhiều quà = khách chọn 1; 10 → `order_discount@1` + mã khách đọc + tối đa mỗi khách; 13 → khuôn mới `pool_combo@2`; 14 → `order_gift@2` nhân bội số, nhiều quà khách chọn 1 (`choose`); 15 → `cheapest_free@1` | Đúng engine plugin cũ (`class-selling-policy-engine.php`) |
| M12 | Mua X tặng Y nhiều **nhóm** mua – tặng trong một chương trình (plugin cũ "Thêm nhóm mua - tặng"): **một nhóm / chương trình**; nhiều nhóm thì lập nhiều chương trình (Nhân bản) | Khuôn một phần mua / một danh sách quà |
| M13 | Ô cũ chưa có ở kế toán hiện **mờ** cho đủ mặt: Tích lũy thống kê cuối kỳ, Cách cộng quyền lợi quà + Mã nhóm quà (gộp quyền lợi giữa chương trình), Nhóm khách hàng; "Hủy/dừng chương trình" khi sửa = bản mới kết thúc hôm qua (vẫn qua duyệt) | Chưa có ở Core |
| M14 | "Số lượng đơn hàng được áp dụng" = hạn mức lượt **mỗi cửa hàng** (0 = không giới hạn); tên + mô tả lưu ở lý do phát hành dạng "Tên — Mô tả"; Import Excel = dán từ Excel hoặc tệp CSV (module không có thư viện đọc .xlsx) | Khuôn nháp không có ô riêng |
| M15 | **Mã chương trình tự sinh** khi Thêm: `TGS_<MMYY>_<NN>` (NN = số lớn nhất của tháng trong chương trình + nháp đang có, + 1), sửa được | Hoàng 28/11 |
| M16 | **Bỏ luật hai người cho khuyến mại** (thay Q-CD-2 phần khuyến mại): người có quyền Duyệt khuyến mại (`pos:promo-approve`) tự lập và tự duyệt được; nút **Duyệt (phát hành)** trong chân form (Ghi · Gửi duyệt · Duyệt (phát hành) · Thoát). Tích điểm / voucher **giữ nguyên** luật duyệt hiện có — hỏi Hoàng có áp như vậy không | Hoàng 28/11 |

## 7. Kết quả chạy

- Thử trên máy local (27/11): test hàm module `pos` 148/148 (gồm `khuyen-mai-du-nhu-cu.test.ts` 12 ca); ca chuẩn khuôn `@2` qua hàm thuần 10/10;
  máy bán `tgs_pos/react` 82/82 (khuyến mãi, giỏ, màn bán); kiểu `apps/api`, `modules/pos` (api + web), `tgs_pos/react` sạch.
- Test qua endpoint (CSDL test) chưa chạy được lúc làm (máy không có CSDL test) — chạy lại trước khi merge.

## 8. Biên bản

| Ngày | Người | Nội dung |
|---|---|---|
| 27/11/2026 | Võ Hoàng | Giao làm đủ như plugin cũ; mặc định §6 rà khi nghiệm thu |
| 27/11/2026 | Võ Hoàng | Màn theo mẫu plugin cũ: chỉ loại cũ, form 2 thẻ + bảng nhiều dòng (M9–M14) |
| 28/11/2026 | Võ Hoàng | Mã tự sinh TGS_<MMYY>_<NN>; bỏ luật hai người cho khuyến mại, Duyệt trong form (M15, M16) |

## 9. Lịch sử

- 27/11/2026 — Lập phiếu và làm.
- 27/11/2026 — Làm lại màn theo mẫu plugin cũ (S-CD-14…17): khuôn `pool_combo@2`, `buy_x_get_y@2` mode each, `order_gift@2` choose, `price_lines@2` maxDiscount; thử 7 loại trên màn thật + máy bán.
- 28/11/2026 — Mã tự sinh; Duyệt trong form, bỏ luật hai người cho khuyến mại.
