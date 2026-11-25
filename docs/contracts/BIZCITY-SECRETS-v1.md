# BIZCITY-SECRETS-v1 · Lưu bí mật mã hoá theo đơn vị cho module (`platform.secrets`)
<!-- [2026-11-25 08:30 PM Võ Hoàng] FLOW — chữ chốt R-FLOW-2 cho năng lực platform.secrets (1.0.0-draft); Võ Hoàng làm, chủ dự án duyệt PR code (đóng góp) -->

Trạng thái: **1.0.0-draft — chữ chốt thiết kế** (R-FLOW-2). Năng lực mới ở Platform; code + test ở PR riêng sau khi bản này vào `main`, chủ dự án duyệt.
<!-- [2026-11-25 09:05 PM Võ Hoàng] FLOW — lõi platform.secrets có mã (nhánh feat/platform-secrets): migration 0184, packages/platform/src/core/secrets.ts, test 10 ca; còn nối ctx / quyền khoá app ngoài phạm vi CLAIMS (đóng góp) -->
Cập nhật 25/11/2026: **lõi đã có mã** (migration `0184`, `packages/platform/src/core/secrets.ts`, test `apps/api/test/secrets.test.ts`). Chưa chuyển "1.0.0 — đã có" vì còn bốn chỗ nối nằm ngoài phạm vi giữ chỗ — xem §6.3. API chốt ở §6.
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


## 6. API đã có (bản mã)
<!-- [2026-11-25 09:05 PM Võ Hoàng] FLOW — API cuối của platform.secrets theo mã (đóng góp) -->

### 6.1. Platform — `@bizcity/platform/core/secrets`

| Hàm | Việc |
|---|---|
| `secretsFor(conn, { tenantId, module, actor, declared? }): SecretsApi` | dựng `ctx.secrets` của một module trong một đơn vị, trên giao dịch của action |
| `SecretsApi.set(name, value, { scope?, note? })` | mã AES-256-GCM, ghi đè theo (đơn vị, tên, phạm vi); nhật ký `secrets.set` chỉ ghi `{ changed: true }` |
| `SecretsApi.get(name, scope?)` | giá trị hoặc `null`; chỉ phía máy chủ |
| `SecretsApi.has(name, scope?)` | `{ set, updatedAt, updatedBy }` — thứ duy nhất giao diện thấy |
| `SecretsApi.delete(name, scope?)` | xoá; nhật ký `secrets.delete` |
| `defineSecretsReadAction(module)` | action `<module>.secrets.read`, `POST /api/v1/secrets/<module>/read` (đề xuất, chưa có trong mã: route sinh khi app.ts gắn action — §6.3 mục 3), quyền `secrets:read:<module>`; chỉ khoá API / khoá app (phiên người dùng → 403); mỗi lần đọc một dòng `audit_logs` `secrets.read` (`{ found }`, không giá trị); `mcp: false`, `ai: 'deny'` |
| `rotateSecretsMasterKey(conn, cũ, mới)` | mã lại khoá dữ liệu mọi đơn vị trong một giao dịch, giá trị không đụng; trả `{ rewrapped, skipped, foreign }` |
| `secretDeclErrors(module, decls)` | kiểm khai `secrets[]` |

- Phạm vi: không truyền = `tenant`; `{ bookId }` = `book`; `{ branchCode }` = `branch`; cả hai = lỗi.
- Có `declared` thì tên phải khai và đúng phạm vi đã khai. Tên khác tiền tố module → `FORBIDDEN`.
- Lỗi (đều `NOT_READY`, `details.reason`): `SECRETS_KEY_MISSING` (chưa đặt `BIZCITY_SECRETS_KEY`), `SECRETS_KEY_MISMATCH` (khoá gốc khác khoá đã mã), `SECRETS_CORRUPT` (bản mã bị sửa / chép từ dòng khác). Thông báo không bao giờ kèm giá trị.
- Khoá gốc `BIZCITY_SECRETS_KEY`: hex hoặc base64, giải ra ≥ 32 byte; sai khuôn → cấu hình không hợp lệ lúc khởi động; trống → chỉ bí mật báo lỗi.

### 6.2. Module SDK — `@bizcity/module-sdk`

- Kiểu: `SecretsApi`, `SecretScope`, `SecretScopeType`, `SecretDecl`, `SecretInfo`.
- Manifest: `secrets: [{ name: '<key>.<tên>', scope: 'tenant' | 'book' | 'branch', label }]`; `defineModule` từ chối khai sai (`secretsErrors`, `moduleSecrets`).

### 6.3. Còn nối (ngoài phạm vi giữ chỗ — cần mở thêm tệp)

1. `ctx.secrets` trong `ActionContext` + runtime: `packages/platform/src/core/actions.ts` (giữ chỗ ghi nhầm tệp chuyển tiếp `apps/api/src/core/actions.ts`).
2. Khoá API / khoá app mang được `secrets:read:<module>`: `packages/platform/src/core/auth.ts` (lọc quyền khoá app chỉ giữ quyền Core), `packages/platform/src/core/apps.ts` (`APP_SCOPES`), chỗ tạo khoá API.
3. Gắn `defineSecretsReadAction(key)` cho module khai `secrets[]`: `apps/api/src/app.ts`.
4. Lược đồ manifest: thêm `secrets` vào `docs/contracts/BIZCITY-MODULE-v1.schema.json` (đang `additionalProperties: false`).
5. Lệnh đổi khoá gốc (gọi `rotateSecretsMasterKey`): tệp lệnh mới ở `scripts/` hoặc `packages/cli`.
