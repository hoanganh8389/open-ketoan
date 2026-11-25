#!/usr/bin/env bash
# [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
# [2026-11-13 08:39 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-9: kiểm bản sao lưu vừa tạo (hỏng thì dừng), in sắp đổi gì (commit, migration, db/seeds, SEEDS_DIR, bộ giả lập), hỏi xác nhận (--yes), lỗi thì in lệnh lùi
# [2026-11-14 01:47 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-11: SEEDS_DIR đặt mà thư mục không có / thiếu tệp so với db/seeds của bản mới → dừng trước khi kéo mã
# [2026-11-21 08:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — B3 (S038-8): đặt BIZCITY_GIT_SHA để mỗi dòng log có commit (R-LOG-5); lỗi thì chỉ tới ./scripts/lay-log.sh
# [2026-11-22 01:57 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B7a (S039-18, R-SITE-8, R-SITE-10): SITE_MODE=multi trong .env — sao lưu thêm database điều khiển; dựng ảnh mới (ảnh cũ vẫn phục vụ) → site migrate --all bằng ảnh mới (mẫu trước, từng site sao lưu trước) → chuyển ứng dụng; site lỗi bị chặn riêng; lệnh lùi in đúng mã bản sao lưu từng site
# =============================================================================
# Cập nhật phần mềm trên máy chủ: sao lưu → kiểm bản sao lưu → xem sắp đổi gì → xác nhận → lấy code mới → dựng lại → kiểm tra.
#
#   ./scripts/cap-nhat.sh          hỏi xác nhận trước khi lấy code mới
#   ./scripts/cap-nhat.sh --yes    không hỏi (bắt buộc khi chạy không có bàn phím: cron, CI, ssh không tty)
#
# Cơ sở dữ liệu nâng cấp bằng job db-migrate (chạy các file db/migrations chưa áp + seed) TRƯỚC khi API khởi động.
# Job lỗi thì API không khởi động: script in đúng lệnh lùi về commit cũ và khôi phục bản sao lưu vừa tạo.
# Sổ tay: docs/ops/SAO-LUU-KHOI-PHUC.md · nhiều site (SITE_MODE=multi): docs/ops/NHIEU-SITE.md §10
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

YES=0
for a in "$@"; do
  case "$a" in
    --yes|-y) YES=1 ;;
    *) echo "Tham số lạ: $a (dùng: ./scripts/cap-nhat.sh [--yes])" >&2; exit 2 ;;
  esac
done

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

# [2026-11-22 01:57 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B7a: chế độ nhiều site đọc từ .env
env_val() { grep -E "^$1=.+" .env | tail -1 | cut -d= -f2- || true; }
SITE_MODE_VAL="$(env_val SITE_MODE)"
MULTI=0
CTL_DB=""
if [ "$SITE_MODE_VAL" = "multi" ]; then
  MULTI=1
  CTL_URL="$(env_val CONTROL_DATABASE_URL)"
  [ -n "$CTL_URL" ] || { echo "LỖI: SITE_MODE=multi nhưng .env chưa có CONTROL_DATABASE_URL — DỪNG, chưa đổi gì." >&2; exit 1; }
  CTL_DB="$(printf '%s' "$CTL_URL" | sed -E 's#^.*/([^/?]+)(\?.*)?$#\1#')"
  echo "Chế độ nhiều site (SITE_MODE=multi): database điều khiển $CTL_DB — nâng từng site theo R-SITE-8 (docs/ops/NHIEU-SITE.md §10)"
fi
ctl_sql() { "${DC[@]}" exec -T db psql -U ketoan -d "$CTL_DB" -tAc "$1"; }

echo "== 1. Sao lưu cơ sở dữ liệu"
BACKUP_FILE=""
if "${DC[@]}" ps --status running db 2>/dev/null | grep -q db; then
  ./scripts/sao-luu.sh
  BACKUP_FILE="$(ls -1t "${BACKUP_DIR:-./backups}"/ketoan-*.sql.gz 2>/dev/null | head -1 || true)"
  [ -n "$BACKUP_FILE" ] || { echo "LỖI: không tìm thấy bản sao lưu vừa tạo — DỪNG, chưa đổi gì." >&2; exit 1; }
  echo "   Kiểm bản sao lưu vừa tạo:"
  if ! ./scripts/sao-luu.sh --kiem "$BACKUP_FILE"; then
    echo "LỖI: bản sao lưu $BACKUP_FILE không dùng được — DỪNG, chưa đổi gì. Sửa sao lưu trước khi nâng cấp." >&2
    exit 1
  fi
