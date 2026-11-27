// [2026-11-25 09:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-039: ô nhập dùng chung (tô đỏ + lời nhắc đúng ô theo lỗi máy chủ) (đóng góp)
import type { CSSProperties, ReactNode } from 'react';
import { bad, type FieldErrors } from './model';

/** Lời nhắc lỗi dưới ô (máy chủ trả theo đường dẫn ô). */
export const Err = ({ errs, path }: { errs: FieldErrors; path: string }) =>
  errs[path] ? <small data-field={path} style={{ color: 'var(--bad, #dc2626)', display: 'block' }}>{errs[path]}</small> : null;

type InProps = { errs: FieldErrors; path: string; disabled?: boolean; width?: number; title?: string; placeholder?: string };

export function TextIn({ value, onChange, ...p }: InProps & { value: string; onChange: (v: string) => void }) {
  const style: CSSProperties = { width: p.width ?? 140, ...bad(p.errs, p.path) };
  return <span><input className="input" name={p.path} style={style} value={value} disabled={p.disabled} title={p.title} placeholder={p.placeholder} onChange={(e) => onChange(e.target.value)} /><Err errs={p.errs} path={p.path} /></span>;
}

export function NumIn({ value, onChange, ...p }: InProps & { value: number | undefined; onChange: (v: number) => void }) {
  const style: CSSProperties = { width: p.width ?? 90, textAlign: 'right', ...bad(p.errs, p.path) };
  return (
    <span>
      <input className="input" name={p.path} type="number" style={style} value={value ?? ''} disabled={p.disabled} title={p.title} placeholder={p.placeholder}
        onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))} />
      <Err errs={p.errs} path={p.path} />
    </span>
  );
}

// [2026-11-27 Võ Hoàng] NGHIEM-THU — NT-BH-051: khối dùng lớp card / card-body của Core (tiêu đề + nút bên phải) thay fieldset tự vẽ (đóng góp)
export const Box = ({ title, children, actions }: { title: ReactNode; children: ReactNode; actions?: ReactNode }) => (
  <section className="card">
    <div className="card-body" style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <b>{title}</b>
        {actions && <><span style={{ flex: 1 }} />{actions}</>}
      </div>
      {children}
    </div>
  </section>
);

export const Row = ({ children }: { children: ReactNode }) => <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>{children}</div>;
export const Lbl = ({ text, tip, children }: { text: string; tip?: string; children: ReactNode }) => (
  <label style={{ display: 'grid', gap: 2 }} title={tip}><span className="muted" style={{ fontSize: 12 }}>{text}</span>{children}</label>
);
