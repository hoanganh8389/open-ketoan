// @bizcity-layer P observability
// [2026-10-30 07:46 PM Johnny Chu - Chu Hoàng Anh] PHASE-006 — transactional outbox, subscriber, đồng hồ, correlation_id.
// [2026-10-30 09:23 PM Johnny Chu - Chu Hoàng Anh] PHASE-007 — cô lập đơn vị bằng RLS.
// [2026-11-01 04:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — dời từ apps/api/src/core/request-context.ts sang packages/platform (@bizcity/platform, D010-7 chặng 2); import tương đối viết lại theo chỗ mới
// [2026-11-21 09:23 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B1 (ADR-0036): trường siteId — site của yêu cầu; pool CSDL chọn database theo trường này (db/site.ts)
// [2026-11-22 09:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — B5 (R-LOG-2): chú thích lý do cho chỗ bỏ qua lỗi có chủ ý
/**
 * Ngữ cảnh của yêu cầu đang chạy (AsyncLocalStorage): mã yêu cầu + mã tương quan, để bằng chứng (audit_logs.correlation_id)
 * và sự kiện miền (event_outbox.correlation_id) tự gắn mà không phải truyền qua từng hàm (C-8, bizcity_event@1 §3).
 *
 * - correlationId = header X-Correlation-Id hợp lệ (Cell / MCP gửi cùng một mã cho cả hội thoại), không thì = mã yêu cầu.
 * - Ngoài yêu cầu HTTP (dispatcher, đồng hồ, script) thì không có ngữ cảnh: người gọi tự truyền, hoặc để NULL.
 * - tenantId: gán sau khi xác thực (core/auth.ts). Pool CSDL (db/client.ts) đặt bizcity.tenant_id theo giá trị này mỗi lần mượn
 *   kết nối → RLS (migration 0041) chỉ cho thấy dữ liệu của đơn vị đó, kể cả khi một truy vấn quên lọc tenant_id (PHASE-007).
 */
// [2026-11-22 12:37 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B2a (D039-4, D039-6): SITE_MODE=multi — nhận site theo tên miền trước mọi hook khác; tên miền lạ → 404 SITE_NOT_FOUND; kiểm sống / sẵn sàng / số đo chạy trên site ngầm định
import { AsyncLocalStorage } from 'node:async_hooks';
import type { FastifyInstance } from 'fastify';
import { DEFAULT_SITE_ID, siteMode } from '../db/site.js';

/** Đường kiểm sống / sẵn sàng / số đo: bộ cân bằng tải gọi bằng địa chỉ máy, không có tên miền của site. */
const SITELESS_PATHS = new Set(['/api/v1/system/health', '/api/v1/system/health/ready', '/metrics']);
// [2026-11-22 10:48 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B5a (D039-14): Provisioning API không thuộc site nào; route tự kiểm tên miền điều hành + khoá prov_…
const PROVISIONING_PREFIX = '/_sites/';
// [2026-11-22 01:18 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B6b (Q039-1): site khoá = chỉ đọc — xem / in / xuất (GET), đăng nhập / đăng xuất / đổi mật khẩu, xem trước; ghi khác → 423
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const SUSPENDED_WRITE_OK = new Set(['/api/v1/auth/login', '/api/v1/auth/wp-sso', '/api/v1/auth/logout-others', '/api/v1/auth/change-password']);
/** Yêu cầu ghi có được chạy trên site đang khoá không (chỉ đọc, Q039-1). */
export function suspendedAllows(method: string, url: string): boolean {
  if (READ_METHODS.has(method.toUpperCase())) return true;
  const p = url.split('?')[0] ?? '';
  return SUSPENDED_WRITE_OK.has(p) || p.endsWith('/preview');
}

