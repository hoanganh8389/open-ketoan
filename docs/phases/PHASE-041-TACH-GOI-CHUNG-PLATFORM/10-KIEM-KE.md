# PHASE-041 · 10 — Kiểm kê: cái gì sang gói chung, cái gì ở lại
<!-- [2026-11-24 03:18 PM Johnny Chu - Chu Hoàng Anh] PHASE-041 — S041-1: kiểm kê sơ bộ trên main 6ad77b6 (đo bằng grep + đọc tệp lớn); S041-2 là bước Nhóm Lõi đọc từng tệp "tách" / "cần đọc" và chốt nhãn -->

> **Trạng thái:** Kế hoạch — bảng nhãn **sơ bộ**, đo trên `main` `6ad77b6` (2026-11-24). Cột "Chạm" = số dòng có chữ `ketoan|accounting|ledger|posting|partner|warehouse|kho|hạch toán|sổ cái|bút toán` (không phân biệt hoa thường); "Import" = số dòng `import … from '@ketoan/contracts'`. Đích ghi trong bảng (gói, tệp mới) là **đề xuất**, chưa tách.

## 1. Ba nhãn

| Nhãn | Nghĩa | Làm gì ở P2 |
|---|---|---|
| **nền** | không biết kế toán | dời nguyên sang gói chung |
| **tách** | là nền nhưng đang ghép kế toán bằng **tên** hoặc **import** | dời sang gói chung **sau khi** thay chỗ ghép bằng cổng đăng ký / cấu hình (§2.2) |
| **kế toán** | nghiệp vụ kế toán thật | ở lại open-ketoan (đề xuất: kernel hoặc gói `ketoan-platform-ext`, chưa tách) |
| *cần đọc* | grep chưa đủ để chắc | S041-2: Nhóm Lõi đọc tệp, chốt một trong ba nhãn trên |

## 2. `packages/platform/src` (~63 tệp)

### 2.1 Bảng nhãn

| Tệp | Dòng | Chạm | Import | Nhãn | Ghi |
|---|---|---|---|---|---|
| `config/env.ts` | 188 | 9 | 0 | tách | tên DB / vai mặc định `ketoan`, `ketoan_app` ⇒ cấu hình của app |
| `core/actions.ts` | 694 | 70 | 1 | tách | cổng `ctx.ledger` (`LedgerSubmitter`, `LedgerReader`, `LedgerCancelGate`, `registerLedgerSubmitter`) ⇒ cổng chung `ctx.ports.<tên>`; open-ketoan đăng ký `ledger` (giữ `ctx.ledger` làm bí danh một bản) |
| `core/apps.ts` | 193 | 11 | 0 | tách | khoá ứng dụng ngoài; phạm vi ghi `APP_WRITE_ROUTES` có route kế toán ⇒ app đăng ký |
| `core/audit.ts` | 131 | 3 | 0 | nền | |
| `core/auth.ts` | 477 | 52 | 1 | tách | `PERMISSIONS` có quyền kế toán (`ledger:read`, `periods:lock`, `payments:*`…) ⇒ lõi giữ quyền nền (`users:write`, `settings:write`…), app đăng ký phần còn lại; `Role` từ contracts |
| `core/authz/{engine,index,types,catalog}.ts` | 505 | 28 | 0 | nền | `catalog.ts` cần đọc (9 chạm) |
| `core/authz/{legacy,scope,shadow,store}.ts` | 409 | 29 | 4 | tách | `Role` từ contracts; `scope.ts` 19 chạm (phạm vi chi nhánh / kho) — **đang thuộc dòng NT-HT-003** |
| `core/catalog-warn.ts` | 37 | 3 | 1 | kế toán | gợi ý danh mục (`CATALOG_HINTS`) |
| `core/date-rules.ts` | 62 | 5 | 0 | *cần đọc* | luật ngày (giờ VN, khoá kỳ?) |
| `core/documents.ts` | 239 | 4 | 1 | tách | chứng từ chung (`DOC_LINK_ROLES`, `DocRef`…) là nền; `LedgerQuery` là kế toán ⇒ tách kiểu |
| `core/errors.ts` | 120 | 15 | 1 | tách | `POSTING_FAILED`, `LedgerTriggerError`, `LEDGER_APPEND_ONLY` ⇒ `registerErrorReasons` của app |
| `core/events.ts` | 465 | 10 | 0 | nền | outbox, subscriber, đồng hồ (chạm = tên sự kiện ví dụ) — *cần đọc* nhẹ |
| `core/evidence-export.ts` | 432 | 9 | 1 | tách | niêm phong bằng chứng; import `Remedy` / mã lỗi |
| `core/hooks.ts` · `ports.ts` · `version.ts` · `request-context.ts` · `run-log.ts` · `notify.ts` · `module-registry.ts` | 545 | 10 | 0 | nền | |
| `core/http.ts` | 175 | 8 | 1 | tách | ánh xạ lỗi trigger sổ ⇒ app đăng ký |
| `core/libraries/*` (8 tệp) | 1 068 | 12 | 1 | nền | `libraries/settings.ts` import `LIBRARY_BINDINGS` ⇒ tách nhẹ |
| `core/logger.ts` · `metrics.ts` · `tracing.ts` | 927 | 12 | 0 | nền | |
| `core/nhat-ky-kiem.ts` | 48 | 3 | 0 | *cần đọc* | |
| `core/policies.ts` | 248 | 2 | 0 | nền | sổ đăng ký chính sách (`bizcity_policy@1`) |
| `core/quy-tac.ts` | 31 | 1 | 1 | *cần đọc* | import `SCREENS`, `STOP_THE_LINE_STEP` |
| `core/security/{password,session-state,tokens,tool-password}.ts` | 190 | 7 | 0 | nền | |
| `core/security/role-assignments.ts` | 78 | 2 | 1 | tách | `Role` — **đang thuộc dòng NT-HT-003** |
| `core/settings.ts` | 404 | 46 | 0 | tách | phạm vi `accounting_unit` ⇒ phạm vi chung `unit` (bí danh một bản); khoá `LEDGER` ⇒ registry của app |
| `core/workflow.ts` | 232 | 6 | 0 | nền | *cần đọc* nhẹ |
| `db/client.ts` · `paths.ts` · `site.ts` | 285 | 5 | 0 | nền | |
| `db/migrate.ts` | 190 | 7 | 0 | tách | chạy một dãy migration ⇒ nhiều **nguồn** (`platform` / `app` / `mod_<key>`) — P3 |
| `db/module-db.ts` | 166 | 5 | 0 | tách | vai `ketoan_app` ⇒ cấu hình |
| `db/site-{registry,lifecycle,migrate,provisioner,backup}.ts` | 1 258 | 24 | 0 | nền | **máy nhiều site PHASE-039**; tiền tố `kt_` ⇒ cấu hình (`SITE_DB_PREFIX`, đề xuất) |
| `db/types.ts` | 2 138 | 126 | 0 | tách | kiểu Kysely của **toàn bộ** DB (sinh máy) ⇒ gói chung giữ `PlatformDatabase` (bảng nền); app mở rộng bằng giao (`interface AppDatabase extends PlatformDatabase`) |
| `documents/signature.routes.ts` | 129 | 4 | 0 | *cần đọc* | ký chứng từ — có thể là nền (chứng từ chung) |
| `masterdata/partner.repository.ts` | 229 | 27 | 1 | kế toán | |
| `masterdata/catalog-ensure.ts` | 62 | 6 | 0 | kế toán | |
| `masterdata/default-warehouse.ts` | 40 | 20 | 0 | kế toán | |
| `system/diagnostics.ts` | 430 | 25 | 2 | tách | khung L0–L3 là nền; các phép kiểm sổ ⇒ `registerDiagnostics` của app |

