/**
 * [2026-11-25 12:05 PM Johnny Chu - Chu Hoàng Anh] STD — USERS-1: tệp khai báo người dùng · vai · quyền `bizcity.authz.json` ở gốc repo
 * (`bizcity_authz_manifest@1`, chuẩn `bizcity_users@1` 1.1.0 của bizcity-platform §3, R-USER-13) phải KHỚP sổ đăng ký đang chạy.
 *
 * Test dựng app (mọi phân hệ, mọi add-in như cấu hình test), chụp sổ quyền module, bảng vai, phạm vi khoá API, khoá cài đặt
 * (registry `docs/contracts/bizcity-settings.registry.json`, phần có quyền gác) rồi so với tệp đã commit. Lệch ⇒ đỏ.
 * Đổi quyền / vai / phạm vi có chủ đích thì ghi lại tệp:   UPDATE_AUTHZ=1 npx vitest run test/authz-manifest.test.ts
 * Kiểm khuôn chung (bên bizcity-platform):   node ../bizcity-platform/tools/users-check.mjs --repo .
 *
 * Hình tệp giống `authzManifest()` của @bizcity/platform; open-ketoan chưa dùng gói nền (P6) nên dựng tại chỗ.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PERMISSIONS, listModulePermissions, rolePermissions, scopePermissions } from '@bizcity/platform/core/auth';
import { ROLES, ROLE_LABELS } from '@ketoan/contracts';
import { buildApp } from '../src/app.js';

const FILE = new URL('../../../bizcity.authz.json', import.meta.url);
const SETTINGS = new URL('../../../docs/contracts/bizcity-settings.registry.json', import.meta.url);
/** Phạm vi khoá API của open-ketoan (bảng SCOPE_PERMISSIONS ở core/auth.ts). Thêm phạm vi ⇒ thêm ở đây. */
const API_SCOPES = ['catalog:write', 'documents:write', 'reports:read'];
const SETTING_SCOPES = ['tenant', 'accounting_unit', 'branch', 'user'];

let app: Awaited<ReturnType<typeof buildApp>>;
beforeAll(async () => { app = await buildApp(); });
afterAll(async () => { await app?.close(); });

function snapshot() {
  const by = (a: { key: string }, b: { key: string }) => a.key.localeCompare(b.key);
  const reg = JSON.parse(readFileSync(SETTINGS, 'utf8')) as { settings: { key: string; label?: string; scopes?: string[]; permission?: string }[] };
  return {
    schema: 'bizcity_authz_manifest@1',
    app: 'open-ketoan',
    core_permissions: [...PERMISSIONS].sort(),
    permissions: listModulePermissions().map((p) => ({ key: p.key, label: p.label, risk: p.risk === 'high' ? 'high' : 'low', module: p.module })).sort(by),
    roles: Object.values(ROLES).filter((r) => r !== 'owner')
      .map((r) => ({ key: r, label: ROLE_LABELS[r], admin: false, permissions: [...rolePermissions(r)].sort() })).sort(by),
    api_scopes: Object.fromEntries(API_SCOPES.map((s) => [s, [...scopePermissions([s])].sort()])),
    user_meta: [],
    // chỉ khoá cài đặt có quyền gác dạng <module>:<việc> và có phạm vi trong khuôn chung (khoá cấp máy chủ / env không vào đây)
    settings: reg.settings
      .filter((k) => /^bizcity\.[a-z0-9_]+(\.[a-z0-9_]+)+$/.test(k.key) && String(k.permission ?? '').includes(':'))
      .map((k) => ({ key: k.key, label: k.label ?? k.key, scopes: (k.scopes ?? []).filter((s) => SETTING_SCOPES.includes(s)), permission: k.permission! }))
      .filter((k) => k.scopes.length).sort(by),
  };
}

describe('bizcity.authz.json (R-USER-13)', () => {
  it('khớp sổ đăng ký đang chạy', () => {
    const now = snapshot();
    if (process.env.UPDATE_AUTHZ === '1') writeFileSync(FILE, JSON.stringify(now, null, 2) + '\n');
    const committed = JSON.parse(readFileSync(FILE, 'utf8'));
    expect(committed, 'bizcity.authz.json lệch mã — đổi có chủ đích thì chạy lại với UPDATE_AUTHZ=1 rồi commit tệp').toEqual(now);
  });

  it('khoá API không mang quyền rủi ro cao; vai chỉ trỏ quyền có thật', () => {
    const m = snapshot();
    const high = new Set(m.permissions.filter((p) => p.risk === 'high').map((p) => p.key));
    const known = new Set([...m.core_permissions, ...m.permissions.map((p) => p.key)]);
    for (const [scope, perms] of Object.entries(m.api_scopes)) for (const p of perms) expect(high.has(p), `${scope} → ${p}`).toBe(false);
    for (const r of m.roles) for (const p of r.permissions) expect(known.has(p), `${r.key} → ${p}`).toBe(true);
  });
});
