/**
 * Nghiệp vụ phiếu bán / trả nhập tay (NT-BH-015): lưu nháp (tính lại ở máy chủ, cấp số theo cửa hàng, chặn trùng), duyệt (nộp sổ),
 * bỏ duyệt (huỷ chứng từ trong sổ = đảo bút toán), số còn trả được. Mọi action ghi chạy trong một giao dịch của runtime.
 * Duyệt / bỏ duyệt phát sự kiện cùng giao dịch (outbox) để website shop có bản sao phiếu — không cần plugin POS (NT-BH-017,
 * chữ chốt nghiep-vu/23): phieu-ban.doc.recorded (kèm TradeDoc đã tính, phiên bản sổ), phieu-ban.doc.cancelled.
 */
// [2026-11-14 11:00 AM Võ Hoàng] NGHIEM-THU — NT-BH-017: phát sự kiện duyệt / bỏ duyệt cho bản sao website (đóng góp)
// [2026-11-13 11:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-015: nghiệp vụ phiếu bán / trả nhập tay (đóng góp)
import { randomUUID } from 'node:crypto';
import { Errors, type ActionContext } from '@bizcity/module-sdk';
import { findChannel, type ChannelItem } from './domain/doc.js';
// [2026-11-29 06:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-067: kiểm điều kiện kênh của khuyến mại trên phiếu (đóng góp)
import { DEFAULT_CHANNEL, promoChannelIssues, promoChannelMessage, type ChannelCond } from './domain/doc.js';
import { computeDoc, docKeyOf, lockReturnLines, returnableByLine, returnableBySku, stockShortByWarehouse, stockShortOf, toLedgerDoc, withGiftWarehouse, type Body, type DocInput, type Kind } from './domain/doc.js';
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: voucher TGS / hãng (đóng góp)
import { applyVouchers, stripVouchers, type QuotedVoucher, type VoucherBody } from './domain/voucher.js';
import {
  activeMethods, approvedReturnsOf, approvedSales, lockVoucher, voucherHeldByOther, lockedStock, serviceSkus, branchExists, catalogFor, getDoc, noTaken, partnerByCode, saleByNo, saveDoc, setStatus, takeNo, taxRates, toTradeDoc,
  type DocRow, type Tx,
} from './store.js';

const fail = (problems: string[]): never => { throw Errors.validation(problems.join(' · '), { items: problems }); };

// [2026-11-16 06:00 PM Võ Hoàng] NGHIEM-THU — NT-BH-021: công tắc riêng của phiếu bán (Q6), mặc định tắt = chỉ cảnh báo như trước
export const BLOCK_NEGATIVE_STOCK = 'bizcity.phieu_ban.block_negative_stock';
/** Khoá mã dịch vụ phí ship (NT-BH-032) — trùng hằng của order-service (không import vòng). */
const SHIP_FEE_SKU = 'bizcity.phieu_ban.ship_fee_sku';


// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-025: hạn mức lượt khuyến mại dùng chung với máy bán (đóng góp)
type QuotaState = { branch: string; items: { key: string; quota: number; used: number; left: number }[] };
/**
 * Phiếu bán có dòng mang chương trình khuyến mại: hỏi lượt còn ở cửa hàng qua action đọc `pos.promo.quota` của module pos (đếm chung
 * đơn máy bán + phiếu bán đã duyệt; bỏ lượt của chính phiếu này khi duyệt lại). Hết lượt → PHIEU_BAN_PROMO_QUOTA. Module pos chưa bật
 * (NOT_FOUND) → không có hạn mức, bỏ qua. Lượt của phiếu được module pos ghi khi nhận sự kiện phieu-ban.doc.recorded.
 */
async function checkPromoQuota(ctx: ActionContext, branch: string, lines: readonly { policyRef?: { key: string } }[], docId: string) {
  const keys = [...new Set(lines.map((l) => l.policyRef?.key).filter((k): k is string => Boolean(k)))];
  if (!keys.length) return;
  let st: QuotaState;
  try {
    st = await ctx.actions.call<QuotaState>('pos.promo.quota', { branch, keys: keys.join(','), exclude: docId });
  } catch (e) {
    if ((e as { code?: string }).code === 'NOT_FOUND') return;
    throw e;
  }
  const short = st.items.filter((x) => x.left <= 0).map(({ key, quota, used }) => ({ key, quota, used }));
  if (short.length) {
    throw Errors.validation(`Chương trình khuyến mại hết lượt ở ${branch}: ${short.map((s) => `${s.key} (đã dùng ${s.used}/${s.quota})`).join('; ')} — bỏ khuyến mại đó khỏi phiếu rồi duyệt lại`,
      { reason: 'PHIEU_BAN_PROMO_QUOTA', items: short });
  }
}

// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-028: dòng quà của phiếu bán tự vào kho quà (KKM) của cửa hàng — khoá bizcity.pos.gift_warehouses dùng chung với máy bán (đóng góp)
type GiftWarehouse = { branch: string; saleWarehouse: string; giftWarehouse: string | null; issue: string | null };
/**
 * Kho quà của cửa hàng cho phiếu bán / phiếu trả (NT-BH-035) có dòng quà: hỏi action đọc `pos.gift-warehouse.get` của module pos (khoá cài đặt thuộc module pos;
 * ctx.settings.get của module này chỉ đọc khoá bizcity.phieu_ban.*). Module pos chưa bật (NOT_FOUND) / cửa hàng chưa khai → null (như cũ:
 * quà ở kho của phiếu). Khai sai (không thuộc cửa hàng, ngừng dùng, không phải KKM) → POS_GIFT_WAREHOUSE. Gọi NGOÀI ctx.data.module.
 */
// [2026-11-21 Võ Hoàng] NGHIEM-THU — NT-BH-035 Q2: phiếu trả BH11 — quà khách trả về kho quà KKM của cửa hàng nhận (loại kho "Khách trả" có KKM từ 0178) (đóng góp)
export async function giftWarehouseOf(ctx: ActionContext, _kind: Kind, branch: string, lines: readonly { isGift?: boolean }[]): Promise<string | null> {
  if (!lines.some((l) => l.isGift)) return null;
  let g: GiftWarehouse;
  try {
    g = await ctx.actions.call<GiftWarehouse>('pos.gift-warehouse.get', { branch });
  } catch (e) {
    if ((e as { code?: string }).code === 'NOT_FOUND') return null;
    throw e;
  }
  if (g.issue) {
    throw Errors.validation(`Kho quà của cửa hàng ${branch} không dùng được: ${g.issue} — kế toán chọn lại kho khuyến mại (KKM) ở Cài đặt bán hàng (BH17)`,
      { reason: 'POS_GIFT_WAREHOUSE', branchCode: branch });
  }
  return g.giftWarehouse;
}

// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-031: kênh bán của phiếu chọn từ danh mục Kênh bán hàng của module pos (đóng góp)
/**
 * Kênh bán trên phiếu: hỏi action đọc `pos.channel.list` của module pos (chủ danh mục; module này không đọc bảng của pos) — gọi NGOÀI
 * ctx.data.module. Nhận mã hoặc tên; kênh phải có và đang dùng (giữ nguyên kênh phiếu đang mang dù kênh đã ngừng). Sai → POS_SALE_SOURCE.
 * Trống → không ghi kênh (lọc / báo cáo tính vào kênh mặc định). Trả đầu vào đã thay mã + tên chuẩn.
 */
export async function withChannel(ctx: ActionContext, input: DocInput, id?: string): Promise<DocInput> {
  const { saleChannelName: _n, ...rest } = input as DocInput & { saleChannelName?: string };
  const raw = (input.saleChannel ?? '').trim();
  if (!raw) return { ...rest, saleChannel: undefined } as DocInput;
  let list: ChannelItem[];
  try {
    list = (await ctx.actions.call<{ items: ChannelItem[] }>('pos.channel.list', {})).items;
  } catch (e) {
    if ((e as { code?: string }).code !== 'NOT_FOUND') throw e;
    throw Errors.validation('Chưa chọn kênh được: module Máy bán POS (chủ danh mục Kênh bán hàng) chưa bật — để trống ô Kênh', { reason: 'POS_SALE_SOURCE', field: 'saleChannel', saleSource: raw });
  }
  const c = findChannel(list, raw);
  const kept = c && id ? (await ctx.data.module(async (tx) => getDoc(tx, id))).body.saleChannel === c.code : false;
  if (!c || (!c.active && !kept)) {
    throw Errors.validation(c ? `Kênh bán "${c.name}" đã ngừng dùng — chọn kênh khác` : `Không có kênh bán "${raw}" trong danh mục Kênh bán hàng`,
      { reason: 'POS_SALE_SOURCE', field: 'saleChannel', saleSource: raw, cause: c ? 'inactive' : 'unknown' });
  }
  return { ...rest, saleChannel: c.code, saleChannelName: c.name } as DocInput;
}

// [2026-11-29 06:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-067 (C1, C3): loại kênh của phiếu / đơn cho khuyến mại theo kênh; máy chủ kiểm lại điều kiện kênh
// của chương trình trên phiếu bán khi Ghi và khi Duyệt (đóng góp)
/**
 * Mã + loại kênh của phiếu / đơn: trống → kênh mặc định (Gần shop). Loại đọc ở danh mục Kênh bán hàng (action đọc `pos.channel.list`, gọi NGOÀI
 * ctx.data.module); module pos chưa bật → loại null (chương trình theo loại kênh không áp — NT-BH-065 C7).
 */
