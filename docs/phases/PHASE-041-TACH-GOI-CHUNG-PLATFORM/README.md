# PHASE-041 — Tách gói chung `@bizcity/platform` ra repo `bizcity-platform`
<!-- [2026-11-24 03:18 PM Johnny Chu - Chu Hoàng Anh] PHASE-041 — W0 P0: chủ dự án chốt 2026-11-24 — @bizcity/platform thành gói chung một nguồn cho mọi app Bizcity Open (open-ketoan, open-cake…), không fork; repo bizcity-platform; phát hành GitHub Packages trước; lớp dữ liệu mềm làm bản đầu ở open-cake -->
> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> **Việc lộ trình:** — (mở rộng, chờ đưa vào lộ trình)
> **Phân hệ:** he-thong
> **Checklist công bố:** —
> **Trạng thái:** 🟡 **W0 P0 kiểm kê** — chỉ tài liệu, 0 % mã. Quyết định đã chốt ở kế hoạch xuyên repo; bước kế: Nhóm Lõi duyệt bảng kiểm kê ([10](10-KIEM-KE.md)) rồi P1.
> **Tệp:** [10 — Kiểm kê](10-KIEM-KE.md) · [40 — Checklist](40-MASTER-CHECKLIST.md) · kế hoạch xuyên repo (chủ: open-hub): [KE-HOACH-GOI-CHUNG-BIZCITY-PLATFORM.md](https://github.com/hoanganh8389/open-hub/blob/main/docs/canon/KE-HOACH-GOI-CHUNG-BIZCITY-PLATFORM.md) · repo đích: [bizcity-platform](https://github.com/hoanganh8389/bizcity-platform)

## Đề bài (chủ dự án, 2026-11-24)

1. Hệ Bizcity Open có thêm app web thứ hai cùng khung open-ketoan (open-cake — CRM, trục `contact_id`). Chủ dự án **không** muốn chép (fork) `packages/platform` vào từng app: **tách thành gói chung** `@bizcity/platform`, một nguồn, mọi app phụ thuộc theo phiên bản.
2. Repo gói chung: `bizcity-platform` (công khai, GPL-2.0-or-later). Phát hành: GitHub Packages của `hoanganh8389` trước.
3. Lớp dữ liệu mềm kiểu WordPress (`user_meta`, `entity_meta`, `record_types`, `records`) làm **bản đầu ở open-cake**, vào gói chung khi open-ketoan cần (R-KER-8: lõi nhận khi ≥ 2 nơi cần).

## Trả lời ngắn

| Câu hỏi | Trả lời | Ở đâu |
|---|---|---|
| Gói đã tên `@bizcity/platform` chưa? | Rồi (0.1.0), nhưng **nằm trong** monorepo này và còn phụ thuộc `@ketoan/contracts` | [10 §1](10-KIEM-KE.md) |
| Ghép với kế toán sâu không? | Phần lớn là **tên gọi** (cổng `ctx.ledger`, phạm vi `accounting_unit`, mã `POSTING_FAILED`, tên DB `ketoan`), tách được bằng cổng đăng ký; ba tệp `masterdata/` là kế toán thật, ở lại đây | [10 §2](10-KIEM-KE.md) |
| `@ketoan/contracts` thì sao? | 30 tệp: phần nền (phong bì, lỗi chung, sự kiện, chứng từ chung, quyền, thư viện) sang `@bizcity/contracts`; phần kế toán ở lại; `@ketoan/contracts` re-export phần nền để mã cũ không vỡ | [10 §3](10-KIEM-KE.md) |
| Migration? | Bảng nền nằm rải trong 178 migration (0001, 0005, 0006, 0034…0158). Gói chung mang migration nền riêng; DB đang chạy chỉ **đánh dấu đã áp** (baseline), không chạy lại | [10 §4](10-KIEM-KE.md) |
| Máy nhiều site PHASE-039? | Đã ở trong platform (`db/site-*.ts`) ⇒ app khác dùng lại được ngay khi tách | [10 §2](10-KIEM-KE.md) |
| Đụng ai? | P2 chồng dòng NT-HT-003 (`core/{auth,actions}.ts`, `core/authz/*`, `packages/module-sdk/**`) ⇒ P2 giữ chỗ khi dòng đó trả hoặc hai bên thoả thuận | [40](40-MASTER-CHECKLIST.md) |
| Mức thay đổi | P0–P1: K0 (tài liệu, re-export). P2–P3, P6: **K3** (lớp nền, migration) — ADR số kế tiếp + diễn tập trên bản sao DB | R-KER-1 |

## Bước (mỗi bước một PR, giữ chỗ riêng)

| Bước | Việc | Ở repo |
|---|---|---|
| **P0** | kiểm kê (PR này) | open-ketoan (tài liệu) |
| P1 | hợp đồng nền `@bizcity/contracts` + re-export từ `@ketoan/contracts` | open-ketoan → `bizcity-platform` |
| P2 | tách `packages/platform` bằng `git subtree split` (giữ lịch sử); cổng đăng ký thay chỗ ghép kế toán | `bizcity-platform` + open-ketoan |
| P3 | migration nền riêng + baseline cho DB đang chạy; diễn tập trên bản sao | cả hai |
| P4 | phát hành 0.2.0 (GitHub Packages), CI ma trận open-ketoan + open-cake | `bizcity-platform` |
| P5 | open-cake dùng gói | open-cake |
| P6 | open-ketoan thay `packages/platform` bằng phụ thuộc gói, giữ tệp chuyển tiếp một bản | open-ketoan |
| P7 | lớp dữ liệu mềm từ open-cake vào gói chung | `bizcity-platform` |

## Xong khi

- **P0:** bảng kiểm kê [10](10-KIEM-KE.md) được Nhóm Lõi duyệt; mọi tệp `packages/platform/src/**` và `packages/contracts/src/**` có nhãn **nền / kế toán / tách**; danh sách bảng nền đủ để viết P3.
- **Cả phase:** open-ketoan chạy trên `@bizcity/platform` cài từ registry, `selfcheck --strict` không thêm nợ, `kiem-nang-cap.sh` xanh từ tag trước; open-cake chạy trên cùng bản gói.
