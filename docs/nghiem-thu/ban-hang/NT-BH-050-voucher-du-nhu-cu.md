# NT-BH-050 · Voucher đủ như chính sách voucher cũ: giảm % có trần, lô mã không SĐT, mỗi khách tối đa, cửa hàng, trả một phần
<!-- [2026-11-27 09:00 AM Võ Hoàng] NGHIEM-THU — tạo và chốt phiếu NT-BH-050 (Hoàng giao 27/11) (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng — module `voucher` (BH21); máy bán React dùng voucher |
| Màn hình | BH21 Voucher (`/app/voucher`); máy bán: khung Voucher của khách |
| Bộ phận yêu cầu | Bán hàng (chuyển cài đặt voucher hẳn sang kế toán — kế hoạch 80 S-CD-12) |
| Ngày tạo | 27/11/2026 |
| Trạng thái | **Đã chốt 27/11/2026** — Hoàng giao: "lấy y nguyên từ phần mềm cũ về chức năng… cứ code đi, có gì chưa rõ hỏi sau"; mặc định đã áp ở §2 |
| Trụ cột / tiêu chí | không đổi mức (mở rộng module đã có) |

## 1. Mục đích quản trị
Mọi cài đặt voucher khai ở kế toán, không kém loại "Voucher / Mã giảm giá" (loại 10) của plugin chính sách cũ: phát mã giảm **%** có **giảm tối đa**, phát **mã hàng loạt** (tiền tố + số lượng, in trên bill / phát tay, không cần SĐT), giới hạn **mỗi khách dùng tối đa N lần**, giới hạn **cửa hàng**. Trả hàng một phần không để khách giữ voucher "lần mua sau" khi đơn còn lại không đủ điều kiện.

## 2. Khai báo trước, mặc định đã áp
| # | Nội dung | Căn cứ |
|---|---|---|
| D1 | **Giảm %** (`discountType = percent`): % × tiền áp dụng — tổng đơn sau khuyến mại (tương đương tiền) hoặc tiền các dòng áp dụng (lần mua sau); **làm tròn đồng nửa xa số 0** (roundMoney, máy bán cùng cách); tối đa **Giảm tối đa** (trống = không trần, màn nhắc). Máy bán / BH10 không đổi luật trừ: module voucher trả `faceValue` = tiền trừ được của đơn đó | cũ: `discount_type`, `discount_value`, `max_discount` |
| D2 | **Lô mã không gắn SĐT** (nguồn `batch`): tiền tố (chữ không dấu, số, ≤ 12) + 8 ký tự ngẫu nhiên, ≤ 5.000 mã mỗi lần; ai cầm mã cũng dùng. Bán vẫn **phải chọn khách** (luật đơn có voucher của module pos / phieu-ban giữ nguyên) để đếm giới hạn | cũ: `prefix`, `total_qty` |
| D3 | **Mỗi khách tối đa N mã của đợt** (`perCustomer`): đếm mã của đợt đã dùng ở đơn / phiếu khác theo **SĐT khách hoặc mã khách lúc dùng** (+ mã đã chọn trước trong cùng đơn). Quá → `VOUCHER_USED` "mỗi khách tối đa N". Áp cho cả mã gắn SĐT | cũ: `per_customer` |
| D4 | **Cửa hàng áp dụng** (`branchCodes`; trống = mọi cửa hàng). Sai cửa hàng → `VOUCHER_NOT_APPLICABLE` | cũ: phạm vi cửa hàng của chương trình |
| D5 | **Trả một phần** (V5): mã tự phát lưu số lượng đủ điều kiện lúc phát; mỗi phiếu trả cộng số đủ điều kiện đã trả; còn dưới số lượng tối thiểu của đợt → **thu hồi** mã chưa dùng (nhật ký "Trả hàng đơn gốc"). Mã phát trước bản này (không có số lúc phát) giữ luật cũ: chỉ trả hết mới thu hồi | kế hoạch 80 V5 |
| D6 | **Mã chung cho mọi khách** (V3) vẫn khai ở **Khuyến mại BH18** (giảm tổng đơn kèm mã) — màn Voucher ghi rõ | Q-CD-6 |
| D7 | **Voucher đổi điểm** (V4) vẫn ở **Tích điểm** (module `loyalty`) — module này không đổi | NT-BH-020 |
| D8 | Đợt đã phát mã: không đổi kiểu giảm, %, trần, mệnh giá, đơn tối thiểu, phạm vi; **được** đổi tên, hạn, cửa hàng, mỗi khách tối đa, điều kiện tự phát, ngừng / mở | ECP-13 |
| D9 | Không thêm mã lỗi lõi: dùng lại `VOUCHER_USED` (quá lượt mỗi khách), `VOUCHER_NOT_APPLICABLE` (sai cửa hàng) | — |

## 3. Các bước thao tác
1. BH21 → Thêm đợt → Loại giảm **Giảm %**, Giảm (%) `10`, Giảm tối đa `20.000`; Mỗi khách tối đa (để trống) → Lưu.
2. Mở đợt → Phát mã: Nạp mã có sẵn cho SĐT khách A.
3. Thêm đợt "Hè 50K" mệnh giá 50.000, **Mỗi khách tối đa 1** → mở đợt → **Sinh lô mã không gắn SĐT**, tiền tố `HE`, số lượng `20` → Phát → Xuất Excel danh sách mã.
4. Máy bán: khách A mua 3 × 100.000 → nhập mã % → trừ 20.000. Khách A dùng mã lô thứ nhất → được; mã lô thứ hai → bị chặn; khách B dùng mã lô thứ hai → được.
5. Đợt "Lần mua sau Biomil" tự phát khi mua ≥ 2; khách mua 3 → bill in mã; trả 1 → mã còn; trả thêm 1 → mã thu hồi.

## 4. Số liệu đầu vào
| Đợt | Kiểu | Giá trị | Mỗi khách | Cửa hàng |
|---|---|---|---|---|
| PCT10 | Giảm % | 10%, tối đa 20.000 | — | mọi |
| HE50K | Tiền, lô 20 mã `HE…` | 50.000 | 1 | mọi |
| CN02ONLY | Tiền | 10.000 | — | CN02 |
| BIO-NEXT | Lần mua sau Biomil, tự phát ≥ 2 | 30.000 | — | mọi |

## 5. Kết quả mong đợi
| Mục | Mong đợi |
|---|---|
| Đơn 300.000 + mã PCT10 | trừ **20.000** (10% = 30.000 > trần); tổng 280.000 |
| Đơn 100.000 + mã PCT10 | trừ **10.000** |
| Danh sách voucher của khách (máy bán) | "Giảm 10%, tối đa 20.000đ" |
| Lô HE50K | 20 mã khác nhau dạng `HE` + 8 ký tự, cột SĐT "Không gắn SĐT" |
| Khách A dùng mã lô thứ 2 | chặn: "Khách đã dùng 1 voucher của đợt … — mỗi khách tối đa 1" |
| Khách B dùng mã lô thứ 2 | được; cột "Khách đã dùng" = SĐT B |
| Mã CN02ONLY ở CN01 | chặn: chỉ dùng ở cửa hàng CN02 |
| Mua 3 Biomil, trả 1 | mã còn (còn 2 ≥ 2) |
| Trả thêm 1 | mã **thu hồi** "Trả một phần đơn gốc …" |

**Bút toán:** như NT-BH-026 — voucher TGS = chiết khấu trên dòng (giảm doanh thu + thuế), voucher hãng = dòng thanh toán theo hình thức kế toán khai. Voucher % chỉ đổi số tiền trừ.

**Sai số làm tròn chấp nhận:** 0đ (cùng cách làm tròn ở máy bán và máy chủ).

## 6. Trường hợp lệch chuẩn
| # | Làm thế này | Phần mềm phải |
|---|---|---|
| 1 | Giảm % mà không nhập % (hoặc > 100) | chặn khi Lưu |
| 2 | Đổi % / trần của đợt đã phát mã | chặn (409), chỉ đổi tên / hạn / cửa hàng / mỗi khách / tự phát |
| 3 | Tiền tố có dấu ("HÈ") | chặn khi sinh lô |
| 4 | Hai mã lô cùng đợt (giới hạn 1) trong một đơn | chặn mã thứ hai |
| 5 | Dùng lại mã ở chính đơn đó (gửi lại / duyệt lại) | không tính là quá lượt |
| 6 | Giao lại sự kiện phiếu trả | không cộng số trả hai lần |

## 7. Kết quả chạy
| | |
|---|---|
| Ngày chạy | 27/11/2026 (máy local) |
| Bản code (commit) | nhánh `feat/nt-bh-050-voucher-du-nhu-cu`; máy bán `feat/voucher-phan-tram` (open-pos) |
| Test tự động | `apps/api/test/nt-bh-050-voucher-du-nhu-cu.test.ts`; `modules/voucher/test/voucher.test.ts`; open-pos `react/src/features/voucher/shopVoucher.test.ts` |
| Tiêu chí lên mức | không đổi mức |

## 8. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 9. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 27/11/2026 | Tạo, chốt theo giao việc của Hoàng; mặc định D1–D9 |
