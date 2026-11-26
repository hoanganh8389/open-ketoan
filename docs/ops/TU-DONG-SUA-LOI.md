# Tự động phát hiện – sửa – dựng lại lỗi (con dev)

> Viết 25/11/2026. Mục tiêu: lỗi xảy ra trên **con dev** (tester đang test, hoặc lúc demo) được **phát hiện ngay**, **gom theo phân hệ**,
> **sửa tự động hoặc bấm sửa**, đẩy code lên nhánh **`dev`**, rồi **dựng lại** con dev — không phải ai ngồi canh.
> Nhánh `test` / `main` **không** tự động: người phụ trách kéo `dev` sang khi thấy ổn.
>
> **Đọc kèm:** [TRUY-LOI-BAN-DEV](TRUY-LOI-BAN-DEV.md) — đường **người** (kế toán chép mã tra cứu → dev DEV02 → AI) và `kiem-giam-sat.sh`;
> [AGENTS.md](../../AGENTS.md) — luật sửa lỗi bắt buộc (test tái hiện, bản đồ lỗi, không nới luật). Tài liệu này là đường **máy**: cùng luật đó.

## 1. Bức tranh chung

```
 Người dùng / tester thao tác trên con dev
        │ lỗi (máy chủ từ chối 4xx, lỗi phần mềm 5xx)
        ▼
 API ghi log JSON (mã lỗi, câu báo, route, mã tra cứu) ──► Promtail ──► Loki      (giữ log)
 API gửi vết xử lý (trace) ─────────────────────────────► OTel Collector ──► Tempo (giữ vết)
        │
        ▼ mỗi 60 giây
 [1] Máy quét lỗi (trong API): đọc Loki, GOM lỗi giống nhau thành một mục, chia PHÂN HỆ, phân LOẠI
        │                         lưu JSONL: <DATA_DIR>/he-thong/loi/<đơn vị>.jsonl
        ▼
 [2] Màn "Lỗi hệ thống" (HT20)  ── xem lịch sử, Tra mã, Sửa lỗi này, Bỏ qua, công tắc Tự sửa, Dựng lại ngay
        │
        ▼ khoá kết nối (khai ở HT13)
 [3] Lịch tự sửa (máy local / đám mây): kéo lỗi → sửa code → kiểm chuẩn + test → đẩy nhánh dev → đánh dấu "Đã sửa"
        │                                                                          → yêu cầu dựng lại
        ▼
 [4] Cron aaPanel trên máy chủ (mỗi phút): thấy yêu cầu dựng lại → ./scripts/cap-nhat.sh --yes → báo kết quả lên màn
```

Bộ giám sát (docker-compose.monitoring.yml) lo phần **ghi và giữ dấu vết**; bốn khối [1]–[4] lo phần **gom, sửa, dựng lại**.

| Thành phần | Dùng vào việc gì |
|---|---|
| Loki + Promtail | Nguồn lỗi của máy quét [1]; màn Tra mã đọc log của từng lần lỗi |
| Tempo + OTel Collector | Vết từng yêu cầu (module, action, CSDL) — giữ **mọi** trace 4xx / 5xx / chậm |
| Alertmanager | Báo tức thời khi lỗi 5xx tăng đột biến (webhook / Zalo / email) — tuỳ chọn |
| Prometheus + Grafana | Biểu đồ số lỗi trước / sau khi sửa — dùng khi báo cáo |

## 2. Phân hệ và người phụ trách

Máy quét chia lỗi theo **đường dẫn API** (route). Mỗi phân hệ có người phụ trách, nhận lỗi của phân hệ mình (lọc ở màn HT20
hoặc `node scripts/loi/keo-loi.mjs danh-sach --phan-he mua-hang`).

| Phân hệ (mã) | Đường dẫn API | Người phụ trách |
|---|---|---|
| Mua hàng (`mua-hang`) | `/api/v1/purchase/…` | *(điền)* — **ưu tiên làm trước** |
| Bán hàng (`ban-hang`) | `/api/v1/m/phieu-ban/…`, `/api/v1/m/pos/…`, `/api/v1/sales…` | *(điền)* |
| Kho (`kho`) | `/api/v1/inventory/…`, `/api/v1/stock…`, `/api/v1/kho/…`, `/api/v1/warehouses…` | *(điền)* |
| Danh mục (`danh-muc`) | `/api/v1/catalog…`, `/api/v1/products…`, `/api/v1/partners…`, `/api/v1/dimensions…`, `/api/v1/co-cau…`, `/api/v1/branches…`, `/api/v1/org-units…`, `/api/v1/unit…`, `/api/v1/item-classes…` | *(điền)* |
| Kế toán (`ke-toan`) | `/api/v1/accounts…`, `/api/v1/vouchers…`, `/api/v1/journal…`, `/api/v1/closing…`, `/api/v1/reports…`, `/api/v1/posting…` | *(điền)* |
| Quỹ / tiền (`quy`) | `/api/v1/cash…`, `/api/v1/bank…` | *(điền)* |
| Tài sản (`tai-san`) | `/api/v1/assets…`, `/api/v1/asset-events…` | *(điền)* |
| Thuế (`thue`) | `/api/v1/tax…`, `/api/v1/cit-returns…`, `/api/v1/invoice-risks…` | *(điền)* |
| Hệ thống (`he-thong`) | `/api/v1/system…`, `/api/v1/settings…`, `/api/v1/auth…`, còn lại | *(điền)* |

