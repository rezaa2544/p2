#!/usr/bin/env node
/**
 * دور ۷۹ بند  — جهش‌های پوشِ میانگین کلاس (بند ۴.۹) — پایش
 *
 *  M1 — ارتفاعِ تیک از normِ خودِ دانش‌آموز (به‌جای میانگین کلاس) → G2
 *  M2 — لِجِند حذف شود → G2
 *  M3 — classScoreContext عضویتِ درس را نادیده بگیرد → G4
 *  M4 — آستانهٔ ۲ نفر به ۳ شود (تیکِ تک‌نفره ساخته شود) → G3
 *
 * اجرا: node tests/trendcmp2-mutations.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function chk(c, m) { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } }

function mutate(file, from, to, killRe, tag) {
  const f = path.join(ROOT, file);
  const orig = fs.readFileSync(f, 'utf8');
  const bad = orig.replace(from, to);
  if (bad === orig) { chk(false, tag + ': جهش اعمال نشد (نماد پیدا نشد)'); return; }
  fs.writeFileSync(f, bad, 'utf8');
  try {
    execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
    const r = spawnSync('node', [path.join(ROOT, 'tests/trendcmp2.js')], { cwd: ROOT, encoding: 'utf8' });
    chk(r.status !== 0 && killRe.test(r.stdout || r.stderr || ''), tag + ' کشته شد');
  } finally {
    fs.writeFileSync(f, orig, 'utf8');
  }
}

mutate('src/js/17-student-record.js',
  "((cAvg / 20) * 100).toFixed(1)",
  "(p.norm / 20 * 100).toFixed(1)",
  /❌ G2/, 'M1 تیک با ارتفاعِ نمرهٔ خودِ دانش‌آموز');
mutate('src/js/17-student-record.js',
  "  var tickLegend = hasTick",
  "  var tickLegend = '' ; void hasTick",
  /❌ G2/, 'M2 لِجِندِ میانگین کلاس حذف');
mutate('src/js/04-queries.js',
  "      if(!ids[g.student_id]) return;",
  "      if(false) return; /* جهش: عضویت نادیده گرفته شد */",
  /❌ G4/, 'M3 نادیده‌گرفتنِ عضویتِ درس در میانگین');
mutate('src/js/04-queries.js',
  "    if(cnt<2) return;",
  "    if(cnt<3) return;",
  /❌ G4/, 'M4 آستانهٔ ۲ نفر به ۳ (گروهِ ۲ نفرهٔ G4 میانگین نمی‌سازد)');

/* بازسازی + خطِّ پایه */
execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' });
const b2 = spawnSync('node', [path.join(ROOT, 'tests/trendcmp2.js')], { cwd: ROOT, encoding: 'utf8' });
chk(b2.status === 0, 'خطِّ پایهٔ trendcmp2 سبز است');

console.log(`\ntrendcmp2-mutations: ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
process.exit(fail ? 1 : 0);
