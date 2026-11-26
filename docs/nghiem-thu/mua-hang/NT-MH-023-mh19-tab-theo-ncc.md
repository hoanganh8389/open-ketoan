# NT-MH-023 · Chuyển hàng xuống shop (MH19): mỗi nhà cung cấp một tab
<!-- [2026-11-26 kiennt] NGHIEM-THU — tạo phiếu theo yêu cầu người dùng (đóng góp) -->

| | |
|---|---|
| Phân hệ | Mua hàng |
| Màn hình | MH19 Chuyển hàng xuống shop — thẻ **Đề xuất chuyển** |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 26/11/2026 |
| Trạng thái | Chờ nghiệm thu |

## 1. Yêu cầu

File Excel *Công thức đặt hàng hoá* đang dùng chia **mỗi nhà cung cấp / nhãn một sheet** (Bỉm Dokma, Bỉm Huggies, Moaz bé bé…).
Người làm xử lý lần lượt từng NCC. MH19 cần có cách xem tương tự:

- Dưới thanh công cụ có **dải tab NCC**: **Tất cả NCC (n)** · từng NCC (số dòng) · **Chưa rõ NCC (n)**, kiểu tab sheet Excel.
- Tab NCC xếp theo tên. Tab *Chưa rõ NCC* đứng cuối, chữ màu cam.
- Bấm một tab thì lưới chỉ còn dòng của NCC đó, vẫn nhóm theo shop.
- Thêm cột **NCC** cạnh Tên hàng.
- NCC của một mã lấy **đúng quy tắc Phân tích đặt hàng (MH02)**:
  1. lần nhập gần nhất (phiếu nhập không nháp, trong cây chi nhánh);
  2. chưa nhập lần nào thì lấy NCC có bảng giá đang hiệu lực (ưu tiên dòng có giá, rồi hiệu lực từ mới nhất);
  3. không có thì lấy NCC bất kỳ khai bán mã.

  Mã con (đuôi Z / Q…) chưa có NCC thì lấy NCC của mã cha.
- Các phần sau tính theo **tab đang mở**:
  - Ô **Thiếu do kho hết**: số dòng và lọc.
  - Nút **Chốt đề nghị**: số shop · số dòng · SL. Bấm Chốt chỉ chốt dòng của tab đó.
  - **Xuất Excel**: tên tệp có mã NCC.
- Chốt ở tab Tất cả NCC thì sang thẻ *Đề nghị đã chốt* như cũ. Chốt ở một tab NCC thì **ở lại** màn đề xuất để làm tiếp NCC khác. Dòng vừa chốt tự biến mất, vì đã tính là đề nghị chưa làm.
- Cách tính thiếu, chia hàng, làm tròn: không đổi.

**Thiết kế lại thanh công cụ** (bổ sung cùng ngày, vì 4 hàng điều khiển quá rối). Còn 2 hàng dưới [Đề xuất chuyển | Đề nghị đã chốt]:

| Hàng | Trái | Phải |
|---|---|---|
| 1 | **Kho xuất** · **Shop**: [Tất cả] [07001] [07002] (nút tròn, số thứ tự chọn hiện trong nút) | Nút **Cách chia**, ghi sẵn lựa chọn đang dùng (vd "Nguyên thùng · Thiếu nhiều nhất trước"). Bấm thì bật ô chứa *Làm tròn* và *Khi kho không đủ*, kèm giải thích và ngưỡng thùng. Bấm ra ngoài thì đóng |
| 2 | Tab NCC | ☐ **Thiếu do kho hết (n)** (thay ô chọn "Hiện") · **Excel** · **Chốt đề nghị** (kèm số shop · dòng · SL khi có dòng chọn) |

## 2. Phạm vi

| Tệp | Thay đổi |
|---|---|
| `apps/api/src/phan-he/mua-hang/ton-max.ts` | Tách quy tắc chọn NCC của `orderAnalysis` thành hàm `nccMacDinh`. MH02 không đổi kết quả. `transferSuggest` trả thêm `partnerCode`, `partnerName` mỗi dòng |
| `apps/web/src/phan-he/mua-hang/ton-max/api.ts` | Kiểu dòng đề xuất có thêm NCC |
| `apps/web/src/phan-he/mua-hang/ton-max/ChuyenShopPage.tsx` | Dải tab NCC, cột NCC, Chốt theo tab; thanh công cụ 2 hàng, ô bật ra *Cách chia* |
| `apps/web/src/phan-he/mua-hang/ton-max/ton-max.css` | Kiểu tab |
| `docs/huong-dan/mua-hang-chuyen-shop.md` | Mục "Xem theo nhà cung cấp" |

Không thêm migration.

## 3. Kết quả mong đợi

| # | Thao tác | Mong đợi |
|---|---|---|
| 1 | Mở MH19 → Đề xuất chuyển | Có dải tab: Tất cả NCC (n) · từng NCC · Chưa rõ NCC cuối cùng |
| 2 | Bấm tab một NCC | Lưới chỉ còn dòng NCC đó, vẫn nhóm theo shop. Ô Hiện và nút Chốt đếm theo tab |
| 3 | Chốt ở tab NCC | Chỉ tạo đề nghị cho dòng của NCC đó, ở lại màn đề xuất. Dòng vừa chốt biến mất |
| 4 | Bấm Tất cả NCC | Đủ mọi dòng như trước |
| 5 | So với MH02 cùng chi nhánh | NCC của một mã ở MH19 trùng cột NCC ở MH02 |
| 6 | Bấm **Cách chia** → đổi Làm tròn → bấm ra ngoài | Ô bật ra có 2 ô chọn + ngưỡng thùng; nhãn nút đổi theo; bấm ngoài thì đóng |
| 7 | Tích **Thiếu do kho hết** | Chỉ còn dòng thiếu do kho hết của tab đang mở |

## 4. Kết quả chạy

| | |
|---|---|
| Ngày chạy | 26/11/2026 (máy dev, DB local `ketoan_otchuong`, Hà Nội, trình duyệt tự động, chặn lệnh ghi) |
| Bản code (commit) | nhánh `feat/nt-mh-023-mh19-tab-ncc` |
| Kết quả | Bước 1, 2, 4 **đạt**, chạy trên dữ liệu đề xuất thật. API docker chưa có code mới, nên NCC được gắn giả lập vào từng dòng. Tab hiện: "Tất cả NCC 22 · Công ty Dokma 10 · Huggies VN 4 · Chưa rõ NCC 8". Bấm Dokma thì lưới chỉ còn dòng Dokma của 2 shop, ô Hiện ghi "Tất cả dòng (10)", nút Chốt đếm theo tab. Bấm Tất cả NCC thì đủ dòng. Bước 6 **đạt**: nhãn đổi thành "Không làm tròn · Thiếu nhiều nhất trước", bấm ra ngoài thì ô đóng. Bước 7 **đạt**: 24 → 23 hàng bảng. Ô Hiện cũ và hàng Shop riêng không còn. Bước 3 và 5 **chưa chạy**: cần API bản mới, mà DB test thiếu migration. Typecheck api và web sạch |

## 5. Biên bản nghiệm thu

| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 6. Lịch sử thay đổi

| Ngày | Thay đổi |
|---|---|
| 26/11/2026 | Tạo theo yêu cầu (đối chiếu file Excel công thức đặt hàng, mỗi NCC một sheet) |
| 26/11/2026 | Bổ sung: thiết kế lại thanh công cụ thành 2 hàng, ô bật ra *Cách chia*, ô tích *Thiếu do kho hết* |
