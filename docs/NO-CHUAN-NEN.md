# Nợ chuẩn nền — Open Kế Toán (Bizcity Core)

<!-- [2026-11-25 01:19 PM Johnny Chu - Chu Hoàng Anh] STD-5 — sinh bởi bizcity-platform tools/no-chuan.mjs (R-STD-9). Sửa nợ ở repo này; thêm / bớt mục "đã biết" thì sửa sổ docs/standard/no-chuan.json bên bizcity-platform rồi sinh lại. -->

> Ngày đo: 2026-11-25 · Repo: `open-ketoan` · Chuẩn: [bản đồ chuẩn nền `bizcity_standard_map@1`](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/README.md) · Kiến trúc: [ARCHITECTURE](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/ARCHITECTURE.md)

Tệp này liệt kê chỗ repo **chưa theo khuôn chung** của hệ. Dev của repo trả dần, mỗi lần một mục, theo nếp giữ chỗ / PR của repo. bizcity-platform giữ khuôn và bộ kiểm; **không ai sửa hộ** và **không nới chuẩn để trả nợ**.

## Định hướng phải giữ khi trả nợ

1. Mỗi app một sổ, một trục; tham chiếu app khác bằng ID của chủ (`item_id`, `doc_ref`, `contact_id`, `sub`), không bịa ID, không đọc CSDL chéo.
2. Người dùng · vai · quyền theo một khuôn ([USERS-ROLES](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-USERS-ROLES-v1.md)): bảng của gói nền, quyền `<module>:<chức-năng>-<động-từ>` tiếng Việt không dấu, từ chối luôn thắng, khoá API không mang quyền rủi ro cao. App tự đứng được không cần Hub; SSO nối sau.
3. Không ghi "xong" khi chưa có phép kiểm chạy được; nợ mới không vào baseline.
4. Đổi thứ dùng chung (hợp đồng, quyền, migration) có chữ chốt trước, có bằng chứng chạy máy trong PR.
5. Mọi ứng dụng 0 đồng; chỉ 1API của Zalo Hub và dịch vụ theo liên hệ tính phí.

## Nợ do bộ kiểm đo (5)

| Mã | Mức | Ở đâu | Việc |
|---|---|---|---|
| SC-USER-4 | cảnh báo | `bizcity.authz.json` | quyền pos:cancel: động từ tiếng Anh "cancel" — tên quyền dùng tiếng Việt không dấu (R-USER-7), ví dụ pos:<chức-năng>-lap |
| SC-USER-4 | cảnh báo | `bizcity.authz.json` | quyền pos:report: động từ tiếng Anh "report" — tên quyền dùng tiếng Việt không dấu (R-USER-7), ví dụ pos:<chức-năng>-lap |
| SC-USER-4 | cảnh báo | `bizcity.authz.json` | quyền pos:return: động từ tiếng Anh "return" — tên quyền dùng tiếng Việt không dấu (R-USER-7), ví dụ pos:<chức-năng>-lap |
| SC-USER-4 | cảnh báo | `bizcity.authz.json` | quyền pos:sell: động từ tiếng Anh "sell" — tên quyền dùng tiếng Việt không dấu (R-USER-7), ví dụ pos:<chức-năng>-lap |
| SC-USER-4 | cảnh báo | `bizcity.authz.json` | quyền voucher:use: động từ tiếng Anh "use" — tên quyền dùng tiếng Việt không dấu (R-USER-7), ví dụ voucher:<chức-năng>-lap |

## Nợ đã biết từ rà soát (10)

