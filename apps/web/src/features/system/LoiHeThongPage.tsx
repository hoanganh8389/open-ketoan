// [2026-11-25 12:00 AM Nguyễn Văn Thủy] HT20 — HT20 LỖI HỆ THỐNG — lỗi trên máy chủ được gom thành mục theo phân hệ: lịch sử, Tra mã, Sửa lỗi này / Bỏ qua,
// công tắc Tự sửa, Dựng lại ngay (cron máy chủ thực hiện). Thiết kế + quy trình cho cả team: docs/ops/TU-DONG-SUA-LOI.md (đóng góp)
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Loading } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type TrangThai = 'moi' | 'yeu_cau' | 'dang_sua' | 'da_sua' | 'bo_qua' | 'tai_phat';
interface MucLoi {
  fp: string; phanHe: string; tenPhanHe: string; loai: 'phan-mem' | 'tu-choi'; errCode: string; status: number; method: string; route: string; msg: string;
  count: number; first: string; last: string; lastReqId: string; trangThai: TrangThai; nguoi?: string; ghiChu?: string; commit?: string; doiLuc?: string;
  may?: string; ip?: string; giuDen?: string; lastErrFp?: string; lastBan?: string;
}
interface May { luc: string; viec: string; ip: string; may: string }
interface SuaXong { ts: string; tomTat: string; commit?: string; fps: string[]; chiTiet?: string; by: string; may?: string; ip?: string }
interface DuLieu {
  items: MucLoi[]; tong: number; tuSua: boolean; phanHe: Record<string, string>;
  lanQuet: { luc: string; moi: number; loi?: string } | null;
  nhatKy: SuaXong[];
  nhip: { cron?: { luc: string; ip?: string }; may?: Record<string, May> };
  dungLai: { id: string; yeuCauLuc: string; yeuCauBoi: string; ghiChu?: string; nhanLuc: string | null; ketQua: { ok: boolean; luc: string; log: string } | null } | null;
}
const TT: Record<TrangThai, [string, string]> = {
  moi: ['Mới', 'badge-warn'], yeu_cau: ['Được yêu cầu sửa', 'badge-info'], dang_sua: ['Đang sửa', 'badge-info'], da_sua: ['Đã sửa', 'badge-ok'], bo_qua: ['Bỏ qua', 'badge-gray'], tai_phat: ['Tái phát', 'badge-bad'],
};
const luc = (s?: string | null) => (s ? new Date(s).toLocaleString('vi-VN', { hour12: false }) : '');
const truoc = (s: string) => { const p = Math.round((Date.now() - new Date(s).getTime()) / 60_000); return p < 1 ? 'vừa xong' : p < 60 ? `${p} phút trước` : p < 1440 ? `${Math.round(p / 60)} giờ trước` : `${Math.round(p / 1440)} ngày trước`; };

