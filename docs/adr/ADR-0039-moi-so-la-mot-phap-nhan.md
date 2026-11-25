# ADR-0039 · Mỗi sổ là một pháp nhân; tenant_id chỉ là khoá kỹ thuật
<!-- [2026-11-23 06:40 PM Johnny Chu - Chu Hoàng Anh] OKT-P0-3 — luật tối thượng P-0 ý 3; chủ chốt nghĩa "sổ = đơn vị kế toán" (23/11). -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.

- Trạng thái: **Đề xuất** — có hiệu lực khi chủ dự án merge PR chứa tệp này vào `main` (R-FLOW-2, R-FLOW-7).
- Nguồn: luật tối thượng **P-0 ý 3** ([RULE-OPEN-POS-CONNECTION](../rules/RULE-OPEN-POS-CONNECTION.md) mục P-0): *"chỉ có luật mỗi book là 1 pháp nhân, ko có pháp nhân theo tenant id"*. Chủ chốt nghĩa của "book" (23/11): **sổ = đơn vị kế toán** — mỗi cửa hàng / đơn vị có một sổ; pháp nhân là thuộc tính của **sổ đó**. Không tách bảng sổ riêng ở đợt này.
- Ngày: 2026-11-23 · Người quyết: Johnny Chu – Chu Hoàng Anh · Mức Kernel: **K0** (nguyên tắc, không đổi lược đồ).
- Luật liên quan: [R-TEN](../rules/RULE-TENANT-SECURITY.md), [R-OKT-CONN](../rules/RULE-OPEN-POS-CONNECTION.md) (R-OKT-CONN-6). Nền: [ADR-0013](ADR-0013-ho-so-ke-toan-co-phien-ban.md) (hồ sơ kế toán có phiên bản), [ADR-0036](ADR-0036-mot-ban-ma-moi-site-mot-database.md), [ADR-0037](ADR-0037-khoa-cai-dat-open-pos-moi-blog-mot-tenant.md).

## Bối cảnh

Ba khái niệm hay bị trộn:

| Khái niệm | Là gì hôm nay | Dùng để |
|---|---|---|
| **Sổ** (đơn vị kế toán) | một dòng `tenants` trong một bản cài: `name`, `tax_code`, `address`, `phone` + hồ sơ kế toán `accounting_profiles` (chế độ, năm tài chính, **loại pháp nhân** `entity_type`) | xác định **pháp nhân**: tên trên báo cáo, mã số thuế trên hoá đơn, chế độ kế toán |
| **`tenant_id` / mã tenant** | khoá của dòng đó | cô lập dữ liệu (RLS), khoá API, khoá cài đặt (ADR-0037), định danh kỹ thuật (tự kiểm SC-2 của bridge) |
| **Sổ nội bộ / sổ thuế** (`BOOK_MODE`, `posting_rules.book`) | **chế độ của bản cài**: sổ thuế là một bản cài riêng (cơ sở dữ liệu riêng) chỉ nhận chứng từ có hoá đơn | chọn quy tắc định khoản theo mục đích sổ |

Câu "không có pháp nhân theo tenant id" cấm dùng **khoá kỹ thuật** để xác định, đặt tên hay suy ra pháp nhân — không cấm hồ sơ pháp nhân nằm trên dòng của sổ.

## Quyết định

1. **Sổ = đơn vị kế toán = một dòng `tenants` của bản cài.** Pháp nhân (tên, mã số thuế, địa chỉ, loại pháp nhân, chế độ kế toán, năm tài chính) là thuộc tính của **sổ**: các cột của dòng đó và `accounting_profiles` của nó. **Không đổi lược đồ**: `accounting_profiles (tenant_id, version)` đã là hồ sơ **của sổ**.
2. **`tenant_id` và mã tenant chỉ là khoá kỹ thuật.** Không mã nào — ở open-ketoan hay ở bên tích hợp (open-ketoan-bridge, open-pos-backend, open-pos) — được:
   - đặt tên đơn vị / tên trên chứng từ từ mã tenant, `tenant_id`, số blog hay khoá API;
   - suy mã số thuế, loại pháp nhân, chế độ kế toán từ những thứ đó;
   - coi hai sổ là một pháp nhân vì trùng mã tenant (hai bản cài khác nhau có thể cùng mã `shopa`), hay coi là hai pháp nhân vì khác mã.
3. **Đọc pháp nhân từ sổ.** Bên tích hợp cần tên / mã số thuế thì đọc `GET /api/v1/tenant` (`name`, `taxCode`) của **chính sổ** mà khoá đang trỏ, hoặc hồ sơ của shop — không ghép từ mã. Hoá đơn của cửa hàng lấy mã số thuế người bán từ hồ sơ của shop / sổ.
4. **Sổ thuế** là sổ của **bản cài sổ thuế**: dòng `tenants` của bản cài đó mang hồ sơ pháp nhân của nó. Cùng công ty ở sổ nội bộ và sổ thuế là hai sổ ở hai bản cài, mỗi sổ khai hồ sơ của mình; không suy sổ này từ sổ kia qua mã tenant.
5. **Một sổ — một pháp nhân, hôm nay một tenant — một sổ.** Khi nào cần nhiều sổ trong một tenant (vd một khoá kỹ thuật cho nhiều pháp nhân) thì phải có ADR mới (bảng sổ riêng); không làm ở đợt này, không viết mã đoán trước.

## Rà soát lúc chốt (23/11, `main` của bốn repo)

| Repo | Kết quả |
|---|---|
| open-ketoan | `tenants` giữ tên / MST / địa chỉ; `accounting_profiles` theo `tenant_id` của sổ; `GET /api/v1/tenant` trả `name`, `taxCode`. Bảng bản cài (ADR-0037) chỉ trả `tenantCode` để hiện, không suy pháp nhân |
| open-ketoan-bridge | mã tenant chỉ dùng làm danh tính kỹ thuật (tự kiểm SC-2, SC-3; ánh xạ mã) và để hiện; không đặt tên / MST từ mã (luật ghi ở `LUAT-TOI-THUONG.md`) |
| open-pos-backend, open-pos | không có chỗ suy tên / MST / pháp nhân từ tenant (tìm theo mẫu `tenant…(tax|mst|name|company|legal)` và ngược lại: 0) |

## Phương án đã loại

| Phương án | Vì sao loại |
|---|---|
| Tách bảng `books` (pháp nhân) khỏi `tenants`, chuyển `accounting_profiles`, tên, MST sang `book_id` | chủ chốt nghĩa "sổ = đơn vị kế toán": hôm nay một tenant đúng một sổ, tách bảng chỉ thêm migration và đổi API mà không đổi ý nghĩa |
| "Book" = sổ nội bộ / sổ thuế, mỗi bản cài một pháp nhân riêng | trái cách dùng hiện có (sổ thuế là sổ thuế của cùng công ty) |

## Hệ quả

- Không migration, không đổi API. Sửa câu ở R-OKT-CONN (P-0) "hồ sơ kế toán phải chuyển sang khoá theo sổ" thành "đã là hồ sơ của sổ (ADR-0039)".
- Review PR ở bốn repo: chỗ nào lấy mã tenant / `tenant_id` / số blog / khoá để dựng tên, MST, loại pháp nhân là vi phạm P-0 ý 3.
