# BIZCITY-SECRETS-v1 · Lưu bí mật mã hoá theo đơn vị cho module (`platform.secrets`)
<!-- [2026-11-28 03:44 PM Johnny Chu - Chu Hoàng Anh] FLOW — NC-004 D1 / D2 (chủ chốt Q-PIL-10 ngày 2026-11-28): bản chủ đã dời sang open-platform; tệp này là bản chép giữ cho bộ kiểm của repo (SC-CON-4 / SC-CON-5 / SC-DOC-4) tới khi bộ kiểm đọc bản chủ (C6). -->
> **Bản chủ:** [open-platform — BIZCITY-SECRETS-v1.md](https://github.com/hoanganh8389/bizcity-platform/blob/main/docs/standard/BIZCITY-SECRETS-v1.md) (từ 2026-11-28). **Sửa văn bản này ⇒ PR vào bizcity-platform trước** (luật đổi chuẩn của bizcity-platform), rồi chép lại đây cùng nội dung; không sửa riêng ở đây.
<!-- [2026-11-25 08:30 PM Võ Hoàng] FLOW — chữ chốt R-FLOW-2 cho năng lực platform.secrets (1.0.0-draft); Võ Hoàng làm, chủ dự án duyệt PR code (đóng góp) -->

Trạng thái: **1.0.0 — đã có** (chữ chốt R-FLOW-2 ngày 25/11/2026; mã + test ở nhánh `feat/platform-secrets`, chủ dự án duyệt PR). API cuối ở §6.
<!-- [2026-11-25 09:05 PM Võ Hoàng] FLOW — lõi platform.secrets có mã (nhánh feat/platform-secrets): migration 0184, packages/platform/src/core/secrets.ts, test 10 ca; còn nối ctx / quyền khoá app ngoài phạm vi CLAIMS (đóng góp) -->
Cập nhật 25/11/2026: lõi có mã (migration `0184`, `packages/platform/src/core/secrets.ts`, test `apps/api/test/secrets.test.ts`).
<!-- [2026-11-25 11:32 PM Võ Hoàng] FLOW — chuyển 1.0.0 — đã có: ctx.secrets trong runtime action, quyền khoá app secrets:read:<module>, action đọc tự gắn dưới route module, lược đồ manifest secrets, lệnh đổi khoá (đóng góp) -->
Cập nhật 25/11/2026 (tối): **1.0.0 — đã có** — nối `ctx.secrets`, quyền khoá app, route đọc, lược đồ manifest, lệnh đổi khoá gốc (§6).
Người đề xuất / làm: Võ Hoàng · Ngày: 25/11/2026.

## 1. Ca dùng

Màn **Hoá đơn điện tử** chuyển từ website lên open-ketoan (đã chốt 25/11, kế hoạch `docs123/docs/module-pos/90-TAI-KHOAN-THUE-CHUYEN-KHO-QUA.md`):

- Kế toán trưởng / chủ đơn vị khai tài khoản Viettel ở open-ketoan:
  - theo **sổ (pháp nhân)**: MST, tên pháp lý, **tên đăng nhập + mật khẩu Viettel**;
  - theo **chi nhánh**: mẫu số, ký hiệu, **mật khẩu portal gửi mail**.
- Website (plugin Viettel) vẫn phát hành hoá đơn; nó kéo cài đặt về qua cầu nối, gồm cả mật khẩu, để gọi Viettel.

Cùng nhu cầu sẽ có ở:

| Tích hợp | Bí mật cần giữ |
|---|---|
| QR / ngân hàng | Khoá API ngân hàng |
| Zalo | Token Zalo OA |
| Email | Mật khẩu SMTP |
| Sàn TMĐT | Khoá kết nối sàn |
| Hãng vận chuyển | Khoá API hãng vận chuyển |

Đủ điều kiện R-KER-8: có ít nhất 2 phân hệ / module cần.

## 2. Vì sao năng lực hiện có không đủ

- **Không có chỗ cho module.** Mã hoá chỉ có ở sổ đăng ký site (`packages/platform/src/db/site-registry.ts`, khoá `SITE_SECRET_KEY`), và chỉ dùng cho mật khẩu CSDL của từng site. Module không gọi được.
- **Cấu hình lưu trần.** Cấu hình `bizcity.*` (`tenants.settings`) lưu dạng thường. Kế toán có quyền `settings:read` hay bản sao lưu đều đọc được mật khẩu.
- **Không có trong danh mục năng lực.** `bizcity-standard.json` không có năng lực bí mật nào.
- **Module tự mã hoá là vi phạm.** Nó phải tự giữ khoá, tức tự vá Core (P2), và mỗi module sẽ làm một kiểu.

## 3. Khuôn đề nghị

**Module** (qua `ctx`, theo đơn vị đang chạy — mỗi blog một tenant theo luật P-0):

```ts
ctx.secrets.set(name: string, value: string, opts?: { scope?: { branchCode?: string; bookId?: string }; note?: string }): Promise<void>
ctx.secrets.get(name: string, scope?): Promise<string | null>      // chỉ phía máy chủ, không bao giờ trả ra giao diện
ctx.secrets.has(name: string, scope?): Promise<{ set: boolean; updatedAt: string | null; updatedBy: string | null }>
ctx.secrets.delete(name: string, scope?): Promise<void>
```

- **Tên khoá** có tiền tố module: `<module>.<tên>`, ví dụ `hoa-don.viettel.password`. Module chỉ đọc / ghi khoá của mình.
- **Khai trong manifest:** `secrets: [{ name, scope: 'tenant' | 'book' | 'branch', label }]`. Bộ kiểm chặn tên khoá không khai.
- **Giao diện:** ô mật khẩu chỉ hiện "đã đặt lúc … bởi …" và một nút "Nhập mới". Không có đường đọc ngược.
- **Cầu nối / ứng dụng ngoài** (plugin Viettel cần mật khẩu để gọi Viettel): **chốt — cho đọc** qua một action đọc riêng, gác bằng quyền app (khoá API có `secrets:read:<module>`), mỗi lần đọc ghi nhật ký; giao diện không bao giờ thấy giá trị.

## 4. Bảo mật

- **Mã hoá phong bì (AES-256-GCM).** **Chốt: một khoá gốc cho bản cài** (biến môi trường `BIZCITY_SECRETS_KEY`, không lưu trong CSDL); **mỗi đơn vị một khoá dữ liệu**, được mã bằng khoá gốc. Mất khoá gốc thì bí mật không đọc được; nhập lại là xong, không hỏng sổ.
- **Đổi khoá gốc:** có lệnh mã lại các khoá dữ liệu, không đụng giá trị.
- **Bảng riêng `tenant_secrets`:**
  - cột: `tenant_id`, `name`, `scope_type`, `scope_id`, `ciphertext`, `iv`, `tag`, `key_version`, `updated_by`, `updated_at`;
  - RLS theo đơn vị;
  - không vào sổ chứng từ, không vào nhật ký thay đổi dạng giá trị — nhật ký chỉ ghi "đã đổi".
- **Không lộ:**
  - R-LOG-4: không ghi log giá trị;
  - bản sao lưu chỉ chứa bản đã mã hoá;
  - xuất dữ liệu đơn vị không kèm bí mật.

## 5. Kiểm thử đề nghị

- Ghi rồi đọc ra đúng giá trị. Đọc qua API giao diện thì không thấy giá trị.
- Đơn vị A không đọc được bí mật của đơn vị B (RLS).
- Đổi khoá gốc xong vẫn đọc được.
- Sai khoá gốc thì trả lỗi rõ, không lộ gì.
- Log và bản sao lưu không chứa giá trị thô.
- Module đọc khoá của module khác thì bị chặn.


## 6. API đã có (1.0.0)
<!-- [2026-11-25 09:05 PM Võ Hoàng] FLOW — API cuối của platform.secrets theo mã (đóng góp) -->
<!-- [2026-11-25 11:32 PM Võ Hoàng] FLOW — §6 viết lại theo bản nối đủ: ctx.secrets, route đọc dưới tiền tố module, lệnh đổi khoá (đóng góp) -->

### 6.1. Module — `ctx.secrets` (mọi action, `@bizcity/module-sdk`)

```ts
ctx.secrets.set(name, value, { scope?: { bookId? | branchCode? }, note? })   // chỉ trong action ghi
ctx.secrets.get(name, scope?)      // string | null — chỉ phía máy chủ
ctx.secrets.has(name, scope?)      // { set, updatedAt, updatedBy } — thứ duy nhất giao diện thấy
ctx.secrets.delete(name, scope?)   // chỉ trong action ghi
```

- Module = tiền tố id action. Chỉ tên khai ở manifest `secrets: [{ name: '<key>.<tên>', scope: 'tenant' | 'book' | 'branch', label }]`, đúng phạm vi đã khai. Tên chưa khai / tên module khác → `FORBIDDEN`; sai phạm vi → `VALIDATION_ERROR`. Module không khai `secrets[]` thì mọi tên bị từ chối.
- Phạm vi: không truyền = `tenant`; `{ bookId }` = `book`; `{ branchCode }` = `branch`; cả hai = lỗi.
- `set` ghi đè theo (đơn vị, tên, phạm vi); nhật ký `secrets.set` / `secrets.delete` chỉ ghi `{ changed: true }` / `{ deleted: true }` (trong action ghi: vào ghi chú bằng chứng).
- `defineModule` kiểm khai `secrets[]` (sai là không nạp module) và đăng ký tên vào sổ khai của Platform.

### 6.2. Khoá app đọc bí mật

- Module khai `secrets[]` thì `defineModule` tự thêm action `<key>.secrets.read`: `GET /secrets/read?name=&bookId=&branchCode=` dưới tiền tố route của module (`/api/v1/m/<key>/…`), quyền `secrets:read:<key>`, `mcp: false`, `ai: 'deny'`.
- Chỉ khoá API / khoá app gọi được; phiên người dùng (kể cả chủ đơn vị) → 403. Không vai trò nào nhận sẵn quyền này.
- App xin quyền ở manifest app: `app.scopes: ["secrets:read:<module>"]`; chủ đơn vị kết nối app là đồng ý. Quyền chỉ có hiệu lực khi module đó đang nạp và đã khai bí mật.
- Mỗi lần đọc một dòng `audit_logs` `secrets.read` (người gọi `apikey:<id>`, `object_id` = `<tên>@<phạm vi>:<mã>`, `{ found }`) — không giá trị.
- Trả `{ name, scope, scopeId, value, updatedAt }`.

### 6.3. Platform — `@bizcity/platform/core/secrets`

| Hàm | Việc |
|---|---|
| `secretsFor(conn, { tenantId, module, actor, declared?, readOnly? })` | dựng `SecretsApi` trên giao dịch (runtime dùng cho `ctx.secrets`) |
| `registerModuleSecrets(key, decls)` / `moduleSecretDecls(key)` | sổ khai bí mật theo module; đăng ký quyền `secrets:read:<key>` |
| `defineSecretsReadAction(key)` | action đọc cho khoá app (§6.2) |
| `rotateSecretsMasterKey(conn, cũ, mới)` | mã lại khoá dữ liệu mọi đơn vị trong một giao dịch, giá trị không đụng; trả `{ rewrapped, skipped, foreign }` |
| `secretDeclErrors(key, decls)` | kiểm khai `secrets[]` |

Lỗi (đều `NOT_READY`, `details.reason`, khai ở `ERROR_REASONS`): `SECRETS_KEY_MISSING`, `SECRETS_KEY_INVALID`, `SECRETS_KEY_MISMATCH`, `SECRETS_KEY_CREATE`, `SECRETS_CORRUPT`. Thông báo không bao giờ kèm giá trị.

### 6.4. Vận hành

- `BIZCITY_SECRETS_KEY` (hex hoặc base64, giải ra ≥ 32 byte; `openssl rand -base64 32`): khai ở `.env`, `docker-compose.yml` chuyển vào api. Trống = chỉ bí mật báo `SECRETS_KEY_MISSING`; sai khuôn = cấu hình không hợp lệ lúc khởi động. Giữ bản sao ngoài máy: mất khoá là phải nhập lại bí mật.
- Đổi khoá gốc: `BIZCITY_SECRETS_KEY_CU=<cũ> BIZCITY_SECRETS_KEY=<mới> node scripts/doi-khoa-bi-mat.mjs [--dry-run]` — khoá chỉ qua biến môi trường; xong thì đặt khoá mới trong `.env`, khởi động lại API.
- Sao lưu (pg_dump) chỉ mang bản mã; không có đường xuất bản rõ.

### 6.5. Còn để người giữ tệp khác làm

1. Bảng mã lỗi `docs/contracts/BIZCITY-ERRORS-v1.md` §4c: thêm năm dòng `SECRETS_*` (người giữ: dòng NT-MH-011).
2. Khoá API thường (không gắn app): `API_KEY_SCOPES` ở `apps/api/src/modules/access/access.schemas.ts` chưa nhận `secrets:read:<module>` — Platform đã ánh xạ phạm vi này nếu được mở.
