/* ─────────────────────────────────────────────────────────────
   sync-atomic-batch.js — آینهٔ اتمیکِ چندرکوردی (P1-14)
   ─────────────────────────────────────────────────────────────
   B1  بدون PG: میان‌بُرِ حافظه (ok، بدون throw)
   B2  شکلِ SQL تک‌op (upsert/حذف/ردیابی uid + رفتارهایِ نگه‌داشته‌شده)
   B3  persistOp می‌بلعد ولی persistOpWithClient می‌اندازد (پرتاب‌گرِ درونی)
   B4a تراکنشِ موفق: BEGIN … COMMIT + آزادسازی
   B4b تراکنشِ ناموفق: BEGIN … ROLLBACK (بدون COMMIT) + انتشارِ خطا + آزادسازی
   B5  شکستِ ROLLBACK: خطایِ اصلی منتشر می‌شود (نه خطایِ rollback)
   B6  دسته در اولین شکست می‌ایستد (count + throw)
   B7  سیم‌کشی sync.js: یک فراخوانیِ batch با شناسه‌هایِ اعمال‌شدهٔ سرور
   B8  شکستِ آینه برای کلاینت نامرئی است + audit می‌شود + JSON اعمال شده می‌ماند
   نکته: اتمی‌بودنِ واقعیِ PG برعهدهٔ خودِ PG است؛ این‌جا انضباطِ فراخوانیِ
   ما آزمون می‌شود (صدورِ ROLLBACK در شکست) با pool/client جعلی — بدونِ PG واقعی.
   ───────────────────────────────────────────────────────────── */
'use strict';
const db = require('../server/db.js');
const { createSync, attach } = require('../server/sync.js');
const { opX } = require('./helpers/opx');

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
function fakeClient(failWord, failRollback) {
  return {
    queries: [], releaseCount: 0,
    query: async function (t) {
      this.queries.push(t);
      if (failRollback && t === 'ROLLBACK') throw new Error('rb-boom');
      if (failWord && String(t).indexOf(failWord) >= 0) throw new Error('boom:' + String(t).slice(0, 40));
      return { rows: [], rowCount: 1 };
    },
    release: function () { this.releaseCount++; }
  };
}
function fakePool(client, failQuery) {
  return {
    connect: async () => client,
    query: async (t) => { if (failQuery) throw new Error('pool-boom'); client.queries.push(t); return { rows: [], rowCount: 1 }; },
    end: async () => {}
  };
}
const quiet = (fn) => { const e0 = console.error; console.error = () => {}; return Promise.resolve().then(fn).finally(() => { console.error = e0; }); };

