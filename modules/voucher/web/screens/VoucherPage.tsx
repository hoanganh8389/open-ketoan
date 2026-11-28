/**
 * BH21 Voucher (phiếu NT-BH-026): thẻ Đợt phát (lập / sửa / ngừng đợt; sinh mã cho danh sách SĐT, nạp mã có sẵn kèm SĐT — dán từ Excel;
 * danh sách mã của đợt, Excel), Tra cứu mã (mã → đợt, khách, hạn, đã dùng ở đơn nào / ngày / cửa hàng, nhật ký; SĐT → mọi mã của khách),
 * Báo cáo (theo đợt / người phát: phát hành, còn, đã dùng, hết hạn, thu hồi; theo cửa hàng dùng; Excel).
 * NT-BH-037: form Thêm / Sửa đợt dựng bằng khung phiếu `DocSheet` cùng mẫu phiếu mua (khối đầu, cột Trợ lý Kiểm tra / Tóm tắt);
 * dữ liệu gửi, lời gọi API giữ nguyên. Hộp chi tiết đợt, hộp nhỏ khác vẫn là Modal.
 */
// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: màn Voucher (đóng góp)
// [2026-11-22 Võ Hoàng] NGHIEM-THU — NT-BH-037: form đợt voucher dựng lại bằng DocSheet cùng mẫu phiếu mua (đóng góp)
// [2026-11-27 09:00 AM Võ Hoàng] NGHIEM-THU — NT-BH-050: giảm % có trần, lô mã không SĐT, mỗi khách tối đa, cửa hàng áp dụng (như chính sách voucher cũ) (đóng góp)
// [2026-11-29 05:00 PM Võ Hoàng] NGHIEM-THU — NT-BH-066: Thêm / Sửa đợt mở form ngay trên màn (FormPage dùng chung, như MH29), không còn hộp DocSheet;
//   ô xếp lưới 3 cột kín (FormGrid), Trợ lý Kiểm tra / Tóm tắt giữ ở cột phải, ?dot=<id> | ?dot=moi để tải lại / Back (đóng góp)
// [2026-11-27 Võ Hoàng] NGHIEM-THU — NT-BH-050: giao diện theo lớp chung của Core — thẻ gạch chân (tabs), thanh nút catalog-toolbar trong card,
//   bộ lọc FilterLayout, khối card / card-body (đóng góp)
import { useEffect, useRef, useState } from 'react';
import {
  BranchCheckList, DataGrid, DocSheetPanel, ErrorBox, Field, FilterLayout, FormGrid, FormPage, useFormParam, Loading, Modal, PageHeader, errorText, useApi, useCan, useMutation, useQuery, useQueryClient, type GridColumn,
} from '@bizcity/ui-kit';

const M = '/api/v1/m/voucher';
const today = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const list = (s: string) => s.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);

type Counts = { issued: number; active: number; used: number; expired: number; revoked: number };
type Campaign = {
  id: string; code: string; name: string; kind: 'cash' | 'next_purchase'; issuer: 'tgs' | 'brand'; issuerPartnerCode: string | null; paymentMethodCode: string | null;
  faceValue: number; minOrder: number; validFrom: string; validTo: string | null; validDays: number | null; skus: string[]; brandCodes: string[];
  discountType: 'amount' | 'percent'; discountPercent: number | null; maxDiscount: number | null; perCustomer: number | null; branchCodes: string[];
  issueMode: 'manual' | 'auto'; autoRule: { skus: string[]; brandCodes: string[]; minQty: number; branches: string[] } | null; status: 'active' | 'stopped';
  note: string | null; counts: Counts;
};
type Code = {
  code: string; phone: string | null; usedPhone?: string | null; state: string; source: string; expiresOn: string | null; issuedAt: string; issuedOrderCode: string | null; usedRefCode: string | null;
  usedSource: string | null; usedBranch: string | null; usedOn: string | null; usedAmount: number | null; revokeReason: string | null; campaignId: string;
};

const KIND = { cash: 'Tương đương tiền', next_purchase: 'Lần mua sau (sản phẩm / nhãn)' } as const;
const ISSUER = { tgs: 'TGS (chiết khấu)', brand: 'Hãng / NCC (thanh toán)' } as const;
const STATE: Record<string, [string, string]> = {
  active: ['Còn', 'badge-ok'], used: ['Đã dùng', 'badge-info'], expired: ['Hết hạn', 'badge-warn'], revoked: ['Thu hồi', 'badge-gray'],
};
const vndText = (n: number) => `${n.toLocaleString('vi-VN')}đ`;
/** Giá trị voucher: "50.000đ" hoặc "Giảm 10%, tối đa 50.000đ" (NT-BH-050). */
const valueText = (c: { discountType?: string; faceValue: number; discountPercent?: number | null; maxDiscount?: number | null }) =>
  c.discountType === 'percent' ? `Giảm ${(c.discountPercent ?? 0).toLocaleString('vi-VN')}%${c.maxDiscount ? `, tối đa ${vndText(c.maxDiscount)}` : ''}` : vndText(c.faceValue);
const stateBadge = (s: string) => <span className={`badge ${STATE[s]?.[1] ?? 'badge-gray'}`}>{STATE[s]?.[0] ?? s}</span>;

