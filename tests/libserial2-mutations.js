#!/usr/bin/env node
/**
 * تست‌های جهشیِ شمارهٔ سریال کتاب (بند ۶.۳)
 *  M1 — برداشتنِ گاردِ یکتاییِ libAddBook → L2
 *  M2 — نذخیره‌شدنِ سریال در رکورد (libAddBook) → L1
 *  M3 — برداشتنِ گاردِ یکتاییِ libSetSerial → L4
 *
 * اجرا:  node tests/libserial2-mutations.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
/* BH-mut فاز ۲ (الگوی امن p06/p11): جهش در کپیِ جدا؛ سورس اصلی و
   index.html هرگز بازنویسی نمی‌شوند — بازگردانیِ دستی و rebuildِ
   پایانی حذف شدند. */
const { session } = require('./helpers/mutant-kit');
const kit = session('ls2-mut-');
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

mutate('src/js/54-library.js',
  "if(serial && db.lib_books.some(function(x){ return x.school_id===u.school_id && x.serial===serial; }))\n    return {ok:false, msg:'این شمارهٔ سریال برای کتاب دیگری در همین مدرسه ثبت شده است'};",
  "if(false){}",
  'tests/libserial2.js', /❌ L2/, 'M1 برداشتنِ گاردِ یکتاییِ libAddBook');

/* BH-mut فاز ۲ — ترمیمِ لنگرِ M2: مسیرِ libAddBook در c2a9fd1 (add()→insert()
   برای ۷ مجموعه) بازنویسی شد و رکوردِ قدیمی دیگر وجود ندارد؛ همان جهش
   (نذخیره‌شدنِ سریال) روی فرمِ فعلیِ add(). */
mutate('src/js/54-library.js',
  "serial: serial || '',",
  "serial: '',",
  /* BH-mut فاز ۲: با فرمِ فعلیِ add()، حذفِ سریال ابتدا L0 (کتابِ نمونهٔ
     سریال‌دار) را قرمز می‌کند و سوئیت بلافاصله کرش می‌کند — شاهدِ کشتن = L0. */
  'tests/libserial2.js', /❌ L0/, 'M2 نذخیره‌شدنِ سریال');

/* BH-mut فاز ۲ — ترمیمِ پوششِ M3: مودالِ lib-serial-save از 17ca68f به
   libEditBook(patch) می‌رود (نه libSetSerial)؛ لنگرِ قدیمی با returnِ
   ۴-فاصله‌ای فقط به libSetSerial می‌خورد که L4 از آن عبور نمی‌کند ⇒ پوششِ
   صفر. لنگرِ تازه با returnِ ۶-فاصله‌ای یکتا به گاردِ مسیرِ مودال می‌خورد
   (تأییدِ مستقل: L4 با این جهش قرمز می‌شود). */
mutate('src/js/54-library.js',
  "if(serial && db.lib_books.some(function(x){ return x.school_id===b.school_id && x.serial===serial && x.id!==bookId; }))\n      return {ok:false, msg:'این شمارهٔ سریال برای کتاب دیگری در همین مدرسه ثبت شده است'};",
  "if(false){}",
  'tests/libserial2.js', /❌ L4/, 'M3 برداشتنِ گاردِ یکتاییِ مسیرِ مودال (libEditBook)');

/* خطِّ پایه (بدون env — سورس‌های اصلی) */
const b2 = spawnSync('node', [path.join(ROOT, 'tests/libserial2.js')], { cwd: ROOT, encoding: 'utf8' });
chk(b2.status === 0, 'خطِّ پایهٔ libserial2 سبز است');

console.log(`\nlibserial2-mutations: ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
process.exit(fail ? 1 : 0);
