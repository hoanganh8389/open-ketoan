// [2026-11-25 Nguyễn Văn Thủy] Ô chọn hợp đồng mua dùng chung: chọn hợp đồng của NCC + nút + thêm hợp đồng ngay tại chỗ (cùng bộ ô Thông tin hợp đồng của MH29) (đóng góp)
/**
 * CHỌN HỢP ĐỒNG — danh sách hợp đồng của một NCC (đang hiệu lực + hợp đồng đang chọn). Nút + mở hộp Thêm hợp đồng nhanh:
 * cùng các ô như bước "Thông tin hợp đồng" của MH29, NCC khoá theo phiếu; ghi xong ô tự chọn hợp đồng mới. Khai hàng hoá, giá,
 * điều khoản tiếp ở MH29 (liên kết trong hộp). Dùng ở mọi chỗ cần chọn hợp đồng mua để khai báo đồng nhất.
 */
import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal } from '@/components/ui';
import { useBranches } from '@/components/filters';
import { errorText } from '@/lib/api';
import { purchaseApi, type ContractInput } from '../du-lieu';
import { dmy } from '../chung';
import { ThongTinHopDong, hopDongPath, hopDongTrong } from './HopDongPage';

export function ChonHopDong({ partnerCode, value, onChange, disabled, style }: {
  partnerCode: string; value: string; onChange: (code: string) => void; disabled?: boolean; style?: CSSProperties;
}) {
  const hds = useQuery({ queryKey: ['mua-hang', 'contracts', partnerCode], enabled: Boolean(partnerCode), staleTime: 60_000, queryFn: () => purchaseApi.contracts(partnerCode) }).data ?? [];
  const [them, setThem] = useState(false);
  const hd = hds.find((c) => c.code === value);
  return (
    <div style={{ display: 'flex', gap: 4, ...style }}>
      <select className="select input" style={{ flex: 1, minWidth: 0 }} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">{hds.length ? '— không theo hợp đồng —' : 'NCC chưa có hợp đồng mua'}</option>
        {hds.filter((c) => c.status === 'active' || c.code === value).map((c) => <option key={c.code} value={c.code}>{c.code} · {c.statusText}{c.endDate ? ` · đến ${dmy(c.endDate)}` : ''}</option>)}
        {value && !hd && <option value={value}>{value}</option>}
      </select>
      {!disabled && <button type="button" className="btn btn-sm" style={{ padding: '0 10px' }} disabled={!partnerCode} title={partnerCode ? 'Thêm hợp đồng mua mới với NCC này ngay tại đây (F9)' : 'Chọn nhà cung cấp trước'} onClick={() => setThem(true)}>+</button>}
      {them && <ThemHopDongNhanh partnerCode={partnerCode} onClose={() => setThem(false)} onSaved={(c) => { setThem(false); onChange(c); }} />}
    </div>
  );
}

/** Hộp Thêm hợp đồng nhanh: thông tin hợp đồng (NCC khoá), ghi xong trả số hợp đồng. */
export function ThemHopDongNhanh({ partnerCode, onClose, onSaved }: { partnerCode: string; onClose: () => void; onSaved: (code: string) => void }) {
  const qc = useQueryClient();
  const branchList = useBranches().data ?? [];
  const [v, setV] = useState<ContractInput & { code: string }>(() => hopDongTrong(partnerCode));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<ContractInput & { code: string }>) => setV((x) => ({ ...x, ...p }));
  const thieu = !v.code.trim() ? 'Nhập số hợp đồng' : !v.signedDate ? 'Nhập ngày ký' : !v.startDate ? 'Nhập ngày hiệu lực từ' : null;
  const ghi = async () => {
    setBusy(true); setErr('');
    try {
      const { code: so, ...body } = v;
      await purchaseApi.saveContract(so.trim(), true, { ...body, signedDate: body.signedDate || null, startDate: body.startDate || null, endDate: body.endDate || null, liquidatedDate: body.liquidatedDate || null });
      await qc.invalidateQueries({ queryKey: ['mua-hang', 'contracts'] });
      onSaved(so.trim());
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  return (
    <Modal title="Thêm hợp đồng mua hàng" onClose={onClose} wide
      footer={<><button className="btn btn-primary" disabled={busy || Boolean(thieu)} title={thieu ?? 'Ghi hợp đồng và chọn luôn ở phiếu'} onClick={() => void ghi()}>Ghi</button><button className="btn" onClick={onClose}>Thoát</button></>}>
      <div className="full">
        <ThongTinHopDong v={v} set={set} isNew khoaNcc branchList={branchList} />
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Ghi xong, khai hàng hoá, giá mua, điều khoản ở <Link to={v.code.trim() ? hopDongPath(v.code.trim(), 'hang-hoa') : '/mua-hang/hop-dong'} target="_blank">Hợp đồng mua hàng (MH29)</Link>.</div>
        {err && <div className="alert alert-bad" style={{ marginTop: 6 }}>{err}</div>}
      </div>
    </Modal>
  );
}
