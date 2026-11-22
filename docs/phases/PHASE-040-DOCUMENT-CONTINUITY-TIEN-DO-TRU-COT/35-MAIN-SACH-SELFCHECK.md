# PHASE-040 · 35 — B10: `main` sạch selfcheck (điều kiện để có PR `VERIFIED`)
<!-- [2026-11-22 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-040 — B10: kế hoạch đưa selfcheck trên main về ĐẠT; chủ dự án chọn "sửa nợ, không nới" 2026-11-22 -->

## Vì sao

Bộ chấm (B2) chỉ cho `VERIFIED` khi khối bằng chứng ghi selfcheck **ĐẠT**. Selfcheck trên `main` hiện **KHÔNG ĐẠT**, nên không PR nào `VERIFIED` được, dù tốt đến đâu. Chủ dự án chọn ngày 2026-11-22: **sửa nợ cho `main` sạch, không nới chuẩn** ("không phát hiện mới so với main" **không** được tính là đạt).

Luật vẫn như cũ: phát hiện **mới** (chưa có trong `tests/conformance/baseline.json`) của check `block` / `ratchet` làm đỏ. Đưa nợ vào baseline chỉ khi đã có việc khắc phục có người nhận — mỗi dòng ghi `why` + `ref` (mã việc `S040-*`), chủ dự án duyệt (baseline.json `note`). Không đưa nợ tầng 0 vào baseline.

## Số đo (main `b29049a4`, 2026-11-22, có gói cài, không CSDL)

27 check đỏ, **709 phát hiện mới** ở check `block` / `ratchet` (chưa kể 171 ở check `info`, không làm đỏ). Phân theo việc phải làm:

| Đợt | Check (số mới) | Bản chất | Cách xử lý | Người |
|---|---|---|---|---|
| **B10a** tài liệu + công cụ kiểm | SC-FIND-1 (93) | **lỗi công cụ kiểm**: mã `ACC-HINT-*`, `ITEM-BLOCK-*`… đã có ở `packages/contracts/src/quy-tac/*.ts` (tách khỏi `catalog-hint.ts` ở b290a47b) nhưng check chỉ đọc `catalog-hint.ts` | check đọc cả `quy-tac/*.ts`; mã nào thật sự thiếu thì thêm vào thư viện | Lõi |
| | SC-FLOW-1 (18) | 15 **chồng giả** (`apps/api/test/mua-hang-*.test.ts` bị hiểu thành cả `apps/api/test/`) + 3 chồng thật ở dòng giữ chỗ cũ | `flow.lib` so khớp mẫu tên tệp đúng; dòng giữ chỗ cũ: §3 | Lõi; chủ dòng |
| | SC-FLOW-1 — **bảng bị cắt** (đo thêm 2026-11-22) | sáu dòng chú thích `<!-- … nhả chỗ … -->` của PHASE-038 nằm **giữa** bảng `CLAIMS.md` (sau dòng OKT-SET-1): bộ đọc dừng ở đó, nên dòng PHASE-038 · B5 và mọi dòng thêm sau (PHASE-040 B1, B2, B3, B10) **không được kiểm** — `nhan-viec.mjs` không thấy giữ chỗ, SC-FLOW-1 không xét chồng; GitHub cũng hiện các dòng đó ngoài bảng | dời chú thích lên trên bảng; bộ đọc bỏ qua dòng chỉ có chú thích thay vì dừng; sửa xong sẽ lộ thêm chồng (vd `CHANGELOG.md`, `docs/00-CANON.md` dùng chung) — xử lý trong cùng đợt | Lõi |
| | SC-DOC-1, -2, -4, -5 (14) | đường dẫn / route trong tài liệu lỗi thời | sửa về chỗ thật, hoặc ghi "(đề xuất, chưa có trong mã)" | Lõi |
| | SC-FIX-1 (5) | `remedy.ts` trỏ màn không có trong menu | sửa đường màn theo menu hiện tại | Lõi |
| **B10b** rủi ro tầng 0 | SC-SEC-5 (3) | mật khẩu tính năng có **giá trị mặc định viết trong mã** (`CATALOG_WIPE_PASSWORD`…) | bỏ mặc định: thiếu biến → tắt tính năng kèm câu hướng dẫn; khai `.env.example` (gộp SC-CON-7, 3) | Lõi, báo @Thuy2k |
| | SC-API-3 (1) | `POST /api/v1/validation-log/form` không khai quyền | khai quyền / `config.public` có lý do | Lõi |
| | SC-KERNEL-7 (1) | `co-cau.ts` đọc thẳng `ledger_entries` | đọc qua `bizcity_read.*` / `ledgerQuery` | Lõi |
| | SC-SEC-2 (2) | `sql.raw(BACKUP_COLS)` — hằng trong mã | xác nhận hằng, khai ngoại lệ đúng khuôn hoặc bỏ `sql.raw` | Lõi |
| | SC-AUTH-03 (1) | danh sách route giữ còn route đã bỏ | bỏ dòng thừa | Lõi |
| **B10c** ranh giới | SC-DOC-7 (3) | ghi thẳng `document_versions` ngoài `core/documents.ts` — **trái R-DOC-CONT-3** | dùng `ctx.documents.saveVersion` | Lõi; @Thuy2k (mua-hang) |
| | SC-MOD-2 (2) | mua-hàng ghi thẳng bảng lõi `dimensions` (hợp đồng, 0165) | qua service danh mục | @Thuy2k |
| | SC-ACT-1 (10), SC-ACT-2 (1), SC-API-2 (2), SC-EVD-1 (1) | route ghi thô, khai thiếu `ledger`, `z.coerce.boolean`, ghi nhật ký ra tệp | `defineAction` / `// @bizcity-route: <lý do>`; `queryBool`; nhật ký qua R-LOG | Lõi + chủ tệp |
| | SC-LAYER-1 (7), SC-LAYER-2 (2) | thiếu nhãn lớp, import ngược lớp | `scripts/gan-nhan-lop.mjs --write`; dời import | Lõi |
| **B10d** nợ cơ học số lớn | SC-DATA-3 (117) | cột / bảng thiếu `COMMENT ON` (0152 ×32, 0121, 0128…) | một migration chỉ thêm `COMMENT ON` tiếng Việt | Lõi |
| | SC-SIG-1 (108), SC-SIG-2 (176) | tệp framework thiếu dấu R-SIG; dấu sai khuôn (thiếu giờ, vd `[2026-11-13 Nguyễn Văn Thủy]`) | người viết sửa dấu của mình (không bịa giờ thay người khác); Lõi thêm dấu cho tệp không dấu | từng người |
| | SC-UI-1 (111) | nút / ô bị chặn không nói vì sao | `BlockedHint` / `title` theo màn | chủ màn |
| | SC-DOC-6 (26) | mục menu chưa có `docs/huong-dan/<key>.md` | viết hướng dẫn ngắn | chủ phân hệ |
| | SC-DATA-1 (2) | hở số migration 0171, 0172 | ghi `why` ở baseline (số bị bỏ khi gộp nhánh song song; không đổi số migration đã chạy) | Lõi |

Thứ tự: **B10a → B10b** (nhỏ, Lõi làm ngay) → **B10c** (cần chủ tệp) → **B10d**. Sau B10a + B10b (141 phát hiện) còn 568 ở B10c, B10d; phần chưa xong kịp thì vào baseline **có `ref`** tới việc của đợt đó — để `main` ĐẠT sớm mà nợ vẫn có người nhận, không mất dấu.

## §3 Dòng giữ chỗ cũ gây chồng thật (SC-FLOW-1)

R-FLOW-6: dòng "đang làm" quá 3 ngày không có commit coi là đã nhả; người khác chỉ nhận sau khi hỏi người giữ hoặc chủ dự án.

| Dòng | Người giữ | Từ ngày | Chồng với | Đề xuất |
|---|---|---|---|---|
| OKT-SET-1 khoá cài đặt open-pos | hoanganh8389 (phiên OKT) | 2026-11-23 | PHASE-026 (`schema-catalog.ts`), S028-10 (`authz/**`) | đã merge #580 → xoá dòng (trả chỗ thiếu ở R-FLOW-6) |
| PHASE-028 · W5 đợt 2 (S028-10) | hoanganh8389 (phiên PHASE-028) | 2026-11-07 | OKT-SET-1 | chủ dự án xác nhận còn làm không; không → xoá |
| PHASE-026 · mã số cha – con GĐ 1 | Nguyễn Văn Thủy | 2026-11-07 | OKT-SET-1 | hỏi @Thuy2k; ghi chú ở dòng đã nói "nhánh đã mất" |

## Việc

S040-22 (B10a) · S040-23 (B10b) · S040-24 (B10c) · S040-25 (B10d) ở [40](40-MASTER-CHECKLIST.md). Đóng B10 khi `node tests/conformance/selfcheck.mjs` trên `main` in **KẾT QUẢ: ĐẠT** và ghi SHA vào nhật ký.