export async function channelInfo(ctx: ActionContext, raw: string | undefined | null): Promise<{ code: string; kind: 'online' | 'offline' | null }> {
  const code = (raw ?? '').trim() ? (raw ?? '').trim().toUpperCase() : DEFAULT_CHANNEL;
  try {
    const list = (await ctx.actions.call<{ items: ChannelItem[] }>('pos.channel.list', {})).items;
    return { code, kind: findChannel(list, code)?.kind ?? null };
  } catch (e) {
    if ((e as { code?: string }).code !== 'NOT_FOUND') throw e;
    return { code, kind: null };
  }
}

/**
 * Phiếu bán mang dòng khuyến mại (policyRef) của chương trình có điều kiện kênh (BH18 "Kênh bán") mà kênh của phiếu không khớp → không ghi /
 * không duyệt (POS_PROMO_CHANNEL). Điều kiện đọc ở `core.policy.list` tại ngày phiếu; Core không trả lời → bỏ qua (cửa nạp còn kiểm bản chính sách).
 */
export async function checkPromoChannel(ctx: ActionContext, docDate: string, saleChannel: string | undefined | null, lines: readonly { policyRef?: { key: string } }[]) {
  const keys = [...new Set(lines.map((l) => l.policyRef?.key).filter((k): k is string => Boolean(k)))];
  if (!keys.length) return;
  let items: { policyKey: string; params: { conditions?: ChannelCond } | null }[];
  try {
    items = (await ctx.actions.call<{ items: typeof items }>('core.policy.list', { domain: 'sale', at: docDate })).items;
  } catch { return; }
  const conds = new Map(items.filter((i) => keys.includes(i.policyKey)).map((i) => [i.policyKey, i.params?.conditions ?? null] as const));
  if (![...conds.values()].some((c) => c?.channelKinds?.length || c?.channels?.length)) return;
  const ch = await channelInfo(ctx, saleChannel);
  const issues = promoChannelIssues(keys, conds, ch.code, ch.kind);
  if (issues.length) throw Errors.validation(promoChannelMessage(issues), { reason: 'POS_PROMO_CHANNEL', items: issues });
}

// [2026-11-26 07:45 PM Võ Hoàng] NGHIEM-THU — NT-BH-046: phiếu trả BẮT BUỘC nối phiếu bán gốc đã duyệt của module (cùng cửa hàng); dòng trả khoá
// theo dòng gốc (giá, thuế, chiết khấu theo tỉ lệ), kiểm còn trả TỪNG DÒNG ở cả lúc Ghi và lúc Duyệt (trước: chỉ lúc duyệt, cộng theo mã) (đóng góp)
/** Kiểm + tính một phiếu (nháp hoặc lúc duyệt). Phiếu trả: phải nối phiếu bán gốc của module theo số (cùng cửa hàng), dòng trả theo dòng gốc. */
async function prepare(tx: Tx, kind: Kind, input0: DocInput, selfId?: string) {
  if (!(await branchExists(tx, input0.branchCode))) fail([`Chi nhánh ${input0.branchCode} không có / ngừng dùng`]);
  let input = input0;
  let original: DocRow | null = null;
  const returnProblems: string[] = [];
  if (kind === 'sale_return') {
    const no = input.originalDocNo?.trim();
    original = no ? await saleByNo(tx, input.branchCode, no) : null;
    if (!no) returnProblems.push('Phiếu trả phải chọn phiếu bán gốc (ô Phiếu gốc) — trả theo dòng của phiếu đã bán');
    else if (!original) returnProblems.push(`Không có phiếu bán ${no} ở cửa hàng ${input.branchCode}`);
    else if (original.status !== 'approved') returnProblems.push(`Phiếu bán gốc ${original.doc_no} chưa duyệt`);
    else {
      const done = (await approvedReturnsOf(tx, original.doc_id, selfId)).flatMap((x) => x.body.lines);
      const locked = lockReturnLines(input.lines, original.body.lines, returnableByLine(original.body.lines, done), original.doc_no);
      returnProblems.push(...locked.problems);
      input = { ...input, lines: locked.lines as DocInput['lines'] };
    }
  }
  const catalog = await catalogFor(tx, input.lines.map((l) => l.sku));
  const partner = input.partner?.code ? await partnerByCode(tx, input.partner.code) : null;
  const { body, problems } = computeDoc(input, { catalog, taxRates: await taxRates(tx), methods: await activeMethods(tx), partner });
  return { body, problems: [...returnProblems, ...problems], catalog, original };
}

