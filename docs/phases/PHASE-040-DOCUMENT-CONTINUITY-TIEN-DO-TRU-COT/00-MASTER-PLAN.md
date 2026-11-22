# PHASE-040 · 00 — Kế hoạch & thiết kế
<!-- [2026-11-22 04:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-040 — W0: sự thật đo trên main 3a551921, trụ cột X + R-DOC-CONT (đề xuất), ba chiều trạng thái, mua hàng hợp đồng → thanh lý, bán hàng BH12, mã lỗi IN-DOC-*, bước thắng nhỏ -->

## 1. Sự thật đo trên `main` (`3a551921`, 2026-11-22)

Đo bằng lệnh, không suy từ tài liệu. Ai đo lại thì ghi SHA mới cạnh số.

### 1.1 Document Kernel đã có

| Thứ | Có gì | Nguồn |
|---|---|---|
| Bốn bảng | `business_documents` (`doc_ref`, `module`, `doc_type`, `status_raw`, `status`, `version`, `meta`), `document_versions` (`version`, `content_hash`), `document_links` (`role`), `document_attachments` (`sha256`) | 0158, 0164, 0166 · đo cột trên CSDL test |
| Hàm ghi | `bizcity_doc_put`, `bizcity_doc_link` — `SECURITY DEFINER`, kiểm `p_tenant` = đơn vị của phiên | 0167 |
| Vai liên kết | `source` · `applies` · `uses` · `ledger` · `settles` · `reverses` · `replaces` · `attachesTo` · `adjusts` | Doc 26 §2, 0162, 0179 |
| Chứng từ trong sổ | hợp đồng, chính sách mua, 8 loại phiếu mua, hoá đơn NCC, chuyển kho, đề nghị thanh toán; POS đơn / trả, phiếu bán đơn / hoá đơn / trả, chiến dịch voucher, chương trình tích điểm | Doc 26 §3, NT-BH-033 |
| Chưa vào sổ | chương trình bán BH12 (`sale_programs`) và liên kết `applies` từ đơn / phiếu bán tới chương trình | Doc 26 §6 |
| Hợp đồng mua xuyên suốt (nền) | hợp đồng = `dimensions` kind `contract` (sổ `hop-dong.contract:<số>`, phiên bản = phụ lục, đính kèm = bản scan); `supplier_products.contract_code`; `purchase_policies.scope.contractCode`; `purchase_documents.data.contractCode` → `applies`; dòng sổ mang `dims.contract` | `0165_hop_dong_mua_xuyen_suot.sql:8-14` |
| Test đang có | `so-chung-tu`, `nt-bh-033-so-chung-tu-ban`, `hoa-don-ncc-so-chung-tu`, `hop-dong-mua`, `golden-hop-dong`, `cong-no-theo-hop-dong`, `bao-cao-hop-dong`, `so-hop-dong-dau-cach`, `dinh-kem-chung-tu`, `lich-su-chung-tu`, `lineage`, `mua-hang-25-tinh-huong`, `tra-hang-gia-von-goc`, `golden-chuyen-kho-doi-ma`, `golden-tra-hang-doi-ma` | `apps/api/test/` |
| Bắt lỗi theo mã | thư viện phát hiện 109 mã `IN-*` (SUM 18, SHAPE 18, BIZ 16, POST 15, POL 12, MD 9…); **chưa có** họ `IN-DOC-*`. HT19: mọi lần ghi bị từ chối (400 / 404 / 409 / 422) tự ghi JSONL luồng `kiem-khai-bao`; `GET /api/v1/validation-log` | `packages/contracts/src/intake-findings.ts`, `packages/platform/src/core/nhat-ky-kiem.ts`, Doc 25 §3.5 |

### 1.2 Số bảng

Lệnh (CSDL test `okt-thu-db-1`, migration lõi mới nhất `0179_hoa_don_ncc_vao_so_chung_tu.sql`):

```sql
SELECT table_schema, count(*) FROM information_schema.tables
 WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog','information_schema')
 GROUP BY 1 ORDER BY 1;
```

| Schema | Bảng |
|---|---|
| `public` | **134** |
| `mod_pos` | 15 |
| `mod_phieu_ban` | 5 |
| `mod_loyalty` | 3 |
| `mod_voucher` | 3 |

So với danh sách 135 bảng nhóm phát triển báo: khớp 134, **thừa `org_units`** — bảng này đã xoá ở `db/migrations/0174_bo_cay_cu.sql:267` (cây đơn vị gộp vào `branches`, 0173–0174). Báo cáo ghi module "khoảng 25 bảng (phiếu bán 4)"; đo được 26 (phiếu bán 5). **Chưa đo:** CSDL nâng cấp từ bản phát hành trước, CSDL production, số dòng của bảng đã xoá / gộp. Việc S040-10.

### 1.3 Cổng merge

| Thứ | Đo được | Lệnh |
|---|---|---|
| GitHub Actions | **3 594 lượt chạy, 0 thành công** từ lượt đầu 2026-10-29. Mọi job dừng ở 0 bước với chú thích *"The job was not started because your account is locked due to a billing issue."* | `gh api repos/…/actions/runs?status=success` → `total_count: 0`; chú thích check-run 137159271413 (main) và 123544062561 (lượt đầu) |
| PR #576 | merge 2026-11-22 08:35; 4 job "failure" + 3 "skipped" — **không job nào chạy**; 0 review | `gh pr view 576 --json statusCheckRollup,reviews` |
| Bảo vệ `main` | **chưa bật** (`Branch not protected`), không có ruleset | `gh api …/branches/main/protection` |
| Review | 0 / 30 PR merge gần nhất có review; PR mở bởi `hoanganh8389` (58) và `H-Joyy` (2); commit của người khác vào qua các PR đó | `gh pr list --state merged` |
| CODEOWNERS | một người cho mọi đường dẫn | `.github/CODEOWNERS` |

Kết luận: "đỏ" trên PR không phải mã hỏng, là **không có CI**. Bằng chứng chất lượng tới nay chỉ có ở máy dev (`kiem-chuan.sh`, `selfcheck`, test có CSDL) và **không được lưu lại cùng PR**. Mọi điểm PR trước khi có D040-8 là `UNVERIFIED`.

Chạy thử `node tests/conformance/selfcheck.mjs` trên `main` `3a551921` (máy chưa cài gói, không CSDL — một số check có thể khác khi đủ môi trường; chạy lại ở B2 trong môi trường đủ trước khi chấm): **KHÔNG ĐẠT** — 60 đạt · 28 không đạt · 5 nợ cũ; tuân chuẩn 97.8, sẵn sàng Standard v1 76.2, độ phủ luật 41; ma trận tuân thủ 73 % (C-1 67 · C-2 67 · C-3 33 · C-4 100 · C-5 100 · C-6 60 · C-7 33 · C-8 100 · C-9 100, tín hiệu `DG-*` chưa đo vì không CSDL); lộ trình 68 %. Ví dụ trôi không phụ thuộc môi trường: hở số migration `0171`, `0172` (SC-DATA-1); trang tra mã có `ACC-HINT-*` mà thư viện không có (SC-FIND-1). Đây là thứ CI sẽ bắt nếu CI chạy.

### 1.4 Lệch tài liệu

| Chỗ lệch | Bên A | Bên B | Sửa ở |
|---|---|---|---|
| Số nhóm trạng thái | Doc 26 §4: 6 nhóm (`draft`, `pending`, `approved`, `in_progress`, `done`, `cancelled`) | `bizcity_document@1` STD-DOC-4: "5 nhóm" | B1 (D040-2) |
| Trạng thái hợp đồng | Doc 26 coi là chuẩn đang áp | `bizcity_document@1` ghi `1.4.0-draft · Đề xuất` | B1 |
| Vòng đời | Doc 26 §1: Nháp → Trình → Duyệt → Thực hiện → Hoàn tất | sơ đồ chủ dự án: Nháp → Duyệt → Đang thực hiện → Hoàn tất | B1: ghi rõ "Trình" là bước `pending`, có thể bỏ qua khi không cấu hình duyệt |
| Mã tiêu chí trụ cột | trụ cột I dùng `L-1..L-5` | trụ cột IX dùng `L-1..L-8` (trùng mã) | B1: đổi IX sang `LIB-1..LIB-8` để chấm chênh lệch theo mã không nhầm |
| Số bảng | báo cáo 135 | đo 134 | S040-10 |

### 1.5 Công cụ đo đã có — dùng, không viết lại

| Công cụ | Đo gì | Dùng ở phase này |
|---|---|---|
| `docs/standard/tru-cot.json` + `scripts/tru-cot-md.mjs` | trụ cột × tiêu chí × mức (đạt 1 · một phần ½ · tài liệu ¼ · chưa 0) | mặt "trụ cột" và "nền móng" |
| SC-PILLAR-1 (`tests/conformance/checks/pillar/pillar.check.mjs`) | tiêu chí "đạt" phải dẫn tới migration / test / check / tuyến có thật | chặn tô điểm |
| `tests/conformance/selfcheck.mjs` | bảng điểm, ma trận tuân thủ C-1..C-9, lộ trình | mặt "ma trận tuân thủ" |
| `scripts/ra-soat-dong-gop.mjs` | luật dò H-* trên dòng thêm của commit | trục T1–T11 |
| `scripts/bang-viec.mjs`, `scripts/tien-do-phase.mjs` | việc xong theo checklist, tiến độ phase | việc đóng trong PR |
| `docs/reviews/review-board.json` | 12 trục review theo nhịp, thang 0–4 | R2 (B9) |
| `scripts/kiem-nang-cap.sh` | migration nâng cấp từ bản trước | đếm bảng hai chế độ |

Mức hiện tại tính từ `tru-cot.json` (trước khi có trụ cột X): nền móng (0 MDG 53 %, V chính sách 61 %, IX thư viện 100 %) = **68 %**; trụ cột I–VIII (I 80 · II 61 · III 39 · IV 90 · VI 70 · VII 50 · VIII 50) = **62 %**; chung **64 %**.

## 2. Trụ cột X · Liên tục chứng từ (Document Continuity)

> **Một câu:** không chứng từ nào được coi là xong khi không trả lời được *ai lập, dựa trên gì, gửi / nhận cho ai, duyệt lúc nào, hàng / tiền đi đâu, ghi sổ ở đâu, bản gốc lưu đâu, vì sao đổi* — và câu trả lời phải đọc được từ bốn bảng Document Kernel cộng sổ, không từ trí nhớ.

Vị trí: đứng cạnh nền móng MDG. MDG giữ **định danh của đối tượng** (`item_id`, `partner_id`, chi nhánh, kho); trụ cột X giữ **định danh và chuỗi của chứng từ** (`doc_ref`, phiên bản, liên kết). Trụ cột III (liên tục kế toán) giữ chuỗi **con số** sau khi đã vào sổ. Ba chuỗi nối nhau ở liên kết `ledger` (`doc_ref` = `doc_key`).

### 2.1 Luật R-DOC-CONT (đề xuất — ghi vào `RULE-DOCUMENT-CONTINUITY.md` ở B1)

| Mã | Luật | Kiểm bằng (sẽ có) |
|---|---|---|
| R-DOC-CONT-0 | **Tier 0.** Mọi chứng từ nghiệp vụ có một dòng `business_documents`, ghi bằng trigger trên bảng nguồn (không ghi tay từ mã) — mọi đường vào (giao diện, API, Excel, MCP, module) đều vào sổ | SC mới: bảng nguồn khai trong Doc 26 §3 có trigger `business_documents_sync` |
| R-DOC-CONT-1 | `doc_ref` bất biến, khuôn `<module>.<loại>:<id>`, theo đơn vị; chứng từ có nộp sổ thì `doc_ref` = `doc_key` | test `so-chung-tu`; chẩn đoán `doc_ref` lệch `doc_key` |
| R-DOC-CONT-2 | Sáu nhóm `status`; `status_raw` giữ trạng thái riêng; chuyển trạng thái qua workflow (R-WF), không UPDATE viết cứng | H-STATUS; test ánh xạ |
| R-DOC-CONT-3 | Nội dung đổi → `version` tăng + `content_hash`; chỉ đổi trạng thái → không tăng. Đã ghi sổ thì sửa = chứng từ điều chỉnh + phiên bản mới, Kernel đảo | test `so-chung-tu` (đã có ca) |
| R-DOC-CONT-4 | Liên kết có ngữ nghĩa, chỉ dùng chín vai §1.1; chứng từ lập từ chứng từ khác phải có `source`; áp chính sách / thuộc hợp đồng phải có `applies` | chẩn đoán "mồ côi nguồn" theo loại |
| R-DOC-CONT-5 | **Hợp đồng xuyên suốt chuỗi mua** (D040-5): chứng từ thuộc chuỗi mua theo hợp đồng mang `meta.contract` + `applies`; mua không HĐ ghi ngoại lệ có lý do | `IN-DOC-CONTRACT-REQ` (nhắc mặc định) |
| R-DOC-CONT-6 | **Hoàn tất ≠ ghi sổ.** Trạng thái kế toán suy ra khi đọc; không cột thứ hai; điểm ghi sổ theo `ledger[].on` của workflow | chẩn đoán "đã hoàn tất, loại phải ghi sổ, không có liên kết `ledger`" |
| R-DOC-CONT-7 | Đính kèm có `sha256`, không ghi đè; tệp đổi = bản mới | test `dinh-kem-chung-tu` |
| R-DOC-CONT-8 | Mọi lần bị từ chối có mã `IN-*` / `ERR_*` + `requestId`, vào HT19; thống kê được theo mã | test nhật ký HT19 |
| R-DOC-CONT-9 | Không bảng mới cho lịch sử / phiên bản / đính kèm / liên kết / trạng thái gửi nhận; ngoại lệ bằng ADR | H-MD-TABLE mở rộng; duyệt PR |

### 2.2 Tiêu chí trụ cột X cho `tru-cot.json` (B1 ghi vào; mức là đề xuất, B1 đối chiếu bằng chứng rồi mới ghi)

| Mã | Tiêu chí | Mức đề xuất | Bằng chứng / khoảng cách | Việc |
|---|---|---|---|---|
| DC-1 | Mọi chứng từ ERP có dòng sổ chứng từ chung, ghi bằng trigger | một phần | 0158, 0165, 0166, 0179, NT-BH-033; thiếu BH12, kiểm kê, phiếu thu / chi quỹ, đề nghị điều chuyển | S040-17, S040-21 |
| DC-2 | `doc_ref` bất biến, theo đơn vị; module ghi qua hàm `SECURITY DEFINER` kiểm đơn vị | một phần | 0167; chưa có check tĩnh `doc_ref` = `doc_key` | S040-18 |
| DC-3 | Sáu nhóm trạng thái thống nhất ở Doc 26, hợp đồng, CANON | tài liệu | Doc 26 §4; hợp đồng còn 5 nhóm | S040-3 |
| DC-4 | Phiên bản + băm khi nội dung đổi; đổi trạng thái không tăng | một phần | `document_versions.content_hash`, test `so-chung-tu`; B1 xác minh từng loại có ca | S040-5 |
| DC-5 | Liên kết có ngữ nghĩa, không mồ côi nguồn | một phần | chín vai, `lich-su-chung-tu`; chưa có chẩn đoán mồ côi | S040-18 |
| DC-6 | Hợp đồng xuyên suốt chuỗi mua, phiếu nào cũng hiện số HĐ | một phần | 0165, `hop-dong-mua`, `cong-no-theo-hop-dong`, `golden-hop-dong`; thiếu hoá đơn NCC / đề nghị TT / chi / trả / thưởng mang HĐ, thiếu nhắc | S040-13, S040-14 |
| DC-7 | Từ hợp đồng tới thanh lý từng bước, thanh lý kiểm nghĩa vụ còn mở | chưa | — | S040-15, S040-16 |
| DC-8 | Hoàn tất ≠ ghi sổ; trạng thái kế toán suy ra | chưa | — | S040-18 |
| DC-9 | Đính kèm băm, bản gốc giữ nguyên | một phần | `document_attachments.sha256`, `dinh-kem-chung-tu`; chưa kiểm tệp đổi so bản lưu | S040-18 |
| DC-10 | Mã lỗi `IN-DOC-*`, nhật ký mọi lần lỗi, thống kê lỗi hay gặp | tài liệu | HT19 có; họ `IN-DOC-*` và thống kê chưa có | S040-11, S040-12 |
| DC-11 | Chính sách bán xuyên suốt: chương trình bán vào sổ, đơn / phiếu `applies` | chưa | Doc 26 §6 | S040-17 |

## 3. Ba chiều trạng thái (D040-4)

```text
Nghiệp vụ (lưu)        draft → pending → approved → in_progress → done      (+ cancelled)
                       business_documents.status ; status_raw giữ trạng thái riêng phân hệ

Gửi / nhận (ghi vết)   đã soạn · đã nhận → đã kiểm → đã gửi → NCC / khách xác nhận ; lỗi · thử lại · từ chối
                       nhật ký + document_attachments (biên nhận) + meta.exchange — KHÔNG đè status

Kế toán, lưu trữ       không áp dụng · chưa đủ · sẵn sàng · đã ghi sổ · đã đối chiếu · đã đảo
(suy ra khi đọc)       từ: doc_type có ledger[].on? · liên kết ledger · accounting_events · khoá kỳ
                       lưu trữ: có bản gốc (sha256) · đủ hạn giữ — theo căn cứ có phiên bản (R-GATE-11)
```

Điểm ghi sổ **không** mặc định ở `approved` hay `done`: theo `ledger[].on` của workflow từng loại. Hợp đồng, đơn đặt, chính sách, đề nghị thanh toán không bao giờ có bút toán. Cùng một nghĩa vụ không ghi hai lần qua phiếu nhập và hoá đơn (0179: hoá đơn NCC không vào `accounting_events`, bút toán theo phiếu nhập).

Trên màn: HT18 Sổ chứng từ thêm cột "Kế toán" (chữ kế toán, không mã: *Không ghi sổ · Chờ ghi sổ · Đã ghi sổ · Đã đảo*) — S040-18.

## 4. Mua hàng: từ hợp đồng đến thanh lý (D040-5, người làm @Thuy2k)

### 4.1 Mười một bước và cái đã có

| Bước | Việc | Chứng từ trong sổ hôm nay | Còn thiếu |
|---|---|---|---|
| A | NCC + dữ liệu gốc: đối tượng, MST, mặt hàng (`item_id`), ĐVT, lô / HSD, kho, TK | danh mục (trụ cột 0, không phải chứng từ) | — (theo PHASE-026) |
| B | Hợp đồng: số, hiệu lực, ký, điều khoản giao / trả tiền, thuế, bản scan | `hop-dong.contract:<số>` (`purchase.contract`); phụ lục = phiên bản | hiện người ký, hiệu lực trên đầu phiếu |
| C | Chính sách NCC: giá, chiết khấu, thưởng, hiệu lực | `mua-hang.policy:<id>` (`pricing.policy`) → `applies` hợp đồng | — |
| D | Nhu cầu mua | chưa vào sổ (kiểm Doc 19 / `stock_max_requests` trước khi đề xuất loại) | quyết ở B6 |
| E | Đơn đặt (PO): kế thừa HĐ / giá / chiết khấu, lệch có duyệt | `mua-hang.document` (`purchase.order`) → `applies` HĐ | ghi rõ chỗ ghi đè giá kèm căn cứ |
| F | Giao, kiểm nhận, nhập kho (nhận từng đợt, hàng đang đi đường) | `inventory.receipt` → `source` PO | biên bản kiểm nhận = đính kèm + `meta` của phiếu nhập |
| G | Hoá đơn NCC (XML), đối chiếu 3 chiều PO – nhập – hoá đơn | `mua-hang.invoice` (`purchase.invoice`) → `attachesTo` phiếu nhập; `adjusts` | mang số HĐ; mã `IN-DOC-3WAY-NOT-MATCH` |
| H | Công nợ, chi phí mua, phân bổ | `purchase.cost`; công nợ đọc từ sổ theo `dims.contract` | — (công nợ là sổ, không là chứng từ) |
| I | Thanh toán: đề nghị → duyệt → chi; trả trước, trả nhiều đợt | `finance.payment_request`, `finance.payment`, `purchase.prepayment` → `settles` | mang số HĐ, `settles` tới hoá đơn |
| J | Ngoại lệ: trả NCC, hoá đơn điều chỉnh, thưởng, hàng tặng | `inventory.issue` (trả NCC), `purchase.rebate`, `adjusts` | mang số HĐ |
| K | Đối chiếu, thanh lý | hợp đồng `done` = thanh lý (Doc 26 §4) | **bảng sẵn sàng thanh lý**: đếm PO / nhập / hoá đơn / công nợ / trả / thưởng còn mở theo HĐ; còn mở thì nhắc (đơn vị bật chặt thì chặn, trừ khi có biên bản miễn) |

### 4.2 Giao diện từng bước (B5, B6)

- **Dải chuỗi** trên đầu mọi phiếu mua: *Hợp đồng · Đơn đặt · Nhà cung cấp · Bước trước · Bước sau*, đọc từ `document_links`; bấm số HĐ mở hợp đồng. Trường kế thừa chỉ đọc; muốn ghi đè thì bấm "Ghi đè" và nhập căn cứ.
- **Màn hợp đồng từng bước** A → K: mỗi bước một ô trạng thái (chưa / đang / xong / có lỗi), số chứng từ của bước, nút lập chứng từ kế tiếp *từ* chứng từ trước (tự có `source`, `applies`).
- Lỗi hiện dưới đúng ô, bằng thành phần dùng chung `KetQuaKiem` (Doc 25 §3.4); tự lưu nháp.
- Nhập Excel / API đi cùng cửa kiểm, không vượt luật.
- Chữ trên màn là thuật ngữ kế toán tiếng Việt, không "HARD / snapshot / matrix".

## 5. Bán hàng và chính sách bán (người làm @H-Joyy)

Pull `main`, làm theo [Doc 26 §5 – §6](../../nghiep-vu/26-so-chung-tu-quy-chuan.md):

1. `sale_programs` (bảng lõi) → `pricing.sale_program`, `doc_ref` dạng `ban-hang.program:<id>`; ánh xạ trạng thái chương trình → sáu nhóm.
2. Đơn / phiếu bán / đơn POS áp chương trình → liên kết `applies` tới chương trình (mẫu: `mua-hang.policy`).
3. Ca test theo Doc 26 Bước 4 + chạy lại `nt-bh-033-so-chung-tu-ban`.
4. Cập nhật bảng "Đang có trong sổ" ở Doc 26 §3, một dòng `CHANGELOG.md`.

Không đổi `accounting_events`, không thêm bảng.

## 6. Mã lỗi: dùng lại Gate B / HT19 (D040-6)

Không khung mới. Thêm họ `IN-DOC-*` vào `intake-findings.ts` (kiểm trùng trước), mỗi mã có căn cứ và cách sửa; mức mặc định theo R-GATE-9 (nhắc), đơn vị nâng lên chặn.

| Mã đề xuất | Mặc định | Ô | Vì sao | Cách sửa |
|---|---|---|---|---|
| `IN-DOC-CONTRACT-REQ` | nhắc | hợp đồng | chứng từ chuỗi mua chưa gắn hợp đồng | chọn hợp đồng còn hiệu lực, hoặc ghi ngoại lệ mua lẻ |
| `IN-DOC-PO-PRICE-MISMATCH` | nhắc | đơn giá | giá đơn đặt lệch chính sách đang hiệu lực | ghi đè có căn cứ, hoặc lấy giá chính sách |
| `IN-DOC-PO-QTY-OVER` | nhắc | số lượng | nhận nhiều hơn đơn đặt | giảm số nhận hoặc lập đơn bổ sung |
| `IN-DOC-INVOICE-DUP` | **chặn** | số hoá đơn | hoá đơn NCC đã có (trùng là lỗi dữ liệu, không phải lựa chọn) | mở hoá đơn đã có, liên kết phiếu nhập |
| `IN-DOC-3WAY-NOT-MATCH` | nhắc | hoá đơn | PO – nhập – hoá đơn chưa khớp | xem chênh lệch, ghi biên bản |
| `IN-DOC-LOST-LINK` | nhắc | chứng từ | không truy được nguồn | khôi phục liên kết `source` / `applies` |
| `IN-DOC-WORKFLOW-DENIED` | chặn | trạng thái | không đủ quyền chuyển (đã có `FORBIDDEN` ở workflow — chỉ gắn mã) | xin quyền |
| `IN-DOC-POSTED-IMMUTABLE` | chặn | phiên bản | sửa thẳng phiếu đã ghi sổ | lập điều chỉnh |
| `IN-DOC-ARCHIVE-HASH` | chặn | đính kèm | tệp khác bản đã lưu | khôi phục bản gốc, lập điều chỉnh |
| `IN-DOC-CLOSE-OPEN-ITEMS` | nhắc | hợp đồng | thanh lý khi còn nghĩa vụ mở | xử lý từng mục, hoặc biên bản miễn |

Chặn chỉ ở những chỗ mà cho qua là **sai dữ liệu** (trùng hoá đơn, sửa sổ đã ghi, tệp gốc bị đổi, thiếu quyền); còn lại là nhắc. Bỏ `IN-DOC-MISSING-ITEM-ID` của bản làm việc: đã có ở họ `IN-MD-*` / `IN-ITEM-*`. Bỏ `IN-DOC-LEDGER-MISMATCH`: thuộc Gate C (`CT-*`). Bỏ `IN-DOC-SITE-BOUNDARY`: thuộc R-SITE / RLS (lỗi 42501).

**Lưu mọi lần lỗi:** đã có — HT19 tự ghi mọi lần ghi bị từ chối. **Thống kê:** thêm vào `GET /api/v1/validation-log` phần gom theo `mã · loại chứng từ · phân hệ · bước · tuần`, số lần lặp, thời gian từ lần đầu tới khi hết lỗi; trên HT19 thêm thẻ "Lỗi hay gặp" (10 mã nhiều nhất tuần này). Không ghi giá trị người dùng nhập (R-LOG-4).

## 7. Chấm tiến độ

Xem [20-CHAM-DIEM-TIEN-DO](20-CHAM-DIEM-TIEN-DO.md).

## 8. Bước thắng nhỏ (R-FLOW-9)

| Bước | Việc | Người dùng dùng được gì sau bước | Việc `S040` | Mức | Câu hỏi / mặc định tạm |
|---|---|---|---|---|---|
| **B0** | Tài liệu phase (PR này) | chủ dự án đọc một chỗ: đo thật, quyết định, thứ tự | S040-1 | K0 | — |
| **B1** | Chuẩn hoá: `bizcity_document@1` 1.5.0 (6 nhóm), ADR-0038, `RULE-DOCUMENT-CONTINUITY.md`, CANON §0.14, trụ cột X trong `tru-cot.json`, đổi mã IX → `LIB-*` | HT10 hiện trụ cột X với % thật; một câu trả lời cho "mấy nhóm trạng thái" | S040-3, 4, 5 | K0–K1 | Q040-2 → `R-DOC-CONT` |
| **B2** | `scripts/cham-pr.mjs` + `docs/reviews/tien-do/` + `TIEN-DO-PR.md`; chạy lùi 10 PR gần nhất | chủ dự án mở một bảng: PR nào đẩy trụ cột nào lên / xuống bao nhiêu, bằng chứng đủ chưa | S040-6, 7 | K0 | Q040-5, 6 → mặc định |
| **B3** | Mẫu PR có khối *Bằng chứng chạy máy*; `nhan-viec.mjs kiem` nhắc khi thiếu; `.mailmap` | dev biết phải dán gì; điểm gắn đúng người | S040-8, 9 | K0 | Q040-3, 4 (chủ tài khoản) |
| **B4** | Họ `IN-DOC-*`; thống kê HT19 | kế toán xem "lỗi hay gặp tuần này", bấm mã ra cách sửa | S040-11, 12 | K1 | — |
| **B5** | Số HĐ trên mọi phiếu chuỗi mua + dải chuỗi đầu phiếu | kế toán mua thấy HĐ · PO · NCC trên mọi phiếu, bấm về hợp đồng; thiếu HĐ được nhắc | S040-13, 14 | K1 | Q040-1 → nhắc |
| **B6** | Màn hợp đồng từng bước A → K; bảng sẵn sàng thanh lý | lập chứng từ kế tiếp từ chứng từ trước; biết còn gì trước khi thanh lý | S040-15, 16 | K1 | — |
| **B7** | BH12 vào sổ + `applies` (@H-Joyy) | từ đơn bán thấy chương trình đã áp, từ chương trình thấy các đơn đã dùng | S040-17 | K1 | — |
| **B8** | Trạng thái kế toán suy ra trên HT18; chẩn đoán mồ côi nguồn / hoàn tất thiếu sổ / tệp đổi băm | biết phiếu nào hoàn tất mà chưa vào sổ, phiếu nào mất nguồn | S040-18 | K2 | — |
| **B9** | Đếm bảng hai chế độ (sạch + nâng cấp); review R2 bằng bộ chấm B2 | số bảng có bằng chứng; R2 đúng nhịp | S040-10, 19 | K0 | — |

Thứ tự: B1 → B2 → B3 trước (đo được rồi mới làm tiếp); B4, B5, B7 song song (khác phạm vi); B6 sau B5; B8 sau B1; B9 cuối.

## 9. Không làm

- Không bảng mới, không `doc_type` mới cho khái niệm kiểm (`document.exchange`, `document.finding`, `finance.ap_recognition`, `master.*`).
- Không đụng `accounting_events`, không đổi điểm ghi sổ của loại đang chạy.
- Không bắt buộc hợp đồng cho bill POS khách lẻ.
- Không chấm người theo số dòng mã, số commit, giờ online.
- Không ghi "CI xanh" khi CI không chạy; không bật check bắt buộc khi check không chạy được (sẽ chặn mọi merge).
- Không viết cứng thuế suất hay hạn lưu trữ: theo căn cứ có phiên bản (R-GATE-11, `docs/can-cu/`).
