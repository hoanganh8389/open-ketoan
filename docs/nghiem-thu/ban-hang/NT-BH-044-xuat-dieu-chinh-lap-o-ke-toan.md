# NT-BH-044 · BH06 Phiếu xuất điều chỉnh — lập phiếu ở kế toán (module mới `xuat-dieu-chinh`)
<!-- [2026-11-26 10:15 AM Võ Hoàng] NGHIEM-THU — lập phiếu NT-BH-044, ghi chốt của anh Hoàng 26/11 (9 mục + bổ sung quyền thu ngân) (đóng góp) -->
<!-- [2026-11-26 10:25 AM Võ Hoàng] NGHIEM-THU — ghi chốt 15 câu C1–C15 (anh Hoàng chốt 26/11); cập nhật phạm vi, ca nghiệm thu, câu hỏi ngược (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng — module **mới** `modules/xuat-dieu-chinh/` (sẽ tạo bằng `npx bizcity module new xuat-dieu-chinh --label "Phiếu xuất điều chỉnh"`, ADR-0024); ghi sổ qua Core (`ctx.ledger.submit` / `ctx.ledger.cancel`) |
| Màn hình | BH06 Phiếu xuất điều chỉnh — màn mới ở module (đường dẫn `/app/xuat-dieu-chinh`, sẽ tạo): danh sách + form lập + in 02-VT. Màn cũ `/ban-hang/xuat-dieu-chinh` (`apps/web/src/features/documents/ExportAdjustPage.tsx`) bỏ khỏi menu, đường dẫn chuyển hướng sang màn mới |
| Ngày tạo | 26/11/2026 |
| Trạng thái | **Đã chốt 26/11/2026** (anh Hoàng chốt 26/11 — 9 mục §5, bổ sung quyền thu ngân, 15 câu C1–C15 ở §8 "Đã chốt 26/11") · **chưa code** |
| Căn cứ | Quyết định của anh Hoàng 26/11 (§5); câu trả lời chung đã chốt 25/11 (Q-CHUNG: tách quyền, ẩn nút + máy chủ 403, bấm hai lần một kết quả bằng `Idempotency-Key`, báo tại ô và báo hết một lần, rời form khi chưa lưu thì hỏi, danh sách chọn chỉ mục đang dùng); AGENTS.md (ADR-0024, R-FLOW, R-REV-17, đăng ký quyền); `docs/standard/DANG-KY-QUYEN.md`; hướng dẫn màn cũ `docs/huong-dan/export-adjust.md` |

## 1. Hiện trạng (đọc trên `origin/main` 26/11)

| Việc | Ở đâu | Đang làm gì |
|---|---|---|
| Lập phiếu ở máy bán | open-pos `tgs_pos/react/src/features/khoTonXuat/AdjustmentExportPage.tsx` (repo khác) | Danh sách + "+ Tạo phiếu mới": lý do (mặc định XSD1), ghi chú, dòng mã + SL + ĐVT (chọn đơn vị quy đổi). Lưu = duyệt và trừ kho ngay; **không** duyệt, **không** huỷ. Ghi vào sổ của website |
| Đẩy sang kế toán | `tgs_accounting_bridge/includes/class-tgs-acc-mapper.php` → `export_adjust()` (repo khác) | Phiếu **0 đ** → chứng từ `stock_adjustment` `direction: decrease`, `purposeCode` tra từ lý do bằng bảng `PURPOSE_OF_REASON` **nằm trong cầu nối PHP** (XSD1 → DUNG-BH, XHH01 → HUY, XMKT1 → TANG-KH…), giá trị = giá vốn bình quân lúc tính giá vốn tháng. Phiếu **có giá** → `sale` nội bộ (`internalOnly`, không hoá đơn). `sourceRef.type = export_adjust`, `reasonCode` làm nhãn |
| Màn BH06 ở kế toán | `apps/web/src/features/documents/ExportAdjustPage.tsx`, mẫu in `apps/web/src/features/documents/ExportAdjustPrint.tsx` (02-VT, `apps/web/src/components/print/forms.tsx`) | Chỉ danh sách + in. Lọc `docType: 'sale'` + `sourceType: 'export_adjust'` → **phiếu 0 đ (`stock_adjustment`) — phần lớn phiếu — không hiện** (lỗi, sửa ở phiếu này) |
| Route / menu màn cũ | `apps/web/src/pages.tsx` (dòng 134), `apps/web/src/phan-he/ban-hang/menu.ts` (mục `bh-xuat-dieu-chinh`), `apps/web/src/layout/menu-gon.ts`, `apps/web/src/layout/so-do-nhom.ts`, `apps/web/src/layout/ten-man.ts`, `apps/web/src/phan-he/ban-hang/quy-trinh/QuyTrinhBanHang.tsx` | Đều trỏ `/ban-hang/xuat-dieu-chinh` |
| Báo cáo dùng nhãn `export_adjust` | `apps/api/src/phan-he/mua-hang/bao-cao-kho.ts` (cột "xuất điều chỉnh"), `apps/api/src/phan-he/ke-toan/reports/report.repository.ts`, test `apps/api/test/sales-report.test.ts` (không tính vào báo cáo bán hàng) | Nhận phiếu theo `sourceRef.type = export_adjust` → phiếu lập ở module mới **phải giữ** nhãn này |
| Lý do xuất | `db/seeds/ly-do.jsonl` | Lý do `kind: out`: XSD1, XSD2, XTA…, XHH01 / 02 / 03, XMKT1, XDT_641 / 642, XKK, XDC… |
| Mục đích xuất | bảng `stock_purposes` (`db/migrations/0140_quy_tac_hach_toan.sql`), luật `packages/kernel/src/modules/posting/rules/stock.rule.ts` | Phiếu giảm kho: TK đối ứng = TK của **mục đích** (`purposeCode`); không có mục đích → TK hàng thiếu chờ xử lý (1381). **Core không có ánh xạ lý do → mục đích** (ánh xạ chỉ có trong cầu nối PHP) — xem §6 |
| Huỷ chứng từ | `ctx.ledger.cancel` (năng lực `ledger.cancel` available, `docs/standard/bizcity-standard.json`) | Huỷ = bút toán đảo |

## 2. Mục tiêu

Kế toán (và cửa hàng — §5 mục 7) **lập phiếu xuất điều chỉnh ngay ở open-ketoan**, một chỗ lập duy nhất: chọn kho, lý do, dòng hàng (lô / hạn dùng), Lưu là ghi sổ và trừ kho; huỷ được bằng bút toán đảo. Danh sách BH06 hiện **đủ** cả phiếu 0 đ và phiếu có giá. Máy bán POS về sau gọi cùng action (PR open-pos riêng).

## 3. Phạm vi

| # | Việc | Ghi chú |
|---|---|---|
| 1 | Tạo module `xuat-dieu-chinh` bằng `npx bizcity module new`; manifest khai màn BH06 ở `extensions.screens[]`, quyền §4, `ledger.submits` = `stock_adjustment` + `sale` (`bizcity_ledger_intake@1`), lý do cần (`ledger.submits[].reasons`) | Không sửa Kernel, `packages/*`, module khác |
| 2 | Bảng của module (migration trong modules/xuat-dieu-chinh/migrations/ — sẽ tạo): phiếu + dòng (kho, mã, ĐVT, SL, lô, hạn dùng, đơn giá), trạng thái **Nháp / Đã ghi sổ / Đã huỷ**, người nhận, nhân viên, diễn giải, lý do huỷ | Nháp chỉ ở bảng module, chưa vào sổ |
| 3 | Action ghi `xuat-dieu-chinh.phieu.save` (lưu nháp / ghi sổ) — ghi sổ: không có giá → `stock_adjustment` `direction: decrease`, `reasonCode` theo lý do, `amount: 0` (Kernel tính giá trị theo giá vốn lúc tính giá vốn tháng); có giá → `sale` `internalOnly: true` (không hoá đơn điện tử). `sourceRef = { type: 'export_adjust', id, label: 'Phiếu xuất điều chỉnh' }`, `docKey` tiền tố `xuat-dieu-chinh:` | Module **không** gửi số tài khoản, **không** tính giá vốn. `purposeCode`: §6 |
| 4 | Action `xuat-dieu-chinh.phieu.cancel`: lý do huỷ bắt buộc → `ctx.ledger.cancel` (bút toán đảo); kỳ khoá → chặn | Quyền riêng `xuat-dieu-chinh:phieu-huy` |
| 5 | Action đọc `xuat-dieu-chinh.phieu.list` / `.get`: danh sách gồm **cả** `stock_adjustment` lẫn `sale` có `sourceRef.type = export_adjust` (kể cả phiếu cũ do cầu nối gửi) + nháp của module | Sửa lỗi "phiếu 0 đ không hiện" |
| 6 | Action đọc lý do chọn được (mọi lý do `kind: out` đang dùng **trừ** lý do đã có màn riêng: XBA, XBB, XCKho, XKK, XCN, XCN3, XNB*; "đủ tài khoản" theo `GET /api/v1/posting/reasons/readiness` — C3 / C13) và kho chọn được (kho đang dùng của chi nhánh, mặc định kho bán K1, chọn được kho quà KKM), tồn từng mã × kho × lô, giá gợi ý từ bảng giá (C8) | |
| 7 | Màn BH06 trong module: danh sách (lọc ngày, chi nhánh, trạng thái, loại 0 đ / có giá), form lập (§5 mục 9), **Lưu nháp**, **Lưu** (ghi sổ), **Huỷ phiếu**, **In 02-VT** | Mẫu in dựng trong module (module không import `apps/web`), bố cục như `ExportAdjustPrint.tsx` |
| 8 | Bản đồ lỗi R-REV-17 cạnh form (`<Form>.failure-map.json`, sẽ tạo) + test từng dòng chặn | SC-UI-2 / SC-UI-3 |
| 9 | Màn cũ: bỏ mục menu BH06 cũ; route `/ban-hang/xuat-dieu-chinh` chuyển hướng `/app/xuat-dieu-chinh`; các lối tắt (menu gọn, sơ đồ nhóm, tên màn, quy trình bán hàng) trỏ đường mới | Tệp core — chỉ đổi đường dẫn / chuyển hướng |
| 10 | Hướng dẫn `docs/huong-dan/xuat-dieu-chinh.md` (sẽ tạo); `docs/huong-dan/export-adjust.md` ghi "đã chuyển sang màn mới" | |
| 11 | Bảng ánh xạ **lý do → mã mục đích** trong module (chỉ mã, không tài khoản — như `PURPOSE_OF_REASON` của cầu nối), dùng gửi `purposeCode` cho phiếu 0 đ | C2; kèm đề xuất Core mức 4 (§6 P1) |
| 12 | Phiếu đã ghi sổ: không sửa — chỉ **Huỷ** và **Chép thành phiếu mới** (mở form nháp mới cùng nội dung). Nháp: người lập hoặc kế toán sửa / xoá; kiểm phiên bản khi lưu | C5 / C6 |
| 13 | Phiếu có giá: đơn giá gợi ý từ bảng giá (sửa được), thuế GTGT theo danh mục hàng, dưới giá vốn **cảnh báo** (không chặn, ghi log), **bắt buộc người nhận**, ghi công nợ 131 cho người nhận | C8 / C9 |
| 14 | Số phiếu theo sổ chứng từ chung (NT-BH-033), tiền tố `XDC-<mã chi nhánh>-` | C15 |
| 15 | Hộp chọn mặt hàng / lý do: người có quyền danh mục / quy tắc hạch toán được thêm tại chỗ qua action của chủ danh mục; người khác chỉ chọn | C7 |

Ngoài phạm vi:
- màn POS gọi action mới và vé POS mang quyền mới — PR open-pos riêng, **sau** phiếu này (§5 mục 8);
- sửa Kernel (ánh xạ lý do → mục đích, nếu cần) — đề xuất mức 4, §6;
- duyệt phiếu (Lưu = ghi sổ, không có bước duyệt).

### Tệp sẽ chạm (dòng CLAIMS)

```
modules/xuat-dieu-chinh/**                                   (mới — manifest, api, web, migrations, test, examples)
apps/api/test/nt-bh-044-*.test.ts                            (mới)
docs/nghiem-thu/ban-hang/NT-BH-044-xuat-dieu-chinh-lap-o-ke-toan.md
docs/huong-dan/xuat-dieu-chinh.md                            (mới)
docs/huong-dan/export-adjust.md                              (ghi đã chuyển)
apps/web/src/features/documents/ExportAdjustPage.tsx         (bỏ / giữ làm chuyển hướng)
apps/web/src/pages.tsx                                       (route cũ → chuyển hướng)
apps/web/src/phan-he/ban-hang/menu.ts                        (bỏ mục BH06 cũ)
apps/web/src/layout/menu-gon.ts                              (đổi đường dẫn)
apps/web/src/layout/so-do-nhom.ts                            (đổi đường dẫn)
apps/web/src/layout/ten-man.ts                               (đổi đường dẫn)
apps/web/src/phan-he/ban-hang/quy-trinh/QuyTrinhBanHang.tsx  (đổi đường dẫn)
CHANGELOG.md
```

Các tệp core trên **không** nằm trong dòng giữ chỗ nào trên `origin/main` (26/11). Tệp **đang có người giữ**, phiếu này **không** chạm: `apps/web/src/layout/useAppMenu.ts` (dòng NT-HT-003) — menu của module tự gom qua manifest nên không cần sửa. `apps/web/src/features/documents/ExportAdjustPrint.tsx` giữ nguyên (phiếu cũ vẫn in được từ Chứng từ).

## 4. Quyền

Luật 4 của `docs/standard/DANG-KY-QUYEN.md` buộc tên `<module>:<chức-năng>-<việc>`, nên ba quyền chốt (`xuat-dieu-chinh:xem / lap / huy`) **đổi tên** thêm chức năng `phieu`:

| Quyền | Nhãn | Vai trò mặc định (`roles`) | `risk` |
|---|---|---|---|
| `xuat-dieu-chinh:phieu-xem` | Phiếu xuất điều chỉnh — xem, in | `owner`, `chief_accountant`, `accountant`, `staff` (C1 — theo chi nhánh được gán) | low |
| `xuat-dieu-chinh:phieu-lap` | Phiếu xuất điều chỉnh — lập, lưu nháp, ghi sổ | `owner`, `chief_accountant`, `accountant`, `staff` (C1 — theo chi nhánh được gán) | low |
| `xuat-dieu-chinh:phieu-huy` | Phiếu xuất điều chỉnh — huỷ (bút toán đảo) | `owner`, `chief_accountant`, `accountant` | high |

- **Quản lý cửa hàng**, **thu ngân / nhân viên bán hàng**: không có khoá vai trò hệ thống riêng (`packages/contracts/src/enums.ts` chỉ có `owner, chief_accountant, accountant, viewer, developer, auditor, staff`); đó là vai trò của đơn vị gán **tại chi nhánh** trên nền `staff` / `viewer` (DANG-KY-QUYEN §7). Chốt: cả hai có **xem + lập**, **không** có huỷ. **Chốt C1:** khai `staff` vào `roles` mặc định của `phieu-xem` + `phieu-lap`, giới hạn theo chi nhánh được gán; muốn bớt thì gỡ ở HT12.
- Gán lại vai trò sửa được ở HT12 (màn module tự lên sổ màn, H13).
- Mỗi action khai `permission`; action ghi `idempotency: 'required'`; action theo mã phiếu khai `branchOf` (H14). Giao diện ẩn nút bằng `useCan()`; máy chủ vẫn 403.
- **Vé đăng nhập máy POS** (open-pos `default_perms`): khi màn POS chuyển sang gọi action mới (PR open-pos riêng) thì vé mang thêm `xuat-dieu-chinh:phieu-xem` + `xuat-dieu-chinh:phieu-lap` (không có `phieu-huy`). Vé nhận được quyền do module khai (`apps/api/src/modules/auth/wp-sso.ts`, POS-W1).

## 5. Chốt (anh Hoàng chốt 26/11)

| # | Câu | Chốt |
|---|---|---|
| 1 | Màn ở đâu? | Module mới modules/xuat-dieu-chinh/ (sẽ tạo bằng `npx bizcity module new`), mã màn BH06; module giữ danh sách + form lập + in. Màn core cũ bỏ mục menu, route chuyển hướng sang màn mới. Danh sách hiện **cả** phiếu 0 đ và phiếu có giá |
| 2 | Chứng từ vào sổ | Giống cầu nối: không giá → `stock_adjustment` giảm, mục đích theo lý do, giá trị theo giá vốn (Kernel tính; module không gửi tài khoản / giá vốn); có giá → bán nội bộ (không hoá đơn điện tử). Nộp qua `ctx.ledger.submit` với docType có sẵn + `reasonCode`. Thiếu năng lực Core thì ghi rõ, đánh dấu **đề xuất mức 4**, không vá Kernel trong module |
| 3 | Lưu | Lưu = ghi sổ và trừ kho ngay; thêm nút **Lưu nháp** |
| 4 | Huỷ | Được huỷ: bút toán đảo, quyền riêng, bắt buộc lý do huỷ; kỳ đã khoá thì chặn |
| 5 | Lý do | Mã lý do `kind: out` của gói định khoản, mặc định XSD1, chỉ lý do đã khai đủ tài khoản |
| 6 | Kho | Chọn kho của chi nhánh, mặc định kho bán (K1), chọn được kho quà (KKM); chặn xuất quá tồn |
| 7 | Quyền | Xem / lập / huỷ (tên theo §4). Mặc định: kế toán, kế toán trưởng, chủ đơn vị đủ ba; quản lý cửa hàng xem + lập. **Bổ sung 26/11:** nhân viên bán hàng POS (thu ngân, cấp thấp nhất) cũng xem + lập, không huỷ; vé POS mang thêm hai quyền này khi màn POS gọi action mới. Huỷ chỉ kế toán / kế toán trưởng / chủ đơn vị. Gán lại ở HT12 |
| 8 | Máy bán POS | Về sau màn POS gọi action mới (PR open-pos riêng, sau phiếu này); phiếu về website qua bản sao sổ như phiếu bán. **Một chỗ lập** |
| 9 | Trường | Người nhận / nhân viên (không bắt buộc), diễn giải, lô / hạn dùng từng dòng, in 02-VT như hiện nay |

## 6. Phụ thuộc Core (đề xuất mức 4 nếu thiếu)

| # | Cần | Hiện có trên `main` | Đề xuất |
|---|---|---|---|
| P1 | Phiếu 0 đ cần `purposeCode` để TK đối ứng đúng lý do (XSD1 → 64128…) | Core **không** suy mục đích từ lý do; ánh xạ chỉ có trong cầu nối PHP (`PURPOSE_OF_REASON`). Không gửi `purposeCode` → bút toán rơi vào TK thiếu chờ xử lý (1381) | **Đề xuất mức 4** (VERSIONING §5): Core tra mục đích xuất theo lý do (vd cột mục đích ở lý do, hoặc mục đích khai theo mã lý do) khi chứng từ `stock_adjustment` có `reasonCode` mà không có `purposeCode`. **Chốt C2:** trong lúc chờ, module giữ bảng lý do → mã mục đích (chỉ mã) và gửi `purposeCode`; khi Core tự suy được thì bỏ bảng |
| P2 | Đọc danh sách chứng từ theo `sourceRef.type` gồm hai docType | `ctx.ledger.query` có trong SDK; chưa kiểm lọc được `sourceRef.type` + nhiều docType | Kiểm khi code; không lọc được → đề xuất mức 4, không đọc thẳng bảng sổ |
| P3 | Tồn theo kho × lô để chặn quá tồn | `bizcity_read.stock_on_hand` (khung nhìn đọc) | Dùng khung nhìn có sẵn |

## 7. Ca nghiệm thu

Dữ liệu chung: cửa hàng CH02, kho bán `CH02-K1` (mặc định), kho quà `CH02-KKM`. Mã `SUA01` (hộp; thùng = 24 hộp), lô `L01` HSD 30/06/2027 tồn 10 hộp ở CH02-K1, lô `L02` HSD 31/12/2027 tồn 5 hộp; `QUA01` tồn 3 ở CH02-KKM. Lý do XSD1 (đã khai đủ), XHH01 (đã khai đủ), `XTEST` (`kind: out`, chưa khai tài khoản). Kỳ 10/2026 đã khoá.

| Ca | Thao tác | Kết quả mong đợi |
|---|---|---|
| 1 | Kế toán mở BH06, bấm Thêm | Form: chi nhánh đang làm việc, kho mặc định CH02-K1, lý do mặc định XSD1, ngày mặc định hôm nay; kế toán chọn được ngày lùi trong kỳ chưa khoá (C4) |
| 2 | Lập phiếu 0 đ: XSD1, CH02-K1, SUA01 × 2 hộp lô L01, Lưu | Chứng từ `stock_adjustment` `decrease`, `reasonCode` XSD1, `sourceRef.type = export_adjust`, `amount` 0; tồn CH02-K1 lô L01 còn 8; trạng thái Đã ghi sổ. Sau khi tính giá vốn tháng: Nợ TK của mục đích theo XSD1 / Có TK kho, giá trị = 2 × giá vốn bình quân |
| 3 | Lập phiếu có giá: SUA01 × 1, lý do XTA, người nhận KH001 | Đơn giá gợi ý 330.000 từ bảng giá (sửa được), thuế GTGT theo danh mục hàng; chứng từ `sale` `internalOnly: true`, không hoá đơn điện tử, không vào báo cáo bán hàng (như `sales-report.test.ts`); công nợ 131 cho KH001; tồn trừ 1 |
| 4 | SUA01 × 11 hộp lô L01 (tồn 10) | Chặn tại ô SL trước khi gửi "CH02-K1 lô L01 chỉ còn 10"; máy chủ kiểm lại → `VALIDATION_ERROR`, `fields: lines[0].qty`; không có chứng từ |
| 5 | Chọn ĐVT thùng, SL 1 (= 24 hộp, tồn 15) | Chặn như ca 4, câu báo quy ra hộp |
| 6 | Chọn kho CH02-KKM, QUA01 × 2 | Ghi sổ, tồn KKM còn 1 |
| 7 | Bấm **Lưu nháp** | Phiếu trạng thái Nháp ở danh sách; **không** có chứng từ trong sổ, tồn không đổi; mở lại sửa được, bấm Lưu thì ghi sổ |
| 8 | Bấm Lưu hai lần liên tiếp (hoặc mạng gửi lại) | Một chứng từ (`Idempotency-Key`); lần hai trả đúng kết quả lần một |
| 9 | Kế toán huỷ phiếu ca 2, nhập lý do "Lập nhầm" | Bút toán đảo (`ctx.ledger.cancel`), tồn L01 về 10, trạng thái Đã huỷ, lịch sử ghi người huỷ + lý do |
| 10 | Huỷ mà bỏ trống lý do huỷ | Báo tại ô "Nhập lý do huỷ"; không gửi |
| 11 | Huỷ một phiếu ngày 15/10/2026 (kỳ đã khoá) | Chặn `PERIOD_LOCKED`, câu báo kỳ đã khoá; phiếu giữ nguyên |
| 12 | Người không có `xuat-dieu-chinh:phieu-lap` (vai trò chỉ xem) | Không thấy nút Thêm / Lưu; gọi thẳng action → 403 `FORBIDDEN` |
| 13 | Thu ngân (nền `staff`, vai trò cửa hàng tại CH02) mở BH06 | Lập được phiếu ở CH02; **không thấy nút Huỷ**; gọi thẳng action huỷ → 403 `FORBIDDEN`; lập cho CH03 → 403 `BRANCH_OUT_OF_SCOPE` |
| 14 | Quản lý cửa hàng CH02 | Xem + lập như ca 13, không huỷ |
| 15 | Danh sách BH06 tháng 11 có 3 phiếu 0 đ (1 từ cầu nối cũ, 2 lập ở module) và 1 phiếu có giá | Hiện đủ **4** phiếu, cột Loại "0 đ" / "Có giá"; tổng tiền đúng |
| 16 | Mở đường cũ `/ban-hang/xuat-dieu-chinh` | Chuyển sang `/app/xuat-dieu-chinh`; menu Bán hàng không còn mục BH06 cũ, mục BH06 mới hiện từ module |
| 17 | Dòng có lô / hạn dùng | Chọn lô trong danh sách lô còn tồn của kho, hạn dùng điền theo lô; chứng từ mang `lotNo` + `expDate`; in 02-VT có cột lô / HSD |
| 18 | Tích hai phiếu, bấm In | Mẫu 02-VT (phiếu xuất kho) như hiện nay: chi nhánh — kho, lý do + diễn giải, người nhận, dòng hàng |
| 19 | Danh sách lý do trong form | Mọi lý do `kind: out` đang dùng, đủ tài khoản theo readiness; **không** có XBA, XBB, XCKho, XKK, XCN, XCN3, XNB*, `XTEST`; gửi thẳng XKK hoặc `XTEST` qua API → `VALIDATION_ERROR` `fields: reasonCode` |
| 20 | Danh sách kho / mặt hàng | Chỉ kho đang dùng của chi nhánh phiếu; chỉ mặt hàng đang dùng |
| 21 | Rời form khi đang nhập dở | Hỏi "Bỏ thay đổi chưa lưu?" |
| 22 | Gửi phiếu thiếu kho, thiếu dòng, SL 0 | Báo **hết** các ô lỗi một lần, tô / cuộn tới ô đầu |
| 23 | Phiếu có giá bỏ trống người nhận | Báo tại ô Người nhận; máy chủ `VALIDATION_ERROR` `fields: partnerCode` |
| 24 | Phiếu có giá, đơn giá nhập 1.000 (dưới giá vốn) | Cảnh báo "Dưới giá vốn", **vẫn lưu được**; nhật ký ghi lần lưu dưới giá vốn |
| 25 | Dòng SUA01 × 12 hộp để trống lô | Tự lấy lô hạn sớm nhất: L01 × 10 + L02 × 2 (như bán hàng); chọn L02 cụ thể thì chỉ trừ L02 |
| 26 | SL 1,5 hộp với ĐVT không cho số lẻ | Chặn tại ô SL; ĐVT cho phép số lẻ theo danh mục thì lưu được |
| 27 | Phiếu làm SUA01 xuống dưới tồn tối thiểu | Không cảnh báo min / max; chỉ chặn quá tồn (ca 4) |
| 28 | Mở phiếu đã ghi sổ | Không có nút Sửa; có **Huỷ** (nếu có quyền) và **Chép thành phiếu mới** → form nháp mới cùng nội dung, chưa vào sổ |
| 29 | A và B cùng mở một nháp; A lưu trước, B lưu sau | B nhận `CONFLICT` (kiểm phiên bản), câu báo "Phiếu đã được người khác sửa — tải lại"; nháp của A giữ nguyên |
| 30 | Thu ngân sửa / xoá nháp do kế toán lập | 403 `FORBIDDEN`; người lập hoặc kế toán sửa / xoá được |
| 31 | Thu ngân (vé POS) lập phiếu | Ngày phiếu chỉ hôm nay; gửi ngày lùi → `VALIDATION_ERROR` `fields: docDate` |
| 32 | Kế toán gõ mã hàng chưa có trong hộp chọn | Hộp chọn có "Thêm mặt hàng" (action của danh mục mặt hàng); người không có quyền danh mục không thấy lựa chọn này |
| 33 | Huỷ phiếu cũ do cầu nối gửi (`sourceSystem` btsoft, `sourceRef.type = export_adjust`) | Huỷ được, cùng luật (quyền `phieu-huy`, lý do huỷ, kỳ khoá chặn) → bút toán đảo |
| 34 | Số phiếu | Theo sổ chứng từ chung, dạng `XDC-CH02-…` |
| 35 | Phiếu 0 đ lý do XHH01 | Chứng từ mang `purposeCode` HUY (bảng ánh xạ của module); bút toán Nợ TK của mục đích HUY / Có kho |

Bút toán: do Kernel dựng theo docType + lý do + mục đích; module **không** viết số tài khoản. Phiếu 0 đ có giá trị khi tính giá vốn tháng.

## 8. Câu hỏi ngược R-REV-17

In bằng `node ../bizcity-platform/tools/failure-check.mjs --questions chung,kho,ban`. Trả lời theo chốt §5, câu chung đã chốt 25/11 và 15 câu anh Hoàng chốt 26/11 (bảng "Đã chốt 26/11" bên dưới).

| Mã | Câu | Trả lời |
|---|---|---|
| Q-CHUNG-01 | Ai được thêm / sửa / xoá / duyệt? Không đủ quyền thì sao? | Ba quyền §4 tách xem / lập / huỷ; không quyền → **ẩn nút**, máy chủ 403 `FORBIDDEN` (chung 25/11). Không có duyệt |
| Q-CHUNG-02 | Chứng từ đã ghi sổ thì sửa, xoá ra sao? | Không sửa; chỉ **Huỷ** (bút toán đảo, quyền riêng, bắt buộc lý do huỷ — §5 mục 4) và **Chép thành phiếu mới**. Nháp: người lập hoặc kế toán sửa / xoá (C5) |
| Q-CHUNG-03 | Hai người cùng sửa một chứng từ? | Phiếu đã ghi sổ không sửa. Hai người sửa một nháp: người lưu sau nhận `CONFLICT` (kiểm phiên bản), tải lại (C6, ca 29) |
| Q-CHUNG-04 | Ngày thuộc kỳ khoá? | Mặc định hôm nay; kế toán chọn được ngày lùi trong kỳ chưa khoá, thu ngân (vé POS) chỉ hôm nay (C4). Ngày thuộc kỳ khoá: báo tại ô Ngày, máy chủ `PERIOD_LOCKED`. Huỷ trong kỳ khoá: chặn (§5 mục 4) |
| Q-CHUNG-05 | Bấm Lưu hai lần? | Một chứng từ, `Idempotency-Key` (chung 25/11, ca 8) |
| Q-CHUNG-06 | Ô bắt buộc? | Chi nhánh, kho, lý do, ngày, ít nhất một dòng có mã + SL > 0; phiếu có giá: **người nhận** (C9); huỷ: lý do huỷ. Phiếu 0 đ: người nhận / nhân viên không bắt buộc. Báo tại ô, báo hết một lần (chung 25/11) |
| Q-CHUNG-07 | Thoát giữa chừng / bị từ chối có mất dữ liệu? Có nháp? | Có **Lưu nháp** (§5 mục 3); rời form chưa lưu thì hỏi (chung 25/11); bị từ chối thì form giữ nguyên, tô ô theo `error.fields` |
| Q-CHUNG-08 | Danh sách chọn nhận giá trị nào? Thêm tại chỗ? | Chỉ mục đang dùng (chung 25/11): kho của chi nhánh phiếu, lý do theo C3 / C13, mặt hàng đang dùng. Thêm tại chỗ: chỉ người có quyền danh mục / quy tắc hạch toán, qua action của chủ danh mục; người khác chỉ chọn (C7) |
| Q-BAN-01 | Giá bán lấy từ đâu? Dưới giá vốn? | Gợi ý từ bảng giá, sửa được; dưới giá vốn cảnh báo, không chặn, ghi log (C8) |
| Q-BAN-02 | Hạn mức công nợ khách? | Phiếu có giá bắt buộc người nhận, ghi công nợ 131 cho người đó (C9) |
| Q-BAN-03 | Xuất quá tồn? Âm kho? | Chặn xuất quá tồn (§5 mục 6), theo kho × lô |
| Q-BAN-04 | Thông tin hoá đơn điện tử? | Không áp: phiếu có giá là bán nội bộ, **không** hoá đơn điện tử (§5 mục 2) |
| Q-BAN-05 | Trả hàng / giảm giá sau bán? | Không có trả hàng cho phiếu này; sai thì huỷ (bút toán đảo) và lập lại |
| Q-KHO-01 | Kho thuộc chi nhánh của chứng từ? Kho ngừng dùng? | Chỉ kho đang dùng của chi nhánh phiếu, mặc định K1, chọn được KKM (§5 mục 6); máy chủ kiểm lại |
| Q-KHO-02 | Xuất trước ngày nhập, quá tồn theo lô / HSD? | Chặn quá tồn theo lô, chỉ vào dòng (`lines[i].qty`). Lô để trống: tự lấy lô hạn sớm nhất như bán hàng; chọn được lô cụ thể (C10) |
| Q-KHO-03 | Hàng đi đường chưa nhận? | Không áp (phiếu xuất một đầu, không chuyển kho) |
| Q-KHO-04 | Quy đổi ĐVT lệch, số lẻ? | Chọn ĐVT quy đổi của mặt hàng như màn POS; SL quy về đơn vị gốc để kiểm tồn (ca 5). Số lẻ chỉ khi ĐVT cho phép theo danh mục, không thì báo tại ô SL (C11) |
| Q-KHO-05 | Tồn tối thiểu / tối đa? | Không cảnh báo min / max ở BH06; chỉ chặn quá tồn (C12) |
| Q-KHO-06 | Điều chỉnh cần lý do gì, ai duyệt? Chặn "điều chỉnh cho khớp"? | Lý do bắt buộc (mặc định XSD1), không có bước duyệt (Lưu = ghi sổ). Không chọn được lý do đã có màn riêng (XKK kiểm kê, XCKho chuyển kho, XBA / XBB bán, XCN, XCN3, XNB*) (C13) |

### Đã chốt 26/11 (anh Hoàng chốt 26/11)

| Mã | Câu | Chốt |
|---|---|---|
| C1 | Thu ngân / quản lý cửa hàng không có khoá vai trò hệ thống — khai mặc định thế nào? | Khai `staff` vào `roles` mặc định của `phieu-xem` + `phieu-lap`, giới hạn theo chi nhánh được gán; vé POS mang hai quyền này; bớt thì gỡ ở HT12 |
| C2 | Core chưa suy mục đích từ lý do — làm tạm thế nào? | Module giữ bảng lý do → mã mục đích (chỉ mã, không tài khoản, như `PURPOSE_OF_REASON` của cầu nối) + kèm đề xuất Core mức 4 để sau Core tự suy |
| C3 | "Lý do đã khai đủ tài khoản" kiểm thế nào? | Bằng `GET /api/v1/posting/reasons/readiness` |
| C4 | Ngày phiếu? | Mặc định hôm nay; kế toán chọn được ngày lùi trong kỳ chưa khoá; thu ngân (vé POS) chỉ hôm nay |
| C5 | Sửa phiếu đã ghi sổ? Ai xoá nháp? | Phiếu đã ghi sổ không sửa — chỉ Huỷ + nút "Chép thành phiếu mới"; nháp: người lập hoặc kế toán sửa / xoá |
| C6 | Hai người cùng sửa một nháp? | Người lưu sau bị `CONFLICT` (kiểm phiên bản, tải lại) |
| C7 | Thêm tại chỗ trong hộp chọn? | Kế toán (người có quyền danh mục / quy tắc hạch toán) được thêm mặt hàng / lý do tại chỗ qua action của chủ danh mục; người khác chỉ chọn |
| C8 | Đơn giá, thuế, dưới giá vốn? | Đơn giá gợi ý từ bảng giá, sửa được; thuế GTGT theo danh mục hàng; dưới giá vốn cảnh báo (không chặn, ghi log) |
| C9 | Phiếu có giá ghi công nợ ai? | Bắt buộc người nhận, ghi công nợ 131 cho người đó |
| C10 | Dòng để trống lô? | Tự lấy lô hạn sớm nhất (như bán hàng), chọn được lô cụ thể |
| C11 | SL lẻ? | Chỉ khi ĐVT cho phép theo danh mục |
| C12 | Cảnh báo tồn min / max? | Không cảnh báo, chỉ chặn quá tồn |
| C13 | Lý do chọn được? | Mọi lý do loại xuất **trừ** lý do đã có màn riêng: XBA, XBB (bán); XCKho (chuyển kho); XKK (kiểm kê); XCN, XCN3, XNB* |
| C14 | Huỷ phiếu cũ do cầu nối gửi? | Được, cùng luật huỷ |
| C15 | Số phiếu? | Theo sổ chứng từ chung (NT-BH-033), tiền tố `XDC-<mã chi nhánh>-` |

## 9. Bước sau

1. Ghi câu trả lời §8 vào bản đồ lỗi của form (commit đầu nhánh code).
2. Dòng CLAIMS này vào `main` → nhánh code `feat/nt-bh-044-xuat-dieu-chinh`.
3. Soạn đề xuất mức 4 cho P1 (Core tự suy mục đích từ lý do) gửi Nhóm Lõi; P2 thiếu thì đề xuất tương tự. Không vá Kernel.
4. Sau khi module vào `main`: PR open-pos riêng cho màn POS gọi action mới + vé POS thêm quyền (§4).