const campaignCols: GridColumn<Campaign>[] = [
  { key: 'code', header: 'Mã đợt', type: 'code', width: 120 },
  { key: 'name', header: 'Tên đợt', width: 200 },
  { key: 'kind', header: 'Loại', width: 190, value: (r) => KIND[r.kind] },
  { key: 'issuer', header: 'Người phát', width: 170, value: (r) => (r.issuer === 'brand' ? `Hãng ${r.issuerPartnerCode ?? ''}` : 'TGS') },
  { key: 'faceValue', header: <span title="Mệnh giá tiền, hoặc giảm % kèm trần giảm">Giá trị</span>, width: 170, value: (r) => valueText(r) },
  { key: 'perCustomer', header: <span title="Mỗi khách dùng tối đa bao nhiêu mã của đợt">Mỗi khách</span>, width: 90, value: (r) => (r.perCustomer ? `tối đa ${r.perCustomer}` : 'Không giới hạn') },
  { key: 'branchCodes', header: <span title="Cửa hàng dùng được voucher">Cửa hàng</span>, width: 140, value: (r) => (r.branchCodes.length ? r.branchCodes.join(', ') : 'Mọi cửa hàng') },
  { key: 'validTo', header: 'Hạn', width: 100, value: (r) => r.validTo ?? (r.validDays ? `${r.validDays} ngày` : 'Không hạn') },
  { key: 'issueMode', header: 'Kiểu phát', width: 100, value: (r) => (r.issueMode === 'auto' ? 'Tự động' : 'Thủ công') },
  { key: 'issued', header: 'Đã phát', type: 'number', sum: true, width: 80, value: (r) => r.counts.issued },
  { key: 'used', header: 'Đã dùng', type: 'number', sum: true, width: 80, value: (r) => r.counts.used },
  { key: 'active', header: 'Còn', type: 'number', sum: true, width: 70, value: (r) => r.counts.active },
  { key: 'status', header: 'Trạng thái', width: 90, value: (r) => (r.status === 'active' ? 'Đang dùng' : 'Đã ngừng') },
];
const codeCols: GridColumn<Code>[] = [
  { key: 'code', header: 'Mã voucher', type: 'code', width: 130 },
  { key: 'phone', header: <span title="Khách được phát; mã lô không gắn SĐT thì ai cầm mã cũng dùng">SĐT khách</span>, width: 120, value: (r) => r.phone ?? 'Không gắn SĐT' },
  { key: 'usedPhone', header: <span title="SĐT khách của đơn / phiếu đã dùng mã">Khách đã dùng</span>, width: 120, value: (r) => r.usedPhone ?? '' },
  { key: 'state', header: 'Trạng thái', width: 90, value: (r) => STATE[r.state]?.[0] ?? r.state, render: (r) => stateBadge(r.state) },
  { key: 'expiresOn', header: 'Hạn', width: 100 },
  { key: 'source', header: 'Nguồn', width: 100, value: (r) => ({ generate: 'Sinh', import: 'Nạp', batch: 'Lô không SĐT', auto: `Tự phát ${r.issuedOrderCode ?? ''}` }[r.source] ?? r.source) },
  { key: 'usedRefCode', header: 'Dùng ở', width: 130 },
  { key: 'usedOn', header: 'Ngày dùng', width: 100 },
  { key: 'usedBranch', header: 'Cửa hàng', width: 90 },
  { key: 'usedAmount', header: 'Tiền trừ', type: 'money', sum: true, width: 100 },
  { key: 'revokeReason', header: 'Lý do thu hồi', width: 180, hidden: true },
];

type Form = {
  code: string; name: string; kind: Campaign['kind']; issuer: Campaign['issuer']; issuerPartnerCode: string; paymentMethodCode: string; faceValue: string; minOrder: string;
  discountType: Campaign['discountType']; discountPercent: string; maxDiscount: string; perCustomer: string; branchCodes: string;
  validFrom: string; validTo: string; validDays: string; skus: string; brandCodes: string; issueMode: Campaign['issueMode'];
  autoSkus: string; autoBrands: string; autoMinQty: string; autoBranches: string; note: string; status: Campaign['status'];
};
const emptyForm = (): Form => ({
  code: '', name: '', kind: 'cash', issuer: 'tgs', issuerPartnerCode: '', paymentMethodCode: '', faceValue: '', minOrder: '0',
  discountType: 'amount', discountPercent: '', maxDiscount: '', perCustomer: '', branchCodes: '', validFrom: today(), validTo: '', validDays: '',
  skus: '', brandCodes: '', issueMode: 'manual', autoSkus: '', autoBrands: '', autoMinQty: '1', autoBranches: '', note: '', status: 'active',
});
const toForm = (c: Campaign): Form => ({
  code: c.code, name: c.name, kind: c.kind, issuer: c.issuer, issuerPartnerCode: c.issuerPartnerCode ?? '', paymentMethodCode: c.paymentMethodCode ?? '',
  faceValue: c.discountType === 'percent' ? '' : String(c.faceValue), discountType: c.discountType ?? 'amount', discountPercent: c.discountPercent ? String(c.discountPercent) : '',
  maxDiscount: c.maxDiscount ? String(c.maxDiscount) : '', perCustomer: c.perCustomer ? String(c.perCustomer) : '', branchCodes: (c.branchCodes ?? []).join(','),
  minOrder: String(c.minOrder), validFrom: c.validFrom, validTo: c.validTo ?? '', validDays: c.validDays ? String(c.validDays) : '', skus: c.skus.join(', '), brandCodes: c.brandCodes.join(', '),
  issueMode: c.issueMode, autoSkus: c.autoRule?.skus.join(', ') ?? '', autoBrands: c.autoRule?.brandCodes.join(', ') ?? '', autoMinQty: String(c.autoRule?.minQty ?? 1),
  autoBranches: c.autoRule?.branches.join(', ') ?? '', note: c.note ?? '', status: c.status,
});
const toBody = (f: Form) => ({
  code: f.code.trim(), name: f.name.trim(), kind: f.kind, issuer: f.issuer, issuerPartnerCode: f.issuer === 'brand' ? f.issuerPartnerCode.trim() || null : null,
  paymentMethodCode: f.issuer === 'brand' ? f.paymentMethodCode.trim() || null : null, discountType: f.discountType,
  faceValue: f.discountType === 'amount' ? Number(f.faceValue) || 0 : null, discountPercent: f.discountType === 'percent' ? Number(f.discountPercent) || 0 : null,
  maxDiscount: f.discountType === 'percent' && Number(f.maxDiscount) > 0 ? Number(f.maxDiscount) : null, perCustomer: Number(f.perCustomer) > 0 ? Number(f.perCustomer) : null,
  branchCodes: list(f.branchCodes), minOrder: Number(f.minOrder) || 0,
  validFrom: f.validFrom, validTo: f.validTo || null, validDays: f.validDays ? Number(f.validDays) : null, skus: list(f.skus), brandCodes: list(f.brandCodes), issueMode: f.issueMode,
  autoRule: f.issueMode === 'auto' ? { skus: list(f.autoSkus), brandCodes: list(f.autoBrands), minQty: Number(f.autoMinQty) || 1, branches: list(f.autoBranches) } : null,
  note: f.note.trim() || null,
});

