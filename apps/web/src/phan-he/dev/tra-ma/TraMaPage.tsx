// [2026-11-01 11:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W3: màn Tra mã (DEV02) — dán traceId / requestId → chuyện gì đã xảy ra, cây span, log, bằng chứng
/**
 * TRA MÃ (DEV02, 20-KIEN-TRUC §4): dán mã từ khay Mã tra cứu / thông báo lỗi.
 *   - 32 ký tự hex → traceId → core.devtools.trace; còn lại theo khuôn requestId → core.devtools.request (log → trace).
 *   - Khối "Chuyện gì đã xảy ra" trước (N3, U1), rồi ba thẻ: Cây span · Log cùng trace · Bằng chứng.
 *   - Địa chỉ giữ mã (?ma=…, &tab=…) để gửi link cho nhau; khay Mã tra cứu mở thẳng tới đây.
 *   - Phím `/` đưa con trỏ vào ô tra mã (U9).
 * Không có nút ghi nào (U8). Trace của đơn vị khác → "không tìm thấy" (D019-5).
 */
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { noiDungChoAI } from '@ketoan/contracts';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Loading } from '@/components/ui';
import { errorText } from '@/lib/api';
import { REQUEST_RE, TRACE_RE, useDevStatus, useEvidence, useLogs, useRequest, useTrace, type LogLine, type TraceView } from '../api';
import { Answer, CopyCode, DevBanner, DevGuard, OutcomeTag, Src, Waterfall, clock, when } from '../ui';

type Tab = 'cay' | 'log' | 'bang-chung';

export function TraMaPage() {
  const [params, setParams] = useSearchParams();
  const raw = (params.get('ma') ?? params.get('traceId') ?? params.get('requestId') ?? '').trim();
  const [text, setText] = useState(raw);
  useEffect(() => setText(raw), [raw]);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !t.closest('input, textarea, select, [contenteditable="true"]')) { e.preventDefault(); input.current?.focus(); input.current?.select(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const isTrace = TRACE_RE.test(raw);
  const isRequest = !isTrace && REQUEST_RE.test(raw);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = text.trim();
    setParams(v ? { ma: v } : {});
  };

  return (
    <DevGuard>
      <PageHeader title="Tra mã" code="DEV02" helpKey="ban-dieu-tra" subtitle="Dán traceId (32 ký tự) hoặc requestId (req-…) từ thông báo lỗi — phím tắt /" />
      <DevBanner />
      <form className="dev-search" onSubmit={submit}>
        <input ref={input} className="input mono" value={text} onChange={(e) => setText(e.target.value)} placeholder="vd 0904127dd2944f22c086c236c5ceb5af hoặc req-6d9697c3-8e44" aria-label="Mã tra cứu" autoFocus={!raw} spellCheck={false} />
        <button type="submit" className="btn btn-primary">Tra</button>
      </form>
      {raw && !isTrace && !isRequest && <ErrorBox error="Mã không đúng khuôn: traceId gồm 32 ký tự 0-9 a-f; requestId gồm chữ, số, . _ : - (vd req-1a2b3c4d)." />}
      {isTrace && <TraceResult traceId={raw.toLowerCase()} tab={(params.get('tab') as Tab) ?? 'cay'} onTab={(t) => setParams({ ma: raw, tab: t })} />}
      {isRequest && <RequestResult requestId={raw} />}
      {!raw && (
        <div className="card card-body muted" style={{ marginTop: 12 }}>
          Lấy mã ở khay <b>Mã tra cứu</b> góc dưới trái khi có lỗi (nút <b>Chép</b>), hoặc từ người dùng gửi. Không có mã? Xem <Link to="/dev/tong-quan">Tổng quan</Link> hoặc <Link to="/dev/nhat-ky">Nhật ký</Link>.
        </div>
      )}
    </DevGuard>
  );
}

