/**
 * Màn Khuyến mại (BH18, phiếu NT-BH-016, chữ chốt docs/nghiep-vu/22) — phần thuần: form người kinh doanh điền ↔ `params` của khuôn luật
 * `sale.promo.*` (Core kiểm lại khi phát hành, không tin số của màn), trạng thái ở danh sách, nội dung bản "ngừng".
 * Không gọi API, không React — test ở modules/pos/test/khuyen-mai.test.ts.
 */
// [2026-11-14 01:00 AM Võ Hoàng] NGHIEM-THU — NT-BH-016: mô hình form khuyến mại 6 loại (đóng góp)
// [2026-11-25 10:45 PM Võ Hoàng] NGHIEM-THU — NT-BH-040: thêm ba loại khuôn @2 — giá riêng từng mã (K1), mua nhiều mã / quà lựa chọn (K2), quà nhân bội số (K4), phạm vi nhóm / nhãn (K3) (đóng góp)

export type PromoKind = 'tiered' | 'order_discount' | 'order_gift' | 'combo' | 'cheapest_free' | 'buy_x_get_y' | 'price_lines' | 'buy_x_get_y2' | 'order_gift2' | 'pool_combo';
/** Ba loại khuôn @2 (NT-BH-040): có phạm vi nhóm / nhãn. */
export const V2_KINDS: readonly PromoKind[] = ['price_lines', 'buy_x_get_y2', 'order_gift2'];

export const KIND_INFO: Record<PromoKind, { contract: string; label: string; hint: string }> = {
  tiered: { contract: 'sale.promo.tiered@1', label: 'Giảm theo bậc (mua nhiều giảm nhiều)', hint: 'Nhóm mặt hàng: từ N cái (hoặc từ N đồng) giảm % / giá chương trình' },
  order_discount: { contract: 'sale.promo.order_discount@1', label: 'Giảm theo tổng đơn / mã giảm giá', hint: 'Đơn từ … giảm % hoặc tiền, có trần; dùng kèm mã giảm giá' },
  order_gift: { contract: 'sale.promo.order_gift@1', label: 'Quà theo tổng đơn', hint: 'Đơn từ … tặng quà' },
  combo: { contract: 'sale.promo.combo@1', label: 'Combo', hint: 'Mua đủ bộ món: giá bộ / giảm % / giảm tiền' },
  cheapest_free: { contract: 'sale.promo.cheapest_free@1', label: 'Mua bất kỳ tặng món rẻ nhất', hint: 'Trong nhóm mặt hàng: mua N món tặng M món rẻ nhất' },
  buy_x_get_y: { contract: 'sale.promo.buy_x_get_y@1', label: 'Mua X tặng Y', hint: 'Mua đủ số lượng mặt hàng X tặng mặt hàng Y' },
  price_lines: { contract: 'sale.promo.price_lines@2', label: 'Giá riêng từng mã (nhiều mã)', hint: 'Một chương trình nhiều mã, mỗi mã một giá / một mức giảm / một bảng bậc riêng' },
  buy_x_get_y2: { contract: 'sale.promo.buy_x_get_y@2', label: 'Mua nhiều mã tặng quà (quà lựa chọn)', hint: 'Mua A hoặc B (gộp số lượng) / mua đủ A và B; khách chọn 1 (hoặc N) trong nhiều quà' },
  order_gift2: { contract: 'sale.promo.order_gift@2', label: 'Quà theo tổng đơn (nhân bội số)', hint: 'Đơn từ … tặng quà; bật nhân bội số: đủ 2 lần ngưỡng tặng 2 lần quà' },
  // [2026-11-27 10:00 AM Võ Hoàng] NGHIEM-THU — NT-BH-049: combo bộ sản phẩm (pool, loại 13 cũ) — chỉ khai bằng form kiểu cũ; có ở đây để danh sách nhận ra khuôn (đóng góp)
  pool_combo: { contract: 'sale.promo.pool_combo@2', label: 'Combo bộ sản phẩm', hint: 'Mua đủ N mã khác nhau trong pool giảm % cả pool; chưa đủ thì giảm theo số lượng từng mã' },
};
export const KIND_BY_CONTRACT: Record<string, PromoKind> = Object.fromEntries(Object.entries(KIND_INFO).map(([k, v]) => [v.contract, k as PromoKind]));