function CampaignForm({ initial, id, onClose }: { initial: Form; id?: string; onClose: () => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const [f, setF] = useState(initial);
  const [buoc, setBuoc] = useState(0);
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = useMutation({
    mutationFn: () => (id ? api.put(`${M}/campaigns/${id}`, { ...toBody(f), status: f.status }) : api.post(`${M}/campaigns`, toBody(f))),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['voucher'] }); onClose(); },
  });
  // Trợ lý — chỉ nhắc; máy chủ vẫn kiểm khi Lưu (nút Lưu không khoá theo các dòng này, như trước).
  const checks = [
    ...(f.code.trim() ? [] : ['Chưa nhập mã đợt']),
    ...(f.name.trim() ? [] : ['Chưa nhập tên đợt']),
    ...(f.discountType === 'amount' && !(Number(f.faceValue) > 0) ? ['Mệnh giá phải lớn hơn 0'] : []),
    ...(f.discountType === 'percent' && !(Number(f.discountPercent) > 0 && Number(f.discountPercent) <= 100) ? ['Phần trăm giảm phải từ trên 0 tới 100'] : []),
    ...(f.discountType === 'percent' && !(Number(f.maxDiscount) > 0) ? ['Voucher % chưa có Giảm tối đa — không trần thì đơn lớn giảm rất nhiều (vẫn lưu được)'] : []),
    ...(f.validFrom ? [] : ['Chưa chọn từ ngày']),
    ...(f.validTo && f.validFrom && f.validTo < f.validFrom ? ['Hết hạn trước từ ngày'] : []),
    ...(f.issuer === 'brand' && !f.issuerPartnerCode.trim() ? ['Hãng phát: chưa nhập mã hãng / NCC'] : []),
    ...(f.issuer === 'brand' && !f.paymentMethodCode.trim() ? ['Hãng phát: chưa nhập hình thức thanh toán'] : []),
  ];
  const vnd = (x: string) => (Number(x) || 0).toLocaleString('vi-VN');
  const scope = [...list(f.skus), ...list(f.brandCodes).map((b) => `nhãn ${b}`)];
  return (
    <FormPage title={<>{id ? <>Sửa đợt voucher <span className="mono">{initial.code}</span></> : 'Đợt phát voucher mới'}
        {id && <span className={`badge ${f.status === 'active' ? 'badge-ok' : 'badge-gray'}`} style={{ marginLeft: 8 }}>{f.status === 'active' ? 'Đang dùng' : 'Ngừng'}</span>}</>}
      sub={<>{f.discountType === 'percent' ? 'Giảm tối đa' : 'Mệnh giá'}: <b>{vnd(f.discountType === 'percent' ? f.maxDiscount : f.faceValue)}đ</b> · Ctrl + S ghi · Esc về danh sách</>}
      onBack={onClose} onSave={() => !save.isPending && save.mutate()}
      actions={<><button type="button" className="btn btn-primary" disabled={save.isPending} title="Ghi đợt (Ctrl + S)" onClick={() => save.mutate()}>Ghi</button><button type="button" className="btn" onClick={onClose}>Huỷ</button></>}
      note={save.error ? <span className="mh-bad">{errorText(save.error)}</span> : null}
      current={buoc} onStep={setBuoc} steps={[
        { label: 'Thông tin đợt', warn: checks.some((c) => /mã đợt|tên đợt/.test(c)) },
        { label: 'Thời gian & cửa hàng', warn: checks.some((c) => /ngày|Hết hạn/.test(c)) },
        { label: 'Giá trị & điều kiện', warn: checks.some((c) => /Mệnh giá|Phần trăm|Giảm tối đa|Hãng phát/.test(c)) },
        { label: 'Cách phát' },
      ]}
      aside={<div style={{ display: 'grid', gap: 10 }}>
        <DocSheetPanel title="Kiểm tra" badge={checks.length ? <span className="badge badge-warn">{checks.length}</span> : <span className="badge badge-ok">ổn</span>}>
          {checks.length ? checks.map((c) => <div key={c} className="mh-check warn">⚠ {c}</div>) : <div className="mh-check ok">✓ Đủ thông tin — bấm Lưu</div>}
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Đợt đã phát mã thì không đổi loại, người phát, mệnh giá / % / trần, đơn tối thiểu, phạm vi — lập đợt mới. Mỗi mã dùng một lần, phần dư mất.</div>
        </DocSheetPanel>
        <DocSheetPanel title="Tóm tắt">
          <div className="mh-kv">
            <span>Giá trị</span><span>{f.discountType === 'percent' ? `Giảm ${f.discountPercent || '…'}%${Number(f.maxDiscount) ? `, tối đa ${vnd(f.maxDiscount)}đ` : ', không trần'}` : `${vnd(f.faceValue)}đ`}</span>
            <span>Mỗi khách</span><span>{Number(f.perCustomer) ? `tối đa ${f.perCustomer} mã` : 'Không giới hạn'}</span>
            <span>Cửa hàng</span><span>{list(f.branchCodes).length ? list(f.branchCodes).join(', ') : 'Mọi cửa hàng'}</span>
            <span>Người phát</span><span>{f.issuer === 'brand' ? `Hãng ${f.issuerPartnerCode || '…'}` : 'TGS'}</span>
            <span>Đơn tối thiểu</span><span>{Number(f.minOrder) ? `${vnd(f.minOrder)}đ` : 'Không'}</span>
            <span>Áp dụng</span><span>{f.kind === 'next_purchase' ? (scope.length ? scope.join(', ') : '—') : 'Mọi hàng'}</span>
            <span>Hiệu lực</span><span>{f.validFrom || '…'} – {f.validTo || 'không hạn'}</span>
            <span>Hạn mỗi mã</span><span>{f.validDays ? `${f.validDays} ngày` : '—'}</span>
            <span>Số lượng</span><span>{f.issueMode === 'auto' ? `Tự phát khi mua ≥ ${f.autoMinQty || 1}` : 'Sinh / nạp mã ở chi tiết đợt'}</span>
          </div>
        </DocSheetPanel>
</div>}>
      {/* [2026-11-29 01:30 AM Võ Hoàng] NGHIEM-THU — NT-BH-063: 4 bước ngang như MH29 (thanh bước ở trên); các ô giữ nguyên, chỉ xếp theo bước (đóng góp) */}
      {buoc === 0 && (
        <FormGrid>
          <Field label="Mã đợt"><input className="input" value={f.code} onChange={set('code')} placeholder="ABBOTT50K" /></Field>
          <Field label="Tên đợt"><input className="input" value={f.name} onChange={set('name')} /></Field>
          <div><Field label="Loại">
            <select className="input" value={f.kind} onChange={set('kind')}>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </Field></div>
          {id ? (
            <Field label="Trạng thái">
              <select className="input" value={f.status} onChange={set('status')}><option value="active">Đang dùng</option><option value="stopped">Ngừng</option></select>
            </Field>
          ) : null}
          <div style={{ gridColumn: '1 / -1' }}><Field label="Ghi chú"><input className="input" value={f.note} onChange={set('note')} /></Field></div>
        </FormGrid>
      )}
      {buoc === 1 && (
        <FormGrid>
          <Field label="Từ ngày"><input className="input" type="date" value={f.validFrom} onChange={set('validFrom')} /></Field>
          <Field label="Hết hạn ngày"><input className="input" type="date" value={f.validTo} onChange={set('validTo')} /></Field>
          <div><Field label="Hạn mỗi mã (ngày từ ngày phát)"><input className="input" type="number" value={f.validDays} onChange={set('validDays')} /></Field></div>
          <Field label="Cửa hàng áp dụng" hint="Không chọn = mọi cửa hàng"><BranchCheckList value={f.branchCodes} onChange={(branchCodes) => setF({ ...f, branchCodes })} /></Field>
        </FormGrid>
      )}
      {buoc === 2 && (
        <FormGrid>
          <Field label="Người phát" hint="TGS = chiết khấu trên hoá đơn (giảm doanh thu + thuế); hãng = hình thức thanh toán (phải thu hãng)">
            <select className="input" value={f.issuer} onChange={set('issuer')}>{Object.entries(ISSUER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </Field>
          {f.issuer === 'brand' && <Field label="Hãng / NCC (mã đối tượng)"><input className="input" value={f.issuerPartnerCode} onChange={set('issuerPartnerCode')} /></Field>}
          {f.issuer === 'brand' && (
            <Field label="Hình thức thanh toán" hint="Kế toán khai tài khoản phải thu hãng ở Danh mục hình thức thanh toán">
              <input className="input" value={f.paymentMethodCode} onChange={set('paymentMethodCode')} placeholder="VC-ABBOTT" />
            </Field>
          )}
          <Field label="Loại giảm" hint="Giảm cố định = mệnh giá tiền; giảm % = phần trăm tổng đơn (tương đương tiền) hoặc tiền dòng áp dụng (lần mua sau)">
            <select className="input" value={f.discountType} onChange={set('discountType')} title="Kiểu giá trị của voucher"><option value="amount">Giảm cố định (đ)</option><option value="percent">Giảm %</option></select>
          </Field>
          {f.discountType === 'amount' && <Field label="Mệnh giá (đồng)"><input className="input" type="number" min={0} value={f.faceValue} onChange={set('faceValue')} title="Số tiền trừ tối đa của mỗi mã" /></Field>}
          {f.discountType === 'percent' && <Field label="Giảm (%)"><input className="input" type="number" min={0} max={100} step="0.5" value={f.discountPercent} onChange={set('discountPercent')} title="Phần trăm giảm, từ trên 0 tới 100" /></Field>}
          {f.discountType === 'percent' && <Field label="Giảm tối đa (đồng)" hint="Trần tiền giảm mỗi mã; trống = không trần"><input className="input" type="number" min={0} step={1000} value={f.maxDiscount} onChange={set('maxDiscount')} title="Trần tiền giảm của mỗi mã" /></Field>}
          <Field label="Mỗi khách dùng tối đa (mã)" hint="Đếm theo SĐT / mã khách của đơn; trống = không giới hạn"><input className="input" type="number" min={0} value={f.perCustomer} onChange={set('perCustomer')} title="Mỗi khách dùng tối đa bao nhiêu mã của đợt" /></Field>
          <Field label="Đơn tối thiểu (đồng)"><input className="input" type="number" value={f.minOrder} onChange={set('minOrder')} /></Field>
          {f.kind === 'next_purchase' && <Field label="Mã hàng áp dụng (cách nhau dấu phẩy)"><input className="input" value={f.skus} onChange={set('skus')} /></Field>}
          {f.kind === 'next_purchase' && <Field label="Nhãn áp dụng (mã nhãn)"><input className="input" value={f.brandCodes} onChange={set('brandCodes')} /></Field>}
        </FormGrid>
      )}
      {buoc === 3 && (
        <FormGrid>
          <Field label="Kiểu phát">
            <select className="input" value={f.issueMode} onChange={set('issueMode')}><option value="manual">Thủ công (sinh / nạp mã)</option><option value="auto">Tự động khi mua đủ điều kiện</option></select>
          </Field>
          {f.issueMode === 'auto' && <Field label="Điều kiện: mã hàng mua"><input className="input" value={f.autoSkus} onChange={set('autoSkus')} /></Field>}
          {f.issueMode === 'auto' && <Field label="Điều kiện: nhãn mua"><input className="input" value={f.autoBrands} onChange={set('autoBrands')} /></Field>}
          {f.issueMode === 'auto' && <Field label="Số lượng tối thiểu (đơn vị nhỏ nhất)"><input className="input" type="number" value={f.autoMinQty} onChange={set('autoMinQty')} /></Field>}
          <div><Field label="Cửa hàng tự phát" hint="Trống = mọi cửa hàng; dùng khi Kiểu phát = Tự động">
            <input className="input" value={f.autoBranches} disabled={f.issueMode !== 'auto'} onChange={set('autoBranches')} />
          </Field></div>
        </FormGrid>
      )}
    </FormPage>
  );
}

function IssueBox({ campaign }: { campaign: Campaign }) {
  const api = useApi();
  const qc = useQueryClient();
  const [mode, setMode] = useState<'generate' | 'import' | 'batch'>('generate');
  const [text, setText] = useState('');
  const [per, setPer] = useState('1');
  const [prefix, setPrefix] = useState(campaign.code.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase());
  const [qty, setQty] = useState('20');
  const run = useMutation({
    mutationFn: () => {
      if (mode === 'batch') return api.post<{ created: unknown[]; skipped: { row: number; reason: string }[] }>(`${M}/campaigns/${campaign.id}/batch`, { prefix: prefix.trim(), qty: Number(qty) || 0 });
      const rows = text.split(/\r?\n/).map((l) => l.split(/[\t,;]+/).map((x) => x.trim())).filter((r) => r[0]);
      return mode === 'generate'
        ? api.post<{ created: unknown[]; skipped: { row: number; reason: string }[] }>(`${M}/campaigns/${campaign.id}/generate`, { phones: rows.map((r) => r[0]), perPhone: Number(per) || 1 })
        : api.post<{ created: unknown[]; skipped: { row: number; reason: string }[] }>(`${M}/campaigns/${campaign.id}/import`, { items: rows.map((r) => ({ code: r[0], phone: r[1] ?? '' })) });
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['voucher'] }); setText(''); },
  });
  return (
    <div className="card card-body" style={{ marginBottom: 12 }}>
      <div className="row" style={{ gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Field label="Phát mã">
          <select className="input" value={mode} onChange={(e) => setMode(e.target.value as 'generate' | 'import' | 'batch')} title="Cách phát mã">
            <option value="generate">Sinh mã cho SĐT</option><option value="import">Nạp mã có sẵn</option><option value="batch">Sinh lô mã không gắn SĐT</option>
          </select>
        </Field>
        {mode === 'generate' && <Field label="Số mã mỗi SĐT"><input className="input" type="number" value={per} onChange={(e) => setPer(e.target.value)} style={{ width: 80 }} /></Field>}
        {mode === 'batch' && <Field label="Tiền tố"><input className="input" value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase())} style={{ width: 110 }} title="Chữ không dấu và số, tối đa 12 ký tự — mã = tiền tố + 8 ký tự ngẫu nhiên" /></Field>}
        {mode === 'batch' && <Field label="Số lượng mã"><input className="input" type="number" min={1} max={5000} value={qty} onChange={(e) => setQty(e.target.value)} style={{ width: 100 }} title="Tối đa 5.000 mã mỗi lần" /></Field>}
        <button type="button" className="btn btn-sm btn-primary" title="Phát mã theo cách đã chọn" disabled={(mode === 'batch' ? !(Number(qty) > 0) : !text.trim()) || run.isPending || campaign.status !== 'active'} onClick={() => run.mutate()}>Phát</button>
      </div>
      {mode === 'batch' ? (
        <p className="muted" style={{ marginTop: 6 }}>Mã lô không gắn khách: in / phát tay, ai cầm mã cũng dùng được (máy bán vẫn phải chọn khách để đếm giới hạn mỗi khách{campaign.perCustomer ? ` — đợt này tối đa ${campaign.perCustomer} mã / khách` : ''}). Danh sách mã ở bảng dưới, bấm Xuất Excel để in.</p>
      ) : (
        <textarea className="input" rows={4} style={{ width: '100%', marginTop: 6 }} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={mode === 'generate' ? 'Mỗi dòng một SĐT khách (dán cột từ Excel)' : 'Mỗi dòng: MÃ <tab hoặc dấu phẩy> SĐT khách (dán hai cột từ Excel)'} />
      )}
      <ErrorBox error={run.error ? errorText(run.error) : null} />
      {run.data && (
        <p className="muted">Đã phát {run.data.created.length} mã{run.data.skipped.length ? `; bỏ qua ${run.data.skipped.length}: ${run.data.skipped.slice(0, 10).map((s) => `dòng ${s.row} (${s.reason})`).join('; ')}` : ''}</p>
      )}
    </div>
  );
}

