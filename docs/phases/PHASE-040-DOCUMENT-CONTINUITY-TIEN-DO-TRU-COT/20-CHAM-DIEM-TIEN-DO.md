# PHASE-040 · 20 — Chấm tiến độ theo từng PR merge: nền móng · trụ cột · ma trận tuân thủ
<!-- [2026-11-22 04:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-040 — W0: đặc tả bộ chấm PR (D040-7..9): ba mặt sinh từ main, 12 trục R-REV, cổng, UNVERIFIED, điểm người đóng góp, ảnh chụp #576–#578 -->

## 1. Nguyên tắc

1. **Sinh từ `main`, không gõ tay** (R-FLOW-8, R-CONT-7). Điểm là kết quả của một lệnh chạy trên hai commit; ai chạy lại cũng ra cùng số.
2. **Dùng lại công cụ có sẵn** ([00 §1.5](00-MASTER-PLAN.md)). Bộ chấm chỉ ghép và so; không thêm phép đo thứ hai cho cùng một thứ.
3. **Không bằng chứng thì không điểm hạng.** Thiếu bằng chứng chạy → `UNVERIFIED` (không phải 0, không phải đạt). Không áp dụng → `—` kèm lý do, người duyệt đồng ý.
4. **Cổng trước, điểm sau.** Phát hiện chặn → `BLOCKED` dù điểm cao; không quy điểm về 0 để "phạt".
5. **Đơn vị chấm là PR đã merge**, không phải commit, dòng mã hay giờ làm.

## 2. Ba mặt tiến độ (đo trước và sau merge, ghi chênh lệch)

| Mặt | Đo gì | Nguồn | Công thức |
|---|---|---|---|
| **Nền móng** | trụ cột có `role: "nền móng"` trong `tru-cot.json` (0 MDG, V chính sách, IX thư viện) | `docs/standard/tru-cot.json`, SC-PILLAR-1 | Σ trọng số tiêu chí / số tiêu chí; đạt 1 · một phần ½ · tài liệu ¼ · chưa 0 (giống `tru-cot-md.mjs`) |
| **Trụ cột** | trụ cột I–VIII và **X Liên tục chứng từ** (sau B1) | như trên | như trên, theo từng trụ cột và gộp |
| **Ma trận tuân thủ** | (a) C-1..C-9 `bizcity_compliance@1`; (b) ma trận chứng từ DOC-001..061 | `selfcheck` → `scoreboard.json.compliance`; [10 §2](10-MA-TRAN-CHUNG-TU.md) (B2 chuyển sang dạng máy đọc) | (a) điểm selfcheck; (b) (✅ + ♻ có bằng chứng) / dòng P0 không 📄 |

Mốc hiện tại ([00 §1.3, §1.5](00-MASTER-PLAN.md), `main` `3a551921`): nền móng **68 %** · trụ cột I–VIII **62 %** · chung **64 %** · ma trận C **73 %** (không CSDL) · lộ trình **68 %** · ma trận chứng từ P0: chưa chấm (chờ dạng máy đọc ở B2).

Một PR **đẩy tiến độ** khi nó đổi mức của ít nhất một tiêu chí (kèm bằng chứng qua SC-PILLAR-1), một dòng C-*, hoặc một dòng DOC-*. PR chỉ sửa tài liệu không đổi mức nào là PR **giữ nhịp** — vẫn ghi, không cộng tiến độ.

## 3. Mười hai trục cho từng PR

Mười một trục của [R-REV §7](../../rules/RULE-REVIEW.md) giữ nguyên (thang 2 / 1 / 0 / —; trục cổng T1, T2, T4, T5). Thêm một trục:

| Trục | Hỏi gì | Kiểm bằng |
|---|---|---|
| **T12 Liên tục chứng từ** *(cổng khi PR thêm / đổi chứng từ)* | Chứng từ mới có dòng sổ chứng từ chung bằng trigger? `doc_ref` đúng khuôn, `doc_type` đã kiểm trùng? Ánh xạ sáu nhóm? Liên kết `source` / `applies` / `ledger` đúng vai? Có ca test Doc 26 Bước 4? Chuỗi mua có số hợp đồng? Cập nhật Doc 26 §3 + CHANGELOG? | test `so-chung-tu` + ca của loại; chẩn đoán B8; R-DOC-CONT |

Bảng quy đổi từ "rubric 7 nhóm" của bản làm việc sang trục — để không có hai thang:

| Nhóm bản làm việc | Trọng số gốc | Trục chấm thay |
|---|---|---|
| Domain & bất biến | 25 | T1 sự thật kế toán, T6 CSDL & danh mục |
| Vòng đời & chuỗi chứng từ | 20 | **T12** |
| Dữ liệu gốc & cô lập đơn vị | 10 | T4 bảo mật & đa đơn vị, T6 |
| Kế toán / kho / giá vốn | 15 | T1, T9 báo cáo |
| Golden test & bằng chứng migration | 15 | T10 kiểm thử & bằng chứng |
| Bảo mật / CI / hiệu năng | 10 | T4, T7 hiệu năng, T8 bộ nhớ đệm |
| Tài liệu + mã lỗi + quan sát | 5 | T3 hợp đồng trước mã, T5 kiểm đầu vào, T11 Core gọn |

Điểm PR = Σ điểm trục được chấm / (2 × số trục được chấm), theo %. Kết luận theo R-REV §7.2 (**ĐẠT / ĐẠT có điều kiện / KHÔNG ĐẠT**), cộng ba trạng thái phát hành:

| Trạng thái | Khi nào |
|---|---|
| `BLOCKED` | trục cổng = 0; phát hiện mức chặn H-* chưa sửa; ghi thẳng sổ; mất lịch sử; chứng từ mới không vào sổ chứng từ chung; bỏ RLS; lẫn `item_id`; đổi trạng thái vượt workflow; migration phá dữ liệu |
| `UNVERIFIED` | không có bằng chứng chạy máy (D040-8) **hoặc** CI không chạy. Điểm vẫn tính, không quy ra hạng A–D |
| `VERIFIED` | có bằng chứng chạy (CI xanh, hoặc khối bằng chứng đủ theo §4) và một người duyệt khác tác giả ký |

Hạng (chỉ khi `VERIFIED`): ≥ 90 A · 80–89 B · 70–79 C · < 70 D. Trọng số, ngưỡng là thiết kế nội bộ, hiệu chỉnh sau 2–3 tuần chạy thật.

PR đã merge mà `BLOCKED` → mở việc khắc phục (`S###-n`) có người nhận, hạn; ghi trong bảng; không âm thầm đổi sang xanh.

## 4. Bằng chứng chạy máy (trong lúc CI không chạy — D040-8)

Khối dán ở mô tả PR (mẫu đưa vào `.github/pull_request_template.md` ở B3):

```text
### Bằng chứng chạy máy
head: <sha>   gộp main: <sha origin/main lúc chạy>
bash scripts/kiem-chuan.sh                       → ĐẠT | KHÔNG ĐẠT (<số phát hiện mới>)
node tests/conformance/selfcheck.mjs --strict    → ĐẠT | KHÔNG ĐẠT; tuân chuẩn <x>; C <y>%
(cd apps/api && npx vitest run <tệp>)            → <qua>/<tổng>   CSDL: <tên CSDL test>
typecheck                                        → 0 lỗi
migration: bảng trước <n> → sau <m> (chỉ khi có migration; sạch + nâng cấp)
```

Bộ chấm kiểm khối này **có mặt và đúng khuôn**, và chạy lại `kiem-chuan.sh` + `selfcheck` ở commit merge để so. Lệch giữa khối dán và chạy lại → ghi phát hiện, giữ `UNVERIFIED`.

## 5. Chạy thế nào

```text
node scripts/cham-pr.mjs --pr 576            # một PR đã merge
node scripts/cham-pr.mjs --since 2026-11-15  # chạy lùi
node scripts/cham-pr.mjs --pr 576 --write    # ghi docs/reviews/tien-do/PR-576.json + sinh lại TIEN-DO-PR.md
```

Các bước bên trong (chỉ đọc, chạy trong worktree tạm):

1. `git fetch`; lấy `base` = cha thứ nhất của commit merge, `merge` = commit merge; ghi cả hai SHA.
2. Lấy PR: tiêu đề, mô tả, tệp, commit, tác giả commit (qua `.mailmap`), review, check-run (kể cả lý do không chạy).
3. **Bản đồ tác động:** tệp đổi → trụ cột / luật / dòng DOC / C-* (bảng ánh xạ đường dẫn trong `cham-pr.mjs`, vd `db/migrations/**` → T6 + đếm bảng; `docs/nghiep-vu/26-*` hay trigger `bizcity_doc_put` → T12 + DC-*; `apps/api/src/phan-he/mua-hang/**` → DC-6, DOC-003..023).
4. Chạy ở `base` và `merge`: `selfcheck` (bảng điểm + C-*), tính ba mặt từ `tru-cot.json`, `ra-soat-dong-gop.mjs --range base..merge`, `bang-viec.mjs` (việc nào đổi sang ✅).
5. Có `DATABASE_URL` thì chạy thêm diagnostics và test của tệp đổi; không có thì ghi "không CSDL" — không đoán.
6. Chấm 12 trục: trục máy chấm được (T1, T2, T4, T5, T6, T10, T12 phần tĩnh) điền sẵn; trục cần người (T7, T8, T9, T11) để `cần người duyệt`.
7. Ghi `PR-<số>.json`; sinh lại `TIEN-DO-PR.md`.

**Đã có (B2, 2026-11-22)** <!-- [2026-11-22 08:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-040 — B2: ghi chỗ thi hành khác bản W0 -->: `scripts/cham-pr.mjs` + `scripts/cham-pr.lib.mjs` (hàm thuần, test `scripts/cham-pr.test.mjs`). Khác bản W0 ở năm điểm:

- **Ma trận chứng từ không có bản máy đọc thứ hai:** bộ chấm đọc thẳng bảng §2 của [10](10-MA-TRAN-CHUNG-TU.md) ở từng commit (R-FLOW-7, một nguồn).
- **Ma trận tuân thủ C-* chỉ khi `--selfcheck`** (selfcheck trong worktree tạm ở commit trước / sau merge, vài phút mỗi PR); không có cờ thì ghi "không chạy", không đoán.
- **Loại PR thứ ba "mở thước đo":** PR chỉ thêm tiêu chí / trụ cột / ma trận mới. Điểm có thể giảm (đo được phần còn thiếu) — không tính là lùi. "Lùi" chỉ khi tiêu chí **đã có** bị hạ mức, và tự mở việc theo sau.
- **H-FRAMEWORK không trừ T2 khi mọi tác giả có trong `.github/CODEOWNERS`** (luật dò viết cho người đóng góp ngoài nhóm giữ framework).
- **Trục máy là gợi ý** (`axesBy: "máy"`, kèm `axesBasis`): chạm trục mà có H-* chặn → 0, cảnh báo → 1, không phát hiện → 2. Người duyệt sửa `axes` và đặt `axesBy: "người"` trong `PR-<n>.json`; chạy lại giữ bản của người.

### 5.1 Khuôn `PR-<số>.json` (`bizcity_pr_progress@1`, nháp)

```json
{
  "contract": "bizcity_pr_progress@1",
  "pr": 576, "title": "…", "mergedAt": "2026-11-22T08:35:08Z",
  "base": "574ce1dd", "merge": "f72eddc0",
  "authors": [{ "id": "hoanganh8389", "commits": 1 }], "reviews": 0,
  "ci": { "ran": false, "reason": "billing-lock", "jobs": 7 },
  "evidenceBlock": { "present": false },
  "impact": { "pillars": ["VII", "VIII"], "rules": ["R-SITE"], "doc": [], "compliance": [] },
  "progress": {
    "foundation": { "before": 68, "after": 68 },
    "pillars": { "X": { "before": null, "after": null } },
    "compliance": { "before": 73, "after": 73 },
    "criteriaChanged": []
  },
  "axes": { "T1": "—", "T2": 2, "T12": "—" },
  "score": null, "grade": null,
  "verdict": "ĐẠT có điều kiện", "release": "UNVERIFIED",
  "findings": [], "followUps": []
}
```

Không ghi giờ sinh trong tệp (cùng nguồn → cùng tệp, như `review-board.json`).

### 5.2 Bảng `docs/reviews/TIEN-DO-PR.md` (sinh)

| Cột | Ý nghĩa |
|---|---|
| PR · ngày · người | số PR, ngày merge, tác giả (sau `.mailmap`) |
| Tác động | trụ cột / luật / DOC chạm tới |
| Δ Nền móng · Δ Trụ cột · Δ Tuân thủ | chênh lệch điểm %, kèm mã tiêu chí đổi mức |
| Điểm · hạng | % 12 trục; hạng chỉ khi `VERIFIED` |
| Phát hành | `VERIFIED` · `UNVERIFIED` · `BLOCKED` |
| Việc theo sau | `S###-n` mở từ phát hiện |

Cuối bảng: đường tiến độ theo tuần của ba mặt và từng trụ cột (để thấy trụ cột nào đứng yên).

## 6. Điểm người đóng góp (D040-9)

- Chỉ từ PR đã merge có `VERIFIED`; cần **≥ 3 PR hoặc ≥ 4 tuần**; chưa đủ → `chưa đủ mẫu`.
- 70 % trung bình điểm PR (trọng số độ khó do người duyệt ghi, không theo dòng mã) · 15 % lỗi lọt đã xác minh thuộc việc của người đó, theo mức · 10 % đóng đúng việc khắc phục · 5 % review / hỗ trợ người khác.
- Danh tính: `.mailmap` gộp nhiều tên commit của một người (đo được: `kiennt` / `TrongKien125`, `Võ Hoàng` / `Võ Việt Hoàng` (`H-Joyy`), `Nguyễn Văn Thủy` (`Thuy2k`)). Trình tự động (`claude` trong tác giả commit) không phải người đóng góp; credit thuộc người chỉ đạo phiên (R-SIG).
- Lỗi lọt: tìm PR gây ra bằng `git blame` + ca tái hiện; người bị gắn có quyền phản biện; không tự suy tội.
- Không chấm số commit, dòng mã, giờ online; không bảng xếp hạng công khai (Q040-5); không dùng làm đánh giá nhân sự duy nhất.

## 7. Ảnh chụp đầu tiên (2026-11-22, chưa có bộ chấm — chỉ sự thật)

| PR | Việc | Tệp chạm | Tác động dự kiến | CI | Review | Phát hành |
|---|---|---|---|---|---|---|
| #576 | PHASE-039 B5c: hợp đồng `bizcity_site_provisioning@1`, `GET /sites` phân trang con trỏ | `apps/api/src/modules/sites/*`, `packages/platform/src/db/site-backup.ts`, test `site-provisioning-paging`, hợp đồng, PHASE-039 | VII cô lập, VIII mở rộng; T3 hợp đồng trước mã | không chạy (khoá thanh toán) | 0 | `UNVERIFIED` |
| #577 | OKT-P-0: luật tối thượng open-pos ⇄ open-ketoan | `AGENTS.md`, `RULE-OPEN-POS-CONNECTION.md` | tài liệu luật — giữ nhịp | không chạy | 0 | `UNVERIFIED` |
| #578 | OKT-SET-1: ADR-0037 khoá cài đặt open-pos | ADR-0037, `RULE-TENANT-SECURITY.md`, CLAIMS | tài liệu — giữ nhịp | không chạy | 0 | `UNVERIFIED` |

Không cấp điểm số ở ảnh chụp này: chưa có bộ chấm (B2), chưa có khối bằng chứng, CI không chạy.

## 8. Không làm

- Không thêm thang điểm thứ hai song song R-REV §7 và `docs/reviews/TIEU-CHI.md`.
- Không chấm tay mức đạt trụ cột trong bảng tiến độ — mức đi theo `tru-cot.json` + SC-PILLAR-1.
- Không lưu điểm ở nơi ngoài `main` (artifact, bảng tính) làm nguồn (R-FLOW-7).