export type TierMode = 'pct' | 'unitPrice' | 'amountPerUnit';
export type Form = {
  kind: PromoKind;
  key: string; reason: string; effectiveFrom: string; branchCodes: string[];
  validFrom: string; validTo: string; priority: number; exclusive: boolean;
  /** Trần NĐ81 (% tiền dòng); trống = mặc định 50; `noCap` = miễn trần (người khai chịu trách nhiệm). */
  legalCapPct: string; noCap: boolean;
  weekdays: number[]; timeFrom: string; timeTo: string; minOrderAmount: string; couponCodes: string; birthdayMonth: boolean; memberLevels: string;
  // [2026-11-27 10:00 AM Võ Hoàng] NGHIEM-THU — NT-BH-049 (K9): sinh nhật theo ngày / tuần / tháng, loại đơn (đóng góp)
  /** '' = không theo sinh nhật; month = tháng sinh (ô birthdayMonth cũ); week / day = tuần / đúng ngày sinh. */
  birthdayScope: '' | 'day' | 'week' | 'month';
  /** Loại đơn được áp; rỗng = mọi loại. */
  orderTypes: ('retail' | 'wholesale' | 'so')[];
  /** Danh sách mã hàng, cách nhau dấu phẩy / xuống dòng. */
  skus: string;
  basis: 'qty' | 'amount';
  tiers: { min: string; mode: TierMode; value: string }[];
  orderTiers: { minOrder: string; mode: 'pct' | 'amount'; value: string; maxDiscount: string }[];
  /** Quà theo bậc: "QUA01:1, QUA02:2". */
  giftTiers: { minOrder: string; gifts: string }[];
  items: { sku: string; qty: string }[];
  comboMode: 'comboPrice' | 'discountPct' | 'discountAmount'; comboValue: string; maxCombos: string;
  buyQty: string; freeQty: string; repeat: boolean;
  buy: { sku: string; qty: string }; get: { sku: string; qty: string }; maxGiftQty: string;
  // [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-025: hạn mức lượt theo cửa hàng khai ở nháp (đóng góp)
  /** Số lượt (đơn) mỗi cửa hàng; trống = không giới hạn. */
  quotaPerBranch: string;
  /** Lượt riêng từng cửa hàng: "CN01=2, CN02=5". */
  quotaBranches: string;
  /** NT-BH-049 (K6): số lượt tối đa mỗi khách; trống = không giới hạn. */
  quotaPerCustomer: string;
  // [2026-11-25 10:45 PM Võ Hoàng] NGHIEM-THU — NT-BH-040: ô của ba loại @2 (đóng góp)
  /** Phạm vi nhóm hàng / nhãn hàng (mã phân loại đang dùng); `skus` là các mã lẻ của phạm vi. */
  groupCodes: string[]; brandCodes: string[];
  /** K1: mỗi dòng một mã, một cách giảm hoặc một bảng bậc riêng. */
  priceLines: PriceLineForm[];
  /** K2: các mã mua, kiểu any / all, tổng số lượng (any), các quà lựa chọn, số món được chọn. */
  buyItems: { sku: string; qty: string }[]; buyMode: 'any' | 'all'; buyTotal: string;
  giftOptions: { sku: string; qty: string }[]; choose: string;
  /** K4: nhân bội số ngưỡng, trần số lần. */
  multiply: boolean; maxTimes: string;
};
/** NT-BH-049 (K7): `unitName` + `unitRatio` = khai theo đơn vị quy đổi (vd Thùng = 48); trống = đơn vị nhỏ nhất. */
export type PriceLineForm = { sku: string; useTiers: boolean; mode: TierMode; value: string; tiers: { min: string; mode: TierMode; value: string }[]; maxQty: string; unitName: string; unitRatio: string };
export const emptyPriceLine = (): PriceLineForm => ({ sku: '', useTiers: false, mode: 'pct', value: '', tiers: [{ min: '', mode: 'pct', value: '' }], maxQty: '', unitName: '', unitRatio: '' });

/**
 * NT-BH-049 (K11): dán bảng từ Excel vào danh sách mã của "Giá riêng từng mã". Mỗi dòng: Mã | Cách | Mức | Tối đa / phiếu | ĐVT | Tỉ lệ
 * (cách nhau Tab hoặc dấu chấm phẩy). Cách: "%", "giá" (giá chương trình / cái), "tiền" (giảm tiền / cái); trống = %. Dòng tiêu đề tự bỏ.
 */
