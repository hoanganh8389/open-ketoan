<!-- [2026-11-29 06:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-067: phiếu phần còn lại của NT-BH-064 / 065 — lọc lô cho Mua X tặng Y và quà theo tổng đơn; kênh bán ở BH10 / BH20, máy chủ kiểm lại kênh, kiểm trùng theo kênh (đóng góp) -->
# NT-BH-067 · Khuyến mại theo lô / kênh — phần còn lại của NT-BH-064 / 065

| | |
|---|---|
| Phân hệ | Bán hàng — BH18 Khuyến mại (module `pos`), BH10 Phiếu bán hàng, BH20 Đơn đặt hàng (module `phieu-ban`), máy bán POS (module `pos`, nhận đơn); khuôn `sale.promo.buy_x_get_y@2`, `sale.promo.order_gift@2`; bộ tính `core.policy.evaluate` |
| Ngày tạo | 29/11/2026 |
| Trạng thái | **Chờ nghiệm thu — theo chốt của NT-BH-064 / 065** (Hoàng 29/11: C1 HSD còn ≤ N ngày + giữ kiểu tháng / năm / lô cụ thể; C2 máy chủ tự chọn lô hạn gần trước; C3 nhân viên không chọn lô / HSD; C5–C6 Kênh bán theo loại kênh hoặc chọn kênh; C7 không áp khuyến mại lô / kênh khi không xác định được). Các chỗ **"chọn tạm, chờ Hoàng chốt"** ở §5 |
| Căn cứ | NT-BH-064 §2 "Không làm (đợt này)"; NT-BH-065 §6 "Chưa làm"; đề xuất `docs123/docs/module-pos/96-DE-XUAT-KM-LO-HSD-ONLINE-OFFLINE.md` §2.1, §3; plugin cũ `tgs_selling_policy` (`hsd_filter` ở dòng mua của Mua X tặng Y) |

## 1. Vì sao cần

- NT-BH-064 chỉ lọc lô / HSD cho dòng giá (Chiết khấu, Giảm giá cố định, Theo lô hàng). Plugin cũ còn lọc HSD ở **hàng mua của Mua X tặng Y** ("mua 2 lon cận date tặng 1") — chương trình loại này chuyển sang màn mới là áp mọi lô.
- NT-BH-065 mới có điều kiện kênh ở máy bán: BH10 / BH20 gọi tính khuyến mại không gửi kênh → chương trình "Chỉ offline" không bao giờ áp ở phiếu bán; máy chủ không kiểm lại kênh khi ghi → phiếu / đơn mang khuyến mại "Chỉ online" vẫn ghi được với kênh tại cửa hàng.
- Cảnh báo trùng chương trình (BH18) chưa xét kênh: chương trình "Chỉ online" và "Chỉ offline" cùng mã hàng bị báo trùng dù không bao giờ cùng áp một đơn.

## 2. Làm

| # | Việc | Chỗ |
|---|---|---|
| K1 | Khuôn `buy_x_get_y@2`: mỗi mã **hàng mua** (`buy.items[]`, cả `combos[]`) có `lotFilter` tuỳ chọn (cùng khuôn NT-BH-064: `expWithinDays` / `expMonth` / `expYear` / `lotNos`). Chỉ phần số lượng thuộc lô khớp được đếm vào "đủ điều kiện mua". Dòng mua chưa biết lô → chặn "chưa biết lô" (cửa nạp: `indeterminate`), không đoán. `detail.buyLots` ghi lô đã đếm | `apps/api/src/modules/system/rule-contracts/sale-promo-v2.ts` (khung — chờ chủ repo ký) |
| K2 | Khuôn `order_gift@2`: `lotFilter` cấp chương trình — chỉ tiền phần hàng (trong phạm vi) thuộc lô khớp được cộng vào **tổng đơn xét quà** | như trên |
| K3 | Bộ tính: dự phân lô (hạn gần trước, NT-BH-064 K2) khi có bất kỳ `lotFilter` nào trong chương trình (dòng giá, hàng mua, tổng đơn) | `apps/api/src/modules/system/rule-contracts/policy-service.ts` |
| F1 | BH18: bảng **Hàng mua** của Mua X tặng Y (mọi combo) thêm cột **Lọc HSD / lô** (như cột của Chiết khấu); Quà theo giá trị đơn thêm ô **Lọc HSD / lô hàng tính tổng đơn**; mở lại chương trình ra đúng ô | `modules/pos/web/screens/khuyen-mai/old-types.ts`, `PolicyForm.tsx` |
| C1 | BH10: nút **Áp khuyến mại** gửi kênh của phiếu (`channel` = mã kênh, trống = kênh mặc định Gần shop) và loại kênh (`channelKind` lấy từ danh mục Kênh bán hàng) | `apps/web/src/components/phieu-hang/PhieuHangForm.tsx` |
| C2 | BH20: thêm ô **Kênh bán** (như BH10, trống = kênh mặc định); máy chủ tính khuyến mại khi Ghi / Copy đơn theo kênh của đơn; Giao hàng → phiếu bán nháp mang kênh của đơn; Copy đơn / phiếu bán giữ kênh | `modules/phieu-ban/api/domain/order.ts`, `order-service.ts`, `modules/phieu-ban/web/screens/OrderEditor.tsx` |
| C3 | Máy chủ kiểm lại kênh khi ghi: dòng mang chương trình có điều kiện kênh (`channelKinds` / `channels`) mà kênh của chứng từ không khớp → **không nhận**, lý do `POS_PROMO_CHANNEL` (kèm `items: [{ key, channel, kind, why }]`). Máy bán: lúc nhận đơn (đơn mất mạng gửi bù → nhận, đánh dấu `promoChannelOffline`). BH10: lúc Ghi và lúc Duyệt | `modules/pos/api/order-service.ts`, `modules/pos/api/domain/promo.ts`, `modules/phieu-ban/api/service.ts`, `modules/phieu-ban/api/domain/doc.ts`; mã lỗi `packages/contracts/src/errors.ts`, `docs/contracts/BIZCITY-ERRORS-v1.md` §4c |
| C4 | Kiểm trùng (BH18 Ghi / Duyệt): hai chương trình có tập kênh không giao nhau (Chỉ online ↔ Chỉ offline; chọn kênh không chung mã; chọn kênh mà mọi kênh khác loại với chương trình kia) → **không** coi là trùng | `modules/pos/api/domain/promo.ts` (`channelsDisjoint`), `modules/pos/api/promo.ts` |

**Không làm (đợt này):** lọc lô cho **quà Y** / quà theo tổng đơn (§5 T1); ghi lô trên phiếu bán cho dòng hàng mua X (§5 T2); `promo-migrate` của open-pos chuyển `hsd_filter` dòng mua (PR riêng ở open-pos); Woo / sàn gửi kênh.

## 3. Các bước nghiệm thu (thử trên máy local)

1. Nhập 2 lô cùng mã A ở CN02: lô CAN HSD còn ~6 ngày (2 lon), lô XA HSD xa (≥ 5 lon).
2. BH18 → Thêm → Mua X tặng Y: hàng mua A SL 2, cột Lọc HSD / lô = "HSD còn ≤ N ngày" 30; quà Q SL 1 → Duyệt.
3. Tính khuyến mại cho 2 lon A (đúng lô cận date) → tặng 1 Q. Bán 4 lon A khi lô CAN chỉ còn 1 lon → không tặng (chỉ 1 lon thuộc lô khớp).
4. BH18 → Chiết khấu 10 % mã B, Kênh bán = **Chỉ online** → Duyệt. BH10 phiếu kênh Gần shop → Áp khuyến mại: không có; đổi kênh Zalo → Áp: giảm 10 %. Đổi lại kênh Gần shop rồi Ghi → báo "khuyến mại … chỉ áp kênh online" (không ghi được).
5. BH20 đơn kênh Zalo, mã B → Ghi: dòng có giảm 10 % (KM); đơn kênh Gần shop → không giảm.
6. BH18 tạo chương trình thứ hai cùng mã B **Chỉ offline** → Duyệt: không hiện cảnh báo trùng với chương trình Chỉ online; tạo thứ ba **Tất cả kênh** cùng mã B → có cảnh báo trùng.

## 4. Số liệu mong đợi (test)

| Ca | Kết quả | Test |
|---|---|---|
| Mua 2 A (lọc HSD ≤ 30 ngày) tặng 1 Q; 2 lon thuộc lô L1 (còn 6 ngày) | tặng 1 Q, `detail.buyLots` = L1 × 2 | ca mẫu `sale-promo-v2.ts`, `apps/api/test/nt-bh-067-km-lo-kenh.test.ts` | (đề xuất — tệp test ở nhánh code)
| Cùng chương trình, 4 lon: L1 1 lon + L2 (HSD xa) 3 lon | không tặng — "chưa đủ điều kiện mua … mới mua 1" | như trên |
| Dòng mua chưa biết lô (không có chi nhánh) | chặn "chưa biết lô"; cửa nạp `indeterminate` | như trên |
| Quà theo tổng đơn ≥ 300.000, lọc lô L1: 3 lon × 100.000 (L1 1 lon) | không tặng (tổng xét quà 100.000); 3 lon L1 → tặng | như trên |
| Evaluate qua API, chi nhánh có tồn lô thật (dự phân lô hạn gần trước) | đúng như hai ca đầu | `nt-bh-067-km-lo-kenh.test.ts` |
| Kênh: chương trình Chỉ online, phiếu kênh Gần shop (offline) | `channelMismatch` trả lý do "chỉ áp kênh online" | `modules/pos/test/km-kenh-may-chu.test.ts`, `modules/phieu-ban/test/km-kenh.test.ts` | (đề xuất — tệp test ở nhánh code)
| Kiểm trùng: Chỉ online ↔ Chỉ offline cùng mã | không trùng; Tất cả ↔ Chỉ online → trùng; chọn ZALO ↔ Chỉ offline (ZALO online) → không trùng | `modules/pos/test/km-kenh-may-chu.test.ts` | (đề xuất — tệp test ở nhánh code)
| Form: hàng mua lọc HSD ⇄ `buy.items[].lotFilter`; quà theo đơn ⇄ `lotFilter` | mở lại đúng ô | `modules/pos/test/km-lo-hsd-form.test.ts` |

## 5. Chọn tạm, chờ Hoàng chốt

| Mã | Chọn tạm | Phương án khác | Lý do chọn |
|---|---|---|---|
| T1 | **Quà Y** (Mua X tặng Y) và quà theo tổng đơn **không lọc lô** — quà xuất kho quà (KKM), Kernel tự phân lô hạn gần trước | (b) quà cũng có ô Lọc HSD, máy chủ dự phân lô ở kho quà và tặng đúng lô | Quà đi kho riêng (NT-BH-064 D1); lọc lô quà mà kho quà không đủ lô khớp thì không rõ tặng hay không — an toàn là giữ như cũ |
| T2 | Dòng **hàng mua X** có lọc lô: chỉ dùng lô để **đếm** điều kiện mua, phiếu bán **không** tách / ghi lô cho dòng này (Kernel tự phân lô hạn gần trước — cùng thứ tự bộ tính đã dự) | (b) phiếu bán ghi lô cho dòng mua như dòng giảm giá (cần máy bán chép `plan` sang dòng — PR open-pos + sửa `order.ts`) | Không có tiền giảm trên dòng; tránh sửa `order.ts` đang có dòng giữ chỗ khác và máy bán. Rủi ro: lô cận date vừa bị đơn khác lấy hết giữa lúc tính và lúc ghi → quà vẫn tặng, kho xuất lô khác |
| T3 | Quà theo tổng đơn: lọc lô áp cho **tiền hàng tính tổng đơn** (một ô cho cả chương trình) | (b) chỉ áp khi có phạm vi nhóm hàng | Một ô, dễ khai; không chọn thì như cũ |
| T4 | Máy chủ thấy kênh không khớp → **không nhận** chứng từ (lý do `POS_PROMO_CHANNEL`, như hết lượt); đơn máy bán mất mạng gửi bù → nhận, đánh dấu `promoChannelOffline` | (b) tự bỏ khuyến mại rồi ghi (đổi tiền khách phải trả); (c) chỉ cảnh báo | Không tự đổi tiền đã báo khách; như cách làm hạn mức lượt (NT-BH-025) |
| T5 | BH20 có ô Kênh bán; **trống = kênh mặc định Gần shop** (offline) như BH10 | (b) đơn đặt hàng mặc định là online; (c) đơn livestream tự là kênh Livestream | Giữ một quy ước với BH10 / máy bán (NT-BH-031) |
| T6 | Kiểm trùng: chương trình "theo loại kênh" so với "chọn kênh" — tra loại của từng kênh ở danh mục; kênh không tra được loại → vẫn coi là có thể trùng (nhắc thừa hơn bỏ sót) | — | Cảnh báo trùng chỉ là nhắc, không chặn |

## 6. Mặc định đã áp (rà khi nghiệm thu)

| Mã | Mặc định | Lý do |
|---|---|---|
| D1 | Lô hết hạn / lô không số không khớp lọc HSD (như NT-BH-064 D2, D3) | Không cho quà vì hàng quá hạn / thiếu dữ liệu |
| D2 | Phiếu BH10 / đơn BH20 không chọn kênh = kênh mặc định (Gần shop, offline) khi tính và khi kiểm | Như NT-BH-031: phiếu không mang kênh tính vào kênh mặc định |
| D3 | Module pos chưa bật (không đọc được danh mục kênh) → BH10 / BH20 chỉ gửi mã kênh, không gửi loại → chương trình theo loại kênh không áp (C7); máy chủ kiểm lại cũng coi là "chưa xác định kênh" | Không đoán loại kênh |
| D4 | Mã kênh so không phân biệt hoa thường (như NT-BH-065 M4) | — |

## 7. Kết quả chạy (29/11/2026, máy local)

| Lệnh / thử | Kết quả |
|---|---|
| `apps/api` `npx vitest run test/nt-bh-067-km-lo-kenh.test.ts` | 6/6 |
| `apps/api` khuôn + chính sách + phiếu bán / đơn đặt hàng / kênh / 064 / 065 (16 tệp) | 136/137 — ca hỏng `nt-bh-035` "BH20: đơn có dòng dịch vụ…" hỏng **cả trên bản trước** (chương trình bán "Mua 2 tặng 1 SUA330" của chính test áp vào đơn), không do phiếu này |
| `modules/pos` `npx vitest run` | 197/197 (thêm `km-kenh-may-chu.test.ts`, 4 ca form ở `km-lo-hsd-form.test.ts`) |
| `modules/phieu-ban` | 31/31 (thêm `km-kenh.test.ts`) |
| `modules/loyalty`, `modules/voucher` | 35/35, 16/16 |
| `bash scripts/kiem-chuan.sh` | ĐẠT |
| `node tests/conformance/selfcheck.mjs --strict` | không thêm đỏ mới so với `origin/main` (tệp khung `sale-promo-v2.ts` vẫn chờ chủ repo ký bù như 064 / 065) |
| `npm run typecheck` | 4 lỗi có sẵn trên main (TraChinhSachPage, nt-bh-054, nt-bh-057, xuat-dieu-chinh), không lỗi mới |

Thử bằng giao diện (docker local, CN02): báo cáo `docs123/docs/module-pos/98-KET-QUA-THU-067.md`.

| Ca | Phần mềm |
|---|---|
| BH18 Mua X tặng Y "Mua 2 lon HSD còn ≤ 30 ngày tặng 1 R1Q" (TGS_1126_15) và "Mua 1 lon lô L67-XA tặng 1" (TGS_1126_16); lô L67-CAN (HSD 10/12/2026) 3 lon, L67-XA (01/08/2027) 5 lon | BH10 bán 2 lon → chỉ TGS_1126_15 tặng (lô CAN, đúng lô); lô XA chưa xuất → TGS_1126_16 không tặng (sai lô). Bán 5 lon → cả hai tặng (CAN 3 lon đếm cho 15, XA 1 lon cho 16) |
| BH18 Chiết khấu 7 % R1B **Chỉ online** (TGS_1126_12) | BH10 kênh Zalo → giảm 3.500 (KM TGS_1126_12); đổi sang Gần shop rồi Ghi → "Khuyến mại không áp được cho kênh bán GAN_SHOP: TGS_1126_12 — chỉ áp kênh online …" (không ghi) |
| BH20 đơn R1B × 1 | kênh Zalo → chiết khấu 3.500 (TGS_1126_12); kênh mặc định → 1.500 (TGS_1126_13 Chỉ offline) |
| Kiểm trùng R1B | Chỉ offline (TGS_1126_13): cảnh báo chỉ nêu TGS_1126_02, **không** nêu TGS_1126_12 (Chỉ online); Tất cả kênh (TGS_1126_14): nêu cả 02, 12, 13 |
