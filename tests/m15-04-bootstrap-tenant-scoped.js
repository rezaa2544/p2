#!/usr/bin/env node
// tests/m15-04-bootstrap-tenant-scoped.js — M15-04 Bootstrap (tenant-scoped mirror)
// ---------------------------------------------------------------------------
// مسالهٔ مجاز: هیدراتاسیونِ بوت پیش از M15-04 هر جدول را کامل می‌خواند،
// پس یک بوت O(کلِ DB) بود (۷۲۷,۳۶۰ سطر روی DB مانور) حتی اگر instance فقط
// چند مدرسه را سرو کند.
//
// راه‌حل: وقتی PAYESH_HYDRATE_SCHOOL_IDS ست شده، hydrateStoreFromPg با یک
// کوئریِ کاتالوگ می‌پرسد کدام SCHEMA_TABLE ها school_id دارند و از آن
// جدول‌ها فقط ردیف‌های همان مدارس (به‌علاوهٔ ردیف‌های سراسریِ school_id IS
// NULL) را بارگذاری می‌کند. جدول‌های بدونِ school_id (schools، parent_links،
// offices، …) عمداً دست‌نخورده می‌مانند: دادهٔ policy/authz سراسری است و
// health-index / bell.js / auth به آن‌ها وابسته‌اند. پیش‌فرض (env خاموش) =
// هیدراتاسیونِ کاملِ قبلی.
//
// این تست روی PostgreSQL زنده (همان DB مانورِ مقیاس) ثابت می‌کند:
//   (A) دامنه در سورس اعمال می‌شود — WHERE (school_id = ANY($1::int[]) OR
//       school_id IS NULL) — و هیچ SELECT * بدونِ دامنه‌ای روی جدولِ
//       school_id-دار صادر نمی‌شود (O(tenant)، نه O(total DB)).
//   (B) دادهٔ tenant دیگر واردِ آینه نمی‌شود (tenant isolation) — با
//       اثباتِ غیرپوک (دادهٔ خارجی واقعاً در DB هست).
//   (C) جدول‌های بدونِ school_id عیناً سراسری می‌مانند.
//   (D) health-index برایِ مدرسهٔ tenant اعدادِ یکسان می‌دهد (حتی با
//       اضافه‌کردنِ دادهٔ tenant دیگر)، endpoint بدونِ کرش همهٔ مدارس را
//       لیست می‌کند، و فیلترِ per-school مسیرِ analytics با seamِ
//       readCollectionForSchools هم‌ارز است.
//   (E) پیش‌فرضِ خاموش = رفتارِ قبلی؛ و جهتِ fail-safe: شکستِ
//       introspection یا ورودیِ نامعتور ⇒ هیدراتاسیونِ کامل، هرگز آینه‌ای
//       خالی/ناقص.
//   (F) قراردادِ mirror_incomplete / shouldPersistMirrorFile حفظ می‌شود،
//       cap و scope با هم compose می‌شوند، و shape سطر عین readOne است.
//
// فقط خواندن از DB (هیچ write ای) — session/rate-limit fixture نیاز نیست.
// ---------------------------------------------------------------------------
'use strict';

const assert = require('assert');
const path = require('path');
const crypto = require('crypto');
const { computeHealth, gather, createHealthIndex } = require('../server/health-index');

const PG_HOST = '127.0.0.1';
const PG_PORT = '5432';
const PG_USER = 'postgres';
const PG_BIN = 'C:\\Program Files\\PostgreSQL\\16\\bin';
const PG_DB = 'payesh_m15cap';   /* ۲۰ مدرسه / ۳۶۲۵۰۰ نمره — همان DB مانور */

/* tenantِ این تست: مدرسهٔ ۹۰۰۲ (district 3). tenantِ خارجی: ۹۰۰۱ که
   ۱۲۵۰۰۰ نمره دارد — اثباتِ غیرپوک این است که هیچ‌کدام واردِ آینه نمی‌شود. */
