# Tự động phát hiện – sửa – dựng lại lỗi (con dev)

> Viết 25/11/2026. Mục tiêu: lỗi xảy ra trên **con dev** (tester đang test, hoặc lúc demo) được **phát hiện ngay**, **gom theo phân hệ**,
> **sửa tự động hoặc bấm sửa**, đẩy code lên nhánh **`dev`**, rồi **dựng lại** con dev — không phải ai ngồi canh.
> Nhánh `test` / `main` **không** tự động: người phụ trách kéo `dev` sang khi thấy ổn.

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
node scripts/loi/keo-loi.mjs dung-lai                                # yêu cầu dựng lại con dev
```
`danh-sach` còn ghi `.loi/danh-sach.json` (đã bỏ qua trong git) để AI / người đọc.

## 5. Quy trình sửa một lỗi (người hoặc AI đều theo)
1. Kéo danh sách: `keo-loi.mjs danh-sach` (hoặc xem HT20). Chọn mục **Lỗi phần mềm** / **Được yêu cầu sửa** của phân hệ mình.
2. `danh-dau <mã> dang_sua` — người khác thấy đang có người sửa.
3. Mở **Tra mã** với mã tra cứu của mục: câu báo, chức năng, chỗ lỗi trong mã (stack), vết xử lý.
4. Sửa code trên nhánh làm việc, chạy `bash scripts/kiem-chuan.sh` + test của phân hệ. **Không đạt thì không đẩy.**
5. Commit (tiêu đề nêu mã mục lỗi, vd `fix(mua-hang): … [loi a1b2c3d4e5f6]`), đẩy **`git push origin HEAD:dev`**.
6. `danh-dau <mã> da_sua --commit <sha>` rồi `dung-lai`. Lần dựng lại xong, mục lỗi nào tái phát sẽ hiện lại.

## 6. Lịch tự sửa (tuỳ chọn)
- Chỉ chạy khi công tắc **Tự sửa** ở HT20 đang bật (`GET /api/v1/ket-noi/loi` trả `tuSua: true`).
- Mỗi lượt: tối đa 3 mục, chỉ loại **Lỗi phần mềm** hoặc **Được yêu cầu sửa**, theo đúng quy trình mục 5; đẩy **dev**, không đụng test / main.
- Chạy ở: máy local (Windows Task Scheduler gọi Claude Code mỗi ~10 phút — máy phải bật) hoặc lịch đám mây (routine, tối thiểu 1 giờ / lượt).

## 7. Giao kèo API (khoá kết nối — header `x-ket-noi-key`)
| Lệnh | Việc |
|---|---|
| `GET  /api/v1/ket-noi/loi?phanHe=&status=&loai=` | danh sách mục lỗi + `tuSua` + tình trạng dựng lại |
| `POST /api/v1/ket-noi/loi/trang-thai` `{fp, status, note?, commit?}` | đổi trạng thái một mục |
| `POST /api/v1/ket-noi/dung-lai/yeu-cau` `{note?}` | yêu cầu dựng lại con dev |
| `GET  /api/v1/ket-noi/dung-lai` | (cron máy chủ) lấy yêu cầu dựng lại đang chờ — trả `{id}` hoặc `{id: null}` |
| `POST /api/v1/ket-noi/dung-lai` `{id, ok, log}` | (cron máy chủ) báo kết quả dựng lại |

Màn HT20 dùng các lệnh tương ứng dưới `/api/v1/system/loi…` (đăng nhập bình thường).

## 8. Lưu ý an toàn
- Khoá kết nối chỉ đọc danh sách lỗi, đổi trạng thái, yêu cầu dựng lại — **không** đọc / ghi chứng từ, không chạy lệnh tuỳ ý.
- Dựng lại luôn qua `cap-nhat.sh` (có sao lưu CSDL + kiểm bản sao lưu trước khi đổi code).
- Tắt công tắc **Tự sửa** khi không muốn máy tự đẩy code (vd trước buổi demo quan trọng muốn "đóng băng").