/** Lưu nháp: thêm (id trống) hoặc sửa phiếu nháp. Số trống → cấp theo cửa hàng; số gõ tay → không trùng trong cửa hàng + loại. */
export async function saveDraft(ctx: ActionContext, kind: Kind, input0: DocInput, id?: string) {
  const input = await withChannel(ctx, input0, id);
  // NT-BH-067 (C3): dòng khuyến mại theo kênh phải khớp kênh của phiếu ngay khi Ghi.
  if (kind === 'sale') await checkPromoChannel(ctx, input.docDate, input.saleChannel, input.lines);
  const giftWarehouse = await giftWarehouseOf(ctx, kind, input.branchCode, input.lines);
  return ctx.data.module(async (tx) => saveDraftIn(tx, ctx, kind, input, id, { giftWarehouse }));
}

// [2026-11-17 Võ Hoàng] NGHIEM-THU — NT-BH-023: lưu nháp trong giao dịch module có sẵn (đơn đặt hàng sinh phiếu bán nháp khi giao) (đóng góp)
/**
 * Lưu nháp trong giao dịch module của người gọi. `order`: chỉ máy chủ gắn (nút Giao của đơn đặt hàng) — số đơn do màn gửi lên bị bỏ;
 * sửa phiếu đã nối đơn thì giữ nối đơn và báo đơn số lượng mới của lần giao (onLinkedEdit).
 */
export async function saveDraftIn(tx: Tx, ctx: ActionContext, kind: Kind, input: DocInput, id?: string, opts: {
  order?: { id: string; no: string };
  /** NT-BH-028: kho quà của cửa hàng (đã hỏi module pos) — dòng quà tự vào kho này; không có thì gán lúc duyệt. */
  giftWarehouse?: string | null;
  onLinkedEdit?: (tx: Tx, doc: { docId: string; orderId: string; lines: { lineKey: string; sku: string; qty: number }[] }) => Promise<void>;
} = {}) {
  const cur = id ? await getDoc(tx, id, true) : null;
  if (cur && cur.kind !== kind) throw Errors.validation('Sai loại phiếu');
  if (cur && cur.status !== 'draft') throw Errors.conflict('Phiếu đã duyệt — bỏ duyệt rồi mới sửa');
  const order = opts.order ?? cur?.body.order;
  const prepared = await prepare(tx, kind, { ...input, order }, cur?.doc_id);
  if (prepared.problems.length) fail(prepared.problems);
  const body = withGiftWarehouse(prepared.body, opts.giftWarehouse ?? null);
  if (cur && order && opts.onLinkedEdit) {
    await opts.onLinkedEdit(tx, { docId: cur.doc_id, orderId: order.id, lines: body.lines.map((l) => ({ lineKey: l.lineKey, sku: l.sku, qty: l.qty })) });
  }
  const sameBranch = cur && cur.branch_code === input.branchCode;
  let docNo = input.docNo?.trim() || (sameBranch ? cur.doc_no : '');
  if (docNo && await noTaken(tx, input.branchCode, kind, docNo, cur?.doc_id)) {
    fail([`Số phiếu ${docNo} đã có ở chi nhánh ${input.branchCode} — để trống để phần mềm tự cấp số mới`]);
  }
  docNo ||= await takeNo(tx, ctx.tenant.id, input.branchCode, kind, input.docDate);
  const docId = cur?.doc_id ?? randomUUID();
  await saveDoc(tx, {
    docId, tenantId: ctx.tenant.id, kind, branchCode: input.branchCode, warehouseCode: input.warehouseCode || null, docNo, docDate: input.docDate,
    partnerCode: body.partner?.code ?? null, originalDocId: null, body, actor: ctx.actor.id, insert: !cur,
  });
  return toTradeDoc(await getDoc(tx, docId));
}

// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: duyệt lại tính từ phiếu đã gỡ phần voucher; mã voucher của nháp đi lại vào đầu vào (đóng góp)
const asInput = (r: DocRow): DocInput => {
  const b = stripVouchers(r.body as VoucherBody);
  return { docNo: r.doc_no, docDate: r.doc_date, branchCode: r.branch_code, ...(b as Body), ...(b.voucherCodes ? { vouchers: b.voucherCodes } : {}), warehouseCode: r.warehouse_code ?? undefined } as DocInput;
};

// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: voucher TGS / hãng lúc duyệt phiếu bán (đóng góp)
type VoucherQuote = { vouchers: QuotedVoucher[]; problems: { code: string; reason: string; message: string }[] };
/**
 * Phiếu bán có mã voucher: khoá theo từng mã (pg_advisory_xact_lock(hashtext('voucher:'||mã)) — cùng khoá máy bán lấy khi nhận đơn) tới hết
 * giao dịch duyệt; mã đang nằm ở phiếu bán khác đã duyệt → VOUCHER_USED; hỏi action đọc `voucher.order.quote` (của khách phiếu, chưa dùng,
 * còn hạn, đơn tối thiểu, giỏ có sản phẩm / nhãn) rồi áp: TGS = chiết khấu trên dòng, hãng = dòng thanh toán. Module voucher đánh dấu đã
 * dùng khi nhận phieu-ban.doc.recorded. Cửa sổ rủi ro: mã vừa dùng ở máy bán mà module voucher chưa nhận sự kiện đơn (outbox) thì quote
 * chưa thấy — module voucher ghi "dùng trùng" vào nhật ký mã khi nhận sự kiện thứ hai.
 */
async function applyDocVouchers(ctx: ActionContext, r: Pick<DocRow, 'kind' | 'doc_id' | 'branch_code' | 'doc_date'>, body: Body): Promise<Body> {
  const codes = (body as VoucherBody).voucherCodes ?? [];
  if (r.kind !== 'sale' || !codes.length) return body;
  if (!body.partner?.code) throw Errors.validation('Phiếu dùng voucher phải chọn khách (voucher gắn SĐT khách, chỉ khách đó dùng)', { reason: 'VOUCHER_NEED_CUSTOMER', field: 'partner' });
  const { held, rates, methods } = await ctx.data.module(async (tx) => {
    for (const code of [...codes].sort()) await lockVoucher(tx, code);
    return { held: await voucherHeldByOther(tx, codes, r.doc_id), rates: await taxRates(tx), methods: await activeMethods(tx) };
  });
  if (held.length) {
    throw Errors.validation(held.map((h) => `Voucher ${h.code} đã dùng ở phiếu ${h.docNo} ngày ${h.docDate}`).join('; '),
      { reason: 'VOUCHER_USED', field: 'vouchers', items: held.map((h) => ({ code: h.code, usedIn: { source: 'phieu-ban', refCode: h.docNo, date: h.docDate } })) });
  }
  let q: VoucherQuote;
  try {
    q = await ctx.actions.call<VoucherQuote>('voucher.order.quote', {
      customer: body.partner.code, branch: r.branch_code, refId: r.doc_id, date: r.doc_date, orderTotal: body.totals.total, codes, issue: false,
      items: body.lines.filter((l) => !l.isGift).map((l) => ({ sku: l.sku, qty: l.qty, amount: l.amountBeforeTax + l.taxAmount })),
    });
  } catch (e) {
    throw Errors.validation(`Chưa dùng voucher được: ${(e as Error).message}`, { reason: 'VOUCHER_UNAVAILABLE', field: 'vouchers' });
  }
  if (q.problems.length) throw Errors.validation(q.problems.map((p) => p.message).join('; '), { reason: q.problems[0]!.reason, field: 'vouchers', items: q.problems });
  const ordered = codes.map((c) => q.vouchers.find((v) => v.code === c)).filter((v): v is QuotedVoucher => Boolean(v));
  const res = applyVouchers(body as VoucherBody, ordered, rates);
  if ('problem' in res) throw Errors.validation(res.problem.message, { reason: res.problem.reason, field: 'vouchers', code: res.problem.code });
  const bad = res.body.payments.find((p) => p.voucherCode && !methods.has(p.methodCode));
  if (bad) {
    throw Errors.validation(`Hình thức thanh toán ${bad.methodCode} của voucher hãng ${bad.voucherCode} không có / ngừng dùng — kế toán khai lại ở đợt phát`, { reason: 'VOUCHER_PAYMENT_METHOD', method: bad.methodCode });
  }
  const paid = res.body.payments.reduce((s, p) => s + p.amount, 0);
  if (paid > res.body.totals.total) fail([`Tiền thu (${paid.toLocaleString('vi-VN')}) lớn hơn tổng phiếu sau voucher (${res.body.totals.total.toLocaleString('vi-VN')}) — giảm tiền thu`]);
  return res.body as Body;
}

// [2026-11-21 Võ Hoàng] NGHIEM-THU — NT-BH-035 §3.1: ô Mã voucher BH10 — kiểm trước khi ghi / duyệt, hiện số được giảm (đóng góp)
/**
 * Kiểm voucher của phiếu bán đang lập (chưa ghi, không giữ mã): tính phiếu như lúc duyệt rồi áp voucher y hệt applyDocVouchers (cùng
 * voucher.order.quote, cùng luật trừ). Mã sai / hết lượt / đã dùng → lỗi rõ như lúc duyệt. Không ghi gì; lúc duyệt vẫn kiểm lại (khoá mã).
 */
