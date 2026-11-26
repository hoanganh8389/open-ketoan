/**
 * Nghiệp vụ phiếu xuất điều chỉnh BH06 (NT-BH-044): lưu nháp / lưu = ghi sổ (nộp ctx.ledger.submit, trừ kho ngay), huỷ (ctx.ledger.cancel =
 * bút toán đảo), xoá nháp. Mọi action ghi chạy trong một giao dịch của runtime: lỗi ở bất kỳ bước nào → phiếu module và sổ cùng huỷ.
 * Lỗi nhập trả HẾT một lần qua details.findings (→ error.fields: Core tô đúng ô).
 */
// [2026-11-26 03:10 PM Võ Hoàng] NGHIEM-THU — NT-BH-044: lưu nháp / ghi sổ / huỷ / xoá nháp phiếu xuất điều chỉnh (đóng góp)
import { randomUUID } from 'node:crypto';
import { AppError, Errors, roundMoney, type ActionContext } from '@bizcity/module-sdk';
import { computeLines, docKeyOf, excludedReason, overStock, purposeOf, toLedgerDoc, totalsOf, type Finding, type LineInput } from './domain/phieu.js';
import {
  branchActive, catalogFor, getPhieu, insertPhieu, markCancelled, markDeleted, markPosted, noTaken, partnerByCode, stockOf, takeNo, taxRates, toPhieu, unitCosts,
  updateDraft, warehousesOf, type SaveRow,
} from './store.js';

/** Hôm nay theo giờ Việt Nam (YYYY-MM-DD). */
export const todayVN = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/**
 * Người lập được chọn ngày lùi (C4) và được sửa / xoá nháp của người khác (C5): người có quyền ghi chứng từ của kế toán (`documents:write` —
 * kế toán, kế toán trưởng, chủ đơn vị). Thu ngân / quản lý cửa hàng (nền staff / viewer, vé POS) chỉ ngày hôm nay, chỉ nháp của mình.
 */
export const isAccountant = (ctx: ActionContext): boolean => ctx.can('documents:write');

export type SaveInput = {
  id?: string; version?: number; mode: 'draft' | 'post'; copiedFrom?: string;
  branchCode: string; warehouseCode: string; docDate: string; reasonCode: string; priced: boolean;
  partnerCode?: string; receiverName?: string; employeeName?: string; description?: string; lines: LineInput[];
};

const invalid = (findings: Finding[]): never => {
  throw Errors.validation(`Phiếu chưa lưu được: ${findings.map((f) => f.title).join(' · ')}`, { findings });
};

/** Lỗi kỳ khoá của Kernel → giữ mã PERIOD_LOCKED, chỉ thêm ô Ngày để màn tô đúng ô. */
function periodLockedAt(e: unknown, field: string): never {
  if (e instanceof AppError && e.code === 'PERIOD_LOCKED') {
    throw Errors.periodLocked(`${e.message} — chọn ngày thuộc kỳ còn mở`, { findings: [{ field, title: 'Ngày thuộc kỳ đã khoá', code: 'PERIOD_LOCKED' }] });
  }
  throw e;
}

/** Kiểm phần đầu phiếu không cần CSDL (ngày, lý do, người nhận) — trả hết lỗi. */
export function headFindings(ctx: ActionContext, i: SaveInput, today: string): Finding[] {
  const f: Finding[] = [];
  if (!i.branchCode?.trim()) f.push({ field: 'branchCode', title: 'Chưa chọn chi nhánh', code: 'XDC_BRANCH' });
  if (!i.warehouseCode?.trim()) f.push({ field: 'warehouseCode', title: 'Chưa chọn kho xuất', code: 'XDC_WAREHOUSE' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.docDate ?? '')) f.push({ field: 'docDate', title: 'Chưa nhập ngày phiếu', code: 'XDC_DATE' });
  else if (i.docDate > today) f.push({ field: 'docDate', title: 'Ngày phiếu không được sau hôm nay', code: 'XDC_DATE' });
  else if (i.docDate !== today && !isAccountant(ctx)) f.push({ field: 'docDate', title: 'Thu ngân chỉ lập phiếu ngày hôm nay — ngày lùi do kế toán lập', code: 'XDC_DATE_TODAY' });
  const reason = (i.reasonCode ?? '').trim();
  if (!reason) f.push({ field: 'reasonCode', title: 'Chưa chọn lý do xuất', code: 'XDC_REASON' });
  else if (excludedReason(reason)) f.push({ field: 'reasonCode', title: `Lý do ${reason} đã có màn riêng (bán, chuyển kho, kiểm kê, nội bộ) — chọn lý do khác`, code: 'XDC_REASON_EXCLUDED' });
  else if (!i.priced && !purposeOf(reason)) {
    f.push({ field: 'reasonCode', title: `Lý do ${reason} chưa có mục đích xuất (chưa đủ tài khoản cho phiếu 0 đ) — chọn lý do khác hoặc nhờ kế toán khai`, code: 'XDC_REASON_NOT_READY' });
  }
  if (i.priced && !i.partnerCode?.trim()) f.push({ field: 'partnerCode', title: 'Phiếu có giá phải chọn người nhận (ghi công nợ 131)', code: 'XDC_PARTNER' });
  return f;
}

