// [2026-11-25 Nguyễn Văn Thủy] HT13 — khối CÔNG CỤ & GIÁM SÁT: khai mật khẩu công cụ (xoá hết danh mục, nạp dữ liệu, đổi công thức giá vốn) và
// đường dẫn + tài khoản Grafana / Loki / Prometheus / Alertmanager ngay trên màn, không phải đặt biến môi trường rồi build / khởi động lại.
// Giai đoạn chạy thử: mật khẩu hiện rõ để demo / tra cứu nhanh (đóng góp)
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, ExternalLink } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';

interface CongCu {
  wipePassword?: string; seedPassword?: string; costingPassword?: string;
  grafanaUrl?: string; grafanaUser?: string; grafanaPassword?: string;
  prometheusUrl?: string; alertmanagerUrl?: string; note?: string; lokiUrl?: string; tempoUrl?: string;
  envDefaults?: { grafanaUrl: string; wipeFromEnv: boolean; seedFromEnv: boolean };
}
type K = Exclude<keyof CongCu, 'envDefaults'>;

const chep = (t: string) => { void navigator.clipboard?.writeText(t); };

export function CongCuGiamSat() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['cong-cu'], queryFn: () => api.get<CongCu>('/api/v1/system/cong-cu'), enabled: can('settings:write'), retry: false });
  const [v, setV] = useState<CongCu>({});
  const [mo, setMo] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { if (q.data) setV(q.data); }, [q.data]);
  const luu = useMutation({
    mutationFn: () => { const { envDefaults: _e, ...body } = v; return api.put('/api/v1/system/cong-cu', body); },
    onSuccess: () => { setMsg({ ok: true, text: 'Đã lưu — áp dụng ngay, không cần khởi động lại' }); void qc.invalidateQueries({ queryKey: ['cong-cu'] }); void qc.invalidateQueries({ queryKey: ['cong-cu-links'] }); },
    onError: (e) => setMsg({ ok: false, text: errorText(e) }),
  });
  if (!can('settings:write')) return null;
  const env = q.data?.envDefaults;
  const o = (k: K, label: string, tip: string, ph = '') => (
    <div className="field">
      <label title={tip}>{label}</label>
      <div style={{ display: 'flex', gap: 4 }}>
        <input className="input mono" style={{ flex: 1, minWidth: 0 }} value={v[k] ?? ''} placeholder={ph} onChange={(e) => { setV({ ...v, [k]: e.target.value }); setMsg(null); }} />
        {v[k] && <button type="button" className="btn btn-sm" title="Chép" onClick={() => chep(v[k] ?? '')}><Copy size={12} /></button>}
      </div>
    </div>
  );
  const grafana = (v.grafanaUrl || env?.grafanaUrl || `${window.location.protocol}//${window.location.hostname}:3000`).replace(/\/+$/, '');
  const loki = `${grafana}/explore?schemaVersion=1&orgId=1&panes=${encodeURIComponent(JSON.stringify({ a: { datasource: 'loki', queries: [{ refId: 'A', expr: '{service="api", level=~"error|warn"}', datasource: { type: 'loki', uid: 'loki' } }], range: { from: 'now-6h', to: 'now' } } }))}`;
  return (
    <div className="card card-body" style={{ marginTop: 0, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <b style={{ fontSize: 15 }}>Công cụ & giám sát</b>
        <span className="muted" style={{ fontSize: 12 }}>mật khẩu công cụ, đường dẫn + tài khoản Grafana / Loki — lưu là áp dụng ngay, không cần biến môi trường hay build lại</span>
        <button type="button" className="btn btn-sm btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => setMo(!mo)}>{mo ? 'Thu gọn' : 'Mở'}</button>
      </div>
      {mo && (q.isLoading ? <div className="muted">Đang tải…</div> : q.error ? <div className="alert alert-bad">{errorText(q.error)}</div> : <>
        <div className="muted" style={{ fontSize: 12, margin: '6px 0' }}>Đang chạy thử: mật khẩu hiện rõ để tra cứu nhanh. Ô trống = dùng biến môi trường cũ (nếu máy chủ có đặt).</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 8 }}>
          {o('wipePassword', 'Mật khẩu xoá hết danh mục', 'Hỏi khi bấm Xoá hết / Xoá hết vĩnh viễn ở thùng rác danh mục', env?.wipeFromEnv ? '(đang dùng biến môi trường)' : 'chưa khai — xoá hết đang tắt')}
          {o('seedPassword', 'Mật khẩu nạp / xoá dữ liệu mẫu', 'Hỏi khi nạp / xoá dữ liệu tình huống mua hàng', env?.seedFromEnv ? '(đang dùng biến môi trường)' : 'chưa khai')}
          {o('costingPassword', 'Mật khẩu đổi công thức giá vốn', 'Trống = dùng mật khẩu xoá hết', 'trống = như mật khẩu xoá hết')}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 8, marginTop: 8 }}>
          {o('grafanaUrl', 'Địa chỉ Grafana (xem log Loki, biểu đồ)', 'Vd http://ketoan-dev.quantri.thegioisua.com:3000 — trình duyệt phải mở được địa chỉ này', env?.grafanaUrl || `${window.location.protocol}//${window.location.hostname}:3000`)}
          {o('grafanaUser', 'Tài khoản Grafana', 'Tên đăng nhập Grafana', 'admin')}
          {o('grafanaPassword', 'Mật khẩu Grafana', 'Mật khẩu đăng nhập Grafana (GRAFANA_ADMIN_PASSWORD lúc dựng)')}
          {o('lokiUrl', 'Địa chỉ Loki (máy chủ đọc log lỗi)', 'Máy chủ API gọi tới để Tra mã / Nhật ký đọc log lỗi. Cùng máy docker: http://loki:3100', 'http://loki:3100')}
          {o('tempoUrl', 'Địa chỉ Tempo (máy chủ đọc vết)', 'Máy chủ API gọi tới để xem vết (trace) một yêu cầu. Cùng máy docker: http://tempo:3200', 'http://tempo:3200')}
          {o('prometheusUrl', 'Địa chỉ Prometheus', 'Số đo, luật cảnh báo', 'http://127.0.0.1:9090')}
          {o('alertmanagerUrl', 'Địa chỉ Alertmanager', 'Cảnh báo đang bật', 'http://127.0.0.1:9093')}
        </div>
        <div className="field" style={{ marginTop: 8 }}><label>Ghi chú (tài khoản khác, cách mở cổng…)</label>
          <textarea className="input" rows={2} value={v.note ?? ''} onChange={(e) => { setV({ ...v, note: e.target.value }); setMsg(null); }} /></div>
        <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="btn btn-primary btn-sm" disabled={luu.isPending} onClick={() => luu.mutate()}>Ghi</button>
          <a className="btn btn-sm" href={loki} target="_blank" rel="noreferrer" title="Grafana Explore, nguồn Loki — log lỗi của API 6 giờ gần nhất"><ExternalLink size={12} /> Xem log lỗi (Loki)</a>
          <a className="btn btn-sm" href={grafana} target="_blank" rel="noreferrer" title="Bảng điều khiển (biểu đồ)"><ExternalLink size={12} /> Grafana</a>
          {v.prometheusUrl && <a className="btn btn-sm" href={v.prometheusUrl} target="_blank" rel="noreferrer"><ExternalLink size={12} /> Prometheus</a>}
          {v.alertmanagerUrl && <a className="btn btn-sm" href={v.alertmanagerUrl} target="_blank" rel="noreferrer"><ExternalLink size={12} /> Alertmanager</a>}
          <a className="btn btn-sm" href="/dev/tra-ma" target="_blank" rel="noreferrer" title="Tra mã lỗi req-… ngay trong phần mềm (đọc Loki qua máy chủ, không cần mở cổng Grafana)"><ExternalLink size={12} /> Tra mã lỗi (trong phần mềm)</a>
          {msg && <span className={msg.ok ? 'mh-ok' : 'mh-bad'} style={{ fontSize: 12.5 }}>{msg.text}</span>}
        </div>
      </>)}
    </div>
  );
}
