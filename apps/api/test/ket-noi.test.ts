// [2026-11-22 03:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — B4 (S038-9): nhận ra mất kết nối máy chủ, lịch thử lại giãn dần, một lần ghi khay, nối lại thì tắt
/**
 * Giao diện khi cổng vào không gọi được api (PHASE-038 README §4.5). Logic ở @ketoan/contracts (ket-noi.ts); web
 * (apps/web/src/lib/ketNoi.ts) chỉ nối fetch / đồng hồ / sự kiện thật vào taoKhoKetNoi. Kiểm:
 *   - lỗi nào là "mất kết nối", lỗi nào không (504 báo cáo chạy lâu, 5xx JSON của api, lỗi nghiệp vụ);
 *   - thử lại 5 → 10 → 20 → 40 → 60 giây, không nhanh hơn;
 *   - mat() chỉ trả true lần đầu (khay Mã tra cứu ghi một lần cho N lời gọi hỏng);
 *   - thử được thì tắt, phát sự kiện nối lại; lời gọi thành công bất kỳ cũng tắt.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHU_MAT_KET_NOI, choThuLai, ERROR_CATALOG, laMatKetNoi, MA_MAT_KET_NOI, taoKhoKetNoi } from '@ketoan/contracts';

describe('laMatKetNoi', () => {
  it.each([
    [{ status: 503, json: true, code: 'GATEWAY_UNAVAILABLE' }, true],
    [{ status: 502, json: false }, true],
    [{ status: 503, json: false }, true],
    [{ status: 0, json: false }, true],
    [{ status: 504, json: false }, false], // báo cáo chạy quá giờ, api vẫn sống — api.ts có câu riêng
    [{ status: 503, json: true, code: 'NOT_READY' }, false], // api vẫn trả lời
    [{ status: 500, json: true, code: 'INTERNAL_ERROR' }, false],
    [{ status: 500, json: false }, false],
    [{ status: 409, json: true, code: 'PERIOD_LOCKED' }, false],
  ])('%j → %s', (r, ky) => { expect(laMatKetNoi(r)).toBe(ky); });

  it('mã khớp danh mục; chữ cho kế toán không mã kỹ thuật trên dòng chính, có hướng dẫn gom log', () => {
    expect(ERROR_CATALOG[MA_MAT_KET_NOI].message).toBe(CHU_MAT_KET_NOI.tieuDe);
    expect(CHU_MAT_KET_NOI.tieuDe + CHU_MAT_KET_NOI.moTa).not.toMatch(/GATEWAY|5\d\d|nginx|api\b/i);
    expect(CHU_MAT_KET_NOI.keoDai).toContain('lay-log.sh');
  });
});

describe('choThuLai', () => {
  it('5 → 10 → 20 → 40 → 60 giây rồi giữ 60', () => {
    expect([1, 2, 3, 4, 5, 6, 10, 0].map(choThuLai)).toEqual([5_000, 10_000, 20_000, 40_000, 60_000, 60_000, 60_000, 5_000]);
  });
});

describe('taoKhoKetNoi — kho của web (apps/web/src/lib/ketNoi.ts nối fetch / đồng hồ thật)', () => {
  let goi: number;
  let traLoi: () => Promise<boolean>;
  let daNoi: number;
  const tao = () => taoKhoKetNoi({
    thuSucKhoe: () => { goi++; return traLoi(); },
    henGio: (fn, ms) => setTimeout(fn, ms),
    boHen: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    phatNoiLai: () => { daNoi++; },
    bayGio: () => Date.now(),
  });

  beforeEach(() => { vi.useFakeTimers(); goi = 0; daNoi = 0; traLoi = async () => false; });
  afterEach(() => { vi.useRealTimers(); });

  it('mat() lần đầu true, các lần sau false (một mục khay cho N lời gọi hỏng)', () => {
    const k = tao();
    expect([k.mat('rid-1'), k.mat('rid-2'), k.mat('rid-3')]).toEqual([true, false, false]);
    expect(k.trangThai()).toMatchObject({ mat: true, lan: 1, requestId: 'rid-1' });
    expect(k.dangMat()).toBe(true);
  });

  it('trangThai() giữ cùng đối tượng khi không đổi (useSyncExternalStore không vẽ lại vô ích)', () => {
    const k = tao();
    expect(k.trangThai()).toBe(k.trangThai());
    let bao = 0; const bo = k.nghe(() => { bao++; });
    k.mat(); expect(bao).toBe(1); bo(); k.daNoi(); expect(bao).toBe(1);
  });

  it('thử lại giãn dần, không nhanh hơn lịch; máy chủ trả lời thì tắt và báo nối lại', async () => {
    const k = tao();
    k.mat('rid-1');
    await vi.advanceTimersByTimeAsync(4_999);
    expect(goi).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(goi).toBe(1); // lần 1 sau 5 giây
    await vi.advanceTimersByTimeAsync(9_999);
    expect(goi).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(goi).toBe(2); // lần 2 sau thêm 10 giây
    expect(k.trangThai().lan).toBe(3);

    traLoi = async () => true;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(goi).toBe(3);
    expect(k.trangThai()).toMatchObject({ mat: false, lan: 0 });
    expect(daNoi).toBe(1);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(goi).toBe(3); // nối rồi thì thôi thử
  });

  it('lời gọi thành công bất kỳ (daNoi từ api.ts) tắt, dừng lịch; khi đang nối thì không làm gì', async () => {
    const k = tao();
    k.daNoi();
    expect(daNoi).toBe(0);
    k.mat();
    k.daNoi();
    expect(k.dangMat()).toBe(false);
    expect(daNoi).toBe(1);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(goi).toBe(0);
  });

  it('Thử lại ngay: thử một lần; mạng hỏng hẳn (ném lỗi) không làm vỡ, vẫn đang mất', async () => {
    const k = tao();
    traLoi = async () => { throw new TypeError('Failed to fetch'); };
    k.mat();
    expect(await k.thuNgay()).toBe(false);
    expect(k.trangThai()).toMatchObject({ mat: true, dangThu: false });
    traLoi = async () => true;
    expect(await k.thuNgay()).toBe(true);
    expect(k.dangMat()).toBe(false);
  });
});
