#!/usr/bin/env bash
# [2026-11-25 09:11 PM Johnny Chu - Chu Hoàng Anh] STD-12b — câu nhắc: cap-nhat*.sh đã tự ghép tệp giám sát.
# [2026-11-25 09:03 PM Johnny Chu - Chu Hoàng Anh] STD-12 — kiểm + sửa bộ truy lỗi (OpenTelemetry → Tempo, Loki, nhật ký từ chối) trên máy dev cPanel/VPS.
# =============================================================================
#   bash scripts/kiem-giam-sat.sh                 CHỈ KIỂM, không đổi gì. In ra toàn mã / tên biến / số đếm — dán lại cho người hỗ trợ được, không lộ bí mật.
#   bash scripts/kiem-giam-sat.sh --ma <traceId>  kiểm thêm một mã tra cứu: có trong Tempo không, có trong nhật ký lỗi không
#   bash scripts/kiem-giam-sat.sh --sua           sửa những gì thiếu (hỏi xác nhận trước mỗi bước đổi):
#        - .env: thêm OTEL_EXPORTER_OTLP_ENDPOINT (API gửi trace), TRACE_SAMPLE_PERCENT=100 (máy dev giữ mọi trace),
#                GRAFANA_ADMIN_PASSWORD (sinh ngẫu nhiên nếu chưa có) — SAO LƯU .env trước, không xoá dòng nào
#        - bật các dịch vụ giám sát còn tắt (gọi ĐÍCH DANH, --no-deps; không bao giờ đụng db, web)
#        - tạo lại otel-collector khi đổi tỉ lệ lấy mẫu; tạo lại api (vài giây gián đoạn) khi api chưa có endpoint
#
# An toàn (docs/ops/DEPLOY.md §5 — máy hay lỗi "overlay2 … busy"):
#   KHÔNG chạy "docker compose up -d" trần, KHÔNG đụng container web, KHÔNG đụng db / volume / dữ liệu kế toán.
# Chạy ở thư mục cài phần mềm (nơi có docker-compose.yml và .env), hoặc đặt APP_DIR=<thư mục>. Lấy bản mới nhất không cần git pull:
#   curl -fsSL https://raw.githubusercontent.com/hoanganh8389/open-ketoan/main/scripts/kiem-giam-sat.sh -o /tmp/kiem-giam-sat.sh && APP_DIR=$PWD bash /tmp/kiem-giam-sat.sh
# =============================================================================
set -uo pipefail
if [ -n "${APP_DIR:-}" ]; then cd "$APP_DIR"; elif [ ! -f docker-compose.yml ]; then cd "$(dirname "$0")/.." 2>/dev/null || true; fi
[ -f docker-compose.yml ] || { echo "Chạy ở thư mục cài phần mềm (có docker-compose.yml), hoặc đặt APP_DIR=<thư mục>"; exit 2; }

