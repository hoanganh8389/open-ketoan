# Hoá đơn điện tử (`hoa-don-dien-tu`)

<!-- [2026-11-26 09:55 PM Võ Hoàng] NGHIEM-THU — NT-BH-048: mô tả module (đóng góp) -->

> Module Bizcity viết bằng `@bizcity/module-sdk`. Phiếu nghiệm thu: [NT-BH-048](../../docs/nghiem-thu/ban-hang/NT-BH-048-hoa-don-dien-tu-khai-o-ke-toan.md). Hướng dẫn: [hoa-don-dien-tu.md](../../docs/huong-dan/hoa-don-dien-tu.md).

## Nghiệp vụ

Khai **một chỗ** ở kế toán thông tin xuất hoá đơn điện tử Viettel. Website (plugin Viettel) vẫn phát hành, lấy cài đặt qua cầu nối (S-HD-4).

- **Theo sổ** (một đơn vị = một sổ = một pháp nhân, P-0): MST, tên pháp lý, địa chỉ, điện thoại, API base URL, xác thực Basic / Bearer, SSL, mẫu số / ký hiệu / thanh toán / tự động mặc định — bảng `mod_hoa_don_dien_tu.so`.
- **Theo chi nhánh**: mẫu số / ký hiệu riêng (trống = theo sổ), portal gửi mail — bảng `mod_hoa_don_dien_tu.chi_nhanh`.
- **Nhật ký**: `mod_hoa_don_dien_tu.nhat_ky` — tên ô đã đổi, bí mật đã đặt / xoá, mã HTTP khi thử kết nối. Không giá trị bí mật.

## Bí mật (`ctx.secrets`, platform.secrets)

| Tên | Phạm vi | Việc |
|---|---|---|
| `hoa-don-dien-tu.viettel.password` | tenant (sổ) | Mật khẩu Viettel (xác thực Basic) |
| `hoa-don-dien-tu.viettel.token` | tenant (sổ) | Access token (xác thực Bearer) |
| `hoa-don-dien-tu.portal.password` | branch | Mật khẩu portal gửi mail |

Giao diện chỉ thấy "đã đặt lúc … bởi …". Khoá app có `secrets:read:hoa-don-dien-tu` đọc qua `GET /api/v1/m/hoa-don-dien-tu/secrets/read` (action tự sinh).

## Action

| Action | HTTP | Quyền |
|---|---|---|
| `hoa-don-dien-tu.cai-dat.get` | `GET /cai-dat` | `hoa-don-dien-tu:cai-dat-xem` |
| `hoa-don-dien-tu.cai-dat.save-so` | `PUT /cai-dat/so` | `hoa-don-dien-tu:cai-dat-sua` |
| `hoa-don-dien-tu.cai-dat.save-chi-nhanh` | `PUT /cai-dat/chi-nhanh/:branchCode` | `hoa-don-dien-tu:cai-dat-sua` |
| `hoa-don-dien-tu.ket-noi.thu` | `POST /ket-noi/thu` | `hoa-don-dien-tu:cai-dat-sua` |
| `hoa-don-dien-tu.cai-dat.export` | `GET /cai-dat/export?branchCode=` | `hoa-don-dien-tu:cai-dat-xem` |
| `hoa-don-dien-tu.nhat-ky.list` | `GET /nhat-ky` | `hoa-don-dien-tu:cai-dat-xem` |
| `hoa-don-dien-tu.secrets.read` | `GET /secrets/read?name=&branchCode=` | `secrets:read:hoa-don-dien-tu` (chỉ khoá app) |

Tiền tố HTTP: `/api/v1/m/hoa-don-dien-tu`.

## Sự kiện

Chưa phát, chưa nghe sự kiện nào.

## Màn

| Mã | Đường dẫn | Màn |
|---|---|---|
| THUE03 | `/app/hoa-don-dien-tu` | Người bán + tài khoản Viettel (theo sổ), bảng chi nhánh, thử kết nối, nhật ký |
