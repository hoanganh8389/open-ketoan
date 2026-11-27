# Test case nhánh tích hợp `tich-hop/phan-quyen-thu` — hiện trạng cũ và thay đổi

> Chỉ ở máy local, **chưa đẩy lên**. Dựng ngày 14/11/2026 từ `main` mới nhất (7726968c) gộp ba nhánh:
>
> | Phần | Nhánh gộp vào | Repo |
> |---|---|---|
> | 1. Gắn site ↔ cửa hàng (NT-HT-002) | `feat/nt-ht-002-gd1-ket-noi-site` (+ giữ chỗ) | kế toán + WP `tgs_accounting_bridge` |
> | 2. Phân quyền theo màn × nút (bản thử) | `thu/phan-quyen-man-hinh` | kế toán |
> | 3. Quyền theo chi nhánh (bản thử) | `thu/phan-quyen-man-hinh` | kế toán |
> | 4. Kiểm chuẩn phân quyền S028-11 | `feat/phase-028-s028-11-sc-auth` (+ giữ chỗ) | kế toán |
>
> **Môi trường:** kế toán **http://localhost:8088** (đơn vị `otchuong`), WP **http://localhost:8080**. Cả hai đang chạy nhánh tích hợp.
> **Máy đã chạy:** `npm test` 2133 đạt (3 lỗi có sẵn, xem cuối tệp) · typecheck sạch · tự kiểm bộ kiểm chuẩn ĐẠT · phân quyền trên Ớt Chuông 21/21 · NT-HT-002 trên WP demo đạt.
>
> Đánh dấu cột *Kết quả*: ✅ đúng · ❌ sai (ghi hiện tượng, chụp màn hình).

**Tài khoản thử** (đơn vị `otchuong`, mật khẩu chung **`Thu@OtChuong1`**):

| # | Email | Vai trò chính | Gán thêm ở HT12 |
|---|---|---|---|
| A | `thu.ketoan-oc01@otchuong.local` | Người xem | Kế toán **tại OC01** |
| B | `thu.hai-chi-nhanh@otchuong.local` | Người xem | "THU - Lập kiểm kê" **tại OC01** + Kế toán **tại OC02** |
| C | `thu.thu-quy@otchuong.local` | Kế toán | Hạn chế "THU - Thủ quỹ chỉ phiếu thu" |
| D | `thu.mua-hang@otchuong.local` | Kế toán | Hạn chế "THU - Không duyệt mua, không xoá ĐVT" |
| E | `thu.nguoi-xem@otchuong.local` | Người xem | — |
| F | `thu.an-kiem-ke@otchuong.local` | Người xem | Hạn chế "THU - Ẩn kiểm kê" |

---

## Phần 1 — Gắn site WP ↔ cửa hàng, kế toán làm gốc (NT-HT-002)

| | Hiện trạng cũ (main) | Sau thay đổi |
|---|---|---|
| Ai tạo cửa hàng bên kế toán | Cầu nối WP **tự tạo** khi gửi chứng từ đầu tiên (`ensure_branch`); từ 14/11 thêm `TGS_Acc_Branch_Sync` tự tạo khi gắn phân cấp / site mới | **Chỉ kế toán tạo** (Cơ cấu tổ chức / DM02). Khoá API của WP tạo / sửa / xoá cửa hàng, kho, cơ cấu → **403** |
| Site thuộc cửa hàng nào | Suy từ Cấu hình phân cấp (chi nhánh HTsoft), không có thì mã site | **Gắn rõ** site ↔ cửa hàng (một cửa hàng một site), lưu ở kế toán |
| Gắn lúc nào | Không có bước gắn | Lúc **tạo site** (ô "Cửa hàng (phần mềm kế toán)") hoặc màn **Kết nối cửa hàng** |
| Kế toán biết cửa hàng có site chưa | Không (cột Website đọc cấu hình bên WP) | DM02 có cột **Kết nối / Website**; form cửa hàng có dòng **Website** |
| Site chưa gắn | Vẫn gửi, có thể sinh cửa hàng rác | **Chặn gửi**, nhật ký báo lý do; không báo huỷ nhầm |

