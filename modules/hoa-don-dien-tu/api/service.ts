/**
 * Nghiệp vụ cài đặt hoá đơn điện tử (NT-BH-048): đọc, lưu sổ, lưu chi nhánh, thử kết nối Viettel, xuất cài đặt hiệu lực cho cầu nối, nhật ký.
 * Bí mật (mật khẩu / token Viettel, mật khẩu portal) chỉ đi qua ctx.secrets: giao diện chỉ thấy "đã đặt lúc … bởi …". Lỗi nhập trả HẾT một lần
 * qua details.findings (→ error.fields: Core tô đúng ô).
 */
// [2026-11-26 09:00 PM Võ Hoàng] NGHIEM-THU — NT-BH-048: lưu / đọc / thử kết nối / xuất cài đặt hoá đơn điện tử (đóng góp)
import { Errors, type ActionContext } from '@bizcity/module-sdk';
import {
  SECRET, SO_TRONG, changedFields, chiNhanhFindings, effectiveFor, ketNoiText, secretAction, soFindings,
  type ChiNhanhFields, type Finding, type SecretInput, type SoFields,
} from './domain/cai-dat.js';
import { activeBranches, branchActive, getCn, getSo, ghiNhatKy, listCn, listNhatKy, upsertCn, upsertSo } from './store.js';

export const P_XEM = 'hoa-don-dien-tu:cai-dat-xem';
export const P_SUA = 'hoa-don-dien-tu:cai-dat-sua';

const invalid = (findings: Finding[]): never => {
  throw Errors.validation(`Chưa lưu được: ${findings.map((f) => f.title).join(' · ')}`, { findings });
};
const who = (ctx: ActionContext) => ({ id: ctx.actor.id, name: ctx.actor.name });
const stale = (at: string, by: string) =>
  Errors.conflict(`Cài đặt đã được ${by || 'người khác'} sửa lúc ${new Date(at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} — tải lại rồi sửa tiếp`, { cause: 'stale' });

/** Trạng thái bí mật cho giao diện — không có giá trị. */
async function info(ctx: ActionContext, name: string, branchCode?: string) {
  return ctx.secrets.has(name, branchCode ? { branchCode } : undefined);
}

/** Đặt / xoá / giữ một bí mật theo ô nhập. Trả tên hành động cho nhật ký (null = giữ). */
async function applySecret(ctx: ActionContext, name: string, v: SecretInput, branchCode?: string): Promise<'dat' | 'xoa' | null> {
  const a = secretAction(v);
  if (a === 'keep') return null;
  const scope = branchCode ? { branchCode } : undefined;
  if (a === 'delete') { await ctx.secrets.delete(name, scope); return 'xoa'; }
  await ctx.secrets.set(name, v!.trim(), { ...(scope ? { scope } : {}), note: 'NT-BH-048' });
  return 'dat';
}

export async function readAll(ctx: ActionContext) {
  const { so, cns, branches } = await ctx.data.module(async (tx) => ({ so: await getSo(tx), cns: await listCn(tx), branches: await activeBranches(tx) }));
  const scope = ctx.branchScope;
  const shown = scope ? branches.filter((b) => scope.includes(b.code)) : branches;
  const byCode = new Map(cns.map((c) => [c.branchCode, c]));
  const soF: SoFields = so ?? SO_TRONG;
  return {
    canEdit: ctx.can(P_SUA),
    so: { ...soF, configured: Boolean(so), version: so?.version ?? 0, updatedByName: so?.updatedByName ?? '', updatedAt: so?.updatedAt ?? null },
    secrets: { password: await info(ctx, SECRET.matKhauViettel), token: await info(ctx, SECRET.maTruyCapViettel) },
    chiNhanh: await Promise.all(shown.map(async (b) => {
      const cn = byCode.get(b.code) ?? null;
      const eff = effectiveFor(b.code, soF, cn);
      return {
        branchCode: b.code, branchName: b.name, level: b.level, parentCode: b.parentCode, configured: Boolean(cn),
        templateCode: cn?.templateCode ?? '', invoiceSeries: cn?.invoiceSeries ?? '', portalEnabled: cn?.portalEnabled ?? false,
        portalAccount: cn?.portalAccount ?? '', portalSupplierId: cn?.portalSupplierId ?? '', active: cn?.active ?? true,
        version: cn?.version ?? 0, updatedByName: cn?.updatedByName ?? '', updatedAt: cn?.updatedAt ?? null,
        effectiveTemplate: eff.templateCode, effectiveSeries: eff.invoiceSeries, templateFrom: eff.templateFrom, seriesFrom: eff.seriesFrom,
        portalPassword: await info(ctx, SECRET.matKhauPortal, b.code),
      };
    })),
  };
}