const TENANT = 9002;
const FOREIGN = 9001;

let pass = 0;
const failures = [];
function chk(name, fn) {
  return Promise.resolve().then(fn).then(
    () => { pass++; console.log('  ✅ ' + name); },
    (e) => { failures.push(name); console.log('  ❌ ' + name + ' — ' + String(e && e.message || e).split('\n').slice(0, 3).join('\n          ')); }
  );
}

function psql(sql) {
  const { execFile } = require('child_process');
  return new Promise((resolve, reject) => {
    execFile(path.join(PG_BIN, 'psql.exe'),
      ['-h', PG_HOST, '-p', PG_PORT, '-U', PG_USER, '-d', PG_DB, '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', sql],
      { env: Object.assign({}, process.env, { PGPASSWORD: '123456' }) },
      (err, stdout) => err ? reject(new Error(String(err && err.message || err))) : resolve(String(stdout || '')));
  });
}
function psqlInt(sql) { return psql(sql).then((s) => Number(String(s).trim())); }
function psqlIds(sql) {
  return psql(sql).then((s) => String(s).split('\n').map((x) => x.trim()).filter(Boolean).map(Number).sort((a, b) => a - b));
}

/* جداولی که برایِ run هایِ ارزان نگه داشته می‌شوند — بقیه با
   PAYESH_PG_HYDRATE_SKIP رد می‌شوند تا مقایسهٔ default-vs-scoped روی یک
   مجموعهٔ کوچکِ کنترل‌شده انجام شود. classes: ۱۰۰ کل / ۵ برایِ ۹۰۰۲. */
const KEEP = ['classes', 'subjects', 'schools'];

