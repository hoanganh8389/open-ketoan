// @bizcity-layer P observability
// [2026-11-21 03:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — B1 (S038-3, S038-4, S038-11): nhật ký lỗi cố định logs/ — tách dòng ≥ LOG_FILE_LEVEL ra tệp xoay vòng, lỗi khởi động / tiến trình ghi đồng bộ, version + commit trong mọi dòng
/**
 * Nhật ký lỗi cố định của bản cài (PHASE-038, docs/phases/PHASE-038-NHAT-KY-LOI-CO-DINH/10-NGHIEN-CUU-GHI-LOG.md §7).
 *
 *   - stdout giữ nguyên là đường chính (Docker → Loki khi bật bộ giám sát), mức LOG_LEVEL.
 *   - LOG_DIR đặt (Docker: /app/logs, gắn ra <thư mục cài>/logs) → dòng mức ≥ LOG_FILE_LEVEL (mặc định warn) chép thêm vào
 *     <LOG_DIR>/api/<YYYY-MM-DD>.log — một ngày một tệp, giữ 30 ngày, thư mục ≤ 100 MB (phần của API trong trần 200 MB — D038-2, D038-7).
 *   - Lỗi khởi động và lỗi tiến trình (uncaughtException / unhandledRejection) ghi ĐỒNG BỘ trước khi thoát (R-LOG-3): luồng
 *     bất đồng bộ có thể chưa kịp ghi khi process.exit chạy.
 *
 * Tệp này KHÔNG đọc config/env.ts: lỗi cấu hình môi trường (ENV_INVALID) cũng phải ghi được, mà env.ts dừng tiến trình ngay khi nạp.
 * Ghi tệp hỏng (thư mục không ghi được, đĩa đầy) không bao giờ làm hỏng yêu cầu: báo một lần ra stderr rồi bỏ qua tệp.
 */
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { BUILD_VERSION } from './version.js';
// [2026-11-22 02:25 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B7b-1 (S039-19): dòng nhật ký trong ngữ cảnh một site (khác site ngầm định) có trường site — chế độ nhiều site biết lỗi của site nào
import { currentRequest } from './request-context.js';
import { DEFAULT_SITE_ID } from '../db/site.js';

/** Số mức của pino (OBSERVABILITY §2; OpenTelemetry SeverityNumber ở 10 §5.1). */
export const LEVELS = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 } as const;
export type LevelName = keyof typeof LEVELS;

const MB = 1024 * 1024;

/** Lý do khởi động thất bại (`reason` của evt bizcity.system.start_failed, 10 §7.2). */
export type StartFailReason = 'MIGRATION_PENDING' | 'DB_UNREACHABLE' | 'DB_AUTH_FAILED' | 'ENV_INVALID' | 'PORT_IN_USE' | 'UNKNOWN';

const START_HINTS: Record<StartFailReason, string> = {
  MIGRATION_PENDING: 'Chạy job db-migrate (docker compose up db-migrate) rồi xem logs/db-migrate/<ngày>.log',
  DB_UNREACHABLE: 'Kiểm container db đang chạy và DATABASE_URL (docker compose ps db)',
  DB_AUTH_FAILED: 'Kiểm DB_APP_PASSWORD trong .env khớp mật khẩu job db-migrate đã đặt cho ketoan_app; chạy lại db-migrate',
  ENV_INVALID: 'Sửa biến trong .env theo dòng báo lỗi phía trên rồi dựng lại (docker compose up -d)',
  PORT_IN_USE: 'Cổng API đang bị tiến trình khác dùng: đổi PORT hoặc dừng tiến trình đó',
  UNKNOWN: 'Chạy ./scripts/lay-log.sh và gửi gói log (có logs/api/<ngày>.log) cho người hỗ trợ',
};

/** Trường chung của mọi dòng (R-LOG-5): biết lỗi thuộc dịch vụ nào, bản nào. */
export function baseFields(service: string): { service: string; version: string; commit: string | null } {
  const sha = (process.env.BIZCITY_GIT_SHA ?? '').trim();
  return { service, version: BUILD_VERSION.version, commit: /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 12).toLowerCase() : null };
}

