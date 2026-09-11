#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/wave4-sync-all-collections.js — Delta pull across ALL collections
   (Delta Hardening Phase 2 gate — extension of wave4-sync.js)
   ─────────────────────────────────────────────────────────────────
   The delta path (and the Phase-2 hardening: 7-day full-snapshot cutoff,
   signed cursor) affects every pull collection at once — this gate sweeps
   the full 19-collection surface instead of a sample:

     AC1  every ALL_COLLECTIONS collection appears in a delta response
     AC2  delta mode returns ONLY rows changed after `since` (per collection)
     AC3  forced full (since > 7d): every collection present, full set, flag
     AC4  forced full ignores the time filter (pre-since rows included)
     AC5  ?collections= subset is respected (others absent from response)
     AC6  unknown/garbage collection names are dropped (fail-closed filter)
     AC7  tenant isolation in delta mode: school-2 rows never leak to school-1
     AC8  superadmin delta spans both schools
     AC9  tombstones are school-scoped in delta mode
     AC10 PG-live mode: deltaRowsSql issued for EVERY collection (fake db);
          per-collection fallback to full read when the DB errors
     AC11 forced full skips the DB delta fetch entirely (no delta queries)
     AC12 signed cursor works across all collections (delta from token since)
     AC13 response echoes `since`, carries server_version, stable shape

   Run: node tests/wave4-sync-all-collections.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const path = require('path');
const { createPull } = require(path.join(__dirname, '..', 'server', 'pull'));
const { createCursor } = require(path.join(__dirname, '..', 'server', 'cursor'));

