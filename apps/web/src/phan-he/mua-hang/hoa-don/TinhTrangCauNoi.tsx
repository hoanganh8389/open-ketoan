// [2026-11-23 11:30 AM Nguyễn Văn Thủy] MH22 — dòng tình trạng cầu nối hoá đơn: máy nào, công ty nào, chạy lúc nào, lần tới, mất liên lạc (đóng góp)
/**
 * TÌNH TRẠNG CẦU NỐI HOÁ ĐƠN: cầu nối trên máy tải hoá đơn báo về sau mỗi lượt. Mỗi máy × công ty × kết nối một dòng.
 * Quá 1 ngày không báo (mà không tạm ngừng) thì đỏ: máy có thể đã tắt, hoá đơn mới không về.
 */
import { useQuery } from '@tanstack/react-query';
import { MonitorSmartphone } from 'lucide-react';
import { api } from '@/lib/api';

interface BridgeState {
  machine: string; companyTaxCode: string; companyName: string; connection: string; status: 'running' | 'paused'; pausedBy: string; message: string;
  lastRunAt: string; nextRunAt: string | null; intervalMinutes: number | null; keyName: string; ageHours: number; stale: boolean;
  counts: { saved?: number; duplicate?: number; errors?: number; pending?: number; notDownloaded?: number; onErp?: number };
}
const gio = (s: string | null) => (s ? new Date(s).toLocaleString('vi-VN', { hour12: false, hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '');
const PAUSED: Record<string, string> = { all: 'tạm dừng cả cầu nối', company: 'tạm ngừng công ty', connection: 'tạm ngừng kết nối' };

export function TinhTrangCauNoi() {
  const q = useQuery({ queryKey: ['mua-hang', 'bridge-status'], refetchInterval: 60_000, retry: false, queryFn: async () => (await api.getQuiet<BridgeState[]>('/api/v1/purchase/invoices/bridge/status')).data });
  const rows = q.data ?? [];
  if (q.isLoading || q.isError) return null;
  return (
    <div className="filters" style={{ paddingTop: 0, fontSize: 12.5, gap: 6, alignItems: 'flex-start' }}>
      <span className="muted" title="Chương trình trên máy tải hoá đơn, tự đẩy hoá đơn lên đây. Cài đặt: xem Hướng dẫn của màn này" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><MonitorSmartphone size={14} /> Cầu nối hoá đơn</span>
      {!rows.length && <span className="muted" title="Tạo khoá ở HT02 Khoá API (chỉ tích Gửi chứng từ), dán vào cầu nối trên máy tải hoá đơn">Chưa có cầu nối nào báo về</span>}
      {rows.map((b) => {
        const [nhan, mau] = b.stale ? ['Mất liên lạc', 'badge-bad'] : b.status === 'paused' ? ['Tạm ngừng', 'badge-gray'] : (b.counts.errors ?? 0) > 0 ? ['Có lỗi', 'badge-warn'] : ['Đang chạy', 'badge-ok'];
        const chiTiet = [
          `Máy: ${b.machine}`, `Công ty trong tool: ${b.companyTaxCode} ${b.companyName}`, `Kết nối: ${b.connection}`, `Khoá API: ${b.keyName}`,
          `Lần chạy gần nhất: ${gio(b.lastRunAt)}${b.stale ? ` (${Math.floor(b.ageHours)} giờ trước)` : ''}`,
          b.status === 'paused' ? `Đang ${PAUSED[b.pausedBy] ?? 'tạm ngừng'}` : b.nextRunAt ? `Lần chạy tới: ${gio(b.nextRunAt)}` : '',
          `Lượt gần nhất: nhập ${b.counts.saved ?? 0}, đã có ${b.counts.duplicate ?? 0}, lỗi ${b.counts.errors ?? 0}`,
          `Đã lên đây: ${b.counts.onErp ?? 0} · chờ gửi: ${b.counts.pending ?? 0} · tool chưa tải: ${b.counts.notDownloaded ?? 0}`,
          b.message,
        ].filter(Boolean).join('\n');
        return (
          <span key={`${b.machine}|${b.companyTaxCode}|${b.connection}`} title={chiTiet} style={{ display: 'inline-flex', gap: 4, alignItems: 'center', border: '1px solid var(--line)', borderRadius: 6, padding: '1px 6px' }}>
            <span className={`badge ${mau}`}>{nhan}</span>
            <span>{b.companyName || b.companyTaxCode} · {b.machine}</span>
            <span className="muted">· chạy {gio(b.lastRunAt)}{b.status === 'running' && b.nextRunAt && !b.stale ? ` · lần tới ${gio(b.nextRunAt)}` : ''} · chờ gửi {b.counts.pending ?? 0}</span>
          </span>
        );
      })}
    </div>
  );
}
