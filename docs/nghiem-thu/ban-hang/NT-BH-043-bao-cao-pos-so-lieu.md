# NT-BH-043 · Báo cáo bán hàng máy POS: đủ cột như POS cũ, gom số ở máy chủ
<!-- [2026-11-25 10:30 PM Võ Hoàng] NGHIEM-THU — chốt NT-BH-043 (anh Hoàng, 25/11 — mọi câu theo đề xuất) (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng — module `pos` (open-ketoan, phần máy chủ); máy bán POS React (repo open-pos = `tgs_pos/react`, PR riêng) |
| Màn hình | Máy bán POS React, nhóm Báo cáo: Báo cáo bán hàng (`sales-report`), Tổng hợp bán hàng (`sales-summary`), Thu tiền bán hàng (`sales-collection`), Bán hàng theo danh mục (`category-sales`), Doanh số theo ngày (`daily-sales`) |
| Ngày tạo | 25/11/2026 |
| Trạng thái | **Đã chốt 25/11/2026** (Võ Hoàng) — mọi câu §6 theo phương án đề xuất |
| Căn cứ | Quyết định của anh Hoàng 25/11: module `pos` trả các trường còn thiếu và gom số ở máy chủ. Đối chiếu POS cũ `tgs_pos/templates/front/*.php`; NT-BH-007 (ca bán, báo cáo), NT-BH-008 (quản trị bán lẻ) |

## 1. Hiện trạng (đọc trên `origin/main` 25/11)

### 1a. Máy bán React (open-pos)

- Năm màn ở `tgs_pos/react/src/features/reports/` đều lấy số qua `useSalesReportSource` (`react/src/api/hooks/reports.ts`):
  - `GET /pos/reports/orders?status=completed` (action `pos.report.orders`);
  - `GET /pos/returns` (action `pos.return.list`).
- `fetchAllPages` (`react/src/api/hooks/backoffice.ts`) tải từng trang 200 dòng, **tối đa 25 trang = 5.000 đơn và 5.000 phiếu trả**. Vượt thì `truncated` và màn báo "chưa tải hết".
- Gom số trên máy trong `salesFacts.ts`: `lineRows`, `summaryRows`, `collectionRows`, `categoryRows`, `dailyRows`.
- Nhóm hàng chỉ có **mã nhóm** (`Product.groupCode` của danh mục lưu trên máy) và hiện "Nhóm <mã>"; không có tên, không có cây.

| Màn React | POS cũ (PHP) | Nguồn số hiện nay | Cột / chức năng còn thiếu so với POS cũ |
|---|---|---|---|
| `SalesReportPage.tsx` (một dòng một mặt hàng của phiếu bán / trả) | `templates/front/pos-sales-report.php` → `templates/front/partials/pos-bctk-sales-report.php` (report_type `sales`) | orders + returns, gom trên máy | **Giá vốn, Nhân viên, Mã NV, Số lô, Hạn dùng**; nhóm chỉ có mã |
| `SalesSummaryPage.tsx` (một dòng một phiếu) | `templates/front/pos-sales-summary.php` → cùng partial (report_type `sales_summary`) | như trên | **Nhân viên, Mã NV, Ghi chú phiếu, Thêm quà thủ công** |
| `SalesCollectionPage.tsx` (một dòng một lần thu) | `templates/front/pos-sales-collection-report.php` | orders, tách theo hình thức thanh toán | **Số phiếu thu tiền**, Mã HTsoft, **Ngân hàng**, **User tạo PTT** |
| `CategorySalesPage.tsx` (gom theo mã hàng, lọc danh mục) | `templates/front/pos-category-sales-report.php` | gom `lineRows` | **Cây danh mục** (tên nhóm, nhóm cha, chọn nhóm cha lấy cả nhóm con) |
| `DailySalesPage.tsx` (mỗi ngày của tháng một dòng) | `templates/front/pos-daily-sales-report.php` | gom `lineRows` | Lọc theo cây danh mục; tháng đông đơn bị cắt 5.000 |

### 1b. Số liệu đang có ở open-ketoan

| Cần | Có ở đâu | Module `pos` đọc được chưa |
|---|---|---|
| Đơn, dòng, phiếu trả, dòng trả | `mod_pos.orders` (`snapshot`, `code`, `business_date`, `cashier_name`, `created_by`), `mod_pos.order_lines`, `mod_pos.returns`, `mod_pos.return_lines` (`modules/pos/migrations/0001…0005`) | Có (bảng của module) |
| Thu ngân | `orders.cashier_name` / `returns.cashier_name` (0005; đơn trước 0005 để trống), định danh ở `created_by` | Có — `modules/pos/api/admin.ts` đã trả `cashier` cho màn quản trị, **`pos.report.orders` chưa trả** (`listOrders` ở `modules/pos/api/shifts.ts` chỉ trả `snapshot`) |
| Ghi chú phiếu, kênh, hình thức + mã tham chiếu thanh toán | `orders.snapshot` | Có |
| Số phiếu thu | Luật bán `packages/kernel/src/modules/posting/rules/sale.rule.ts` dòng ~98: bút toán thu tiền có `docNo = pay.reference \|\| doc.docNo` — **không có phiếu thu riêng**, số = mã tham chiếu thanh toán hoặc số đơn | Có (tính từ snapshot) |
| Nhóm hàng, cây | `public.item_classes` (`kind = 'group'`, `code`, `name`, `full_name` — 0118, `parent_code`); `bizcity_read.products.group_code` | **Chưa** — không có khung nhìn `bizcity_read` cho `item_classes` |
| Số lô, hạn dùng đã xuất | `public.inventory_lot_moves` + `public.item_lots` (0098), nối `inventory_movements.event_id` → sự việc của đơn | **Chưa** — không có khung nhìn |
| Giá vốn | `public.costing_runs` + `public.costing_run_lines.unit_cost` (0152): đơn giá bình quân theo chi nhánh tính giá × tháng, **chỉ có sau khi chạy Tính giá vốn tháng** | **Chưa** — không có khung nhìn |
| Ngân hàng của hình thức | `bizcity_read.payment_methods` | Có |

## 2. Mục tiêu

- Máy chủ trả **đủ cột** như POS cũ.
- Máy chủ **gom số và chia trang**; React không tải hết đơn, không còn trần 5.000.
- Chân bảng (tổng) do máy chủ tính trên **toàn bộ** khoảng lọc, không chỉ trang đang xem.
- Quy ước số của POS cũ giữ nguyên:
  - dòng bán lý do `XBA`, dòng trả `NTH1`;
  - SL / thành tiền dòng trả ghi số dương, cột Doanh thu dòng trả ghi âm;
  - báo cáo theo danh mục / theo ngày trừ số lượng dòng trả.

## 3. Phạm vi

### 3a. Action mới của module `pos` (chỉ đọc)

| Action | Đường dẫn (`/api/v1/m/pos…`) | Tham số | Trả |
|---|---|---|---|
| `pos.report.sales-lines` | `GET /reports/sales-lines` | `from, to, kind=sale\|return\|all, groups (mã nhóm, lấy cả nhóm con), q, page, pageSize ≤ 500, branch` | Dòng như `LineRow` hiện tại + `cashier`, `cashierId`, `groupName`, `groupPath`, `lots[] {lotNo, expDate, qty}`, `unitCost`, `costAmount` (null khi tháng chưa tính giá vốn), `costStatus`; `meta.sums` (SL, thành tiền, doanh thu, thuế, trước thuế, giá vốn) |
| `pos.report.sales-summary` | `GET /reports/sales-summary` | `from, to, kind, q, page, pageSize ≤ 500, branch` | Một dòng một phiếu + `cashier`, `note`, `manualGift` (có dòng quà thêm tay), `paid`, `debt`; `meta.sums` |
| `pos.report.collections` | `GET /reports/collections` | `from, to, method, page, pageSize ≤ 500, branch` | Một dòng một lần thu: `receiptNo` (= mã tham chiếu thanh toán hoặc số đơn, như sổ), `bank`, `createdBy` (thu ngân), các cột đang có; `meta.sums` |
| `pos.report.by-category` | `GET /reports/by-category` | `from, to, groups, view=all\|qty\|revenue, branch` | Gom SQL theo mã hàng (+ nhóm, đường nhóm); không chia trang (số dòng = số mã) |
| `pos.report.daily` | `GET /reports/daily` | `year, month, groups, branch` | Một dòng một ngày (tháng đang chạy tới hôm nay), SL, doanh thu, tỉ trọng |

- **Quyền:**
  - đọc chi nhánh đang mở: `pos:sell` (như `pos.report.orders`);
  - tham số `branch` khác chi nhánh của máy: thêm `pos:report`;
  - cột **Giá vốn**: chỉ trả khi có `pos:report` (Q3).
- Mỗi action có `effect: 'read'`, `ai: 'read'`, khai trong `modules/pos/bizcity.module.json` → `actions`.

### 3b. Khung nhìn đọc cần Core thêm (PR riêng; R-FLOW-4 — báo Thủy / anh Hoàng chốt)

| Khung nhìn | Cột | Nguồn |
|---|---|---|
| `bizcity_read.item_groups` | `code, name, full_name, parent_code, is_active` | `item_classes` `kind = 'group'` |
| `bizcity_read.document_lots` | `doc_key, line_no, sku, lot_no, exp_date, qty` | `inventory_lot_moves` ⨝ `item_lots` ⨝ `inventory_movements` ⨝ `accounting_events.doc_key` |
| `bizcity_read.monthly_unit_costs` | `branch_code (chi nhánh tính giá), year, month, sku, unit_cost, run_at` | lần tính mới nhất mỗi tháng của `costing_runs` / `costing_run_lines` |

Migration `db/migrations/<số kế tiếp>_doc_bao_cao_pos.sql`, cùng khuôn 0044 / 0109: `security_invoker`, trigger chặn ghi, COMMENT từng cột. Không đổi bảng, không chạm sổ.

### 3c. Máy bán React (open-pos, PR riêng sau khi PR module vào main)

- `useSalesReportSource` → năm hook gọi năm action, chia trang máy chủ (500 / trang).
- Lọc cột trên trang đang xem; tổng lấy `meta.sums`.
- Xuất Excel gọi lại action với `pageSize` lớn theo lô (≤ 20.000 dòng, quá thì báo thu hẹp ngày).
- Thêm cột: Giá vốn, Nhân viên, Mã NV, Số lô, Hạn dùng, Ghi chú phiếu, Số phiếu thu, Ngân hàng, Người thu.
- Bộ chọn danh mục dạng cây.
- Bỏ `truncated`.

### Tệp sẽ chạm (dòng CLAIMS)

**open-ketoan — module `pos`:**

```
modules/pos/api/actions/report-sales-lines.ts      (mới)
modules/pos/api/actions/report-sales-summary.ts    (mới)
modules/pos/api/actions/report-collections.ts      (mới)
modules/pos/api/actions/report-by-category.ts      (mới)
modules/pos/api/actions/report-daily.ts            (mới)
modules/pos/api/sales-report.ts                    (mới — SQL đọc)
modules/pos/api/domain/sales-report.ts             (mới — quy ước XBA / NTH1, dấu, tỉ trọng)
modules/pos/api/index.ts
modules/pos/bizcity.module.json                    (5 action; data.reads thêm 3 khung nhìn; version 0.5.0)
modules/pos/README.md
modules/pos/test/sales-report.test.ts              (mới)
apps/api/test/nt-bh-043-bao-cao-pos.test.ts        (mới)
docs/nghiem-thu/ban-hang/NT-BH-043-bao-cao-pos-so-lieu.md (mới)
CHANGELOG.md
```

**open-ketoan — Core (PR riêng, người được giao):**

```
db/migrations/<số kế tiếp>_doc_bao_cao_pos.sql
docs/contracts/BIZCITY-DATA-v1.md                  (mục khung nhìn đọc)
```

**open-pos (`tgs_pos`, PR riêng):**

```
react/src/api/hooks/reports.ts
react/src/api/types.ts
react/src/features/reports/salesFacts.ts           (bỏ gom; giữ hàm định dạng)
react/src/features/reports/columns.ts
react/src/features/reports/filters.tsx             (cây danh mục)
react/src/features/reports/useReportCtx.ts
react/src/features/reports/ReportGrid.tsx          (chia trang, tổng từ meta)
react/src/features/reports/SalesReportPage.tsx
react/src/features/reports/SalesSummaryPage.tsx
react/src/features/reports/SalesCollectionPage.tsx
react/src/features/reports/CategorySalesPage.tsx
react/src/features/reports/DailySalesPage.tsx
react/src/features/reports/*.test.tsx, salesFacts.test.ts, testFixtures.tsx
react/dist/**                                      (build commit theo quy trình tgs_pos)
```

## 4. Ca nghiệm thu

Dữ liệu chung:
- Cửa hàng CH01, tháng 11/2026.
- Nhóm hàng `SUA` "Sữa" có con `SUA-BOT` "Sữa bột", `SUA-NUOC` "Sữa nước".
- Mã `SB01`: nhóm SUA-BOT, giá 330.000, thuế 8 %.
- Mã `SN01`: nhóm SUA-NUOC, giá 30.000.
- Tháng 10 đã tính giá vốn: SB01 bình quân 250.000. Tháng 11 chưa tính.

| Ca | Thao tác | Kết quả mong đợi |
|---|---|---|
| 1 | Thu ngân **An** bán đơn `B01` ngày 20/10: SB01 × 2, lô `L2511` HSD 30/06/2027, tiền mặt. Mở Báo cáo bán hàng 20/10 | Một dòng SB01: SL 2, Thành tiền 660.000, Nhân viên "An", Mã NV = định danh của An, Số lô L2511, Hạn dùng 30/06/2027, **Giá vốn 500.000** |
| 2 | Đơn `B02` ngày 25/11 SB01 × 1 | Giá vốn trống, ghi chú "Chưa tính giá vốn tháng 11/2026"; tổng giá vốn chỉ cộng tháng đã tính |
| 3 | Trả 1 SB01 của `B01` ngày 21/10, Loại = Tất cả | Dòng trả lý do NTH1, SL 1, Thành tiền 330.000, Doanh thu **−330.000** (quy ước POS cũ) |
| 4 | CH01 có **6.200 đơn** trong tháng 11, mở Báo cáo bán hàng cả tháng | Trang 1 có 500 dòng; chân bảng = tổng của cả 6.200 đơn (bằng tổng Sổ ca cả tháng); không còn báo "chưa tải hết" |
| 5 | Theo danh mục, chọn nhóm **SUA** | Gồm SB01 và SN01 (nhóm con); cột Nhóm hiện "Sữa / Sữa bột" |
| 6 | Doanh số theo ngày tháng 11, lọc SUA-NUOC | Mỗi ngày 1–25/11 một dòng; tỉ trọng các ngày cộng 100 % |
| 7 | Thu tiền: `B03` 500.000 = 200.000 tiền mặt + 300.000 chuyển khoản tham chiếu `FT2511ABC` (Vietcombank) | Hai dòng: TBHTM 200.000 số phiếu thu `B03`; TTBHK 300.000 số phiếu thu `FT2511ABC`, Ngân hàng Vietcombank, Người thu An |
| 8 | Tổng hợp bán hàng: `B04` có ghi chú "Giao chiều", có dòng quà thêm tay | Cột Ghi chú phiếu "Giao chiều", Thêm quà thủ công = Có |
| 9 | Thu ngân (chỉ `pos:sell`) mở báo cáo | Không có cột Giá vốn; gọi `branch=CH02` → 403 |
| 10 | Kế toán (`pos:report`) gọi `branch=CH02` | Trả số của CH02, có Giá vốn |
| 11 | Đơn trước migration 0005 (không có `cashier_name`) | Nhân viên trống, Mã NV vẫn có (`created_by`) |
| 12 | Khoảng ngày > 92 ngày | `VALIDATION_ERROR` "Khoảng ngày tối đa 92 ngày" (trừ `daily` theo tháng) |

## 5. Câu hỏi ngược R-REV-17 (đề xuất trả lời)

Báo cáo **chỉ đọc**: không có form ghi nên không cần bản đồ lỗi form. Câu hỏi về lọc, quyền, phạm vi:

| Mã | Câu | Đề xuất trả lời |
|---|---|---|
| Q-CHUNG-01 | Ai xem được, xem chi nhánh nào? | Máy bán: chi nhánh đang mở (`pos:sell`). Chi nhánh khác / nhiều chi nhánh: `pos:report`, trong phạm vi chi nhánh được gán (NT-HT-003) |
| Q-CHUNG-06 | Lọc sai (từ > đến, khoảng quá dài)? | Báo ở ô ngày trước khi gọi; máy chủ kiểm lại (`VALIDATION_ERROR`, `fields: from/to`) |
| Q-CHUNG-08 | Bộ chọn danh mục nhận gì? | Nhóm đang dùng của đơn vị, dạng cây; chọn cha lấy cả con |
| R-1 | Số trên báo cáo khớp sổ chưa? | Doanh thu = tổng đơn `completed` − trả, cùng nguồn Sổ ca; giá vốn chỉ là tham chiếu bình quân tháng (bút toán giá vốn ở ACC49) |
| R-2 | Đơn huỷ / chờ thanh toán có vào báo cáo? | Không (chỉ `completed`, như hiện nay) |
| R-3 | Ngày lọc theo ngày nào? | Ngày kinh doanh `business_date` (như hiện nay) |
| R-4 | Xuất Excel lộ giá vốn cho thu ngân? | Không — cột không có trong dữ liệu trả về khi thiếu `pos:report` |

## 6. Câu chốt (25/11/2026 — theo phương án đề xuất)

| # | Câu | Phương án đề xuất | Phương án khác |
|---|---|---|---|
| Q1 | Giá vốn lấy gì? | **Đơn giá bình quân tháng của lần Tính giá vốn mới nhất** (`costing_run_lines`); tháng chưa tính để trống + ghi chú | (b) giá vốn tạm = bình quân tháng trước; (c) bỏ cột Giá vốn khỏi máy bán, chỉ xem ở báo cáo kế toán |
| Q2 | "Nhân viên / Mã NV" là ai? | **Thu ngân lập đơn** (`cashier_name`, `created_by`) | Nhân viên bán (tư vấn) — hiện đơn không ghi; phải thêm ô trên máy bán (việc khác) |
| Q3 | Ai thấy Giá vốn? | **Chỉ `pos:report`** (kế toán, quản lý) | Mọi người dùng máy bán |
| Q4 | Số phiếu thu | **Như sổ: mã tham chiếu thanh toán, không có thì số đơn**; bỏ "Mã HTsoft" | Sinh số phiếu thu riêng theo dãy (đổi luật bán — Core, không nên) |
| Q5 | Khung nhìn đọc (§3b) do ai làm? | **Hoàng viết migration khung nhìn, Thủy rà** (không đổi bảng, không chạm sổ) | Thủy làm toàn bộ phần Core |
| Q6 | Trần khoảng ngày | **92 ngày** cho báo cáo dòng / phiếu / thu; theo tháng cho Doanh số theo ngày | 31 ngày; không trần (dựa vào chia trang) |
| Q7 | Kích thước trang | **500 dòng / trang**, Xuất Excel lấy theo lô tới 20.000 dòng | 200 như hiện nay; xuất Excel ở máy chủ (tệp) |
| Q8 | Thứ tự PR | **Core khung nhìn → module `pos` → open-pos**; open-pos giữ đường cũ tới khi module lên bản cài | Làm module trước, khung nhìn sau (cột lô / giá vốn / cây để trống tạm) |
| Q9 | Số phiếu | NT-BH-043 | — |
