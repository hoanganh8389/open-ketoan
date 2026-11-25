# Truy lỗi trên bản dev: hướng dẫn cho kế toán và dev
<!-- [2026-11-25 09:08 PM Johnny Chu - Chu Hoàng Anh] STD-12 — hướng dẫn truy lỗi trên bản dev (chủ chỉ đạo 2026-11-25): kế toán tìm nguyên nhân và sửa tại chỗ; chép mã tra cứu gửi dev; dev + AI xử lý theo luật repo; người quản trị kiểm / bật bộ truy lỗi bằng scripts/kiem-giam-sat.sh -->

> **Dành cho:** kế toán, dev và người quản trị máy dev. **Đọc kèm:** [SO-TAY-DIEU-TRA-LOI](SO-TAY-DIEU-TRA-LOI.md) (dev, chi tiết từng tình huống) · [OBSERVABILITY](OBSERVABILITY.md) · [DEPLOY §5](DEPLOY.md) (máy cPanel).

Khi chứng từ hay danh mục không lưu, không ghi sổ được, kế toán đọc lời nhắc ngay trên màn và sửa tại chỗ. Việc vượt quá thì chép mã tra cứu gửi dev. Dev dán mã vào màn Tra mã (DEV02), hoặc giao cho AI xử lý theo luật của repo.

## 1. Lỗi đi từ màn tới dev thế nào

Phần lớn lỗi được kế toán tự sửa ở bước 2. Chỉ lỗi kỹ thuật, hoặc lời nhắc khó hiểu, mới cần tới bước 3–5.

1. **Màn báo trước khi bấm** (kế toán đọc): khung *Kiểm tra* bên phải phiếu, ô tô đỏ, danh sách chọn không nhận giá trị.
2. **Bấm Lưu / Duyệt (ghi sổ) bị từ chối** (kế toán sửa). Hộp thông báo có:
   - mã lỗi (vd `IN-ITEM-009`, `PERIOD_LOCKED`);
   - câu nói sai gì và làm gì tiếp;
   - **mã tra cứu** và nút **Chép**.

   Sửa theo lời nhắc tại chỗ rồi bấm lại.
3. **Chép gửi dev** (kế toán). Làm khi không hiểu lời nhắc, khi làm đúng mà vẫn bị từ chối, hoặc khi màn báo *Lỗi hệ thống*. Cách gửi ở mục 3.
4. **Dev tra mã** (dev): dán mã tra cứu vào *Nhà phát triển → Tra mã* (DEV02) hoặc *Nhật ký kiểm khai báo* (HT19). Dev thấy yêu cầu đi qua bước nào, hỏng ở đâu, quy tắc nào chặn.
5. **Dev và AI sửa** (dev): bấm *Chép cho AI* ở DEV02, dán vào agent.
   - Agent làm theo [AGENTS.md](../../AGENTS.md): viết test tái hiện trước, không nới luật, không vá Kernel.
   - Agent thêm tình huống vào bản đồ lỗi của màn, để lần sau màn báo ngay ở bước 1.

## 2. Cho kế toán: gặp lỗi thì làm gì

Nhìn theo thứ tự: khung *Kiểm tra* bên phải phiếu → ô tô đỏ → hộp thông báo khi bấm Lưu / Duyệt.
- Dòng ⚠ là cảnh báo, vẫn lưu được.
- Dòng ✗, hoặc hộp thông báo đỏ, là bị chặn: phải sửa mới lưu được.

Ba điều cần nhớ:
- **Đọc mã lỗi và câu nhắc.** Câu nói sai gì và làm gì tiếp. Bấm *Hướng dẫn* ở góc màn để xem trang hướng dẫn của màn.
- **Sửa tại chỗ.** Danh sách chọn có nút thêm nhanh (nhà cung cấp, mặt hàng) thì thêm ngay. Thiếu khai báo gốc thì mở màn cài đặt trong bảng dưới, sửa xong quay lại phiếu bấm lại.
- **Không tự vượt.** Kỳ đã khoá, thuế suất, giá lệch hợp đồng là việc kế toán trưởng quyết. Không sửa cho "khớp" bằng cách đổi sang số khác.

