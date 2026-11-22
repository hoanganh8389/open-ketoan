# Đọc nhật ký lỗi để sửa mã — cho dev và AI của dev
<!-- [2026-11-22 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — B5: sổ tay cơ chế log + cách đọc, phân tích log để sửa mã cho đúng (chủ dự án yêu cầu 2026-11-22: dev và AI của dev phải hiểu cơ chế log và phân tích được log) -->

> **Dành cho:** người viết mã (Lõi, phân hệ, giao diện, add-in — vd Nguyễn Văn Thủy, Võ Hoàng, kiennt, khanhtd) **và trợ lý AI họ dùng** (Claude Code, Codex, Cursor, Copilot).
> **Luật:** [R-LOG](../rules/RULE-LOG.md) (Johnny Chu – Chu Hoàng Anh khởi tạo 2026-11-21) · [CANON §0.12](../00-CANON.md) · **Thiết kế:** [PHASE-038](../phases/PHASE-038-NHAT-KY-LOI-CO-DINH/README.md).
> **Có bộ giám sát (Loki, Tempo, Grafana):** đi tiếp ở [SO-TAY-DIEU-TRA-LOI](SO-TAY-DIEU-TRA-LOI.md). Sổ tay này cho trường hợp thường gặp: **bản cài của khách, chỉ có thư mục `logs/` hoặc gói `lay-log.sh`**.
> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.

Sổ tay trả lời ba câu: **log được ghi ở đâu và ghi gì** (§1–§2), **người dùng thấy X thì tìm dòng nào** (§3), **từ dòng log tới chỗ sửa trong mã thế nào** (§4–§6). §7 là quy trình rút gọn để giao cho trợ lý AI.

## 1. Cơ chế một trang

```
 Trình duyệt ──(lỗi render / không bắt)──► POST /api/v1/system/client-errors ─┐
     │                                                                        ▼
     │ /api/*, /mcp                          logs/web-client/<ngày>.log   (B4b)
     ▼
 nginx (web) ── api không trả lời ──► JSON GATEWAY_UNAVAILABLE + logs/web/<ngày>.log   (B2)
     │
     ▼
 API (Fastify + pino) ── mọi dòng ──► stdout ──► docker compose logs / Loki (nếu bật)
     │                └─ dòng ≥ warn ──► logs/api/<ngày>.log                       (B1)
     │   lỗi khởi động / lỗi không bắt ──► dòng fatal ghi ĐỒNG BỘ rồi thoát mã 1   (R-LOG-3)
     │   subscriber (tác vụ nền) lỗi ──► warn (còn lượt) / error (dead) có eventId (B1b)
     ▼
 Job db-migrate ── mỗi lần chạy ──► logs/db-migrate/<ngày>.log (đầu khối, migration, cuối khối / fatal)
```

- **Một dịch vụ một thư mục, một ngày một tệp** `<YYYY-MM-DD>.log` theo giờ Việt Nam; ngày lỗi dồn dập thêm `<ngày>.1.log`. Giữ **30 ngày**, cả `logs/` ≤ 200 MB (R-LOG-9, D038-7). Tệp kiểu cũ (`api-loi.log`…) ở gốc `logs/` là của bản cài trước 2026-11-22.
- `logs/web/dang-ghi.log` là phút gần nhất của nginx, chưa chuyển sang tệp ngày.
- Chỉ logger của Platform (`packages/platform/src/core/logger.ts`) và script xoay của nginx ghi các tệp này. **Không** có nhật ký nghiệp vụ ở đây (sổ, chứng từ nằm trong CSDL).
- Mỗi dòng của API / db-migrate / web-client là **một đối tượng JSON** (khuôn pino). Dòng của nginx là chữ thường. `db-migrate` có thêm dòng chữ `<giờ ISO> <câu in ra>` của migration / seed.

## 2. Đọc một dòng JSON

```json
{"level":50,"time":1795327757447,"pid":1,"service":"api","version":"0.1.0","commit":"65b17dcccb65",
 "reqId":"req-3515c050-f94a","traceId":"85e1…","evt":"bizcity.kho.ghi_so_loi","fn":"postPhieu",
 "errFp":"05d3f326deff","err":{"type":"TypeError","message":"…","code":"23505","table":"partners",
 "constraint":"uq_partner_tax","stack":"TypeError: …\n    at postPhieu (/app/packages/kernel/src/…ts:120:15)","cause":{…}},
 "msg":"Ghi sổ phiếu kho lỗi"}
```

| Trường | Nghĩa | Dùng để |
|---|---|---|
| `level` | 30 info · 40 warn · 50 error · 60 fatal | `error` = cần người sửa; `warn` = đã lùi / sẽ thử lại; `fatal` = tiến trình dừng |
| `time` | mili giây unix (UTC) | đổi giờ: `new Date(time)` |
| `service` · `version` · `commit` | dịch vụ, phiên bản, 12 ký tự đầu của commit đang chạy | **checkout đúng `commit`** trước khi đọc mã — dòng số trong stack chỉ đúng với bản đó |
| `reqId` | mã yêu cầu = `requestId` người dùng thấy ở khay Mã tra cứu | nối lời kể của người dùng với dòng log |
| `traceId` | mã trace (khi bật truy vết) | tra Tempo nếu có bộ giám sát |
| `evt` | tên sự kiện máy đọc `bizcity.<miền>.<việc>` | lọc / đếm theo loại việc |
| `msg` | câu tiếng Việt cho người đọc | đọc nhanh; **không** dùng để lọc (giá trị người dùng không bao giờ nằm trong `msg`) |
| `errFp` | dấu vân lỗi 12 ký tự: loại lỗi + 3 khung stack đầu trong `apps/` · `packages/` | **gom lỗi trùng**: 1.000 dòng cùng `errFp` = một việc. `errFp` chưa từng thấy sau bản cập nhật = lỗi mới |
| `err.type` · `err.message` · `err.stack` | lỗi gốc; stack trỏ thẳng tệp `.ts` (ảnh API chạy `--enable-source-maps`) | mở đúng tệp, đúng dòng |
| `err.code` · `err.table` · `err.constraint` · `err.routine` | lỗi Postgres: mã SQLSTATE, bảng, ràng buộc | `23505` trùng khoá, `23503` khoá ngoại, `42501` thiếu quyền, `40001` / `40P01` tranh chấp — tra ràng buộc trong `db/migrations/` |
| `err.cause` | chuỗi lỗi gốc (tối đa 5 lớp) | lỗi thật thường ở lớp trong cùng |
| `job` · `fn` · `module` · `attempt` · `maxAttempts` · `eventId` · `eventType` | tác vụ nền (subscriber) | `evt: bizcity.event.delivery_retry` (còn lượt) / `delivery_dead` (hết lượt — có người phải xem) |
| `reason` · `hint` | lỗi khởi động `evt: bizcity.system.start_failed` | `MIGRATION_PENDING`, `DB_UNREACHABLE`, `DB_AUTH_FAILED`, `ENV_INVALID`, `PORT_IN_USE`, `UNKNOWN` — `hint` là việc làm tiếp |
| `cid` · `screen` · `kind` · `frames` | lỗi giao diện (`web-client/`) | `cid` = mã tra cứu trên màn "Màn này gặp lỗi"; `frames` là vị trí trong bản dựng `assets/*.js` (§5) |
| `***` | giá trị đã bị che (R-LOG-4) | không phải lỗi; dữ liệu cá nhân không bao giờ có trong log |

**Không có trong log, cố ý:** thân yêu cầu, giá trị ô nhập, mật khẩu, token, MST / SĐT / email cá nhân, số tài khoản, `detail` của lỗi Postgres (chứa giá trị). Cần biết giá trị nào sai thì tái hiện trên máy dev — đừng xin khách gửi dữ liệu hay `.env`.

## 3. Người dùng thấy gì → tìm ở đâu

| Người dùng thấy / báo | Tìm | Đọc gì |
|---|---|---|
| Khay **"Không kết nối được máy chủ phần mềm"** + mã tra cứu | `logs/web/<ngày>.log` theo `rid=<mã>` | `upstream=-` / "could not be resolved" / "Connection refused" = api không chạy → tiếp ở `logs/api/` dòng `level 60` gần đó |
| API không lên sau cập nhật | `logs/api/<ngày>.log` dòng `evt: bizcity.system.start_failed` | `reason`, `hint`. `MIGRATION_PENDING` → `logs/db-migrate/<ngày>.log` |
| Cập nhật lỗi ở bước cơ sở dữ liệu | `logs/db-migrate/<ngày>.log` | khối cuối: `migrate_started` → tên migration → `fatal` có tên tệp migration, `err.code`, `err.cause` |
| Hộp **Mã tra cứu** có `requestId` (`req-…`) | `logs/api/` theo `reqId` | dòng `error` của yêu cầu đó: `err.stack`, `errFp` |
| Màn **"Màn này gặp lỗi, chưa hiển thị được"** + mã | `logs/web-client/` theo `cid` | `type`, `message`, `frames`, `screen` |
| Chứng từ không vào sổ / việc nền không chạy | `logs/api/` `evt` bắt đầu `bizcity.event.` | `fn` = subscriber, `eventId`, `attempt`, `err` |
| "Lâu lâu lại lỗi" | `logs/api/` nhóm theo `errFp` | §4 lệnh đếm |

Lỗi người dùng nhập sai (4xx: thiếu định khoản, kỳ đã khoá…) **không** nằm trong `logs/api/` — đó là `info` ở stdout và có mã lỗi + phương án sửa trên màn ([BIZCITY-ERRORS](../contracts/BIZCITY-ERRORS-v1.md)). Không sửa mã cho những lỗi này trừ khi thông báo sai.

## 4. Lệnh phân tích (Node có sẵn trong mọi máy dev; không cần `jq`)

Chạy trong thư mục đã giải nén gói (`goi-bao-loi-*/`) hoặc trên máy chủ ở thư mục cài.

```bash
# Các lỗi khác nhau trong logs/api/, mỗi lỗi bao nhiêu lần, lần cuối lúc nào, câu đầu
node -e '
const fs=require("fs"),p=require("path"),d="logs/api",m=new Map();
for(const f of fs.readdirSync(d).filter(n=>n.endsWith(".log")))for(const l of fs.readFileSync(p.join(d,f),"utf8").split("\n")){
  if(!l.startsWith("{"))continue;const j=JSON.parse(l);if(j.level<50)continue;const k=j.errFp||j.evt||j.msg;
  const x=m.get(k)||{n:0,commit:j.commit,evt:j.evt,msg:j.msg,type:j.err&&j.err.type};x.n++;x.last=new Date(j.time).toISOString();m.set(k,x);}
console.table([...m].sort((a,b)=>b[1].n-a[1].n).map(([k,v])=>({errFp:k,...v})));'

# Mọi dòng của một yêu cầu (requestId trên khay Mã tra cứu)
grep -h '"reqId":"req-3515c050-f94a"' logs/api/*.log

# Lỗi khởi động
grep -h '"evt":"bizcity.system.start_failed"' logs/api/*.log | tail -3

# Lỗi mới của bản đang chạy: errFp có ở commit hiện tại mà không có ở commit trước
node -e '
const fs=require("fs"),p=require("path"),d="logs/api",by={};
for(const f of fs.readdirSync(d))for(const l of fs.readFileSync(p.join(d,f),"utf8").split("\n")){if(!l.startsWith("{"))continue;const j=JSON.parse(l);if(j.level>=50&&j.errFp)(by[j.commit]??=new Set).add(j.errFp);}
const cs=Object.keys(by);console.log("commit:",cs);const [cu,moi]=cs.slice(-2);if(moi)console.log("errFp mới ở",moi,":",[...by[moi]].filter(x=>!by[cu].has(x)));'

# Lỗi giao diện theo mã tra cứu trên màn
grep -h '"cid":"abcdef123456"' logs/web-client/*.log

# Cổng vào: các lần trả 5xx hôm nay
cat logs/web/*.log | grep -E ' 50[234] '
```

## 5. Từ dòng log tới mã

1. **Đúng bản mã:** `git checkout <commit>` (trường `commit`; chỉ có 12 ký tự đầu — đủ cho git). Không có `commit` (bản cài chạy `docker compose up` tay) → đối chiếu `version` và giờ cập nhật trong `00-tom-tat.txt` của gói.
2. **API:** đọc `err.stack` từ trên xuống, dừng ở khung **đầu tiên trong `apps/` hoặc `packages/`** — đó là chỗ mã của mình (khung trong `node_modules` là thư viện). Có `err.cause` thì đọc lớp trong cùng trước.
3. **Lỗi Postgres:** `err.code` + `err.constraint` / `err.table` → tìm ràng buộc trong `db/migrations/` (`grep -rn uq_partner_tax db/migrations`), rồi tìm chỗ mã ghi bảng đó.
4. **Giao diện:** `frames` trỏ bản dựng đã nén (`assets/index-<băm>.js:1:23456`). Đổi về `.ts`:
   ```bash
   git checkout <commit>
   (cd apps/web && npx vite build --sourcemap)        # cùng commit + cùng package-lock thường ra cùng tên tệp băm
   node -e 'const {SourceMap}=require("node:module"),fs=require("fs");
     const m=new SourceMap(JSON.parse(fs.readFileSync("apps/web/dist/assets/index-Bx12ab.js.map","utf8")));
     console.log(m.findEntry(1-1, 23456-1));'          # dòng, cột trong frames (trừ 1)
   ```
   `originalSource` + `originalLine` (đếm từ 0) là tệp và dòng gốc. Tên tệp băm khác bản trong log = commit hoặc phụ thuộc khác, quay lại bước 1. Tên hàm trong bản nén đã bị đổi — tra theo vị trí, không theo tên.
5. **Tác vụ nền:** `fn` là `id` của subscriber (`defineSubscriber`), `eventType` là sự kiện; tái hiện bằng test gọi `dispatchOnce` (mẫu: `apps/api/test/nhat-ky-loi-su-kien.test.ts`).

## 6. Sửa cho đúng — không che triệu chứng

- **Sửa nguyên nhân, kèm test tái hiện** (test đỏ trước, xanh sau). Ghi `errFp` vào mô tả PR — sau khi triển khai, `errFp` đó không còn xuất hiện là bằng chứng đã sửa.
- **Không** "làm hết lỗi" bằng cách bắt rồi bỏ: `catch {}` / `.catch(() => undefined)` mới bị **SC-LOG-2** chặn. Bỏ qua có chủ ý thì ghi `// nuot-loi: <lý do>`; lùi được thì `log.warn({ err }, '…, đã lùi về …')`.
- **Không** hạ mức `error` → `warn` / `info` để log "sạch": mức chọn theo câu hỏi "có người phải sửa mã / hạ tầng không?" (R-LOG-7).
- Ghi lỗi mới bằng `logError(log, err, { evt: 'bizcity.<miền>.<việc>', … }, 'câu tiếng Việt')` hoặc `log.error({ err }, …)` — **không** `err: String(err)`, `err.message`, `console.*` (**SC-LOG-1**). Giá trị người dùng không ghép vào `msg` (R-LOG-11).
- Thêm trường nhạy cảm mới (vd mã số cá nhân mới) → thêm vào `REDACT_PATHS` trong `core/logger.ts` kèm test.
- Lỗi do người dùng nhập sai → trả lỗi có mã (`Errors.*`, BIZCITY-ERRORS) và phương án sửa, **không** ghi `error`.

## 7. Giao cho trợ lý AI — quy trình rút gọn

Dán đoạn dưới cùng gói log (hoặc vài dòng log) cho trợ lý:

> Đọc theo `docs/ops/DOC-LOG-SUA-LOI.md`. (1) Lấy `commit` trong log / `00-tom-tat.txt`, đọc mã ở đúng commit đó. (2) Gom lỗi theo `errFp` (§4), xếp theo số lần và mức. (3) Với từng `errFp` quan trọng: đi từ khung stack đầu tiên trong `apps/` · `packages/` (giao diện: đổi `frames` qua source map, §5), tìm nguyên nhân gốc (đọc `err.cause`, `err.code` / `err.constraint`). (4) Đề xuất sửa nguyên nhân + test tái hiện; theo luật R-LOG khi chạm `catch` / log. (5) Không xin `.env` hay dữ liệu khách; không che lỗi bằng catch rỗng hay hạ mức log. (6) Báo lại: `errFp` nào đã hiểu và sửa, `errFp` nào cần thêm thông tin (cần gì, lấy ở đâu).

Trợ lý trong repo này (Claude Code, Codex, Cursor qua `AGENTS.md`; Copilot qua `.github/copilot-instructions.md`) đã được dặn đọc sổ tay này khi nhận log.

## 8. Log không đủ để hiểu

- Lỗi xảy ra ở mức `info` (không vào `logs/api/`): tạm đặt `LOG_FILE_LEVEL=info` trong `.env`, `docker compose up -d api`, tái hiện, rồi trả về `warn` (tệp lớn nhanh hơn — vẫn có trần).
- Cần đường đi của cả yêu cầu (chậm, nhiều dịch vụ): bật bộ giám sát, dùng `traceId` — [SO-TAY-DIEU-TRA-LOI](SO-TAY-DIEU-TRA-LOI.md) §0.1–§0.4.
- Thiếu một trường cần thiết để hiểu loại lỗi này: thêm trường **định danh** (mã, tên trường — không giá trị) vào chỗ ghi log trong cùng PR sửa, theo R-LOG-11.
