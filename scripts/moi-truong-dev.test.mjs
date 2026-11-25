// [2026-11-25 08:41 PM Johnny Chu - Chu Hoàng Anh] FLOW — STD-12: thử phần thuần của moi-truong-dev — so đỏ mới với main, phiên bản Node, gói cũ
import test from 'node:test';
import assert from 'node:assert/strict';
import { installStale, newReds, nodeOk } from './moi-truong-dev.mjs';

const sc = (...rs) => ({ results: rs });
const r = (id, status, fps) => ({ id, title: id, status, findings: fps.map((fp) => ({ fp, file: fp.split('|')[1], message: fp })) });

test('đỏ có sẵn trên main không chặn; chỉ phát hiện mới của nhánh bị chặn', () => {
  const main = sc(r('SC-UI-1', 'fail', ['SC-UI-1|a.tsx|x', 'SC-UI-1|b.tsx|y']), r('SC-DOC-4', 'fail', ['SC-DOC-4|d.md|z']));
  const head = sc(r('SC-UI-1', 'fail', ['SC-UI-1|a.tsx|x', 'SC-UI-1|b.tsx|y', 'SC-UI-1|moi.tsx|w']), r('SC-DOC-4', 'fail', ['SC-DOC-4|d.md|z']), r('SC-UI-2', 'fail', ['SC-UI-2|f.tsx|f.tsx']));
  const got = newReds(main, head);
  assert.deepEqual(got.map((x) => [x.id, x.findings.map((f) => f.fp)]), [['SC-UI-1', ['SC-UI-1|moi.tsx|w']], ['SC-UI-2', ['SC-UI-2|f.tsx|f.tsx']]]);
});

test('nhánh sửa bớt đỏ hoặc giữ nguyên thì không có đỏ mới', () => {
  const main = sc(r('SC-UI-1', 'fail', ['SC-UI-1|a.tsx|x', 'SC-UI-1|b.tsx|y']));
  assert.deepEqual(newReds(main, sc(r('SC-UI-1', 'fail', ['SC-UI-1|a.tsx|x']))), []);
  assert.deepEqual(newReds(main, sc(r('SC-UI-1', 'pass', []))), []);
  assert.deepEqual(newReds(main, sc(r('SC-X-1', 'debt', ['SC-X-1|a|b']))), []);
});

test('kiểm lỗi khi chạy ở nhánh mà main không lỗi thì chặn', () => {
  assert.equal(newReds(sc(), sc({ id: 'SC-Y-1', title: 'y', status: 'error', findings: [] })).length, 1);
});

test('phiên bản Node theo engines', () => {
  assert.equal(nodeOk('v22.12.0', '>=22.12'), true);
  assert.equal(nodeOk('v24.1.0', '>=22.12'), true);
  assert.equal(nodeOk('v22.11.9', '>=22.12'), false);
  assert.equal(nodeOk('v20.18.0', '>=22.12'), false);
});

test('gói cài cũ hơn package-lock thì cần npm install', () => {
  assert.equal(installStale(5000, null), true);
  assert.equal(installStale(10_000, 2000), true);
  assert.equal(installStale(2000, 10_000), false);
});