**Tổng sơ bộ:** nền ≈ 30 tệp · tách ≈ 20 · kế toán 4 · cần đọc 5.

### 2.2 Cổng đăng ký cần thêm ở P2 (đề xuất)

| Cổng | Thay chỗ ghép | App kế toán đăng ký |
|---|---|---|
| `registerPort(name, impl)` → `ctx.ports.<name>` | `ctx.ledger` cứng trong `actions.ts` | `ledger` (submit / query / cancel) |
| `registerPermissions(list)` | `PERMISSIONS` cứng trong `auth.ts` | quyền kế toán |
| `registerErrorReasons(map)` + `registerErrorMapper(fn)` | `POSTING_FAILED`, lỗi trigger sổ trong `errors.ts` / `http.ts` | mã + ánh xạ lỗi sổ |
| `registerSettingScopes(list)` | `accounting_unit` cứng trong `settings.ts` | phạm vi `accounting_unit` |
| `registerDiagnostics(checks)` | phép kiểm sổ trong `system/diagnostics.ts` | DG-* của sổ |
| `PlatformConfig` (`dbPrefix`, `appRole`, `sitePrefix`) | `ketoan`, `ketoan_app`, `kt_` cứng | giá trị cũ ⇒ hành vi không đổi |

## 3. `packages/contracts/src` (`@ketoan/contracts`, 30 tệp)

