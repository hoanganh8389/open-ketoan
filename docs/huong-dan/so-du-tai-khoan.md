# Số dư tài khoản (ACC15)

Nhập **số dư đầu kỳ** của các tài khoản khi bắt đầu dùng phần mềm (hoặc khi đưa thêm một chi nhánh vào). Chỉ nhập **một lần**. Từ đó số dư tự tính theo chứng từ, kỳ sau không phải chuyển số dư.

## Đầu kỳ hay cuối kỳ?

- Số nhập ở đây là số dư **cuối ngày chốt**. Đó cũng là số dư **đầu kỳ** của kỳ đầu tiên dùng phần mềm.
- Mọi sổ và báo cáo (sổ quỹ, sổ tiền gửi, sổ công nợ, Bảng cân đối số phát sinh…) luôn hiện số này ở dòng **Số dư đầu kỳ**. Điều này đúng cả khi khoảng ngày xem có chứa ngày chốt, nên không bị lẫn thành phát sinh.
- **Số dư cuối kỳ** do phần mềm tự tính: đầu kỳ + phát sinh Nợ − phát sinh Có.

Ví dụ:
- Bắt đầu dùng từ 01/11/2026, ngày chốt là 31/10/2026, tiền mặt có 50.000.000.
- Sổ quỹ tháng 11: dòng Số tồn đầu kỳ là 50.000.000. Thu 10.000.000, chi 5.000.000, nên số tồn cuối kỳ là 55.000.000.
- Sổ quỹ tháng 12 tự lấy 55.000.000 làm đầu kỳ.

## Quy trình 3 bước

1. **Chọn ngày chốt số dư**: ngày cuối cùng *trước* khi dùng phần mềm, thường là cuối tháng. Mọi chi nhánh dùng **cùng một ngày chốt**. Màn sẽ nhắc nếu các phiếu khác ngày.
2. **Nhập số dư từng chi nhánh**: mỗi chi nhánh một phiếu. Có ba cách:
   - Bấm **Nhập số dư đầu kỳ** để nhập tay, hoặc **Dán từ Excel** 4 cột.
   - Bấm **Nhập từ Excel** để nhập tệp cả công ty. Tệp có cột Chi nhánh, mỗi chi nhánh thành một phiếu.
3. **Kiểm tra**:
   - Ô **Kiểm tra** trên màn phải báo tổng Dư Nợ = tổng Dư Có, cùng một ngày chốt, TK cân đối không còn số dư.
   - Mở **Bảng cân đối số phát sinh (ACC10)** từ ngày sau ngày chốt: cột Số dư đầu kỳ phải khớp bảng số dư của bạn.

Các thẻ **Tiền mặt / Tiền gửi ngân hàng / Công nợ khách hàng / Công nợ nhà cung cấp / Tạm ứng, nhân viên / Tài khoản khác** lọc bảng số dư theo nhóm. Bấm **Nhập số dư đầu kỳ** khi đang ở một thẻ thì dòng đầu được điền sẵn tài khoản của nhóm đó. **Theo phiếu** xem danh sách phiếu (mỗi chi nhánh một phiếu), mở để sửa hoặc huỷ.

## Quy tắc (màn và máy chủ cùng kiểm)

| Trường hợp | Kết quả |
|---|---|
| Doanh thu, chi phí (loại 5–8), 911 | **Không có số dư**. Lãi lỗ luỹ kế trước ngày bắt đầu ghi 4211 / 4212 |
| Tài khoản tổng hợp (vd 156 khi đã có 1561) | Không nhập, nhập vào tài khoản chi tiết |
| Tiền mặt, tiền gửi, tiền đang chuyển (111, 112, 113) | **Chỉ Dư Nợ** (số tiền đang có). Thấu chi ngân hàng ghi 341 |
| Tài khoản theo dõi đối tượng (131, 331, 141, 334…) | **Mỗi đối tượng một dòng**, bắt buộc mã đối tượng có trong danh mục |
| 131, 331 (lưỡng tính) | Có thể Dư Nợ hoặc Dư Có theo từng đối tượng (khách trả trước, trả trước cho NCC) |
| Tài khoản thường chỉ dư một bên (vd 214 dư Có) mà nhập bên kia | Màn **cảnh báo** (vẫn ghi được) để kiểm tra lại |
| Hàng tồn kho (152–156) | Cảnh báo: tổng phải khớp tồn đầu kỳ theo mặt hàng (Nhập Excel → Tồn kho đầu kỳ, giá vốn đầu kỳ) |
| TSCĐ, CCDC, chi phí trả trước (211–214, 242) | Cảnh báo: khai thêm thẻ (nguyên giá, luỹ kế) để tính khấu hao, phân bổ; tổng phải khớp |
| Mỗi dòng | Chỉ Dư Nợ hoặc Dư Có, không âm |

Dòng sai tô đỏ và có chữ báo lỗi ngay trên dòng. Cạnh nút **Ghi sổ** ghi rõ vì sao chưa ghi được.

## Tổng Nợ phải bằng tổng Có

- Nhập số dư **toàn công ty** trong một phiếu: hai tổng phải bằng nhau. Lệch nghĩa là nhập thiếu hoặc sai.
- Nhập **riêng từng chi nhánh** thì số dư một chi nhánh thường không tự cân. Khi đó nhập **Tài khoản cân đối** (vd tài khoản trung gian 999). Nhập đủ mọi chi nhánh thì tài khoản này tự về 0. Ô Kiểm tra báo nếu nó còn số dư, nghĩa là còn thiếu.

## Nhập từ Excel

- Bấm **Tải tệp mẫu** để lấy tệp mẫu, có sheet hướng dẫn từng cột: Chi nhánh, Ngày chốt số dư, Tài khoản, Mã đối tượng, Dư Nợ, Dư Có, TK cân đối.
- Bước **Kiểm tra dữ liệu** báo lỗi từng dòng theo đúng quy tắc trên, chưa ghi gì.
- Chi nhánh đã có phiếu số dư thì không nhập chồng: sửa phiếu đó, hoặc huỷ rồi nhập lại.
- Phiếu của một chi nhánh còn dòng lỗi thì cả phiếu không ghi, tránh ghi nửa vời.

## Sửa, huỷ

Mở phiếu bằng cách bấm số phiếu, bấm đúp dòng, hoặc vào thẻ Theo phiếu. Sau đó có hai cách:
- Bấm **Sửa** rồi **Ghi lại**.
- Bấm **Huỷ phiếu** (ghi lý do) rồi nhập lại. Phiếu huỷ ghi bút toán đảo, sổ trở về như chưa nhập.
