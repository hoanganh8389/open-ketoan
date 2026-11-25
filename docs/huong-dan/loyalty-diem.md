# Điểm thành viên (BH19)
<!-- [2026-11-16 11:10 AM Võ Hoàng] LOYALTY — hướng dẫn màn BH19, NT-BH-020 bước 3 (đóng góp) -->
<!-- [2026-11-25 09:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-039: khai, duyệt chính sách tích điểm ở kế toán; điều chỉnh điểm tay (đóng góp) -->

Sổ điểm thành viên của khách mua ở máy bán và **chính sách tích điểm của từng cửa hàng**. Màn có 5 thẻ:

| Thẻ | Việc |
|---|---|
| Tổng quan | điểm tích, đổi, hết hạn, hoàn trong kỳ; điểm còn của từng khách (chỉ xem) |
| Chương trình | chính sách tích: theo tiền, theo mã hàng, nhân điểm, thưởng theo mức đơn |
| Đổi điểm | danh mục quà / voucher đổi điểm, hạng tối thiểu |
| Cài đặt + hạng | bật tích / đổi ở máy bán, nhân điểm theo hạng, điểm tối thiểu để đổi; bảng hạng và hệ số |
| Điều chỉnh | cộng / trừ điểm tay có người duyệt |

## Mở màn
Menu trái → **Phần riêng** → **Điểm thành viên**. Cần quyền *Xem điểm thành viên* (`loyalty:read`) — mặc định có ở chủ đơn vị, kế toán trưởng, kế toán, người xem.

## Điểm đến từ đâu
- **Chính sách tích điểm** khai và duyệt **ở màn này** (từ 25/11/2026, phiếu NT-BH-039). Website không còn tự gửi; lệnh tay `wp tgs-pos loyalty-push` vẫn gửi được, nhưng **bản kế toán đã phát hành mới hơn thì website không đè được** (báo "Kế toán có bản mới hơn").
- **Tích**: đơn máy bán hoàn tất có khách → tự tích theo chính sách của cửa hàng. Mỗi lần tích là một **lô** có hạn dùng.
- **Đổi**: khách đổi điểm lấy quà / voucher ở quầy → trừ lô hết hạn sớm nhất trước. Quà ra dòng quà 0đ, voucher dùng ở đơn sau (tiền giảm trên chứng từ bán).
- **Hoàn**: trả hàng → trừ điểm đã tích của phần trả (theo tỉ lệ tiền trả).
- **Hết hạn**: mỗi đêm, phần còn lại của lô quá hạn ghi thành dòng hết hạn.
- **Số dư cũ**: ngày cửa hàng chuyển sang máy bán mới, số dư điểm ở website được nạp một lần (tổng đã tích + phần đã dùng → giữ đúng số dư và hạng).

## Quyền
| Quyền | Mặc định có | Làm gì |
|---|---|---|
| `loyalty:read` | chủ đơn vị, kế toán trưởng, kế toán, người xem | xem mọi thẻ |
| `loyalty:chinh-sach-lap` | chủ đơn vị, kế toán trưởng, kế toán | Sửa từ bản hiện hành, Áp cho nhiều cửa hàng |
| `loyalty:chinh-sach-sua` | chủ đơn vị, kế toán trưởng, kế toán | Lưu nháp, Gửi duyệt |
| `loyalty:chinh-sach-duyet` | chủ đơn vị, kế toán trưởng | Duyệt (= phát hành cho máy bán), Từ chối |
| `loyalty:dieu-chinh-lap` | chủ đơn vị, kế toán trưởng, kế toán | Lập điều chỉnh điểm |
| `loyalty:dieu-chinh-duyet` | chủ đơn vị, kế toán trưởng | Duyệt / từ chối điều chỉnh |

Không có quyền thì nút **ẩn**. **Người lập không tự duyệt** nháp hay điều chỉnh của mình (kể cả chủ đơn vị). Đổi mặc định ở *Hệ thống → Phân quyền* (HT12, màn BH19).

## Khai chính sách tích điểm (thẻ Chương trình / Đổi điểm / Cài đặt + hạng)
1. Chọn **Cửa hàng**. Dòng dưới cho biết máy bán đang tính theo bản nào.
2. Bấm **Sửa từ bản hiện hành**: lập nháp chép nguyên bản đang chạy (6 loại chính sách, hạng, danh mục đổi). Mỗi cửa hàng chỉ một nháp đang mở.
3. Sửa ở ba thẻ (cùng một nháp). Thêm chính sách bằng nút **+ loại**. Chính sách **đã phát hành không xoá được** — đặt **Ngừng từ ngày**. Mã chính sách không trùng trong cửa hàng. Mã hàng quà chọn ở danh mục mặt hàng đang dùng (chưa có thì khai ở Danh mục mặt hàng trước).
4. **Lưu nháp** bất cứ lúc nào (ô còn trống vẫn lưu được; trùng mã thì không). Rời trang / đổi cửa hàng khi chưa lưu, màn hỏi lại.
5. **Gửi duyệt**: máy chủ kiểm đủ, báo **mọi lỗi một lần**, ô sai tô đỏ kèm lời nhắc. Máy bán **vẫn tính theo bản cũ** tới khi được duyệt.
6. Người có quyền duyệt bấm **Duyệt / từ chối**: chọn một hoặc nhiều nháp → **Duyệt và phát hành** (máy bán tính theo bản mới từ đơn kế tiếp) hoặc **Từ chối** kèm lý do (người lập sửa rồi gửi lại).
7. **Nhật ký**: ai lập, sửa, gửi duyệt, duyệt / từ chối, lúc nào.

Hai người cùng sửa một nháp: người lưu sau bị chặn "Nháp đã đổi lúc … bởi … — tải lại"; bấm **Tải lại nháp** rồi sửa tiếp.

**Áp cho nhiều cửa hàng**: bấm **Áp cho nhiều cửa hàng…**, tích các cửa hàng → mỗi cửa hàng một nháp. Cài đặt và bảng hạng lấy theo nội dung áp; chính sách gộp theo **mã** vào bản đang chạy của từng cửa hàng (cùng mã → thay, mã mới → thêm, chính sách riêng của cửa hàng giữ nguyên). Cửa hàng đang có nháp chưa duyệt thì không lập được — sửa nháp đó. Duyệt riêng từng nháp hoặc chọn nhiều nháp duyệt cùng lúc.

Phiên bản phát hành là mã băm nội dung (`kt-…`); bản đã phát hành không sửa, muốn đổi thì lập nháp mới. Nhân điểm theo hạng làm tròn 2 số lẻ như plugin cũ (vd 32 × 1,2 = 38,4).

Khách đổi quà có **hạng tối thiểu** cao hơn hạng của mình: máy bán báo "… chưa đủ hạng: cần hạng …".

## Điều chỉnh điểm tay (thẻ Điều chỉnh)
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
