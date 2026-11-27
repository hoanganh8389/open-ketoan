# NT-BH-049 · Khuyến mại BH18 đủ như plugin cũ — khuôn @2 dùng được thật, đủ cài đặt một chương trình, máy bán chọn quà
<!-- [2026-11-27 Võ Hoàng] NGHIEM-THU — NT-BH-049: chốt theo giao việc 27/11 "làm đủ như plugin cũ" (đóng góp) -->

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

## 7. Kết quả chạy

- Thử trên máy local (27/11): test hàm module `pos` 148/148 (gồm `khuyen-mai-du-nhu-cu.test.ts` 12 ca); ca chuẩn khuôn `@2` qua hàm thuần 10/10;
  máy bán `tgs_pos/react` 82/82 (khuyến mãi, giỏ, màn bán); kiểu `apps/api`, `modules/pos` (api + web), `tgs_pos/react` sạch.
- Test qua endpoint (CSDL test) chưa chạy được lúc làm (máy không có CSDL test) — chạy lại trước khi merge.

## 8. Biên bản

| Ngày | Người | Nội dung |
|---|---|---|
| 27/11/2026 | Võ Hoàng | Giao làm đủ như plugin cũ; mặc định §6 rà khi nghiệm thu |

## 9. Lịch sử

- 27/11/2026 — Lập phiếu và làm.
