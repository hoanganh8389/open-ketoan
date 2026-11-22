# RULE · open-pos ⇄ open-ketoan — nguồn theo shop, bảng local ở giữa, quầy vẫn bán khi kế toán tắt (R-OKT-CONN)
<!-- [2026-11-21 01:23 PM Johnny Chu - Chu Hoàng Anh] R-OKT-CONN — luật kết nối open-pos / open-pos-backend với open-ketoan qua open-ketoan-bridge: standalone đầy đủ, kết nối thì theo kế toán, tự cấu hình ánh xạ mặc định, một blog một tenant (chủ dự án 2026-11-21). -->
<!-- [2026-11-21 05:31 PM Johnny Chu - Chu Hoàng Anh] R-OKT-CONN — chỉnh theo chủ dự án 21/11 chiều: admin chọn nguồn danh mục theo shop (local / ketoan) thay cho chế độ tự tính; bảng local ở giữa luôn có; đơn ghi local trước, gửi lên sau commit (R-OKT-CONN-11); mất kết nối khi theo kế toán thì không sửa danh mục; tên repo open-pos / open-pos-backend. -->
<!-- [2026-11-21 07:05 PM Johnny Chu - Chu Hoàng Anh] R-OKT-CONN — chỉnh lần 2 theo chủ: luồng bán, logic bán hàng và sổ của open-pos giữ nguyên; R-OKT-CONN-11 đổi thành "kế toán tắt hay dừng kết nối thì quầy vẫn bán, không mất đơn, giữ đường ghi của từng máy bán"; thêm R-OKT-CONN-12 tạm dừng kết nối theo shop. -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> **Cấp:** Tier 1 (R-OKT-CONN-1…12). Với phía open-pos, đây là **luật tối thượng**: khi mâu thuẫn với quyết định nào khác của open-pos, luật này thắng.
> **Trạng thái:** **Chấp nhận 2026-11-21** (chủ dự án; chỉnh lần 1 lúc 05:31 PM, lần 2 lúc 07:05 PM cùng ngày), **chưa có mã**.
> **Thi hành:** phía WordPress ở repo `open-pos-backend` (trước là `tgs_shop_management`), phase PHASE-001 "Danh mục theo site + đồng bộ open-ketoan" (doc 28; đường dẫn thuộc repo khác). Phía open-ketoan theo mục *Nghĩa vụ phía open-ketoan* bên dưới.
> **Luật nền:** [R-MD](RULE-MASTER-DATA.md) (R-MD-1: kế toán là chủ danh mục), [R-TEN](RULE-TENANT-SECURITY.md) (tenant đi theo khoá API), [R-ECP-CONS](RULE-ENTERPRISE-CONTINUITY.md) (POS là tầng Eventual), [R-GATE](RULE-GATE.md) (R-GATE-9 `auto_create`), [R-FLOW](RULE-FLOW.md).
> **Hợp đồng:** [BIZCITY-CONNECTOR-v1](../contracts/BIZCITY-CONNECTOR-v1.md) · [BIZCITY-MASTER-DATA-v1](../contracts/BIZCITY-MASTER-DATA-v1.md) · feed `GET /api/v1/catalog/feed/{meta,products,prices}`.

## Tên gọi

| Tên | Là gì | Mã nguồn hiện tại |
|---|---|---|
| **open-pos** | Phần bán hàng tại cửa hàng | repo `open-pos` (trước là `tgs_pos`); plugin WordPress thư mục `tgs_pos` (+ `tgs_pos_react`) |
| **open-pos-backend** | Phần cấu hình và quản trị của open-pos: sản phẩm, nhóm, giá, thuế, kết nối | repo `open-pos-backend` (trước là `tgs_shop_management`); plugin thư mục `tgs_shop_management` |
| **open-ketoan-bridge** | Cầu nối duy nhất giữa open-pos và open-ketoan: cấu hình kết nối, gọi API, đẩy chứng từ, nhận sự kiện | repo `open-ketoan-bridge`; plugin `tgs_accounting_bridge` (thư mục `open-ketoan-bridge`) |

Đổi tên chỉ ở repo GitHub; thư mục plugin, tệp chính, slug giữ nguyên.

<!-- [2026-11-23 03:50 PM Johnny Chu - Chu Hoàng Anh] OKT-TOPO-10 — R-OKT-CONN-2, -6 sửa theo luật tối thượng P-0 (ba mô hình khai rõ; nhiều cửa hàng = khoá cài đặt, ADR-0037); nghĩa vụ 3 đã có. Chờ chủ dự án duyệt cùng PR. -->
<!-- [2026-11-23 05:40 AM Johnny Chu - Chu Hoàng Anh] OKT-P-0 — luật tối thượng của chủ (23/11): hai mô hình triển khai + mỗi book là một pháp nhân. -->
## Luật tối thượng P-0

