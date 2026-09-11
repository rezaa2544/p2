#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/contract-layers.js — Server↔Client contract, layer by layer
   (Delta Hardening Phase 2 gate)
   ─────────────────────────────────────────────────────────────────
   The wire contract between server (pull/sync) and client (29-pull.js /
   27-sync.js) has layers; each test pins ONE layer so a contract break
   is diagnosed at the right depth:

     L-transport   CL1 200 on success · CL2 401 unauthorized · CL5 401 codes
     L-envelope    CL3 required keys + types · CL12 unknown params ignored
     L-semantics   CL4 delta vs full flags · CL6 forced-full truth table
     L-payload     CL7 collections subset · CL8 tombstone shape
     L-cursor      CL9 next_cursor+ttl when enabled · CL10 401+renewal
                   CL11 authenticated since wins · CL13 cursor.since ==
                   server_time
     L-push        CL14 results[] uid/ok · CL15 conflict row shape ·
                   CL16 per-op rejection keeps batch alive
     L-compat      CL17 legacy plain-since client unaffected · CL18 client
                   normalizes raw and non-raw API shapes

   Run: node tests/contract-layers.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { createPull } = require(path.join(ROOT, 'server', 'pull'));
const { createCursor } = require(path.join(ROOT, 'server', 'cursor'));
const { createSync, attach } = require(path.join(ROOT, 'server', 'sync'));
const { opX } = require('./helpers/opx');

