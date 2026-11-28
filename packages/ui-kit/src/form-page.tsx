// @bizcity-layer P ui-kit
// [2026-11-29 04:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-066: khung "form trong trang" dùng chung cho BH18 khuyến mại / BH19 tích điểm / BH21 voucher —
// bấm Thêm / mở dòng thì đổi sang form ngay trên màn (như MH29 Hợp đồng mua hàng), không mở hộp thoại; thanh bước NGANG ở trên (chốt NT-BH-063,
// màn nhỏ); đầu trang ← quay lại · tiêu đề · nút Ghi / Duyệt / Thoát bên phải; thân thẻ trắng, lưới 3 cột kín; Bước trước / Bước tiếp cuối thẻ.
// Vẽ bằng lớp sẵn có của khung giao diện (.card, .btn, .nx-steps) + style nội tuyến — không thêm tệp CSS (đóng góp)
/**
 *   const [mo, setMo] = useFormParam('ct');           // ?ct=<mã> | ?ct=moi — tải lại / Back của trình duyệt về đúng chỗ
 *   if (mo) return <FormPage title="Tạo chương trình mới" onBack={() => setMo(null)} actions={<>…nút…</>}
 *                            steps={[{ label: 'Thông tin chung' }, …]} current={buoc} onStep={setBuoc}>…</FormPage>;
 *   <FormGrid>…<Field …/>…</FormGrid>                 // lưới 3 cột như MH29 (.hd-grid); ô rộng: <div style={{ gridColumn: '1 / -1' }}>
 */
import { createElement, useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';

export interface FormStep {
  label: string;
  /** Bước còn ô sai / thiếu → hiện ⚠ cạnh tên. */
  warn?: boolean;
}

export interface FormPageProps {
  /** Tiêu đề lớn (vd "Tạo chương trình mới", "Đợt phát voucher ABBOTT50K"). */
  title: ReactNode;
  /** Dòng phụ dưới tiêu đề (gợi ý bước tiếp, người tạo…). */
  sub?: ReactNode;
  /** Nút ← (và Esc): về danh sách. */
  onBack: () => void;
  /** Nút góc phải đầu trang: Ghi / Gửi duyệt / Duyệt / Thoát… */
  actions?: ReactNode;
  /** Câu báo cạnh nút (vd lý do chưa ghi được) — hiện ngay dưới đầu trang. */
  note?: ReactNode;
  steps?: FormStep[];
  current?: number;
  onStep?: (i: number) => void;
  /** Cột phải cạnh thẻ thân (trợ lý / hướng dẫn) — không có thì thân chiếm hết bề ngang. */
  aside?: ReactNode;
  /** Ctrl + S gọi hàm này (không truyền thì không bắt phím). */
  onSave?: () => void;
  children: ReactNode;
}

/** Trạng thái hiển thị một bước (thuần — test không cần React). */
export function formStepState(i: number, current: number): 'on' | 'xong' | 'cho' {
  return i === current ? 'on' : i < current ? 'xong' : 'cho';
}

const HEAD = { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, flexWrap: 'wrap' } as const;
const TITLE = { fontSize: 16, fontWeight: 700, color: 'var(--brand-800)', lineHeight: 1.3 } as const;

function StepBar({ steps, current, onStep }: { steps: FormStep[]; current: number; onStep: (i: number) => void }) {
  const key = (e: KeyboardEvent, i: number) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onStep(i); }
    if (e.key === 'ArrowRight' && i < steps.length - 1) { e.preventDefault(); onStep(i + 1); }
    if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); onStep(i - 1); }
  };
  return createElement('div', { className: 'nx-steps', role: 'tablist', 'aria-label': 'Các bước', style: { margin: 0 } },
    steps.map((s, i) => {
      const st = formStepState(i, current);
      return createElement('span', {
        key: `${i}-${s.label}`, role: 'tab', tabIndex: 0, 'aria-selected': st === 'on', className: st === 'cho' ? undefined : st,
        style: { cursor: 'pointer' }, title: s.warn ? `${s.label} — còn ô chưa đúng` : s.label,
        onClick: () => onStep(i), onKeyDown: (e: KeyboardEvent) => key(e, i),
      }, createElement('b', null, String(i + 1)), s.label, s.warn ? ' ⚠' : '');
    }));
}