SUA=0; MA=""
while [ $# -gt 0 ]; do case "$1" in --sua) SUA=1;; --ma) MA="${2:-}"; shift;; esac; shift; done

MON=infrastructure/monitoring/docker-compose.monitoring.yml
# [2026-11-25 12:00 AM Nguyễn Văn Thủy] HT20 — Tên dự án docker theo đúng thứ tự docker compose: biến môi trường → COMPOSE_PROJECT_NAME trong .env → name: trong compose.
# Máy có nhiều site (dev / test / main) mỗi site đặt COMPOSE_PROJECT_NAME riêng — chỉ đọc name: sẽ soi (và sửa) nhầm container của site khác. (đóng góp)
PROJ="${COMPOSE_PROJECT_NAME:-$(grep -E '^COMPOSE_PROJECT_NAME=' .env 2>/dev/null | tail -n1 | cut -d= -f2- | tr -d '\r"')}"
[ -n "$PROJ" ] || PROJ="$(grep -E '^name:' docker-compose.yml | awk '{print $2}' | tr -d '\r')"; PROJ="${PROJ:-ketoan}"
C="docker compose -p $PROJ -f docker-compose.yml -f $MON"
ok()   { echo "  ✔ $*"; }
bad()  { echo "  ✘ $*"; LOI=$((LOI+1)); }
warn() { echo "  ! $*"; }
LOI=0
env_get() { grep -E "^$1=" .env 2>/dev/null | tail -n1 | cut -d= -f2- | tr -d '\r'; }
cid() { docker ps -q --filter "label=com.docker.compose.project=$PROJ" --filter "label=com.docker.compose.service=$1" | head -n1; }
hoi() { [ "$SUA" = 1 ] || return 1; read -r -p "    → $1 [c/K] " a </dev/tty; [ "$a" = "c" ] || [ "$a" = "C" ]; }
# gọi HTTP trong mạng nội bộ của dự án, qua một container có wget (prometheus / grafana / loki dùng busybox)
http_in() {
  for s in prometheus grafana alertmanager; do
    local id; id="$(cid "$s")"; [ -n "$id" ] || continue
    docker exec "$id" wget -q -T 8 -O - "$1" 2>/dev/null && return 0
  done
  return 1
}

echo "== Bộ truy lỗi — $(hostname) — $(date '+%Y-%m-%d %H:%M')"
echo "   commit $(git rev-parse --short HEAD 2>/dev/null || echo '?') · dự án docker: $PROJ"

echo "== 1. Tệp cấu hình (.env — chỉ in TÊN biến; hai biến không bí mật in cả giá trị)"
[ -f .env ] || { bad ".env không có"; exit 1; }
EP="$(env_get OTEL_EXPORTER_OTLP_ENDPOINT)"; PCT="$(env_get TRACE_SAMPLE_PERCENT)"
[ -n "$EP" ] && ok "OTEL_EXPORTER_OTLP_ENDPOINT=$EP" || warn "OTEL_EXPORTER_OTLP_ENDPOINT chưa ghi trong .env — api lấy từ tệp compose giám sát (scripts/cap-nhat*.sh tự ghép khi bộ giám sát chạy, từ STD-12b). Mục 3 cho biết api có gửi không"
[ "${PCT:-10}" = "100" ] && ok "TRACE_SAMPLE_PERCENT=100 (máy dev giữ mọi trace)" || warn "TRACE_SAMPLE_PERCENT=${PCT:-10 (mặc định)} — yêu cầu THÀNH CÔNG chỉ giữ ${PCT:-10}% (lỗi 4xx/5xx, chậm >1s vẫn giữ hết). Máy dev nên 100"
[ -n "$(env_get GRAFANA_ADMIN_PASSWORD)" ] && ok "GRAFANA_ADMIN_PASSWORD có" || bad "GRAFANA_ADMIN_PASSWORD chưa có (bộ giám sát cần)"
[ "$(env_get OTEL_SDK_DISABLED)" = "true" ] && bad "OTEL_SDK_DISABLED=true — truy vết bị tắt hẳn"

echo "== 2. Container"
for s in db api otel-collector tempo loki promtail prometheus grafana alertmanager; do
  id="$(cid "$s")"
  if [ -n "$id" ]; then ok "$s: $(docker inspect -f '{{.State.Status}}{{if .State.Health}} ({{.State.Health.Status}}){{end}}' "$id")"
  else case "$s" in db|api) bad "$s không chạy";; *) bad "$s không chạy (dịch vụ giám sát)"; TAT="${TAT:-} $s";; esac; fi
done
WEB="$(docker ps --filter "name=^${PROJ}-web" --format '{{.Names}}' | head -n1)"; [ -n "$WEB" ] && ok "web: $WEB$(case "$WEB" in *-web-[0-9][0-9][0-9][0-9]*) echo ' (chạy ngoài Compose theo DEPLOY §5 — bình thường trên máy cPanel)';; esac)" || warn "không thấy container web"

