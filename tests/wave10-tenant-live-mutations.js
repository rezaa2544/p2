#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   wave10-tenant-live-mutations.js — اثباتِ اینکه گیتِ زندهٔ tenant
   (tests/wave10-tenant-live.js) واقعاً نشتِ چند-مستاجری را می‌گیرد
   (سبزِ جعلی ممنوع).
   هر جهش: گاردِ tenant/نقش در server/dbquery.js عمداً شکسته و
   tests/wave10-tenant-live.js اجرا می‌شود — باید قرمز شود؛ بعد restore.
   بدونِ باینری‌هایِ PG (PATH یا PG_LIVE_BIN) یا ماژولِ pg: fail-closed prerequisite gate.
   اجرا: PG_LIVE_BIN=/path/to/pg/bin node tests/wave10-tenant-live-mutations.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

function findPgBin() {
  const cand = [];
  if (process.env.PG_LIVE_BIN) cand.push(process.env.PG_LIVE_BIN);
  try {
    const w = cp.execSync('which initdb', { stdio: 'pipe' }).toString().trim().split('\n')[0];
    if (w) cand.push(path.dirname(w));
  } catch (e) {}
  for (const d of cand) {
    if (['initdb', 'postgres', 'pg_ctl'].every((b) => fs.existsSync(path.join(d, b)))) return d;
  }
  return null;
}
function hasPgModule() { try { require.resolve('pg'); return true; } catch (e) { return false; } }
if (!findPgBin() || !hasPgModule()) {
  console.log('  ⏭️  wave10 tenant live mutations — باینری‌هایِ PG یا ماژولِ pg در دسترس نیستند');
  console.log('wave10-tenant-live-mutations: 0/0 (NOT-RUN)؛ PASS only when runtime prerequisites are present; missing prerequisites are NOT-RUN and exit 2');
  process.exit(2);
}

const ROOT = path.join(__dirname, '..');
const DBQ = path.join(ROOT, 'server', 'dbquery.js');
const original = fs.readFileSync(DBQ, 'utf8');
function restore() { fs.writeFileSync(DBQ, original, 'utf8'); }
process.on('exit', restore);

/* هر جهش یک گاردِ واقعی را می‌شکند؛ گیتِ زنده باید نشت را ببیند و قرمز شود. */
const mutations = [
  {
    name: 'حذفِ مهارِ مدرسه در attendance (school_id = $ → 1=1) ⇒ نشتِ بینِ مدارس',
    mutate: (s) => s.replace(
      "      parts.push(`school_id = $${i}`); /* Wave 5 — strict anchor, no NULL escape */",
      "      parts.push(`1 = 1`); /* MUTANT: tenant anchor removed */")
  },
  {
    name: 'حذفِ مهارِ مدرسه در grades (g.school_id) ⇒ نمرهٔ مدرسهٔ دیگر نشت کند',
    mutate: (s) => s.replace(
      "      parts.push(`g.school_id = $${i}`); /* Wave 5 — strict anchor, no NULL escape */",
      "      parts.push(`1 = 1`); /* MUTANT: tenant anchor removed */")
  },
  {
    name: 'مهارِ users با NULL-escape (نشتِ حساب‌هایِ ملی به دایرکتوریِ مدرسه)',
    mutate: (s) => s.replace(
      "      parts.push(`u.school_id = $${i}`); /* Wave 5 — national accounts (school NULL) never leak */",
      "      parts.push(`(u.school_id = $${i} OR u.school_id IS NULL)`); /* MUTANT */")
  },
  {
    name: 'حذفِ فیلترِ خود-دانش‌آموز در grades ⇒ دانش‌آموز نمرهٔ هم‌مدرسه‌ای‌ها را ببیند',
    mutate: (s) => s.replace(
      "  if (user && user.role === 'student') {\n    const sid = push(Number(user.id));\n    parts.push(`g.student_id = $${sid}`);",
      "  if (user && false) { /* MUTANT: student self-filter removed */\n    const sid = push(Number(user.id));\n    parts.push(`g.student_id = $${sid}`);")
  },
  {
    name: 'حذفِ parent_links در attendance ⇒ ولی حضورِ همهٔ بچه‌ها را ببیند',
    mutate: (s) => s.replace(
      "  } else if (user && user.role === 'parent') {\n    const pid = push(Number(user.id));\n    parts.push(`EXISTS (SELECT 1 FROM \"${tableName('parent_links')}\" pl WHERE pl.parent_id = $${pid} AND pl.student_id = attendance.student_id)`);",
      "  } else if (user && false) { /* MUTANT: parent link guard removed */\n    const pid = push(Number(user.id));\n    parts.push(`EXISTS (SELECT 1 FROM \"${tableName('parent_links')}\" pl WHERE pl.parent_id = $${pid} AND pl.student_id = attendance.student_id)`);")
  },
  {
    name: 'حذفِ گاردِ کلاس‌هایِ دبیر در attendance ⇒ دبیر همهٔ مدرسه را ببیند',
    mutate: (s) => s.replace(
      "  if (user && user.role === 'teacher') {\n    /* Wave 5 — teacher sees attendance of classes they actually teach",
      "  if (user && false) { /* MUTANT: teacher class guard removed */\n    /* Wave 5 — teacher sees attendance of classes they actually teach")
  },
  {
    name: 'اجتماعِ policy دبیر در grades به 1=1 ⇒ دبیر نمرهٔ کلاس‌هایِ غیرمرتبط را ببیند',
    mutate: (s) => s.replace(
      "      `(g.teacher_id = $${tid} OR EXISTS (SELECT 1 FROM \"${tableName('schedule')}\" s3 WHERE s3.teacher_id = $${tid} AND s3.subject_id = g.subject_id)` +",
      "      `(1 = 1 OR g.teacher_id = $${tid} OR EXISTS (SELECT 1 FROM \"${tableName('schedule')}\" s3 WHERE s3.teacher_id = $${tid} AND s3.subject_id = g.subject_id)` + /* MUTANT */")
  }
];

let killed = 0, survived = 0;
const survivors = [];
console.log('\nwave10-tenant-live-mutations — هر جهش باید گیتِ زندهٔ tenant را قرمز کند\n');
for (const m of mutations) {
  const mutated = m.mutate(original);
  if (mutated === original) {
    survived++; survivors.push(m.name + ' (الگویِ جهش پیدا نشد!)');
    console.log('  ❌ جهش اعمال نشد: ' + m.name);
    continue;
  }
  fs.writeFileSync(DBQ, mutated, 'utf8');
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, 'wave10-tenant-live.js')],
    { stdio: 'pipe', timeout: 300000, env: process.env });
  restore();
  const failedAsExpected = r.status !== 0;
  if (failedAsExpected) { killed++; console.log('  ✅ کشته شد: ' + m.name); }
  else { survived++; survivors.push(m.name); console.log('  ❌ زنده ماند: ' + m.name); }
}

console.log('\n  جمع: ' + killed + ' کشته، ' + survived + ' زنده از ' + mutations.length);
if (survivors.length) { console.log('  زنده‌ها:'); survivors.forEach((s) => console.log('   - ' + s)); }
console.log('');
process.exit(survived ? 1 : 0);