export function parsePriceLines(text: string): { lines: PriceLineForm[]; problems: string[] } {
  const lines: PriceLineForm[] = []; const problems: string[] = [];
  const modeOf = (x: string): TierMode | null => {
    const t = x.trim().toLowerCase();
    if (!t || t === '%' || t.startsWith('giảm %') || t === 'pct') return 'pct';
    if (t.startsWith('giá') || t === 'unitprice') return 'unitPrice';
    if (t.startsWith('tiền') || t.startsWith('giảm tiền') || t === 'amountperunit') return 'amountPerUnit';
    return null;
  };
  String(text ?? '').split(/\r?\n/).map((r) => r.trim()).filter(Boolean).forEach((r, i) => {
    const c = r.split(/\t|;/).map((x) => x.trim());
    if (i === 0 && /^m[ãa]/i.test(c[0] ?? '') && !/\d/.test(c[2] ?? '')) return;
    const mode = modeOf(c[1] ?? '');
    if (!c[0]) { problems.push(`Dòng ${i + 1}: thiếu mã`); return; }
    if (!mode) { problems.push(`Dòng ${i + 1}: cách "${c[1]}" — ghi %, giá hoặc tiền`); return; }
    if (!c[2]) { problems.push(`Dòng ${i + 1}: thiếu mức giảm`); return; }
    lines.push({ ...emptyPriceLine(), sku: c[0], mode, value: c[2], maxQty: c[3] ?? '', unitName: c[4] ?? '', unitRatio: c[5] ?? '' });
  });
  return { lines, problems };
}

export function emptyForm(kind: PromoKind, today: string): Form {
  return {
    kind, key: '', reason: '', effectiveFrom: today, branchCodes: [], validFrom: today, validTo: '', priority: 0, exclusive: false, legalCapPct: '', noCap: false,
    weekdays: [], timeFrom: '', timeTo: '', minOrderAmount: '', couponCodes: '', birthdayMonth: false, memberLevels: '', birthdayScope: '', orderTypes: [],
    skus: '', basis: 'qty', tiers: [{ min: '', mode: 'pct', value: '' }], orderTiers: [{ minOrder: '', mode: 'pct', value: '', maxDiscount: '' }],
    giftTiers: [{ minOrder: '', gifts: '' }], items: [{ sku: '', qty: '1' }], comboMode: 'comboPrice', comboValue: '', maxCombos: '',
    buyQty: '2', freeQty: '1', repeat: true, buy: { sku: '', qty: '1' }, get: { sku: '', qty: '1' }, maxGiftQty: '',
    quotaPerBranch: '', quotaBranches: '', quotaPerCustomer: '',
    groupCodes: [], brandCodes: [], priceLines: [emptyPriceLine()],
    buyItems: [{ sku: '', qty: '' }], buyMode: 'any', buyTotal: '', giftOptions: [{ sku: '', qty: '1' }], choose: '1', multiply: false, maxTimes: '',
  };
}

/** Số người gõ: bỏ dấu chấm / phẩy phân cách nghìn; trống → undefined. */
export const num = (s: string): number | undefined => {
  const t = String(s ?? '').trim().replace(/[.\s]/g, '').replace(',', '.');
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};
export const list = (s: string) => [...new Set(String(s ?? '').split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))];

/** "QUA01:1, QUA02:2" → [{ sku, qty }]. */
export function parseGifts(s: string): { sku: string; qty: number }[] | null {
  const out: { sku: string; qty: number }[] = [];
  for (const part of String(s ?? '').split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean)) {
    const m = /^(\S+?)\s*[:x×*]\s*(\d+(?:[.,]\d+)?)$/i.exec(part) ?? /^(\S+)$/.exec(part);
    if (!m) return null;
    const qty = m[2] ? num(m[2]) : 1;
    if (!qty || !(qty > 0)) return null;
    out.push({ sku: m[1]!, qty });
  }
  return out;
}

type Params = Record<string, unknown>;

/** Phạm vi của khuôn @2 từ ô mã lẻ + nhóm + nhãn; trống cả ba = không khai `scope` (mọi dòng). */
export function scopeOf(f: Pick<Form, 'skus' | 'groupCodes' | 'brandCodes'>): { scope?: { skus?: string[]; groupCodes?: string[]; brandCodes?: string[] } } {
  const skus = list(f.skus), groupCodes = [...new Set(f.groupCodes)], brandCodes = [...new Set(f.brandCodes)];
  if (!skus.length && !groupCodes.length && !brandCodes.length) return {};
  return { scope: { ...(skus.length ? { skus } : {}), ...(groupCodes.length ? { groupCodes } : {}), ...(brandCodes.length ? { brandCodes } : {}) } };
}

