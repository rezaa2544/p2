#!/usr/bin/env node
// tests/m15-04-regional-pg-scoped.js — M15-04 P0-1 (Regional) live-PG proof
// ---------------------------------------------------------------------------
// مسیرِ گزارشِ هوشِ منطقه‌ای پیش از M15-04 شش `SELECT * FROM "<t>"` کامل
// (بدون WHERE) می‌زد و سپس در Node با `.filter(school_id === sid)` دامنه می‌ساخت.
// این تست روی PG زنده ثابت می‌کند:
//   (۱) شکلِ کوئری: هر خواندنِ مجموعه‌ای روی این مسیر `WHERE school_id =
//       ANY($1::int[])` دارد و هیچ `SELECT *` بدونِ دامنه‌ای صادر نمی‌شود.
//   (۲) ایزوله‌سازیِ مستأجر: سطرهایِ مدرسهٔ منطقهٔ دیگر واردِ نتیجه نمی‌شوند.
//   (۳) هم‌ارزیِ عملکردی: نتیجهٔ خواندنِ مدرج با نتیجهٔ مسیرِ قدیم
//       (full-scan + فیلتر) از نظرِ تعداد و مجموعهٔ id یکسان است.
//   (۴) حالتِ حاشیه: لیستِ مدرسهٔ خالی ⇒ هیچ کوئری‌ای صادر نمی‌شود.
// ---------------------------------------------------------------------------
'use strict';

const assert = require('assert');
const { createAnalyticsRoutes } = require('../server/routes/analytics');

const PG_HOST = '127.0.0.1';
const PG_PORT = '5432';
const PG_USER = 'postgres';
const PG_BIN = 'C:\\Program Files\\PostgreSQL\\16\\bin';
const PG_DB = 'payesh_m15cap';   /* 20 مدرسه / 362500 نمره — همان DB مانورِ مقیاس */
const REGION_COLL = ['grades', 'attendance', 'classes', 'schedule', 'counselor_refs', 'teacher_notes'];

/* منطقهٔ ۲ در این DB: مدارس 9001, 9006, 9011, 9016 — و مدرسهٔ 9002 متعلق به
   منطقهٔ ۳ است (نباید واردِ نتیجهٔ منطقهٔ ۲ شود). */
const DISTRICT = 2;
const IN_SCHOOLS = [9001, 9006, 9011, 9016];
const OUT_SCHOOL = 9002;

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
const path = require('path');

