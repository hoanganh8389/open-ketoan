# Tồn theo lô (KHO05)

<!-- [2026-11-10 06:30 PM Nguyễn Văn Thủy] PHASE-026 — lô hàng (đóng góp) -->

Theo dõi hàng **theo lô** xuyên suốt mua → chuyển kho → bán → khách trả, mà vẫn **một mã hàng** (lô gắn theo định danh mặt hàng, đổi mã không mất lô). Giá vốn vẫn **bình quân tháng** — lô chỉ theo dõi số lượng, hạn dùng và tên.

## Lô sinh ra thế nào

- Một lô = **mặt hàng + số lô + hạn dùng** của nhà cung cấp, ghi trên dòng phiếu nhập.
- Phiếu nhập không ghi số lô / hạn dùng → hàng vào **lô không số** của mặt hàng.
- **Tên lúc mua**: tên trên dòng phiếu nhập / hoá đơn NCC lần đầu nhập lô — kể cả khi gõ khác danh mục. Lô nhập thêm với tên khác vẫn cùng lô; tên khác được ghi lại ("khác tên"), tên lúc mua giữ nguyên.

## Lô theo từng phân kho

Tồn của lô tính riêng từng **chi nhánh · kho**. Hàng ra chỉ tự lấy lô **đang nằm ở đúng kho của dòng** — lô ở kho phân bổ không bị lấy nhầm cho dòng bán ở kho hàng. Dòng không ghi mã kho (ví dụ bán POS) tính vào **kho mặc định** của chi nhánh, giống báo cáo kho.

## Hàng đi theo lô tự động

| Nghiệp vụ | Lô |
|---|---|
| Bán, trả NCC, xuất chuyển, xuất điều chỉnh | Phiếu ghi số lô → đúng lô đó. Không ghi → **tự động lô hạn dùng sớm trước** (cùng hạn: nhập trước), chỉ trong đúng chi nhánh + kho của dòng |
| Khách trả hàng (có phiếu bán gốc) | **Về đúng lô đã xuất** của phiếu gốc (lô xuất trước trả trước) |
| Nhận chuyển kho | **Đúng các lô bên xuất** đã xuất |
| Bán quá tồn lô | Phần thiếu ghi vào lô không số (tồn âm) để tổng tồn lô luôn khớp tồn kho |

Sửa phiếu → phân lô ghi lại. Phiếu về muộn / sửa ngày làm thứ tự lệch → bấm **Phân lô lại** (chạy lại theo đúng thứ tự ngày; không đổi sổ, không đổi giá vốn).

## Màn

Menu: **Kho → Lô hàng → Tồn theo lô**. Bảng lọc bên trái như các màn báo cáo: tích chi nhánh, tích mã kho, rồi bấm **Tìm kiếm**.

- **Tồn theo lô**: mỗi dòng là **một lô ở một chi nhánh · kho**; lọc thêm mã / tên / số lô, sắp hết hạn (đỏ = hết hạn, cam ≤ 30 ngày, vàng ≤ 90 ngày). Bấm một dòng xem **thẻ lô** ở kho đó (nút **Mọi nơi** để xem lô đi qua mọi kho); bấm số phiếu trong thẻ lô để xem phiếu đó.
- **Lô theo phiếu**: danh sách phiếu có hàng đi theo lô (lọc ngày, chi nhánh / kho, loại phiếu, số phiếu hoặc mã hàng). Bấm một phiếu → từng dòng lấy lô nào, **từ kho nào**, tên lúc mua của lô. **Hoá đơn vẫn theo đúng bill ở cửa hàng** — bill một dòng thì hoá đơn một dòng, lô không tách dòng.

Lô còn tồn và hạn dùng là căn cứ để lên chương trình xả hàng cận date (Chương trình bán BH12) và so sánh giá giữa các lô.

## Thẻ Hạn dùng

<!-- [2026-11-27 01:20 PM Nguyễn Văn Thủy] KHO05 — báo cáo lô và hạn dùng là một thẻ của màn này (đóng góp) -->

- Lô **còn tồn** có hạn dùng, xếp **hạn gần trước**, mỗi dòng một chi nhánh · kho. Lọc cây chi nhánh + kho như thẻ Tồn theo lô.
- Bốn thẻ số: **Đã hết hạn, Còn ≤ 7, ≤ 15, ≤ 30 ngày** — bấm để lọc nhanh, bấm lại để bỏ.
- Phiếu nhập chỉ ghi hạn dùng (bỏ trống số lô) vẫn lên, cột Số lô ghi "không số". Lô không ghi hạn dùng: chọn **Không hạn dùng** ở ô Tình trạng hạn.
- Lô đã hết hạn không xuất bán: lập Trả hàng NCC ghi đúng số lô, hoặc huỷ hàng có biên bản.