/** Form → `params` của khuôn. Lỗi rõ ràng theo ô (Core còn kiểm lại khi phát hành). */
export function toParams(f: Form): { params: Params; problems: string[] } {
  const problems: string[] = [];
  const need = (v: number | undefined, label: string, opt: { int?: boolean; min?: number } = {}) => {
    if (v === undefined || Number.isNaN(v) || v < (opt.min ?? 0) || (opt.int && !Number.isInteger(v))) { problems.push(`${label}: chưa nhập hoặc sai`); return undefined; }
    return v;
  };
  const common: Params = {};
  if (f.kind !== 'buy_x_get_y') {
    common.priority = f.priority || 0;
    common.exclusive = f.exclusive;
    if (f.noCap) common.legalCapPct = null;
    else if (f.legalCapPct.trim()) common.legalCapPct = need(num(f.legalCapPct), 'Trần khuyến mại (%)');
    const c: Params = {};
    if (f.weekdays.length) c.weekdays = [...f.weekdays].sort();
    if (f.timeFrom) c.timeFrom = f.timeFrom;
    if (f.timeTo) c.timeTo = f.timeTo;
    if (f.minOrderAmount.trim()) c.minOrderAmount = need(num(f.minOrderAmount), 'Đơn tối thiểu');
    if (list(f.couponCodes).length) c.couponCodes = list(f.couponCodes);
    // NT-BH-049: sinh nhật theo tháng giữ ô cũ birthdayMonth (khuôn @1 hiểu); ngày / tuần dùng birthdayScope.
    if (f.birthdayMonth || f.birthdayScope === 'month') c.birthdayMonth = true;
    if (f.birthdayScope === 'day' || f.birthdayScope === 'week') c.birthdayScope = f.birthdayScope;
    if (f.orderTypes.length && f.orderTypes.length < 3) c.orderTypes = [...new Set(f.orderTypes)];
    if (list(f.memberLevels).length) c.memberLevels = list(f.memberLevels);
    if (Object.keys(c).length) common.conditions = c;
  }
  if (f.validFrom) common.validFrom = f.validFrom;
  if (f.validTo) common.validTo = f.validTo;
  if (f.validFrom && f.validTo && f.validTo < f.validFrom) problems.push('Đến ngày trước từ ngày');
  // NT-BH-049 (K9): giờ kết thúc trước giờ bắt đầu = khung qua đêm (hợp lệ); chỉ chặn hai giờ trùng nhau.
  if (f.timeFrom && f.timeTo && f.timeTo === f.timeFrom) problems.push('Giờ kết thúc trùng giờ bắt đầu');
  const skus = list(f.skus);
  let own: Params = {};
  switch (f.kind) {
    case 'tiered': {
      if (!skus.length) problems.push('Chưa nhập nhóm mã hàng');
      const tiers = f.tiers.map((t, i) => ({ min: need(num(t.min), `Bậc ${i + 1}: từ`), [t.mode]: need(num(t.value), `Bậc ${i + 1}: mức giảm`) }));
      const mins = tiers.map((t) => t.min ?? 0);
      if (mins.some((m, i) => i > 0 && m <= mins[i - 1]!)) problems.push('Các bậc phải tăng dần');
      own = { skus, basis: f.basis, tiers };
      break;
    }
    case 'order_discount': {
      const tiers = f.orderTiers.map((t, i) => ({
        minOrder: need(num(t.minOrder), `Bậc ${i + 1}: đơn từ`), [t.mode]: need(num(t.value), `Bậc ${i + 1}: mức giảm`),
        ...(t.maxDiscount.trim() ? { maxDiscount: need(num(t.maxDiscount), `Bậc ${i + 1}: giảm tối đa`) } : {}),
      }));
      own = { ...(skus.length ? { skus } : {}), tiers };
      break;
    }
    case 'order_gift': {
      const tiers = f.giftTiers.map((t, i) => {
        const gifts = parseGifts(t.gifts);
        if (!gifts?.length) problems.push(`Bậc ${i + 1}: quà ghi dạng MÃ:số lượng, cách nhau dấu phẩy`);
        return { minOrder: need(num(t.minOrder), `Bậc ${i + 1}: đơn từ`), gifts: gifts ?? [] };
      });
      own = { ...(skus.length ? { skus } : {}), tiers };
      break;
    }
    case 'combo': {
      const items = f.items.filter((x) => x.sku.trim()).map((x, i) => ({ sku: x.sku.trim(), qty: need(num(x.qty), `Món ${i + 1}: số lượng`) }));
      if (!items.length) problems.push('Combo chưa có món');
      own = { items, [f.comboMode]: need(num(f.comboValue), f.comboMode === 'comboPrice' ? 'Giá bộ' : 'Mức giảm'), ...(f.maxCombos.trim() ? { maxCombos: need(num(f.maxCombos), 'Số bộ tối đa', { int: true, min: 1 }) } : {}) };
      break;
    }
    case 'cheapest_free': {
      if (!skus.length) problems.push('Chưa nhập nhóm mã hàng');
      own = { skus, buyQty: need(num(f.buyQty), 'Mua (số món)', { int: true, min: 2 }), freeQty: need(num(f.freeQty), 'Tặng (số món)', { int: true, min: 1 }), repeat: f.repeat };
      break;
    }
    case 'buy_x_get_y': {
      if (!f.buy.sku.trim()) problems.push('Chưa nhập mã hàng phải mua');
      if (!f.get.sku.trim()) problems.push('Chưa nhập mã hàng được tặng');
      own = {
        buy: { sku: f.buy.sku.trim(), qty: need(num(f.buy.qty), 'Số lượng mua') }, get: { sku: f.get.sku.trim(), qty: need(num(f.get.qty), 'Số lượng tặng') },
        repeat: f.repeat, ...(f.maxGiftQty.trim() ? { maxGiftQty: need(num(f.maxGiftQty), 'Trần quà / phiếu') } : {}),
      };
      break;
    }
    // [2026-11-25 10:45 PM Võ Hoàng] NGHIEM-THU — NT-BH-040: form → params của ba khuôn @2 (đóng góp)
    case 'price_lines': {
      const used = f.priceLines.filter((x) => x.sku.trim());
      if (!used.length) problems.push('Chưa nhập mã hàng nào');
      const seen = new Set<string>();
      const lines = used.map((x, i) => {
        const s = x.sku.trim();
        if (seen.has(s)) problems.push(`Dòng ${i + 1}: mã ${s} đã khai ở dòng trên`);
        seen.add(s);
        const way = x.useTiers
          ? { tiers: x.tiers.map((t, j) => ({ min: need(num(t.min), `${s} bậc ${j + 1}: từ`), [t.mode]: need(num(t.value), `${s} bậc ${j + 1}: mức giảm`) })) }
          : { [x.mode]: need(num(x.value), `${s}: mức giảm`) };
        if (x.useTiers) {
          const mins = x.tiers.map((t) => num(t.min) ?? 0);
          if (mins.some((m, j) => j > 0 && m <= mins[j - 1]!)) problems.push(`${s}: các bậc phải tăng dần`);
        }
        const ratio = x.unitRatio.trim() ? need(num(x.unitRatio), `${s}: tỉ lệ quy đổi ĐVT`) : undefined;
        if (x.unitRatio.trim() && !x.unitName.trim()) problems.push(`${s}: có tỉ lệ quy đổi thì ghi tên ĐVT (vd Thùng)`);
        return {
          sku: s, ...way, ...(x.maxQty.trim() ? { maxQty: need(num(x.maxQty), `${s}: số lượng tối đa được giảm`) } : {}),
          ...(x.unitName.trim() && ratio ? { unit: { name: x.unitName.trim(), ratio } } : {}),
        };
      });
      own = { basis: f.basis, lines, ...scopeOf({ ...f, skus: '' }) };
      break;
    }
    case 'buy_x_get_y2': {
      const items = f.buyItems.filter((x) => x.sku.trim()).map((x, i) => ({
        sku: x.sku.trim(), ...(f.buyMode === 'all' ? { qty: need(num(x.qty), `Mã mua ${i + 1}: số lượng`) } : {}),
      }));
      const sc = scopeOf(f);
      if (!items.length && !sc.scope) problems.push('Chưa nhập mã hàng phải mua (hoặc phạm vi nhóm / nhãn)');
      if (f.buyMode === 'all' && !items.length) problems.push('Kiểu "mua đủ từng mã" cần danh sách mã phải mua');
      if (new Set(items.map((x) => x.sku)).size !== items.length) problems.push('Mã phải mua bị trùng');
      const options = f.giftOptions.filter((x) => x.sku.trim()).map((x, i) => ({ sku: x.sku.trim(), qty: need(num(x.qty), `Quà ${i + 1}: số lượng`) }));
      if (!options.length) problems.push('Chưa nhập quà tặng');
      if (new Set(options.map((x) => x.sku)).size !== options.length) problems.push('Quà tặng bị trùng mã');
      const choose = need(num(f.choose), 'Số quà khách được chọn', { int: true, min: 1 });
      if (choose !== undefined && options.length && choose > options.length) problems.push(`Số quà được chọn (${choose}) lớn hơn số quà khai (${options.length})`);
      own = {
        buy: { items, mode: f.buyMode, ...(f.buyMode === 'any' ? { qty: need(num(f.buyTotal), 'Tổng số lượng phải mua') } : {}) },
        get: { options, choose }, repeat: f.repeat, ...(f.maxGiftQty.trim() ? { maxGiftQty: need(num(f.maxGiftQty), 'Trần quà / phiếu') } : {}), ...sc,
      };
      break;
    }
    case 'order_gift2': {
      const tiers = f.giftTiers.map((t, i) => {
        const gifts = parseGifts(t.gifts);
        if (!gifts?.length) problems.push(`Bậc ${i + 1}: quà ghi dạng MÃ:số lượng, cách nhau dấu phẩy`);
        const minOrder = need(num(t.minOrder), `Bậc ${i + 1}: đơn từ`);
        if (f.multiply && minOrder === 0) problems.push(`Bậc ${i + 1}: nhân bội số cần ngưỡng tổng đơn > 0`);
        return { minOrder, gifts: gifts ?? [] };
      });
      const mins = tiers.map((t) => t.minOrder ?? 0);
      if (mins.some((m, i) => i > 0 && m <= mins[i - 1]!)) problems.push('Các bậc phải tăng dần');
      own = { tiers, multiply: f.multiply, ...(f.multiply && f.maxTimes.trim() ? { maxTimes: need(num(f.maxTimes), 'Số lần tối đa', { int: true, min: 1 }) } : {}), ...scopeOf(f) };
      break;
    }
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/.test(f.key.trim())) problems.push('Mã khuyến mại: 2–64 ký tự chữ, số, dấu chấm, gạch (vd KM-TET-2026)');
  if (!f.effectiveFrom) problems.push('Chưa chọn ngày bắt đầu áp');
  return { params: { ...common, ...own }, problems };
}

