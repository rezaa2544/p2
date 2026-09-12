#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   migration-009-live-mutations.js — اثباتِ اینکه گیتِ ۰۰۹ نقض را می‌گیرد
   (سبزِ جعلی ممنوع). هر جهش: نقضی عمدی در SQL مهاجرت ۰۰۹ تزریق و
   tests/migration-009-live.js اجرا می‌شود — باید قرمز شود؛ بعد restore.
   بدونِ باینری‌هایِ PG یا ماژولِ pg: self-skip.
   اجرا: PG_LIVE_BIN=/path/to/pg/bin node tests/migration-009-live-mutations.js
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
  console.log('  ⏭️  migration-009 mutations — باینری‌هایِ PG یا ماژولِ pg در دسترس نیستند');
  console.log('migration-009-live-mutations: 0/0 (skip)؛ سبزِ نهایی: ✅');
  process.exit(0);
}

const ROOT = path.join(__dirname, '..');
const FWD = path.join(ROOT, 'migrations', '009_report_logs_constraints.sql');
const DOWN = path.join(ROOT, 'migrations', '009_report_logs_constraints.down.sql');
const originals = new Map();
for (const f of [FWD, DOWN]) originals.set(f, fs.readFileSync(f, 'utf8'));
function restore() { for (const [f, s] of originals) fs.writeFileSync(f, s, 'utf8'); }
process.on('exit', restore);

const mutations = [
  {
    name: 'CHECK ِ kind حذف شود (kind نامعتبر پذیرفته می‌شود — M2/M4 قرمز)',
    file: FWD,
    mutate: (s) => s
      .replace(/ALTER TABLE report_logs\s+ADD CONSTRAINT chk_report_logs_kind[\s\S]*?NOT VALID;\n\n/, '')
      .replace('ALTER TABLE report_logs VALIDATE CONSTRAINT chk_report_logs_kind;\n', '')
  },
  {
    name: "format ِ 'screen' مجاز شود (بازگشتِ enum ِ حدسی — M5 قرمز)",
    file: FWD,
    mutate: (s) => s.replace("format IN ('csv', 'pdf')", "format IN ('csv', 'pdf', 'screen')")
  },
  {
    name: 'generated_by هر متنی بپذیرد (سیاستِ digits-only می‌میرد — M7a قرمز)',
    file: FWD,
    mutate: (s) => s.replace("generated_by ~ '^[0-9]+$'", 'TRUE')
  },
  {
    name: 'NOT VALID بدونِ VALIDATE (زبالهٔ موجود ساکت می‌ماند — M8c قرمز)',
    file: FWD,
    mutate: (s) => s.replace(/ALTER TABLE report_logs VALIDATE CONSTRAINT [a-z_]+;\n/g, '')
  },
  {
    name: 'down ایندکسِ مرکب را حذف نکند (rollback ناقص — M8a قرمز چون قید هم می‌ماند)',
    file: DOWN,
    mutate: (s) => s.replace('ALTER TABLE report_logs DROP CONSTRAINT IF EXISTS chk_report_logs_kind;\n', '')
  }
];

let killed = 0, survived = 0;
const survivors = [];
console.log('\nmigration-009-live-mutations — هر جهش باید گیت را قرمز کند\n');
for (const m of mutations) {
  const orig = originals.get(m.file);
  const mutated = m.mutate(orig);
  if (mutated === orig) {
    survived++; survivors.push(m.name + ' (الگو پیدا نشد!)');
    console.log('  ❌ جهش اعمال نشد: ' + m.name);
    continue;
  }
  fs.writeFileSync(m.file, mutated, 'utf8');
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, 'migration-009-live.js')],
    { stdio: 'pipe', timeout: 300000, env: process.env });
  restore();
  if (r.status !== 0) { killed++; console.log('  ✅ کشته شد: ' + m.name); }
  else { survived++; survivors.push(m.name); console.log('  ❌ زنده ماند: ' + m.name); }
}

console.log('\n  جمع: ' + killed + ' کشته، ' + survived + ' زنده از ' + mutations.length);
if (survivors.length) { console.log('  زنده‌ها:'); survivors.forEach((s) => console.log('   - ' + s)); }
console.log('');
process.exit(survived ? 1 : 0);
