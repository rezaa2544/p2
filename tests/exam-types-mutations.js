#!/usr/bin/env node
/**
 * جهش‌های فاز ۰.۳ — تفکیک امتحان نهایی کشوری از داخلی
 *
 *  M1 — حذف گارد «دبیر نمی‌تواند» در grade-save   → T4 باید بشکند
 *  M2 — gradeSource همیشه internal                 → T2c/T7 باید بشکنند
 *  M3 — حذف بخش نهایی کشوری از گواهی نمرات        → T8a باید بشکند
 *  M4 — examTypeOf همیشه internal                  → T1c باید بشکند
 *  M5 — حذف فیلتر نوع آزمون در فرم دبیر            → T6a باید بشکند
 *
 * اجرا: node tests/exam-types-mutations.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا؛ سورس اصلی و
   index.html هرگز بازنویسی نمی‌شوند — بازگردانیِ دستی و rebuildِ
   پایانی حذف شدند. */
const { session } = require('./helpers/mutant-kit');
const kit = session('ext-mut-');
kit.remapBuildOutputs(); /* index.html/USER_GUIDE.html/.build-cache.* → سایه */


const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function chk(c, m) { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } }

let lastFile = null;
function mutate(file, from, to, killRe, tag) {
  const f = path.join(ROOT, file);
  if (lastFile && lastFile !== f) kit.clear(lastFile); /* فقط جهشِ جاری فعال */
  lastFile = f;
  const orig = fs.readFileSync(f, 'utf8');
  const bad = orig.replace(from, to);
  if (bad === orig) { chk(false, tag + ': جهش اعمال نشد (نماد پیدا نشد)'); return; }
  kit.mutant(f, bad); /* کپی جدا؛ سورس اصلی دست‌نخورده */
  {
    execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore', env: kit.env() });
    const r = spawnSync('node', [path.join(ROOT, 'tests/exam-types.js')], { cwd: ROOT, encoding: 'utf8', env: kit.env() });
    const out = (r.stdout || '') + (r.stderr || '');
    chk(r.status !== 0 && killRe.test(out), tag + ' کشته شد');
  }
}

mutate('src/js/19-actions-core.js',
  `     if(gNational&&gRole==='teacher'){
       toast('نمرهٔ امتحان نهایی کشوری فقط از بیرون و توسط مدیر مدرسه وارد می‌شود','err');return;
     }`,
  '',
  /❌ T4/, 'M1 حذف گارد دبیر در grade-save');

mutate('src/js/26-curriculum.js',
  `  return (g && g.source==='national') ? 'national' : 'internal';`,
  `  return 'internal';`,
  /❌ T2c|❌ T7/, 'M2 gradeSource همیشه internal');

mutate('src/js/33-forms-sms.js',
  `    body: body + natBlock,`,
  `    body: body,`,
  /❌ T8a/, 'M3 حذف بخش نهایی کشوری از گواهی');

mutate('src/js/26-curriculum.js',
  `  return examSource(e)==='national_final' ? 'national' : 'internal';`,
  `  return 'internal';`,
  /❌ T1c/, 'M4 examTypeOf همیشه internal');

mutate('src/js/18-modals.js',
  `  const _gTypes=(_gRole==='teacher')?EXAM_TYPES.filter(t=>t!==NATIONAL_EXAM_TYPE):EXAM_TYPES;`,
  `  const _gTypes=EXAM_TYPES;`,
  /❌ T6a/, 'M5 حذف فیلتر نوع آزمون در فرم دبیر');

/* خطِّ پایه (بدون env — سورس‌های اصلی) */
const b = spawnSync('node', [path.join(ROOT, 'tests/exam-types.js')], { cwd: ROOT, encoding: 'utf8' });
chk(b.status === 0, 'خطِّ پایهٔ exam-types سبز است');

const total = pass + fail;
console.log('جهش‌های تفکیک امتحان: ' + pass + '/' + total + ' موفق' + (fail ? '  —  ' + fail + ' ناموفق ❌' : '  —  بدون خطا ✅'));
process.exit(fail ? 1 : 0);
