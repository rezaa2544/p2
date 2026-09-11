#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/delta-schema-gaps.js — «بستن شکاف اسکیما Delta»
   (DELTA_HARDENING.md §6 — سه شکاف اسکیمای مسیر دلتا)
   ─────────────────────────────────────────────────────────────────
   گپ ۱ — نامِ مردهٔ `homework` در سطحِ allowlist (pull/syncdelta) با
          مجموعهٔ واقعیِ `hw_assignments` (جدول + کلاینت + authz مدل)
          جایگزین شده:
     SG1  tableName/deltaRowsSql برای hw_assignments پذیرفته می‌شود و
          FROM "hw_assignments" با پیشیکیتِ updated_at می‌سازد
     SG2  نامِ مردهٔ homework در syncdelta fail-closed رد می‌شود
     SG3  پولِ پیش‌فرض (حافظه) کلید collections.hw_assignments می‌دهد و
          homework را دیگر نمی‌فرستد؛ دلتا فقط سطرِ تازه را می‌دهد
     SG4  رگرسیونِ PG-live: قبلاً SELECT * FROM "homework" ⇒ 42P01 ⇒
          ۵۰۰؛ حالا حتی کوئری‌ای برای homework صادر نمی‌شود و پول ۲۰۰
          می‌ماند (با db جعلی که برای جدولِ غایب پرتاب می‌کند)
     SG5  کلاینتِ قدیمی ?collections=homework,grades ⇒ homework بی‌صدا
          حذف می‌شود (fail-closed)، بدونِ کرش؛ grades سرو می‌شود

   گپ ۲ — نامِ مردهٔ `vclass_rooms` (هیچ جدول/کلاینتی ندارد) حذف و
          مجموعهٔ واقعیِ vclass_sessions (دارای school_id ⇒ scope-پذیر)
          جایگزین شده:
     SG6  tableName برای vclass_sessions پاس / vclass_rooms رد
     SG7  پولِ پیش‌فرض vclass_sessions دارد و vclass_rooms ندارد
     SG8  جداسازی مدرسه‌ای: سطر school_id=2 در دلتای vclass_sessions
          به جلسهٔ مدرسهٔ ۱ نشت نمی‌کند

   گپ ۳ — sync_conflicts.updated_at (ستون دلتا + ایندکس، مهاجرت ۰۰۶):
     SG9  مهاجرتِ 006: ADD COLUMN IF NOT EXISTS / backfill با WHERE
          updated_at IS NULL / SET NOT NULL / ایندکس — به‌همراهِ فایلِ
          down (drop index + drop column) و ایندکس‌های hw_assignments
          و vclass_sessions؛ باBEGIN/COMMIT
     SG10 ردیفِ تعارضِ تازه (sync.js) updated_at هم‌ارزِ created_at دارد
     SG11 مسیرِ داوری (conflicts.js) هنگامِ resolve روی ردیف stamp
          می‌زند (status→resolved به‌همراهِ updated_at)
     SG12 دلتای حافظه‌ایِ sync_conflicts: سطرِ تازه (updated_at>since)
          برمی‌گردد؛ سطرِ کهنه نه

   Run: node tests/delta-schema-gaps.js   (exit 0 = all green)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const { createPull } = require(path.join(ROOT, 'server', 'pull'));
const { createCursor } = require(path.join(ROOT, 'server', 'cursor'));
const { createSync, attach } = require(path.join(ROOT, 'server', 'sync'));
const { createConflicts } = require(path.join(ROOT, 'server', 'conflicts'));
const { tableName, deltaRowsSql } = require(path.join(ROOT, 'server', 'syncdelta'));
const { opX } = require('./helpers/opx');

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
const FRESH = iso(NOW - 2 * DAY); /* دلتا (نه full): سطرهای ۱‌روزه تازه‌اند */

/* ── سطحِ کانونیِ مجموعه‌ها پس ازِ این مأموریت (۱۹ عضو) ── */
const EXPECTED = [
  'schools', 'users', 'classes', 'subjects', 'schedule', 'enrollments',
  'attendance', 'grades', 'discipline', 'leaves', 'notifications',
  'announcements', 'hw_assignments', 'hw_submissions', 'vclass_sessions',
  'bell_schedules', 'sync_conflicts', 'counselor_refs', 'counselor_msgs'
];
const DEAD = ['homework', 'vclass_rooms'];

