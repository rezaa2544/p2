#!/usr/bin/env node
/**
 * تست‌های جهشی C.3 فرناز — گزارش عمومی مدرسه
 *  MM1 — وارونگی تفکیک نوع جلسه → P3
 *  MM2 — برداشتنِ فیلتر مدرسه از آمار کاربران → P1
 *  MM3 — برداشتنِ نمایش بوم → P4
 *
 * اجرا:  node tests/public2-mutations.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا؛ سورس اصلی و
   index.html هرگز بازنویسی نمی‌شوند — بازگردانیِ دستی و rebuildِ
   پایانی حذف شدند. */
const { session } = require('./helpers/mutant-kit');
const kit = session('pub2-mut-');
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
    const completed = (o) => /گزارش عمومی: /.test(o || '');
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

mutate('src/js/06-login.js',
  "(typeof minTypeOf==='function'?minTypeOf(m):'assoc')===k",
  "(typeof minTypeOf==='function'?minTypeOf(m):'assoc')!==k /* MM1 */",
  'tests/public2.js', /❌ P3/, 'MM1 وارونگی تفکیک نوع جلسه');

mutate('src/js/06-login.js',
  'const us=(db.users||[]).filter(u=>u.school_id===sid);',
  'const us=(db.users||[]); /* MM2 */',
  'tests/public2.js', /❌ P1/, 'MM2 برداشتنِ فیلتر مدرسه از آمار');

mutate('src/js/06-login.js',
  "goals:((sc.public_goals===1||sc.public_goals===true)?(sc.boom_goals||'').trim():'')",
  "goals:'' /* MM3 */",
  'tests/public2.js', /❌ P4/, 'MM3 برداشتنِ نمایش بوم');

console.log(`جهش‌های گزارش عمومی: ${pass}/${pass + fail} کشته` + (envFails ? ` (${envFails} خطای محیطی)` : ''));
process.exit(fail || envFails ? 1 : 0);