(async () => {
  const db = require('../server/db.js');
  let pgLib = null;
  try { pgLib = require('pg'); } catch (e) { pgLib = null; }
  if (!pgLib) { console.log('pg unavailable — SKIP'); process.exit(0); }

  const issued = [];
  const realPool = new pgLib.Pool({
    host: PG_HOST, port: Number(PG_PORT), user: PG_USER, password: '123456',
    database: PG_DB, max: 4
  });
  const origQuery = realPool.query.bind(realPool);
  realPool.query = function (sql, params) {
    issued.push({ sql: String(sql), params: params });
    return origQuery(sql, params);
  };
  db.__setPoolForTests(realPool);

  const OLD_URL = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'postgresql://postgres@127.0.0.1:5432/' + PG_DB;

  try {
    /* ── (۰) پیش‌نیاز: توزیعِ منطقه‌ایِ DB همان است که تست فرض می‌کند ── */
    const dist = await psql("SELECT count(*) FROM schools WHERE district_id = " + DISTRICT + ";");
    const outDistrict = await psql("SELECT count(*) FROM schools WHERE id = " + OUT_SCHOOL + " AND district_id <> " + DISTRICT + ";");
    await chk('پیش‌نیاز: DB این شکلِ منطقه‌ای را دارد (۴ مدرسه در منطقهٔ ۲، ۹۰۰۲ در منطقهٔ دیگر)',
      () => {
        assert.strictEqual(Number(String(dist).trim()), IN_SCHOOLS.length,
          'district ' + DISTRICT + ' must hold exactly ' + IN_SCHOOLS.length + ' schools, got ' + dist);
        assert.strictEqual(Number(String(outDistrict).trim()), 1,
          'school ' + OUT_SCHOOL + ' must belong to another district for the negative proof');
      });

    /* ── (۱)+(۲) شکلِ کوئری و ایزوله‌سازیِ مستأجر ────────────────────── */
    console.log('▸ M15-04 · readCollectionForSchools: شکلِ کوئری و دامنه');
    {
      issued.length = 0;
      const rows = await db.readCollectionForSchools('grades', IN_SCHOOLS);
      await chk('دقیقاً یک کوئری صادر شد (نه شش، نه به‌ازایِ هر مدرسه)',
        () => {
          const gq = issued.filter(x => /FROM "grades"/.test(x.sql));
          assert.strictEqual(gq.length, 1, 'expected 1 grades query, got ' + gq.length);
        });
      await chk('کوئریِ grades دامنهٔ school_id = ANY($1::int[]) دارد (filter-at-source)',
        () => {
          const gq = issued.filter(x => /FROM "grades"/.test(x.sql))[0];
          assert.ok(/school_id = ANY\(\$1::int\[\]\)/.test(gq.sql),
            'scoped predicate missing: ' + gq.sql);
          assert.deepStrictEqual(gq.params, [IN_SCHOOLS], 'bound school ids must be the region schools');
        });
      await chk('هیچ SELECT * بدون WHEREای روی این مسیر صادر نشد',
        () => {
          const bare = issued.filter(x => /SELECT \* FROM "[a-z_]+"$/.test(x.sql.trim()));
          assert.deepStrictEqual(bare, [], 'an unbounded full-table scan was issued: ' + JSON.stringify(bare));
        });
      await chk('تمامِ سطرهایِ بازگشتی متعلق به مدارسِ همان منطقه‌اند (ایزوله‌سازی)',
        () => {
          assert.ok(rows.length > 0, 'expected rows for the 4 district-2 schools');
          const foreign = rows.filter(r => Number(r.school_id) !== 9001 && Number(r.school_id) !== 9006 && Number(r.school_id) !== 9011 && Number(r.school_id) !== 9016);
          assert.deepStrictEqual(foreign, [], foreign.length + ' row(s) of other tenants entered the scoped read');
        });
      await chk('هیچ سطری از مدرسهٔ ۹۰۰۲ (منطقهٔ دیگر) در نتیجه نیست',
        () => {
          const leaked = rows.filter(r => Number(r.school_id) === OUT_SCHOOL);
          assert.deepStrictEqual(leaked, [], 'school ' + OUT_SCHOOL + ' (other district) leaked into the scoped read');
        });
      await chk('شکلِ سطر با readCollection یکی است (chg_id کنار گذاشته شده)',
        () => {
          assert.ok(rows.every(r => !('chg_id' in r)), 'chg_id leaked into the scoped read');
        });
    }

    /* ── (۴) حالتِ حاشیه: لیستِ خالی ⇒ هیچ کوئری ───────────────────── */
    console.log('▸ M15-04 · حالتِ حاشیه: لیستِ مدرسهٔ خالی');
    {
      issued.length = 0;
      const empty = await db.readCollectionForSchools('grades', []);
      await chk('لیستِ خالی ⇒ هیچ کوئریای صادر نمی‌شود و نتیجه خالی است',
        () => { assert.deepStrictEqual(issued, []); assert.deepStrictEqual(empty, []); });
    }

    /* ── (۳) هم‌ارزیِ عملکردی با مسیرِ قدیم ──────────────────────────── */
    console.log('▸ M15-04 · هم‌ارزیِ عملکردی: مدرج vs full-scan+فیلتر');
    {
      const scopedRows = await db.readCollectionForSchools('attendance', IN_SCHOOLS);
      const fullRows = await db.readCollection('attendance');
      const legacyFiltered = fullRows.filter(r => IN_SCHOOLS.indexOf(Number(r.school_id)) > -1);
      await chk('تعدادِ سطرهایِ attendance با مسیرِ قدیم (full-scan + filter) برابر است',
        () => assert.strictEqual(scopedRows.length, legacyFiltered.length,
          'scoped=' + scopedRows.length + ' legacy=' + legacyFiltered.length));
      await chk('مجموعهٔ idهایِ attendance با مسیرِ قدیم یکسان است (ترتیب‌نامحسوس)',
        () => {
          const a = scopedRows.map(r => Number(r.id)).sort((x, y) => x - y);
          const b = legacyFiltered.map(r => Number(r.id)).sort((x, y) => x - y);
          assert.deepStrictEqual(a, b, 'row id sets differ between scoped and legacy paths');
        });
    }

    /* ── (۵) مسیرِ کاملِ گزارش: شش خواندنِ مدرج، بدونِ scan ─────────── */
    console.log('▸ M15-04 · گزارشِ منطقه‌ایِ کامل: شش خواندنِ مدرج');
    {
      issued.length = 0;
      const store = {};   /* PG-live: آینه استفاده نمی‌شود */
      const routes = createAnalyticsRoutes({ store, db });
      const sp = new URLSearchParams();
      sp.set('region_id', String(DISTRICT));
      const r = await routes.regionalIntelligenceReport({ user: { id: 1, role: 'superadmin' } }, sp);
      await chk('گزارش ۲۰۰ برمی‌گردد', () => assert.strictEqual(r.status, 200, JSON.stringify(r.body)));
      await chk('فقطِ ۴ مدرسهٔ منطقهٔ ۲ گزارش شدند (مدرسهٔ ۹۰۰۲ بیرون)',
        () => {
          const snap = r.body.snapshot || {};
          assert.strictEqual(snap.school_count, IN_SCHOOLS.length, 'school_count: ' + snap.school_count);
        });
      await chk('هر شش مجموعه با خواندنِ مدرج خوانده شد و هیچکدام full-scan نزد',
        () => {
          const scoped = issued.filter(x => /school_id = ANY\(\$1::int\[\]\)/.test(x.sql));
          const bareScans = issued.filter(x => {
            return REGION_COLL.some(cn => new RegExp('SELECT \\* FROM "' + cn + '"$').test(x.sql.trim()));
          });
          assert.strictEqual(scoped.length, REGION_COLL.length,
            'expected ' + REGION_COLL.length + ' scoped collection reads, got ' + scoped.length + ' — issued: ' + JSON.stringify(issued.map(x => x.sql)));
          assert.deepStrictEqual(bareScans, [], 'unbounded scans on the regional path: ' + JSON.stringify(bareScans));
        });
      await chk('مدارسِ خوانده‌شده در کوئریِ منطقهای، همان مدارسِ منطقهٔ ۲ هستند',
        () => {
          const schoolsQ = issued.filter(x => /FROM schools/.test(x.sql))[0];
          assert.ok(schoolsQ, 'a schools query must be issued');
          assert.deepStrictEqual(schoolsQ.params, [DISTRICT], 'schools query must bind the district id');
        });
    }
  } finally {
    try { await realPool.end(); } catch (e) {}
    db.__setPoolForTests(null);
    if (OLD_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = OLD_URL;
  }

  await Promise.resolve();
  console.log('\n──────────────────────────────────────────');
  if (failures.length) {
    console.log('m15-04-regional-pg-scoped: ' + pass + ' موفق، ' + failures.length + ' ناموفق');
    console.log('ناموفق‌ها: ' + failures.join(' | '));
    process.exit(1);
  }
  console.log('m15-04-regional-pg-scoped: ' + pass + '/' + pass + ' موفق ✅');
  process.exit(0);
})().catch(e => { console.error('harness crashed:', e); process.exit(2); });
