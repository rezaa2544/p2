#!/usr/bin/env node
/**
 * تستِ واقعیِ مسیرهای ادامهٔ تحصیل بعد از نهم (بند ۵.۱ — دور ۷۱)
 *
 *  P0 — بوت بدون خطا
 *  P1 — کارت فقط برای پایهٔ نهم (نه دهم)
 *  P2 — کارت، رشته‌های اعلام‌شدهٔ مدرسه + دروس تخصصیِ دهم را نشان می‌دهد
 *  P3 — بازنمایهٔ صادقانه: انتخاب در «استعدادهای درخشان»، نه جایگزینِ مشاوره
 *  P4 — کارت در تبِ شناسنامهٔ پرونده (نمای ولی) رندر می‌شود
 *  P5 — دروس تخصصی از فهرستِ کتاب‌ها می‌آیند (ریاضی ۱ در ریاضی فیزیک)
 *  P6 — ورودیِ غیرموجود امن است (بازنمایهٔ خالی، بدون خطا)
 *
 * اجرا:  node tests/pathway2.js   (بعد از node build.js)
 */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let seq = Promise.resolve();
const results = [];
function test(name, fn) {
  const next = seq.then(async () => {
    await fn();
    results.push([name, true]);
    console.log('  ✅ ' + name);
  }).catch(e => {
    results.push([name, false]);
    console.log('  ❌ ' + name + ' — ' + e.message);
  });
  seq = next;
}

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost/',
  virtualConsole: new VirtualConsole().on('jsdomError', e => {
    if (String(e.message).includes('Could not parse CSS')) return;
    console.log('   ⚠ jsdom:', e.message);
  })
});
const win = dom.window;
const W = expr => win.eval(expr);

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

setTimeout(async () => {
  const root = () => win.document.getElementById('root');

  /* یک دانش‌آموزِ نهم (کلاس ۲۱ = نهم الفِ مدرسهٔ ۳) + یک دانش‌آموزِ دهم */
  const kid9 = W(`(function(){
    var e = db.enrollments.find(function(x){return x.class_id===21;});
    return e ? e.student_id : null;
  })()`);
  assert(kid9, 'دانش‌آموزِ نهمی برای تست پیدا نشد');
  const kid10 = W(`(function(){
    var c = db.classes.find(function(c){return Number(gradeFromName(c.name))===10;});
    if(!c) return null;
    var e = db.enrollments.find(function(x){return x.class_id===c.id;});
    return e ? e.student_id : null;
  })()`);
  assert(kid10, 'دانش‌آموزِ دهمی برای تست پیدا نشد');
  const m3 = W(`db.users.find(u=>u.role==='manager'&&u.school_id===3).id`);

  test('P0 بوت بدون خطا', async () => {
    await sleep(400);
    assert(root().innerHTML.length > 1000, 'ریشه خالی است');
  });

  test('P1 کارت فقط برای پایهٔ نهم است', () => {
    const c9 = W(`pathwayGuideCard(${kid9})`);
    const c10 = W(`pathwayGuideCard(${kid10})`);
    assert(c9.indexOf('مسیرهای ادامهٔ تحصیل بعد از نهم') > -1, 'کارت برای نهم نیست');
    assert(c10 === '', 'کارت برای دهم هم رندر شد');
  });

  test('P2 رشته‌های مدرسه + دروس تخصصیِ دهم', () => {
    const c = W(`pathwayGuideCard(${kid9})`);
    const fields = W(`schoolFields(3).join('|')`);
    fields.split('|').forEach(f => {
      if (f) assert(c.indexOf('>' + f + '<') > -1, 'رشتهٔ «' + f + '» نیست');
    });
    assert(c.indexOf('ریاضی ۱') > -1, 'دروس تخصصیِ دهم نیست');
    assert(c.indexOf('فقط اطلاع‌رسانی') > -1, 'نشانِ «فقط اطلاع‌رسانی» نیست');
  });

  test('P3 بازنمایهٔ صادقانه: استعدادهای درخشان + نه‌جایگزینیِ مشاوره', () => {
    const c = W(`pathwayGuideCard(${kid9})`);
    assert(c.indexOf('استعدادهای درخشان') > -1, 'اشاره به سامانهٔ انتخاب نیست');
    assert(c.indexOf('جایگزینِ مشاورهٔ تخصصی نیست') > -1, 'نکتهٔ «نه جایگزینِ مشاوره» نیست');
  });

  test('P4 کارت در تبِ شناسنامهٔ پرونده (نمای مدیر) رندر می‌شود', () => {
    W(`(function(){
      S.user = byId('users', ${m3}); S.persona = null; S.boss = null;
      S.child = ${kid9}; S.filters = {}; S.route = 'record'; S.tab = 'profile'; render();
    })()`);
    const r = root().innerHTML;
    assert(r.indexOf('مسیرهای ادامهٔ تحصیل بعد از نهم') > -1, 'کارت در پرونده نیست');
  });

  test('P5 دروس تخصصی از فهرستِ کتاب‌ها می‌آیند', () => {
    assert(W(`pathwayTenthSubjects('ریاضی فیزیک').indexOf('ریاضی ۱')`) > -1, 'ریاضی ۱ در ریاضی فیزیک نیست');
    assert(W(`pathwayTenthSubjects('علوم تجربی').indexOf('زیست‌شناسی ۱')`) > -1, 'زیست ۱ در علوم تجربی نیست');
    assert(W(`pathwayTenthSubjects('ناموجود').length`) === 0, 'رشتهٔ ناموجود باید خالی باشد');
  });

  test('P6 ورودیِ غیرموجود امن است', () => {
    assert(W(`pathwayGuideCard(999999)`) === '', 'کاربرِ ناموجود باید خالی برگردد');
  });

  await seq;
  await sleep(100);
  const bad = results.filter(r => !r[1]).length;
  console.log(`\npathway2 (مسیرهای نهم): ${results.length} بررسی — ✅ ${results.length - bad} · ❌ ${bad}`);
  process.exit(bad ? 1 : 0);
}, 300);
