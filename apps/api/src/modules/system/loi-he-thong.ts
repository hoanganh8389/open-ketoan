// @bizcity-layer P module-sdk
// [2026-11-25 Nguyễn Văn Thủy] LỖI HỆ THỐNG (HT20) — máy quét đọc Loki mỗi 60 giây, gom lỗi giống nhau thành mục, chia phân hệ, phân loại
// (lỗi phần mềm / từ chối), lưu JSONL; màn HT20 + khoá kết nối cho lịch tự sửa và cron dựng lại. Thiết kế: docs/ops/TU-DONG-SUA-LOI.md (đóng góp)
/**
 *   GET  /api/v1/system/loi                 danh sách mục lỗi (đăng nhập)          POST /api/v1/system/loi/trang-thai | /quet | /tu-sua | /dung-lai
 *   GET  /api/v1/ket-noi/loi                (khoá kết nối x-ket-noi-key)           POST /api/v1/ket-noi/loi/trang-thai | /dung-lai/yeu-cau
 *   GET  /api/v1/ket-noi/dung-lai           (cron máy chủ) yêu cầu dựng lại chờ    POST /api/v1/ket-noi/dung-lai  kết quả dựng lại
 * Lưu: <DATA_DIR>/he-thong/loi/<đơn vị>.jsonl — sự kiện gap (một lần lỗi), trang_thai, dung_lai_yc / dung_lai_nhan / dung_lai_kq.
 */
