'use strict';
/* tests/a36-core-coverage.test.js — A-36: unit coverage for the core server
   modules that the API lanes cannot reach. This file targets the outbox
   durable-replay machinery (the N-36/M15-05 watermark + replicate + retention)
   — the paths that only run in the dedicated background lanes:

     W1  readWatermark starts at 0 (RAM + a fresh instance id)
     W2  advanceWatermark is monotonic (an older id never moves it back)
     W3  replicateBacklog counts un-replicated cache.* events and reports the
         oldest
     W4  fetchReplicateBatch returns the cache.* events AFTER the watermark in
         id order (and NOTHING else — non-cache events excluded)
     W5  depth() reflects pending/processing/dead_letter counts
     W6  reapProcessed: the PG-only retention path returns 0 in memory mode
         (no silent fake success)

   Run: node tests/a36-core-coverage.test.js */

const assert = require('assert');
const { createOutbox, activeBacklog } = require('../server/outbox');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log((ok ? '✅' : '❌') + ' ' + name + (detail ? ' — ' + detail : ''));
}

(async () => {
  const store = { outbox: [], outbox_dlq: [] };
  const outbox = createOutbox({ store, db: null });

  /* W1 — the fresh watermark */
  const wm0 = await outbox.readWatermark();
  check('W1 fresh watermark = 0', Number(wm0) === 0, String(wm0));

  /* seed events: cache.* + a plain mutation */
  const c1 = await outbox.append({ type: 'cache.classes', collection: 'classes', record_id: 1, actor_id: 1, version: 1 });
  const p1 = await outbox.append({ type: 'classes.updated', collection: 'classes', record_id: 1, actor_id: 1, version: 2 });
  const c2 = await outbox.append({ type: 'cache.students', collection: 'students', record_id: 2, actor_id: 1, version: 1 });
  assert.ok(c1.id > 0 && p1.id > c1.id && c2.id > p1.id);

  /* W2 — monotonic advance */
  const adv1 = await outbox.advanceWatermark(c1.id);
  const wm1 = await outbox.readWatermark();
  check('W2a advance moves the watermark', adv1 === true && Number(wm1) === Number(c1.id), 'wm=' + wm1);
  const adv2 = await outbox.advanceWatermark(1); /* older id */
  const wm2 = await outbox.readWatermark();
  check('W2b an older id never moves the watermark back', adv2 === true && Number(wm2) === Number(c1.id), 'wm=' + wm2);
  const advBad = await outbox.advanceWatermark(0);
  check('W2c a non-positive id is rejected', advBad === false);

  /* W3 — the backlog */
  const bl = await outbox.replicateBacklog();
  check('W3 backlog counts cache.* events after the watermark only', bl.depth === 1 && bl.oldest != null, 'depth=' + bl.depth);
  /* W3b — activeBacklog() exposes the last-created outbox (it returns the
     replicateBacklog promise by design — the metrics probe awaits it) */
  const probe = await activeBacklog();
  check('W3b activeBacklog() exposes the last-created outbox', probe && Number(probe.depth) === 1, 'depth=' + (probe && probe.depth));

  /* W4 — the replicate batch: cache.* only, after the watermark, id order */
  const batch = await outbox.fetchReplicateBatch(50);
  check('W4a the batch = only cache.* events after the watermark', batch.length === 1 && String(batch[0].type).startsWith('cache.') && Number(batch[0].id) === Number(c2.id), 'n=' + batch.length);
  const defaulted = await outbox.fetchReplicateBatch(0); /* 0 = use the default batch size (documented semantics) */
  check('W4b a non-positive batch size = the documented default (returns the backlog)', Array.isArray(defaulted) && defaulted.length === 1, 'n=' + defaulted.length);

  /* W5 — depth */
  const d0 = outbox.depth();
  check('W5 depth reports the pending count', d0 && Number(d0.pending) === 3, 'pending=' + d0.pending);

  /* W6 — the PG-only retention in memory mode */
  const reaped = await outbox.reapProcessed(3600);
  check('W6 reapProcessed in memory mode = 0 (no fake success)', Number(reaped) === 0);

  console.log('────────────────────────────────────────────');
  console.log('a36-core-coverage: ' + pass + ' pass / ' + fail + ' fail');
  console.log('CHECKS ' + (pass + fail) + ' FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL ' + (e && e.message)); process.exit(1); });