(async () => {
  const db = require('../server/db.js');
  let pgLib = null;
  try { pgLib = require('pg'); } catch (e) { pgLib = null; }
  if (!pgLib) { console.log('pg unavailable — SKIP'); process.exit(0); }

  /* لیستِ skip = همهٔ جدول‌هایِ public به‌جزِ KEEP (اسم‌های خارج از
     SCHEMA_TABLES بی‌ضررند — هرگز تطبیق نمی‌خورند). */
  const allTables = (await psql("SELECT string_agg(table_name, ',') FROM information_schema.tables WHERE table_schema = 'public'"))
    .split(',').map((s) => s.trim()).filter(Boolean);
  const SKIP_LIST = allTables.filter((t) => KEEP.indexOf(t) === -1);
  const SKIP_ENV = SKIP_LIST.join(',');

  const OLD_URL = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'postgresql://postgres@127.0.0.1:5432/' + PG_DB;

  /* یک recording pool در هر run: همهٔ SQLهای صادر‌شده را ثبت می‌کند تا
     شکلِ کوئری (نه فقط نتیجه) اثبات شود. failOn می‌تواند introspection
     را بشکند تا جهتِ fail-safe آزمون شود. */
  const pools = [];
  let issued = [];
  function attach(failOn) {
    issued = [];
    const real = new pgLib.Pool({
      host: PG_HOST, port: Number(PG_PORT), user: PG_USER, password: '123456',
      database: PG_DB, max: 4
    });
    const origQuery = real.query.bind(real);
    real.query = function (sql, params) {
      const text = String(sql && (sql.text || sql));
      issued.push({ sql: text, params: params });
      if (failOn && failOn(text)) {
        return Promise.reject(new Error('simulated introspection outage'));
      }
      return origQuery(sql, params);
    };
    pools.push(real);
    db.__setPoolForTests(real);
    return real;
  }

  /* هیدراتاسیون با override هایِ env — همیشه restore می‌شود. */
  async function hydrate(store, env, failOn) {
    attach(failOn);
    const saved = {};
    for (const k of Object.keys(env)) { saved[k] = process.env[k]; process.env[k] = env[k]; }
    try {
      return await db.hydrateStoreFromPg(store, { force: true });
    } finally {
      for (const k of Object.keys(env)) {
        if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
      }
    }
  }
  function sqlFor(table) {
    return issued.filter((q) => q.sql.indexOf('FROM "' + table + '"') > -1)
      .map((q) => ({ sql: q.sql, params: q.params }));
  }

  /* ── (۰) پیش‌نیازهایِ غیرپوک: دادهٔ خارجی واقعاً وجود دارد ────────── */
  const foreignGrades = await psqlInt('SELECT count(*) FROM grades WHERE school_id = ' + FOREIGN);
  const tenantGrades = await psqlInt('SELECT count(*) FROM grades WHERE school_id = ' + TENANT);
  const tenantUsers = await psqlInt('SELECT count(*) FROM users WHERE school_id = ' + TENANT);
  const foreignAtt = await psqlInt('SELECT count(*) FROM attendance WHERE school_id = ' + FOREIGN);
  const foreignUsers = await psqlInt('SELECT count(*) FROM users WHERE school_id = ' + FOREIGN);
  const classesTotal = await psqlInt('SELECT count(*) FROM classes');
  const classesTenant = await psqlInt('SELECT count(*) FROM classes WHERE school_id = ' + TENANT);
  const subjectsTotal = await psqlInt('SELECT count(*) FROM subjects');
  const subjectsTenant = await psqlInt('SELECT count(*) FROM subjects WHERE school_id = ' + TENANT);
  const schoolsTotal = await psqlInt('SELECT count(*) FROM schools');
  await chk('P0 preconditions: foreign data really exists in the DB (non-vacuous isolation proof)', async () => {
    assert.ok(foreignGrades > 0, 'foreign tenant must have grades in the DB');
    assert.ok(foreignGrades !== tenantGrades, 'tenant and foreign row counts must differ');
    assert.ok(foreignAtt > 0 && foreignUsers > 0, 'foreign tenant must have attendance and users');
    assert.ok(classesTotal > classesTenant && classesTenant > 0, 'classes must be shared across schools');
    assert.ok(schoolsTotal > 1, 'more than one school must exist');
  });

  /* ── run اصلی: tenant-scoped کامل (ارزان است چون فقط tenant بارگذاری
     می‌شود: ۱۲۵۰۰ نمره نه ۳۶۲۵۰۰) ──────────────────────────────────── */
  const scopedStore = {};
  const hScoped = await hydrate(scopedStore, { PAYESH_HYDRATE_SCHOOL_IDS: String(TENANT) });

  /* ── (A) دامنه در سورس ───────────────────────────────────────────── */
  await chk('A1 scoped mirror holds ONLY the tenant rows for school_id-bearing tables', async () => {
    assert.ok(Array.isArray(scopedStore.grades) && scopedStore.grades.length === tenantGrades,
      'grades: expected ' + tenantGrades + ' (tenant only), got ' + (scopedStore.grades && scopedStore.grades.length));
    assert.ok(scopedStore.grades.every((r) => Number(r.school_id) === TENANT),
      'every scoped grade must belong to the tenant');
    const att = scopedStore.attendance || [];
    const tenantAtt = await psqlInt('SELECT count(*) FROM attendance WHERE school_id = ' + TENANT);
    assert.ok(att.length === tenantAtt && att.every((r) => Number(r.school_id) === TENANT), 'attendance must be tenant-only');
    const users = scopedStore.users || [];
    assert.ok(users.length === tenantUsers && users.every((r) => Number(r.school_id) === TENANT),
      'users must be tenant-only (' + tenantUsers + ' expected, got ' + users.length + ')');
  });
  await chk('A2 the scoped read carries the tenant predicate with the school list as a bound param', async () => {
    const g = sqlFor('grades');
    assert.ok(g.length >= 1, 'a grades query must be issued');
    const pred = 'WHERE (school_id = ANY($1::int[]) OR school_id IS NULL)';
    assert.ok(g.every((q) => q.sql.indexOf(pred) > -1), 'every grades read must carry the tenant predicate: ' + JSON.stringify(g.map((q) => q.sql)));
    assert.deepStrictEqual(g[0].params, [[TENANT]], 'the school list must be a bound parameter, not interpolated');
  });
  await chk('A3 NO unbounded SELECT * is issued on any school_id-bearing table (O(tenant))', async () => {
    const scopedTables = (await psql("SELECT string_agg(table_name, ',') FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'school_id'"))
      .split(',').map((s) => s.trim()).filter(Boolean);
    const bare = [];
    for (const q of issued) {
      /* یک خواندنِ بدونِ دامنه = SELECT * بدونِ WHERE. مسیرِ scoped و مسیرِ
         capped هر دو WHERE دارند و نباید اینجا بیفتند. */
      const m = /^SELECT \* FROM "([a-z_0-9]+)"/.exec(q.sql);
      if (m && q.sql.indexOf(' WHERE ') === -1 && scopedTables.indexOf(m[1]) > -1) bare.push(q.sql);
    }
    assert.deepStrictEqual(bare, [], 'a school_id-bearing table was read without a scope: ' + JSON.stringify(bare));
  });
  await chk('A4 hydration cost is O(tenant): scoped run read far fewer rows than the DB holds', async () => {
    const rowsRead = (scopedStore.grades || []).length + (scopedStore.attendance || []).length;
    assert.ok(rowsRead > 0 && rowsRead < foreignGrades + tenantGrades,
      'scoped read ' + rowsRead + ' grade+attendance rows; the unbounded path would read ' + (foreignGrades + tenantGrades));
  });

  /* ── (B) tenant isolation ────────────────────────────────────────── */
  await chk('B1 another tenant\'s rows cannot enter the mirror (set equality with the tenant)', async () => {
    const got = (scopedStore.grades || []).map((r) => Number(r.id)).sort((a, b) => a - b);
    const want = await psqlIds('SELECT id FROM grades WHERE school_id = ' + TENANT);
    assert.deepStrictEqual(got, want, 'the scoped grades mirror must be exactly the tenant\'s grades');
  });
  await chk('B2 zero foreign rows in every scoped collection (while the DB holds them)', async () => {
    assert.strictEqual((scopedStore.grades || []).filter((r) => Number(r.school_id) === FOREIGN).length, 0);
    assert.strictEqual((scopedStore.attendance || []).filter((r) => Number(r.school_id) === FOREIGN).length, 0);
    assert.strictEqual((scopedStore.users || []).filter((r) => Number(r.school_id) === FOREIGN).length, 0);
    assert.ok(foreignGrades > 0 && foreignAtt > 0 && foreignUsers > 0, 'precondition: the foreign tenant really has rows');
  });
  await chk('B3 a foreign school\'s health gather from the scoped mirror is empty (isolation, not a crash)', async () => {
    const g = gather(scopedStore, FOREIGN);
    assert.deepStrictEqual(g, { staffRecent: 0, staffPrev: 0, modRecent: 0, modPrev: 0, openTickets: 0, subOverdue: null },
      'no foreign row may contribute to a foreign school\'s numbers');
  });

  /* ── (C) جدول‌های بدونِ school_id سراسری می‌مانند ────────────────── */
  await chk('C1 schools (no school_id) is loaded UNBOUNDED — health-index sees all schools', async () => {
    assert.ok(Array.isArray(scopedStore.schools) && scopedStore.schools.length === schoolsTotal,
      'schools must hold all ' + schoolsTotal + ' rows, got ' + (scopedStore.schools && scopedStore.schools.length));
    const s = sqlFor('schools');
    assert.ok(s.length >= 1 && s.every((q) => q.sql === 'SELECT * FROM "schools"'),
      'the schools read must stay the exact unbounded seam: ' + JSON.stringify(s.map((q) => q.sql)));
  });
  await chk('C2 no table lacking school_id is ever scoped (policy/authz tables stay global)', async () => {
    const noScopeTables = (await psql("SELECT string_agg(table_name, ',') FROM information_schema.tables st WHERE st.table_schema = 'public' AND NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = st.table_name AND c.column_name = 'school_id')"))
      .split(',').map((s) => s.trim()).filter(Boolean);
    const bad = [];
    for (const q of issued) {
      const m = /^SELECT \* FROM "([a-z_0-9]+)" WHERE \(school_id = ANY/.exec(q.sql);
      if (m && noScopeTables.indexOf(m[1]) > -1) bad.push(m[1]);
    }
    assert.deepStrictEqual(bad, [], 'a table without school_id was scoped: ' + JSON.stringify(bad));
  });

  /* ── (D) health-index + analytics همچنان درست کار می‌کنند ───────── */
  await chk('D1 health-index numbers for the tenant are IDENTICAL with another tenant\'s data present', async () => {
    /* آینهٔ «کاملِ شبیه‌سازی‌شده»: آینهٔ مقیّد + ردیف‌های واقعیِ یک tenant
       دیگر. gather فقط با school_id فیلتر می‌کند، پس اگر scoping در سورس
       درست باشد، اعداد باید یکسان بمانند. */
    const foreignGradesRows = await db.readCollectionForSchools('grades', [9003]);
    const foreignAttRows = await db.readCollectionForSchools('attendance', [9003]);
    const fullish = Object.assign({}, scopedStore, {
      grades: (scopedStore.grades || []).concat(foreignGradesRows),
      attendance: (scopedStore.attendance || []).concat(foreignAttRows)
    });
    assert.ok(foreignGradesRows.length > 0, 'precondition: the extra tenant really has rows');
    assert.deepStrictEqual(gather(scopedStore, TENANT), gather(fullish, TENANT),
      'adding another tenant\'s rows must not change this tenant\'s health numbers');
    assert.deepStrictEqual(computeHealth(gather(scopedStore, TENANT)), computeHealth(gather(fullish, TENANT)),
      'the computed health score must be identical');
  });
  await chk('D2 the health-index endpoint still serves every school (superadmin view, no crash)', async () => {
    const replies = [];
    const hi = createHealthIndex({
      store: scopedStore,
      sessionFrom: async () => ({ id: 1, role: 'superadmin', school_id: TENANT }),
      sendJson: (res, status, body) => { replies.push({ status, body }); },
      audit() {}
    });
    await hi.apiHealthIndex({}, {}, { get: (k) => null });
    assert.strictEqual(replies.length, 1);
    assert.strictEqual(replies[0].status, 200);
    const list = replies[0].body && replies[0].body.schools;
    assert.ok(Array.isArray(list) && list.length === schoolsTotal, 'all schools must be listed');
    const mine = list.find((x) => x.id === TENANT);
    const theirs = list.find((x) => x.id === FOREIGN);
    assert.ok(mine && typeof mine.score === 'number', 'the tenant school must have a score');
    assert.ok(theirs, 'a foreign school must still appear (schools table is global)');
  });
  await chk('D3 the analytics-style per-school JS filter over the scoped mirror equals the scoped seam', async () => {
    /* مسیرِ fallbackِ analytics: فیلترِ per-school روی آینه. چون آینه دقیقاً
       tenant را دارد، این فیلتر همان چیزی می‌دهد که readCollectionForSchools
       از PG می‌دهد — هم‌ارزیِ bootstrap با seamِ regional. */
    for (const coll of ['grades', 'attendance', 'classes']) {
      const viaMirror = (scopedStore[coll] || []).filter((r) => Number(r.school_id) === TENANT).map((r) => Number(r.id)).sort((a, b) => a - b);
      const viaPg = (await db.readCollectionForSchools(coll, [TENANT])).map((r) => Number(r.id)).sort((a, b) => a - b);
      assert.deepStrictEqual(viaMirror, viaPg, coll + ': mirror-filtered set must equal the PG scoped seam');
    }
  });

  /* ── (E) پیش‌فرضِ خاموش + fail-safe ──────────────────────────────── */
  await chk('E1 env UNSET = the previous full hydration (no predicate, all rows)', async () => {
    const st = {};
    await hydrate(st, { PAYESH_PG_HYDRATE_SKIP: SKIP_ENV });
    assert.ok(Array.isArray(st.classes) && st.classes.length === classesTotal,
      'classes must hold all ' + classesTotal + ' rows when unscoped, got ' + (st.classes && st.classes.length));
    assert.ok(st.subjects && st.subjects.length === subjectsTotal, 'subjects must be complete');
    const s = sqlFor('classes');
    assert.ok(s.length >= 1 && s.every((q) => q.sql === 'SELECT * FROM "classes"'),
      'the unscoped read must be the exact bare seam: ' + JSON.stringify(s.map((q) => q.sql)));
  });
  await chk('E2 the same keep-list WITH the scope loads only the tenant (O(tenant) vs O(total))', async () => {
    const st = {};
    const h = await hydrate(st, { PAYESH_HYDRATE_SCHOOL_IDS: String(TENANT), PAYESH_PG_HYDRATE_SKIP: SKIP_ENV });
    assert.ok(st.classes && st.classes.length === classesTenant && st.classes.every((r) => Number(r.school_id) === TENANT),
      'scoped classes must be tenant-only (' + classesTenant + ' rows)');
    assert.ok(h.tenant_scoped.indexOf('classes') > -1, 'classes must be reported as tenant-scoped');
    assert.ok(h.tenant_scoped.indexOf('schools') === -1, 'schools (no school_id) must never be reported as scoped');
    const s = sqlFor('classes');
    assert.ok(s.every((q) => q.sql.indexOf('school_id = ANY($1::int[])') > -1), 'the scoped run must carry the predicate');
  });
  await chk('E3 FAIL-SAFE: introspection failing degrades to the FULL read, never an empty mirror', async () => {
    const st = {};
    const h = await hydrate(
      st,
      { PAYESH_HYDRATE_SCHOOL_IDS: String(TENANT), PAYESH_PG_HYDRATE_SKIP: SKIP_ENV },
      (text) => text.indexOf('information_schema.columns') > -1   /* شبیه‌سازیِ قطعیِ کاتالوگ */
    );
    assert.ok(st.classes && st.classes.length === classesTotal,
      'an introspection outage must fall back to the unbounded read (' + classesTotal + ' rows), got ' + (st.classes && st.classes.length));
    assert.deepStrictEqual(h.tenant_scoped, [], 'nothing may be reported as scoped when introspection failed');
  });
  await chk('E4 an INVALID scope env is treated as no scope (fail-closed on the complete-hydration side)', async () => {
    const st = {};
    await hydrate(st, { PAYESH_HYDRATE_SCHOOL_IDS: 'abc,,0,-5', PAYESH_PG_HYDRATE_SKIP: SKIP_ENV });
    assert.ok(st.classes && st.classes.length === classesTotal,
      'garbage scope ids must not silently empty or partially scope the mirror, got ' + (st.classes && st.classes.length));
    const s = sqlFor('classes');
    assert.ok(s.every((q) => q.sql === 'SELECT * FROM "classes"'), 'garbage scope must produce the bare seam');
  });

  /* ── (F) قراردادها ──────────────────────────────────────────────── */
  await chk('F1 a tenant-scoped hydration sets mirror_incomplete so the store file is never overwritten', async () => {
    assert.ok(hScoped.tenant_scoped.length > 0, 'the scoped run must report which tables were scoped');
    for (const t of ['grades', 'attendance', 'users', 'classes']) {
      assert.ok(hScoped.tenant_scoped.indexOf(t) > -1, t + ' must be reported as tenant-scoped');
    }
    assert.deepStrictEqual(hScoped.capped, [], 'this run used no cap');
    assert.deepStrictEqual(hScoped.env_skipped, [], 'this run skipped nothing via env');
    assert.ok(hScoped.mirror_incomplete === true, 'a tenant-scoped mirror is partial and must be flagged');
    assert.strictEqual(db.shouldPersistMirrorFile(true, hScoped), false, 'the partial mirror must not be written over the store file');
    assert.strictEqual(db.shouldPersistMirrorFile(true, { capped: [], env_skipped: [], tenant_scoped: [] }), true, 'a complete hydration still allows persist');
    assert.strictEqual(db.shouldPersistMirrorFile(false, hScoped), true, 'without PG the flag must not block (unchanged semantics)');
  });
  await chk('F2 hydrationUsersCapped now also reports a tenant-scoped users mirror (same hazard as a cap)', async () => {
    assert.strictEqual(db.hydrationUsersCapped({ tenant_scoped: ['users'] }), true, 'scoped users must warn');
    assert.strictEqual(db.hydrationUsersCapped({ tenant_scoped: ['grades'] }), false, 'a non-users scope must not warn');
    assert.strictEqual(db.hydrationUsersCapped({ capped: ['users:5000'] }), true, 'existing capped semantics unchanged');
    assert.strictEqual(db.hydrationUsersCapped({ env_skipped: ['users'] }), true, 'existing skip semantics unchanged');
    assert.strictEqual(db.hydrationUsersCapped({}), false, 'an uncut hydration must not warn');
  });
  await chk('F3 cap and scope COMPOSE (scope first, then the row cap)', async () => {
    const st = {};
    const h = await hydrate(st, { PAYESH_HYDRATE_SCHOOL_IDS: String(TENANT), PAYESH_PG_HYDRATE_LIMIT: 'classes:3', PAYESH_PG_HYDRATE_SKIP: SKIP_ENV });
    assert.ok(st.classes && st.classes.length === 3, 'the cap must apply on top of the scope, got ' + (st.classes && st.classes.length));
    assert.ok(st.classes.every((r) => Number(r.school_id) === TENANT), 'capped rows must still be inside the tenant');
    assert.ok(h.capped.indexOf('classes:3') > -1, 'the cap must be reported');
    assert.ok(h.tenant_scoped.indexOf('classes') > -1, 'the scope must be reported too');
    assert.ok(h.mirror_incomplete === true, 'a capped+scoped mirror is partial');
  });
  await chk('F4 row SHAPE parity: scoped rows carry no internal columns and match readOne exactly', async () => {
    const g = scopedStore.classes && scopedStore.classes[0];
    assert.ok(g, 'a scoped class row must exist');
    assert.ok(!('chg_id' in g), 'the scoped read must strip chg_id like every other seam');
    const viaOne = await db.readOne('classes', g.id);
    assert.deepStrictEqual(Object.keys(g).sort(), Object.keys(viaOne).sort(), 'scoped mirror shape must equal readOne shape');
    for (const coll of ['grades', 'attendance', 'users']) {
      const leaked = (scopedStore[coll] || []).filter((r) => r && 'chg_id' in r);
      assert.deepStrictEqual(leaked, [], coll + ': no internal column may leak into the scoped mirror');
    }
  });

  /* ── shutdown ───────────────────────────────────────────────────── */
  for (const p of pools) { try { await p.end(); } catch (e) { /* already closed */ } }
  db.__setPoolForTests(null);
  if (OLD_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = OLD_URL;

  console.log('\n=== M15-04 Bootstrap — tenant-scoped mirror (live PG) ===');
  console.log('  passed: ' + pass + '   failed: ' + failures.length);
  if (failures.length) console.log('  FAILED: ' + failures.join(', '));
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('M15-04 bootstrap harness crashed:', e); process.exit(2); });
