# NT-BH-048 · Hoá đơn điện tử — khai tài khoản Viettel ở kế toán (module mới `hoa-don-dien-tu`)
<!-- [2026-11-26 08:30 PM Võ Hoàng] NGHIEM-THU — lập phiếu NT-BH-048 (S-HD-2 của kế hoạch 90), ghi các quyết định đã chốt 25/11 và 26/11 (đóng góp) -->

| | |
|---|---|
| Phân hệ | Thuế — module **mới** `modules/hoa-don-dien-tu/` (khung như `modules/xuat-dieu-chinh`, ADR-0024); bí mật qua `ctx.secrets` (`platform.secrets`, BIZCITY-SECRETS-v1 1.0.0) |
| Màn hình | THUE03 Hoá đơn điện tử — màn mới ở module (`/app/hoa-don-dien-tu`): thông tin người bán + tài khoản Viettel theo sổ, bảng mẫu số / ký hiệu / portal theo chi nhánh, nhật ký, nút **Thử kết nối Viettel** |
| Bộ phận yêu cầu | Bộ phận Bán hàng (hoá đơn điện tử cho máy bán) |
| Ngày tạo | 26/11/2026 |
| Trạng thái | **Đã chốt** (26/11/2026 — bộ phận Bán hàng chốt: làm ngay, không chờ đề xuất bậc 4 vì `platform.secrets` đã có trên `main` 25/11) |
| Trụ cột / tiêu chí | không |
| Căn cứ | Kế hoạch `docs123/docs/module-pos/90-TAI-KHOAN-THUE-CHUYEN-KHO-QUA.md` (S-HD-1 … S-HD-5, chốt 25/11); BIZCITY-SECRETS-v1 §1 (ca dùng chính là màn này); luật P-0 (một blog = một tenant = một sổ) |

## 1. Mục đích quản trị

Khai **một chỗ** (open-ketoan) thông tin xuất hoá đơn điện tử Viettel cho cả chuỗi: người bán (MST, tên pháp lý), tài khoản Viettel, mẫu số / ký hiệu từng chi nhánh, tài khoản portal gửi mail. Website (plugin `tgs-viettel-invoice`) **vẫn phát hành**, nhưng sẽ kéo cài đặt về qua cầu nối (S-HD-4, ngoài phiếu này) thay vì mỗi website tự khai cụm. Mật khẩu lưu mã hoá, không hiện lại cho ai. Kế toán trưởng / chủ đơn vị sửa; người khác chỉ xem (nếu được gán quyền xem).

## 2. Hiện trạng (đọc 26/11)

| Việc | Ở đâu | Đang làm gì |
|---|---|---|
| Khai cụm Viettel | website, `tgs-viettel-invoice/admin-views/cluster-settings.php` + `includes/class-tgs-viettel-invoice-clusters.php` (repo khác) | Cụm = MST, tên pháp lý, địa chỉ, điện thoại, API base URL, xác thực Basic / Bearer (username, password, access token mã hoá ở website), SSL verify, mẫu số + ký hiệu mặc định, phương thức thanh toán mặc định, tự động (bật/tắt, `draft` / `issue`), portal gửi mail (bật, tài khoản, mật khẩu, supplier ID), danh sách shop, người dùng + mức quyền. Thử kết nối = GET API base URL, báo mã HTTP |
| Bí mật ở open-ketoan | `packages/platform/src/core/secrets.ts`, migration `0184` | Đã có: `ctx.secrets` (tenant / book / branch), manifest `secrets[]`, action đọc cho khoá app `GET /api/v1/m/<key>/secrets/read` (quyền `secrets:read:<key>`) |
| Màn khai ở open-ketoan | — | Chưa có |

## 3. Phạm vi

