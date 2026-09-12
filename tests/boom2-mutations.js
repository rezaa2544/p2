#!/usr/bin/env node
/**
 * تست‌های جهشی C.2 فرناز — برنامه ویژه (بوم)
 *  MM1 — برداشتنِ گیت مدرسهٔ خودی → B3
 *  MM2 — برداشتنِ سقف ۲۰۰۰ نویسه → B5
 *  MM3 — برداشتنِ قاعدهٔ سرور → B7
 *
 * اجرا:  node tests/boom2-mutations.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا؛ سورس اصلی و
   index.html هرگز بازنویسی نمی‌شوند — بازگردانیِ دستی و rebuildِ
   پایانی حذف شدند. */
const { session } = require('./helpers/mutant-kit');
const kit = session('bom-mut-');
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
    const completed = (o) => /بوم \(برنامه ویژه\): /.test(o || '');
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

mutate('src/js/19-actions-admin.js',
  "const sid=Number(window._boomSid)||S.user.school_id;\n     if(S.user.role!=='superadmin'&&sid!==S.user.school_id){toast('فقط مدرسهٔ خودتان','err');return;}",
  "const sid=Number(window._boomSid)||S.user.school_id;\n     if(false){toast('فقط مدرسهٔ خودتان','err');return;} /* MM1 */",
  'tests/boom2.js', /❌ B3/, 'MM1 برداشتنِ گیت مدرسهٔ خودی');

mutate('src/js/19-actions-admin.js',
  'g.length>2000',
  'g.length>999999 /* MM2 */',
  'tests/boom2.js', /❌ B5/, 'MM2 برداشتنِ سقف ۲۰۰۰ نویسه');

mutate('server/validate.js',
  "if(key === 'boom_goals') return { type: 'string', max: LIMITS.STR_LONG }; /* C.2 فرناز: اهداف سالانه (بوم) */",
  "if(false) return { type: 'string', max: 1 }; /* MM3 */",
  'tests/boom2.js', /❌ B7/, 'MM3 برداشتنِ قاعدهٔ سرور');

console.log(`جهش‌های بوم: ${pass}/${pass + fail} کشته` + (envFails ? ` (${envFails} خطای محیطی)` : ''));
process.exit(fail || envFails ? 1 : 0);
