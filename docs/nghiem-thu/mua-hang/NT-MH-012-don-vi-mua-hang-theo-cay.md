# NT-MH-012 · Đơn vị mua hàng, kho tổng, shop tính theo cây cơ cấu hiện có (không bắt cấp 3)
<!-- [2026-11-25 kiennt] NGHIEM-THU — tạo phiếu theo yêu cầu người dùng (đóng góp) -->

| | |
|---|---|
| Phân hệ | Mua hàng (đọc cây Cơ cấu tổ chức DM16) |
| Màn hình | MH02 Phân tích đặt hàng · MH16 Tồn max · MH17 Phiếu đăng ký tồn max · MH18 Công thức đặt hàng · MH19 Chuyển hàng xuống shop |
| Bộ phận yêu cầu | Phòng kế toán (bảng bug kiểm thử: dòng #36, #37, #38) |
| Ngày tạo | 25/11/2026 |
| Trạng thái | Đã chốt (kiennt, 25/11/2026) |

## 1. Yêu cầu

**Hiện trạng.** Mỗi lần lưu Sơ đồ cơ cấu, máy tự tính đơn vị mua hàng, kho tổng và shop. Quy tắc tính là quy tắc ngầm:
- Chỉ đơn vị nằm **đúng cấp 3** (Công ty là cấp 1) mới được làm đơn vị mua hàng.
- Kho tổng phải có **mã 5 số đuôi `000`** (vd 07000).

Cây khai khác khuôn này thì không có chi nhánh nào được nhận, dù khai đúng nghiệp vụ. Các trường hợp như vậy:
- cây 2 cấp, hoặc 4 cấp trở lên;
- kho tổng đặt mã kiểu `KT-PT`.

Khi đó MH16, MH17, MH18 báo "Chưa có sơ đồ tổ chức" hoặc ô chọn chi nhánh để trống. Đây là nguyên nhân bug #36, #37, #38.

**Yêu cầu.** Không sửa màn Sơ đồ cơ cấu. Ưu tiên **loại đơn vị** người dùng đã khai ở sơ đồ (Chi nhánh / Cửa hàng / Kho tổng…) — bổ sung 25/11, kiennt chốt; cây chưa khai loại thì quy tắc **lai**: giữ quy tắc cũ ở chỗ nó đang chạy, thêm đường dự phòng cho cây khác khuôn.

> Vì sao không bỏ hẳn quy tắc cấp 3 (bổ sung 25/11, kiennt chốt): dữ liệu thật đặt **cửa hàng Lào Cai (nhánh LCI) lấy hàng từ kho tổng Phú Thọ 08000** — quy ước "cả nhánh cấp 3 PT dùng một kho tổng". Quy tắc "đơn vị mua hàng = cha trực tiếp của shop" sẽ biến 26000 Lào Cai thành kho tổng riêng → max, công thức, phiếu đang gắn 08000 không còn tính cho Lào Cai. Hình dạng cây không cho biết kho nào cấp cho shop nào, nên quy ước cấp 3 được giữ.

0. **Bước 0 — theo loại đơn vị (bổ sung 25/11):** sơ đồ tổ chức cho khai tự do (cây dev: Công ty › Miền "Kho Phú Thọ" › "Quản lý kho", "tỉnh Phú Thọ", phòng ban, cửa hàng…), nên đọc theo loại đơn vị đã khai thay vì bắt cấp / mã.
   - **Đơn vị mua hàng** = đơn vị loại **"Chi nhánh"** (không phân biệt hoa thường / dấu) đang hoạt động, có ít nhất một **"Cửa hàng"** bên dưới. Ô chọn chi nhánh ở MH02, MH16–MH19 chỉ liệt kê các đơn vị này (phòng ban, chi nhánh không có cửa hàng không hiện).
   - **Shop** = đơn vị loại **"Cửa hàng"** ở bất kỳ cấp nào bên dưới, thuộc **chi nhánh gần nhất** phía trên (chi nhánh lồng nhau: theo chi nhánh con). Đơn vị lá chưa khai loại cũng tính là shop như cũ; đơn vị khác (kho, văn phòng…) dưới chi nhánh **không** là shop.
   - **Kho tổng** = chính chi nhánh nếu nó có phân kho; không thì đơn vị bên dưới (thuộc chi nhánh đó, không phải cửa hàng) có phân kho, ưu tiên loại **"Kho tổng" / "Kho trung gian"** → mã `xx000` → tên có chữ "Kho" → nhiều phân kho nhất → mã nhỏ hơn.
   - Chi nhánh có cửa hàng mà không tìm được kho tổng → chuyển sang các bước dưới; vẫn không có thì cảnh báo (mục 3).
   - Lưu ý dữ liệu thật: nếu đơn vị con chứa cửa hàng Lào Cai cũng khai loại "Chi nhánh" thì Lào Cai tách khỏi 08000 (theo chi nhánh gần nhất) — muốn gộp thì đổi loại đơn vị con thành "Tỉnh".
1. **Bước 1 — như cũ (cấp 3), cho phần cây chưa theo bước 0:** đơn vị **cấp 3** (Công ty là cấp 1) đang hoạt động lấy kho tổng trong cả nhánh của nó; mọi cửa hàng trong nhánh là shop của kho tổng đó.
   - Kho tổng: đơn vị đang hoạt động trong nhánh, mã dạng `xx000` (như cũ) **hoặc tên có chữ "Kho"** (có phân kho). Ưu tiên `xx000` → tên có chữ "Kho" → nhiều phân kho nhất → mã nhỏ hơn. Nhánh đã có `xx000` thì chọn như cũ.
2. **Bước 2 — dự phòng (mới):** **shop chưa thuộc đơn vị mua hàng nào** sau bước 1 — shop = đơn vị **cuối cây** (không có đơn vị con), không phải đơn vị nhóm, đang hoạt động, **có hay chưa có phân kho** (như bước 1: cửa hàng chưa có kho vẫn là shop) — gom theo **đơn vị cha trực tiếp**. Cha đó thành đơn vị mua hàng nếu tìm được kho tổng:
   - chính đơn vị cha nếu nó có phân kho; hoặc
   - một đơn vị con trực tiếp của nó, đang hoạt động, có phân kho, mã `xx000` hoặc tên có chữ "Kho".
   - Ưu tiên: chính đơn vị cha → `xx000` → tên có chữ "Kho" → nhiều phân kho nhất → mã nhỏ hơn. Đơn vị được chọn làm kho tổng **không** tính là shop.
   - Nhờ bước này cây 2 cấp (Công ty › Chi nhánh › kho + shop), cây có nhánh cấp 3 chưa có kho tổng nhưng cấp dưới có, chi nhánh cấp 2 tự có phân kho (như Hưng Yên ở DB local), chạy được.
3. **Không tìm được kho tổng:** đơn vị đó không thành đơn vị mua hàng (dữ liệu tồn max, công thức lưu theo mã kho tổng).
   - Màn tồn max (MH02, MH16, MH17, MH18, MH19) cảnh báo **đích danh** đơn vị có cửa hàng chưa thuộc kho tổng nào, vd "Chưa nhận được kho tổng cho: Chi nhánh X (2 cửa hàng) — cần một đơn vị có phân kho, mã dạng xx000 hoặc tên có chữ Kho, nằm trong đơn vị đó".
   - Cảnh báo hiện cả khi các chi nhánh khác đã chạy; câu "Chưa có sơ đồ tổ chức" chỉ còn khi cây chưa có đơn vị nào.
4. **Cây đang chạy giữ nguyên kết quả:** cùng kho tổng, cùng danh sách shop, cùng đơn vị mua hàng.

**Ngoài phạm vi:**
- Cây có từ 4 cấp nhóm trở lên (Công ty › Miền › Vùng › Chi nhánh › …): cấp 3 (Vùng) vẫn gộp cả nhánh thành một đơn vị mua hàng như hiện nay.
- Kho tổng nằm **ngoài** chi nhánh (vd ở nhánh anh em "Quản lý kho", cửa hàng ở "tỉnh Phú Thọ"): phải đặt kho tổng vào dưới chi nhánh, hoặc khai loại "Chi nhánh" cho đơn vị chứa cả hai; chọn tay kho tổng ở Sơ đồ cơ cấu — tách phiếu khác.
- Đổi khoá dữ liệu tồn max từ mã kho tổng sang đơn vị mua hàng.

## 2. Phạm vi

- `apps/api/src/modules/co-cau/cay-tuong-thich.ts` (của Nguyễn Văn Thủy; đóng góp): hàm `syncBranchLevels` (cách chọn đơn vị mua hàng, kho tổng, shop). Ghi vào `branches.purchase_branch_id`, `branches.level`, `branches.parent_id`; không thêm cột, không migration.
- `apps/web/src/phan-he/mua-hang/ton-max/chung.tsx` (của Nguyễn Văn Thủy; đóng góp): `ChuaPhanCap` (dùng ở MH02, MH16, MH17, MH18, MH19) báo đích danh đơn vị chưa có kho tổng.
- `apps/web/src/phan-he/mua-hang/csdl/CsdlPage.tsx`: dòng mô tả quy tắc "đơn vị cấp 3 (kho mã xx000…)" sửa theo quy tắc mới.
- Bài kiểm thử `apps/api/test/nt-mh-012-don-vi-mua-hang.test.ts` (nhiều kiểu cây); bài cũ `apps/api/test/so-do-to-chuc.test.ts` (cây thật thu nhỏ) phải đạt nguyên như cũ.

**Chỗ đọc kết quả, phải kiểm lại (không sửa):**

| Chỗ đọc | Ảnh hưởng cần kiểm |
|---|---|
| API tồn max `hierarchy` / `treeOf` (MH02, MH16, MH17, MH18, MH19); ô chọn đơn vị mua hàng `purchase-units`; Quy trình mua hàng | Đúng chi nhánh, kho tổng, shop |
| Mẫu in / hồ sơ in (`print-profile.routes.ts`, `print-template.routes.ts`): shop kế thừa cài đặt in của cha theo `parent_id` | Shop mới được gán cha → đầu phiếu in có thể đổi |
| Luồng đồng bộ ra ngoài (`sync.service.ts`: `level`, `parent_code` của chi nhánh) | Máy khách đồng bộ nhận giá trị mới (cầu nối WP không đọc hai trường này) |
| MH15 phân cấp tay (`saveHierarchy`, `autoArrange`): bị khoá khi đã có đơn vị mua hàng tính từ cây | Tenant đang xếp tay ở MH15 sẽ bị khoá, phân cấp tay bị cây ghi đè |

**Không ảnh hưởng:**
- Bộ lọc cây đơn vị của báo cáo / kho / bảng giá / danh mục chi nhánh: tính thẳng từ hình dạng cây.
- Phân quyền theo chi nhánh: đọc `unit_parent_id`.

## 3. Kết quả mong đợi

| # | Thao tác | Mong đợi |
|---|---|---|
| 1 | **Đối chiếu trước khi đổi.** Chạy hàm cũ và hàm mới trên cây local (Phú Thọ, Hà Nội) và cây máy dev; liệt kê đơn vị đổi kho tổng / đổi shop | Cây đang chạy: **không đơn vị nào đổi kho tổng**. Có đơn vị đổi kho tổng → dừng, báo người yêu cầu trước khi làm tiếp |
| 2 | Cây thật thu nhỏ (bài `so-do-to-chuc.test.ts`): PT › PTO (08000, 08001) / LCI (26000, 26001Premium); ND › NDH (01000, 01001) | Như cũ: PT kho tổng 08000, **26000, 26001Premium vẫn là shop của 08000**; ND kho tổng 01000 |
| 3 | Cây 2 cấp: Công ty › Chi nhánh X › (X000 có phân kho, X001, X002) | Đơn vị mua hàng X, kho tổng X000, 2 shop. MH16, MH17, MH18 chọn được chi nhánh X |
| 4 | Nhánh cấp 3 không có `xx000` / "Kho" ở đâu cả, cấp dưới có đơn vị cha mà chính nó có phân kho | Đơn vị cha đó là đơn vị mua hàng, kho tổng là chính nó |
| 5 | Kho tổng mã `KT-PT`, tên "Kho tổng Phú Thọ" (cấp 3 hoặc dự phòng) | Nhận là kho tổng (theo tên có chữ "Kho") |
| 6 | Đơn vị có cửa hàng mà không có đơn vị nào đạt kho tổng | Không thành đơn vị mua hàng; màn tồn max cảnh báo đích danh đơn vị đó, số cửa hàng, lý do |
| 7 | Đơn vị đang tắt / cửa hàng chưa có phân kho | Đang tắt: không tính. Cửa hàng chưa có kho: vẫn là shop (như quy tắc cũ), không được làm kho tổng |
| 7b | Chi nhánh cấp 2 có phân kho, cửa hàng dưới nó chưa có kho (Hưng Yên: HY01 kho HY-HH › Shop Hoàn Long) | HY01 là đơn vị mua hàng, kho tổng HY01; Hoàn Long là shop; Hưng Yên hiện ở ô chọn chi nhánh |
| 7c | Theo loại: Miền › "tỉnh P" (Chi nhánh) › "Trung tâm phân phối" (Kho trung gian, 1 kho), "Văn phòng P" (Văn phòng, 2 kho), Huyện (Tỉnh) › 2 Cửa hàng (một chưa có kho) | Đơn vị mua hàng "tỉnh P", kho tổng Trung tâm phân phối (loại kho thắng văn phòng nhiều kho); 2 cửa hàng là shop; văn phòng không là shop |
| 7d | Chi nhánh lồng nhau: Chi nhánh H › Cửa hàng H1, Chi nhánh H con › Cửa hàng H2 | H1 shop của Chi nhánh H; H2 shop của Chi nhánh H con |
| 8 | MH02, MH16, MH17, MH18, MH19 trên cây local sau khi sửa | Số liệu, công thức, phiếu, max đã lưu như trước khi sửa |
| 9 | In một phiếu ở shop (cây có đổi cha) | Đầu phiếu in đúng; ghi lại nếu đổi |
| 10 | MH15 ở tenant chưa có đơn vị mua hàng từ cây | Ghi lại tenant nào chuyển từ xếp tay sang tính từ cây |

## 4. Kết quả chạy
| | |
|---|---|
| Ngày chạy | 25/11/2026 (máy dev; kiểm thử API trên DB thử `ketoan_test_nt012`; đối chiếu trên DB local `ketoan_otchuong` trong giao dịch huỷ — không ghi; trình duyệt tự động, chặn lệnh ghi) |
| Bản code (commit) | nhánh `feat/nt-mh-012-don-vi-mua-hang-theo-cay` |
| Kết quả | Bước 1: lần đầu (quy tắc "cha trực tiếp") đối chiếu trên cây thật thu nhỏ → Lào Cai đổi kho tổng 08000 → 26000 → **dừng**, chốt lại quy tắc lai. Quy tắc lai: DB local HN 07000, PT 08000 và shop như cũ; **thêm Chi nhánh Hưng Yên** (HY01 kho tổng, Shop Hoàn Long là shop) — chỉ 2 dòng đổi, đều là Hưng Yên. Bước 2: `so-do-to-chuc.test.ts` đạt 7/7 (26000, 26001Premium vẫn là shop của 08000). Bước 3, 4, 5, 6, 7b: bài mới `nt-mh-012-don-vi-mua-hang.test.ts` đạt 6/6 (cây 2 cấp → 41000; KT-Y "Kho tổng Y" nhận theo tên, "Khoái Châu" không nhận nhầm; ZP tự có phân kho làm kho tổng; Chi nhánh W không có kho tổng → không thành đơn vị mua hàng, thêm 51000 → thành ngay); chạy bài mới trên hàm cũ: trượt 4/5 (bài bắt đúng thay đổi). Bước 8: `ton-max`, `chuyen-hang-xuong-shop`, `co-cau-to-chuc` đạt (53/53 cùng hai bài trên); MH16 Hà Nội số liệu như trước. Cảnh báo (giả lập Chi nhánh W 2 cửa hàng chưa có kho tổng): MH02, MH16, MH17, MH18 hiện "Chưa nhận được kho tổng cho: Chi nhánh W (CNW) — 2 cửa hàng…"; không giả lập thì không cảnh báo. Bước 9, 10: DB local không đơn vị nào đổi cha / đổi đơn vị mua hàng nên mẫu in, MH15 không đổi; **chưa chạy trên dữ liệu máy dev**. Typecheck API, web sạch **Bổ sung bước 0 theo loại đơn vị:** bài mới 8/8 (thêm 7c, 7d), `so-do-to-chuc` 7/7, cả nhóm 55/55; DB local (HN, PT, HY01 đều khai loại Chi nhánh / Cửa hàng / Kho tổng) — 0 đơn vị đổi so với DB hiện tại. Cây dev chưa đối chiếu (chưa có ảnh nhánh "Quản lý kho", "tỉnh Phú Thọ") |

## 5. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 6. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 25/11/2026 | Tạo và chốt theo yêu cầu (phạm vi: quy tắc 1–3 + cảnh báo đích danh; không làm "chưa có kho tổng vẫn hiện") |
| 25/11/2026 | Đối chiếu bước 1 trên cây thật thu nhỏ: quy tắc "cha trực tiếp" đổi kho tổng của Lào Cai → dừng, chốt lại quy tắc **lai** (giữ cấp 3, thêm dự phòng, kho tổng nhận thêm tên có chữ "Kho"); bỏ ý cây 4 cấp |
| 25/11/2026 | Code + chạy kiểm (mục 4) |
| 25/11/2026 | Bước dự phòng tính cửa hàng như bước 1 (cửa hàng chưa có kho vẫn là shop) — trước đó bắt có phân kho nên Hưng Yên (local) không hiện |
| 25/11/2026 | Gộp bước 0 theo loại đơn vị (Chi nhánh / Cửa hàng / Kho tổng, Kho trung gian), cửa hàng theo chi nhánh gần nhất — kiennt chốt |
