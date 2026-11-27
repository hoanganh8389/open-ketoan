# Test case phân quyền theo chi nhánh × màn × nút — demo Ớt Chuông

> Bản thử (nhánh `thu/phan-quyen-man-hinh`, chưa vào main). Kế toán demo: **http://localhost:8088** · đơn vị **`otchuong`**.
> Ngày dựng dữ liệu thử: 14/11/2026. Máy đã chạy tự động toàn bộ các ca dưới đây qua API: **21/21 đạt** — bạn bấm lại trên giao diện để xác nhận phần hiển thị (menu, nút, thông báo).

## 0. Chuẩn bị

**Tài khoản thử** — mật khẩu chung **`Thu@OtChuong1`**, đơn vị `otchuong`:

| # | Email | Vai trò chính | Gán thêm (HT12) | Ý nghĩa |
|---|---|---|---|---|
| A | `thu.ketoan-oc01@otchuong.local` | Người xem | Kế toán **tại OC01** | Kế toán chỉ phụ trách 1 cửa hàng |
| B | `thu.hai-chi-nhanh@otchuong.local` | Người xem | "THU - Lập kiểm kê" **tại OC01** + Kế toán **tại OC02** | Mỗi chi nhánh một bộ quyền khác nhau |
| C | `thu.thu-quy@otchuong.local` | Kế toán | Hạn chế "THU - Thủ quỹ chỉ phiếu thu" (Cấm lập phiếu chi / báo nợ / báo có) | Thủ quỹ chỉ thu tiền |
| D | `thu.mua-hang@otchuong.local` | Kế toán | Hạn chế "THU - Không duyệt mua, không xoá ĐVT" | Kế toán không có quyền duyệt |
| E | `thu.nguoi-xem@otchuong.local` | Người xem | — | Chỉ xem |
| F | `thu.an-kiem-ke@otchuong.local` | Người xem | Hạn chế "THU - Ẩn kiểm kê" (Cấm xem kiểm kê) | Ẩn hẳn một màn |

Vai trò "THU - Lập kiểm kê": nền Người xem, Cho `kho:kiem-ke-lap`, `kho:kiem-ke-sua`, `kho:chuyen-kho-xem`.

**Mẹo:** mở mỗi tài khoản ở một cửa sổ ẩn danh riêng để so sánh song song. Đổi chi nhánh làm việc bằng nút trên thanh trên cùng (**Alt + B**).

Đánh dấu cột *Kết quả*: ✅ đúng · ❌ sai (ghi lại hiện tượng, chụp màn hình).

---

## TC01 — Kế toán chỉ phụ trách OC01 (tài khoản A)

| # | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| 1 | Đăng nhập A | Nút chi nhánh trên thanh trên cùng hiện **OC01 Ớt Chuông Mart - Vũ Trọng Phụng**, bấm / Alt + B **không mở** danh sách (chỉ 1 chi nhánh) | ☐ |
| 2 | Hệ thống → HT04 Chi nhánh làm việc | Danh sách chỉ có **OC01**; dòng ghi "Bạn được làm việc ở 1 chi nhánh: OC01…" | ☐ |
| 3 | Kho → Kiểm kê kho | Có nút **+ Thêm**; mở một biên bản nháp thấy **Ghi**, **Ghi nhận chênh lệch** | ☐ |
| 4 | Quỹ → Phiếu chi | Có nút **Thêm** | ☐ |
| 5 | Kho → Kiểm kê kho → Thêm → đổi ô Chi nhánh sang **OC02** → Ghi | Báo lỗi **"Bạn không làm việc ở chi nhánh OC02 — chỉ ở: OC01"**, không lưu | ☐ |
| 6 | Lập phiếu ở OC01 bình thường (tuỳ chọn) | Lưu được | ☐ |

## TC02 — Một người, hai chi nhánh, hai bộ quyền (tài khoản B)

| # | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| 1 | Đăng nhập B, Alt + B | Danh sách chỉ **OC01, OC02** | ☐ |
| 2 | Chọn **OC01** → Kho → Kiểm kê kho | Có **+ Thêm**; trong biên bản nháp có **Ghi**, **không có Ghi nhận chênh lệch** | ☐ |
| 3 | Vẫn OC01 → Kho → Phiếu chuyển kho | **Không có** + Thêm / Nhận hàng / Huỷ; nút Sửa thành **Xem** | ☐ |
| 4 | Alt + B → chọn **OC02** (không cần tải lại) | Kiểm kê: thấy đủ nút gồm **Ghi nhận chênh lệch**, Xác minh, Quyết định; Phiếu chuyển kho: đủ **Thêm, Sửa, Nhận hàng, Từ chối, Huỷ** | ☐ |
| 5 | Ở OC02 → Phiếu chuyển kho → Thêm: xuất **OC01** → nhận OC02 → Ghi | Báo lỗi **không có quyền** (ở OC01 B chỉ được xem chuyển kho) | ☐ |
| 6 | Ở OC02 → Kiểm kê → Thêm, chi nhánh **OC03** → Ghi | Báo **"Bạn không làm việc ở chi nhánh OC03"** | ☐ |
| 7 | Quỹ, Mua hàng… khi đang ở OC01 | Các nút ghi ẩn (vai trò tại OC01 chỉ có kiểm kê); sang OC02 thì hiện như Kế toán | ☐ |

## TC03 — Thủ quỹ chỉ lập phiếu thu (tài khoản C)

| # | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| 1 | Đăng nhập C, Alt + B | Thấy **mọi** chi nhánh (không gán theo chi nhánh) | ☐ |
| 2 | Quỹ → Phiếu thu | Có **Thêm** | ☐ |
| 3 | Quỹ → Phiếu chi / Chi tiền gửi (báo nợ) / Thu tiền gửi (báo có) | **Không có** nút Thêm | ☐ |
| 4 | Quỹ → Thu, chi tiền (màn gộp) → Thêm phiếu chi (nếu có đường mở) | Lưu bị chặn: **"Không có quyền "Thêm" ở màn Phiếu chi"** | ☐ |
| 5 | Lập 1 phiếu thu thử (tuỳ chọn) | Lưu được | ☐ |

## TC04 — Kế toán không được duyệt chứng từ mua, không xoá đơn vị tính (tài khoản D)

| # | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| 1 | Mua hàng → Tổng hợp chứng từ (MH11) → mở một chứng từ | Có **Ghi, Sửa, Gửi duyệt, Huỷ**; **không có Duyệt** | ☐ |
| 2 | Danh mục → Đơn vị tính → Thêm một ĐVT "THU test" | Thêm được | ☐ |
| 3 | Xoá ĐVT "THU test" | Báo **"Không có quyền "Xoá" ở màn Đơn vị tính"** (ĐVT còn nguyên — nhờ admin xoá sau) | ☐ |

## TC05 — Người xem (tài khoản E)

| # | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| 1 | Kho → Phiếu chuyển kho, Kiểm kê kho | Chỉ xem: **không có** + Thêm, Ghi, Nhận hàng, Huỷ | ☐ |
| 2 | Quỹ → Phiếu thu / Phiếu chi | Không có Thêm | ☐ |
| 3 | Mua hàng → chứng từ mua | Không có nút ghi / duyệt | ☐ |
| 4 | Báo cáo (vd Nhập xuất tồn ACC83) | Xem bình thường | ☐ |

## TC06 — Ẩn hẳn một màn (tài khoản F)

| # | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| 1 | Mở menu Kho | **Không có** mục **Kiểm kê kho**; vẫn có **Phiếu chuyển kho** | ☐ |
| 2 | Gõ thẳng địa chỉ `http://localhost:8088/kho/kiem-ke` | Danh sách không tải được (báo không có quyền) | ☐ |

## TC07 — Tài khoản thật đang gán theo chi nhánh: `trainghiem@gmail.com`

Gán ở HT12: vai trò đơn vị **ktt01 tại OC01** + **Người xem tại OC02**; vai trò chính Người xem.

| # | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| 1 | Đăng nhập (mật khẩu của bạn), Alt + B | Chỉ **OC01, OC02** | ☐ |
| 2 | Các màn nghiệp vụ | Hiện chỉ xem — vì `ktt01` (nền Người xem) **chưa có luật Cho nào**. Muốn thử lập phiếu ở OC01: HT12 → vai trò ktt01 → Cho quyền (vd `quy:phieu-thu-lap`, `documents:write`) | ☐ |

## TC08 — Tự dựng tình huống của bạn (admin `otchuong`)

| # | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| 1 | HT12 → Vai trò của đơn vị → Thêm vai trò **Hạn chế**, Cấm 1 quyền chi tiết bất kỳ (vd `ke-toan:phieu-ke-toan-lap`, `tai-san:the-tai-san-lap`, `thue:to-khai-gtgt-luu`, `mua-hang:chinh-sach-xoa`) | Lưu được; quyền chi tiết hiện trong danh sách quyền | ☐ |
| 2 | Gán cho tài khoản C hoặc D, đăng nhập lại tài khoản đó | Nút tương ứng **biến mất**; bấm qua đường khác thì máy chủ báo **"Không có quyền "…" ở màn …"** | ☐ |
| 3 | HT12 → Người dùng → gán vai trò Kế toán **tại một chi nhánh** (vd OC03) cho tài khoản E | E đăng nhập lại: Alt + B chỉ OC03; ở OC03 có đủ nút Kế toán | ☐ |
| 4 | Thu hồi lần gán ở bước 3 | E đăng nhập lại: trở về Người xem, mọi chi nhánh | ☐ |

---

## Biết trước (chưa làm trong bản thử)

- **Báo cáo / danh sách chưa lọc theo chi nhánh**: tài khoản A vẫn xem được số liệu OC02 nếu tự chọn ở bộ lọc báo cáo.
- Một số nút trong **form dùng chung** (phiếu thu / chi chi tiết, form mặt hàng, cơ cấu tổ chức) chưa ẩn — **máy chủ vẫn chặn** khi bấm.
- **Sửa / Duyệt phiếu bán, trả lại** (BH10, BH11) mới chỉ ẩn nút (màn còn dữ liệu mẫu).
- Danh mục chưa có quyền **Xem** chi tiết (menu Danh mục không ẩn theo quyền).

## Dọn dữ liệu thử sau khi test

Tài khoản `thu.*@otchuong.local` và 4 vai trò `thu_*` (nhãn "THU - …") tạo ở đơn vị `otchuong`. Dọn: HT01 khoá 6 tài khoản `thu.*`; HT12 thu hồi lần gán và ngừng 4 vai trò "THU - …". ĐVT / phiếu bạn tự lập trong khi test cũng xoá / huỷ như thường.
