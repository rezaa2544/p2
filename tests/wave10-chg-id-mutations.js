#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   tests/wave10-chg-id-mutations.js — جهش‌هایِ Wave 10 (قانون SKILLS §۵)
   هر جهش باید حداقل یک تستِ wave10-chg-id.js را بکشد (exit != 0)؛
   جهشِ زنده = تست ناکافی. پس از هر جهش، سورس عیناً برمی‌گردد.
   ─────────────────────────────────────────────────────────────────
   M1  db.js: strip در readCollection حذف           → C6a باید بمیرد
   M2  db.js: stripInternalColumns همانی (identity) → C5/C6/C7 باید بمیرند
   M3  pull.js: strip از دلتا حذف                   → C7b باید بمیرد
   M4  syncdelta.js: predicate watermark حذف        → C4a باید بمیرد
   M5  مهاجرت ۰۰۸: یک ایندکس حذف (۱۳ می‌ماند)       → C1a باید بمیرد
   M6  مهاجرت ۰۰۸: تریگر AFTER به‌جای BEFORE        → C2b باید بمیرد
   M7  down: حذفِ DROP SEQUENCE                     → C3d باید بمیرد
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const chk = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
};
function mutate(file, old, newTxt) {
  const p = path.join(ROOT, file);
  const src = fs.readFileSync(p, 'utf8');
  if (src.indexOf(old) === -1) throw new Error('anchor not found in ' + file + ': ' + old.slice(0, 60));
  fs.writeFileSync(p, src.replace(old, newTxt), 'utf8');
  return src;
}
function runSuite() {
  try { execFileSync('node', [path.join(ROOT, 'tests', 'wave10-chg-id.js')], { stdio: 'pipe', timeout: 120000 }); return 0; }
  catch (e) { return (e.status != null ? e.status : -1); }
}

(async () => {
  console.log('\n▸ جهش‌های Wave 10 — chg_id');

  let orig = mutate('server/db.js',
    "    return stripInternalColumns(reviveRows(res.rows));",
    "    return reviveRows(res.rows); /*MUT*/");
  chk('M1 «strip در readCollection حذف» کشته شد', runSuite() !== 0);
  fs.writeFileSync(path.join(ROOT, 'server', 'db.js'), orig, 'utf8');

  orig = mutate('server/db.js',
    "function stripInternalColumns(rows) {\n  if (!Array.isArray(rows)) return rows;\n  return rows.map((r) => {",
    "function stripInternalColumns(rows) { /*MUT: identity*/\n  if (!Array.isArray(rows)) return rows;\n  return rows.map((r) => { void r; const __r = r; r = null; if (false) {");
  try {
    chk('M2 «strip همانی» کشته شد', runSuite() !== 0);
  } finally {
    fs.writeFileSync(path.join(ROOT, 'server', 'db.js'), orig, 'utf8');
  }

  orig = mutate('server/pull.js',
    "      return (typeof db.stripInternalColumns === 'function') ? db.stripInternalColumns(rows) : rows;",
    "      return rows; /*MUT*/");
  chk('M3 «strip از دلتای pull حذف» کشته شد', runSuite() !== 0);
  fs.writeFileSync(path.join(ROOT, 'server', 'pull.js'), orig, 'utf8');

  orig = mutate('server/syncdelta.js',
    'sql: `SELECT * FROM "${t}" WHERE chg_id > $1 ORDER BY chg_id ASC, id ASC`,',
    'sql: `SELECT * FROM "${t}" WHERE chg_id >= $1 OR chg_id IS NULL ORDER BY chg_id ASC, id ASC` /*MUT*/,');
  chk('M4 «predicate آب‌شده» کشته شد', runSuite() !== 0);
  fs.writeFileSync(path.join(ROOT, 'server', 'syncdelta.js'), orig, 'utf8');

  orig = mutate('migrations/011_delta_chg_id.sql',
    "CREATE INDEX IF NOT EXISTS idx_grades_chg_id           ON grades           (chg_id);",
    "/*MUT: index removed*/");
  chk('M5 «یکی از ۱۴ ایندکس حذف» کشته شد', runSuite() !== 0);
  fs.writeFileSync(path.join(ROOT, 'migrations', '011_delta_chg_id.sql'), orig, 'utf8');

  orig = mutate('migrations/011_delta_chg_id.sql',
    "CREATE TRIGGER trg_%s_chg BEFORE INSERT OR UPDATE ON %I",
    "CREATE TRIGGER trg_%s_chg AFTER INSERT OR UPDATE ON %I /*MUT*/");
  chk('M6 «تریگر AFTER» کشته شد', runSuite() !== 0);
  fs.writeFileSync(path.join(ROOT, 'migrations', '011_delta_chg_id.sql'), orig, 'utf8');

  orig = mutate('migrations/011_delta_chg_id.down.sql',
    "DROP SEQUENCE IF EXISTS payesh_chg_seq;",
    "/*MUT: sequence drop removed*/");
  chk('M7 «وارون‌سازیِ سکوئنس حذف» کشته شد', runSuite() !== 0);
  fs.writeFileSync(path.join(ROOT, 'migrations', '011_delta_chg_id.down.sql'), orig, 'utf8');

  chk('پایه پس از بازگردانی سبز است', runSuite() === 0);

  console.log('\n────────────────────────────────────────────');
  console.log(`جهش‌های wave10-chg-id: ${pass}/${pass + fail}` + (fail ? ' — ❌' : ' — همه کشته شدند ✅'));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL:', e.message); process.exit(2); });
