#!/usr/bin/env node
/* ═════════════════════════════════════════════════════════════════
   tests/worker-timer-replicate.js — QUEUE-CLAIM (M15 queue hardening)
   ─────────────────────────────────────────────────────────────────
   Regression: در start() هر دو tick() و tickReplicate() پشتِ هم صدا
   زده می‌شوند. وقتی هر دو یک پرچم running مشترک داشتند، tickReplicate
   همیشه skippedBusy بود و مسیرِ replicate-to-all (ابطالِ دوام‌دارِ کش)
   در تایمرِ واقعی هرگز اجرا نمی‌شد؛ تست‌های قبلی tickReplicate را
   مستقیم صدا می‌زدند و این را نمی‌دیدند.
   اجرا: node tests/worker-timer-replicate.js
   ═════════════════════════════════════════════════════════════════ */
'use strict';
const { createWorker } = require('../server/worker.js');
process.env.PAYESH_ENV = 'test';
process.env.PAYESH_M15_RUNTIME_DIAGNOSTICS = '1';
process.env.PAYESH_CACHE_DURABLE_INVALIDATION = 'on';

let fail = 0;
function chk(name, cond, extra) {
  if (cond) console.log('  ✅ ' + name);
  else { fail++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  /* ۱) مسیرِ تایمرِ واقعی: هر دو مسیر باید اجرا شوند */
  let pend = 0, repl = 0;
  const outbox = {
    instanceId() { return 'timer-path-instance'; },
    async fetchPendingBatch() { pend++; await sleep(2); return []; },
    async fetchReplicateBatch() { repl++; return []; },
    async advanceWatermark() {}, async mark() {}, async moveToDlq() {}
  };
  const w = createWorker({ store: { outbox: [] }, outbox, handlers: {}, intervalMs: 20 });
  w.start();
  await sleep(300);
  w.stop();
  chk('timer path: tick() runs', pend > 3, 'pend=' + pend);
  chk('timer path: tickReplicate() runs (not starved by tick)', repl > 3, 'repl=' + repl);
  const timerHealth = w.health();
  chk('health reports the effective interval and cache-replication switch',
    timerHealth.intervalMs === 20 && timerHealth.cacheReplicationEnabled === true,
    JSON.stringify(timerHealth));
  chk('health records that the real timer invoked cache replication',
    timerHealth.cacheReplicationLastTickAt !== null
      && timerHealth.cacheReplicationLastTickAgeMs < 1000
      && timerHealth.cacheReplicationLastProcessed === 0,
    JSON.stringify(timerHealth));
  chk('health identifies the outbox instance and initializes cumulative watermark diagnostics',
    timerHealth.outboxInstanceId === 'timer-path-instance'
      && timerHealth.cacheReplicationProcessedTotal === 0
      && timerHealth.cacheReplicationLastWatermarkTargetId === null
      && timerHealth.cacheReplicationLastWatermarkAdvanceOk === null,
    JSON.stringify(timerHealth));
  const savedPayeshEnv = process.env.PAYESH_ENV;
  const savedDiagnosticsFlag = process.env.PAYESH_M15_RUNTIME_DIAGNOSTICS;
  delete process.env.PAYESH_M15_RUNTIME_DIAGNOSTICS;
  const testHealthWithoutOptIn = w.health();
  chk('test health does not expose diagnostic identity without the explicit M15 opt-in',
    !Object.prototype.hasOwnProperty.call(testHealthWithoutOptIn, 'outboxInstanceId')
      && !Object.prototype.hasOwnProperty.call(testHealthWithoutOptIn, 'cacheReplicationProcessedTotal'),
    JSON.stringify(testHealthWithoutOptIn));
  process.env.PAYESH_ENV = 'production';
  process.env.PAYESH_M15_RUNTIME_DIAGNOSTICS = '1';
  const productionHealth = w.health();
  chk('production health omits test-only instance IDs and durable watermark diagnostics',
    !Object.prototype.hasOwnProperty.call(productionHealth, 'outboxInstanceId')
      && !Object.prototype.hasOwnProperty.call(productionHealth, 'cacheReplicationProcessedTotal')
      && !Object.prototype.hasOwnProperty.call(productionHealth, 'cacheReplicationLastWatermarkTargetId')
      && !Object.prototype.hasOwnProperty.call(productionHealth, 'cacheReplicationLastWatermarkAdvanceOk'),
    JSON.stringify(productionHealth));
  process.env.PAYESH_ENV = savedPayeshEnv;
  process.env.PAYESH_M15_RUNTIME_DIAGNOSTICS = savedDiagnosticsFlag;

  /* ۲) دو تیکِ replicate شمارندهٔ کل را افزایش می‌دهند و نتیجهٔ watermark را ثبت می‌کنند. */
  let replicateEvents = [
    { id: 41, type: 'cache.invalidate' },
    { id: 42, type: 'cache.invalidate' }
  ];
  const watermarkTargets = [];
  const replayWorker = createWorker({
    store: { outbox: [] },
    outbox: {
      instanceId() { return 'replay-instance'; },
      async fetchReplicateBatch() {
        const event = replicateEvents.shift();
        return event ? [event] : [];
      },
      async advanceWatermark(id) { watermarkTargets.push(id); return true; },
      async mark() { return true; }
    },
    handlers: { 'cache.invalidate': async () => {} },
    intervalMs: 1000
  });
  await replayWorker.tickReplicate();
  await replayWorker.tickReplicate();
  const replayHealth = replayWorker.health();
  chk('health reports cumulative processed events and the last successful watermark advance',
    replayHealth.outboxInstanceId === 'replay-instance'
      && replayHealth.cacheReplicationProcessedTotal === 2
      && replayHealth.cacheReplicationLastProcessed === 1
      && replayHealth.cacheReplicationLastWatermarkTargetId === 42
      && replayHealth.cacheReplicationLastWatermarkAdvanceOk === true
      && watermarkTargets.join(',') === '41,42',
    JSON.stringify({ health: replayHealth, watermarkTargets }));
  const failedAdvanceWorker = createWorker({
    store: { outbox: [] },
    outbox: {
      instanceId() { return 'failed-advance-instance'; },
      async fetchReplicateBatch() { return [{ id: 51, type: 'cache.invalidate' }]; },
      async advanceWatermark() { return false; }
    },
    handlers: { 'cache.invalidate': async () => {} },
    intervalMs: 1000
  });
  await failedAdvanceWorker.tickReplicate();
  const failedAdvanceHealth = failedAdvanceWorker.health();
  chk('health distinguishes processed work from a failed watermark advancement',
    failedAdvanceHealth.cacheReplicationProcessedTotal === 1
      && failedAdvanceHealth.cacheReplicationLastWatermarkTargetId === 51
      && failedAdvanceHealth.cacheReplicationLastWatermarkAdvanceOk === false,
    JSON.stringify(failedAdvanceHealth));

  /* ۳) هر مسیر هنوز در برابر ورودِ دوباره از خودش محافظت می‌شود */
  let inside = 0, maxInside = 0;
  const slow = {
    async fetchReplicateBatch() { inside++; maxInside = Math.max(maxInside, inside); await sleep(30); inside--; return []; },
    async advanceWatermark() {}
  };
  const w2 = createWorker({ store: { outbox: [] }, outbox: slow, handlers: {}, intervalMs: 1000 });
  const [a, b] = await Promise.all([w2.tickReplicate(), w2.tickReplicate()]);
  chk('tickReplicate re-entrancy guard intact', maxInside === 1 && (a.skippedBusy || b.skippedBusy), 'maxInside=' + maxInside);

  /* ۳) tick و tickReplicate هم‌زمان اجرا می‌شوند، نه یکی روی دیگری */
  const r = await (async () => {
    const o = {
      async fetchPendingBatch() { await sleep(20); return []; },
      async fetchReplicateBatch() { await sleep(1); return []; },
      async advanceWatermark() {}
    };
    const w3 = createWorker({ store: { outbox: [] }, outbox: o, handlers: {}, intervalMs: 1000 });
    const p1 = w3.tick(); const p2 = w3.tickReplicate();
    return Promise.all([p1, p2]);
  })();
  chk('tick and tickReplicate do not block each other', !r[0].skippedBusy && !r[1].skippedBusy);

  console.log(fail ? '\nFAIL (' + fail + ')' : '\nALL PASS');
  process.exit(fail ? 1 : 0);
})();