export async function save(ctx: ActionContext, i: SaveInput) {
  const today = todayVN();
  const findings = headFindings(ctx, i, today);
  const reason = (i.reasonCode ?? '').trim();
  const purpose = i.priced ? null : purposeOf(reason);
  const prepared = await ctx.data.module(async (tx) => {
    const cur = i.id ? await getPhieu(tx, i.id, true) : null;
    if (cur) {
      if (cur.status !== 'draft') throw Errors.conflict(`Phiếu ${cur.doc_no} đã ghi sổ — không sửa được; huỷ phiếu hoặc bấm "Chép thành phiếu mới"`, { cause: 'not_draft' });
      if (cur.created_by !== ctx.actor.id && !isAccountant(ctx)) throw Errors.forbidden(`Nháp ${cur.doc_no} do người khác lập — chỉ người lập hoặc kế toán sửa được`);
      if (i.version !== undefined && i.version !== cur.row_version) {
        throw Errors.conflict(`Phiếu đã được người khác sửa lúc ${new Date(cur.updated_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} — tải lại rồi sửa tiếp`, { cause: 'draft_changed', version: cur.row_version });
      }
    }
    const branch = i.branchCode?.trim() ?? '';
    if (branch && !(await branchActive(tx, branch))) findings.push({ field: 'branchCode', title: `Chi nhánh ${branch} không có / ngừng dùng`, code: 'XDC_BRANCH' });
    const whs = branch ? await warehousesOf(tx, branch) : [];
    if (i.warehouseCode?.trim() && branch && !whs.some((w) => w.code === i.warehouseCode)) {
      findings.push({ field: 'warehouseCode', title: `Kho ${i.warehouseCode} không phải kho đang dùng của ${branch}`, code: 'XDC_WAREHOUSE' });
    }
    const catalog = await catalogFor(tx, branch, i.lines.map((l) => l.sku ?? ''));
    const { lines, findings: lf } = computeLines(i.lines, catalog, await taxRates(tx), i.priced);
    findings.push(...lf);
    const partner = i.priced && i.partnerCode?.trim() ? await partnerByCode(tx, i.partnerCode.trim()) : null;
    if (i.priced && i.partnerCode?.trim() && !partner) findings.push({ field: 'partnerCode', title: `Người nhận ${i.partnerCode} không có trong danh mục khách hàng`, code: 'XDC_PARTNER' });
    if (i.mode === 'post' && !findings.length) findings.push(...overStock(lines, await stockOf(tx, branch, i.warehouseCode, lines.map((l) => l.sku), true), i.warehouseCode));
    if (findings.length) invalid(findings);
    // C8: đơn giá dưới giá vốn bình quân → cảnh báo, vẫn lưu; ghi vào phiếu + bằng chứng của lần lưu.
    const costs = i.priced ? await unitCosts(tx, branch, i.docDate, lines.map((l) => l.sku)) : new Map<string, number>();
    const belowCost = lines.flatMap((l) => {
      const c = costs.get(l.sku);
      const perBase = l.qty ? (l.amountBeforeTax / l.qty) : 0;
      return c !== undefined && perBase < c ? [{ sku: l.sku, unitPrice: roundMoney(perBase), unitCost: c }] : [];
    });
    const docId = cur?.doc_id ?? randomUUID();
    const keepNo = cur && cur.branch_code === branch && cur.doc_no.slice(0, -4) === `XDC-${branch}-${i.docDate.slice(2, 4)}${i.docDate.slice(5, 7)}-`;
    let docNo = keepNo ? cur.doc_no : await takeNo(tx, ctx.tenant.id, branch, i.docDate);
    while (await noTaken(tx, branch, docNo, docId)) docNo = await takeNo(tx, ctx.tenant.id, branch, i.docDate);
    const row: SaveRow = {
      docId, tenantId: ctx.tenant.id, branchCode: branch, warehouseCode: i.warehouseCode, docNo, docDate: i.docDate, reasonCode: reason, purposeCode: purpose,
      priced: i.priced, partnerCode: partner?.code ?? null, partnerName: partner?.name ?? null, receiverName: (i.receiverName ?? '').trim(),
      employeeName: (i.employeeName ?? '').trim(), description: (i.description ?? '').trim(), lines, total: i.priced ? totalsOf(lines).total : 0,
      copiedFrom: cur ? cur.copied_from : (i.copiedFrom ?? null), belowCost: belowCost.length ? belowCost : null, actor: ctx.actor.id, actorName: ctx.actor.name,
    };
    if (cur) await updateDraft(tx, row); else await insertPhieu(tx, row);
    return { row, belowCost };
  });
  if (prepared.belowCost.length) {
    ctx.meta('warnings', prepared.belowCost.map((b) => `Dưới giá vốn: ${b.sku} giá ${b.unitPrice} < giá vốn ${b.unitCost}`));
    ctx.evidence.note('belowCost', prepared.belowCost);
  }
  const r = prepared.row;
  if (i.mode === 'post') {
    const submitted = await ctx.ledger.submit(toLedgerDoc({
      docId: r.docId, docNo: r.docNo, docDate: r.docDate, branchCode: r.branchCode, warehouseCode: r.warehouseCode, reasonCode: r.reasonCode, purposeCode: r.purposeCode,
      priced: r.priced, partner: r.partnerCode ? { code: r.partnerCode, name: r.partnerName ?? '' } : null, receiverName: r.receiverName, employeeName: r.employeeName,
      description: r.description, lines: r.lines,
    }, 1)).catch((e: unknown) => periodLockedAt(e, 'docDate'));
    await ctx.data.module((tx) => markPosted(tx, r.docId, submitted.status, ctx.actor.id));
  }
  return ctx.data.module(async (tx) => toPhieu(await getPhieu(tx, r.docId)));
}

