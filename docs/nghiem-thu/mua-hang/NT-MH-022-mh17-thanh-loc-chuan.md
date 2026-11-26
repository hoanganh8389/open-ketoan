# NT-MH-022 · Các màn tồn max (MH17, MH16, MH02, MH19): thanh lọc chuẩn như MH11, một chi nhánh một lúc
<!-- [2026-11-26 kiennt] NGHIEM-THU — tạo phiếu theo yêu cầu người dùng (đóng góp) -->

| | |
|---|---|
| Phân hệ | Mua hàng |
| Màn hình | MH17 Phiếu đăng ký tồn max (shop); mở rộng 26/11: MH16 Tồn max, MH02 Phân tích đặt hàng, MH19 Chuyển hàng xuống shop |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 26/11/2026 |
| Trạng thái | Chờ nghiệm thu (đã chốt: kiennt, 26/11/2026) |
| Trụ cột / tiêu chí | không |

## 1. Yêu cầu

MH17 đang có thanh lọc riêng (ô Chi nhánh cha, Từ, Đến, hai nút lập phiếu cùng một hàng). Màn MH11 Chứng từ mua hàng thì dùng **thành phần chung**: bảng tham số (`FilterLayout`) có thanh lọc chuẩn ngoài màn **[Chi nhánh ▾] [Kỳ ▾ | từ – đến] [Nhóm hàng ▾] … [Tất cả bộ lọc]**, các nút thao tác nằm ở một hàng nút nhỏ phía trên lưới. Sửa MH17 theo đúng khuôn đó:

| Phần | Trước | Sau |
|---|---|---|
| Lọc chi nhánh | `ChonChiNhanhCha` — một chi nhánh cha, bắt buộc chọn | Ô **Chi nhánh** chung (cây cơ cấu / danh sách), nhưng MH17 **chỉ giữ một chi nhánh một lúc** (chi nhánh + các shop của nó): tích chi nhánh / shop của chi nhánh khác thì chi nhánh cũ tự bỏ tích. Mở màn: chi nhánh đang làm việc (không có thì chi nhánh đầu tiên) |
| Kỳ | hai ô ngày Từ / Đến | Ô **Kỳ** chung (`DateRange`: chọn nhanh tháng này, tháng trước… + từ – đến), mặc định đầu tháng đến hôm nay |
| Nhóm hàng | — | Ô Nhóm hàng ở thanh chuẩn hiện mờ "Tất cả" (màn không lọc theo nhóm hàng) |
| Nút | hai nút bên phải thanh lọc | Hàng nút trên lưới như MH11: **+ Phiếu shop đăng ký max** (chính) · **+ Phiếu hàng mới** · **Mở / sửa** (phiếu đang chọn) · **Nạp** · "n phiếu" |

- Lọc chi nhánh: phiếu hiện khi **shop của phiếu hoặc chi nhánh cha của phiếu** nằm trong các mã đã chọn (giống lọc theo một mã trước đây). Màn lấy phiếu theo kỳ rồi lọc chi nhánh phía trình duyệt — **không đổi API**.
- Lập phiếu cần **một** chi nhánh cha. Hai nút lập phiếu **luôn bấm được**: các mã đã chọn quy về đúng một chi nhánh cha (chọn một chi nhánh, hoặc shop cùng một chi nhánh; mã chưa phân cấp bỏ qua) thì mở phiếu ngay; còn lại (tất cả, nhiều chi nhánh) hiện hộp **Lập phiếu cho chi nhánh** để chọn chi nhánh (ô chọn chi nhánh cha như trước, gợi ý chi nhánh đang làm việc) rồi bấm Lập phiếu. *(Sửa 26/11/2026 sau khi chạy thử: bản đầu làm mờ nút, khó hiểu; ô Chi nhánh chỉ giữ một chi nhánh nên hộp chọn chỉ còn hiện khi bỏ chọn hết.)*
- Mở phiếu có sẵn (bấm dòng / Mở / sửa): dùng chi nhánh cha của chính phiếu, không phụ thuộc ô lọc.
- Cảnh báo "Chưa có sơ đồ tổ chức…", lọc trạng thái ở cột lưới (NT-MH-006), form phiếu, duyệt, nhập Excel: **không đổi**.

### 1b. Mở rộng sang MH16, MH02, MH19 (yêu cầu thêm 26/11/2026)

Ba màn này đang dùng ô chọn chi nhánh cha riêng (`ChonChiNhanhCha`). Đổi sang cùng khuôn MH17:

| Màn | Thanh lọc chuẩn | Giữ trên màn |
|---|---|---|
| MH16 Tồn max | Chi nhánh · Nhóm hàng (ô Nhóm hàng chuyển lên thanh chuẩn) | Shop / kho chi nhánh, Phân kho, các nút gợi ý / nhập Excel / Lưu |
| MH02 Phân tích đặt hàng | Chi nhánh · Nhóm hàng | Hiện, ô tìm, Công thức, Xuất Excel, Lập đơn đặt |
| MH19 Chuyển hàng xuống shop | Chi nhánh; Kỳ khi ở thẻ **Đề nghị đã chốt** (thay hai ô Từ / Đến của thẻ) | Hai thẻ Đề xuất chuyển / Đề nghị đã chốt, các tuỳ chọn chia hàng |