/** Tệp ghi thêm, xoay vòng theo dung lượng: tên.log → tên.log.1 → … → tên.log.<keep-1>, bản cũ nhất bị xoá. */
export class RotatingFile {
  private size = -1;
  private broken = false;

  constructor(readonly file: string, readonly maxBytes = 20 * MB, readonly keep = 5) {}

  write(line: string): void {
    if (this.broken) return;
    try {
      if (this.size < 0) {
        mkdirSync(path.dirname(this.file), { recursive: true });
        this.size = existsSync(this.file) ? statSync(this.file).size : 0;
      }
      const bytes = Buffer.byteLength(line);
      if (this.size > 0 && this.size + bytes > this.maxBytes) this.rotate();
      appendFileSync(this.file, line);
      this.size += bytes;
    } catch (err) {
      // nuot-loi: hỏng ghi tệp không được làm hỏng yêu cầu / khởi động; stdout vẫn đủ. Báo một lần.
      this.broken = true;
      process.stderr.write(`[nhat-ky] không ghi được ${this.file}: ${(err as Error).message} — chỉ còn log stdout\n`);
    }
  }

  private rotate(): void {
    const oldest = `${this.file}.${this.keep - 1}`;
    if (existsSync(oldest)) unlinkSync(oldest);
    for (let i = this.keep - 2; i >= 1; i--) {
      const from = `${this.file}.${i}`;
      if (existsSync(from)) renameSync(from, `${this.file}.${i + 1}`);
    }
    if (this.keep > 1) renameSync(this.file, `${this.file}.1`);
    else unlinkSync(this.file);
    this.size = 0;
  }
}

// [2026-11-22 07:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — B6 (S038-16, D038-7): nhật ký lỗi chia theo ngày, mỗi dịch vụ một thư mục logs/<dịch vụ>/<YYYY-MM-DD>.log, giữ 30 ngày, trần từng thư mục

/** Ngày theo giờ Việt Nam (UTC+7, không đổi giờ mùa hè) dạng YYYY-MM-DD — tên tệp nhật ký. */
export function ngayVN(ms = Date.now()): string {
  return new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10);
}

/** Trần từng thư mục (PHASE-038 · 10 §7.3): một tệp (quá thì <ngày>.1.log…), cả thư mục. Cộng ≤ 200 MB cùng gói lay-log. */
export const TRAN_NHAT_KY = {
  api: { tep: 20 * MB, thuMuc: 100 * MB },
  'db-migrate': { tep: 5 * MB, thuMuc: 15 * MB },
  'web-client': { tep: 5 * MB, thuMuc: 15 * MB },
} as const;
export type ThuMucNhatKy = keyof typeof TRAN_NHAT_KY;
export const GIU_NGAY = 30;

const TEP_NGAY_RE = /^(\d{4}-\d{2}-\d{2})(?:\.(\d+))?\.log$/;
const GIO = 3_600_000;

/**
 * Nhật ký một dịch vụ: <thuMuc>/<YYYY-MM-DD>.log, sang ngày mới là tệp mới. Một ngày quá trần một tệp → <ngày>.1.log, <ngày>.2.log.
 * Dọn (lúc mở tệp đầu tiên, khi sang ngày, và mỗi giờ khi đang ghi): xoá tệp của ngày cũ hơn `giuNgay`; thư mục vượt trần thì xoá
 * tệp cũ nhất trước (không bao giờ xoá tệp đang ghi). Ghi hỏng → báo một lần ra stderr, bỏ qua tệp (như RotatingFile).
 */
export class DailyFile {
  private ngay = '';
  private phan = 0;
  private size = 0;
  private donLuc = 0;
  private broken = false;

  constructor(
    readonly dir: string,
    readonly tran: { tep: number; thuMuc: number },
    readonly giuNgay = GIU_NGAY,
    private readonly now: () => number = Date.now,
  ) {}

