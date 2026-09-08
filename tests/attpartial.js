#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   به‌روزرسانیِ جزئیِ ثبت حضور (دور ۱۰۲ — هدفِ زیر ۶۰۰ مس)
   هر تیکِ حاضر/غایب باید بدون بازسازیِ کاملِ پوسته، فقط ردیفِ
   همان دانش‌آموز + شمارنده‌ها + نوارِ پیش‌نویس را به‌روز کند.
   ۱) رندرِ کامل رخ نمی‌دهد (عناصرِ بیرونِ ردیف زنده می‌مانند)
   ۲) ردیفِ دانش‌آموز (دکمه‌ها/نشان‌ها) درست به‌روز می‌شود
   ۳) شمارنده‌هایِ خلاصه به‌روز می‌شوند
   ۴) نوارِ پیش‌نویس و پابرگ ظاهر/به‌روز/حذف می‌شوند
   ۵) رفت‌وبرگشتِ تیک (خاموش‌کردن و تعویض) درست است
   ۶) سوپاپِ اطمینان: با هر تردیدی رندرِ کامل جایگزین می‌شود
   اجرا:  node tests/attpartial.js   (نیازمند jsdom)
   ═══════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — تست رد شد.  (npm i --no-save jsdom)'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
let __seq = Promise.resolve();
function test(name, fn) {
  const p = __seq.then(() => new Promise((resolve) => {
    let q;
    try { q = fn(); }
    catch (e) {
      fail++; console.log(`  ❌ ${name}\n     ${e.message}`);
      resolve(); return;
    }
    Promise.resolve(q).then(
      () => { pass++; console.log(`  ✅ ${name}`); },
      (e) => { fail++; console.log(`  ❌ ${name}\n     ${e.message}`); }
    ).then(resolve);
  }));
  __seq = p;
}
const assert = (c, m) => { if (!c) throw new Error(m || 'شرط برقرار نیست'); };

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost/',
  virtualConsole: new (require('jsdom').VirtualConsole)(),
});
const win = dom.window;
const W = (expr) => win.eval(expr);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

main().catch((e) => { console.error(e); process.exit(1); });

