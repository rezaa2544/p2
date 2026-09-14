#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   outbox-replay-idempotency.js — C3-04 idempotency regression (one case)
   ───────────────────────────────────────────────────────────────────
   Pins the crash-replay idempotency contract of the server outbox
   (F3, chaos-drill #185):

     server/outbox.js:146-185  replayPendingFromPg()
       - boot replays pending rows from server_outbox into store.outbox
         (server/index.js:551 — runs on every PG-live boot)
       - "best-effort and idempotent: an event already present in the
         store is NOT re-added"  (server/outbox.js:151-152)

   Before this test the only references to replayPendingFromPg outside
   server/outbox.js were the boot call site (server/index.js:551) — no
   regression coverage (verified 2026-09-14: grep across tests/ + tools/
   returns nothing).

   The at-least-once consumer contract depends on this: if a replay
   double-appended an event, every downstream consumer (cache
   invalidation, worker lifecycle) would run twice per boot.

   Deterministic: no live PG (the db handle is injected per the
   createOutbox({store, db}) seam), no network, no timers.

   Exit codes: 0 = green · 1 = check failed
   Usage: node tests/outbox-replay-idempotency.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const path = require('path');

const ROOT = path.join(__dirname, '..');
const NAME = 'outbox-replay-idempotency';
const { createOutbox } = require(path.join(ROOT, 'server', 'outbox'));

let pass = 0, fail = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; fails.push(name); console.log('  ❌ ' + name + (extra ? '  —  ' + String(extra).slice(0, 300) : '')); }
}

/* Fake PG stand-in for the createOutbox({store, db}) seam.
   Answers ONLY the pending-select issued by replayPendingFromPg;
   payloads are always stringified like a real PG json column. */
function makeFakePg(pendingRows) {
  const seen = [];
  return {
    isPostgres: () => true,
    query: async (sql, params) => {
      seen.push({ sql, params });
      if (/FROM server_outbox WHERE status = 'pending'/.test(sql)) {
        return {
          rows: pendingRows.map(r => Object.assign({}, r, {
            payload: typeof r.payload === 'string' ? r.payload : JSON.stringify(r.payload)
          })),
          rowCount: pendingRows.length
        };
      }
      return { rows: [], rowCount: 0 };
    },
    _seen: seen
  };
}

const PENDING = [
  { id: 1, type: 'record_deleted', collection: 'grades', record_id: 10, actor_id: 7, version: 3, payload: { reason: 'audit' }, created_at: '2026-09-14T10:00:00.000Z', retry_count: 0, last_error: null },
  { id: 2, type: 'record_updated', collection: 'users', record_id: 5, actor_id: 7, version: 9, payload: 'string-payload', created_at: '2026-09-14T10:01:00.000Z', retry_count: 1, last_error: 'boom' },
  { id: 3, type: 'record_deleted', collection: 'classes', record_id: 2, actor_id: 1, version: 1, payload: null, created_at: '2026-09-14T10:02:00.000Z', retry_count: 0, last_error: null }
];
const countId = (outbox, id) => outbox.filter(e => Number(e.id) === id).length;