function RequestResult({ requestId }: { requestId: string }) {
  const [params, setParams] = useSearchParams();
  const at = params.get('at');
  const q = useRequest(requestId, at);
  // Lúc lỗi (giờ máy) để tìm quanh mốc đó — mặc định tìm 24 giờ gần nhất.
  const [luc, setLuc] = useState(() => (at ? new Date(new Date(at).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : ''));
  const chonMoc = (
    <form className="row" style={{ gap: 6, alignItems: 'center', margin: '6px 0' }} onSubmit={(e) => { e.preventDefault(); const n = new URLSearchParams(params); if (luc) n.set('at', new Date(luc).toISOString()); else n.delete('at'); setParams(n); }}>
      <span className="muted" style={{ fontSize: 12.5 }}>{at ? `Đang tìm trong 24 giờ quanh ${new Date(at).toLocaleString('vi-VN', { hour12: false })}` : 'Đang tìm trong 24 giờ gần nhất'} — lỗi cũ hơn thì chọn lúc xảy ra lỗi:</span>
      <input className="input" type="datetime-local" style={{ width: 210 }} value={luc} onChange={(e) => setLuc(e.target.value)} />
      <button className="btn btn-sm" type="submit">Tìm quanh mốc này</button>
    </form>
  );
  if (q.isLoading) return <><>{chonMoc}</><Loading text="Đang tìm yêu cầu trong nhật ký…" /></>;
  if (q.error) return <>{chonMoc}<ErrorBox error={errorText(q.error)} /></>;
  const r = q.data!;
  return (
    <>
      {chonMoc}
      <TomTatLoi requestId={requestId} logs={r.logs} />
      {/* [2026-11-25 Nguyễn Văn Thủy] phần kỹ thuật (trace, log thô) thu gọn — dev mở khi cần (đóng góp) */}
      <details className="card" style={{ padding: '6px 10px', marginTop: 8 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Chi tiết kỹ thuật cho dev (log từng bước{r.trace ? ', vết xử lý' : ''})</summary>
        {r.trace
          ? <TraceBody key={r.trace.traceId} t={r.trace} tab="cay" onTab={() => undefined} logsOverride={r.logs} />
          : <>
            <p className="muted" style={{ fontSize: 12 }}>Không có vết xử lý (trace) cho yêu cầu này{r.traceMissing ? ` — ${r.traceMissing}` : ''}. Log bên dưới vẫn đủ để biết lỗi.</p>
            <LogTable lines={r.logs} />
          </>}
      </details>
    </>
  );
}

// [2026-11-25 Nguyễn Văn Thủy] TÓM TẮT LỖI dễ đọc: chuyện gì, lúc nào, ở chức năng nào, câu báo, mã lỗi nghĩa là gì, ai cần sửa; nút chép để báo dev (đóng góp)
const NGHIA_MA: Record<string, [string, string]> = {
  VALIDATION_ERROR: ['Dữ liệu nhập chưa hợp lệ', 'Người nhập sửa theo câu báo (ô, danh mục, số liệu) rồi lưu lại'],
  CONFLICT: ['Trùng hoặc vướng chứng từ / danh mục khác', 'Người nhập xử lý chỗ bị vướng theo câu báo (đổi số, bỏ duyệt phiếu liên quan…)'],
  NOT_FOUND: ['Không tìm thấy dữ liệu được nhắc tới', 'Kiểm tra mã / số có đúng và còn dùng không; nếu đúng mà vẫn báo thì gửi dev'],
  FORBIDDEN: ['Không có quyền hoặc tính năng đang tắt', 'Quản trị cấp quyền / bật tính năng theo câu báo'],
  UNAUTHORIZED: ['Phiên đăng nhập hết hạn', 'Đăng nhập lại'],
  NOT_READY: ['Dịch vụ phụ trợ chưa sẵn sàng / chưa cấu hình', 'Quản trị khai cấu hình (HT13) theo câu báo'],
  PERIOD_LOCKED: ['Kỳ kế toán đã khoá sổ', 'Mở khoá kỳ hoặc ghi vào kỳ đang mở'],
  RATE_LIMITED: ['Thao tác quá nhanh / quá nhiều lần', 'Chờ một lát rồi thử lại'],
  INTERNAL_ERROR: ['Lỗi trong phần mềm (máy chủ)', 'Gửi dev — chép thông tin bên dưới'],
};
function TomTatLoi({ requestId, logs }: { requestId: string; logs: LogLine[] }) {
  const [daChep, setDaChep] = useState(false);
  const goc = logs.find((l) => l.route) ?? logs[0];
  if (!goc) return <Answer level="warn" title="Không có log của yêu cầu này"><p>Thử chọn đúng lúc xảy ra lỗi ở ô phía trên.</p></Answer>;
  const status = goc.status ?? 0;
  const ma = logs.find((l) => l.errCode)?.errCode ?? (status >= 500 ? 'INTERNAL_ERROR' : '');
  const cau = logs.find((l) => l.errCode && !l.route && l.msg)?.msg ?? logs.find((l) => l.err?.message)?.err?.message ?? (ma ? '' : goc.msg);
  const loiMay = status >= 500 || ma === 'INTERNAL_ERROR';
  const ok = status > 0 && status < 400;
  const [nghia, cachSua] = NGHIA_MA[ma] ?? (ma ? [ma, 'Đọc câu báo; chưa rõ thì gửi dev'] : ['', '']);
  const stack = logs.find((l) => l.err?.stack)?.err?.stack;
  const vanBan = [`Mã tra cứu: ${requestId}`, `Lúc: ${new Date(goc.time).toLocaleString('vi-VN', { hour12: false })}`, goc.route ? `Chức năng: ${goc.method ?? ''} ${goc.route} → ${status || ''}` : '',
    ma ? `Mã lỗi: ${ma} (${nghia})` : '', cau ? `Câu báo: ${cau}` : '', goc.docType ? `Chứng từ: ${goc.docType} ${goc.docKey ?? ''}` : '', stack ? `Stack:\n${stack}` : ''].filter(Boolean).join('\n');
  const row = (k: string, v: ReactNode) => v ? <tr><td className="muted" style={{ width: 150, verticalAlign: 'top' }}>{k}</td><td>{v}</td></tr> : null;
  return (
    <div className="card" style={{ padding: 12, borderLeft: `4px solid ${ok ? 'var(--ok, #16a34a)' : loiMay ? '#dc2626' : '#d97706'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <b style={{ fontSize: 15 }}>{ok ? 'Yêu cầu chạy thành công' : loiMay ? 'Lỗi trong phần mềm — cần dev sửa' : 'Máy chủ từ chối lưu — do dữ liệu / thao tác'}</b>
        <button type="button" className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => { void navigator.clipboard?.writeText(vanBan); setDaChep(true); setTimeout(() => setDaChep(false), 1500); }}>{daChep ? 'Đã chép' : 'Chép để báo dev'}</button>
      </div>
      <table className="mh-mini" style={{ width: '100%' }}><tbody>
        {row('Câu báo lỗi', cau && <b style={{ color: ok ? undefined : '#b91c1c' }}>{cau}</b>)}
        {row('Mã lỗi', ma && <><code>{ma}</code> — {nghia}</>)}
        {row('Cách sửa', cachSua)}
        {row('Lúc', new Date(goc.time).toLocaleString('vi-VN', { hour12: false }))}
        {row('Chức năng (API)', goc.route && <><code>{goc.method} {goc.route}</code>{status ? <> → {status}</> : null}{goc.ms !== undefined ? <span className="muted"> · {goc.ms} ms</span> : null}</>)}
        {row('Chứng từ', goc.docType && <>{goc.docType} {goc.docKey && <code>{goc.docKey}</code>}</>)}
        {row('Mã tra cứu', <code>{requestId}</code>)}
        {row('Chỗ lỗi trong mã', stack && <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, margin: 0, maxHeight: 220, overflow: 'auto' }}>{stack}</pre>)}
      </tbody></table>
    </div>
  );
}

function TraceResult({ traceId, tab, onTab }: { traceId: string; tab: Tab; onTab: (t: Tab) => void }) {
  const st = useDevStatus();
  const tempoOff = st.data?.sources.tempo === 'off';
  const q = useTrace(traceId, Boolean(st.data) && !tempoOff);
  if (st.isLoading) return <Loading text="Đang đọc trace…" />;
  if (tempoOff) return <Answer level="warn" title="Chưa bật tra vết"><p>Máy này chưa cấu hình Tempo (DEVTOOLS_TEMPO_URL) nên không tra được trace. Tra theo mã yêu cầu (req-…) vẫn dùng được.</p></Answer>;
  if (q.isLoading) return <Loading text="Đang đọc trace…" />;
  if (q.error) return <ErrorBox error={errorText(q.error)} />;
  return <TraceBody key={traceId} t={q.data!} tab={tab} onTab={onTab} />;
}

function TraceBody({ t, tab: tab0, onTab, logsOverride }: { t: TraceView; tab: Tab; onTab: (t: Tab) => void; logsOverride?: LogLine[] }) {
  const [tab, setTab] = useState<Tab>(tab0);
  const pick = (x: Tab) => { setTab(x); onTab(x); };
  const s = t.summary;
  const [sel, setSel] = useState<string | null>(s.stoppedAt?.spanId ?? t.spans[0]?.spanId ?? null);
  const span = t.spans.find((x) => x.spanId === sel) ?? null;
  const logs = useLogs(logsOverride ? null : { window: '24h', traceId: t.traceId });
  const ev = useEvidence({ traceId: t.traceId }, tab === 'bang-chung');
  const level = s.outcome === 'error' ? 'bad' : s.outcome === 'rejected' ? 'rej' : 'ok';
  const lines = logsOverride ?? logs.data?.lines ?? [];

  return (
    <>
      <Answer level={level} title="Chuyện gì đã xảy ra">
        <ul>
          <li><OutcomeTag outcome={s.outcome} /> {when(t.startedAt)} · {Math.round(t.durationMs * 10) / 10} ms · trace <CopyCode value={t.traceId} short={8} /></li>
          {s.lines.map((l, i) => <li key={i}>{l}</li>)}
        </ul>
        {/* [2026-11-02 10:42 AM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W4: tình huống khớp → màn Kịch bản (U7) */}
        <div className="dev-answer-actions">
          {s.playbook && <Link to={`/dev/kich-ban?th=${s.playbook}`}>Làm gì tiếp — kịch bản {s.playbook} →</Link>}
          <ChepChoAI t={t} />
        </div>
      </Answer>
      <div className="dev-cols">
        <div className="card">
          <div className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'cay'} className={`tab${tab === 'cay' ? ' active' : ''}`} onClick={() => pick('cay')}>Cây span ({t.spans.length})</button>
            <button type="button" role="tab" aria-selected={tab === 'log'} className={`tab${tab === 'log' ? ' active' : ''}`} onClick={() => pick('log')}>Log cùng trace{lines.length ? ` (${lines.length})` : ''}</button>
            <button type="button" role="tab" aria-selected={tab === 'bang-chung'} className={`tab${tab === 'bang-chung' ? ' active' : ''}`} onClick={() => pick('bang-chung')}>Bằng chứng{ev.data ? ` (${ev.data.length})` : ''}</button>
          </div>
          {tab === 'cay' && <>
            <Waterfall spans={t.spans} total={t.durationMs} selected={sel} onSelect={setSel} />
            <Src>nguồn: core.devtools.trace — Tempo, đã kiểm trace thuộc đơn vị; thuộc tính lọc theo danh sách cho phép</Src>
          </>}
          {tab === 'log' && <>
            {!logsOverride && logs.isLoading ? <Loading /> : !logsOverride && logs.error ? <ErrorBox error={errorText(logs.error)} /> : <LogTable lines={lines} hideTrace />}
            <Src>nguồn: core.devtools.logs — Loki, cùng traceId, 24 giờ gần nhất, trường theo danh sách cho phép</Src>
          </>}
          {tab === 'bang-chung' && <>
            {ev.isLoading ? <Loading /> : ev.error ? <ErrorBox error={errorText(ev.error)} /> : !ev.data?.length
              ? <div className="empty">Trace này không ghi bằng chứng (yêu cầu đọc, hoặc bị từ chối trước khi tới action ghi).</div>
              : (
                <div className="table-wrap"><table className="grid">
                  <thead><tr><th>Lúc</th><th>Action</th><th>Đối tượng</th><th>Người gọi</th><th>Kết quả</th></tr></thead>
                  <tbody>{ev.data.map((e) => (
                    <tr key={e.id}><td>{clock(e.at)}</td><td><code>{e.action}</code></td><td>{e.object.type}{e.object.id ? <> · <code>{e.object.id}</code></> : null}</td><td className="mono">{e.actor.kind}</td>
                      <td>{e.result.ok ? <OutcomeTag outcome="ok" /> : <><OutcomeTag outcome="rejected" /> <code>{e.result.code}</code></>}</td></tr>
                  ))}</tbody>
                </table></div>
              )}
            <Src>nguồn: core.devtools.evidence — audit_logs của đơn vị, chỉ cột mô tả (không dữ liệu trước / sau)</Src>
          </>}
        </div>
        <div className="card card-body dev-span">
          {span ? <>
            <h3>{span.name}</h3>
            <dl className="dev-kv">
              <dt>Kết quả</dt><dd><OutcomeTag outcome={span.outcome} /></dd>
              <dt>Loại</dt><dd>{span.kind}</dd>
              <dt>Bắt đầu</dt><dd>+{span.startMs} ms</dd>
              <dt>Thời gian</dt><dd>{span.durationMs} ms</dd>
              {Object.entries(span.attributes).map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd><code>{String(v)}</code></dd></Fragment>)}
              {span.events.map((e, i) => <Fragment key={`ev-${i}`}><dt>sự kiện</dt><dd>{e.name}{e.exceptionType ? <> · <code>{e.exceptionType}</code></> : null}</dd></Fragment>)}
            </dl>
            <p className="muted" style={{ fontSize: 12 }}>Chế độ Đơn vị không hiện thông điệp / ngăn xếp lỗi (D019-7) — cần thì gửi mã cho vận hành.</p>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              <Link className="btn btn-sm" to={`/dev/nhat-ky?traceId=${t.traceId}`}>Log của trace</Link>
              {t.links.grafana && <a className="btn btn-sm" href={t.links.grafana} target="_blank" rel="noopener noreferrer">Mở trong Grafana ↗</a>}
            </div>
          </> : <div className="muted">Chọn một span bên trái.</div>}
        </div>
      </div>
    </>
  );
}

// [2026-11-02 02:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W5: "Chép cho AI" — khối markdown (tóm tắt, cây span rút gọn, chỗ tìm mã, việc phải làm) để dán vào công cụ AI code
/** Chép nội dung noiDungChoAI (@ketoan/contracts) — chỉ mã và tên bước, không dữ liệu, không đơn vị. */
function ChepChoAI({ t }: { t: TraceView }) {
  const [done, setDone] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(noiDungChoAI(t)).then(() => { setDone(true); window.setTimeout(() => setDone(false), 2000); }, () => undefined);
  };
  return (
    <button type="button" className="btn btn-sm" onClick={copy} title="Tóm tắt + cây span rút gọn + chỗ tìm mã + việc phải làm (test trước) — dán vào Claude Code, Cursor…">
      {done ? 'Đã chép — dán vào công cụ AI' : 'Chép cho AI'}
    </button>
  );
}

export function LogTable({ lines, hideTrace }: { lines: LogLine[]; hideTrace?: boolean }) {
  if (!lines.length) return <div className="empty">Không có dòng log nào khớp.</div>;
  return (
    <div className="table-wrap"><table className="grid">
      <thead><tr><th>Lúc</th><th>Mức</th><th>Sự việc / route</th><th>Mã</th><th style={{ textAlign: 'right' }}>ms</th>{!hideTrace && <th>Trace</th>}<th>Yêu cầu</th></tr></thead>
      <tbody>{lines.map((l, i) => (
        <tr key={`${l.time}-${i}`}>
          <td title={when(l.time)}>{clock(l.time)}</td>
          <td className={`dev-lv ${l.level}`}>{l.level}</td>
          <td>{l.route ? <><code>{l.method} {l.route}</code>{l.status ? <> · {l.status}</> : null}</> : l.evt ? <code>{l.evt}</code> : null}{l.docType ? <> · {l.docType}</> : null}{l.docKey ? <> · <code>{l.docKey}</code></> : null}{!l.route && !l.evt ? l.msg : null}{l.err?.type ? <> · <code>{l.err.type}</code></> : null}</td>
          <td>{l.errCode && <code>{l.errCode}</code>}</td>
          <td style={{ textAlign: 'right' }}>{l.ms ?? ''}</td>
          {!hideTrace && <td>{l.traceId && <CopyCode value={l.traceId} short={8} to={`/dev/tra-ma?ma=${l.traceId}`} />}</td>}
          <td>{l.reqId && <CopyCode value={l.reqId} short={14} to={`/dev/tra-ma?ma=${encodeURIComponent(l.reqId)}`} />}</td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}
