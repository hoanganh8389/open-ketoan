// [2026-11-22 01:20 AM Johnny Chu - Chu Hoàng Anh] PHASE-038 — B1b (S038-12, R-LOG-6): subscriber lỗi → dòng log có stack, job, attempt, eventId, traceId của sự kiện gốc
/**
 * Trước B1b, lỗi subscriber chỉ còn ở cột event_deliveries.last_error (chuỗi thông báo, mất stack) và span — bản cài không bật
 * bộ giám sát thì không biết lỗi ở dòng nào. Kiểm:
 *   - lần thử còn lượt → warn `bizcity.event.delivery_retry`; hết lượt → error `bizcity.event.delivery_dead`;
 *   - dòng có đối tượng lỗi (stack trỏ tệp, chuỗi cause), errFp, job / fn / module / attempt / maxAttempts / eventId / eventType;
 *   - traceId lấy từ traceparent lưu ở outbox (trace của yêu cầu đã phát sự kiện);
 *   - last_error vẫn ghi như cũ.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace';
import { db } from '../src/db/client.js';
import { defineSubscriber, dispatchOnce, emitEvent, registerSubscribers, setEventLogger, type EventEnvelope } from '../src/core/events.js';
import { errFp } from '@bizcity/platform/core/logger';
import { disableTracing, initTracing, withSpan } from '../src/core/tracing.js';
import { setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';

class LoiThu extends Error { override name = 'LoiThu'; }
const failing = defineSubscriber({
  id: 'test.log-probe',
  module: 'test',
  on: ['test.logprobe.happened'],
  retry: { maxAttempts: 2, baseDelayMs: 0, maxDelayMs: 0 },
  async handle(_c, evt: EventEnvelope) {
    throw new LoiThu(`subscriber hỏng cho ${evt.subject}`, { cause: Object.assign(new Error('lỗi gốc'), { code: '40001' }) });
  },
});

type Call = { level: 'warn' | 'error'; obj: Record<string, unknown>; msg?: string };
const calls: Call[] = [];
const fakeLog = {
  warn: (obj: object, msg?: string) => { calls.push({ level: 'warn', obj: obj as Record<string, unknown>, msg }); },
  error: (obj: object, msg?: string) => { calls.push({ level: 'error', obj: obj as Record<string, unknown>, msg }); },
};

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  registerSubscribers([failing]);
  setEventLogger(fakeLog);
  initTracing({ exporter: new InMemorySpanExporter() }); // outbox lưu traceparent của span phát như yêu cầu HTTP thật
});
afterAll(async () => {
  setEventLogger(null);
  await disableTracing();
  await ctx.app.close();
});

/** Phát một sự kiện trong span gốc (như một yêu cầu); trả id sự kiện và traceId của span đó. */
async function emitTraced(subject: string): Promise<{ id: string; traceId: string }> {
  const traceId = await withSpan('test emit', { root: true }, async (span) => {
    await db.transaction().execute((trx) => emitEvent(trx, { tenantId, type: 'test.logprobe.happened', subject, source: 'test', actor: { kind: 'system', id: 'test' } }));
    return span.spanContext().traceId;
  });
  const ev = await db.selectFrom('event_outbox').select(['id', 'trace_parent']).where('tenant_id', '=', tenantId).where('subject', '=', subject).executeTakeFirstOrThrow();
  expect(ev.trace_parent).toContain(traceId);
  return { id: ev.id, traceId };
}

describe('lỗi subscriber vào log (R-LOG-6)', () => {
  it('lần 1 warn (sẽ thử lại), lần 2 error (dead); đủ trường; traceId của sự kiện gốc; last_error giữ nguyên', async () => {
    const subject = `log-${Date.now()}`;
    const ev = await emitTraced(subject);

    const run = () => dispatchOnce({ consumers: ['test.log-probe'], tenantId, limit: 10 });
    expect((await run()).failed).toBe(1);
    expect((await run()).dead).toBe(1);

    const mine = calls.filter((c) => c.obj.eventId === ev.id);
    expect(mine.map((c) => [c.level, c.obj.evt, c.obj.attempt])).toEqual([
      ['warn', 'bizcity.event.delivery_retry', 1],
      ['error', 'bizcity.event.delivery_dead', 2],
    ]);
    for (const c of mine) {
      expect(c.obj).toMatchObject({ job: 'outbox', fn: 'test.log-probe', module: 'test', maxAttempts: 2, eventType: 'test.logprobe.happened', tenant: tenantId, traceId: ev.traceId });
      expect(c.obj.deliveryTraceId).toMatch(/^[0-9a-f]{32}$/); // trace riêng của lần giao (nối link về trace gốc)
      expect(c.obj.deliveryTraceId).not.toBe(ev.traceId);
      const err = c.obj.err as Error & { cause?: Error & { code?: string } };
      expect(err).toBeInstanceOf(LoiThu); // đối tượng lỗi, không String(err) (G4)
      expect(err.stack).toContain('nhat-ky-loi-su-kien.test.ts');
      expect(err.cause).toMatchObject({ message: 'lỗi gốc', code: '40001' });
      expect(c.obj.errFp).toBe(errFp(err));
    }
    expect(mine[1]!.msg).toContain('dead');

    const d = await db.selectFrom('event_deliveries').select(['status', 'last_error']).where('consumer', '=', 'test.log-probe').where('event_id', '=', ev.id).executeTakeFirstOrThrow();
    expect(d).toMatchObject({ status: 'dead', last_error: `subscriber hỏng cho ${subject}` });
  });

  it('không đặt logger (job / CLI cũ): giao vẫn chạy, không ném', async () => {
    setEventLogger(null);
    try {
      const ev = await emitTraced(`log-null-${Date.now()}`);
      const before = calls.length;
      await dispatchOnce({ consumers: ['test.log-probe'], tenantId, limit: 10 });
      const d = await db.selectFrom('event_deliveries').select(['status', 'attempts']).where('consumer', '=', 'test.log-probe').where('event_id', '=', ev.id).executeTakeFirstOrThrow();
      expect(d).toMatchObject({ status: 'pending', attempts: 1 }); // đã thử, ghi lần thử, hẹn lại
      expect(calls.length).toBe(before);
    } finally {
      setEventLogger(fakeLog);
    }
  });
});
