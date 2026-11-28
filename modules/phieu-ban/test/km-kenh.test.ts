// [2026-11-29 06:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-067 (C3): phiếu bán BH10 / đơn BH20 — điều kiện kênh của khuyến mại kiểm lại ở máy chủ (đóng góp)
import { describe, expect, it } from 'vitest';
import { promoChannelIssues, promoChannelMessage, promoChannelMismatch, type ChannelCond } from '../api/domain/doc.js';

describe('NT-BH-067 — khuyến mại theo kênh trên phiếu bán', () => {
  it('Chỉ online: phiếu kênh Gần shop (offline) → không giữ; kênh Zalo (online) → giữ', () => {
    expect(promoChannelMismatch({ channelKinds: ['online'] }, 'GAN_SHOP', 'offline')).toBe('chỉ áp kênh online');
    expect(promoChannelMismatch({ channelKinds: ['online'] }, 'ZALO', 'online')).toBeNull();
  });
  it('module pos chưa bật (không biết loại kênh) → chương trình theo loại kênh không giữ; chọn kênh vẫn so mã', () => {
    expect(promoChannelMismatch({ channelKinds: ['offline'] }, 'GAN_SHOP', null)).toContain('chưa xác định loại kênh');
    expect(promoChannelMismatch({ channels: ['GAN_SHOP'] }, 'gan_shop', null)).toBeNull();
  });
  it('nhiều chương trình: chỉ báo chương trình sai kênh; chương trình không trong danh sách / không điều kiện → bỏ qua', () => {
    const conds = new Map<string, ChannelCond | null>([['KM-ONL', { channelKinds: ['online'] }], ['KM-ALL', null], ['KM-ZALO', { channels: ['ZALO'] }]]);
    const issues = promoChannelIssues(['KM-ZALO', 'KM-ONL', 'KM-ALL', 'KM-LA', 'KM-ONL'], conds, 'GAN_SHOP', 'offline');
    expect(issues).toEqual([
      { key: 'KM-ONL', channel: 'GAN_SHOP', kind: 'offline', why: 'chỉ áp kênh online' },
      { key: 'KM-ZALO', channel: 'GAN_SHOP', kind: 'offline', why: 'chỉ áp kênh ZALO' },
    ]);
    expect(promoChannelMessage(issues)).toContain('Khuyến mại không áp được cho kênh bán GAN_SHOP: KM-ONL — chỉ áp kênh online; KM-ZALO — chỉ áp kênh ZALO');
    expect(promoChannelIssues(['KM-ONL'], conds, 'ZALO', 'online')).toEqual([]);
  });
});