Bảng ánh xạ nằm ở `apps/api/src/modules/system/loi-he-thong.ts` (`PHAN_HE`) — thêm phân hệ / đường dẫn mới thì sửa ở đó **và** bảng này.

## 3. Loại lỗi và trạng thái

**Loại** (máy quét tự phân):
- **Lỗi phần mềm** — HTTP 5xx, log mức error / fatal. Code sai → **phải sửa code**. Lịch tự sửa chỉ tự xử lý loại này.
- **Từ chối** — HTTP 4xx có mã lỗi (VALIDATION_ERROR, CONFLICT…). Thường là dữ liệu nhập sai → **không sửa code**; xem câu báo đã đủ rõ
  chưa, có cần chặn sớm ở form không. Bấm "Sửa lỗi này" nếu thấy đây thật ra là lỗi code (vd chặn nhầm).

**Một mục lỗi** = các lần lỗi giống nhau (cùng phân hệ + mã lỗi + chức năng + câu báo, số trong câu báo coi như nhau). Mục có: số lần,
lần đầu, lần cuối, mã tra cứu gần nhất (mở Tra mã DEV02).

**Trạng thái**: `moi` (Mới) → `yeu_cau` (Được yêu cầu sửa) → `dang_sua` → `da_sua` (kèm commit) · hoặc `bo_qua`.
Mục đã sửa mà **lỗi xảy ra lại** sau lúc sửa → hiện **Tái phát**.

## 4. Cài đặt

### 4.1 Máy chủ (một lần, ở thư mục của con dev)
1. Bật bộ giám sát cho site dev (chỉ **một** site trên máy — Grafana / Prometheus chiếm cổng 3000 / 9090):
   ```bash
   cd /www/wwwroot/<thu-muc-dev>
   grep -q '^COMPOSE_FILE=' .env || echo 'COMPOSE_FILE=docker-compose.yml:infrastructure/monitoring/docker-compose.monitoring.yml' >> .env
   git fetch origin && git checkout -B dev origin/dev && git branch -u origin/dev
   ./scripts/cap-nhat.sh
   docker compose restart otel-collector
   ```
2. HT13 → **Công cụ & giám sát**: Loki `http://loki:3100`, Tempo `http://tempo:3200`, bấm **Tạo khoá kết nối** → Ghi. Chép khoá.
3. aaPanel → **Cron** → thêm tác vụ *Shell*, chu kỳ **1 phút**:
   ```bash
   cd /www/wwwroot/<thu-muc-dev> && KET_NOI_URL=https://ketoan-dev.quantri.thegioisua.com KET_NOI_KEY=<khoá> ./scripts/loi/dung-lai-theo-yeu-cau.sh
   ```
   Không có yêu cầu thì thoát ngay; có thì chạy `cap-nhat.sh --yes` và báo kết quả (thành công / lỗi + 40 dòng log cuối) lên HT20.

### 4.2 Máy local (người sửa lỗi)
```bash
# đặt một lần (PowerShell: $env:KET_NOI_URL=…; Git Bash: export …)
KET_NOI_URL=https://ketoan-dev.quantri.thegioisua.com
KET_NOI_KEY=<khoá>
node scripts/loi/keo-loi.mjs danh-sach --phan-he mua-hang          # lỗi mới của Mua hàng
node scripts/loi/keo-loi.mjs danh-dau <mã-mục> da_sua --commit <sha> # sau khi đẩy dev
node scripts/loi/keo-loi.mjs nhat-ky "Sửa …" --commit <sha> --muc <mã-mục>   # ghi Nhật ký sửa ở HT20
node scripts/loi/keo-loi.mjs dung-lai                                # yêu cầu dựng lại con dev
```
`danh-sach` còn ghi `.loi/danh-sach.json` (đã bỏ qua trong git) để AI / người đọc. Khoá + địa chỉ có thể ghi vào `.loi/ket-noi.env` (không vào git).

### 4.3 Nhiều máy cùng sửa — nhận diện và né nhau
- Mỗi lệnh `keo-loi.mjs` gửi tên máy **`<người git>@<tên máy>`** (đổi bằng biến `KET_NOI_MAY`); máy chủ ghi thêm **IP**.
  HT20 → khối **Kết nối** hiện cron máy chủ và từng máy sửa: ghé lần cuối, việc gần nhất (chấm xanh = đang chạy).
