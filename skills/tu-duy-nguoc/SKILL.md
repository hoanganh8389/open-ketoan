---
name: tu-duy-nguoc
description: Dùng khi dev nhờ AI làm hoặc sửa một màn có ghi dữ liệu (thêm / sửa / xoá / lưu / ghi sổ / duyệt / gửi sang app khác) trong repo Bizcity Open (open-ketoan, open-pos, open-cake…), hoặc khi dev hỏi "sao không lưu được", "lỗi gì", "đã đủ tình huống chưa". Bắt AI hỏi ngược trước khi viết mã lưu, dựng bản đồ lỗi, rồi cho dev xem lỗi thật và độ phủ ngay trong terminal.
---

<!-- [2026-11-25 06:22 PM Johnny Chu - Chu Hoàng Anh] FLOW — STD-11: chép từ bizcity-platform skills/tu-duy-nguoc (nguồn gốc ở đó; sửa ở bizcity-platform rồi chép lại) -->
<!-- [2026-11-25 06:12 PM Johnny Chu - Chu Hoàng Anh] STD-11 — skill vòng phản hồi lỗi (bizcity_feedback_loop@1). Cài vào repo: chép thư mục này vào skills/ của repo, hoặc trỏ tới bizcity-platform. -->

# Tư duy ngược trước khi viết mã lưu

Chuẩn: `bizcity-platform/docs/standard/BIZCITY-FEEDBACK-LOOP-v1.md` và `BIZCITY-FAILURE-MAP-v1.md`.
Bên dưới, `P` là đường tới repo bizcity-platform (thường là `../bizcity-platform`).

## Khi nào dùng

Dev nhờ làm hoặc sửa một màn có ghi dữ liệu, hoặc hỏi vì sao không lưu / không ghi sổ được.

## 1. Trước khi viết dòng mã lưu nào

1. Xác định màn (mã màn, tệp form) và **luồng**: `chung`, `danh-muc`, `mua`, `ban`, `kho`, `quy`, `cong-no`, `thue`, `cuoi-ky`, `gui-app`.
2. In câu hỏi ngược:
   ```bash
   node P/tools/failure-check.mjs --questions mua,kho
   ```
3. Màn chưa có bản đồ lỗi thì dựng khung:
   ```bash
   node P/tools/failure-check.mjs --repo . --scaffold <tệp form> --code <MÃ MÀN> --label "<tên>" --flow mua,kho --write
   ```
4. **Hỏi dev / người yêu cầu từng câu chưa rõ, ngay trong khung chat.** Không tự đoán, nhất là các câu về:
   - nguồn gốc số: hợp đồng mua, phân tích mua, tồn min / max, hạn mức;
   - mức chặn hay cảnh báo;
   - ai duyệt;
   - luồng kho.

   Câu có ý nghĩa kế toán (kỳ, thuế, kho, giá vốn, công nợ) cần kế toán trưởng trả lời. Chưa có câu trả lời thì ghi rõ "chờ kế toán trưởng", không tự chọn.
5. Ghi câu trả lời vào `questions[].answer` của bản đồ, rồi sửa các dòng:
   - gán mã có sẵn trong danh mục mã của repo; thiếu mã thì đề xuất thêm theo luật của repo;
   - viết lời nhắc tiếng Việt: sai gì, làm gì tiếp;
   - bỏ dòng không áp dụng.
6. **Cho dev xem bảng tình huống** trước khi code. Cột: thao tác · tình huống · chỉ vào đâu · bắt ở tầng nào · mã · lời nhắc.

## 2. Trong khi code

- Mỗi dòng chặn có đích là ô nhập / danh sách chọn / nguồn gốc thì màn phải báo **trước khi bấm**, đúng ô. Danh sách chọn có nút thêm / sửa tại chỗ qua action của chủ danh mục.
- Mỗi dòng chặn có một test gây ra đúng mã.
- Không nới luật của lõi để "cho lưu được". Lõi từ chối nghĩa là dữ liệu sai đã đi tới đó: sửa ở chỗ gửi.

## 3. Sau khi thử (dev bấm trên màn, hoặc chạy test)

```bash
node P/tools/loi.mjs --repo . --since 2h          # lỗi thật theo màn × mã, đối chiếu bản đồ, lỗi kỹ thuật kèm reqId / traceId
node P/tools/failure-check.mjs --repo . --report  # độ phủ bản đồ
```

- API chạy trong docker: chỉ `--data` / `--logs` tới thư mục đã gắn ra ngoài. open-ketoan dùng `DATA_DIR` và `LOG_DIR` (trong container: `/app/apps/api/data`, `/app/logs`).
- Đọc kết quả cho dev bằng lời thường. Ví dụ: "IN-ITEM-009 xảy ra 4 lần ở ô mặt hàng; đã có trong bản đồ nhưng màn chưa báo trước".
- Dòng "KHÔNG có trong bản đồ" → thêm dòng, lời nhắc, test. Dòng "CHƯA báo trước" → sửa màn.
- Lỗi kỹ thuật → mở đúng `logs/<dịch vụ>/<ngày>.log:<dòng>`, hoặc Tempo theo `traceId`.

## 4. Không được

- Không chép dữ liệu thật của người dùng (số tiền, tên khách, mã số thuế) vào test, commit, PR hay khung chat. Mã lỗi, mã màn, `requestId`, `traceId` là đủ.
- Không báo "xong" khi `failure-check` còn phát hiện chặn trên bản đồ của màn.
- Không tự hạ mức chặn xuống cảnh báo ở dòng có ý nghĩa kế toán.
