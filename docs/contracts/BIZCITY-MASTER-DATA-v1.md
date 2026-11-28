# `bizcity_master_data@1` — Danh mục cho phân hệ và plugin
<!-- [2026-11-28 03:44 PM Johnny Chu - Chu Hoàng Anh] FLOW — NC-004 D1 / D2 (chủ chốt Q-PIL-10 ngày 2026-11-28): bản chủ đã dời sang open-platform; tệp này là bản chép giữ cho bộ kiểm của repo (SC-CON-4 / SC-CON-5 / SC-DOC-4) tới khi bộ kiểm đọc bản chủ (C6). -->
> **Bản chủ:** [open-platform — BIZCITY-MASTER-DATA-v1.md](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-MASTER-DATA-v1.md) (từ 2026-11-28). **Sửa văn bản này ⇒ PR vào bizcity-platform trước** (luật đổi chuẩn của bizcity-platform), rồi chép lại đây cùng nội dung; không sửa riêng ở đây.
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->

<!-- [2026-11-05 09:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — 1.1.0: mã ≠ định danh (ADR-0017 / 0018 / 0028 D028-4); thay đổi tương thích — plugin vẫn gửi mã -->

> **Phiên bản:** 1.1.0 · 2026-11-05 (1.0.0 · 2026-10-28) · **Trạng thái:** Ổn định · **Luật:** [R-MD](../rules/RULE-MASTER-DATA.md), [R-ECP](../rules/RULE-ENTERPRISE-CONTINUITY.md) · **Danh sách dữ liệu gốc:** [standard/DU-LIEU-GOC.md](../standard/DU-LIEU-GOC.md)

## 1. Plugin cần gì, lấy ở đâu

| Danh mục | Đọc | Ghi (khoá `catalog:write`) | Dùng trong sự việc tại |
|---|---|---|---|
| Chi nhánh | `GET /api/v1/branches` | `POST /api/v1/branches { code, name }` | `branchCode`, `toBranchCode`, `fromBranchCode`, `lines[].branchCode` |
| Lý do định khoản | `GET /api/v1/posting/reasons` | — | `reasonCode`, `toReasonCode` |
| Loại thuế | `GET /api/v1/tax-codes` | — | `lines[].taxCode` |
| Hình thức thanh toán | `GET /api/v1/posting/payment-methods` | — | `payments[].methodCode`, `methodCode`, `fromMethodCode`, `toMethodCode` |
| Tài khoản ngân hàng | `GET /api/v1/bank-accounts` | — | `fromBankCode`, `toBankCode` |
| Mặt hàng | `GET /api/v1/products` | `PUT /api/v1/products/:sku` | `lines[].sku` |
| Đối tượng | `GET /api/v1/partners` | `PUT /api/v1/partners/:code` (hoặc tự tạo qua `partner` trong sự việc) | `partner.code` |
| Kho | `GET /api/v1/warehouses` | — | `lines[].warehouseCode` |

## 2. Ngữ nghĩa mã

**Mã là phương thức nhận diện, không phải khoá liên kết.** Plugin gửi mã; Core phân giải mã **theo nguồn và ngày chứng từ** (mã hiện hành, mã cũ còn hiệu lực ở ngày đó, bí danh sau gộp, mã ngoài của hệ nguồn) ra **định danh** bất biến rồi lưu định danh. Mã có thể đổi (có phiên bản, ngày hiệu lực) mà sổ không đổi. Cột "Ổn định?" dưới đây nghĩa là: **gửi mã này luôn được Core hiểu đúng ở ngày chứng từ** — không có nghĩa mã không bao giờ đổi. Tài khoản kế toán là ngoại lệ: số hiệu là định danh theo chế độ kế toán.

| Danh mục | Mã | Ổn định? | Ghi chú |
|---|---|---|---|
| Chi nhánh | `code` (+ `external_ref` để khớp mã nguồn) | ✓ | Lõi tìm theo `code` → `external_ref` → mã có đuôi chữ duy nhất |
| Đối tượng | `code` | ✓ | Thường là SĐT khách / mã NCC ở nguồn. Khách lẻ: `KHACH-LE`; NCC lẻ: `NCC-LE` |
| Mặt hàng | `sku` (định danh: `itemId`) | ✓ | Đổi mã giữ `item_id`; mã cũ vẫn phân giải đúng (S026-20). ĐVT tồn kho = ĐVT nhỏ nhất (`product_units` tỉ lệ 1) |
| Hình thức TT | `code` IN HOA, gạch ngang | ✓ | Tên nguồn → bỏ dấu, IN HOA, khoảng trắng thành `-` (`QR VTB CT` → `QR-VTB-CT`); khác thì khai "Đổi hình thức" ở kết nối |
| Loại thuế | `code` | ✓ | Mặc định `KCT`, `R00`, `R05`, `R08`, `R10`; đầu vào `V05`, `V08`, `V10`… |
| Lý do | `code` | ✓ | Mỗi `docType` có một lý do `default` |

## 3. Đồng bộ

- Plugin **kéo** danh mục định kỳ (ví dụ mỗi giờ) hoặc khi gặp lỗi mã lạ; không đẩy danh mục khung kế toán.
- Mã đã bỏ: xem `catalog_tombstones` qua API danh mục (R-MD-10).
- Mã lạ trong sự việc không làm mất sự việc (R-MD-5): sự việc nằm chờ, kế toán khai rồi định khoản lại.

### 3.1 Changefeed và digest — `bizcity_sync@1` (Q-SPINE-3)

<!-- [2026-11-24 07:10 PM Johnny Chu - Chu Hoàng Anh] SPINE-3 — mã đã có (modules/sync, migration 0182, test spine-changefeed): bỏ dấu "(đề xuất)", đường dẫn ghi đúng chuỗi trong mã (/api/v1/sync/:axis). -->

<!-- [2026-11-24 07:10 PM Johnny Chu - Chu Hoàng Anh] SPINE-3 — chủ duyệt 2026-11-24 chuẩn xương sống bizcity_spine@1 (bizcity-platform/docs/standard/BIZCITY-SPINE-v1.md §4.1): open-ketoan là chủ trục item / uom / branch / partner, phải mở cho app khác (bridge, cake) kéo bản sao theo con trỏ và đối chiếu. Tài liệu này là chữ chốt trước PR mã (R-FLOW §3: migration mới). -->

Thay cho "kéo cả bảng mỗi giờ", app khác kéo **phần đã đổi** theo con trỏ và so băm để tìm lệch. Chỉ đọc, quyền `catalog:read`, cô lập theo đơn vị như mọi route danh mục.

| Route | Trả về | Ghi chú |
|---|---|---|
| `GET /api/v1/sync/:axis` — `?since=<cursor>&limit=<1..1000>` | `{ data: ChangeRow[], meta: { cursor, as_of, has_more } }` | `axis` ∈ `items` · `partners` · `branches`; thứ tự `(updated_at, id)` ổn định; `limit` mặc định 200 |
| `GET /api/v1/sync/:axis/digest` — `?since=<cursor>` | `[{ id, version, deleted }]` | so băm theo id, không kéo payload; tối đa 50 000 dòng một lần |

- **ChangeRow** `{ id, version, updated_at, deleted, data }`: `id` = `item_id` (ULID) hoặc `id` bigint dạng chuỗi của partners / branches; `version` = epoch ms của `updated_at`; `deleted` = items `status = retired` · partners / branches `is_active = false` — **dòng ngừng vẫn có mặt** để bản sao đóng dòng, không xoá.
- **Con trỏ** `<updated_at ISO>|<id>` do máy chủ trả, app chỉ chuyền lại; khuôn sai bị chặn ở cửa (`VALIDATION_ERROR`). Trang rỗng trả lại đúng con trỏ đã gửi.
- **`data` của items** kèm `codes` (`item_codes`: kind, code, valid_from, valid_to) và `units` (`product_units` của mã sku đang hiệu lực: uom, ratio, is_default) — ĐVT đi cùng mặt hàng (chuẩn spine §2: uom thuộc item master). `data` của partners / branches: các cột danh mục công khai (mã, tên, loại, mã số thuế, địa chỉ, liên hệ, nhóm, uid, cha); **không** có cột ngân hàng, hạn mức.
- **Xoá vật lý** (chỉ cho dòng chưa từng được tham chiếu — `core.partner.delete`, `core.branch.delete`) không vào feed: digest thiếu id, app đối chiếu tự biết (`RC-SPINE-*`).
- **Migration 0182**: `branches.updated_at` (0001 chưa có); trigger `BEFORE UPDATE` giữ `updated_at` trên items / partners / branches khi câu UPDATE không tự đặt; trigger `AFTER` trên `item_codes` và `product_units` chạm `items.updated_at` để đổi mã / ĐVT làm mặt hàng xuất hiện lại trong feed; chỉ mục `(tenant_id, updated_at, id)`. Không UPDATE dữ liệu sẵn có, không chạm bảng sổ.
- **Không đổi**: hợp đồng ghi (§1, §4), R-MD-1 (lõi giữ, không đồng bộ hai chiều), R-MD-2 (ngoài gửi mã), `catalog_tombstones`.
- Đã có (2026-11-24): `apps/api/src/modules/sync/` (route theo khuôn đọc của `branch.routes.ts`), test `apps/api/test/spine-changefeed.test.ts`.

## 4. Khuôn phần tử

Tên trường đầy đủ của từng danh mục: OpenAPI `/api/docs` (sinh từ zod ở `modules/<ten>/<ten>.schemas.ts`). Plugin chỉ **dựa vào** các trường `code` / `sku` (để gửi), định danh (`id` / `itemId`, để lưu liên kết trong dữ liệu của mình), `name`, `isActive` (hoặc tương đương) — trường khác là thông tin, có thể thêm bất kỳ lúc nào (thay đổi tương thích).