/** `params` của bản đang có → form (để Sửa / Ngừng). Khuôn lạ → null. */
export function fromParams(contract: string, p: Params, meta: { key: string; branchCodes?: string[]; today: string }): Form | null {
  const kind = KIND_BY_CONTRACT[contract];
  if (!kind) return null;
  const f = emptyForm(kind, meta.today);
  const s = (v: unknown) => (v === undefined || v === null ? '' : String(v));
  const c = (p.conditions ?? {}) as Record<string, unknown>;
  Object.assign(f, {
    key: meta.key, branchCodes: meta.branchCodes ?? [], validFrom: s(p.validFrom), validTo: s(p.validTo), priority: Number(p.priority ?? 0), exclusive: Boolean(p.exclusive),
    noCap: p.legalCapPct === null, legalCapPct: p.legalCapPct === null || p.legalCapPct === undefined ? '' : s(p.legalCapPct),
    weekdays: (c.weekdays as number[] | undefined) ?? [], timeFrom: s(c.timeFrom), timeTo: s(c.timeTo), minOrderAmount: s(c.minOrderAmount),
    couponCodes: ((c.couponCodes as string[] | undefined) ?? []).join(', '), birthdayMonth: false, memberLevels: ((c.memberLevels as string[] | undefined) ?? []).join(', '),
    birthdayScope: (c.birthdayScope as Form['birthdayScope'] | undefined) ?? (c.birthdayMonth ? 'month' : ''), orderTypes: (c.orderTypes as Form['orderTypes'] | undefined) ?? [],
    skus: ((p.skus as string[] | undefined) ?? []).join(', '),
  });
  const tiers = (p.tiers ?? []) as Record<string, unknown>[];
  if (kind === 'tiered') {
    f.basis = p.basis === 'amount' ? 'amount' : 'qty';
    f.tiers = tiers.map((t) => { const mode: TierMode = t.pct != null ? 'pct' : t.unitPrice != null ? 'unitPrice' : 'amountPerUnit'; return { min: s(t.min), mode, value: s(t[mode]) }; });
  }
  if (kind === 'order_discount') f.orderTiers = tiers.map((t) => ({ minOrder: s(t.minOrder), mode: t.pct != null ? 'pct' : 'amount', value: s(t.pct ?? t.amount), maxDiscount: s(t.maxDiscount) }));
  if (kind === 'order_gift') f.giftTiers = tiers.map((t) => ({ minOrder: s(t.minOrder), gifts: ((t.gifts ?? []) as { sku: string; qty: number }[]).map((g) => `${g.sku}:${g.qty}`).join(', ') }));
  if (kind === 'combo') {
    f.items = ((p.items ?? []) as { sku: string; qty: number }[]).map((x) => ({ sku: x.sku, qty: s(x.qty) }));
    f.comboMode = p.comboPrice != null ? 'comboPrice' : p.discountPct != null ? 'discountPct' : 'discountAmount';
    f.comboValue = s(p[f.comboMode]); f.maxCombos = s(p.maxCombos);
  }
  if (kind === 'cheapest_free') { f.buyQty = s(p.buyQty); f.freeQty = s(p.freeQty ?? 1); f.repeat = p.repeat !== false; }
  if (kind === 'buy_x_get_y') {
    const b = (p.buy ?? {}) as { sku?: string; qty?: number }, g = (p.get ?? {}) as { sku?: string; qty?: number };
    f.buy = { sku: s(b.sku), qty: s(b.qty) }; f.get = { sku: s(g.sku), qty: s(g.qty) }; f.repeat = p.repeat !== false; f.maxGiftQty = s(p.maxGiftQty);
  }
  // [2026-11-25 10:45 PM Võ Hoàng] NGHIEM-THU — NT-BH-040: params @2 → form (Sửa / Ngừng) (đóng góp)
  if (V2_KINDS.includes(kind)) {
    const sc = (p.scope ?? {}) as { skus?: string[]; groupCodes?: string[]; brandCodes?: string[] };
    f.skus = (sc.skus ?? []).join(', '); f.groupCodes = sc.groupCodes ?? []; f.brandCodes = sc.brandCodes ?? [];
  }
  const modeOf = (t: Record<string, unknown>): TierMode => (t.pct != null ? 'pct' : t.unitPrice != null ? 'unitPrice' : 'amountPerUnit');
  if (kind === 'price_lines') {
    f.basis = p.basis === 'amount' ? 'amount' : 'qty';
    f.priceLines = ((p.lines ?? []) as Record<string, unknown>[]).map((x) => {
      const ts = x.tiers as Record<string, unknown>[] | undefined;
      const mode = modeOf(x);
      return {
        sku: s(x.sku), useTiers: Boolean(ts?.length), mode, value: ts?.length ? '' : s(x[mode]), maxQty: s(x.maxQty),
        unitName: s((x.unit as { name?: string } | undefined)?.name), unitRatio: s((x.unit as { ratio?: number } | undefined)?.ratio),
        tiers: ts?.length ? ts.map((t) => ({ min: s(t.min), mode: modeOf(t), value: s(t[modeOf(t)]) })) : [{ min: '', mode: 'pct' as TierMode, value: '' }],
      };
    });
    if (!f.priceLines.length) f.priceLines = [emptyPriceLine()];
  }
  if (kind === 'buy_x_get_y2') {
    const b = (p.buy ?? {}) as { items?: { sku: string; qty?: number }[]; mode?: string; qty?: number };
    const g = (p.get ?? {}) as { options?: { sku: string; qty: number }[]; choose?: number };
    f.buyItems = (b.items ?? []).map((x) => ({ sku: x.sku, qty: s(x.qty) }));
    if (!f.buyItems.length) f.buyItems = [{ sku: '', qty: '' }];
    f.buyMode = b.mode === 'all' ? 'all' : 'any'; f.buyTotal = s(b.qty);
    f.giftOptions = (g.options ?? []).map((x) => ({ sku: x.sku, qty: s(x.qty) }));
    if (!f.giftOptions.length) f.giftOptions = [{ sku: '', qty: '1' }];
    f.choose = s(g.choose ?? 1); f.repeat = p.repeat !== false; f.maxGiftQty = s(p.maxGiftQty);
  }
  if (kind === 'order_gift2') {
    f.giftTiers = tiers.map((t) => ({ minOrder: s(t.minOrder), gifts: ((t.gifts ?? []) as { sku: string; qty: number }[]).map((g) => `${g.sku}:${g.qty}`).join(', ') }));
    f.multiply = p.multiply === true; f.maxTimes = s(p.maxTimes);
  }
  return f;
}

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * Nội dung bản "ngừng" từ ngày `stopFrom`: giữ nguyên nội dung, kết thúc chiến dịch hôm trước (`validTo` = stopFrom − 1). Khuyến mại chưa chạy
 * (validFrom ≥ stopFrom) → cửa sổ thu về một ngày trước stopFrom: không ngày bán nào từ stopFrom trở đi còn áp.
 */
