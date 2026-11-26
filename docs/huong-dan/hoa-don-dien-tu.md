# Hoá đơn điện tử (THUE03)

<!-- [2026-11-26 09:50 PM Võ Hoàng] NGHIEM-THU — NT-BH-048: hướng dẫn màn THUE03 (module hoa-don-dien-tu) (đóng góp) -->

Nơi **duy nhất** khai thông tin xuất hoá đơn điện tử Viettel cho cả chuỗi cửa hàng. Website bán hàng **vẫn phát hành** hoá đơn, nhưng lấy cài đặt ở đây qua cầu nối, không tự khai cụm nữa. Mở ở menu **Thuế → Hoá đơn điện tử** (THUE03).

## Ai làm được gì

| Việc | Quyền | Mặc định gán cho |
|---|---|---|
| Xem cài đặt, nhật ký | Hoá đơn điện tử — xem cài đặt | Chủ đơn vị, kế toán trưởng, kế toán |
| Sửa cài đặt, đặt mật khẩu Viettel, thử kết nối | Hoá đơn điện tử — sửa cài đặt (rủi ro cao) | Chủ đơn vị, kế toán trưởng |

Gán thêm cho vai trò khác ở màn **Phân quyền** (dòng THUE03).

## Theo sổ: người bán và tài khoản Viettel

Một sổ là một pháp nhân, nên các ô sau dùng chung cho **mọi chi nhánh**:

| Ô | Ghi gì |
|---|---|
| Trạng thái | **Đang khai**: website chưa dùng. **Đang dùng**: website dùng để phát hành (phải đủ MST, tên pháp lý, API, mẫu số, ký hiệu, tài khoản). **Tạm ngừng phát hành** |
| MST người bán | 10 số, hoặc `0123456789-001` |
| Tên pháp lý, địa chỉ, điện thoại | In trên hoá đơn |
| API base URL | Địa chỉ API hoá đơn Viettel, bắt đầu bằng `https://` |
| Xác thực | **Basic** (tên đăng nhập + mật khẩu) hoặc **Bearer token** |
| Mật khẩu Viettel / Access token | Lưu **mã hoá**, không hiện lại cho ai. Màn chỉ ghi "Đã đặt lúc … bởi …". Để trống = giữ nguyên; gõ `-` = xoá |
| Kiểm chứng chỉ SSL | Chỉ tắt khi môi trường thử dùng chứng chỉ tự ký |
| Mẫu số / ký hiệu mặc định | Chi nhánh không khai riêng thì dùng |
| Thanh toán mặc định | Ghi trên hoá đơn, vd `TM/CK` |
| Tự động xử lý khi bán xong | **Tắt** (phát hành tay), **Tạo nháp trên Viettel**, hoặc **Phát hành và gửi CQT** |

Bấm **Sửa** để mở form; **Lưu**. Nếu người khác vừa sửa trước, màn báo "đã được … sửa lúc …": tải lại rồi sửa tiếp.

## Theo chi nhánh

Bảng liệt kê mọi chi nhánh đang dùng. Cột Mẫu số / Ký hiệu ghi **(theo sổ)** khi chi nhánh chưa khai riêng. Bấm **Sửa** ở dòng chi nhánh để khai:

- **Mẫu số, ký hiệu** riêng (để trống = theo sổ);
- **Phát hành hoá đơn điện tử**: bỏ tích nếu chi nhánh không xuất hoá đơn;
- **Gửi mail qua portal**: tài khoản portal, mật khẩu portal (mã hoá như trên), supplier ID.

## Thử kết nối Viettel

Nút **Thử kết nối Viettel** (góc trên): máy chủ gọi thử địa chỉ API bằng tài khoản đã khai và báo mã HTTP:

- "Kết nối được (HTTP 200)": địa chỉ và tài khoản dùng được;
- "Máy chủ Viettel từ chối tài khoản (HTTP 401/403)": sai tên đăng nhập / mật khẩu / token;
- "Không kết nối được": sai địa chỉ, mạng chặn, hoặc quá 15 giây.

Nút này **không** phát hành, tra cứu hay huỷ hoá đơn nào.

## Nhật ký

Cuối màn: ai, lúc nào, sửa ô nào, đặt / xoá mật khẩu nào, thử kết nối được hay không. Nhật ký **không bao giờ** ghi giá trị mật khẩu / token.

## Lưu ý vận hành

- Máy chủ kế toán phải khai khoá gốc `BIZCITY_SECRETS_KEY` (trong `.env`). Chưa khai thì ô thường vẫn lưu được, nhưng đặt mật khẩu báo "chưa sẵn sàng (SECRETS_KEY_MISSING)".
- Cầu nối / plugin Viettel đọc cài đặt bằng khoá kết nối riêng (quyền `secrets:read:hoa-don-dien-tu`). Người dùng đăng nhập, kể cả chủ đơn vị, **không** đọc được mật khẩu qua API.
