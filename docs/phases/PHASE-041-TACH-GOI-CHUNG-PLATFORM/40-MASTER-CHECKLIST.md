# PHASE-041 · 40 — Checklist
<!-- [2026-11-24 03:18 PM Johnny Chu - Chu Hoàng Anh] PHASE-041 — việc con S041-*, ca T041-*, nhật ký -->

Ký hiệu: ☐ chưa · 🟡 đang · ✅ xong · ⛔ chờ người ngoài nhóm.

## Việc

| ID | Việc | Đợt | Ưu tiên | Code? | Trạng thái |
|---|---|---|---|---|---|
| S041-1 | P0 — kiểm kê sơ bộ: nhãn nền / tách / kế toán cho `packages/platform/src`, `packages/contracts/src`, bảng nền trong migration, gói còn lại; cổng đăng ký cần thêm ([10](10-KIEM-KE.md)) | W0 | P0 | không | ✅ 2026-11-24 |
| S041-2 | P0 — Nhóm Lõi đọc các tệp "tách" / "cần đọc", chốt nhãn; trả Q041-1..3 | W0 | P0 | không | ☐ |
| S041-3 | P1 — `@bizcity/contracts` (phần nền) + `@ketoan/contracts` re-export; build xanh, hành vi không đổi | W1 | P0 | có | ☐ |
| S041-4 | P2 — cổng đăng ký (§2.2) trong `packages/platform`, open-ketoan đăng ký phần kế toán; hành vi không đổi | W2 | P0 | có | ⛔ chờ dòng NT-HT-003 trả `core/{auth,actions}.ts`, `authz/*`, `module-sdk` |
| S041-5 | P2 — `git subtree split` sang repo `bizcity-platform`; ba tệp `masterdata/` + `catalog-warn.ts` ở lại | W2 | P0 | có | ☐ |
| S041-6 | P3 — migration nền riêng (nguồn `platform`), baseline DB đang chạy, diễn tập trên bản sao (so lược đồ) | W3 | P0 | có | ☐ |
| S041-7 | P4 — phát hành 0.2.0 lên GitHub Packages; CI ma trận open-ketoan + open-cake | W4 | P0 | có | ☐ |
| S041-8 | P6 — open-ketoan phụ thuộc gói; tệp chuyển tiếp một bản; ADR số kế tiếp (K3) | W5 | P0 | có | ☐ |
| S041-9 | P7 — nhận lớp dữ liệu mềm từ open-cake vào gói chung khi open-ketoan cần | W6 | P2 | có | ☐ |

## Ca bằng chứng

| ID | Ca | Gắn với |
|---|---|---|
| T041-1 | sau P1: `npm run build && npm run typecheck && npm test` xanh, `selfcheck --strict` không thêm nợ | S041-3 |
| T041-2 | sau P2: mọi test open-ketoan xanh với platform từ repo gói chung (workspace git) | S041-4, S041-5 |
| T041-3 | sau P3: bản sao DB thật — lược đồ trước / sau baseline giống hệt; `kiem-nang-cap.sh` từ tag trước xanh | S041-6 |
| T041-4 | sau P4: một app trắng (open-cake) cài `@bizcity/platform@0.2.x` từ registry và chạy `/api/v1/system/health/ready` | S041-7 |

## Nhật ký

- 2026-11-24 — mở phase; S041-1 xong (PR P0). Giữ chỗ ở PR #616.