else
  echo "   (cơ sở dữ liệu chưa chạy: lần cài đầu, bỏ qua sao lưu)"
fi
CTL_BACKUP=""
if [ "$MULTI" = 1 ] && [ -n "$BACKUP_FILE" ]; then
  # Database điều khiển (Site Registry): sao lưu riêng, kiểm có bảng sites. Database từng site: site migrate sao lưu trước khi nâng.
  mkdir -p "${BACKUP_DIR:-./backups}"
  CTL_BACKUP="${BACKUP_DIR:-./backups}/control-$CTL_DB-$(date +%Y%m%d-%H%M%S).dump"
  if ! "${DC[@]}" exec -T db pg_dump -U ketoan -Fc -d "$CTL_DB" > "$CTL_BACKUP"; then
    echo "LỖI: không sao lưu được database điều khiển $CTL_DB — DỪNG, chưa đổi gì." >&2; exit 1
  fi
  if ! "${DC[@]}" exec -T db pg_restore --list < "$CTL_BACKUP" | grep -q ' TABLE public sites '; then
    echo "LỖI: bản sao lưu $CTL_BACKUP của database điều khiển không đọc được / thiếu bảng sites — DỪNG, chưa đổi gì." >&2; exit 1
  fi
  echo "   Database điều khiển: $CTL_BACKUP (đã kiểm)"
fi

echo "== 2. Sắp đổi gì"
git fetch --quiet
UPSTREAM="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)"
[ -n "$UPSTREAM" ] || { echo "LỖI: nhánh hiện tại chưa theo dõi nhánh nào trên máy chủ git (git branch -u origin/main)" >&2; exit 1; }
INCOMING="$(git rev-list --count 'HEAD..@{u}')"
echo "   Nhánh $UPSTREAM: $INCOMING commit mới"
NEW_MIGRATIONS="$(git diff --name-only --diff-filter=A HEAD '@{u}' -- db/migrations)"
if [ -n "$NEW_MIGRATIONS" ]; then
  echo "   Migration mới ($(printf '%s\n' "$NEW_MIGRATIONS" | wc -l | tr -d ' ')) — db-migrate sẽ áp vào CSDL, không tự lùi được (lùi = khôi phục bản sao lưu):"
  printf '      %s\n' $NEW_MIGRATIONS
else
  echo "   Migration mới: không có"
fi
SEED_CHANGES="$(git diff --name-status HEAD '@{u}' -- db/seeds)"
if [ -n "$SEED_CHANGES" ]; then
  echo "   Tệp db/seeds đổi:"
  printf '%s\n' "$SEED_CHANGES" | sed 's/^/      /'
else
  echo "   Tệp db/seeds đổi: không có"
fi
SEEDS_DIR_VAL="$(grep -E '^SEEDS_DIR=.+' .env | tail -1 | cut -d= -f2- || true)"
if [ -n "$SEEDS_DIR_VAL" ]; then
  echo "   SEEDS_DIR trong .env: $SEEDS_DIR_VAL (dữ liệu gốc của công ty, ngoài repo; compose gắn chỉ đọc vào api / db-migrate)"
  # [2026-11-14 01:47 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-11: thư mục phải có và đủ tệp so với db/seeds của bản mới — Docker không được tự tạo thư mục rỗng, không lấy bù tệp giả lập
  if [ ! -d "$SEEDS_DIR_VAL" ]; then
    echo "LỖI: SEEDS_DIR=$SEEDS_DIR_VAL không phải thư mục trên máy này — DỪNG, chưa đổi gì (Docker sẽ tạo thư mục rỗng thay vào)." >&2
    exit 1
  fi
  THIEU=""
  for f in $(git ls-tree -r --name-only '@{u}' db/seeds/ | grep -vE '(^|/)README\.md$' || true); do
    rel="${f#db/seeds/}"
    [ -f "$SEEDS_DIR_VAL/$rel" ] || THIEU="$THIEU $rel"
  done
  if [ -n "$THIEU" ]; then
    echo "LỖI: thư mục SEEDS_DIR thiếu $(echo $THIEU | wc -w | tr -d ' ') tệp có trong db/seeds của bản mới:" >&2
    printf '      %s\n' $THIEU >&2
    echo "      Chép các tệp đó từ db/seeds (bản mới) rồi thay bằng dữ liệu của công ty nếu cần — DỪNG, chưa đổi gì." >&2
    exit 1
  fi
  echo "   Thư mục SEEDS_DIR đủ tệp so với db/seeds của bản mới."