  /** Tệp đang ghi (đường dẫn đầy đủ). */
  get file(): string {
    return path.join(this.dir, this.phan ? `${this.ngay}.${this.phan}.log` : `${this.ngay}.log`);
  }

  write(line: string): void {
    if (this.broken) return;
    try {
      const t = this.now();
      const hom = ngayVN(t);
      if (hom !== this.ngay) this.moNgay(hom);
      const bytes = Buffer.byteLength(line);
      if (this.size > 0 && this.size + bytes > this.tran.tep) { this.phan += 1; this.size = this.kichThuoc(this.file); }
      appendFileSync(this.file, line);
      this.size += bytes;
      if (t - this.donLuc >= GIO) this.don(t);
    } catch (err) {
      // nuot-loi: hỏng ghi tệp không được làm hỏng yêu cầu / khởi động; stdout vẫn đủ. Báo một lần.
      this.broken = true;
      process.stderr.write(`[nhat-ky] không ghi được ${this.dir}: ${(err as Error).message} — chỉ còn log stdout\n`);
    }
  }

  private kichThuoc(f: string): number {
    return existsSync(f) ? statSync(f).size : 0;
  }

  /** Sang ngày (hoặc lần ghi đầu): nối tiếp phần cuối của ngày đó nếu đã có (khởi động lại giữa ngày), rồi dọn. */
  private moNgay(hom: string): void {
    mkdirSync(this.dir, { recursive: true });
    this.ngay = hom;
    const phan = readdirSync(this.dir).map((n) => TEP_NGAY_RE.exec(n)).filter((m) => m && m[1] === hom).map((m) => Number(m![2] ?? 0));
    this.phan = phan.length ? Math.max(...phan) : 0;
    this.size = this.kichThuoc(this.file);
    this.don(this.now());
  }

  /** Xoá tệp quá hạn giữ, rồi tệp cũ nhất tới khi thư mục ≤ trần. */
  don(t = this.now()): void {
    this.donLuc = t;
    const han = ngayVN(t - this.giuNgay * 24 * GIO);
    const hienTai = path.basename(this.file);
    const ds = readdirSync(this.dir)
      .map((n) => ({ n, m: TEP_NGAY_RE.exec(n) }))
      .filter((x): x is { n: string; m: RegExpExecArray } => x.m !== null)
      .map((x) => ({ n: x.n, ngay: x.m[1]!, phan: Number(x.m[2] ?? 0), size: statSync(path.join(this.dir, x.n)).size }))
      .sort((a, b) => (a.ngay === b.ngay ? a.phan - b.phan : a.ngay < b.ngay ? -1 : 1));
    let tong = ds.reduce((s, x) => s + x.size, 0);
    for (const x of ds) {
      if (x.n === hienTai) continue;
      if (x.ngay < han || tong > this.tran.thuMuc) { unlinkSync(path.join(this.dir, x.n)); tong -= x.size; }
    }
  }
}

const daily = new Map<string, DailyFile>();
/** Một DailyFile cho mỗi thư mục dịch vụ trong tiến trình. LOG_DIR trống (dev, test) → null = không ghi tệp. */
export function dailyFile(thuMuc: ThuMucNhatKy, dir = process.env.LOG_DIR): DailyFile | null {
  const goc = (dir ?? '').trim();
  if (!goc) return null;
  const p = path.join(goc, thuMuc);
  let f = daily.get(p);
  if (!f) { f = new DailyFile(p, TRAN_NHAT_KY[thuMuc]); daily.set(p, f); }
  return f;
}