> **Luật tối thượng P-0 (Johnny Chu – Chu Hoàng Anh, 23/11/2026)** — đứng trên mọi luật khác của chương trình open-pos ⇄ open-ketoan (open-ketoan, open-ketoan-bridge, open-pos-backend, open-pos, open-setup). Mâu thuẫn thì P-0 thắng; luật nào trái P-0 phải sửa.
>
> 1. **bizcity.vn (multisite):** "mỗi một blog trên hệ thống multisite của bizcity sẽ yêu cầu một phần mềm kế toán tương ứng. Việc này để demo cho khách mô hình hệ thống chạy như nào." → mỗi blog một tenant, **khoá API riêng từng blog**.
> 2. **Selfhost (ngoài bizcity):** "ưu tiên khóa chung cho cả mạng để người dùng có thể setup chuỗi nhiều cửa hàng dùng POS nhưng vẫn về 1 open-ketoan tương ứng mỗi tenant id = blog_id" — chủ chốt nghĩa (a): **một bản open-ketoan, một khoá chung (khoá cài đặt), mỗi blog là một tenant riêng**, mỗi cửa hàng sổ riêng trên cùng một máy kế toán. Một site = một cửa hàng = một tenant.
> 3. **"Chỉ có luật mỗi book là 1 pháp nhân, không có pháp nhân theo tenant id."** Pháp nhân (tên, mã số thuế, loại pháp nhân, hồ sơ kế toán) là thuộc tính của **sổ (book)**. `tenant_id` chỉ là khoá kỹ thuật (cô lập dữ liệu, khoá API, RLS) — không dùng để xác định, đặt tên hay suy ra pháp nhân.
>
> Mô hình triển khai phải **khai rõ** (`TGS_ACC_DEPLOYMENT` → lựa chọn ở màn Cài đặt của bridge → một site), không đoán từ khoá đang có. Đặc tả: open-setup `docs/chuong-trinh/OKT/00-ADR-OKT-1.md` §0, `81`, `82`.
>
> **Các luật dưới đã sửa theo P-0 (OKT-TOPO-10):** R-OKT-CONN-2 (b, c) và R-OKT-CONN-6 nêu rõ ba mô hình — bizcity: khoá API riêng từng blog · nhiều cửa hàng selfhost: **một khoá cài đặt + `X-OKT-Blog`, open-ketoan đổi (bản cài, blog) → tenant** mà người của sổ đó đã nối ([ADR-0037](../adr/ADR-0037-khoa-cai-dat-open-pos-moi-blog-mot-tenant.md)) · một cửa hàng: khoá của sổ. Hồ sơ kế toán (`accounting_profiles`, loại pháp nhân) hôm nay khoá theo `tenant_id` — phải chuyển sang khoá theo sổ (book) theo P-0 ý 3 (việc OKT-P0-3).

## Nguyên tắc một câu

> **Mỗi shop có một nguồn danh mục do admin chọn: `local` hoặc `ketoan`. Kế toán tắt hay dừng kết nối thì quầy vẫn bán và không mất đơn; luồng bán, logic bán hàng và sổ của open-pos giữ nguyên.**
> - **`local`:** shop tự quản: tự sửa sản phẩm, giá, thuế. Không cần open-ketoan.
> - **`ketoan`:** open-ketoan là **nguồn sự thật**. Bảng local là bản sao chỉ đọc. open-pos-backend **tự cấu hình ánh xạ mặc định** và lấy **dữ liệu đối chứng chuẩn** từ open-ketoan.

## Luật