| # | Luật | Việc | Lưu ý | Chuẩn |
|---|---|---|---|---|
| 1 | R-USER-7 | Đổi 5 quyền tiếng Anh `pos:sell`, `pos:cancel`, `pos:return`, `pos:report`, `voucher:use` sang khuôn `<module>:<chức-năng>-<động-từ>` tiếng Việt không dấu | giữ tên cũ trong `aliases` — vai và luật cho / cấm trong CSDL đang trỏ tên cũ; chạy lại `UPDATE_AUTHZ=1` cho `bizcity.authz.json` | [USERS-ROLES](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-USERS-ROLES-v1.md) |
| 2 | R-QG-1 | Đưa selfcheck `--strict` trên `main` về ĐẠT: 14 phép kiểm đỏ đo 2026-11-25 (SC-ACT-1, SC-ACT-2, SC-API-2, SC-CON-5, SC-DOC-4, SC-DOC-7, SC-FLOW-1, SC-LAYER-2, SC-LOG-2, SC-MOD-2, SC-SEC-2, SC-SEC-5, SC-STD-5, SC-UI-1) | nhóm bảo mật (SC-SEC-2 ghép chuỗi SQL, SC-SEC-5 bí mật mặc định) và SC-MOD-2 (phân hệ ghi bảng nhân) trước; rà theo R-REV, không thêm vào baseline | [TESTING](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-TESTING-v1.md) |
| 3 | R-QG-1 | Đưa `npm run typecheck` trên `main` về 0 lỗi (12 lỗi đo 2026-11-25: phân hệ mua hàng `maxPayDays` / `payDays`, `TraChinhSachPage.tsx`) | — | [TESTING](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-TESTING-v1.md) |
| 4 | Q-API-1 | Thống nhất phân trang con trỏ về `base64url(<ISO>\|<id>)` + `meta.nextCursor` (sync, connections, provisioning đang mỗi nơi một kiểu) | chuyển dần khi sửa tới; route công khai đổi hình ⇒ theo R-API-7 | [API-PROFILE](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-API-PROFILE-v1.md) |
| 5 | R-STD-API-6 | Giới hạn tần suất chung ba hạng (công khai theo IP, có phiên theo người dùng, khoá máy theo khoá), trả `RATE_LIMITED` + `Retry-After` | đếm trong tiến trình; Redis chỉ khi ≥ 2 bản API (Q-CACHE-1) | [API-PROFILE](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-API-PROFILE-v1.md) |
| 6 | R-STD-CACHE-1 | Gom các chỗ đệm `Map` rải rác (`module-registry`, `role-assignments`, `session-state`, `workflow`, `branch-sites`, `tra-mst`…) về một giao diện đệm; khoá có site + tenant + config_version | chờ `cache` của @bizcity/platform; trước đó sửa 2 chỗ đệm thiếu khoá site (S039-8) | [CACHE](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-CACHE-v1.md) |
| 7 | R-REL-8 | Quy trình phát hành: tag `vX.Y.Z`, `package.json` đúng phiên bản (đang 0.1.0), workflow phát hành có SBOM + nhãn OCI | — | [RELEASE](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-RELEASE-v1.md) |
| 8 | R-WEBARCH-1 | Màn mới và màn cũ khi sửa tách ba phần model · controller (`use-<màn>.ts`) · view; view không gọi mạng | không viết lại cả loạt cho có; theo bậc thang tái sử dụng | [WEB](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-WEB-v1.md) |
| 9 | R-STD-SITE-1 | Thêm họ phép kiểm SC-SITE (chỉ bộ định tuyến đọc `SITE_MODE`; `Host` lạ ⇒ 404); xong nghiệm thu S039-20 cùng Site Manager | — | [MULTISITE](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-MULTISITE-v1.md) |
| 10 | R-STD-1 | Chuyển sang dùng `@bizcity/platform` / `@bizcity/contracts` từ bizcity-platform thay bản trong repo (bước P6 của kế hoạch gói chung) | đợt riêng có ADR; giữ hành vi, chạy toàn bộ test | [APP-SKELETON](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-APP-SKELETON-v1.md) |

## Trả nợ thế nào

1. Chọn một mục; nhận việc theo nếp của repo (giữ chỗ nếu có `docs/phases/CLAIMS.md`).
2. Làm theo chuẩn được dẫn; có phép kiểm hoặc test chứng minh.
3. Chạy lại bộ kiểm (bizcity-platform cạnh repo này):

```bash
node ../bizcity-platform/tools/standard-check.mjs --repo .
node ../bizcity-platform/tools/users-check.mjs --repo .
node ../bizcity-platform/tools/no-chuan.mjs --repo . --write   # sinh lại tệp này
```

4. Mục "đã biết" trả xong: PR nhỏ vào bizcity-platform gỡ mục khỏi `docs/standard/no-chuan.json`, rồi sinh lại tệp này.