else
  echo "   SEEDS_DIR trong .env: chưa đặt (dữ liệu gốc đọc từ db/seeds của repo)"
  # Bộ db/seeds của bản sắp lấy về có tệp giả lập (dòng đầu "_nguon": "gia-lap", S030-53) không?
  GIA_LAP=""
  for f in $(git ls-tree --name-only '@{u}' db/seeds/ | grep '\.jsonl$' || true); do
    if git show "@{u}:$f" 2>/dev/null | head -1 | grep -q '"_nguon": *"gia-lap"'; then GIA_LAP="$GIA_LAP $(basename "$f")"; fi
  done
  if [ -n "$GIA_LAP" ]; then
    echo "   CẢNH BÁO: db/seeds là bộ dữ liệu mẫu GIẢ LẬP ($(echo $GIA_LAP | wc -w | tr -d ' ') tệp:$GIA_LAP)."
    echo "             Bấm \"Quay về dữ liệu gốc\" (TI08) khi chưa đặt SEEDS_DIR sẽ nạp danh mục giả lập (đối tượng, nhân viên,"
    echo "             ngân hàng, mặt hàng…) vào đơn vị thật. Đặt SEEDS_DIR tới bộ danh mục của công ty — xem db/seeds/README.md."
  fi
fi

if [ "$MULTI" = 1 ] && [ -n "$BACKUP_FILE" ]; then
  echo "   Site sẽ nâng lược đồ: $(ctl_sql "SELECT count(*) FROM sites WHERE status NOT IN ('deleted', 'provisioning')" | tr -d '[:space:]') — mỗi site sao lưu pg_dump trước khi nâng; từ lúc nâng tới lúc chuyển ảnh, site đó báo \"đang nâng cấp\" (503)"
fi

if [ "$YES" != 1 ]; then
  if [ -t 0 ]; then
    read -r -p "Tiếp tục nâng cấp? (c/K) " ANS
    case "$ANS" in c|C|co|có|y|Y|yes) ;; *) echo "Đã huỷ — chưa đổi gì (bản sao lưu vẫn giữ: ${BACKUP_FILE:-không có})."; exit 0 ;; esac
  else
    echo "Không có bàn phím để xác nhận (chạy từ cron / ống dẫn): thêm --yes nếu đã xem phần \"Sắp đổi gì\" ở trên. Chưa đổi gì." >&2
    exit 1
  fi
fi