- **Giữ chỗ**: `danh-dau <mã> dang_sua` giữ mục đó **30 phút** cho máy vừa nhận (đánh dấu lại để gia hạn). Máy khác xin `dang_sua` / `da_sua`
  mục đó bị từ chối (lệnh thoát **mã 3**) → bỏ qua mục, làm mục khác. `danh-sach --co-the-nhan` chỉ liệt kê mục chưa ai giữ.
  Người trên HT20 vẫn đổi được trạng thái bất kỳ lúc nào (vd Mở lại khi máy treo).
- **Đẩy code**: luôn `git fetch origin && git rebase origin/dev` ngay trước `git push origin HEAD:dev`. Rebase xung đột → `git rebase --abort`,
  trả mục về `moi` kèm ghi chú, **không** ép đẩy (`--force` cấm).

### 4.4 Máy chủ chạy nhiều site (dev / test / main trên cùng một máy)
- Mỗi site đặt **`COMPOSE_PROJECT_NAME` riêng** trong `.env` (vd `ketoan-develop`). Chỉ **một** site bật bộ giám sát (cổng 3000 / 9090).
- Promtail gom log theo đúng tên đó (`LOKI_PROJECT = ${COMPOSE_PROJECT_NAME}`); `scripts/kiem-giam-sat.sh` cũng soi theo tên đó.
  Dòng đầu kết quả kiểm phải ghi `dự án docker: <tên site dev>` — ghi `ketoan` là đang soi nhầm site khác.
- Đổi cấu hình giám sát xong: `docker compose up -d --no-deps promtail` (cron Dựng lại cũng tự làm), rồi
  `docker compose exec -T promtail sh -c 'echo $LOKI_PROJECT'` phải in tên site dev.

### 4.5 Thử cả vòng (sau khi cài, hoặc khi nghi máy quét không bắt lỗi)
1. Mở `<site dev>/dev/tra-ma?ma=req-thu-may-quet` — máy chủ từ chối `NOT_FOUND` (lỗi do **máy chủ** trả, có log).
   Form chặn ngay trên trình duyệt (nút Ghi mờ, ô viền đỏ) **không** gửi lên máy chủ → không có log → HT20 không thấy (chỉ HT19 ghi).
2. 1–2 phút sau: HT20 → ô **kiểu từ chối hôm nay** có mục `NOT_FOUND GET /api/v1/system/devtools/requests/:requestId`.
3. Bấm **Tra mã** ở mục đó → DEV02 hiện câu báo, mã lỗi, vết xử lý (Tempo ✓ · Loki ✓). Xong bấm **Bỏ qua**.
4. Không thấy mục → chạy `bash scripts/kiem-giam-sat.sh` trên máy chủ, sửa tới khi ĐẠT.

## 5. Quy trình sửa một lỗi (người hoặc AI đều theo — luật ở [AGENTS.md](../../AGENTS.md))
1. Đầu phiên: `node scripts/moi-truong-dev.mjs --sua`.
2. Kéo danh sách: `keo-loi.mjs danh-sach --co-the-nhan` (hoặc xem HT20). Chọn mục **Lỗi phần mềm** / **Được yêu cầu sửa** của phân hệ mình.
   Mỗi mục có: mã lỗi, câu báo, chức năng (route), `errFp`, **commit của bản đang chạy** lúc lỗi, mã tra cứu.
3. `danh-dau <mã> dang_sua` — giữ chỗ 30 phút, máy khác né (§4.3).
4. Tìm nguyên nhân: đọc mã **đúng commit** của lần lỗi; tra nghĩa mã lỗi `npx bizcity explain <mã>`; cách đọc log ở
   [DOC-LOG-SUA-LOI](DOC-LOG-SUA-LOI.md). Cần log / trace chi tiết → **người** mở Tra mã (DEV02) bằng mã tra cứu rồi *Chép cho AI*
   (AI **không** tự gọi API devtools — D019-3; khoá kết nối cũng không đọc log).
5. Sửa theo AGENTS.md:
   - **viết test tái hiện đỏ đúng mã lỗi trước**, dữ liệu trong test là dữ liệu giả;
   - sửa **nguyên nhân**, không nới luật, không vá Kernel, không catch rỗng / hạ mức log;
   - bị từ chối **đúng luật** (loại *Từ chối*) → sửa chỗ gửi: màn báo trước, đúng ô, sửa tại chỗ; thêm tình huống vào bản đồ lỗi
     của màn `<Tên form>.failure-map.json` kèm lời nhắc + test.