export async function checkVouchers(ctx: ActionContext, input0: DocInput & { id?: string }) {
  const { id, ...rest } = input0;
  const input = await withChannel(ctx, rest as DocInput, id);
  const prepared = await ctx.data.module(async (tx) => prepare(tx, 'sale', input));
  if (prepared.problems.length) fail(prepared.problems);
  const before = prepared.body.totals;
  const body = await applyDocVouchers(ctx, { kind: 'sale', doc_id: id ?? randomUUID(), branch_code: input.branchCode, doc_date: input.docDate }, prepared.body) as VoucherBody;
  const applied = body.vouchers ?? [];
  const discount = applied.filter((v) => v.kind === 'discount').reduce((s, v) => s + v.amount, 0);
  const payment = applied.filter((v) => v.kind === 'payment').reduce((s, v) => s + v.amount, 0);
  return { vouchers: applied, before, after: body.totals, discount, payment };
}

/** Duyệt: tính lại theo danh mục hiện tại, kiểm số còn trả (phiếu trả nối phiếu của module), nộp sổ phiên bản kế tiếp. */
export async function approve(ctx: ActionContext, id: string) {
  // Cài đặt đọc ngoài giao dịch của module (vai trò module không đọc bảng cấu hình của Core).
  const blockStock = (await ctx.settings.get<unknown>(BLOCK_NEGATIVE_STOCK)) === true;
  // [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-032: dòng phí ship (mã dịch vụ khai ở BH17) không kiểm tồn — Core chưa có loại mặt hàng dịch vụ (đóng góp)
  // NT-BH-035: nay Core có (dịch vụ không ghi kho) — mã phí ship chỉ còn là lối lùi khi mặt hàng phí ship chưa phân loại dịch vụ.
  const feeSku = blockStock ? String((await ctx.settings.get<unknown>(SHIP_FEE_SKU)) ?? '').trim() : '';
  const head = await ctx.data.module(async (tx) => getDoc(tx, id));
  const giftWh = await giftWarehouseOf(ctx, head.kind, head.branch_code, head.body.lines);
  const prepared = await ctx.data.module(async (tx) => {
    const r = await getDoc(tx, id, true);
    if (r.status === 'approved') throw Errors.conflict('Phiếu đã duyệt');
    const p0 = await prepare(tx, r.kind, asInput(r), r.doc_id);
    if (p0.problems.length) fail(p0.problems);
    const p = { ...p0, body: withGiftWarehouse(p0.body, r.branch_code === head.branch_code ? giftWh : null) };
    // [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-030 Q4: phiếu trả này trả hết hàng bán (không kể quà) của phiếu gốc → báo module pos trả lượt khuyến mại (đóng góp)
    let originalFullyReturned = false;
    if (r.kind === 'sale_return' && p.original) {
      // NT-BH-046: còn trả từng dòng đã kiểm trong prepare (phiếu trả khoá FOR UPDATE; hai phiếu trả nháp cùng dòng → duyệt sau bị chặn).
      const done = (await approvedReturnsOf(tx, p.original.doc_id, r.doc_id)).flatMap((x) => x.body.lines);
      const sold = p.original.body.lines.filter((l) => !l.isGift);
      originalFullyReturned = [...returnableBySku(sold, [...done, ...p.body.lines].filter((l) => !l.isGift)).values()].every((q) => q <= 1e-9);
    }
    if (r.kind === 'sale' && blockStock) {
      // Phiếu đang sửa đã bỏ duyệt (chứng từ trong sổ đã huỷ) nên tồn đọc được không còn trừ chính nó.
      // [2026-11-21 Võ Hoàng] NGHIEM-THU — NT-BH-035 §3.3: dòng mặt hàng dịch vụ (Kernel không ghi thẻ kho) không kiểm tồn — áp chung theo
      // phân loại, không riêng mã phí ship. Mã phí ship CHƯA phân loại dịch vụ vẫn bỏ qua như NT-BH-032 (chuyến giao không bị chặn); BH17 nhắc. (đóng góp)
      const svc = await serviceSkus(tx, p.body.lines.map((l) => l.sku), r.doc_date);
      const goods = p.body.lines.filter((l) => !svc.has(l.sku) && (!feeSku || l.sku !== feeSku));
      const have = await lockedStock(tx, r.branch_code, r.warehouse_code, goods.filter((l) => !l.warehouseCode).map((l) => l.sku));
      // NT-BH-028: dòng quà ở kho quà kiểm tồn kho quà, không cộng chung với kho của phiếu.
      const giftLines = goods.filter((l) => l.warehouseCode);
      const short = giftLines.length && giftWh
        ? stockShortByWarehouse(goods, new Map([[r.warehouse_code ?? '', have], [giftWh, await lockedStock(tx, r.branch_code, giftWh, giftLines.map((l) => l.sku))]]), r.warehouse_code ?? '')
        : stockShortOf(goods, have);
      if (short.length) {
        const where = r.warehouse_code || r.branch_code;
        throw Errors.validation(`Bán quá tồn: ${short.map((s) => `${s.sku} cần ${s.need}, tồn ${s.have}`).join('; ')} ở ${where} — tắt công tắc "Chặn bán quá tồn ở phiếu bán nhập tay" ở BH17 nếu muốn chỉ cảnh báo`,
          { reason: 'PHIEU_BAN_STOCK_SHORT', items: short });
      }
    }
    return { r, ...p, originalFullyReturned };
  });
  // [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-025: chương trình khuyến mại có hạn mức lượt theo cửa hàng — hỏi lượt còn ở module pos (đóng góp)
  if (prepared.r.kind === 'sale') await checkPromoQuota(ctx, prepared.r.branch_code, prepared.body.lines, id);
  // NT-BH-067 (C3): phiếu sinh từ đơn đặt hàng (giao) không qua bước Ghi — kiểm kênh lần cuối lúc duyệt.
  if (prepared.r.kind === 'sale') await checkPromoChannel(ctx, prepared.r.doc_date, prepared.body.saleChannel, prepared.body.lines);
  const body = await applyDocVouchers(ctx, prepared.r, prepared.body);
  // Đã từng nộp rồi bỏ duyệt: chứng từ trong sổ phải đã huỷ xong (chế độ chờ duyệt: kế toán duyệt huỷ ở ACC14) mới nộp lại.
  if (prepared.r.ledger_version > 0) {
    const st = await ctx.ledger.get(docKeyOf(id));
    if (st && st.status !== 'cancelled') throw Errors.conflict(`Chứng từ trong sổ đang ở trạng thái "${st.status}" — chờ huỷ xong ở Trạm chứng từ ACC14 rồi duyệt lại`);
  }
  const version = prepared.r.ledger_version + 1;
  const submitted = await ctx.ledger.submit(toLedgerDoc({
    docId: id, kind: prepared.r.kind, branchCode: prepared.r.branch_code, docNo: prepared.r.doc_no, docDate: prepared.r.doc_date, body,
    version, originalDocId: prepared.original?.doc_id ?? null, catalog: prepared.catalog,
  }));
  return ctx.data.module(async (tx) => {
    await saveDoc(tx, {
      docId: id, tenantId: ctx.tenant.id, kind: prepared.r.kind, branchCode: prepared.r.branch_code, warehouseCode: prepared.r.warehouse_code, docNo: prepared.r.doc_no,
      docDate: prepared.r.doc_date, partnerCode: prepared.body.partner?.code ?? null, originalDocId: prepared.original?.doc_id ?? null, body, actor: ctx.actor.id, insert: false,
    });
    await setStatus(tx, id, { status: 'approved', ledgerVersion: version, ledgerStatus: submitted.status, actor: ctx.actor.id });
    return toTradeDoc(await getDoc(tx, id));
  }).then(async (doc) => {
    await ctx.events.emit('phieu-ban.doc.recorded', {
      docId: id, docKey: docKeyOf(id), version, kind: prepared.r.kind, branchCode: prepared.r.branch_code, cashier: { name: ctx.actor.name },
      doc, ...(prepared.original ? {
        originalDocKey: docKeyOf(prepared.original.doc_id), originalDocId: prepared.original.doc_id, originalFullyReturned: prepared.originalFullyReturned,
      } : {}),
    }, { subject: `phieu-ban.doc:${id}`, dedupeKey: `phieu-ban.doc.recorded:${id}:${version}` });
    return doc;
  });
}

