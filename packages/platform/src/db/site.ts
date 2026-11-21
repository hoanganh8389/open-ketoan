// @bizcity-layer P data
// [2026-11-21 09:23 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B1 (ADR-0036, R-SITE-3, R-SITE-5): bộ định tuyến CSDL theo site ở chế độ một site — mã site trong ngữ cảnh yêu cầu, pool theo site, forEachSite cho việc nền; hành vi không đổi
/**
 * BỘ ĐỊNH TUYẾN CSDL THEO SITE (ADR-0036; PHASE-039 B1).
 *
 * Site = một tên miền + một database PostgreSQL riêng (R-SITE-1). Mỗi site có một pool kết nối; `db` (db/client.ts) mượn kết nối
 * từ pool của site trong ngữ cảnh yêu cầu đang chạy. Kernel, module, Rulepack không gọi tệp này (R-SITE-5).
 *
 *   currentSiteId()        site của yêu cầu đang chạy (RequestContext.siteId); chưa gắn thì là site ngầm định
 *   poolOf(siteId?)        pool của site; site không có trong bộ định tuyến → SITE_NOT_FOUND, KHÔNG rơi về site khác
 *   withSite(siteId, fn)   chạy fn trong ngữ cảnh của một site (giữ mã yêu cầu / mã tương quan đang có)
 *   forEachSite(fn)        việc nền lặp từng site; lỗi của site này không chặn site sau khi có onError
 *
 * B1 — CHỈ CHẾ ĐỘ MỘT SITE: bộ định tuyến có đúng một site `default` (pool của DATABASE_URL, đăng ký ở db/client.ts); hành vi như
 * trước PHASE-039. Việc của B2 (chưa làm ở đây): Site Registry trong database điều khiển, nhận site theo tên miền, SITE_MODE=multi
 * và luật "đóng khi thiếu" (R-SITE-3): ở chế độ nhiều site, thiếu mã site trong ngữ cảnh phải báo SITE_CONTEXT_MISSING thay cho
 * việc dùng site ngầm định như dưới đây.
 */
import type pg from 'pg';
import { currentRequest, withRequestContext } from '../core/request-context.js';

/** Site ngầm định của bản cài một công ty (SITE_MODE=single): database của DATABASE_URL. */
export const DEFAULT_SITE_ID = 'default';

export type SiteErrorCode = 'SITE_NOT_FOUND' | 'SITE_CONTEXT_MISSING';

/** Lỗi định tuyến site. Không mang tên database, chuỗi kết nối hay danh sách site khác. */
export class SiteRoutingError extends Error {
  constructor(readonly code: SiteErrorCode, message: string) {
    super(message);
    this.name = 'SiteRoutingError';
  }
}

const pools = new Map<string, pg.Pool>();

/** Đăng ký pool của một site. Một mã site chỉ có một pool; đăng ký lại cùng pool thì bỏ qua. */
export function registerSitePool(siteId: string, pool: pg.Pool): void {
  const cur = pools.get(siteId);
  if (cur && cur !== pool) throw new Error(`Site "${siteId}" đã có pool: không đăng ký pool thứ hai cho cùng một site`);
  pools.set(siteId, pool);
}

/** Mã các site đang có trong bộ định tuyến, theo thứ tự đăng ký. */
export function listSiteIds(): string[] {
  return [...pools.keys()];
}

/** Site của yêu cầu đang chạy. B1: chưa gắn site thì dùng site ngầm định (xem ghi chú đầu tệp về B2). */
export function currentSiteId(): string {
  return currentRequest()?.siteId ?? DEFAULT_SITE_ID;
}

/** Pool của một site (mặc định: site đang chạy). Không có thì ném SITE_NOT_FOUND, không bao giờ trả pool của site khác. */
export function poolOf(siteId: string = currentSiteId()): pg.Pool {
  const pool = pools.get(siteId);
  if (!pool) throw new SiteRoutingError('SITE_NOT_FOUND', `Không có site "${siteId}" trong bộ định tuyến CSDL`);
  return pool;
}

/** Chạy fn trong ngữ cảnh của một site. Giữ mã yêu cầu, mã tương quan, đơn vị của ngữ cảnh đang có; ngoài yêu cầu thì tạo mã riêng. */
export function withSite<T>(siteId: string, fn: () => T): T {
  const cur = currentRequest();
  const base = cur ?? { requestId: `site:${siteId}`, correlationId: `site:${siteId}` };
  return withRequestContext({ ...base, siteId }, fn);
}

/**
 * Việc nền chạy lần lượt trên từng site, mỗi lượt trong ngữ cảnh của site đó (D039-8).
 * Có onError: lỗi của một site được báo và bỏ qua, các site sau vẫn chạy. Không có onError: lỗi đầu tiên dừng vòng lặp.
 */
export async function forEachSite(
  fn: (siteId: string) => Promise<void>,
  onError?: (siteId: string, err: unknown) => void,
): Promise<void> {
  for (const siteId of listSiteIds()) {
    try {
      await withSite(siteId, () => fn(siteId));
    } catch (err) {
      if (!onError) throw err;
      onError(siteId, err);
    }
  }
}

/** Đóng mọi pool đã đăng ký (tắt ứng dụng). Gỡ khỏi bộ định tuyến trước khi đóng để không đóng một pool hai lần. */
export async function endAllSitePools(): Promise<void> {
  const all = [...pools.values()];
  pools.clear();
  await Promise.all(all.map((p) => p.end()));
}
