// @bizcity-layer P module-sdk
// [2026-11-25 Nguyễn Văn Thủy] CÔNG CỤ & GIÁM SÁT — khai mật khẩu công cụ (xoá hết danh mục, nạp dữ liệu, đổi công thức giá vốn) và đường
// dẫn + tài khoản Grafana / Loki / Prometheus / Alertmanager ngay trên màn Cấu hình hệ thống (HT13), không phải đặt biến môi trường rồi
// khởi động lại API. Lưu ở tenants.settings.cong_cu; mỗi lần ghi có nhật ký (audit). Giai đoạn chạy thử: hiện rõ mật khẩu (đóng góp)
/**
 *   GET /api/v1/system/cong-cu         cấu hình đầy đủ (settings:write — có mật khẩu)
 *   GET /api/v1/system/cong-cu/links   chỉ đường dẫn giám sát (mọi người đăng nhập — nút "Log máy chủ" ở chi tiết lỗi)
 *   PUT /api/v1/system/cong-cu         ghi (settings:write)
 */
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import { db } from '@bizcity/platform/db/client';
import { authOf, requireAuthenticated, requirePermission } from '@bizcity/platform/core/auth';
import { ok } from '@bizcity/platform/core/http';
import { env } from '@bizcity/platform/config/env';
import { congCuOf, type CongCuConfig } from '@bizcity/platform/core/security/tool-password';
import { defineAction, mountActions } from '@bizcity/platform/core/actions';
import { nguonGhiDe } from './devtools.sources.js';
import { writeAudit } from '../../core/audit.js';

const tags = ['Cấu hình'];
const s = (n = 500) => z.string().trim().max(n).optional();
const input = z.object({
  wipePassword: s(200), seedPassword: s(200), costingPassword: s(200),
  grafanaUrl: s(), grafanaUser: s(200), grafanaPassword: s(200),
  prometheusUrl: s(), alertmanagerUrl: s(), note: s(2000), lokiUrl: s(), tempoUrl: s(),
});

/** Nạp địa chỉ Loki / Tempo khai ở HT13 vào Bàn điều tra (đơn vị nào khai trước thì dùng — đây là địa chỉ hạ tầng chung của máy chủ). */
export async function napNguonGiamSat(): Promise<void> {
  const rows = (await sql<{ c: CongCuConfig | null }>`SELECT settings->'cong_cu' AS c FROM tenants WHERE settings ? 'cong_cu' ORDER BY id`.execute(db)).rows;
  const lay = (k: 'lokiUrl' | 'tempoUrl') => rows.map((r) => r.c?.[k]?.trim()).find(Boolean) ?? '';
  nguonGhiDe.loki = lay('lokiUrl'); nguonGhiDe.tempo = lay('tempoUrl');
}

/** Đường dẫn Grafana dùng thật: khai ở HT13, chưa khai thì biến môi trường DEVTOOLS_GRAFANA_URL. */
export async function grafanaUrlOf(tenantId: string): Promise<string | null> {
  const c = await congCuOf(db, tenantId);
  const u = (c.grafanaUrl || env.DEVTOOLS_GRAFANA_URL || '').trim().replace(/\/+$/, '');
  return u || null;
}

const luu = defineAction({
  id: 'core.system.cong-cu.save', title: 'Lưu cấu hình công cụ & giám sát (mật khẩu công cụ, Grafana / Loki)', tags,
  description: 'Ghi mật khẩu công cụ (xoá hết danh mục, nạp dữ liệu, đổi công thức giá vốn) và đường dẫn, tài khoản các công cụ giám sát vào cấu hình đơn vị. '
    + 'Trống = dùng biến môi trường cũ (nếu có).',
  permission: 'settings:write', effect: 'write', sideEffects: ['settings'], idempotency: 'natural',
  input, output: z.object({ saved: z.boolean() }),
  expose: { http: { method: 'PUT', path: '/api/v1/system/cong-cu' }, mcp: false, ai: 'deny' },
  handler: async (ctx, i) => {
    const tx = ctx.data.tx;
    const truoc = await congCuOf(tx, ctx.tenant.id);
    const moi: CongCuConfig = Object.fromEntries(Object.entries(i).filter(([, v]) => v !== undefined && v !== '')) as CongCuConfig;
    await sql`UPDATE tenants SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{cong_cu}', ${JSON.stringify(moi)}::jsonb, true) WHERE id = ${ctx.tenant.id}`.execute(tx);
    // Nhật ký: ghi tên trường đã đổi (không ghi mật khẩu vào nhật ký).
    const doi = (Object.keys({ ...truoc, ...moi }) as (keyof CongCuConfig)[]).filter((k) => (truoc[k] ?? '') !== (moi[k] ?? ''));
    await writeAudit(tx, { tenantId: ctx.tenant.id, actor: ctx.legacyAuth.actor, action: 'system.cong_cu.save', objectType: 'tenant_settings', objectId: 'cong_cu', after: { changed: doi } });
    // Áp ngay cho Bàn điều tra (giao dịch chưa xong nên không đọc lại CSDL)
    nguonGhiDe.loki = moi.lokiUrl ?? ''; nguonGhiDe.tempo = moi.tempoUrl ?? '';
    return { saved: true };
  },
});

export async function congCuRoutes(app: FastifyInstance): Promise<void> {
  mountActions(app, [luu]);
  // nuot-loi: chưa có cột / CSDL chưa sẵn lúc khởi động — Bàn điều tra vẫn dùng biến môi trường
  void napNguonGiamSat().catch(() => undefined);
  app.get('/api/v1/system/cong-cu', {
    preHandler: requirePermission('settings:write'),
    schema: { tags, summary: 'Cấu hình công cụ & giám sát (có mật khẩu) + giá trị biến môi trường đang dùng thay khi chưa khai' },
    handler: async (req) => {
      const c = await congCuOf(db, authOf(req).tenantId);
      return ok({ ...c, envDefaults: { grafanaUrl: env.DEVTOOLS_GRAFANA_URL || '', wipeFromEnv: Boolean(process.env.CATALOG_WIPE_PASSWORD), seedFromEnv: Boolean(process.env.PURCHASE_SEED_PASSWORD) } });
    },
  });
  app.get('/api/v1/system/cong-cu/links', {
    preHandler: requireAuthenticated(),
    schema: { tags, summary: 'Đường dẫn giám sát (Grafana / Loki, Prometheus, Alertmanager) — không có mật khẩu' },
    handler: async (req) => {
      const c = await congCuOf(db, authOf(req).tenantId);
      return ok({ grafanaUrl: await grafanaUrlOf(authOf(req).tenantId), prometheusUrl: c.prometheusUrl || null, alertmanagerUrl: c.alertmanagerUrl || null });
    },
  });
}
