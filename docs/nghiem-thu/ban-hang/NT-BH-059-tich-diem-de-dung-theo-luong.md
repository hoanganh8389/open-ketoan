# NT-BH-059 · Tích điểm BH19 dễ dùng theo luồng — mỗi chương trình áp Tất cả / chọn cửa hàng, người có quyền tự lập tự duyệt
<!-- [2026-11-28 04:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-059: phiếu chốt theo giao việc 28/11 (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng — BH19 Điểm thành viên (module `loyalty`), máy bán POS (chỉ đọc, không sửa) |
| Ngày tạo | 28/11/2026 |
| Trạng thái | **Đã chốt — Hoàng 28/11: BH19 dễ dùng theo luồng như khuyến mại, áp dụng tất cả / chọn cửa hàng, người có quyền tự lập tự duyệt chương trình** |
| Căn cứ | NT-BH-039 (khai, duyệt chính sách ở kế toán), NT-BH-051 (đủ ô như plugin cũ), NT-BH-049 (form khuyến mại hai thẻ, chân Ghi · Gửi duyệt · Duyệt) |

## 1. Vì sao cần

BH19 cũ (NT-BH-039) soạn **theo từng cửa hàng**: chọn cửa hàng → "Sửa từ bản hiện hành" → sửa → Lưu nháp → Gửi duyệt → **người khác** duyệt.
Một chương trình dùng cho 30 cửa hàng phải làm 30 lần (hoặc qua hộp "Áp cho nhiều cửa hàng"), không nhìn được một chương trình đang chạy ở
đâu, màn trống khi chưa chọn cửa hàng, và người có quyền duyệt không tự duyệt được chương trình mình lập. Hoàng 28/11: "khó dùng" → làm theo
luồng như khuyến mại.

## 2. Làm

| # | Việc | Chỗ |
|---|---|---|
| L1 | **Thanh bước** 1 Cài đặt + hạng → 2 Chương trình tích điểm → 3 Đổi điểm → 4 Thành viên & điều chỉnh; mỗi bước ghi tình trạng (vd "2 / 3 cửa hàng đã có", "3 đang áp"), nút **Bước tiếp →**; Tổng quan có 4 thẻ bước, bước chưa làm hiện "Bắt đầu ở đây" | `DiemThanhVienPage.tsx` |
| L2 | Bước 2 / 3: danh sách **theo chương trình** (gom theo mã qua mọi cửa hàng): Mã, Tên, Loại, Cách tính / phần thưởng (tóm tắt), **Áp dụng cho** (Tất cả / các cửa hàng), Từ ngày, Ngừng từ, **Trạng thái** (Nháp / Chờ duyệt / Bị từ chối / Đang áp / Chờ ngày áp / Ngừng). Thanh nút Core: + Thêm · Sửa · Nhân bản · Nạp · Duyệt chờ (n); bấm đúp = Sửa; trống thì có gợi ý bắt đầu | `ChuongTrinhTab.tsx`, `GET /policies` |
| L3 | Hộp chương trình như BH18: thẻ **Thông tin chương trình** (chọn loại gọn có mô tả lời thường; mã tự sinh `TD_<MMYY>_<NN>` / `DD_<MMYY>_<NN>`, sửa được tới khi phát hành; tên, ghi chú, từ ngày, ngừng từ ngày, ưu tiên, đang chạy, tự động áp; **Áp dụng cho**) và thẻ **Cách tính điểm** / **Phần thưởng** (bảng nhiều dòng cho mã hàng, mức đơn, quà, voucher; + Thêm dòng; **Import Excel** dán / CSV; ví dụ tính đơn 325.000đ; hệ số theo hạng xem ở bước 1). Chân: **Ghi · Gửi duyệt · Duyệt (phát hành)** (đậm, chỉ người có quyền duyệt) **· Thoát** | `ChuongTrinhModal.tsx` |
| L4 | **Áp dụng cho**: radio *Tất cả cửa hàng (n)* / *Chọn cửa hàng* (ô tìm, Chọn hết đang hiện, Bỏ chọn hết, danh sách tích). Tất cả = mọi cửa hàng đang hoạt động lúc ghi | `ApDungCho.tsx` |
| L5 | Bước 1 Cài đặt + hạng: lấy mẫu từ một cửa hàng, sửa, **Áp dụng cho**, Ghi · Gửi duyệt · Duyệt; bảng "Cửa hàng đang dùng" (tên gọi điểm, hạng, tích / đổi / nhân hạng, nháp) | `CaiDatTab.tsx` |
| S1 | `GET /api/v1/m/loyalty/policies` (`loyalty.policy.overview`): mỗi chương trình + trạng thái từng cửa hàng, cờ Tất cả; cài đặt từng cửa hàng; số nháp chờ duyệt | `api/drafts.ts` `overview`, `actions/policy-overview.ts` |
| S2 | `POST /api/v1/m/loyalty/policies/save` (`loyalty.policy.save`, quyền lập, Idempotency-Key): `{ policy \| config, target: { all, branchCodes }, mode: draft \| submit \| approve }` → gộp vào nháp từng cửa hàng; cửa hàng **bỏ khỏi phạm vi** → chương trình **ngừng** ở đó (đã phát hành: status 0 + ngày ngừng; chưa phát hành: bỏ khỏi nháp). `approve` cần quyền duyệt, **phát hành bản đang chạy + đúng thay đổi này** (thay đổi khác trong nháp cửa hàng không bị phát hành theo), đồng thời gộp vào nháp đang mở | `api/drafts.ts` `saveAcross`, `actions/policy-save.ts` |
| S3 | Bỏ chặn "người lập không tự duyệt" cho **nháp chính sách** (duyệt / từ chối); **điều chỉnh điểm tay giữ hai người** | `api/drafts.ts` `approveDrafts`, `rejectDrafts` |
| — | Bỏ khung soạn theo từng cửa hàng (ChinhSachKhung, ApDungModal, ChuongTrinhForm, DoiDiemForm) — thay bằng L2–L5 | `web/screens/diem/` |

**Áp đúng cửa hàng ở máy chủ và máy bán:** chính sách vẫn lưu **theo cửa hàng** (mỗi cửa hàng một phiên bản `programs`). Tích điểm khi
nhận đơn (`order-recorded`), báo giá đổi điểm (`redeem-quote`), máy bán đọc chương trình (`GET /program?branch=`) và tra khách đều lấy
bản của **đúng cửa hàng của đơn**. "Chọn cửa hàng" chỉ ghi chương trình vào các cửa hàng đó; cửa hàng không chọn không có (hoặc bị ngừng) →
máy bán cửa hàng đó không tích / không đổi theo chương trình. **Không cần sửa máy bán POS.**

## 3. Các bước nghiệm thu (thử trên máy local)

1. BH19 → **Tổng quan**: thấy 4 thẻ bước; chưa có cài đặt thì bước 1 ghi "Bắt đầu ở đây".
2. Bước 1 → sửa tên gọi điểm, **Tất cả cửa hàng** → **Duyệt (phát hành)** → bảng "Cửa hàng đang dùng" mọi cửa hàng đổi tên gọi điểm.
3. Bước 2 → **+ Thêm**: mã điền sẵn `TD_1126_01`; loại *Theo tiền*; tên; thẻ Cách tính 1 điểm / 10.000đ (ví dụ 325.000đ → 32 điểm); Áp dụng cho
   **Chọn cửa hàng** CN01, CN02 → **Duyệt (phát hành)** → dòng `TD_1126_01` "2 cửa hàng: CN01, CN02" · **Đang áp**.
4. Bán ở máy bán CN02 đơn 325.000đ có khách → +32 điểm; bán ở CN03 → không tích theo `TD_1126_01`.
5. **Sửa** `TD_1126_01` → bỏ CN01 → Duyệt → dòng "1 cửa hàng: CN02"; CN01 ngừng (bản cũ còn tra được).
6. **+ Thêm** loại *Theo mã hàng* → **Import Excel** dán `Mã hàng ⇥ Điểm` 3 dòng → bảng 3 dòng, tên tự điền theo danh mục → **Ghi** → trạng thái **Nháp**,
   máy bán chưa áp.
7. Bước 3 → **+ Thêm** *Đổi voucher* mã `DD_1126_01`, một dòng V50 / 100 điểm / 50.000đ → **Duyệt** → "Tất cả cửa hàng" · Đang áp. Chương trình **Nháp** ở bước 6
   **vẫn là Nháp** (không bị phát hành theo).
8. Người chỉ có quyền **Lập** (không Duyệt): hộp không có nút Duyệt; **Gửi duyệt** → Chờ duyệt; chủ đơn vị **Duyệt chờ (n)** → Đang áp.
9. Bước 4 → **Điều chỉnh điểm**: người lập **không** tự duyệt được điều chỉnh của mình (giữ hai người).

## 4. Số liệu mong đợi (test `apps/api/test/nt-bh-059-tich-diem-de-dung.test.ts`) (đề xuất — tệp test ở nhánh code)

| Ca | Kết quả |
|---|---|
| 1 Tất cả + Duyệt | mọi cửa hàng có `TD_1126_01`, tổng hợp `allBranches`, Đang áp |
| 2 Đổi phạm vi sang chỉ CN02 | CN03 ngừng; đơn CN02 325.000đ +32 điểm, đơn CN03 không tích |
| 3 Người chỉ có quyền lập bấm Duyệt | 403 `FORBIDDEN`; Gửi duyệt → Chờ duyệt; chủ đơn vị duyệt → hệ số mới |
| 4 Thiếu ô / không cửa hàng / cửa hàng lạ | 400 một lần: `policies.0.title`, `policies.0.rules.earn_unit`; `target` (`LOYALTY_BRANCH_UNKNOWN`) |
| 5 Cài đặt + hạng Tất cả + Duyệt | mọi cửa hàng tên gọi điểm "xu" |
| 6 Nháp TD_1126_04 rồi Duyệt ngay TD_1126_05 (cùng CN02) | máy bán CN02 có 05, **không có** 04; nháp giữ cả hai, vẫn là nháp |

## 5. Mặc định đã áp (rà khi nghiệm thu)

| Mã | Mặc định | Lý do |
|---|---|---|
| M1 | **Tất cả cửa hàng** = mọi cửa hàng đang hoạt động **lúc ghi**; cửa hàng mở sau phải mở chương trình → Duyệt lại (Tất cả) | Lưu theo cửa hàng (máy bán đọc theo cửa hàng); không thêm cờ "tất cả" động |
| M2 | Bỏ cửa hàng khỏi Áp dụng cho = **ngừng** ở cửa hàng đó (status 0 + ngừng từ hôm nay), không xoá | Q-DM-01: chương trình đã phát hành không xoá |
| M3 | Mã tự sinh `TD_` (tích) / `DD_` (đổi) theo tháng; đã phát hành thì khoá ô mã | Giống `TGS_` của khuyến mại; mã là khoá gộp chương trình giữa các cửa hàng |
| M4 | Người có quyền **Duyệt chính sách tích điểm** tự lập tự duyệt chương trình, danh mục đổi, cài đặt + hạng (bỏ luật hai người của NT-BH-039 cho phần này) | Hoàng 28/11 |
| M5 | **Điều chỉnh điểm tay vẫn hai người** (người lập không tự duyệt) | Điểm là tiền của khách; chưa có chốt đổi — hỏi Hoàng (§6 Q1) |
| M6 | **Duyệt (phát hành)** trong hộp chỉ phát hành đúng chương trình đang lưu (bản đang chạy + thay đổi này); thay đổi khác trong nháp cửa hàng vẫn chờ. **Duyệt chờ (n)** (duyệt nháp đã gửi) phát hành **cả nháp** của cửa hàng | Tránh phát hành nhầm chương trình còn Nháp |
| M7 | Trạng thái một chương trình trên danh sách = trạng thái "nặng" nhất qua các cửa hàng (Chờ duyệt > Bị từ chối > Nháp > Đang áp > Chờ ngày áp > Ngừng); rê chuột xem từng cửa hàng | Một dòng một chương trình |
| M8 | Hai cửa hàng có cùng mã nhưng nội dung khác (dữ liệu cũ đẩy từ website): danh sách hiện nội dung của cửa hàng đầu tiên (theo mã cửa hàng); Lưu sẽ ghi một nội dung cho mọi cửa hàng chọn | Gộp theo mã |
| M9 | Import Excel = dán từ Excel hoặc tệp CSV (module không có thư viện đọc .xlsx) | Như BH18 |

## 6. Câu hỏi còn mở

| # | Câu hỏi | Đang làm |
|---|---|---|
| Q1 | Điều chỉnh điểm tay có bỏ luật hai người như chương trình không? | Giữ hai người (M5) |
| Q2 | "Tất cả cửa hàng" có cần **tự áp cho cửa hàng mở sau** không (cờ động)? | Không — áp lại tay (M1) |
| Q3 | Danh sách chờ duyệt có cần tách theo chương trình (thay vì theo nháp cửa hàng) không? | Theo nháp cửa hàng (như NT-BH-039) |
