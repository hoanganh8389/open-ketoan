# PHASE-042 · 40 — Checklist
<!-- [2026-11-25 06:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-042 — việc con S042-*; mã LD-* là việc xuyên repo theo dõi ở bizcity-platform PHASE-001. -->

Ký hiệu: ☐ chưa · 🟡 đang · ✅ xong · ⛔ chờ người ngoài nhóm.

## Việc

| ID | Việc | Đợt | Ưu tiên | Code? | Trạng thái |
|---|---|---|---|---|---|
| S042-0 | README + checklist; đo hiện trạng trên `main` 631b5a7 (LD xuyên repo: bizcity-platform PHASE-001) | W0 | P0 | không | ✅ 2026-11-25 |
| S042-1 | scope `stock:read` (risk read), `APP_SCOPES`; thiếu scope ⇒ 403 (LD-KT-1) | W1 | P0 | có | ☐ |
| S042-2 | `GET /api/v1/inventory/availability` theo `bizcity_stock_read@1` — onHand, pendingOut, held, available; test Postgres thật (LD-KT-2) | W1 | P0 | có | ☐ |
| S042-3 | `order-flow-check --profile stock` ĐẠT trên bản thử, bằng chứng vào `evidence/` (LD-KT-2) | W1 | P0 | không | ☐ |
| S042-4 | MCP `kt_stock` dùng hàm S042-2 (LD-KT-3) | W2 | P1 | có | ☐ |
| S042-5 | phiếu `sale` lưu `links` về `pos.order` (role `source`) (LD-KT-4) | W3 | P1 | có | ☐ |
| S042-6 | `pos.order.create` nhận nguồn đơn chờ `saleSource=crm`, `sourceRef`, idempotent (LD-KT-5) | W3 | P1 | có | ☐ |

## Ca bằng chứng

| ID | Ca | Mong đợi |
|---|---|---|
| T042-1 | đọc tồn 3 mã Q3 sau 1 phiếu ghi sổ + 1 phiếu chờ + 1 Đơn đặt hàng đã gửi | `onHand`, `pendingOut`, `held` đúng; `available` đúng công thức |
| T042-2 | khoá chỉ `reports:read` / không khoá | 403 / 401 |
| T042-3 | mã lạ trong lô | dòng đó `error: IN-ITEM-008`, các dòng khác vẫn trả |
| T042-4 | phiếu bán có `links` | `document_links` có dòng role `source` tới `pos.order:<id>` |

## Nhật ký

| Ngày | Việc |
|---|---|
| 2026-11-25 | mở phase (W0), chủ dự án chốt Q-ORD-1..8 ở bizcity-platform |
