// @bizcity-layer D modules/mua-hang
// [2026-11-23 11:20 AM Nguyễn Văn Thủy] MH22 — cầu nối hoá đơn: khoá thuộc công ty nào, tình trạng cầu nối báo về, nhắc khi mất liên lạc (đóng góp)
/**
 * CẦU NỐI HOÁ ĐƠN: chương trình trên máy Windows đọc hoá đơn tool tải về, đẩy lên đây qua /invoices/ingest-xml.
 *   whoami     khoá API này thuộc đơn vị nào (MST) — cầu nối so với công ty đang gắn, không đẩy nhầm công ty
 *   heartbeat  sau mỗi lượt cầu nối báo: máy nào, công ty nào, chạy lúc nào, lần tới, đang chạy hay tạm ngừng, số tờ
 *   status     MH22 hiện tình trạng mới nhất theo máy × công ty × kết nối; quá 1 ngày không báo = mất liên lạc
 * Tình trạng là nhật ký vận hành: ghi JSONL (run-log), không tạo bảng.
 */
import { z } from 'zod';
import { appendRunLog, readRunLog } from '@bizcity/platform/core/run-log';
import type { Db } from '../../db/client.js';

export const BRIDGE_STREAM = 'cau-noi-hoa-don';
/** Quá chừng này giờ không báo về (mà không tạm ngừng) thì coi là mất liên lạc. */
export const BRIDGE_STALE_HOURS = 24;

const count = z.number().int().min(0).max(10_000_000);
const iso = z.string().datetime({ offset: true });
export const heartbeatSchema = z.object({
  machine: z.string().trim().min(1).max(100).describe('Tên máy chạy cầu nối'),
  version: z.string().trim().max(20).default(''),
  companyTaxCode: z.string().trim().min(1).max(20).describe('MST công ty trong tool tải hoá đơn'),
  companyName: z.string().trim().max(300).default(''),
  connection: z.string().trim().max(100).default('').describe('Tên kết nối trong cầu nối, vd Bản test'),
  status: z.enum(['running', 'paused']).describe('running: lịch đang chạy cho kết nối này; paused: tạm ngừng (cả cầu nối, công ty hoặc kết nối)'),
  pausedBy: z.enum(['', 'all', 'company', 'connection']).default(''),
  message: z.string().trim().max(500).default(''),
  lastRunAt: iso,
  nextRunAt: iso.nullable().default(null),
  intervalMinutes: z.number().int().min(1).max(1440).nullable().default(null),
  counts: z.object({ saved: count, duplicate: count, errors: count, pending: count, notDownloaded: count, onErp: count }).partial().default({}),
});
export type Heartbeat = z.infer<typeof heartbeatSchema>;
export interface BridgeState extends Heartbeat { keyName: string; receivedAt: string; ageHours: number; stale: boolean }

export async function whoami(trx: Db, tenantId: string, keyName: string) {
  const t = await trx.selectFrom('tenants').select(['code', 'name', 'tax_code']).where('id', '=', tenantId).executeTakeFirst();
  return { tenantCode: t?.code ?? '', tenantName: t?.name ?? '', taxCode: t?.tax_code ?? '', keyName };
}

export async function recordHeartbeat(tenantId: string, keyName: string, input: Heartbeat) {
  await appendRunLog(BRIDGE_STREAM, tenantId, { ...input, keyName });
  return { ok: true };
}

/** Tình trạng mới nhất của từng máy × công ty × kết nối trong 35 ngày. */
export async function bridgeStatus(tenantId: string, now = new Date()): Promise<BridgeState[]> {
  const rows = await readRunLog<Heartbeat & { keyName?: string }>(BRIDGE_STREAM, { tenantId, since: new Date(now.getTime() - 35 * 86_400_000) });
  const last = new Map<string, BridgeState>();
  for (const r of rows) {
    const d = r.data;
    const ageHours = Math.round(((now.getTime() - Date.parse(d.lastRunAt)) / 3_600_000) * 10) / 10;
    last.set(`${d.machine}|${d.companyTaxCode}|${d.connection}`, { ...d, keyName: d.keyName ?? '', receivedAt: r.at, ageHours, stale: d.status !== 'paused' && ageHours > BRIDGE_STALE_HOURS });
  }
  return [...last.values()].sort((a, b) => Date.parse(b.lastRunAt) - Date.parse(a.lastRunAt));
}
