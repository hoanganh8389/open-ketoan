# NT-MH-019 · Chuyển hàng xuống shop (MH19): nút "Lập phiếu chuyển kho" từ đề nghị
<!-- [2026-11-26 kiennt] NGHIEM-THU — tạo phiếu theo yêu cầu người dùng (đóng góp) -->

| | |
|---|---|
| Phân hệ | Mua hàng · Kho |
| Màn hình | MH19 Chuyển hàng xuống shop (thẻ Đề nghị đã chốt) · KHO01 Phiếu chuyển kho |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 26/11/2026 |
| Trạng thái | Đã chốt (kiennt, 26/11/2026) |

## 1. Yêu cầu

**Hiện trạng:** đề nghị chuyển (DNC…) chốt ở MH19 không sinh phiếu chuyển kho. Kế toán kho phải tự lập phiếu ở KHO01, gõ lại từng mã / số lượng, rồi quay lại MH19 bấm "Đã lên phiếu chuyển" — nút này chỉ đổi trạng thái, không tạo phiếu nên dễ đánh dấu mà quên lập phiếu (kiểm thử 26/11: đề nghị "Đã lên phiếu" nhưng KHO01 không có phiếu nào).

**Yêu cầu:**
1. Hộp đề nghị (trạng thái **Chờ lên phiếu**) có nút **"Lập phiếu chuyển kho"**. Bấm → mở **KHO01** với phiếu mới điền sẵn:
   - Chi nhánh / kho xuất = chi nhánh, kho xuất của đề nghị; chi nhánh / kho nhập = shop nhận, kho nhận của đề nghị.
   - Dòng hàng = các dòng của đề nghị (mã, tên, ĐVT, số lượng).
   - Ghi chú = "Theo đề nghị chuyển DNC…".
   - Người dùng sửa được mọi thứ trước khi ghi (ngày, số lượng, lô…).
2. Ghi phiếu:
   - **Ghi và duyệt xuất** (hoặc ghi nháp rồi duyệt xuất ngay trong lần mở đó) → đề nghị **tự chuyển "Đã lên phiếu"**, báo "Đề nghị DNC… đã chuyển sang Đã lên phiếu".
   - **Ghi nháp** → đề nghị vẫn **Chờ lên phiếu** (phiếu nháp chưa trừ tồn).
   - Không đánh dấu được (thiếu quyền MH19…) → phiếu vẫn ghi, báo người dùng đánh dấu ở MH19.
3. Nút "Đã lên phiếu chuyển" (đánh dấu tay) giữ nguyên — cho trường hợp phiếu lập từ nơi khác (POS, website).

**Ngoài phạm vi:** liên kết cố định phiếu ↔ đề nghị trên máy chủ (lưu số phiếu vào đề nghị); duyệt xuất phiếu nháp ở lần mở sau không tự đánh dấu đề nghị — tra theo ghi chú "Theo đề nghị chuyển DNC…".

## 2. Phạm vi

- `apps/web/src/phan-he/mua-hang/ton-max/ChuyenShopPage.tsx` (của Nguyễn Văn Thủy — thêm nút; đóng góp).
- `apps/web/src/phan-he/kho/chuyen-kho/ChuyenKhoPage.tsx` (của Nguyễn Văn Thủy — nhận `?tu-de-nghi=` để điền sẵn phiếu mới, đánh dấu đề nghị sau khi duyệt xuất; đóng góp). Gọi thẳng API `/api/v1/stock/transfer-requests` (không import mã của phân hệ Mua hàng).
- Không đổi API, không migration.

## 3. Kết quả mong đợi

| # | Thao tác | Mong đợi |
|---|---|---|
| 1 | MH19 → Đề nghị đã chốt → mở đề nghị Chờ lên phiếu | Có nút "Lập phiếu chuyển kho" (đề nghị đã lên phiếu / đã huỷ thì không có) |
| 2 | Bấm nút | Mở KHO01, phiếu mới: kho xuất / nhập, dòng hàng, ghi chú đúng theo đề nghị |
| 3 | Ghi và duyệt xuất | Phiếu "Đã xuất, chờ nhận", tồn kho xuất giảm; đề nghị → Đã lên phiếu; báo đã chuyển |
| 4 | Lập từ đề nghị khác → Ghi nháp | Phiếu nháp; đề nghị vẫn Chờ lên phiếu |
| 5 | MH19 sau bước 3 | Hàng đã xuất tính vào "Đi đường + đã đề nghị" (không còn giữ chỗ đề nghị) |

## 4. Kết quả chạy
| | |
|---|---|
| Ngày chạy | 26/11/2026 (máy dev, DB local `ketoan_otchuong` — dữ liệu test Hà Nội, trình duyệt tự động; có ghi phiếu chuyển kho) |
| Bản code (commit) | nhánh `feat/nt-mh-019-lap-phieu-chuyen-kho-tu-de-nghi` |
| Kết quả | Bước 1: DNC2611-0004 (Chờ lên phiếu) có nút. Bước 2: KHO01 `?tu-de-nghi=…` mở phiếu mới: 07000 / 07000-KHH → 07002 / 07002-KHH, 110011003 × 20, ghi chú "Theo đề nghị chuyển DNC2611-0004". Bước 3: Ghi và duyệt xuất → CK2600001 "Đã xuất, chờ nhận", tồn 07000-KHH 60 → 40, đề nghị → Đã lên phiếu, báo "Đề nghị DNC2611-0004 đã chuyển sang Đã lên phiếu (phiếu CK2600001)". Bước 4: DNC2611-0008 (07001 × 5) → Ghi nháp → CK2600002 nháp, đề nghị vẫn Chờ lên phiếu. Bước 5: MH19 07002 · 110011003 "Đi đường + đã đề nghị" = 20 (hàng đang chuyển), giữ chỗ đề nghị = 0. Đề nghị đã lên phiếu không còn trong lọc Chờ lên phiếu. Typecheck web sạch |

## 5. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 6. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 26/11/2026 | Tạo và chốt theo yêu cầu |
