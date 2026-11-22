# PHASE-040 · 10 — Ma trận chứng từ toàn luồng và ca nghiệm thu
<!-- [2026-11-22 04:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-040 — W0: DOC-001..061 đối chiếu sổ chứng từ thật (Doc 26 §3 trên main 3a551921), ca T040-1..36 -->

## 1. Cách đọc

Danh mục DOC-001..061 lấy từ bản làm việc *BIZCITY-DOCUMENT-CONTINUITY-CONFORMANCE-v1*, **đối chiếu với sổ thật** (Doc 26 §3, migration tới 0179). Cột "Hiện trạng":

| Ký hiệu | Nghĩa |
|---|---|
| ✅ trong sổ | bảng nguồn đã có trigger ghi `business_documents` với `doc_type` này |
| ♻ dùng thứ có sẵn | không cần loại mới: là phiên bản / trạng thái / đính kèm / `meta` của chứng từ đã có, hoặc đọc từ sổ |
| 📄 khái niệm kiểm | dùng để hỏi "đã truy được chưa", **không** tạo bảng hay `doc_type` (D040-3) |
| ☐ chưa | cần đưa vào sổ — mỗi dòng ☐ khi làm phải có `doc_type` đã kiểm trùng ở Doc 26 §3 |

Mức hoàn thành ma trận (dùng ở [20 §2](20-CHAM-DIEM-TIEN-DO.md)) = (✅ + ♻ đã có bằng chứng) / số dòng P0 không phải 📄. Không ghi ✅ khi chỉ có migration mà chưa có test.

## 2. Ma trận

### Mua hàng (DOC-001..023)

| ID | Chứng từ | `doc_type` / chỗ trong sổ | Hiện trạng | Ghi sổ | Ưu tiên | Bước |
|---|---|---|---|---|---|---|
| DOC-001 | Hồ sơ NCC | danh mục đối tượng (trụ cột 0) | 📄 | không | P0 | — |
| DOC-002 | Hồ sơ hàng / lô | `items`, `item_lots` (trụ cột 0, R-ITEM) | 📄 | không | P0 | — |
| DOC-003 | Hợp đồng mua | `hop-dong.contract:<số>` · `purchase.contract` | ✅ trong sổ (0165) | không | P0 | — |
| DOC-004 | Phụ lục / gia hạn | phiên bản của `hop-dong.contract` | ♻ | không | P1 | B6 hiện lịch sử phụ lục |
| DOC-005 | Bảng giá / chính sách NCC | `mua-hang.policy:<id>` · `pricing.policy` → `applies` HĐ | ✅ trong sổ | không | P0 | — |
| DOC-006 | Đề nghị mua | chưa rõ (kiểm Doc 19, `stock_max_requests`) | ☐ | không | P1 | B6 |
| DOC-007 | Đơn đặt (PO) | `mua-hang.document` · `purchase.order` → `applies` HĐ | ✅ trong sổ | không | P0 | B5 dải chuỗi |
| DOC-008 | Duyệt PO / báo NCC | workflow + `document_signatures` + nhật ký trên PO | ♻ | không | P0 | — |
| DOC-009 | NCC xác nhận đơn | `meta.exchange` + đính kèm trên PO | 📄 | không | P1 | — |
| DOC-010 | Phiếu giao NCC | đính kèm phiếu nhập | ♻ | không | P1 | B5 |
| DOC-011 | Biên bản kiểm nhận | `meta` + đính kèm phiếu nhập (nhận / chấp nhận / trả lại) | ☐ | không | P0 | B6 |
| DOC-012 | Phiếu nhập mua | `inventory.receipt` → `source` PO | ✅ trong sổ | có (theo `ledger[].on`) | P0 | B5 mang HĐ |
| DOC-013 | Hoá đơn NCC | `mua-hang.invoice` · `purchase.invoice` → `attachesTo` phiếu nhập | ✅ trong sổ (0179) | không (bút toán theo phiếu nhập) | P0 | B5 mang HĐ |
| DOC-014 | Phân bổ chi phí mua | `purchase.cost` | ✅ trong sổ | có | P0 | B5 mang HĐ |
| DOC-015 | Ghi nhận công nợ | đọc từ sổ 331 theo `dims.contract` | 📄 | — | P0 | — |
| DOC-016 | Đề nghị thanh toán | `quy.payment_request` · `finance.payment_request` | ✅ trong sổ | không | P0 | B5 mang HĐ, `settles` |
| DOC-017 | Uỷ nhiệm chi / phiếu chi | `finance.payment` (phiếu mua) | ✅ trong sổ | có | P0 | B5 mang HĐ |
| DOC-018 | Giấy báo nợ / sao kê | chưa vào sổ chứng từ | ☐ | không ghi trùng | P0 | sau phase (quỹ) |
| DOC-019 | Trả hàng NCC | `inventory.issue` (trả NCC) | ✅ trong sổ | có | P0 | B5 mang HĐ, `reverses` |
| DOC-020 | Hoá đơn điều chỉnh NCC | `purchase.invoice` + vai `adjusts` (0179) | ✅ trong sổ | phần chênh | P0 | — |
| DOC-021 | Thưởng / chiết khấu NCC | `purchase.rebate` | ✅ trong sổ | có | P0 | B5 mang HĐ |
| DOC-022 | Đối chiếu công nợ NCC | báo cáo từ sổ (`cong-no-theo-hop-dong`) | 📄 | không | P1 | — |
| DOC-023 | Thanh lý HĐ mua | `hop-dong.contract` trạng thái `done` + bảng sẵn sàng thanh lý | ♻ | không | P0 | B6 |

### Bán buôn (DOC-024..039) — @H-Joyy

| ID | Chứng từ | `doc_type` / chỗ trong sổ | Hiện trạng | Ghi sổ | Ưu tiên | Bước |
|---|---|---|---|---|---|---|
| DOC-024 | Hồ sơ khách / hạn mức | danh mục đối tượng | 📄 | không | P0 | — |
| DOC-025 | Chương trình bán / khuyến mại BH12 | `sale_programs` → `pricing.sale_program` | ☐ | không | P0 | **B7** |
| DOC-026 | Hợp đồng bán | `hop-dong.contract` loại bán (`contract.*`) | ♻ | không | P0 | — |
| DOC-027 | Báo giá | — | ☐ | không | P1 | sau phase |
| DOC-028 | Đơn đặt của khách | `phieu-ban.order` · `sales.order` (BH20) | ✅ trong sổ | không | P1 | B7 `applies` |
| DOC-029 | Đơn bán | `sales.order` | ✅ trong sổ | không khi lập | P0 | B7 `applies` |
| DOC-030 | Giữ hàng / kiểm hạn mức | `meta` của đơn | 📄 | không | P0 | — |
| DOC-031 | Lệnh soạn FEFO | — | ☐ | không | P1 | sau phase |
| DOC-032 | Phiếu xuất bán | kiểm ở B7: phiếu bán là chứng từ xuất hay có phiếu xuất riêng | ☐ cần kiểm | có | P0 | B7 |
| DOC-033 | Biên bản giao / POD | đính kèm đơn | ♻ | không | P0 | — |
| DOC-034 | Hoá đơn bán | `phieu-ban.doc` · `sales.invoice` | ✅ trong sổ | có | P0 | B7 `applies` |
| DOC-035 | Ghi nhận phải thu / doanh thu / giá vốn | đọc từ sổ | 📄 | — | P0 | — |
| DOC-036 | Phiếu thu / giấy báo có | chưa vào sổ chứng từ | ☐ | có | P0 | sau phase (quỹ) |
| DOC-037 | Trả hàng bán | `sales.return` | ✅ trong sổ | có | P0 | — |
| DOC-038 | Hoá đơn điều chỉnh bán | vai `adjusts` có sẵn; loại chưa có | ☐ | phần chênh | P0 | sau phase |
| DOC-039 | Thanh lý HĐ bán | `hop-dong.contract` `done` | ♻ | không | P0 | — |

### POS (DOC-040..048)

| ID | Chứng từ | `doc_type` / chỗ trong sổ | Hiện trạng | Ghi sổ | Ưu tiên | Bước |
|---|---|---|---|---|---|---|
| DOC-040 | Đẩy danh mục ERP → POS | nhật ký đồng bộ | 📄 | không | P0 | — |
| DOC-041 | Bill POS | `pos.order` · `sales.order` | ✅ trong sổ | có | P0 | B7 `applies` |
| DOC-042 | Hoá đơn điện tử POS | kiểm `nt-bh-010` đã vào sổ chứng từ chưa | ☐ cần kiểm | theo nghĩa vụ | P0 | B7 |
| DOC-043 | Đóng ca | kiểm `nt-bh-007` | ☐ cần kiểm | không | P0 | sau phase |
| DOC-044 | Lô đồng bộ POS → ERP | nhật ký | 📄 | không | P0 | — |
| DOC-045 | Xuất kho theo bill | liên kết `ledger` của `pos.order` | ♻ | có | P0 | — |
| DOC-046 | Đối soát QR / thẻ | kiểm `nt-bh-009` | ☐ cần kiểm | phí / chênh | P0 | sau phase |
| DOC-047 | Đổi / trả tại quầy | `pos.return` · `sales.return` | ✅ trong sổ | có | P0 | — |
| DOC-048 | Voucher / tích điểm | `pricing.voucher`, `pricing.loyalty` (chiến dịch / chương trình; lượt dùng chưa) | ✅ một phần | không | P1 | — |

### Kho (DOC-049..056)

| ID | Chứng từ | `doc_type` / chỗ trong sổ | Hiện trạng | Ghi sổ | Ưu tiên | Bước |
|---|---|---|---|---|---|---|
| DOC-049 | Đề nghị điều chuyển | `transfer_requests` chưa vào sổ | ☐ | không | P1 | sau phase |
| DOC-050 | Phiếu chuyển kho | `kho.transfer` · `inventory.transfer` | ✅ trong sổ | tuỳ cùng / khác sổ | P0 | — |
| DOC-051 | Nhận tại kho đích | trạng thái phiếu chuyển (`done` = đã nhận) | ♻ | theo bản chất | P0 | — |
| DOC-052 | Kế hoạch kiểm kê | — | ☐ | không | P1 | sau phase |
| DOC-053 | Biên bản kiểm kê | `stock_counts` chưa vào sổ | ☐ | không | P0 | sau phase (@Thuy2k) |
| DOC-054 | Xử lý chênh lệch kiểm kê | — | ☐ | có | P0 | sau phase |
| DOC-055 | Huỷ / hỏng / hết hạn | — | ☐ | có | P1 | sau phase |
| DOC-056 | Combo / quà tặng | cấu hình (ADR-0035: combo không phải mặt hàng) | 📄 | khi giao dịch | P0 | — |

### Quản trị chứng từ (DOC-057..061)

| ID | Chứng từ | Chỗ trong sổ | Hiện trạng | Ưu tiên | Bước |
|---|---|---|---|---|---|
| DOC-057 | Nhật ký gửi / nhận | `meta.exchange` + nhật ký (D040-4) | 📄 | P0 | B8 |
| DOC-058 | Phiên bản và ký | `document_versions`, `document_signatures` | ✅ | P0 | — |
| DOC-059 | Đính kèm, lưu trữ | `document_attachments.sha256` | ✅ một phần (chưa kiểm tệp đổi) | P0 | B8 |
| DOC-060 | Điều chỉnh, huỷ | phiên bản mới + `reverses` / `adjusts` | ✅ | P0 | — |
| DOC-061 | Lỗi, sửa lỗi | HT19 + `IN-*` | ♻ | P0 | B4 |

Đếm (61 dòng): 22 ✅ (kể cả một phần) · 10 ♻ · 12 📄 · 17 ☐ (4 trong số đó "cần kiểm"). Dòng ☐ "sau phase" không thuộc phase này; ghi ở đây để không ai coi ma trận là xong.

## 3. Ca nghiệm thu T040

Cột "Test gần nhất đã có" là **gợi ý đối chiếu**, chưa xác minh ca đó đúng kỳ vọng; khi xác minh xong ghi tên ca vào cột "Trạng thái" ở [40](40-MASTER-CHECKLIST.md).

| Ca | Luồng | Tình huống | Kỳ vọng | Test gần nhất đã có | Bước |
|---|---|---|---|---|---|
| T040-1 | Mua | NCC mới trùng MST | mã `IN-MD-*`, không trùng định danh | `item-master`, Gate A đối tượng | — |
| T040-2 | Mua | Hợp đồng thiếu NCC / người ký không có quyền | không duyệt được; mã + `requestId` | `hop-dong-mua` | B6 |
| T040-3 | Mua | Đổi mã hàng sau khi lập hợp đồng | mọi dòng vẫn `item_id`; ảnh chụp mã cũ còn | `golden-chuyen-kho-doi-ma`, `golden-tra-hang-doi-ma` | — |
| T040-4 | Mua | PO lấy giá đúng / sai kỳ hiệu lực | đúng chính sách; lệch có ghi đè kèm căn cứ | `phase-031-policy-lineage` | B5 |
| T040-5 | Mua | PO theo HĐ thiếu HĐ | nháp lưu được; trình duyệt thì nhắc `IN-DOC-CONTRACT-REQ` (đơn vị bật chặt thì chặn) | — | B5 |
| T040-6 | Mua | Mua lẻ không HĐ có ngoại lệ | `meta.contractException`, chuỗi không đứt | — | B5 |
| T040-7 | Mua | Nhập ít hơn PO, hoá đơn đến sau | nhập hợp lệ; hoá đơn khớp sau; không ghi công nợ hai lần | `mua-hang-25-tinh-huong` | B5 |
| T040-8 | Mua | Hoá đơn trước hàng / hàng đi đường | tách thời điểm, ghi sổ đúng chính sách | `mua-hang-25-tinh-huong` | — |
| T040-9 | Mua | Một hoá đơn cho nhiều phiếu nhập | liên kết nhiều–nhiều, khớp tổng và thuế | `hoa-don-ncc-so-chung-tu` | — |
| T040-10 | Mua | Trả NCC một lô | truy phiếu nhập, lô, hoá đơn gốc | `tra-hang-gia-von-goc` | B5 |
| T040-11 | Mua | Phân bổ chi phí vận chuyển | tổng phân bổ = chi phí nguồn | `mua-hang-25-tinh-huong` | — |
| T040-12 | Mua | Trả trước, trả nhiều đợt, cấn trừ | công nợ không âm; mỗi lần chi một lần | `payment-documents`, `cong-no-theo-hop-dong` | B5 |
| T040-13 | Mua | Thưởng NCC cuối kỳ | tách phần tồn / đã bán | — | — |
| T040-14 | Mua | Thanh lý khi còn công nợ | nhắc `IN-DOC-CLOSE-OPEN-ITEMS`; chặt thì chặn trừ biên bản miễn | — | B6 |
| T040-15 | Bán | Đơn áp chương trình BH12 đang hiệu lực | đơn `applies` chương trình | — | B7 |
| T040-16 | Bán | FEFO, giao từng phần | đúng lô, HSD, giá vốn | `lineage` | — |
| T040-17 | Bán | Giao ít hơn đơn, hoá đơn theo thực giao | không doanh thu ảo | — | — |
| T040-18 | Bán | Trả hàng khác kỳ | điều chỉnh hoá đơn gốc, đảo giá vốn đúng kỳ | `tra-hang-gia-von-goc`, `nt-bh-030-tra-hang-dot-3` | — |
| T040-19 | POS | Đẩy trùng bill cùng site | không trùng bán / kho / tiền / sổ | `nt-bh-004-pos-don-ban` | — |
| T040-20 | POS | Hai site trùng `bill_id` | tách theo site / đơn vị | — (R-SITE) | — |
| T040-21 | POS | Đóng ca khi QR chưa đối soát | tiền đang chuyển | `nt-bh-009-pos-thanh-toan-qr` | — |
| T040-22 | Kho | Chuyển kho hai đầu, nhận thiếu | hai đầu xác nhận, có luồng chênh lệch | `phieu-chuyen-kho` | — |
| T040-23 | Kho | Combo 3+1 rồi tách bán | mỗi SKU một `item_id` | PHASE-037 | — |
| T040-24 | Chứng từ | Sửa PO sau duyệt, chưa ghi sổ | `version` tăng, không tự sinh đảo | `so-chung-tu` | B1 xác minh |
| T040-25 | Chứng từ | Sửa phiếu đã ghi sổ | điều chỉnh + phiên bản; đảo do Kernel | `so-chung-tu`, `lich-su-chung-tu` | B1 xác minh |
| T040-26 | Chứng từ | Chỉ đổi `status_raw` | `status` đổi, `version` không tăng | `so-chung-tu` | B1 xác minh |
| T040-27 | Chứng từ | Xoá dòng nguồn | `cancelled`, lịch sử còn | `so-chung-tu` | B1 xác minh |
| T040-28 | Chứng từ | Đính kèm trùng / bản sửa | băm chống trùng; chữ ký cũ hết hiệu lực khi nội dung đổi | `dinh-kem-chung-tu` | B8 |
| T040-29 | Chứng từ | Hoá đơn XML trùng mã ngoài | không thêm chứng từ; nhật ký thử lại | `hoa-don-ncc-so-chung-tu` | B4 |
| T040-30 | Chứng từ | Ba ô sai cùng lúc | trả đủ ba phát hiện, tô đúng ô | Doc 25 §3.2 (`error.fields`) | B4 |
| T040-31 | Chứng từ | Năm lần lỗi cùng mã cùng PO | HT19 đủ 5 lần; thống kê đếm 5 | — | B4 |
| T040-32 | Bảo mật | Module gọi `bizcity_doc_put` sai đơn vị | chặn (42501) | `nt-bh-033-so-chung-tu-ban` | — |
| T040-33 | Kế toán | Module ghi thẳng sổ | H-LEDGER / SC-KERNEL chặn | `ra-soat-dong-gop.mjs` | — |
| T040-34 | Migration | Đếm bảng trước / sau trên dữ liệu thật | danh sách bảng, số dòng, khoá, chỉ mục | `kiem-nang-cap.sh` | B9 |
| T040-35 | Phát hành | PR merge khi CI không chạy | điểm `UNVERIFIED`, ghi trong bảng tiến độ | — | B2 |
| T040-36 | Lưu trữ | Khôi phục tệp từ sao lưu | băm khớp, có vết truy cập | `kiem-khoi-phuc.sh` | sau phase |
