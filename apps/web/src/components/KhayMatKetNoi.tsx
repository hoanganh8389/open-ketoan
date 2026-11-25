// [2026-11-22 02:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — B4 (S038-9): một khay "Không kết nối được máy chủ phần mềm" thay hộp lỗi kỹ thuật mỗi lời gọi; nối lại thì tắt và tải lại số liệu
/**
 * Hiện khi lib/ketNoi.ts báo mất kết nối (cổng vào trả GATEWAY_UNAVAILABLE, hoặc 502 / 503 không phải JSON). Chữ cho kế toán
 * (CHU_MAT_KET_NOI, @ketoan/contracts): không mã kỹ thuật trên dòng chính; mã tra cứu để chép gửi quản trị. Sau 60 giây hiện
 * thêm hướng dẫn gom log (lay-log.sh). Nối lại → báo "đã nối lại" vài giây, react-query tải lại số liệu các màn đang mở.
 * Dùng lại khung .ma-tra-cuu (theme.css), đặt giữa mép trên màn.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw, WifiOff } from 'lucide-react';
import { CHU_MAT_KET_NOI } from '@ketoan/contracts';
import { ketNoi, SU_KIEN_DA_NOI_LAI } from '@/lib/ketNoi';

const VI_TRI = { top: 12, bottom: 'auto', left: '50%', transform: 'translateX(-50%)', maxWidth: 'min(520px, calc(100vw - 24px))' } as const;
const KEO_DAI_MS = 60_000;
const BAO_DA_NOI_MS = 4_000;

export function KhayMatKetNoi() {
  const st = useSyncExternalStore(ketNoi.nghe, ketNoi.trangThai);
  const qc = useQueryClient();
  const [bay, setBay] = useState(() => Date.now());

  // đồng hồ thô để hiện "kéo dài" và tắt báo "đã nối lại" — chỉ chạy khi có gì để hiện
  useEffect(() => {
    if (!st.mat && !st.daNoiLuc) return;
    const t = window.setInterval(() => setBay(Date.now()), 5_000);
    return () => window.clearInterval(t);
  }, [st.mat, st.daNoiLuc]);

  useEffect(() => {
    const noiLai = () => { void qc.invalidateQueries(); setBay(Date.now()); };
    window.addEventListener(SU_KIEN_DA_NOI_LAI, noiLai);
    return () => window.removeEventListener(SU_KIEN_DA_NOI_LAI, noiLai);
  }, [qc]);

  if (!st.mat) {
    if (st.daNoiLuc && bay - st.daNoiLuc < BAO_DA_NOI_MS) {
      return (
        <div className="ma-tra-cuu" role="status" aria-live="polite" style={{ ...VI_TRI, borderLeftColor: 'var(--ok, var(--warn))' }}>
          <RefreshCw size={15} className="mtc-icon" aria-hidden />
          <div className="mtc-body"><div className="mtc-head"><b>{CHU_MAT_KET_NOI.daNoi}</b></div></div>
        </div>
      );
    }
    return null;
  }

  const keoDai = st.tu !== null && bay - st.tu >= KEO_DAI_MS;
  return (
    <div className="ma-tra-cuu ky-thuat" role="alert" aria-live="assertive" style={VI_TRI}>
      <WifiOff size={15} className="mtc-icon" aria-hidden />
      <div className="mtc-body">
        <div className="mtc-head"><b>{CHU_MAT_KET_NOI.tieuDe}</b></div>
        <div>{CHU_MAT_KET_NOI.moTa}</div>
        {keoDai && <div className="mtc-note">{CHU_MAT_KET_NOI.keoDai}</div>}
        <div className="mtc-actions">
          <button type="button" className="btn btn-xs" disabled={st.dangThu} title={st.dangThu ? 'Đang thử nối lại máy chủ — chờ vài giây' : 'Thử nối lại máy chủ ngay, không chờ lần tự thử kế tiếp'} onClick={() => void ketNoi.thuNgay()}>
            <RefreshCw size={12} aria-hidden /> {st.dangThu ? 'Đang thử…' : CHU_MAT_KET_NOI.thuLai}
          </button>
          {st.requestId && <span className="mtc-ids">Mã tra cứu: <code>{st.requestId}</code></span>}
        </div>
      </div>
    </div>
  );
}
