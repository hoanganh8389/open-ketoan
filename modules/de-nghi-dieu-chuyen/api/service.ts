/**
 * Nghiệp vụ đề nghị điều chuyển KHO04 (NT-BH-056).
 *
 * Luồng: Lập (máy bán hoặc màn KHO04) → Chờ duyệt → người có quyền duyệt bấm Duyệt → lập phiếu chuyển kho KHO01 (xuất luôn, chi nhánh nhận
 * xác nhận Nhận hàng / Từ chối ở KHO01 như mọi phiếu chuyển kho) → Đã lập chuyển kho. Hoặc Từ chối (lý do bắt buộc), hoặc người lập Huỷ khi còn chờ.
 *
 * Phiếu KHO01 do MÀN gọi thẳng action Kho `kho.transfer.create` (POST /api/v1/kho/transfers) bằng phiên người duyệt — `ctx.actions.call` của
 * Platform chỉ gọi action đọc, module không tự lập phiếu của phân hệ Kho (như NT-BH-041). Vì vậy Duyệt có ba bước:
 *   prepare — khoá đề nghị, kiểm (Chờ duyệt, quyền kho:chuyen-kho-lap, tồn kho xuất), giữ chỗ "đang lập", trả khuôn phiếu KHO01;
 *   record  — KHO01 lưu xong: ghi số / id phiếu vào đề nghị → Đã lập chuyển kho; gửi lại cùng phiếu không ghi hai lần;
 *   abort   — KHO01 từ chối (thiếu tồn, kỳ khoá…): bỏ chỗ "đang lập", đề nghị về Chờ duyệt.
 * Sổ kho, bút toán của việc chuyển do KHO01 ghi — đúng như lập phiếu chuyển kho bằng tay.
 */
// [2026-11-28 10:00 AM Võ Hoàng] NGHIEM-THU — NT-BH-056: nghiệp vụ đề nghị điều chuyển (đóng góp)
import { Errors, type ActionContext } from '@bizcity/module-sdk';
import { STATUS_LABEL, canChange, checkLines, receiveCandidates, vnToday, type Finding, type LineIn } from './domain/rules.js';
import {
  branches, decide, defaultWarehouse, getPhieu, insertPhieu, partnerByCode, products, setIntent, setTransfer, stockOf, takeNo, toPhieu, updatePhieu,
  type Header, type Tx,
} from './store.js';

export const P_DUYET = 'de-nghi-dieu-chuyen:duyet';
const KHO_TRANSFER_PERMISSION = 'kho:chuyen-kho-lap';
/** Chỗ "đang lập KHO01" quá hạn này thì người khác duyệt được (người trước đóng trình duyệt giữa chừng). */
const INTENT_TTL_MS = 120_000;

export const isApprover = (ctx: ActionContext): boolean => ctx.can(P_DUYET);

const findingsError = (message: string, findings: Finding[]) => Errors.validation(message, { findings });

/** Danh mục cho form: chi nhánh nhận được chọn, kho xuất mặc định, tên chi nhánh đề nghị. */
export async function danhMuc(ctx: ActionContext, branch: string) {
  // Chưa chọn chi nhánh (màn mới mở, chưa lọc) → danh mục rỗng, không báo lỗi.
  if (!branch) return { branchCode: '', branchName: '', warehouseCode: '', receiveBranches: [], canApprove: isApprover(ctx), canCreateTransfer: ctx.can(KHO_TRANSFER_PERMISSION), statuses: STATUS_LABEL };
  return ctx.data.module(async (tx) => {
    const all = await branches(tx);
    const me = all.find((b) => b.code === branch);
    if (!me) throw Errors.validation(`Không có chi nhánh ${branch} trong danh mục kế toán`, { findings: [{ field: 'branchCode', code: 'DNDC_BRANCH_UNKNOWN', title: `Không có chi nhánh ${branch}`, level: 'block' }] });
    return {
      branchCode: me.code, branchName: me.name, warehouseCode: await defaultWarehouse(tx, me.code),
      receiveBranches: receiveCandidates(me.code, all), canApprove: isApprover(ctx), canCreateTransfer: ctx.can(KHO_TRANSFER_PERMISSION),
      statuses: STATUS_LABEL,
    };
  });
}