import { createHash, randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import { db } from '@bizcity/platform/db/client';
import { authOf, requireAuthenticated, requirePermission } from '@bizcity/platform/core/auth';
import { Errors } from '@bizcity/platform/core/errors';
import { ok } from '@bizcity/platform/core/http';
import { getJson } from './devtools.sources.js';

const tags = ['Lỗi hệ thống'];
const DIR = () => path.resolve(process.env.DATA_DIR ?? './data', 'he-thong', 'loi');
const fileOf = (tenantId: string) => path.join(DIR(), `${String(tenantId).replace(/[^0-9a-zA-Z_-]/g, '')}.jsonl`);

/** Phân hệ theo đường dẫn API (tiền tố dài nhất khớp trước). Sửa ở đây thì sửa cả bảng ở docs/ops/TU-DONG-SUA-LOI.md §2. */
export const PHAN_HE: [string, string][] = [
  ['/api/v1/purchase', 'mua-hang'],
  ['/api/v1/m/phieu-ban', 'ban-hang'], ['/api/v1/m/pos', 'ban-hang'], ['/api/v1/sales', 'ban-hang'],
  ['/api/v1/inventory', 'kho'], ['/api/v1/stock', 'kho'], ['/api/v1/kho', 'kho'], ['/api/v1/warehouses', 'kho'], ['/api/v1/warehouse-types', 'kho'],
  ['/api/v1/catalog', 'danh-muc'], ['/api/v1/products', 'danh-muc'], ['/api/v1/partners', 'danh-muc'], ['/api/v1/partner-groups', 'danh-muc'],
  ['/api/v1/dimensions', 'danh-muc'], ['/api/v1/co-cau', 'danh-muc'], ['/api/v1/branches', 'danh-muc'], ['/api/v1/org-units', 'danh-muc'],
  ['/api/v1/unit', 'danh-muc'], ['/api/v1/item-classes', 'danh-muc'], ['/api/v1/catalog-trash', 'danh-muc'], ['/api/v1/contracts', 'danh-muc'],
  ['/api/v1/accounts', 'ke-toan'], ['/api/v1/vouchers', 'ke-toan'], ['/api/v1/journal', 'ke-toan'], ['/api/v1/closing', 'ke-toan'],
  ['/api/v1/reports', 'ke-toan'], ['/api/v1/posting', 'ke-toan'], ['/api/v1/documents', 'ke-toan'], ['/api/v1/business-documents', 'ke-toan'], ['/api/v1/cost-norms', 'ke-toan'],
  ['/api/v1/cash', 'quy'], ['/api/v1/bank', 'quy'],
  ['/api/v1/assets', 'tai-san'], ['/api/v1/asset-events', 'tai-san'],
  ['/api/v1/tax', 'thue'], ['/api/v1/cit-returns', 'thue'], ['/api/v1/invoice-risks', 'thue'],
];
export const TEN_PHAN_HE: Record<string, string> = {
  'mua-hang': 'Mua hàng', 'ban-hang': 'Bán hàng', kho: 'Kho', 'danh-muc': 'Danh mục', 'ke-toan': 'Kế toán', quy: 'Quỹ / tiền', 'tai-san': 'Tài sản', thue: 'Thuế', 'he-thong': 'Hệ thống',
};
const phanHeOf = (route: string) => [...PHAN_HE].sort((a, b) => b[0].length - a[0].length).find(([p]) => route.startsWith(p))?.[1] ?? 'he-thong';

const TRANG_THAI = ['moi', 'yeu_cau', 'dang_sua', 'da_sua', 'bo_qua'] as const;
type TrangThai = (typeof TRANG_THAI)[number];

type Gap = { t: 'gap'; ts: string; fp: string; phanHe: string; loai: 'phan-mem' | 'tu-choi'; errCode: string; status: number; method: string; route: string; msg: string; reqId: string; traceId?: string; actor?: string };
type Ev = Gap
  | { t: 'trang_thai'; ts: string; fp: string; status: TrangThai; by: string; note?: string; commit?: string }
  | { t: 'dung_lai_yc'; ts: string; id: string; by: string; note?: string }
  | { t: 'dung_lai_nhan'; ts: string; id: string }
  | { t: 'dung_lai_kq'; ts: string; id: string; ok: boolean; log: string; by: string };

let hang: Promise<unknown> = Promise.resolve();
async function ghi(tenantId: string, evs: Ev[]) {
  if (!evs.length) return;
  const run = hang.then(async () => { await mkdir(DIR(), { recursive: true }); await appendFile(fileOf(tenantId), evs.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8'); });
  hang = run.catch(() => undefined); // nuot-loi: hàng đợi chỉ giữ thứ tự; lỗi trả về người gọi qua run
  await run;
}
async function doc(tenantId: string): Promise<Ev[]> {
  let raw = '';
  try { raw = await readFile(fileOf(tenantId), 'utf8'); } catch { return []; }
  const out: Ev[] = [];
  for (const line of raw.split('\n')) { if (!line.trim()) continue; try { out.push(JSON.parse(line) as Ev); } catch { /* nuot-loi: dòng hỏng bỏ qua */ } }
  return out;
}

/** Câu báo bỏ số → gom các lần lỗi chỉ khác số (số phiếu, số tiền…) vào một mục. */
const chuanHoa = (s: string) => s.replace(/\d+([.,]\d+)*/g, '#').replace(/\s+/g, ' ').trim().slice(0, 200);
const vanTay = (g: Pick<Gap, 'phanHe' | 'errCode' | 'method' | 'route' | 'msg'>) => createHash('sha1').update([g.phanHe, g.errCode, g.method, g.route, chuanHoa(g.msg)].join('|')).digest('hex').slice(0, 12);

export interface MucLoi {
  fp: string; phanHe: string; tenPhanHe: string; loai: 'phan-mem' | 'tu-choi'; errCode: string; status: number; method: string; route: string; msg: string;
  count: number; first: string; last: string; lastReqId: string; lastTraceId?: string;
  trangThai: TrangThai | 'tai_phat'; nguoi?: string; ghiChu?: string; commit?: string; doiLuc?: string;
}
function gom(evs: Ev[]) {
  const m = new Map<string, MucLoi>();
  const tt = new Map<string, Extract<Ev, { t: 'trang_thai' }>>();
  let yc: Extract<Ev, { t: 'dung_lai_yc' }> | null = null; let nhan: string | null = null; let kq: Extract<Ev, { t: 'dung_lai_kq' }> | null = null;
  for (const e of evs) {
    if (e.t === 'gap') {
      const x = m.get(e.fp);
      if (!x) m.set(e.fp, { fp: e.fp, phanHe: e.phanHe, tenPhanHe: TEN_PHAN_HE[e.phanHe] ?? e.phanHe, loai: e.loai, errCode: e.errCode, status: e.status, method: e.method, route: e.route, msg: e.msg, count: 1, first: e.ts, last: e.ts, lastReqId: e.reqId, lastTraceId: e.traceId, trangThai: 'moi' });
      else { x.count += 1; if (e.ts >= x.last) { x.last = e.ts; x.lastReqId = e.reqId; x.lastTraceId = e.traceId; x.msg = e.msg; } }
    } else if (e.t === 'trang_thai') tt.set(e.fp, e);
    else if (e.t === 'dung_lai_yc') { yc = e; nhan = null; kq = null; }
    else if (e.t === 'dung_lai_nhan') { if (yc?.id === e.id) nhan = e.ts; }
    else if (e.t === 'dung_lai_kq') { if (yc?.id === e.id) kq = e; }
  }
  for (const [fp, s] of tt) {
    const x = m.get(fp); if (!x) continue;
    x.trangThai = s.status; x.nguoi = s.by; x.ghiChu = s.note; x.commit = s.commit; x.doiLuc = s.ts;
    // Đã sửa / bỏ qua mà lỗi lại xảy ra sau lúc đó → tái phát.
    if ((s.status === 'da_sua') && x.last > s.ts) x.trangThai = 'tai_phat';
  }
  const items = [...m.values()].sort((a, b) => b.last.localeCompare(a.last));
  const dungLai = yc ? { id: yc.id, yeuCauLuc: yc.ts, yeuCauBoi: yc.by, ghiChu: yc.note, nhanLuc: nhan, ketQua: kq ? { ok: kq.ok, luc: kq.ts, log: kq.log } : null } : null;
  return { items, dungLai };
}

/* ------------------------------------------------------------------ máy quét */
const cursorFile = () => path.join(DIR(), 'con-tro.json');
let lanQuet: { luc: string; moi: number; loi?: string } | null = null;
type Stream = { stream: Record<string, string>; values: [string, string][] };

/** Đọc Loki từ con trỏ tới giờ: dòng có mã lỗi hoặc mức error / fatal; gộp hai dòng cùng mã yêu cầu (dòng route + dòng câu báo). */
export async function quetLoi(): Promise<{ moi: number }> {
  let tu: bigint;
  try { tu = BigInt((JSON.parse(await readFile(cursorFile(), 'utf8')) as { ns: string }).ns); } catch { tu = BigInt(Date.now() - 24 * 3600_000) * 1_000_000n; }
  const den = BigInt(Date.now()) * 1_000_000n;
  const lines: { ns: bigint; j: Record<string, unknown>; lbl: Record<string, string> }[] = [];
  for (const q of ['{service="api", errCode=~".+"}', '{service="api", level=~"error|fatal"}']) {
    const { body } = await getJson('loki', '/loki/api/v1/query_range', { query: q, start: String(tu + 1n), end: String(den), limit: '2000', direction: 'forward' });
    for (const s of ((body as { data?: { result?: Stream[] } })?.data?.result ?? [])) for (const [ns, line] of s.values) {
      try { lines.push({ ns: BigInt(ns), j: JSON.parse(line) as Record<string, unknown>, lbl: s.stream }); } catch { /* nuot-loi: dòng không phải JSON */ }
    }
  }
  // Gom theo mã yêu cầu.
  const theoReq = new Map<string, { ns: bigint; tenant: string; route: string; method: string; status: number; errCode: string; msg: string; traceId?: string; actor?: string; level: string }>();
  let max = tu;
  for (const { ns, j, lbl } of lines) {
    if (ns > max) max = ns;
    const req = String(j.reqId ?? ''); if (!req) continue;
    const tenant = String(j.tenant ?? lbl.tenant ?? ''); if (!tenant) continue;
    const x = theoReq.get(req) ?? { ns, tenant, route: '', method: '', status: 0, errCode: '', msg: '', level: '' };
    if (j.route) { x.route = String(j.route); x.method = String(j.method ?? ''); x.status = Number(j.status ?? 0); }
    if (j.errCode) x.errCode = String(j.errCode);
    if (!j.route && j.msg) x.msg = String(j.msg);
    const err = j.err as { message?: string } | undefined;
    if (!x.msg && err?.message) x.msg = String(err.message);
    if (j.traceId) x.traceId = String(j.traceId);
    if (j.actor) x.actor = String(j.actor);
    const lv = Number(j.level ?? 0); if (lv >= 50) x.level = 'error';
    if (ns < x.ns) x.ns = ns;
    theoReq.set(req, x);
  }
  const theoDonVi = new Map<string, Ev[]>();
  for (const [req, x] of theoReq) {
    if (!x.route && !x.errCode && x.level !== 'error') continue;
    const loai: Gap['loai'] = x.status >= 500 || x.level === 'error' || /INTERNAL/.test(x.errCode) ? 'phan-mem' : 'tu-choi';
    const g = { phanHe: phanHeOf(x.route), errCode: x.errCode || (x.status >= 500 ? 'INTERNAL_ERROR' : ''), method: x.method, route: x.route, msg: x.msg || `${x.method} ${x.route} → ${x.status}` };
    const ev: Gap = { t: 'gap', ts: new Date(Number(x.ns / 1_000_000n)).toISOString(), fp: vanTay(g), ...g, loai, status: x.status, reqId: req, traceId: x.traceId, actor: x.actor };
    (theoDonVi.get(x.tenant) ?? theoDonVi.set(x.tenant, []).get(x.tenant)!).push(ev);
  }
  let moi = 0;
  for (const [tenant, evs] of theoDonVi) { evs.sort((a, b) => a.ts.localeCompare(b.ts)); await ghi(tenant, evs); moi += evs.length; }
  await mkdir(DIR(), { recursive: true });
  await writeFile(cursorFile(), JSON.stringify({ ns: String(max) }), 'utf8');
  return { moi };
}

let henGio: NodeJS.Timeout | null = null;
/** Chạy máy quét mỗi 60 giây (không chạy khi test). Loki chưa khai thì lượt quét báo lỗi, không làm hỏng API. */
export function batMayQuet() {
  if (henGio || process.env.NODE_ENV === 'test' || process.env.LOI_QUET === 'off') return;
  const chay = async () => {
    try { const r = await quetLoi(); lanQuet = { luc: new Date().toISOString(), moi: r.moi }; }
    catch (e) { lanQuet = { luc: new Date().toISOString(), moi: 0, loi: (e as Error).message }; }
  };
  setTimeout(() => void chay(), 15_000);
  henGio = setInterval(() => void chay(), 60_000);
  henGio.unref();
}

/* ------------------------------------------------------------------ đọc / ghi chung */
async function tuSuaOf(tenantId: string): Promise<boolean> {
  const r = (await sql<{ v: string | null }>`SELECT settings->'cong_cu'->>'tuSua' AS v FROM tenants WHERE id = ${tenantId}`.execute(db)).rows[0];
  return r?.v === 'true';
}
const locQuery = z.object({ phanHe: z.string().optional(), loai: z.enum(['phan-mem', 'tu-choi']).optional(), status: z.string().optional() });
async function danhSach(tenantId: string, q: z.infer<typeof locQuery>) {
  const { items, dungLai } = gom(await doc(tenantId));
  const loc = items.filter((x) => (!q.phanHe || x.phanHe === q.phanHe) && (!q.loai || x.loai === q.loai) && (!q.status || q.status.split(',').includes(x.trangThai)));
  return { items: loc, tong: items.length, dungLai, tuSua: await tuSuaOf(tenantId), lanQuet, phanHe: TEN_PHAN_HE };
}
const ttInput = z.object({ fp: z.string().regex(/^[0-9a-f]{12}$/), status: z.enum(TRANG_THAI), note: z.string().max(1000).optional(), commit: z.string().max(80).optional() });

/** Khoá kết nối (HT13 → Công cụ & giám sát) → đơn vị. */
async function donViTheoKhoa(req: FastifyRequest): Promise<string> {
  const key = String(req.headers['x-ket-noi-key'] ?? '').trim();
  if (key.length < 20) throw Errors.unauthorized();
  const r = (await sql<{ id: string }>`SELECT id::text AS id FROM tenants WHERE settings->'cong_cu'->>'ketNoiKey' = ${key} LIMIT 1`.execute(db)).rows[0];
  if (!r) throw Errors.unauthorized();
  return r.id;
}

export async function loiHeThongRoutes(app: FastifyInstance): Promise<void> {
  batMayQuet();
  /* --- màn HT20 (đăng nhập) --- */
  app.get('/api/v1/system/loi', { preHandler: requireAuthenticated(), schema: { tags, summary: 'Mục lỗi (gom theo phân hệ, loại, trạng thái) + tình trạng dựng lại', querystring: locQuery } },
    async (req) => ok(await danhSach(authOf(req).tenantId, req.query as z.infer<typeof locQuery>)));
  app.post('/api/v1/system/loi/trang-thai', { preHandler: requireAuthenticated(), schema: { tags, summary: 'Đổi trạng thái một mục lỗi (Sửa lỗi này / Bỏ qua / Đã sửa…)', body: ttInput } }, async (req) => {
    const a = authOf(req); const b = req.body as z.infer<typeof ttInput>;
    await ghi(a.tenantId, [{ t: 'trang_thai', ts: new Date().toISOString(), fp: b.fp, status: b.status, by: a.actorName, ...(b.note ? { note: b.note } : {}), ...(b.commit ? { commit: b.commit } : {}) }]);
    return ok({ ok: true });
  });
  app.post('/api/v1/system/loi/quet', { preHandler: requirePermission('settings:write'), schema: { tags, summary: 'Quét lỗi mới ngay (không đợi 60 giây)' } }, async () => {
    const r = await quetLoi(); lanQuet = { luc: new Date().toISOString(), moi: r.moi }; return ok(r);
  });
  app.post('/api/v1/system/loi/tu-sua', { preHandler: requirePermission('settings:write'), schema: { tags, summary: 'Bật / tắt lịch tự sửa', body: z.object({ bat: z.boolean() }) } }, async (req) => {
    const bat = (req.body as { bat: boolean }).bat;
    await sql`UPDATE tenants SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{cong_cu}', COALESCE(settings->'cong_cu', '{}'::jsonb) || jsonb_build_object('tuSua', ${bat}::boolean), true) WHERE id = ${authOf(req).tenantId}`.execute(db);
    return ok({ tuSua: bat });
  });
  app.post('/api/v1/system/loi/dung-lai', { preHandler: requirePermission('settings:write'), schema: { tags, summary: 'Yêu cầu dựng lại con dev (cron máy chủ thực hiện)', body: z.object({ note: z.string().max(500).optional() }).optional() } }, async (req) => {
    const a = authOf(req); const id = randomUUID();
    await ghi(a.tenantId, [{ t: 'dung_lai_yc', ts: new Date().toISOString(), id, by: a.actorName, ...((req.body as { note?: string } | undefined)?.note ? { note: (req.body as { note: string }).note } : {}) }]);
    return ok({ id });
  });

  /* --- khoá kết nối (máy local / lịch tự sửa / cron máy chủ) --- */
  const pub = { config: { public: true } };
  app.get('/api/v1/ket-noi/loi', { ...pub, schema: { tags, summary: 'Khoá kết nối: danh sách mục lỗi', querystring: locQuery } },
    async (req) => ok(await danhSach(await donViTheoKhoa(req), req.query as z.infer<typeof locQuery>)));
  app.post('/api/v1/ket-noi/loi/trang-thai', { ...pub, schema: { tags, summary: 'Khoá kết nối: đổi trạng thái một mục lỗi', body: ttInput } }, async (req) => {
    const t = await donViTheoKhoa(req); const b = req.body as z.infer<typeof ttInput>;
    await ghi(t, [{ t: 'trang_thai', ts: new Date().toISOString(), fp: b.fp, status: b.status, by: 'tự sửa (khoá kết nối)', ...(b.note ? { note: b.note } : {}), ...(b.commit ? { commit: b.commit } : {}) }]);
    return ok({ ok: true });
  });
  app.post('/api/v1/ket-noi/dung-lai/yeu-cau', { ...pub, schema: { tags, summary: 'Khoá kết nối: yêu cầu dựng lại', body: z.object({ note: z.string().max(500).optional() }).optional() } }, async (req) => {
    const t = await donViTheoKhoa(req); const id = randomUUID();
    await ghi(t, [{ t: 'dung_lai_yc', ts: new Date().toISOString(), id, by: 'tự sửa (khoá kết nối)', ...((req.body as { note?: string } | undefined)?.note ? { note: (req.body as { note: string }).note } : {}) }]);
    return ok({ id });
  });
  app.get('/api/v1/ket-noi/dung-lai', { ...pub, schema: { tags, summary: 'Cron máy chủ: yêu cầu dựng lại đang chờ (nhận xong thì không trả lại lần nữa)' } }, async (req) => {
    const t = await donViTheoKhoa(req);
    const { dungLai } = gom(await doc(t));
    if (!dungLai || dungLai.nhanLuc || dungLai.ketQua) return ok({ id: null });
    await ghi(t, [{ t: 'dung_lai_nhan', ts: new Date().toISOString(), id: dungLai.id }]);
    return ok({ id: dungLai.id });
  });
  app.post('/api/v1/ket-noi/dung-lai', { ...pub, schema: { tags, summary: 'Cron máy chủ: báo kết quả dựng lại', body: z.object({ id: z.string().uuid(), ok: z.boolean(), log: z.string().max(20000).default('') }) } }, async (req) => {
    const t = await donViTheoKhoa(req); const b = req.body as { id: string; ok: boolean; log: string };
    await ghi(t, [{ t: 'dung_lai_kq', ts: new Date().toISOString(), id: b.id, ok: b.ok, log: b.log.slice(-8000), by: 'cron máy chủ' }]);
    return ok({ ok: true });
  });
}
