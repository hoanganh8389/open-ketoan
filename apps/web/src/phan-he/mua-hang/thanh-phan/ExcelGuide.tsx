/**
 * Hướng dẫn cột cho mọi chức năng NHẬP EXCEL của phân hệ Mua hàng: bảng các cột (bắt buộc hay không, tên khác được chấp nhận,
 * ví dụ, ý nghĩa) + nút "Tải file mẫu" (đúng tiêu đề, có dòng ví dụ). Phần mềm nhận cột theo TÊN TIÊU ĐỀ, thứ tự cột tuỳ ý.
 */
import { useState } from 'react';
import { ChevronDown, ChevronRight, FileDown } from 'lucide-react';

export interface GuideColumn { name: string; required?: boolean; aliases?: string; example: string | number; note: string }

// [2026-11-25 kiennt] NT-MH-006 — tuỳ chọn `mau`: tệp mẫu có sẵn dòng dữ liệu (vd mọi mặt hàng) thay dòng ví dụ (đóng góp)
export function ExcelGuide({ columns, file, sheet = 'Mau', defaultOpen = true, mau }: { columns: GuideColumn[]; file: string; sheet?: string; defaultOpen?: boolean; mau?: () => Promise<(string | number)[][]> }) {
  const [open, setOpen] = useState(defaultOpen);
  const [busy, setBusy] = useState(false);
  const template = async () => {
    setBusy(true);
    try {
      const XLSX = await import('@/lib/excelChuan').then((m) => m.xlsxChuan()); // [2026-11-11 Nguyễn Văn Thủy] xuất Excel định dạng chuẩn (đóng góp)
      const body = mau ? await mau() : [columns.map((c) => c.example)];
      const ws = XLSX.utils.aoa_to_sheet([columns.map((c) => c.name), ...body]);
      ws['!cols'] = columns.map((c) => ({ wch: Math.max(12, c.name.length + 4) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheet);
      XLSX.writeFile(wb, file);
    } catch (e) {
      window.alert(`Không tạo được tệp mẫu: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  };
  return (
    <div className="mh-guide-box">
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <button type="button" className="btn btn-xs btn-ghost" onClick={() => setOpen((x) => !x)}>{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Hướng dẫn các cột ({columns.filter((c) => c.required).length} bắt buộc, {columns.length} cột)</button>
        <button type="button" className="btn btn-xs" disabled={busy} onClick={() => void template()}><FileDown size={13} /> {busy ? 'Đang tạo…' : 'Tải file mẫu'}</button>
        <span className="muted" style={{ fontSize: 12 }}>Phần mềm nhận cột theo tên tiêu đề (không phân biệt hoa thường, có dấu / không dấu), thứ tự cột tuỳ ý, cột khác bỏ qua.</span>
      </div>
      {open && (
        <table className="mh-mini" style={{ marginTop: 6 }}>
          <thead><tr><th>Cột</th><th>Bắt buộc</th><th>Tên khác được nhận</th><th>Ví dụ</th><th>Ý nghĩa</th></tr></thead>
          <tbody>{columns.map((c) => <tr key={c.name}><td><b>{c.name}</b></td><td>{c.required ? <span className="badge badge-bad">bắt buộc</span> : <span className="muted">không</span>}</td><td className="muted" style={{ fontSize: 12 }}>{c.aliases ?? ''}</td><td className="mono">{String(c.example)}</td><td style={{ fontSize: 12.5 }}>{c.note}</td></tr>)}</tbody>
        </table>
      )}
    </div>
  );
}
