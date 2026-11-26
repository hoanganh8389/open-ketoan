/**
 * THUE03 Hoá đơn điện tử (NT-BH-048) — khai một chỗ ở kế toán:
 *   - thẻ "Người bán và tài khoản Viettel" (theo sổ): xem trước, bấm Sửa mới sửa; mật khẩu / token chỉ hiện "đã đặt lúc … bởi …";
 *   - bảng chi nhánh: mẫu số / ký hiệu riêng (trống = theo sổ), portal gửi mail;
 *   - nút Thử kết nối Viettel (máy chủ gọi, không phát hành hoá đơn); nhật ký thay đổi.
 * Chỉ gọi API của module `/api/v1/m/hoa-don-dien-tu/…`.
 */
// [2026-11-26 09:00 PM Võ Hoàng] NGHIEM-THU — NT-BH-048: màn THUE03 (đóng góp)
import { useState, type ReactNode } from 'react';
import { DataGrid, ErrorBox, Field, Loading, Modal, PageHeader, errorText, useApi, useCan, useMutation, useQuery, useQueryClient, type GridColumn } from '@bizcity/ui-kit';

const M = '/api/v1/m/hoa-don-dien-tu';
const P_SUA = 'hoa-don-dien-tu:cai-dat-sua';

type SecretInfo = { set: boolean; updatedAt: string | null; updatedBy: string | null };
type So = {
  trangThai: 'nhap' | 'dang-dung' | 'ngung'; mst: string; tenPhapLy: string; diaChi: string; dienThoai: string; apiBaseUrl: string;
  authMode: 'basic' | 'token'; username: string; sslVerify: boolean; templateCode: string; invoiceSeries: string; paymentMethod: string;
  autoEnabled: boolean; autoMode: 'draft' | 'issue'; configured: boolean; version: number; updatedByName: string; updatedAt: string | null;
};
type Cn = {
  branchCode: string; branchName: string; level: string | null; parentCode: string | null; configured: boolean; templateCode: string; invoiceSeries: string;
  portalEnabled: boolean; portalAccount: string; portalSupplierId: string; active: boolean; version: number; updatedByName: string; updatedAt: string | null;
  effectiveTemplate: string; effectiveSeries: string; templateFrom: 'chi-nhanh' | 'so'; seriesFrom: 'chi-nhanh' | 'so'; portalPassword: SecretInfo;
};
type CaiDat = { canEdit: boolean; so: So; secrets: { password: SecretInfo; token: SecretInfo }; chiNhanh: Cn[] };
type NhatKy = { id: string; at: string; actorName: string; doiTuong: string; hanhDong: string; chiTiet: { oDaDoi?: string[]; biMat?: string[]; httpCode?: number | null; ok?: boolean; loi?: string } };

const TRANG_THAI: Record<So['trangThai'], string> = { nhap: 'Đang khai (website chưa dùng)', 'dang-dung': 'Đang dùng', ngung: 'Tạm ngừng phát hành' };
const vn = (iso: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '');
const secretText = (s: SecretInfo) => (s.set ? `Đã đặt lúc ${vn(s.updatedAt)}${s.updatedBy ? ` bởi ${s.updatedBy}` : ''}` : 'Chưa đặt');
/** Lỗi máy chủ → { ô: câu báo } (details.findings). */
const fieldErrors = (err: unknown): Record<string, string> => {
  const f = (err as { details?: { findings?: { field?: string; title?: string }[] } } | null)?.details?.findings ?? [];
  return Object.fromEntries(f.filter((x) => x.field).map((x) => [x.field!, x.title ?? '']));
};