echo "== 3. API có gửi trace không (biến môi trường của container api — chỉ tên, không giá trị bí mật)"
API="$(cid api)"
if [ -n "$API" ]; then
  AEP="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$API" | grep -E '^OTEL_EXPORTER_OTLP_ENDPOINT=' | cut -d= -f2-)"
  [ -n "$AEP" ] && ok "api đang gửi trace tới $AEP" || bad "api KHÔNG có OTEL_EXPORTER_OTLP_ENDPOINT → không trace nào tới Tempo"
  for k in DEVTOOLS_TEMPO_URL DEVTOOLS_LOKI_URL; do docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$API" | grep -q "^$k=." && ok "api có $k (màn Tra mã đọc được)" || bad "api thiếu $k → màn Tra mã không đọc được nguồn"; done
  echo "    lưu ý: bản scripts/cap-nhat*.sh cũ (trước STD-12b) dựng api không kèm tệp giám sát → api mất DEVTOOLS_* và endpoint trace sau cập nhật. Bản mới tự ghép khi bộ giám sát đang chạy."
fi

echo "== 4. Tempo, Loki nhận dữ liệu không"
NOW=$(date +%s); FROM=$((NOW-3600))
T="$(http_in "http://tempo:3200/api/search?start=$FROM&end=$NOW&limit=50")"
if [ -n "$T" ]; then n=$(printf '%s' "$T" | grep -o '"traceID"' | wc -l); [ "$n" -gt 0 ] && ok "Tempo: $n trace trong 1 giờ qua (tối đa 50)" || bad "Tempo chạy nhưng 1 giờ qua KHÔNG có trace nào → api không gửi (xem mục 3) hoặc chưa ai thao tác"
else warn "không hỏi được Tempo từ mạng nội bộ (thiếu container có wget, hoặc tempo tắt)"; fi
L="$(http_in "http://loki:3100/loki/api/v1/labels")"; [ -n "$L" ] && ok "Loki trả lời ($(printf '%s' "$L" | grep -o '"[a-z_]*"' | tr '\n' ' ' | cut -c1-80))" || warn "không hỏi được Loki"

echo "== 5. Nhật ký lần ghi bị từ chối (HT19) — 24 giờ qua, chỉ mã, không dữ liệu"
if [ -n "$API" ]; then
docker exec -i "$API" node - <<'NODE' 2>/dev/null || warn "không đọc được nhật ký trong container api"
const fs = require('fs'), path = require('path');
const root = path.join(process.env.DATA_DIR || '/app/apps/api/data', 'nhat-ky', 'kiem-khai-bao');
const since = Date.now() - 864e5, m = new Date().toISOString().slice(0, 7);
const count = new Map(); let rows = 0, withField = 0, form = 0;
let tenants = []; try { tenants = fs.readdirSync(root); } catch { console.log('  ! chưa có thư mục nhật ký từ chối (chưa ai bị từ chối, hoặc DATA_DIR khác)'); process.exit(0); }
for (const t of tenants) {
  let txt = ''; try { txt = fs.readFileSync(path.join(root, t, `${m}.jsonl`), 'utf8'); } catch { continue; }
  for (const l of txt.split('\n')) {
    if (!l) continue; let e; try { e = JSON.parse(l); } catch { continue; }
    if (Date.parse(e.at) < since) continue; const d = e.data || {};
    if (d.ok && !(d.failed || []).length) continue;
    rows++; if (d.source === 'form') form++;
    for (const f of d.failed || []) { if (f.field) withField++; const k = `${(d.entity || '?').slice(0, 40)}  ${f.code}`; count.set(k, (count.get(k) || 0) + 1); }
  }
}
console.log(`  ✔ ${rows} lần ghi bị từ chối (${form} do form chặn trên trình duyệt — loại này KHÔNG có trace), ${withField} lỗi chỉ được ô cụ thể`);
for (const [k, n] of [...count].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`      ×${String(n).padEnd(4)} ${k}`);
NODE
fi

