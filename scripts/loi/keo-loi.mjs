#!/usr/bin/env node
// [2026-11-25 Nguyễn Văn Thủy] Kéo lỗi hệ thống (HT20) của con dev về máy local / đánh dấu đã sửa / yêu cầu dựng lại — docs/ops/TU-DONG-SUA-LOI.md (đóng góp)
//
//   KET_NOI_URL=https://ketoan-dev.quantri.thegioisua.com  KET_NOI_KEY=kn_…   (hoặc ghi vào tệp .loi/ket-noi.env: KET_NOI_URL=… / KET_NOI_KEY=…)
//   node scripts/loi/keo-loi.mjs danh-sach [--phan-he mua-hang] [--loai phan-mem|tu-choi] [--tat-ca] [--co-the-nhan]
//      --co-the-nhan: bỏ mục máy khác đang giữ. danh-dau dang_sua bị máy khác giữ → thoát mã 3 (né mục đó).
//   node scripts/loi/keo-loi.mjs danh-dau <mã-mục> <moi|yeu_cau|dang_sua|da_sua|bo_qua> [--commit <sha>] [--ghi-chu "…"]
//   node scripts/loi/keo-loi.mjs dung-lai [--ghi-chu "…"]
//   node scripts/loi/keo-loi.mjs nhat-ky "<tóm tắt>" [--commit <sha>] [--muc fp1,fp2] [--chi-tiet "…"]   (hiện ở HT20 → Nhật ký sửa)
//   node scripts/loi/keo-loi.mjs nhip "<đang làm gì>"                    (báo HT20 lịch tự sửa vẫn chạy)
//
// danh-sach ghi thêm .loi/danh-sach.json (đầy đủ, để người / AI đọc). Mặc định chỉ mục chưa xong (mới, yêu cầu, đang sửa, tái phát).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