| # | Việc | Ghi chú |
|---|---|---|
| 1 | Module `hoa-don-dien-tu`: manifest, quyền, màn THUE03, `secrets[]` | Không sửa Kernel / `packages/*` / module khác |
| 2 | Bảng của module (`mod_hoa_don_dien_tu`): **sổ** (một dòng mỗi đơn vị) + **chi nhánh** (một dòng mỗi chi nhánh có khai) + nhật ký thay đổi | Không có cột mật khẩu / token |
| 3 | Action đọc `hoa-don-dien-tu.cai-dat.get`: thông tin sổ + mọi chi nhánh đang dùng (đã khai / chưa khai) + trạng thái bí mật (`đã đặt lúc … bởi …`) | Không bao giờ trả giá trị bí mật |
| 4 | Action ghi `hoa-don-dien-tu.cai-dat.save-so`: người bán, tài khoản Viettel, mặc định (mẫu số, ký hiệu, phương thức thanh toán, tự động); mật khẩu / token: trống = giữ, `-` = xoá, chuỗi khác = đặt mới | Kiểm phiên bản (`version`) chống ghi đè |
| 5 | Action ghi `hoa-don-dien-tu.cai-dat.save-chi-nhanh`: mẫu số, ký hiệu, portal (bật, tài khoản, supplier ID, mật khẩu theo chi nhánh), đang dùng | |
| 6 | Action `hoa-don-dien-tu.ket-noi.thu`: máy chủ gọi `GET <API base URL>` (Basic / Bearer theo cài đặt, chờ tối đa 15 giây), trả mã HTTP + thời gian; **không** gọi lệnh phát hành nào | Như nút cũ ở website; ghi nhật ký |
| 7 | Action đọc cho cầu nối `hoa-don-dien-tu.cai-dat.export`: cài đặt hiệu lực theo chi nhánh (chi nhánh trống ô thì lấy mặc định của sổ), kèm `configVersion`; **không** có bí mật — bí mật đọc riêng qua action tự sinh `hoa-don-dien-tu.secrets.read` (khoá app có `secrets:read:hoa-don-dien-tu`) | S-HD-4 dùng |
| 8 | Nhật ký (`hoa-don-dien-tu.nhat-ky.list`): ai, lúc nào, sửa gì (tên ô), thử kết nối (mã HTTP); bí mật chỉ ghi "đã đổi mật khẩu …" | R-LOG-4 |
| 9 | Hướng dẫn `docs/huong-dan/hoa-don-dien-tu.md` | |

Ngoài phạm vi:
- cầu nối + plugin Viettel kéo cài đặt về, màn cụm website chuyển chỉ xem (**S-HD-4**, PR open-ketoan-bridge / tgs-viettel-invoice riêng);
- chuyển các cụm đang có trên website sang (**S-HD-5**);
- phát hành / huỷ / điều chỉnh hoá đơn (vẫn ở website).

### Tệp sẽ chạm (dòng CLAIMS)

```
modules/hoa-don-dien-tu/**                          (mới — manifest, api, web, migrations, test)
package-lock.json                                   (mục workspace mới)
apps/api/test/nt-bh-048-*.test.ts                   (mới)
docs/nghiem-thu/ban-hang/NT-BH-048-hoa-don-dien-tu-khai-o-ke-toan.md
docs/huong-dan/hoa-don-dien-tu.md                   (mới)
apps/web/src/layout/menu-gon.ts                     (thêm lối tắt ở nhóm Thuế)
apps/web/src/layout/ten-man.ts                      (tên màn /app/hoa-don-dien-tu)
```

## 4. Quyết định đã chốt

| # | Câu | Chốt |
|---|---|---|
| 1 | Khai ở đâu | **Chỉ ở open-ketoan** (25/11). Website chỉ kéo về; open-ketoan tắt thì website dùng bản đã kéo (S-HD-4) |
| 2 | Gắn theo đâu | MST, tên pháp lý, địa chỉ, tài khoản Viettel (API base URL, username, password / token) theo **sổ** (pháp nhân, P-0). Mẫu số, ký hiệu, email / tài khoản portal theo **chi nhánh** |
| 3 | Ai sửa | Kế toán trưởng / chủ đơn vị — khai thành **quyền riêng**, hiện ở màn phân quyền (gán theo vai trò, không cứng vai trò trong code) |
| 4 | Mật khẩu | Lưu mã hoá (`ctx.secrets`), không hiện lại; giao diện chỉ thấy "đã đặt lúc … bởi …" + ô nhập mới |
| 5 | Bộ ô | Giống màn cụm website để S-HD-5 chuyển 1:1 |
| 6 | Thử kết nối | Có nút, gọi từ máy chủ; test dùng HTTP giả — không gọi Viettel thật, không phát hành hoá đơn thật |
| 7 | Chờ đề xuất bậc 4? | **Không** — `platform.secrets` đã có trên `main` 25/11 (S-HD-1 xong) |

### Mặc định đã áp (người làm chọn, sửa được khi nghiệm thu)

| # | Mặc định | Lý do |
|---|---|---|
| M1 | "Theo sổ" = phạm vi **tenant** của `ctx.secrets` (không dùng `bookId`) | P-0: một tenant là một sổ; chưa có khái niệm nhiều sổ trong một tenant |
| M2 | Sổ giữ **mẫu số / ký hiệu / phương thức thanh toán / tự động mặc định**; chi nhánh trống ô thì dùng mặc định của sổ | Cụm website có `default_template_code`, `default_invoice_series` ở cấp cụm → chuyển 1:1 |
| M3 | Portal gửi mail (bật, tài khoản, supplier ID, **mật khẩu**) theo **chi nhánh** | Quyết định 2; mật khẩu portal là bí mật phạm vi `branch` |
| M4 | Quyền: `hoa-don-dien-tu:cai-dat-xem` (gán sẵn chủ đơn vị, kế toán trưởng, kế toán), `hoa-don-dien-tu:cai-dat-sua` (gán sẵn chủ đơn vị, kế toán trưởng; rủi ro cao). Vai trò khác: admin gán ở màn phân quyền | Quyết định 3 |
| M5 | Mã màn **THUE03**, nhóm Thuế | THUE01 / THUE02 đã dùng |
| M6 | Một sổ một MST. Hai cụm website khác MST trỏ cùng một sổ → S-HD-5 báo xung đột, không gộp | P-0 (một sổ = một pháp nhân) |
| M7 | Danh sách người dùng + mức quyền của cụm website **không** chuyển — thay bằng quyền open-ketoan | Quyết định 3 |
| M8 | Kiểm khi lưu: MST 10 hoặc 14 số (`0123456789` / `0123456789-001`); API base URL phải `https://`; xác thực Basic thì cần username + mật khẩu đã đặt mới cho "Đang dùng" | Như `validate_cluster_data` ở website |

