# NT-BH-056 · Đề nghị điều chuyển — loại phiếu mới ở kế toán (KHO04), duyệt sinh phiếu chuyển kho KHO01
<!-- [2026-11-28 10:00 AM Võ Hoàng] NGHIEM-THU — tạo phiếu, Đã chốt (Hoàng 28/11) (đóng góp) -->

| | |
|---|---|
| Phân hệ | Kho (menu Kho, cạnh KHO01 Chuyển kho) |
| Màn hình | KHO04 Đề nghị điều chuyển (`/app/de-nghi-dieu-chuyen`, module `de-nghi-dieu-chuyen`); máy bán: "Tạo phiếu đề nghị điều chuyển", "Danh sách đề nghị" |
| Bộ phận yêu cầu | Bán hàng / Kho (Hoàng) |
| Ngày tạo | 28/11/2026 |
| Trạng thái | Đã chốt — Hoàng 28/11: đề nghị điều chuyển là loại phiếu mới ở kế toán, menu Kho, duyệt sinh KHO01 |
| Trụ cột / tiêu chí | không đổi mức trụ cột (máy bán thôi ghi bảng `wp_global_po_adjustment` của website) |

## 1. Mục đích quản trị
Cửa hàng thừa hàng / hàng chậm bán đề nghị chuyển hàng của mình sang chi nhánh cha hoặc cửa hàng cùng cha. Trước đây đề nghị nằm ở bảng
`wp_global_po_adjustment` của website, kế toán không thấy; duyệt xong phải lập tay phiếu chuyển kho. Từ phiếu này:
- Đề nghị là **loại phiếu của kế toán** (KHO04), lập ở máy bán hoặc ở kế toán, cùng một danh sách.
- **Duyệt = lập phiếu chuyển kho KHO01** bằng đúng lệnh KHO01 (xuất luôn, hàng đi đường tới khi chi nhánh nhận bấm Nhận hàng / Từ chối) — hạch toán y như KHO01 lập tay.
- Máy bán vẫn dùng bảng website khi chưa nối kế toán (như các màn khác).

## 2. Khai báo trước
- Cây chi nhánh (MH15): cửa hàng có chi nhánh cha; mỗi chi nhánh có kho mặc định (kho bán).
- Quyền (HT12): `de-nghi-dieu-chuyen:xem`, `:lap` (mặc định cả staff), `:duyet` (chủ đơn vị, kế toán trưởng, kế toán). Người duyệt cần thêm `kho:chuyen-kho-lap`.
- Vé máy bán mang `de-nghi-dieu-chuyen:xem` + `:lap` (không có duyệt).

## 3. Các bước thao tác
1. Máy bán → Tạo phiếu đề nghị điều chuyển (hoặc KHO04 → + Thêm): chọn chi nhánh nhận, khách (tuỳ chọn), lý do, ghi chú, mặt hàng + SL (+ lô, hạn dùng) → Lưu. Đề nghị **Chờ duyệt**, số `DNDC-<chi nhánh>-<yyMM>-<0000>`.
2. Trong ngày người lập còn sửa / huỷ đề nghị Chờ duyệt.
3. Người duyệt mở KHO04 → Xem / Duyệt → **Duyệt (lập chuyển kho)**: kiểm lại tồn, lập KHO01 xuất luôn từ kho mặc định chi nhánh đề nghị sang kho mặc định chi nhánh nhận; đề nghị → **Đã lập chuyển kho**, hiện số KHO01. Hoặc **Từ chối** (lý do ≥ 5 ký tự).
4. Chi nhánh nhận xác nhận ở KHO01 Chuyển kho (Nhận hàng / Từ chối) như phiếu chuyển kho thường.

## 4. Số liệu đầu vào (test `apps/api/test/nt-bh-056-de-nghi-dieu-chuyen.test.ts`)

