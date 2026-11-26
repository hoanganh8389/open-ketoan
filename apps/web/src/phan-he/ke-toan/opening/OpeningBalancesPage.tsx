/**
 * Số dư tài khoản đầu kỳ (ACC15): nhập một lần khi bắt đầu dùng phần mềm (hoặc khi đưa thêm chi nhánh vào).
 * Mỗi chi nhánh một phiếu "Số dư đầu kỳ"; sửa được, huỷ được như phiếu kế toán. Nhập tay, dán từ Excel, hoặc nhập tệp Excel.
 *
 * [2026-11-26 08:00 PM Nguyễn Văn Thủy] SO-DU — màn có quy trình 3 bước + giải thích đầu kỳ / cuối kỳ; thẻ theo nhóm (tiền mặt, tiền gửi,
 * công nợ KH / NCC, nhân viên, khác); bảng số dư theo tài khoản × đối tượng (thấy ngay đã nhập gì); ô Kiểm tra (cân Nợ – Có, cùng ngày
 * chốt, TK cân đối còn dư); dòng sai / đáng ngờ báo tại chỗ. Báo cáo luôn hiện phiếu số dư ở dòng "Số dư đầu kỳ" kể cả khi khoảng
 * ngày chứa ngày chốt (report.repository) (đóng góp)
 */
import { NutNhapExcel } from '@/components/NhapExcelWizard';
import { nhapLoai } from '@/lib/nhapExcel';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, ClipboardPaste, Plus, Trash2 } from 'lucide-react';
import type { OpeningInput } from '@ketoan/contracts';
import { api, errorText } from '@/lib/api';
import { date, money } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { useThaoTac } from '@/lib/manHinh';
import { PageHeader } from '@/components/PageHeader';
import { useBranches, BranchPicker } from '@/components/filters';
import { DataGrid, type Column } from '@/components/DataGrid';
import { Empty, ErrorBox, Field, Loading, Modal, Money, StatusBadge, useViewAgain } from '@/components/ui';
import { DocumentDetail } from '../../../features/documents/DocumentDetail';
import { AccountPicker, PartnerPicker } from '@/components/pickers';

interface Row { id: string; docKey: string; docNo: string; docDate: string; total: number; status: string; branchCode: string; description: string; version: number }
interface Existing { id: string; docKey: string; docNo: string; status: string; version: number; payload: OpeningInput }
interface Account { code: string; name: string; trackPartner: boolean; isDebt?: boolean; normalSide: string }
interface LineDraft { account: string; partner: string; debit: string; credit: string }

const blank = (account = ''): LineDraft => ({ account, partner: '', debit: '', credit: '' });
const parseAmount = (s: string): number => Number(String(s).replace(/[.,\s]/g, '')) || 0;
const show = (s: string): string => (parseAmount(s) ? money(parseAmount(s)) : '');
/** Doanh thu, chi phí (loại 5–8) và 911: không có số dư (kết chuyển hết về 911 cuối kỳ). */
const laiLo = (a: string) => /^[5-8]/.test(a) || a.startsWith('911');
const isoNgay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const cuoiThangTruoc = () => { const n = new Date(); return isoNgay(new Date(n.getFullYear(), n.getMonth(), 0)); };
const ngaySau = (iso: string) => { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + 1); return isoNgay(d); };
const laCuoiThang = (iso: string) => Boolean(iso) && ngaySau(iso).endsWith('-01');

/** Nhóm tài khoản trên màn (thẻ). goiY = tài khoản điền sẵn ở dòng đầu khi bấm "Nhập số dư" từ thẻ đó. */
const NHOM: { k: string; label: string; p?: string[]; goiY?: string }[] = [
  { k: '', label: 'Tất cả' },
  { k: 'tien-mat', label: 'Tiền mặt', p: ['111'], goiY: '1111' },
  { k: 'tien-gui', label: 'Tiền gửi ngân hàng', p: ['112', '113'], goiY: '1121' },
  { k: 'khach-hang', label: 'Công nợ khách hàng', p: ['131'], goiY: '1311' },
  { k: 'nha-cung-cap', label: 'Công nợ nhà cung cấp', p: ['331'], goiY: '3311' },
  { k: 'nhan-vien', label: 'Tạm ứng, nhân viên', p: ['141', '334'], goiY: '141' },
];
const nhomCua = (acc: string) => NHOM.find((n) => n.p?.some((x) => acc.startsWith(x)))?.k ?? 'khac';

