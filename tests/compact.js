#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   فشردنِ دفترچهٔ تغییرات (AD 85.1 — P0-3 دور 85)

   سناریو:
   A: دنیای دمو را بوت می‌کند، دو مجموعهٔ بزرگ (grades/attendance) را
      خالی می‌کند (دنیای کوچک ≈ 1.6MB — تا اسنپ‌شات جا شود)، سپس
      ۱۱۰۰۰ جفت ins/del کوچک انجام می‌دهد:
        • ۵٬۰۰ جفت روی grades (فازهای اول)
        • ۶٬۰۰۰ جفت روی attendance (فازِ آخر)
      این ترتیب مهم است: با فشردن، همهٔ opهایِ grades از دفترچه
      حذف می‌شوند (در اسنپ‌شات می‌مانند) ولی opهایِ attendance در
      tail زنده‌اند — یعنی بعد از بازپخش، فقط اسنپ‌شات می‌تواند
      ids.grades را بازسازی کند.
      روی آستانهٔ ۱.۵MB دفترچه باید «اسنپ‌شات + ۲۰ op آخر» شود.
   B: با همان localStorage بوت می‌شود (دنیای کامل ۵.۳MB + بازپخش)؛
      اسنپ‌شات باید وضعیتِ A را دقیقاً (بیت‌به‌بیت) بازسازی کند —
      یعنی دنیایِ بزرگِ B را پاک و به دنیایِ خُردِ A تبدیل کند.

   نیازمند jsdom:  npm i --no-save jsdom
   اجرا:          node tests/compact.js
   ═══════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — رد شد.  (npm i --no-save jsdom)'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, extra){
  if(cond){ pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function boot(pre){
  const vc = new VirtualConsole().on('jsdomError', () => {}).on('error', () => {});
  return new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true,
    url: 'http://localhost/', virtualConsole: vc,
    beforeParse(w){ if(pre) pre(w); },
  });
}
const W = (win, expr) => win.eval(expr);

/* یک دورِ چرخش: J جفت ins/del روی مجموعهٔ c.
   هر ۹۹م رکورد می‌ماند (باقی‌مانده = ردیف‌های زنده). */
const churn = (win, c, J) => W(win, `
  (function(){
    SYNC_MUTED = true;
    batchWrites(function(){
      for(var i=0;i<${J};i++){
        insert('${c}',{school_id:1,class_id:1,student_id:18,date:'2026-09-07',status:'present'});
        if(i%99!==0) remove('${c}', db.${c}[db.${c}.length-1].id);
      }
    });
    SYNC_MUTED = false;
  })()
`);
const aliveIn = (J) => Math.floor((J - 1) / 99) + 1;