/** Bỏ duyệt: huỷ chứng từ trong sổ (ghi ngay → đảo bút toán; chờ duyệt → chờ huỷ ở ACC14), phiếu về nháp. Phiếu bán còn phiếu trả đã duyệt → chặn. */
export async function unapprove(ctx: ActionContext, id: string, reason: string) {
  const r = await ctx.data.module(async (tx) => {
    const row = await getDoc(tx, id, true);
    if (row.status !== 'approved') throw Errors.conflict('Phiếu chưa duyệt');
    if (row.kind === 'sale') {
      const rets = await approvedReturnsOf(tx, row.doc_id);
      if (rets.length) fail([`Phiếu bán đã có phiếu trả đã duyệt (${rets.map((x) => x.doc_no).join(', ')}) — bỏ duyệt phiếu trả trước`]);
    }
    return row;
  });
  const res = await ctx.ledger.cancel(docKeyOf(id), reason);
  return ctx.data.module(async (tx) => {
    await setStatus(tx, id, { status: 'draft', ledgerStatus: res.cancelled ? 'cancelled' : res.requested ? 'cancel_requested' : r.ledger_status, actor: ctx.actor.id });
    // [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: phiếu về nháp → gỡ phần voucher đã áp (giữ mã ở nháp); module voucher trả mã theo sự kiện (đóng góp)
    if ((r.body as VoucherBody).vouchers?.length) {
      await saveDoc(tx, {
        docId: id, tenantId: ctx.tenant.id, kind: r.kind, branchCode: r.branch_code, warehouseCode: r.warehouse_code, docNo: r.doc_no, docDate: r.doc_date,
        partnerCode: r.partner_code, originalDocId: r.original_doc_id, body: stripVouchers(r.body as VoucherBody) as Body, actor: ctx.actor.id, insert: false,
      });
    }
    return { ...toTradeDoc(await getDoc(tx, id)), reversed: res.reversed };
  }).then(async (doc) => {
    // NT-BH-030 Q4: phiếu trả bỏ duyệt mang phiếu gốc — module pos lấy lại lượt khuyến mại đã trả theo phiếu trả này.
    await ctx.events.emit('phieu-ban.doc.cancelled', {
      docId: id, docKey: docKeyOf(id), version: r.ledger_version, kind: r.kind, branchCode: r.branch_code,
      ...(r.kind === 'sale_return' && r.original_doc_id ? { originalDocId: r.original_doc_id } : {}),
    },
      { subject: `phieu-ban.doc:${id}`, dedupeKey: `phieu-ban.doc.cancelled:${id}:${r.ledger_version}` });
    return doc;
  });
}

