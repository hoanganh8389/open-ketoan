<!-- [2026-11-29 02:30 AM Võ Hoàng] NGHIEM-THU — NT-BH-064: phiếu khuyến mại theo lô / hạn dùng (CL-9), Hoàng chốt 29/11 (đóng góp) -->
# NT-BH-064 · Khuyến mại theo lô / hạn dùng (đẩy hàng cận date, loại "Theo lô hàng")

| | |
|---|---|
| Phân hệ | Bán hàng — BH18 Khuyến mại (module `pos`); khuôn `sale.promo.price_lines@2`; bộ tính chính sách (`core.policy.evaluate`); máy bán POS React (open-pos) |
| Ngày tạo | 29/11/2026 |
| Trạng thái | **Đã chốt — Hoàng 29/11** (đề xuất docs123/docs/module-pos/96 §6): C1 lọc "HSD còn ≤ N ngày" + giữ kiểu cũ (lô cụ thể, tháng / năm HSD); C2 máy chủ tự chọn lô hạn gần trước, chỉ giảm phần thuộc lô khớp, phiếu bán ghi lô đó; C3 nhân viên chỉ bán, không chọn lô / HSD; C4 không thêm điều kiện kho (dùng phạm vi chi nhánh); C7 máy bán mất mạng không áp khuyến mại có lọc lô, máy chủ không tự giảm thêm khi phát lại |
| Căn cứ | Checklist 28-11 dòng 9 (CL-9); plugin cũ `tgs_selling_policy` loại 4 "Theo lô hàng" (`batch_price`) và `hsd_filter` (năm / tháng-năm) trên từng dòng; lô kế toán (migration 0098: `item_lots`, `inventory_lot_moves`, Kernel tự phân lô hạn gần trước khi dòng không ghi lô); NT-BH-047 (lô / HSD trên phiếu bán); NT-BH-063 (form BH18 chia bước) |

## 1. Vì sao cần

- Plugin cũ cho giảm giá theo lô (loại 4) và lọc HSD trên từng dòng; màn mới BH18 ẩn loại 4 vì khuôn Core chưa lọc lô (NT-BH-049 §6, K8).
- Bộ chuyển chương trình cũ (`promo-migrate`) bỏ qua `hsd_filter` của giá cố định / giảm % → chương trình cận date chuyển sang thành **áp mọi lô** (sai).
- Đẩy hàng cận date cần tự động: "HSD còn ≤ N ngày" thay vì khai lại từng tháng.

## 2. Làm

| # | Việc | Chỗ |
|---|---|---|
| K1 | Khuôn `price_lines@2`: dòng có `lotFilter` (`expWithinDays` 0–3650, `expMonth` YYYY-MM, `expYear` YYYY, `lotNos`); nhiều tiêu chí = khớp cả. Dòng giỏ có `lots` (lô dự kiến, tổng = qty). Chỉ **phần số lượng thuộc lô khớp** được tính bậc / giảm; tiền giảm kèm `lots` được giảm. Dòng giỏ chưa có `lots` → chặn "chưa biết lô" (cửa nạp: `indeterminate`), không đoán | `apps/api/src/modules/system/rule-contracts/sale-promo-v2.ts` (khung — chờ chủ repo ký) |
| K2 | Bộ tính: có chương trình lọc lô → dự phân lô cho dòng: lô còn tồn ở kho mặc định của chi nhánh tới ngày chứng từ, hạn dùng sớm trước, cùng hạn nhập trước (đúng thứ tự Kernel tự phân lô / `GET /api/v1/lots/suggest`); nhiều dòng cùng mã lấy nối tiếp; thiếu tồn lô = lô trống. Lô do nguồn bán gửi bị bỏ (bộ tính tự điền). `discounts[]` mang `lots` (được giảm) + `plan` (lô dự kiến cả dòng) | `apps/api/src/modules/system/rule-contracts/policy-service.ts` |
| P1 | Module pos: dòng đơn nhận `promoLots` / `lotPlan` (máy bán chép nguyên từ Core). Phiếu bán **tách dòng theo lô**: mỗi lô một dòng (`lotNo`, `expDate`), khoá dòng `lineId`, `lineId~2`…; tiền giảm chương trình chỉ ở phần lô được giảm, giảm khác chia theo số lượng; tổng tiền / thuế / giảm các phần đúng bằng dòng gốc (`allocate`). Phần không được giảm cũng ghi lô dự kiến — tránh Kernel tự chọn lại đúng lô cận date đã ghi (phân lô trong một chứng từ không trừ lẫn nhau) | `modules/pos/api/domain/schema.ts`, `modules/pos/api/domain/order.ts`, `modules/pos/api/domain/lot-split.ts` (mới) |
| F1 | BH18: hiện lại loại **Theo lô hàng** (giá mới cho các số lô); bảng Chiết khấu / Giảm giá cố định thêm cột **Lọc HSD / lô** (Mọi HSD · HSD còn ≤ N ngày · Theo tháng/năm · Theo năm · Lô cụ thể); các dòng cùng mã phải cùng bộ lọc; mở lại chương trình ra đúng ô | `modules/pos/web/screens/khuyen-mai/old-types.ts`, `PolicyForm.tsx` |
| M1 | Máy bán (open-pos `feat/pos-km-lo-hsd`): `discounts[].lots / plan` → dòng đơn `promoLots / lotPlan`; hợp đồng OrderLineDraft thêm hai trường. Thu ngân không thao tác lô | `react/src/features/promotions/corePromotions.ts`, `pricing.ts`, `openapi/pos.yaml` |
| M2 | `promo-migrate` (open-pos): `hsd_filter` năm / tháng-năm của giá cố định / giảm % → `price_lines@2` + `lotFilter`; cùng mã khác lọc → không chuyển, nói rõ; loại 4 (lô website) → không chuyển, hướng dẫn khai lại ở BH18 "Theo lô hàng" bằng số lô kế toán | `includes/class-tgs-pos-promo-migrate.php` |

