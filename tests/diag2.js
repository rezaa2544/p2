#!/usr/bin/env node
/**
 * سئوت موتور خودتعمیر دیاگ — پایش
 *
 * هر سناریو: (الف) مشکل را واقعاً می‌سازد، (ب) دیاگ را اجرا می‌کند و
 * تشخیص را بررسی می‌کند، (ج) تعمیر خودکار می‌زند و نتیجه را در داده
 * راستی‌آزمایی می‌کند، (د) بازگردانی می‌زند و حالت قبل را بازمی‌بیند.
 * سئوت فقط با قرمزِ واقعی شکست می‌خورد (خروجی ۱).
 *
 * اجرا: node tests/diag2.js
 */
const fs = require('fs');
const path = require('path');

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — سئوت رد شد.  (npm i --no-save jsdom)'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const mkDom = () => {
  const vc = new VirtualConsole();
  vc.on('jsdomError', () => {});
  return new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
    virtualConsole: vc,
  });
};

const dom = mkDom();
const win = dom.window;
const W = (expr) => win.eval(expr);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const sec = async (name, fn) => {
  const t0 = Date.now();
  try { await fn(); results.push({ name, ok: true, detail: '', ms: Date.now() - t0 }); }
  catch (e) { results.push({ name, ok: false, detail: String(e.message || e), ms: Date.now() - t0 }); }
};
const assert = (c, m) => { if (!c) throw new Error(m || 'شرط برقرار نیست'); };
const clk = (act, attrs = {}) => W(
  `(function(){var el=document.createElement('button');el.setAttribute('data-act',${JSON.stringify(act)});` +
  Object.entries(attrs).map(([k, v]) => `el.setAttribute('data-${k}',${JSON.stringify(v)});`).join('') +
  `document.body.appendChild(el);el.dispatchEvent(new MouseEvent('click',{bubbles:true}));el.remove();})()`
);

/* آزمون نتیجه می‌دهد؛ به id می‌رسم */
const getResult = (id) => W(`(function(){var out=S.diag;for(var i=0;i<out.results.length;i++){if(out.results[i].id==='${id}')return out.results[i];}return null;})()`);

main().catch((e) => { console.error(e); process.exit(1); });

