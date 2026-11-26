# NT-MH-016 · Phiếu shop đăng ký max (MH17): max đề nghị không điền sẵn gợi ý; nút "Điền max gợi ý"
<!-- [2026-11-26 kiennt] NGHIEM-THU — tạo phiếu theo yêu cầu người dùng (đóng góp) -->

| | |
|---|---|
| Phân hệ | Mua hàng |
| Màn hình | MH17 Phiếu đăng ký tồn max — **phiếu shop đăng ký max** |
| Bộ phận yêu cầu | Phòng kế toán (lỗi B5 khi kiểm thử MH16–MH19, 26/11/2026) |
| Ngày tạo | 26/11/2026 |
| Trạng thái | Đã chốt (kiennt, 26/11/2026) |

## 1. Yêu cầu

**Lỗi:** chọn shop trên phiếu shop đăng ký max, máy chủ điền sẵn **Max đề nghị = max gợi ý** cho mọi mã có bán (`proposedMax: suggested || max`). Người lập chỉ sửa vài mã nhưng lưu / duyệt phiếu thì **mọi mã có gợi ý khác max hiện tại cũng bị đổi max** mà không ai thấy.
- Kiểm thử 26/11 (DB local): phiếu 07002 chỉ sửa 110011001, 200011001 → duyệt xong 110011002 cũng bị hạ 20 → 10. Shop 07001: mở phiếu là 190033001 (12 → 10), 200011001 (85 → 10) đã đổi sẵn.

**Sửa:**
- Máy chủ (`GET /stock/max-requests/suggest`): **Max đề nghị mặc định = max hiện tại**. Gợi ý vẫn trả riêng ở `suggestedMax` (cột Gợi ý, bấm số gợi ý từng dòng như cũ).
- Phiếu thêm nút **"Điền max gợi ý"** (cạnh Thêm mã): điền gợi ý vào Max đề nghị cho **các dòng đang hiện** có gợi ý (lọc bằng ô Tìm để điền một phần). Người lập chủ động bấm, thấy cột Chênh trước khi lưu.
- Lưu / Gửi duyệt / Duyệt: như cũ — chỉ ghi các mã có max đề nghị khác max hiện tại.

## 2. Phạm vi

- `apps/api/src/phan-he/mua-hang/ton-max.ts` (của Nguyễn Văn Thủy — `maxRequestSuggest`: giá trị mặc định `proposedMax`; đóng góp).
- `apps/web/src/phan-he/mua-hang/ton-max/DangKyMaxPage.tsx` (của Nguyễn Văn Thủy — thêm nút; đóng góp).
- `apps/api/test/ton-max.test.ts`: kiểm `proposedMax = currentMax` ở API gợi ý.
- Ảnh hưởng: chỉ MH17 dùng API này (trong repo); máy khách khác gọi API (POS…) nhận max đề nghị = max hiện tại thay vì gợi ý — gợi ý vẫn ở `suggestedMax`.

## 3. Kết quả mong đợi

| # | Thao tác | Mong đợi |
|---|---|---|
| 1 | MH17 → Phiếu shop đăng ký max → chọn shop có bán | Max đề nghị = max hiện tại mọi dòng; cột Chênh trống; "Chỉ mã đổi max" → 0 dòng |
| 2 | Sửa 1 mã → Lưu nháp | Phiếu chỉ gồm mã đó |
| 3 | Bấm "Điền max gợi ý" | Đúng các mã có gợi ý khác max hiện tại đổi, hiện Chênh |
| 4 | Tìm 1 mã → "Điền max gợi ý" | Chỉ mã đó đổi |
| 5 | Bấm số gợi ý một dòng | Như cũ |

## 4. Kết quả chạy
| | |
|---|---|
| Ngày chạy | 26/11/2026 (máy dev) |
| Bản code (commit) | nhánh `feat/nt-mh-014-018-ton-max-sua-loi` |
| Kết quả | API: `ton-max.test.ts`, `phan-quyen-mua-hang.test.ts` đạt 34/34 (DB thử riêng); dữ liệu bán trong bài thử là tháng 10 nên gợi ý = 0 tại ngày chạy — bài kiểm giữ lỗi không quay lại, chưa tái hiện được lỗi cũ trong bài thử. Trình duyệt (DB local `ketoan_otchuong`, Hà Nội; phản hồi API gợi ý giả lập theo bản mới vì API docker chưa có bản mới và API từ mã nguồn cần migration chưa chạy ở DB local; chặn lệnh ghi): bước 1 — 07001: 11 dòng, không dòng nào Chênh, "Chỉ mã đổi max" 0 dòng; bước 2 — sửa 200011001 = 25, Lưu nháp gửi đúng 1 mã; bước 3 — đổi đúng 190033001 (12 → 10), 200011001 (85 → 10); bước 4 — lọc 190033001 → 1 dòng đổi. Typecheck API, web sạch |

## 5. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 6. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 26/11/2026 | Tạo và chốt theo yêu cầu (sửa lỗi B5) |
