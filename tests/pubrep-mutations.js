#!/usr/bin/env node
/**
 * تست‌های جهشیِ گزارش عمومی (C.3 فرناز)
 *  M1 — برداشتنِ گیت نقش از pubrep-print → P6
 *  M2 — برداشتنِ گیت نقش از pubrep-csv → P6
 *  M3 — برداشتنِ دامنهٔ مدرسه از آمار حضور → P7
 *  M4 — شکستنِ فرمول میانگین (‎×۱۰‎) → P2
 *  M5 — شمردنِ رویداد از جدول اشتباه → P2
 *  M6 — برداشتنِ گیت درونی pubrepPrint → P8
 *
 * اجرا:  node tests/pubrep-mutations.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
/* BH-mut (الگوی امن p06/p11): جهش در کپیِ جدا + خروجی‌های build در سایه؛
   سورس‌ها و index.html اصلی هرگز بازنویسی نمی‌شوند. */
const { session } = require('./helpers/mutant-kit');
const kit = session('pubrep-mut-');
kit.remapBuildOutputs();

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0, envFails = 0;
function chk(c, m) { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } }

function mutate(file, from, to, suite, killRe, tag) {
  const f = path.join(ROOT, file);
  const orig = fs.readFileSync(f, 'utf8');
  const bad = orig.replace(from, to);
  if (bad === orig) { chk(false, tag + ': جهش اعمال نشد (نماد پیدا نشد)'); return; }
  kit.mutant(f, bad); /* کپی هم‌جوار — سورس اصلی دست‌نخورده */
  {
  const runOnce = () => spawnSync('node', [path.join(ROOT, suite)], { cwd: ROOT, encoding: 'utf8', env: kit.env() });
  const completed = (o) => /بررسی — /.test(o || '');

  execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore', env: kit.env() }); /* build به سایه */
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

mutate('src/js/19-actions-core.js',
  "if(!S.user||S.user.role!=='manager'||!S.user.school_id){toast('فقط مدیر مدرسه','err');return;}\n    pubrepPrint();",
  "if(false){}\n    pubrepPrint();",
  'tests/pubrep.js', /❌ P6/, 'M1 برداشتنِ گیت نقش از pubrep-print');

mutate('src/js/19-actions-core.js',
  "if(!S.user||S.user.role!=='manager'||!S.user.school_id){toast('فقط مدیر مدرسه','err');return;}\n    const d=publicReportRows",
  "if(false){}\n    const d=publicReportRows",
  'tests/pubrep.js', /❌ P6/, 'M2 برداشتنِ گیت نقش از pubrep-csv');

mutate('src/js/08-dashboard.js',
  "const att=(db.attendance||[]).filter(a=>a.school_id===sid);",
  "const att=(db.attendance||[]).filter(a=>true);",
  'tests/pubrep.js', /❌ P7/, 'M3 برداشتنِ دامنهٔ مدرسه از آمار حضور');

mutate('src/js/08-dashboard.js',
  "*100)/100:0,",
  "*100)/10:0,",
  'tests/pubrep.js', /❌ P2/, 'M4 شکستنِ فرمول میانگین');

mutate('src/js/08-dashboard.js',
  "const ev=(db.calendar||[]).filter(c=>c.school_id===sid);",
  "const ev=(db.grades||[]).filter(c=>c.school_id===sid);",
  'tests/pubrep.js', /❌ P2/, 'M5 شمردنِ رویداد از جدول اشتباه');

mutate('src/js/08-dashboard.js',
  "if(!u||u.role!=='manager'||!u.school_id)return;",
  "if(false){}",
  'tests/pubrep.js', /❌ P8/, 'M6 برداشتنِ گیت درونی pubrepPrint');

/* خطِّ پایه — بدونِ env → سورس‌های اصلی (بازسازیِ پایانی حذف شد: هرگز آلوده نشدند) */
kit.cleanup();
const b = spawnSync('node', [path.join(ROOT, 'tests/pubrep.js')], { cwd: ROOT, encoding: 'utf8' });
chk(b.status === 0, 'خطِّ پایهٔ pubrep سبز است');

console.log(`\npubrep-mutations: ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
if (fail || envFails) process.exit(1);
