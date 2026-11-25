#!/bin/sh
# [2026-11-22 11:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-038 — B2 (S038-6): xoay nhật ký lỗi của nginx (ảnh nginx:alpine không có logrotate)
# [2026-11-22 07:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — B6 (S038-16, D038-7): chia theo ngày logs/web/<YYYY-MM-DD>.log, giữ 30 ngày, 10 MB / tệp, thư mục 30 MB
# =============================================================================
# Chạy trong container web: ảnh nginx chính thức chạy mọi *.sh trong /docker-entrypoint.d/ trước khi khởi động nginx.
#
# nginx ghi error_log + dòng truy cập ≥ 500 vào web/dang-ghi.log (error_log của nginx không đặt được tên theo ngày). Mỗi
# XOAY_LOG_INTERVAL giây, tệp đó có dữ liệu thì: đổi tên → nginx -s reopen → nối vào web/<ngày giờ VN>.log (quá 10 MB thì
# <ngày>.1.log, <ngày>.2.log…). Dòng ghi sát nửa đêm có thể vào ngày sau, lệch tối đa một khoảng XOAY_LOG_INTERVAL.
# Rồi dọn: xoá tệp của ngày cũ hơn 30 ngày; thư mục quá trần thì xoá tệp cũ nhất trước (PHASE-038 · 10 §7.3).
#
# Biến (để thử, không cần đặt khi chạy thật):
#   XOAY_LOG_DIR          mặc định /var/log/ketoan/web
#   XOAY_LOG_PART_BYTES   trần một tệp, mặc định 10485760 (10 MB)
#   XOAY_LOG_CAP_BYTES    trần thư mục, mặc định 31457280 (30 MB)
#   XOAY_LOG_KEEP_DAYS    số ngày giữ, mặc định 30
#   XOAY_LOG_INTERVAL     giây giữa hai lần, mặc định 60
#   XOAY_LOG_NOW          giây unix thay cho đồng hồ (test)
#   XOAY_LOG_ONCE=1       làm một lần rồi thoát, không chạy nền (test)
#   XOAY_LOG_REOPEN       lệnh báo nginx mở lại tệp; mặc định "nginx -s reopen"
# =============================================================================
DIR="${XOAY_LOG_DIR:-/var/log/ketoan/web}"
CUR="$DIR/dang-ghi.log"
PART="${XOAY_LOG_PART_BYTES:-10485760}"
CAP="${XOAY_LOG_CAP_BYTES:-31457280}"
KEEP="${XOAY_LOG_KEEP_DAYS:-30}"
INTERVAL="${XOAY_LOG_INTERVAL:-60}"
REOPEN="${XOAY_LOG_REOPEN:-nginx -s reopen}"

mkdir -p "$DIR" 2>/dev/null || echo "[xoay-log] không tạo được $DIR — nginx sẽ không ghi được nhật ký lỗi" >&2

# ngay [giây lùi lại] → YYYY-MM-DD theo giờ Việt Nam (UTC+7, không đổi giờ mùa hè; không cần tzdata trong ảnh alpine)
ngay() {
  s="${XOAY_LOG_NOW:-$(date +%s)}"
  date -u -d "@$(( s + 25200 - ${1:-0} ))" +%Y-%m-%d
}
co() { wc -c < "$1" 2>/dev/null || echo 0; }

chuyen() {
  [ -s "$CUR" ] || return 0
  mv "$CUR" "$CUR.chuyen" || return 0
  # nuot-loi: nginx chưa chạy (lần đầu) thì không có gì để mở lại; lần ghi sau nginx tự tạo tệp
  $REOPEN >/dev/null 2>&1 || true
  [ "${XOAY_LOG_ONCE:-0}" = 1 ] || sleep 1   # chờ worker mở tệp mới; dòng ghi trong lúc đó vẫn vào .chuyen (cùng inode)
  d="$(ngay)"
  n=0
  dest="$DIR/$d.log"
  while [ -f "$dest" ] && [ "$(co "$dest")" -ge "$PART" ]; do n=$((n + 1)); dest="$DIR/$d.$n.log"; done
  cat "$CUR.chuyen" >> "$dest" && rm -f "$CUR.chuyen"
}

don() {
  han="$(ngay $((KEEP * 86400)) | tr -d -)"
  # "ngày phần tên" — phần 0 = <ngày>.log; sắp cũ → mới để xoá cũ nhất trước
  ls "$DIR" 2>/dev/null | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}(\.[0-9]+)?\.log$' | while IFS= read -r f; do
    b="${f%.log}"; d="${b%%.*}"; p="${b#"$d"}"; p="${p#.}"
    echo "$(echo "$d" | tr -d -) ${p:-0} $f"
  done | sort -k1,1n -k2,2n > "$DIR/.ds"
  tong=0
  while read -r d p f; do
    if [ "$d" -lt "$han" ]; then rm -f "$DIR/$f"; else tong=$((tong + $(co "$DIR/$f"))); fi
  done < "$DIR/.ds"
  while read -r d p f; do
    [ "$tong" -gt "$CAP" ] || break
    [ -f "$DIR/$f" ] || continue
    s="$(co "$DIR/$f")"; rm -f "$DIR/$f"; tong=$((tong - s))
  done < "$DIR/.ds"
  rm -f "$DIR/.ds"
}

lam() { chuyen; don; }

if [ "${XOAY_LOG_ONCE:-0}" = 1 ]; then
  lam
  exit 0
fi

( while :; do sleep "$INTERVAL"; lam; done ) &