/** Tồn kho xuất + tên / ĐVT các mã (cho cột Tồn của form, máy bán dùng khi tìm hàng). Không có giá vốn. */
export async function hang(ctx: ActionContext, branch: string, skus: string[]) {
  if (!branch || !skus.length) return { warehouseCode: '', items: [] };
  return ctx.data.module(async (tx) => {
    const wh = await defaultWarehouse(tx, branch);
    const [names, stock] = await Promise.all([products(tx, skus), stockOf(tx, branch, wh, true, skus)]);
    return { warehouseCode: wh, items: skus.map((sku) => ({ sku, name: names.get(sku)?.name ?? '', unit: names.get(sku)?.unit ?? '', active: names.get(sku)?.active ?? false, stock: stock.get(sku) ?? 0 })) };
  });
}

export type SaveInput = {
  id?: string; version?: number; branchCode: string; toBranchCode: string; partnerCode?: string; partnerName?: string; reasonCode?: string;
  staffName?: string; note?: string; lines: LineIn[]; source: 'ketoan' | 'pos';
};

/** Kiểm + dựng phần đầu đề nghị (dùng chung lập / sửa). Khoá tồn kho xuất theo mã tới hết giao dịch. */
async function build(tx: Tx, i: SaveInput, docDate: string): Promise<Header> {
  const all = await branches(tx);
  const me = all.find((b) => b.code === i.branchCode);
  if (!me) throw findingsError(`Không có chi nhánh ${i.branchCode} trong danh mục kế toán`, [{ field: 'branchCode', code: 'DNDC_BRANCH_UNKNOWN', title: `Không có chi nhánh ${i.branchCode}`, level: 'block' }]);
  if (!i.toBranchCode) throw findingsError('Vui lòng chọn chi nhánh nhận', [{ field: 'toBranchCode', code: 'DNDC_TO_REQUIRED', title: 'Chưa chọn chi nhánh nhận', level: 'block' }]);
  const to = receiveCandidates(me.code, all).find((b) => b.code === i.toBranchCode);
  if (!to) {
    throw findingsError(`Chi nhánh ${i.toBranchCode} không nhận được hàng của ${me.code} — chỉ chuyển cho chi nhánh cùng cấp trên hoặc chi nhánh cấp trên`,
      [{ field: 'toBranchCode', code: 'DNDC_TO_NOT_ALLOWED', title: `Chi nhánh ${i.toBranchCode} không có trong danh sách chi nhánh nhận`, level: 'block' }]);
  }
  const wh = await defaultWarehouse(tx, me.code);
  if (!wh) throw findingsError(`Chi nhánh ${me.code} chưa có kho đang dùng — khai kho ở Danh mục kho`, [{ field: 'branchCode', code: 'DNDC_NO_WAREHOUSE', title: 'Chi nhánh chưa có kho', level: 'block' }]);
  const skus = i.lines.map((l) => l.sku.trim()).filter(Boolean);
  const [names, stock] = await Promise.all([products(tx, skus), stockOf(tx, me.code, wh, true, skus, true)]);
  const c = checkLines(i.lines, names, stock);
  let partner: { code: string; name: string } | null = null;
  const pc = (i.partnerCode ?? '').trim();
  // Khách chỉ để tham khảo (không bắt buộc, không vào KHO01): mã có trong danh mục đối tượng thì lấy tên ở đó; mã khách của website
  // (máy bán tìm khách ở website) chưa có ở kế toán thì giữ nguyên mã + tên gửi lên, không chặn — như máy bán cũ.
  if (pc) partner = (await partnerByCode(tx, pc)) ?? { code: pc, name: (i.partnerName ?? '').trim() };
  if (c.findings.length) throw findingsError(`Chưa lưu được đề nghị: ${c.findings.map((f) => f.title).join(' · ')}`, c.findings);
  return {
    docDate, branchCode: me.code, warehouseCode: wh, toBranchCode: to.code, toBranchName: to.name, partnerCode: partner?.code ?? null,
    partnerName: partner ? (i.partnerName?.trim() || partner.name) : null, reasonCode: (i.reasonCode ?? '').trim() || null,
    staffName: (i.staffName ?? '').trim(), note: (i.note ?? '').trim(), lines: c.lines, totalItems: c.totalItems, totalQty: c.totalQty,
  };
}