OLD_COMMIT="$(git rev-parse HEAD)"
# In đúng lệnh lùi về bản trước khi nâng cấp (commit cũ + bản sao lưu vừa tạo).
in_lenh_lui() {
  echo "" >&2
  echo "== LỆNH LÙI về bản trước khi nâng cấp (chạy lần lượt từ $(pwd)):" >&2
  echo "   Gom log gửi người sửa (trước khi lùi): ./scripts/lay-log.sh  → logs/goi-bao-loi-<giờ>.tar.gz" >&2
  echo "   git checkout $OLD_COMMIT" >&2
  if [ -n "$BACKUP_FILE" ]; then
    echo "   ${DC[*]} stop api" >&2
    echo "   gunzip -c $BACKUP_FILE | ${DC[*]} exec -T db psql -U ketoan -d ketoan    # GHI ĐÈ CSDL bằng bản vừa sao lưu" >&2
  else
    echo "   (không có bản sao lưu: lần cài đầu)" >&2
  fi
  echo "   ${DC[*]} up -d --build" >&2
  if [ "$MULTI" = 1 ]; then
    # Site đã nâng bằng lần này: khôi phục từ bản sao lưu site migrate vừa tạo (lý do migrate, sau lúc bắt đầu nâng cấp)
    echo "   Khôi phục từng site đã nâng (ảnh cũ, sau khi compose up ở trên):" >&2
    ctl_sql "SELECT s.slug || ' ' || b.id FROM sites s JOIN LATERAL (SELECT id FROM site_backups WHERE site_id = s.id AND reason = 'migrate' AND created_at >= to_timestamp($STARTED_AT) ORDER BY created_at DESC LIMIT 1) b ON true ORDER BY s.slug" 2>/dev/null \
      | while read -r slug bid; do [ -n "$slug" ] && echo "   ${DC[*]} run --rm --no-deps --entrypoint node db-migrate dist/cli/site.js restore --slug $slug --backup $bid --yes" >&2; done || true
    [ -n "$CTL_BACKUP" ] && echo "   (database điều khiển trước nâng cấp: $CTL_BACKUP — chỉ khôi phục khi registry hỏng)" >&2
  fi
  echo "   Sau khi sửa xong: git checkout <nhánh> && ./scripts/cap-nhat.sh. Sổ tay: docs/ops/SAO-LUU-KHOI-PHUC.md" >&2
}
STARTED_AT="$(date +%s)"

echo "== 3. Lấy code mới"
BEFORE="$(git rev-parse --short HEAD)"
if ! git pull --ff-only; then
  echo "LỖI: git pull --ff-only không chạy được (máy chủ có sửa tay hoặc lệch nhánh) — chưa đổi gì." >&2
  exit 1
fi
echo "   $BEFORE → $(git rev-parse --short HEAD)"

# [2026-11-01 10:55 PM Johnny Chu - Chu Hoàng Anh] PHASE-001 — P0-3 (AUDIT-2026-11-01): bản cài cũ chưa có DB_APP_PASSWORD thì thêm (sau git pull, trước compose) — API chuyển sang ketoan_app
# Từ P0-3 API luôn chạy bằng vai trò thường ketoan_app; docker-compose.yml dừng nếu thiếu DB_APP_PASSWORD. Thêm một lần, không ghi đè.
if ! grep -q '^DB_APP_PASSWORD=..*' .env; then
  sed -i.bak '/^DB_APP_PASSWORD=$/d' .env && rm -f .env.bak
  printf 'DB_APP_PASSWORD=%s\n' "$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | cut -c1-32)" >> .env
  echo "   Thêm DB_APP_PASSWORD vào .env — API chạy bằng vai trò ketoan_app (không superuser, RLS có hiệu lực)"
fi

