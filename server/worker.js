/* ═══════════════════════════════════════════════════════════════════
   server/worker.js — ویو ۸: کارگرِ پردازشِ صندوق رویدادها (Outbox)
   ───────────────────────────────────────────────────────────────────
   - رویدادهای `pending` را از `store.outbox` می‌خواند و به هندلرِ
     ثبت‌شده برای `type` آن‌ها می‌سپارد.
   - موفقیت ⇒ `status='processed'` + `processed_at`.
   - شکست ⇒ `retry_count++` و `last_error`؛ پس از `maxRetries` تلاش
     ⇒ `status='failed'`. رویداد در شکست **هرگز حذف نمی‌شود** — برای
     بازرسی و تلاشِ دستی باقی می‌ماند (داده نمی‌میرد).
   - رویدادهای بدون هندلر دست نمی‌خورند (کارِ مصرف‌کننده‌های دیگرند).
   - در برابر ورودِ دوباره محافظت شده (یک رویداد هم‌زمان دو بار پردازش
     نمی‌شود) و برای تستِ قطعی `tick()` به‌صورت دستی هم قابل صداست.
   - زمان‌بندی: `intervalMs` (پیش‌فرض ۱۰۰۰) — تلاشِ بعدی در تیکِ بعد
     (بک‌آف ساده؛ برای بارهای سنگین صفِ اختصاصی جدا شود).
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

/* ویو ۱۴ (Observability) — نتیجهٔ پردازشِ هر رویداد به‌صورت metric.
   metrics.js هرگز خطا نمی‌دهد (R1)، پس رفتارِ کارگر تغییر نمی‌کند. */
const metrics = require('./metrics');

/**
 * @param {object} opts
 * @param {object} opts.store      — فروشگاه (آرایهٔ `store.outbox` منبع صف است)
 * @param {object} opts.outbox     — نمونهٔ ساخته‌شده از server/outbox (برای mark)
 * @param {object} opts.handlers   — نگاشتِ `type → async (evt) => {}`؛ کلیدِ
 *                                   ویژهٔ '*.deleted' برای همهٔ رویدادهای حذف می‌خورد.
 * @param {number} [opts.intervalMs=1000]
 * @param {number} [opts.maxRetries=5]
 */
function createWorker({ store, outbox, handlers, intervalMs, maxRetries }) {
  handlers = handlers || {};
  intervalMs = Number(intervalMs) > 0 ? Number(intervalMs) : 1000;
  maxRetries = Number.isFinite(Number(maxRetries)) ? Number(maxRetries) : 5;

  let timer = null;
  let running = false;
  let lastTickAt = 0;
  const inFlight = new Set();

  function handlerFor(evt) {
    if (!evt || !evt.type) return null;
    if (handlers[evt.type]) return handlers[evt.type];
    if (String(evt.type).slice(-8) === '.deleted' && handlers['*.deleted']) return handlers['*.deleted'];
    return null;
  }

  /* یک دور پردازش — برای تست به‌صورت دستی هم صدا زده می‌شود */
  async function tick() {
    if (running) return { processed: 0, failedDelta: 0, skippedBusy: true };
    running = true;
    lastTickAt = Date.now();
    let processed = 0, failedDelta = 0;
    try {
      let events = [];
      if (outbox && typeof outbox.fetchPendingBatch === 'function') {
        try {
          events = await outbox.fetchPendingBatch(50);
        } catch (_) {
          events = Array.isArray(store.outbox) ? store.outbox : [];
        }
      } else {
        events = Array.isArray(store.outbox) ? store.outbox : [];
      }

      for (const evt of events) {
        const status = evt.status || 'pending'; /* سازگاری با گذشته */
        if ((status !== 'pending' && status !== 'processing') || inFlight.has(evt.id)) continue;
        const h = handlerFor(evt);
        if (!h) {
          await outbox.mark(evt.id, { status: 'pending', processing_at: null });
          continue;
        }
        inFlight.add(evt.id);
        try {
          await h(evt);
          await outbox.mark(evt.id, {
            status: 'processed',
            processed_at: new Date().toISOString(),
            last_error: null
          });
          processed++;
          metrics.inc('payesh_worker_events_total', { outcome: 'processed' });
        } catch (err) {
          const rc = (Number(evt.retry_count) || 0) + 1;
          const errMsg = (err && (err.message || err.code)) || 'error';
          const patch = {
            status: rc >= maxRetries ? 'failed' : 'pending',
            retry_count: rc,
            last_error: errMsg
          };
          if (rc >= maxRetries) {
            failedDelta++;
            /* RR-01 (Arena-2 runtime audit): the terminal bookkeeping must
               survive whichever terminal path lands. Before this fix, a
               successful moveToDlq skipped mark() entirely, so retry_count
               was silently dropped (stayed 0) and the processing lease
               timestamp was never cleared — upstream's own
               runtime-reliability-five-task T3-P3 failed at 172da62b. */
            evt.retry_count = rc;
            evt.last_error = errMsg;
            // B4: Transfer poison pill event to Dead-Letter Queue (DLQ)
            let movedToDlq = false;
            if (outbox && typeof outbox.moveToDlq === 'function') {
              try {
                const dlq = await outbox.moveToDlq(evt, errMsg);
                movedToDlq = !!(dlq && dlq.ok === true);
              } catch (_) {}
            }
            if (!movedToDlq) await outbox.mark(evt.id, patch);
            else await outbox.mark(evt.id, {
              status: 'dead_letter',
              retry_count: rc,
              last_error: errMsg,
              processing_at: null   /* lease cleanup on terminal transition */
            });
          } else {
            await outbox.mark(evt.id, patch);
          }
          /* برچسب از مجموعهٔ بسته (retry/failed)؛ متن خطا هرگز label نیست. */
          metrics.inc('payesh_worker_events_total', { outcome: patch.status === 'failed' ? 'failed' : 'retry' });
        } finally {
          inFlight.delete(evt.id);
        }
      }
      return { processed, failedDelta };
    } finally {
      running = false;
    }
  }

  function start() {
    if (timer) return;
    lastTickAt = Date.now();
    timer = setInterval(() => { tick().catch(() => {}); }, intervalMs);
    if (timer.unref) timer.unref();
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  function isHealthy(staleThresholdMs = 30000) {
    if (!timer) return true; // idle or manual mode
    if (!lastTickAt) return true;
    const age = Date.now() - lastTickAt;
    return age <= staleThresholdMs;
  }

  function health() {
    return {
      running,
      active: timer !== null,
      lastTickAt: lastTickAt ? new Date(lastTickAt).toISOString() : null,
      lastTickAgeMs: lastTickAt ? Date.now() - lastTickAt : 0,
      healthy: isHealthy()
    };
  }

  return { start, stop, tick, isHealthy, health };
}

module.exports = { createWorker };
