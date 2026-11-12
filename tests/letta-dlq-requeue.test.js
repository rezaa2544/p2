'use strict';
/* tests/letta-dlq-requeue.test.js — LETTA / #454: dead-letter management guard.
   The DLQ is one-way for the worker (terminal dead_letter is never claimed —
   that contract is asserted by tests/outbox-runtime-reliability.test.js), so
   the ONLY way a dead_lettered event gets replayed is the operator path:
   listDead() + requeueDead(). This test proves:

     R1  a poison event lands in the DLQ (moveToDlq) and the source row is
         dead_letter
     R2  listDead() exposes the row (PG: server_outbox_dlq / RAM: the mirror)
     R3  requeueDead() removes the DLQ row and restores the source row to
         pending (retry_count and last_error reset)
     R4  the replayed event is then processed by the NORMAL worker (tick) —
         no parallel replay route was built
     R5  requeueDead refuses: unknown ref (NOT_IN_DLQ), and a source row that
         is no longer dead_letter (SOURCE_NOT_DEAD_LETTER)
     R6  re-DLQ after a requeue is NOT silently swallowed by the UNIQUE
         (outbox_id) + ON CONFLICT DO NOTHING path (this is exactly why
         requeueDead must DELETE the DLQ row)

   Run: node tests/letta-dlq-requeue.test.js */

const assert = require('assert');
const { createOutbox } = require('../server/outbox');
const { createWorker } = require('../server/worker');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log((ok ? '✅' : '❌') + ' ' + name + (detail ? ' — ' + detail : ''));
}

(async () => {
  const store = { outbox: [], outbox_dlq: [] };
  const outbox = createOutbox({ store, db: null });

  /* R1: poison event → DLQ (worker cannot claim dead_letter — R-verified
     by outbox-runtime-reliability; here we take it as the entry state) */
  const evt = await outbox.append({ type: 'letta.dead', collection: 'classes', record_id: 901, actor_id: 1, version: 2, payload: { school_id: 1 } });
  const dl = await outbox.moveToDlq(evt.id, 'poison: letta guard', null, 5);
  check('R1 poison event dead_lettered + DLQ row inserted', !!(dl && dl.ok && dl.status === 'dead_letter'), JSON.stringify(dl));

  /* the worker must NOT process it while dead_letter */
  const w0 = createWorker({ store, outbox, handlers: { 'letta.dead': async () => {} } });
  await w0.tick();
  check('R1b worker does not claim dead_letter', store.outbox[0].status === 'dead_letter', store.outbox[0].status);

  /* R2: listDead exposes it */
  const dead = await outbox.listDead(50);
  check('R2 listDead exposes the DLQ row', Array.isArray(dead) && dead.some((r) => Number(r.outbox_id != null ? r.outbox_id : r.id) === Number(evt.id)), 'rows=' + dead.length);

  /* R5a: unknown ref refused */
  const r5a = await outbox.requeueDead(999999);
  check('R5a unknown ref refused (NOT_IN_DLQ)', r5a && r5a.ok === false && r5a.reason === 'NOT_IN_DLQ', JSON.stringify(r5a));

  /* R3: requeue restores pending, clears retry/error, removes the DLQ row */
  const rq = await outbox.requeueDead(evt.id);
  check('R3 requeue ok → pending', rq && rq.ok === true && rq.status === 'pending', JSON.stringify(rq));
  const deadAfter = await outbox.listDead(50);
  check('R3b DLQ row removed by requeue', !deadAfter.some((r) => Number(r.outbox_id != null ? r.outbox_id : r.id) === Number(evt.id)));
  check('R3c source row pending with fresh budget', store.outbox[0].status === 'pending' && Number(store.outbox[0].retry_count) === 0 && store.outbox[0].last_error == null,
    'status=' + store.outbox[0].status + ' retries=' + store.outbox[0].retry_count);

  /* R6: re-DLQ the SAME event after requeue must succeed (not swallowed) */
  const dl2 = await outbox.moveToDlq(evt.id, 'poison again: letta guard', null, 3);
  check('R6 re-DLQ after requeue not swallowed (UNIQUE conflict avoided)', !!(dl2 && dl2.ok), JSON.stringify(dl2));

  /* R4: operator fixed the cause → requeue → NORMAL worker tick processes it */
  const rq2 = await outbox.requeueDead(evt.id);
  check('R4a second requeue ok', rq2 && rq2.ok === true, JSON.stringify(rq2));
  const w1 = createWorker({ store, outbox, handlers: { 'letta.dead': async () => {} } });
  await w1.tick();
  check('R4b replayed event processed by the normal worker path', store.outbox[0].status === 'processed', store.outbox[0].status);

  /* R5b: DLQ row present but the source is no longer dead_letter → refused.
     (After R4b the DLQ row is gone, so requeueing the id is NOT_IN_DLQ —
     asserted here too. The SOURCE_NOT_DEAD_LETTER guard fires on the
     mismatch case: a DLQ row whose source row moved on.) */
  const r5c = await outbox.requeueDead(evt.id);
  check('R5b-i requeue with no DLQ row refused (NOT_IN_DLQ)', r5c && r5c.ok === false && r5c.reason === 'NOT_IN_DLQ', JSON.stringify(r5c));
  store.outbox_dlq.push({ outbox_id: evt.id, type: 'letta.dead', collection: 'classes', record_id: 901, error_message: 'stale row', failed_at: new Date().toISOString() });
  const r5b = await outbox.requeueDead(evt.id);
  check('R5b-ii DLQ row with a non-dead_letter source refused (SOURCE_NOT_DEAD_LETTER)', r5b && r5b.ok === false && r5b.reason === 'SOURCE_NOT_DEAD_LETTER', JSON.stringify(r5b));
  check('R5b-iii the stale DLQ row survived the refusal', store.outbox_dlq.length === 1);

  console.log('────────────────────────────────────────────');
  console.log('letta-dlq-requeue: ' + pass + ' pass / ' + fail + ' fail');
  console.log('CHECKS ' + (pass + fail) + ' FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL ' + (e && e.message)); process.exit(1); });