/** Lập mới (Chờ duyệt) hoặc sửa đề nghị đang chờ. */
export async function luuDeNghi(ctx: ActionContext, i: SaveInput) {
  const today = vnToday();
  const row = await ctx.data.module(async (tx) => {
    if (i.id) {
      const cur = await getPhieu(tx, i.id, true);
      const ok = canChange({ status: cur.status, branchCode: cur.branch_code, docDate: cur.doc_date }, { approver: isApprover(ctx), branches: ctx.branchScope, today });
      if (!ok.ok) throw Errors.conflict(ok.why, { cause: 'state', status: cur.status });
      if (i.version !== undefined && i.version !== cur.row_version) {
        throw Errors.conflict(`Đề nghị ${cur.doc_no} vừa được người khác sửa — tải lại rồi sửa tiếp`, { cause: 'version', status: cur.status });
      }
      if (cur.branch_code !== i.branchCode) throw findingsError('Không đổi được chi nhánh đề nghị của đề nghị đã lập', [{ field: 'branchCode', code: 'DNDC_BRANCH_FIXED', title: 'Chi nhánh đề nghị cố định', level: 'block' }]);
      const h = await build(tx, i, cur.doc_date);
      await updatePhieu(tx, i.id, h, ctx.actor.id);
      return getPhieu(tx, i.id);
    }
    const h = await build(tx, i, today);
    const no = await takeNo(tx, ctx.tenant.id, h.branchCode, today);
    const id = await insertPhieu(tx, ctx.tenant.id, no, h, i.source, ctx.actor.id, ctx.actor.name ?? '');
    return getPhieu(tx, id);
  });
  return toPhieu(row);
}

/** Người lập huỷ đề nghị đang chờ (người duyệt huỷ được mọi đề nghị đang chờ). */
export async function cancel(ctx: ActionContext, id: string, reason: string) {
  const today = vnToday();
  return toPhieu(await ctx.data.module(async (tx) => {
    const cur = await getPhieu(tx, id, true);
    const ok = canChange({ status: cur.status, branchCode: cur.branch_code, docDate: cur.doc_date }, { approver: isApprover(ctx), branches: ctx.branchScope, today });
    if (!ok.ok) throw Errors.conflict(ok.why, { cause: 'state', status: cur.status });
    await decide(tx, id, { status: 'cancelled', reason, actor: ctx.actor.id, actorName: ctx.actor.name ?? '' });
    return getPhieu(tx, id);
  }));
}

/** Người duyệt từ chối đề nghị đang chờ (lý do bắt buộc ≥ 5 ký tự). */
export async function reject(ctx: ActionContext, id: string, reason: string) {
  return toPhieu(await ctx.data.module(async (tx) => {
    const cur = await getPhieu(tx, id, true);
    if (cur.status !== 'pending') throw Errors.conflict(`Đề nghị ${cur.doc_no} đang "${STATUS_LABEL[cur.status]}" — chỉ từ chối đề nghị Chờ duyệt`, { cause: 'state', status: cur.status });
    if (reason.trim().length < 5) throw findingsError('Nhập lý do từ chối (ít nhất 5 ký tự)', [{ field: 'reason', code: 'DNDC_REASON_REQUIRED', title: 'Thiếu lý do từ chối', level: 'block' }]);
    await decide(tx, id, { status: 'rejected', reason: reason.trim(), actor: ctx.actor.id, actorName: ctx.actor.name ?? '' });
    return getPhieu(tx, id);
  }));
}

export type ApproveInput = { step: 'prepare' | 'record' | 'abort'; note?: string; transfer?: { id: string; docNo: string; status?: string } };

