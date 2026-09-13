#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/wave10-chg-id.js — Wave 10 (Database Scale), step 4
   ─────────────────────────────────────────────────────────────────
   دلتای مبتنی بر change-ID (chg_id) — زیرساختِ مهاجرتِ ۰۰۸ + سازندهٔ
   کوئری + پریتیِ شکلِ سطر (ستونِ داخلی هرگز بیرون نمی‌رود):

     C1  قراردادِ ۰۰۸: دقیقاً ۱۴ ایندکس chg_id روی ۱۴ جدولِ درست
     C2  قراردادِ ۰۰۸: سکوئنس + تابعِ bump + تریگرِ idempotent + backfill
     C3  قراردادِ ۰۰8.down: وارون‌سازیِ کامل (ایندکس/ستون/تریگر/تابع/سکوئنس)
     C4  سازندهٔ deltaRowsByChgSql: شکلِ SQL/پارامتر + allowlist + گاردِ watermark
     C5  db.stripInternalColumns: واحد — فقط ستون‌های داخلی حذف می‌شوند
     C6  readCollection/readOne با pool جعلی: chg_id به بیرون نشت نمی‌کند
     C7  یکپارچگیِ pull: سطرهای دلتا بدونِ chg_id به کلاینت می‌رسند

   Run: node tests/wave10-chg-id.js   (exit 0 = green)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const db = require(path.join(ROOT, 'server', 'db'));
const syncdelta = require(path.join(ROOT, 'server', 'syncdelta'));
const { createPull } = require(path.join(ROOT, 'server', 'pull'));

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}

/* ۱۴ جدولِ قراردادی — تراکنشیِ per-school دلتا (۰۰۵ منهای schools/bell_schedules) */
const TABLES14 = [
  'users', 'classes', 'subjects', 'schedule', 'enrollments',
  'attendance', 'grades', 'discipline', 'leaves', 'notifications',
  'announcements', 'hw_submissions', 'counselor_refs', 'counselor_msgs'
];