function CampaignDetail({ campaign, onClose, onEdit }: { campaign: Campaign; onClose: () => void; onEdit: () => void }) {
  const api = useApi();
  const can = useCan();
  const codes = useQuery({ queryKey: ['voucher', 'codes', campaign.id], queryFn: () => api.get<Code[]>(`${M}/codes`, { campaignId: campaign.id }) });
  return (
    <Modal title={`${campaign.code} · ${campaign.name}`} onClose={onClose} wide footer={<>{can('voucher:write') && <button type="button" className="btn" onClick={onEdit}>Sửa / ngừng</button>}<button type="button" className="btn" onClick={onClose}>Đóng</button></>}>
      <p className="muted">
        {KIND[campaign.kind]} · {campaign.issuer === 'brand' ? `Hãng ${campaign.issuerPartnerCode} — thanh toán ${campaign.paymentMethodCode}` : 'TGS — chiết khấu'} · {campaign.discountType === 'percent' ? valueText(campaign) : `mệnh giá ${vndText(campaign.faceValue)}`}
        {campaign.perCustomer ? ` · mỗi khách tối đa ${campaign.perCustomer} mã` : ''}{campaign.branchCodes?.length ? ` · cửa hàng ${campaign.branchCodes.join(', ')}` : ''}
        {campaign.minOrder ? ` · đơn tối thiểu ${campaign.minOrder.toLocaleString('vi-VN')}đ` : ''} · từ {campaign.validFrom}{campaign.validTo ? ` đến ${campaign.validTo}` : ''}
        {campaign.skus.length || campaign.brandCodes.length ? ` · áp dụng ${[...campaign.skus, ...campaign.brandCodes.map((b) => `nhãn ${b}`)].join(', ')}` : ''}
        {campaign.autoRule ? ` · tự phát khi mua ${[...campaign.autoRule.skus, ...campaign.autoRule.brandCodes.map((b) => `nhãn ${b}`)].join(', ')} ≥ ${campaign.autoRule.minQty}` : ''}
      </p>
      {can('voucher:write') && campaign.issueMode === 'manual' && <IssueBox campaign={campaign} />}
      {codes.isLoading ? <Loading /> : codes.error ? <ErrorBox error={errorText(codes.error)} /> : (
        <DataGrid rows={codes.data ?? []} columns={codeCols} rowKey={(r) => r.code} storageKey="voucher.codes" maxHeight="40vh"
          exportName={`voucher-${campaign.code}`} exportTitle={`Mã voucher đợt ${campaign.code}`} emptyText="Chưa phát mã" />
      )}
    </Modal>
  );
}

