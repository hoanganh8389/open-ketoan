# PHASE-042 — Đọc tồn cho app ngoài (CRM) và nối nguồn đơn chờ vào phiếu bán
<!-- [2026-11-25 06:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-042 — W0: phần của open-ketoan trong luồng đơn xuyên app (bizcity-platform PHASE-001, chuẩn bizcity_order_flow@1). Chủ dự án chốt Q-ORD-1..8 ngày 2026-11-25. Số 041 đã do #616 / #617 giữ (tách gói chung). -->
> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> **Việc lộ trình:** — (mở rộng PHASE-032 Inventory Engine, PHASE-040 chứng từ xuyên suốt)
> **Checklist công bố:** —
> **Phân hệ:** kho · ban-hang · he-thong
> **Trạng thái:** ☐ W0 tài liệu 2026-11-25; 0% mã. Giữ chỗ đợt mã ở [CLAIMS.md](../CLAIMS.md) theo R-FLOW khi có người nhận.
> **Mức Kernel:** K1 (scope mới, route đọc mới, trường `links` trên chứng từ). **Không** đổi cách ghi sổ, **không** migration tạo bảng giữ hàng (Q-ORD-2: đợt 1 không giữ hàng).
> **Nền:** [`bizcity_order_flow@1`](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-ORDER-FLOW-v1.md) §2 (`bizcity_stock_read@1`) · [PHASE-001 xuyên repo](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/phases/PHASE-001-LUONG-DON-CRM-POS-KE-TOAN/README.md) · [bizcity_inventory@1](../../contracts/BIZCITY-INVENTORY-v1.md) · [bizcity_mcp@1](../../contracts/BIZCITY-MCP-v1.md) §5.1 · [RULE-OPEN-POS-CONNECTION](../../rules/RULE-OPEN-POS-CONNECTION.md)
> **Trạng thái việc xuyên repo:** mã `LD-KT-*` ở [bizcity-platform PHASE-001 CHECKLIST](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/phases/PHASE-001-LUONG-DON-CRM-POS-KE-TOAN/CHECKLIST.md); việc con `S042-*` của repo này ở [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md).

## Vai của open-ketoan trong luồng

```text
CRM (open-cake / open-crm) ──GET /inventory/availability (stock:read)──▶ open-ketoan      ← phase này: S042-1..4
CRM ──đơn chờ──▶ open-pos-backend ──xác nhận──▶ open-pos ──bàn giao vận chuyển (GHI NHẬN)──▶ bridge / module pos ──phiếu sale──▶ open-ketoan   ← S042-5, 6
```

open-ketoan là **nguồn sự thật tồn kho** theo `tenant` × `branch_code` × `item_id` và nhận phiếu bán **sau** khi POS ghi nhận. open-ketoan **không** biết đơn chờ, **không** giữ `contact_id`, **không** cho CRM ghi chứng từ.

## Hiện trạng đọc mã (main 631b5a7, 2026-11-25)

| Có | Ở đâu |
|---|---|
| view tồn `bizcity_read.stock_on_hand` (`tenant_id, branch_code, warehouse_code, item_id, sku, qty`, ĐVT nhỏ nhất, có thể âm, RLS) | `db/migrations/0109_doc_gia_ton_chi_nhanh.sql:47` |
| `GET /api/v1/inventory/items?search&branchCode&skus` — scope `reports:read` (rộng: mọi báo cáo) | `apps/api/src/modules/inventory/inventory-report.routes.ts:60` |
| `pos.stock.get` ⇒ `{sku, available, held}`, `held` cứng 0, chỉ chi nhánh người gọi | `modules/pos/api/catalog.ts:77-85` |
| Đơn đặt hàng BH20: giữ hàng bằng phiếu `transfer` sang kho giữ KCB | `modules/phieu-ban/api/domain/order.ts:308` |
| phiếu nhận ở `pending` không ghi `inventory_movements` tới khi ghi sổ | `packages/kernel/src/modules/documents/document.service.ts:467` vs `:511` |
| scope khoá API: `documents:write`, `reports:read`, `catalog:write` | `apps/api/src/modules/access/access.schemas.ts:84` |
| `GET /api/v1/inventory/balances`, MCP `kt_stock` — **chỉ có trong tài liệu** | `docs/contracts/BIZCITY-INVENTORY-v1.md:82`, `docs/contracts/BIZCITY-MCP-v1.md` §5.1 |

## Việc (chi tiết ở [40](40-MASTER-CHECKLIST.md))

| S042 | LD | Việc |
|---|---|---|
| S042-1 | LD-KT-1 | scope `stock:read` (risk `read`) vào `access.schemas.ts` và `APP_SCOPES`; khoá không có scope ⇒ 403 |
| S042-2 | LD-KT-2 | `GET /api/v1/inventory/availability?branchCode&itemIds|skus` (≤ 100) đúng `$defs.stockRow` của chuẩn: `onHand` từ `stock_on_hand`, `pendingOut` từ phiếu xuất / bán đã nhận chưa ghi sổ, `held` từ kho giữ BH20, `available = onHand − pendingOut − held`; mã lạ ⇒ dòng `error`; ĐVT gốc; không giá vốn |
| S042-3 | LD-KT-2 | chạy `node ../bizcity-platform/tools/order-flow-check.mjs --profile stock` trên bản thử ⇒ ĐẠT (SC-ORD-4) |
| S042-4 | LD-KT-3 | MCP `kt_stock` gọi đúng hàm S042-2, cùng scope (đúng `BIZCITY-MCP-v1.md` §5.1) |
| S042-5 | LD-KT-4 | phiếu `sale` nhận và lưu `links` (`pos.order:<id>` role `source`) vào `document_links`; tra ngược được về yêu cầu đặt hàng của CRM |
| S042-6 | LD-KT-5 | module `pos`: `pos.order.create` nhận `saleSource=crm` + `sourceRef=pos.order_request:<id>`, Idempotency-Key = `sourceRef` (shop engine React, Q-ORD-8) |

## Quyết định đã chốt (chủ dự án 2026-11-25, chuẩn §8)

- Đơn chờ ở open-pos-backend; Đơn đặt hàng BH20 **không** làm cửa nhận của CRM (Q-ORD-1).
- Đợt 1 không giữ hàng khi đơn chờ ⇒ phase này **không** thêm bảng giữ hàng; `held` chỉ phản ánh kho giữ BH20 đang có (Q-ORD-2).
- Ghi nhận bán khi POS bàn giao vận chuyển ⇒ phiếu `sale` tới Kế Toán như phiếu bán quầy, chỉ thêm `links` (Q-ORD-3).

## Xong khi

Trên bản thử Shop Hoa Mai (CSDL có chữ "test"): đọc tồn Q3 của 3 mã ⇒ đúng `onHand` sau một phiếu đã ghi sổ, `pendingOut` tăng khi có phiếu chờ, `held` tăng khi gửi một Đơn đặt hàng; khoá chỉ có `reports:read` ⇒ 403; `order-flow-check --profile stock` ĐẠT; phiếu bán từ đơn CRM tra ngược được `pos.order` qua `document_links`; selfcheck trên `main` không thêm phát hiện.
