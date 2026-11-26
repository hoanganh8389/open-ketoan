# Báo cáo bán hàng (BH01)

Liệt kê **từng mặt hàng** đã bán và trả lại trong kỳ: mỗi dòng hàng trên chứng từ là một dòng báo cáo.

## Cách đọc

- **Hàng trả lại** có nhãn "Trả lại", số lượng và số tiền hiện **số âm**. Nhờ vậy dòng tổng cộng là số thuần (bán trừ trả lại).
- **Tiền hàng** là tiền trước thuế, đã trừ chiết khấu, đúng như trên hoá đơn. **Tổng tiền** = tiền hàng + tiền thuế.
- Hàng có nhãn "Tặng" là hàng khuyến mãi, tiền bằng 0.
- Bốn ô số phía trên và dòng tổng cộng tính trên **toàn bộ kết quả lọc**.

## Ô lọc

| Ô | Ý nghĩa |
|---|---|
| Từ ngày – Đến ngày | Theo ngày chứng từ (phiếu trả lại tính theo ngày trả) |
| Chi nhánh | Một chi nhánh hoặc tất cả |
| Loại | Bán và trả lại / chỉ bán / chỉ trả lại |
| Phạm vi | Tất cả chứng từ / chỉ chứng từ có hoá đơn / chỉ chứng từ nội bộ |
| Tìm kiếm | Mã hàng, tên hàng, số chứng từ, số hoá đơn, tên hoặc mã khách. Gõ xong bấm **Tìm** |

## Thao tác

- Bấm vào một dòng để mở chứng từ gốc và bút toán đã ghi.
- **Xuất Excel** xuất toàn bộ kết quả lọc (tối đa 50.000 dòng).

Chỉ tính chứng từ đang hiệu lực: chứng từ đã huỷ không có trong báo cáo; chứng từ sửa thì lấy nội dung mới nhất.

## Cột kho, nhóm hàng, lô

| Cột | Ý nghĩa |
|---|---|
| Kho | Kho xuất (bán) / kho nhận (trả lại) của dòng; dòng không ghi kho = kho mặc định của chi nhánh |
| Nhóm hàng | Nhóm hàng của mặt hàng theo danh mục (mã — tên) |
| SL ĐVT nhỏ nhất | Số lượng quy về đơn vị tính nhỏ nhất theo tỉ lệ ở danh mục mặt hàng (vd 1 Thùng = 12 Hộp → 12) |
| Số lô, Hạn dùng | Lô phần mềm cấp lúc ghi sổ (lô hạn gần trước); nhiều lô thì cách nhau dấu phẩy, hạn dùng là hạn sớm nhất. Hàng không theo dõi lô để trống |
