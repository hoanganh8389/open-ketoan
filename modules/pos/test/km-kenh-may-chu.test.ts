// [2026-11-29 06:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-067: máy chủ kiểm lại điều kiện kênh của khuyến mại; kiểm trùng chương trình theo kênh (đóng góp)
import { describe, expect, it } from 'vitest';
import { channelCondOf, channelMismatch, channelsDisjoint, overlapOf, promoChannelMessage, type PromoShape } from '../api/domain/promo.js';

const KIND: Record<string, string> = { GAN_SHOP: 'offline', HOTLINE: 'offline', ZALO: 'online', FACEBOOK_CT: 'online' };
const kindOf = (c: string) => KIND[c];
const shape = (key: string, conditions?: Record<string, unknown>): PromoShape => ({
  key, contract: 'sale.promo.price_lines@2', params: { basis: 'qty', lines: [{ sku: 'SUA330', pct: 10 }], ...(conditions ? { conditions } : {}) },
  branchCodes: ['CN01'], from: '2026-11-29', to: null,
});

describe('NT-BH-067 — kênh bán: máy chủ kiểm lại khi nhận đơn', () => {
  it('Chỉ online: đơn kênh Gần shop (offline) → lý do "chỉ áp kênh online"; kênh Zalo (online) → đạt', () => {
    const c = { channelKinds: ['online'] };
    expect(channelMismatch(c, 'GAN_SHOP', 'offline')).toBe('chỉ áp kênh online');
    expect(channelMismatch(c, 'ZALO', 'online')).toBeNull();
  });
  it('Chỉ offline, đơn không xác định loại kênh → không giữ (C7)', () => {
    expect(channelMismatch({ channelKinds: ['offline'] }, 'GAN_SHOP', null)).toContain('chưa xác định kênh');
  });
  it('Chọn kênh ZALO: mã kênh so không phân biệt hoa thường; FACEBOOK_CT → không đạt', () => {
    expect(channelMismatch({ channels: ['ZALO'] }, 'zalo', 'online')).toBeNull();
    expect(channelMismatch({ channels: ['ZALO'] }, 'FACEBOOK_CT', 'online')).toBe('chỉ áp kênh ZALO');
  });
  it('không điều kiện kênh → luôn đạt; channelCondOf bỏ điều kiện rỗng', () => {
    expect(channelMismatch(undefined, '', null)).toBeNull();
    expect(channelCondOf({ conditions: { orderTypes: ['retail'] } })).toBeNull();
    expect(channelCondOf({ conditions: { channelKinds: ['online'] } })).toEqual({ channelKinds: ['online'] });
  });
  it('câu báo nêu kênh, mã chương trình và lý do', () => {
    expect(promoChannelMessage([{ key: 'KM-ONL', channel: 'GAN_SHOP', kind: 'offline', why: 'chỉ áp kênh online' }]))
      .toBe('Khuyến mại không áp được cho kênh bán GAN_SHOP: KM-ONL — chỉ áp kênh online — chọn đúng kênh trên hoá đơn rồi tính lại khuyến mại');
  });
});

describe('NT-BH-067 — kiểm trùng chương trình theo kênh', () => {
  it('Chỉ online ↔ Chỉ offline cùng mã, cùng cửa hàng, cùng thời gian → không trùng', () => {
    expect(overlapOf(shape('A', { channelKinds: ['online'] }), shape('B', { channelKinds: ['offline'] }), kindOf)).toBeNull();
  });
  it('Tất cả kênh ↔ Chỉ online → vẫn trùng', () => {
    expect(overlapOf(shape('A'), shape('B', { channelKinds: ['online'] }), kindOf)).toEqual({ skus: ['SUA330'], branches: ['CN01'] });
  });
  it('chọn kênh ZALO ↔ Chỉ offline → không trùng (ZALO là kênh online); ZALO ↔ Chỉ online → trùng', () => {
    expect(channelsDisjoint({ channels: ['ZALO'] }, { channelKinds: ['offline'] }, kindOf)).toBe(true);
    expect(channelsDisjoint({ channels: ['ZALO'] }, { channelKinds: ['online'] }, kindOf)).toBe(false);
  });
  it('chọn kênh không chung mã → không trùng; chung một mã → trùng', () => {
    expect(channelsDisjoint({ channels: ['ZALO'] }, { channels: ['FACEBOOK_CT', 'HOTLINE'] }, kindOf)).toBe(true);
    expect(channelsDisjoint({ channels: ['zalo', 'HOTLINE'] }, { channels: ['ZALO'] }, kindOf)).toBe(false);
  });
  it('kênh không tra được loại → coi như có thể trùng (chọn tạm T6)', () => {
    expect(channelsDisjoint({ channels: ['KENH_MOI'] }, { channelKinds: ['offline'] }, kindOf)).toBe(false);
    expect(channelsDisjoint({ channels: ['ZALO'] }, { channelKinds: ['offline'] })).toBe(false);
  });
});
