/* ─────────────────────────────────────────────────────────────
   wave10-db-scale.js — Database Scale: Read Replica + Pool Observability
   -------------------------------------------------------------------
   Wave 10 (chat2): verify the additive read-replica + observability seam in
   server/db.js WITHOUT a live PostgreSQL — fake primary + fake read pools are
   injected via the __setPoolForTests / __setReadPoolForTests seams.

   D0  No PG / no replica → memory driver; queryRead falls back to query (empty)
   D1  isReplicaActive / getReadPool reflect the injected read pool
   D2  queryRead() routes READ SQL to the replica pool (primary untouched)
   D3  queryRead() falls back to the PRIMARY when the replica query throws
   D4  writes (persistOp / transaction) always hit the PRIMARY, never the replica
   D5  readCollection / readOne (sync/pull correctness reads) stay on PRIMARY
   D6  dbquery.executePagedList prefers queryRead when db exposes it (routes
      page+count to replica); falls back to db.query for fake/old dbs
   D7  poolStats() reports primary + read replica + routing flag
   D8  close() tears down both pools

   Note (honest): a real PostgreSQL replica run is PENDING (no live PG in the
   CI sandbox). This suite verifies routing discipline + fallbacks via fakes.
   ───────────────────────────────────────────────────────────── */
'use strict';
const db = require('../server/db.js');
const { executePagedList } = require('../server/dbquery.js');

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}

function fakePool(tag, rowsFn, { failQuery = false, total = 4, idle = 2, waiting = 0 } = {}) {
  const p = {
    tag,
    calls: [],
    releaseCount: 0,
    totalCount: total, idleCount: idle, waitingCount: waiting,
    query: async function (t) {
      if (failQuery) throw new Error('boom:' + tag);
      this.calls.push(String(t));
      const rows = rowsFn ? rowsFn(String(t)) : [];
      return { rows, rowCount: rows.length };
    },
    /* transaction() leases a client via connect(); log into the same calls array */
    connect: async function () {
      const client = {
        query: async (t) => {
          if (failQuery) throw new Error('boom:' + tag);
          p.calls.push(String(t));
          const rows = rowsFn ? rowsFn(String(t)) : [];
          return { rows, rowCount: rows.length };
        },
        release: function () { p.releaseCount++; }
      };
      return client;
    },
    end: async function () { this.ended = true; }
  };
  return p;
}
const rowsPage = () => [{ id: 5, name: 'x' }, { id: 6, name: 'y' }, { id: 7, name: 'z' }];
const rowsCount = () => [{ n: 100 }];

