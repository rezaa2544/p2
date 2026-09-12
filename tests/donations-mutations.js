#!/usr/bin/env node
/**
 * تست‌های جهشی بند B.5 فرناز — کمک‌های داوطلبانه
 *  MM1 — برداشتنِ fallback ناشناس → N3
 *  MM2 — برداشتنِ گیت مدرسه در ویرایش (IDOR) → N6
 *  MM3 — برداشتنِ قاعدهٔ سرور مبلغ → N9
 *
 * اجرا:  node tests/donations-mutations.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا؛ سورس اصلی و
   index.html هرگز بازنویسی نمی‌شوند — بازگردانیِ دستی و rebuildِ
   پایانی حذف شدند. */
const { session } = require('./helpers/mutant-kit');
const kit = session('don-mut-');
kit.remapBuildOutputs(); /* index.html/USER_GUIDE.html/.build-cache.* → سایه */


const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0, envFails = 0;
function chk(c, m) { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } }

let lastFile = null;
function mutate(file, from, to, suite, killRe, tag) {
  const f = path.join(ROOT, file);
  if (lastFile && lastFile !== f) kit.clear(lastFile); /* فقط جهشِ جاری فعال */
  lastFile = f;
  const orig = fs.readFileSync(f, 'utf8');
  const bad = orig.replace(from, to);
  if (bad === orig) { chk(false, tag + ': جهش اعمال نشد (نماد پیدا نشد)'); return; }
  kit.mutant(f, bad); /* کپی جدا؛ سورس اصلی دست‌نخورده */
  {
    const runOnce = () => spawnSync('node', [path.join(ROOT, suite)], { cwd: ROOT, encoding: 'utf8', env: kit.env() });
    const completed = (o) => /تست کمک‌های داوطلبانه: /.test(o || '');
    execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore', env: kit.env() });
    let r = runOnce();
    if (r.status !== 0 && !killRe.test(r.stdout) && !completed(r.stdout)) {
      const r2 = runOnce();
      if (r2.status === 0 || killRe.test(r2.stdout) || completed(r2.stdout)) r = r2;
    }
    if (r.status !== 0 && !killRe.test(r.stdout) && !completed(r.stdout)) {
      envFails++;
      chk(false, tag + ' — خطای محیطی: چکِ موردِ انتظار هرگز چاپ نشد — نه کشته و نه زنده شمرده شد');
      return;
    }
    chk(r.status !== 0 && killRe.test(r.stdout), tag);
  }
}

mutate('src/js/72-donations.js',
  "return n || 'ناشناس';",
  "return n || ''; /* MM1 */",
  'tests/donations2.js', /❌ N3/, 'MM1 برداشتنِ fallback ناشناس');

mutate('src/js/72-donations.js',
  'if(!ex || ex.school_id !== sid) return { ok: false, msg: \'رکورد معتبر نیست\' };',
  'if(!ex) return { ok: false, msg: \'رکورد معتبر نیست\' }; /* MM2 */',
  'tests/donations2.js', /❌ N6/, 'MM2 برداشتنِ گیت مدرسه در ویرایش');

mutate('server/validate.js',
  "if(key === 'amount' && coll === 'donations') return { type: 'integer', min: 1, max: 10000000000 }; /* B.5 فرناز: مبلغ کمک (تومانِ صحیحِ مثبت) */",
  "if(false) return { type: 'integer', min: 1, max: 1 }; /* MM3 */",
  'tests/donations2.js', /❌ N9/, 'MM3 برداشتنِ قاعدهٔ سرور');

console.log(`جهش‌های کمک‌های داوطلبانه: ${pass}/${pass + fail} کشته` + (envFails ? ` (${envFails} خطای محیطی)` : ''));
process.exit(fail || envFails ? 1 : 0);
