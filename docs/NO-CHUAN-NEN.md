# Nợ chuẩn nền — Open Kế Toán (Bizcity Core)

<!-- [2026-11-25 06:29 PM Johnny Chu - Chu Hoàng Anh] STD-5 — sinh bởi bizcity-platform tools/no-chuan.mjs (R-STD-9). Sửa nợ ở repo này; thêm / bớt mục "đã biết" thì sửa sổ docs/standard/no-chuan.json bên bizcity-platform rồi sinh lại. -->

> Ngày đo: 2026-11-25 · Repo: `open-ketoan` · Chuẩn: [bản đồ chuẩn nền `bizcity_standard_map@1`](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/README.md) · Kiến trúc: [ARCHITECTURE](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/ARCHITECTURE.md)

Tệp này liệt kê chỗ repo **chưa theo khuôn chung** của hệ. Dev của repo trả dần, mỗi lần một mục, theo nếp giữ chỗ / PR của repo. bizcity-platform giữ khuôn và bộ kiểm; **không ai sửa hộ** và **không nới chuẩn để trả nợ**.

## Định hướng phải giữ khi trả nợ

1. Mỗi app một sổ, một trục; tham chiếu app khác bằng ID của chủ (`item_id`, `doc_ref`, `contact_id`, `sub`), không bịa ID, không đọc CSDL chéo.
2. Người dùng · vai · quyền theo một khuôn ([USERS-ROLES](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-USERS-ROLES-v1.md)): bảng của gói nền, quyền `<module>:<chức-năng>-<động-từ>` tiếng Việt không dấu, từ chối luôn thắng, khoá API không mang quyền rủi ro cao. App tự đứng được không cần Hub; SSO nối sau.
3. Không ghi "xong" khi chưa có phép kiểm chạy được; nợ mới không vào baseline.
4. Đổi thứ dùng chung (hợp đồng, quyền, migration) có chữ chốt trước, có bằng chứng chạy máy trong PR.
5. Mọi ứng dụng 0 đồng; chỉ 1API của Zalo Hub và dịch vụ theo liên hệ tính phí.

## Nợ do bộ kiểm đo (66)