/** Lỗi (chặn ghi) / cảnh báo (vẫn ghi được) của một dòng số dư — cùng luật với máy chủ (voucher.service fromOpening) và trình nhập Excel. */
function kiemDong(l: LineDraft, acc: Account | undefined): { loi?: string; canhBao?: string } {
  if (!l.account) return {};
  if (!acc) return { loi: 'Chưa có trong danh mục tài khoản chi tiết (tài khoản tổng hợp không nhập số dư)' };
  if (laiLo(l.account)) return { loi: 'Doanh thu / chi phí / 911 không có số dư — lãi lỗ luỹ kế ghi vào 4211 / 4212' };
  const no = parseAmount(l.debit);
  const co = parseAmount(l.credit);
  if (/^11[123]/.test(l.account) && co) return { loi: 'Tiền chỉ có Dư Nợ (số tiền đang có), không nhập Dư Có' };
  if ((acc.trackPartner || acc.isDebt) && !l.partner.trim() && (no || co)) return { loi: 'Tài khoản theo dõi đối tượng: cần Mã đối tượng (mỗi đối tượng một dòng)' };
  if (/^15[2-6]/.test(l.account)) return { canhBao: 'Hàng tồn kho: số này phải khớp tổng giá trị tồn đầu kỳ theo mặt hàng' };
  if (/^(211|212|213|214|242)/.test(l.account)) return { canhBao: 'TSCĐ / CCDC / trả trước: khai thêm thẻ (nguyên giá, luỹ kế) để tính khấu hao, phân bổ — số ở đây phải khớp tổng các thẻ' };
  if (acc.normalSide === 'debit' && co) return { canhBao: 'Tài khoản này thường chỉ có Dư Nợ — kiểm tra lại bên ghi' };
  if (acc.normalSide === 'credit' && no) return { canhBao: 'Tài khoản này thường chỉ có Dư Có — kiểm tra lại bên ghi' };
  return {};
}

/** Tên đối tượng theo mã (tra danh mục, nhớ đệm). */
function TenDoiTuong({ code }: { code: string }) {
  const q = useQuery({ queryKey: ['partners', 'ten', code], enabled: Boolean(code), staleTime: 5 * 60_000,
    queryFn: async () => (await api.get<{ code: string; name: string }[]>('/api/v1/partners', { search: code, pageSize: 5 })).find((p) => p.code === code)?.name ?? '' });
  return <>{q.data ?? ''}</>;
}

interface DongSoDu { key: string; docId: string; docNo: string; docDate: string; branchCode: string; account: string; partner: string; debit: number; credit: number; nhom: string }

