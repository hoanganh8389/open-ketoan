// [2026-11-22 01:57 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B7a: ca kiểm biến môi trường nhiều site — docker compose chuyển ${VAR:-} thành chuỗi rỗng; rỗng = chưa đặt
/**
 * docker-compose.yml chuyển mọi biến SITE_* vào api / db-migrate dạng `${VAR:-}`: bản cài một công ty nhận chuỗi rỗng. Chuỗi rỗng
 * phải được coi như chưa đặt (giá trị mặc định), không thì `.url()` / `.min(32)` / enum làm bản cài một công ty không khởi động.
 */
import { describe, expect, it } from 'vitest';
import { checkEnv, envInput } from '@bizcity/platform/config/env';

const base = { DATABASE_URL: 'postgres://ketoan:ketoan@db:5432/ketoan', JWT_SECRET: 'khoa-jwt-rieng-cua-ca-kiem-0123456789' };
const empty = { SITE_MODE: '', CONTROL_DATABASE_URL: '', SITE_TEMPLATE_DB: '', SITE_SECRET_KEY: '', PROVISION_DATABASE_URL: '', SITE_APP_PARENT_ROLE: '', SITE_ADMIN_HOST: '', SITE_BACKUP_DIR: '' };

describe('PHASE-039 B7a — biến nhiều site rỗng', () => {
  it('compose một công ty (mọi SITE_* rỗng) → hợp lệ, giá trị mặc định', () => {
    const r = checkEnv({ ...base, ...empty });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).toMatchObject({ SITE_MODE: 'single', SITE_TEMPLATE_DB: 'kt_template', SITE_APP_PARENT_ROLE: 'ketoan_app' });
    expect(r.data.CONTROL_DATABASE_URL).toBeUndefined();
    expect(r.data.SITE_SECRET_KEY).toBeUndefined();
  });

  it('envInput chỉ bỏ biến nhiều site rỗng, giữ nguyên biến khác (kể cả rỗng)', () => {
    const out = envInput({ ...base, ...empty, BUG_REPORT_URL: '', SITE_MODE: ' ' });
    for (const k of Object.keys(empty)) expect(k in out).toBe(false);
    expect(out.BUG_REPORT_URL).toBe('');
    expect(out.DATABASE_URL).toBe(base.DATABASE_URL);
  });

  it('giá trị sai vẫn bị từ chối (không nuốt lỗi)', () => {
    expect(checkEnv({ ...base, SITE_MODE: 'nhieu' }).success).toBe(false);
    expect(checkEnv({ ...base, SITE_SECRET_KEY: 'ngan' }).success).toBe(false);
    expect(checkEnv({ ...base, CONTROL_DATABASE_URL: 'khong-phai-url' }).success).toBe(false);
  });

  it('compose nhiều site → hợp lệ', () => {
    const r = checkEnv({ ...base, ...empty, SITE_MODE: 'multi', CONTROL_DATABASE_URL: 'postgres://ketoan:p@db:5432/ketoan_control', SITE_SECRET_KEY: 'khoa-bi-mat-cua-test-phai-du-32-ky-tu!', SITE_ADMIN_HOST: 'open.bizcity.vn', SITE_BACKUP_DIR: '/app/backups/sites' });
    expect(r.success).toBe(true);
  });
});