/** Tệp kiểu cũ ở gốc logs/ (bản cài trước D038-7: api-loi.log, web-loi.log, web-client.log, db-migrate.log và bản xoay .1…): xoá khi quá 30 ngày. */
export function donTepKieuCu(dir = process.env.LOG_DIR, now = Date.now()): string[] {
  const goc = (dir ?? '').trim();
  if (!goc || !existsSync(goc)) return [];
  const xoa: string[] = [];
  for (const n of readdirSync(goc)) {
    if (!/^(api-loi|web-loi|web-client|db-migrate)\.log(\.\d+)?$/.test(n)) continue;
    const p = path.join(goc, n);
    try {
      if (now - statSync(p).mtimeMs > GIU_NGAY * 24 * GIO) { unlinkSync(p); xoa.push(n); }
    } catch {
      // nuot-loi: tệp vừa bị tiến trình khác xoá / không có quyền — lần dọn sau thử lại; không ảnh hưởng ghi log mới
    }
  }
  return xoa;
}

const levelOf = (name: string | undefined, fallback: LevelName): number => LEVELS[(name ?? '') as LevelName] ?? LEVELS[fallback];

/** Đường dẫn tệp trong LOG_DIR; LOG_DIR trống (dev, test) = không ghi tệp. */
export function logFilePath(name: string, dir = process.env.LOG_DIR): string | null {
  const d = (dir ?? '').trim();
  return d ? path.join(d, name) : null;
}

const files = new Map<string, RotatingFile>();
/** Một RotatingFile cho mỗi đường dẫn trong tiến trình (logger Fastify và ghi đồng bộ dùng chung bộ đếm dung lượng). */
export function rotatingFile(file: string, maxBytes?: number, keep?: number): RotatingFile {
  let f = files.get(file);
  if (!f) { f = new RotatingFile(file, maxBytes, keep); files.set(file, f); }
  return f;
}