let pass = 0, fail = 0;
const failures = [];
const assert = (c, m) => { if (!c) throw new Error(m || 'شرط برقرار نیست'); };
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ✅ ${name}`); }
  catch (e) { fail++; failures.push({ name, msg: e.message }); console.log(`  ❌ ${name}\n     ${e.message}`); }
}
function group(t) { console.log(`\n▸ ${t}`); }

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const iso = (t) => new Date(t).toISOString();

const ALL = [
  'schools', 'users', 'classes', 'subjects', 'schedule', 'enrollments',
  'attendance', 'grades', 'discipline', 'leaves', 'notifications',
  'announcements', 'hw_assignments', 'hw_submissions', 'vclass_sessions',
  'bell_schedules', 'sync_conflicts', 'counselor_refs', 'counselor_msgs'
];

/* استثناهای scope (قراردادِ filterCollectionForSession):
   - subjects: دروسِ عمومی/پایه — سطرِ مدرسهٔ ۲ برای همه مرئی (عمومی).
   - notifications: user-scoped — سنجش user_id است نه school_id؛ سطرِ
     «مدرسهٔ ۲» با user_id همان کاربر، برای خودش مرئی است (by design).
   هر دو: انتظارِ دلتا [۲,۳] و کامل [۱,۲,۳]. */
const SCOPE_EXCEPTIONS = { subjects: 1, notifications: 1 };
const expectedDelta = (c) => (c === 'schools') ? null : (SCOPE_EXCEPTIONS[c] ? [2, 3] : [2]);
const expectedFull = (c) => (c === 'schools') ? null : (SCOPE_EXCEPTIONS[c] ? [1, 2, 3] : [1, 2]);

/* every collection gets: one OLD row (pre-since, school 1), one NEW row
   (post-since, school 1), one NEW row school 2 (isolation probe) */
function makeStore() {
  const store = { __deleted_records: [], __server_version: 42 };
  for (const c of ALL) {
    /* notifications مجموعهٔ user-scoped است (user_id === session.id) */
    const uid = c === 'notifications' ? 10 : null;
    store[c] = [
      { id: 1, school_id: 1, user_id: uid, ref: c + '-old', created_at: iso(NOW - 30 * DAY), updated_at: iso(NOW - 30 * DAY) },
      { id: 2, school_id: 1, user_id: uid, ref: c + '-new', created_at: iso(NOW - 1 * DAY), updated_at: iso(NOW - 1 * DAY) },
      { id: 3, school_id: 2, user_id: uid, ref: c + '-new-s2', created_at: iso(NOW - 1 * DAY), updated_at: iso(NOW - 1 * DAY) }
    ];
  }
  /* schools collection is school-shaped (id == school_id); keep rows consistent:
     the scope filter for 'schools' keeps s.id === session school_id */
  store.schools = [
    { id: 1, school_id: 1, name: 'مدرسه ۱', created_at: iso(NOW - 30 * DAY), updated_at: iso(NOW - 30 * DAY) },
    { id: 2, school_id: 2, name: 'مدرسه ۲', created_at: iso(NOW - 1 * DAY), updated_at: iso(NOW - 1 * DAY) }
  ];
  store.__deleted_records = [
    { c: 'grades', id: 99, school_id: 1, at: iso(NOW - 1 * DAY) },
    { c: 'grades', id: 98, school_id: 2, at: iso(NOW - 1 * DAY) }
  ];
  return store;
}

function makePull(o) {
  o = o || {};
  const store = o.store || makeStore();
  const cap = {};
  const db = o.db || null;
  const controller = createPull({
    store, db,
    sessionFrom: async () => o.session || { id: 10, school_id: 1, role: 'manager' },
    sendJson: (res, code, body) => { cap.code = code; cap.body = body; },
    cursor: o.cursor !== undefined ? o.cursor : createCursor({ secret: 'k'.repeat(64) })
  });
  return { store, cap, pull: (qs) => controller.apiPull({ url: '/api/v1/pull' + (qs ? '?' + qs : '') }, {}) };
}
const ids = (b, c) => (b.collections[c] || []).map(r => r.id).sort((x, y) => x - y);

(async () => {
  console.log('Wave 4 (بازیافتی) — دلتا روی همهٔ مجموعه‌ها + سخت‌سازی فاز ۲');
  const FRESH = iso(NOW - 5 * DAY);   /* inside 7d → real delta */
  const ANCIENT = iso(NOW - 30 * DAY);/* > 7d → forced full */

  group('پوششِ همهٔ مجموعه‌ها (دلتا)');

  await test('AC1 هر ۱۹ مجموعه در پاسخِ دلتا حاضرند', async () => {
    const { cap, pull } = makePull();
    await pull('since=' + encodeURIComponent(FRESH));
    assert(cap.code === 200, 'status ' + cap.code);
    const keys = Object.keys(cap.body.collections);
    for (const c of ALL) assert(keys.indexOf(c) > -1, 'missing collection: ' + c);
    assert(keys.length === ALL.length, 'no extra keys: ' + keys.length);
  });

  await test('AC2 دلتا فقط ردیف‌های تغییرکرده بعد از since (هر مجموعه)', async () => {
    const { cap, pull } = makePull();
    await pull('since=' + encodeURIComponent(FRESH));
    for (const c of ALL) {
      if (c === 'schools') continue; /* shaped differently below */
      const got = ids(cap.body, c);
      assert(JSON.stringify(got) === JSON.stringify(expectedDelta(c)), c + ': expected only new row(s), got ' + JSON.stringify(got));
    }
  });

  await test('AC3 دلتای کهنه (>۷روز): همهٔ مجموعه‌ها کامل + پرچم', async () => {
    const { cap, pull } = makePull();
    await pull('since=' + encodeURIComponent(ANCIENT));
    assert(cap.body.full_snapshot_required === true, 'flag');
    assert(cap.body.full_snapshot === true, 'full');
    for (const c of ALL) assert(Array.isArray(cap.body.collections[c]), 'missing full set: ' + c);
  });

  await test('AC4 اسنپ‌شاتِ اجباری فیلترِ زمانی را کنار می‌گذارد (ردیفِ قدیمی برمی‌گردد)', async () => {
    const { cap, pull } = makePull();
    await pull('since=' + encodeURIComponent(ANCIENT));
    for (const c of ALL) {
      if (c === 'schools') continue;
      const got = ids(cap.body, c);
      assert(JSON.stringify(got) === JSON.stringify(expectedFull(c)), c + ': full set expected, got ' + JSON.stringify(got));
    }
  });

  group('انتخاب و پالایشِ مجموعه‌ها');

  await test('AC5 زیرمجموعهٔ collections respected', async () => {
    const { cap, pull } = makePull();
    await pull('since=' + encodeURIComponent(FRESH) + '&collections=grades,users');
    const keys = Object.keys(cap.body.collections).sort();
    assert(JSON.stringify(keys) === JSON.stringify(['grades', 'users']), 'subset keys: ' + keys.join(','));
  });

  await test('AC6 نام‌های ناشناخته/خراب حذف می‌شوند (fail-closed)', async () => {
    const { cap, pull } = makePull();
    await pull('since=' + encodeURIComponent(FRESH) + '&collections=grades,users,users%3BDROP%20TABLE%20x,nosuch<script>');
    const keys = Object.keys(cap.body.collections).sort();
    assert(JSON.stringify(keys) === JSON.stringify(['grades', 'users']), 'only allowlisted: ' + keys.join(','));
  });

  group('ایزولاسیون مستأجر');

  await test('AC7 مدرسهٔ ۲ به مدیرِ مدرسهٔ ۱ نشت نمی‌کند (دلتا)', async () => {
    const { cap, pull } = makePull();
    await pull('since=' + encodeURIComponent(FRESH));
    for (const c of ALL) {
      if (SCOPE_EXCEPTIONS[c]) continue; /* عمومی/user-scoped — سطرِ مدرسهٔ ۲ مرئی، طبق قرارداد */
      for (const row of cap.body.collections[c]) {
        assert(Number(row.school_id) !== 2, c + ': school-2 row leaked to school-1 manager');
      }
    }
  });

  await test('AC8 سوپرادمین هر دو مدرسه را می‌بیند (دلتا)', async () => {
    const { cap, pull } = makePull({ session: { id: 1, school_id: null, role: 'superadmin' } });
    await pull('since=' + encodeURIComponent(FRESH) + '&collections=grades');
    const got = ids(cap.body, 'grades');
    assert(JSON.stringify(got) === JSON.stringify([2, 3]), 'both schools, got ' + JSON.stringify(got));
  });

  await test('AC9 تومب‌استون‌ها school-scoped هستند (دلتا)', async () => {
    const { cap, pull } = makePull();
    await pull('since=' + encodeURIComponent(FRESH));
    assert(cap.body.deleted.length === 1 && cap.body.deleted[0].id === 99, 'only own-school tombstone');
    const sa = makePull({ session: { id: 1, school_id: null, role: 'superadmin' } });
    await sa.pull('since=' + encodeURIComponent(FRESH));
    assert(sa.cap.body.deleted.length === 2, 'superadmin sees both tombstones');
  });

  group('مسیر PG زنده (db جعلی) — همهٔ مجموعه‌ها');

  await test('AC10 هر مجموعه از builder دلتا می‌آید + fallback تک‌جدولی', async () => {
    const queries = [];
    const db = {
      isPostgres: () => true,
      async readCollection(c) { return makeStore()[c] || []; },
      async query(sql, params) {
        const t = (/FROM "([a-z_]+)"/.exec(sql) || [])[1];
        queries.push(t);
        if (/FROM "vclass_sessions"/.test(sql)) throw new Error('no timestamp columns');
        /* جدولِ schools با s.id سنجه‌ییده می‌شود (نه school_id)؛
           notifications با user_id (نقشِ جلسه = ۱۰) */
        const rowId = t === 'schools' ? 1 : 2;
        const uid = t === 'notifications' ? 10 : null;
        return { rows: [{ id: rowId, school_id: 1, user_id: uid, ref: 'pg-row', created_at: iso(NOW - 1 * DAY), updated_at: iso(NOW - 1 * DAY) }] };
      }
    };
    const { cap, pull } = makePull({ db });
    await pull('since=' + encodeURIComponent(FRESH));
    assert(cap.code === 200, 'status');
    for (const c of ALL) {
      assert(queries.indexOf(c) > -1, 'no delta query for ' + c);
      assert(Array.isArray(cap.body.collections[c]) && cap.body.collections[c].length > 0, c + ' must have rows (pg or fallback)');
    }
    assert(queries.indexOf('vclass_sessions') > -1, 'failing table still got its delta query first');
  });

  await test('AC11 دلتای کهنه اصلاً به DB دلتا نمی‌زند (فقط خواندنِ کامل)', async () => {
    const queries = [];
    const db = {
      isPostgres: () => true,
      async readCollection(c) { return makeStore()[c] || []; },
      async query(sql, params) { queries.push(sql); return { rows: [] }; }
    };
    const { cap, pull } = makePull({ db });
    await pull('since=' + encodeURIComponent(ANCIENT));
    assert(cap.body.full_snapshot_required === true, 'forced full');
    assert(queries.length === 0, 'no delta SQL must run on forced full, ran ' + queries.length);
  });

  group('کرسرِ امضاشده روی همهٔ مجموعه‌ها');

  await test('AC12 کرسرِ معتبر برای همهٔ مجموعه‌ها دلتای درست می‌دهد', async () => {
    const signer = createCursor({ secret: 'k'.repeat(64), ttlS: 3600 });
    const token = signer.sign(FRESH);
    const { cap, pull } = makePull({ cursor: signer });
    await pull('cursor=' + encodeURIComponent(token));
    assert(cap.code === 200, 'status ' + cap.code);
    for (const c of ALL) {
      if (c === 'schools') continue;
      const got = ids(cap.body, c);
      assert(JSON.stringify(got) === JSON.stringify(expectedDelta(c)), c + ' cursor-delta wrong: ' + JSON.stringify(got));
    }
    assert(cap.body.next_cursor && cap.body.next_cursor.indexOf('pc1.') === 0, 'fresh cursor issued');
  });

  await test('AC13 شکلِ پاسخ: since/server_version/کلیدهای ثابت', async () => {
    const { cap, pull } = makePull();
    await pull('since=' + encodeURIComponent(FRESH) + '&collections=grades');
    const b = cap.body;
    assert(b.ok === true && b.since === FRESH, 'since echo');
    assert(b.server_version === 42, 'server_version passthrough');
    assert(typeof b.server_time === 'string' && !isNaN(new Date(b.server_time)), 'server_time iso');
    assert(Array.isArray(b.deleted), 'deleted array');
    ['ok', 'server_time', 'since', 'full_snapshot', 'server_version', 'collections', 'deleted', 'next_cursor']
      .forEach(k => assert(k in b, 'contract key missing: ' + k));
  });

  const total = pass + fail;
  console.log('\n' + '─'.repeat(56));
  console.log(`نتیجه Wave4 Sync (همهٔ مجموعه‌ها): ${pass}/${total}` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
  if (fail) process.exit(1);
  process.exit(0);
})().catch(e => { console.error('FATAL:', e); process.exit(2); });