| Mã | Luật | Thể hiện khi làm việc |
|---|---|---|
| **R-OKT-CONN-1** | **Nguồn danh mục do admin chọn theo shop.** Mỗi blog có một lựa chọn duy nhất `tgs_catalog_source` = `local` \| `ketoan`, đặt bởi người có quyền kết nối. Mọi thao tác sửa sản phẩm, nhóm, giá, thuế, ĐVT ở open-pos-backend đi qua **một cổng ghi** đọc lựa chọn này. Trạng thái kết nối (`tgs_okt_connected( $blog_id )`) chỉ dùng cho shop đang theo `ketoan`; nó **không** tự đổi nguồn. | Không có hai công tắc cho cùng một việc. Công tắc cũ `catalog_from_erp` của bridge bị gỡ, thay bằng lựa chọn theo shop. Chọn mặc định cho shop mới: theo quyết định của open-pos-backend. |
| **R-OKT-CONN-2** | **"Kết nối thành công" là gì.** `tgs_okt_connected()` trả "Có" khi đủ ba điều: **(a)** open-ketoan-bridge đang bật; **(b)** blog có đường nối **theo mô hình đã khai** (P-0): *bizcity / một cửa hàng* — URL + khoá API của tenant blog đó; *nhiều cửa hàng* — URL + khoá cài đặt của bản cài, và blog **đã được kế toán nối** vào sổ (ADR-0037); **(c)** lần kiểm sức khoẻ gần nhất (`GET /api/v1/catalog/feed/meta` bằng đúng đường đó — với khoá cài đặt thì kèm `X-OKT-Blog`: 200, đúng tenant) thành công. Kết quả giữ 60 giây, mỗi lần kiểm thật có timeout ngắn. Phân biệt các kiểu "Không": **lỗi mạng** (hết giờ, 5xx) khi đã từng thành công là *dự phòng*; **chờ nối** (khoá cài đặt, blog chưa đăng ký / chờ mã nối: `BLOG_UNKNOWN`, `BLOG_NOT_LINKED`) là *chưa nối* — đơn giữ trong hàng chờ, không tính lần thử; **bị từ chối** (401 / 403 khác, trùng tenant, bridge tắt, chưa từng thành công) là *hỏng kết nối*. | Màn shop hiện rõ trạng thái: theo kế toán · dự phòng · chưa nối · hỏng kết nối. |
| **R-OKT-CONN-3** | **Shop `local` là chế độ đầy đủ, không phải chế độ lỗi.** open-pos-backend CRUD đầy đủ sản phẩm, nhóm, bảng giá, ĐVT, thuế trong **bảng theo prefix của blog**. Mã không có thuế dùng thuế mặc định của shop (cấu hình, mặc định 8 %). Shop `local` không cần bridge hay open-ketoan để bán. | Gỡ bridge khỏi mạng: shop `local` vẫn bán và setup sản phẩm, không lỗi. |
| **R-OKT-CONN-4** | **Theo kế toán thì không sửa trường gốc.** Shop `ketoan`: trường gốc (định danh, SKU, tên chuẩn, ĐVT và quy đổi, nhóm, thuế, giá theo bảng giá, gán bảng giá, barcode, cờ nghiệp vụ) **chỉ đọc** ở open-pos-backend, sửa ở open-ketoan (R-MD-1). Điều này giữ nguyên cả khi đang **dự phòng** hay **hỏng kết nối**: không sửa danh mục, không thêm mã ở WP. Shop vẫn tự quyết các trường vận hành (bán / ẩn tại shop, tên hiển thị trên POS, nhóm POS, thứ tự, min / max). | Ô trường gốc bị khoá phải ghi **vì sao** và **link sửa ở kế toán** (R-BLOCK). Muốn sửa ở WP thì admin chuyển shop về `local` (R-OKT-CONN-9). |
| **R-OKT-CONN-5** | **Tự cấu hình ánh xạ mặc định.** Khi shop chuyển sang `ketoan` (hoặc kết nối thành công lần đầu), open-pos-backend **tự** dựng ánh xạ từ dữ liệu chuẩn của open-ketoan, admin không phải khai tay: blog ↔ tenant (từ khoá), chi nhánh, bảng giá được gán, nhóm, ĐVT, mã thuế, hình thức thanh toán. Sau đó kéo đầy đủ lần đầu, rồi đối chứng (đếm dòng, hash theo SKU · giá · thuế) và ghi kết quả. Ánh xạ tự dựng xem được, và chỉ đọc khi đang theo `ketoan`. | Màn Kết nối của shop hiện kết quả đối chứng; lệch thì chỉ ra dòng lệch. |
| **R-OKT-CONN-6** | **Một blog = một shop = một tenant (P-0).** 2 shop là 2 blog, ứng với 2 `tenant_id`. Tenant của blog chọn theo **mô hình khai rõ** (hằng `TGS_ACC_DEPLOYMENT` → lựa chọn ở màn Cài đặt của bridge → WordPress một site), **không đoán từ khoá đang có**: *bizcity* — khoá API **riêng từng blog** (R-TEN); *nhiều cửa hàng selfhost* — **một khoá cài đặt cho cả mạng** + `X-OKT-Blog`, open-ketoan đổi (bản cài, blog) ra tenant mà người có quyền ở tenant đó đã nối bằng mã nối (ADR-0037, ngoại lệ có kiểm soát của R-TEN-4; đầu vào là số blog, không bao giờ là `tenantId`); *một cửa hàng* — khoá của sổ, blog 1. Hai blog không được giữ chung một tenant ở **cả ba** mô hình: nếu trùng, cả hai là "hỏng kết nối", màn mạng báo đỏ, tự kiểm tự tạm dừng (open-ketoan cũng chặn một sổ nối hai blog). Khoá chung **cũ** của mạng (một khoá API của một tenant dùng cho mọi blog) dồn mọi blog vào một tenant: chỉ báo vàng và chỉ cách chuyển, không tự tạm dừng cả mạng. Pháp nhân là của **sổ**, không suy từ tenant, khoá hay blog (P-0 ý 3). | Hằng `TGS_KETOAN_API_URL` / `TGS_KETOAN_API_KEY` / `TGS_POS_API_BASE` dùng chung cả mạng không trả lời câu hỏi kết nối hay chọn tenant của từng blog. Khoá cài đặt chỉ chọn tenant qua dòng đã nối. Ma trận ba mô hình (open-setup 82 §5) xanh. |
| **R-OKT-CONN-7** | **Kéo qua bridge, một bộ kéo.** Kết nối (cấu hình, khoá, gọi API, nhận `catalog-changed`) đi qua open-ketoan-bridge. **open-pos-backend** giữ việc kéo catalog / giá / thuế và ghi vào bảng theo prefix của blog, **chỉ** cho shop `ketoan`. Không có job thứ hai ghi catalog. Nhịp: sự kiện tức thời, cron 5 phút, gặp mã lạ, đối soát đêm, bấm tay. | Phần kéo catalog của bridge vào bảng global (`TGS_Acc_Catalog_Sync`) bị gỡ khi open-pos-backend nhận việc. |
| **R-OKT-CONN-8** | **Mã mới tại shop `ketoan`.** Shop tạo mã mới bằng cách **gửi thẳng** open-ketoan (API ghi danh mục, có `Idempotency-Key`). Mã về lại qua feed thì mới bán, trừ khi open-pos-backend chốt khác. Đơn có mã kế toán chưa biết đi vào accounting events và do open-ketoan xử lý (R-GATE-9, `auto_create` giữ bật). | Mã lên kế toán xong thì trường gốc của nó chỉ đọc như mọi mã khác. |
| **R-OKT-CONN-9** | **Chuyển nguồn không mất dữ liệu.** *`local` → `ketoan`* (admin bấm, kết nối đang thành công): mã shop khớp theo SKU rồi barcode; khớp thì gắn `item_id`; không khớp thì gửi lên như mã mới, chỉ những mã shop đã dùng; kéo đầy đủ, đối chứng, rồi kế toán thắng. *`ketoan` → `local`* (admin bấm): dữ liệu đã kéo ở lại và thành của shop, sửa được ngay. *Mất kết nối khi theo `ketoan`*: **không** tự chuyển nguồn, **không** sửa danh mục; quầy vẫn bán từ bảng local (R-OKT-CONN-11). | Mỗi lần chuyển nguồn ghi nhật ký (ai, lúc nào, kết quả đối chứng). Không có bước nào xoá dữ liệu bán hàng hay sổ kho của shop. |
| **R-OKT-CONN-10** | **Phạm vi.** Luật này phủ catalog, giá, hàng hoá và đường ghi đơn bán. Mua hàng và kho (lô, HSD / EAN, phiếu nhập, chuyển kho) sau này lấy về open-ketoan, theo phase riêng. open-pos và open-pos-backend **không dùng bảng global multisite** (`wp_global_product_*`, `wp_global_htsoft_*`) cho catalog và giá. | Bảng global đứng yên, không xoá, cho tới khi mọi shop đã chuyển sang bảng theo prefix. |
| **R-OKT-CONN-11** | **Kế toán tắt hay dừng kết nối thì quầy vẫn bán, không mất đơn; giữ nguyên đường ghi của từng máy bán.** Luồng bán, logic bán hàng (giá, khuyến mại, thuế khi bán) và sổ `local_ledger` của open-pos **không đổi** vì luật này.<br>• **POS cũ:** đơn commit vào sổ local; bridge gửi chứng từ **sau commit**, không bao giờ gọi kế toán trong giao dịch bán (cùng ý R-OUTBOX-1).<br>• **POS React:** giữ đường ghi ở module pos của kế toán, với **chế độ dự phòng** khi kế toán không trả lời (đơn ghi trên máy + WP, phát lại không trùng).<br>Ca mà dự phòng không đỡ được (kế toán tắt trước khi mở ca, máy mới, dừng kết nối dài ngày) thì shop chuyển sang POS cũ. | Ca "tắt kế toán giữa ca" và "tắt trước khi mở ca" bán được ở mọi shop. Đơn gửi lại bao nhiêu lần cũng không trùng (khoá chứng từ ổn định). Thay đổi của bridge / quản trị không chạm đường checkout. |
| **R-OKT-CONN-12** | **Tạm dừng kết nối theo shop.** Admin shop tạm dừng được kết nối của shop mình mà không xoá khoá: bridge vẫn ghi sự kiện, không gửi, không thử lại, không báo lỗi. Bỏ tạm dừng thì gửi bù cả hàng chờ theo thứ tự, không trùng. Shop đang theo `ketoan` vẫn không sửa trường gốc khi tạm dừng; muốn sửa thì chuyển về `local` (R-OKT-CONN-9). | Màn kết nối của shop hiện "Đang tạm dừng từ HH:MM, N chứng từ chờ gửi". |