| Mã | Mức | Ở đâu | Việc |
|---|---|---|---|
| SC-USER-4 | cảnh báo | `bizcity.authz.json` | quyền pos:cancel: động từ tiếng Anh "cancel" — tên quyền dùng tiếng Việt không dấu (R-USER-7), ví dụ pos:<chức-năng>-lap |
| SC-USER-4 | cảnh báo | `bizcity.authz.json` | quyền pos:report: động từ tiếng Anh "report" — tên quyền dùng tiếng Việt không dấu (R-USER-7), ví dụ pos:<chức-năng>-lap |
| SC-USER-4 | cảnh báo | `bizcity.authz.json` | quyền pos:return: động từ tiếng Anh "return" — tên quyền dùng tiếng Việt không dấu (R-USER-7), ví dụ pos:<chức-năng>-lap |
| SC-USER-4 | cảnh báo | `bizcity.authz.json` | quyền pos:sell: động từ tiếng Anh "sell" — tên quyền dùng tiếng Việt không dấu (R-USER-7), ví dụ pos:<chức-năng>-lap |
| SC-USER-4 | cảnh báo | `bizcity.authz.json` | quyền voucher:use: động từ tiếng Anh "use" — tên quyền dùng tiếng Việt không dấu (R-USER-7), ví dụ voucher:<chức-năng>-lap |
| SC-DLV-5 | cảnh báo | `docs/nghiem-thu/ban-hang/NT-BH-003-pos-khuyen-mai.md` | README nghiệm thu chưa liệt kê NT-BH-003 |
| SC-DLV-5 | cảnh báo | `docs/nghiem-thu/ban-hang/NT-BH-004-pos-don-ban-tai-quay.md` | README nghiệm thu chưa liệt kê NT-BH-004 |
| SC-DLV-5 | cảnh báo | `docs/nghiem-thu/ban-hang/NT-BH-005-pos-hoan-doi-huy.md` | README nghiệm thu chưa liệt kê NT-BH-005 |
| SC-DLV-5 | cảnh báo | `docs/nghiem-thu/ban-hang/NT-BH-006-pos-danh-muc-gia-ton.md` | README nghiệm thu chưa liệt kê NT-BH-006 |
| SC-DLV-5 | cảnh báo | `docs/nghiem-thu/ban-hang/NT-BH-007-pos-ca-ban-bao-cao.md` | README nghiệm thu chưa liệt kê NT-BH-007 |
| SC-DLV-5 | cảnh báo | `docs/nghiem-thu/ban-hang/NT-BH-008-pos-quan-tri-ban-le.md` | README nghiệm thu chưa liệt kê NT-BH-008 |
| SC-DLV-5 | cảnh báo | `docs/nghiem-thu/ban-hang/NT-BH-009-pos-thanh-toan-qr.md` | README nghiệm thu chưa liệt kê NT-BH-009 |
| SC-DLV-5 | cảnh báo | `docs/nghiem-thu/ban-hang/NT-BH-010-pos-hoa-don-dien-tu.md` | README nghiệm thu chưa liệt kê NT-BH-010 |
| SC-DLV-5 | cảnh báo | `docs/nghiem-thu/ban-hang/NT-BH-011-pos-ca-ban-bo-sung.md` | README nghiệm thu chưa liệt kê NT-BH-011 |
| SC-DLV-5 | cảnh báo | `docs/nghiem-thu/ban-hang/NT-BH-012-khuyen-mai-mo-rong.md` | README nghiệm thu chưa liệt kê NT-BH-012 |
| SC-DLV-5 | cảnh báo | `docs/nghiem-thu/ban-hang/NT-BH-013-quy-trinh-ban-hang.md` | README nghiệm thu chưa liệt kê NT-BH-013 |
| SC-DLV-5 | cảnh báo | `docs/nghiem-thu/ban-hang/NT-BH-014-cai-dat-ban-hang.md` | README nghiệm thu chưa liệt kê NT-BH-014 |
| SC-DLV-2 | cảnh báo | `docs/nghiem-thu/ban-hang/NT-BH-015-phieu-ban-nhap-tay.md` | ô Trạng thái "Đã đóng 15/11/2026 (anh Hoàng chốt) — §6" không bắt đầu bằng từ khoá: Nháp · Đã chốt · Đang làm · Chờ nghiệm thu · Đạt · Chưa đạt · Huỷ |
| SC-DLV-5 | cảnh báo | `docs/nghiem-thu/ban-hang/NT-BH-015-phieu-ban-nhap-tay.md` | README nghiệm thu chưa liệt kê NT-BH-015 |
| SC-DLV-5 | cảnh báo | `docs/nghiem-thu/ban-hang/NT-BH-016-khuyen-mai.md` | README nghiệm thu chưa liệt kê NT-BH-016 |
| SC-DLV-5 | cảnh báo | `docs/nghiem-thu/ban-hang/NT-BH-017-phieu-ban-ve-website.md` | README nghiệm thu chưa liệt kê NT-BH-017 |
| SC-DLV-2 | cảnh báo | `docs/nghiem-thu/ban-hang/NT-BH-018-gop-chuong-trinh-khuyen-mai.md` | ô Trạng thái "Đã làm 15/11 — Q1 chốt: anh Thủy bàn gia" không bắt đầu bằng từ khoá: Nháp · Đã chốt · Đang làm · Chờ nghiệm thu · Đạt · Chưa đạt · Huỷ |
| SC-DLV-5 | cảnh báo | `docs/nghiem-thu/ban-hang/NT-BH-018-gop-chuong-trinh-khuyen-mai.md` | README nghiệm thu chưa liệt kê NT-BH-018 |
| SC-DLV-5 | cảnh báo | `docs/nghiem-thu/ban-hang/NT-BH-019-pos-tao-khach-bill-z.md` | README nghiệm thu chưa liệt kê NT-BH-019 |
| SC-DLV-5 | cảnh báo | `docs/nghiem-thu/ban-hang/NT-BH-020-pos-tich-diem.md` | README nghiệm thu chưa liệt kê NT-BH-020 |
| SC-DLV-5 | cảnh báo | `docs/nghiem-thu/ban-hang/NT-BH-021-chan-ban-qua-ton.md` | README nghiệm thu chưa liệt kê NT-BH-021 |
| SC-DLV-5 | cảnh báo | `docs/nghiem-thu/ban-hang/NT-BH-022-may-ban-ban-dung-gia.md` | README nghiệm thu chưa liệt kê NT-BH-022 |
| SC-DLV-5 | cảnh báo | `docs/nghiem-thu/ban-hang/NT-BH-023-don-dat-hang.md` | README nghiệm thu chưa liệt kê NT-BH-023 |
| SC-DLV-5 | cảnh báo | `docs/nghiem-thu/ban-hang/NT-BH-024-tra-hang-dot-2.md` | README nghiệm thu chưa liệt kê NT-BH-024 |
| SC-DLV-5 | cảnh báo | `docs/nghiem-thu/ban-hang/NT-BH-025-ctkm-duyet-han-muc-bao-cao.md` | README nghiệm thu chưa liệt kê NT-BH-025 |
| SC-DLV-5 | cảnh báo | `docs/nghiem-thu/ban-hang/NT-BH-026-voucher.md` | README nghiệm thu chưa liệt kê NT-BH-026 |
| SC-DLV-5 | cảnh báo | `docs/nghiem-thu/ban-hang/NT-BH-027-so-bill-theo-dang-shop.md` | README nghiệm thu chưa liệt kê NT-BH-027 |
| SC-DLV-5 | cảnh báo | `docs/nghiem-thu/ban-hang/NT-BH-028-qua-theo-kho-khuyen-mai.md` | README nghiệm thu chưa liệt kê NT-BH-028 |
| SC-DLV-5 | cảnh báo | `docs/nghiem-thu/ban-hang/NT-BH-029-tao-khach-tren-may-ban.md` | README nghiệm thu chưa liệt kê NT-BH-029 |
| SC-DLV-5 | cảnh báo | `docs/nghiem-thu/ban-hang/NT-BH-030-tra-hang-dot-3.md` | README nghiệm thu chưa liệt kê NT-BH-030 |
| SC-DLV-5 | cảnh báo | `docs/nghiem-thu/ban-hang/NT-BH-031-kenh-ban-hang.md` | README nghiệm thu chưa liệt kê NT-BH-031 |
| SC-DLV-5 | cảnh báo | `docs/nghiem-thu/ban-hang/NT-BH-032-giao-hang-copy-don.md` | README nghiệm thu chưa liệt kê NT-BH-032 |
| SC-DLV-5 | cảnh báo | `docs/nghiem-thu/ban-hang/NT-BH-033-so-chung-tu-ban-hang.md` | README nghiệm thu chưa liệt kê NT-BH-033 |
| SC-DLV-5 | cảnh báo | `docs/nghiem-thu/ban-hang/NT-BH-034-hoa-don-tai-quay-bao-cao-khach.md` | README nghiệm thu chưa liệt kê NT-BH-034 |
| SC-DLV-5 | cảnh báo | `docs/nghiem-thu/ban-hang/NT-BH-035-don-viec-treo-ban-hang.md` | README nghiệm thu chưa liệt kê NT-BH-035 |
| SC-DLV-5 | cảnh báo | `docs/nghiem-thu/ban-hang/NT-BH-036-phieu-ban-cung-mau-phieu-mua.md` | README nghiệm thu chưa liệt kê NT-BH-036 |
| SC-DLV-5 | cảnh báo | `docs/nghiem-thu/ban-hang/NT-BH-037-mau-phieu-mua-cho-module-ban.md` | README nghiệm thu chưa liệt kê NT-BH-037 |
| SC-DLV-5 | cảnh báo | `docs/nghiem-thu/ban-hang/NT-BH-038-qua-tra-theo-khuyen-mai-core.md` | README nghiệm thu chưa liệt kê NT-BH-038 |
| SC-DLV-3 | cảnh báo | `docs/nghiem-thu/danh-muc/NT-DM-001-bo-ten-tieng-anh-tai-khoan.md` | Chờ nghiệm thu nhưng §7 Kết quả chạy chưa ghi commit + tệp test |
| SC-DLV-3 | cảnh báo | `docs/nghiem-thu/danh-muc/NT-DM-004-nhap-excel-don-vi-tinh.md` | Chờ nghiệm thu nhưng §7 Kết quả chạy chưa ghi commit + tệp test |
| SC-DLV-4 | cảnh báo | `docs/nghiem-thu/danh-muc/NT-DM-004-nhap-excel-don-vi-tinh.md` | không test nào nhắc mã NT-DM-004 (describe phải mở đầu bằng mã phiếu) |
| SC-DLV-3 | cảnh báo | `docs/nghiem-thu/danh-muc/NT-DM-005-nhap-excel-cac-danh-muc.md` | Chờ nghiệm thu nhưng §7 Kết quả chạy chưa ghi commit + tệp test |
| SC-DLV-4 | cảnh báo | `docs/nghiem-thu/danh-muc/NT-DM-005-nhap-excel-cac-danh-muc.md` | không test nào nhắc mã NT-DM-005 (describe phải mở đầu bằng mã phiếu) |
| SC-DLV-3 | cảnh báo | `docs/nghiem-thu/danh-muc/NT-DM-006-nhan-ban-va-thanh-nut.md` | Chờ nghiệm thu nhưng §7 Kết quả chạy chưa ghi commit + tệp test |
| SC-DLV-4 | cảnh báo | `docs/nghiem-thu/danh-muc/NT-DM-006-nhan-ban-va-thanh-nut.md` | không test nào nhắc mã NT-DM-006 (describe phải mở đầu bằng mã phiếu) |
| SC-DLV-3 | cảnh báo | `docs/nghiem-thu/danh-muc/NT-DM-007-nhap-excel-co-cau-to-chuc.md` | Chờ nghiệm thu nhưng §7 Kết quả chạy chưa ghi commit + tệp test |
| SC-DLV-4 | cảnh báo | `docs/nghiem-thu/danh-muc/NT-DM-007-nhap-excel-co-cau-to-chuc.md` | không test nào nhắc mã NT-DM-007 (describe phải mở đầu bằng mã phiếu) |
| SC-DLV-3 | cảnh báo | `docs/nghiem-thu/danh-muc/NT-DM-008-nhap-gia-ban-trinh-nhap-chung.md` | Chờ nghiệm thu nhưng §7 Kết quả chạy chưa ghi commit + tệp test |
| SC-DLV-4 | cảnh báo | `docs/nghiem-thu/danh-muc/NT-DM-008-nhap-gia-ban-trinh-nhap-chung.md` | không test nào nhắc mã NT-DM-008 (describe phải mở đầu bằng mã phiếu) |
| SC-DLV-3 | cảnh báo | `docs/nghiem-thu/danh-muc/NT-DM-009-ma-nhom-trung-khac-nganh.md` | Chờ nghiệm thu nhưng §7 Kết quả chạy chưa ghi commit + tệp test |
| SC-DLV-2 | cảnh báo | `docs/nghiem-thu/danh-muc/NT-DM-011-mst-doi-tuong-theo-ngay-hieu-luc.md` | ô Trạng thái "Đã làm, chờ nghiệm thu <!-- [2026-11-19 " không bắt đầu bằng từ khoá: Nháp · Đã chốt · Đang làm · Chờ nghiệm thu · Đạt · Chưa đạt · Huỷ |
| SC-DLV-3 | cảnh báo | `docs/nghiem-thu/he-thong/NT-HT-001-so-do-to-chuc.md` | Chờ nghiệm thu nhưng §7 Kết quả chạy chưa ghi commit + tệp test |
| SC-DLV-8 | cảnh báo | `docs/nghiem-thu/he-thong/NT-HT-001-so-do-to-chuc.md` | chờ nghiệm thu 22 ngày (> 14) — đưa vào buổi nghiệm thu hoặc ghi lý do |
| SC-DLV-5 | cảnh báo | `docs/nghiem-thu/he-thong/NT-HT-003-phan-quyen-man-hinh-chi-nhanh.md` | README nghiệm thu chưa liệt kê NT-HT-003 |
| SC-DLV-4 | cảnh báo | `docs/nghiem-thu/mua-hang/NT-MH-001-ck-theo-thung-giai-doan.md` | không test nào nhắc mã NT-MH-001 (describe phải mở đầu bằng mã phiếu) |
| SC-DLV-8 | cảnh báo | `docs/nghiem-thu/mua-hang/NT-MH-001-ck-theo-thung-giai-doan.md` | chờ nghiệm thu 22 ngày (> 14) — đưa vào buổi nghiệm thu hoặc ghi lý do |
| SC-DLV-3 | cảnh báo | `docs/nghiem-thu/mua-hang/NT-MH-002-san-pham-con.md` | Chờ nghiệm thu nhưng §7 Kết quả chạy chưa ghi commit + tệp test |
| SC-DLV-8 | cảnh báo | `docs/nghiem-thu/mua-hang/NT-MH-002-san-pham-con.md` | chờ nghiệm thu 16 ngày (> 14) — đưa vào buổi nghiệm thu hoặc ghi lý do |
| SC-DLV-2 | cảnh báo | `docs/nghiem-thu/mua-hang/NT-MH-003-duong-thue-theo-ma.md` | ô Trạng thái "(không có)" không bắt đầu bằng từ khoá: Nháp · Đã chốt · Đang làm · Chờ nghiệm thu · Đạt · Chưa đạt · Huỷ |
| SC-DLV-5 | cảnh báo | `docs/nghiem-thu/mua-hang/NT-MH-003-duong-thue-theo-ma.md` | README nghiệm thu chưa liệt kê NT-MH-003 |
| SC-DLV-5 | cảnh báo | `docs/nghiem-thu/mua-hang/NT-MH-011-ban-do-loi-phieu-mua.md` | README nghiệm thu chưa liệt kê NT-MH-011 |

