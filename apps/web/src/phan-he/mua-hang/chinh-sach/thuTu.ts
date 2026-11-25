// [2026-11-25 Nguyễn Văn Thủy] #29 tab Test: hiện "Thứ tự áp" (1 = áp trước) thay cho số ưu tiên "số lớn thắng" — cách tính giữ nguyên (đóng góp)
/**
 * Máy chủ / bộ máy vẫn dùng `priority` (số lớn thắng). Giao diện đổi qua lại:
 *   thứ tự 1 ↔ priority 99, thứ tự 2 ↔ 98 … thứ tự 99 ↔ 1; trống ↔ priority 0 (không xếp — áp sau cùng).
 * Priority cũ ngoài khoảng 1..99 (vd âm, ≥ 100) vẫn giữ nguyên khi không sửa ô.
 */
export const MAX_THU_TU = 99;
/** Thứ tự áp hiện trên giao diện; null = không xếp (priority 0 hoặc trống). */
export function thuTuOf(priority: number | null | undefined): number | null {
  if (priority === null || priority === undefined || priority === 0) return null;
  if (priority >= 100) return 1;
  if (priority < 0) return MAX_THU_TU;
  return 100 - priority;
}
/** Priority lưu xuống từ thứ tự người dùng gõ; null / 0 / trống = 0 (không xếp). */
export function priorityOf(thuTu: number | null | undefined): number {
  if (!thuTu || thuTu < 1) return 0;
  return 100 - Math.min(MAX_THU_TU, Math.round(thuTu));
}
/** Đọc ô thứ tự (số nguyên dương); trống / sai = null. */
export function docThuTu(v: unknown): number | null {
  const t = String(v ?? '').trim();
  return /^\d+$/.test(t) && Number(t) > 0 ? Number(t) : null;
}
/** "thứ tự 1", "không xếp". */
export const thuTuText = (priority: number | null | undefined) => { const t = thuTuOf(priority); return t === null ? 'không xếp thứ tự' : `thứ tự ${t}`; };