if [ -n "$MA" ]; then
  echo "== 6. Mã tra cứu $MA"
  case "$MA" in *[!0-9a-fA-F]*) warn "mã trace phải là 32 ký tự hex (mã yêu cầu dạng req-… thì tra trong logs/api)";; esac
  R="$(http_in "http://tempo:3200/api/traces/$MA")"
  if [ -n "$R" ]; then ok "CÓ trong Tempo ($(printf '%s' "$R" | grep -o '"name":"[^"]*"' | head -3 | tr '\n' ' '))"
  else bad "KHÔNG có trong Tempo — lý do có thể: (a) api chưa gửi trace (mục 3), (b) yêu cầu thành công và rơi ngoài ${PCT:-10}% lấy mẫu, (c) lỗi do form chặn trên trình duyệt (không có trace — tra màn HT19), (d) quá 7 ngày"; fi
  n=$(grep -rl "$MA" logs/ 2>/dev/null | wc -l); [ "$n" -gt 0 ] && ok "có trong $n tệp nhật ký lỗi (logs/)" || echo "    (không có trong logs/ — chỉ lỗi mức warn trở lên mới ghi tệp)"
fi

if [ "$SUA" = 1 ]; then
  echo "== SỬA (mỗi bước hỏi trước; trả lời c để làm)"
  DOI_ENV=0
  if [ -z "$EP" ] || [ "${PCT:-10}" != "100" ] || [ -z "$(env_get GRAFANA_ADMIN_PASSWORD)" ]; then
    if hoi "Sao lưu .env rồi thêm biến còn thiếu (endpoint trace, lấy mẫu 100%, mật khẩu Grafana)?"; then
      BK=".env.bak-$(date +%Y%m%d-%H%M%S)"; cp .env "$BK"; echo "      sao lưu: $BK"
      set_env() { if grep -qE "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else printf '%s=%s\n' "$1" "$2" >> .env; fi; }
      [ -n "$EP" ] || set_env OTEL_EXPORTER_OTLP_ENDPOINT http://otel-collector:4318
      [ "${PCT:-10}" = "100" ] || set_env TRACE_SAMPLE_PERCENT 100
      [ -n "$(env_get GRAFANA_ADMIN_PASSWORD)" ] || set_env GRAFANA_ADMIN_PASSWORD "$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | cut -c1-24)"
      DOI_ENV=1; echo "      đã ghi .env (giá trị bí mật không in)"
    fi
  fi
  if [ -n "${TAT:-}" ] && hoi "Bật dịch vụ giám sát đang tắt:${TAT} (gọi đích danh, --no-deps, không đụng db/web)?"; then
    case " $TAT " in *" tempo "*) $C up -d --no-deps tempo-init;; esac
    $C up -d --no-deps $TAT
  fi
  if [ "$DOI_ENV" = 1 ] && [ -n "$(cid otel-collector)" ] && hoi "Tạo lại otel-collector để nhận tỉ lệ lấy mẫu mới?"; then $C up -d --no-deps --force-recreate otel-collector; fi
  API_EP="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$(cid api)" 2>/dev/null | grep -E '^OTEL_EXPORTER_OTLP_ENDPOINT=.' || true)"
  if [ -z "$API_EP" ] && hoi "Tạo lại container api để gửi trace (gián đoạn API vài giây; db, web không đụng)?"; then
    # cả hai tệp compose: tệp giám sát thêm OTEL_EXPORTER_OTLP_ENDPOINT + DEVTOOLS_* (màn Tra mã đọc Tempo / Loki); compose gốc một mình làm mất DEVTOOLS_*
    $C up -d --no-deps api
    echo "      chờ api khoẻ…"; for _ in $(seq 1 30); do s="$(docker inspect -f '{{.State.Health.Status}}' "$(cid api)" 2>/dev/null)"; [ "$s" = healthy ] && break; sleep 2; done; echo "      api: ${s:-?}"
  fi
  echo "== Kiểm lại: bash $0"
fi
echo "== KẾT QUẢ: $([ "$LOI" = 0 ] && echo 'ĐẠT' || echo "$LOI mục ✘ — chạy: bash $0 --sua")"
