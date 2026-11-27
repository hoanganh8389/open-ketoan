// [2026-11-28 03:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-059: ô "Áp dụng cho" — Tất cả cửa hàng / Chọn cửa hàng (tìm + tích) như BH18 (đóng góp)
/**
 * "Tất cả cửa hàng" là trạng thái riêng: chọn nó thì danh sách khoá; chuyển sang "Chọn cửa hàng" thì bắt đầu từ các ô đã tích (không tự
 * tích hết — sửa lỗi ô cũ của BH18). Tất cả = mọi cửa hàng đang hoạt động lúc ghi; cửa hàng mở sau phải áp lại.
 */
import { useState } from 'react';
import { Err } from './parts';
import type { Branch, FieldErrors, Target } from './model';

type Props = { branches: Branch[]; value: Target; onChange: (t: Target) => void; errs: FieldErrors; disabled?: boolean; name: string };

export function ApDungCho({ branches, value, onChange, errs, disabled, name }: Props) {
  const [q, setQ] = useState('');
  const key = q.trim().toLowerCase();
  const shown = branches.filter((b) => !key || `${b.code} ${b.name}`.toLowerCase().includes(key));
  const set = new Set(value.branchCodes);
  const toggle = (c: string, on: boolean) => onChange({ all: false, branchCodes: on ? [...value.branchCodes, c] : value.branchCodes.filter((x) => x !== c) });
  return (
    <div style={{ display: 'grid', gap: 6 }} data-field="target">
      <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }} title="Mọi cửa hàng đang hoạt động lúc ghi (cửa hàng mở sau phải áp lại)">
          <input type="radio" name={`${name}-ap`} checked={value.all} disabled={disabled} onChange={() => onChange({ all: true, branchCodes: [] })} /> Tất cả cửa hàng ({branches.length})
        </label>
        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }} title="Chỉ các cửa hàng tích bên dưới; cửa hàng bỏ tích sẽ ngừng chương trình">
          <input type="radio" name={`${name}-ap`} checked={!value.all} disabled={disabled} onChange={() => onChange({ all: false, branchCodes: value.branchCodes })} /> Chọn cửa hàng
        </label>
        {!value.all && <span className="muted">Đã chọn {value.branchCodes.length} / {branches.length}</span>}
      </div>
      {!value.all && (
        <div style={{ display: 'grid', gap: 4 }}>
          <div className="row" style={{ gap: 6 }}>
            <input className="input" style={{ width: 240 }} placeholder="Tìm mã / tên cửa hàng…" value={q} disabled={disabled} onChange={(e) => setQ(e.target.value)} />
            <button type="button" className="btn btn-xs" disabled={disabled || !shown.length} title="Tích mọi cửa hàng đang hiện"
              onClick={() => onChange({ all: false, branchCodes: [...new Set([...value.branchCodes, ...shown.map((b) => b.code)])] })}>Chọn hết đang hiện</button>
            <button type="button" className="btn btn-xs" disabled={disabled || !value.branchCodes.length} onClick={() => onChange({ all: false, branchCodes: [] })}>Bỏ chọn hết</button>
          </div>
          <div style={{ maxHeight: 180, overflow: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 2, padding: 6, border: '1px solid var(--line-soft, #e3e8ee)', borderRadius: 6 }}>
            {shown.map((b) => (
              <label key={b.code} className="checkbox" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" name={`${name}-cn`} value={b.code} checked={set.has(b.code)} disabled={disabled} onChange={(e) => toggle(b.code, e.target.checked)} /> {b.code} {b.name}
              </label>
            ))}
            {!shown.length && <span className="muted">Không có cửa hàng khớp.</span>}
          </div>
          {!value.branchCodes.length && <span className="mh-bad" style={{ color: 'var(--bad, #dc2626)' }}>Chọn ít nhất một cửa hàng, hoặc chọn Tất cả cửa hàng.</span>}
        </div>
      )}
      <Err errs={errs} path="target" />
    </div>
  );
}