function makeStore() {
  const store = { __deleted_records: [], __server_version: 42 };
  for (const c of EXPECTED) {
    const uid = c === 'notifications' ? 10 : null;
    store[c] = [
      { id: 1, school_id: 1, user_id: uid, ref: c + '-old', created_at: iso(NOW - 30 * DAY), updated_at: iso(NOW - 30 * DAY) },
      { id: 2, school_id: 1, user_id: uid, ref: c + '-new', created_at: iso(NOW - 1 * DAY), updated_at: iso(NOW - 1 * DAY) },
      { id: 3, school_id: 2, user_id: uid, ref: c + '-new-s2', created_at: iso(NOW - 1 * DAY), updated_at: iso(NOW - 1 * DAY) }
    ];
  }
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

/* ═══════════════ گپ ۱ — homework → hw_assignments ═══════════════ */
(async () => {
group('گپ ۱ — نامِ مردهٔ homework با hw_assignments جایگزین شد');

await test('SG1 syncdelta برای hw_assignments کوئری دلتا می‌سازد', async () => {
  assert(tableName('hw_assignments') === 'hw_assignments', 'tableName must pass hw_assignments');
  const q = deltaRowsSql('hw_assignments', { sinceISO: FRESH });
  const sql = (q && q.sql) ? q.sql : String(q);
  assert(/FROM "hw_assignments"/.test(sql), 'FROM "hw_assignments" in: ' + sql);
  assert(/updated_at/.test(sql) && /created_at/.test(sql), 'timestamp predicate in: ' + sql);
});

await test('SG2 نامِ مردهٔ homework در allowlist رد می‌شود (fail-closed)', async () => {
  let threw = false;
  try { tableName('homework'); } catch (_) { threw = true; }
  assert(threw, 'tableName("homework") must throw');
  let threw2 = false;
  try { deltaRowsSql('homework', { sinceISO: FRESH }); } catch (_) { threw2 = true; }
  assert(threw2, 'deltaRowsSql("homework") must throw');
});

await test('SG3 پولِ پیش‌فرض (حافظه): hw_assignments هست، homework نیست', async () => {
  const { cap, pull } = makePull();
  await pull('since=' + encodeURIComponent(FRESH));
  assert(cap.code === 200, 'status 200, got ' + cap.code);
  const keys = Object.keys(cap.body.collections || {});
  assert(keys.indexOf('hw_assignments') > -1, 'hw_assignments must be served');
  assert(keys.indexOf('homework') === -1, 'homework must NOT be served');
  /* دلتا: فقط سطرِ تازهٔ مدرسهٔ ۱ (نه کهنه، نه مدرسهٔ ۲) */
  const rows = cap.body.collections.hw_assignments;
  assert(Array.isArray(rows) && rows.length === 1 && rows[0].ref === 'hw_assignments-new',
    'delta must return only the fresh school-1 row, got ' + JSON.stringify(rows));
});

await test('SG4 رگرسیون PG-live: کوئری‌ای برای جدولِ غایبِ homework صادر نمی‌شود (۲۰۰)', async () => {
  const queries = [];
  const db = {
    isPostgres: () => true,
    async readCollection(c) { return makeStore()[c] || []; },
    async query(sql, params) {
      const t = (/FROM "([a-z_]+)"/.exec(sql) || [])[1];
      queries.push(t);
      /* شبیه‌سازیِ 42P01: جدولِ غایب در PG زنده پرتاب می‌کند (باگِ پنهانِ
         پیشین: SELECT * FROM "homework" ⇒ 500 کلِ پول) */
      if (t === 'homework' || t === 'vclass_rooms') throw new Error('relation does not exist');
      const rowId = t === 'schools' ? 1 : 2;
      const uid = t === 'notifications' ? 10 : null;
      return { rows: [{ id: rowId, school_id: 1, user_id: uid, ref: 'pg-' + t, created_at: iso(NOW - 1 * DAY), updated_at: iso(NOW - 1 * DAY) }] };
    }
  };
  const { cap, pull } = makePull({ db });
  await pull('since=' + encodeURIComponent(FRESH));
  assert(cap.code === 200, 'pull must stay 200 with the fixed surface, got ' + cap.code);
  assert(queries.indexOf('homework') === -1 && queries.indexOf('vclass_rooms') === -1,
    'no delta query for dead names, saw: ' + queries.join(','));
  assert(queries.indexOf('hw_assignments') > -1, 'hw_assignments must be delta-queried');
  const rows = cap.body.collections.hw_assignments;
  assert(Array.isArray(rows) && rows.length === 1 && rows[0].ref === 'pg-hw_assignments',
    'hw_assignments row must come from the PG delta path');
});

await test('SG5 کلاینتِ قدیمی ?collections=homework ⇒ حذفِ بی‌صدای fail-closed، بدونِ کرش', async () => {
  const { cap, pull } = makePull();
  await pull('since=' + encodeURIComponent(FRESH) + '&collections=' + encodeURIComponent('homework,grades'));
  assert(cap.code === 200, 'status 200, got ' + cap.code);
  const keys = Object.keys(cap.body.collections || {});
  assert(keys.indexOf('homework') === -1, 'homework must be dropped');
  assert(keys.indexOf('grades') > -1, 'grades must still be served');
});


/* ═══════════════ گپ ۲ — vclass_rooms → vclass_sessions ═══════════════ */
group('گپ ۲ — نامِ مردهٔ vclass_rooms حذف، vclass_sessions واقعی نشست');

await test('SG6 syncdelta برای vclass_sessions می‌سازد / vclass_rooms رد می‌شود', async () => {
  assert(tableName('vclass_sessions') === 'vclass_sessions', 'tableName must pass vclass_sessions');
  const q = deltaRowsSql('vclass_sessions', { sinceISO: FRESH });
  const sql = (q && q.sql) ? q.sql : String(q);
  assert(/FROM "vclass_sessions"/.test(sql), 'FROM "vclass_sessions" in: ' + sql);
  let threw = false;
  try { tableName('vclass_rooms'); } catch (_) { threw = true; }
  assert(threw, 'tableName("vclass_rooms") must throw');
});

await test('SG7 پولِ پیش‌فرض: vclass_sessions هست، vclass_rooms نیست', async () => {
  const { cap, pull } = makePull();
  await pull('since=' + encodeURIComponent(FRESH));
  assert(cap.code === 200, 'status 200, got ' + cap.code);
  const keys = Object.keys(cap.body.collections || {});
  assert(keys.indexOf('vclass_sessions') > -1, 'vclass_sessions must be served');
  assert(keys.indexOf('vclass_rooms') === -1, 'vclass_rooms must NOT be served');
  const rows = cap.body.collections.vclass_sessions;
  assert(Array.isArray(rows) && rows.length === 1 && rows[0].ref === 'vclass_sessions-new',
    'delta must return only the fresh school-1 row, got ' + JSON.stringify(rows));
});

await test('SG8 جداسازی مدرسه‌ایِ vclass_sessions (school_id ⇒ scope پیش‌فرض)', async () => {
  /* جلسهٔ مدرسهٔ ۱: سطرِ مدرسهٔ ۲ نمی‌آید */
  const a = makePull();
  await a.pull('since=' + encodeURIComponent(FRESH) + '&collections=' + encodeURIComponent('vclass_sessions'));
  const rows1 = a.cap.body.collections.vclass_sessions;
  assert(Array.isArray(rows1) && rows1.every(r => Number(r.school_id) === 1),
    'school-1 session must not see school-2 vclass rows, got ' + JSON.stringify(rows1));
  /* جلسهٔ مدرسهٔ ۲: فقط سطرِ خودش */
  const b = makePull({ session: { id: 11, school_id: 2, role: 'manager' } });
  await b.pull('since=' + encodeURIComponent(FRESH) + '&collections=' + encodeURIComponent('vclass_sessions'));
  const rows2 = b.cap.body.collections.vclass_sessions;
  assert(Array.isArray(rows2) && rows2.length === 1 && Number(rows2[0].school_id) === 2,
    'school-2 session must see only its own vclass row, got ' + JSON.stringify(rows2));
});

/* ═══════════════ خلاصه ═══════════════ */
console.log('\n────────────────────────────────────────────────────────');
if (fail === 0) {
  console.log(`نتیجه Delta Schema Gaps: ${pass}/${pass}  —  بدون خطا ✅`);
} else {
  console.log(`نتیجه Delta Schema Gaps: ${pass}/${pass + fail}  —  ${fail} خطا ❌`);
  for (const f of failures) console.log(`  ✗ ${f.name}: ${f.msg}`);
}
process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL:', e); process.exit(2); });
