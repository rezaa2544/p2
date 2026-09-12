#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   wave10-pg-live-mutations.js — اثباتِ اینکه گیتِ زندهٔ PG موج ۱۰
   واقعاً نقضِ قرارداد را می‌گیرد (سبزِ جعلی ممنوع).
   هر جهش: نقضی عمدی در server/db.js تزریق و tests/wave10-pg-live.js
   اجرا می‌شود — باید قرمز شود؛ بعد restore.
   بدونِ باینری‌هایِ PG (PATH یا PG_LIVE_BIN) یا ماژولِ pg: self-skip.
   اجرا: PG_LIVE_BIN=/path/to/pg/bin node tests/wave10-pg-live-mutations.js
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
  console.log('  ⏭️  wave10 pg live mutations — باینری‌هایِ PG یا ماژولِ pg در دسترس نیستند');
  console.log('wave10-pg-live-mutations: 0/0 (skip)؛ سبزِ نهایی: ✅');
  process.exit(0);
}

const ROOT = path.join(__dirname, '..');
const DB = path.join(ROOT, 'server', 'db.js');
const original = fs.readFileSync(DB, 'utf8');
function restore() { fs.writeFileSync(DB, original, 'utf8'); }
process.on('exit', restore);

const mutations = [
  {
    name: 'isReplicaActive همیشه false (مسیریابی به رپلیکا هرگز روشن نشود)',
    mutate: (s) => s.replace(
      'return readPoolActive && readPool !== null;',
      'return false; /* MUTANT */')
  },
  {
    name: 'queryRead به‌جایِ رپلیکا از پرماری بخواند (نقضِ مسیریابیِ read)',
    mutate: (s) => s.replace(
      'const res = await readPool.query(text, params);',
      'const res = await pool.query(text, params); /* MUTANT */')
  },
  {
    name: 'fallbackِ queryRead حذف شود (رپلیکایِ خاموش ⇒ پرتابِ خطا)',
    mutate: (s) => s.replace(
      "console.warn('[DB] Read replica query failed; falling back to primary:', err.message);",
      'throw err; /* MUTANT: no fallback */')
  },
  {
    name: 'reprobeِ S3-1 عقیم شود (رپلیکایِ برگشته هرگز دوباره مسیریابی نشود)',
    mutate: (s) => s.replace(
      'function scheduleReplicaReprobe() {',
      'function scheduleReplicaReprobe() { return; /* MUTANT */')
  },
  {
    name: 'init پس از pingِ موفق هم رپلیکا را فعال نکند',
    mutate: (s) => s.replace(
      "try { await rc.query('SELECT 1 AS ping'); readPoolActive = true; }",
      "try { await rc.query('SELECT 1 AS ping'); readPoolActive = false; /* MUTANT */ }")
  }
];

let killed = 0, survived = 0;
const survivors = [];
console.log('\nwave10-pg-live-mutations — هر جهش باید گیت را قرمز کند\n');
for (const m of mutations) {
  const mutated = m.mutate(original);
  if (mutated === original) {
    survived++; survivors.push(m.name + ' (الگویِ جهش پیدا نشد!)');
    console.log('  ❌ جهش اعمال نشد: ' + m.name);
    continue;
  }
  fs.writeFileSync(DB, mutated, 'utf8');
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, 'wave10-pg-live.js')],
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
