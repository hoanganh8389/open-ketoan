// [2026-11-23 02:10 PM Nguyễn Văn Thủy] MH22 — cấu hình MST nhận hoá đơn đầu vào: một trang nhận hoá đơn của nhiều công ty / chi nhánh (đóng góp)
/**
 * MST NHẬN HOÁ ĐƠN: hoá đơn (nhập XML, cầu nối) có MST người mua trong danh sách này mới được nhận.
 *   MST gốc (0106933743) nhận mọi chi nhánh; MST có đuôi (0106933743-008) chỉ nhận đúng chi nhánh đó.
 *   Để trống = theo MST đơn vị ở HT03 như trước.
 * Gợi ý điền sẵn: MST đơn vị, MST khai ở chi nhánh / đơn vị, MST người mua trên hoá đơn đã nhận (kèm số tờ).
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { Hoi, Loading, Modal, useViewAgain } from '@/components/ui';

interface GoiY { mst: string; ten: string; nguon: ('don_vi' | 'chi_nhanh' | 'hoa_don')[]; soHoaDon: number; dangNhan: boolean }
interface MstNhan { list: string[]; effective: string[]; tenantTaxCode: string; suggestions: GoiY[] }

const URL = '/api/v1/purchase/invoices/buyer-tax-codes';
const MST_RE = /^\d{10}(-\d{3})?$/;
const NGUON: Record<GoiY['nguon'][number], string> = { don_vi: 'Đơn vị (HT03)', chi_nhanh: 'Chi nhánh / đơn vị', hoa_don: 'Hoá đơn đã nhận' };
const goc = (m: string) => m.split('-')[0]!;
/** Dòng nào trong danh sách nhận MST này — như máy chủ: MST gốc nhận cả chi nhánh, MST có đuôi chỉ đúng nó. */
const khop = (ds: string[], m: string) => ds.find((e) => (e.includes('-') ? e === m : goc(m) === e)) ?? null;