## 5. Ca nghiệm thu

| Ca | Thao tác | Kết quả mong đợi |
|---|---|---|
| 1 | Chủ đơn vị mở THUE03 lần đầu | Form điền sẵn trống, trạng thái **Chưa khai**; bảng chi nhánh liệt kê mọi chi nhánh đang dùng, cột "Mẫu số / Ký hiệu" hiện "theo sổ" |
| 2 | Lưu sổ: MST `0100109106`, tên pháp lý, API base URL `https://vinvoice.test/services/einvoiceapplication/api` (địa chỉ thử, không phải Viettel thật), Basic, username, mật khẩu `***`, mẫu số `1/001`, ký hiệu `C25TAA` | Lưu được; `cai-dat.get` trả `password: { set: true, updatedAt, updatedBy }`, **không** có giá trị; bảng sổ không có cột chứa mật khẩu |
| 3 | Lưu lại sổ, ô mật khẩu để trống | Mật khẩu giữ nguyên (`updatedAt` không đổi) |
| 4 | Ô mật khẩu gõ `-` | Mật khẩu bị xoá (`set: false`); nhật ký "đã xoá mật khẩu Viettel" |
| 5 | Chi nhánh `08004`: mẫu số `1/002`, ký hiệu `C25TLT`, portal bật + tài khoản + mật khẩu portal | `export` cho `08004` trả `1/002`, `C25TLT`; chi nhánh khác trả `1/001`, `C25TAA` (theo sổ); `portalPassword` của `08004` `set: true` |
| 6 | MST `12345` | Chặn tại ô "MST 10 hoặc 14 số" |
| 7 | API base URL `http://…` | Chặn "phải là https://" |
| 8 | Kế toán (chỉ quyền xem) gọi `save-so` | 403; giao diện ẩn nút Sửa / Lưu |
| 9 | Hai người cùng sửa, người sau gửi `version` cũ | `CONFLICT` "đã có người sửa, tải lại" |
| 10 | Thử kết nối (HTTP giả trả 200 / 401 / lỗi mạng) | Báo "Kết nối được (HTTP 200)" / "Sai tài khoản (HTTP 401)" / "Không kết nối được: …"; nhật ký ghi mã HTTP; không có lời gọi nào khác ngoài GET base URL |
| 11 | Phiên người dùng (kể cả chủ đơn vị) gọi `GET /api/v1/m/hoa-don-dien-tu/secrets/read` | 403 (chỉ khoá app có `secrets:read:hoa-don-dien-tu`) |
| 12 | Khoá app có `secrets:read:hoa-don-dien-tu` đọc `hoa-don-dien-tu.viettel.password` | Trả đúng giá trị; một dòng `audit_logs` `secrets.read`, không có giá trị |
| 13 | `BIZCITY_SECRETS_KEY` chưa khai, lưu mật khẩu | `NOT_READY` `SECRETS_KEY_MISSING`, câu tiếng Việt chỉ cách khai; các ô thường vẫn lưu được nếu không gõ mật khẩu |
| 14 | Nhật ký | Có dòng cho ca 2, 4, 5, 10; không dòng nào chứa mật khẩu / token |

## 6. Lệch chuẩn / đề xuất

- Không có đề xuất Core: dùng `platform.secrets` như đang có.
- Theo dõi: tên bí mật cố định `hoa-don-dien-tu.viettel.password`, `hoa-don-dien-tu.viettel.token` (tenant), `hoa-don-dien-tu.portal.password` (branch) — S-HD-4 đọc đúng các tên này.

## 7. Kết quả chạy

(điền sau khi code)

## 8. Biên bản

| Ngày | Ai | Nội dung |
|---|---|---|
| 26/11/2026 | Bộ phận Bán hàng | Chốt làm ngay theo §4; mặc định M1–M8 do người làm chọn, xem lại lúc nghiệm thu |

## 9. Lịch sử

| Ngày | Thay đổi |
|---|---|
| 26/11/2026 | Lập phiếu, trạng thái Đã chốt |
