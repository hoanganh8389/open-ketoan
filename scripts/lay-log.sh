#!/usr/bin/env bash
# [2026-11-21 08:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — B3 (S038-7): gom log gửi về — một lệnh, chạy được khi api chết, gói không chứa giá trị .env (README §4.4, R-LOG-4)
# =============================================================================
# Gom mọi thứ cần để người sửa / trợ lý AI đọc lỗi mà không phải vào máy chủ:
#   commit, trạng thái container, kiểm sức khoẻ, log Docker của db-migrate / api / web / db,
#   các tệp logs/*.log (nhật ký lỗi cố định, R-LOG-9), tên biến trong .env (KHÔNG giá trị).
#
#   ./scripts/lay-log.sh                     log 14 ngày gần nhất, 2000 dòng Docker mỗi dịch vụ
#   ./scripts/lay-log.sh --tu 2026-11-20     tệp logs/ sửa từ ngày đó
#   ./scripts/lay-log.sh --dong 5000         số dòng log Docker mỗi dịch vụ
#
# Kết quả: logs/goi-bao-loi-<YYYYMMDD-HHMM>.tar.gz (logs/ không ghi được thì ở /tmp). Giữ 3 gói mới nhất.
# Mọi giá trị trong .env dài từ 8 ký tự bị thay bằng *** trong gói; còn sót thì xoá gói và báo lỗi.
# Không dừng ở bước hỏng: bước nào lỗi thì ghi lỗi đó vào gói rồi đi tiếp (lúc cần gói nhất là lúc hệ thống hỏng).
# Sổ tay: docs/ops/SO-TAY-DIEU-TRA-LOI.md §0.0
# =============================================================================
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

TU=""
DONG=2000
while [ $# -gt 0 ]; do
  case "$1" in
    --tu) TU="${2:-}"; shift 2 ;;
    --dong) DONG="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "Tham số lạ: $1 (dùng: ./scripts/lay-log.sh [--tu YYYY-MM-DD] [--dong N])" >&2; exit 2 ;;
  esac
done
if [ -n "$TU" ] && ! printf '%s' "$TU" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'; then
  echo "--tu cần dạng YYYY-MM-DD, nhận: $TU" >&2; exit 2
fi
printf '%s' "$DONG" | grep -Eq '^[0-9]+$' || { echo "--dong cần là số, nhận: $DONG" >&2; exit 2; }

GIO="$(date +%Y%m%d-%H%M)"
LOG_DIR_HOST="$(grep -E '^LOG_HOST_DIR=.+' .env 2>/dev/null | tail -1 | cut -d= -f2- || true)"
LOG_DIR_HOST="${LOG_DIR_HOST:-./logs}"
OUT_DIR="$LOG_DIR_HOST"
mkdir -p "$OUT_DIR" 2>/dev/null || true
if ! ( : > "$OUT_DIR/.ghi-thu" ) 2>/dev/null; then
  echo "   (không ghi được vào $OUT_DIR — thư mục do container tạo, chủ là root; gói để ở ${TMPDIR:-/tmp})"
  OUT_DIR="${TMPDIR:-/tmp}"
fi
rm -f "$OUT_DIR/.ghi-thu" 2>/dev/null || true
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/goi-bao-loi-XXXXXX")" || { echo "Không tạo được thư mục tạm" >&2; exit 1; }
trap 'rm -rf "$STAGE"' EXIT
GOI="goi-bao-loi-$GIO"
mkdir -p "$STAGE/$GOI/logs"
D="$STAGE/$GOI"

# chay <tệp> <lệnh…>: chạy lệnh, ghi cả lỗi vào tệp; không bao giờ làm dừng script.
chay() {
  local out="$1"; shift
  { echo "\$ $*"; "$@" 2>&1; echo "(mã thoát: $?)"; echo; } >> "$D/$out"
}

echo "== Gom log → $GOI"
{
  echo "Gói báo lỗi open-ketoan — tạo lúc $(date '+%Y-%m-%d %H:%M:%S %z') trên máy $(hostname 2>/dev/null || echo '?')"
  echo "Thư mục cài: $(pwd)"
  echo "Tham số: --tu ${TU:-(14 ngày)} --dong $DONG"
  echo
} > "$D/00-tom-tat.txt"

echo "   1. Bản đang chạy (git)"
chay 00-tom-tat.txt git rev-parse HEAD
chay 00-tom-tat.txt git rev-parse --abbrev-ref HEAD
chay 00-tom-tat.txt git log --oneline -5
chay 00-tom-tat.txt git status --short   # chỉ tên tệp sửa tay trên máy chủ, không nội dung

echo "   2. Trạng thái container"
chay 00-tom-tat.txt docker compose ps -a
chay 00-tom-tat.txt docker compose version
chay 00-tom-tat.txt df -h .
chay 00-tom-tat.txt du -sh "$LOG_DIR_HOST"

echo "   3. Kiểm sức khoẻ qua cổng web"
WEB_PORT="$(grep -E '^WEB_PORT=.+' .env 2>/dev/null | tail -1 | cut -d= -f2- || true)"
WEB_PORT="${WEB_PORT:-8088}"
for p in /api/v1/system/health /api/v1/system/health/ready; do
  chay 01-suc-khoe.txt curl -sS -m 10 -w '\nHTTP %{http_code}\n' "http://127.0.0.1:$WEB_PORT$p"
done

echo "   4. Log Docker (mỗi dịch vụ $DONG dòng cuối)"
for s in db-migrate api web db; do
  docker compose logs --no-color --timestamps --tail "$DONG" "$s" > "$D/docker-$s.log" 2>&1 || echo "(không lấy được log Docker của $s)" >> "$D/docker-$s.log"