function CampaignTab() {
  const api = useApi();
  const can = useCan();
  const q = useQuery({ queryKey: ['voucher', 'campaigns'], queryFn: () => api.get<Campaign[]>(`${M}/campaigns`) });
  const [pick, setPick] = useState<Campaign | null>(null);
  const [sel, setSel] = useState<Campaign | null>(null);
  const [form, setFormState] = useState<{ initial: Form; id?: string } | null>(null);
  const [dot, setDot] = useFormParam('dot');
  const setForm = (x: { initial: Form; id?: string } | null) => { setFormState(x); setDot(x ? x.id ?? 'moi' : null); };
  // Back của trình duyệt (URL hết ?dot) → về danh sách; tải lại khi đang mở form → mở lại đúng đợt.
  const reopened = useRef(false);
  useEffect(() => {
    if (!dot) { if (form) setFormState(null); return; }
    if (form || reopened.current || !q.data) return;
    reopened.current = true;
    if (!can('voucher:write')) return setDot(null);
    if (dot === 'moi') return setForm({ initial: emptyForm() });
    const c = q.data.find((x) => x.id === dot);
    if (c) setForm({ initial: toForm(c), id: c.id }); else setDot(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy khi URL / dữ liệu đổi
  }, [dot, q.data]);
  if (form) return <CampaignForm initial={form.initial} {...(form.id ? { id: form.id } : {})} onClose={() => { setForm(null); setPick(null); }} />;
  return (
    <section className="card">
      <div className="catalog-toolbar">
        {can('voucher:write') && <button type="button" className="btn btn-sm btn-primary" title="Lập đợt phát voucher mới" onClick={() => setForm({ initial: emptyForm() })}>+ Thêm đợt</button>}
        <button type="button" className="btn btn-sm" disabled={!sel} title={sel ? 'Xem đợt đang chọn: mã đã phát, phát thêm mã (bấm đúp dòng cũng mở)' : 'Chọn một đợt ở bảng dưới'} onClick={() => sel && setPick(sel)}>Xem / phát mã</button>
        {can('voucher:write') && <button type="button" className="btn btn-sm" disabled={!sel} title={sel ? 'Sửa / ngừng đợt đang chọn' : 'Chọn một đợt ở bảng dưới'} onClick={() => sel && setForm({ initial: toForm(sel), id: sel.id })}>Sửa</button>}
        <button type="button" className="btn btn-sm btn-nap" disabled={q.isFetching} title="Nạp lại danh sách đợt" onClick={() => void q.refetch()}>{q.isFetching ? 'Đang nạp…' : '⟳ Nạp'}</button>
      </div>
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={errorText(q.error)} /> : (
        <DataGrid rows={q.data ?? []} columns={campaignCols} rowKey={(r) => r.id} storageKey="voucher.campaigns" onRowClick={setSel} onRowDoubleClick={setPick}
          exportName="dot-phat-voucher" exportTitle="Đợt phát voucher" emptyText='Chưa có đợt phát — bấm "+ Thêm đợt"' />
      )}
      {pick && !form && <CampaignDetail campaign={(q.data ?? []).find((c) => c.id === pick.id) ?? pick} onClose={() => setPick(null)} onEdit={() => setForm({ initial: toForm(pick), id: pick.id })} />}
    </section>
  );
}

