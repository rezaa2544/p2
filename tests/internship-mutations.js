#!/usr/bin/env node
/**
 * تست‌های جهشیِ کارآموزی ۲ (E.2)
 *  M1 — صدور برای همه (برداشتنِ گاردِ مدیر) → I2
 *  M2 — صدورِ ناقص (برداشتنِ کنترلِ تکمیل) → I2
 *  M3 — صدورِ تکراری (برداشتنِ گاردِ تکرار) → I2
 *  M4 — ساعتِ لازمِ ۲۰۰۰ → I1
 *  M5 — صدور برای غیرِ سالِ آخر → I2
 *
 * اجرا:  node tests/internship-mutations.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا؛ سورس اصلی و
   index.html هرگز بازنویسی نمی‌شوند — بازگردانیِ دستی و rebuildِ
   پایانی حذف شدند. */
const { session } = require('./helpers/mutant-kit');
const kit = session('int-mut-');
kit.remapBuildOutputs(); /* index.html/USER_GUIDE.html/.build-cache.* → سایه */

const ROOT = path.join(__dirname, '..');
const NODE = process.execPath;
let pass = 0, fail = 0;
function chk(c, m) { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } }

let lastFile = null;
function mutate(from, to, killRe, tag) {
  const f = path.join(ROOT, 'src/js/13-grades.js');
  if (lastFile && lastFile !== f) kit.clear(lastFile);
  lastFile = f;
  const orig = fs.readFileSync(f, 'utf8');
  if (orig.indexOf(from) < 0) { chk(false, tag + ': جهش اعمال نشد (نماد پیدا نشد)'); return; }
  kit.mutant(f, orig.replace(from, to)); /* کپی جدا؛ سورس اصلی دست‌نخورده */
  {
    execFileSync(NODE, ['build.js'], { cwd: ROOT, stdio: 'ignore', env: kit.env() });
    const r = spawnSync(NODE, [path.join(ROOT, 'tests/internship2.js')], { cwd: ROOT, encoding: 'utf8', env: kit.env() });
    const done = /سوئیت کارآموزی ۲:/.test(r.stdout || '');
    chk(done && r.status !== 0 && killRe.test(r.stdout || ''), tag + ' کشته شد');
  }
}

mutate("if(role !== 'manager' && role !== 'superadmin') return { ok: false, msg: 'فقط مدیر می‌تواند گواهی صادر کند' };",
  'if(false){}',
  /❌ I2/, 'M1 صدور برای همه');

mutate("if(!pr.done) return { ok: false, msg: 'هنوز کامل نشده (' + fa(pr.approved) + ' از ' + fa(pr.required) + ' ساعت)' };",
  'if(false){}',
  /❌ I2/, 'M2 صدورِ ناقص');

mutate("if(internshipCert(sid)) return { ok: false, msg: 'گواهیِ امسال قبلاً صادر شده است' };",
  'if(false){}',
  /❌ I2/, 'M3 صدورِ تکراری');

mutate('return h > 0 ? h : 200;',
  'return h > 0 ? h : 2000;',
  /❌ I1/, 'M4 ساعتِ لازمِ ۲۰۰۰');

mutate('if(!workshopStudent(sid) || !isFinalYearStudent(sid))',
  'if(false)',
  /❌ I2/, 'M5 صدور برای غیرِ سالِ آخر');

/* خطِّ پایه (بدون env — سورس‌های اصلی) */
const fin = spawnSync(NODE, [path.join(ROOT, 'tests/internship2.js')], { cwd: ROOT, encoding: 'utf8' });
const green = fin.status === 0 && /بدون خطا ✅/.test(fin.stdout || '');
console.log(`\ninternship-mutations: ${pass}/5 کشته؛ سبزِ نهایی: ${green ? '✅' : '❌'}`);
process.exit(pass === 5 && green ? 0 : 1);