done

echo "   5. Nhật ký lỗi cố định ($LOG_DIR_HOST)"
if [ -d "$LOG_DIR_HOST" ]; then
  if [ -n "$TU" ]; then LOC=(-newermt "$TU"); else LOC=(-mtime -14); fi
  find "$LOG_DIR_HOST" -maxdepth 1 -type f -name '*.log*' ! -name 'goi-bao-loi-*' "${LOC[@]}" -print 2>/dev/null \
    | while IFS= read -r f; do cp "$f" "$D/logs/" 2>/dev/null || echo "không đọc được $f" >> "$D/00-tom-tat.txt"; done
  ls -la "$LOG_DIR_HOST" >> "$D/00-tom-tat.txt" 2>&1
else
  echo "Chưa có thư mục $LOG_DIR_HOST (bản cài trước PHASE-038 B1)" >> "$D/00-tom-tat.txt"
fi

# Biến chắc chắn không bí mật: in giá trị (giúp điều tra) và không che. Mọi biến khác: chỉ tên, giá trị bị che.
# Thêm biến vào đây chỉ khi giá trị KHÔNG BAO GIỜ là mật khẩu, khoá, token hay URL có thể chứa chúng (R-LOG-4).
KHONG_BI_MAT='^(COMPOSE_PROJECT_NAME|WEB_BIND|WEB_PORT|DB_PORT|LOG_HOST_DIR|LOG_LEVEL|LOG_FILE_LEVEL|BIZCITY_GIT_SHA|NODE_ENV|TZ|BOOK_MODE|ENV_LABEL|ADDINS|TAX_LOOKUP|SEEDS_DIR|BACKUP_DIR|BIZCITY_SAMPLE|SAMPLE_TENANT_CODE|SEED_TENANT_CODE)$'
la_khong_bi_mat() { printf '%s' "$1" | grep -Eq "$KHONG_BI_MAT"; }

echo "   6. Tên biến trong .env (giá trị chỉ in cho biến không bí mật)"
if [ -f .env ]; then
  grep -E '^[A-Za-z_][A-Za-z0-9_]*=' .env | while IFS= read -r l; do
    k="${l%%=*}"; v="${l#*=}"
    if [ -z "$v" ]; then echo "$k (trống)"
    elif la_khong_bi_mat "$k"; then echo "$k=$v"
    else echo "$k (đã đặt)"; fi
  done > "$D/env-ten-bien.txt"
else
  echo "Không có tệp .env" > "$D/env-ten-bien.txt"
fi

echo "   7. Che giá trị bí mật"
# Mọi giá trị .env dài ≥ 8 ký tự của biến KHÔNG nằm trong danh sách trên (mật khẩu, khoá, URL có mật khẩu…) → ***.
# Thêm mẫu chung cho URL CSDL và Bearer.
SED_SCRIPT="$STAGE/che.sed"
: > "$SED_SCRIPT"
GIA_TRI="$STAGE/gia-tri.txt"
: > "$GIA_TRI"
if [ -f .env ]; then
  grep -E '^[A-Za-z_][A-Za-z0-9_]*=' .env | while IFS= read -r l; do
    la_khong_bi_mat "${l%%=*}" || printf '%s\n' "${l#*=}"
  done | sed -E "s/^[\"']//; s/[\"']\$//" | awk 'length($0) >= 8' | sort -u > "$GIA_TRI"
  while IFS= read -r v; do
    # thoát đủ ký tự đặc biệt của ERE (sed -E bên dưới) và dấu phân cách /
    printf 's/%s/***/g\n' "$(printf '%s' "$v" | sed -e 's/[]\/$*.^|+?(){}[]/\\&/g')" >> "$SED_SCRIPT"
  done < "$GIA_TRI"
fi
cat >> "$SED_SCRIPT" <<'EOF'
s#(postgres(ql)?://[^:/@ ]+:)[^@ ]+@#\1***@#g
s#([Bb]earer )[A-Za-z0-9._~+/=-]{8,}#\1***#g
EOF
find "$D" -type f | while IFS= read -r f; do sed -E -i.bak -f "$SED_SCRIPT" "$f" && rm -f "$f.bak"; done

# Kiểm lại: còn sót giá trị nào thì không giao gói.
if [ -s "$GIA_TRI" ] && grep -rqF -f "$GIA_TRI" "$D"; then
  echo "LỖI: gói vẫn còn giá trị bí mật của .env sau khi che — KHÔNG tạo gói. Báo người giữ PHASE-038." >&2
  exit 1
fi

echo "   8. Nén"
OUT="$OUT_DIR/$GOI.tar.gz"
# ghi qua stdout: tar không phải đoán đường dẫn đích ("C:/…" bị GNU tar hiểu là máy từ xa)
if ! tar -czf - -C "$STAGE" "$GOI" > "$OUT"; then
  rm -f "$OUT"
  echo "LỖI: không nén được vào $OUT" >&2; exit 1
fi
# Giữ 3 gói mới nhất (thư mục logs/ có trần 200 MB, R-LOG-9).
ls -1t "$OUT_DIR"/goi-bao-loi-*.tar.gz 2>/dev/null | tail -n +4 | while IFS= read -r f; do rm -f "$f"; done

echo
echo "Xong: $OUT ($(du -h "$OUT" | cut -f1))"
echo "Tải tệp này về (aaPanel → Files) và gửi kèm mô tả: lỗi lúc mấy giờ, ở màn nào, đã làm gì."
