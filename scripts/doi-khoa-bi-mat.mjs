#!/usr/bin/env node
// [2026-11-25 11:32 PM Võ Hoàng] FLOW — platform.secrets (BIZCITY-SECRETS-v1 §4): lệnh đổi khoá gốc BIZCITY_SECRETS_KEY — mã lại khoá dữ liệu của mọi đơn vị, giá trị bí mật không đụng; --dry-run chạy trong giao dịch rồi huỷ (đóng góp)
/**
 * Đổi khoá gốc của bí mật (platform.secrets):
 *
 *   BIZCITY_SECRETS_KEY_CU=<khoá cũ> BIZCITY_SECRETS_KEY=<khoá mới> node scripts/doi-khoa-bi-mat.mjs [--dry-run]
 *
 * - Khoá đọc từ biến môi trường, KHÔNG nhận qua tham số dòng lệnh (lộ ở lịch sử shell / danh sách tiến trình). Không in khoá.
 * - Một giao dịch cho cả bản cài: hỏng một dòng là không đổi dòng nào. Chạy lại vô hại (dòng đã mã bằng khoá mới thì bỏ qua).
 * - `--dry-run`: làm thật trong giao dịch rồi huỷ — in số dòng sẽ mã lại.
 * - Xong (không --dry-run): đặt BIZCITY_SECRETS_KEY = khoá mới trong .env rồi khởi động lại API. Giữ khoá cũ tới khi chắc chắn.
 * - Docker: docker compose run --rm -e BIZCITY_SECRETS_KEY_CU=… -e BIZCITY_SECRETS_KEY=… api node scripts/doi-khoa-bi-mat.mjs
 * - Máy dev (chưa dựng dist): lệnh tự chạy lại qua tsx với điều kiện development.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

if (args.includes('--help') || args.includes('-h')) {
  console.log('BIZCITY_SECRETS_KEY_CU=<khoá cũ> BIZCITY_SECRETS_KEY=<khoá mới> node scripts/doi-khoa-bi-mat.mjs [--dry-run]');
  process.exit(0);
}

/** Nạp mã Platform: bản dựng (dist); chưa dựng thì chạy lại lệnh này qua tsx (mã nguồn, điều kiện development). */
async function loadPlatform() {
  try {
    const logger = await import('@bizcity/platform/core/logger');
    logger.installProcessHandlers({ service: 'doi-khoa-bi-mat' });
    return {
      secrets: await import('@bizcity/platform/core/secrets'),
      client: await import('@bizcity/platform/db/client'),
    };
  } catch (err) {
    if (err?.code !== 'ERR_MODULE_NOT_FOUND' || process.env.BIZCITY_DOI_KHOA_TSX) throw err;
    const r = spawnSync(process.execPath, ['--import', 'tsx', '--conditions=development', fileURLToPath(import.meta.url), ...args], {
      cwd: ROOT, stdio: 'inherit', env: { ...process.env, BIZCITY_DOI_KHOA_TSX: '1' },
    });
    process.exit(r.status ?? 1);
  }
}

const oldKey = process.env.BIZCITY_SECRETS_KEY_CU?.trim();
const newKey = process.env.BIZCITY_SECRETS_KEY?.trim();
if (!oldKey || !newKey) {
  console.error('Cần hai biến môi trường: BIZCITY_SECRETS_KEY_CU (khoá cũ) và BIZCITY_SECRETS_KEY (khoá mới).');
  process.exit(2);
}
if (oldKey === newKey) {
  console.error('Khoá mới trùng khoá cũ — không có gì để đổi.');
  process.exit(2);
}

const { secrets, client } = await loadPlatform();
class HuyChayThu extends Error {}
let result;
try {
  await client.db.transaction().execute(async (trx) => {
    result = await secrets.rotateSecretsMasterKey(trx, oldKey, newKey);
    if (dryRun) throw new HuyChayThu();
  });
} catch (err) {
  if (!(err instanceof HuyChayThu)) {
    const reason = err?.details?.reason ?? err?.code ?? 'ERROR';
    console.error(`Không đổi được khoá gốc (${reason}): ${err?.message ?? err}`);
    await client.closeDb();
    process.exit(1);
  }
} finally {
  // nuot-loi: đóng kết nối lần hai (sau nhánh lỗi) không có gì để báo
  await client.closeDb().catch(() => undefined);
}
const { rewrapped, skipped, foreign } = result;
console.log(`${dryRun ? '[chạy thử — đã huỷ] ' : ''}Mã lại ${rewrapped} khoá dữ liệu · đã dùng khoá mới ${skipped} · khoá gốc lạ (để nguyên) ${foreign}.`);
if (!dryRun && rewrapped > 0) console.log('Tiếp theo: đặt BIZCITY_SECRETS_KEY = khoá mới trong .env rồi khởi động lại API.');