## Nghĩa vụ phía open-ketoan

Luật này **không** thêm gì vào Kernel. Nó chỉ cần open-ketoan giữ đúng những gì đã hứa:

1. **Feed đúng theo tenant** (R-TEN): khoá của blog nào chỉ thấy catalog của tenant đó.
2. **Phân trang feed không lặp, không sót:** sửa con trỏ `feed/products` / `feed/prices` (độ chính xác thời gian, nhiều dòng cùng `now()`).
3. **Có tenant cho từng shop:** ✅ đã có (ADR-0037, migration 0180 — OKT-SET-1): mỗi shop một tenant, nối bằng khoá API riêng (bizcity, một cửa hàng) hoặc khoá cài đặt + mã nối (nhiều cửa hàng); sổ mới tạo theo đường thiết lập đơn vị, bridge không tự tạo tenant. Còn lại: tách số liệu cũ của các shop đang là chi nhánh (`branches.external_ref = 'blog:N'`) của một tenant sang tenant riêng — việc riêng.
4. **Ghi danh mục từ shop có giới hạn:** nên có scope hẹp chỉ cho tạo mã mới, không sửa mã có sẵn (R-OKT-CONN-8).
5. **Nhận đơn bán dạng chứng từ gửi sau** (R-OKT-CONN-11): đơn đến muộn, gửi lại nhiều lần, hoặc thiếu tồn tại kế toán vẫn được nhận; thiếu tồn thì ghi cờ để giải trình, không từ chối.

