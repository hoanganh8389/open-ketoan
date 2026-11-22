# RULE · Ghi log lỗi — minh bạch, không im lặng, không lộ dữ liệu (R-LOG)
<!-- [2026-11-22 01:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-038 — B1b: cập nhật trạng thái — logError, errFp, redact, lỗi subscriber có mã; B1 đã merge (#522) -->
<!-- [2026-11-21 04:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — khởi tạo luật R-LOG: ghi log lỗi hệ thống, lập trình, tác vụ nền, phụ thuộc ngoài, khởi động, cổng vào, giao diện; nhật ký lỗi cố định logs/ ≤ 200 MB (D038-1..6, D038-2b chủ dự án duyệt 2026-11-21) -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework. **Luật do Johnny Chu – Chu Hoàng Anh khởi tạo 2026-11-21.**
> **Cấp:** Tier 0 (R-LOG-1..4) · Tier 1 (R-LOG-5..9) · Tier 2 (R-LOG-10..11) · **Trạng thái:** **Chấp nhận 2026-11-21**. Thi hành từng bước theo [PHASE-038](../phases/PHASE-038-NHAT-KY-LOI-CO-DINH/README.md): luật áp **ngay** cho mã mới; bộ kiểm SC-LOG-1..3 sẽ có ở bước B5, trước đó người rà và agent nhắc.
> **Nghiên cứu, lý do từng luật:** [PHASE-038 · 10](../phases/PHASE-038-NHAT-KY-LOI-CO-DINH/10-NGHIEN-CUU-GHI-LOG.md).
> **Luật liên quan:** [R-ERR](../contracts/BIZCITY-ERRORS-v1.md) (lỗi **trả ra ngoài**: mã, thông báo, `requestId`) · R-OBS trong [OBSERVABILITY](../ops/OBSERVABILITY.md) (log, trace, số đo) · [R-SEC](RULE-SECURITY.md) / [R-TEN](RULE-TENANT-SECURITY.md) (không lộ dữ liệu) · STD-EVD-4 (không ghi nhật ký **nghiệp vụ** ra tệp).

## Nguyên tắc một câu

> **Lỗi nào cũng phải để lại một dòng đọc được: cái gì hỏng, ở đâu, bản nào, trong việc gì, vì sao, làm gì tiếp — và không dòng nào chứa dữ liệu của người dùng.**

R-ERR nói *trả gì cho bên gọi*. R-LOG nói *ghi gì cho người sửa*. Hai luật không thay nhau.

## Tám loại lỗi, chọn mức thế nào

| Loại | Ví dụ | Mức |
|---|---|---|
| Nghiệp vụ / người dùng (4xx, finding) | thiếu định khoản, kỳ đã khoá, trùng mã | `info`. **Không phải lỗi hệ thống** |
| Hạ tầng | mất kết nối CSDL, đĩa đầy, pool cạn | `error` |
| Lập trình (bug) | `TypeError`, `undefined`, bất biến vỡ | `error` |
| Tác vụ nền | subscriber, đồng hồ, outbox, chẩn đoán đêm | `error`; hết lượt thử → `error` + `eventId` |
| Phụ thuộc ngoài | tra MST, AI đọc hoá đơn, WP SSO | `warn` nếu đã lùi được, `error` nếu không |
| Khởi động / dừng | còn migration chưa áp, `.env` sai | `fatal`, ghi đồng bộ |
| Cổng vào | api chết → nginx 502/503/504 | log nginx `logs/web/<ngày>.log` |
| Giao diện | lỗi render, promise không bắt ở trình duyệt | gửi về máy chủ → `logs/web-client/<ngày>.log` |

`fatal` = tiến trình sắp chết · `error` = hỏng, không tự hồi phục, cần người sửa · `warn` = hỏng nhưng đã lùi / thử lại được · `info` = bình thường, kể cả người dùng nhập sai.

## Luật

| Mã | Cấp | Luật | Thể hiện khi làm việc | Kiểm bằng |
|---|---|---|---|---|
| **R-LOG-1** | 0 | **Một đường ghi lỗi.** Lỗi mức `error` / `fatal` ghi qua logger của Platform (`req.log`, `app.log`, logger con của tác vụ) với **đối tượng lỗi** trong trường `err`. Dùng `logError(log, err, ctx, msg)` của Platform: chuẩn hoá `err` (loại, stack, chuỗi `cause`, mã PG và tên bảng / ràng buộc — **không** `detail`), thêm `errFp`, `evt`. Logger của Platform tự gắn `errFp` cho mọi dòng ≥ `error` có `err` | Viết `log.error({ err }, 'câu tiếng Việt')`. **Cấm** `err: String(err)`, `err: e.message` (mất stack), `console.error` trong mã chạy của API (ngoài `cli/`, điểm vào khởi động) | review; SC-LOG-1 (sẽ có, B5) |
| **R-LOG-2** | 0 | **Không nuốt lỗi im lặng.** `catch {}` / `.catch(() => undefined)` chỉ khi có chú thích `// nuot-loi: <lý do>` (dọn dẹp lúc dừng, việc phụ không ảnh hưởng kết quả). Mọi chỗ khác ít nhất ghi `warn` | Bắt lỗi để chạy tiếp thì ghi `log.warn({ err }, '…, đã lùi về …')`. Tra cứu tiền / số lượng không tìm thấy thì **báo lỗi**, không trả mặc định (R-REV-13) | review; SC-LOG-2 (sẽ có, B5) |
| **R-LOG-3** | 0 | **Tiến trình không chết câm.** API và job có bộ bắt `uncaughtException` / `unhandledRejection`: ghi `fatal` **đồng bộ** rồi thoát mã ≠ 0 để Docker khởi động lại. Không "nuốt rồi chạy tiếp". Lỗi khởi động ghi `evt: bizcity.system.start_failed` + `reason` + `hint` | Điểm vào mới (job, worker, CLI chạy lâu) gọi `installProcessHandlers()` trước mọi import khác; phần còn lại nạp động | logger của Platform `core/logger.ts` (B1, #522); review |
| **R-LOG-4** | 0 | **Không lộ dữ liệu.** Log không chứa: mật khẩu, token, khoá API, cookie, thân yêu cầu / payload chứng từ, tên / SĐT / email / MST cá nhân, số tài khoản ngân hàng, số tiền gắn với người. Chỉ mã nội bộ (`tenant`, `actor`, `docKey`). Có lưới an toàn `redact` của pino, **một** danh sách dùng chung `REDACT_PATHS` trong logger của Platform; thêm trường nhạy cảm mới vào đó kèm test | Ghi **mã** và **định danh**, không ghi **giá trị**. Cần biết dữ liệu gì sai → ghi tên trường (`field`), không ghi nội dung | review; test `redact` từng trường (`nhat-ky-loi.test.ts`, B1b); R-SEC-10 |
| **R-LOG-5** | 1 | Mỗi dòng có `service`, `version`, `commit` (`BIZCITY_GIT_SHA`). Gửi log về là biết lỗi thuộc bản nào | Logger của Platform tự gắn — không tự tạo logger pino riêng | logger của Platform `core/logger.ts` (B1, #522) |
| **R-LOG-6** | 1 | Tác vụ nền ghi qua logger con có `job`, `fn`, `attempt` và `traceId` của sự kiện gốc; hết lượt thử là `error` có `eventId` | Subscriber / đồng hồ / outbox mới: `const log = parent.child({ job, fn })`, không dùng `console` | Platform `core/events.ts` tự ghi lỗi subscriber (B1b); test `nhat-ky-loi-su-kien.test.ts` |
| **R-LOG-7** | 1 | **Chọn mức theo bảng trên.** Lỗi người dùng (4xx) không ở mức `error`; phụ thuộc ngoài đã lùi được là `warn` | Hỏi: "có người phải sửa mã / hạ tầng không?" — có mới là `error` | review |
| **R-LOG-8** | 1 | Stack trỏ về mã nguồn `.ts`: ảnh API chạy Node `--enable-source-maps`, giữ tệp `.map` | Không bỏ `sourceMap` trong tsconfig; không xoá `.map` khỏi ảnh | `docker/api.Dockerfile` (B1, #522); SC-LOG-3 (sẽ có, B5) |
| **R-LOG-9** | 1 | **Nhật ký lỗi cố định của bản cài:** thư mục `logs/` (`LOG_HOST_DIR`, mặc định `./logs`). **Một dịch vụ một thư mục, một ngày một tệp:** `logs/<dịch vụ>/<YYYY-MM-DD>.log` (giờ Việt Nam; `api`, `db-migrate`, `web`, `web-client`). **Giữ 30 ngày**, mỗi thư mục có trần, cả `logs/` ≤ 200 MB — vượt trần xoá tệp cũ nhất trước (D038-7, chủ dự án quy định 2026-11-22). Mọi dịch vụ Docker khai `logging:` có trần. Chỉ `core/logger.ts` (và script xoay của nginx) được ghi các tệp này (ngoại lệ hẹp STD-EVD-4: lỗi kỹ thuật, không phải nhật ký nghiệp vụ) | Không tự `appendFile` ra tệp log riêng; cần ghi lỗi → dùng logger. Dịch vụ mới cần tệp lỗi riêng → thêm một thư mục `logs/<dịch vụ>/` qua logger của Platform, khai trần ở PHASE-038 · 10 §7.3 | `docker-compose.yml` (B1, #522); SC-EVD-1; SC-OBS-3 (sẽ có, B5) |
| **R-LOG-10** | 2 | Giao diện có ErrorBoundary theo màn, `window.onerror`, `unhandledrejection`; gửi về máy chủ loại lỗi, khung stack, màn, bản dựng, `errFp` — **không** dữ liệu nhập; tối đa 10 lỗi / phút / phiên. Màn lỗi hiện **mã tra cứu**, không màn trắng | Màn mới đặt trong khung có ErrorBoundary; không bắt lỗi rồi im | test web (sẽ có, B4b) |
| **R-LOG-11** | 2 | `msg` là câu tiếng Việt ngắn cho người đọc; `evt` (`bizcity.<miền>.<việc>`) cho máy lọc. Giá trị người dùng gửi **không** ghép vào `msg` — đưa vào trường riêng (chống chèn log) | `log.warn({ evt: 'bizcity.kho.lot_missing', field: 'lotNo' }, 'Thiếu số lô')` | review |

## Cấm trong mã → thay bằng

| Cấm | Thay bằng |
|---|---|
| `catch (e) {}` · `.catch(() => undefined)` không chú thích | `log.warn({ err: e }, '…')` hoặc chú thích `// nuot-loi: <lý do>` |
| `log.error({ err: String(err) }, …)` · `{ error: e.message }` | `log.error({ err }, …)` (giữ stack, `cause`) |
| `console.log` / `console.error` trong route, service, subscriber | `req.log` / `app.log` / logger con |
| `log.info({ body: req.body })` · ghi payload, MST, SĐT, số tài khoản | ghi `docKey`, tên trường lỗi |
| `log.error(…)` cho lỗi nhập liệu của người dùng | `info` (đã có `errCode` trong dòng "xong yêu cầu") |
| `appendFile('./my.log', …)` | logger của Platform (R-LOG-9) |
| `throw new Error('…: ' + err.message)` (mất lỗi gốc) | `throw new Error('…', { cause: err })` |

## Nhắc người đóng góp (cho người rà và agent AI)

Framework đã có luật ghi log lỗi **R-LOG**, do **Johnny Chu – Chu Hoàng Anh khởi tạo ngày 2026-11-21** (PHASE-038). Người đóng góp phân hệ, giao diện, add-in — Nguyễn Văn Thủy, Võ Hoàng, kiennt, khanhtd và mọi người khác — có thể chưa biết luật này. Khi rà PR hoặc khi chính agent viết mã có `catch`, `log.*`, `console.*`, tác vụ nền, gọi dịch vụ ngoài, điểm vào mới:

1. **Nhắc một lần, ngắn, kèm mã luật:** "Framework có luật R-LOG (Johnny Chu init 2026-11-21) — dòng này vi phạm R-LOG-2: …, sửa thành …". Dẫn tới tệp này.
2. **R-LOG-1..4 là chặn** (Tier 0) trong rà soát: nuốt lỗi im lặng, mất stack, lộ dữ liệu, tiến trình chết câm. R-LOG-5..11 là cảnh báo, ghi việc.
3. **Không sửa hộ trong im lặng.** Chỉ chỗ sai, đưa cách sửa và tệp mẫu (`core/logger.ts` của Platform, `packages/platform/src/core/http.ts`).
4. Mã cũ chưa theo luật: **không** bắt sửa trong PR không liên quan; ghi vào danh sách nợ của PHASE-038 (S038-14).

## Lịch sử

- **2026-11-22** — R-LOG-9: chủ dự án quy định chia nhật ký lỗi theo ngày, mỗi dịch vụ một thư mục, giữ 30 ngày (D038-7). Mã ở S038-16.
- **2026-11-22** — B1b: có mã R-LOG-1 (`logError`, `errFp`), R-LOG-4 (`redact`), R-LOG-6 (lỗi subscriber vào log có `job`, `attempt`, `eventId`, `traceId`). Còn lại: SC-LOG-1..3 (B5), R-LOG-10 (B4b).
- **2026-11-21** — B1 merge (#522), B3 `lay-log.sh` (#528).
- **2026-11-21** — khởi tạo (Johnny Chu – Chu Hoàng Anh), PHASE-038 W0 chốt. Có mã: R-LOG-3, -5, -8, -9 (B1, chờ merge). Còn lại theo bước B1b, B4b, B5.