const LEVEL_RE = /^\{"level":(\d+)/;

/**
 * Luồng ghi cho pino / Fastify: mọi dòng ra stdout (lọc theo mức của logger), dòng có mức ≥ fileLevel chép thêm vào tệp.
 * pino luôn đặt "level" đầu dòng JSON nên đọc mức bằng một biểu thức, không phải parse cả dòng.
 */
export function teeStream(opts: { file: { write(line: string): void } | null; fileLevel: number; out?: { write(s: string): unknown } }) {
  const out = opts.out ?? process.stdout;
  return {
    write(line: string): void {
      out.write(line);
      if (!opts.file) return;
      const m = LEVEL_RE.exec(line);
      if (m && Number(m[1]) >= opts.fileLevel) opts.file.write(line);
    },
  };
}

/**
 * Cấu hình logger cho Fastify (apps/api/src/app.ts). Mức của logger = mức thấp hơn giữa stdout và tệp, để dòng warn vẫn tới tệp
 * khi LOG_LEVEL=error; stdout lọc lại theo LOG_LEVEL trong teeStream.
 */
export function loggerOptions(opts: { service: string; level: string; silent?: boolean; dir?: string; fileLevel?: string }) {
  if (opts.silent) return { level: 'silent' as const };
  const stdoutLevel = levelOf(opts.level, 'info');
  const fileLevel = levelOf(opts.fileLevel ?? process.env.LOG_FILE_LEVEL, 'warn');
  const file = dailyFile('api', opts.dir);
  if (file) donTepKieuCu(opts.dir); // một lần lúc dựng logger (khởi động API): dọn tệp kiểu cũ ở gốc logs/
  const min = file ? Math.min(stdoutLevel, fileLevel) : stdoutLevel;
  const name = (Object.keys(LEVELS) as LevelName[]).find((k) => LEVELS[k] === min) ?? 'info';
  const stdout = { write: (s: string) => { const m = LEVEL_RE.exec(s); if (!m || Number(m[1]) >= stdoutLevel) process.stdout.write(s); } };
  return {
    level: name,
    base: { pid: process.pid, ...baseFields(opts.service) },
    stream: teeStream({ file, fileLevel, out: stdout }),
    // B1b: `err` chuẩn (giữ cause, trường Postgres an toàn), errFp trên mọi dòng ≥ error có lỗi, che dữ liệu (R-LOG-1, R-LOG-4).
    // Fastify khai serializers.err trả { type, message, stack }; serializeError trả đủ các trường đó với mọi Error
    serializers: { err: (e: unknown) => serializeError(e) as { type: string; message: string; stack: string; [k: string]: unknown } },
    mixin: (obj: object, level: number) => {
      const o = obj as { err?: unknown; errFp?: unknown; site?: unknown };
      const fp = level >= LEVELS.error && o.err !== undefined && o.errFp === undefined ? { errFp: errFp(o.err) } : {};
      return o.site === undefined ? { ...siteField(), ...fp } : fp;
    },
    redact: { paths: REDACT_PATHS, censor: REDACT_CENSOR },
  };
}

/** Mã site của ngữ cảnh đang chạy, trừ site ngầm định (bản cài một công ty: dòng nhật ký không đổi). Mã site là ULID: tập nhỏ, không phải dữ liệu khách. */
export function siteField(): { site?: string } {
  const s = currentRequest()?.siteId;
  return s && s !== DEFAULT_SITE_ID ? { site: s } : {};
}

// [2026-11-22 12:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-038 — B1b (S038-12): errFp, err chuẩn có trường lỗi Postgres (không detail), redact dùng chung, logError (R-LOG-1, R-LOG-4)

/**
 * Trường của lỗi Postgres (pg DatabaseError) được giữ: chỉ TÊN đối tượng CSDL, không giá trị.
 * `detail` ("Key (tax_code)=(0101…) already exists"), `where`, `internalQuery` chứa dữ liệu / câu lệnh → KHÔNG ghi (R-LOG-4).
 */
const PG_FIELDS = ['severity', 'schema', 'table', 'column', 'constraint', 'routine'] as const;

const FRAME_RE = /^\s*at (?:.*? \()?(?:file:\/\/)?(.+?):(\d+)(?::\d+)?\)?\s*$/;

/**
 * Khung stack đầu tiên trong mã của repo (apps/ hoặc packages/), dạng "apps/api/src/main.ts:33" — bỏ phần đường dẫn trước
 * apps/ | packages/ (máy dev, container /app/… cho cùng một dấu), bỏ số cột.
 */
export function ownFrames(stack: string | undefined, n = 3): string[] {
  const out: string[] = [];
  for (const line of (stack ?? '').split('\n').slice(1)) {
    const m = FRAME_RE.exec(line);
    if (!m) continue;
    const p = m[1]!.replace(/\\/g, '/');
    const i = p.search(/(^|\/)(apps|packages)\//);
    if (i < 0 || p.includes('/node_modules/')) continue;
    out.push(`${p.slice(p[i] === '/' ? i + 1 : i)}:${m[2]}`);
    if (out.length >= n) break;
  }
  return out;
}

/**
 * Dấu vân lỗi (10 §5.4, G9): cùng loại lỗi ném từ cùng chỗ trong mã → cùng errFp, dù thông báo khác (mã chứng từ, số tiền).
 * 1.000 dòng một lỗi gom thành một việc; errFp lạ sau bản cập nhật = lỗi mới. Không có khung nào trong repo (lỗi thư viện thuần)
 * thì dùng thông báo đã thay chữ số / mã định danh.
 */
export function errFp(err: unknown): string {
  const e = err instanceof Error ? err : null;
  const type = e ? (e.name || 'Error') : typeof err;
  const frames = ownFrames(e?.stack);
  const basis = frames.length
    ? frames.join(',')
    : String(e ? e.message : err).replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '<id>').replace(/\d+/g, 'N').slice(0, 200);
  return createHash('sha1').update(`${type}|${basis}`).digest('hex').slice(0, 12);
}

/** Lỗi thành trường `err` (R-LOG-1): loại, thông báo, mã, trường Postgres an toàn, stack, chuỗi cause tối đa 5 lớp. */
export function serializeError(err: unknown, depth = 0): Record<string, unknown> {
  if (!(err instanceof Error)) {
    // đã tuần tự hoá rồi (logError với lỗi không phải Error, dòng đọc lại từ tệp) → giữ nguyên, không bọc lần hai
    const o = err as { type?: unknown; message?: unknown } | null;
    if (o && typeof o === 'object' && typeof o.type === 'string' && typeof o.message === 'string') return o as Record<string, unknown>;
    return { type: typeof err, message: String(err) };
  }
  const e = err as Error & Record<string, unknown> & { code?: unknown; cause?: unknown };
  const pg: Record<string, unknown> = {};
  if (typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code) && typeof e.routine === 'string') {
    for (const k of PG_FIELDS) if (typeof e[k] === 'string') pg[k] = e[k];
  }
  return {
    type: e.name || e.constructor?.name || 'Error',
    message: e.message,
    ...(typeof e.code === 'string' ? { code: e.code } : {}),
    ...pg,
    stack: e.stack,
    ...(e.cause !== undefined && depth < 5 ? { cause: serializeError(e.cause, depth + 1) } : {}),
  };
}