| Tình huống | Thấy ở đâu trên phiếu | Sửa ở màn (mã) | Mã hay gặp |
| --- | --- | --- | --- |
| Mã hàng chưa có, hoặc còn nháp (thiếu ĐVT, nhóm hạch toán) | dòng hàng, cột Mã hàng | Danh mục mặt hàng (DM10) lọc *Nháp*; Nhóm hàng (DM11); Đơn vị tính (DM15) | `IN-ITEM-001`, `IN-ITEM-009` |
| Nhà cung cấp chưa có, ngừng dùng, mã số thuế sai | ô Nhà cung cấp | Nhà cung cấp mua hàng (MH01) / Nhà cung cấp (DM13) | `IN-MD-005` |
| Chi nhánh, phân kho, bộ phận chưa khai | ô Chi nhánh, Phân kho | Cơ cấu tổ chức (DM16); Loại kho (DM18) | `IN-MD-001` |
| Giá phiếu lệch giá hợp đồng / đơn đặt | khung Kiểm tra (⚠), cột Giá hợp đồng tô đỏ | Hợp đồng mua hàng (MH29); Đối chiếu giá mua theo hợp đồng (MH34); hoặc sửa đơn giá trên phiếu | cảnh báo, không chặn |
| Đơn đặt giao cho chi nhánh khác, nhập vượt số còn phải nhập | khung Kiểm tra (⚠), cột Còn phải nhập | Đối chiếu đơn đặt ↔ phiếu nhập (MH21); mở đơn → Lập phiếu nhập từ đơn | cảnh báo |
| Chính sách / khuyến mại chưa phát hành, hết hạn, không truy được | thẻ Khuyến mại | Chính sách mua hàng (MH04); Chi tiết chính sách (MH14) | `IN-POL-001` |
| Vượt tồn tối đa / ngoài phân tích đặt hàng | khung Trợ lý mua hàng | Tồn max (MH16); Phiếu đăng ký tồn max (MH17); Phân tích đặt hàng (MH02) | cảnh báo |
| Thuế dòng lệch thuế suất | ô Thuế của dòng | Loại thuế (ACC43); kế toán trưởng duyệt | `IN-SUM-003` |
| Ngày phiếu thuộc kỳ đã khoá | ô Ngày; hộp thông báo khi Duyệt | Đóng / mở kỳ kế toán (ACC2) — kế toán trưởng; hoặc chọn ngày trong kỳ mở | `PERIOD_LOCKED` |
| Phiếu đã ghi sổ, hoặc người khác vừa sửa | hộp thông báo khi Sửa / Huỷ | tải lại phiếu; huỷ phiếu đã ghi sổ = lập phiếu đảo, không xoá | `CONFLICT` |
| Không đủ quyền | nút bị khoá hoặc hộp thông báo | nhờ chủ đơn vị cấp quyền | `FORBIDDEN` |

Bảng này theo màn và mã đang có trên `main`. Màn nào báo chưa đúng chỗ thì gửi dev, để bổ sung vào bản đồ lỗi của màn.

## 3. Gửi cho dev

Thứ cần gửi là khối chép từ nút **Chép** của hộp thông báo. Ảnh chụp màn chỉ là phần thêm.

1. Bấm **Chép** trên hộp thông báo lỗi. Khối chép có: màn, giờ, mã lỗi, câu báo, **mã tra cứu** (dạng `req-…`).
2. Dán khối đó vào tin nhắn cho dev, kèm một câu nói đang làm gì (vd "Duyệt phiếu nhập mua, nút Duyệt (ghi sổ)").
3. Có thể chụp màn cho dev thấy chỗ báo:
   - **bản dev** (dữ liệu thử): chụp thoải mái;
   - **bản cài thật** của đơn vị: chỉ gửi khối chép, không chụp số tiền, tên khách, mã số thuế (R-SEC-10).

**Không gửi:** mật khẩu, tệp `.env`, ảnh có tài khoản đăng nhập. Mã tra cứu là đủ để dev tìm đúng lần lưu đó.

## 4. Cho dev: từ mã tra cứu tới bản sửa