(async () => {
  console.log('\n▸ Wave 10 — Database Scale (read replica + pool observability, fake PG)');
  db.__setPoolForTests(null);
  db.__setReadPoolForTests(null);

  /* ── D0: بدون PG / بدون رپلیکا ── */
  let r0 = await db.queryRead('SELECT 1');   /* no PG → query() returns empty */
  chk('D0a queryRead بدون PG خالی برمی‌گردد', r0 && Array.isArray(r0.rows) && r0.rows.length === 0, JSON.stringify(r0));
  const s0 = db.poolStats();
  chk('D0b poolStats: درایور memory + رپلیکا غیرفعال', s0.driver === 'memory'
    && s0.read_replica && s0.read_replica.active === false, JSON.stringify(s0));
  chk('D0c isReplicaActive خاموش است', db.isReplicaActive() === false);

  /* ── D1: تزریق هر دو pool ── */
  const prim = fakePool('primary', rowsPage);
  const repl = fakePool('replica', rowsPage);
  db.__setPoolForTests(prim);
  db.__setReadPoolForTests(repl);
  chk('D1a isReplicaActive روشن شد', db.isReplicaActive() === true);
  chk('D1b getReadPool همان رپلیکاست', db.getReadPool() === repl);
  chk('D1c isPostgres روشن شد', db.isPostgres() === true);

  /* ── D2: queryRead به رپلیکا می‌رود ── */
  await db.queryRead('SELECT * FROM grades WHERE school_id=$1', [1]);
  chk('D2a queryRead SQL را روی رپلیکا زد', repl.calls.length === 1 && repl.calls[0].indexOf('SELECT * FROM grades') === 0, JSON.stringify(repl.calls));
  chk('D2b پرماری دست نخورد', prim.calls.length === 0, JSON.stringify(prim.calls));
  /* کوئریِ عمومی (query) همچنان پرماری است — فقط queryRead رپلیکاست */
  await db.query('SELECT * FROM grades');
  chk('D2c query عمومی روی پرماری می‌ماند', prim.calls.length === 1, JSON.stringify(prim.calls));

  /* ── D3: fallback وقتی رپلیکا خطا می‌دهد ── */
  db.__setReadPoolForTests(fakePool('replica_bad', rowsPage, { failQuery: true }));
  prim.calls.length = 0;
  const r3 = await db.queryRead('SELECT 1 AS ping');
  chk('D3a در شکستِ رپلیکا روی پرماری می‌افتد', prim.calls.length === 1, JSON.stringify(prim.calls));
  chk('D3b نتیجه از fallback سالم برگشت', !!r3 && Array.isArray(r3.rows), JSON.stringify(r3));
  chk('D3c رپلیکای مرده خاموش شد (روتر برنگردد)', db.isReplicaActive() === false);
  db.__setReadPoolForTests(null);           /* پاک‌سازی → queryRead دوباره پرماری */

  /* ── D4: نوشتن‌ها هرگز به رپلیکا نمی‌روند ── */
  db.__setPoolForTests(prim);
  db.__setReadPoolForTests(repl);
  prim.calls.length = 0; repl.calls.length = 0;
  await db.persistOp({ uid: 'u1', c: 'grades', t: 'ins', data: { id: 99, score: 19 } });
  chk('D4a persistOp روی پرماری است (INSERT grades)', prim.calls.some(q => q.indexOf('INSERT INTO grades') === 0), JSON.stringify(prim.calls));
  chk('D4b رپلیکا هیچ نوشتنی نگرفت', repl.calls.length === 0, JSON.stringify(repl.calls));
  /* persistOpsBatch → transaction → pool.connect روی پرماری */
  const r4 = await db.persistOpsBatch([{ uid: 'u2', c: 'grades', t: 'upd', data: { id: 99, score: 20 } }]);
  chk('D4c دستهٔ اتمیک روی پرماری (BEGIN..COMMIT)', r4 && r4.driver === 'postgres'
    && prim.calls.some(q => q === 'BEGIN') && prim.calls.some(q => q === 'COMMIT'), JSON.stringify(r4));

  /* ── D5: readCollection/readOne (همگام/پول) روی پرماری ── */
  prim.calls.length = 0; repl.calls.length = 0;
  const coll = await db.readCollection('grades');
  chk('D5a readCollection روی پرماری خواند', prim.calls.some(q => q.indexOf('SELECT * FROM "grades"') === 0)
    && repl.calls.length === 0, JSON.stringify(prim.calls) + ' / ' + JSON.stringify(repl.calls));
  chk('D5b ردیف‌ها برگشت', Array.isArray(coll) && coll.length >= 1);

  /* ── D6: dbquery.executePagedList مسیرِ خوانشِ سنگین را به رپلیکا می‌رود ── */
  prim.calls.length = 0; repl.calls.length = 0;
  const built = {
    page: { sql: 'SELECT ... grades LIMIT $1', params: [11] },
    count: { sql: 'SELECT COUNT(*) n FROM grades', params: [] }
  };
  const prim6 = fakePool('primary', rowsPage);
  const repl6 = fakePool('replica', (sql) => (sql.indexOf('COUNT') >= 0 ? rowsCount() : rowsPage()));
  db.__setPoolForTests(prim6);
  db.__setReadPoolForTests(repl6);
  const r6 = await executePagedList(db, built, { limit: 10, cursor: null });
  chk('D6a صفحهٔ list از db.queryRead رفته → رپلیکا', repl6.calls.length >= 1
    && repl6.calls.some(q => q.indexOf('LIMIT') >= 0), JSON.stringify(repl6.calls));
  chk('D6b count هم روی رپلیکا', repl6.calls.some(q => q.indexOf('COUNT(*)') >= 0), JSON.stringify(repl6.calls));
  chk('D6c پرماری در این list دست نمی‌خورد', prim6.calls.length === 0, JSON.stringify(prim6.calls));
  chk('D6d شکلِ صفحه (data+pagination) درست است', !!r6 && Array.isArray(r6.data) && r6.pagination && r6.pagination.total === 100, JSON.stringify(r6 && r6.pagination));
  /* db بدون queryRead → db.query (سازگاری با dbهایِ قدیمی/جعلی) */
  const plainDb = { query: async (sql) => { plainDb.n = (plainDb.n || 0) + 1; return sql.indexOf('COUNT') >= 0 ? { rows: [{ n: 3 }] } : { rows: [{ id: 1 }, { id: 2 }, { id: 3 }] }; } };
  const r6p = await executePagedList(plainDb, built, { limit: 10, cursor: null });
  chk('D6e dbِ بدون queryRead با db.query سازگار است', !!r6p && r6p.data.length === 3 && plainDb.n === 2, 'n=' + plainDb.n);

  /* ── D7: poolStats ── */
  const s7 = db.poolStats();
  chk('D7a poolStats هر دو pool + پرچم مسیریابی را دارد', s7.driver === 'postgres'
    && s7.primary && s7.primary.max === 20 && s7.read_replica && s7.read_replica.active === true
    && s7.routing_reads_to_replica === true, JSON.stringify(s7));
  const h7 = await db.healthCheck();
  chk('D7b healthCheck رپلیکا را گزارش می‌کند', h7 && h7.read_replica && h7.read_replica.active === true, JSON.stringify(h7));

  /* ── D8: close هر دو pool را می‌بندد ── */
  const prim2 = fakePool('primary2', rowsPage);
  const repl2 = fakePool('replica2', rowsPage);
  db.__setPoolForTests(prim2);
  db.__setReadPoolForTests(repl2);
  await db.close();
  chk('D8a هر دو pool بسته شدند', prim2.ended === true && repl2.ended === true);
  chk('D8b پس از close: PG خاموش و رپلیکا خاموش', db.isPostgres() === false && db.isReplicaActive() === false);

  console.log('\n  جمع: ' + okc + ' موفق، ' + failc + ' ناموفق از ' + (okc + failc) + '\n');
  process.exit(failc ? 1 : 0);
})().catch((e) => { console.error('wave10-db-scale crashed:', e); process.exit(1); });