export function stopParams(p: Params, stopFrom: string): Params {
  const end = addDays(stopFrom, -1);
  const from = typeof p.validFrom === 'string' && p.validFrom > end ? end : p.validFrom;
  return { ...p, ...(from !== undefined ? { validFrom: from } : {}), validTo: typeof p.validTo === 'string' && p.validTo < end ? p.validTo : end };
}

export type Status = 'upcoming' | 'running' | 'ended' | 'stopped';
export const STATUS_LABEL: Record<Status, { label: string; tone: string }> = {
  upcoming: { label: 'Sắp chạy', tone: 'info' }, running: { label: 'Đang chạy', tone: 'ok' }, ended: { label: 'Đã hết', tone: 'gray' }, stopped: { label: 'Đã ngừng', tone: 'warn' },
};
/** Lý do phát hành của bản "ngừng" — để danh sách nhận ra. */
export const STOP_REASON = 'Ngừng khuyến mại';

/** Trạng thái theo ngày hôm nay, cửa sổ chiến dịch trong nội dung và bản cuối (ngừng hay không). */
export function statusOf(x: { validFrom?: string | null; validTo?: string | null; lastReason?: string | null; effectiveTo?: string | null }, today: string): Status {
  if (x.lastReason?.startsWith(STOP_REASON)) return 'stopped';
  if (x.effectiveTo && x.effectiveTo < today) return 'ended';
  if (x.validTo && x.validTo < today) return 'ended';
  if (x.validFrom && x.validFrom > today) return 'upcoming';
  return 'running';
}

// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-025: hạn mức lượt theo cửa hàng ↔ ô của form (đóng góp)
export type Quota = { perBranch?: number; branches?: Record<string, number>; perCustomer?: number };

/** Ô hạn mức → `quota` của bản nháp (null = không giới hạn). Lỗi rõ theo ô. */
export function toQuota(f: Pick<Form, 'quotaPerBranch' | 'quotaBranches'> & Partial<Pick<Form, 'quotaPerCustomer'>>): { quota: Quota | null; problems: string[] } {
  const problems: string[] = [];
  const q: Quota = {};
  if (f.quotaPerBranch.trim()) {
    const n = num(f.quotaPerBranch);
    if (n === undefined || Number.isNaN(n) || n < 0 || !Number.isInteger(n)) problems.push('Hạn mức lượt mỗi cửa hàng: số nguyên ≥ 0');
    else q.perBranch = n;
  }
  for (const part of String(f.quotaBranches ?? '').split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean)) {
    const m = /^([A-Za-z0-9._-]+)\s*[=:]\s*(\d+)$/.exec(part);
    if (!m) { problems.push(`Hạn mức riêng "${part}": ghi dạng CN01=2`); continue; }
    (q.branches ??= {})[m[1]!] = Number(m[2]);
  }
  if ((f.quotaPerCustomer ?? '').trim()) {
    const n = num(f.quotaPerCustomer!);
    if (n === undefined || Number.isNaN(n) || n < 1 || !Number.isInteger(n)) problems.push('Lượt mỗi khách: số nguyên ≥ 1');
    else q.perCustomer = n;
  }
  return { quota: q.perBranch === undefined && !q.branches && q.perCustomer === undefined ? null : q, problems };
}