| Nhãn | Tệp | Đích (đề xuất) |
|---|---|---|
| **nền** | `api.ts`, `doc-refs.ts`, `findings.ts`, `library-findings.ts`, `module.ts`, `remedy.ts`, `money.ts` | `@bizcity/contracts` |
| **tách** | `errors.ts` (catalog chung + mã kế toán, 56 chạm), `enums.ts` (`Role`, `SCREENS`), `documents.ts` (chứng từ chung + loại chứng từ kế toán, 57 chạm), `library-bindings.ts` | phần chung sang `@bizcity/contracts`; phần kế toán ở lại |
| **kế toán** | `catalog-hint.ts`, `costing-formula.ts`, `dvt.ts`, `entity-codes.ts`, `intake-findings.ts`, `invoices.ts`, `item-master.ts`, `ledger-query.ts`, `legal-basis.ts`, `lineage.ts`, `vouchers.ts`, `print-profile.ts`, `print-templates.ts` | ở lại `@ketoan/contracts` |
| *cần đọc* | `ban-dieu-tra.ts`, `connections.ts`, `ket-noi.ts`, `loi-trinh-duyet.ts`, `ma-tra-cuu.ts` | S041-2 |

`@ketoan/contracts` sau P1 **re-export** phần nền từ `@bizcity/contracts` ⇒ mọi `import … from '@ketoan/contracts'` hiện có không vỡ.

## 4. Bảng nền trong `db/migrations` (178 tệp)

| Nhóm | Bảng (migration tạo) | Nhãn |
|---|---|---|
| Đơn vị, người dùng, khoá | `tenants`, `users`, `api_keys`, `audit_logs` (0001) | nền |
| Tổ chức | `branches` (0001), `org_units` (0062), `org_link_versions` (0121) | *cần đọc* — chi nhánh / sơ đồ tổ chức dùng chung với app khác hay thuộc sổ? (Q041-1) |
| Đơn vị kế toán | `accounting_units` (0001) | kế toán (pháp nhân thuộc sổ, ADR-0039) |
| Hành động, MCP | `action_requests` (0035), `mcp_confirm_tokens` (0037) | nền |
| Sự kiện | `event_outbox`, `event_deliveries`, `event_consumptions` (0039) | nền |
| Chẩn đoán | `diagnostic_runs` (0034) | nền |
| Chứng từ chung | `document_signatures` (0005), `document_sequences` (0006), `document_versions`, `document_links`, `document_attachments` (0045), `business_documents` (0158) | nền (`bizcity_document@1`) |
| Phân quyền | `user_role_assignments` (0073), `tenant_roles`, `tenant_role_rules` (0075) | nền |
| Cài đặt | `setting_values` (0074) | nền (`options` của canon) |
| Ứng dụng, module | `app_installations` (0051), `module_registry` (0052) | nền |
| Thông báo | `notifications`, `notification_reads` (0060) | nền |
| Thư viện, chính sách | `library_usage_daily` (0083), `library_settings`, `library_change_requests` (0088), `policy_registry` (0079), `policy_review_acks` (0084) | nền |
| Còn lại (~125 bảng) | sổ, danh mục, kho, thuế, tài sản, mua bán… | kế toán |

**Lưu ý:** `entity_attributes` (0087) và `entity_codes` (0085) **không** phải bảng meta mềm — là thuộc tính / mã **có hiệu lực theo ngày** của đối tượng / chi nhánh / kho (trục danh mục, R-MD). Lớp dữ liệu mềm của canon dùng tên khác (`entity_meta`) để không lẫn.

**P3 (đề xuất):** gói chung mang `migrations/platform/NNNN_*.sql` tạo đúng các bảng "nền" trên (đã gộp các lần sửa về sau); bảng theo dõi migration thêm cột `source`; DB open-ketoan đang chạy: một lệnh baseline ghi "đã áp" cho nguồn `platform` ở phiên bản tương ứng, **không** chạy SQL; kiểm bằng so lược đồ (`pg_dump --schema-only`) trước / sau trên bản sao.

## 5. Gói còn lại

| Gói | Phụ thuộc hiện tại | Nhãn |
|---|---|---|
| `@bizcity/module-sdk` 1.0.0 | `@bizcity/platform`, `@ketoan/contracts`, `kysely`, `zod` | tách — đổi sang `@bizcity/contracts`; **đang thuộc dòng NT-HT-003** |
| `@bizcity/ui-kit` 0.1.0 | peer `react`, `@tanstack/react-query` | nền |
| `@bizcity/cli` 0.1.0 | `pg` | *cần đọc* — lệnh site là nền; lệnh kế toán ở lại |
| `tests/conformance/` | — | tách — khung chạy + SC chung sang `@bizcity/conformance`; SC kế toán ở lại |

## 6. Câu hỏi

| Mã | Câu hỏi | Đề xuất |
|---|---|---|
| Q041-1 | `branches`, `org_units` là nền hay kế toán? | nền (open-cake cũng có chi nhánh / đội); trường kế toán của chi nhánh (`accounting_unit_id`…) ở lại qua bảng phụ |
| Q041-2 | `db/types.ts` sinh máy: gói chung sinh `PlatformDatabase` từ migration nền, app sinh phần của mình | đồng ý ⇒ hai lệnh sinh kiểu |
| Q041-3 | Thời điểm P2 so với NT-HT-003 | chờ dòng NT-HT-003 trả; trong lúc chờ làm P1 (không chạm tệp của dòng đó) |
