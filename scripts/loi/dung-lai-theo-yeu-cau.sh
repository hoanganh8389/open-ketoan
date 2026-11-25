#!/usr/bin/env bash
# [2026-11-25 12:00 AM Nguyễn Văn Thủy] HT20 — Cron máy chủ (aaPanel, mỗi phút): có yêu cầu dựng lại ở HT20 thì chạy cap-nhat.sh --yes và báo kết quả — docs/ops/TU-DONG-SUA-LOI.md §4.1 (đóng góp)
#
#   cd /www/wwwroot/<thu-muc-dev> && KET_NOI_URL=https://ketoan-dev.quantri.thegioisua.com KET_NOI_KEY=kn_… ./scripts/loi/dung-lai-theo-yeu-cau.sh
#
# Không có yêu cầu → thoát ngay (không in gì). Đang có lượt khác chạy (khoá .loi/dung-lai.lock) → thoát.
set -uo pipefail
cd "$(dirname "$0")/../.."
: "${KET_NOI_URL:?Thiếu KET_NOI_URL}"; : "${KET_NOI_KEY:?Thiếu KET_NOI_KEY}"
URL="${KET_NOI_URL%/}"
mkdir -p .loi
exec 9>.loi/dung-lai.lock
flock -n 9 || exit 0

RESP="$(curl -fsS -m 20 -H "x-ket-noi-key: $KET_NOI_KEY" "$URL/api/v1/ket-noi/dung-lai" 2>/dev/null || true)"
ID="$(printf '%s' "$RESP" | sed -n 's/.*"id":"\([0-9a-f-]\{36\}\)".*/\1/p')"
[ -n "$ID" ] || exit 0

LOG=".loi/dung-lai-$(date +%Y%m%d-%H%M%S).log"
echo "== $(date '+%F %T') dựng lại theo yêu cầu $ID" | tee "$LOG"
if ./scripts/cap-nhat.sh --yes >>"$LOG" 2>&1; then OK=true; else OK=false; fi
# Bộ thu trace đọc cấu hình lúc khởi động — khởi động lại để nhận cấu hình mới (nếu có bộ giám sát).
docker compose ps --services 2>/dev/null | grep -q '^otel-collector$' && docker compose restart otel-collector >>"$LOG" 2>&1 || true
# Promtail: biến môi trường đổi (vd LOKI_PROJECT) thì tạo lại; tệp cấu hình gắn ngoài đổi thì khởi động lại để đọc lại.
docker compose ps --services 2>/dev/null | grep -q '^promtail$' && { docker compose up -d --no-deps promtail >>"$LOG" 2>&1; docker compose restart promtail >>"$LOG" 2>&1; } || true
echo "== $(date '+%F %T') xong: $OK · commit $(git rev-parse --short HEAD)" | tee -a "$LOG"

TAIL="$(tail -n 40 "$LOG")"
BODY="$(node -e 'process.stdout.write(JSON.stringify({id:process.argv[1],ok:process.argv[2]==="true",log:process.argv[3]}))' "$ID" "$OK" "$TAIL" 2>/dev/null \
  || python3 -c 'import json,sys; print(json.dumps({"id":sys.argv[1],"ok":sys.argv[2]=="true","log":sys.argv[3]}))' "$ID" "$OK" "$TAIL")"
curl -fsS -m 20 -H "x-ket-noi-key: $KET_NOI_KEY" -H 'content-type: application/json' -d "$BODY" "$URL/api/v1/ket-noi/dung-lai" >/dev/null || echo "Không báo được kết quả về $URL" >&2