6. `bash scripts/kiem-chuan.sh` + test của phân hệ + hook pre-push phải **ĐẠT**. Không đạt thì không đẩy.
7. Làm trên nhánh `loi/<mã-mục>` tách từ `origin/dev`. Commit `fix(<phân hệ>): … [loi <mã-mục>] errFp <errFp>`; `git fetch origin && git rebase origin/dev`; `git push origin HEAD:dev`.
   Hook pre-push: **chỉ đẩy vào `dev`** thì miễn giữ chỗ (R-FLOW-1 / 3) và "đứng sau main" (R-FLOW-5), **vẫn** chạy selfcheck và chặn
   đỏ mới so với `origin/dev`. Đẩy `test` / `main` kiểm đủ như cũ, đi PR. Hook chặn thì sửa cho đạt — **không** `--no-verify`, **không** `--force`.
8. `danh-dau <mã> da_sua --commit <sha>`; `nhat-ky "<sửa gì>" --commit <sha> --muc <mã> --chi-tiet "<nguyên nhân + test>"`; `dung-lai`.
   Lần dựng lại xong, mục nào tái phát sẽ hiện lại.

Không chắc nguyên nhân / cần trace mà chưa có → **không đoán sửa**: `danh-dau <mã> moi --ghi-chu "cần trace DEV02 …"` để người xử lý
theo đường TRUY-LOI-BAN-DEV.

## 6. Lịch tự sửa — tự động hết cho `dev` (mặc định TẮT)
Bật tự động: lỗi trên con dev tự sửa → tự đẩy `dev` → tự dựng lại, không ai phải động tay. `test` / `main` **không** tự động — đi PR, người duyệt.

| Muốn | Làm |
|---|---|
| **Bật** | (1) Nhờ Claude Code ở máy local "bật lịch tự sửa" (đặt lịch ~10 phút / lượt); (2) HT20 → tick **Tự sửa**; (3) cron aaPanel `dung-lai-theo-yeu-cau.sh` đang chạy (§4.1) |
| **Tạm dừng** (vd trước buổi demo muốn đóng băng) | HT20 → bỏ tick **Tự sửa** — lịch vẫn chạy nhưng mỗi lượt chỉ báo "đang tắt", không đụng code |
| **Tắt hẳn** | Nhờ Claude Code "tắt lịch tự sửa" |

- Mỗi lượt: tối đa 3 mục, chỉ **Lỗi phần mềm** hoặc **Được yêu cầu sửa**, đúng từng bước mục 5 (test tái hiện, kiểm chuẩn, hook ĐẠT); không chắc
  nguyên nhân thì không sửa, trả mục về **Mới** kèm ghi chú.
- Theo dõi: HT20 → **Kết nối** (máy nào đang chạy) và **Nhật ký sửa** (sửa gì, lỗi nào, commit nào); lịch sử nhánh `dev` trên GitHub
  (commit có `[loi <mã>]`).
- Lịch chạy trong phiên Claude Code ở máy local: tắt máy / đóng phiên là dừng; lịch tự hết hạn sau 7 ngày — nhờ bật lại.

## 7. Giao kèo API (khoá kết nối — header `x-ket-noi-key`)
| Lệnh | Việc |
|---|---|
| `GET  /api/v1/ket-noi/loi?phanHe=&status=&loai=` | danh sách mục lỗi + `tuSua` + tình trạng dựng lại |
| `POST /api/v1/ket-noi/loi/trang-thai` `{fp, status, note?, commit?}` | đổi trạng thái một mục |
| `POST /api/v1/ket-noi/dung-lai/yeu-cau` `{note?}` | yêu cầu dựng lại con dev |
| `POST /api/v1/ket-noi/nhat-ky` `{tomTat, commit?, fps[], chiTiet?}` | ghi Nhật ký sửa |
| header `x-ket-noi-may` | tên máy gọi (nhận diện + giữ chỗ); không gửi = cron máy chủ |
| `GET  /api/v1/ket-noi/dung-lai` | (cron máy chủ) lấy yêu cầu dựng lại đang chờ — trả `{id}` hoặc `{id: null}` |
| `POST /api/v1/ket-noi/dung-lai` `{id, ok, log}` | (cron máy chủ) báo kết quả dựng lại |

Màn HT20 dùng các lệnh tương ứng dưới `/api/v1/system/loi…` (đăng nhập bình thường).

## 8. Lưu ý an toàn
- Khoá kết nối chỉ đọc danh sách lỗi (không đọc log / trace — D019-3), đổi trạng thái, ghi nhật ký sửa, yêu cầu dựng lại — **không** đọc / ghi chứng từ, không chạy lệnh tuỳ ý.
- Dựng lại luôn qua `cap-nhat.sh` (có sao lưu CSDL + kiểm bản sao lưu trước khi đổi code).
- Tắt công tắc **Tự sửa** khi không muốn máy tự đẩy code (vd trước buổi demo quan trọng muốn "đóng băng").
