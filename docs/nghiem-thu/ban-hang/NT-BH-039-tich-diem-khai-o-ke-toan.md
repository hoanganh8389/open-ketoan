# NT-BH-039 · Khai chính sách tích điểm ở phần mềm kế toán (module `loyalty`)
<!-- [2026-11-25 08:30 PM Võ Hoàng] NGHIEM-THU — chốt NT-BH-039 (anh Hoàng, 25/11) (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng — module `loyalty` (sổ điểm NT-BH-020) |
| Màn hình | BH19 Điểm thành viên (`/app/loyalty/diem`) thêm thẻ Chương trình, Đổi điểm, Cài đặt + hạng, Điều chỉnh |
| Ngày tạo | 25/11/2026 |
| Trạng thái | **Đã chốt 25/11/2026** (Võ Hoàng) — cả 5 câu §4 theo đề xuất |
| Căn cứ | Website thôi đẩy chính sách tích điểm, shop POS React khoá màn khai tích điểm trên website (25/11, open-pos `feat/cat-day-tich-diem`); kế toán cần nơi khai thay thế |

## 1. Mục tiêu

Kế toán / chủ đơn vị **khai và duyệt chính sách tích điểm ngay ở open-ketoan**, không cần màn website nữa:
- chương trình tích điểm;
- danh mục đổi quà / voucher;
- cài đặt và bảng hạng;
- cộng / trừ điểm tay có người duyệt.

Bộ tính điểm và sổ điểm hiện có (NT-BH-020) giữ nguyên. Chính sách vẫn ở **khuôn `LoyaltyProgram`** (settings, tiers, policies loại 1–6), nên máy bán và bộ tính không phải đổi.

## 2. Phạm vi

| # | Việc | Ghi chú |
|---|---|---|
| 1 | **Bản nháp chính sách theo cửa hàng**: bảng mới `program_drafts` (nội dung = `LoyaltyProgram`), trạng thái nháp → chờ duyệt → đã phát hành / từ chối, có nhật ký | như nháp khuyến mại NT-BH-025 |
| 2 | **Phát hành** = ghi một dòng mới vào `programs` (phiên bản = băm nội dung, `received_by` = người duyệt). Bộ tính dùng bản mới nhất như hôm nay | không đổi bảng `programs` |
| 3 | **Màn BH19 thêm thẻ**: Chương trình (6 loại, đủ trường như plugin cũ — L1), Đổi điểm (quà / voucher — L2), Cài đặt + bảng hạng (L3) | chép từ bản đang chạy làm nháp đầu tiên ("Sửa từ bản hiện hành") |
| 4 | **Điều chỉnh điểm tay** (L4): yêu cầu cộng / trừ, bắt buộc lý do → người khác có quyền duyệt → ghi dòng `adjust` vào sổ điểm. Người lập không tự duyệt yêu cầu của mình | Q-CD-3 |
| 5 | **Quyền mới** của module: `loyalty:chinh-sach-lap`, `-sua`, `-duyet`; `loyalty:dieu-chinh-lap`, `-duyet` (vai trò mặc định: kế toán trưởng / chủ đơn vị) | DANG-KY-QUYEN |
| 6 | Áp chính sách cho **nhiều cửa hàng một lần** (chọn danh sách chi nhánh → mỗi chi nhánh một bản nháp) | website cũ có `apply_to_blog_ids` |
| 7 | API ghi `POST /program` từ website **giữ** (lệnh tay `wp tgs-pos loyalty-push`), nhưng bản phát hành ở kế toán thắng nếu mới hơn | không phá đường cũ |

Ngoài phạm vi:
- dùng điểm để thanh toán (L5 — kiểm riêng);
- hoàn điểm khi trả quà đổi điểm;
- tạo chính sách bằng AI.

## 3. Ca nghiệm thu (chốt số trước khi code)

| Ca | Thao tác | Kết quả mong đợi |
|---|---|---|
| 1 | Kế toán A sửa từ bản hiện hành của CN02: thêm chính sách loại 1 "1 điểm / 10.000đ, hạn 365 ngày", gửi duyệt | Bản nháp chờ duyệt; máy bán vẫn tính theo bản cũ |
| 2 | Kế toán trưởng B duyệt | `programs` CN02 có phiên bản mới; đơn tiếp theo 325.000 có khách → +32 điểm |
| 3 | A tự duyệt bản của mình (không có quyền duyệt) | Bị chặn (403) |
| 4 | Cài đặt bật "nhân điểm theo hạng"; bảng hạng: bạc 1.000 điểm ×1,2; khách có tổng tích 1.200 mua 325.000 | +38,4 điểm (32 × 1,2 — bộ tính hiện làm tròn 2 số lẻ như plugin cũ, không đổi trong phiếu này) |
| 5 | Đổi điểm: thêm quà "Bình sữa" 200 điểm, hạng tối thiểu bạc; khách hạng thành viên đổi | Bị từ chối, câu "chưa đủ hạng" |
| 6 | Điều chỉnh tay +50 điểm "Bù đơn lỗi", A lập, B duyệt | Sổ điểm có dòng `adjust` +50, số dư tăng 50, nhật ký có A lập, B duyệt |
| 7 | A lập rồi tự duyệt điều chỉnh | Bị chặn |
| 8 | Áp chính sách cho CN01, CN02 một lần | Hai bản nháp, duyệt riêng hoặc cùng lúc |
| 9 | Website đẩy tay bản cũ hơn bản đã phát hành ở kế toán | Không đè, báo "kế toán có bản mới hơn" |

## 4. Câu chốt (25/11/2026 — theo đề xuất)

| # | Câu | Đề xuất |
|---|---|---|
| Q1 | Quyền duyệt chính sách và duyệt điều chỉnh: chung một quyền hay tách? | Tách (`-duyet` riêng mỗi việc) |
| Q2 | Điều chỉnh tay có trần (ví dụ ±1.000 điểm / lần) không? | Không trần, có duyệt là đủ |
| Q3 | Nháp đầu tiên: chép từ bản website đang chạy (giữ nguyên 6 loại, hạng, danh mục đổi)? | Có |
| Q4 | Mục 7: website đẩy bản cũ hơn thì từ chối hay ghi nhận nhưng không dùng? | Từ chối, báo rõ |
| Q5 | Số phiếu: NT-BH-039 (số kế tiếp sau 038)? | Có |

## 5. Màn ghi dữ liệu — R-REV-17

Mỗi form ghi (bản nháp chính sách, danh mục đổi, cài đặt + hạng, yêu cầu điều chỉnh, duyệt):
- có bản đồ lỗi `<Tên>.failure-map.json` cạnh form;
- câu hỏi ngược đã trả lời;
- mỗi dòng chặn có mã lỗi và test;
- dán `loi.mjs` + `failure-check --report` vào bằng chứng PR.

## 6. Kết quả thực hiện
<!-- [2026-11-25 09:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-039: ghi kết quả thực hiện, nhánh feat/nt-bh-039-tich-diem (đóng góp) -->

| Ca | Kết quả | Test |
|---|---|---|
| 1 | Đạt — nháp chép bản hiện hành, gửi duyệt; máy bán vẫn bản cũ | `apps/api/test/nt-bh-039-tich-diem.test.ts` ca 1 |
| 2 | Đạt — phiên bản `kt-…` (băm nội dung), `received_by` = người duyệt; đơn 325.000 → +32 | ca 2 |
| 3 | Đạt — người không có quyền duyệt 403; người lập (kể cả chủ đơn vị) tự duyệt 403 | ca 3 |
| 4 | Đạt — +38,4 (bộ tính không đổi) | ca 4; `modules/loyalty/test/program-draft.test.ts` |
| 5 | Đạt — "… chưa đủ hạng: cần hạng Bạc, khách đang hạng Thành viên" | ca 5; test module |
| 6 | Đạt — dòng `adjust` +50, nhật ký A lập / B duyệt | ca 6 |
| 7 | Đạt — tự duyệt bị chặn; trừ quá số dư bị chặn lúc lập và lúc duyệt | ca 7 |
| 8 | Đạt — hai nháp cùng lần áp, duyệt cùng lúc; cửa hàng có nháp mở bị chặn | ca 8 |
| 9 | Đạt — 409 `LOYALTY_PROGRAM_OLDER` "Kế toán có bản mới hơn…"; gửi lại bản đang chạy vẫn `changed: false` | ca 9 |

Ghi chú cách làm:
- Quyền lập / sửa mặc định gồm cả **kế toán** (để "kế toán A" ở ca 1 lập được); duyệt chỉ kế toán trưởng / chủ đơn vị.
- Q4 "bản cũ hơn": khi bản đang chạy do kế toán phát hành, website chỉ đè được nếu gửi `program.updatedAt` mới hơn lúc kế toán duyệt; không gửi thì từ chối.
- Áp nhiều cửa hàng: cài đặt + bảng hạng lấy theo nội dung áp; chính sách gộp theo mã vào bản đang chạy của từng cửa hàng (chính sách riêng giữ nguyên, Q-DM-01).
- Bản đồ lỗi R-REV-17: `modules/loyalty/web/screens/diem/*.failure-map.json` (6 form, 37 tình huống, đủ mã + test).
