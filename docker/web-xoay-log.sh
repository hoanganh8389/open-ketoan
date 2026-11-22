#!/bin/sh
# [2026-11-22 11:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-038 — B2 (S038-6): xoay logs/web-loi.log của nginx (ảnh nginx:alpine không có logrotate) — 10 MB × 3 (10 §7.3, R-LOG-9)
# =============================================================================
# Chạy trong container web: ảnh nginx chính thức chạy mọi *.sh trong /docker-entrypoint.d/ trước khi khởi động nginx.
# Script tạo thư mục log rồi để một vòng chạy nền: mỗi XOAY_LOG_INTERVAL giây, tệp vượt trần thì
#   web-loi.log.(n-1) bị xoá, … → web-loi.log.1 → web-loi.log.2, web-loi.log → web-loi.log.1, rồi `nginx -s reopen`.
# Tổng tối đa ≈ XOAY_LOG_KEEP × trần (mặc định 3 × 10 MB = 30 MB, phần của cổng vào trong 200 MB của logs/).
#
# Biến (để thử, không cần đặt khi chạy thật):
#   XOAY_LOG_FILE       mặc định /var/log/ketoan/web-loi.log
#   XOAY_LOG_MAX_BYTES  mặc định 10485760
#   XOAY_LOG_KEEP       số tệp giữ, kể cả tệp đang ghi; mặc định 3
#   XOAY_LOG_INTERVAL   giây giữa hai lần xem; mặc định 300
#   XOAY_LOG_ONCE=1     xem một lần rồi thoát, không chạy nền (test)
#   XOAY_LOG_REOPEN     lệnh báo nginx mở lại tệp; mặc định "nginx -s reopen"
# =============================================================================
F="${XOAY_LOG_FILE:-/var/log/ketoan/web-loi.log}"
MAX="${XOAY_LOG_MAX_BYTES:-10485760}"
KEEP="${XOAY_LOG_KEEP:-3}"
INTERVAL="${XOAY_LOG_INTERVAL:-300}"
REOPEN="${XOAY_LOG_REOPEN:-nginx -s reopen}"

mkdir -p "$(dirname "$F")" 2>/dev/null || echo "[xoay-log] không tạo được $(dirname "$F") — nginx sẽ không ghi được web-loi.log" >&2

xoay_neu_day() {
  [ -f "$F" ] || return 0
  s=$(wc -c < "$F" 2>/dev/null || echo 0)
  [ "$s" -gt "$MAX" ] || return 0
  i=$((KEEP - 1))
  rm -f "$F.$i"
  while [ "$i" -gt 1 ]; do
    p=$((i - 1))
    [ -f "$F.$p" ] && mv "$F.$p" "$F.$i"
    i=$p
  done
  if [ "$KEEP" -gt 1 ]; then mv "$F" "$F.1"; else rm -f "$F"; fi
  # nuot-loi: nginx chưa chạy (lần xem đầu) thì không có gì để mở lại; lần ghi sau nginx tự tạo tệp mới
  $REOPEN >/dev/null 2>&1 || true
}

if [ "${XOAY_LOG_ONCE:-0}" = 1 ]; then
  xoay_neu_day
  exit 0
fi

( while :; do sleep "$INTERVAL"; xoay_neu_day; done ) &
