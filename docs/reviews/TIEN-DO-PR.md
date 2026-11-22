# Tiến độ theo PR — nền móng · trụ cột · tuân thủ
<!-- [2026-11-22 08:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-040 — B2 (S040-7): bảng sinh bởi scripts/cham-pr.mjs, không sửa tay -->

> **Sinh bởi** `node scripts/cham-pr.mjs --write` từ `docs/reviews/tien-do/PR-*.json` — **không sửa tay** (R-FLOW-8). Cách chấm: [PHASE-040 · 20](../phases/PHASE-040-DOCUMENT-CONTINUITY-TIEN-DO-TRU-COT/20-CHAM-DIEM-TIEN-DO.md). Trục máy chỉ là **gợi ý** từ luật dò H-*; người duyệt sửa trong `PR-<n>.json` (`axesBy: "người"`).

**10 PR** · `VERIFIED` 0 · `UNVERIFIED` 10 · `BLOCKED` 0 · đẩy tiến độ 0

| PR · ngày · người | Loại | Tác động | Δ Nền móng | Δ Trụ cột | Δ Ma trận chứng từ | Δ Tuân thủ C | Tiêu chí đổi mức | Điểm · hạng | Kết luận | Phát hành | CI · duyệt · bằng chứng |
|---|---|---|---|---|---|---|---|---|---|---|---|
| [#581](https://github.com/hoanganh8389/open-ketoan/pull/581) · 2026-11-22 · hoanganh8389 | mở thước đo | — | 68 % | 62 % | mới 69 % | 73 % | — | — | ĐẠT | `UNVERIFIED` | không chạy (billing-lock) · 0 · thiếu dòng |
| [#580](https://github.com/hoanganh8389/open-ketoan/pull/580) · 2026-11-22 · hoanganh8389 | giữ nhịp | trụ cột I VII · R-API R-DB R-QG R-SEC | 68 % | 62 % | — | 73 % | — | 100 % (máy gợi ý) | ĐẠT | `UNVERIFIED` | không chạy (billing-lock) · 0 · không |
| [#579](https://github.com/hoanganh8389/open-ketoan/pull/579) · 2026-11-22 · hoanganh8389 | giữ nhịp | R-API | 68 % | 62 % | — | 73 % | — | — | ĐẠT | `UNVERIFIED` | không chạy (billing-lock) · 0 · không |
| [#578](https://github.com/hoanganh8389/open-ketoan/pull/578) · 2026-11-22 · hoanganh8389 | giữ nhịp | — | 68 % | 62 % | — | 73 % | — | — | ĐẠT | `UNVERIFIED` | không chạy (billing-lock) · 0 · không |
| [#577](https://github.com/hoanganh8389/open-ketoan/pull/577) · 2026-11-22 · hoanganh8389 | giữ nhịp | — | 68 % | 62 % | — | 73 % | — | — | ĐẠT | `UNVERIFIED` | không chạy (billing-lock) · 0 · không |
| [#576](https://github.com/hoanganh8389/open-ketoan/pull/576) · 2026-11-22 · hoanganh8389 | giữ nhịp | trụ cột VI VII VIII · R-API R-LOG R-OBS R-QG | 68 % | 62 % | — | 73 % | — | 100 % (máy gợi ý) | ĐẠT | `UNVERIFIED` | không chạy (billing-lock) · 0 · không |
| [#575](https://github.com/hoanganh8389/open-ketoan/pull/575) · 2026-11-22 · hoanganh8389 | giữ nhịp | — | 68 % | 62 % | — | 73 % | — | — | ĐẠT | `UNVERIFIED` | không chạy (billing-lock) · 0 · không |
| [#574](https://github.com/hoanganh8389/open-ketoan/pull/574) · 2026-11-22 · hoanganh8389 | giữ nhịp | trụ cột VI IX · R-LIB R-LOG R-OBS R-QG | 68 % | 62 % | — | 73 % | — | 100 % (máy gợi ý) | ĐẠT | `UNVERIFIED` | không chạy (billing-lock) · 0 · không |
| [#573](https://github.com/hoanganh8389/open-ketoan/pull/573) · 2026-11-22 · hoanganh8389 | giữ nhịp | — | 68 % | 62 % | — | 73 % | — | — | ĐẠT | `UNVERIFIED` | không chạy (mọi job bị huỷ hoặc bỏ qua) · 0 · không |
| [#572](https://github.com/hoanganh8389/open-ketoan/pull/572) · 2026-11-22 · hoanganh8389 | giữ nhịp | trụ cột VI VII VIII · R-LOG R-OBS R-QG R-SITE | 68 % | 62 % | — | 73 % | — | 100 % (máy gợi ý) | ĐẠT | `UNVERIFIED` | không chạy (billing-lock) · 0 · không |

## Đường tiến độ theo tuần

Giá trị sau PR merge cuối cùng của tuần. Trụ cột đứng yên nhiều tuần là chỗ cần nhìn.

| Tuần | Nền móng | Trụ cột | Ma trận chứng từ | 0 | I | II | III | IV | V | VI | VII | VIII | IX |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-W47 | 68 % | 62 % | 69 % | 53 | 80 | 61 | 39 | 90 | 61 | 70 | 50 | 50 | 100 |
