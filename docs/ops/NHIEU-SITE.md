# Chạy nhiều site trên một bản cài (SITE_MODE=multi)
<!-- [2026-11-22 12:37 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B2a: sổ tay vận hành chế độ nhiều site — SITE_MODE, CONTROL_DATABASE_URL, thêm site bằng tay, kiểm sống -->

> **Kiến trúc:** [ADR-0036](../adr/ADR-0036-mot-ban-ma-moi-site-mot-database.md), luật [R-SITE](../rules/RULE-SITE.md), [PHASE-039](../phases/PHASE-039-NHIEU-CSDL-SITE-REGISTRY/README.md).
<!-- [2026-11-22 10:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B4a: Site Provisioner, biến SITE_TEMPLATE_DB, SITE_SECRET_KEY, PROVISION_DATABASE_URL, SITE_APP_PARENT_ROLE -->
> **Trạng thái (2026-11-22):** có mã tới B4a (Site Provisioner). <!-- [2026-11-22 11:11 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B2c: việc nền theo site; còn thiếu B3 -->
<!-- [2026-11-22 11:19 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B3: nâng cấp theo site; còn thiếu sao lưu theo lịch / khôi phục (B6), cap-nhat.sh nhiều site (B7) -->
**Chạy được, nâng cấp bằng lệnh:** `bizcity site migrate` nâng database mẫu rồi từng site, có cổng lược đồ (B3, §6). Đủ lệnh vòng đời qua Provisioning API (B5b, hợp đồng PHASE-039 §30). Chưa có: khoá bản quyền `biz-…` (S039-14) <!-- [2026-11-22 01:18 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B6b: khoá / xoá mềm có ở CLI (§9) -->, <!-- [2026-11-22 12:35 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B6a: có sao lưu / khôi phục theo site (§8) --> <!-- [2026-11-22 01:57 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B7a: cap-nhat.sh nâng nhiều site (§10) --> nhật ký / số đo có `site` (B7b). Nâng cấp: `./scripts/cap-nhat.sh` (§10). Đã có: nhận site theo tên miền (B2a), vé gắn site (B2b), việc nền theo site (B2c), bộ đệm có mã site (B2d), vai trò ứng dụng riêng từng site (B4a), tạo site có chủ site (B4b), Provisioning API (B5a).

## 1. Biến môi trường

| Biến | Mặc định | Nghĩa |
|---|---|---|
| `SITE_MODE` | `single` | `single`: bản cài một công ty, một database (`DATABASE_URL`), như trước PHASE-039. `multi`: nhiều site, mỗi site một database, nhận site theo tên miền của yêu cầu |
| `CONTROL_DATABASE_URL` | — | Database điều khiển giữ Site Registry (bảng `sites`, `site_domains`). **Bắt buộc** khi `SITE_MODE=multi`; thiếu thì API không khởi động |
| `SITE_TEMPLATE_DB` | `kt_template` | Database mẫu đã chạy đủ migration; site mới tạo bằng `CREATE DATABASE … TEMPLATE`. Không để phiên nào kết nối vào nó |
| `SITE_SECRET_KEY` | — | Khoá (≥ 32 ký tự) mã hoá mật khẩu vai trò của từng site trong registry. Thiếu thì không tạo site được và không mở được kết nối tới site có vai trò riêng. **Mất khoá = mất mật khẩu của mọi site**: sao lưu khoá riêng, ngoài database |
| `PROVISION_DATABASE_URL` | `DATABASE_URL` | Kết nối có quyền `CREATEDB` + `CREATEROLE` để tạo database và vai trò của site |
| `SITE_APP_PARENT_ROLE` | `ketoan_app` | Vai trò cha: vai trò ứng dụng của mỗi site là thành viên của nó, nên thừa hưởng quyền trên bảng mà migration cấp |
| `SITE_ADMIN_HOST` | — | Tên miền điều hành: Provisioning API `/_sites/v1` chỉ trả lời trên tên miền này (chế độ `multi`). Trống = tắt Provisioning API |
| `SITE_BACKUP_DIR` <!-- [2026-11-22 01:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B5b --> | `backups/sites` | Thư mục gốc chứa bản sao lưu khi sao lưu qua Provisioning API (`POST /sites/{id}/backups`, tiến trình API). **Phải gắn ra ngoài container** (vd `-v /opt/ketoan/backups:/app/backups`, `SITE_BACKUP_DIR=/app/backups/sites`) — không thì bản sao lưu mất khi dựng lại container |

`DATABASE_URL` vẫn cần ở chế độ `multi`: đó là site ngầm định, dùng cho kiểm sống / sẵn sàng / số đo và lúc khởi động. **Không được trỏ vào `SITE_TEMPLATE_DB`** (API từ chối khởi động): kết nối giữ ở database mẫu làm `CREATE DATABASE … TEMPLATE` hỏng. Dùng một database nhỏ riêng. Việc nền không chạy trên site ngầm định ở chế độ `multi`. Site tạo bằng Site Provisioner kết nối bằng vai trò riêng; site ghi tay (§3b) chưa có vai trò riêng thì dùng tên đăng nhập + mật khẩu của `DATABASE_URL`.

## 2. Database điều khiển

- Migration riêng ở `db/control-migrations/`, không lẫn `db/migrations/` của site. API tự áp khi nhận yêu cầu đầu tiên (khoá tư vấn `727039`, chạy lại không hại), ghi vào bảng `control_migrations`.
- Không chứa dữ liệu kế toán. Sao lưu cùng lịch với các site.

## 3. Tạo site bằng Site Provisioner (B4a)

Chuẩn bị một lần: tạo database `SITE_TEMPLATE_DB`, chạy `npm run db:migrate` với `DATABASE_URL` trỏ tới nó, **rồi** `bizcity site migrate --all` <!-- [2026-11-22 11:19 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B3: db:migrate chỉ áp migration lõi; site migrate thêm migration module + registry module -->: `db:migrate` chỉ áp migration lõi; `site migrate` áp thêm migration của module (POS, phiếu bán, voucher, loyalty…) và ghi registry module vào mẫu — thiếu bước này, site tạo từ mẫu không có bảng của module. Sau mỗi lần nâng cấp, `site migrate` nâng mẫu trước (R-SITE-8).

`createSite({ slug, domain, displayName, ownerEmail })` (`packages/platform/src/db/site-provisioner.ts`) làm: ghi registry → tạo vai trò `kt_<slug>_app` (thành viên `SITE_APP_PARENT_ROLE`, mật khẩu ngẫu nhiên) → `CREATE DATABASE kt_<slug> TEMPLATE …` → thu `CONNECT` khỏi `PUBLIC`, chỉ cấp cho vai trò của site → mã hoá mật khẩu vào registry → `active`. Hỏng ở bước nào thì dọn ngược hết.

<!-- [2026-11-22 10:43 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B4b: lệnh bizcity site create / list -->
**Lệnh (B4b):**

```bash
bizcity site create --slug congtya --domain congtya.<tên miền gốc> --name "Công ty A" --email chu@congtya.vn
bizcity site list
```

`site create` tạo thêm **đơn vị đầu** (mã = slug, tên công ty) và **tài khoản chủ site** (email của khách, vai trò `owner`, mật khẩu tự sinh **in một lần ra màn hình của người chạy lệnh**, không ghi vào nhật ký), hệ thống tài khoản và danh mục gốc — bằng `seed()` của Kernel, chạy bằng kết nối quản trị tới database của site. Không tự tạo khoá API tích hợp. Thiếu `--email` thì chủ site là `admin@<tên miền>`.

Lưu ý: bản cài đặt `DB_SET_ROLE` thì kết nối quản trị cũng bị chuyển vai trò và bước khởi tạo hỏng (dọn sạch, báo `SITE_PROVISION_FAILED`) — chạy `site create` không đặt `DB_SET_ROLE`.

## 3b. Thêm một site bằng tay (site đã có database)

1. Tạo database của site và chạy migration của Open Kế Toán lên nó (như cài mới, với `DATABASE_URL` trỏ tới database đó).
2. Ghi vào database điều khiển:

```sql
INSERT INTO sites (id, slug, display_name, status, db_host, db_port, db_name)
VALUES ('01JD…', 'congtya', 'Công ty A', 'active', 'db', 5432, 'kt_congtya');
INSERT INTO site_domains (domain, site_id, is_primary) VALUES ('congtya.<tên miền gốc>', '01JD…', true);
```

3. Tối đa 30 giây sau (bộ đệm tên miền) site nhận yêu cầu. Một site có thể có nhiều tên miền, thuộc các tên miền gốc khác nhau.

Chỉ site `active` hoặc `suspended` được phục vụ. `provisioning`, `upgrading`, `migration_failed`, `deleted` trả 404 `SITE_NOT_FOUND`.

## 4. Kiểm sống và bộ cân bằng tải

`/api/v1/system/health`, `/api/v1/system/health/ready`, `/metrics` không cần tên miền của site: chạy trên site ngầm định (`DATABASE_URL`). Mọi đường dẫn khác gọi bằng tên miền lạ hoặc địa chỉ máy đều nhận **404 `SITE_NOT_FOUND`**, không truy vấn nào chạy (R-SITE-3).

Đặt proxy (Apache / nginx / Cloudflare) **giữ nguyên tên miền** (`ProxyPreserveHost On`, `proxy_set_header Host $host`): API nhận site theo tên miền của yêu cầu.

## 5. Việc nền (dispatcher sự kiện, đồng hồ)
<!-- [2026-11-22 11:11 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B2c -->

Mỗi giây dispatcher chạy lần lượt qua **mọi site `active` / `suspended`** trong registry (đọc lại registry tối đa mỗi 30 giây, nên site mới tạo được giao sự kiện trong vòng 30 giây); đồng hồ mỗi phút cũng vậy. Mỗi lượt chạy trong ngữ cảnh của site đó. Một site lỗi kết nối: ghi `bizcity.event.runtime_failed` kèm `site`, các site khác vẫn chạy. Pool của mỗi site tối đa 4 kết nối, kết nối rảnh 30 giây thì đóng. Nhiều trăm site: cân nhắc PgBouncer (Q039-3).

## 6. Nâng cấp: `bizcity site migrate`
<!-- [2026-11-22 11:19 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B3 (D039-11, D039-12, R-SITE-8..10) -->

```bash
bizcity site migrate --all                       # database mẫu, rồi mọi site
bizcity site migrate --slug congty-a,congty-b    # chỉ các site này (mẫu vẫn nâng trước)
  [--backup-dir backups/sites] [--skip-backup] [--drain-seconds 35] [--json]
```

Chạy bằng ảnh **mới** (mã mới, migration mới), trước khi chuyển ứng dụng sang ảnh mới. Lệnh dùng kết nối quản trị (`PROVISION_DATABASE_URL`, trống = `DATABASE_URL`) và cần `CONTROL_DATABASE_URL`, `SITE_SECRET_KEY`, `SITE_TEMPLATE_DB`.

1. **Sao lưu:** cần `pg_dump` cùng bản PostgreSQL trên máy chạy lệnh; thiếu thì lệnh dừng trước khi chạm gì. `--skip-backup` chỉ khi đã có bản sao lưu khác (vd PITR).
2. **Database mẫu** nâng trước (lõi + module + registry module). Mẫu lỗi: lệnh dừng, **không site nào bị chạm**.
3. Site cần nâng (lược đồ khác bản mới, hoặc đang `upgrading` / `migration_failed`) chuyển sang `upgrading`; lệnh đợi 35 giây để ứng dụng đang chạy thôi phục vụ (bộ đệm tên miền 30 giây). Site đã ở bản mới: bỏ qua ("đã mới").
4. Từng site, tuần tự: sao lưu (`<backup-dir>/<slug>-<giờ UTC>.dump`) → migration lõi → migration module → registry module. Xong: trạng thái cũ (`active` / `suspended`) + `schema_version` mới. Lỗi: `migration_failed`, câu lỗi ở `sites.migration_error`, **đi tiếp site sau**.
5. In bảng tổng kết; có site lỗi thì mã thoát 1. Sửa nguyên nhân rồi chạy lại **cùng lệnh**: site đã xong được bỏ qua, site lỗi chạy lại. Lùi một site = khôi phục bản `.dump` vừa in (không có migration lùi, R-REL-5).

**Cổng lược đồ (R-SITE-9).** Ứng dụng chỉ phục vụ site có `schema_version` đúng bằng migration lõi cuối cùng trong ảnh của nó:

| Tình huống | Trả về |
|---|---|
| site đang `upgrading` | 503 `SITE_UPGRADING` |
| site `migration_failed` | 503 `SITE_MIGRATION_FAILED` |
| ứng dụng cũ gặp site đã nâng / ứng dụng mới gặp site chưa nâng | 503 `SITE_UPGRADING` |
| `schema_version` trống (site ghi tay trước B3) | phục vụ như thường; lần `site migrate` đầu tiên ghi giá trị |

503 có `Retry-After: 60`, không route nào chạy. Việc nền (dispatcher, đồng hồ) bỏ site bị chặn, đọc lại trạng thái mỗi giây.

**Trình tự một lần nâng cấp (trước khi có `cap-nhat.sh` nhiều site, B7):** kéo mã + build ảnh mới + test → sao lưu database điều khiển (`pg_dump` của `CONTROL_DATABASE_URL`) → `bizcity site migrate --all` bằng ảnh mới → chuyển ứng dụng sang ảnh mới. Từ lúc một site được nâng tới lúc chuyển ảnh, site đó báo "đang nâng cấp" — chuyển ảnh ngay sau khi lệnh xong.

## 7. Chạy lệnh `site` trong ảnh Docker
<!-- [2026-11-22 11:43 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B3b: ảnh api có db/control-migrations và pg_dump 16 -->

Ảnh `api` có sẵn `pg_dump` (bản 16, cùng máy chủ) và migration của database điều khiển. Lệnh `site` chạy bằng dịch vụ `db-migrate` (cùng ảnh, kết nối bằng vai trò quản trị — dịch vụ `api` chạy bằng `ketoan_app`, không đủ quyền tạo database / nâng lược đồ):

```bash
docker compose run --rm --no-deps --entrypoint node db-migrate dist/cli/site.js migrate --all --backup-dir /app/backups/sites
```

<!-- [2026-11-22 01:57 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B7a: compose chuyển sẵn biến SITE_* và gắn backups/ (BACKUP_HOST_DIR) vào api, db-migrate -->
Từ B7a `docker-compose.yml` chuyển sẵn các biến `SITE_*` của `.env` và gắn `${BACKUP_HOST_DIR:-./backups}` vào `/app/backups` của `api` và `db-migrate` — không cần `-e` / `-v` như trước. Biến `SITE_*` để trống = chưa đặt (bản cài một công ty không đổi).

- **Gắn thư mục sao lưu** (`-v …/backups`): container bị xoá sau lệnh (`--rm`), bản `.dump` không gắn ra ngoài sẽ mất.
- `site create`, `site list`, `site key-create` chạy cùng cách (`dist/cli/site.js create …`).
- Ba biến `CONTROL_DATABASE_URL`, `SITE_SECRET_KEY`, `SITE_TEMPLATE_DB` lấy từ `.env` của bản cài (`-e TÊN` không giá trị = chuyển biến của shell vào container).

## 8. Sao lưu và khôi phục từng site
<!-- [2026-11-22 12:35 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B6a (D039-13, S039-15, S039-16) -->

```bash
bizcity site backup --all [--keep 14] [--dir backups/sites]   # mọi site; hoặc --slug a,b
bizcity site backups [--slug a]                               # các bản đã ghi (mã, giờ, lý do, cỡ, tệp)
bizcity site restore --slug a --backup <mã> --yes             # khôi phục một site
bizcity site backup-import --slug a --file x.dump             # ghi tệp làm ngoài lệnh (vd từ PITR) để khôi phục được
```

Trong ảnh Docker chạy như §7 (`dist/cli/site.js backup …`, gắn thư mục sao lưu ra ngoài).

**Sao lưu** (`pg_dump -Fc` bằng vai trò quản trị) → `<dir>/<slug>/<slug>-<giờ UTC>.dump` → **tự kiểm** (`pg_restore --list`: đọc được, có dữ liệu `ledger_entries`, đếm bảng) → ghi `site_backups` (đã kiểm, số bảng, lược đồ, lý do `manual` / `schedule` / `migrate` / `import`). Hỏng: tệp đổi đuôi `.hong`, lệnh báo lỗi site đó và chạy tiếp site sau, mã thoát 1. `--keep N`: giữ N bản mới nhất **mỗi site**, xoá tệp và dòng cũ hơn. `site migrate` sao lưu qua cùng đường này (lý do `migrate`).

**Lịch đêm** (crontab của máy chủ, 02:30 hằng đêm, giữ 14 bản):

```cron
30 2 * * * cd /opt/ketoan && docker compose run --rm --no-deps --entrypoint node -e CONTROL_DATABASE_URL -e SITE_SECRET_KEY -e SITE_TEMPLATE_DB -v /opt/ketoan/backups:/app/backups db-migrate dist/cli/site.js backup --all --schedule --keep 14 --dir /app/backups/sites >> /opt/ketoan/logs/sao-luu-site.log 2>&1
```

Thư mục sao lưu phải nằm ngoài ổ của database và được chép ra máy khác (như `sao-luu.sh` của bản một công ty).

**Khôi phục** một site — site khác không bị chạm:

1. kiểm lại tệp (khớp số bảng đã ghi), tạo database tạm `kt_<slug>_kp_<giờ>`, `pg_restore` vào đó, đối chiếu số bảng + có sổ cái — hỏng ở đây: xoá database tạm, **site chạy tiếp như cũ**;
2. chặn site (`upgrading` → 503 `SITE_UPGRADING`, việc nền dừng), đợi 35 giây (`--drain-seconds`);
3. ngắt kết nối tới database của site, đổi tên: database đang chạy → `kt_<slug>_cu_<giờ>` (**giữ lại để lùi**), database tạm → `kt_<slug>`; vai trò ứng dụng của site chỉ `CONNECT` được database mới;
4. trả trạng thái cũ; registry ghi `restored_at`, `restored_from`, `previous_db`.

Bản sao lưu có lược đồ cũ hơn ứng dụng → site báo 503 `SITE_UPGRADING` tới khi chạy `bizcity site migrate --slug <slug>` (lệnh khôi phục nhắc). Lùi lần khôi phục: đổi tên ngược bằng tay (`ALTER DATABASE … RENAME`, site đang chặn). Database `_cu_` được `bizcity site sweep` xoá sau 7 ngày (§9).

**Lấy một site ở một thời điểm (PITR, PHASE-008).** PITR là mức cả cụm: không khôi phục thẳng một site được.

1. Dựng cụm PostgreSQL tạm từ bản nền + WAL tới thời điểm cần (sổ tay PITR của PHASE-008, `scripts/dien-tap-pitr.sh`) — **không** đè cụm đang chạy.
2. `pg_dump -Fc` riêng database `kt_<slug>` từ cụm tạm ra tệp `.dump`; tắt cụm tạm.
3. `bizcity site backup-import --slug <slug> --file <tệp>` (tự kiểm, ghi `site_backups` lý do `import`).
4. `bizcity site restore --slug <slug> --backup <mã vừa in> --yes`.

## 9. Khoá, mở lại, xoá mềm, dọn
<!-- [2026-11-22 01:18 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B6b (D039-15, Q039-1, R-SITE-12) -->

```bash
bizcity site suspend --slug a [--reason "quá hạn thanh toán"]   # khoá: chỉ đọc
bizcity site resume  --slug a                                    # mở lại
bizcity site delete  --slug a --yes                              # xoá mềm (cần đang khoá + sao lưu ≤ 24 giờ)
bizcity site undelete --slug a                                   # lấy lại trong 30 ngày (về trạng thái khoá)
bizcity site sweep [--dry-run]                                   # dọn database cũ
```

**Khoá = chỉ đọc (Q039-1).** Người dùng vẫn đăng nhập, xem, in, xuất sổ; mọi yêu cầu ghi khác trả **423 `SITE_SUSPENDED`** (route không chạy). Được ghi khi khoá: `GET` / `HEAD` / `OPTIONS`, `/api/v1/auth/login`, `/auth/wp-sso`, `/auth/logout-others`, `/auth/change-password`, đường kết thúc bằng `/preview`. Database vẫn ghi được (phiên đăng nhập, việc nền). Mọi tiến trình áp dụng trong ≤ 30 giây (bộ đệm tên miền). Hết hạn bản quyền **không** khoá (D039-17, R-SITE-13).

**Xoá mềm (D039-15, R-SITE-12).** Cần site đang khoá và có bản sao lưu **đã kiểm** trong 24 giờ (`bizcity site backup --slug a` ngay trước). Lệnh ngắt kết nối, thu `CONNECT` của vai trò ứng dụng, đổi tên database thành `kt_<slug>_xoa_<giờ UTC>`; site `deleted`, tên miền trả 404. Trong 30 ngày `site undelete` đổi tên lại (site về `suspended`, kiểm rồi `resume`). Slug và tên miền giữ cho site đó tới khi dọn.

**Dọn (`site sweep`)** — chỉ chạm database có tên dựng từ site trong registry:

| Database | Xoá khi |
|---|---|
| `kt_<slug>_cu_<giờ>` (trước lần khôi phục) | quá 7 ngày |
| `kt_<slug>_kp_<giờ>` (khôi phục dở) | quá 1 ngày |
| `kt_<slug>_xoa_<giờ>` (xoá mềm) | quá 30 ngày — kèm xoá vai trò ứng dụng, gỡ tên miền, ghi `purged_at`; **không lấy lại được nữa** |

Tệp sao lưu của site đã dọn **không** bị xoá (dữ liệu của khách — người vận hành tự quyết). Chạy dọn sau lịch sao lưu đêm, cùng crontab §8:

```cron
50 2 * * * cd /opt/ketoan && docker compose run --rm --no-deps --entrypoint node -e CONTROL_DATABASE_URL -e SITE_SECRET_KEY -e SITE_TEMPLATE_DB db-migrate dist/cli/site.js sweep >> /opt/ketoan/logs/sao-luu-site.log 2>&1
```

## 10. Nâng cấp bản cài nhiều site: `./scripts/cap-nhat.sh`
<!-- [2026-11-22 01:57 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B7a (S039-18, R-SITE-8, R-SITE-10) -->

`.env` có `SITE_MODE=multi` thì `cap-nhat.sh` tự đi theo luật nâng cấp R-SITE-8:

| Bước | Việc | Hỏng thì |
|---|---|---|
| 1 | sao lưu database ngầm định (`sao-luu.sh`) + **database điều khiển** (`backups/control-<db>-<giờ>.dump`, kiểm có bảng `sites`) | dừng, chưa đổi gì |
| 2 | in sắp đổi gì + số site sẽ nâng; hỏi xác nhận (`--yes` khi chạy không bàn phím) | — |
| 3 | `git pull --ff-only` | dừng, chưa đổi gì |
| 4a | `docker compose build api db-migrate` — **ứng dụng cũ vẫn phục vụ** | dừng; chưa site nào bị chạm; `git checkout <commit cũ>` |
| 4b | `site migrate --all` **bằng ảnh mới**: database mẫu trước, rồi từng site (sao lưu `pg_dump` trước mỗi site, `backups/sites/<slug>/`) | mẫu lỗi / thiếu `pg_dump`: dừng, không site nào bị chạm. Site lỗi: site đó `migration_failed` (503), các site khác đi tiếp |
| 4c | `docker compose up -d` — chuyển ứng dụng sang ảnh mới | in lệnh lùi |
| 5 | chờ API khoẻ; còn site lỗi thì in tên site, lệnh chạy lại, lệnh lùi riêng site đó, **mã thoát 1** | in lệnh lùi |

**Lệnh lùi** do script in ra dùng đúng mã bản sao lưu `site migrate` vừa tạo cho từng site (bảng `site_backups`, lý do `migrate`, sau lúc bắt đầu lần nâng cấp này):

```bash
git checkout <commit cũ> && docker compose up -d --build
docker compose run --rm --no-deps --entrypoint node db-migrate dist/cli/site.js restore --slug <slug> --backup <mã> --yes   # từng site đã nâng
```

Từ lúc một site được nâng (4b) tới lúc chuyển ảnh (4c), site đó báo 503 `SITE_UPGRADING` với ứng dụng cũ — thời gian gián đoạn mỗi site = thời gian nâng các site còn lại + dựng lại container. Bản cài một công ty (`SITE_MODE` trống / `single`) chạy như trước, không đổi bước nào.

**Lần đầu nâng lên bản có B7a:** `cap-nhat.sh` đang chạy là bản cũ (chưa biết nhiều site) — sau lần đó chạy thêm `docker compose run --rm --no-deps --entrypoint node db-migrate dist/cli/site.js migrate --all --backup-dir /app/backups/sites` (§6) hoặc chạy lại `./scripts/cap-nhat.sh`.

## 11. Nhật ký và số đo theo site
<!-- [2026-11-22 02:25 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B7b-1 (S039-19) -->

- **Nhật ký:** mọi dòng ghi trong ngữ cảnh một site (yêu cầu theo tên miền, việc nền `forEachSite`) có trường `"site": "<mã site>"`. Site ngầm định không ghi trường này — nhật ký bản cài một công ty không đổi. Tìm lỗi của một site: lọc `"site":"01J…"` trong `logs/`; mã site lấy ở `bizcity site list` hoặc `GET /_sites/v1/sites`.
- **Số đo** (`/metrics`, mỗi 5 phút, chỉ chế độ multi): `bizcity_sites{status}` — số site theo trạng thái; `bizcity_sites_attention{flag}` — số site có dấu `backup_missing` / `backup_stale` / `schema_behind` / `migration_failed` / `upgrading` / `suspended`. **Không** có nhãn theo từng site (R-OBS-4: hàng trăm site = hàng trăm chuỗi số đo); muốn biết site nào thì hỏi `GET /_sites/v1/sites?attention=1`.
- Gợi ý cảnh báo: `bizcity_sites_attention{flag="migration_failed"} > 0`, `bizcity_sites_attention{flag="backup_stale"} > 0` quá 2 giờ.
- **Nhật ký vận hành dạng tệp** <!-- [2026-11-22 03:11 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B7b-2 --> (kiểm chuẩn, tự chẩn đoán, lượt dùng thư viện, cơ cấu — `core/run-log.ts`): site ngầm định ở `<DATA_DIR>/nhat-ky/<luồng>/<đơn vị>/` như trước; mỗi site khác ở `<DATA_DIR>/nhat-ky/_sites/<mã site>/<luồng>/<đơn vị>/`. Mọi site đều có đơn vị mã 1 — không tách thì nhật ký các site ghi chung và đọc lẫn (lỗi cô lập, sửa ở B7b-2). Sao lưu `appdata` (`DATA_DIR`) như trước: thư mục `_sites/` nằm trong đó.
