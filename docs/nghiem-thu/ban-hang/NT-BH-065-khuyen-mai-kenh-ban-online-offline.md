<!-- [2026-11-29 01:30 AM Võ Hoàng] NGHIEM-THU — NT-BH-065: phiếu khuyến mại theo kênh bán (online / offline / chọn kênh) (đóng góp) -->
# NT-BH-065 · Khuyến mại theo kênh bán (online / offline)

| | |
|---|---|
| Phân hệ | Bán hàng — BH18 Khuyến mại (module `pos`), máy bán POS (open-pos); khuôn `sale.promo.*` (điều kiện chung) |
| Ngày tạo | 29/11/2026 |
| Trạng thái | **Đã chốt — Hoàng 29/11** (đề xuất `docs123/docs/module-pos/96-…` §3): C5 điều kiện **Kênh bán** trên chương trình (Tất cả / Chỉ offline / Chỉ online / Chọn kênh cụ thể), máy bán đổi kênh trên hoá đơn thì tính lại; C6 online / offline theo **loại kênh** khai ở màn Kênh bán hàng (NT-BH-031), đơn POS theo kênh đang chọn (`saleSource`); C7 đơn không xác định được kênh (mất mạng, nguồn chưa gửi) thì **không áp** chương trình có điều kiện kênh |
| Căn cứ | Checklist 28-11 dòng 11 (CL-11 "Tách biệt CTKM chạy cho bán hàng online và offline"); NT-BH-031 (kênh bán có loại online / offline); NT-BH-049 (điều kiện loại đơn) |

## 1. Vì sao cần

- Checklist yêu cầu tách khuyến mại chạy cho bán online và bán tại cửa hàng. Plugin cũ không có; chỉ có loại đơn (bán lẻ / bán buôn / SO).
- Kế toán đã có danh mục **Kênh bán hàng** (NT-BH-031) với loại online / offline, đơn POS đã mang kênh — nhưng kênh chưa đi vào điều kiện khuyến mại: máy bán luôn gửi `channel: 'pos'`.

## 2. Làm

| # | Việc | Chỗ |
|---|---|---|
| K1 | Điều kiện chung của khuôn khuyến mại thêm `channelKinds: ['online' \| 'offline']` và `channels: [mã kênh]` (tuỳ chọn, vắng = mọi kênh). Ngữ cảnh tính thêm `channel` + `channelKind`. Hàm riêng `channelBlock`: có điều kiện mà đơn không mang loại kênh / mã kênh → **không áp**, lý do "đơn chưa xác định kênh"; cửa nạp tính lại (`lenient`) coi như đạt | `apps/api/src/modules/system/rule-contracts/sale-promo.ts`; ca mẫu ở `sale-promo-v2.ts` |
| K2 | Core `POST /api/v1/policies/evaluate` nhận thêm `channelKind` (online / offline) bên cạnh `channel` đã có; đưa cả hai vào ngữ cảnh. Core không đọc bảng kênh của module — nguồn bán tra loại kênh rồi gửi | `policy.routes.ts`, `rule-contracts/policy-service.ts` |
| K3 | BH18 khối "Chỉ áp dụng cho những đơn hàng thỏa mãn điều kiện": ô **Kênh bán** — Tất cả kênh / Chỉ offline (tại cửa hàng) / Chỉ online / Chọn kênh… (chọn kênh: tích từng kênh trong danh mục Kênh bán hàng, có ghi loại). Chương trình cũ không có điều kiện = Tất cả | `modules/pos/web/screens/khuyen-mai/PolicyForm.tsx`, `old-types.ts` |
| K4 | Máy bán: thân gọi evaluate gửi kênh đang chọn trên hoá đơn (`saleSource`, trống = kênh mặc định đầu danh sách) và loại kênh lấy từ bootstrap `saleSources[].kind`; đổi kênh trên hoá đơn → khuyến mại tính lại (thân gọi đổi). Máy dự phòng (mất mạng) không gọi được Core → không áp | open-pos `react/src/features/promotions/corePromotions.ts` (PR riêng) |

## 3. Các bước nghiệm thu (thử trên máy local)

1. Kênh bán hàng: có ít nhất một kênh offline (Gần shop) và một kênh online (vd Zalo).
2. BH18 → Tạo chương trình Chiết khấu 10 % mã A, Kênh bán = **Chỉ online** → Duyệt.
3. Máy bán: hoá đơn kênh Gần shop + mã A → **không** có khuyến mại; đổi kênh hoá đơn sang Zalo → giảm 10 % ngay (không phải bấm lại).
4. Chương trình thứ hai Kênh bán = **Chỉ offline** → hoá đơn kênh Gần shop được áp, kênh Zalo không.
5. Chọn kênh = chỉ Zalo → kênh Facebook (online) không áp, kênh Zalo áp.
6. Mở lại chương trình ở BH18: ô Kênh bán hiện đúng lựa chọn đã lưu.

## 4. Số liệu mong đợi (test)

| Ca | Kết quả | Test |
|---|---|---|
| Chỉ online, đơn Gần shop (offline) | không áp — "chỉ áp kênh online" | `apps/api/test/nt-bh-065-km-kenh-ban.test.ts`, ca mẫu `sale-promo-v2.ts` | (đề xuất — tệp test ở nhánh code)
| Chỉ online, đơn Zalo (online), 100.000 | giảm 10.000 | như trên |
| Chỉ offline, đơn không mang kênh | không áp — "đơn chưa xác định kênh (online / offline)" | như trên |
| Chọn kênh ZALO, đơn mã `zalo` / FACEBOOK | áp / không áp | như trên |
| Không điều kiện kênh | áp mọi đơn kể cả không mang kênh | như trên |
| Form: Tất cả ⇄ không điều kiện; Chỉ offline / online ⇄ `channelKinds`; Chọn kênh ⇄ `channels`, chưa tích kênh → báo lỗi | — | `modules/pos/test/khuyen-mai-du-nhu-cu.test.ts` |

## 5. Mặc định đã áp (rà khi nghiệm thu)

| Mã | Mặc định | Lý do |
|---|---|---|
| M1 | Chương trình cũ / không chọn = **Tất cả kênh** (không thêm điều kiện) | Chương trình đang chạy không đổi hành vi |
| M2 | Loại kênh do **nguồn bán** gửi (máy bán lấy từ bootstrap); Core không tự tra danh mục kênh của module | Lớp Core không đọc bảng của module |
| M3 | Đơn không mang kênh → chương trình có điều kiện kênh không áp (C7) | Không đoán kênh; máy chủ không tự giảm thêm khi phát lại (khách đã trả tiền) |
| M4 | Mã kênh so không phân biệt hoa thường | Như mã giảm giá |

## 6. Chưa làm

- BH10 phiếu bán và BH20 đơn đặt hàng gọi `core.policy.evaluate` chưa gửi kênh → chương trình có điều kiện kênh không áp trên các phiếu này cho tới khi phiếu có ô kênh bán và gửi kèm loại kênh.
- Máy chủ module pos chưa kiểm lại điều kiện kênh của dòng khuyến mại khi nhận đơn (như các điều kiện giờ / thứ — máy bán gọi Core tính); cửa nạp tính lại coi điều kiện kênh như đạt.
- Woo / sàn (CL-7/29) gửi kênh khi có nguồn đơn online.