(async function main() {
  console.log(NAME + ' — crash-replay must never double-append (F3)\n');

  /* ── R1: fresh store + 3 pending PG rows ⇒ all three land, payload revived ── */
  {
    const store = { outbox: [] };
    const outbox = createOutbox({ store, db: makeFakePg(PENDING) });
    const r = await outbox.replayPendingFromPg();
    chk('R1a replay reports ok with driver=postgres', r.ok === true && r.driver === 'postgres', JSON.stringify(r));
    chk('R1b all 3 pending events replayed', r.replayed === 3 && store.outbox.length === 3, 'replayed=' + r.replayed + ' len=' + store.outbox.length);
    chk('R1c replayed events are pending with PG metadata', store.outbox.every(e => e.status === 'pending') && store.outbox[0].retry_count === 0 && store.outbox[1].retry_count === 1, JSON.stringify(store.outbox.slice(0, 2)));
    chk('R1d valid-JSON string payload revived to object (PG json column shape)', store.outbox[0].payload && typeof store.outbox[0].payload === 'object' && store.outbox[0].payload.reason === 'audit', JSON.stringify(store.outbox[0].payload));
    chk('R1e non-JSON string payload kept verbatim (parse-failure branch)', store.outbox[1].payload === 'string-payload', JSON.stringify(store.outbox[1].payload));
  }

  /* ── R2: store already holds id 2 ⇒ NO double-append, pre-existing untouched ── */
  {
    const preExisting = { id: 2, type: 'record_updated', collection: 'users', record_id: 5, actor_id: 7, version: 9, payload: { already: 'applied' }, created_at: '2026-09-14T09:00:00.000Z', status: 'processed' };
    const store = { outbox: [preExisting] };
    const outbox = createOutbox({ store, db: makeFakePg(PENDING) });
    const r = await outbox.replayPendingFromPg();
    chk('R2a only the 2 missing events replayed', r.replayed === 2, 'replayed=' + r.replayed);
    chk('R2b id 2 NOT double-appended (count stays 1)', countId(store.outbox, 2) === 1, 'count(id2)=' + countId(store.outbox, 2));
    chk('R2c pre-existing id 2 object untouched (still processed)', store.outbox.find(e => Number(e.id) === 2) === preExisting && preExisting.status === 'processed');
    chk('R2d store length = 1 pre-existing + 2 replayed = 3', store.outbox.length === 3, 'len=' + store.outbox.length);
  }

  /* ── R3: second replay call on the same state ⇒ nothing added (idempotent) ── */
  {
    const store = { outbox: [] };
    const db = makeFakePg(PENDING);
    const outbox = createOutbox({ store, db });
    const r1 = await outbox.replayPendingFromPg();
    const lenAfterFirst = store.outbox.length;
    const r2 = await outbox.replayPendingFromPg();
    chk('R3a first replay adds 3', r1.replayed === 3 && lenAfterFirst === 3);
    chk('R3b second replay adds 0 (call-level idempotency)', r2.replayed === 0 && r2.ok === true, 'replayed=' + r2.replayed);
    chk('R3c store unchanged after second replay', store.outbox.length === lenAfterFirst, 'len=' + store.outbox.length);
  }

  /* ── R4: memory mode (no PG) ⇒ clean no-op ── */
  {
    const store = { outbox: [{ id: 99, status: 'pending' }] };
    const outbox = createOutbox({ store, db: { isPostgres: () => false, query: async () => { throw new Error('must not be queried in memory mode'); } } });
    const r = await outbox.replayPendingFromPg();
    chk('R4a memory mode is a clean no-op (ok, replayed 0, driver memory)', r.ok === true && r.replayed === 0 && r.driver === 'memory', JSON.stringify(r));
    chk('R4b store untouched in memory mode', store.outbox.length === 1);
  }

  /* ── R5: PG query failure mid-replay ⇒ fail closed, no crash, no partial claim ── */
  {
    const store = { outbox: [] };
    const db = { isPostgres: () => true, query: async () => { throw new Error('connection reset'); } };
    const outbox = createOutbox({ store, db });
    const r = await outbox.replayPendingFromPg();
    chk('R5a replay failure returns ok:false with error text', r.ok === false && /connection reset/.test(String(r.error)), JSON.stringify(r));
    chk('R5b nothing replayed on failure', r.replayed === 0 && store.outbox.length === 0, 'len=' + store.outbox.length);
  }

  /* ── R6: the select is bounded (LIMIT = OUTBOX_CAP) and ordered by id ── */
  {
    const db = makeFakePg([]);
    const store = { outbox: [] };
    const outbox = createOutbox({ store, db });
    await outbox.replayPendingFromPg();
    const q = db._seen.find(x => /FROM server_outbox/.test(x.sql));
    chk('R6a pending-select uses the capped LIMIT parameter', !!q && Array.isArray(q.params) && q.params[0] === outbox.cap, JSON.stringify(q && q.params));
    chk('R6b pending-select orders by id ASC (deterministic replay order)', !!q && /ORDER BY id ASC/.test(q.sql), q && q.sql.slice(0, 120));
  }

  console.log('\n' + NAME + ': ' + pass + '/' + (pass + fail) + (fails.length ? '  FAILED: ' + fails.join(' | ') : ''));
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.log(NAME + ': harness error: ' + (e && e.message ? e.message : e));
  process.exit(1);
});