| Chi nhánh | Cha | Kho mặc định | Tồn SUA01 |
|---|---|---|---|
| CN01 | — | CN01-KT | 0 |
| CH02 | CN01 | CH02-K1 | 10 |
| CH03 | CN01 | CH03-K1 | 0 |
| HN01 | — | HN01-K1 | 0 |

Thu ngân CH02 (vai trò gán tại CH02: xem + lập). Chủ đơn vị duyệt.

## 5. Kết quả mong đợi
- Chi nhánh nhận của CH02: CN01 (cha, đứng đầu), CH03. HN01 → chặn `DNDC_TO_NOT_ALLOWED`.
- Lập 7 + 4 SUA01 (tồn 10) → chặn `DNDC_OVER_STOCK` "Sản phẩm SUA01 chỉ còn 10, không thể điều chuyển 11".
- Lập 4 → Chờ duyệt `DNDC-CH02-<yyMM>-0001`; sửa còn 3 → phiên bản 2; gửi phiên bản 1 → CONFLICT.
- Thu ngân bấm duyệt / từ chối → FORBIDDEN.
- Duyệt: KHO01 CH02-K1 → CN01-KT, 3 SUA01, xuất luôn, ghi chú có số đề nghị; tồn CH02-K1 giảm 3; đề nghị Đã lập chuyển kho; ghi lại cùng KHO01 không ghi hai lần; sau đó sửa / từ chối → CONFLICT.
- Từ chối lý do "ko" → chặn `DNDC_REASON_REQUIRED`; lý do đủ → Từ chối. Huỷ của người lập → Đã huỷ; duyệt đề nghị đã huỷ → CONFLICT.

## 6. Tiêu chí PASS / FAIL
PASS khi 7 ca test tích hợp + 6 ca test luật của module xanh; KHO01 sinh ra đúng chi nhánh / kho / SL, trạng thái đề nghị đúng; máy bán (nối kế toán) lập và xem được đề nghị, không thấy giá vốn.

## 7. Trạng thái — ánh xạ từ máy bán cũ

| Máy bán cũ (`wp_global_po_adjustment`) | KHO04 |
|---|---|
| pending — Chờ duyệt | `pending` Chờ duyệt |
| approved — Đã duyệt | `approved` (chỉ thoáng qua lúc đang lập KHO01; lập xong → `converted`) |
| converted — Đã chuyển | `converted` Đã lập chuyển kho (mang số KHO01) |
| rejected — Từ chối | `rejected` Từ chối (lý do) |
| cancelled — Đã huỷ | `cancelled` Đã huỷ |

## 8. Mặc định đã áp (cần Hoàng xác nhận nếu khác)
1. Không có trạng thái nháp — lưu là Chờ duyệt (như máy bán cũ).
2. Người lập chỉ sửa / huỷ đề nghị Chờ duyệt của chi nhánh mình, lập **hôm nay** (như máy bán cũ); người duyệt sửa / huỷ mọi lúc khi còn chờ.
3. Duyệt lập KHO01 **xuất luôn** (`mode: ship`) sang **kho mặc định** của chi nhánh nhận; chi nhánh nhận xác nhận ở KHO01.
4. Người duyệt cần thêm `kho:chuyen-kho-lap` (vì duyệt là lập KHO01 bằng phiên của họ).
5. Lý do giữ dạng mã tự do (mặc định trống; máy bán cũ mặc định XCKho) — KHO01 dùng lý do chuyển kho mặc định của nó.
6. Min / max tồn không lưu (máy bán cũ chỉ hiện tham khảo).
7. Đề nghị không vào sổ chứng từ chung (không phải chứng từ ghi sổ); KHO01 sinh ra mới vào sổ.
8. Đơn giá trên dòng chỉ là giá bán tham khảo từ máy bán; không có giá vốn ở đề nghị.
9. Chưa có mẫu in riêng cho đề nghị (in phiếu KHO01 sau khi duyệt); danh sách xuất Excel được.
10. "Xoá tất cả đề nghị" của máy bán cũ không làm ở kế toán (chỉ huỷ từng đề nghị).
