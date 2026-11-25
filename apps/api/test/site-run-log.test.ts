// [2026-11-22 03:11 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — B7b-2 (S039-19): ca kiểm nhật ký vận hành tách theo site — lỗi cô lập ở chế độ multi
/**
 * Nhật ký vận hành dạng tệp (core/run-log.ts) — PHASE-039 B7b-2. Mọi site đều có đơn vị mã 1:
 *   - site ngầm định / ngoài ngữ cảnh: đường cũ <DATA_DIR>/nhat-ky/<luồng>/<đơn vị>/ (bản cài một công ty không đổi);
 *   - site A, site B cùng đơn vị 1: ghi / đọc / dọn tách nhau dưới _sites/<site>/, không thấy dòng của nhau, không thấy của site ngầm định;
 *   - pool tạm lúc tạo site (prov:<mã>) ghi vào đúng site đó;
 *   - lượt dùng thư viện: bộ đệm ghi dồn NGOÀI ngữ cảnh yêu cầu vẫn vào đúng site.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { withRequestContext } from '../src/core/request-context.js';
import { appendRunLog, pruneRunLog, readRunLog, runLogSite } from '@bizcity/platform/core/run-log';
import { flushLibraryUsage, libraryUsageRows, recordLibraryUsage, resetLibraryUsage } from '@bizcity/platform/core/libraries/usage';

const A = '01JSITEAAAAAAAAAAAAAAAAAAA';
const B = '01JSITEBBBBBBBBBBBBBBBBBBB';
const inSite = <T>(siteId: string | undefined, fn: () => T): T =>
  withRequestContext({ requestId: 'r-runlog', correlationId: 'r-runlog', ...(siteId ? { siteId } : {}) }, fn);
const prevDataDir = process.env.DATA_DIR;
let dir = '';
const month = new Date().toISOString().slice(0, 7);

beforeAll(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'okt-b7b2-'));
  process.env.DATA_DIR = dir;
});
afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = prevDataDir;
  rmSync(dir, { recursive: true, force: true });
});

describe('PHASE-039 B7b-2 — nhật ký vận hành tách theo site', () => {
  it('site của nhật ký: ngữ cảnh, ghi đè, pool tạm prov:', () => {
    expect(runLogSite()).toBe('default');
    expect(inSite(A, () => runLogSite())).toBe(A);
    expect(inSite(`prov:${A}`, () => runLogSite())).toBe(A);
    expect(inSite(A, () => runLogSite(B))).toBe(B);
  });

  it('site ngầm định giữ đường cũ; A và B cùng đơn vị 1 ghi tách, đọc không lẫn', async () => {
    await appendRunLog('kiem-thu', '1', { cua: 'mac-dinh' });
    await inSite(A, () => appendRunLog('kiem-thu', '1', { cua: 'A' }));
    await inSite(B, () => appendRunLog('kiem-thu', '1', { cua: 'B' }));
    await inSite(`prov:${A}`, () => appendRunLog('kiem-thu', '1', { cua: 'A-luc-tao' }));

    expect(existsSync(path.join(dir, 'nhat-ky', 'kiem-thu', '1', `${month}.jsonl`))).toBe(true);
    expect(existsSync(path.join(dir, 'nhat-ky', '_sites', A, 'kiem-thu', '1', `${month}.jsonl`))).toBe(true);
    expect(existsSync(path.join(dir, 'nhat-ky', '_sites', B, 'kiem-thu', '1', `${month}.jsonl`))).toBe(true);

    const cua = (rows: Array<{ data: { cua: string } }>) => rows.map((r) => r.data.cua);
    expect(cua(await readRunLog('kiem-thu', { tenantId: '1' }))).toEqual(['mac-dinh']);
    expect(cua(await inSite(A, () => readRunLog('kiem-thu', { tenantId: '1' })))).toEqual(['A', 'A-luc-tao']);
    expect(cua(await inSite(B, () => readRunLog('kiem-thu')))).toEqual(['B']); // mọi đơn vị của site B: vẫn chỉ B
    expect(cua(await readRunLog('kiem-thu', { site: B }))).toEqual(['B']);
  });

  it('dọn tệp tháng cũ chỉ ở site đang chạy', async () => {
    const old = '2020-01.jsonl';
    for (const base of [path.join(dir, 'nhat-ky', 'kiem-thu', '1'), path.join(dir, 'nhat-ky', '_sites', A, 'kiem-thu', '1')]) {
      mkdirSync(base, { recursive: true });
      writeFileSync(path.join(base, old), '');
    }
    await inSite(A, () => pruneRunLog('kiem-thu', 3));
    expect(existsSync(path.join(dir, 'nhat-ky', '_sites', A, 'kiem-thu', '1', old))).toBe(false);
    expect(existsSync(path.join(dir, 'nhat-ky', 'kiem-thu', '1', old))).toBe(true);
  });

  it('lượt dùng thư viện: ghi dồn ngoài ngữ cảnh vẫn vào đúng site', async () => {
    resetLibraryUsage();
    const result = { library: { id: 'tai-khoan', version: '1' }, findings: [], resolved: '111' } as never;
    inSite(A, () => { recordLibraryUsage(1, result, '111', 'api'); recordLibraryUsage(1, result, '111', 'api'); });
    inSite(B, () => recordLibraryUsage(1, result, '111', 'api'));
    expect((await flushLibraryUsage({} as never)).rows).toBe(2); // ngoài ngữ cảnh — như bộ đếm ghi dồn
    const day = new Date().toISOString().slice(0, 10);
    const q = { from: day, to: day };
    expect((await inSite(A, () => libraryUsageRows(1, q))).map((r) => r.count)).toEqual([2]);
    expect((await inSite(B, () => libraryUsageRows(1, q))).map((r) => r.count)).toEqual([1]);
    expect(await libraryUsageRows(1, q)).toEqual([]); // site ngầm định không thấy lượt của A, B
  });
});