- Ô Chi nhánh **một chi nhánh một lúc, luôn cả chi nhánh** (chi nhánh + mọi shop đang dùng; bỏ tích một shop không có tác dụng) vì ba màn làm việc theo chi nhánh cha.
- **MH02 bỏ xem gộp nhiều chi nhánh** (trước tích được nhiều chi nhánh để xem gộp, khi đó không lập được đơn đặt).
- Đổi sang chi nhánh khác: MH16 về kho chi nhánh, bỏ số đang sửa (chọn lại đúng chi nhánh đang xem thì giữ — NT-MH-017); MH02 bỏ mã đã chọn / SL đã sửa.
- Logic một chi nhánh dùng chung: `useMotChiNhanh` trong `apps/web/src/phan-he/mua-hang/ton-max/chung.tsx` (MH17 dùng không ép cả chi nhánh).

## 2. Phạm vi

`apps/web/src/phan-he/mua-hang/ton-max/DangKyMaxPage.tsx` (trang danh sách), `TonMaxPage.tsx`, `ChuyenShopPage.tsx`, `chung.tsx`, `apps/web/src/phan-he/mua-hang/dat-hang/DatHangPage.tsx`. Chỉ giao diện; không đổi API, không đổi lõi (`components/*` dùng nguyên).

## 3. Kết quả mong đợi

| # | Thao tác | Mong đợi |
|---|---|---|
| 1 | Mở MH17 | Thanh lọc chuẩn như MH11: Chi nhánh = Tất cả chi nhánh, Kỳ = Đầu tháng đến nay, Nhóm hàng mờ, nút Tất cả bộ lọc; lưới hiện phiếu mọi chi nhánh trong kỳ |
| 2 | Chọn một chi nhánh (vd CN Hà Nội) | Lưới chỉ còn phiếu của chi nhánh đó và các shop thuộc nó; hai nút lập phiếu bật |
| 3b | Đang chọn CNDN, tích thêm HY01 | CNDN và shop của nó tự bỏ tích, chỉ còn HY01 + shop của HY01; lưới chỉ phiếu của HY01 |
| 3 | Chọn hai shop cùng một chi nhánh | Lưới chỉ phiếu của hai shop; nút lập phiếu bật, phiếu lập thuộc chi nhánh cha đó |
| 4 | Chọn tất cả / hai chi nhánh khác nhau → bấm + Phiếu shop đăng ký max | Hiện hộp chọn chi nhánh; chọn → Lập phiếu → mở phiếu của chi nhánh đó |
| 5 | Đổi Kỳ = Tháng trước | Lưới nạp lại phiếu lập trong tháng trước |
| 6 | Chọn dòng → Mở / sửa | Mở đúng phiếu (như bấm dòng trước đây) |
| 7 | Mở "Tất cả bộ lọc" | Bảng tham số có cùng ô Chi nhánh, Kỳ; đổi ở đây hoặc ở thanh ngoài là một |
| 8 | MH16 / MH02 / MH19: mở màn | Thanh lọc chuẩn có Chi nhánh = chi nhánh đang làm việc (cả chi nhánh); MH16, MH02 ô Nhóm hàng ở thanh chuẩn |
| 9 | MH16 / MH02 / MH19: tích chi nhánh khác | Chi nhánh cũ tự bỏ tích; số liệu nạp theo chi nhánh mới |
| 10 | MH19 → thẻ Đề nghị đã chốt | Ô Kỳ ở thanh chuẩn sáng lên, lọc đề nghị theo kỳ; thẻ Đề xuất chuyển thì ô Kỳ mờ |

## 4. Kết quả chạy
| | |
|---|---|
| Ngày chạy | 26/11/2026 |
| Bản code (commit) | nhánh `feat/nt-mh-022-mh17-thanh-loc-chuan` (gốc `origin/main` e14eeb1c + 25 commit kéo về 26/11) |
| `node tests/conformance/selfcheck.mjs` | Không đạt — nợ có sẵn: `origin/main` cũng 22 mục không đạt; thêm `SC-SEC-1` (`.env` cục bộ, không vào git) và `SC-DOC-5` (tệp chưa track `docs/kiem-thu/tich-hop-phan-quyen-thu.md` trên máy, không thuộc PR). Không có phát hiện mới ở tệp của phiếu; SC-UI-1 bớt 2 chỗ (`!parent` MH17) |
| `bash scripts/kiem-chuan.sh` | Đạt |
| `npm run typecheck` | `@ketoan/web` đạt. Toàn repo dừng ở lỗi có sẵn `modules/tra-cuu/web/screens/TraChinhSachPage.tsx` (`title` không có trong `GridColumn`, từ commit c3205702 trên main) |
| `npm test` | CSDL test mới (`ketoan_test_nt022`): 357 tệp đạt, 19 tệp / 40 test không đạt — toàn phía API (`permission denied for view branch_prices` ×26, authz-manifest, conformance-*, gates, sao lưu site…), không chạm tệp của phiếu (chỉ giao diện web). `ketoan_test` cũ trên máy thiếu migration 0067 nên chạy CSDL riêng |