**Không làm (đợt này):** lọc lô cho hàng mua / quà của Mua X tặng Y và quà theo tổng đơn (plugin cũ có `hsd_filter` ở đó — `promo-migrate` vẫn báo không chuyển); điều kiện kho (C4); thu ngân chọn / đổi lô (C3, CL-36); tách online / offline (NT-BH-065).

## 3. Các bước nghiệm thu (thử trên máy local)

1. Nhập 2 lô cùng mã ở CN02 (phiếu nhập ghi số lô + HSD): lô CAN HSD còn ~6 ngày 1 lon, lô XA HSD xa 5 lon.
2. BH18 → Thêm → Chiết khấu, dòng mã đó 20 %, cột Lọc HSD / lô = "HSD còn ≤ N ngày", 30 → Duyệt.
3. Máy bán shop2 bán 3 lon: hộp Khuyến mãi / giỏ hiện giảm 20.000 (chỉ 1 lon); thu ngân không chọn lô.
4. Mở phiếu bán ở BH10 / sổ kho: 2 dòng — 1 lon lô CAN (giảm), 2 lon lô XA (giá thường); tồn lô CAN về 0.
5. BH18 → Thêm → Theo lô hàng: mã, số lô XA, giá mới 80.000 → bán 2 lon → giảm 2 × 20.000, phiếu ghi lô XA.
6. Máy bán mất mạng (dự phòng): đơn không có khuyến mại lọc lô; phát lại không tự giảm thêm.
7. `wp tgs-pos promo-migrate --dry-run`: chương trình cũ có lọc tháng HSD → nháp `price_lines@2` có `lotFilter`.

## 4. Số liệu mong đợi

Bộ ca mẫu của khuôn (`apps/api/test/sale-promo-v2.test.ts`), test API `apps/api/test/nt-bh-064-km-lo-hsd.test.ts`, module `modules/pos/test/km-lo-hsd.test.ts` + `km-lo-hsd-form.test.ts`:

| Ca | Kết quả |
|---|---|
| 3 lon × 100.000; lô L1 HSD 05/12 (1 lon) + L2 HSD 01/06/2027 (2 lon); ngày 29/11; HSD còn ≤ 30 ngày giảm 20 % | giảm 20.000 cho 1 lon, `lots` = [L1] |
| Cùng giỏ, lô cụ thể L2 giá 80.000 | giảm 2 × 20.000 = 40.000, `lots` = [L2] |
| Lọc tháng 2027-07 | không áp |
| Dòng chưa có lô (bộ tính không biết chi nhánh) | bỏ qua "chưa biết lô" |
| Phiếu bán ví dụ 3 lon: phần L1 | 80.000 gồm thuế (74.074 + 5.926); phần L2 200.000 gồm thuế, không giảm; tổng 3 phần đúng dòng gốc |

## 5. Mặc định đã áp (rà khi nghiệm thu)

| Mã | Mặc định | Lý do |
|---|---|---|
| D1 | Dự phân lô ở **kho mặc định của chi nhánh** | Dòng bán POS xuất kho mặc định; quà đi kho quà riêng (không lọc lô) |
| D2 | Lô **đã hết hạn** không khớp "còn ≤ N ngày" | Không giảm cho hàng quá hạn (không được bán) |
| D3 | Lô không số / không HSD không khớp lọc HSD | An toàn: thiếu dữ liệu lô thì không giảm |
| D4 | Một dòng nhiều chương trình lô: phiếu ghi lô theo chương trình giảm nhiều nhất | Như cách ghi chương trình trên dòng (PHASE-031 · 00 §18 mục 6) |
| D5 | Kế hoạch lô không khớp số lượng dòng → không tách, Kernel tự phân lô | Không đoán |
