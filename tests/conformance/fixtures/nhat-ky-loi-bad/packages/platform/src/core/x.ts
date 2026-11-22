// Repo mẫu SC-LOG-1, SC-LOG-2 (PHASE-038 B5): mỗi dòng dưới cố ý sai một luật, trừ hai chỗ có chú thích nuot-loi.
declare const log: { error(o: object, m: string): void };
export async function f(e: unknown): Promise<void> {
  log.error({ err: String(e) }, 'mất stack');
  console.log('in ra stdout trong mã chạy');
  await Promise.resolve().catch(() => undefined);
  try { JSON.parse('x'); } catch {}
  // nuot-loi: có lý do — không bị báo
  await Promise.resolve().catch(() => null);
  try { JSON.parse('y'); } catch { /* nuot-loi: dòng hỏng — không bị báo */ }
}