> ⚠ Hiện cả 7 site Ớt Chuông đang **chưa gắn** → chứng từ WP demo **không gửi** sang kế toán cho tới khi làm bước 1.1.

| # | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| 1.1 | WP (quản trị mạng) → Quản trị → Kế toán → **Kết nối cửa hàng** (`/wp-admin/admin.php?page=tgs-shop-management&view=acc-site-link`) | Bảng 7 site, tất cả **"Chưa gắn — không gửi chứng từ"** | ☐ |
| 1.2 | Bấm **Gợi ý theo mã site** | Điền sẵn blog 2–7 → OC01, OC02, OCKHO, OC03, OC04, OC05; **blog 1 (site tổng) không gợi ý** | ☐ |
| 1.3 | **Gắn các dòng đã chọn** | 6 dòng thành **Đã gắn** | ☐ |
| 1.4 | Kế toán → Danh mục → **Chi nhánh (DM02)** | Cột **Kết nối = Đã** cho 6 cửa hàng; dòng đầu màn: còn **CN01, OCVP chưa kết nối** | ☐ |
| 1.5 | Mở cửa hàng **OC01** (DM02 hoặc Cơ cấu tổ chức) | Dòng **Website: "Đã kết nối: blog 2 · địa chỉ · tên · lúc · người gắn"** | ☐ |
| 1.6 | Kế toán → Cơ cấu tổ chức → thêm cửa hàng **OC06** | OC06 hiện **"Chưa kết nối website"** | ☐ |
| 1.7 | WP → Mạng → Sites → **Thêm mới** | Có ô **Cửa hàng (phần mềm kế toán)**, chỉ liệt kê cửa hàng chưa có site (**CN01, OC06, OCVP**) | ☐ |
| 1.8 | Để trống ô cửa hàng → Thêm site | **Không cho tạo**: "Chọn cửa hàng…" | ☐ |
| 1.9 | Chọn **OC06** → Thêm site | Tạo được blog 8; kế toán: OC06 **"Đã kết nối: blog 8"** | ☐ |
| 1.10 | Kết nối cửa hàng → blog 3 → **Bỏ gắn / đổi** (ghi lý do ≥ 10 ký tự) → bán 1 đơn ở site blog 3 | Nhật ký gửi: **"Site blog 3 chưa gắn cửa hàng…"**, kế toán không nhận đơn | ☐ |
| 1.11 | Gắn lại blog 3 → OC02 → Cổng kế toán → **Gửi lại** | Đơn vào kế toán ở **OC02** | ☐ |
| 1.12 | Thử gắn blog khác vào OC02 (đã có blog 3) | Từ chối: **"Cửa hàng OC02 đã kết nối blog 3"** | ☐ |
| 1.13 | (Quản trị kế toán) DM02 → OC06 → **Bỏ kết nối** | Hỏi lý do; bỏ được (dùng khi site đã xoá bên WP) | ☐ |

Dọn sau phần 1: xoá site blog 8 (Mạng → Sites) và cửa hàng OC06 (DM02) nếu không giữ.

---

## Phần 2 — Phân quyền theo màn × nút (62 màn, 8 phân hệ)

| | Hiện trạng cũ (main) | Sau thay đổi |
|---|---|---|
| Quyền ghi | Vài quyền chung: `documents:write` gác ~80 lệnh, `catalog:write` ~100 lệnh — có quyền là thấy / làm **mọi** loại phiếu, mọi danh mục | Mỗi phân hệ **tự đăng ký** màn + từng thao tác (Xem, Thêm, Sửa, Huỷ, Duyệt, nút riêng) + vai trò mặc định; **máy chủ chặn đúng từng thao tác** |
| Nút trên màn | 74 / 146 màn không ẩn nút theo quyền; màn có ẩn thì theo quyền chung | Nút **ẩn** khi không có quyền thao tác đó |
| Menu | Không ẩn theo quyền màn | Màn **không có quyền Xem → ẩn khỏi menu** |
| Người đang dùng | — | **Không ai mất quyền**: quyền chung cũ kéo theo quyền chi tiết. Thu hẹp bằng **Cấm** quyền chi tiết ở HT12 |

| # | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| 2.1 | Đăng nhập **admin** → HT12 → Vai trò → xem danh sách quyền | Có quyền chi tiết theo màn: `quy:phieu-thu-lap`, `mua-hang:chung-tu-duyet`, `kho:kiem-ke-ghi-nhan`, `he-thong:don-vi-tinh-xoa`… | ☐ |
| 2.2 | Đăng nhập **C** (Thủ quỹ) → Quỹ → Phiếu thu | Có **Thêm** | ☐ |
| 2.3 | C → Quỹ → Phiếu chi / Chi tiền gửi / Thu tiền gửi | **Không có Thêm** | ☐ |
| 2.4 | C → Thu, chi tiền (màn gộp) → cố lập phiếu chi | Máy chủ báo **"Không có quyền "Thêm" ở màn Phiếu chi"** | ☐ |
| 2.5 | Đăng nhập **D** → Mua hàng → Tổng hợp chứng từ → mở chứng từ | Có Ghi / Sửa / Gửi duyệt / Huỷ; **không có Duyệt** | ☐ |
| 2.6 | D → Danh mục → Đơn vị tính → thêm "THU test" rồi xoá | Thêm được; xoá báo **"Không có quyền "Xoá" ở màn Đơn vị tính"** | ☐ |
| 2.7 | Đăng nhập **E** (Người xem) → Kho, Quỹ, Mua hàng | Mọi màn chỉ xem: không Thêm / Sửa / Huỷ / Duyệt | ☐ |
| 2.8 | Đăng nhập **F** → menu Kho | **Không có Kiểm kê kho**, vẫn có Phiếu chuyển kho; gõ thẳng `/kho/kiem-ke` → không tải được danh sách | ☐ |
| 2.9 | Đăng nhập **kế toán thường** bất kỳ (không vai trò THU) | Mọi nút **như trước** (không mất quyền) | ☐ |
| 2.10 | Admin → HT12 → vai trò hạn chế mới, Cấm 1 quyền (vd `ke-toan:phieu-ke-toan-lap`, `tai-san:the-tai-san-lap`, `thue:to-khai-gtgt-luu`) → gán cho C → C đăng nhập lại | Nút tương ứng biến mất; gọi qua đường khác bị chặn kèm tên màn | ☐ |

---

## Phần 3 — Quyền theo chi nhánh

| | Hiện trạng cũ (main) | Sau thay đổi |
|---|---|---|
| Gán vai trò "tại chi nhánh" (HT12) | Chỉ **cộng** quyền nộp chứng từ ở cửa nạp; **không giới hạn** ai | Quyền của vai trò đó **chỉ có hiệu lực ở chi nhánh đó**; người có lần gán theo chi nhánh **chỉ làm việc ở các chi nhánh đó** |
| Nút chi nhánh làm việc (Alt + B), HT04 | Hiện **mọi** chi nhánh, chọn tự do (chỉ lưu ở trình duyệt) | Chỉ hiện chi nhánh được gán; **1 chi nhánh → cố định**; đổi chi nhánh → **menu / nút đổi theo** |
| Lập / sửa phiếu chi nhánh khác | Được | **403 "Bạn không làm việc ở chi nhánh …"**; chuyển kho: chi nhánh **xuất** phải trong phạm vi, chi nhánh **nhận** tự do |
| Người không gán theo chi nhánh, chủ đơn vị, khoá API | — | Như cũ: mọi chi nhánh |

| # | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| 3.1 | Đăng nhập **A** | Nút chi nhánh cố định **OC01**, Alt + B không mở | ☐ |
| 3.2 | A → HT04 | Chỉ **OC01** + dòng "Bạn được làm việc ở 1 chi nhánh: OC01" | ☐ |
| 3.3 | A → Kiểm kê → Thêm, chi nhánh **OC02** → Ghi | **"Bạn không làm việc ở chi nhánh OC02 — chỉ ở: OC01"** | ☐ |
| 3.4 | Đăng nhập **B**, Alt + B | Chỉ **OC01, OC02** | ☐ |
| 3.5 | B ở **OC01** → Kiểm kê / Phiếu chuyển kho | Kiểm kê: Thêm, Ghi; **không có Ghi nhận chênh lệch**. Chuyển kho: chỉ Xem | ☐ |
| 3.6 | B đổi sang **OC02** (không tải lại trang) | Kiểm kê đủ nút (Ghi nhận, Xác minh, Quyết định); Chuyển kho đủ Thêm / Sửa / Nhận / Từ chối / Huỷ | ☐ |
| 3.7 | B ở OC02 → chuyển kho xuất **OC01** → OC02 | Bị chặn (ở OC01 B chỉ được xem chuyển kho) | ☐ |
| 3.8 | B → lập phiếu ở **OC03** | **"Bạn không làm việc ở chi nhánh OC03"** | ☐ |
| 3.9 | Admin → HT12 → gán Kế toán **tại OC03** cho E → E đăng nhập lại | Alt + B chỉ **OC03**, ở OC03 đủ nút Kế toán; thu hồi lần gán → E về Người xem, mọi chi nhánh | ☐ |
| 3.10 | Tài khoản thật **`trainghiem@gmail.com`** (ktt01 tại OC01, Người xem tại OC02) | Chỉ **OC01, OC02**; chỉ xem (vai trò `ktt01` chưa có luật Cho) | ☐ |

---

## Phần 4 — Kiểm chuẩn phân quyền S028-11 (cho người phát triển)

| | Hiện trạng cũ (main) | Sau thay đổi |
|---|---|---|
| SC-AUTH-03 | **Lỗi**: `route-giu.json` còn `POST /api/v1/posting-rules/simulate` (route đã bỏ) | Đạt 100 |
| Số luật SC-AUTH | 3 / 12 (03, 04, 11) | **12 / 12** — thêm 01, 02, 05–10, 12 (mức cảnh báo, có ca tự kiểm) |
| Bản chụp sổ quyền | Không có | `docs/standard/quyen.json` (18 quyền Core, **225** quyền module) — đổi cây quyền thành diff khi duyệt PR |
| Phát hiện trên main | — | Key menu Kho trùng → đã sửa; chế độ Vận hành theo `ADMIN_ROLES`; 26 quyền chưa có test → đã thêm test |

| # | Lệnh | Mong đợi | Kết quả |
|---|---|---|---|
| 4.1 | `node tests/conformance/selfcheck.mjs --self-test` | **KẾT QUẢ TỰ KIỂM: ĐẠT** (ca tự kiểm 9 luật mới ở `fixtures/authz-w6-bad`) | ☐ |
| 4.2 | `node tests/conformance/selfcheck.mjs \| grep SC-AUTH` | 12 dòng SC-AUTH; 03 = 100 | ☐ |
| 4.3 | `node scripts/phan-quyen/quyen-snapshot.mjs --check` | "docs/standard/quyen.json khớp" | ☐ |
| 4.4 | Sửa tay risk một quyền trong manifest, chạy lại 4.3 / selfcheck | Báo lỗi thời; SC-AUTH-05 báo đổi risk không `replaces` (hoàn tác sau khi thử) | ☐ |
| 4.5 | `cd apps/api && npx vitest run test/quyen-loai-chung-tu.test.ts test/phan-quyen-*.test.ts` | Đạt hết | ☐ |