echo "== 4. Dựng lại, nâng cấp cơ sở dữ liệu (db-migrate), khởi động"
# commit đang chạy vào mọi dòng log của api / db-migrate (docker-compose.yml chuyển biến này vào container)
export BIZCITY_GIT_SHA="$(git rev-parse HEAD)"
echo "   Commit: ${BIZCITY_GIT_SHA:0:12}"
SITE_FAILED=""
if [ "$MULTI" = 1 ] && [ -n "$BACKUP_FILE" ]; then
  # R-SITE-8: dựng ảnh mới trong khi ảnh cũ vẫn phục vụ; nâng mẫu rồi từng site BẰNG ẢNH MỚI; xong mới chuyển ứng dụng.
  echo "   4a. Dựng ảnh mới (ứng dụng cũ vẫn chạy)"
  if ! "${DC[@]}" build api db-migrate; then
    echo "LỖI: dựng ảnh mới hỏng — ứng dụng cũ vẫn chạy, chưa site nào bị chạm. Về lại mã cũ: git checkout $OLD_COMMIT" >&2; exit 1
  fi
  echo "   4b. Nâng lược đồ: database mẫu, rồi từng site (sao lưu trước mỗi site)"
  MIG_LOG="$(mktemp)"
  set +e
  "${DC[@]}" run --rm --no-deps --entrypoint node db-migrate dist/cli/site.js migrate --all --backup-dir /app/backups/sites 2>&1 | tee "$MIG_LOG"
  MIG_RC=${PIPESTATUS[0]}
  set -e
  if [ "$MIG_RC" != 0 ] && grep -qE 'SITE_TEMPLATE_MIGRATION_FAILED|SITE_BACKUP_UNAVAILABLE|SITE_UNKNOWN' "$MIG_LOG"; then
    echo "LỖI: chưa nâng được database mẫu / thiếu công cụ sao lưu — KHÔNG site nào bị chạm, ứng dụng cũ vẫn chạy." >&2
    echo "   Về lại mã cũ: git checkout $OLD_COMMIT   (rồi sửa lỗi ở trên và chạy lại ./scripts/cap-nhat.sh)" >&2
    rm -f "$MIG_LOG"; exit 1
  fi
  if [ "$MIG_RC" != 0 ]; then
    SITE_FAILED="$(ctl_sql "SELECT string_agg(slug, ' ' ORDER BY slug) FROM sites WHERE status = 'migration_failed'" | tr -d '\r')"
    if [ -z "$SITE_FAILED" ]; then
      echo "LỖI: lệnh nâng lược đồ thoát mã $MIG_RC mà không site nào ở migration_failed — DỪNG trước khi chuyển ứng dụng." >&2
      in_lenh_lui; rm -f "$MIG_LOG"; exit 1
    fi
    echo "   CẢNH BÁO: site nâng lỗi (bị chặn riêng, 503 SITE_MIGRATION_FAILED): $SITE_FAILED — các site khác vẫn chuyển sang bản mới (R-SITE-10)."
  fi
  rm -f "$MIG_LOG"
  echo "   4c. Chuyển ứng dụng sang ảnh mới"
fi
if ! "${DC[@]}" up -d --build; then
  echo "LỖI khi khởi động. Nhật ký nâng cấp cơ sở dữ liệu (db-migrate):" >&2
  "${DC[@]}" logs --tail 60 db-migrate >&2 || true
  in_lenh_lui
  exit 1
fi
"${DC[@]}" logs --since 10m db-migrate 2>/dev/null | grep -iE "migration|mới nhất|lỗi" || true

echo "== 5. Chờ máy chủ API lên khoẻ"
for i in $(seq 1 40); do
  STATE="$(docker inspect --format '{{.State.Health.Status}}' "$(${DC[*]} ps -q api)" 2>/dev/null || echo starting)"
  if [ "$STATE" = "healthy" ]; then
    echo "   API đã sẵn sàng."
    "${DC[@]}" ps
    if [ -n "$SITE_FAILED" ]; then
      echo "" >&2
      echo "== CÒN SITE NÂNG LỖI: $SITE_FAILED" >&2
      echo "   Lỗi từng site: ${DC[*]} run --rm --no-deps --entrypoint node db-migrate dist/cli/site.js list   (cột trạng thái) · sites.migration_error trong database điều khiển" >&2
      echo "   Sửa nguyên nhân rồi chạy lại: ./scripts/cap-nhat.sh  (site đã xong được bỏ qua, site lỗi chạy lại)" >&2
      echo "   Hoặc lùi riêng site đó về bản sao lưu vừa tạo:" >&2
      for slug in $SITE_FAILED; do
        bid="$(ctl_sql "SELECT b.id FROM site_backups b JOIN sites s ON s.id = b.site_id WHERE s.slug = '$slug' AND b.reason = 'migrate' ORDER BY b.created_at DESC LIMIT 1" | tr -d '[:space:]')"
        echo "   ${DC[*]} run --rm --no-deps --entrypoint node db-migrate dist/cli/site.js restore --slug $slug --backup ${bid:-<mã>} --yes   (lược đồ cũ: còn bị chặn tới khi nâng được)" >&2
      done
      exit 1
    fi
    exit 0
  fi
  sleep 3
done

echo "LỖI: API chưa lên khoẻ sau 2 phút. Nhật ký gần nhất:" >&2
"${DC[@]}" logs --tail 40 api >&2
in_lenh_lui
exit 1