type LogRow = { action: string; source: string | null; refCode: string | null; branchCode: string | null; amount: number | null; note: string | null; at: string };
type CodeDetail = Code & { campaign: { code: string; name: string; issuer: string; faceValue: number; discountType?: string; discountPercent?: number | null; maxDiscount?: number | null }; log: LogRow[] };
const ACTION: Record<string, string> = { issue: 'Phát', use: 'Dùng', release: 'Trả lại', revoke: 'Thu hồi', conflict: 'Dùng trùng', return: 'Trả hàng đơn gốc' };
const logCols: GridColumn<LogRow>[] = [
  { key: 'at', header: 'Lúc', width: 160, value: (r) => r.at.replace('T', ' ').slice(0, 19) },
  { key: 'action', header: 'Việc', width: 100, value: (r) => ACTION[r.action] ?? r.action },
  { key: 'refCode', header: 'Đơn / phiếu', width: 130 },
  { key: 'branchCode', header: 'Cửa hàng', width: 90 },
  { key: 'amount', header: 'Tiền', type: 'money', width: 100 },
  { key: 'note', header: 'Ghi chú', width: 280 },
];

function LookupTab() {
  const api = useApi();
  const qc = useQueryClient();
  const can = useCan();
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('');
  const [find, setFind] = useState<{ code?: string; phone?: string }>({});
  const one = useQuery({ queryKey: ['voucher', 'code', find.code], enabled: Boolean(find.code), queryFn: () => api.get<CodeDetail>(`${M}/codes/${encodeURIComponent(find.code!)}`) });
  const many = useQuery({ queryKey: ['voucher', 'phone', find.phone], enabled: Boolean(find.phone), queryFn: () => api.get<Code[]>(`${M}/codes`, { phone: find.phone }) });
  const revoke = useMutation({
    mutationFn: (reason: string) => api.post(`${M}/codes/${encodeURIComponent(find.code!)}/revoke`, { reason }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['voucher'] }); },
  });
  const d = one.data;
  return (
    <div>
      <section className="card card-body">
        <div className="row" style={{ gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Field label="Mã voucher"><input className="input" value={code} title="Gõ mã in trên voucher, Enter để tra" onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && code.trim()) setFind({ code: code.trim().toUpperCase() }); }} /></Field>
          <button type="button" className="btn btn-sm btn-primary" title="Xem đợt, khách, hạn, nơi dùng, nhật ký của mã" onClick={() => setFind({ code: code.trim().toUpperCase() })} disabled={!code.trim()}>Tra mã</button>
          <span style={{ width: 16 }} />
          <Field label="SĐT khách"><input className="input" value={phone} title="SĐT khách, Enter để xem mọi mã của khách" onChange={(e) => setPhone(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && phone.trim()) setFind({ phone: phone.trim() }); }} /></Field>
          <button type="button" className="btn btn-sm" title="Mọi mã voucher gắn SĐT này" onClick={() => setFind({ phone: phone.trim() })} disabled={!phone.trim()}>Mã của khách</button>
        </div>
      </section>
      {find.code && (one.isLoading ? <Loading /> : one.error ? <ErrorBox error={errorText(one.error)} /> : d && (
        <section className="card">
          <div className="card-body" style={{ paddingBottom: 6 }}>
          <p style={{ margin: 0 }}>
            <b>{d.code}</b> {stateBadge(d.state)} · đợt {d.campaign.code} ({d.campaign.name}) · {d.campaign.issuer === 'brand' ? 'hãng phát' : 'TGS phát'} · {valueText(d.campaign)}
            · SĐT {d.phone ?? 'không gắn (mã lô)'}{d.usedPhone ? ` · khách dùng ${d.usedPhone}` : ''} · hạn {d.expiresOn ?? 'không hạn'}
          </p>
          {d.usedRefCode && <p>Đã dùng ở {d.usedSource === 'phieu-ban' ? 'phiếu' : 'đơn'} <b>{d.usedRefCode}</b> ngày {d.usedOn} tại {d.usedBranch} — trừ {(d.usedAmount ?? 0).toLocaleString('vi-VN')}đ</p>}
          {d.revokeReason && <p>Thu hồi: {d.revokeReason}</p>}
          {can('voucher:write') && d.state === 'active' && (
            <button type="button" className="btn btn-xs" onClick={() => { const r = window.prompt('Lý do thu hồi'); if (r) revoke.mutate(r); }}>Thu hồi</button>
          )}
          <ErrorBox error={revoke.error ? errorText(revoke.error) : null} />
          </div>
          <DataGrid rows={d.log} columns={logCols} rowKey={(r, i) => `${r.at}-${i}`} storageKey="voucher.log" maxHeight="30vh" exportName={`nhat-ky-${d.code}`} />
        </section>
      ))}
      {find.phone && (many.isLoading ? <Loading /> : many.error ? <ErrorBox error={errorText(many.error)} /> : (
        <section className="card">
          <div className="card-body" style={{ paddingBottom: 0 }}><b>Mã của khách {find.phone}</b></div>
          <DataGrid rows={many.data ?? []} columns={codeCols} rowKey={(r) => r.code} storageKey="voucher.codes-phone" exportName={`voucher-${find.phone}`} emptyText="Khách chưa có voucher" />
        </section>
      ))}
    </div>
  );
}