(async () => {
  console.log('\n▸ P1-14 — آینهٔ اتمیکِ چندرکوردی (سرور، بدون PG)');

  /* ── B1: میان‌بُرِ حافظه ── */
  const r1 = await db.persistOpsBatch([{ c: 'a', t: 'ins', data: { id: 1 } }, { c: 'b', t: 'del', id: 2 }]);
  chk('B1 بدون PG: ok + شمارش درست', r1 && r1.ok === true && r1.driver === 'memory' && r1.count === 2, JSON.stringify(r1));
  const r1e = await db.persistOpsBatch([]);
  chk('B1b دستهٔ خالی: ok + صفر', r1e && r1e.ok === true && r1e.count === 0);

  /* ── B2: شکلِ SQL ── */
  const c2 = fakeClient(null, false);
  await db.persistOpWithClient(c2, { uid: 'u-1', c: 'grades', t: 'ins', data: { id: 7, score: 19, meta: { a: 1 } } });
  const upsert = c2.queries[0] || '', uparams = c2.queries.length;
  chk('B2a upsert با ON CONFLICT(id)', upsert.indexOf('INSERT INTO grades') === 0 && upsert.indexOf('ON CONFLICT (id) DO UPDATE SET') > 0, upsert.slice(0, 80));
  const c2d = fakeClient(null, false);
  await db.persistOpWithClient(c2d, { uid: 'u-2', c: 'grades', t: 'del', id: 9 });
  chk('B2b حذف با شناسه', (c2d.queries[0] || '').indexOf('DELETE FROM grades WHERE id = $1') >= 0);
  chk('B2c ردیابی uid پس از هر دو', c2.queries.some(q => q.indexOf('server_processed_uids') >= 0)
    && c2d.queries.some(q => q.indexOf('server_processed_uids') >= 0));
  const c2e = fakeClient(null, false);
  await db.persistOpWithClient(c2e, { uid: 'u-3', c: 'grades', t: 'ins', data: {} });
  chk('B2d دادهٔ خالی: هیچ کوئری (حتی uid)', c2e.queries.length === 0, 'n=' + c2e.queries.length);
  const c2n = fakeClient(null, false);
  await db.persistOpWithClient(c2n, { uid: 'u-4', c: 'grades', t: 'del', data: {} });
  chk('B2e حذفِ بی‌شناسه: DELETE نمی‌زند ولی uid را می‌زند',
    c2n.queries.length === 1 && c2n.queries[0].indexOf('server_processed_uids') >= 0);

  /* ── B3: بلع در برابر پرتاب ── */
  const c3 = fakeClient(null, false);
  db.__setPoolForTests(fakePool(c3, true));
  let swallowed = false;
  await quiet(async () => { await db.persistOp({ uid: 'u-5', c: 't1', t: 'ins', data: { id: 1 } }); swallowed = true; });
  chk('B3a persistOp خطا را می‌بلعد', swallowed === true);
  const c3b = fakeClient('t1', false);
  let threw = false;
  try { await db.persistOpWithClient(c3b, { uid: 'u-6', c: 't1', t: 'ins', data: { id: 1 } }); }
  catch (e) { threw = true; }
  chk('B3b نسخهٔ درونی می‌اندازد', threw === true);
  db.__setPoolForTests(null);

  /* ── B4: انضباطِ تراکنش ── */
  const c4a = fakeClient(null, false);
  db.__setPoolForTests(fakePool(c4a, false));
  const r4a = await db.persistOpsBatch([
    { uid: 'a1', c: 't1', t: 'ins', data: { id: 1, name: 'x' } },
    { uid: 'a2', c: 't1', t: 'ins', data: { id: 2, name: 'y' } }
  ]);
  const q4a = c4a.queries;
  chk('B4a موفق: BEGIN اول و COMMIT آخر، بدون ROLLBACK', q4a[0] === 'BEGIN' && q4a[q4a.length - 1] === 'COMMIT'
    && q4a.indexOf('ROLLBACK') < 0 && c4a.releaseCount === 1, q4a.filter(q => /BEGIN|COMMIT|ROLLBACK/.test(q)).join(','));
  chk('B4a2 نتیجه: postgres + شمارش ۲', r4a && r4a.driver === 'postgres' && r4a.count === 2, JSON.stringify(r4a));
  const c4b = fakeClient('no_such_table', false);
  db.__setPoolForTests(fakePool(c4b, false));
  let err4b = null;
  try {
    await db.persistOpsBatch([
      { uid: 'b1', c: 't1', t: 'ins', data: { id: 1 } },
      { uid: 'b2', c: 'no_such_table', t: 'ins', data: { id: 2 } }
    ]);
  } catch (e) { err4b = e; }
  const q4b = c4b.queries;
  chk('B4b ناموفق: خطا منتشر شد', !!err4b, err4b && err4b.message);
  chk('B4b2 ناموفق: BEGIN اول و ROLLBACK آخر، بدون COMMIT', q4b[0] === 'BEGIN' && q4b[q4b.length - 1] === 'ROLLBACK'
    && q4b.indexOf('COMMIT') < 0 && c4b.releaseCount === 1, q4b.filter(q => /BEGIN|COMMIT|ROLLBACK/.test(q)).join(','));
  db.__setPoolForTests(null);

  /* ── B5: شکستِ ROLLBACK ── */
  const c5 = fakeClient('no_such_table', true);
  db.__setPoolForTests(fakePool(c5, false));
  let err5 = null;
  await quiet(async () => {
    try { await db.persistOpsBatch([{ uid: 'c1', c: 'no_such_table', t: 'ins', data: { id: 1 } }]); }
    catch (e) { err5 = e; }
  });
  chk('B5 خطایِ اصلی منتشر شد نه خطایِ rollback', !!err5 && err5.message.indexOf('no_such_table') >= 0
    && c5.releaseCount === 1, err5 && err5.message);
  db.__setPoolForTests(null);

  /* ── B6: توقف در اولین شکست ── */
  const c6 = fakeClient('BAD', false);
  let err6 = null, res6 = null;
  try {
    res6 = await db.persistOpsBatchWithClient(c6, [
      { uid: 'd1', c: 't1', t: 'ins', data: { id: 1 } },
      { uid: 'd2', c: 'BAD_table', t: 'ins', data: { id: 2 } },
      { uid: 'd3', c: 't1', t: 'ins', data: { id: 3 } }
    ]);
  } catch (e) { err6 = e; }
  chk('B6 دسته در اولین شکست می‌ایستد و می‌اندازد', !!err6 && res6 === null
    && c6.queries.filter(q => q.indexOf('INSERT INTO t1') >= 0).length === 1, err6 && err6.message);

  /* ── B7/B8: سیم‌کشی sync.js ── */
  function makeCtx(dbFake, audits) {
    const store = {
      announcements: [],
      users: [{ id: 5, role: 'manager', school_id: 1, full_name: 'M' }],
      __processed_uids: {}, __server_version: 0
    };
    return {
      ctx: {
        store, db: dbFake, MAX_BATCH: 500, AT_DRIFT_MS: 24 * 3600 * 1000,
        audit: (ev, d) => audits.push({ ev, d }),
        sessionFrom: () => ({ id: 5, role: 'manager', school_id: 1 }),
        sendJson: (res, code, body) => { res._cap = { code, body }; },
        markDirty: () => {}
      },
      store
    };
  }
  const mkOps = (tag) => [1, 2, 3].map(i => opX({
    uid: tag + '-' + i, by: 5, collection: 'announcements', type: 'ins',
    user_id: 5, school_id: 1, data: { school_id: 1, title: tag + ' واحد ' + i }
  }));
  const seen7 = [];
  const audits7 = [];
  const { ctx: ctx7, store: store7 } = makeCtx({
    persistOpsBatch: async (ops) => { seen7.push(ops); return { ok: true, driver: 'memory', count: ops.length }; },
    isUidProcessed: async () => false
  }, audits7);
  attach(store7);
  const sync7 = createSync(ctx7);
  const res7 = {};
  await sync7.apiSync({}, res7, { ops: mkOps('b7') });
  const cap7 = res7._cap || {};
  chk('B7a پاسخ ۲۰۰ و هر ۳ ok', cap7.code === 200 && cap7.body && cap7.body.results.length === 3
    && cap7.body.results.every(r => r.ok === true), JSON.stringify(cap7.body && cap7.body.results));
  chk('B7b آینه دقیقاً یک‌بار با ۳ op فراخوانی شد', seen7.length === 1 && seen7[0].length === 3, 'calls=' + seen7.length);
  chk('B7c آینه شناسه‌هایِ اعمال‌شدهٔ سرور را دارد', seen7.length === 1 && seen7[0].every(o => o.data && o.data.id != null));
  chk('B7d هر ۳ رکورد در JSON اعمال شد', store7.announcements.length === 3, 'n=' + store7.announcements.length);

  const audits8 = [];
  const { ctx: ctx8, store: store8 } = makeCtx({
    persistOpsBatch: async () => { throw new Error('pg down'); },
    isUidProcessed: async () => false
  }, audits8);
  attach(store8);
  const sync8 = createSync(ctx8);
  const res8 = {};
  await sync8.apiSync({}, res8, { ops: mkOps('b8') });
  const cap8 = res8._cap || {};
  chk('B8a با شکستِ آینه، پاسخ هنوز ۲۰۰ و ok', cap8.code === 200 && cap8.body && cap8.body.results.every(r => r.ok === true));
  chk('B8b شکست audit شد (sync_mirror_failed)', audits8.some(a => a.ev === 'sync_mirror_failed' && a.d && a.d.ops === 3));
  chk('B8c رکوردها در JSON اعمال شده ماندند', store8.announcements.length === 3, 'n=' + store8.announcements.length);

  console.log(`\n  جمع: ${okc} موفق، ${failc} ناموفق از ${okc + failc}`);
  if (failc) { console.log('  مواردِ ناموفق:\n   - ' + fails.join('\n   - ')); process.exit(1); }
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