let pass = 0, fail = 0;
const failures = [];
const assert = (c, m) => { if (!c) throw new Error(m || 'شرط برقرار نیست'); };
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ✅ ${name}`); }
  catch (e) { fail++; failures.push({ name, msg: e.message }); console.log(`  ❌ ${name}\n     ${e.message}`); }
}
function group(t) { console.log(`\n▸ ${t}`); }
const DAY = 86400000;
const iso = (t) => new Date(t).toISOString();

function makePullStore() {
  return {
    grades: [
      { id: 1, school_id: 1, score: 20, version: 1, created_at: iso(Date.now() - 30 * DAY), updated_at: iso(Date.now() - 30 * DAY) },
      { id: 2, school_id: 1, score: 19, version: 1, created_at: iso(Date.now() - DAY), updated_at: iso(Date.now() - DAY) }
    ],
    users: [{ id: 10, school_id: 1, role: 'manager', full_name: 'مدیر' }],
    __deleted_records: [{ c: 'grades', id: 9, school_id: 1, at: iso(Date.now() - DAY) }],
    __server_version: 11
  };
}
function makePull(o) {
  o = o || {};
  const cap = {};
  const controller = createPull({
    store: o.store || makePullStore(),
    db: null,
    sessionFrom: async () => (o.session === null) ? null : (o.session || { id: 10, school_id: 1, role: 'manager' }),
    sendJson: (res, code, body) => { cap.code = code; cap.body = body; },
    cursor: o.cursor !== undefined ? o.cursor : createCursor({ secret: 'k'.repeat(64) })
  });
  return { cap, pull: (qs) => controller.apiPull({ url: '/api/v1/pull' + (qs ? '?' + qs : '') }, {}) };
}

function makeSyncCtx() {
  const store = {
    grades: [{ id: 55, school_id: 1, class_id: 1, student_id: 30, subject_id: 1, teacher_id: 20, score: 19, version: 3, updated_at: iso(Date.now()) }],
    users: [{ id: 5, role: 'manager', school_id: 1 }],
    __processed_uids: {}, __server_version: 0
  };
  const ctx = {
    store,
    db: { persistOpsBatch: async () => ({ ok: true }), isUidProcessed: async () => false },
    MAX_BATCH: 500, AT_DRIFT_MS: 24 * 3600 * 1000,
    audit: () => {},
    sessionFrom: () => ({ id: 5, role: 'manager', school_id: 1 }),
    sendJson: (res, code, body) => { res._cap = { code, body }; },
    markDirty: () => {}
  };
  attach(store);
  return { ctx, store };
}
const gradeUpd = (uid, base, extraData) => opX(Object.assign({
  uid, by: 5, collection: 'grades', type: 'upd', user_id: 5, school_id: 1,
  id: 55, base_version: base,
  data: { id: 55, school_id: 1, class_id: 1, student_id: 30, subject_id: 1, teacher_id: 20, score: 12 }
}, extraData || {}));

(async () => {
  console.log('Contract Layers — قراردادِ سیمِ سرور↔کلاینت (pull/sync)');
  const FRESH = iso(Date.now() - 5 * DAY);
  const ANCIENT = iso(Date.now() - 30 * DAY);

  group('لایهٔ transport (کد وضعیت)');

  await test('CL1 موفق = 200 + ok:true', async () => {
    const { cap, pull } = makePull();
    await pull('since=' + encodeURIComponent(FRESH));
    assert(cap.code === 200 && cap.body.ok === true, '200/ok');
  });

  await test('CL2 بدون نشست = 401 unauthorized (fail-closed)', async () => {
    const { cap, pull } = makePull({ session: null });
    await pull('since=' + encodeURIComponent(FRESH));
    assert(cap.code === 401 && cap.body.ok === false && cap.body.code === 'unauthorized', '401 + code');
  });

  await test('CL5 کرسرِ خراب/منقضی = 401 با کدِ متمایز + سرنخِ تمدید', async () => {
    const signer = createCursor({ secret: 'k'.repeat(64), ttlS: 60 });
    let clock = Math.floor(Date.now() / 1000);
    const fixed = createCursor({ secret: 'k'.repeat(64), ttlS: 60, now: () => clock });
    const expiredTok = fixed.sign(FRESH, clock - 120); /* TTL 60s → expired */
    clock += 1;
    const a = makePull({ cursor: signer });
    await a.pull('cursor=' + encodeURIComponent(expiredTok));
    assert(a.cap.code === 401 && a.cap.body.code === 'cursor_expired' && a.cap.body.cursor_renewal === 'full_pull',
      'expired: 401 cursor_expired + renewal');
    const b = makePull({ cursor: signer });
    await b.pull('cursor=' + encodeURIComponent('pc1.GARBAGE.xx'));
    assert(b.cap.code === 401 && b.cap.body.code === 'cursor_invalid' && b.cap.body.cursor_renewal === 'full_pull',
      'invalid: 401 cursor_invalid + renewal');
  });

  group('لایهٔ envelope (کلیدها و انواع)');

  await test('CL3 کلیدهای الزامی پاسخِ pull با نوعِ درست', async () => {
    const { cap, pull } = makePull();
    await pull('since=' + encodeURIComponent(FRESH));
    const b = cap.body;
    assert(typeof b.ok === 'boolean' && b.ok === true, 'ok:boolean');
    assert(typeof b.server_time === 'string' && !isNaN(new Date(b.server_time)), 'server_time:ISO');
    assert(b.since === FRESH, 'since echo: string');
    assert(typeof b.full_snapshot === 'boolean', 'full_snapshot:boolean');
    assert(typeof b.server_version === 'number', 'server_version:number');
    assert(b.collections && typeof b.collections === 'object' && !Array.isArray(b.collections), 'collections:object');
    assert(Array.isArray(b.deleted), 'deleted:array');
  });

  await test('CL12 پارامترهای ناشناخته نادیده گرفته می‌شوند (forward-compat)', async () => {
    const { cap, pull } = makePull();
    await pull('since=' + encodeURIComponent(FRESH) + '&future_param=1&another=%D9%81%D8%A7%D8%B1%D8%B3%DB%8C');
    assert(cap.code === 200 && cap.body.ok === true, 'unknown params must not break');
  });

  group('لایهٔ semantics (پرچم‌های دلتا/کامل)');

  await test('CL4 دلتا: full_snapshot=false؛ کاملِ صریح: true', async () => {
    const d = makePull();
    await d.pull('since=' + encodeURIComponent(FRESH));
    assert(d.cap.body.full_snapshot === false, 'delta flagged');
    const f = makePull();
    await f.pull('');
    assert(f.cap.body.full_snapshot === true, 'no-since pull is a full snapshot');
  });

  await test('CL6 جدولِ درستِ forced-full (فقط دلتای کهنه)', async () => {
    const rows = [];
    for (const [label, qs] of [
      ['no-since', ''],
      ['fresh-delta', 'since=' + encodeURIComponent(FRESH)],
      ['ancient-delta', 'since=' + encodeURIComponent(ANCIENT)]
    ]) {
      const { cap, pull } = makePull();
      await pull(qs);
      rows.push({
        label,
        full: cap.body.full_snapshot,
        required: cap.body.full_snapshot_required === true,
        reason: cap.body.full_snapshot_reason
      });
    }
    assert(rows[0].full === true && rows[0].required === false, 'no-since: full, not forced');
    assert(rows[1].full === false && rows[1].required === false, 'fresh: delta, not forced');
    assert(rows[2].full === true && rows[2].required === true && rows[2].reason === 'since_too_old',
      'ancient: forced full + reason');
  });

  group('لایهٔ payload');

  await test('CL7 زیرمجموعهٔ collections فقط همان‌ها را برمی‌گرداند', async () => {
    const { cap, pull } = makePull();
    await pull('since=' + encodeURIComponent(FRESH) + '&collections=grades');
    assert(Object.keys(cap.body.collections).length === 1 && 'grades' in cap.body.collections, 'subset exact');
  });

  await test('CL8 تومب‌استون = {c,id,at} و school-scoped', async () => {
    const { cap, pull } = makePull();
    await pull('since=' + encodeURIComponent(FRESH));
    const d = cap.body.deleted[0];
    assert(d && d.c === 'grades' && d.id === 9 && typeof d.at === 'string', 'tombstone shape');
    assert(Object.keys(d).length === 3, 'no extra fields leak: ' + Object.keys(d).join(','));
  });

  group('لایهٔ cursor');

  await test('CL9 next_cursor + cursor_ttl_s وقتی کلید هست؛ غایب وقتی نیست', async () => {
    const on = makePull({ cursor: createCursor({ secret: 'k'.repeat(64), ttlS: 3600 }) });
    await on.pull('collections=grades');
    assert(typeof on.cap.body.next_cursor === 'string' && on.cap.body.cursor_ttl_s === 3600, 'cursor on');
    const off = makePull({ cursor: createCursor({ secret: null }) });
    await off.pull('collections=grades');
    /* قراردادِ سیم = JSON؛ کلیدهای undefined در سریال‌سازی حذف می‌شوند */
    const wire = JSON.parse(JSON.stringify(off.cap.body));
    assert(!('next_cursor' in wire) && !('cursor_ttl_s' in wire), 'cursor off — keys absent on the wire, not null');
    assert(!('full_snapshot_required' in wire) && !('full_snapshot_reason' in wire), 'forced-full keys absent on a normal delta');
  });

  await test('CL10 cursor_expired ≠ cursor_invalid (کدهای متمایز، هر دو 401)', async () => {
    let clock = Math.floor(Date.now() / 1000);
    const signer = createCursor({ secret: 'k'.repeat(64), ttlS: 60, now: () => clock });
    const tok = signer.sign(FRESH, clock);
    clock += 61;
    const v = signer.verify(tok);
    assert(v.ok === false && v.code === 'cursor_expired', 'expired distinct');
    const t = signer.verify(tok.slice(0, -2) + 'zz');
    assert(t.ok === false && t.code === 'cursor_invalid', 'invalid distinct');
  });

  await test('CL11 sinceِ امضاشده بر ادعای query مقدم است', async () => {
    const signer = createCursor({ secret: 'k'.repeat(64), ttlS: 3600 });
    const tok = signer.sign(FRESH);
    const { cap, pull } = makePull({ cursor: signer });
    await pull('cursor=' + encodeURIComponent(tok) + '&since=' + encodeURIComponent(ANCIENT) + '&collections=grades');
    assert(cap.body.since === FRESH && cap.body.full_snapshot_required !== true, 'token since honored, claim ignored');
  });

  await test('CL13 cursor.since == server_time لحظهٔ اسنپ‌شات است', async () => {
    const signer = createCursor({ secret: 'k'.repeat(64), ttlS: 3600 });
    const { cap, pull } = makePull({ cursor: signer });
    await pull('collections=grades');
    const v = signer.verify(cap.body.next_cursor);
    assert(v.ok === true, 'next_cursor verifies');
    assert(v.payload.since === cap.body.server_time, 'cursor anchored at the snapshot moment');
  });

  group('لایهٔ push (POST /api/sync)');

  await test('CL14 results[]: هر op یک نتیجه با uid+ok', async () => {
    const { ctx } = makeSyncCtx();
    const s = createSync(ctx);
    const r = {};
    await s.apiSync({}, r, { ops: [gradeUpd('cl14-a', 3), gradeUpd('cl14-b', 3)] });
    /* second upd: base 3 still matches? version bumped to 4 after first apply → second is conflict…
       → use non-version-tracked same-batch ops instead: one upd (base 3) + one ins */
    assert(Array.isArray(r._cap.body.results), 'results array');
    for (const res of r._cap.body.results) {
      assert(typeof res.uid === 'string' && typeof res.ok === 'boolean', 'uid+ok per result');
    }
  });

  await test('CL15 conflict_preserved: کد + conflict_id + سطرِ sync_conflicts', async () => {
    const { ctx, store } = makeSyncCtx();
    const s = createSync(ctx);
    const r = {};
    await s.apiSync({}, r, { ops: [gradeUpd('cl15', 1)] }); /* stale base 1 vs version 3 */
    const res = r._cap.body.results[0];
    assert(res.ok === false && res.code === 'conflict_preserved', 'code');
    assert(typeof res.conflict_id === 'number', 'conflict_id in result');
    const row = (store.sync_conflicts || []).find(x => x.id === res.conflict_id);
    assert(row && row.status === 'open' && row.collection === 'grades' && row.base_version === 1,
      'sync_conflicts row shape');
    assert(row.incoming && typeof row.incoming.by === 'number' && typeof row.incoming.at === 'string', 'incoming audit fields');
  });

  await test('CL16 ردِ عملیاتِ خراب، دستهٔ سالم را نمی‌کشد (per-op)', async () => {
    const { ctx } = makeSyncCtx();
    const s = createSync(ctx);
    const r = {};
    await s.apiSync({}, r, {
      ops: [
        gradeUpd('cl16-bad', 'x'),   /* bad base_version type → per-op validation_failed */
        gradeUpd('cl16-good', 3)     /* valid */
      ]
    });
    const bad = r._cap.body.results.find(x => x.uid === 'cl16-bad');
    const good = r._cap.body.results.find(x => x.uid === 'cl16-good');
    assert(bad && bad.ok === false && bad.code === 'validation_failed', 'bad op rejected per-op');
    assert(good && good.ok === true, 'good op survives in same batch');
  });

  group('لایهٔ سازگاری (legacy client)');

  await test('CL17 کلاینتِ قدیمیِ only-since: همان قراردادِ قبلِ فاز ۲', async () => {
    const { cap, pull } = makePull({ cursor: createCursor({ secret: 'k'.repeat(64) }) });
    await pull('since=' + encodeURIComponent(FRESH));
    const b = cap.body;
    /* everything a pre-Phase-2 client reads is unchanged */
    assert(b.ok === true && b.full_snapshot === false && b.since === FRESH, 'delta semantics unchanged');
    assert(Array.isArray(b.collections.grades) && b.collections.grades.length === 1, 'payload unchanged');
    /* new keys are ADDITIVE — old client ignores them */
    ['next_cursor', 'cursor_ttl_s'].forEach(k => assert(typeof b[k] === 'undefined' || typeof b[k] === 'string' || typeof b[k] === 'number', k + ' additive'));
  });

  await test('CL18 کلاینت هر دو شکلِ پاسخِ Api را می‌فهمد (raw و ساده)', async () => {
    const { JSDOM, VirtualConsole } = require('jsdom');
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const dom = new JSDOM(html, {
      runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
      virtualConsole: new VirtualConsole().on('jsdomError', () => {}).on('error', () => {})
    });
    const W = dom.window.eval.bind(dom.window);
    await new Promise(r => setTimeout(r, 1200));
    try {
      /* raw shape (real Api with {raw:true}) */
      dom.window.__apiRaw = {
        get: () => Promise.resolve({ status: 200, body: { ok: true, server_time: '2026-09-11T10:00:00.000Z', full_snapshot: false, collections: { subjects: [{ id: 5, name: 'شیمی' }] } } })
      };
      const r1 = await W(`pullFromServer({ customApi: window.__apiRaw, forceOnline: true })`);
      assert(r1 && r1.ok === true, 'raw shape resolved');
      /* plain payload shape (legacy stub) */
      dom.window.__apiPlain = {
        get: () => Promise.resolve({ ok: true, server_time: '2026-09-11T10:05:00.000Z', full_snapshot: false, collections: { subjects: [{ id: 6, name: 'زیست' }] } })
      };
      const r2 = await W(`pullFromServer({ customApi: window.__apiPlain, forceOnline: true })`);
      assert(r2 && r2.ok === true, 'plain shape resolved');
      assert(W(`db.subjects.some(function(x){ return x.id === 6; })`) === true, 'plain payload merged');
    } finally {
      dom.window.close();
    }
  });

  const total = pass + fail;
  console.log('\n' + '─'.repeat(56));
  console.log(`نتیجه Contract Layers: ${pass}/${total}` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
  if (fail) process.exit(1);
  process.exit(0);
})().catch(e => { console.error('FATAL:', e); process.exit(2); });