/**
 * Lưới an toàn che dữ liệu (R-LOG-4) — MỘT danh sách cho mọi logger của Platform. Không thay việc người viết mã không ghi giá trị:
 * pino chỉ che đúng tên trường, ở đúng độ sâu liệt kê. Thêm trường nhạy cảm mới vào đây, kèm test (nhat-ky-loi.test.ts).
 */
const SENSITIVE = ['password', 'passwd', 'token', 'accessToken', 'refreshToken', 'apiKey', 'secret', 'authorization', 'cookie',
  'body', 'payload', 'taxCode', 'mst', 'phone', 'email', 'bankAccount', 'accountNumber', 'idNumber', 'cccd'] as const;
export const REDACT_PATHS: string[] = [
  ...SENSITIVE.flatMap((k) => [k, `*.${k}`]),
  'req.headers.authorization', 'req.headers.cookie', 'req.headers["x-api-key"]', 'res.headers["set-cookie"]',
];
export const REDACT_CENSOR = '***';

type LogFn = (obj: object, msg?: string) => void;
type LoggerLike = { error: LogFn; warn: LogFn; fatal?: LogFn };

/**
 * Một đường ghi lỗi (R-LOG-1): `logError(req.log, err, { evt: 'bizcity.kho.ghi_so_loi', fn: 'postPhieu' }, 'Ghi sổ phiếu kho lỗi')`.
 * Dòng có `err` (đối tượng lỗi — logger của Platform tuần tự hoá bằng serializeError), `errFp`, `evt`. Dùng được với logger
 * không phải của Platform (logger con, logger test): errFp tính ở đây, không chờ mixin.
 * `level`: 'warn' khi đã lùi / thử lại được (R-LOG-7), 'fatal' khi tiến trình sắp dừng.
 */
export function logError(
  log: LoggerLike,
  err: unknown,
  ctx: { evt?: string; level?: 'warn' | 'error' | 'fatal'; [k: string]: unknown } = {},
  msg?: string,
): void {
  const { level = 'error', evt = 'bizcity.error', ...rest } = ctx;
  const line = { ...rest, evt, errFp: errFp(err), err: err instanceof Error ? err : serializeError(err) };
  const text = msg ?? (err instanceof Error ? err.message : String(err));
  if (level === 'fatal' && log.fatal) log.fatal(line, text);
  else if (level === 'warn') log.warn(line, text);
  else log.error(line, text);
}

/** Đoán lý do khởi động thất bại từ lỗi (mã PG / mã hệ thống / câu báo của main.ts). */
export function classifyStartError(err: unknown): StartFailReason {
  const e = err as { code?: unknown; message?: unknown; name?: unknown } | null;
  const code = typeof e?.code === 'string' ? e.code : '';
  const msg = typeof e?.message === 'string' ? e.message : String(err);
  if (/migration chưa áp/i.test(msg)) return 'MIGRATION_PENDING';
  if (code === '28P01' || code === '28000') return 'DB_AUTH_FAILED';
  if (['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', '57P03', '3D000'].includes(code)) return 'DB_UNREACHABLE';
  if (code === 'EADDRINUSE') return 'PORT_IN_USE';
  if (e?.name === 'EnvError' || e?.name === 'ZodError' || /Cấu hình môi trường không hợp lệ/.test(msg)) return 'ENV_INVALID';
  return 'UNKNOWN';
}

