# PHASE-039 · 40 — Checklist
<!-- [2026-11-21 07:29 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — việc con S039-*, ca T039-*, nhật ký -->

Ký hiệu: ☐ chưa · 🟡 đang · ✅ xong · ⛔ chờ người ngoài nhóm.

## Việc

| ID | Việc | Đợt | Ưu tiên | Code? | Trạng thái |
|---|---|---|---|---|---|
| S039-1 | README, [00](00-MASTER-PLAN.md), [30 hợp đồng nháp](30-HOP-DONG-PROVISIONING.md), checklist | W0 | P0 | không | ✅ 2026-11-21 |
| S039-2 | Chủ dự án duyệt D039-1..19, trả Q039-1..5; ADR-0036 "một bản mã, mỗi site một database"; luật R-SITE <!-- [2026-11-21 08:12 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — S039-2 xong --> | W0 | P0 | không | ✅ 2026-11-21 |
| S039-3 | B1 — kiểm kê: chỗ gọi thẳng pool (`apps/api/src/db/setup.ts`), bộ đệm trong bộ nhớ có khoá theo đơn vị, script tự mở pool, số đo có nhãn đơn vị; ghi bảng kết quả vào 00 <!-- [2026-11-21 10:34 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — S039-3 xong, kết quả ở 00 §1b --> | W1 | P0 | không | ✅ 2026-11-21 ([00 §1b](00-MASTER-PLAN.md)) |
| S039-4 | B1 — `siteId` trong ngữ cảnh yêu cầu; `poolOf(site)`; `db` uỷ quyền theo site; chế độ `single` với site `default`; hành vi không đổi <!-- [2026-11-21 11:33 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — S039-4 xong (PR #527) --> | W1 | P0 | có | ✅ 2026-11-21 (#527) |
| S039-5 | B2a — database điều khiển (`CONTROL_DATABASE_URL`, `db/control-migrations/`), bảng `sites`, `site_domains`; Site Resolver theo `Host`; `SITE_MODE=multi`; `SITE_NOT_FOUND`, `SITE_CONTEXT_MISSING` <!-- [2026-11-22 12:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — S039-5 xong (B2a) --> | W2 | P0 | có | ✅ 2026-11-22 (B2a) |
| S039-6 | B2b — claim `sid` trong vé đăng nhập và vé ứng dụng; vé lệch site bị từ chối; vé cũ không `sid` chỉ nhận ở chế độ single <!-- [2026-11-22 12:47 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — S039-6 xong (B2b) --> | W2 | P0 | có | ✅ 2026-11-22 (B2b) |
| S039-7 | B2 — tiến trình nền `forEachSite` (dispatcher sự kiện, đồng hồ); pool theo site có trần và tự đóng khi rảnh | W2 | P0 | có | ☐ |
| S039-8 | B2 — bộ đệm trong bộ nhớ thêm khoá site (theo kết quả S039-3) + phép kiểm tĩnh chặn bộ đệm theo đơn vị thiếu site <!-- [2026-11-22 10:16 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — S039-8 phần B2d --> | W2 | P0 | có | 🟡 2026-11-22 B2d: 6 / 8 bộ đệm có mã site; còn `role-assignments.ts` (chờ NT-HT-003), `usage.ts` (sang B7), phép kiểm tĩnh |
| S039-9 | B3 — `runMigrations(connectionString)` cho lõi và module; `schema_version` trong registry; cổng lược đồ `SITE_UPGRADING` / `SITE_MIGRATION_FAILED` | W3 | P0 | có | ☐ |
| S039-10 | B3 — lệnh `site migrate <slug>` / `--all`: sao lưu trước, site lỗi dừng riêng, bảng tổng kết, chạy lại được | W3 | P0 | có | ☐ |
| S039-11 | B4 — Site Provisioner: `kt_template`, vai trò riêng `kt_<slug>_owner` / `_app` (D039-19), `CREATE DATABASE … TEMPLATE`, đơn vị đầu + tài khoản quản trị, `site_jobs`, dọn khi hỏng <!-- [2026-11-22 10:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — S039-11 phần B4a --> | W4 | P0 | có | 🟡 2026-11-22 B4a: database từ mẫu, vai trò `_app` riêng, mật khẩu mã hoá, dọn khi hỏng; còn `_owner` (cùng B3), đơn vị đầu + chủ site (B4b), `site_jobs` (B5) |
| S039-12 | B4 — CLI `bizcity site create / list / suspend / resume / drop / adopt` (`adopt`: đưa bản cài một công ty vào cụm, Q039-4) | W4 | P1 | có | ☐ |
| S039-13 | B5 — Provisioning API `/_sites/v1` theo [30](30-HOP-DONG-PROVISIONING.md): `SITE_ADMIN_HOST`, khoá `prov_…`, `Idempotency-Key`, mã lỗi; chuyển hợp đồng sang `docs/contracts/` | W5 | P0 | có | ☐ |
| S039-14 | B5 — khoá bản quyền `biz-…` (D039-17): gắn khoá cho site, hỏi trạng thái ở `bizcity-llm-router` (bộ đệm 1 giờ), dải đỏ khi hết hạn / thiếu khoá, **không chặn**; phía plugin thêm cửa trả trạng thái khoá cho máy chủ gọi máy chủ <!-- [2026-11-21 07:46 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — S039-14 viết lại theo D039-17 --> | W5 | P1 | có | ☐ |
| S039-15 | B6 — Backup Manager: `site backup`, tự kiểm, `site_backups`, lịch đêm, chính sách giữ | W6 | P0 | có | ☐ |
| S039-16 | B6 — `site restore` vào database tạm → kiểm → đổi tên; sổ tay `docs/ops/` (kể cả lấy một site từ PITR) | W6 | P0 | có | ☐ |
| S039-17 | B6 — khoá site (chỉ đọc, Q039-1) và xoá mềm (D039-15) | W6 | P1 | có | ☐ |
| S039-18 | B7 — `cap-nhat.sh` nhiều site theo [00 §6](00-MASTER-PLAN.md); `docker-compose.yml` không ghi cứng tên database ở chế độ `multi` | W7 | P0 | có | ☐ |
| S039-19 | B7 — nhật ký và số đo có `site` (trần số nhãn); màn chẩn đoán báo site đang phục vụ | W7 | P1 | có | ☐ |
| S039-20 | B7 — nghiệm thu T039-1..14 trên máy sạch; phối hợp Site Manager (repo `bizcity-open-setup`) tạo site thật | W7 | P0 | có | ☐ |

## Ca kiểm

| ID | Ca | Bước |
|---|---|---|
| T039-1 | Chế độ `single`: toàn bộ bộ test hiện có xanh, không sửa một ca nào | B1 |
| T039-2 | Hai site, cùng một `tenant_id` (cố ý trùng): chứng từ ghi ở site A không đọc được ở site B qua mọi cửa (REST, MCP, báo cáo) | B2 |
| T039-3 | Vé đăng nhập của site A gửi tới tên miền site B → 401; không lộ site A có tồn tại | B2 |
| T039-4 | Tên miền lạ → 404 `SITE_NOT_FOUND`; mã chạy ngoài ngữ cảnh site ở chế độ `multi` → `SITE_CONTEXT_MISSING`, không truy vấn nào chạy | B2 |
| T039-5 | Sự kiện outbox của site A chỉ được dispatcher xử lý trong ngữ cảnh site A; site B hỏng kết nối thì site A vẫn chạy | B2 |
| T039-6 | 60 site, mỗi site một yêu cầu: tổng kết nối PostgreSQL không vượt trần; pool rảnh tự đóng | B2 |
| T039-7 | `site migrate --all` với 3 site, migration cố ý lỗi ở site thứ 2: site 1 và 3 `active`, site 2 `migration_failed` trả 503, chạy lại sau khi sửa thì qua | B3 |
| T039-8 | Ứng dụng bản cũ gặp site đã nâng lược đồ → 503 `SITE_UPGRADING`, không ghi gì | B3 |
| T039-9 | Tạo site: xong trong ≤ 10 giây; đăng nhập được bằng email của chủ; giết tiến trình giữa bước 3 → không còn database dở, không còn dòng registry `provisioning` | B4 |
| T039-10 | Gửi `POST /_sites/v1/sites` hai lần cùng `Idempotency-Key` → một site, cùng `jobId`; cùng khoá khác thân lệnh → 422; gọi từ tên miền site hoặc thiếu khoá → 404 / 401 | B5 |
| T039-11 | Sao lưu site A, ghi thêm chứng từ, khôi phục site A về bản sao lưu: site A về đúng trạng thái cũ, site B không đổi một dòng | B6 |
| T039-12 | Xoá site chưa khoá hoặc chưa có bản sao lưu mới → bị từ chối; xoá hợp lệ → database đổi tên, còn lấy lại được trong 30 ngày | B6 |
| T039-13 | Site có khoá `biz-…` hết hạn hoặc chưa gắn khoá: đăng nhập, ghi chứng từ, in báo cáo, gọi API **đều chạy**; mọi màn có dải đỏ. `bizcity-llm-router` tắt: site đang `ok` không hiện đỏ, không bị chặn | B5 |
| T039-15 | Vai trò `kt_a_app` của site A thử `CONNECT` vào database `kt_b` → bị từ chối; `db_secrets_enc` trong database điều khiển không đọc được khi thiếu `SITE_SECRET_KEY` | B4 |
| T039-14 | Một site có hai tên miền thuộc hai tên miền gốc khác nhau: cả hai vào cùng một sổ; thêm tên miền gốc mới không sửa mã, không khởi động lại | B2 |

## Nhật ký

- 2026-11-21 — W0 đề xuất <!-- [2026-11-21 07:29 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — nhật ký W0 -->: chủ dự án nêu đề bài (Frappe là Site Manager, Open Kế Toán dùng chung, mỗi site một database; năm thành phần; quy trình cập nhật một bản mã cho mọi site). Đọc mã hiện trạng (F1..F9); đề xuất D039-1..16, hợp đồng `bizcity_site_provisioning@1` bản nháp, B1..B7; chờ duyệt. Phía gọi: repo `bizcity-open-setup`, ADR-0001 và PHASE-001 bên đó.
- 2026-11-21 — chốt API key <!-- [2026-11-21 07:36 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — nhật ký D039-17 -->: chủ dự án chốt `bizcity-llm-router` quản lý API key. Thêm D039-17, Q039-5, T039-13; S039-14 đổi từ "cấp khoá qua Provisioning API" sang "kiểm khoá `biz-…` qua `bizcity-llm-router`"; hợp đồng nháp bỏ hai lệnh `api-keys`, thêm §8.
- 2026-11-21 — chốt khoá mềm, tên miền động <!-- [2026-11-21 07:46 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — nhật ký D039-17 viết lại, D039-18 -->: chủ dự án chốt (1) khoá `biz-…` chỉ để cảnh báo hết hạn: site vẫn dùng, có dải đỏ (D039-17 viết lại, bỏ ý "kiểm khoá để cho vào"; Q039-5 đóng; T039-13 viết lại); (2) tên miền gốc là cấu hình động: `btnet.vn`, `bizcity.vn` hoặc `*.<miền>` bất kỳ (D039-18, T039-14).
- 2026-11-21 — W0 chốt <!-- [2026-11-21 08:12 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — nhật ký chốt W0 -->: chủ dự án chọn vai trò PostgreSQL riêng từng site (Q039-2 → D039-19), "chung code open-ketoan, khác db", luật nâng cấp một bản mã cho mọi site; "các phần khác bám theo rule này là ok" — D039-1..18 chấp nhận, Q039-1/3/4 theo đề nghị. ADR-0036, luật R-SITE (R-SITE-1..13); mô hình ghi vào README gốc, CANON §0.13, CONG-BO §4.2, trien-khai §6, R-REL-10. Thêm T039-15. Bước kế: B1.
- 2026-11-21 — B1 <!-- [2026-11-21 10:34 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — nhật ký B1 -->: chủ dự án "merge và code". Giữ chỗ #526. Kiểm kê S039-3 ở 00 §1b (4 chỗ dùng thẳng `pool`, 8 bộ đệm cấp tệp phải thêm mã site, việc nền của `events.ts`). Mã S039-4: `packages/platform/src/db/site.ts` + `db/client.ts` + `RequestContext.siteId`; ca `site-context.test.ts` 6/6; typecheck `@bizcity/platform`, `@ketoan/api` sạch.
- 2026-11-21 — B1 xong <!-- [2026-11-21 11:33 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — nhật ký nghiệm thu B1 -->: bộ test API đầy đủ trên CSDL riêng: 2632 đạt, 19 đỏ / 7 tệp, 12 bỏ qua. 6 tệp đỏ y hệt trên `main` (findings, gates, mat-khau-mac-dinh, module-manifests, phan-quyen-dang-ky, sinh-ma-hang — nợ có sẵn). `nt-bh-004-pos-don-ban` đỏ 13 ca (`permission denied for view branch_prices`) chỉ trong lượt chạy đầy đủ; chạy riêng qua 13/13 trên commit B1 trước gộp, trên `main` và trên nhánh đã gộp `main` → phụ thuộc thứ tự chạy / trạng thái CSDL do tệp chạy trước để lại, không do B1 (B1 không đổi vai trò hay quyền của kết nối). Chưa chạy lượt đầy đủ trên `main` để đối chiếu thứ tự. Phát hiện SC-LAYER-1 cho `db/site.ts` chờ `layers.mjs` nhả giữ chỗ. Nhả dòng giữ chỗ B1.
- 2026-11-22 — B2a <!-- [2026-11-22 12:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — nhật ký B2a -->: giữ chỗ #530. Mã: `SITE_MODE` / `CONTROL_DATABASE_URL` (env.ts), `db/control-migrations/0001_site_registry.sql`, `packages/platform/src/db/site-registry.ts` (tên miền → site, bộ đệm 30 giây, mở pool của site khi cần), `site.ts` chế độ multi đóng khi thiếu, hook ngữ cảnh yêu cầu nhận site theo tên miền (không sửa `app.ts`); sổ tay `docs/ops/NHIEU-SITE.md`. Ca `site-registry.test.ts` 8/8 (database điều khiển + hai database site thật), `site-context.test.ts` 6/6; 11 tệp hồi quy đi qua hook / đăng nhập / sổ cái: 137 đạt, 1 bỏ qua. SC-LAYER-1 thêm `site-registry.ts` (chờ `layers.mjs` của NT-HT-003). Nhả giữ chỗ B2a.
- 2026-11-22 — B2b <!-- [2026-11-22 12:47 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — nhật ký B2b -->: giữ chỗ #532. `ticketSiteAccepted` ở `db/site.ts`; `signSession` / `signAppTicket` ghi `sid` = site cấp vé; `verifySession` / `verifyAppTicket` từ chối vé lệch site, vé không `sid` ở chế độ multi, vé ngoài ngữ cảnh site ở chế độ multi. Không sửa `core/auth.ts` (NT-HT-003): chỗ gọi nhận `null` như vé hỏng → 401. Khoá API của site nằm trong database của site nên tự gắn site. Ca `site-ticket.test.ts` 8/8; 12 tệp (site-*, access, apps, tenant-isolation, authz-*, phien-dang-nhap): 124 đạt, 1 bỏ qua. Nhả giữ chỗ B2b.
- 2026-11-22 — B2d <!-- [2026-11-22 10:16 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — nhật ký B2d -->: giữ chỗ #534 (sửa giờ dấu giữ chỗ: lần đầu ghi 01:07 AM không lấy giờ máy, giờ thật 10:15 AM). `siteScopedKey()` ở `db/site.ts`; 6 bộ đệm khoá theo site; hai dòng bảng lớp `db/site.ts`, `db/site-registry.ts` ở `layers.mjs` (SC-LAYER-1 hết hai phát hiện của PHASE-039). Ca `site-cache.test.ts` 4/4. Nhả giữ chỗ B2d; S039-8 còn mở.
- 2026-11-22 — B4a <!-- [2026-11-22 10:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — nhật ký B4a -->: giữ chỗ #537. `site-provisioner.ts` (`createSite`, `newSiteId` ULID, `siteDbNames`); `site-registry.ts` mã hoá / giải mã mật khẩu, kết nối bằng vai trò của site; env `SITE_TEMPLATE_DB`, `SITE_SECRET_KEY`, `PROVISION_DATABASE_URL`, `SITE_APP_PARENT_ROLE`; migration điều khiển 0002. Ca `site-provisioner.test.ts` 8/8 (T039-15: vai trò site X không CONNECT được database site Y). Lúc viết ca có một ca sai (chữ hoa được chuẩn hoá nên `Abc` tạo thật site `kt_abc`): đã sửa ca và dọn database, vai trò thừa. Nhả giữ chỗ B4a.
