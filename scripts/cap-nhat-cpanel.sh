#!/usr/bin/env bash
# [2026-11-21 01:40 PM Johnny Chu - Chu Hoàng Anh] DEPLOY — cập nhật trên máy cPanel/VPS hay lỗi "overlay2 ... device or resource busy": thay container web KHÔNG phụ thuộc việc xoá container cũ.
# =============================================================================
# Cập nhật phần mềm trên máy chủ hay gặp lỗi Docker:
#   driver "overlay2" failed to remove root filesystem ... device or resource busy
# (một dịch vụ của máy giữ mount của container cũ nên Docker không xoá được).
#
#   ./scripts/cap-nhat-cpanel.sh            sao lưu → git pull → build → api/db → thay web → kiểm
#   ./scripts/cap-nhat-cpanel.sh --no-pull  bỏ bước git pull (đã có code mới)
#
# Khác scripts/cap-nhat.sh ở chỗ:
#   - KHÔNG chạy "docker compose up -d" cho cả bộ (nó xoá + tạo lại web → kẹt khi gặp lỗi busy).
#   - Container web chạy NGOÀI Compose, tên theo thời điểm (ketoan-web-<mốc>): luôn tạo tên mới, dừng bản
#     cũ rồi gỡ "cố gắng hết sức" — gỡ lỗi chỉ cảnh báo, không chặn việc cập nhật.
# Máy không có lỗi busy: dùng scripts/cap-nhat.sh như bình thường.
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

PULL=1
[ "${1:-}" = "--no-pull" ] && PULL=0

[ -f .env ] || { echo "Chưa có tệp .env (sao chép từ .env.example rồi sửa)" >&2; exit 1; }
# [2026-11-25 09:11 PM Johnny Chu - Chu Hoàng Anh] STD-12b — bộ giám sát đang chạy (container otel-collector của dự án) → mọi lệnh compose ghép tệp giám sát
#   (và tệp Docker Desktop như scripts/cai-nhanh.sh), để api giữ OTEL_EXPORTER_OTLP_ENDPOINT + DEVTOOLS_* sau cập nhật. Trước đây cập nhật xong api thôi gửi trace
#   → màn Tra mã (DEV02) "Không tìm thấy trace". Không có bộ giám sát: như cũ (chỉ docker-compose.yml).
DC=(docker compose)
DC_PROJ="$(grep -E '^name:' docker-compose.yml | awk '{print $2}' | tr -d '\r' || true)"
if [ -f infrastructure/monitoring/docker-compose.monitoring.yml ] \
  && docker ps -q --filter "label=com.docker.compose.project=${DC_PROJ:-ketoan}" --filter "label=com.docker.compose.service=otel-collector" 2>/dev/null | grep -q .; then
  DC+=(-f docker-compose.yml -f infrastructure/monitoring/docker-compose.monitoring.yml)
  if docker info --format '{{.OperatingSystem}}' 2>/dev/null | grep -qi 'docker desktop'; then DC+=(-f infrastructure/monitoring/docker-compose.desktop.yml); fi
  if "${DC[@]}" config -q 2>/dev/null; then
    echo "• Bộ giám sát đang chạy — lệnh compose ghép tệp giám sát (api giữ cấu hình gửi trace)"
  else
    echo "! Bộ giám sát đang chạy nhưng tệp giám sát không dựng được cấu hình (thiếu biến trong .env, vd GRAFANA_ADMIN_PASSWORD) — cập nhật như cũ; sau đó chạy: bash scripts/kiem-giam-sat.sh --sua" >&2
    DC=(docker compose)
  fi
fi
# đọc 2 biến cổng từ .env, không nạp cả tệp (tránh làm lộ khoá)
env_get() { grep -E "^$1=" .env | tail -n1 | cut -d= -f2- | tr -d '\r' || true; }
WEB_BIND="$(env_get WEB_BIND)"; WEB_BIND="${WEB_BIND:-0.0.0.0}"
WEB_PORT="$(env_get WEB_PORT)"; WEB_PORT="${WEB_PORT:-8088}"
PROBE_HOST="$WEB_BIND"; [ "$PROBE_HOST" = "0.0.0.0" ] && PROBE_HOST="127.0.0.1"

echo "== 1. Sao lưu cơ sở dữ liệu"
if "${DC[@]}" ps --status running db 2>/dev/null | grep -q db; then
  ./scripts/sao-luu.sh