/** Số còn trả được của một phiếu bán đã duyệt, theo dòng (quà không trả riêng). */
export async function returnable(ctx: ActionContext, id: string) {
  return ctx.data.module(async (tx) => {
    const r = await getDoc(tx, id);
    if (r.kind !== 'sale') throw Errors.validation('Chỉ phiếu bán mới có số còn trả được');
    // NT-BH-046: còn trả theo TỪNG DÒNG (cả dòng quà — khách trả quà về kho quà, NT-BH-035), kèm giá / thuế / chiết khấu của dòng gốc.
    return returnableOf(r, (await approvedReturnsOf(tx, r.doc_id)).flatMap((x) => x.body.lines));
  });
}

// [2026-11-26 07:45 PM Võ Hoàng] NGHIEM-THU — NT-BH-046: còn trả theo dòng + danh sách phiếu gốc để chọn ở BH11 (đóng góp)
/** Còn trả từng dòng của một phiếu bán (đã trừ các phiếu trả đã duyệt). */
function returnableOf(r: DocRow, returned: Body['lines']) {
  const left = returnableByLine(r.body.lines, returned);
  return {
    id: r.doc_id, docNo: r.doc_no, docDate: r.doc_date, status: r.status, branchCode: r.branch_code, warehouseCode: r.warehouse_code ?? undefined,
    partner: r.body.partner, totals: r.body.totals,
    lines: r.body.lines.map((l) => ({
      lineKey: l.lineKey, sku: l.sku, name: l.name, unit: l.unit, qty: l.qty, unitPrice: l.unitPrice, discount: l.discount, taxCode: l.taxCode,
      isGift: l.isGift, ...(l.warehouseCode ? { warehouseCode: l.warehouseCode } : {}),
      returned: Math.max(0, Math.round((l.qty - (left.get(l.lineKey)?.qty ?? 0)) * 10_000) / 10_000),
      returnable: Math.max(0, left.get(l.lineKey)?.qty ?? 0),
    })),
  };
}

/**
 * Phiếu bán ĐÃ DUYỆT để chọn làm phiếu gốc ở BH11: của một cửa hàng, theo khách (mã) hoặc tìm theo số phiếu (khách lẻ), mới trước;
 * mỗi phiếu kèm còn trả từng dòng. `open` = chỉ phiếu còn dòng trả được.
 */
export async function returnSources(ctx: ActionContext, f: { branch: string; partnerCode?: string; search?: string; from?: string; to?: string; open?: boolean; limit?: number }) {
  return ctx.data.module(async (tx) => {
    const rows = await approvedSales(tx, {
      branch: f.branch, limit: f.limit ?? 50, ...(f.partnerCode ? { partnerCode: f.partnerCode } : {}), ...(f.search ? { search: f.search } : {}),
      ...(f.from ? { from: f.from } : {}), ...(f.to ? { to: f.to } : {}),
    });
    const out = [];
    for (const r of rows) {
      const x = returnableOf(r, (await approvedReturnsOf(tx, r.doc_id)).flatMap((y) => y.body.lines));
      if (f.open && !x.lines.some((l) => l.returnable > 0)) continue;
      out.push(x);
    }
    return { items: out };
  });
}