async function main() {
  await sleep(500);
  console.log('\n▸ به‌روزرسانیِ جزئیِ ثبت حضور (دور ۱۰۲)');

  /* زمینهٔ قطعی: دبیرِ کلاسِ ۱۳ نفره (همان سناریوی هارنسِ کارایی) */
  W(`(function(){
    var t = db.users.find(u => u.username === 'teacher1_1');
    S.user = t; S.persona = 'teacher';
    S.filters = { class: 1, date: todayISO() };
  })()`);
  assert(W(`db.enrollments.filter(e=>e.class_id===1).length`) === 13, 'کلاسِ ۱ باید ۱۳ دانش‌آموز داشته باشد');
  W(`S.route='attendance'; render()`);

  const sid = W(`db.enrollments.filter(e=>e.class_id===1)[0].student_id`);
  const sid2 = W(`db.enrollments.filter(e=>e.class_id===1)[1].student_id`);
  const click = (s, st) => W(`document.querySelector('[data-act="att-set"][data-id="${s}"][data-s="${st}"]').click()`);

  /* ── P1: رندرِ کامل رخ نمی‌دهد ───────────────────────────────
     نشانه: عنصری فرزند با خاصیتِ جاوااسکریپتی — رندرِ کامل همهٔ
     فرزندان را از نو می‌سازد و عنصرِ قدیمی جدا می‌شود. */
  test('P1 تیکِ غیبت رندرِ کامل نمی‌کند (عناصرِ قبلی زنده می‌مانند)', () => {
    /* نشانه در ردیفِ آخر — دور از ردیفِ کلیک‌شده و نوارِ خلاصه */
    W(`var _bs=document.querySelectorAll('.att-btn'); window.__attMEl=_bs[_bs.length-1];`);
    click(sid, 'absent');
    assert(W(`window.__attMEl.isConnected`) === true,
      'رندر کامل جلوی به‌روزرسانی جزئی را نگرفت — با هر تیک رندر کامل اجرا شد');
  });

  /* ── P2: ردیفِ دانش‌آموز به‌روز می‌شود ─────────────────────── */
  test('P2 ردیفِ دانش‌آموز به‌روز می‌شود (دکمه + کلاسِ ردیف + نشان)', () => {
    const onAbsent = W(`document.querySelector('[data-act="att-set"][data-id="${sid}"][data-s="absent"]').classList.contains('on-absent')`);
    assert(onAbsent, 'ردیف دانش‌آموز به‌روز نشد — دکمهٔ غایب فعال نشد');
    assert(W(`!!document.querySelector('[data-act="att-set"][data-id="${sid}"]').closest('tr.att-row-draft')`),
      'ردیف دانش‌آموز به‌روز نشد — کلاسِ پیش‌نویس روی ردیف ننشست');
    assert(W(`ATT_FA.absent`) === W(`document.querySelector('[data-act="att-set"][data-id="${sid}"]').closest('tr').querySelector('.att-status-cell .badge').textContent`),
      'ردیف دانش‌آموز به‌روز نشد — نشانِ وضعیتِ سلول عوض نشد');
  });

  /* ── P3: شمارنده‌هایِ خلاصه ────────────────────────────────── */
  test('P3 شمارنده‌های خلاصه به‌روز می‌شوند (غایب ۱، ثبت‌نشده ۱۲)', () => {
    const txt = W(`document.querySelector('.card-body.row').textContent`);
    assert(txt.includes('غایب: ۱') && txt.includes('ثبت‌نشده: ۱۲'),
      'شمارنده‌های خلاصه به‌روز نشدند — ' + txt.slice(0, 60));
  });

  /* ── P4: نوارِ پیش‌نویس و پابرگ ظاهر می‌شوند ───────────────── */
  test('P4 نوار پیش‌نویس و پابرگ با نخستین تیک ظاهر می‌شوند', () => {
    const bar = W(`(document.querySelector('.att-draft-bar')||{}).textContent||''`);
    assert(bar.includes('۱ تغییر ثبت‌نشده'), 'نوار پیش‌نویس ظاهر نشد');
    assert(W(`!!document.querySelector('.att-draft-bar [data-act="att-review"]')
           && !!document.querySelector('.att-draft-bar [data-act="att-discard"]')`),
      'نوار پیش‌نویس ظاهر نشد — دکمه‌های مرور/دورریختن ندارد');
    const foot = W(`(document.querySelector('.card-foot')||{}).textContent||''`);
    assert(foot.includes('(۱ تغییر)'), 'پابرگِ کارت ظاهر نشد');
  });

  /* ── P5: تیکِ دوم فقط همان‌جا را به‌روز می‌کند ─────────────── */
  test('P5 تیکِ دوم: شمارنده‌ها و نوار به ۲ تغییر می‌رسند', () => {
    /* نشانه در ردیفِ آخر — دور از ردیفِ کلیک‌شده (دوم) و نوارِ خلاصه */
    W(`var _bs=document.querySelectorAll('.att-btn'); window.__attMEl2=_bs[_bs.length-1];`);
    click(sid2, 'absent');
    assert(W(`window.__attMEl2.isConnected`) === true,
      'رندر کامل جلوی به‌روزرسانی جزئی را نگرفت — تیکِ دوم رندر کامل کرد');
    const txt = W(`document.querySelector('.card-body.row').textContent`);
    assert(txt.includes('غایب: ۲'), 'شمارنده‌های خلاصه به‌روز نشدند — غایب ۲ نشد');
    assert(W(`document.querySelector('.att-draft-bar').textContent`).includes('۲ تغییر ثبت‌نشده'),
      'نوار پیش‌نویس به‌روز نشد — ۲ تغییر نشد');
  });

  /* ── P6: رفت‌وبرگشتِ تیک (خاموش‌شدن) ────────────────────────── */
  test('P6 تیکِ تکراری وضعیت را برمی‌دارد (کلید رفت‌وبرگشتی)', () => {
    click(sid2, 'absent');
    assert(!W(`document.querySelector('[data-act="att-set"][data-id="${sid2}"][data-s="absent"]').classList.contains('on-absent')`),
      'رفت‌وبرگشتِ تیک کار نکرد — دکمه هنوز فعال است');
    const txt = W(`document.querySelector('.card-body.row').textContent`);
    assert(txt.includes('غایب: ۱'), 'شمارنده‌های خلاصه به‌روز نشدند — غایب به ۱ برنگشت');
    assert(W(`document.querySelector('.att-draft-bar').textContent`).includes('۱ تغییر ثبت‌نشده'),
      'نوار پیش‌نویس به‌روز نشد — به ۱ تغییر برنگشت');
  });

  /* ── P7: تعویضِ حاضر → غایب ────────────────────────────────── */
  test('P7 تعویض حاضر به غایب روی یک دانش‌آموز', () => {
    click(sid2, 'present');
    assert(W(`document.querySelector('[data-act="att-set"][data-id="${sid2}"][data-s="present"]').classList.contains('on-present')`),
      'تعویض کار نکرد — حاضر فعال نشد');
    let txt = W(`document.querySelector('.card-body.row').textContent`);
    assert(txt.includes('حاضر: ۱'), 'شمارنده‌های خلاصه به‌روز نشدند — حاضر ۱ نشد');
    click(sid2, 'absent');
    assert(W(`document.querySelector('[data-act="att-set"][data-id="${sid2}"][data-s="absent"]').classList.contains('on-absent')`)
        && !W(`document.querySelector('[data-act="att-set"][data-id="${sid2}"][data-s="present"]').classList.contains('on-present')`),
      'تعویض کار نکرد — غایب جای حاضر را نگرفت');
    txt = W(`document.querySelector('.card-body.row').textContent`);
    assert(txt.includes('غایب: ۲') && txt.includes('حاضر: ۰'), 'شمارنده‌های خلاصه به‌روز نشدند — پس از تعویض');
  });

  /* ── P8: سوپاپِ اطمینان — تردید ⇒ رندرِ کامل ───────────────── */
  test('P8 سوپاپ اطمینان: با تردید، رندر کامل جایگزین می‌شود', () => {
    /* نشانه در ردیفِ آخر؛ با رندرِ کامل باید از درخت جدا شود */
    W(`var _bs=document.querySelectorAll('.att-btn'); window.__attMEl3=_bs[_bs.length-1];`);
    W(`window.__psBackup = attPartialSync;
       attPartialSync = function(){ return false; };`);
    click(sid2, 'present');           /* وضعیتِ پیش‌نویس عوض می‌شود؛ رندر کامل لازم است */
    const stillConnected = W(`window.__attMEl3.isConnected`);
    W(`attPartialSync = window.__psBackup;`);
    assert(stillConnected === false,
      'سوپاپ اطمینان کار نکرد — با وجود تردید رندر کامل اجرا نشد (عناصرِ قبلی زنده ماندند)');
    /* پس از رندرِ کامل هم وضعیت درست است (پیش‌نویس در Store ماند) */
    assert(!W(`document.querySelector('[data-act="att-set"][data-id="${sid2}"][data-s="absent"]').classList.contains('on-absent')`),
      'وضعیت پس از رندر کامل نادرست است');
    /* پاک‌سازیِ پیش‌نویس برای بررسی‌های بعدی */
    W(`document.querySelector('[data-act="att-discard"]').click()`);
    W(`document.querySelector('[data-act="ask-ok"]').click()`);
  });

  /* ── P9: حذفِ کاملِ پیش‌نویس ⇒ نوار و پابرگ حذف می‌شوند ───── */
  test('P9 با دورریختن، نوار و پابرگ حذف می‌شوند', () => {
    click(sid, 'absent');
    assert(W(`!!document.querySelector('.att-draft-bar')`), 'نوار پیش‌نویس ظاهر نشد');
    W(`document.querySelector('[data-act="att-discard"]').click()`);
    W(`document.querySelector('[data-act="ask-ok"]').click()`);
    assert(!W(`document.querySelector('.att-draft-bar')`) && !W(`document.querySelector('.card-foot')`),
      'پس از دورریختن، نوار/پابرگ حذف نشدند');
  });

  /* ── P10: دکمه‌های نوارِ جزئی واقعاً کار می‌کنند (مرور) ─────── */
  test('P10 دکمهٔ مرورِ نوارِ جزئی مودال را باز می‌کند', () => {
    click(sid, 'absent');
    W(`document.querySelector('.att-draft-bar [data-act="att-review"]').click()`);
    assert(W(`!!document.querySelector('.modal')`), 'مودالِ مرور باز نشد');
    W(`document.querySelector('.modal [data-act="close"], .modal-close') && document.querySelector('.modal [data-act="close"], .modal-close').click()`);
  });

  await __seq;
  const total = pass + fail;
  console.log(`\nبه‌روزرسانی جزئی حضور: ${pass}/${total} موفق  —  ${fail ? '❌ ' + fail + ' خطا' : 'بدون خطا ✅'}`);
  process.exit(fail ? 1 : 0);
}