const goc = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const thuMuc = path.join(goc, '.loi');
const envFile = path.join(thuMuc, 'ket-noi.env');
if (existsSync(envFile)) for (const l of readFileSync(envFile, 'utf8').split(/\r?\n/)) { const m = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(l); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
const URL_ = (process.env.KET_NOI_URL ?? '').replace(/\/+$/, '');
const KEY = process.env.KET_NOI_KEY ?? '';
if (!URL_ || !KEY) { console.error('Thiếu KET_NOI_URL / KET_NOI_KEY (đặt biến môi trường hoặc tệp .loi/ket-noi.env) — tạo khoá ở HT13 → Công cụ & giám sát'); process.exit(2); }

// Nhận diện máy: "<người git>@<tên máy>" (đổi bằng KET_NOI_MAY). Máy chủ ghi thêm IP. Mục máy khác đang giữ (Đang sửa ≤ 30 phút) thì né.
const gitTen = (() => { try { return execSync('git config user.name', { cwd: goc, encoding: 'utf8' }).trim(); } catch { return ''; } })();
const MAY = process.env.KET_NOI_MAY || `${gitTen || os.userInfo().username}@${os.hostname()}`;
const args = process.argv.slice(2);
const lay = (ten) => { const i = args.indexOf(ten); return i >= 0 ? args[i + 1] : undefined; };
const goi = async (p, body) => {
  const res = await fetch(URL_ + p, { method: body ? 'POST' : 'GET', headers: { 'x-ket-noi-key': KEY, 'x-ket-noi-may': encodeURIComponent(MAY), 'x-ket-noi-viec': encodeURIComponent(process.env.KET_NOI_VIEC ?? args.slice(0, 2).join(' ')), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.ok === false) { console.error(`Lỗi ${res.status}: ${j.error?.message ?? JSON.stringify(j).slice(0, 300)}`); process.exit(res.status === 409 ? 3 : 1); }
  return j.data;
};

const lenh = args[0];
if (lenh === 'danh-sach') {
  const q = new URLSearchParams();
  if (lay('--phan-he')) q.set('phanHe', lay('--phan-he'));
  if (lay('--loai')) q.set('loai', lay('--loai'));
  if (!args.includes('--tat-ca')) q.set('status', 'moi,yeu_cau,dang_sua,tai_phat');
  const d = await goi(`/api/v1/ket-noi/loi?${q}`);
  for (const x of d.items) x.mayKhacGiu = Boolean(x.giuDen && x.may && x.may !== MAY);
  if (args.includes('--co-the-nhan')) d.items = d.items.filter((x) => !x.mayKhacGiu);
  mkdirSync(thuMuc, { recursive: true });
  writeFileSync(path.join(thuMuc, 'danh-sach.json'), JSON.stringify(d, null, 2), 'utf8');
  console.log(`Máy này: ${MAY}`);
  for (const m of Object.values(d.nhip?.may ?? {})) if (m.may !== MAY) console.log(`  máy khác: ${m.may} (${m.ip}) ghé ${m.luc} — ${m.viec}`);
  console.log(`Tự sửa: ${d.tuSua ? 'BẬT' : 'tắt'} · ${d.items.length}/${d.tong} mục · quét lần cuối ${d.lanQuet?.luc ?? '—'}${d.lanQuet?.loi ? ` (lỗi: ${d.lanQuet.loi})` : ''}`);
  for (const x of d.items) {
    console.log(`\n[${x.fp}] ${x.tenPhanHe} · ${x.loai === 'phan-mem' ? 'LỖI PHẦN MỀM' : 'từ chối'} · ${x.trangThai} · ${x.count} lần · cuối ${x.last}`);
    if (x.giuDen) console.log(`  ${x.mayKhacGiu ? '⚠ MÁY KHÁC ĐANG SỬA — bỏ qua' : 'máy này đang giữ'}: ${x.may} (${x.ip ?? '?'}) tới ${x.giuDen}`);
    console.log(`  ${x.errCode} ${x.method} ${x.route} → ${x.status}`);
    console.log(`  ${x.msg}`);
    if (x.lastErrFp || x.lastBan) console.log(`  errFp ${x.lastErrFp ?? '—'} · bản ${x.lastBan ?? '—'} · mã tra cứu ${x.lastReqId}`);
    console.log(`  tra mã: ${URL_}/dev/tra-ma?ma=${x.lastReqId}&at=${encodeURIComponent(x.last)}`);
  }
  console.log(`\nĐã ghi ${path.join('.loi', 'danh-sach.json')}`);
} else if (lenh === 'danh-dau') {
  const [, fp, status] = args;
  if (!fp || !status) { console.error('Dùng: danh-dau <mã-mục> <trạng thái> [--commit sha] [--ghi-chu "…"]'); process.exit(2); }
  await goi('/api/v1/ket-noi/loi/trang-thai', { fp, status, ...(lay('--commit') ? { commit: lay('--commit') } : {}), ...(lay('--ghi-chu') ? { note: lay('--ghi-chu') } : {}) });
  console.log(`Đã đánh dấu ${fp} → ${status}`);
} else if (lenh === 'dung-lai') {
  const d = await goi('/api/v1/ket-noi/dung-lai/yeu-cau', lay('--ghi-chu') ? { note: lay('--ghi-chu') } : {});
  console.log(`Đã yêu cầu dựng lại (${d.id}) — cron máy chủ nhận trong ~1 phút, xem kết quả ở HT20`);
} else if (lenh === 'nhat-ky') {
  const tomTat = args[1];
  if (!tomTat) { console.error('Dùng: nhat-ky "<tóm tắt>" [--commit sha] [--muc fp1,fp2] [--chi-tiet "…"]'); process.exit(2); }
  await goi('/api/v1/ket-noi/nhat-ky', { tomTat, fps: (lay('--muc') ?? '').split(',').filter(Boolean), ...(lay('--commit') ? { commit: lay('--commit') } : {}), ...(lay('--chi-tiet') ? { chiTiet: lay('--chi-tiet') } : {}) });
  console.log('Đã ghi nhật ký sửa (HT20)');
} else if (lenh === 'nhip') {
  process.env.KET_NOI_VIEC = args[1] ?? 'đang chạy';
  await goi('/api/v1/ket-noi/loi?status=__');
  console.log('Đã báo nhịp');
} else {
  console.error('Lệnh: danh-sach | danh-dau | dung-lai | nhat-ky | nhip (xem đầu tệp)'); process.exit(2);
}