Mỗi việc trên là một đợt riêng theo [R-FLOW](RULE-FLOW.md): giữ chỗ trong [CLAIMS](../phases/CLAIMS.md), chốt bằng tài liệu, rồi mới code.

## Hiện trạng lệch luật (2026-11-21, đọc mã `open-ketoan-bridge` 0.5.0 và `open-pos` `e2e2778`)

| Chỗ | Hiện trạng | Lệch khoản |
|---|---|---|
| `TGS_Acc_Config` | ~~URL / khoá lấy từ hằng wp-config hoặc `get_site_option` (một bộ cho cả mạng)~~ — **đã sửa** (bridge 0.6.0): khoá theo blog, mô hình khai rõ (`TGS_Acc_Profile`), khoá cài đặt + `X-OKT-Blog` cho nhiều cửa hàng; ma trận ba mô hình 0 sai (OKT-SET-4, 23/11) | R-OKT-CONN-6 |
| `TGS_Acc_Catalog_Sync` | Kéo vào bảng global `wp_global_product_name`, `wp_global_htsoft_*`; công tắc `catalog_from_erp`; `SYNC_TAX = false` | R-OKT-CONN-1, -7, -10 |
| `TGS_Acc_Branch_Sync` | Tạo **chi nhánh** cho từng site trong một tenant | R-OKT-CONN-6 |
| POS React (`TGS_POS_React_Shell`) | Địa chỉ API, tenant, khoá ký vé là chung cả mạng. Đăng nhập và danh mục cần kế toán khi mở ca (máy mới chưa có bản lưu thì không bán được) | R-OKT-CONN-6; -11 (ca mở ca khi kế toán tắt: chuyển POS cũ) |
| Bridge: tạm dừng gửi | Công tắc `TGS_ACC_REALTIME` / `realtime` là cả mạng, chưa có theo shop | R-OKT-CONN-12 |
| `catalog/feed/*` (open-ketoan) | Con trỏ mili-giây, có thể lặp khi ≥ `limit` dòng cùng thời điểm | Nghĩa vụ 2 |
