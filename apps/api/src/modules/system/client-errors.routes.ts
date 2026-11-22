// @bizcity-layer P module-sdk
// [2026-11-22 04:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — B4b (S038-13, D038-5, R-LOG-10): POST /api/v1/system/client-errors — lỗi giao diện về logs/web-client/<ngày>.log
/**
 * (B6, D038-7: tệp là logs/web-client/<YYYY-MM-DD>.log, giữ 30 ngày.)
 * Trình duyệt gửi lỗi lập trình của giao diện (ErrorBoundary theo màn, window.onerror, unhandledrejection — apps/web/src/lib/baoLoiTrinhDuyet.ts).
 *
 * Công khai (lỗi ở trang đăng nhập cũng cần về): không có quyền đọc gì, chỉ ghi một dòng đã che. Chống lạm dụng:
 *   - khuôn chặt (zod, độ dài từng trường), thân ≤ 8 KB;
 *   - che lại ở máy chủ (không tin bên gửi): cheThongBao, khungCuaWeb, lamSachDuongDan (@ketoan/contracts loi-trinh-duyet.ts);
 *   - giới hạn 10 lỗi / phút theo địa chỉ + phiên, trần chung 120 dòng / phút (bảo vệ đĩa; thư mục web-client/ ≤ 15 MB, 30 ngày).
 * Lưu ý: phía sau nginx req.ip là địa chỉ của cổng vào (app chưa bật trustProxy — như giới hạn đăng nhập), nên phiên (`sid`, ngẫu
 * nhiên mỗi tab) là phần phân biệt chính; trần chung chặn trường hợp xấu nhất.
 */
import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { cheThongBao, GIOI_HAN_LOI_TRINH_DUYET as G, khungCuaWeb, lamSachDuongDan } from '@ketoan/contracts';
import { ghiLoiTrinhDuyet } from '@bizcity/platform/core/logger';
import { Errors } from '../../core/errors.js';
import { ok } from '../../core/http.js';

const MOT_PHUT = 60_000;
const TRAN_CHUNG = 120;
const nhip = new Map<string, number[]>();
let chung: number[] = [];

/** true = còn được ghi. Dọn mốc cũ hơn một phút; giữ Map nhỏ. */
function conLuot(key: string, now = Date.now()): boolean {
  chung = chung.filter((t) => now - t < MOT_PHUT);
  const ds = (nhip.get(key) ?? []).filter((t) => now - t < MOT_PHUT);
  if (ds.length >= G.moiPhut || chung.length >= TRAN_CHUNG) { nhip.set(key, ds); return false; }
  ds.push(now); chung.push(now); nhip.set(key, ds);
  if (nhip.size > 5_000) for (const [k, v] of nhip) if (!v.some((t) => now - t < MOT_PHUT)) nhip.delete(k);
  return true;
}

/** Chỉ để test: xoá bộ đếm. */
export function _datLaiNhipLoiTrinhDuyet(): void { nhip.clear(); chung = []; }

/** errFp của lỗi giao diện: loại + khung (tệp đã băm theo bản dựng → bản mới = dấu mới, đúng nghĩa "lỗi mới"). */
function errFpWeb(type: string, frames: string[], message: string): string {
  const basis = frames.length ? frames.join(',') : message.replace(/\d+/g, 'N');
  return createHash('sha1').update(`web|${type}|${basis}`).digest('hex').slice(0, 12);
}

const body = z.object({
  kind: z.enum(['render', 'error', 'promise']),
  type: z.string().min(1).max(G.loai),
  message: z.string().max(2_000),
  frames: z.array(z.string().max(500)).max(20).default([]),
  screen: z.string().max(500).default('/'),
  cid: z.string().regex(/^[0-9a-f]{8,32}$/),
  sid: z.string().regex(/^[0-9a-f]{8,32}$/),
}).strict();

export async function clientErrorsRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  // @bizcity-route: nhật ký lỗi kỹ thuật của giao diện — không phải thao tác nghiệp vụ, không đọc dữ liệu
  r.post('/api/v1/system/client-errors', {
    config: { public: true },
    bodyLimit: 8 * 1024,
    schema: {
      tags: ['Hệ thống'], security: [],
      summary: 'Giao diện báo lỗi lập trình (render, lỗi không bắt) — một dòng vào logs/web-client/<ngày>.log; không dữ liệu nhập; 10 lỗi / phút / phiên',
      body,
    },
    handler: async (req) => {
      const b = req.body;
      if (!conLuot(`${req.ip}|${b.sid}`)) throw Errors.rateLimited('Giao diện gửi quá nhiều báo lỗi — đã ghi đủ, các lỗi lặp lại bị bỏ qua trong một phút');
      const message = cheThongBao(b.message);
      // khung: lọc lại theo đúng khuôn của mã web (bỏ mọi thứ khác bên gửi đưa vào)
      const frames = khungCuaWeb(b.frames.map((f) => ` at /${f.replace(/^\/+/, '')}`).join('\n'));
      const errFp = errFpWeb(b.type, frames, message);
      const fields = { evt: 'bizcity.web.client_error', errFp, kind: b.kind, type: b.type, message, frames, screen: lamSachDuongDan(b.screen).slice(0, G.man), cid: b.cid };
      ghiLoiTrinhDuyet(fields);
      // stdout / logs/api/<ngày>.log (≥ warn) một dòng ngắn — Loki thấy khi bật bộ giám sát; chi tiết ở logs/web-client/<ngày>.log
      req.log.warn({ evt: fields.evt, errFp, kind: b.kind, type: b.type, screen: fields.screen, cid: b.cid }, 'Lỗi giao diện');
      return ok({ errFp });
    },
  });
}
