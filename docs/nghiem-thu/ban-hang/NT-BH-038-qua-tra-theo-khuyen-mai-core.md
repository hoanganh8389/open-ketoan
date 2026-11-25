# NT-BH-038 · Quà trả theo hàng chính cho khuyến mại Core (BH18)
<!-- [2026-11-25 Võ Hoàng] NGHIEM-THU — chốt NT-BH-038 (anh Hoàng, 25/11) (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng — module `pos` (trả hàng tại quầy); máy bán React (repo open-pos, PR riêng) |
| Màn hình | Máy bán: Đơn hàng → Hoàn hàng; API `GET /api/v1/m/pos/orders/:id/returnable`, `POST /api/v1/m/pos/returns` |
| Ngày tạo | 25/11/2026 |
| Trạng thái | **Đã chốt 25/11/2026** (Võ Hoàng) |
| Căn cứ | Thử thật shop2 24/11 (React POS → open-ketoan): đơn `CN02BT10032` mua 2 tặng 1 theo chương trình Core `KM-THU-QUA-CN02`; trả hết 2 lon mua, phiếu `CN02.B00006` được nhận mà lon quà vẫn ở khách |

## 1. Hiện trạng
- Luật "quà trả theo hàng chính" (họp kế toán 04/11, #22; NT-BH-024): suất quà khách được giữ = floor(quà × hàng chính khách giữ ÷ hàng chính đã mua); quà đang giữ vượt suất phải trả cùng phiếu. Máy chủ (`modules/pos/api/domain/returns.ts` `requiredGiftReturns`) và máy bán (`@tgs/pos-core` `requiredGiftReturns`) ghép quà với hàng chính theo `promotionId` **số** của khuyến mại website cũ.
- Dòng quà của khuyến mại Core (BH18, NT-BH-003) chỉ mang `policyRef` (`key`, `version`, `line: gift`), **không có** `promotionId` → luật bị bỏ qua hoàn toàn: không bắt trả quà, React không tự điền "quà trả theo".
- Phần quà về kho KKM (NT-BH-035 Q2) đúng: trả tay dòng quà → phiếu `CN02.B00007` nhập `CN02-KKM`, `is_gift`.

## 2. Đã chốt (25/11/2026, Võ Hoàng)
| # | Câu hỏi | Chốt |
|---|---|---|
| Q1 | "Hàng chính" của khuyến mại Core lấy thế nào | **Đọc nội dung chương trình**: máy chủ gọi `core.policy.list` (`ctx.actions.call`, action đọc sẵn có) tại ngày bán của đơn, cửa hàng của đơn. `sale.promo.buy_x_get_y@1` → mã hàng mua (`buy.sku` / `buy.itemId`); `sale.promo.order_gift@1` → `skus` (trống = cả đơn). Không đọc được chương trình / khuôn khác → mọi dòng không phải quà. Không sửa Core |
| Q2 | Phiếu trả thiếu quà | **Từ chối như luật cũ** (cùng mã lỗi đang dùng cho khuyến mại website); React tự điền số quà "quà trả theo" |
| Q3 | Đơn đã trả thiếu quà trước khi sửa (vd `CN02BT10032`) | **Không xử lý lùi**; luật áp cho phiếu trả lập từ khi phát hành |

## 3. Thiết kế
1. **Nhóm quà theo chương trình**: dòng quà có `promotionId` → nhóm số như cũ; dòng quà không có `promotionId` mà có `policyRef.key` → nhóm `core:<key>`. Quà đổi điểm (NT-BH-024 Q2) vẫn đứng ngoài.
2. **Hàng chính của nhóm `core:<key>`**: theo Q1. Bản trong danh sách khác `policyRef.version` của dòng quà → vẫn dùng (cùng mã chương trình), ghi `log.warn` kèm mã + hai bản (R-LOG).
3. **Máy chủ** (`modules/pos/api/return-service.ts`, `domain/returns.ts`): `ReturnableLine` thêm `policyKey?`; `requiredGiftReturns` nhận khoá nhóm chuỗi; đầu ra `orders/:id/returnable` thêm `policySkus: Record<key, string[] | null>` cho máy bán (giữ `promoSkus` cũ). Kiểm phiếu (POST) dùng cùng hàm → thiếu quà thì từ chối.
4. **Máy bán React** (open-pos, PR riêng theo I-0): `@tgs/pos-core` `requiredGiftReturns` ghép theo cùng khoá nhóm; hộp Hoàn hàng tự điền "quà trả theo" cho quà Core.
5. **Không đổi**: tiền hoàn, kho nhận quà (KKM, NT-BH-035), định khoản, quyền, khuyến mại website cũ.

## 4. Kết quả mong đợi
| Mục | Mong đợi |
|---|---|
| Đơn mua 2 tặng 1 (Core), trả 2 hàng chính | Hộp hoàn tự điền 1 quà; máy chủ nhận phiếu có quà, quà về KKM |
| Cùng đơn, gửi phiếu thiếu quà (gọi API) | Từ chối, nêu dòng quà phải trả |
| Đơn có hàng ngoài chương trình, chỉ trả hàng ngoài chương trình | Không bắt trả quà |
| Quà theo tổng đơn, `skus` trống | Tính trên mọi dòng không phải quà |
| Khuyến mại website cũ (`promotionId`) | Như cũ |

## 5. Kiểm
- Test đơn vị `domain/returns` (nhóm Core, hàng ngoài chương trình, order_gift, không đọc được chương trình) + test API trên CSDL test (tệp mới, đề xuất: `apps/api/test/nt-bh-038-qua-tra-khuyen-mai-core.test.ts`).
- Thử thật shop2: bán mua 2 tặng 1 → trả 2 hàng chính → quà tự điền, về `CN02-KKM`.

## 6. Kết quả chạy
<!-- [2026-11-25 Võ Hoàng] NGHIEM-THU — NT-BH-038: kết quả code + kiểm (đóng góp) -->
Nhánh `feat/nt-bh-038-qua-tra-km-core`, 25/11/2026.

| Mục | Kết quả |
|---|---|
| Máy chủ | `domain/returns.ts`: dòng quà Core mang `policyKey`; `requiredGiftReturns` nhóm `p:<promotionId>` / `k:<mã chương trình>`; `policyMainSkus` đọc hàng mua theo khuôn: `sale.promo.buy_x_get_y@1` (`buy.sku`), `sale.program.gift@1` (chương trình bán BH12, `sku`), `sale.promo.order_gift@1` (`skus`); khuôn khác → mọi dòng không phải quà. `return-service.ts`: trước khi lập phiếu gọi `core.policy.list` (ngày bán, cửa hàng bán); không thấy chương trình / lệch bản → ghi vào bằng chứng của action (`ctx.evidence.note`, module chưa có logger) và lùi về mọi dòng không phải quà |
| Khác §3 | `policySkus` **không** thêm vào đầu ra `orders/:id/returnable` (action đó ngoài phạm vi giữ chỗ): máy bán tự đọc `GET /api/v1/policies` (cùng `core.policy.list`) cho dòng quà có `policyKey`. Thêm khuôn `sale.program.gift@1` (BH12) vào Q1 — cũng là đọc nội dung chương trình |
| test đơn vị `modules/pos/test/returns.test.ts` | 14 / 14 (5 ca NT-BH-038) |
| test API `nt-bh-038-qua-tra-khuyen-mai-core` | 5 / 5: returnable có `policyKey`; trả hết hàng chính thiếu quà → `POS_GIFT_REQUIRED`; trả hàng ngoài chương trình → nhận; trả kèm quà → quà về KKM; trả 1 / 2 hàng chính → phải trả quà |
| Hồi quy | nt-bh-003, 005, 019, 020, 024, 028, 030, 035, golden-tra-hang-doi-ma: 61 / 61; module pos 118 / 118; `module check pos` ĐẠT |
| Máy bán React | PR riêng ở open-pos `fix/qua-tra-theo-km-core` (luật I-0): pos-core ghép quà theo `policyKey`, hộp Hoàn hàng đọc `GET /api/v1/policies`; React 775 / 775 test |
| Thử thật shop2 25/11 (Docker dựng từ nhánh này) | Đơn `CN02BT10034` mua 2 tặng 1 (`KM-THU-QUA-CN02`); hộp Hoàn hàng chỉ nhập 2 hàng chính → tự điền 1 quà "quà trả theo"; phiếu `CN02.B00008`: 2 lon về `CN02-K1`, 1 lon quà về `CN02-KKM` |

## 7. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 25/11/2026 | Tạo phiếu sau thử thật shop2 24/11; chốt Q1–Q3; giữ chỗ code |
| 25/11/2026 | Code máy chủ xong, kết quả §6; nhả giữ chỗ |