/**
 * Ghi một dòng JSON khuôn pino ĐỒNG BỘ ra stderr và tệp (R-LOG-3) — dùng khi tiến trình sắp thoát, logger có thể chưa có.
 * `thuMuc` = thư mục dịch vụ trong LOG_DIR (api, db-migrate) — tệp của ngày hôm nay.
 */
export function writeSync(level: LevelName, fields: Record<string, unknown>, opts: { service: string; thuMuc?: ThuMucNhatKy; dir?: string }): string {
  const line = `${JSON.stringify({ level: LEVELS[level], time: Date.now(), pid: process.pid, ...baseFields(opts.service), ...fields })}\n`;
  process.stderr.write(line);
  dailyFile(opts.thuMuc ?? 'api', opts.dir)?.write(line);
  return line;
}

// [2026-11-22 04:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — B4b (S038-13, R-LOG-10): lỗi giao diện trình duyệt gửi về; B6 (D038-7): logs/web-client/<ngày>.log, 5 MB / tệp, thư mục 15 MB, 30 ngày
/**
 * Ghi một dòng lỗi giao diện vào <LOG_DIR>/web-client/<YYYY-MM-DD>.log (service "web"; version / commit của bản cài — web và api cùng một
 * bản dựng). Chỉ route POST /api/v1/system/client-errors gọi, SAU khi đã kiểm khuôn và che dữ liệu (loi-trinh-duyet.ts).
 * LOG_DIR trống (dev, test) = không ghi. Trả dòng đã ghi (test đọc), null nếu không ghi.
 */
export function ghiLoiTrinhDuyet(fields: Record<string, unknown>, dir?: string): string | null {
  const tep = dailyFile('web-client', dir);
  if (!tep) return null;
  const line = `${JSON.stringify({ level: LEVELS.error, time: Date.now(), ...baseFields('web'), ...fields })}\n`;
  tep.write(line);
  return line;
}

/** Dòng fatal "khởi động thất bại" (evt bizcity.system.start_failed, 10 §7.2). */
export function logStartFailure(err: unknown, opts: { service: string; thuMuc?: ThuMucNhatKy; dir?: string }): StartFailReason {
  const reason = classifyStartError(err);
  writeSync('fatal', {
    evt: 'bizcity.system.start_failed',
    reason,
    msg: `Khởi động thất bại: ${err instanceof Error ? err.message : String(err)}`,
    hint: START_HINTS[reason],
    errFp: errFp(err),
    err: serializeError(err),
  }, opts);
  return reason;
}

let installed = false;
/**
 * Bắt lỗi ở mức tiến trình (R-LOG-3): ghi fatal đồng bộ rồi thoát mã 1 để Docker khởi động lại — không "nuốt rồi chạy tiếp"
 * (trạng thái sau lỗi không bắt là không biết được). Gọi một lần, sớm nhất có thể (main.ts, setup.ts).
 */
export function installProcessHandlers(opts: { service: string; thuMuc?: ThuMucNhatKy; dir?: string; exit?: (code: number) => void }): void {
  if (installed) return;
  installed = true;
  const exit = opts.exit ?? ((c: number) => process.exit(c));
  const die = (kind: 'uncaughtException' | 'unhandledRejection') => (err: unknown) => {
    writeSync('fatal', { evt: `bizcity.system.${kind === 'uncaughtException' ? 'uncaught_exception' : 'unhandled_rejection'}`, msg: `Lỗi không bắt (${kind}) — tiến trình dừng`, errFp: errFp(err), err: serializeError(err) }, opts);
    exit(1);
  };
  process.on('uncaughtException', die('uncaughtException'));
  process.on('unhandledRejection', die('unhandledRejection'));
}
