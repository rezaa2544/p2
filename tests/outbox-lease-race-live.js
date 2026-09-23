#!/usr/bin/env node
'use strict';

/*
 * Runtime Reliability — live PostgreSQL lease-fencing proof.
 * Requires DATABASE_URL. Never skips when the dependency is absent.
 *
 * Five verification passes, with two independent scenarios each:
 *   1 Functional: normal completion + long-running handler
 *   2 Boundary: lease expiry/reclaim + restart recovery
 *   3 Negative/Failure: stale completion + terminal DLQ transition
 *   4 Concurrency/Replay: two workers + duplicate replay
 *   5 Independent Regression: retry->success + idempotent DLQ replay
 */
const assert = require('assert');
const db = require('../server/db');
const { createOutbox } = require('../server/outbox');
const { createWorker } = require('../server/worker');

const LEASE_SECONDS = 1;
process.env.PAYESH_OUTBOX_LEASE_SECONDS = String(LEASE_SECONDS);

let checks = 0;
function check(name, condition, detail) {
  checks++;
  if (!condition) throw new Error(name + (detail ? ': ' + detail : ''));
  console.log('  PASS ' + name);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function addEvent(type, payload) {
  const store = { outbox: [] };
  const o = createOutbox({ store, db });
  const evt = await o.append({ type, collection: 'runtime_reliability', record_id: 1, actor_id: 1, version: 1, payload: payload || {} });
  return { store, outbox: o, id: evt.id };
}
async function cleanup(ids) {
  if (!ids.length || !db.isPostgres()) return;
  await db.query('DELETE FROM server_outbox_dlq WHERE outbox_id = ANY($1::bigint[])', [ids]);
  await db.query('DELETE FROM server_outbox WHERE id = ANY($1::bigint[])', [ids]);
}

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL required — live PostgreSQL dependency missing; FAIL, never skip.');
    process.exit(1);
  }

  const ids = [];
  try {
    const init = await db.init();
    assert.strictEqual(init.ok, true);
    assert.strictEqual(init.driver, 'postgres');

    console.log('\n=== Runtime Reliability — Live Lease Fencing ===');

    // PASS 1 — Functional / Happy Path
    {
      const x = await addEvent('rr.live.normal'); ids.push(x.id);
      const w = createWorker({ store: x.store, outbox: x.outbox, handlers: { 'rr.live.normal': async () => {} } });
      await w.tick();
      const row = (await db.query('SELECT status, retry_count, processing_token FROM server_outbox WHERE id=$1', [x.id])).rows[0];
      check('P1 normal claim/complete', row.status === 'processed' && row.processing_token === null);
    }
    {
      const x = await addEvent('rr.live.long'); ids.push(x.id);
      const w = createWorker({ store: x.store, outbox: x.outbox, handlers: {
        'rr.live.long': async () => { await sleep(LEASE_SECONDS * 1000 + 250); }
      }});
      await w.tick();
      const row = (await db.query('SELECT status FROM server_outbox WHERE id=$1', [x.id])).rows[0];
      check('P1 long-running handler completes when it still owns lease', row.status === 'processed');
    }

    // PASS 2 — Boundary / Edge
    {
      const x = await addEvent('rr.live.reclaim'); ids.push(x.id);
      const a = createWorker({ store: {}, outbox: createOutbox({ store: {}, db }), handlers: {
        'rr.live.reclaim': async () => { await sleep(LEASE_SECONDS * 1000 + 400); }
      }});
      const b = createWorker({ store: {}, outbox: createOutbox({ store: {}, db }), handlers: {
        'rr.live.reclaim': async () => {}
      }});
      const aRun = a.tick();
      await sleep(LEASE_SECONDS * 1000 + 150);
      await b.tick();
      await aRun;
      const row = (await db.query('SELECT status, processing_token FROM server_outbox WHERE id=$1', [x.id])).rows[0];
      check('P2 lease expiration permits reclaim', row.status === 'processed' && row.processing_token === null);
    }
    {
      const x = await addEvent('rr.live.restart'); ids.push(x.id);
      const claimant = createOutbox({ store: {}, db });
      const first = await claimant.fetchPendingBatch(1);
      assert.strictEqual(first.length, 1);
      await sleep(LEASE_SECONDS * 1000 + 150);
      const restarted = createWorker({ store: {}, outbox: createOutbox({ store: {}, db }), handlers: {
        'rr.live.restart': async () => {}
      }});
      await restarted.tick();
      const row = (await db.query('SELECT status FROM server_outbox WHERE id=$1', [x.id])).rows[0];
      check('P2 crash/restart recovery reclaims stale processing', row.status === 'processed');
    }

    // PASS 3 — Negative / Failure Injection
    {
      const x = await addEvent('rr.live.stale'); ids.push(x.id);
      const a = createWorker({ store: {}, outbox: createOutbox({ store: {}, db }), handlers: {
        'rr.live.stale': async () => { await sleep(LEASE_SECONDS * 1000 + 450); }
      }});
      const b = createWorker({ store: {}, outbox: createOutbox({ store: {}, db }), handlers: {
        'rr.live.stale': async () => {}
      }});
      const aRun = a.tick();
      await sleep(LEASE_SECONDS * 1000 + 150);
      await b.tick();
      await aRun;
      const row = (await db.query('SELECT status, last_error, processing_token FROM server_outbox WHERE id=$1', [x.id])).rows[0];
      check('P3 stale worker completion cannot overwrite newer owner', row.status === 'processed' && row.last_error === null && row.processing_token === null);
    }
    {
      const x = await addEvent('rr.live.dlq'); ids.push(x.id);
      const w = createWorker({ store: {}, outbox: createOutbox({ store: {}, db }), maxRetries: 1, handlers: {
        'rr.live.dlq': async () => { throw new Error('forced terminal failure'); }
      }});
      await w.tick();
      const row = (await db.query('SELECT status, processing_token FROM server_outbox WHERE id=$1', [x.id])).rows[0];
      const dlq = (await db.query('SELECT outbox_id, error_message, retry_count FROM server_outbox_dlq WHERE outbox_id=$1', [x.id])).rows;
      check('P3 failure during final transition is atomic DLQ + terminal state', row.status === 'dead_letter' && Number(row.retry_count) === 1 && row.processing_token === null && dlq.length === 1 && Number(dlq[0].retry_count) === 1 && /forced terminal failure/.test(dlq[0].error_message));
    }

    // PASS 4 — Concurrency / Replay / Resilience
    {
      const xs = [];
      for (let i = 0; i < 20; i++) { const x = await addEvent('rr.live.concurrent', { i }); xs.push(x); ids.push(x.id); }
      const seen = new Set();
      const make = () => createWorker({ store: {}, outbox: createOutbox({ store: {}, db }), handlers: {
        'rr.live.concurrent': async e => {
          await sleep(5);
          if (seen.has(Number(e.id))) throw new Error('duplicate claim');
          seen.add(Number(e.id));
        }
      }});
      await Promise.all([make().tick(), make().tick()]);
      const rows = (await db.query('SELECT id, status FROM server_outbox WHERE id = ANY($1::bigint[])', [xs.map(x => x.id)])).rows;
      check('P4 concurrent workers claim disjoint rows', seen.size === 20 && rows.length === 20 && rows.every(r => r.status === 'processed'));
    }
    {
      const x = await addEvent('rr.live.replay'); ids.push(x.id);
      let runs = 0;
      const w = createWorker({ store: {}, outbox: createOutbox({ store: {}, db }), handlers: {
        'rr.live.replay': async () => { runs++; }
      }});
      await w.tick();
      await w.tick();
      check('P4 processed event is not replayed on subsequent worker tick', runs === 1);
    }

    // PASS 5 — Independent Regression / Environment Re-run
    {
      const x = await addEvent('rr.live.retry'); ids.push(x.id);
      let runs = 0;
      const w = createWorker({ store: {}, outbox: createOutbox({ store: {}, db }), maxRetries: 3, handlers: {
        'rr.live.retry': async () => { runs++; if (runs === 1) throw new Error('retry once'); }
      }});
      await w.tick();
      await w.tick();
      const row = (await db.query('SELECT status, retry_count FROM server_outbox WHERE id=$1', [x.id])).rows[0];
      check('P5 existing retry/recovery behavior remains intact', runs === 2 && row.status === 'processed' && Number(row.retry_count) === 1, 'runs=' + runs + ' row=' + JSON.stringify(row));
    }
    {
      const x = await addEvent('rr.live.dlq-replay'); ids.push(x.id);
      const o = createOutbox({ store: {}, db });
      const claimed = await o.fetchPendingBatch(1);
      assert.strictEqual(claimed.length, 1);
      const token = claimed[0].processing_token;
      const first = await o.moveToDlq(claimed[0], 'replay-proof', token);
      const second = await o.moveToDlq(x.id, 'replay-proof');
      const dlq = (await db.query('SELECT COUNT(*)::int AS n FROM server_outbox_dlq WHERE outbox_id=$1', [x.id])).rows[0];
      const row = (await db.query('SELECT status, processing_token FROM server_outbox WHERE id=$1', [x.id])).rows[0];
      check('P5 DLQ replay is idempotent and remains terminal', first.ok === true && second.ok === true && Number(dlq.n) === 1 && row.status === 'dead_letter' && row.processing_token === null);
    }

    console.log('\nLIVE LEASE VERIFICATION: ' + checks + '/10 PASS');
  } finally {
    await cleanup(ids);
    await db.close();
  }
})().catch(err => {
  console.error('LIVE LEASE VERIFICATION FAILED:', err && err.stack || err);
  process.exit(1);
});
