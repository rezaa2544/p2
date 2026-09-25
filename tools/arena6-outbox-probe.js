#!/usr/bin/env node
/* Arena6 — Event Reliability Adversarial Probe (memory mode, direct modules)
   Scenarios: Normal / Duplicate / Crash / Retry / Concurrency / Hang / Cap
   Run: node /home/user/arena6-outbox-probe.js   (exit 0 = probes ran; verdicts printed) */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const ROOT = '/home/user/p2';
const { createOutbox } = require(path.join(ROOT, 'server/outbox.js'));
const { createWorker } = require(path.join(ROOT, 'server/worker.js'));

let pass = 0, fail = 0;
const chk = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra != null ? '  —  ' + String(extra).slice(0, 220) : '')); }
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('═'.repeat(66));
  console.log('Arena6 P-NORMAL — append → tick → processed');
  {
    const store = {};
    const obx = createOutbox({ store });
    let calls = 0;
    await obx.append({ type: 'classes.deleted', collection: 'classes', record_id: 1, payload: { school_id: 1 } });
    const w = createWorker({ store, outbox: obx, handlers: { 'classes.deleted': async () => { calls++; } }, maxRetries: 5 });
    const r1 = await w.tick();
    const r2 = await w.tick();
    const e = store.outbox[0];
    chk('N1 processed exactly once across 2 ticks', calls === 1 && r1.processed === 1 && r2.processed === 0, JSON.stringify({ calls, r1, r2 }));
    chk('N2 status=processed + processed_at set', e.status === 'processed' && !!e.processed_at, e.status);
    const d = obx.depth();
    chk('N3 depth reflects processed', d.processed === 1 && d.pending === 0, JSON.stringify(d));
  }

  console.log('Arena6 P-DUP1 — duplicate logical event (two enqueues) → both delivered (at-least-once allows dup)');
  {
    const store = {};
    const obx = createOutbox({ store });
    let calls = 0;
    const e1 = await obx.append({ type: 'classes.deleted', collection: 'classes', record_id: 9, payload: { school_id: 1 } });
    const e2 = await obx.append({ type: 'classes.deleted', collection: 'classes', record_id: 9, payload: { school_id: 1 } });
    chk('DUP1a distinct ids assigned', e1.id !== e2.id, e1.id + ' vs ' + e2.id);
    const w = createWorker({ store, outbox: obx, handlers: { 'classes.deleted': async () => { calls++; } }, maxRetries: 5 });
    await w.tick();
    chk('DUP1b both delivered (consumer must be idempotent)', calls === 2 && store.outbox.every(x => x.status === 'processed'), 'calls=' + calls);
    /* consumer-side idempotency of the REAL handler contract: cache.invalidateCollection
       is a set-delete op — verify double-invalidation is a no-op via fake cache */
    let size = 3;
    const fakeCache = { set: new Set(['a','b','c']), invalidateCollection() { this.set.clear(); } };
    fakeCache.invalidateCollection('classes', 1);
    const after1 = fakeCache.set.size;
    fakeCache.invalidateCollection('classes', 1);
    chk('DUP1c real handler pattern (cache invalidate) idempotent', after1 === 0 && fakeCache.set.size === 0, after1);
  }

  console.log('Arena6 P-DUP2 — concurrency: parallel ticks + two workers, same store');
  {
    const store = {};
    const obx = createOutbox({ store });
    let calls = 0;
    await obx.append({ type: 'evt.x' });
    const mk = () => createWorker({ store, outbox: obx, handlers: { 'evt.x': async () => { calls++; await sleep(30); } }, maxRetries: 5 });
    const [a, b, c] = await Promise.all([mk().tick(), mk().tick(), mk().tick()]);
    /* three DIFFERENT worker instances share store+outbox (worst case multi-worker in-process) */
    const results = [a, b, c];
    const processedSum = results.reduce((s, r) => s + (r.processed || 0), 0);
    const busy = results.filter(r => r.skippedBusy).length;
    chk('C1 exactly one delivery across 3 concurrent workers', calls === 1 && processedSum === 1, JSON.stringify({ calls, results }));
    /* same worker, parallel ticks (re-entry guard) */
    const store2 = {}; const obx2 = createOutbox({ store: store2 });
    let c2 = 0;
    await obx2.append({ type: 'evt.y' });
    const w2 = createWorker({ store: store2, outbox: obx2, handlers: { 'evt.y': async () => { c2++; await sleep(30); } } });
    const rr = await Promise.all([w2.tick(), w2.tick(), w2.tick()]);
    chk('C2 same-worker re-entry guard (running flag)', c2 === 1 && rr.filter(x => x.skippedBusy).length === 2, JSON.stringify({ c2, rr }));
    console.log('   (busy=' + busy + ')');
  }

  console.log('Arena6 P-RETRY — failing handler: retry → maxRetries → failed + DLQ, never deleted');
  {
    const store = {};
    const obx = createOutbox({ store });
    let calls = 0;
    await obx.append({ type: 'poison.pill', collection: 'x', record_id: 1 });
    const w = createWorker({ store, outbox: obx, handlers: { 'poison.pill': async () => { calls++; throw new Error('boom-' + calls); } }, maxRetries: 3 });
    await w.tick(); let e = store.outbox[0];
    chk('R1 retry_count=1, back to pending, error recorded', e.retry_count === 1 && e.status === 'pending' && /boom-1/.test(e.last_error), JSON.stringify({ rc: e.retry_count, st: e.status, le: e.last_error }));
    await w.tick(); e = store.outbox[0];
    chk('R2 retry_count=2 still pending', e.retry_count === 2 && e.status === 'pending', e.retry_count);
    await w.tick(); e = store.outbox[0];
    chk('R3 at maxRetries → terminal + NOT deleted', calls === 3 && e.retry_count === 3 && store.outbox.length === 1, JSON.stringify({ calls, rc: e.retry_count, st: e.status, len: store.outbox.length }));
    chk('R4 DLQ row created (memory)', Array.isArray(store.outbox_dlq) && store.outbox_dlq.length === 1 && /boom-3/.test(store.outbox_dlq[0].error_message), JSON.stringify(store.outbox_dlq || null));
    console.log('   R-final status =', e.status, '(worker marks failed AFTER moveToDlq marks dead_letter — observe overwrite)');
    chk('R5 final status consistent with DLQ contract', e.status === 'failed' || e.status === 'dead_letter', e.status);
    await w.tick(); e = store.outbox[0];
    chk('R6 dead event never re-claimed', calls === 3 && (e.status === 'failed' || e.status === 'dead_letter'), e.status);
  }

  console.log('Arena6 P-RETRY2 — transient failure then success (at-least-once, eventual processed)');
  {
    const store = {}; const obx = createOutbox({ store });
    let calls = 0;
    await obx.append({ type: 'transient.job' });
    const w = createWorker({ store, outbox: obx, handlers: { 'transient.job': async () => { calls++; if (calls === 1) throw new Error('flaky'); } }, maxRetries: 5 });
    await w.tick(); await w.tick();
    const e = store.outbox[0];
    chk('T1 failed once then processed, retry_count kept', calls === 2 && e.status === 'processed' && e.retry_count === 1, JSON.stringify({ calls, st: e.status, rc: e.retry_count }));
  }

  console.log('Arena6 P-CRASH1 — crash BEFORE claim (pending persisted) → recovery');
  {
    const tmp = path.join(os.tmpdir(), 'a6-crash1-' + Date.now() + '.json');
    const store = {}; const obx = createOutbox({ store });
    await obx.append({ type: 'classes.deleted', collection: 'classes', record_id: 77, payload: { school_id: 1 } });
    fs.writeFileSync(tmp, JSON.stringify(store)); /* process dies here */
    /* restart: fresh modules load persisted store */
    const store2 = JSON.parse(fs.readFileSync(tmp, 'utf8'));
    const obx2 = createOutbox({ store: store2 });
    let calls = 0;
    const w = createWorker({ store: store2, outbox: obx2, handlers: { 'classes.deleted': async () => { calls++; } } });
    await w.tick();
    chk('X1 pending survives crash → processed after restart (at-least-once)', calls === 1 && store2.outbox[0].status === 'processed', JSON.stringify({ calls, st: store2.outbox[0].status }));
    fs.unlinkSync(tmp);
  }

  console.log('Arena6 P-CRASH2 — crash AFTER claim (status=processing persisted) → ???');
  {
    const tmp = path.join(os.tmpdir(), 'a6-crash2-' + Date.now() + '.json');
    const store = {}; const obx = createOutbox({ store });
    await obx.append({ type: 'classes.deleted', collection: 'classes', record_id: 88, payload: { school_id: 1 } });
    /* worker claims (memory fetchPendingBatch flips to processing), then CRASH before mark */
    const claimed = await obx.fetchPendingBatch(10);
    chk('X2a claim flips state to processing', claimed.length === 1 && store.outbox[0].status === 'processing', store.outbox[0].status);
    fs.writeFileSync(tmp, JSON.stringify(store)); /* persist happened (any other dirty write) → crash */
    /* restart */
    const store2 = JSON.parse(fs.readFileSync(tmp, 'utf8'));
    const obx2 = createOutbox({ store: store2 });
    let calls = 0;
    const w = createWorker({ store: store2, outbox: obx2, handlers: { 'classes.deleted': async () => { calls++; } } });
    await w.tick(); await w.tick(); await w.tick();
    const st = store2.outbox[0].status;
    chk('X2b EVENT RECOVERED after claim-crash (at-least-once)', calls === 1 && st === 'processed', 'calls=' + calls + ' status=' + st + (calls === 0 ? '  <<< EVENT STUCK — at-least-once VIOLATED' : ''));
    fs.unlinkSync(tmp);
  }

  console.log('Arena6 P-CRASH3 — crash AFTER claim, store NOT yet persisted → recovery (control)');
  {
    /* crash before any persist: restarted store still says pending */
    const store = {}; const obx = createOutbox({ store });
    await obx.append({ type: 'evt.z' });
    await obx.fetchPendingBatch(10); /* RAM=processing, nothing written to disk */
    /* simulate restart with the ON-DISK image = pre-claim state */
    const onDisk = { outbox: store.outbox.map(e => Object.assign({}, e, { status: 'pending' })), __outbox_seq: store.__outbox_seq };
    const store2 = JSON.parse(JSON.stringify(onDisk));
    const obx2 = createOutbox({ store: store2 });
    let calls = 0;
    const w = createWorker({ store: store2, outbox: obx2, handlers: { 'evt.z': async () => { calls++; } } });
    await w.tick();
    chk('X3 pre-persist crash recovers (disk still pending)', calls === 1, 'calls=' + calls);
  }

  console.log('Arena6 P-CRASH4 — PG claim-then-crash: static contract check (no live PG here)');
  {
    /* Prove from source that every recovery path filters status=pending only,
       while claim commits status=processing → orphan window. */
    const outboxSrc = fs.readFileSync(path.join(ROOT, 'server/outbox.js'), 'utf8');
    const replayOnlyPending = /FROM server_outbox WHERE status = 'pending'/.test(outboxSrc) &&
      !/FROM server_outbox WHERE status IN \('pending','processing'\)/.test(outboxSrc) &&
      !/status IN \('pending', ?'processing'\)/.test(outboxSrc);
    const claimSetsProcessing = /SET status = 'processing'/.test(outboxSrc);
    const anyReaper = /processing'\s*,\s*'pending'|SET status = 'pending' WHERE status = 'processing'|stale.*processing|processing.*requeue/i.test(outboxSrc);
    const idxSrc = fs.readFileSync(path.join(ROOT, 'server/index.js'), 'utf8');
    const bootRequeue = /replayPendingFromPg|processing/.test(idxSrc.match(/replayPendingFromPg[\s\S]{0,400}/) ? idxSrc.match(/replayPendingFromPg[\s\S]{0,400}/)[0] : '');
    chk('X4a claim commits status=processing (PG)', claimSetsProcessing);
    chk('X4b replay selects pending ONLY', replayOnlyPending);
    chk('X4c NO reaper/reset of processing→pending anywhere in outbox.js', !anyReaper);
    chk('X4d boot replay does not requeue processing rows', !bootRequeue || !/processing/.test(String(idxSrc.match(/replay[\s\S]{0,300}/) || '')));
    /* worker accepts 'processing' but ONLY sees it via fetchPendingBatch fallback: */
    const workerSrc = fs.readFileSync(path.join(ROOT, 'server/worker.js'), 'utf8');
    const workerAllowsProcessing = /status !== 'pending' && status !== 'processing'/.test(workerSrc);
    const fetchReturnsProcessing = /status = 'processing'[\s\S]{0,80}RETURNING|filter\(e => e.status === 'processing'\)/.test(outboxSrc);
    chk('X4e worker loop would process processing* only if fetch returned them', workerAllowsProcessing && !fetchReturnsProcessing,
      'workerAllows=' + workerAllowsProcessing + ' fetchReturnsProcessing=' + fetchReturnsProcessing);
    console.log('   ⇒ PG-mode window: claim UPDATE committed → process dies → row stuck status=processing forever.');
    console.log('     Memory-mode equivalent reproduced live above (X2b). PG live repro = MEASUREMENT GAP (no PG here).');
  }

  console.log('Arena6 P-HANG — handler never resolves → worker freeze, no timeout');
  {
    const store = {}; const obx = createOutbox({ store });
    await obx.append({ type: 'hang.job' });
    const w = createWorker({ store, outbox: obx, handlers: { 'hang.job': () => new Promise(() => {}) }, intervalMs: 50 });
    const t0 = Date.now();
    const first = w.tick();               /* this tick will never settle */
    await sleep(200);
    const second = await w.tick();        /* re-entry guard: skipped */
    chk('H1 concurrent tick skipped while hung (running stuck true)', second.skippedBusy === true, JSON.stringify(second));
    const h1 = w.health();
    await sleep(3000);
    const h2 = w.health();
    chk('H2 lastTickAge grows while hung (health exposes freeze)', h2.lastTickAgeMs > h1.lastTickAgeMs && h2.lastTickAgeMs > 2500, JSON.stringify({ h1: h1.lastTickAgeMs, h2: h2.lastTickAgeMs }));
    chk('H3 NO handler timeout: event still processing after 3.2s+', store.outbox[0].status === 'processing', store.outbox[0].status);
    const healthy = w.isHealthy(3000);
    chk('H4 isHealthy(3s threshold) flips false on freeze', healthy === false, healthy);
    console.log('   (first tick promise intentionally left pending — process exits)');
  }

  console.log('Arena6 P-CAP — OUTBOX_CAP boundary (memory head-drop)');
  {
    const store = {}; const obx = createOutbox({ store });
    for (let i = 0; i < 1005; i++) await obx.append({ type: 'bulk.evt', record_id: i });
    const d = obx.depth();
    const oldestSurvived = store.outbox[0].record_id;
    chk('CAP1 length capped at 1000', store.outbox.length === 1000, store.outbox.length);
    chk('CAP2 oldest pending events DROPPED in memory mode (loss window)', oldestSurvived === 5 && d.pending === 1000, 'oldest.record_id=' + oldestSurvived);
    console.log('   ⇒ 5 pending events silently dropped (memory dev mode only; PG worker claims from table, not RAM).');
  }

  console.log('═'.repeat(66));
  console.log('ARENA6 PROBE VERDICTS: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(0);
})().catch(e => { console.error('PROBE_FATAL', e); process.exit(2); });