export function OpeningBalancesPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const tt = useThaoTac('ke-toan.so-du-dau-ky'); // [2026-11-13 08:00 PM kiennt] NT-HT-003 — nút theo thao tác màn ACC15 (đóng góp)
  const [params, setParams] = useSearchParams();
  const nhom = params.get('nhom') ?? '';
  const chonNhom = (k: string) => { const n = new URLSearchParams(params); if (k) n.set('nhom', k); else n.delete('nhom'); setParams(n, { replace: true }); };
  const [xem, setXem] = useState<'tai-khoan' | 'phieu'>('tai-khoan');
  const [moQuyTrinh, setMoQuyTrinh] = useState(() => { try { return localStorage.getItem('acc15.quy-trinh') !== '0'; } catch { return true; } });
  const doiQuyTrinh = () => setMoQuyTrinh((x) => { try { localStorage.setItem('acc15.quy-trinh', x ? '0' : '1'); } catch { /* nuot-loi: chế độ riêng tư — chỉ không nhớ */ } return !x; });
  const [form, setForm] = useState<{ existing?: Existing; goiY?: string } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['documents', 'opening'], queryFn: () => api.getPage<Row[]>('/api/v1/documents', { docType: 'opening', pageSize: 200 }), placeholderData: keepPreviousData });
  const rows = q.data?.data ?? [];
  const hieuLuc = useMemo(() => rows.filter((r) => r.status !== 'cancelled'), [rows]);
  const { data: branches } = useBranches();
  const tenCn = useMemo(() => new Map((branches ?? []).map((b) => [b.code, b.name])), [branches]);
  const { data: accounts = [] } = useQuery({ queryKey: ['accounts', 'posting'], queryFn: () => api.get<Account[]>('/api/v1/accounts', { postingOnly: true }), staleTime: 60_000 });
  const tenTk = useMemo(() => new Map(accounts.map((a) => [a.code, a.name])), [accounts]);
  // Chi tiết các phiếu đang hiệu lực (mỗi chi nhánh thường một phiếu) → bảng số dư theo tài khoản × đối tượng.
  const chiTiet = useQuery({
    queryKey: ['document', 'opening-chi-tiet', hieuLuc.map((r) => `${r.id}:${r.version}`).join(',')], enabled: hieuLuc.length > 0, staleTime: 30_000,
    queryFn: () => Promise.all(hieuLuc.map((r) => api.get<Existing>(`/api/v1/documents/${r.id}`))),
  });
  const dong: DongSoDu[] = useMemo(() => (chiTiet.data ?? []).flatMap((d) => d.payload.lines.map((l, i) => ({
    key: `${d.id}-${i}`, docId: d.id, docNo: d.docNo, docDate: d.payload.docDate, branchCode: d.payload.branchCode,
    account: l.accountCode, partner: l.partnerCode ?? '', debit: l.debit, credit: l.credit, nhom: nhomCua(l.accountCode),
  }))), [chiTiet.data]);
  // Phần lệch của từng phiếu ghi vào TK cân đối (vd 999): còn số dư nghĩa là còn nhập thiếu.
  const canDoi = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of chiTiet.data ?? []) {
      const b = d.payload.balancingAccount;
      if (!b) continue;
      const lech = d.payload.lines.reduce((s, l) => s + l.debit - l.credit, 0);
      if (Math.abs(lech) >= 0.005) m.set(b, (m.get(b) ?? 0) - lech);
    }
    return [...m].filter(([, v]) => Math.abs(v) >= 0.005);
  }, [chiTiet.data]);
  const tongNo = dong.reduce((s, r) => s + r.debit, 0);
  const tongCo = dong.reduce((s, r) => s + r.credit, 0);
  const ngayChot = [...new Set(hieuLuc.map((r) => r.docDate))].sort();
  const ngayChung = ngayChot.length === 1 ? ngayChot[0]! : '';
  const hienThi = dong.filter((r) => !nhom || r.nhom === nhom);
  const demNhom = (k: string) => dong.filter((r) => !k || r.nhom === k).length;
  const nhomDang = NHOM.find((n) => n.k === nhom);

  const open = async (id: string) => {
    setLoadError(null);
    try {
      setForm({ existing: await qc.fetchQuery({ queryKey: ['document', id], queryFn: () => api.get<Existing>(`/api/v1/documents/${id}`), staleTime: 0 }) });
    } catch (e) {
      setLoadError(errorText(e));
    }
  };

  const cot: Column<DongSoDu>[] = [
    { key: 'branchCode', header: 'Chi nhánh', type: 'code', width: 110, title: 'Chi nhánh của phiếu số dư', render: (r) => <span title={tenCn.get(r.branchCode) ?? ''}>{r.branchCode}</span> },
    { key: 'account', header: 'Tài khoản', type: 'code', width: 100, title: 'Tài khoản chi tiết' },
    { key: 'tenTk', header: 'Tên tài khoản', width: 220, value: (r) => tenTk.get(r.account) ?? '' },
    { key: 'partner', header: 'Mã đối tượng', type: 'code', width: 120, title: 'Khách hàng / nhà cung cấp / nhân viên của dòng công nợ' },
    { key: 'tenDt', header: 'Tên đối tượng', width: 220, render: (r) => (r.partner ? <TenDoiTuong code={r.partner} /> : '') },
    { key: 'debit', header: 'Dư Nợ', type: 'money', width: 140, sum: true, title: 'Số dư bên Nợ tại ngày chốt' },
    { key: 'credit', header: 'Dư Có', type: 'money', width: 140, sum: true, title: 'Số dư bên Có tại ngày chốt' },
    { key: 'docDate', header: 'Ngày chốt', type: 'date', width: 100, title: 'Ngày chốt số dư của phiếu' },
    { key: 'docNo', header: 'Số phiếu', type: 'code', width: 120, title: 'Bấm để mở phiếu số dư', render: (r) => <a href="#" onClick={(e) => { e.preventDefault(); void open(r.docId); }}>{r.docNo}</a> },
  ];
  const coQuyen = can('documents:write') && tt.them;
  const demBtn = (k: string) => (dong.length > 0 ? <span className="so-du-dem">{demNhom(k)}</span> : null);

  return (
    <>
      <PageHeader
        title="Số dư tài khoản"
        code="ACC15"
        subtitle="Số dư đầu kỳ của từng tài khoản, từng đối tượng khi bắt đầu dùng phần mềm"
        helpKey="so-du-tai-khoan"
        actions={coQuyen ? <><NutNhapExcel loai={nhapLoai('so-du-tai-khoan')!} label="Nhập từ Excel" /><button className="btn btn-primary" title="Nhập tay số dư của một chi nhánh" onClick={() => { setNotice(null); setForm({ goiY: nhomDang?.goiY }); }}><Plus size={16} /> Nhập số dư đầu kỳ</button></> : undefined}
      />
      {notice && <div className="alert alert-ok" style={{ marginBottom: 10 }}>{notice}</div>}

      {/* Quy trình: ai mới vào cũng biết làm gì, theo thứ tự nào; đầu kỳ / cuối kỳ là gì. */}
      <div className="card so-du-quy-trinh">
        <button type="button" className="btn btn-ghost btn-sm so-du-quy-trinh-nut" onClick={doiQuyTrinh} title="Ẩn / hiện các bước nhập số dư">
          {moQuyTrinh ? <ChevronDown size={15} /> : <ChevronRight size={15} />} Quy trình nhập số dư ban đầu (3 bước)
        </button>
        {moQuyTrinh && (
          <div className="so-du-buoc">
            <div><b>1. Chọn ngày chốt số dư</b><span>Ngày <b>cuối cùng trước</b> khi bắt đầu dùng phần mềm, thường là cuối tháng. Dùng từ 01/11/2026 → ngày chốt 31/10/2026. Mọi chi nhánh cùng một ngày chốt.</span></div>
            <div><b>2. Nhập số dư từng chi nhánh</b><span>Mỗi chi nhánh một phiếu: nhập tay, dán từ Excel, hoặc <b>Nhập từ Excel</b> cả công ty. Tiền mặt, tiền gửi chỉ có Dư Nợ. Công nợ (131, 331, 141, 334…) mỗi đối tượng một dòng.</span></div>
            <div><b>3. Kiểm tra</b><span>Ô Kiểm tra bên dưới: tổng Dư Nợ = tổng Dư Có. Mở <Link to="/bao-cao/can-doi-phat-sinh">Bảng cân đối số phát sinh (ACC10)</Link> từ ngày sau ngày chốt: cột Số dư đầu kỳ phải khớp bảng số dư của bạn.</span></div>
            <div className="so-du-giai-thich"><b>Đầu kỳ hay cuối kỳ?</b><span>Số nhập ở đây là số dư <b>cuối ngày chốt</b> = số dư <b>đầu kỳ</b> của kỳ đầu tiên dùng phần mềm. Mọi sổ, báo cáo luôn hiện số này ở dòng <b>Số dư đầu kỳ</b>, kể cả khi khoảng ngày xem có chứa ngày chốt. Số dư cuối kỳ phần mềm tự tính = đầu kỳ + phát sinh Nợ − phát sinh Có. Chỉ nhập một lần, kỳ sau không phải chuyển số dư.</span></div>
            <div className="so-du-giai-thich"><b>Không nhập ở đây</b><span>Doanh thu, chi phí (loại 5–8) và 911 không có số dư: lãi lỗ luỹ kế ghi 4211 / 4212. Tài khoản tổng hợp (vd 156 khi đã có 1561): nhập vào tài khoản chi tiết.</span></div>
            <div className="so-du-giai-thich"><b>Số dư đầu kỳ khác (khai ở màn riêng, số tổng phải khớp số dư tài khoản ở đây)</b><span>
              Tồn kho theo mặt hàng: <Link to="/tien-ich/nhap-excel?loai=ton-kho">Nhập Excel → Tồn kho đầu kỳ</Link> (số lượng) + giá vốn đầu kỳ ở bảng tính giá vốn ·
              TSCĐ: <Link to="/tai-san/tscd">Thẻ tài sản cố định (ACC28)</Link> — nguyên giá, hao mòn luỹ kế ·
              CCDC: <Link to="/tai-san/cong-cu">Công cụ dụng cụ (ACC22)</Link> · Chi phí trả trước: <Link to="/tai-san/chi-phi-tra-truoc">ACC23</Link> — giá trị còn lại, số kỳ còn phân bổ.
            </span></div>
          </div>
        )}
      </div>

      {/* Kiểm tra nhanh toàn công ty */}
      {hieuLuc.length > 0 && (
        <div className="card so-du-kiem">
          <b>Kiểm tra</b>
          <span title="Số phiếu số dư đang hiệu lực (không tính phiếu đã huỷ)">{hieuLuc.length} phiếu · {new Set(hieuLuc.map((r) => r.branchCode)).size} chi nhánh</span>
          <span title="Tổng Dư Nợ / Dư Có mọi phiếu đang hiệu lực">Dư Nợ <b><Money value={tongNo} /></b> · Dư Có <b><Money value={tongCo} /></b>
            {Math.abs(tongNo - tongCo) < 0.005
              ? <span className="so-du-ok"> <CheckCircle2 size={14} /> Đã cân</span>
              : <span className="so-du-canh-bao"> <AlertTriangle size={14} /> Lệch {money(Math.abs(tongNo - tongCo))} (ghi ở TK cân đối)</span>}</span>
          {ngayChung
            ? <span title="Sổ, báo cáo xem từ ngày này trở đi hiện số dư ở dòng Số dư đầu kỳ">Ngày chốt <b>{date(ngayChung)}</b> → dùng phần mềm từ <b>{date(ngaySau(ngayChung))}</b>{!laCuoiThang(ngayChung) && <span className="so-du-canh-bao"> · ngày chốt thường là cuối tháng</span>}</span>
            : <span className="so-du-canh-bao"><AlertTriangle size={14} /> Các phiếu khác ngày chốt: {ngayChot.map((d) => date(d)).join(', ')} — nên cùng một ngày</span>}
          {/* TK trung gian (9xx, vd 999): nhập đủ mọi chi nhánh thì tự về 0 — còn số là còn thiếu. TK thật (vd 4211) dùng làm cân đối: chỉ báo số đã dồn vào. */}
          {canDoi.map(([tk, v]) => (tk.startsWith('9')
            ? <span key={tk} className="so-du-canh-bao" title="Nhập đủ mọi chi nhánh thì TK cân đối trung gian tự về 0; còn số dư là còn thiếu"><AlertTriangle size={14} /> TK cân đối {tk} còn {v > 0 ? 'Dư Nợ' : 'Dư Có'} {money(Math.abs(v))} — còn thiếu số dư</span>
            : <span key={tk} title="Phần lệch Nợ – Có của các phiếu được ghi vào tài khoản cân đối này">Phần lệch ghi vào {tk}: {v > 0 ? 'Dư Nợ' : 'Dư Có'} <b>{money(Math.abs(v))}</b> — kiểm tra đúng ý chưa</span>))}
        </div>
      )}

      <div className="card">
        <div className="row" style={{ gap: 4, flexWrap: 'wrap', alignItems: 'center', padding: '6px 0' }}>
          {NHOM.map((n) => (
            <button key={n.k} type="button" className={`btn btn-sm${nhom === n.k ? ' btn-primary' : ''}`} onClick={() => chonNhom(n.k)} title={n.p ? `Tài khoản ${n.p.join(', ')}` : 'Mọi tài khoản'}>
              {n.label}{demBtn(n.k)}
            </button>
          ))}
          <button type="button" className={`btn btn-sm${nhom === 'khac' ? ' btn-primary' : ''}`} onClick={() => chonNhom('khac')} title="Các tài khoản còn lại (kho, tài sản, thuế, vốn…)">Tài khoản khác{demBtn('khac')}</button>
          <span style={{ flex: 1 }} />
          <div className="row" style={{ gap: 0 }} role="group" title="Theo tài khoản: đã nhập số dư những tài khoản, đối tượng nào · Theo phiếu: mỗi chi nhánh một phiếu">
            <button type="button" className={`btn btn-sm${xem === 'tai-khoan' ? ' btn-primary' : ''}`} onClick={() => setXem('tai-khoan')}>Theo tài khoản</button>
            <button type="button" className={`btn btn-sm${xem === 'phieu' ? ' btn-primary' : ''}`} onClick={() => setXem('phieu')}>Theo phiếu</button>
          </div>
        </div>
        <ErrorBox error={q.error ? errorText(q.error) : chiTiet.error ? errorText(chiTiet.error) : loadError} />
        {q.isLoading ? <Loading /> : rows.length === 0 ? <Empty text="Chưa nhập số dư đầu kỳ. Làm theo 3 bước ở trên: bấm “Nhập số dư đầu kỳ” (nhập tay) hoặc “Nhập từ Excel”." /> : xem === 'tai-khoan' ? (
          chiTiet.isLoading ? <Loading /> : (
            <DataGrid storageKey="acc15-so-du-v1" exportName="so-du-dau-ky" exportTitle="SỐ DƯ TÀI KHOẢN ĐẦU KỲ" rows={hienThi} rowKey={(r) => r.key} columns={cot}
              onRowDoubleClick={(r) => void open(r.docId)} footerLabel="Cộng"
              emptyText={nhom ? `Chưa có số dư ${(nhomDang?.label ?? 'tài khoản khác').toLowerCase()} — bấm “Nhập số dư đầu kỳ”` : 'Chưa có số dư'} />
          )
        ) : (
          <div className="table-wrap">
            <table className="grid">
              <thead><tr><th>Ngày chốt số dư</th><th>Số phiếu</th><th>Chi nhánh</th><th>Diễn giải</th><th className="num">Tổng số dư</th><th>Trạng thái</th><th /></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={`clickable${r.status === 'cancelled' ? ' muted' : ''}`} onClick={() => void open(r.id)}>
                    <td>{date(r.docDate)}</td><td className="mono">{r.docNo}</td><td title={tenCn.get(r.branchCode) ?? ''}>{r.branchCode}</td><td>{r.description}</td>
                    <td className="num"><Money value={r.total} blankZero={false} /></td>
                    <td><StatusBadge status={r.status} /></td>
                    <td><button className="btn btn-sm" title="Xem bút toán ghi sổ của phiếu" onClick={(e) => { e.stopPropagation(); setDetailId(r.id); }}>Bút toán</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {form && <OpeningForm existing={form.existing} goiY={form.goiY} ngayChung={ngayChung} onClose={() => setForm(null)} onSaved={(docNo) => { setForm(null); setNotice(`Đã ghi sổ số dư đầu kỳ ${docNo}. Xem lại ở bảng bên dưới; sổ, báo cáo hiện số này ở dòng Số dư đầu kỳ.`); }} />}
      {detailId && <DocumentDetail id={detailId} onClose={() => setDetailId(null)} />}
    </>
  );
}

function OpeningForm({ existing, goiY, ngayChung, onClose, onSaved }: { existing?: Existing; goiY?: string; ngayChung: string; onClose: () => void; onSaved: (docNo: string) => void }) {
  const qc = useQueryClient();
  const p = existing?.payload;
  const tt = useThaoTac('ke-toan.so-du-dau-ky'); // [2026-11-13 08:00 PM kiennt] NT-HT-003 — sửa / huỷ theo thao tác màn ACC15 (đóng góp)
  const readOnly = existing?.status === 'cancelled' || (existing ? !tt.sua : !tt.them);
  const { data: branches } = useBranches();
  const { data: accounts = [] } = useQuery({ queryKey: ['accounts', 'posting'], queryFn: () => api.get<Account[]>('/api/v1/accounts', { postingOnly: true }), staleTime: 60_000 });
  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.code, a])), [accounts]);

  const [h, setH] = useState({
    branchCode: p?.branchCode ?? '',
    // Phiếu mới: cùng ngày chốt với các phiếu đã có; chưa có thì cuối tháng trước.
    docDate: p?.docDate ?? (ngayChung || cuoiThangTruoc()),
    description: p?.description ?? 'Số dư đầu kỳ',
    balancingAccount: p?.balancingAccount ?? '',
  });
  const [lines, setLines] = useState<LineDraft[]>(
    p?.lines.length ? p.lines.map((l) => ({ account: l.accountCode, partner: l.partnerCode ?? '', debit: l.debit ? money(l.debit) : '', credit: l.credit ? money(l.credit) : '' })) : [blank(goiY), blank(), blank()],
  );
  const [pasting, setPasting] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const set = (patch: Partial<typeof h>) => setH((x) => ({ ...x, ...patch }));
  const setLine = (i: number, patch: Partial<LineDraft>) => setLines((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const branchCode = h.branchCode || branches?.find((b) => b.isActive)?.code || '';

  const filled = lines.filter((l) => l.account && (parseAmount(l.debit) || parseAmount(l.credit)));
  const totalDebit = filled.reduce((s, l) => s + parseAmount(l.debit), 0);
  const totalCredit = filled.reduce((s, l) => s + parseAmount(l.credit), 0);
  const diff = totalDebit - totalCredit;
  const kiem = lines.map((l) => kiemDong(l, accountMap.get(l.account)));
  const soLoi = kiem.filter((k) => k.loi).length;
  const balAcc = h.balancingAccount.trim();
  const balLoi = balAcc && laiLo(balAcc) ? 'TK cân đối không được là doanh thu / chi phí / 911' : '';

  /** Đọc bảng dán từ Excel: mỗi dòng 4 cột cách nhau bằng tab (Tài khoản, Mã đối tượng, Dư Nợ, Dư Có). */
  const applyPaste = () => {
    const parsed = pasteText
      .split(/\r?\n/)
      .map((row) => row.split('\t').map((c) => c.trim()))
      .filter((c) => /^\d{3,}/.test(c[0] ?? ''))
      .map((c) => ({ account: c[0]!, partner: c[1] ?? '', debit: show(c[2] ?? ''), credit: show(c[3] ?? '') }));
    if (parsed.length) setLines(parsed);
    setPasting(false);
    setPasteText('');
  };

  const body = (): OpeningInput => ({
    branchCode,
    docDate: h.docDate,
    description: h.description,
    balancingAccount: balAcc || undefined,
    lines: filled.map((l) => ({ accountCode: l.account.trim(), partnerCode: l.partner.trim() || undefined, debit: parseAmount(l.debit), credit: parseAmount(l.credit) })),
  });
  const viewAgain = useViewAgain();
  const save = useMutation({
    mutationFn: () => (existing ? api.put<{ docNo: string }>(`/api/v1/opening-balances/${existing.id}`, body()) : api.post<{ docNo: string }>('/api/v1/opening-balances', body())),
    onSuccess: (r) => { void qc.invalidateQueries({ queryKey: ['documents'] }); void qc.invalidateQueries({ queryKey: ['document'] }); if (existing) viewAgain[1](); else onSaved(r.docNo); },
  });
  const cancel = useMutation({
    mutationFn: (reason: string) => api.post('/api/v1/documents/cancel', { docKey: existing!.docKey, reason }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['documents'] }); void qc.invalidateQueries({ queryKey: ['document'] }); onClose(); },
  });
  // Vì sao chưa ghi được — hiện ngay cạnh nút Ghi sổ (không để người dùng đoán).
  const lyDo = readOnly ? '' : !branchCode ? 'Chưa chọn chi nhánh' : !h.docDate ? 'Chưa chọn ngày chốt số dư' : filled.length === 0 ? 'Chưa có dòng số dư nào (tài khoản + số tiền)'
    : soLoi ? `${soLoi} dòng đang báo đỏ — sửa trước khi ghi` : balLoi || (diff !== 0 && !balAcc ? `Tổng Dư Nợ khác Dư Có ${money(Math.abs(diff))}: sửa số, hoặc ghi Tài khoản cân đối (vd 999)` : '');
  const canSave = !readOnly && !lyDo;
  const ngayKhac = !readOnly && ngayChung && h.docDate && h.docDate !== ngayChung;

  return (
    <Modal viewAgain={viewAgain} viewFirst={Boolean(existing)}
      wide
      helpKey="so-du-tai-khoan"
      title={existing ? `Số dư đầu kỳ ${existing.docNo}${existing.status === 'cancelled' ? ' (đã huỷ)' : ''}` : 'Nhập số dư đầu kỳ'}
      onClose={onClose}
      footer={
        <>
          {existing && existing.status !== 'cancelled' && tt.huy && <button data-view-ok className="btn btn-danger" style={{ marginRight: 'auto' }} disabled={cancel.isPending} title="Huỷ phiếu: bỏ toàn bộ số dư của phiếu khỏi sổ (bút toán đảo)" onClick={() => { const r = window.prompt('Lý do huỷ số dư đầu kỳ này:'); if (r) cancel.mutate(r); }}>Huỷ phiếu</button>}
          {lyDo && <span className="muted so-du-ly-do" title={lyDo}>{lyDo}</span>}
          <button className="btn" onClick={onClose}>Đóng</button>
          {!readOnly && <button className="btn btn-primary" disabled={!canSave || save.isPending} title={lyDo || 'Ghi số dư vào sổ'} onClick={() => save.mutate()}>{existing ? 'Ghi lại' : 'Ghi sổ'}</button>}
        </>
      }
    >
      <Field label="Chi nhánh lập chứng từ" hint="Mỗi chi nhánh một phiếu số dư">
        <BranchPicker activeOnly value={branchCode} disabled={readOnly} onChange={(c) => set({ branchCode: c })} />
      </Field>
      <Field label="Ngày chốt số dư" hint="Ngày cuối cùng TRƯỚC khi bắt đầu dùng phần mềm (thường là cuối tháng). Dùng từ 01/11 → chốt 31/10. Sổ, báo cáo luôn hiện số này ở dòng Số dư đầu kỳ."
        error={ngayKhac ? `Các phiếu số dư khác đang chốt ngày ${date(ngayChung)} — nên cùng một ngày` : !readOnly && h.docDate && !laCuoiThang(h.docDate) ? 'Ngày chốt thường là ngày cuối tháng' : null}>
        <input type="date" className="input" value={h.docDate} disabled={readOnly} onChange={(e) => set({ docDate: e.target.value })} />
      </Field>
      <Field label="Tài khoản cân đối" hint="Chỉ cần khi số dư của chi nhánh này không tự cân (tổng Dư Nợ ≠ tổng Dư Có). Nhập đủ mọi chi nhánh thì tài khoản này tự về 0." error={balLoi || null}>
        <AccountPicker postingOnly value={h.balancingAccount} disabled={readOnly} onChange={(balancingAccount) => set({ balancingAccount })} placeholder="Ví dụ 999" />
      </Field>

      <div className="full">
        {!readOnly && (
          <div className="row" style={{ marginBottom: 8 }}>
            <button className="btn btn-sm" title="Chép vùng 4 cột trong Excel rồi dán" onClick={() => setPasting((x) => !x)}><ClipboardPaste size={14} /> Dán từ Excel</button>
            <span className="muted" style={{ fontSize: 12 }}>4 cột theo thứ tự: Tài khoản | Mã đối tượng | Dư Nợ | Dư Có · tiền mặt / tiền gửi chỉ Dư Nợ · công nợ mỗi đối tượng một dòng</span>
          </div>
        )}
        {pasting && (
          <div style={{ marginBottom: 10 }}>
            <textarea className="input mono" style={{ width: '100%', height: 120 }} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="Chép vùng dữ liệu trong Excel rồi dán vào đây (Ctrl+V)" autoFocus />
            <div className="row" style={{ marginTop: 6 }}><button className="btn btn-sm btn-primary" onClick={applyPaste}>Dùng dữ liệu này (thay các dòng đang nhập)</button><button className="btn btn-sm" onClick={() => setPasting(false)}>Thôi</button></div>
          </div>
        )}
        <div style={{ maxHeight: '42vh', overflow: 'auto' }}>
          <table className="voucher-lines">
            <thead><tr><th style={{ width: 170 }} title="Tài khoản chi tiết">Tài khoản</th><th style={{ width: 200 }} title="Bắt buộc với tài khoản công nợ (131, 331, 141, 334…)">Mã đối tượng</th><th style={{ width: 170 }} className="num" title="Số dư bên Nợ tại ngày chốt">Dư Nợ</th><th style={{ width: 170 }} className="num" title="Số dư bên Có tại ngày chốt">Dư Có</th><th>Tên tài khoản · kiểm tra</th><th style={{ width: 36 }} /></tr></thead>
            <tbody>
              {lines.map((l, i) => {
                const acc = accountMap.get(l.account);
                const needPartner = Boolean(acc && (acc.trackPartner || acc.isDebt));
                const k = kiem[i]!;
                return (
                  <tr key={i} className={k.loi ? 'so-du-dong-loi' : undefined}>
                    <td><AccountPicker postingOnly hideName className="input mono" value={l.account} disabled={readOnly} onChange={(account) => setLine(i, { account })} placeholder="Bấm để chọn" /></td>
                    <td><PartnerPicker value={l.partner} disabled={readOnly} onChange={(partner) => setLine(i, { partner })} placeholder={needPartner ? 'Bắt buộc' : ''} /></td>
                    <td><input className="input num" inputMode="numeric" value={l.debit} disabled={readOnly} onChange={(e) => setLine(i, { debit: e.target.value, credit: e.target.value ? '' : l.credit })} onBlur={() => setLine(i, { debit: show(l.debit) })} /></td>
                    <td><input className="input num" inputMode="numeric" value={l.credit} disabled={readOnly} onChange={(e) => setLine(i, { credit: e.target.value, debit: e.target.value ? '' : l.debit })} onBlur={() => setLine(i, { credit: show(l.credit) })} /></td>
                    <td className="acc-name" style={{ paddingTop: 6 }}>
                      {l.account && acc ? acc.name : ''}
                      {k.loi && <div className="so-du-loi"><AlertTriangle size={13} /> {k.loi}</div>}
                      {k.canhBao && <div className="so-du-canh-bao"><AlertTriangle size={13} /> {k.canhBao}</div>}
                    </td>
                    <td>{!readOnly && lines.length > 1 && <button className="btn btn-sm btn-ghost" title="Xoá dòng" onClick={() => setLines((xs) => xs.filter((_, j) => j !== i))}><Trash2 size={15} /></button>}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>{!readOnly && <button className="btn btn-sm" onClick={() => setLines((xs) => [...xs, blank()])}><Plus size={14} /> Thêm dòng</button>}</td>
                <td className="num" title="Tổng Dư Nợ">{money(totalDebit, { blankZero: false })}</td>
                <td className="num" title="Tổng Dư Có">{money(totalCredit, { blankZero: false })}</td>
                <td colSpan={2} style={{ fontWeight: 400 }} className={diff === 0 ? 'muted' : 'neg'}>{diff === 0 ? 'Đã cân' : `Lệch ${money(Math.abs(diff))} (${diff > 0 ? 'Nợ lớn hơn' : 'Có lớn hơn'})${balAcc ? ` → ghi vào ${balAcc}` : ''}`}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      {save.error && <div className="alert alert-bad full">{errorText(save.error)}</div>}
      {cancel.error && <div className="alert alert-bad full">{errorText(cancel.error)}</div>}
    </Modal>
  );
}
