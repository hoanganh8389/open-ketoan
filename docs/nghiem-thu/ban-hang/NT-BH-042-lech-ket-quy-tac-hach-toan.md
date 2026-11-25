# NT-BH-042 · Tài khoản chênh lệch két khai ở Quy tắc hạch toán, bỏ khỏi BH17
<!-- [2026-11-25 10:30 PM Võ Hoàng] NGHIEM-THU — chốt NT-BH-042 (anh Hoàng, 25/11 — mọi câu theo đề xuất) (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng — module `pos` (chốt ca, NT-BH-007 / NT-BH-014); phần Core: Quy tắc hạch toán ACC41 (`packages/kernel/src/modules/posting-config/**`, người giữ Nguyễn Văn Thủy) |
| Màn hình | BH17 Cài đặt bán hàng (`/app/pos/cai-dat`) — khối "Chênh lệch két"; ACC41 Quy tắc hạch toán / Tài khoản ngầm định (`/cau-hinh/quy-tac-hach-toan`) |
| Ngày tạo | 25/11/2026 |
| Trạng thái | **Đã chốt 25/11/2026** (Võ Hoàng) — mọi câu §6 theo phương án đề xuất |
| Căn cứ | Quyết định của anh Hoàng 25/11: cặp tài khoản chênh lệch két chuyển sang màn Quy tắc hạch toán, bỏ khỏi BH17; Hoàng làm phần module và báo Thủy, Core cần đổi thì liệt kê riêng. Bốn câu không thương lượng §4 (AGENTS.md): không viết số tài khoản trong code. NT-BH-014, `docs/nghiep-vu/20-cai-dat-ban-hang-chenh-lech-ket.md` |

## 1. Hiện trạng (đọc trên `origin/main` 25/11)

**Phần máy chủ của module đã không viết số tài khoản.** Số tài khoản nằm ở **giao diện BH17**:

| Việc | Ở đâu | Đang làm gì |
|---|---|---|
| Chốt ca | `modules/pos/api/actions/shift-close.ts` | `cashDiffJournal` bật → `submitCashDiff` |
| Dựng phiếu | `modules/pos/api/domain/shifts.ts` (`cashDiffJournal`, `cashDiffDocKey`) | Lệch 0 → không phiếu. Thiếu → `manual_journal` một dòng `reasonCode = cashShortReason`; thừa → `cashOverReason`; `amount` = trị tuyệt đối; đối tượng `CN-<chi nhánh>` nếu có; khoá `pos:shift:<ca>:cash-diff`; số `CA-<CN>-<yyyymmdd>-<hhmm>` |
| Nộp phiếu | `modules/pos/api/cash-diff.ts` | `ctx.ledger.submit` trong SAVEPOINT; Core từ chối (`POSTING_FAILED` / `VALIDATION_ERROR`) thì ca vẫn chốt, biên bản ghi `journal.status = not_created`; "Lập lại phiếu" ở Sổ ca (`modules/pos/api/actions/admin-shift-journal.ts`) |
| Cài đặt | `modules/pos/settings.registry.json`, `modules/pos/api/settings.ts` | `bizcity.pos.cash_diff_journal` (bật / tắt, mặc định bật); `bizcity.pos.cash_short_reason` = **mã lý do** `POS-THIEU-KET`; `bizcity.pos.cash_over_reason` = `POS-THUA-KET`. Khoá **không chứa số tài khoản**, chỉ câu mô tả `schema` có "Nợ 1381 / Có 1111" |
| **Số tài khoản** | `modules/pos/web/screens/CaiDatPage.tsx` dòng 50 `DEF_PAIR = { short: { debit: '1381', credit: '1111' }, over: { debit: '1111', credit: '3381' } }`, dòng 107–112, 144–146 | BH17 hiện hai ô Nợ / Có cho mỗi hướng, bấm Ghi thì **gọi `PUT /api/v1/posting/reasons/:code` của Core** tạo / sửa lý do loại `journal` với cặp tài khoản đó. Đây là chỗ duy nhất của module có số tài khoản |
| Định khoản | `packages/kernel/src/modules/posting/rules/journal.rule.ts` | Nợ `posting_reasons.debit_account` / Có `credit_account` của lý do; lý do không phải `journal` → lỗi |
| ACC41 | `apps/web/src/features/posting/QuyTacHachToanPage.tsx`, `packages/kernel/src/modules/posting-config/scheme.ts`, `scheme.routes.ts` | Khung Nợ / Có theo nghiệp vụ (`SCHEME`), tài khoản của quy tắc (`RULE_KEYS`), mục đích xuất (`stock_purposes`). **Không có lý do loại `journal`**; `/cau-hinh/ly-do` chuyển hướng về ACC41 (`apps/web/src/pages.tsx` dòng 157) → hiện **không có màn Core nào sửa được lý do `journal`** ngoài BH17 |
| Lý do theo màn | `db/migrations/0095_ly_do_theo_man.sql` (bảng `screen_reasons`) | Có bảng, chưa có mã dùng trên `main`; `apps/api/src/modules/posting-flow/**` và màn Thiết kế hạch toán nằm trong dòng giữ chỗ PHASE-026 của Thủy, **chưa vào main**. Không có "luật có điều kiện" kiểu ACC92 trên main |
| Seed lý do | `db/seeds/ly-do.jsonl` | Chưa có `POS-THIEU-KET` / `POS-THUA-KET` — chỉ có khi kế toán bấm Ghi ở BH17 |

## 2. Mục tiêu

- Kế toán khai cặp tài khoản chênh lệch két **ở ACC41** như mọi quy tắc khác; BH17 chỉ còn bật / tắt "Lập phiếu chênh lệch két" và ngưỡng báo.
- Module `pos` **không còn số tài khoản nào** (kể cả giao diện), không gọi API ghi lý do của Core.
- Đơn vị đang chạy: **bút toán không đổi** (vẫn lý do `POS-THIEU-KET` / `POS-THUA-KET`, cặp tài khoản như đang lưu).

## 3. Phạm vi

### 3a. Phần module `pos` (Hoàng)

| # | Việc |
|---|---|
| 1 | BH17 khối "Chênh lệch két": bỏ ô Nợ / Có, bỏ `DEF_PAIR`, bỏ gọi `PUT /api/v1/posting/reasons`. Thay bằng dòng **chỉ đọc** mỗi hướng: mã lý do, tên, "Nợ … / Có …" đọc từ `GET /api/v1/posting/reasons` (hiển thị, không ghi), trạng thái "Đã khai" / "Chưa khai tài khoản", nút **"Khai ở Quy tắc hạch toán"** mở `/cau-hinh/quy-tac-hach-toan?nghiep-vu=pos_cash_diff` |
| 2 | Giữ nguyên máy chủ: `manual_journal` theo `reasonCode`, khoá chứng từ, SAVEPOINT, "Lập lại phiếu". Chỉ sửa chú thích có số tài khoản trong `domain/shifts.ts` (câu "mặc định Nợ 1381…" → "tài khoản khai ở ACC41") |
| 3 | `settings.registry.json`: giữ 3 khoá (ECP-13 — đơn vị có thể đã đổi mã lý do); câu `schema` bỏ số tài khoản, ghi "tài khoản khai ở ACC41"; `cash_short_reason` / `cash_over_reason` **thôi hiện ở BH17** (đổi mã lý do là việc hiếm — sửa qua API cài đặt) |
| 4 | Manifest `ledger.submits` dòng `manual_journal` khai `reasonCodes: ["POS-THIEU-KET", "POS-THUA-KET"]` (trường có sẵn trong `docs/contracts/BIZCITY-MODULE-v1.schema.json`). Không dùng `reasons` vì khuôn chỉ nhận `kind` in / out / receipt / payment và một mặc định cho mỗi docType |
| 5 | Hướng dẫn BH17, phiếu, CHANGELOG |

**Tệp sẽ chạm (dòng CLAIMS — phần module):**

```
modules/pos/web/screens/CaiDatPage.tsx
modules/pos/api/domain/shifts.ts                     (chỉ chú thích)
modules/pos/settings.registry.json                   (câu schema, không đổi khoá / mặc định)
modules/pos/bizcity.module.json                      (ledger.submits[manual_journal].reasonCodes; version 0.4.2)
modules/pos/README.md
modules/pos/test/shifts.test.ts
apps/api/test/nt-bh-014-cai-dat-ban-hang.test.ts     (bỏ phần BH17 ghi lý do; thêm ca mặc định)
apps/api/test/nt-bh-042-lech-ket-quy-tac.test.ts     (mới)
docs/nghiem-thu/ban-hang/NT-BH-042-lech-ket-quy-tac-hach-toan.md (mới)
docs/nghiep-vu/20-cai-dat-ban-hang-chenh-lech-ket.md
docs/huong-dan/pos-cai-dat.md
CHANGELOG.md
```

### 3b. Phần Core (Thủy — báo trước, PR riêng; R-FLOW-4 chạm thứ dùng chung)

| # | Việc | Tệp |
|---|---|---|
| C1 | Seed hai lý do loại `journal`: `POS-THIEU-KET` "Thiếu tiền két chờ xử lý (máy bán POS)" Nợ 1381 / Có 1111, `flags.default = "manual_journal:pos_cash_short"`; `POS-THUA-KET` Nợ 1111 / Có 3381, `flags.default = "manual_journal:pos_cash_over"`; cả hai `flags.module = "pos"`. Seed hiện chưa có dòng loại `journal` → kiểm bộ nạp seed đọc được `debit_account` / `credit_account` | `db/seeds/ly-do.jsonl` (số tài khoản ở dữ liệu cấu hình, không ở code) |
| C2 | Migration cho đơn vị đang có: thêm hai lý do **chỉ khi chưa có mã** (`ON CONFLICT DO NOTHING`) và chỉ khi tài khoản là TK chi tiết đang dùng; đơn vị đã bấm Ghi ở BH17 giữ nguyên cặp của mình | `db/migrations/<số kế tiếp>_ly_do_chenh_lech_ket.sql` (main đang tới 0183; số lấy bằng `node scripts/so-tiep-theo.mjs migration`) |
| C3 | ACC41 thêm nghiệp vụ **"Chênh lệch két máy bán" (`pos_cash_diff`, docType `manual_journal`)** hai nhóm Thiếu / Thừa, nguồn mới `reason` (tài khoản lấy từ lý do); đọc / sửa Nợ / Có của lý do ngay trên màn (dùng `PUT /api/v1/posting/reasons/:code` có sẵn, quyền `settings:write`, kiểm TK chi tiết + phạm vi đầu số) | `packages/kernel/src/modules/posting-config/scheme.ts`, `scheme.routes.ts`, `apps/web/src/features/posting/QuyTacHachToanPage.tsx`, `docs/nghiep-vu/24-quy-tac-hach-toan.md`, `docs/huong-dan/quy-tac-hach-toan.md` |
| C4 | Phạm vi đầu số cho hai lý do: thiếu Nợ `138, 334, 632, 811` / Có `111`; thừa Nợ `111` / Có `338, 711` | `scheme.ts` |

Ngoài phạm vi: đổi docType riêng cho chênh lệch két; tách tài khoản tiền theo cửa hàng (Q3); luật có điều kiện kiểu ACC92 / `posting-flow` (chờ PHASE-026 của Thủy).

## 4. Ca nghiệm thu

Ca bán CH01, thu ngân An, 08:00–14:00 ngày 25/11/2026. Đối tượng `CN-CH01` đã có.

| Ca | Thao tác | Kết quả mong đợi |
|---|---|---|
| 1 | Đơn vị mới (sau C1/C2), phải có 5.020.000, đếm 5.000.000 → chốt ca | Lệch −20.000. Phiếu `manual_journal` `CA-CH01-20261125-1400`, lý do `POS-THIEU-KET`: **Nợ 1381 (CN-CH01) 20.000 / Có 1111 20.000**; biên bản `journal.status = posted` |
| 2 | Phải có 3.000.000, đếm 3.015.000 | Lệch +15.000: **Nợ 1111 15.000 / Có 3381 (CN-CH01) 15.000** |
| 3 | Đếm đúng 2.000.000 | Lệch 0 → không phiếu, biên bản không có `journal` |
| 4 | Đơn vị cũ đã đổi ở BH17 thành Nợ 1388 / Có 1111 trước khi nâng cấp; chạy C2 rồi chốt thiếu 20.000 | Vẫn Nợ **1388** / Có 1111 (migration không đè) |
| 5 | Kế toán vào ACC41 → "Chênh lệch két máy bán" → đổi Thiếu thành Nợ 1388; chốt thiếu 20.000 | Nợ 1388 / Có 1111 20.000; BH17 hiện "Nợ 1388 / Có 1111 — khai ở Quy tắc hạch toán" |
| 6 | ACC41 chọn Nợ 138 (TK tổng hợp) hoặc 6421 (ngoài phạm vi) | Chặn tại ô: "138 là tài khoản tổng hợp" / "6421 ngoài phạm vi (138, 334, 632, 811)" |
| 7 | BH17: tìm ô Nợ / Có | Không còn; chỉ bật / tắt, ngưỡng báo, dòng chỉ đọc + nút sang ACC41. `grep -E "'1[0-9]{3}'|'3[0-9]{3}'" modules/pos` không ra số tài khoản |
| 8 | Đơn vị chưa có TK 1381 (C2 không thêm được lý do), chốt thiếu 20.000 | Ca vẫn chốt; biên bản "chưa lập — lý do POS-THIEU-KET chưa khai"; BH17 + readiness báo "Chưa khai tài khoản"; khai ở ACC41 rồi "Lập lại phiếu" → posted |
| 9 | Người có `pos:report` nhưng không có `settings:write` mở BH17 / ACC41 | Xem được cặp tài khoản, không sửa được (nút sửa ở ACC41 mờ) |

## 5. Câu hỏi ngược R-REV-17 (đề xuất trả lời)

Màn ghi ở phiếu này: ACC41 (sửa tài khoản lý do — Core); BH17 chỉ còn ghi bật / tắt + ngưỡng.

| Mã | Câu | Đề xuất trả lời |
|---|---|---|
| Q-CHUNG-01 | Ai được sửa cặp tài khoản? | `settings:write` (kế toán trưởng / chủ đơn vị) ở ACC41; người khác chỉ xem |
| Q-CHUNG-02 | Đổi tài khoản khi đã có phiếu chênh lệch? | Chỉ áp phiếu lập sau; phiếu cũ giữ nguyên (sổ chỉ thêm). Muốn sửa phiếu cũ: đảo + lập lại ở Sổ ca |
| Q-CHUNG-03 | Hai người cùng sửa ở ACC41? | Theo cơ chế phiên bản của action `PUT /posting/reasons` hiện có (Core) |
| Q-CHUNG-05 | Chốt ca gửi lại hai lần? | Khoá `pos:shift:<ca>:cash-diff` cố định — không trùng (đã có) |
| Q-CHUNG-06 | Ô bắt buộc ở ACC41? | Nợ và Có, khác nhau, TK chi tiết đang dùng, trong phạm vi C4 |
| Q-CHUNG-08 | Danh sách tài khoản chọn được? | Chỉ TK chi tiết đang dùng trong phạm vi đầu số; không thêm TK tại chỗ |
| Q-QUY | Có tiền thật đi ra / vào không? | Không — phiếu kế toán ghi nhận chênh lệch, xử lý (bồi thường, thu nhập khác) là phiếu sau của kế toán |
| Q-CUOI-KY | Kỳ đã khoá lúc chốt ca? | Core trả `PERIOD_LOCKED` → ca vẫn chốt, biên bản ghi lỗi, "Lập lại phiếu" sau khi mở kỳ (như hiện nay) |

## 6. Câu chốt (25/11/2026 — theo phương án đề xuất)

| # | Câu | Phương án đề xuất | Phương án khác |
|---|---|---|---|
| Q1 | Cơ chế tài khoản: giữ **lý do `journal`** hay chuyển sang **tài khoản của quy tắc** (`RULE_KEYS`)? | **Giữ lý do `journal`** (`POS-THIEU-KET` / `POS-THUA-KET`): luật định khoản không đổi, đơn vị đang chạy không đổi bút toán; Core chỉ thêm chỗ sửa ở ACC41 | Thêm khoá `cash_shortage` / `cash_surplus` vào `RULE_KEYS` + docType riêng `pos_cash_diff` có luật định khoản mới (đổi lõi, phải chuyển dữ liệu cũ) |
| Q2 | Ai lập hai lý do mặc định? | **Core seed + migration C1/C2** (không đè lý do đã có) | Module tự tạo khi chốt ca lần đầu (module không được ghi `posting_reasons` — SC-MOD-2; phải thêm action Core cho module) |
| Q3 | Bên tiền mặt: TK cố định trên lý do (1111) hay TK tiền mặt của hình thức thanh toán tại cửa hàng (DM05)? | **Giữ trên lý do** (như hôm nay) đợt này | Lấy TK của hình thức "Tiền mặt" của chi nhánh — đúng hơn khi mỗi cửa hàng có TK 1111x riêng, nhưng phải đổi luật `manual_journal` (Core) |
| Q4 | Khoá `cash_short_reason` / `cash_over_reason`: giữ hay bỏ? | **Giữ khoá, thôi hiện ở BH17** | Bỏ hẳn, module tra lý do theo `flags.default` (cần khung nhìn đọc lý do cho module — Core) |
| Q5 | Phạm vi đầu số C4 | Thiếu Nợ `138, 334, 632, 811`; thừa Có `338, 711`; bên tiền `111` | Không giới hạn (mọi TK chi tiết) |
| Q6 | Thứ tự PR | **Core C1–C4 (Thủy) vào trước**, rồi PR module bỏ ô ở BH17 (tránh khoảng trống không có nơi sửa) | Làm song song, BH17 tạm giữ ô tới khi ACC41 xong |
| Q7 | Số phiếu | NT-BH-042 | — |

## 7. Kết quả làm (25/11/2026, nhánh `feat/nt-bh-042-lech-ket`)
<!-- [2026-11-25 11:30 PM Võ Hoàng] NGHIEM-THU — ghi kết quả làm NT-BH-042 (đóng góp) -->

| Việc | Làm | Ghi chú |
|---|---|---|
| C2 | `db/migrations/0185_ly_do_chenh_lech_ket.sql` | Chỉ thêm khi chưa có mã (`ON CONFLICT DO NOTHING`), chỉ khi cả hai TK là TK chi tiết đang dùng |
| C3 / C4 | `scheme.ts` (nguồn `reason`, `REASON_KEYS`, nghiệp vụ `pos_cash_diff`), `scheme.routes.ts` (`GET /posting/scheme` trả `reasons`; action mới `PUT /api/v1/posting/scheme/reasons/:code`, quyền `settings:write`, kiểm phạm vi trước rồi TK chi tiết, trả mọi lỗi một lần qua `error.fields`, `expected` → `CONFLICT` khi người khác vừa đổi), ACC41 (khối "Lý do phiếu kế toán", hộp thoại Đổi, `?nghiep-vu=`) | Dùng action mới thay `PUT /posting/reasons/:code` vì action cũ không kiểm phạm vi đầu số và nằm ngoài dòng giữ chỗ |
| C1 | **Chưa làm** | `db/seeds/ly-do.jsonl` thêm dòng `journal` sẽ làm hỏng "Khôi phục lý do mặc định": bộ nạp (`default-data.service.ts` `restoreReasons`) không đọc `debit_account` / `credit_account` → vi phạm ràng buộc `posting_reasons_journal_accounts_check`. Đơn vị **tạo mới** sau migration lấy lý do từ gói nền `db/packs/vn-tt99-nen.posting-pack.json` (gói đã nhận `kind: journal`). Cả hai tệp ngoài dòng giữ chỗ — chờ chốt |
| Module 1–4 | BH17 chỉ đọc + nút sang ACC41; chú thích `shifts.ts`; `settings.registry.json`; manifest `reasonCodes`, 0.4.2; README | Máy chủ module không đổi |

Ca §4: 1, 2, 3, 4 (trước / sau nâng cấp như nhau), 5, 6, 8, 9 qua `apps/api/test/nt-bh-042-lech-ket-quy-tac.test.ts`; ca 7 qua `modules/pos/test/shifts.test.ts`. Hệ thống tài khoản mẫu có 1388 là TK tổng hợp → test dùng TK chi tiết 13881 thay 1388; 6421 cũng là TK tổng hợp → test ngoài phạm vi thêm 64111. Ca 9: không quyền thì nút Đổi / Khai **ẩn** (Q-CHUNG-01 chốt chung 25/11), máy chủ trả 403.
