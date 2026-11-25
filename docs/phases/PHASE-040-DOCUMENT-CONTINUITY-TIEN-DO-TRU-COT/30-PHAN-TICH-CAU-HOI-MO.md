# PHASE-040 · 30 — Phân tích câu hỏi mở Q040-1..6
<!-- [2026-11-22 05:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-040 — phương án + đề xuất cho Q040-1..6, đo thêm trên GitHub ngày 2026-11-22 -->

Mỗi câu: bối cảnh đo được → các phương án → **đề xuất** → hệ quả nếu chọn. Chủ dự án trả lời bằng cách ghi "Chốt: …" vào ô cuối bảng ở [README](README.md) và đánh ✅ S040-2.

## Số đo thêm (2026-11-22)

| Điều | Giá trị | Ảnh hưởng tới |
|---|---|---|
| Repo `hoanganh8389/open-ketoan` | **Công khai** (public) | Q040-3 |
| Runner trong workflow | 9 job, tất cả `ubuntu-latest` (GitHub cấp) | Q040-3 |
| Lượt chạy Actions mới nhất | 2026-11-22 09:42 UTC, `failure` (vẫn khoá) | Q040-3 |
| Người có quyền | 1 admin (chủ dự án) + 4 quyền ghi: Thuy2k, H-Joyy, TrongKien125, WizardTDK | Q040-4 |
| Người mở 30 PR merge gần nhất | **Cả 30 do tài khoản chủ dự án mở** | Q040-4, Q040-5 |
| Người viết commit từ 2026-10-01 | 5 người thật, **10 danh tính** (tên + email khác nhau cho cùng người) | Q040-5 |

## Q040-1 — Thiếu số hợp đồng trên phiếu mua: nhắc hay chặn?

**Bối cảnh.** Nền hợp đồng đã có từ 0165 (`dims.contract`, liên kết `applies`). Dữ liệu cũ chưa gắn hợp đồng; mua lẻ, mua gấp không có hợp đồng là việc bình thường ở doanh nghiệp nhỏ.

| Phương án | Được | Mất |
|---|---|---|
| A. Mặc định **nhắc**, kế toán trưởng bật chặn cho đơn vị | Đúng R-GATE-9 và tenet "mặc định cho phép, nhắc khi sai"; không làm gãy dữ liệu cũ; dùng ngay | Đơn vị không bật thì vẫn có phiếu thiếu hợp đồng — bù bằng thống kê `IN-DOC-CONTRACT-REQ` ở HT19 |
| B. Chặn với mọi đơn vị | Chuỗi sạch tuyệt đối | Trái R-GATE-9; chặn mua lẻ; buộc nhập hợp đồng giả — đúng điều D040-5 muốn tránh |
| C. Chặn theo ngưỡng tiền (vd. ≥ 20 triệu) | Gần thực tế kiểm soát nội bộ | Thêm tham số chính sách mới; ngưỡng mỗi nơi một khác |

**Đề xuất: A**, và để ngưỡng tiền của C thành **tuỳ chọn trong cùng chính sách** (Policy Registry) cho kế toán trưởng, mặc định tắt. Mua không hợp đồng ghi `meta.contractException` (lý do + người cho phép), không bao giờ gắn hợp đồng giả.

## Q040-2 — Tên luật `R-DOC-CONT`, tệp `RULE-DOCUMENT-CONTINUITY.md`?

**Bối cảnh.** Đã có tiền tố `STD-DOC-*` (chuẩn hợp đồng `bizcity_document@1`), `DOC-001..061` (ma trận ở [10](10-MA-TRAN-CHUNG-TU.md)), `SC-DOC-1` (selfcheck tài liệu). Quan trọng hơn: **`R-CONT-0..9` đã có chủ** — trụ cột III *Liên tục kế toán* ([RULE-CONTINUITY.md](../../rules/RULE-CONTINUITY.md), ADR-0021), dùng ở hơn 80 chỗ trong tài liệu và mã. Hai trụ cột "liên tục" cạnh nhau là chỗ dễ lẫn nhất.

| Phương án | Ghi chú |
|---|---|
| A. `R-DOC-CONT-0..9` | Đọc ra "liên tục **chứng từ**", tách khỏi `R-CONT` (liên tục **kế toán**); grep 2026-11-22: chưa dùng ở đâu ngoài phase này |
| B. `R-CONT-*` dùng chung | **Không được** — trùng mã trụ cột III |
| C. `R-CHAIN-*` | Rõ nghĩa "chuỗi", không trùng, nhưng lệch tên trụ cột "Document Continuity" trong đề bài |

**Đề xuất: A.** Ghi ranh giới ở CANON §0.14 và đầu `RULE-DOCUMENT-CONTINUITY.md`: trụ cột III (`R-CONT`) lo **con số** đi ngược về nghiệp vụ gốc (giá vốn, sổ chi tiết = sổ cái); trụ cột X (`R-DOC-CONT`) lo **chứng từ** nối nhau, qua vòng đời và có hợp đồng. X là đầu vào của III, không lặp luật của III. Thêm một dòng phân biệt tiền tố: `STD-DOC` = chuẩn dữ liệu, `R-DOC-CONT` = luật nghiệp vụ, `DOC-nnn` = dòng ma trận, `SC-DOC` = kiểm tài liệu.

## Q040-3 — CI: mở khoá thanh toán hay dựng runner tự quản?

**Bối cảnh.** Repo **công khai** và chỉ dùng runner `ubuntu-latest`. Với repo công khai, phút chạy trên runner GitHub cấp **miễn phí, không trừ hạn mức**. Lỗi "account is locked due to a billing issue" vì vậy không phải hết phút, mà là **tài khoản đang bị khoá thanh toán** (thường là hoá đơn cũ chưa trả được / thẻ bị từ chối / thiếu thông tin thanh toán). Khoá này chặn cả repo công khai.

| Phương án | Chi phí | Rủi ro |
|---|---|---|
| A. **Gỡ khoá thanh toán**: Settings → Billing and plans → trả hoá đơn treo hoặc cập nhật thẻ; đặt giới hạn chi tiêu (spending limit) Actions = 0 USD | ≈ 0 đồng mỗi tháng sau khi gỡ (repo công khai) | Thấp. Giới hạn 0 USD bảo đảm không phát sinh tiền |
| B. Runner tự quản (self-hosted) | Máy + điện + người bảo trì | **Cao với repo công khai**: PR từ fork chạy mã bất kỳ trên máy nhà; GitHub khuyến cáo không dùng self-hosted cho repo public. Vẫn cần tài khoản không bị khoá để điều phối job |
| C. Chuyển repo sang tổ chức (organization) mới | Thời gian chuyển, đổi URL | Không giải quyết nếu khoá theo người dùng; chỉ là đường vòng |
| D. Không dùng GitHub Actions — chạy `kiem-chuan.sh` trên máy, dán bằng chứng | 0 | Phụ thuộc kỷ luật; đây chính là chế độ tạm D040-8, không nên là chế độ lâu dài |

**Đề xuất: A**, làm ngay (khoảng 10 phút, chỉ chủ tài khoản làm được). Trong lúc chờ: D (khối *Bằng chứng chạy máy* ở S040-8). Không chọn B khi repo còn công khai. Sau khi gỡ khoá: chạy lại một workflow để xác nhận, rồi ghi SHA lượt chạy đầu tiên thành công vào nhật ký [40](40-MASTER-CHECKLIST.md).

## Q040-4 — Bảo vệ `main`

**Bối cảnh — điểm làm đổi đề xuất ban đầu.** Cả 30 PR merge gần nhất đều **do tài khoản chủ dự án mở** (người khác viết commit, chủ dự án mở PR và merge). GitHub **không cho người mở PR tự duyệt PR của mình**. Nếu bật "bắt buộc 1 người duyệt" ngay mà không đổi cách làm thì mọi PR của chủ dự án đều kẹt, hoặc chủ dự án phải dùng quyền admin vượt luật — khi đó luật không còn ý nghĩa.

| Phương án | Được | Mất |
|---|---|---|
| A. Bắt buộc PR + 1 duyệt, ngay | Đúng chuẩn | Kẹt như trên, trừ khi người khác (Thuy2k, H-Joyy) duyệt kịp mỗi ngày |
| B. **Ruleset bậc 1 ngay**: cấm push thẳng, cấm force-push, cấm xoá `main`, bắt buộc qua PR, 0 duyệt bắt buộc; CODEOWNERS theo vùng để **tự gắn người rà**; chủ dự án trong danh sách vượt (bypass) chỉ "qua PR" | Không kẹt; mọi thay đổi có PR và có dấu vết; người rà đúng vùng được gọi tự động | Chưa ép buộc duyệt |
| C. Không bật gì, chờ CI | Không đổi thói quen | Giữ nguyên rủi ro force-push / push thẳng `main` |

**Đề xuất: B ngay, rồi lên bậc theo mốc:**

| Bậc | Khi nào | Bật thêm |
|---|---|---|
| 1 | Ngay (2026-11) | Cấm push thẳng / force-push / xoá; bắt buộc PR; CODEOWNERS: mua hàng · kho · giá vốn · MDG → @Thuy2k, bán hàng · BH12 → @H-Joyy, còn lại → chủ dự án |
| 2 | Sau Q040-3 (CI chạy được) | Check bắt buộc: `kiem-chuan`, conformance |
| 3 | Khi có ≥ 2 người rà hoạt động đều | Bắt buộc 1 duyệt **từ CODEOWNERS** của vùng bị sửa; PR do chủ dự án mở được người vùng đó duyệt |

Kèm theo: người đóng góp tự mở PR từ nhánh của mình (đã có quyền ghi), để GitHub ghi đúng tác giả PR — điều này cũng cần cho Q040-5.

## Q040-5 — Điểm người đóng góp hiện cho ai xem?

**Bối cảnh.** Repo công khai, nên **mọi tệp trong repo ai cũng đọc được**, kể cả `docs/reviews/`. "Không công khai" vì vậy không thể đạt bằng cách để tệp trong repo. Ngoài ra, tác giả PR không dùng được làm cơ sở chấm (cả 30 PR cùng một người mở); phải chấm theo tác giả commit, và một người đang có tới 2–3 danh tính.

| Phương án | Ghi chú |
|---|---|
| A. Điểm cá nhân trong repo | Công khai cho cả thế giới — không hợp với điểm cá nhân |
| B. **Trong repo chỉ có điểm theo PR và theo trụ cột** (không xếp hạng người); điểm theo người sinh ra **cục bộ** bằng `cham-pr.mjs --nguoi`, không commit (thêm vào `.gitignore`) | Chủ dự án xem, gửi riêng từng người |
| C. Repo riêng tư thứ hai chỉ để chứa điểm | Thêm chỗ quản lý; chỉ đáng làm khi đội lớn hơn |

**Đề xuất: B.** Thêm vào S040-6: cờ `--nguoi` chỉ in ra màn hình hoặc `docs/reviews/tien-do/.local/` (bị bỏ qua khi commit). `.mailmap` (S040-9) gộp danh tính — chỉ ghi tên ↔ email đã có sẵn trong lịch sử git, không thêm thông tin mới.

## Q040-6 — Chỗ để bảng tiến độ PR

**Bối cảnh.** `docs/reviews/` đã có `review-board.json`, `BANG-DIEM.md` (review định kỳ 12 trục). Tiến độ theo PR là chuỗi dày (mỗi PR một tệp), review định kỳ là chuỗi thưa.

| Phương án | Ghi chú |
|---|---|
| A. **`docs/reviews/tien-do/PR-<n>.json` + `docs/reviews/TIEN-DO-PR.md`** | Cạnh review định kỳ; R2 (S040-19) đọc thẳng từ đó |
| B. `docs/phases/PHASE-040-…/tien-do/` | Gắn chặt vào một phase, nhưng tiến độ còn sống sau khi phase đóng |
| C. Chỉ ghi vào CHANGELOG | Không máy đọc được |

**Đề xuất: A**, kèm giới hạn: mỗi tệp `PR-<n>.json` ≤ 4 KB; `TIEN-DO-PR.md` chỉ giữ 50 PR gần nhất, phần cũ hơn gom theo tháng — để thư mục không phình ra theo số PR.

## Tóm tắt đề xuất

| Câu | Đề xuất | Ai làm | Đổi so với mặc định ở README? |
|---|---|---|---|
| Q040-1 | Nhắc; kế toán trưởng bật chặn, có tuỳ chọn ngưỡng tiền | Nhóm, @Thuy2k | Thêm tuỳ chọn ngưỡng |
| Q040-2 | `R-DOC-CONT` (vì `R-CONT` đã là trụ cột III) + ranh giới III ↔ X ở CANON | Nhóm | Thêm ranh giới III ↔ X |
| Q040-3 | Gỡ khoá thanh toán, giới hạn chi 0 USD; không self-hosted khi repo công khai | **Chủ tài khoản** | Có đề xuất cụ thể |
| Q040-4 | Ruleset bậc 1 ngay (bắt buộc PR, chưa bắt buộc duyệt), lên bậc 2–3 theo mốc | **Chủ tài khoản** | **Có** — bỏ "1 duyệt ngay" vì 30/30 PR do chủ dự án mở |
| Q040-5 | Trong repo chỉ điểm theo PR / trụ cột; điểm người sinh cục bộ | Nhóm | **Có** — repo công khai |
| Q040-6 | `docs/reviews/tien-do/`, có giới hạn kích thước | Nhóm | Thêm giới hạn |
