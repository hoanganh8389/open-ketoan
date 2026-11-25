// [2026-11-25 Nguyễn Văn Thủy] NHÁP LỖI — phiếu bấm Ghi / Gửi duyệt / Duyệt (hoặc thoát khi sửa dở) mà không lưu được vào sổ: giữ nguyên nội dung
// + lỗi (mã lỗi, câu báo, mã tra cứu) ở nhật ký JSONL. MH11 hiện một dòng nhắc, mở danh sách để Mở lại phiếu (sửa rồi ghi) hoặc Bỏ (đóng góp)
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal } from '@/components/ui';
import { api } from '@/lib/api';
import type { PDoc } from '@bizcity/mua-hang-domain';
import { KIND_LABEL, P } from '../du-lieu';

export interface NhapLoiRow { key: string; ts: string; user: string; docNo: string; action: string; kind?: string; partnerCode?: string; branchCode?: string; error: { code: string; message: string; requestId?: string }; doc: PDoc }

/** Khoá nháp lỗi đang mở lại trong form: ghi được phiếu thì form tự đánh dấu nháp lỗi đó là xong. */
export const nhapLoiDangMo = new Set<string>();

export function NhapLoi({ onOpen }: { onOpen: (d: PDoc) => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['mua-hang', 'nhap-loi'], queryFn: () => api.get<NhapLoiRow[]>(`${P}/save-failed`), refetchInterval: 60_000, staleTime: 20_000 });
  const [mo, setMo] = useState(false);
  const ds = q.data ?? [];
  if (!ds.length) return null;
  const bo = async (r: NhapLoiRow) => {
    if (!window.confirm(`Bỏ nháp lỗi ${r.docNo || KIND_LABEL[r.kind as PDoc['kind']] || 'phiếu'} của ${r.user}? (vẫn còn trong nhật ký để truy vết)`)) return;
    await api.post(`${P}/save-failed/done`, { key: r.key, how: 'discarded', ...(r.docNo ? { docNo: r.docNo } : {}) });
    await qc.invalidateQueries({ queryKey: ['mua-hang', 'nhap-loi'] });
  };
  return (
    <>
      <div className="alert alert-warn" style={{ margin: '0 0 8px', display: 'flex', gap: 8, alignItems: 'center' }}>
        <span><b>{ds.length} phiếu lưu bị lỗi</b> đang giữ ở Nháp lỗi — mở lại để sửa rồi ghi, hoặc báo dev theo mã tra cứu.</span>
        <button type="button" className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setMo(true)}>Xem nháp lỗi</button>
      </div>
      {mo && (
        <Modal title={`Nháp lỗi — ${ds.length} phiếu chưa lưu được`} wide onClose={() => setMo(false)} footer={<button className="btn" onClick={() => setMo(false)}>Đóng</button>}>
          <div className="full scroll-box" style={{ maxHeight: 520 }}>
            <table className="mh-mini">
              <thead><tr><th>Lúc</th><th>Người làm</th><th>Loại</th><th>Số phiếu</th><th>NCC</th><th>Chi nhánh</th><th>Thao tác</th><th>Lỗi</th><th>Mã tra cứu</th><th /></tr></thead>
              <tbody>{ds.map((r) => (
                <tr key={r.key}>
                  <td style={{ whiteSpace: 'nowrap' }}>{new Date(r.ts).toLocaleString('vi-VN', { hour12: false })}</td>
                  <td>{r.user}</td>
                  <td>{KIND_LABEL[r.kind as PDoc['kind']] ?? r.kind}</td>
                  <td className="mono">{r.docNo || <span className="muted">chưa có số</span>}</td>
                  <td className="mono">{r.partnerCode}</td>
                  <td className="mono">{r.branchCode}</td>
                  <td>{r.action}</td>
                  <td style={{ maxWidth: 420 }}>{r.error.code && <span className="mono mh-bad">{r.error.code} </span>}{r.error.message}</td>
                  <td className="mono" style={{ fontSize: 11 }}>{r.error.requestId ? <Link to={`/dev/tra-ma?ma=${encodeURIComponent(r.error.requestId)}&at=${encodeURIComponent(r.ts)}`} target="_blank" title="Log máy chủ (Loki) của lần lưu lỗi này">{r.error.requestId}</Link> : ''}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button type="button" className="btn btn-xs btn-primary" title="Mở lại phiếu đúng như lúc lưu lỗi — sửa rồi Ghi" onClick={() => { nhapLoiDangMo.add(r.key); setMo(false); onOpen(r.doc); }}>Mở</button>{' '}
                    <button type="button" className="btn btn-xs" onClick={() => void bo(r)}>Bỏ</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Modal>
      )}
    </>
  );
}