export function HoaDonDienTuPage() {
  const api = useApi();
  const can = useCan();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['hddt', 'cai-dat'], queryFn: () => api.get<CaiDat>(`${M}/cai-dat`) });
  const nk = useQuery({ queryKey: ['hddt', 'nhat-ky'], queryFn: () => api.get<{ items: NhatKy[] }>(`${M}/nhat-ky`, { limit: 50 }) });
  const [suaSo, setSuaSo] = useState(false);
  const [suaCn, setSuaCn] = useState<Cn | null>(null);
  const reload = () => { void qc.invalidateQueries({ queryKey: ['hddt'] }); };
  const thu = useMutation({ mutationFn: () => api.post<{ ok: boolean; message: string }>(`${M}/ket-noi/thu`, {}), onSettled: reload });
  const sua = can(P_SUA) && Boolean(q.data?.canEdit);
  const header = {
    title: 'Hoá đơn điện tử', code: 'THUE03', helpKey: 'hoa-don-dien-tu',
    subtitle: 'Khai một chỗ thông tin xuất hoá đơn Viettel cho cả chuỗi. Website vẫn phát hành, lấy cài đặt ở đây qua cầu nối.',
  };

  if (q.isLoading) return <><PageHeader {...header} /><Loading /></>;
  if (q.error || !q.data) return <><PageHeader {...header} /><ErrorBox error={errorText(q.error)} /></>;
  const d = q.data;
  const s = d.so;

  const cols: GridColumn<Cn>[] = [
    { key: 'branchCode', header: <span title="Mã chi nhánh ở danh mục chi nhánh">Chi nhánh</span>, type: 'code', width: 100 },
    { key: 'branchName', header: <span title="Tên chi nhánh / cửa hàng">Tên</span>, width: 200 },
    { key: 'effectiveTemplate', header: <span title="Mẫu số dùng khi phát hành: của chi nhánh, trống thì theo sổ">Mẫu số</span>, width: 110,
      render: (r) => <span>{r.effectiveTemplate || '—'}{r.templateFrom === 'so' && <span className="muted" title="Chi nhánh chưa khai riêng — dùng mẫu số mặc định của sổ"> (theo sổ)</span>}</span> },
    { key: 'effectiveSeries', header: <span title="Ký hiệu dùng khi phát hành: của chi nhánh, trống thì theo sổ">Ký hiệu</span>, width: 120,
      render: (r) => <span>{r.effectiveSeries || '—'}{r.seriesFrom === 'so' && <span className="muted" title="Chi nhánh chưa khai riêng — dùng ký hiệu mặc định của sổ"> (theo sổ)</span>}</span> },
    { key: 'portalEnabled', header: <span title="Gửi hoá đơn cho nhiều email qua portal Viettel">Portal</span>, type: 'check', width: 70 },
    { key: 'portalAccount', header: <span title="Tài khoản portal Viettel của chi nhánh">Tài khoản portal</span>, width: 170 },
    { key: 'portalPassword', header: <span title="Mật khẩu portal lưu mã hoá — không hiện lại">Mật khẩu portal</span>, width: 190,
      value: (r) => secretText(r.portalPassword), render: (r) => <span className={r.portalPassword.set ? '' : 'muted'}>{secretText(r.portalPassword)}</span> },
    { key: 'active', header: <span title="Bỏ tích = chi nhánh không phát hành hoá đơn điện tử">Phát hành</span>, type: 'check', width: 80 },
    { key: 'sua', header: '', width: 70, noFilter: true, noSort: true,
      render: (r) => sua ? <button className="btn btn-xs" title={`Sửa cài đặt hoá đơn của ${r.branchCode}`} onClick={() => setSuaCn(r)}>Sửa</button> : null },
  ];

  return (
    <>
      <PageHeader {...header} actions={sua ? (
        <button className="btn" disabled={thu.isPending || !s.apiBaseUrl} title={s.apiBaseUrl ? 'Máy chủ gọi thử địa chỉ API Viettel bằng tài khoản đã khai — không phát hành hoá đơn' : 'Khai API base URL trước'}
          onClick={() => thu.mutate()}>{thu.isPending ? 'Đang thử…' : 'Thử kết nối Viettel'}</button>) : undefined} />
      {thu.data && <div className={`alert ${thu.data.ok ? 'alert-ok' : 'alert-warn'}`} role="status">{thu.data.message}</div>}
      <ErrorBox error={thu.error ? errorText(thu.error) : null} />

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="row" style={{ alignItems: 'center', gap: 8 }}>
          <b title="Thông tin theo sổ (một sổ = một pháp nhân): dùng cho mọi chi nhánh">Người bán và tài khoản Viettel</b>
          <span className="muted" title="Trạng thái cài đặt">· {s.configured ? TRANG_THAI[s.trangThai] : 'Chưa khai'}</span>
          {s.updatedAt && <span className="muted" title="Lần sửa cuối">· sửa lúc {vn(s.updatedAt)}{s.updatedByName ? ` bởi ${s.updatedByName}` : ''}</span>}
          <span style={{ flex: 1 }} />
          {sua && <button className="btn btn-primary btn-sm" onClick={() => setSuaSo(true)} title="Sửa thông tin người bán, tài khoản Viettel, mặc định">Sửa</button>}
        </div>
        <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '6px 16px', marginTop: 8 }}>
          <Xem label="MST người bán" tip="Mã số thuế in trên hoá đơn">{s.mst}</Xem>
          <Xem label="Tên pháp lý" tip="Tên người bán in trên hoá đơn">{s.tenPhapLy}</Xem>
          <Xem label="Địa chỉ" tip="Địa chỉ pháp lý">{s.diaChi}</Xem>
          <Xem label="Điện thoại" tip="Điện thoại người bán">{s.dienThoai}</Xem>
          <Xem label="API base URL" tip="Địa chỉ API hoá đơn Viettel">{s.apiBaseUrl}</Xem>
          <Xem label="Xác thực" tip="Basic = tên đăng nhập + mật khẩu; Bearer = access token">{s.authMode === 'basic' ? `Basic · ${s.username || '—'}` : 'Bearer token'}</Xem>
          <Xem label={s.authMode === 'basic' ? 'Mật khẩu Viettel' : 'Access token'} tip="Lưu mã hoá, không hiện lại cho ai">{secretText(s.authMode === 'basic' ? d.secrets.password : d.secrets.token)}</Xem>
          <Xem label="Mẫu số / ký hiệu mặc định" tip="Chi nhánh không khai riêng thì dùng">{[s.templateCode, s.invoiceSeries].filter(Boolean).join(' · ')}</Xem>
          <Xem label="Thanh toán mặc định" tip="Phương thức thanh toán ghi trên hoá đơn">{s.paymentMethod}</Xem>
          <Xem label="Tự động" tip="Website tự xử lý hoá đơn khi bán xong, hay phát hành tay">{s.autoEnabled ? (s.autoMode === 'issue' ? 'Phát hành và gửi CQT' : 'Tạo nháp') : 'Tắt (phát hành tay)'}</Xem>
          <Xem label="Kiểm chứng chỉ SSL" tip="Chỉ tắt khi môi trường thử dùng chứng chỉ tự ký">{s.sslVerify ? 'Bật' : 'Tắt'}</Xem>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <b title="Mẫu số / ký hiệu riêng và portal gửi mail theo từng chi nhánh">Theo chi nhánh</b>
        <DataGrid rows={d.chiNhanh} columns={cols} rowKey={(r) => r.branchCode} storageKey="hoa-don-dien-tu.chi-nhanh" exportName="hoa-don-dien-tu-chi-nhanh"
          emptyText="Chưa có chi nhánh đang dùng." onRowDoubleClick={sua ? (r) => setSuaCn(r) : undefined} />
      </div>

      <div className="card">
        <b title="Ai, lúc nào, sửa ô nào, thử kết nối — không ghi giá trị mật khẩu">Nhật ký</b>
        {nk.isLoading ? <Loading /> : (
          <table className="grid full" style={{ marginTop: 6 }}>
            <thead><tr><th title="Thời điểm">Lúc</th><th title="Người làm">Người</th><th title="Sổ / chi nhánh / thử kết nối">Ở đâu</th><th title="Ô đã đổi, mật khẩu đã đặt / xoá, kết quả thử">Nội dung</th></tr></thead>
            <tbody>{(nk.data?.items ?? []).map((x) => (
              <tr key={x.id}>
                <td>{vn(x.at)}</td><td>{x.actorName}</td>
                <td>{x.doiTuong === 'so' ? 'Sổ' : x.doiTuong === 'ket-noi' ? 'Thử kết nối' : x.doiTuong.replace('chi-nhanh:', 'Chi nhánh ')}</td>
                <td>{x.hanhDong === 'thu-ket-noi'
                  ? `${x.chiTiet.ok ? 'Kết nối được' : 'Không được'}${x.chiTiet.httpCode != null ? ` (HTTP ${x.chiTiet.httpCode})` : ''}${x.chiTiet.loi ? ` — ${x.chiTiet.loi}` : ''}`
                  : [x.chiTiet.oDaDoi?.length ? `Sửa: ${x.chiTiet.oDaDoi.join(', ')}` : '', ...(x.chiTiet.biMat ?? [])].filter(Boolean).join(' · ') || 'Lưu, không đổi gì'}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>

      {suaSo && <SoForm so={s} secrets={d.secrets} onClose={() => setSuaSo(false)} onSaved={() => { setSuaSo(false); reload(); }} />}
      {suaCn && <CnForm cn={suaCn} so={s} onClose={() => setSuaCn(null)} onSaved={() => { setSuaCn(null); reload(); }} />}
    </>
  );
}

function Xem({ label, tip, children }: { label: string; tip: string; children: ReactNode }) {
  return <div title={tip}><div className="muted" style={{ fontSize: 12 }}>{label}</div><div>{children || <span className="muted">—</span>}</div></div>;
}

/** Ô mật khẩu: trống = giữ, "-" = xoá, gõ mới = đặt mới. Không bao giờ điền sẵn giá trị cũ. */
function SecretField({ label, info, value, onChange, err }: { label: string; info: SecretInfo; value: string; onChange: (v: string) => void; err?: string }) {
  return (
    <Field label={label} hint={`${secretText(info)}. Để trống = giữ; gõ - để xoá.${err ? ` ${err}` : ''}`}>
      <input className={`input${err ? ' is-invalid' : ''}`} type="password" autoComplete="new-password" value={value} placeholder={info.set ? '•••••• (giữ nguyên)' : 'Nhập mới'}
        title="Lưu mã hoá ở máy chủ, không hiện lại" onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

function SoForm({ so, secrets, onClose, onSaved }: { so: So; secrets: CaiDat['secrets']; onClose: () => void; onSaved: () => void }) {
  const api = useApi();
  const [v, setV] = useState({ ...so, password: '', token: '' });
  const set = (p: Partial<typeof v>) => setV((o) => ({ ...o, ...p }));
  const m = useMutation({ mutationFn: () => api.put(`${M}/cai-dat/so`, v), onSuccess: onSaved });
  const fe = fieldErrors(m.error);
  const txt = (k: 'mst' | 'tenPhapLy' | 'diaChi' | 'dienThoai' | 'apiBaseUrl' | 'username' | 'templateCode' | 'invoiceSeries' | 'paymentMethod', label: string, tip: string, full = false) => (
    <Field label={label} full={full} {...(fe[k] ? { hint: fe[k] } : {})}>
      <input className={`input${fe[k] ? ' is-invalid' : ''}`} value={v[k]} title={tip} onChange={(e) => set({ [k]: e.target.value } as Partial<typeof v>)} />
    </Field>
  );
  return (
    <Modal wide title="Người bán và tài khoản Viettel (theo sổ)" onClose={onClose}
      footer={<><button className="btn btn-primary" disabled={m.isPending} onClick={() => m.mutate()} title="Lưu cài đặt; mật khẩu trống thì giữ nguyên">Lưu</button><button className="btn" onClick={onClose}>Thoát</button></>}>
      <ErrorBox error={m.error ? errorText(m.error) : null} />
      <Field label="Trạng thái" hint="Đang dùng = website dùng để phát hành; cần đủ MST, tên, API, mẫu số, ký hiệu, tài khoản">
        <select className="input" value={v.trangThai} title="Trạng thái cài đặt" onChange={(e) => set({ trangThai: e.target.value as So['trangThai'] })}>
          {Object.entries(TRANG_THAI).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </Field>
      {txt('mst', 'MST người bán', '10 số hoặc 0123456789-001')}
      {txt('tenPhapLy', 'Tên pháp lý', 'Tên người bán in trên hoá đơn', true)}
      {txt('diaChi', 'Địa chỉ pháp lý', 'Địa chỉ in trên hoá đơn', true)}
      {txt('dienThoai', 'Điện thoại', 'Điện thoại người bán')}
      {txt('apiBaseUrl', 'API base URL', 'Địa chỉ API hoá đơn Viettel, bắt đầu bằng https://', true)}
      <Field label="Xác thực">
        <select className="input" value={v.authMode} title="Basic = tên đăng nhập + mật khẩu; Bearer = access token" onChange={(e) => set({ authMode: e.target.value as So['authMode'] })}>
          <option value="basic">Basic (tên đăng nhập + mật khẩu)</option><option value="token">Bearer token</option>
        </select>
      </Field>
      {v.authMode === 'basic' ? <>
        {txt('username', 'Tên đăng nhập Viettel', 'Tài khoản API Viettel')}
        <SecretField label="Mật khẩu Viettel" info={secrets.password} value={v.password} onChange={(x) => set({ password: x })} {...(fe.password ? { err: fe.password } : {})} />
      </> : <SecretField label="Access token" info={secrets.token} value={v.token} onChange={(x) => set({ token: x })} {...(fe.token ? { err: fe.token } : {})} />}
      <Field label=" "><label className="checkbox" title="Chỉ tắt khi môi trường thử dùng chứng chỉ tự ký"><input type="checkbox" checked={v.sslVerify} onChange={(e) => set({ sslVerify: e.target.checked })} /> Kiểm chứng chỉ SSL</label></Field>
      {txt('templateCode', 'Mẫu số mặc định', 'Chi nhánh không khai riêng thì dùng, vd 1/001')}
      {txt('invoiceSeries', 'Ký hiệu mặc định', 'Chi nhánh không khai riêng thì dùng, vd C25TAA')}
      {txt('paymentMethod', 'Thanh toán mặc định', 'Phương thức thanh toán ghi trên hoá đơn, vd TM/CK')}
      <Field label="Tự động xử lý khi bán xong">
        <select className="input" value={v.autoEnabled ? v.autoMode : 'tat'} title="Website tự tạo nháp / phát hành khi bán xong, hay phát hành tay"
          onChange={(e) => (e.target.value === 'tat' ? set({ autoEnabled: false }) : set({ autoEnabled: true, autoMode: e.target.value as So['autoMode'] }))}>
          <option value="tat">Tắt — phát hành tay</option><option value="draft">Tạo nháp trên Viettel</option><option value="issue">Phát hành và gửi CQT</option>
        </select>
      </Field>
    </Modal>
  );
}

function CnForm({ cn, so, onClose, onSaved }: { cn: Cn; so: So; onClose: () => void; onSaved: () => void }) {
  const api = useApi();
  const [v, setV] = useState({ templateCode: cn.templateCode, invoiceSeries: cn.invoiceSeries, portalEnabled: cn.portalEnabled, portalAccount: cn.portalAccount,
    portalSupplierId: cn.portalSupplierId, active: cn.active, portalPassword: '' });
  const set = (p: Partial<typeof v>) => setV((o) => ({ ...o, ...p }));
  const m = useMutation({ mutationFn: () => api.put(`${M}/cai-dat/chi-nhanh/${encodeURIComponent(cn.branchCode)}`, { ...v, version: cn.version }), onSuccess: onSaved });
  const fe = fieldErrors(m.error);
  return (
    <Modal title={`Hoá đơn điện tử — chi nhánh ${cn.branchCode} ${cn.branchName}`} onClose={onClose}
      footer={<><button className="btn btn-primary" disabled={m.isPending} onClick={() => m.mutate()}>Lưu</button><button className="btn" onClick={onClose}>Thoát</button></>}>
      <ErrorBox error={m.error ? errorText(m.error) : null} />
      <Field label="Mẫu số" hint={`Trống = theo sổ (${so.templateCode || 'chưa khai'})`}>
        <input className="input" value={v.templateCode} title="Mẫu số riêng của chi nhánh" onChange={(e) => set({ templateCode: e.target.value })} />
      </Field>
      <Field label="Ký hiệu" hint={`Trống = theo sổ (${so.invoiceSeries || 'chưa khai'})`}>
        <input className="input" value={v.invoiceSeries} title="Ký hiệu riêng của chi nhánh" onChange={(e) => set({ invoiceSeries: e.target.value })} />
      </Field>
      <Field label=" "><label className="checkbox" title="Bỏ tích = chi nhánh không phát hành hoá đơn điện tử"><input type="checkbox" checked={v.active} onChange={(e) => set({ active: e.target.checked })} /> Phát hành hoá đơn điện tử</label></Field>
      <Field label=" "><label className="checkbox" title="Gửi hoá đơn cho nhiều email qua portal Viettel"><input type="checkbox" checked={v.portalEnabled} onChange={(e) => set({ portalEnabled: e.target.checked })} /> Gửi mail qua portal</label></Field>
      <Field label="Tài khoản portal" {...(fe.portalAccount ? { hint: fe.portalAccount } : {})}>
        <input className={`input${fe.portalAccount ? ' is-invalid' : ''}`} value={v.portalAccount} placeholder="vd 0106933743-026_QT" title="Tài khoản đăng nhập portal Viettel" onChange={(e) => set({ portalAccount: e.target.value })} />
      </Field>
      <SecretField label="Mật khẩu portal" info={cn.portalPassword} value={v.portalPassword} onChange={(x) => set({ portalPassword: x })} {...(fe.portalPassword ? { err: fe.portalPassword } : {})} />
      <Field label="Supplier ID (nội bộ)">
        <input className="input" value={v.portalSupplierId} placeholder="vd 102668" title="Mã người bán nội bộ trên portal" onChange={(e) => set({ portalSupplierId: e.target.value })} />
      </Field>
    </Modal>
  );
}
