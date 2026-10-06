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

  /* ۲) هر مسیر هنوز در برابر ورودِ دوباره از خودش محافظت می‌شود */
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
