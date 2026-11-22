// [2026-11-22 05:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — B4b (S038-13, R-LOG-10): khung lỗi theo màn — lỗi render không còn là màn trắng; có mã tra cứu, nút mở lại; lỗi gửi về máy chủ
/**
 * Bọc mỗi màn (TabWorkspace: <Routes> của từng thẻ) và gốc ứng dụng (main.tsx). Một màn lỗi lập trình thì chỉ màn đó hiện khung
 * báo lỗi — thẻ khác, thanh menu vẫn dùng được. Đổi màn (`man` khác) thì khung tự thử dựng lại.
 * Chữ cho kế toán: không mã kỹ thuật trên dòng chính; mã tra cứu để chép gửi người hỗ trợ (cùng `cid` trong logs/web-client.log).
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, Copy, RotateCcw } from 'lucide-react';
import { baoLoi } from '@/lib/baoLoiTrinhDuyet';

interface Props { man: string; children: ReactNode }
interface State { loi: boolean; cid: string; man: string; daChep: boolean }

export class LoiManHinh extends Component<Props, State> {
  override state: State = { loi: false, cid: '', man: this.props.man, daChep: false };

  static getDerivedStateFromError(): Partial<State> {
    return { loi: true };
  }

  static getDerivedStateFromProps(p: Props, s: State): Partial<State> | null {
    // sang màn khác: bỏ trạng thái lỗi để màn mới dựng bình thường
    return p.man !== s.man ? { loi: false, cid: '', man: p.man, daChep: false } : null;
  }

  override componentDidCatch(err: Error, _info: ErrorInfo): void {
    // componentStack có tên thành phần (không dữ liệu) nhưng dài; khung stack của lỗi đã đủ chỉ chỗ — không gửi thêm
    this.setState({ cid: baoLoi(err, 'render') });
  }

  private chep = () => {
    void navigator.clipboard?.writeText(`Mã tra cứu lỗi màn: ${this.state.cid} · màn ${this.props.man} · ${new Date().toLocaleString('vi-VN')}`)
      .then(() => this.setState({ daChep: true }))
      .catch(() => {
        // nuot-loi: trình duyệt không cho chép (http, quyền) — mã vẫn hiện trên màn để đọc chép tay
      });
  };

  override render(): ReactNode {
    if (!this.state.loi) return this.props.children;
    return (
      <div role="alert" style={{ margin: '24px auto', maxWidth: 560, padding: 16, border: '1px solid var(--line)', borderLeft: '4px solid var(--bad)', borderRadius: 'var(--radius)', background: 'var(--surface)', display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <AlertTriangle size={18} color="var(--bad)" aria-hidden />
          <b>Màn này gặp lỗi, chưa hiển thị được</b>
        </div>
        <div>Dữ liệu đã lưu không bị ảnh hưởng. Các thẻ khác vẫn dùng bình thường. Bấm <b>Mở lại màn</b>; lặp lại thì chép mã tra cứu gửi người hỗ trợ.</div>
        <div style={{ color: 'var(--ink-500)' }}>Mã tra cứu: <code>{this.state.cid || '…'}</code></div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="btn btn-sm" onClick={() => this.setState({ loi: false, cid: '', daChep: false })}>
            <RotateCcw size={13} aria-hidden /> Mở lại màn
          </button>
          <button type="button" className="btn btn-sm" onClick={this.chep}>
            <Copy size={13} aria-hidden /> {this.state.daChep ? 'Đã chép' : 'Chép mã'}
          </button>
        </div>
      </div>
    );
  }
}
