# NT-BH-055 · Máy bán: phân quyền theo tài khoản — nhân viên xem mọi màn của shop mình, quản trị xem hết
<!-- [2026-11-28 10:30 AM Võ Hoàng] NGHIEM-THU — tạo phiếu, Đã chốt (Hoàng giao 28/11) (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng (máy bán) |
| Màn hình | Máy bán: Báo cáo bán hàng, Tổng hợp bán hàng, Báo cáo thu tiền bán hàng, Bán hàng theo danh mục, Doanh số theo ngày (module `pos`, `/pos/reports/*`) |
| Bộ phận yêu cầu | Bán hàng (Hoàng) |
| Ngày tạo | 28/11/2026 |
| Trạng thái | Đã chốt — "phân quyền theo tài khoản: tài khoản POS nhân viên ở shop nào thì xem được hết các màn ở shop đấy, còn quản trị thì xem được hết" (Hoàng 28/11) |
| Trụ cột / tiêu chí | không đổi mức trụ cột |

## 1. Mục đích quản trị
Trên UAT, một tài khoản bán ở nhiều shop mở báo cáo ở shop khác shop của ca gần nhất thì bị "Bạn không có quyền": module chỉ coi
chi nhánh của ca **gần nhất** người đó mở là chi nhánh của máy. Từ phiếu này chi nhánh của **tài khoản** là:
- phạm vi chi nhánh gán ở Phân quyền (vai trò tại chi nhánh, NT-HT-003) nếu có;
- không gán thì **mọi** chi nhánh tài khoản đã mở ca hoặc đã bán;
- tài khoản quản trị (vé máy bán mang `pos:report`) xem mọi chi nhánh.

## 2. Khai báo trước
- Vé máy bán: tài khoản quản trị mạng WordPress nhận thêm `pos:report` (plugin máy bán, bộ lọc `tgs_pos_ticket_is_admin` để mở rộng); nhân viên chỉ `pos:sell`.
- Muốn nhân viên mới (chưa mở ca lần nào) xem được ngay: gán chi nhánh cho tài khoản ở Phân quyền của kế toán.

## 3. Các bước thao tác
1. Nhân viên A mở ca ở CN01, rồi ở CN02 → mở Báo cáo bán hàng của CN01 và CN02: đều xem được.
2. Nhân viên B chỉ mở ca ở CN03 → xem CN03 được; xem CN01 → báo "Tài khoản này chỉ xem được số của chi nhánh CN03 — không xem được CN01…".
3. Nhân viên C chưa mở ca / bán lần nào → báo "Tài khoản này chưa thuộc chi nhánh nào: gán chi nhánh … ở Phân quyền … hoặc mở ca bán hàng tại cửa hàng này trước".
4. Quản trị (pos:report) xem CN01, CN02, CN03 không cần ca.

## 4. Số liệu đầu vào
Đơn vị có CN01, CN02, CN03; vé SSO thử (`apps/api/test/nt-bh-055-pham-vi-shop-pos.test.ts`).

## 5. Kết quả mong đợi
| Bước | Mong đợi |
|---|---|
| 1 | 200 cho cả 5 báo cáo ở CN01 và CN02 |
| 2 | CN03: 200; CN01: 403, câu nêu chi nhánh được xem |
| 3 | 403, câu chỉ cách gán chi nhánh |
| 4 | 200 ở cả ba chi nhánh |

Không chứng từ, không bút toán (chỉ đọc).

## 6. Lệch chuẩn / mặc định đã áp
- M1 — Gắn chi nhánh vào vé SSO và để Core đặt phạm vi chi nhánh từ vé (cách tập trung, phủ mọi màn) phải sửa `packages/platform/src/core/auth.ts`, `apps/api/src/modules/access/quyen-chi-nhanh.ts` đang thuộc dòng giữ chỗ NT-HT-003 (người khác) → chưa làm; phiếu này sửa ở lớp module (báo cáo máy bán).
- M2 — Các màn máy bán đọc API Core (MH24 sổ kho, sổ quỹ két, phiếu chuyển tiền, đăng ký max) chỉ giới hạn nhân viên khi tài khoản được gán chi nhánh ở Phân quyền (NT-HT-003) và bật giới hạn chi nhánh của đơn vị; chưa gán thì nhân viên gửi mã chi nhánh khác vẫn đọc được (không có giá vốn).
- M3 — Quản trị = quản trị mạng WordPress (super admin).

## 7. Kết quả chạy
- `apps/api/test/nt-bh-055-pham-vi-shop-pos.test.ts` 4/4; `apps/api/test/nt-bh-043-bao-cao-pos.test.ts` 11/11 (hồi quy); test hàm module pos 161/161.

## 8. Biên bản
Hoàng chốt 28/11 (chat).

## 9. Lịch sử
- 28/11/2026 — tạo, Đã chốt.
