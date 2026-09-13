#!/usr/bin/env node
/**
 * تست‌های جهشیِ کنترلِ تداخلِ برنامه (بند ۶.۵ سبک)
 *  M1 — خفه‌کردنِ تداخلِ دبیر (آستانهٔ >۲) → C1
 *  M2 — نادیده‌گرفتنِ مشغولیتِ دبیر در suggestSlots → C4
 *  M3 — برداشتنِ گاردِ لحظهٔ اجرا در sched-conf-move → C5
 *
 * اجرا:  node tests/schedconf2-mutations.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا؛ سورس اصلی و
   index.html هرگز بازنویسی نمی‌شوند — بازگردانیِ دستی و rebuildِ
   پایانی حذف شدند. */
const { session } = require('./helpers/mutant-kit');
const kit = session('sc2-mut-');
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
  /* R92: مرگِ زودهنگامِ کشف‌کننده (پورت اشغال/حافظه — قبل از چاپِ چکِ موردِ انتظار و خطِ خلاصه) → retry یک‌بار، بعد env-failِ صریح. هرگز «زنده ماند»ِ کاذب. */
  const completed = (o) => /بررسی — /.test(o || '');
  
  execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore', env: kit.env() });
  let r = runOnce();
  if (r.status !== 0 && !killRe.test(r.stdout) && !completed(r.stdout)) {
    const r2 = runOnce();
    if (r2.status === 0 || killRe.test(r2.stdout) || completed(r2.stdout)) r = r2;
  }
  if (r.status !== 0 && !killRe.test(r.stdout) && !completed(r.stdout)) {
    envFails++;
    chk(false, tag + ' — خطای محیطی: چکِ موردِ انتظار هرگز چاپ نشد (مرگِ زودهنگامِ تست — پورت/حافظه) — نه کشته و نه زنده شمرده شد');
    return;
  }
  chk(r.status !== 0 && killRe.test(r.stdout), tag);
  }
}

mutate('src/js/15-schedule.js',
  "if(all.length>1)out.push({kind:'teacher',key:k,teacher_id:r.teacher_id,day:r.day,period:r.period,rows:all.slice().sort((a,b)=>a.id-b.id)});",
  "if(all.length>2)out.push({kind:'teacher',key:k,teacher_id:r.teacher_id,day:r.day,period:r.period,rows:all.slice().sort((a,b)=>a.id-b.id)});",
  'tests/schedconf2.js', /❌ C1/, 'M1 خفه‌کردنِ تداخلِ دبیر');

mutate('src/js/15-schedule.js',
  'if(row.teacher_id&&teacherBusyAt(row.teacher_id,d,p,row.id))continue;',
  'if(false){}',
  'tests/schedconf2.js', /❌ C4/, 'M2 نادیده‌گرفتنِ مشغولیتِ دبیر در پیشنهاد');

mutate('src/js/19-actions-schedule.js',
  "if(r.teacher_id&&teacherBusyAt(r.teacher_id,day,period,id)){toast('این دبیر در آن ساعت مشغول است','err');render();return;}",
  'if(false){}',
  'tests/schedconf2.js', /❌ C5/, 'M3 برداشتنِ گاردِ لحظهٔ اجرا');

/* خطِّ پایه (بدون env — سورس‌های اصلی) */
const b2 = spawnSync('node', [path.join(ROOT, 'tests/schedconf2.js')], { cwd: ROOT, encoding: 'utf8' });
chk(b2.status === 0, 'خطِّ پایهٔ schedconf2 سبز است');

console.log(`\nschedconf2-mutations: ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
process.exit(fail ? 1 : 0);
