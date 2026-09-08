#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   هارنس سنجش کارایی «ثبت حضور و غیاب دبیر» — ابزار چت ۴ (ناظر کیفیت)
   ───────────────────────────────────────────────────────────────────
   سناریو (همان «علامت تک‌تک + ثبت نهایی»):
     ۱. ورود به نقش دبیر (teacher1_1) — کلاس ۱ با ۱۳ دانش‌آموز
     ۲. رندر صفحهٔ حضور و غیاب
     ۳. کلیک واقعی روی دکمهٔ «غایب» برای هر ۱۳ دانش‌آموز
     ۴. کلیک «مرور و ثبت نهایی» (att-review)
     ۵. کلیک «تأیید و ثبت» در مودال (att-commit)
   خروجی: زمان کل + تفکیک فازها (رندر اولیه/کلیک‌ها/مودال/ثبت)
   هر اجرا در یک DOM تازه (بدون آلودگی حالت). صحت‌سنجی: ۱۳ رکورد نوشته شود.

   اجرا:  NODE_PATH=<repo>/node_modules node tools/perf-attendance.js [runs]
   ═══════════════════════════════════════════════════════════════════ */
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = process.env.PAYESH_ROOT || path.join(__dirname, '..');
const RUNS = Math.max(3, Number(process.argv[2] || 5));

async function oneRun() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true,
    url: 'http://localhost/', virtualConsole: new VirtualConsole(),
  });
  const win = dom.window;
  const W = (e) => win.eval(e);
  await new Promise(r => setTimeout(r, 450)); // بوت کامل

  // آماده‌سازی قطعی: دبیرِ کلاسِ ۱۳ نفره
  W(`(function(){
    var t = db.users.find(u => u.username === 'teacher1_1');
    S.user = t; S.persona = 'teacher';
    S.filters = { class: 1, date: todayISO() };
    return db.enrollments.filter(e => e.class_id === 1).length;
  })()`) === 13 || console.error('⚠️ اندازهٔ کلاس ۱ برابر ۱۳ نیست!');

  const clk = (sel) => {
    const el = win.document.querySelector(sel);
    if (!el) throw new Error('دکمه پیدا نشد: ' + sel);
    el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  };

  const t0 = Date.now();
  // ۱) رندر صفحهٔ حضور
  W(`S.route='attendance'; render()`);
  const t1 = Date.now();
  // ۲) علامت‌گذاری تک‌تک (دکمه‌های واقعیِ رندرشده)
  for (let i = 0; i < 13; i++) {
    const btns = win.document.querySelectorAll('.att-btn[data-s="absent"]');
    if (btns.length !== 13) throw new Error('شمار دکمه‌های غایب: ' + btns.length);
    btns[i].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  }
  const t2 = Date.now();
  // ۳) مرور نهایی + تأیید
  clk('[data-act="att-review"]');
  const t3 = Date.now();
  clk('#modal [data-act="att-commit"]');
  const t4 = Date.now();

  // صحت‌سنجی: ۱۳ رکورد حضور برای امروزِ این کلاس ثبت شده باشد
  const n = W(`db.attendance.filter(a=>a.class_id===1&&a.date===todayISO()&&a.status==='absent').length`);
  dom.window.close();
  if (n !== 13) throw new Error('ثبت کامل نشد — رکوردهای غیبت: ' + n);
  return { total: t4 - t0, render: t1 - t0, ticks: t2 - t1, review: t3 - t2, commit: t4 - t3 };
}

async function main() {
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    runs.push(await oneRun());
    if (global.gc) global.gc();
  }
  const totals = runs.map(r => r.total).sort((a, b) => a - b);
  const med = totals[Math.floor(totals.length / 2)];
  const avg = (k) => Math.round(runs.reduce((s, r) => s + r[k], 0) / runs.length);
  console.log(`اجراها: ${totals.join(', ')} ms`);
  console.log(`میانه: ${med} ms · کمینه: ${totals[0]} ms · بیشینه: ${totals[totals.length - 1]} ms`);
  console.log(`تفکیک میانگین: رندر=${avg('render')} · کلیک‌ها=${avg('ticks')} · مرور=${avg('review')} · ثبت=${avg('commit')}`);
}
main().catch(e => { console.error('❌', e.message); process.exit(1); });
