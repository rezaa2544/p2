#!/usr/bin/env node
'use strict';

/* Arena 9 (hermeticity): this is an in-process unit contract on the JSON
   store (db:null, no redis.init()). outbox.nextId() intentionally
   fail-closes when DATABASE_URL/production is ambient but Redis is not
   initialised — correct for the server, a false red for this unit
   harness when run from a live-PG shell. Pin the dev posture explicitly
   BEFORE the modules load. The fail-closed behaviour itself is covered by
   the live suites (phase2-redis-fail-closed, chaos-drill-redis-outage). */
delete process.env.DATABASE_URL;
delete process.env.READ_DATABASE_URL;
delete process.env.REDIS_URL;
process.env.NODE_ENV = process.env.NODE_ENV === 'production' ? 'test' : (process.env.NODE_ENV || 'test');
if (process.env.PAYESH_ENV === 'production') process.env.PAYESH_ENV = 'test';

const assert = require('assert');
const { createOutbox } = require('../server/outbox');
const { createWorker } = require('../server/worker');

let passes = 0;
function pass(name) { passes++; console.log('  ✅ ' + name); }

(async () => {
  console.log('\n════ Runtime Reliability: Outbox / Worker / Redis ════');

  // 1. Normal processing
  {
    const store = { outbox: [] };
    const outbox = createOutbox({ store, db: null });
    await outbox.append({ id: 7001, type: 'rr.ok' });
    const worker = createWorker({ store, outbox, handlers: { 'rr.ok': async () => {} } });
    await worker.tick();
    assert.strictEqual(store.outbox[0].status, 'processed');
    pass('Pass 1: normal processing');
  }

  // 2. Crash after claim: durable processing state + lease
  {
    const store = { outbox: [] };
    const outbox = createOutbox({ store, db: null });
    await outbox.append({ id: 7002, type: 'rr.crash' });
    const claimed = await outbox.fetchPendingBatch(1);
    assert.strictEqual(claimed[0].status, 'processing');
    assert.ok(claimed[0].processing_at);
    pass('Pass 2: crash window is represented as processing + lease timestamp');
  }

  // 3. Restart/recovery: stale processing is reclaimed
  {
    const store = { outbox: [] };
    const outbox = createOutbox({ store, db: null });
    await outbox.append({ id: 7003, type: 'rr.recover' });
    const claimed = await outbox.fetchPendingBatch(1);
    claimed[0].processing_at = Date.now() - 120000;
    const worker = createWorker({ store, outbox, handlers: { 'rr.recover': async () => {} } });
    await worker.tick();
    assert.strictEqual(store.outbox[0].status, 'processed');
    pass('Pass 3: stale processing is recovered after restart-equivalent tick');
  }

  // 4. No handler must not strand the event as processing.
  {
    const store = { outbox: [] };
    const outbox = createOutbox({ store, db: null });
    await outbox.append({ id: 7004, type: 'rr.no-handler' });
    const worker = createWorker({ store, outbox, handlers: {} });
    await worker.tick();
    assert.strictEqual(store.outbox[0].status, 'pending');
    assert.strictEqual(outbox.depth().pending, 1);
    pass('Pass 4: no-handler event remains visible as pending');
  }

  // 5. Concurrent workers must claim disjoint work.
  {
    const store = { outbox: [] };
    const outbox = createOutbox({ store, db: null });
    for (let i = 0; i < 20; i++) await outbox.append({ id: 7100 + i, type: 'rr.concurrent' });
    const aSeen = [], bSeen = [];
    const a = createWorker({ store, outbox, handlers: { 'rr.concurrent': async e => { await new Promise(r => setTimeout(r, 1)); aSeen.push(e.id); } } });
    const b = createWorker({ store, outbox, handlers: { 'rr.concurrent': async e => { await new Promise(r => setTimeout(r, 1)); bSeen.push(e.id); } } });
    await Promise.all([a.tick(), b.tick()]);
    assert.strictEqual(aSeen.length + bSeen.length, 20);
    assert.strictEqual(aSeen.filter(id => bSeen.includes(id)).length, 0);
    pass('Pass 5: concurrent workers process 20 events with zero overlap');
  }

  // DLQ terminal state must not be overwritten by the worker's old failed mark.
  {
    const store = { outbox: [] };
    const outbox = createOutbox({ store, db: null });
    await outbox.append({ id: 7201, type: 'rr.poison' });
    let attempts = 0;
    const worker = createWorker({
      store, outbox, maxRetries: 2,
      handlers: { 'rr.poison': async () => { attempts++; throw new Error('poison'); } }
    });
    await worker.tick();
    await worker.tick();
    assert.strictEqual(attempts, 2);
    assert.strictEqual(store.outbox[0].status, 'dead_letter');
    assert.strictEqual(store.outbox_dlq.length, 1);
    await worker.tick();
    assert.strictEqual(attempts, 2);
    assert.strictEqual(store.outbox[0].status, 'dead_letter');
    pass('DLQ regression: terminal dead_letter survives repeated ticks');
  }

  // Redis sAdd/sMembers/sRem must fail closed when production has no Redis.
  {
    const mod = require.resolve('../server/redis');
    const saved = { NODE_ENV: process.env.NODE_ENV, REDIS_URL: process.env.REDIS_URL, DATABASE_URL: process.env.DATABASE_URL };
    delete process.env.REDIS_URL;
    delete process.env.DATABASE_URL;
    process.env.NODE_ENV = 'production';
    delete require.cache[mod];
    const redis = require('../server/redis');
    for (const op of [
      () => redis.sAdd('rr:set', '1'),
      () => redis.sMembers('rr:set'),
      () => redis.sRem('rr:set', '1')
    ]) {
      await assert.rejects(op, e => e && e.code === 'REDIS_UNAVAILABLE');
    }
    process.env.NODE_ENV = saved.NODE_ENV;
    if (saved.REDIS_URL === undefined) delete process.env.REDIS_URL; else process.env.REDIS_URL = saved.REDIS_URL;
    if (saved.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = saved.DATABASE_URL;
    delete require.cache[mod];
    pass('Redis regression: production set operations cannot silently fall back to RAM');
  }

  console.log('\nRuntime Reliability: ' + passes + ' independent passes + DLQ/Redis regressions PASS');
})().catch(err => {
  console.error('\n❌ Runtime Reliability FAILED:', err && err.stack || err);
  process.exit(1);
});
