# BIZCITY-SECRETS-v1 · Lưu bí mật mã hoá theo đơn vị cho module (`platform.secrets`)
<!-- [2026-11-25 08:30 PM Võ Hoàng] FLOW — chữ chốt R-FLOW-2 cho năng lực platform.secrets (1.0.0-draft); Võ Hoàng làm, chủ dự án duyệt PR code (đóng góp) -->

Trạng thái: **1.0.0-draft — chữ chốt thiết kế** (R-FLOW-2). Năng lực mới ở Platform; code + test ở PR riêng sau khi bản này vào `main`, chủ dự án duyệt.
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