/** Huỷ phiếu đã ghi sổ: bút toán đảo (ctx.ledger.cancel), lý do bắt buộc; kỳ khoá → PERIOD_LOCKED, phiếu giữ nguyên. */
export async function cancel(ctx: ActionContext, id: string, reason: string) {
  const why = (reason ?? '').trim();
  if (!why) invalid([{ field: 'cancelReason', title: 'Nhập lý do huỷ', code: 'XDC_CANCEL_REASON' }]);
  const row = await ctx.data.module(async (tx) => {
    const r = await getPhieu(tx, id, true);
    if (r.status !== 'posted') throw Errors.conflict(r.status === 'cancelled' ? `Phiếu ${r.doc_no} đã huỷ` : `Phiếu ${r.doc_no} chưa ghi sổ — nháp thì xoá, không huỷ`, { cause: 'not_posted' });
    return r;
  });
  const res = await ctx.ledger.cancel(docKeyOf(id), why).catch((e: unknown) => periodLockedAt(e, 'docDate'));
  await ctx.data.module((tx) => markCancelled(tx, id, res.cancelled ? 'cancelled' : res.requested ? 'cancel_requested' : (row.ledger_status ?? 'cancelled'), why, ctx.actor.id));
  return { ...(await ctx.data.module(async (tx) => toPhieu(await getPhieu(tx, id)))), reversed: res.reversed };
}

/** Xoá nháp: người lập hoặc kế toán (C5); kiểm phiên bản như sửa. Phiếu đã ghi sổ không xoá — huỷ. */
export async function removeDraft(ctx: ActionContext, id: string, version?: number) {
  return ctx.data.module(async (tx) => {
    const r = await getPhieu(tx, id, true);
    if (r.status !== 'draft') throw Errors.conflict(`Phiếu ${r.doc_no} đã ghi sổ — không xoá; dùng Huỷ phiếu`, { cause: 'not_draft' });
    if (r.created_by !== ctx.actor.id && !isAccountant(ctx)) throw Errors.forbidden(`Nháp ${r.doc_no} do người khác lập — chỉ người lập hoặc kế toán xoá được`);
    if (version !== undefined && version !== r.row_version) throw Errors.conflict('Phiếu đã được người khác sửa — tải lại rồi xoá', { cause: 'draft_changed', version: r.row_version });
    await markDeleted(tx, id, ctx.actor.id);
    return { id, deleted: true };
  });
}
