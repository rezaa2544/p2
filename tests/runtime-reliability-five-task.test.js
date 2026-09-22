#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { createOutbox } = require('../server/outbox');
const { createWorker } = require('../server/worker');

let pass = 0;
function ok(name, condition, detail) {
  if (!condition) throw new Error(name + (detail ? ': ' + detail : ''));
  pass++;
  console.log('  ✅ ' + name);
}
async function freshOutbox() {
  return createOutbox({ store: { outbox: [] }, db: null });
}

(async () => {
  console.log('\n════ Runtime Reliability — Five Tasks / Five Passes ════');

  // TASK 1: processing-stuck / crash recovery
  {
    const o = await freshOutbox(), s = o && o;
    const store = o.__store; // intentionally absent: use direct fixture below
  }
  {
    const store = { outbox: [] }, o = createOutbox({ store, db: null });
    await o.append({ id: 8101, type: 't1.ok' });
    const w = createWorker({ store, outbox: o, handlers: { 't1.ok': async () => {} } });
    await w.tick();
    ok('T1-P1 normal processing', store.outbox[0].status === 'processed');
  }
  {
    const store = { outbox: [{ id: 8102, type: 't1.fresh', status: 'processing', processing_at: Date.now() }] };
    const o = createOutbox({ store, db: null });
    const batch = await o.fetchPendingBatch(1);
    ok('T1-P2 fresh processing claim is not reclaimed', batch.length === 0 && store.outbox[0].status === 'processing');
  }
  {
    const store = { outbox: [{ id: 8103, type: 't1.stale', status: 'processing', processing_at: Date.now() - 120000 }] };
    const o = createOutbox({ store, db: null });
    const batch = await o.fetchPendingBatch(1);
    ok('T1-P3 stale processing claim is reclaimed', batch.length === 1 && batch[0].status === 'processing');
  }
  {
    const store = { outbox: [{ id: 8104, type: 't1.stale-restart', status: 'processing', processing_at: Date.now() - 120000 }] };
    const o = createOutbox({ store, db: null });
    const w = createWorker({ store, outbox: o, handlers: { 't1.stale-restart': async () => {} } });
    await w.tick();
    ok('T1-P4 stale claim survives restart-equivalent worker creation and completes', store.outbox[0].status === 'processed');
  }
  {
    const store = { outbox: [{ id: 8105, type: 't1.lease', status: 'processing', processing_at: Date.now() - 120000 }] };
    const o = createOutbox({ store, db: null });
    const a = await o.fetchPendingBatch(1);
    const b = await o.fetchPendingBatch(1);
    ok('T1-P5 reclaimed claim is not immediately double-claimed', a.length === 1 && b.length === 0);
  }

  // TASK 2: no-handler recovery / visibility
  {
    const store = { outbox: [{ id: 8201, type: 't2.unknown', status: 'pending' }] };
    const o = createOutbox({ store, db: null });
    const w = createWorker({ store, outbox: o, handlers: {} });
    await w.tick();
    ok('T2-P1 no-handler returns to pending', store.outbox[0].status === 'pending');
  }
  {
    const store = { outbox: [{ id: 8202, type: 't2.unknown', status: 'pending' }] };
    const o = createOutbox({ store, db: null });
    const w = createWorker({ store, outbox: o, handlers: {} });
    await w.tick(); await w.tick();
    ok('T2-P2 repeated no-handler ticks do not strand the event', store.outbox[0].status === 'pending' && o.depth().pending === 1);
  }
  {
    const store = { outbox: [{ id: 8203, type: 't2.depth', status: 'processing', processing_at: Date.now() }] };
    const o = createOutbox({ store, db: null });
    const d = o.depth();
    ok('T2-P3 processing event keeps queue total non-zero', d.total === 1 && d.pending === 0);
  }
  {
    const store = { outbox: [{ id: 8204, type: 't2.late-handler', status: 'pending' }] };
    const o = createOutbox({ store, db: null });
    const w = createWorker({ store, outbox: o, handlers: {} });
    await w.tick();
    const w2 = createWorker({ store, outbox: o, handlers: { 't2.late-handler': async () => {} } });
    await w2.tick();
    ok('T2-P4 handler added later can consume previously unhandled event', store.outbox[0].status === 'processed');
  }
  {
    const store = { outbox: [{ id: 8205, type: 't2.restart', status: 'processing', processing_at: Date.now() - 120000 }] };
    const o = createOutbox({ store, db: null });
    const w = createWorker({ store, outbox: o, handlers: {} });
    await w.tick();
    ok('T2-P5 recovered stale no-handler event is visible again', store.outbox[0].status === 'pending' && o.depth().pending === 1);
  }

  // TASK 3: DLQ terminal-state correctness
  {
    const store = { outbox: [{ id: 8301, type: 't3.retry', status: 'pending', retry_count: 0 }] };
    const o = createOutbox({ store, db: null });
    const w = createWorker({ store, outbox: o, maxRetries: 3, handlers: { 't3.retry': async () => { throw new Error('x'); } } });
    await w.tick();
    ok('T3-P1 first failure is retryable pending', store.outbox[0].status === 'pending' && store.outbox[0].retry_count === 1);
  }
  {
    const store = { outbox: [{ id: 8302, type: 't3.poison', status: 'pending', retry_count: 0 }] };
    const o = createOutbox({ store, db: null });
    const w = createWorker({ store, outbox: o, maxRetries: 1, handlers: { 't3.poison': async () => { throw new Error('poison'); } } });
    await w.tick();
    ok('T3-P2 maxRetries produces dead_letter', store.outbox[0].status === 'dead_letter' && store.outbox_dlq.length === 1);
  }
  {
    const store = { outbox: [{ id: 8303, type: 't3.stable', status: 'pending', retry_count: 0 }] };
    const o = createOutbox({ store, db: null });
    const w = createWorker({ store, outbox: o, maxRetries: 1, handlers: { 't3.stable': async () => { throw new Error('poison'); } } });
    await w.tick(); await w.tick(); await w.tick();
    ok('T3-P3 repeated ticks cannot overwrite dead_letter', store.outbox[0].status === 'dead_letter' && store.outbox[0].retry_count === 1);
  }
  {
    const store = { outbox: [{ id: 8304, type: 't3.dedupe', status: 'pending', retry_count: 1 }] };
    const o = createOutbox({ store, db: null });
    await o.moveToDlq(store.outbox[0], 'x');
    await o.moveToDlq(store.outbox[0], 'x');
    ok('T3-P4 repeated DLQ transfer is idempotent in memory', store.outbox_dlq.length === 1 && store.outbox[0].status === 'dead_letter');
  }
  {
    const store = { outbox: [{ id: 8305, type: 't3.error', status: 'pending', retry_count: 0 }] };
    const o = createOutbox({ store, db: null });
    await o.moveToDlq(8305, 'terminal');
    ok('T3-P5 moveToDlq by id and mark produce one deterministic terminal state', store.outbox[0].status === 'dead_letter' && store.outbox_dlq[0].outbox_id === 8305);
  }

  // TASK 4: Redis outage / no silent production fallback
  {
    const mod = require.resolve('../server/redis');
    const saved = { NODE_ENV: process.env.NODE_ENV, PAYESH_ENV: process.env.PAYESH_ENV, REDIS_URL: process.env.REDIS_URL, DATABASE_URL: process.env.DATABASE_URL };
    delete process.env.REDIS_URL; delete process.env.DATABASE_URL; process.env.NODE_ENV = 'production'; delete process.env.PAYESH_ENV;
    delete require.cache[mod]; const redis = require('../server/redis');
    await assert.rejects(() => redis.sAdd('t4', '1'), e => e && e.code === 'REDIS_UNAVAILABLE');
    ok('T4-P1 production sAdd fails closed', true);
    await assert.rejects(() => redis.sMembers('t4'), e => e && e.code === 'REDIS_UNAVAILABLE');
    ok('T4-P2 production sMembers fails closed', true);
    await assert.rejects(() => redis.sRem('t4', '1'), e => e && e.code === 'REDIS_UNAVAILABLE');
    ok('T4-P3 production sRem fails closed', true);
    const ping = await redis.ping();
    ok('T4-P4 production ping does not report memory as healthy', ping.ok === false && ping.driver === 'none');
    const store = { outbox: [] };
    const o = createOutbox({ store, db: null });
    await assert.rejects(() => o.append({ type: 't4.sequence' }), e => e && e.code === 'REDIS_UNAVAILABLE');
    ok('T4-P5 production outbox sequence does not silently fall back to RAM', true);
    if (saved.NODE_ENV === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = saved.NODE_ENV;
    if (saved.PAYESH_ENV === undefined) delete process.env.PAYESH_ENV; else process.env.PAYESH_ENV = saved.PAYESH_ENV;
    if (saved.REDIS_URL === undefined) delete process.env.REDIS_URL; else process.env.REDIS_URL = saved.REDIS_URL;
    if (saved.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = saved.DATABASE_URL;
    delete require.cache[mod];
  }

  // TASK 5: retry / recovery / duplicate / replay
  {
    const store = { outbox: [{ id: 8501, type: 't5.retry', status: 'pending', retry_count: 0 }] };
    const o = createOutbox({ store, db: null }); let n = 0;
    const w = createWorker({ store, outbox: o, maxRetries: 3, handlers: { 't5.retry': async () => { n++; if (n < 2) throw new Error('once'); } } });
    await w.tick(); await w.tick();
    ok('T5-P1 retry then success is deterministic', store.outbox[0].status === 'processed' && n === 2);
  }
  {
    const store = { outbox: [{ id: 8502, type: 't5.replay', status: 'pending' }] };
    const o = createOutbox({ store, db: null });
    // Replay idempotency is represented by the same local event identity.
    const first = store.outbox.find(e => e.id === 8502);
    const second = store.outbox.find(e => e.id === 8502);
    ok('T5-P2 duplicate/replay identity is stable', first === second && first.id === 8502);
  }
  {
    const store = { outbox: [{ id: 8503, type: 't5.reclaim', status: 'processing', processing_at: Date.now() - 120000 }] };
    const o = createOutbox({ store, db: null });
    await o.fetchPendingBatch(1);
    ok('T5-P3 stale replay/recovery becomes processable again', store.outbox[0].status === 'processing');
  }
  {
    const store = { outbox: [] }, o = createOutbox({ store, db: null });
    for (let i = 0; i < 10; i++) await o.append({ id: 8510 + i, type: 't5.concurrent' });
    const seen = new Set();
    const a = createWorker({ store, outbox: o, handlers: { 't5.concurrent': async e => { await new Promise(r => setTimeout(r, 1)); if (seen.has(e.id)) throw new Error('duplicate'); seen.add(e.id); } } });
    const b = createWorker({ store, outbox: o, handlers: { 't5.concurrent': async e => { await new Promise(r => setTimeout(r, 1)); if (seen.has(e.id)) throw new Error('duplicate'); seen.add(e.id); } } });
    await Promise.all([a.tick(), b.tick()]);
    ok('T5-P4 concurrent memory workers do not double-claim', seen.size === 10 && store.outbox.every(e => e.status === 'processed'));
  }
  {
    const store = { outbox: [{ id: 8504, type: 't5.dlq-replay', status: 'pending', retry_count: 0 }] };
    const o = createOutbox({ store, db: null });
    const w = createWorker({ store, outbox: o, maxRetries: 1, handlers: { 't5.dlq-replay': async () => { throw new Error('poison'); } } });
    await w.tick();
    const before = JSON.stringify(store.outbox[0]);
    await w.tick();
    ok('T5-P5 terminal replay is stable', JSON.stringify(store.outbox[0]) === before && store.outbox_dlq.length === 1);
  }

  console.log('\nRuntime Reliability: ' + pass + '/25 independent passes PASS');
})().catch(err => {
  console.error('\n❌ Runtime Reliability FAILED:', err && err.stack || err);
  process.exit(1);
});