async function main() {
  await sleep(600);

  /* ورود سوپرادمین تا دیاگ اجازهٔ اجرا دهد */
  W(`document.getElementById('lu').value='superadmin';document.getElementById('lp').value='123456'`);
  clk('login');
  assert(W('S.user && S.user.role') === 'superadmin', 'ورود سوپرادمین انجام نشد');

  console.log('\n▸ موتور خودتعمیر دیاگ\n');

  /* ── D1: رشتهٔ خارج از شاخه — تشخیص، تعمیر، بازگردانی ─────── */
  await sec('D1 رشتهٔ کلاسِ خارج از فهرست مدرسه: تشخیص → تعمیر → بازگردانی', async () => {
    const sid = W(`(function(){var s=db.schools.find(function(x){return x.active&&Array.isArray(x.fields)&&x.fields.length;});return s?s.id:null;})()`);
    assert(sid, 'مدرسه‌ای با فهرست رشتهٔ غیرخالی پیدا نشد');
    const orig = W(`JSON.stringify(byId('schools',${sid}).fields)`);
    W(`update('schools',${sid},{fields:['ریاضی فیزیک']});true`);
    /* «حالت قبل» از دیدِ تعمیر = همین فهرستِ تک‌رشته‌ای (خودِ seed تست) */
    const preFix = W(`JSON.stringify(byId('schools',${sid}).fields)`);
    const cid = W(`(function(){var c=insert('classes',{school_id:${sid},name:'کلاس تست دیاگ',grade:'دهم',field:'ادبیات و علوم انسانی',capacity:10});return c.id;})()`);

    W('S.diag=runDiagnostics()');
    let r = getResult('field-outside-branch');
    assert(r && r.ok === false, 'عیب رشته تشخیص داده نشد (نتیجه: ' + JSON.stringify(r && r.msg) + ')');

    const f = await W(`diagFix('field-outside-branch')`);
    assert(f.ok === true, 'تعمیر ناموفق بود: ' + f.msg);
    assert(f.after === 0, 'بعد از تعمیر، عیب هنوز هست: ' + f.msg);
    const nowFields = W(`byId('schools',${sid}).fields`);
    assert(JSON.stringify(nowFields).indexOf('ادبیات و علوم انسانی') > -1,
      'رشتهٔ گم‌شده به فهرست مدرسه افزوده نشد: ' + JSON.stringify(nowFields));

    /* تاریخچهٔ تعمیرات ثبت شده باشد */
    const rec = W(`(function(){var x=DIAG_REPAIRS[0];return x?{id:x.id,title:x.title,beforeLen:(x.before||[]).length}:null;})()`);
    assert(rec && rec.id === 'field-outside-branch' && rec.beforeLen > 0,
      'تعمیر در تاریخچه ثبت نشده یا حالتِ قبل ندارد: ' + JSON.stringify(rec));

    /* صفحهٔ دیاگ تاریخچه را نشان دهد */
    W('S.diag=runDiagnostics()');
    const page = W('viewDiagnostics()');
    assert(page.indexOf('تاریخچه تعمیرات') > -1, 'کارت تاریخچهٔ تعمیرات در صفحه نیست');
    assert(page.indexOf('بازگردانی') > -1, 'دکمهٔ بازگردانی در صفحه نیست');

    /* بازگردانی → فهرست به «حالت قبل از تعمیر» (seed تست) برگردد */
    const rb = await W('diagRollback(0)');
    assert(rb.ok === true, 'بازگردانی ناموفق: ' + rb.msg);
    const back = W(`JSON.stringify(byId('schools',${sid}).fields)`);
    assert(back === preFix, 'فهرست رشته به حالت قبل از تعمیر بازنگشت: ' + back + ' ≠ ' + preFix);

    /* پاک‌سازی seed: کلاسِ تست و فهرستِ اصلی مدرسه */
    W(`remove('classes',${cid});true`);
    W(`update('schools',${sid},{fields:${orig}});true`);
  });

  /* ── D2: رمز پیش‌فرض — تعمیر + اعلان + بازگردانی ──────────── */
  await sec('D2 رمز پیش‌فرضِ کاربر مدیریتی: تشخیص → رمز تازه → اعلان → بازگردانی', async () => {
    const sid = W(`db.schools[0].id`);
    const uid = W(`(function(){var u=insert('users',{school_id:${sid},role:'manager',full_name:'مدیر تست دیاگ',username:'diag2_mgr_'+Date.now(),password:'123456',national_id:'',phone:'09120000001',active:1});return u.id;})()`);

    W('S.diag=runDiagnostics()');
    let r = getResult('weak-password');
    assert(r && r.ok === false, 'کاربرِ رمزپیش‌فرض تشخیص داده نشد');

    const f = await W(`diagFix('weak-password')`);
    assert(f.ok === true, 'تعمیر رمز ناموفق: ' + f.msg);
    const nowPass = W(`byId('users',${uid}).password`);
    assert(nowPass && nowPass !== '123456', 'رمز هنوز ۱۲۳۴۵۶ است');
    assert(f.msg.indexOf(nowPass) > -1, 'رمز جدید در گزارش تعمیر نیست');
    const notif = W(`db.notifications.filter(function(x){return x.user_id===${uid}&&x.title.indexOf('دیاگ')>-1;}).length`);
    assert(notif > 0, 'اعلان رمز جدید به حساب کاربر نرفت');

    const rb = await W('diagRollback(0)');
    assert(rb.ok === true, 'بازگردانی رمز ناموفق: ' + rb.msg);
    assert(W(`byId('users',${uid}).password`) === '123456', 'رمز به حالت قبل بازنگشت');

    W(`remove('users',${uid});true`);
  });

  /* ── D3: ظرفیت کلاس ───────────────────────────────────────── */
  await sec('D3 کلاس پر از ظرفیت: تشخیص → ظرفیت = واقعیت → بازگردانی', async () => {
    const sid = W(`db.schools[0].id`);
    const cid = W(`insert('classes',{school_id:${sid},name:'کلاس ظرفیت',grade:'یازدهم',field:'',capacity:1}).id`);
    const mkStu = (name) => W(`insert('users',{school_id:${sid},role:'student',full_name:'${name}',username:'diag2_stu_'+Date.now()+Math.random(),password:'x',active:1}).id`);
    const s1 = await mkStu('دانش‌آموز تست یک');
    const s2 = await mkStu('دانش‌آموز تست دو');
    W(`insert('enrollments',{student_id:${s1},class_id:${cid}});insert('enrollments',{student_id:${s2},class_id:${cid}});true`);

    W('S.diag=runDiagnostics()');
    let r = getResult('class-over-capacity');
    assert(r && r.ok === false, 'کلاسِ بیش‌ازظرفیت تشخیص داده نشد');

    const f = await W(`diagFix('class-over-capacity')`);
    assert(f.ok === true, 'تعمیر ظرفیت ناموفق: ' + f.msg);
    assert(W(`byId('classes',${cid}).capacity`) === 2, 'ظرفیت به تعداد واقعی (۲) تنظیم نشد');

    const rb = await W('diagRollback(0)');
    assert(rb.ok === true, 'بازگردانی ظرفیت ناموفق: ' + rb.msg);
    assert(W(`byId('classes',${cid}).capacity`) === 1, 'ظرفیت به ۱ بازنگشت');

    W(`remove('enrollments',db.enrollments.find(function(e){return e.student_id===${s1}&&e.class_id===${cid};}).id);
       remove('enrollments',db.enrollments.find(function(e){return e.student_id===${s2}&&e.class_id===${cid};}).id);
       remove('classes',${cid});remove('users',${s1});remove('users',${s2});true`);
  });

  /* ── D4: نام کاربری تکراری (تعمیر موجود) ──────────────────── */
  await sec('D4 نام کاربری تکراری: تشخیص → نام تازه به دومی', async () => {
    const sid = W(`db.schools[0].id`);
    const mkU = () => W(`insert('users',{school_id:${sid},role:'teacher',full_name:'دبیر تست',username:'diag2_dup_'+Date.now(),password:'x',active:1}).id`);
    const a = await mkU();
    const b = await mkU();
    const shared = W(`byId('users',${a}).username`);
    W(`update('users',${b},{username:'${shared}'});true`);

    W('S.diag=runDiagnostics()');
    let r = getResult('duplicate-username');
    assert(r && r.ok === false, 'نام کاربری تکراری تشخیص داده نشد');

    const f = await W(`diagFix('duplicate-username')`);
    assert(f.ok === true, 'تعمیر نام کاربری ناموفق: ' + f.msg);
    const ua = W(`byId('users',${a}).username`), ub = W(`byId('users',${b}).username`);
    assert(ua !== ub, 'نام‌ها هنوز تکراری‌اند: ' + ua + ' / ' + ub);

    W(`remove('users',${a});remove('users',${b});true`);
  });

  /* ── D5: شمارندهٔ شناسهٔ عقب‌مانده ─────────────────────────── */
  await sec('D5 شمارندهٔ شناسه عقب افتاده: تشخیص → هم‌ترازی', async () => {
    const maxId = W(`(function(){var m=0;db.classes.forEach(function(c){if(c.id>m)m=c.id;});return m;})()`);
    W(`ids.classes=1;true`);
    W('S.diag=runDiagnostics()');
    let r = getResult('id-sequence');
    assert(r && r.ok === false, 'شمارندهٔ عقب‌مانده تشخیص داده نشد');
    const f = await W(`diagFix('id-sequence')`);
    assert(f.ok === true, 'تعمیر شمارنده ناموفق: ' + f.msg);
    assert(W('ids.classes') >= maxId, 'شمارنده هم‌تراز نشد: ' + W('ids.classes') + ' < ' + maxId);
  });

  /* ── D6: دام‌گیر خطای زمان‌اجرا (مشکل کدنویسی) ─────────────── */
  await sec('D6 خطای کدنویسی: ثبت در لاگ → نمایش در دیاگ → پاک‌سازی', async () => {
    W(`(function(){
      var ev;
      try{ ev = new ErrorEvent('error', { message:'diag2-runtime-test', filename:'diag2.js', lineno: 42 }); }
      catch(e){ ev = new Event('error'); ev.message='diag2-runtime-test'; ev.filename='diag2.js'; ev.lineno=42; }
      window.dispatchEvent(ev);
    })()`);
    await sleep(50);
    W('S.diag=runDiagnostics()');
    let r = getResult('runtime-errors');
    assert(r && r.ok === false, 'خطای زمان‌اجرا در لاگ ثبت/تشخیص نشد');
    assert(JSON.stringify(r.items).indexOf('diag2-runtime-test') > -1, 'متن خطا در نمونه‌ها نیست');

    const f = await W(`diagFix('runtime-errors')`);
    assert(f.ok === true, 'پاک‌سازی لاگ ناموفق: ' + f.msg);
    assert(W('DIAG_SYSLOG.length') === 0, 'لاگ خالی نشد');
  });

  /* ── D7: پنهان‌سازی خودکار گزینهٔ شکستهٔ منو ───────────────── */
  await sec('D7 گزینهٔ شکستهٔ منو: پنهان‌سازی خودکار → بازگردانی', async () => {
    const routesOf = () => W(`(function(){var r=[];navFor({role:'superadmin'}).forEach(function(g){g[1].forEach(function(i){r.push(i[0]);});});return JSON.stringify(r);})()`);
    assert(routesOf().indexOf('"bells"') > -1, 'زنگ‌ها باید در منوی سوپرادمین باشد');

    W(`navDisableAdd('bells');true`);
    assert(routesOf().indexOf('"bells"') === -1, 'گزینهٔ پنهان‌شده هنوز در منو هست');
    assert(W(`navDisabledRoutes().indexOf('bells')`) > -1, 'فهرست پنهان‌شده‌ها ثبت نشده');

    W('navRestoreAll()');
    assert(routesOf().indexOf('"bells"') > -1, 'بعد از بازگردانی، زنگ‌ها به منو نرفت');
  });

  /* ── D8: خانوادهٔ زیرساخت در حالت تک‌فایل — صادقانه ───────── */
  await sec('D8 آزمون‌های ارتباط/زیرساخت: در حالت تک‌فایل صادقانه رد می‌شوند', async () => {
    W('S.diag=runDiagnostics()');
    const ids = ['server-mode', 'api-health', 'api-version', 'time-drift', 'offline-status', 'storage-quota'];
    ids.forEach((id) => {
      const r = getResult(id);
      assert(r, 'آزمون ' + id + ' در نتایج نیست');
      assert(r.ok === true || r.count === 1,
        'آزمون ' + id + ' در حالت تک‌فایل باید صادقانه رد شود، اما: ' + (r && r.msg));
    });
    const sm = getResult('server-mode');
    assert(JSON.stringify(sm.extra).indexOf('تک‌فایل') > -1, 'نشان حالت تک‌فایل گزارش نشده: ' + sm.extra);
    const ap = getResult('api-health');
    assert(JSON.stringify(ap.extra).indexOf('تک‌فایل') > -1, 'آزمون سلامت سرور باید «در حالت تک‌فایل اجرا نمی‌شود» بگوید');
  });

  /* ── D9: کتابچهٔ عملیات در صفحهٔ دیاگ ──────────────────────── */
  await sec('D9 کتابچهٔ عملیات: همهٔ سناریوها با «نحوهٔ رفع» و «مسئول»', async () => {
    W('S.diag=runDiagnostics()');
    const page = W('viewDiagnostics()');
    assert(page.indexOf('کتابچهٔ عملیات') > -1, 'کارت کتابچهٔ عملیات نیست');
    assert(page.indexOf('نحوهٔ رفع') > -1, 'ستون «نحوهٔ رفع» نیست');
    assert(page.indexOf('مسئول') > -1, 'ستون «مسئول» نیست');
    assert(page.indexOf('سرور/زیرساخت') > -1, 'مسئول «سرور/زیرساخت» در جدول نیست');
    /* هر آزمون باید حداقل «بررسی دستی» یا fixDesc داشته باشد */
    const n = W('DIAG_CHECKS.length');
    const rows = (page.match(/<tr><td><b>/g) || []).length;
    assert(rows === n, 'تعداد ردیف کتابچه (' + rows + ') با تعداد آزمون (' + n + ') نمی‌خواند');
  });

  /* ── D10: نمرهٔ سلامت و خلاصهٔ سه خانواده ───────────────────── */
  await sec('D10 خلاصهٔ اجرا: سه خانواده و نمرهٔ سلامت ۰ تا ۱۰۰', async () => {
    W('S.diag=runDiagnostics()');
    const sum = W(`S.diag.summary`);
    assert(sum && typeof sum.health === 'number' && sum.health >= 0 && sum.health <= 100,
      'نمرهٔ سلامت معتبر نیست: ' + JSON.stringify(sum && sum.health));
    assert(sum.byCat && sum.byCat.infra && sum.byCat.infra.total > 0, 'خلاصهٔ خانوادهٔ زیرساخت نیست');
    assert(sum.byCat.engine && sum.byCat.data, 'خلاصهٔ دو خانوادهٔ دیگر نیست');
  });

  /* ── D11: دکمهٔ تعمیرِ کارت — کلیکِ واقعی، نه فراخوانیِ تابع ───── */
  await sec('D11 دکمهٔ تعمیرِ کارت: کلیکِ واقعی روی دکمهٔ رندرشده → تعمیر در داده', async () => {
    const uname = 'diag2_click_' + Date.now();
    const sid = W('db.schools[0].id');
    const mk  = W(`(function(){return insert('users',{school_id:${sid},role:'teacher',full_name:'معلم D11',username:'${uname}',password:'x1',national_id:'',phone:'',active:1}).id;})()`);
    const mk2 = W(`(function(){return insert('users',{school_id:${sid},role:'teacher',full_name:'معلم D11-2',username:'${uname}',password:'x2',national_id:'',phone:'',active:1}).id;})()`);
    try {
      W('S.diag=runDiagnostics()');
      let r = getResult('duplicate-username');
      assert(r && r.ok === false, 'نام کاربری تکراری تشخیص داده نشد: ' + JSON.stringify(r && r.msg));

      /* صفحهٔ دیاگ رندر شود و دکمهٔ واقعیِ کارت در DOM باشد */
      W(`S.route='diag';render();true`);
      const found = W(`!!document.querySelector('[data-act="diag-fix"][data-id="duplicate-username"]')`);
      assert(found, 'دکمهٔ تعمیرِ کارتِ «نام کاربری تکراری» در صفحهٔ رندرشده نیست');

      W(`(function(){var b=document.querySelector('[data-act="diag-fix"][data-id="duplicate-username"]');b.dispatchEvent(new MouseEvent('click',{bubbles:true}));})()`);
      await sleep(600); /* تعمیر ناهمگام (Promise) + اجرای دوبارهٔ آزمون‌ها + رندر */

      /* «آزمون یافت نشد» نباید پیش آمده باشد: عیب حالا در خودِ داده برطرف است */
      r = getResult('duplicate-username');
      assert(r && r.ok === true, 'بعد از کلیکِ واقعی، عیب هنوز هست (دکمه کار نکرد): ' + JSON.stringify(r && r.msg));
      const names = W(`db.users.filter(function(u){return u.id===${mk}||u.id===${mk2};}).map(function(u){return u.username;})`);
      assert(names.length === 2 && names[0] !== names[1], 'نام کاربری‌ها هنوز تکراری‌اند: ' + JSON.stringify(names));
    } finally {
      W(`remove('users',${mk});remove('users',${mk2});true`);
    }
  });

  /* ── خاتمه ─────────────────────────────────────────────────── */
  console.log('────────────────────────────────────────────────────────────');
  results.forEach((r) => {
    console.log('  ' + (r.ok ? '✅' : '❌') + ' ' + r.name + (r.ok ? '' : '\n     ' + r.detail));
  });
  const bad = results.filter((r) => !r.ok).length;
  console.log('────────────────────────────────────────────────────────────');
  console.log('  موتور خودتعمیر دیاگ: ' + (results.length - bad) + '/' + results.length +
    (bad ? ' — ' + bad + ' قرمز 🔴' : ' سبز ✅'));
  process.exit(bad ? 1 : 0);
}
