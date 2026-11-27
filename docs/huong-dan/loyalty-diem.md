# Điểm thành viên (BH19)
<!-- [2026-11-16 11:10 AM Võ Hoàng] LOYALTY — hướng dẫn màn BH19, NT-BH-020 bước 3 (đóng góp) -->
<!-- [2026-11-25 09:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-039: khai, duyệt chính sách tích điểm ở kế toán; điều chỉnh điểm tay (đóng góp) -->
<!-- [2026-11-28 04:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-059: khai theo luồng 4 bước, mỗi chương trình áp Tất cả / chọn cửa hàng, người có quyền tự lập tự duyệt (đóng góp) -->

Sổ điểm thành viên của khách mua ở máy bán và **chính sách tích điểm** (mỗi chương trình áp cho Tất cả hoặc các cửa hàng chọn). Màn đi theo
**4 bước** (thanh trên cùng, mỗi bước ghi tình trạng hiện tại):

| Thẻ | Việc |
|---|---|
| Tổng quan | 4 thẻ bước (bước chưa làm ghi "Bắt đầu ở đây"); điểm tích, đổi, hết hạn, hoàn trong kỳ; điểm còn của từng khách |
| 1 Cài đặt + hạng | bật tích / đổi ở máy bán, nhân điểm theo hạng, điểm tối thiểu để đổi, tên gọi điểm; bảng hạng và hệ số — áp Tất cả / chọn cửa hàng |
| 2 Chương trình tích điểm | theo tiền, theo mã hàng, nhân điểm, thưởng theo mức đơn |
| 3 Đổi điểm | danh mục quà / voucher đổi điểm, hạng tối thiểu |
| 4 Thành viên & điều chỉnh | tra điểm từng khách, lịch sử; cộng / trừ điểm tay có người khác duyệt |

## Mở màn
Menu trái → **Phần riêng** → **Điểm thành viên**. Cần quyền *Xem điểm thành viên* (`loyalty:read`) — mặc định có ở chủ đơn vị, kế toán trưởng, kế toán, người xem.

## Điểm đến từ đâu
- **Chính sách tích điểm** khai và duyệt **ở màn này** (từ 25/11/2026, phiếu NT-BH-039). Website không còn tự gửi; cửa hàng nào đã có bản kế toán phát hành thì **mọi lần website đẩy (lệnh tay `wp tgs-pos loyalty-push`) đều bị từ chối** — báo "Chính sách tích điểm nay chỉ khai ở phần mềm kế toán — website không đẩy đè được".
- **Tích**: đơn máy bán hoàn tất có khách → tự tích theo chính sách của cửa hàng. Mỗi lần tích là một **lô** có hạn dùng.
- **Đổi**: khách đổi điểm lấy quà / voucher ở quầy → trừ lô hết hạn sớm nhất trước. Quà ra dòng quà 0đ, voucher dùng ở đơn sau (tiền giảm trên chứng từ bán).
- **Hoàn**: trả hàng → trừ điểm đã tích của phần trả (theo tỉ lệ tiền trả).
- **Hết hạn**: mỗi đêm, phần còn lại của lô quá hạn ghi thành dòng hết hạn.
- **Số dư cũ**: ngày cửa hàng chuyển sang máy bán mới, số dư điểm ở website được nạp một lần (tổng đã tích + phần đã dùng → giữ đúng số dư và hạng).

## Quyền
| Quyền | Mặc định có | Làm gì |
|---|---|---|
| `loyalty:read` | chủ đơn vị, kế toán trưởng, kế toán, người xem | xem mọi thẻ |
| `loyalty:chinh-sach-lap` | chủ đơn vị, kế toán trưởng | + Thêm, Sửa, Nhân bản; Ghi, Gửi duyệt (chương trình, đổi điểm, cài đặt + hạng) |
| `loyalty:chinh-sach-sua` | chủ đơn vị, kế toán trưởng | sửa nháp đang mở (đường cũ theo từng cửa hàng) |
| `loyalty:chinh-sach-duyet` | chủ đơn vị, kế toán trưởng | nút **Duyệt (phát hành)** trong hộp, Duyệt chờ (n), Từ chối |
| `loyalty:dieu-chinh-lap` | chủ đơn vị, kế toán trưởng | Lập điều chỉnh điểm |
| `loyalty:dieu-chinh-duyet` | chủ đơn vị, kế toán trưởng | Duyệt / từ chối điều chỉnh |

Không có quyền thì nút **ẩn**. Chương trình, danh mục đổi, cài đặt + hạng: người có quyền duyệt **tự lập tự duyệt** được (NT-BH-059, 28/11). Điều chỉnh điểm tay: **người lập không tự duyệt** (kể cả chủ đơn vị). Người khác (vd kế toán) **không có sẵn** quyền lập / sửa: quản trị vào *Hệ thống → Phân quyền* (HT12), nhóm **Bán hàng**, màn **BH19 Điểm thành viên** — thao tác *Lập nháp chính sách*, *Sửa / gửi duyệt chính sách*, *Duyệt chính sách*, *Lập điều chỉnh điểm*, *Duyệt điều chỉnh điểm* — Cho quyền cho vai trò cần (vd lập vai trò "Kế toán điểm" Cho lập / sửa rồi gán cho người dùng).

## Khai chương trình (bước 2 Chương trình tích điểm, bước 3 Đổi điểm)
1. Danh sách mỗi dòng **một chương trình**: mã, tên, loại, cách tính (tóm tắt), **Áp dụng cho** (Tất cả cửa hàng / các cửa hàng), từ ngày, ngừng từ,
   **Trạng thái**: *Nháp* (đã ghi, máy bán chưa áp) · *Chờ duyệt* · *Bị từ chối* · *Đang áp* · *Chờ ngày áp* · *Ngừng*. Rê chuột lên trạng thái xem từng cửa hàng.
2. **+ Thêm**: mã điền sẵn `TD_<tháng năm>_<số>` (đổi điểm: `DD_…`), sửa được tới khi phát hành. Thẻ **Thông tin chương trình**: chọn loại (mỗi loại có
   một câu giải thích), tên, ghi chú, từ ngày, ngừng từ ngày, ưu tiên, *Đang chạy*, *Tự động áp ở máy bán*, **Áp dụng cho**:
   - *Tất cả cửa hàng* = mọi cửa hàng đang hoạt động lúc ghi (cửa hàng mở sau: mở chương trình, Duyệt lại);
   - *Chọn cửa hàng*: gõ tìm, tích từng cửa hàng (hoặc *Chọn hết đang hiện*). Bỏ một cửa hàng khi sửa = chương trình **ngừng** ở cửa hàng đó.
3. Thẻ **Cách tính điểm** (đổi điểm: **Phần thưởng**): theo tiền / nhân điểm nhập số điểm cho mỗi số tiền (có ví dụ đơn 325.000đ); theo mã hàng, theo
   mức đơn, quà, voucher là **bảng nhiều dòng** — *+ Thêm dòng*, *Import Excel* (dán từ Excel hoặc mở tệp CSV, dòng tiêu đề tự bỏ), tên hàng tự điền
   theo danh mục. Giới hạn: hạn điểm, đơn tối thiểu, trần điểm / đơn. Hệ số theo hạng hiện để xem (sửa ở bước 1).
4. Chân hộp: **Ghi** (nháp) · **Gửi duyệt** (chờ người có quyền duyệt; máy bán vẫn tính theo bản cũ) · **Duyệt (phát hành)** (chỉ người có quyền duyệt;
   máy bán tính từ đơn kế tiếp) · **Thoát** (còn thay đổi chưa lưu thì hỏi lại). Thiếu ô: máy chủ báo **mọi lỗi một lần**, ô sai tô đỏ, thẻ có lỗi gắn ⚠.
5. **Duyệt (phát hành)** trong hộp chỉ phát hành **đúng chương trình đang lưu** — chương trình khác còn *Nháp* ở cùng cửa hàng không bị phát hành theo.
   **Duyệt chờ (n)** trên thanh nút: duyệt / từ chối các nháp đã gửi (mỗi nháp là của một cửa hàng, duyệt = phát hành cả nháp đó).
6. **Nhân bản**: thêm chương trình mới chép dòng đang chọn (mã mới). Chương trình **đã phát hành không xoá được** — bỏ tích *Đang chạy*, đặt *Ngừng từ
   ngày*, hoặc bỏ cửa hàng khỏi Áp dụng cho.

## Cài đặt + hạng (bước 1)
Chọn **Lấy mẫu từ** một cửa hàng (nạp cài đặt + bảng hạng đang dùng), sửa, chọn **Áp dụng cho**, rồi **Ghi / Gửi duyệt / Duyệt (phát hành)**. Chỉ cài đặt
và bảng hạng thay đổi — chương trình tích / đổi của từng cửa hàng giữ nguyên. Bảng **Cửa hàng đang dùng** cho biết mỗi cửa hàng đang có gì.

**Máy bán áp đúng cửa hàng:** mỗi cửa hàng giữ phiên bản chính sách riêng; tích điểm, đổi điểm và máy bán đều đọc bản của **cửa hàng của đơn** —
cửa hàng không được chọn thì không tích / không đổi theo chương trình đó.

Phiên bản phát hành là mã băm nội dung (`kt-…`); bản đã phát hành không sửa, muốn đổi thì lập nháp mới. Nhân điểm theo hạng làm tròn 2 số lẻ như plugin cũ (vd 32 × 1,2 = 38,4).

Khách đổi quà có **hạng tối thiểu** cao hơn hạng của mình: máy bán báo "… chưa đủ hạng: cần hạng …".

<!-- [2026-11-27 Võ Hoàng] NGHIEM-THU — NT-BH-051: thẻ Thành viên, ô thêm như plugin cũ (đóng góp) -->
**Ô thêm như plugin cũ (NT-BH-051):** chương trình tích có *Tự động áp* (bỏ tích = không tự cộng điểm), *Giá trị đổi (đ / điểm)* (lưu để
tham chiếu, máy bán không quy điểm ra tiền — dùng điểm qua quà / voucher), *Mô tả* (nhân điểm), *Ghi chú*; danh mục đổi có *Ưu tiên*,
*Tự động áp*, *Từ ngày*; quà có *Theo dõi tồn*; voucher có *Số lượng* = số mã voucher phát mỗi lần đổi (trừ điểm một lần); hạng có *Màu*.

## Thành viên (bước 4 · Thành viên)
- **Tìm kiếm** theo mã khách, tên, SĐT (gõ không dấu được), lọc **Hạng**, bấm **Tìm**; **« Trước / Sau »** sang trang (50 khách / trang, điểm hiện tại giảm dần).
- Cột: mã, tên, SĐT (danh mục đối tượng), **hạng** (theo tổng điểm đã tích, đổi điểm không tụt hạng), **điểm hiện tại**, **tổng tích**, **tổng đổi**, phát sinh cuối.
- **Lịch sử** (hoặc bấm đúp dòng): mọi giao dịch điểm, mỗi dòng có điểm **Trước / Sau**, chứng từ, cửa hàng, mô tả, hạn lô.
- **+ Cộng / − Trừ**: mở hộp *Lập yêu cầu điều chỉnh* điền sẵn khách — vẫn phải người khác duyệt mới ghi sổ (như Điều chỉnh điểm).

## Điều chỉnh điểm tay (bước 4 · Điều chỉnh điểm)
1. **Lập điều chỉnh**: mã khách (máy bán: SĐT), số điểm (dương = cộng, âm = trừ), **lý do** (bắt buộc), chi nhánh (không bắt buộc). Màn hiện điểm khách đang có; trừ quá số điểm dùng được thì không cho lập.
2. Người **khác** có quyền duyệt bấm **Duyệt / từ chối** → duyệt thì sổ điểm có dòng *Điều chỉnh* (cộng: lô không hết hạn; trừ: trừ lô hết hạn sớm nhất trước). Lúc duyệt mà khách không còn đủ điểm → chặn (không để số dư âm).
3. Không có trần điểm mỗi lần; điều chỉnh đã duyệt không sửa — sai thì lập điều chỉnh ngược.

## Bảng tham số (thẻ Tổng quan, bên trái)
- **Kỳ**: mặc định đầu tháng tới hôm nay. Bấm **Tìm kiếm** để áp.

## Đọc màn
- **Thẻ chỉ số**: điểm còn cuối kỳ (số khách), tích / đổi / hết hạn trong kỳ.
- **Phát sinh theo cửa hàng**: tích, đổi, hết hạn, hoàn khi trả hàng, điều chỉnh. Dòng *(không theo cửa hàng)* là hết hạn và số dư cũ.
- **Số dư theo hạng**: số khách, tổng điểm còn của mỗi hạng (hạng theo tổng điểm đã tích).
- **Khách**: 500 khách điểm còn nhiều nhất, kèm tích / đổi / hết hạn trong kỳ. Rê chuột vào tiêu đề cột để xem cách tính; nút xuất Excel ở góc bảng.

## Kế toán
Điểm **không** hạch toán lúc tích. Chỉ khi khách đổi: quà là dòng quà 0đ trên chứng từ bán (giá vốn hàng tặng), voucher là tiền giảm trên dòng chứng từ bán. Tài khoản do kế toán đặt ở *Tài khoản ngầm định*.
