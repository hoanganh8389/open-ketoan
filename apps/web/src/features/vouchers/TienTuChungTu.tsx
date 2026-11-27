// [2026-11-28 Võ Hoàng] NGHIEM-THU — NT-BH-052: ACC51 / ACC54 hiện tiền vào / ra từ chứng từ bán, trả hàng, thu tiền khách… (đóng góp)
/**
 * Khung "Tiền từ chứng từ khác" dưới danh sách phiếu thu chi (ACC51) / tiền gửi (ACC54): đơn bán máy POS, phiếu bán BH10, phiếu trả,
 * thu tiền khách, chi trả NCC… ghi tiền ngay trong bút toán của chính chứng từ (không có phiếu thu / báo có riêng) — đọc từ sổ cái
 * qua GET /api/v1/cash-movements (số ròng theo chứng từ: dương = thu, âm = chi). Chỉ xem: bấm đúp mở chứng từ gốc.
 * Gắn ở pages.tsx dưới màn ACC51 / ACC54 (không sửa CashVouchersPage — tệp thuộc dòng giữ chỗ khác): có khoảng ngày + chi nhánh riêng,
 * mặc định theo kỳ đang nhớ (cùng kỳ danh sách phiếu mở ra).
 */
import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { DataGrid, type Column } from '@/components/DataGrid';
import { ErrorBox, Loading } from '@/components/ui';
import { DocumentDetail } from '@/features/documents/DocumentDetail';
import { BranchSelect, DateRange } from '@/components/filters';
import { defaultFrom, today } from '@/lib/format';

export interface CashMovement {
  id: string; docType: string; docNo: string; docDate: string; branchCode: string; branchName: string; partnerCode: string | null;
  partnerName: string | null; description: string | null; sourceSystem: string | null; accounts: string; thu: number; chi: number;
}

const LOAI: Record<string, string> = {
  sale: 'Bán hàng', sale_return: 'Hàng bán trả lại', customer_payment: 'Thu tiền khách', supplier_payment: 'Trả tiền NCC', purchase: 'Mua hàng',
  purchase_return: 'Trả hàng NCC', cash_transfer: 'Chuyển tiền', manual: 'Phiếu kế toán', stock_adjustment: 'Điều chỉnh kho',
};

export function TienTuChungTu({ kind }: { kind: 'cash' | 'bank' }) {
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(today());
  const [branchCodes, setBranchCodes] = useState('');
  const q = useQuery({
    queryKey: ['cash-movements', kind, from, to, branchCodes],
    queryFn: () => api.get<CashMovement[]>('/api/v1/cash-movements', { kind, from, to, ...(branchCodes ? { branchCodes } : {}) }),
    placeholderData: keepPreviousData,
  });
  const [mo, setMo] = useState<string | null>(null);
  const rows = q.data ?? [];
  const thu = rows.reduce((s, r) => s + r.thu, 0);
  const chi = rows.reduce((s, r) => s + r.chi, 0);
  const tk = kind === 'cash' ? '111' : '112';
  const columns: Column<CashMovement>[] = [
    { key: 'docType', header: 'Loại chứng từ', title: 'Loại chứng từ ghi tiền', width: 140, value: (r) => LOAI[r.docType] ?? r.docType },
    { key: 'docDate', header: 'Ngày hạch toán', title: 'Ngày chứng từ', type: 'date', width: 104 },
    { key: 'docNo', header: 'Số chứng từ', title: 'Số chứng từ gốc (bấm đúp để mở)', type: 'code', width: 150 },
    { key: 'description', header: 'Diễn giải', title: 'Diễn giải của chứng từ', width: 260 },
    { key: 'thu', header: kind === 'cash' ? 'Thu' : 'Tiền vào', title: `Tiền vào TK ${tk} (Nợ ròng)`, type: 'money', sum: true, width: 130 },
    { key: 'chi', header: kind === 'cash' ? 'Chi' : 'Tiền ra', title: `Tiền ra TK ${tk} (Có ròng)`, type: 'money', sum: true, width: 130 },
    { key: 'accounts', header: 'Tài khoản tiền', title: `Tài khoản ${tk}x của chứng từ`, type: 'code', width: 110 },
    { key: 'partnerCode', header: 'Đối tượng', title: 'Mã khách / NCC', type: 'code', width: 120 },
    { key: 'partnerName', header: 'Tên đối tượng', title: 'Tên khách / NCC', width: 200 },
    { key: 'branchCode', header: 'Chi nhánh', title: 'Chi nhánh của chứng từ', type: 'code', width: 100 },
    { key: 'sourceSystem', header: 'Nguồn', title: 'Hệ thống lập chứng từ (máy bán, kế toán…)', width: 100, hidden: true },
  ];
  return (
    <section className="card" style={{ marginTop: 12 }}>
      <div className="card-body" style={{ paddingBottom: 6 }}>
        <b title={`Chứng từ ghi tiền thẳng vào TK ${tk} trong bút toán của chính nó (không có ${kind === 'cash' ? 'phiếu thu / chi' : 'giấy báo có / nợ'} riêng)`}>
          Tiền {kind === 'cash' ? 'mặt' : 'gửi'} từ chứng từ khác — bán hàng, trả hàng, thu tiền khách…
        </b>
        <span className="muted"> · chỉ xem, đọc từ sổ cái; thu {thu.toLocaleString('vi-VN')} · chi {chi.toLocaleString('vi-VN')}; bấm đúp mở chứng từ</span>
        <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <DateRange from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} />
          <BranchSelect value={branchCodes} onChange={setBranchCodes} />
        </div>
      </div>
      <ErrorBox error={q.error ? errorText(q.error) : null} />
      {q.isLoading ? <Loading /> : (
        <DataGrid rows={rows} columns={columns} rowKey={(r) => r.id} storageKey={`tien-tu-chung-tu-${kind}-v1`} exportName={`tien-${kind}-tu-chung-tu-${from}-${to}`}
          maxHeight="320px" footerLabel="Cộng" emptyText="Không có chứng từ bán / trả / thu tiền khách ghi tiền trong khoảng này" onRowDoubleClick={(r) => setMo(r.id)} />
      )}
      {mo && <DocumentDetail id={mo} onClose={() => setMo(null)} />}
    </section>
  );
}