Phát hiện bộ kiểm báo trên chính bản thử (đã biết, ghi để duyệt):
- SC-AUTH-06: `quyen-chi-nhanh.ts` (2 chỗ `role === 'owner'`), `packages/platform/src/core/documents.ts` (lõi — chờ Nhóm Lõi).
- SC-AUTH-10 / 11 mức cảnh báo: nhiều quyền mới của bản thử chưa có test riêng / được gác qua `lenh` (bộ kiểm tìm chuỗi nguyên văn).
- SC-LAYER-2: phân hệ import `phan-he/man-hinh.ts` — cần khai sổ đăng ký màn là tệp dùng chung trong bảng lớp (tệp Lõi).

---

## Phần 5 — Sửa lỗi logic phân quyền (commit ee55e8f8) và HT12 mới

Tài khoản thêm (mật khẩu `Thu@OtChuong1`):

| # | Email | Vai trò chính | Gán thêm |
|---|---|---|---|
| G | `thu.cho-rieng@otchuong.local` | Người xem | "THU - Chỉ Cho riêng phiếu thu, thêm ĐVT, thêm người dùng" |
| H | `thu.han-che-oc02@otchuong.local` | Kế toán | Hạn chế "THU - Cấm lập phiếu chi" **tại OC02** |
| I | `thu.an-ket-chuyen@otchuong.local` | Kế toán | Hạn chế "THU - Ẩn Kết chuyển" |
| J | `thu.khong-sua-ban@otchuong.local` | Kế toán | Hạn chế "THU - Không sửa phiếu bán" |

| | Hiện trạng cũ | Sau thay đổi |
|---|---|---|
| Cho riêng quyền chi tiết (Quỹ, Danh mục, Hệ thống, Bán hàng, Tài sản, Kế toán) | HT12 hiện ✓ nhưng máy chủ vẫn 403 (lõi đòi `documents:write` / `catalog:write`) | Có hiệu lực: mượn quyền gốc rủi ro thấp trong đúng lệnh đó |
| Thao tác cần quyền rủi ro cao (Người dùng, Khoá API, Cài đặt, Khoá kỳ, Kết chuyển…) | Không biết phải cấp kèm | HT12 hiện "+ users:write" / "+ settings:write" / "+ periods:lock" trên nút |
| Hạn chế gán tại chi nhánh | Không cấm được ở chi nhánh đó, lại khoá người dùng vào chi nhánh đó | Cấm đúng ở chi nhánh đó, chi nhánh khác như thường; nút ẩn theo chi nhánh đang làm việc |
| Cấm Xem | Chỉ ẩn menu, gọi API vẫn đọc được | Máy chủ chặn đọc ở 10 màn (Kết chuyển, Kỳ kế toán, Giá vốn, Định mức, Khấu hao, Hoá đơn rủi ro, Bổ sung TT thuế, Biến thể, ĐVT thùng, Chương trình bán) |
| Sửa phiếu bán / trả lại | Không kiểm | Gửi lại cùng mã chứng từ = Sửa, kiểm riêng với Thêm |
| HT12 Sửa vai trò | ~200 dòng rời, 137 quyền ở cột "Khác" | Thẻ theo phân hệ, mỗi màn một dòng, bật / tắt từng quyền; vai trò Hạn chế bấm = Cấm |

| # | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| 5.1 | Admin → HT12 → Vai trò → mở "THU - Lập kiểm kê" → thẻ **Kho** | Mỗi màn một dòng, các quyền là nút bật / tắt; xanh = Cho riêng, xám = có sẵn | ☐ |
| 5.2 | Mở "THU - Thủ quỹ chỉ phiếu thu" (Hạn chế) → thẻ **Quỹ** | Dải đỏ "bật là CẤM"; Thêm ở Phiếu chi / Báo nợ / Báo có đang bật đỏ ⛔ | ☐ |
| 5.3 | Mở "THU - Chỉ Cho riêng…" → thẻ **Hệ thống** | Nút Người dùng / Khoá API có chữ "+ users:write", Cài đặt "+ settings:write" | ☐ |
| 5.4 | Đăng nhập **G** → Quỹ → Phiếu thu → Thêm, lập 1 phiếu thử | Lưu được (trước: báo không có quyền); Phiếu chi không có Thêm | ☐ |
| 5.5 | G → Danh mục → Đơn vị tính → Thêm "THU G" | Thêm được; xoá thì báo không có quyền (nhờ admin xoá) | ☐ |
| 5.6 | Đăng nhập **H**, chi nhánh **OC02** → Quỹ → Phiếu chi | **Không có Thêm**; Alt + B vẫn thấy mọi chi nhánh | ☐ |
| 5.7 | H đổi sang **OC01** → Phiếu chi | Có Thêm, lập được | ☐ |
| 5.8 | H ở OC01 → Thêm phiếu chi, đổi ô chi nhánh sang OC02 → Ghi | **"Không có quyền "Thêm" ở màn Phiếu chi"** | ☐ |
| 5.9 | Đăng nhập **I** → Tổng hợp → Kết chuyển lãi / lỗ (gõ `/nghiep-vu/ket-chuyen`) | Không tải được dữ liệu, báo không có quyền Xem màn Kết chuyển | ☐ |
| 5.10 | J sửa một phiếu bán đã có (gửi lại từ POS / cầu nối dưới tài khoản J) | Báo **"Không có quyền "Sửa" ở màn Phiếu bán hàng"** | ☐ |

Máy đã chạy tự động trên demo: **14/14 đạt** (cùng 21/21 của bộ cũ).
Còn biết trước: Duyệt phiếu bán chưa có lệnh ở máy chủ; Xem của Nhà cung cấp, Chính sách mua, Cài đặt mua, Công thức đặt hàng, Nhập dữ liệu khởi đầu, Thẻ / Biến động / Loại tài sản, Người nộp thuế, Đối trừ công nợ chưa gác máy chủ (dùng lệnh đọc chung với màn khác); nút **Nhập Excel** ở Phiếu chi chưa ẩn theo Cấm tại chi nhánh.

## Lỗi test có sẵn (không do nhánh tích hợp)
- `nt-bh-003-pos-khuyen-mai`, `nt-bh-012-khuyen-mai-mo-rong`: chỉ lỗi khi chạy cả bộ song song; chạy riêng đạt.
- `e2-header-audit` (T004-E2-3): migration định danh 0136 / 0138 trên main thêm cột `branch_uid`… vào `ledger_entries` mà chưa cập nhật `E2_DB_COLUMNS` — báo người làm migration.

## Xung đột cần quyết trước khi lên main
- **WP `TGS_Acc_Branch_Sync` (Võ Hoàng, 14/11)** tự tạo chi nhánh bên kế toán từ Cấu hình phân cấp / site mới — **ngược** NT-HT-002 (kế toán làm gốc). Nhánh tích hợp **tắt dòng khởi động** của lớp đó (tệp vẫn giữ). Cần thống nhất với Võ Hoàng.
- Bản thử phân quyền (phần 2, 3) đổi cách tính quyền toàn hệ thống (móc toàn app ở `app.ts`) → cần phiếu nghiệm thu + Nhóm Lõi (Johnny) duyệt.

## Quay demo về main
- Kế toán: `git checkout main` rồi `docker compose build api web db-migrate && docker compose run --rm db-migrate && docker compose up -d api web` (cột `site_*` của 0139 để nguyên — chỉ thêm cột).
- WP: `git checkout main` trong `tgs_accounting_bridge`.
- Dọn dữ liệu thử: 10 tài khoản `thu.*`, 8 vai trò "THU - …" (HT01 / HT12); site / cửa hàng tạo ở phần 1.
