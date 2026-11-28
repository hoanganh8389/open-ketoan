// [2026-11-29 01:30 AM Võ Hoàng] NGHIEM-THU — NT-BH-063: form khuyến mại chia bước như MH29 nhưng thanh bước nằm NGANG ở trên (màn nhỏ); vẽ bằng lớp
// .nx-steps của khung giao diện (cùng kiểu Steps của ui-kit — TI14 / TI15), thêm bấm chuyển bước + dấu ⚠ bước còn lỗi; không thêm CSS (đóng góp)
import type { KeyboardEvent } from 'react';

export interface Buoc { label: string; /** Bước còn ô sai / thiếu → hiện ⚠ cạnh tên. */ warn?: boolean }

/** Trạng thái hiển thị một bước (thuần — test không cần React). */
export function buocState(i: number, current: number): 'on' | 'xong' | 'cho' {
  return i === current ? 'on' : i < current ? 'xong' : 'cho';
}

export function ThanhBuoc({ steps, current, onPick }: { steps: Buoc[]; current: number; onPick: (i: number) => void }) {
  const key = (e: KeyboardEvent, i: number) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(i); }
    if (e.key === 'ArrowRight' && i < steps.length - 1) { e.preventDefault(); onPick(i + 1); }
    if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); onPick(i - 1); }
  };
  return (
    <div className="nx-steps" role="tablist" aria-label="Các bước">
      {steps.map((s, i) => {
        const st = buocState(i, current);
        return (
          <span key={s.label} role="tab" tabIndex={0} aria-selected={st === 'on'} className={st === 'cho' ? undefined : st} style={{ cursor: 'pointer' }}
            title={s.warn ? `${s.label} — còn ô chưa đúng` : s.label} onClick={() => onPick(i)} onKeyDown={(e) => key(e, i)}>
            <b>{i + 1}</b>{s.label}{s.warn ? ' ⚠' : ''}
          </span>
        );
      })}
    </div>
  );
}

/** Nút chuyển bước ở cuối nội dung mỗi bước. */
export function NutBuoc({ current, total, onPick }: { current: number; total: number; onPick: (i: number) => void }) {
  return (
    <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
      {current > 0 && <button type="button" className="btn btn-sm" onClick={() => onPick(current - 1)}>← Bước trước</button>}
      {current < total - 1 && <button type="button" className="btn btn-sm btn-primary" onClick={() => onPick(current + 1)}>Bước tiếp →</button>}
    </div>
  );
}