(async () => {
  console.log('\n▸ Wave 10 · گام ۴ — دلتای مبتنی بر change-ID');

  /* ── C1: قراردادِ ایندکس‌ها ── */
  const up = fs.readFileSync(path.join(ROOT, 'migrations', '011_delta_chg_id.sql'), 'utf8');
  const idxMatches = [...up.matchAll(/CREATE INDEX IF NOT EXISTS (idx_(\w+)_chg_id)\s+ON (\w+)\s+\(chg_id\);/g)];
  const idxTables = idxMatches.map((m) => m[3]).sort();
  chk('C1a دقیقاً ۱۴ ایندکس chg_id', idxMatches.length === 14, 'got ' + idxMatches.length);
  chk('C1b روی همان ۱۴ جدولِ قراردادی', JSON.stringify(idxTables) === JSON.stringify([...TABLES14].sort()),
    JSON.stringify(idxTables));
  chk('C1c الگویِ نام‌گذاری idx_<table>_chg_id', idxMatches.every((m) => m[1] === 'idx_' + m[2] + '_chg_id'));
  chk('C1d صعودی (اسکنِ رو به جلوی watermark)', /ON \w+\s+\(chg_id\)/.test(up) && !/chg_id DESC/.test(up));

  /* ── C2: سکوئنس/تریگر/backfill ── */
  chk('C2a سکوئنسِ مشترک ساخته می‌شود', /CREATE SEQUENCE IF NOT EXISTS payesh_chg_seq;/.test(up));
  chk('C2b تریگرِ BEFORE INSERT OR UPDATE در بلوکِ DO (نه کامنت)', up.includes("CREATE TRIGGER trg_%s_chg BEFORE INSERT OR UPDATE ON %I") && /payesh_chg_bump\(\)/.test(up));
  chk('C2c تریگرها idempotent (DROP IF EXISTS + CREATE)', /DROP TRIGGER IF EXISTS trg_%s_chg/.test(up));
  const backfills = [...up.matchAll(/UPDATE (\w+)\s+SET chg_id = nextval\('payesh_chg_seq'\) WHERE chg_id IS NULL;/g)].map((m) => m[1]).sort();
  chk('C2d backfill برایِ هر ۱۴ جدول', JSON.stringify(backfills) === JSON.stringify([...TABLES14].sort()),
    JSON.stringify(backfills));
  chk('C2e تراکنشِ کامل (BEGIN/COMMIT)', /^\s*BEGIN;/m.test(up) && /^\s*COMMIT;/m.test(up));
  chk('C2f هر ۱۴ جدول در بلوکِ DO آمده‌اند', TABLES14.every((t) => up.includes("'" + t + "'")));
  chk('C2g هیچ CREATE INDEX CONCURRENTLY (سیاستِ ۰۰۴/۰۰۵/۰۰۷)', !/CREATE INDEX CONCURRENTLY/.test(up));

  /* ── C3: وارون‌سازی ── */
  const down = fs.readFileSync(path.join(ROOT, 'migrations', '011_delta_chg_id.down.sql'), 'utf8');
  chk('C3a هر ۱۴ تریگر وارون', TABLES14.every((t) => down.includes('DROP TRIGGER IF EXISTS trg_' + t + '_chg')));
  chk('C3b هر ۱۴ ایندکس وارون', TABLES14.every((t) => down.includes('DROP INDEX IF EXISTS idx_' + t + '_chg_id;')));
  chk('C3c هر ۱۴ ستون وارون', TABLES14.every((t) => new RegExp('ALTER TABLE ' + t + '\\s+DROP COLUMN IF EXISTS chg_id;').test(down)));
  chk('C3d تابع و سکوئنس وارون (سکوئنس آخر)', /DROP FUNCTION IF EXISTS payesh_chg_bump\(\);/.test(down)
    && /DROP SEQUENCE IF EXISTS payesh_chg_seq;/.test(down)
    && down.indexOf('DROP SEQUENCE') > down.indexOf('DROP COLUMN IF EXISTS chg_id'));
  chk('C3e تراکنشِ کامل', /^\s*BEGIN;/m.test(down) && /^\s*COMMIT;/m.test(down));

  /* ── C4: سازندهٔ کوئری ── */
  const b = syncdelta.deltaRowsByChgSql('grades', { afterChgId: 42 });
  chk('C4a SQL: watermark + ترتیبِ پایدار', b.sql === 'SELECT * FROM "grades" WHERE chg_id > $1 ORDER BY chg_id ASC, id ASC', b.sql);
  chk('C4b پارامترِ صحیح (صحیحِ مثبت)', JSON.stringify(b.params) === '[42]');
  chk('C4c allowlist — جدولِ خارج از فهرست رد', (() => { try { syncdelta.deltaRowsByChgSql('evil', { afterChgId: 1 }); return false; } catch (e) { return /not allowlisted/.test(e.message); } })());
  chk('C4d گاردِ watermark — نبود/منفی رد', (() => {
    try { syncdelta.deltaRowsByChgSql('grades', {}); return false; } catch (e) { /* ok */ }
    try { syncdelta.deltaRowsByChgSql('grades', { afterChgId: -5 }); return false; } catch (e) { /* ok */ }
    return true;
  })());
  chk('C4e هر ۱۴ جدول با allowlistِ سازنده سازگار', TABLES14.every((t) => {
    try { syncdelta.deltaRowsByChgSql(t, { afterChgId: 0 }); return true; } catch (e) { return false; }
  }));
  chk('C4f اعدادِ اعشاری trunc می‌شوند (نه خطا)', (() => {
    const r = syncdelta.deltaRowsByChgSql('grades', { afterChgId: 9.7 });
    return JSON.stringify(r.params) === '[9]';
  })());

  /* ── C5: strip — واحد ── */
  const rows = [{ id: 1, chg_id: 100, score: 20 }, { id: 2, score: 19 }, { id: 3, chg_id: 102 }];
  const out = db.stripInternalColumns(rows);
  chk('C5a chg_id از همهٔ سطرها حذف', out.every((r) => !('chg_id' in r)));
  chk('C5b بقیهٔ فیلدها دست‌نخورده', out[0].id === 1 && out[0].score === 20 && out[1].score === 19);
  chk('C5c سطرِ تمیز همان ارجاع می‌ماند (بدون کپیِ بی‌مورد)', out[1] === rows[1]);
  chk('C5d ورودیِ غیرآرایه‌ای عیناً برمی‌گردد', db.stripInternalColumns(null) === null && db.stripInternalColumns('x') === 'x');
  chk('C5e آرایهٔ اصلی mutate نمی‌شود', rows[0].chg_id === 100);

  /* ── C6: نشت‌نکردن در خوانش‌های db (pool جعلی) ── */
  const fakePool = {
    totalCount: 2, idleCount: 1, waitingCount: 0,
    query: async (sql) => {
      if (/FROM "grades" WHERE id/.test(sql)) return { rows: [{ id: 7, chg_id: 555, score: 18 }], rowCount: 1 };
      if (/FROM "grades"/.test(sql)) return { rows: [{ id: 7, chg_id: 555, score: 18 }, { id: 8, chg_id: 556, score: 17 }], rowCount: 2 };
      return { rows: [], rowCount: 0 };
    },
    connect: async () => ({ query: async () => ({ rows: [], rowCount: 0 }), release: () => {} }),
    end: async () => {}
  };
  db.__setPoolForTests(fakePool);
  try {
    const all = await db.readCollection('grades');
    chk('C6a readCollection: chg_id نشت نمی‌کند', all.every((r) => !('chg_id' in r)) && all.length === 2, JSON.stringify(all));
    const one = await db.readOne('grades', 7);
    chk('C6b readOne: chg_id نشت نمی‌کند', one && one.id === 7 && !('chg_id' in one), JSON.stringify(one));
  } finally {
    db.__setPoolForTests(null);
  }

  /* ── C7: یکپارچگیِ pull — سطرهای دلتا بدونِ chg_id ── */
  const deltaRows = [
    { id: 7, school_id: 1, chg_id: 555, score: 18, updated_at: new Date().toISOString(), created_at: new Date().toISOString() },
    { id: 8, school_id: 1, chg_id: 556, score: 17, updated_at: new Date().toISOString(), created_at: new Date().toISOString() }
  ];
  const fakeDb = {
    stripInternalColumns: db.stripInternalColumns,
    isPostgres: () => true, /* مسیرِ fetchDeltaRows فقط با PG زنده فعال می‌شود */
    query: async (sql) => (/FROM "grades"/.test(sql) ? { rows: deltaRows, rowCount: 2 } : { rows: [], rowCount: 0 }),
    readCollection: async () => deltaRows
  };
  const controller = createPull({
    store: { __deleted_records: [], __server_version: 5, grades: [] },
    db: fakeDb,
    sessionFrom: async () => ({ id: 10, school_id: 1, role: 'manager' }),
    sendJson: (res, code, body) => { res._cap = { code, body }; }
  });
  const res = { _cap: null };
  await controller.apiPull({ url: '/api/v1/pull?since=' + encodeURIComponent(new Date(Date.now() - 60000).toISOString()) + '&collections=grades', headers: {} }, res);
  const pulled = (res._cap && res._cap.body && res._cap.body.collections && res._cap.body.collections.grades) || null;
  chk('C7a pull دلتا ۲۰۰ با ۲ ردیف', res._cap && res._cap.code === 200 && Array.isArray(pulled) && pulled.length === 2,
    JSON.stringify(res._cap && res._cap.code));
  chk('C7b هیچ سطرِ دلتایی chg_id ندارد (شکل = حالتِ حافظه)', Array.isArray(pulled) && pulled.every((r) => !('chg_id' in r)),
    JSON.stringify(pulled));

  console.log('\n────────────────────────────────────────────');
  if (failc === 0) console.log(`Wave10 chg_id: ${okc}/${okc} — بدون خطا ✅`);
  else {
    console.log(`Wave10 chg_id: ${okc}/${okc + failc} — ${failc} خطا ❌`);
    fails.forEach((f) => console.log('  ✗ ' + f));
  }
  process.exit(failc ? 1 : 0);
})().catch((e) => { console.error('FATAL:', e); process.exit(2); });