/** `quota` của bản nháp → ô của form. */
export function fromQuota(q: Quota | null | undefined): Pick<Form, 'quotaPerBranch' | 'quotaBranches' | 'quotaPerCustomer'> {
  return {
    quotaPerCustomer: q?.perCustomer === undefined ? '' : String(q.perCustomer),
    quotaPerBranch: q?.perBranch === undefined ? '' : String(q.perBranch),
    quotaBranches: Object.entries(q?.branches ?? {}).map(([b, n]) => `${b}=${n}`).join(', '),
  };
}

export type DraftStatus = 'draft' | 'pending' | 'approved' | 'published' | 'rejected';
export const DRAFT_STATUS_LABEL: Record<DraftStatus, { label: string; tone: string }> = {
  draft: { label: 'Nháp', tone: 'gray' }, pending: { label: 'Chờ duyệt', tone: 'warn' }, approved: { label: 'Đã duyệt, chưa phát hành', tone: 'info' },
  published: { label: 'Đã phát hành', tone: 'ok' }, rejected: { label: 'Từ chối', tone: 'bad' },
};
export const LOG_LABEL: Record<string, string> = {
  create: 'Lập', update: 'Sửa', submit: 'Gửi duyệt', approve: 'Duyệt', publish: 'Phát hành', reject: 'Từ chối', stop: 'Ngừng', import: 'Chuyển từ website',
};