/** Khung trang form (thay hộp thoại): đầu trang + thanh bước ngang + thẻ thân + Bước trước / Bước tiếp. */
export function FormPage(p: FormPageProps) {
  const { onBack, onSave } = p;
  useEffect(() => {
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.modal-backdrop, [role="dialog"]')) onBack();
      if (onSave && (e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); onSave(); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onBack, onSave]);
  const steps = p.steps ?? [];
  const cur = p.current ?? 0;
  const pick = p.onStep ?? (() => undefined);
  const head = createElement('div', { style: HEAD },
    createElement('button', { type: 'button', className: 'btn btn-sm btn-ghost', title: 'Về danh sách (Esc)', 'aria-label': 'Về danh sách', onClick: onBack }, '←'),
    createElement('div', { style: { flex: 1, minWidth: 220 } },
      createElement('div', { style: TITLE }, p.title),
      p.sub ? createElement('div', { className: 'muted', style: { fontSize: 12.5 } }, p.sub) : null),
    p.actions ? createElement('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } }, p.actions) : null);
  const nav = steps.length > 1
    ? createElement('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 } },
        cur > 0 ? createElement('button', { type: 'button', className: 'btn btn-sm', onClick: () => pick(cur - 1) }, '← Bước trước') : null,
        cur < steps.length - 1 ? createElement('button', { type: 'button', className: 'btn btn-sm btn-primary', onClick: () => pick(cur + 1) }, 'Bước tiếp →') : null)
    : null;
  const body = createElement('div', { className: 'card', style: { padding: '12px 16px', minWidth: 0 } },
    steps.length ? createElement('div', { style: { marginBottom: 12 } }, createElement(StepBar, { steps, current: cur, onStep: pick })) : null,
    p.children, nav);
  return createElement('div', { style: { display: 'grid', gap: 10, minWidth: 0 } },
    head,
    p.note ? createElement('div', { style: { fontSize: 12.5 } }, p.note) : null,
    p.aside
      ? createElement('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 12, alignItems: 'start' } }, body, p.aside)
      : body);
}

/** Lưới ô nhập 3 cột kín như MH29 (.hd-grid); màn hẹp tự xuống 2 / 1 cột. Ô rộng cả hàng: style gridColumn '1 / -1'. */
export function FormGrid({ children, cols = 3 }: { children: ReactNode; cols?: number }) {
  return createElement('div', { style: { display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${cols >= 3 ? 220 : 280}px, 1fr))`, gap: '10px 14px', alignItems: 'start' } }, children);
}

/** Đọc / ghi một tham số trên URL (?name=value) để form trong trang tải lại / Back của trình duyệt về đúng chỗ — không cần router. */
export function readParam(name: string, search: string = typeof window === 'undefined' ? '' : window.location.search): string | null {
  const v = new URLSearchParams(search).get(name);
  return v === null || v === '' ? null : v;
}

export function useFormParam(name: string): [string | null, (v: string | null) => void] {
  const [val, setVal] = useState<string | null>(() => readParam(name));
  useEffect(() => {
    const on = () => setVal(readParam(name));
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, [name]);
  const set = (v: string | null) => {
    const u = new URL(window.location.href);
    if (v === null) {
      // Mở form bằng nút trên màn (có bản ghi lịch sử của mình) → lùi một bước để Back của trình duyệt không mở lại form.
      if ((window.history.state as { formParam?: string } | null)?.formParam === name) { window.history.back(); setVal(null); return; }
      u.searchParams.delete(name);
      window.history.replaceState(window.history.state, '', u);
    } else {
      u.searchParams.set(name, v);
      if (readParam(name) === null) window.history.pushState({ ...(window.history.state ?? {}), formParam: name }, '', u);
      else window.history.replaceState(window.history.state, '', u);
    }
    setVal(v);
  };
  return [val, set];
}
