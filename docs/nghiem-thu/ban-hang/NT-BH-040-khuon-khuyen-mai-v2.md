# NT-BH-040 · Khuôn khuyến mại `sale.promo.*@2` — nhiều dòng giá riêng, mua nhiều mã, quà lựa chọn, quà nhân bội số
<!-- [2026-11-25 08:30 PM Võ Hoàng] NGHIEM-THU — chốt NT-BH-040 (anh Hoàng, 25/11); chữ chốt R-FLOW-2 cho Rule Contract mới (đóng góp) -->

| | |
|---|---|
| Phân hệ | Sổ chính sách (Rule Contract `sale.promo.*`) — dùng ở module `pos` (máy bán, BH18) và phiếu bán BH10 |
| Ngày tạo | 25/11/2026 |
| Trạng thái | **Đã chốt 25/11/2026** (Võ Hoàng) — Hoàng làm, Nguyễn Văn Thủy rà; phạm vi nhóm / nhãn: bộ tính tự tra danh mục |
| Căn cứ | Kế hoạch chuyển cài đặt khuyến mại sang open-ketoan (màn khai không kém plugin PHP cũ); khuôn `@1` không diễn tả được K1–K4 |

## 1. Vì sao cần

Anh Hoàng chốt Q-CD-4 (kế hoạch 80): màn khai khuyến mại BH18 phải **không kém plugin PHP cũ**. Các khuôn `@1` hiện tại không diễn tả được những chương trình đang có trên website:

| # | Plugin cũ làm được | Khuôn `@1` hiện tại |
|---|---|---|
| K1 | **Một chương trình nhiều mã, mỗi mã một giá / một bậc riêng** | `tiered@1` và `program.discount@1` áp **một bảng bậc / một giá cho cả danh sách mã**. Công cụ chuyển phải tách mỗi mã thành một chương trình (nhiều chương trình rời, khó quản lý, cảnh báo trùng sai) |
| K2a | **Mua nhiều mã mới tặng**: mua A **hoặc** B (gộp số lượng), hoặc mua A **và** B | `buy_x_get_y@1` có đúng 1 mã mua (`buy.sku`) |
| K2b | **Quà lựa chọn**: khách chọn 1 (hoặc N) trong nhiều quà | `buy_x_get_y@1` có đúng 1 mã tặng (`get.sku`) |
| K4 | **Quà theo tổng đơn nhân bội số ngưỡng** (đủ 1 triệu tặng 1, đủ 2 triệu tặng 2) | `order_gift@1` chỉ chọn bậc cao nhất đạt được, không nhân |
| K3 | **Phạm vi theo nhóm hàng / nhãn hàng** | Mọi khuôn nhận danh sách `skus` |

## 2. Khuôn đề nghị

Giữ quy ước `@1`: số lượng theo đơn vị nhỏ nhất, so theo `itemId` nếu có, không thì theo `sku`, tiền làm tròn đồng, `explain` bằng tiếng Việt, ca mẫu trong khuôn. Khuôn `@1` **giữ nguyên**; `@2` là phiên bản mới, chương trình cũ không phải chuyển.

**a) `sale.promo.price_lines@2` (K1).** Mỗi dòng một mã với cách giảm riêng.

```ts
{ lines: [{ sku, itemId?, pct? | amountPerUnit? | unitPrice?, tiers?: [{ min, pct? | amountPerUnit? | unitPrice? }], maxQty? }] (1..500),
  basis?: 'qty' | 'amount' }
```

Dòng giỏ khớp dòng nào thì tính theo dòng đó. Có `tiers` thì xét bậc theo chính dòng đó.

**b) `sale.promo.buy_x_get_y@2` (K2a, K2b).**

```ts
{ buy: { items: [{ sku, itemId?, qty? }] (1..50), mode: 'any' | 'all', qty?: number },   // any: Σ SL các mã ≥ qty; all: đủ qty từng mã
  get: { options: [{ sku, itemId?, qty }] (1..20), choose: 1..options.length },          // khách chọn `choose` món trong options
  repeat: boolean, maxGiftQty?: number }
```

- Đầu vào thêm `context.giftChoice?: { [policyKey]: sku[] }`: lựa chọn của thu ngân / khách.
- Chưa chọn thì trả `pendingChoice` để máy bán hiện hộp chọn. Hộp "Chọn quà tặng" đã có sẵn cột "Đã chọn".

**c) `sale.promo.order_gift@2` (K4).** Như `@1`, thêm `multiply: boolean`. Khi bật, tặng `floor(tổng / minOrder)` lần quà của bậc đạt được, kẹp theo `maxTimes?`.

**d) Phạm vi nhóm / nhãn (K3), cho cả ba khuôn trên.** `scope?: { skus?, groupCodes?, brandCodes? }`. **Chốt: bộ tính tự tra nhóm / nhãn của dòng giỏ qua danh mục** (`bizcity_read.products`); nguồn bán không phải gửi thêm.

## 3. Không thuộc khuôn (module `pos` tự làm)

- **Giới hạn lượt theo khách** (K6): đếm lượt dùng theo khách ở `mod_pos.promo_uses`, như hạn mức theo cửa hàng đang có.
- **Kiểm soát quà cho hàng dưới 24 tháng** (K5): luật kiểm ở module, dựa trên cờ mặt hàng.

## 4. Kiểm thử đề nghị

- Mỗi khuôn có ca mẫu (như `@1`): giỏ khớp / không khớp, bậc, làm tròn.
- `any` và `all` cho phần mua.
- Chọn quà: chọn đủ / thiếu / sai món, và `pendingChoice` khi chưa chọn.
- Nhân bội số kẹp theo `maxTimes`.
- Phạm vi theo nhóm / nhãn.
- `@1` chạy y như cũ, bộ ca mẫu hiện có không đổi.

## 5. Ca nghiệm thu chính

| Ca | Khuôn | Giỏ | Kết quả |
|---|---|---|---|
| 1 | price_lines@2: A giá 90.000, B giảm 10 % | 2 A (100.000), 1 B (200.000) | giảm 20.000 + 20.000 |
| 2 | buy_x_get_y@2 any: mua 3 trong {A, B}, tặng 1 chọn trong {Q1, Q2} | 2 A + 1 B, chọn Q2 | tặng 1 Q2 |
| 3 | như ca 2, chưa chọn quà | 2 A + 1 B | `pendingChoice` (Q1, Q2) — máy bán hiện hộp chọn |
| 4 | buy_x_get_y@2 all: mua đủ 1 A và 1 B | 2 A | không tặng |
| 5 | order_gift@2 multiply, ngưỡng 1.000.000 tặng 1 Q, maxTimes 3 | tổng 3.500.000 | tặng 3 Q |
| 6 | scope groupCodes [SUA-BOT] | dòng thuộc nhóm khác | không áp |
| 7 | Bộ ca mẫu `@1` hiện có | — | chạy y như cũ |