Bắt đầu từ mã tra cứu, không từ ảnh. Ba màn trong app (vai Nhà phát triển hoặc chủ đơn vị):

| Màn | Đường dẫn | Dùng khi |
| --- | --- | --- |
| Tra mã (DEV02) | /dev/tra-ma | có `req-…` hoặc traceId 32 ký tự: cây bước, log, bằng chứng, nút *Chép cho AI* |
| Nhật ký kiểm khai báo (HT19) | /he-thong/nhat-ky-kiem | mọi lần lưu bị từ chối: mã quy tắc, ô, người, mã tra cứu — kể cả lỗi do form chặn trên trình duyệt |
| Lỗi theo module (DEV04) | /dev/loi-theo-module | sau khi sửa: chỗ hỏng không còn tăng |

**DEV02 báo "Không tìm thấy trace"** dù nguồn ghi Tempo ✓, thường vì một trong bốn lý do:

- **Lỗi do form chặn ngay trên trình duyệt.** Yêu cầu chưa gửi lên máy chủ nên không có trace. Tra ở HT19.
- **Yêu cầu thành công và nằm ngoài tỉ lệ lấy mẫu** (mặc định 10%). Lỗi 4xx / 5xx và yêu cầu chậm hơn 1 giây luôn được giữ.
- **API không gửi trace.** Bản cài cập nhật bằng `scripts/cap-nhat.sh` / `scripts/cap-nhat-cpanel.sh` cũ (trước STD-12b) làm API mất cấu hình gửi trace. Bản mới tự giữ; chạy script ở mục 5 để kiểm. <!-- [2026-11-25 09:11 PM Johnny Chu - Chu Hoàng Anh] STD-12b — cập nhật tự ghép tệp giám sát, api giữ cấu hình gửi trace -->
- **Trace thuộc đơn vị khác, hoặc đã quá 7 ngày.** DEV02 chỉ hiện dữ liệu của đơn vị đang chọn.

