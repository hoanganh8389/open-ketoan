# Thu, chi tiền gửi (ACC54, ACC53)

Ghi các khoản tiền **qua tài khoản ngân hàng**. Ngân hàng gửi **giấy báo có** khi tiền về tài khoản, **giấy báo nợ** khi tiền ra; phần mềm gọi theo việc làm:

| Chứng từ | Giấy của ngân hàng | Khi nào | Tài khoản ngân hàng | Tài khoản ở từng dòng |
|---|---|---|---|---|
| **Thu tiền gửi** | Giấy báo có | Tiền **về** tài khoản | ghi **Nợ** 112… | ghi **Có** (131 khách trả nợ, 515 lãi tiền gửi…) |
| **Chi tiền gửi** (ủy nhiệm chi) | Giấy báo nợ | Tiền **ra** khỏi tài khoản | ghi **Có** 112… | ghi **Nợ** (331 trả nhà cung cấp, 635 phí ngân hàng, 333 nộp thuế…) |

## Danh sách

Màn **Thu, chi tiền gửi** hiện chung cả hai loại trong kỳ:

- Bảng lọc bên trái: kỳ, chi nhánh. Ô **Loại phiếu** trên thanh nút: Tất cả / Thu tiền gửi / Chi tiền gửi.
- Ô trên cùng: **Tổng thu**, **Tổng chi** của các dòng đang hiện.
- Nút **Thu tiền gửi ▾**: Thu tiền gửi · Thu tiền theo hóa đơn. Nút **Chi tiền gửi ▾**: Ủy nhiệm chi · Trả tiền theo hóa đơn.
- Bấm một dòng xem dòng hạch toán ở dưới, bấm đúp mở phiếu. Nút **Cột** ẩn / hiện cột.

## Lập phiếu

Giống **Thu, chi tiền** (xem hướng dẫn Phiếu thu, phiếu chi), khác ở:

- Chọn **Tài khoản ngân hàng** (danh mục Tài khoản ngân hàng): tự điền tài khoản tiền 112….
- Tiền khách chuyển khoản, quét mã, quẹt thẻ **khi mua hàng ở cửa hàng** đã ghi tự động theo chứng từ bán hàng. Không lập thu tiền gửi cho các khoản đó.

## Ví dụ thường gặp

| Việc | Chứng từ | Tài khoản đối ứng |
|---|---|---|
| Khách chuyển khoản trả nợ | Thu tiền theo hóa đơn | 131… (chọn khách, chọn hóa đơn) |
| Lãi tiền gửi | Thu tiền gửi | 515… |
| Chuyển khoản trả nhà cung cấp | Trả tiền theo hóa đơn | 331… (chọn nhà cung cấp, chọn hóa đơn) |
| Phí chuyển tiền, phí quản lý tài khoản | Chi tiền gửi | 635… hoặc 642… |
| Chuyển tiền giữa hai tài khoản, hai chi nhánh | Chuyển tiền nội bộ | |

Xem số dư từng tài khoản ngân hàng ở **Sổ tiền gửi ngân hàng (ACC56)**.

## Tiền từ chứng từ khác (bán hàng, trả hàng, thu tiền khách…)
<!-- [2026-11-28 Võ Hoàng] NGHIEM-THU — NT-BH-052 (đóng góp) -->

Dưới danh sách phiếu có khung **"Tiền gửi từ chứng từ khác"**: đơn bán ở máy POS, phiếu bán BH10, phiếu trả hàng, thu tiền khách… ghi tiền thẳng trong bút toán của chính chứng từ (không có giấy báo có / nợ riêng). Khung chỉ xem, số đọc từ sổ cái, số ròng theo chứng từ (chứng từ đã huỷ không hiện). Bấm đúp một dòng để mở chứng từ gốc. Các phiếu ở danh sách chính không lặp lại ở khung này.