else
  echo "   (cơ sở dữ liệu chưa chạy: lần cài đầu, bỏ qua sao lưu)"
fi

echo "== 2. Lấy code mới"
if [ "$PULL" = "1" ]; then
  BEFORE="$(git rev-parse --short HEAD)"
  git pull --ff-only
  echo "   $BEFORE → $(git rev-parse --short HEAD)"
else
  echo "   (bỏ qua: --no-pull)"
fi

echo "== 3. Dựng ảnh mới (chưa đụng container đang chạy)"
"${DC[@]}" build api web

echo "== 4. Cơ sở dữ liệu + API (không gồm web)"
# Chỉ gọi đích danh: db, db-migrate (qua depends_on của api) và api. Web KHÔNG đi qua Compose.
if ! "${DC[@]}" up -d db api; then
  echo "LỖI khi khởi động db/api. Nhật ký nâng cấp cơ sở dữ liệu (db-migrate):" >&2
  "${DC[@]}" logs --tail 60 db-migrate >&2 || true
  echo "Nếu thông báo có 'device or resource busy': dừng lại, KHÔNG lặp lệnh; xem docs/ops/DEPLOY.md mục 5." >&2
  exit 1
fi

echo "== 5. Chờ API lên khoẻ"
HEALTHY=0
for _ in $(seq 1 40); do
  STATE="$(docker inspect --format '{{.State.Health.Status}}' "$(${DC[*]} ps -q api)" 2>/dev/null || echo starting)"
  [ "$STATE" = "healthy" ] && { HEALTHY=1; break; }
  sleep 3
done
if [ "$HEALTHY" != "1" ]; then
  echo "LỖI: API chưa lên khoẻ sau 2 phút. Nhật ký gần nhất:" >&2
  "${DC[@]}" logs --tail 40 api >&2
  exit 1
fi
echo "   API đã sẵn sàng."

echo "== 6. Thay container web (ngoài Compose)"
NETWORK="$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' "$("${DC[@]}" ps -q api)")"
IMAGE="$("${DC[@]}" config --images | grep -E -- '-web$' | head -n1)"
[ -n "$NETWORK" ] && [ -n "$IMAGE" ] || { echo "Không xác định được mạng ($NETWORK) hoặc ảnh web ($IMAGE)" >&2; exit 1; }

# Mọi container web cũ: do Compose (…-web-1) hoặc do script này (ketoan-web-*) — dừng để nhả cổng, gỡ nếu được.
OLD="$( { "${DC[@]}" ps -aq web 2>/dev/null; docker ps -aq --filter 'label=ketoan.role=web'; docker ps -aq --filter 'name=^ketoan-web-'; } | sort -u )"
for id in $OLD; do
  docker stop "$id" >/dev/null 2>&1 || true
done

NEW="ketoan-web-$(date +%Y%m%d-%H%M%S)"
docker run -d --name "$NEW" --restart unless-stopped \
  --label ketoan.role=web \
  --network "$NETWORK" \
  -p "${WEB_BIND}:${WEB_PORT}:80" \
  "$IMAGE" >/dev/null
echo "   web mới: $NEW ($IMAGE) → ${WEB_BIND}:${WEB_PORT}"

# Gỡ bản cũ: cố gắng hết sức. Lỗi busy chỉ cảnh báo — bản cũ đã dừng nên không còn nhận request.
for id in $OLD; do
  if ! docker rm -f "$id" >/dev/null 2>&1; then
    echo "   (cảnh báo) chưa gỡ được container cũ ${id:0:12} (busy); đã dừng, sẽ tự hết sau lần khởi động lại máy" >&2
  fi
done

echo "== 7. Kiểm web + API qua cổng vào"
for _ in $(seq 1 20); do
  if curl -fsS -o /dev/null "http://${PROBE_HOST}:${WEB_PORT}/"; then
    curl -fsS "http://${PROBE_HOST}:${WEB_PORT}/api/v1/system/health/ready" | head -c 300; echo
    docker ps --filter 'name=ketoan' --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
    exit 0
  fi
  sleep 2
done
echo "LỖI: web không trả lời tại http://${PROBE_HOST}:${WEB_PORT}/. Nhật ký:" >&2
docker logs --tail 30 "$NEW" >&2
exit 1