**Ở máy mình** (bản cài docker trên máy dev):
1. Dựng môi trường: `node scripts/moi-truong-dev.mjs --sua`.
2. Xem các lần lưu bị từ chối, theo màn × mã, đối chiếu với bản đồ lỗi: lệnh `loi.mjs` của [bizcity-platform](https://github.com/hoanganh8389/bizcity-platform), chạy `--repo . --since 2h`.
3. Tra nghĩa một mã: `npx bizcity explain IN-ITEM-009`. Lệnh trả về nghĩa, cách sửa và căn cứ.

**Giao cho AI** (Claude Code, Copilot, Cursor…): dán khối *Chép cho AI* của DEV02, hoặc khối kế toán gửi, kèm câu sau:

```text
Lỗi bên dưới gặp trên bản dev. Làm theo AGENTS.md:
1. Đầu phiên chạy node scripts/moi-truong-dev.mjs --sua.
2. Tìm mã theo tên bước / mã lỗi (mục "Sửa lỗi bằng AI từ Bàn điều tra"); tra nghĩa mã bằng npx bizcity explain.
3. Viết test tái hiện đỏ đúng mã lỗi trước khi sửa; dữ liệu trong test là dữ liệu giả.
4. Bị từ chối đúng luật thì sửa chỗ gửi (màn báo trước, đúng ô, sửa tại chỗ), không nới luật, không vá Kernel.
5. Thêm tình huống này vào bản đồ lỗi của màn (<Tên form>.failure-map.json) kèm lời nhắc và test (mục "Màn có ghi dữ liệu").
6. Trước khi đẩy: hook pre-push phải ĐẠT; dán khối bằng chứng vào PR.
<dán khối chép ở đây>
```

Agent không tự gọi các API devtools của hệ thống (D019-3). Cần thêm trace thì nhờ dev chép tiếp từ DEV02.

## 5. Cho người quản trị máy dev: kiểm và bật bộ truy lỗi

Chạy một script trong terminal của bảng điều khiển máy chủ, đứng ở thư mục cài phần mềm (nơi có `docker-compose.yml` và `.env`). Mặc định script chỉ kiểm, không đổi gì.

1. Lấy script (không cần `git pull`):
    ```bash
    curl -fsSL https://raw.githubusercontent.com/hoanganh8389/open-ketoan/main/scripts/kiem-giam-sat.sh -o /tmp/kiem-giam-sat.sh
    ```
2. Kiểm, đứng ở thư mục cài: `APP_DIR=$PWD bash /tmp/kiem-giam-sat.sh`
3. Kiểm một mã tra không ra: `APP_DIR=$PWD bash /tmp/kiem-giam-sat.sh --ma <traceId 32 ký tự>`
4. Thấy mục ✘ thì sửa: `APP_DIR=$PWD bash /tmp/kiem-giam-sat.sh --sua`. Mỗi bước hỏi trước; gõ `c` để làm.
5. Chạy lại bước 2 cho tới khi ra `KẾT QUẢ: ĐẠT`. Cần hỗ trợ thì gửi toàn bộ kết quả: đầu ra chỉ có mã, tên biến và số đếm, không có mật khẩu.

| Script kiểm | Khi ✘, `--sua` làm gì |
| --- | --- |
| `.env` có `OTEL_EXPORTER_OTLP_ENDPOINT`, `TRACE_SAMPLE_PERCENT`, `GRAFANA_ADMIN_PASSWORD` | sao lưu `.env` thành `.env.bak-<giờ>`, thêm biến còn thiếu; máy dev đặt lấy mẫu 100% để giữ mọi trace |
| Container db, api, otel-collector, tempo, loki, promtail, prometheus, grafana, alertmanager | bật dịch vụ giám sát đang tắt, gọi đích danh |
| api có gửi trace và có `DEVTOOLS_*` (màn Tra mã cần) | tạo lại container api (API gián đoạn vài giây) |
| Tempo có trace trong 1 giờ qua, Loki trả lời | — (chỉ báo) |
| Nhật ký lần ghi bị từ chối 24 giờ qua, theo đối tượng × mã | — (chỉ báo) |

Script **không** đụng db, web hay dữ liệu, và **không** chạy `docker compose up -d` trần, vì máy này hay kẹt Docker "overlay2 … busy" ([DEPLOY §5](DEPLOY.md)).

**Từ bản có STD-12b, lệnh cập nhật tự giữ cấu hình giám sát** (`scripts/cap-nhat.sh` và `scripts/cap-nhat-cpanel.sh` ghép tệp giám sát khi bộ giám sát đang chạy). Sau lần cập nhật đầu tiên lên bản này, vẫn chạy bước 2 một lần để chắc. <!-- [2026-11-25 09:11 PM Johnny Chu - Chu Hoàng Anh] STD-12b — cập nhật tự ghép tệp giám sát, api giữ cấu hình gửi trace -->

Grafana và Prometheus chỉ mở ở `127.0.0.1` của máy chủ. Grafana ở cổng 3000, đăng nhập `admin` với mật khẩu `GRAFANA_ADMIN_PASSWORD` trong `.env`. Xem từ máy mình qua đường hầm SSH: `ssh -L 3000:127.0.0.1:3000 <user>@<máy chủ>`. Hằng ngày, kế toán và dev chỉ cần màn Tra mã trong app, không cần Grafana.

## 6. Việc còn thiếu

- [ ] Người quản trị chạy `scripts/kiem-giam-sat.sh`, sửa tới khi ĐẠT, gửi lại kết quả kiểm.
- [x] Sửa `scripts/cap-nhat.sh` và `scripts/cap-nhat-cpanel.sh` để dựng api kèm cấu hình giám sát khi có (STD-12b).
- [ ] Mỗi màn cài đặt / chứng từ mua hàng có bản đồ lỗi (AGENTS.md "Màn có ghi dữ liệu"): màn báo đúng ô, sửa được tại chỗ. Đây là việc của người làm từng màn; SC-UI-2 / SC-UI-3 và hook trước khi đẩy đã bắt buộc.
- [ ] Nút "Không hiểu / không sửa được" cạnh lời nhắc, ghi vào nhật ký, để dev biết lời nhắc nào khó hiểu.
