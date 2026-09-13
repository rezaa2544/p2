#!/usr/bin/env node
/**
 * تست‌های جهشی C.1 فرناز — نوعِ جلسه
 *  MM1 — برداشتنِ پیش‌فرض assoc در minTypeOf → M4
 *  MM2 — برداشتنِ فیلتر نوع در سکشن → M3
 *  MM3 — برداشتنِ قاعدهٔ سرور (enum) → M7
 *
 * اجرا:  node tests/minutes2-mutations.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا؛ سورس اصلی و
   index.html هرگز بازنویسی نمی‌شوند — بازگردانیِ دستی و rebuildِ
   پایانی حذف شدند. */
const { session } = require('./helpers/mutant-kit');
const kit = session('min2-mut-');
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
    const completed = (o) => /صورت‌جلسه \(نوع جلسه\): /.test(o || '');
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

mutate('src/js/60-association.js',
  "?m.meeting_type:'assoc';",
  "?m.meeting_type:'zzz';",
  'tests/minutes2.js', /❌ M4/, 'MM1 برداشتنِ پیش‌فرض assoc');

mutate('src/js/60-association.js',
  'const rows=ft?all.filter(function(m){return minTypeOf(m)===ft;}):all;',
  'const rows=all;',
  'tests/minutes2.js', /❌ M3/, 'MM2 برداشتنِ فیلتر نوع');

mutate('server/validate.js',
  "if(key === 'meeting_type' && coll === 'assoc_minutes') return { type: 'enum', values: ['assoc','teachers','students'] }; /* C.1 فرناز */",
  "if(false) return { type: 'enum', values: [] }; /* MM3 */",
  'tests/minutes2.js', /❌ M7/, 'MM3 برداشتنِ قاعدهٔ سرور');

console.log(`جهش‌های نوع جلسه: ${pass}/${pass + fail} کشته` + (envFails ? ` (${envFails} خطای محیطی)` : ''));
process.exit(fail || envFails ? 1 : 0);