(async function main(){
  /* ── A: بوت و آماده‌سازی ─────────────────────────────────────── */
  const a = boot(); const wa = a.window;
  await sleep(800);

  check('بوت: دفترچهٔ عملیاتِ راه‌اندازی پر است (بازپخش معنا دارد)', W(wa, 'log.length') >= 500,
        'log.length=' + W(wa, 'log.length'));

  /* دنیای بزرگ را خُرد می‌کنیم: grades/attendance خالی (اِیدها دست‌نخورده
     می‌مانند — nextId از همان خط ادامه می‌دهد). صف همگام‌سازی خاموش است
     تا چرخشِ تست وارد صف نشود (این تست دربارهٔ دفترچه است). */
  W(wa, `
    db.grades.length = 0; db.attendance.length = 0;
    idxInvalidate('grades'); idxInvalidate('attendance');
    _DB_BYTES = JSON.stringify(db).length;
    _LOG_BYTES = JSON.stringify(log).length;
    _COMPACT_REJECT_BYTES = 0;
    COMPACT_KEEP = 20;
    COMPACT_BYTES = 1572864;  /* 1.5MB — آستانهٔ تست، مسیرِ بایتی */
    COMPACT_OPS = 100000;     /* آستانهٔ op خاموش — فقط بایت سنجیده شود */
  `);
  const S = W(wa, 'JSON.stringify(db).length');
  if(!(S > 500000 && S < 4000000)){ console.log('  ⚠️ اندازهٔ دنیای خُردشده از انتظار خارج است: ' + S); }

  /* ── فاز ۱: ۵٬۰۰۰ جفت grades — هنوز به آستانه نرسیدیم ───────── */
  churn(wa, 'grades', 3000);
  check('پیش از آستانه: فشردن رخ نمی‌دهد', W(wa, "log[0] && log[0].t!=='snap'"),
        'log[0].t=' + W(wa, "log[0] && log[0].t"));
  check('پیش از آستانه: ۳۰۰۰ جفت در دفترچه ثبت شده', W(wa, 'log.length') >= 6000 + 500,
        'log.length=' + W(wa, 'log.length'));
  churn(wa, 'grades', 2000);

  /* ── فاز ۲: ۶٬۰۰ جفت attendance — آستانهٔ بایتی رد می‌شود ──── */
  churn(wa, 'attendance', 6000);
  check('فشرده‌سازی: دفترچه به «اسنپ‌شات + tail» تبدیل شد', W(wa, "log[0] && log[0].t==='snap'"),
        'log[0].t=' + W(wa, "log[0] && log[0].t"));
  check('فشرده‌سازی: tail (۲۰ op آخر) پرچمِ فقط‌سابقه دارد', W(wa, "log[1].__a===1 && log[20].__a===1"),
        'log[1].__a=' + W(wa, 'log[1].__a'));
  check('فشرده‌سازی: op بعد از tail پرچم ندارد (بازپخش می‌شود)', W(wa, "log.length<22 || log[21].__a!==1"),
        'log[21].__a=' + W(wa, 'log[21].__a'));
  check('فشرده‌سازی: اندازهٔ ذخیره‌شده محدود ماند', W(wa, 'localStorage.getItem("sms_log_v1").length') < 2600000,
        'bytes=' + W(wa, 'localStorage.getItem("sms_log_v1").length'));
  check('فشرده‌سازی: opهایِ grades از دفترچه خارج شدند (فقط در اسنپ‌شات)',
        W(wa, "log.every(function(o){return o.t==='snap' || o.c!=='grades' || o.__a===1;})" +
              " && log.filter(function(o){return o.c==='grades';}).length < 25"),
        'grades-ops=' + W(wa, "log.filter(function(o){return o.c==='grades' && o.t!=='snap';}).length"));

  /* ── ۵ ویرایشِ واقعی روی ردیف‌های ماندگارِ attendance ───────── */
  W(wa, `
    (function(){
      SYNC_MUTED = true;
      var L = db.attendance;
      for(var k=0;k<Math.min(5,L.length);k++) update('attendance', L[k].id, {status:'late', late_minutes:5});
      SYNC_MUTED = false;
    })()
  `);
  check('وضعیت A: فقط ردیف‌های ماندگار grades هستن',
        W(wa, 'db.grades.length') === aliveIn(3000) + aliveIn(2000),
        'expect=' + (aliveIn(3000) + aliveIn(2000)) + ' got=' + W(wa, 'db.grades.length'));
  check('وضعیت A: فقط ردیف‌های ماندگار attendance هستن',
        W(wa, 'db.attendance.length') === aliveIn(6000),
        'expect=' + aliveIn(6000) + ' got=' + W(wa, 'db.attendance.length'));
  check('وضعیت A: ویرایش روی ردیفِ ماندگار اعمال شد',
        W(wa, "db.attendance[0].status==='late' && db.attendance[0].late_minutes===5"));

  const auditLen = W(wa, 'auditList().length');
  const logLen = W(wa, 'log.length');
  check('سابقهٔ تغییرات: فقط opهایِ زنده را نشان می‌دهد (اسنپ‌شات نه)',
        auditLen === Math.min(500, logLen - 1),
        'audit=' + auditLen + ' log-1=' + (logLen - 1));
  check('سابقهٔ تغییرات: ردیفِ snap در آن نیست',
        W(wa, "auditList().every(function(r){return r.op.t!=='snap';})"));

  /* ثبات: opهایِ بعد از فشردن، دوبارهٔ آشفتگی نمی‌کنند
     (یک ins+delِ خنثی — db باید دست‌نخورده بماند) */
  const dbBefore = W(wa, 'JSON.stringify(db)');
  const k5id = W(wa, "insert('attendance',{school_id:1,class_id:1,student_id:18,date:'2026-09-07',status:'present'}).id");
  W(wa, "remove('attendance', " + k5id + ")");
  check('پس از فشردن: op جدید بدون تکرارِ فشردن ثبت می‌شود و db دست‌نخورده است',
        W(wa, "log[0].t==='snap'") && W(wa, 'JSON.stringify(db)') === dbBefore);

  /* ── B: بوت با همان localStorage — بازیابیِ بیت‌به‌بیت ──────── */
  const kv = {};
  for(let i = 0; i < wa.localStorage.length; i++){
    const k = wa.localStorage.key(i);
    kv[k] = wa.localStorage.getItem(k);
  }
  const b = boot(function(w){
    for(const k in kv) w.localStorage.setItem(k, kv[k]);
  });
  const wb = b.window;
  await sleep(1000);

  check('بازیابی: dbِ دستگاهِ تازه با dbِ دستگاهِ قدیمی بیت‌به‌بیت است',
        W(wb, 'JSON.stringify(db)') === W(wa, 'JSON.stringify(db)'));
  check('بازیابی: شکلِ دفترچه (اسنپ‌شات) در storage سالم ماند',
        W(wb, "log[0] && log[0].t==='snap'"));
  /* B در بوتِ خود چند op گاردشده (بخششِ قسطِ دمو) ثبت می‌کند —
     تفاوتِ معقول، نه تفاوتِ وضعیت. */
  const dLog = W(wb, 'log.length') - W(wa, 'log.length');
  check('بازیابی: opهایِ تازهٔ بوتِ B در محدودهٔ معقول است', dLog >= 0 && dLog <= 400,
        'delta=' + dLog);

  /* ── K: ids بازسازی شده — insertِ بعد از بازیابی تکراری نیست ─
     attendance: آخرین op در tail است (بازپخش ids را می‌رساند).
     grades:     همهٔ opها در اسنپ‌شات‌اند — فقط اسنپ‌شات ids را
                 بازسازی می‌کند (جهشِ M3 دقیقاً اینجاست). */
  const idA1 = W(wa, "insert('attendance',{school_id:1,class_id:1,student_id:18,date:'2026-09-07',status:'present'}).id");
  const idB1 = W(wb, "insert('attendance',{school_id:1,class_id:1,student_id:18,date:'2026-09-07',status:'present'}).id");
  check('بعد از بازیابی: nextIdِ attendance همگام است (کسریِ insert رخ نمی‌دهد)',
        idA1 === idB1 && W(wb, "db.attendance.some(function(x){return x.id===" + idB1 + ";})"),
        'idA=' + idA1 + ' idB=' + idB1);
  const idA2 = W(wa, "insert('grades',{school_id:1,class_id:1,student_id:18,subject_id:1,term:'نوبت اول',score:10,date:'2026-09-07'}).id");
  const idB2 = W(wb, "insert('grades',{school_id:1,class_id:1,student_id:18,subject_id:1,term:'نوبت اول',score:10,date:'2026-09-07'}).id");
  check('بعد از بازیابی: nextIdِ grades همگام است (فقط اسنپ‌شات بازسازی می‌کند)',
        idA2 === idB2 && W(wb, "db.grades.some(function(x){return x.id===" + idB2 + ";})"),
        'idA=' + idA2 + ' idB=' + idB2);

  a.window.close(); b.window.close();
  console.log('\nفشرده‌سازیِ دفترچه: ' + pass + '✅ / ' + fail + '❌');
  if(fail === 0) console.log('بدون خطا');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