export type SaveSoInput = SoFields & { version: number; password?: string; token?: string };

export async function saveSo(ctx: ActionContext, i: SaveSoInput) {
  const fields: SoFields = {
    trangThai: i.trangThai, mst: i.mst.trim(), tenPhapLy: i.tenPhapLy.trim(), diaChi: i.diaChi.trim(), dienThoai: i.dienThoai.trim(),
    apiBaseUrl: i.apiBaseUrl.trim().replace(/\/+$/, ''), authMode: i.authMode, username: i.username.trim(), sslVerify: i.sslVerify,
    templateCode: i.templateCode.trim(), invoiceSeries: i.invoiceSeries.trim(), paymentMethod: i.paymentMethod.trim(), autoEnabled: i.autoEnabled, autoMode: i.autoMode,
  };
  const cur = await ctx.data.module((tx) => getSo(tx, true));
  if (cur && cur.version !== i.version) throw stale(cur.updatedAt, cur.updatedByName);
  if (!cur && i.version !== 0) throw Errors.conflict('Cài đặt sổ đã bị xoá hoặc chưa có — tải lại rồi sửa tiếp', { cause: 'stale' });
  const pw = secretAction(i.password); const tk = secretAction(i.token);
  const has = {
    password: pw === 'set' || (pw === 'keep' && (await info(ctx, SECRET.matKhauViettel)).set),
    token: tk === 'set' || (tk === 'keep' && (await info(ctx, SECRET.maTruyCapViettel)).set),
  };
  const findings = soFindings(fields, has);
  if (findings.length) invalid(findings);
  const before = cur ? Object.fromEntries(Object.keys(fields).map((k) => [k, (cur as Record<string, unknown>)[k]])) as SoFields : null;
  const doi = changedFields(before, fields);
  const version = await ctx.data.module((tx) => upsertSo(tx, ctx.tenant.id, fields, who(ctx)));
  const biMat: string[] = [];
  const a1 = await applySecret(ctx, SECRET.matKhauViettel, i.password); if (a1) biMat.push(`${a1 === 'dat' ? 'đặt' : 'xoá'} mật khẩu Viettel`);
  const a2 = await applySecret(ctx, SECRET.maTruyCapViettel, i.token); if (a2) biMat.push(`${a2 === 'dat' ? 'đặt' : 'xoá'} access token`);
  await ctx.data.module((tx) => ghiNhatKy(tx, ctx.tenant.id, who(ctx), 'so', 'luu', { oDaDoi: doi, biMat }));
  ctx.evidence.note('doiTuong', 'so');
  ctx.evidence.note('oDaDoi', doi);
  return { version, oDaDoi: doi, biMat };
}

export type SaveCnInput = ChiNhanhFields & { branchCode: string; version: number; portalPassword?: string };

export async function saveCn(ctx: ActionContext, i: SaveCnInput) {
  const code = i.branchCode.trim();
  const fields: ChiNhanhFields = {
    templateCode: i.templateCode.trim(), invoiceSeries: i.invoiceSeries.trim(), portalEnabled: i.portalEnabled, portalAccount: i.portalAccount.trim(),
    portalSupplierId: i.portalSupplierId.trim(), active: i.active,
  };
  const cur = await ctx.data.module(async (tx) => {
    if (!(await branchActive(tx, code))) invalid([{ field: 'branchCode', title: `Chi nhánh ${code} không có / ngừng dùng`, code: 'HDDT_CN' }]);
    return getCn(tx, code, true);
  });
  if (cur && cur.version !== i.version) throw stale(cur.updatedAt, cur.updatedByName);
  const pa = secretAction(i.portalPassword);
  const hasPw = pa === 'set' || (pa === 'keep' && (await info(ctx, SECRET.matKhauPortal, code)).set);
  const findings = chiNhanhFindings(fields, hasPw);
  if (findings.length) invalid(findings);
  const before = cur ? Object.fromEntries(Object.keys(fields).map((k) => [k, (cur as Record<string, unknown>)[k]])) as ChiNhanhFields : null;
  const doi = changedFields(before, fields);
  const version = await ctx.data.module((tx) => upsertCn(tx, ctx.tenant.id, code, fields, who(ctx)));
  const a = await applySecret(ctx, SECRET.matKhauPortal, i.portalPassword, code);
  const biMat = a ? [`${a === 'dat' ? 'đặt' : 'xoá'} mật khẩu portal`] : [];
  await ctx.data.module((tx) => ghiNhatKy(tx, ctx.tenant.id, who(ctx), `chi-nhanh:${code}`, 'luu', { oDaDoi: doi, biMat }));
  ctx.evidence.note('doiTuong', `chi-nhanh:${code}`);
  ctx.evidence.note('oDaDoi', doi);
  return { branchCode: code, version, oDaDoi: doi, biMat };
}

