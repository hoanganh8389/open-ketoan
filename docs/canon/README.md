# Canon chung và xương sống xuyên app — áp cho open-ketoan

<!-- [2026-11-24 06:05 PM Johnny Chu - Chu Hoàng Anh] SPINE-2 — chỗ trỏ tới canon chung (open-hub) và chuẩn bizcity_spine@1 (bizcity-platform, chủ duyệt 2026-11-24); khai trục ở bizcity.app.json. Tài liệu thuần, không đổi mã; luật kỹ thuật gốc của repo vẫn ở docs/00-CANON.md và docs/rules/. -->

Repo này là **nguồn luật kỹ thuật gốc** (R-*, hợp đồng `bizcity_*@1`); hai tài liệu cấp trên đứng ngoài repo:

| Tài liệu | Ở đâu | Quan hệ với repo này |
|---|---|---|
| **BIZCITY OPEN CANON** | [open-hub/docs/canon](https://github.com/hoanganh8389/open-hub/blob/main/docs/canon/README.md) | bốn trục dữ liệu, một app một trục, B2B, Twin Brain là não không là chủ dữ liệu. Canon §3 lấy chuẩn gốc **từ repo này** (`bizcity_item_master@1`, `bizcity_master_data@1`, `bizcity_document@1`) |
| **`bizcity_spine@1`** — xương sống xuyên app | [bizcity-platform/docs/standard/BIZCITY-SPINE-v1.md](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-SPINE-v1.md) · schema máy đọc ở repo bizcity-platform (thư mục schema/spine của gói contracts) · kiểm `tools/spine-check.mjs` | đặt tên chung cho định danh, bản sao, gửi sau, đối chiếu để app PHP / Python nối vào lõi này cùng một cách |

## open-ketoan trong xương sống (`bizcity.app.json` ở gốc repo)

| | |
|---|---|
| Làm chủ | `item` (`item_id` ULID, `item_codes` có hiệu lực — ADR-0017), `uom` (`product_units`), `branch` (`branches.code`), `partner` (`partners.code`; `partner_id` bigint nội bộ), sổ cái (`ledger`), chứng từ `bizcity.ledger.event:<docKey>` và chứng từ các module |
| Dùng | `tenant` (slug = `tenants.code`; `tenant_id` bigint nội bộ không lộ ra dây), `user` (`sub = wp:<id>` qua SSO; vai và quyền ở đây, `bizcity_authorization@1`) |
| Mở cho app khác | tra mã (`core.item.*`, `PUT /api/v1/partners/:code`), `Idempotency-Key` ở route ghi, `document_links`; **sắp có** (Q-SPINE-3): changefeed `?since=<cursor>` + `digest` cho `items`, `partners`, `branches` |
| Không làm | không giữ `contact_id` (trục của open-cake); không nhận `id` lạ từ ngoài (`IN-ITEM-008`); không tự tạo mặt hàng từ chứng từ (R-ITEM-6) |

## Kiểm

```bash
node ../bizcity-platform/tools/spine-check.mjs --manifest bizcity.app.json   # SC-SPINE-1, phải ĐẠT
node tests/conformance/selfcheck.mjs                                         # bộ kiểm của repo, như cũ
```

Thay đổi hợp đồng gốc ở đây (`docs/contracts/`) mà làm đổi dạng ID / hình `*Ref` thì phải đổi chuẩn spine cùng lúc (ADR ở bizcity-platform), rồi canon open-hub trỏ theo.