type RepCampaign = { campaignId: string; code: string; name: string; issuer: string; issuerPartnerCode: string | null; kind: string; faceValue: number;
  discountType?: string; discountPercent?: number | null; maxDiscount?: number | null } & Counts & { usedAmount: number };
type RepBranch = { campaignId: string; code: string; name: string; issuer: string; branchCode: string; source: string; used: number; usedAmount: number };
const issuerText = (r: { issuer: string; issuerPartnerCode?: string | null }) => (r.issuer === 'brand' ? `Hãng ${r.issuerPartnerCode ?? ''}` : 'TGS');
const repCols: GridColumn<RepCampaign>[] = [
  { key: 'code', header: 'Mã đợt', type: 'code', width: 120 },
  { key: 'name', header: 'Tên đợt', width: 200 },
  { key: 'issuer', header: 'Người phát', width: 130, value: issuerText },
  { key: 'faceValue', header: <span title="Mệnh giá tiền, hoặc giảm % kèm trần">Giá trị</span>, width: 170, value: (r) => valueText(r) },
  { key: 'issued', header: 'Phát hành', type: 'number', sum: true, width: 90 },
  { key: 'used', header: 'Đã dùng', type: 'number', sum: true, width: 80 },
  { key: 'active', header: 'Còn', type: 'number', sum: true, width: 70 },
  { key: 'expired', header: 'Hết hạn', type: 'number', sum: true, width: 80 },
  { key: 'revoked', header: 'Thu hồi', type: 'number', sum: true, width: 80 },
  { key: 'usedAmount', header: 'Tiền đã trừ', type: 'money', sum: true, width: 120 },
];
const branchCols: GridColumn<RepBranch>[] = [
  { key: 'code', header: 'Mã đợt', type: 'code', width: 120 },
  { key: 'name', header: 'Tên đợt', width: 200 },
  { key: 'issuer', header: 'Người phát', width: 100, value: issuerText },
  { key: 'branchCode', header: 'Cửa hàng', type: 'code', width: 90 },
  { key: 'source', header: 'Nơi dùng', width: 110, value: (r) => (r.source === 'phieu-ban' ? 'Phiếu bán BH10' : 'Máy bán') },
  { key: 'used', header: 'Số mã dùng', type: 'number', sum: true, width: 100 },
  { key: 'usedAmount', header: 'Tiền đã trừ', type: 'money', sum: true, width: 120 },
];