/**
 * Thử kết nối: máy chủ gọi GET <API base URL> (Basic / Bearer theo cài đặt, chờ tối đa 15 giây) — như nút "Thử kết nối" của cụm website.
 * Không gọi lệnh phát hành / tra cứu hoá đơn nào. Ghi nhật ký mã HTTP (không ghi tài khoản).
 */
export async function thuKetNoi(ctx: ActionContext) {
  const so = await ctx.data.module((tx) => getSo(tx));
  if (!so?.apiBaseUrl) invalid([{ field: 'apiBaseUrl', title: 'Chưa khai API base URL — lưu cài đặt sổ trước', code: 'HDDT_URL_THIEU' }]);
  const s = so!;
  const headers: Record<string, string> = { accept: 'application/json' };
  if (s.authMode === 'basic') {
    const pw = await ctx.secrets.get(SECRET.matKhauViettel);
    if (s.username && pw) headers.authorization = `Basic ${Buffer.from(`${s.username}:${pw}`).toString('base64')}`;
  } else {
    const tk = await ctx.secrets.get(SECRET.maTruyCapViettel);
    if (tk) headers.authorization = `Bearer ${tk}`;
  }
  const t0 = Date.now();
  let code: number | null = null; let err: string | undefined;
  try {
    const res = await fetch(s.apiBaseUrl, { method: 'GET', headers, signal: AbortSignal.timeout(15_000), redirect: 'manual' });
    code = res.status;
    await res.body?.cancel().catch(() => undefined); // nuot-loi: chỉ cần mã HTTP, bỏ thân phản hồi; huỷ đọc lỗi không ảnh hưởng kết quả
  } catch (e) {
    err = (e as Error)?.name === 'TimeoutError' ? 'quá 15 giây không trả lời' : String((e as Error)?.message ?? e).slice(0, 200);
  }
  const ms = Date.now() - t0;
  const kq = ketNoiText(code, err);
  await ctx.data.module((tx) => ghiNhatKy(tx, ctx.tenant.id, who(ctx), 'ket-noi', 'thu-ket-noi', { httpCode: code, ms, ok: kq.ok, ...(err ? { loi: err } : {}) }));
  ctx.evidence.note('httpCode', code);
  return { ok: kq.ok, httpCode: code, ms, message: kq.text };
}

/** Cài đặt hiệu lực theo chi nhánh cho cầu nối (S-HD-4) — KHÔNG có bí mật; bí mật đọc riêng qua action hoa-don-dien-tu.secrets.read. */
export async function exportFor(ctx: ActionContext, branchCode?: string) {
  const { so, cns, branches } = await ctx.data.module(async (tx) => ({ so: await getSo(tx), cns: await listCn(tx), branches: await activeBranches(tx) }));
  const byCode = new Map(cns.map((c) => [c.branchCode, c]));
  const soF = so ?? SO_TRONG;
  const codes = branchCode ? branches.filter((b) => b.code === branchCode).map((b) => b.code) : branches.map((b) => b.code);
  if (branchCode && !codes.length) throw Errors.notFound(`chi nhánh ${branchCode}`);
  const configVersion = `${so?.version ?? 0}.${cns.reduce((s, c) => s + c.version, 0)}`;
  return {
    configured: Boolean(so), configVersion,
    secretNames: SECRET,
    chiNhanh: codes.map((c) => effectiveFor(c, soF, byCode.get(c) ?? null)),
  };
}

export async function nhatKy(ctx: ActionContext, limit: number) {
  return { items: await ctx.data.module((tx) => listNhatKy(tx, limit)) };
}
