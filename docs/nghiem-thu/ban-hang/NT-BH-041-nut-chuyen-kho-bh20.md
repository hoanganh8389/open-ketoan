# NT-BH-041 · Nút "Lập chuyển kho" trên đơn đặt hàng BH20 khi kho bán thiếu hàng
<!-- [2026-11-25 10:30 PM Võ Hoàng] NGHIEM-THU — chốt NT-BH-041 (anh Hoàng, 25/11 — mọi câu theo đề xuất) (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng — module `phieu-ban` (đơn đặt hàng BH20); gọi phiếu chuyển kho KHO01 của phân hệ Kho |
| Màn hình | BH20 Đơn đặt hàng (`/app/phieu-ban/don-dat-hang`) — khung "Giữ hàng" của form đơn (`OrderEditor`) thêm nút **Lập chuyển kho** và nút **Giữ lại hàng** |
| Ngày tạo | 25/11/2026 |
| Trạng thái | **Đã chốt 25/11/2026** (Võ Hoàng) — mọi câu §6 theo phương án đề xuất · **Code + test xong 25/11** (§7) |
| Căn cứ | NT-BH-023 §8, Q8, Q12 ("nút chuyển kho để sau — chờ yêu cầu điều chuyển của kiennt"); NT-BH-032 (chuyển kho KCB ⇄ KHG); quyết định của anh Hoàng 25/11: **không chờ "yêu cầu điều chuyển có ghi sổ" của kiennt, Hoàng làm bằng phiếu chuyển kho KHO01 có sẵn** |

## 1. Hiện trạng (đọc trên `origin/main` 25/11)

| Việc | Ở đâu | Đang làm gì |
|---|---|---|
| Giữ hàng khi đơn Đã gửi | `modules/phieu-ban/api/order-service.ts` (`goOpen`, `updateOrderFlow`, `holdDocsOf`, `submitHolds`) | Cân giữ hàng (`rebalanceHolds` ở `modules/phieu-ban/api/domain/order.ts`): giữ được bao nhiêu chuyển bấy nhiêu từ kho bán sang kho KCB bằng chứng từ `transfer` nộp qua `ctx.ledger.submit` (số `<số đơn>-G<n>`). Thiếu thì **không chặn**, trả `meta.stockShort = [{ sku, need, have }]` |
| Tồn kho bán | `order-store.ts` → `lockedWarehouseStock` (đọc `bizcity_read.stock_on_hand`, khoá `pos:stock:<CN>:<mã>`) | Chỉ đọc kho bán của chính cửa hàng |
| Màn báo thiếu | `modules/phieu-ban/web/screens/OrderEditor.tsx` dòng ~154–225 | Khung "Giữ hàng" có huy hiệu "thiếu N" và câu "N dòng giữ chưa đủ số còn phải giao" — **không có nút làm gì tiếp**; kế toán / kho phải sang KHO01 lập tay |
| Giữ thêm khi hàng về | không có lệnh riêng | Chỉ cân lại khi **sửa đơn** (`updateOrderFlow`) — người dùng phải bấm Ghi lại đơn mới giữ thêm được |
| Phiếu chuyển kho KHO01 | `apps/api/src/phan-he/kho/phieu-chuyen-kho.ts` | Action `kho.transfer.create` (`POST /api/v1/kho/transfers`), quyền thao tác `them` của màn `kho.chuyen-kho` = `kho:chuyen-kho-lap`. Lưu = xuất; **cùng chi nhánh nhận luôn**, khác chi nhánh chờ thủ kho nhập xác nhận (`…/receive`, quyền `kho:chuyen-kho-nhan`). Không có cột nguồn — chỉ có `note`, `reasonCode` |
| Sổ chứng từ chung | `db/migrations/0158_so_chung_tu_chung.sql` | Phiếu chuyển kho vào sổ chứng từ chung với mã `kho.transfer:<id>`; đơn đặt hàng là `phieu-ban.order:<order_id>` (`modules/phieu-ban/migrations/0004_so_chung_tu.sql`) |
| Liên kết chứng từ | `ctx.documents.link(from, to, role)` (`packages/platform/src/core/actions.ts`); module đã khai `documents.links` | Chỉ ghi được liên kết **từ** chứng từ của chính module. Vai cho phép (`packages/contracts/src/doc-refs.ts`): `source, reverses, replaces, settles, attachesTo, ledger, applies, uses, adjusts` — **không có vai "liên quan"**; đúng nghĩa là `kho.transfer:<id>` —source→ `phieu-ban.order:<id>`, chiều này module không ghi được |
| Chi nhánh cha | `bizcity_read.branches.parent_code` (`db/migrations/0044_doc_danh_muc.sql`) | Cửa hàng (`level = shop`) có chi nhánh cha (kho tổng) |
| Tồn mọi kho | `bizcity_read.stock_on_hand` (`db/migrations/0109_doc_gia_ton_chi_nhanh.sql`) | Đọc được tồn theo chi nhánh × kho × mã |

## 2. Mục tiêu

Đơn đang **Đã gửi** mà kho bán thiếu hàng để giữ: kế toán bấm **Lập chuyển kho** ngay trên đơn, chọn kho có hàng, hệ thống lập phiếu KHO01 về **kho bán của đơn**, nối phiếu với đơn. Hàng về (phiếu đã nhận) thì bấm **Giữ lại hàng** để chuyển số còn thiếu sang KCB như lúc gửi đơn.

## 3. Phạm vi

| # | Việc | Ghi chú |
|---|---|---|
| 1 | Action đọc **`phieu-ban.order.transfer-sources`** `GET /api/v1/m/phieu-ban/orders/:id/transfer-sources`: với các dòng thiếu (SL còn phải giao − đang giữ > 0, bỏ dòng dịch vụ như NT-BH-035), trả tồn từng mã ở các kho **ứng viên** | Ứng viên = kho đang dùng của (a) cùng cửa hàng, khác kho bán, **trừ** kho KCB / KHG đã khai ở Cài đặt BH20; (b) chi nhánh cha (`parent_code`); (c) các cửa hàng cùng cha. Xếp: cùng cửa hàng → cha → cửa hàng anh em; trong nhóm xếp theo số mã đủ hàng giảm dần |
| 2 | Hộp thoại **Lập chuyển kho**: người dùng chọn **một kho xuất**; bảng dòng thiếu điền sẵn SL = min(thiếu, tồn kho xuất), sửa được (≤ tồn); ghi chú | Một phiếu = một kho xuất (giống KHO01). Thiếu ở nhiều kho thì lập nhiều lần |
| 3 | Action ghi **`phieu-ban.order.transfer-create`** `POST /api/v1/m/phieu-ban/orders/:id/transfers` → gọi `kho.transfer.create` qua `ctx.actions.call` với `toBranchCode` = cửa hàng của đơn, `toWarehouse` = kho bán của đơn, `note` = "Chuyển hàng cho đơn đặt hàng <số đơn>", `mode` mặc định `ship` | Quyền: gọi bằng quyền người bấm → cần `kho:chuyen-kho-lap` (thiếu thì 403 của KHO01). Action của module gác thêm `phieu-ban:write` |
| 4 | Nối phiếu với đơn (đợt này, không đổi phân hệ Kho): `note` của phiếu = "Chuyển hàng cho đơn đặt hàng <số đơn>"; lịch sử đơn thêm dòng `transfer` (số phiếu, kho xuất → kho bán, mã × SL); `body.transfers[]` của đơn giữ `{ id, docNo, from, qty }` để hiện trên form. Liên kết ở sổ chứng từ chung: Q6 | Không thêm cột vào `stock_transfer_docs` (bảng của phân hệ Kho) |
| 5 | Khung "Giữ hàng" hiện các phiếu chuyển của đơn + trạng thái (Đã xuất / Đã nhận / Từ chối / Huỷ — đọc lại `kho.transfer.get`), bấm số phiếu mở KHO01 | |
| 6 | Action **`phieu-ban.order.hold`** `POST /api/v1/m/phieu-ban/orders/:id/hold` "Giữ lại hàng": đơn Đã gửi → chạy lại `rebalanceHolds` với tồn hiện tại của kho bán → chứng từ giữ `-G<n>` như cũ | Dùng chung đường `goOpen` (không đổi trạng thái); quyền `phieu-ban:write` |
| 7 | Bản đồ lỗi R-REV-17 cho hộp thoại và hai nút | `LapChuyenKhoDialog.failure-map.json` |

Ngoài phạm vi:
- tự giữ hàng ngay khi thủ kho bấm nhận ở KHO01 (cần sự kiện từ phân hệ Kho — xem Q5);
- tự chọn kho, tự tách nhiều kho xuất;
- đơn Nháp / Chờ duyệt (chưa giữ hàng thì chưa có "thiếu");
- máy bán POS (đơn đặt hàng chỉ ở kế toán, NT-BH-023 Q9);
- "yêu cầu điều chuyển" của kiennt (khi có thì nút có thể đổi sang lập yêu cầu — không chặn phiếu này).

### Tệp sẽ chạm (dòng CLAIMS)

```
modules/phieu-ban/api/actions/order-transfer-sources.ts      (mới)
modules/phieu-ban/api/actions/order-transfer-create.ts       (mới)
modules/phieu-ban/api/actions/order-hold.ts                  (mới)
modules/phieu-ban/api/order-service.ts
modules/phieu-ban/api/order-store.ts
modules/phieu-ban/api/domain/order.ts
modules/phieu-ban/api/index.ts
modules/phieu-ban/bizcity.module.json                        (3 action mới, version 0.6.0)
modules/phieu-ban/README.md
modules/phieu-ban/web/lib.ts
modules/phieu-ban/web/screens/OrderEditor.tsx
modules/phieu-ban/web/screens/LapChuyenKhoDialog.tsx         (mới)
modules/phieu-ban/web/screens/LapChuyenKhoDialog.failure-map.json (mới)
modules/phieu-ban/test/order.test.ts
apps/api/test/nt-bh-041-chuyen-kho-don-dat-hang.test.ts      (mới)
docs/nghiem-thu/ban-hang/NT-BH-041-nut-chuyen-kho-bh20.md    (mới)
docs/nghiem-thu/ban-hang/NT-BH-023-don-dat-hang.md           (chỉ ghi chú Q8/Q12 → xem NT-BH-041)
docs/huong-dan/don-dat-hang.md
CHANGELOG.md
```

Không chạm `apps/api/src/phan-he/kho/**` (gọi action có sẵn). Không migration (đơn giữ phiếu trong `body` jsonb, liên kết ở sổ chứng từ chung).

## 4. Ca nghiệm thu

Dữ liệu chung: CN01 là chi nhánh cha (kho tổng `CN01-KT`), cửa hàng CH02 (`parent_code = CN01`) có kho bán `CH02-K1` (mặc định), KCB `CH02-KCB`, kho phụ `CH02-K2`; CH03 cũng con CN01, kho `CH03-K1`. Mã `SUA01` hộp, giá 330.000. Tồn: CH02-K1 = 4, CH02-K2 = 2, CN01-KT = 50, CH03-K1 = 8.

| Ca | Thao tác | Kết quả mong đợi |
|---|---|---|
| 1 | Đơn DH CH02 10 hộp SUA01, Gửi | Đã gửi; giữ 4 (phiếu `-G1` CH02-K1 → CH02-KCB); khung Giữ hàng "thiếu 1", nút **Lập chuyển kho** hiện |
| 2 | Bấm Lập chuyển kho | Danh sách kho: CH02-K2 (2), CN01-KT (50), CH03-K1 (8); **không** có CH02-KCB, CH02-K1. Dòng SUA01 cần 6 |
| 3 | Chọn CN01-KT, SL 6, Lưu | Phiếu KHO01 `CK26xxxxx` CN01/CN01-KT → CH02/CH02-K1 6 hộp, trạng thái **Đã xuất** (khác chi nhánh — chờ nhận); tồn CN01-KT 44; ghi chú "Chuyển hàng cho đơn đặt hàng DH…"; lịch sử đơn có dòng "Lập chuyển kho CK26xxxxx: CN01-KT → CH02-K1 SUA01 × 6"; form đơn hiện phiếu, bấm mở KHO01 |
| 4 | Bấm Giữ lại hàng trước khi kho CH02 nhận | Không có phiếu giữ mới, báo "Kho bán CH02-K1 chưa có thêm hàng (phiếu CK26xxxxx chưa nhận)" — vẫn thiếu 6 |
| 5 | Thủ kho CH02 nhận đủ ở KHO01, rồi bấm Giữ lại hàng | Phiếu `-G2` CH02-K1 → CH02-KCB 6 hộp; đang giữ 10; hết "thiếu"; nút Lập chuyển kho ẩn |
| 6 | Chọn CH02-K2 (cùng cửa hàng), SL 2 | Phiếu KHO01 cùng chi nhánh **nhận luôn**; bấm Giữ lại hàng → giữ thêm 2 |
| 7 | Nhập SL 9 khi CH03-K1 chỉ có 8 | Chặn ở ô SL trước khi gửi: "CH03-K1 chỉ còn 8" (máy chủ kiểm lại, `VALIDATION_ERROR`, `fields: lines[0].qty`) |
| 8 | Người có `phieu-ban:write` nhưng không có `kho:chuyen-kho-lap` | Nút hiện mờ kèm câu "Cần quyền Lập phiếu chuyển kho (KHO01)"; gọi thẳng API → 403 `FORBIDDEN` |
| 9 | Bấm Lưu hai lần liên tiếp | Một phiếu (khoá ý muốn `Idempotency-Key` = id đơn + số lần lập) |
| 10 | Đơn đã Đóng / Huỷ, hoặc Nháp | Không có nút; gọi API → `CONFLICT` `PHIEU_BAN_ORDER_STATE` |
| 11 | Thủ kho CH02 **từ chối nhận** phiếu ở ca 3 | Khung Giữ hàng hiện phiếu "Từ chối"; đơn vẫn thiếu 6; lập lại được |
| 12 | Dòng phí ship (dịch vụ) trên đơn | Không vào danh sách thiếu, không vào phiếu chuyển |

Bút toán: phiếu KHO01 theo luật chuyển kho hiện có (khác chi nhánh: hàng đang chuyển / phải thu nội bộ theo Quy tắc hạch toán; cùng chi nhánh cùng TK kho: không phát sinh). Đơn đặt hàng không phát sinh bút toán. Module **không** viết số tài khoản.

## 5. Câu hỏi ngược R-REV-17 (đề xuất trả lời)

| Mã | Câu | Đề xuất trả lời |
|---|---|---|
| Q-CHUNG-01 | Ai được lập chuyển kho từ đơn? | Phải có cả `phieu-ban:write` và `kho:chuyen-kho-lap`; thiếu một trong hai: nút mờ + câu nói quyền thiếu; máy chủ 403 |
| Q-CHUNG-02 | Phiếu đã xuất thì sửa / huỷ ở đâu? | Ở KHO01 (điều chỉnh / huỷ như mọi phiếu chuyển); BH20 chỉ hiện trạng thái, không sửa |
| Q-CHUNG-03 | Hai người cùng lập chuyển cho một đơn? | Khoá theo đơn (`SELECT … FOR UPDATE` đơn); người sau thấy danh sách thiếu đã tính phần **đang chuyển** của phiếu chưa nhận và cảnh báo "đã có phiếu CK… đang chuyển 6" |
| Q-CHUNG-04 | Ngày phiếu thuộc kỳ khoá? | Ngày phiếu = hôm nay; kỳ khoá thì KHO01 trả `PERIOD_LOCKED`, hộp thoại giữ nguyên dữ liệu đã nhập |
| Q-CHUNG-05 | Bấm Lưu hai lần? | Ca 9 — một phiếu |
| Q-CHUNG-06 | Ô bắt buộc? | Kho xuất, SL > 0 ít nhất một dòng; báo tại ô trước khi gửi |
| Q-CHUNG-07 | Bị từ chối có mất dữ liệu đã nhập? | Không — hộp thoại giữ nguyên, tô ô lỗi theo `error.fields` |
| Q-CHUNG-08 | Danh sách kho chỉ nhận kho nào? | Kho đang dùng, có tồn > 0 ít nhất một mã thiếu, thuộc 3 nhóm ở §3 mục 1; không thêm kho tại chỗ |
| Q-KHO-01 | Kho xuất / nhập thuộc chi nhánh nào? | Kho nhập luôn là kho bán của đơn (cửa hàng của đơn); kho xuất kiểm thuộc chi nhánh đã chọn (KHO01 kiểm lại) |
| Q-KHO-02 | Xuất quá tồn / theo lô? | Chặn SL > tồn kho xuất; lô để trống → lõi tự chọn lô hạn sớm (như KHO01) |
| Q-KHO-03 | Hàng đã xuất chưa nhận nằm ở đâu, ai nhận? | Trên TK hàng đang chuyển; thủ kho cửa hàng nhận ở KHO01; khung Giữ hàng hiện "Đang chuyển" để kế toán nhắc |
| Q-BAN-03 | Xuất quá tồn khi giao? | Không đổi — giao vẫn xuất từ KCB, đơn chỉ giao được số đang giữ (NT-BH-023) |

## 6. Câu chốt (25/11/2026 — theo phương án đề xuất)

| # | Câu | Phương án đề xuất | Phương án khác |
|---|---|---|---|
| Q1 | Kho xuất lấy từ đâu? | **Người dùng chọn** trong danh sách ứng viên: cùng cửa hàng (trừ KCB / KHG) → chi nhánh cha → cửa hàng anh em, có tồn từng mã | (b) chỉ chi nhánh cha (đúng luồng "kho tổng chia xuống shop"); (c) mọi kho của đơn vị |
| Q2 | Chuyển về kho nào? | **Kho bán của đơn**, rồi bấm "Giữ lại hàng" (dùng đúng đường giữ hàng hiện có, sổ kho rõ hai bước) | Chuyển thẳng vào KCB và tăng "đang giữ" khi nhận — gọn một bước nhưng phải nghe sự kiện nhận của Kho |
| Q3 | Một phiếu một kho xuất hay tự tách nhiều kho? | **Một kho xuất / phiếu**, lập nhiều lần nếu cần | Tự tách theo thứ tự ưu tiên ra nhiều phiếu |
| Q4 | Phiếu lập ở chế độ nào? | **Xuất luôn** (`mode: ship`, như KHO01 mặc định) | Ghi nháp để thủ kho kho xuất duyệt xuất (`mode: draft`) |
| Q5 | Giữ hàng khi phiếu đã nhận: tay hay tự động? | **Tay — nút "Giữ lại hàng"** (không đổi phân hệ Kho) | Tự động khi KHO01 nhận (cần phân hệ Kho phát sự kiện `kho.transfer.received` — việc của kiennt / Core, để phiếu sau) |
| Q6 | Nối phiếu với đơn bằng gì? | **Đợt này: ghi chú phiếu + lịch sử đơn + `body.transfers[]`** (không đổi Kho). Đợt sau: `kho.transfer.create` nhận thêm `sourceDocRef`, tự ghi liên kết `kho.transfer:<id>` —source→ `phieu-ban.order:<id>` (sửa `apps/api/src/phan-he/kho/phieu-chuyen-kho.ts` — tệp do Thủy lập, phải báo Thủy) | (b) module ghi `phieu-ban.order` —uses→ `kho.transfer` (sai nghĩa vai); (c) thêm cột nguồn vào `stock_transfer_docs` |
| Q7 | Người không có quyền KHO01 thì sao? | **Nút mờ + câu nói quyền thiếu** | Ẩn nút |
| Q8 | Số phiếu | NT-BH-041 | — |

## 7. Kết quả làm (25/11/2026) <!-- [2026-11-25 Võ Hoàng] NGHIEM-THU — NT-BH-041: code xong, ghi kết quả (đóng góp) -->

| Ca | Kết quả | Test |
|---|---|---|
| 1, 12 | Đạt — giữ 4 (`-G1`), `holdShort` = SUA01 cần 6; dòng phí ship (dịch vụ) không vào danh sách thiếu | `apps/api/test/nt-bh-041-chuyen-kho-don-dat-hang.test.ts` |
| 2 | Đạt — CH02-K2 (2) → CN01-KT (50) → CH03-K1 (8); không có kho bán, KCB, KHG | như trên |
| 3 | Đạt — KHO01 `CK26xxxxx` Đã xuất, tồn CN01-KT 44, ghi chú + lịch sử "Lập chuyển kho CK…: CN01-KT → CH02-K1 SUA01 × 6", đơn hiện phiếu (link mở màn KHO01) | như trên |
| 4 | Đạt — không phiếu giữ mới, `meta.holdNothing` "Kho bán CH02-K1 chưa có thêm hàng (phiếu CK… chưa nhận)" | như trên |
| 5 | Đạt — nhận ở KHO01 → Giữ lại hàng → `-G2` 6, đang giữ 10, hết thiếu | như trên |
| 6 | Đạt — CH02-K2 cùng chi nhánh nhận luôn; Giữ lại hàng giữ thêm 2 | như trên |
| 7 | Đạt — `VALIDATION_ERROR`, `error.fields` `lines[0].qty` "CH03-K1 chỉ còn 8"; màn báo tại ô trước khi gửi | như trên + `modules/phieu-ban/test/order.test.ts` |
| 8 | Đạt — `canCreate` false, nút mờ "Cần quyền Lập phiếu chuyển kho (KHO01)"; module và KHO01 đều 403 | như trên |
| 9 | Đạt một phần — nút khoá khi gửi; người khác lập cùng lúc → `CONFLICT` `PHIEU_BAN_ORDER_STATE` (`cause: transfer_busy`); gửi lại bước nối không nối hai lần. Khoá ý muốn `Idempotency-Key` = id đơn + số lần lập cho lệnh KHO01 **chưa làm được**: `useApi()` của `@bizcity/ui-kit` không nhận khoá do màn truyền (mỗi lời gọi một khoá mới) | như trên |
| 10 | Đạt — Nháp / Đã đóng: không nút; API `CONFLICT` `PHIEU_BAN_ORDER_STATE` | như trên |
| 11 | Đạt — KHO01 từ chối → khung Giữ hàng hiện "Từ chối", vẫn thiếu 6, lập lại được | như trên |

**Lệch so với §3 dòng 3 (báo người chốt):** `ctx.actions.call` của Platform chỉ gọi action **đọc** (`callAction` từ chối action ghi) nên module không gọi được `kho.transfer.create`. Làm theo cách không đổi Kernel / Platform / phân hệ Kho: action `phieu-ban.order.transfer-create` có ba bước — `prepare` (khoá đơn, kiểm quyền `kho:chuyen-kho-lap`, kho ứng viên, SL ≤ tồn; giữ chỗ "đang lập"; trả khuôn phiếu KHO01), màn gọi `POST /api/v1/kho/transfers` bằng phiên người bấm, rồi `record` (nối phiếu vào đơn) hoặc `abort` (KHO01 từ chối). Trạng thái hiện tại của phiếu màn đọc ở `GET /api/v1/kho/transfers/:id` (không có action `kho.transfer.get`).

**Ghi nhận khác:** KHO01 ghi sổ với `force` nên kỳ khoá **không** chặn phiếu chuyển (Q-CHUNG-04 dự kiến `PERIOD_LOCKED`) — hành vi sẵn có của phân hệ Kho, không sửa trong phiếu này. KHO01 chưa mở thẳng được một phiếu theo số (link chỉ mở màn danh sách).