export function MstNhanHoaDon({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['mua-hang', 'buyer-tax-codes'], queryFn: () => api.get<MstNhan>(URL) });
  const viewAgain = useViewAgain();
  const [chon, setChon] = useState<string[]>([]);
  const [them, setThem] = useState('');
  const [loiThem, setLoiThem] = useState('');
  const [err, setErr] = useState('');
  const [dangGhi, setDangGhi] = useState(false);
  const [hienGom, setHienGom] = useState(false);
  // Điền sẵn: danh sách đã lưu; chưa lưu thì danh sách đang áp (MST gốc của đơn vị) — Ghi luôn là giữ nguyên cách nhận hiện tại.
  useEffect(() => { if (q.data) setChon(q.data.list.length ? q.data.list : q.data.effective); }, [q.data]);

  const dong = useMemo(() => {
    const by = new Map((q.data?.suggestions ?? []).map((g) => [g.mst, g]));
    for (const m of chon) if (!by.has(m)) by.set(m, { mst: m, ten: '', nguon: [], soHoaDon: 0, dangNhan: true });
    return [...by.values()].sort((a, b) => a.mst.localeCompare(b.mst));
  }, [q.data, chon]);

  const bat = (m: string, on: boolean) => setChon((c) => {
    const bo = c.filter((x) => x !== m);
    if (!on) return bo;
    // Chọn MST gốc thì các chi nhánh của nó đã gồm trong đó.
    return [...(m.includes('-') ? bo : bo.filter((x) => goc(x) !== m || !x.includes('-'))), m].sort();
  });
  const themMst = () => {
    const m = them.replace(/\s+/g, '');
    if (!MST_RE.test(m)) { setLoiThem('MST gồm 10 số, chi nhánh thêm "-" và 3 số (vd 0106933743-008)'); return; }
    setLoiThem(''); setThem('');
    if (!khop(chon, m)) bat(m, true);
  };
  const ghi = async () => {
    setErr(''); setDangGhi(true);
    try {
      const d = await api.put<MstNhan>(URL, { taxCodes: chon });
      qc.setQueryData(['mua-hang', 'buyer-tax-codes'], d);
      viewAgain[1]();
    } catch (e) { setErr(errorText(e)); } finally { setDangGhi(false); }
  };

  const d = q.data;
  const doi = d ? JSON.stringify([...chon].sort()) !== JSON.stringify(d.list.length ? d.list : d.effective) : false;
  return (
    <Modal wide viewFirst viewAgain={viewAgain} title="MST nhận hoá đơn đầu vào" onClose={onClose}
      footer={<><button className="btn btn-primary" disabled={dangGhi || !d} title={dangGhi ? 'Đang ghi…' : !d ? 'Đang tải danh sách, chờ một chút' : 'Ghi danh sách MST nhận hoá đơn'} onClick={ghi}>Ghi</button><button className="btn" onClick={onClose}>Đóng</button></>}>
      <div className="full">
        <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
          Hoá đơn có MST người mua được tích ở đây thì trang này mới nhận (nhập XML, cầu nối hoá đơn). Một trang nhận được nhiều công ty / chi nhánh.
          <Hoi text={'MST gốc (vd 0106933743) nhận mọi chi nhánh 0106933743-xxx.\nMST có đuôi (vd 0106933743-008) chỉ nhận đúng chi nhánh đó.\nBỏ tích hết rồi Ghi = theo MST đơn vị ở HT03 như trước.\nHoá đơn đã nhận không đổi; cầu nối hỏi lại danh sách này khi bấm Kiểm tra.'} />
        </div>
        {err && <div className="alert alert-bad">{err}</div>}
        {q.isLoading ? <Loading /> : q.isError ? <div className="alert alert-bad">{errorText(q.error)}</div> : d && (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 8 }}>
              <input className="input" style={{ width: 220, ...(loiThem ? { borderColor: 'var(--bad, #dc2626)' } : {}) }} aria-invalid={Boolean(loiThem)} placeholder="Thêm MST, vd 0110981355" value={them} onChange={(e) => { setThem(e.target.value); setLoiThem(''); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); themMst(); } }} />
              <button type="button" className="btn btn-sm" onClick={themMst}>+ Thêm</button>
              {loiThem && <span style={{ color: 'var(--bad, #dc2626)', fontSize: 12 }}>{loiThem}</span>}
              <label className="muted" style={{ marginLeft: 'auto', fontSize: 12, display: 'inline-flex', gap: 4, alignItems: 'center' }} data-view-ok>
                <input type="checkbox" checked={hienGom} onChange={(e) => setHienGom(e.target.checked)} data-view-ok /> Hiện cả chi nhánh đã gồm trong MST gốc
              </label>
            </div>
            <div style={{ fontSize: 12.5, marginBottom: 6 }}>
              {d.list.length
                ? <>Đang nhận: <b className="mono">{d.list.join(', ')}</b></>
                : <>Chưa cấu hình: đang nhận theo MST đơn vị {d.tenantTaxCode ? <b className="mono">{d.tenantTaxCode}</b> : <span className="badge badge-warn" title="HT03 chưa khai MST: hoá đơn nào cũng nhận">chưa khai MST</span>} và mọi chi nhánh của nó.</>}
              {doi && <span className="badge badge-warn" style={{ marginLeft: 8 }} title="Bấm Ghi để áp danh sách mới">Chưa ghi</span>}
            </div>
            <table className="mh-mini">
              <thead><tr><th title="Tích = nhận hoá đơn có MST người mua này">Nhận</th><th>MST</th><th>Tên</th><th title="Gợi ý lấy từ đâu">Có ở</th><th className="num" title="Số hoá đơn đang có trên trang này với MST người mua này">Hoá đơn đã có</th></tr></thead>
              <tbody>
                {dong.map((g) => {
                  const k = khop(chon, g.mst);
                  const gom = k !== null && k !== g.mst;
                  if (gom && !hienGom) return null;
                  const con = g.mst.includes('-') || !chon.includes(g.mst) ? 0 : dong.filter((x) => x.mst.startsWith(`${g.mst}-`)).length;
                  return (
                    <tr key={g.mst}>
                      <td><input type="checkbox" checked={k !== null} disabled={gom} title={gom ? `Đã gồm trong MST gốc ${k}` : ''} onChange={(e) => bat(g.mst, e.target.checked)} /></td>
                      <td className="mono">{g.mst}{gom && <span className="muted"> · gồm trong {k}</span>}{con > 0 && <span className="muted" title="MST gốc nhận mọi chi nhánh của nó. Tích “Hiện cả chi nhánh đã gồm” để xem"> · gồm {con} chi nhánh</span>}</td>
                      <td>{g.ten}</td>
                      <td className="muted">{g.nguon.map((n) => NGUON[n]).join(', ') || 'Thêm tay'}</td>
                      <td className="num">{g.soHoaDon || ''}</td>
                    </tr>
                  );
                })}
                {!dong.length && <tr><td colSpan={5} className="muted">Chưa có gợi ý — gõ MST ở dưới rồi bấm Thêm.</td></tr>}
              </tbody>
            </table>
          </>
        )}
      </div>
    </Modal>
  );
}