function ReportTab() {
  const api = useApi();
  const [draft, setDraft] = useState({ from: `${today().slice(0, 8)}01`, to: today(), issuer: '', branches: '' });
  const [f, setF] = useState(draft);
  const q = useQuery({ queryKey: ['voucher', 'report', f], queryFn: () => api.get<{ campaigns: RepCampaign[]; byBranch: RepBranch[] }>(`${M}/report`, Object.fromEntries(Object.entries(f).filter(([, v]) => v))) });
  return (
    <FilterLayout onSearch={() => setF(draft)} filters={<>
      <Field label="Từ ngày"><input className="input" type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} /></Field>
      <Field label="Đến ngày"><input className="input" type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} /></Field>
      <Field label="Người phát">
        <select className="input" value={draft.issuer} onChange={(e) => setDraft({ ...draft, issuer: e.target.value })}><option value="">Tất cả</option><option value="tgs">TGS</option><option value="brand">Hãng / NCC</option></select>
      </Field>
      <Field label="Cửa hàng"><BranchCheckList value={draft.branches} onChange={(branches) => setDraft({ ...draft, branches })} /></Field>
    </>}>
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={errorText(q.error)} /> : (
        <>
          <section className="card">
            <div className="card-body" style={{ paddingBottom: 0 }}><b title="Đếm mã phát trong kỳ (ngày phát)">Theo đợt phát</b></div>
            <DataGrid rows={q.data?.campaigns ?? []} columns={repCols} rowKey={(r) => r.campaignId} storageKey="voucher.report" maxHeight="36vh"
              exportName="bao-cao-voucher" exportTitle={`Báo cáo voucher theo đợt ${f.from} – ${f.to}`} emptyText="Không có đợt phát" />
          </section>
          <section className="card">
            <div className="card-body" style={{ paddingBottom: 0 }}><b title="Đếm mã dùng trong kỳ (ngày bán)">Đã dùng theo cửa hàng</b></div>
            <DataGrid rows={q.data?.byBranch ?? []} columns={branchCols} rowKey={(r) => `${r.campaignId}|${r.branchCode}|${r.source}`} storageKey="voucher.report.branch" maxHeight="30vh"
              exportName="voucher-theo-cua-hang" exportTitle={`Voucher đã dùng theo cửa hàng ${f.from} – ${f.to}`} emptyText="Chưa có voucher dùng trong kỳ" />
          </section>
        </>
      )}
      <p className="muted" style={{ marginTop: 8 }}>Phần theo đợt đếm mã phát trong kỳ (ngày phát); phần theo cửa hàng đếm mã dùng trong kỳ (ngày bán). Còn / hết hạn tính tới hôm nay.</p>
    </FilterLayout>
  );
}

type Tab = 'dot' | 'tra-cuu' | 'bao-cao';
const TABS: [Tab, string][] = [['dot', 'Đợt phát'], ['tra-cuu', 'Tra cứu mã'], ['bao-cao', 'Báo cáo']];

export function VoucherPage() {
  const [tab, setTab] = useState<Tab>('dot');
  return (
    <div>
      <PageHeader title="Voucher" code="BH21" subtitle="Voucher tương đương tiền / lần mua sau sản phẩm – nhãn; mệnh giá hoặc giảm % có trần; TGS hoặc hãng phát; gắn SĐT khách hoặc lô mã; dùng một lần (voucher đổi điểm ở Điểm thành viên; mã giảm giá chung cho mọi khách khai ở Khuyến mại BH18)" />
      <div className="tabs" role="tablist" style={{ margin: '8px 0' }}>
        {TABS.map(([k, label]) => <button key={k} type="button" role="tab" className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{label}</button>)}
      </div>
      {tab === 'dot' && <CampaignTab />}
      {tab === 'tra-cuu' && <LookupTab />}
      {tab === 'bao-cao' && <ReportTab />}
    </div>
  );
}
