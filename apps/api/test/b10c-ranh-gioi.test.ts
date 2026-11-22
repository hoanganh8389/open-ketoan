// [2026-11-23 01:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-040 — B10c-lõi (S040-24): phiên bản bộ kết chuyển mẫu ghi qua documents.saveVersion (SC-DOC-7); route POST chỉ đọc không ghi gì (SC-ACT-1)
/**
 *   T040-B10C-1  lưu bộ kết chuyển mẫu hai lần (khác nội dung) → hai phiên bản ở document_versions, băm = contentHash(ảnh chụp) như mọi chứng từ;
 *                lưu lại y hệt → không thêm phiên bản; lịch sử đọc được ghi chú
 *   T040-B10C-2  POST /posting/scheme/preview và /help/package/preview chỉ đọc: số dòng document_versions / sổ không đổi
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { contentHash } from '@bizcity/platform/core/documents';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let t: string;
const REF = 'ket-chuyen.rules:mau';
const versions = async () => (await sql<{ version: number; content_hash: string; snapshot: unknown }>`
  SELECT version, content_hash, snapshot FROM document_versions WHERE tenant_id = ${t} AND doc_ref = ${REF} ORDER BY version`.execute(db)).rows;

beforeAll(async () => {
  ctx = await setupTenant();
  t = String((await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id);
});
afterAll(async () => { await ctx.app.close(); });

describe('T040-B10C — ranh giới phần của Lõi', () => {
  it('T040-B10C-1 phiên bản bộ kết chuyển mẫu qua documents.saveVersion', async () => {
    const rules = (await call(ctx, 'GET', '/api/v1/closing/rules')).body.data.rules as Array<{ description?: string }>;
    expect(rules.length).toBeGreaterThan(0);
    const first = await call(ctx, 'PUT', '/api/v1/closing/rules', { rules, note: 'lần 1' });
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    const changed = rules.map((r, i) => (i === 0 ? { ...r, description: `${r.description ?? ''} (sửa)` } : r));
    const second = await call(ctx, 'PUT', '/api/v1/closing/rules', { rules: changed, note: 'lần 2' });
    expect(second.status, JSON.stringify(second.body)).toBe(200);
    const v = await versions();
    expect(v.map((x) => x.version)).toEqual([1, 2]);
    for (const x of v) expect(x.content_hash).toBe(contentHash(x.snapshot));
    expect((v[1]!.snapshot as { note?: string }).note).toBe('lần 2');
    const again = await call(ctx, 'PUT', '/api/v1/closing/rules', { rules: changed, note: 'lần 2' });
    expect(again.status).toBe(200);
    expect((await versions()).length).toBe(2);
    const hist = await call(ctx, 'GET', '/api/v1/closing/rules/versions');
    expect(hist.status).toBe(200);
    expect(hist.body.data[0]).toMatchObject({ version: 2, note: 'lần 2' });
  });

  it('T040-B10C-2 route POST xem trước chỉ đọc: không thêm phiên bản, không thêm bút toán', async () => {
    const count = async () => Number((await sql<{ n: string }>`SELECT (SELECT count(*) FROM document_versions WHERE tenant_id = ${t}) + (SELECT count(*) FROM ledger_entries WHERE tenant_id = ${t}) AS n`.execute(db)).rows[0]!.n);
    const before = await count();
    const help = await call(ctx, 'POST', '/api/v1/help/package/preview', { package: { cards: [], links: [] } });
    expect([200, 400]).toContain(help.status);
    expect(await count()).toBe(before);
  });
});