## Nợ đã biết từ rà soát (20)

| # | Luật | Việc | Lưu ý | Chuẩn |
|---|---|---|---|---|
| 1 | R-STD-DLV-3 | Khép vòng nghiệm thu: tổ chức buổi nghiệm thu với bộ phận sử dụng cho 13 phiếu `Chờ nghiệm thu`, ghi §8 Biên bản (ngày · bộ phận · Đạt / Chưa đạt) — đo 2026-11-25 chưa phiếu nào Đạt có biên bản | phiếu Chưa đạt quay về Đang làm, ghi chỗ sai; không tự chuyển Đạt khi chưa có bộ phận sử dụng chạy lại | [DELIVERY](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-DELIVERY-v1.md) |
| 2 | R-STD-DLV-5 | Sinh danh sách phiếu ở `docs/nghiem-thu/README.md` tự động từ các phiếu (đang thiếu 38 / 71 phiếu) và ghi ngày sau từ khoá trạng thái | chuẩn hoá 4 phiếu ghi trạng thái ngoài từ khoá ("Đã đóng", "Đã làm"…) | [DELIVERY](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-DELIVERY-v1.md) |
| 3 | R-STD-DLV-9 | Viết `BAN-GIAO.md` cho phase đổi người làm hoặc đóng (đang 1 / 39 phase), theo khuôn PHASE-031 | — | [DELIVERY](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-DELIVERY-v1.md) |
| 4 | R-USER-7 | Đổi 5 quyền tiếng Anh `pos:sell`, `pos:cancel`, `pos:return`, `pos:report`, `voucher:use` sang khuôn `<module>:<chức-năng>-<động-từ>` tiếng Việt không dấu | giữ tên cũ trong `aliases` — vai và luật cho / cấm trong CSDL đang trỏ tên cũ; chạy lại `UPDATE_AUTHZ=1` cho `bizcity.authz.json` | [USERS-ROLES](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-USERS-ROLES-v1.md) |
| 5 | R-QG-1 | Đưa selfcheck `--strict` trên `main` về ĐẠT: 14 phép kiểm đỏ đo 2026-11-25 (SC-ACT-1, SC-ACT-2, SC-API-2, SC-CON-5, SC-DOC-4, SC-DOC-7, SC-FLOW-1, SC-LAYER-2, SC-LOG-2, SC-MOD-2, SC-SEC-2, SC-SEC-5, SC-STD-5, SC-UI-1) | nhóm bảo mật (SC-SEC-2 ghép chuỗi SQL, SC-SEC-5 bí mật mặc định) và SC-MOD-2 (phân hệ ghi bảng nhân) trước; rà theo R-REV, không thêm vào baseline | [TESTING](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-TESTING-v1.md) |
| 6 | R-QG-1 | Đưa `npm run typecheck` trên `main` về 0 lỗi (12 lỗi đo 2026-11-25: phân hệ mua hàng `maxPayDays` / `payDays`, `TraChinhSachPage.tsx`) | — | [TESTING](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-TESTING-v1.md) |
| 7 | Q-API-1 | Thống nhất phân trang con trỏ về `base64url(<ISO>\|<id>)` + `meta.nextCursor` (sync, connections, provisioning đang mỗi nơi một kiểu) | chuyển dần khi sửa tới; route công khai đổi hình ⇒ theo R-API-7 | [API-PROFILE](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-API-PROFILE-v1.md) |
| 8 | R-STD-API-6 | Giới hạn tần suất chung ba hạng (công khai theo IP, có phiên theo người dùng, khoá máy theo khoá), trả `RATE_LIMITED` + `Retry-After` | đếm trong tiến trình; Redis chỉ khi ≥ 2 bản API (Q-CACHE-1) | [API-PROFILE](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-API-PROFILE-v1.md) |
| 9 | R-STD-CACHE-1 | Gom các chỗ đệm `Map` rải rác (`module-registry`, `role-assignments`, `session-state`, `workflow`, `branch-sites`, `tra-mst`…) về một giao diện đệm; khoá có site + tenant + config_version | chờ `cache` của @bizcity/platform; trước đó sửa 2 chỗ đệm thiếu khoá site (S039-8) | [CACHE](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-CACHE-v1.md) |
| 10 | R-REL-8 | Quy trình phát hành: tag `vX.Y.Z`, `package.json` đúng phiên bản (đang 0.1.0), workflow phát hành có SBOM + nhãn OCI | — | [RELEASE](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-RELEASE-v1.md) |
| 11 | R-WEBARCH-1 | Màn mới và màn cũ khi sửa tách ba phần model · controller (`use-<màn>.ts`) · view; view không gọi mạng | không viết lại cả loạt cho có; theo bậc thang tái sử dụng | [WEB](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-WEB-v1.md) |
| 12 | R-STD-SITE-1 | Thêm họ phép kiểm SC-SITE (chỉ bộ định tuyến đọc `SITE_MODE`; `Host` lạ ⇒ 404); xong nghiệm thu S039-20 cùng Site Manager | — | [MULTISITE](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-MULTISITE-v1.md) |
| 13 | R-STD-1 | Chuyển sang dùng `@bizcity/platform` / `@bizcity/contracts` từ bizcity-platform thay bản trong repo (bước P6 của kế hoạch gói chung) | đợt riêng có ADR; giữ hành vi, chạy toàn bộ test | [APP-SKELETON](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-APP-SKELETON-v1.md) |
| 14 | R-STD-FAIL-6 | Màn thử bản đồ lỗi: phiếu mua hàng (MH05) — dựng khung bằng failure-check --scaffold (72 tình huống), gán mã từ ERROR_CATALOG / IN-*, lời nhắc, test; màn tô đúng ô / danh sách chọn / nguồn gốc (hợp đồng mua, phân tích mua, tồn tối đa) / luồng kho; sau đó 15 form còn lại | theo R-FLOW: giữ chỗ + chữ chốt trước (thêm code vào error.fields, target vào details.findings là đổi thứ dùng chung); dòng kế toán do kế toán trưởng duyệt (R-STD-FAIL-8); SC-UI-2 (ratchet) giữ 16 form cũ ở baseline, form mới thiếu bản đồ là đỏ | [FAILURE-MAP](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-FAILURE-MAP-v1.md) |
| 15 | R-STD-FAIL-7 | Xuất nhật ký từ chối HT19 thành {screen, code} để failure-check --observed liệt kê lỗi gặp thật chưa có trong bản đồ | không xuất dữ liệu kế toán, chỉ mã màn + mã lỗi (R-SEC-10) | [FAILURE-MAP](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-FAILURE-MAP-v1.md) |
| 16 | R-STD-LOOP-8 | .github/copilot-instructions.md: dặn agent chạy failure-check --questions / --report và loi.mjs như mục "Màn có ghi dữ liệu" của AGENTS.md | AGENTS.md + skill tu-duy-nguoc + SC-UI-2 / SC-UI-3 + R-REV-17 đã có (STD-11); copilot-instructions.md chờ dòng giữ chỗ S040-30 đóng | [FEEDBACK-LOOP](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-FEEDBACK-LOOP-v1.md) |
| 17 | R-STD-LOOP-1 | Lệnh npx bizcity loi (packages/cli) gọi loi.mjs với DATA_DIR / LOG_DIR của bản cài; đọc được bản cài docker (thư mục gắn ra ngoài) | dev không cần mở HT19 / DEV04 hay bật Grafana để thấy lỗi của màn mình | [FEEDBACK-LOOP](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-FEEDBACK-LOOP-v1.md) |
| 18 | R-STD-LOOP-7 | Khối bằng chứng PR (scripts/cham-pr.mjs): độ phủ bản đồ lỗi trước / sau, dòng chặn chưa có test, mã mới chưa có trong danh mục | cham-pr.mjs đang thuộc dòng giữ chỗ S040-30 — làm sau khi dòng đó đóng | [FEEDBACK-LOOP](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-FEEDBACK-LOOP-v1.md) |
| 19 | R-STD-LOOP-4 | Nút "Không hiểu / không sửa được" cạnh lời nhắc (ui-kit), ghi nhật ký kiem-khai-bao với feedback: khong-hieu; ghi thêm screen (mã màn) vào mọi dòng nhật ký | chỉ mã (R-STD-LOOP-3); hiện tại nhiều dòng chỉ có entity, chưa có screen | [FEEDBACK-LOOP](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-FEEDBACK-LOOP-v1.md) |
| 20 | R-STD-LOOP-5 | Job gom nhật ký từ chối hằng ngày thành gói chỉ mã (loi.mjs --export) và đưa ba danh sách (chưa có trong bản đồ · bị bấm không hiểu · màn bị chặn nhiều) vào bảng việc | không xuất khoá bản ghi, tên người, câu lỗi gốc (R-SEC-10) | [FEEDBACK-LOOP](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-FEEDBACK-LOOP-v1.md) |

## Trả nợ thế nào

1. Chọn một mục; nhận việc theo nếp của repo (giữ chỗ nếu có `docs/phases/CLAIMS.md`).
2. Làm theo chuẩn được dẫn; có phép kiểm hoặc test chứng minh.
3. Chạy lại bộ kiểm (bizcity-platform cạnh repo này):

```bash
node ../bizcity-platform/tools/standard-check.mjs --repo .
node ../bizcity-platform/tools/users-check.mjs --repo .
node ../bizcity-platform/tools/no-chuan.mjs --repo . --write   # sinh lại tệp này
```

4. Mục "đã biết" trả xong: PR nhỏ vào bizcity-platform gỡ mục khỏi [sổ nợ chuẩn nền](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/no-chuan.json), rồi sinh lại tệp này.