/** Duyệt — ba bước prepare / record / abort (xem đầu tệp). */
export async function duyetDeNghi(ctx: ActionContext, id: string, i: ApproveInput) {
  if (i.step === 'abort') {
    return toPhieu(await ctx.data.module(async (tx) => {
      const cur = await getPhieu(tx, id, true);
      if (cur.status === 'approved' && cur.intent?.by === ctx.actor.id) await setIntent(tx, id, null, 'pending', ctx.actor.id);
      return getPhieu(tx, id);
    }));
  }
  if (i.step === 'record') {
    const t = i.transfer;
    if (!t?.id || !t.docNo) throw findingsError('Thiếu phiếu chuyển kho KHO01 vừa lập', [{ field: 'transfer', code: 'DNDC_TRANSFER_REQUIRED', title: 'Thiếu phiếu KHO01', level: 'block' }]);
    return toPhieu(await ctx.data.module(async (tx) => {
      const cur = await getPhieu(tx, id, true);
      if (cur.status === 'converted' && cur.transfer?.id === t.id) return cur; // gửi lại cùng phiếu: không ghi hai lần
      if (cur.status !== 'approved' && cur.status !== 'pending') {
        throw Errors.conflict(`Đề nghị ${cur.doc_no} đang "${STATUS_LABEL[cur.status]}" — không ghi được phiếu chuyển kho`, { cause: 'state', status: cur.status });
      }
      await setTransfer(tx, id, { id: t.id, docNo: t.docNo, ...(t.status ? { status: t.status } : {}) }, ctx.actor.id, ctx.actor.name ?? '');
      return getPhieu(tx, id);
    }));
  }
  if (!ctx.can(KHO_TRANSFER_PERMISSION)) throw Errors.forbidden('Cần quyền Lập phiếu chuyển kho (KHO01) để duyệt — nhờ quản trị cho quyền kho:chuyen-kho-lap');
  return ctx.data.module(async (tx) => {
    const cur = await getPhieu(tx, id, true);
    if (cur.status === 'approved' && cur.intent && cur.intent.by !== ctx.actor.id && Date.now() - Date.parse(cur.intent.at) < INTENT_TTL_MS) {
      throw Errors.conflict(`Đề nghị ${cur.doc_no} đang được ${cur.intent.byName || cur.intent.by} duyệt — chờ xong rồi tải lại`,
        { cause: 'approve_busy', status: cur.status });
    }
    if (cur.status !== 'pending' && cur.status !== 'approved') {
      throw Errors.conflict(`Đề nghị ${cur.doc_no} đang "${STATUS_LABEL[cur.status]}" — chỉ duyệt đề nghị Chờ duyệt`, { cause: 'state', status: cur.status });
    }
    // Tồn có thể đã đổi từ lúc lập: kiểm lại ở kho xuất trước khi lập KHO01 (KHO01 cũng kiểm khi xuất).
    const skus = cur.lines.map((l) => l.sku);
    const [names, stock] = await Promise.all([products(tx, skus), stockOf(tx, cur.branch_code, cur.warehouse_code, true, skus)]);
    const c = checkLines(cur.lines.map((l) => ({ sku: l.sku, name: l.name, unit: l.unit, qty: l.qty, note: l.note, lotNo: l.lotNo, expDate: l.expDate ?? '' })), names, stock);
    if (c.findings.length) throw findingsError(`Chưa duyệt được: ${c.findings.map((f) => f.title).join(' · ')}`, c.findings);
    const toWh = await defaultWarehouse(tx, cur.to_branch_code);
    await setIntent(tx, id, { by: ctx.actor.id, ...(ctx.actor.name ? { byName: ctx.actor.name } : {}), at: new Date().toISOString() }, 'approved', ctx.actor.id);
    const note = [`Theo đề nghị điều chuyển ${cur.doc_no}`, cur.note, i.note?.trim()].filter(Boolean).join(' · ');
    return {
      phieu: toPhieu(await getPhieu(tx, id)),
      /** Khuôn phiếu KHO01 (POST /api/v1/kho/transfers): kho xuất của đề nghị → kho mặc định chi nhánh nhận, xuất luôn, chờ nhận. */
      payload: {
        docDate: vnToday(), fromBranchCode: cur.branch_code, fromWarehouse: cur.warehouse_code, toBranchCode: cur.to_branch_code, toWarehouse: toWh,
        ...(cur.reason_code ? { reasonCode: cur.reason_code } : {}), note, mode: 'ship' as const,
        lines: cur.lines.map((l, n) => ({
          lineKey: `L${n + 1}`, sku: l.sku, name: l.name, unit: l.unit, qty: l.qty,
          ...(l.lotNo ? { lotNo: l.lotNo } : {}), ...(l.expDate ? { expDate: l.expDate } : {}), ...(l.note ? { note: l.note } : {}),
        })),
      },
    };
  });
}