export interface RequestContext {
  requestId: string;
  correlationId: string;
  /**
   * Site của yêu cầu (ADR-0036): chọn database. Chưa gắn = site ngầm định của bản cài một công ty (PHASE-039 B1). Từ B2: Site
   * Resolver gắn theo tên miền trước khi xác thực; chế độ nhiều site thiếu trường này thì không truy vấn nào chạy (R-SITE-3).
   */
  siteId?: string;
  /** Đơn vị của người gọi (đã xác thực); chưa có = chưa xác thực / việc nền. */
  tenantId?: string;
  /** [2026-11-21 Nguyễn Văn Thủy] Chi nhánh đang làm việc (header x-chi-nhanh — nút chi nhánh trên cùng); pool đặt bizcity.chi_nhanh_lam_viec để sổ chứng từ chung ghi nơi lập của mọi chứng từ mới (0177) (đóng góp) */
  workBranch?: string;
}

const store = new AsyncLocalStorage<RequestContext>();
const ID = /^[A-Za-z0-9._:-]{8,128}$/;

export function currentRequest(): RequestContext | undefined {
  return store.getStore();
}

/** Chạy fn trong một ngữ cảnh (dispatcher dùng để subscriber kế thừa mã tương quan của sự kiện). */
export function withRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return store.run(ctx, fn);
}

export function registerRequestContext(app: FastifyInstance): void {
  // Hook dạng callback: done() chạy bên trong store.run nên mọi hook / handler sau đó thấy ngữ cảnh.
  app.addHook('onRequest', (req, reply, done) => {
    const h = req.headers['x-correlation-id'];
    const v = Array.isArray(h) ? h[0] : h;
    const correlationId = v && ID.test(v) ? v : String(req.id);
    reply.header('x-correlation-id', correlationId);
    const wb = req.headers['x-chi-nhanh'];
    let workBranch: string | undefined;
    try { const x = decodeURIComponent(String(Array.isArray(wb) ? wb[0] : wb ?? '')).trim(); if (/^[A-Za-z0-9._-]{1,64}$/.test(x)) workBranch = x; } catch { /* nuot-loi: header chi nhánh sai dạng — bỏ qua, như không gửi */ }
    const base: RequestContext = { requestId: String(req.id), correlationId, ...(workBranch ? { workBranch } : {}) };
    if (siteMode() === 'single') {
      store.run(base, done);
      return;
    }
    // Chế độ nhiều site (ADR-0036): site theo tên miền của yêu cầu, trước xác thực. Không có → 404, không truy vấn nào chạy.
    // Provisioning API: không gắn site (dùng database điều khiển; `db` gọi tới sẽ ném SITE_CONTEXT_MISSING).
    if (req.url.startsWith(PROVISIONING_PREFIX)) {
      store.run(base, done);
      return;
    }
    if (SITELESS_PATHS.has(req.url.split('?')[0] ?? '')) {
      store.run({ ...base, siteId: DEFAULT_SITE_ID }, done);
      return;
    }
    // [2026-11-22 11:19 AM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B3 (R-SITE-9): cổng lược đồ — site đang nâng / nâng lỗi / lệch bản → 503, không truy vấn nào chạy
    import('../db/site-registry.js')
      .then((m) => m.resolveSiteByHost(req.host))
      .then(
        (r) => {
          if (!r) {
            reply.code(404).send({ ok: false, error: { code: 'SITE_NOT_FOUND', message: 'Không tìm thấy phần mềm kế toán của tên miền này', requestId: String(req.id) } });
            return;
          }
          if ('gate' in r) {
            const message = r.gate === 'SITE_UPGRADING'
              ? 'Phần mềm kế toán đang nâng cấp, vui lòng thử lại sau ít phút'
              : 'Nâng cấp phần mềm kế toán gặp lỗi, quản trị đang xử lý; dữ liệu không bị thay đổi';
            reply.code(503).header('retry-after', '60').send({ ok: false, error: { code: r.gate, message, requestId: String(req.id) } });
            return;
          }
          if (r.readOnly && !suspendedAllows(req.method, req.url)) {
            reply.code(423).send({ ok: false, error: { code: 'SITE_SUSPENDED', message: 'Phần mềm kế toán đang tạm khoá: vẫn xem, in, xuất sổ được nhưng không ghi được. Liên hệ nhà cung cấp để mở lại.', requestId: String(req.id) } });
            return;
          }
          const siteId = r.siteId;
          store.run({ ...base, siteId }, done);
        },
        (err: unknown) => done(err as Error),
      );
  });
}