export function LoiHeThongPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const quanTri = can('settings:write');
  const [phanHe, setPhanHe] = useState('');
  const [loai, setLoai] = useState<'' | 'phan-mem' | 'tu-choi'>('phan-mem');
  const [trangThai, setTrangThai] = useState('moi,yeu_cau,dang_sua,tai_phat');
  const q = useQuery({ queryKey: ['loi-he-thong'], queryFn: () => api.get<DuLieu>('/api/v1/system/loi'), refetchInterval: 30_000 });
  const lamMoi = () => void qc.invalidateQueries({ queryKey: ['loi-he-thong'] });
  const doiTT = useMutation({ mutationFn: (b: { fp: string; status: string; note?: string }) => api.post('/api/v1/system/loi/trang-thai', b), onSuccess: lamMoi });
  const quet = useMutation({ mutationFn: () => api.post('/api/v1/system/loi/quet', {}), onSuccess: lamMoi });
  const tuSua = useMutation({ mutationFn: (bat: boolean) => api.post('/api/v1/system/loi/tu-sua', { bat }), onSuccess: lamMoi });
  const dungLai = useMutation({ mutationFn: () => api.post('/api/v1/system/loi/dung-lai', {}), onSuccess: lamMoi });
  const [xemLog, setXemLog] = useState(false);
  const [moNhatKy, setMoNhatKy] = useState(true);
  const d = q.data;
  const tatCa = d?.items ?? [];
  const ds = tatCa.filter((x) => (!phanHe || x.phanHe === phanHe) && (!loai || x.loai === loai) && (!trangThai || trangThai.split(',').includes(x.trangThai)));
  const dem = (f: (x: MucLoi) => boolean) => tatCa.filter(f).length;
  const homNay = new Date().toISOString().slice(0, 10);
  const the = [
    { n: dem((x) => x.loai === 'phan-mem' && ['moi', 'yeu_cau', 'dang_sua', 'tai_phat'].includes(x.trangThai)), t: 'lỗi phần mềm cần sửa', mau: '#dc2626', loc: () => { setLoai('phan-mem'); setTrangThai('moi,yeu_cau,dang_sua,tai_phat'); } },
    { n: dem((x) => x.trangThai === 'yeu_cau'), t: 'mục được yêu cầu sửa', mau: '#2457B3', loc: () => { setLoai(''); setTrangThai('yeu_cau'); } },
    { n: dem((x) => x.loai === 'tu-choi' && x.last.slice(0, 10) === homNay), t: 'kiểu từ chối hôm nay (dữ liệu nhập)', mau: '#d97706', loc: () => { setLoai('tu-choi'); setTrangThai(''); } },
    { n: dem((x) => x.trangThai === 'da_sua' && (x.doiLuc ?? '').slice(0, 10) === homNay), t: 'đã sửa hôm nay', mau: '#16a34a', loc: () => { setLoai(''); setTrangThai('da_sua'); } },
  ];
  const dl = d?.dungLai;
  const ttDungLai = !dl ? 'Chưa yêu cầu lần nào' : dl.ketQua ? `${dl.ketQua.ok ? '✓ Dựng lại xong' : '✗ Dựng lại lỗi'} lúc ${luc(dl.ketQua.luc)}` : dl.nhanLuc ? `Đang dựng lại (máy chủ nhận lúc ${luc(dl.nhanLuc)})…` : `Đang chờ máy chủ nhận (yêu cầu lúc ${luc(dl.yeuCauLuc)}) — cron chạy mỗi phút`;

  return (
    <div>
      <PageHeader title="Lỗi hệ thống" code="HT20" helpKey="loi-he-thong"
        subtitle="Lỗi xảy ra trên máy chủ, gom theo phân hệ: xem lịch sử, tra chi tiết, yêu cầu sửa; bật Tự sửa để máy tự sửa và đẩy nhánh dev, Dựng lại để cập nhật con dev" />
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={errorText(q.error)} /> : d && <>
        <div className="card card-body" style={{ marginTop: 0, marginBottom: 10, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="checkbox" style={{ fontWeight: 600 }} title="Bật: lịch tự sửa (máy local / đám mây) được kéo lỗi về, sửa, kiểm chuẩn, đẩy nhánh dev, yêu cầu dựng lại. Tắt khi muốn 'đóng băng' (vd trước buổi demo)">
            <input type="checkbox" checked={d.tuSua} disabled={!quanTri || tuSua.isPending} onChange={(e) => tuSua.mutate(e.target.checked)} /> Tự sửa {d.tuSua ? <span className="badge badge-ok">đang bật</span> : <span className="badge badge-gray">đang tắt</span>}
          </label>
          <span className="muted" style={{ fontSize: 12.5 }}>
            Quét lỗi: {d.lanQuet ? <>{truoc(d.lanQuet.luc)}{d.lanQuet.loi ? <span className="mh-bad" title={d.lanQuet.loi}> — lỗi khi đọc Loki (khai địa chỉ Loki ở HT13)</span> : ` · ${d.lanQuet.moi} lần lỗi mới`}</> : 'chưa chạy (máy chủ vừa khởi động)'}
          </span>
          {quanTri && <button type="button" className="btn btn-sm" disabled={quet.isPending} onClick={() => quet.mutate()}>{quet.isPending ? 'Đang quét…' : 'Quét ngay'}</button>}
          <span style={{ marginLeft: 'auto', fontSize: 12.5 }} className={dl?.ketQua && !dl.ketQua.ok ? 'mh-bad' : 'muted'}>{ttDungLai}{dl?.ketQua && <button type="button" className="btn btn-xs btn-ghost" onClick={() => setXemLog(!xemLog)}>{xemLog ? 'ẩn log' : 'xem log'}</button>}</span>
          {quanTri && <button type="button" className="btn btn-sm btn-primary" disabled={dungLai.isPending || Boolean(dl && !dl.ketQua)} title="Máy chủ kéo code mới nhất của nhánh dev và dựng lại (sao lưu CSDL trước). Cần cron aaPanel — docs/ops/TU-DONG-SUA-LOI.md §4.1" onClick={() => { if (window.confirm('Dựng lại con dev với code mới nhất của nhánh dev? (khoảng 2–5 phút, người đang dùng có thể bị gián đoạn)')) dungLai.mutate(); }}>Dựng lại ngay</button>}
        </div>
        {xemLog && dl?.ketQua && <pre className="card card-body" style={{ marginTop: 0, maxHeight: 260, overflow: 'auto', fontSize: 11.5, whiteSpace: 'pre-wrap' }}>{dl.ketQua.log || '(không có log)'}</pre>}
        {(quet.error || doiTT.error || tuSua.error || dungLai.error) && <ErrorBox error={errorText(quet.error ?? doiTT.error ?? tuSua.error ?? dungLai.error)} />}

        <KetNoi d={d} />
        <div className="card" style={{ marginTop: 0, marginBottom: 10 }}>
          <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', paddingBottom: moNhatKy && d.nhatKy.length ? 0 : undefined }} onClick={() => setMoNhatKy((v) => !v)}>
            <b>Nhật ký sửa</b><span className="muted" style={{ fontSize: 12.5 }}>{d.nhatKy.length ? `${d.nhatKy.length} lần gần nhất — máy nào sửa gì, commit nào (đã đẩy nhánh dev)` : 'chưa có lần sửa nào'}</span>
            <span className="muted" style={{ marginLeft: 'auto' }}>{moNhatKy ? '▾' : '▸'}</span>
          </div>
          {moNhatKy && d.nhatKy.length > 0 && <div className="table-wrap"><table className="grid">
            <thead><tr><th title="Lúc ghi nhật ký (sau khi đẩy code)">Lúc</th><th title="Người git @ tên máy · IP">Máy sửa</th><th>Đã sửa gì</th><th title="Mã mục lỗi được sửa">Mục lỗi</th><th title="Commit trên nhánh dev">Commit</th></tr></thead>
            <tbody>{d.nhatKy.slice(0, 20).map((n, i) => <tr key={i}>
              <td style={{ whiteSpace: 'nowrap' }}>{luc(n.ts)}<div className="muted" style={{ fontSize: 11 }}>{truoc(n.ts)}</div></td>
              <td style={{ whiteSpace: 'nowrap' }}>{n.may ?? n.by}{n.ip && <div className="muted mono" style={{ fontSize: 11 }}>{n.ip}</div>}</td>
              <td style={{ maxWidth: 520 }} title={n.chiTiet}>{n.tomTat}{n.chiTiet && <div className="muted" style={{ fontSize: 11.5, whiteSpace: 'pre-wrap' }}>{n.chiTiet}</div>}</td>
              <td className="mono" style={{ fontSize: 11.5 }}>{n.fps.join(', ') || '—'}</td>
              <td>{n.commit ? <code title={n.commit}>{n.commit.slice(0, 8)}</code> : '—'}</td>
            </tr>)}</tbody>
          </table></div>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, marginBottom: 10 }}>
          {the.map((x) => <button key={x.t} type="button" className="card card-body" style={{ marginTop: 0, textAlign: 'left', cursor: 'pointer', borderLeft: `4px solid ${x.mau}` }} onClick={x.loc}>
            <b style={{ fontSize: 24, display: 'block', color: x.mau }}>{x.n}</b><span className="muted" style={{ fontSize: 12.5 }}>{x.t}</span></button>)}
        </div>

        <div className="card">
          <div className="tabs" style={{ marginBottom: 0 }}>
            {[['', 'Tất cả'], ...Object.entries(d.phanHe)].map(([k, l]) => {
              const n = tatCa.filter((x) => (!k || x.phanHe === k) && (!loai || x.loai === loai) && (!trangThai || trangThai.split(',').includes(x.trangThai))).length;
              return <button key={k} type="button" className={`tab${phanHe === k ? ' active' : ''}`} onClick={() => setPhanHe(k ?? '')}>{l}{n ? <span className="badge badge-gray" style={{ marginLeft: 4 }}>{n}</span> : null}</button>;
            })}
          </div>
          <div className="filters" style={{ display: 'flex', gap: 8, padding: 8, flexWrap: 'wrap' }}>
            <select className="select input" style={{ width: 200 }} value={loai} onChange={(e) => setLoai(e.target.value as typeof loai)}>
              <option value="phan-mem">Lỗi phần mềm (cần sửa code)</option><option value="tu-choi">Từ chối (dữ liệu nhập)</option><option value="">Mọi loại</option>
            </select>
            <select className="select input" style={{ width: 220 }} value={trangThai} onChange={(e) => setTrangThai(e.target.value)}>
              <option value="moi,yeu_cau,dang_sua,tai_phat">Chưa xong (mới, yêu cầu, đang sửa, tái phát)</option>
              <option value="yeu_cau">Được yêu cầu sửa</option><option value="da_sua">Đã sửa</option><option value="bo_qua">Bỏ qua</option><option value="">Mọi trạng thái</option>
            </select>
            <span className="muted" style={{ fontSize: 12.5, alignSelf: 'center' }}>{ds.length} mục · mỗi mục = các lần lỗi giống nhau (số trong câu báo coi như nhau)</span>
          </div>
          {!ds.length ? <div className="empty" style={{ padding: 24 }}>{tatCa.length ? 'Không có mục khớp bộ lọc.' : 'Chưa ghi nhận lỗi nào — máy quét đọc log mỗi 60 giây.'}</div> : (
            <div className="table-wrap"><table className="grid">
              <thead><tr><th>Phân hệ</th><th>Loại</th><th>Câu báo lỗi</th><th>Chức năng</th><th style={{ textAlign: 'right' }}>Số lần</th><th>Lần cuối</th><th>Trạng thái</th><th /></tr></thead>
              <tbody>{ds.map((x) => (
                <tr key={x.fp}>
                  <td>{x.tenPhanHe}</td>
                  <td>{x.loai === 'phan-mem' ? <span className="badge badge-bad">Phần mềm</span> : <span className="badge badge-warn">Từ chối</span>}</td>
                  <td style={{ maxWidth: 460 }}><b>{x.msg}</b><div className="muted mono" style={{ fontSize: 11 }}>{x.errCode} · mã mục {x.fp}{x.lastErrFp ? <span title="Dấu lỗi trong log — gom các lần cùng chỗ hỏng"> · errFp {x.lastErrFp}</span> : null}{x.lastBan ? <span title="Commit của bản đang chạy lúc lỗi — đọc mã đúng commit này"> · bản {x.lastBan.slice(0, 8)}</span> : null}</div></td>
                  <td className="mono" style={{ fontSize: 11.5 }}>{x.method} {x.route}{x.status ? ` → ${x.status}` : ''}</td>
                  <td style={{ textAlign: 'right' }}>{x.count}</td>
                  <td style={{ whiteSpace: 'nowrap' }} title={`Lần đầu ${luc(x.first)}`}>{truoc(x.last)}<div className="muted" style={{ fontSize: 11 }}>{luc(x.last)}</div></td>
                  <td><span className={`badge ${TT[x.trangThai][1]}`}>{TT[x.trangThai][0]}</span>
                    {(x.nguoi || x.commit) && <div className="muted" style={{ fontSize: 11 }} title={[x.ghiChu, x.ip && `IP ${x.ip}`].filter(Boolean).join(' · ')}>{x.nguoi}{x.commit ? <> · <code>{x.commit.slice(0, 8)}</code></> : null}</div>}
                    {x.giuDen && <div style={{ fontSize: 11, color: '#2457B3' }} title="Máy này giữ chỗ — máy khác né mục này để khỏi sửa trùng">giữ tới {new Date(x.giuDen).toLocaleTimeString('vi-VN', { hour12: false, hour: '2-digit', minute: '2-digit' })}</div>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <Link className="btn btn-xs" to={`/dev/tra-ma?ma=${encodeURIComponent(x.lastReqId)}&at=${encodeURIComponent(x.last)}`} target="_blank" title="Chi tiết lần lỗi gần nhất: câu báo, chức năng, chỗ lỗi trong mã, vết xử lý">Tra mã</Link>{' '}
                    {x.trangThai !== 'yeu_cau' && x.trangThai !== 'da_sua' && <button type="button" className="btn btn-xs btn-primary" title="Đánh dấu cần sửa — lịch tự sửa / người phụ trách phân hệ xử lý trước" onClick={() => doiTT.mutate({ fp: x.fp, status: 'yeu_cau' })}>Sửa lỗi này</button>}{' '}
                    {x.trangThai !== 'bo_qua' && x.trangThai !== 'da_sua' && <button type="button" className="btn btn-xs" title="Không phải lỗi cần sửa (vd người dùng nhập sai, câu báo đã đủ rõ)" onClick={() => { const n = window.prompt('Bỏ qua mục lỗi này — ghi lý do (không bắt buộc):', ''); if (n !== null) doiTT.mutate({ fp: x.fp, status: 'bo_qua', note: n || undefined }); }}>Bỏ qua</button>}
                    {(x.trangThai === 'bo_qua' || x.trangThai === 'da_sua') && <button type="button" className="btn btn-xs" onClick={() => doiTT.mutate({ fp: x.fp, status: 'moi' })}>Mở lại</button>}
                  </td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Quy trình sửa, khoá kết nối cho máy local / cron, bảng phân hệ ↔ người phụ trách: <code>docs/ops/TU-DONG-SUA-LOI.md</code>. Khoá kết nối tạo ở <Link to="/he-thong/cau-hinh">Cấu hình hệ thống (HT13)</Link>.</p>
      </>}
    </div>
  );
}

/** Ai đang kết nối bằng khoá: cron máy chủ (ghé mỗi phút) và các máy sửa lỗi (mỗi lượt tự sửa / mỗi lệnh keo-loi). */
function KetNoi({ d }: { d: DuLieu }) {
  const tuoi = (s?: string) => (s ? (Date.now() - new Date(s).getTime()) / 60_000 : Infinity);
  const den = (phut: number, han: number) => <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, marginRight: 5, background: phut <= han ? '#16a34a' : phut <= han * 6 ? '#d97706' : '#9ca3af' }} />;
  const cron = d.nhip?.cron; const may = Object.values(d.nhip?.may ?? {}).sort((a, b) => b.luc.localeCompare(a.luc));
  return (
    <div className="card card-body" style={{ marginTop: 0, marginBottom: 10, display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12.5, alignItems: 'flex-start' }}>
      <b style={{ fontSize: 13 }}>Kết nối</b>
      <span title="Cron aaPanel trên máy chủ gọi mỗi phút để nhận yêu cầu Dựng lại. Xanh = vừa ghé (≤ 2 phút).">
        {den(tuoi(cron?.luc), 2)}Cron máy chủ: {cron ? <>{truoc(cron.luc)}{cron.ip ? <span className="muted mono"> · {cron.ip}</span> : null}</> : <span className="muted">chưa thấy ghé (xem docs §4.1)</span>}
      </span>
      {!may.length ? <span className="muted">{den(Infinity, 1)}Máy sửa lỗi: chưa có máy nào kết nối</span> : may.map((m) => (
        <span key={m.may} title={`Việc gần nhất: ${m.viec}
Lúc ${luc(m.luc)}`}>
          {den(tuoi(m.luc), 15)}<b>{m.may}</b> <span className="muted mono">{m.ip}</span> · {truoc(m.luc)}<div className="muted" style={{ fontSize: 11, marginLeft: 13, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.viec}</div>
        </span>
      ))}
    </div>
  );
}
