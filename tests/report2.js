#!/usr/bin/env node
/**
 * تستِ واقعیِ کارنامهٔ چاپ‌شونده (بند ۴.۳ — دور ۷۱)
 *
 *  R0 — بوت بدون خطا
 *  R1 — ساختارِ کارنامه: نام، کلاس، درس‌ها، معدلِ وزنی
 *  R2 — میانگینِ کلاس درست محاسبه می‌شود (۱۸ و ۱۰ ⇒ ۴)
 *  R3 — رتبهٔ کلاس درست است (اول از دو)
 *  R4 — فیلترِ نوبت: نمرهٔ نوبتِ دوم به کارنامهٔ نوبتِ اول نمی‌آید
 *  R5 — نمرهٔ ندارد ⇒ پیامِ صادقانه
 *  R6 — شناسهٔ غیردانش‌آموزی ⇒ رد
 *  R7 — دکمهٔ «چاپ کارنامه» در تبِ کارنامه رندر می‌شود
 *  R8 — نامِ پرمخاطره (HTML) تویِ خروجی امن می‌شود
 *
 * اجرا:  node tests/report2.js   (بعد از node build.js)
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

  /* سناریوی کنترل‌شده: کلاسِ تازه با دو دانش‌آموز و یک درس */
  const ctx = W(`(function(){
    var cls = add('classes',{school_id:1,name:'تست کارنامه',grade:'دهم'});
    var sA = add('users',{school_id:1,role:'student',full_name:'الف تست',national_id:'9991001000001',phone:'09990001190',active:1,created_at:'2026-09-01'});
    var sB = add('users',{school_id:1,role:'student',full_name:'ب تست',national_id:'9991001000002',phone:'09990001191',active:1,created_at:'2026-09-01'});
    add('enrollments',{school_id:1,class_id:cls.id,student_id:sA.id});
    add('enrollments',{school_id:1,class_id:cls.id,student_id:sB.id});
    var sub = db.subjects[0];
    add('grades',{school_id:1,student_id:sA.id,class_id:cls.id,subject_id:sub.id,term:'نوبت اول',exam_type:'پایانی',score:18,max_score:20,created_at:'2026-09-01'});
    add('grades',{school_id:1,student_id:sB.id,class_id:cls.id,subject_id:sub.id,term:'نوبت اول',exam_type:'پایانی',score:10,max_score:20,created_at:'2026-09-01'});
    return {cls:cls.id,sA:sA.id,sB:sB.id,sub:sub.id,subName:sub.name};
  })()`);
  assert(ctx && ctx.sA, 'سناریوی کنترل‌شده ساخته نشد');

  test('R0 بوت بدون خطا', async () => {
    await sleep(400);
    assert(root().innerHTML.length > 1000, 'ریشه خالی است');
  });

  test('R1 ساختارِ کارنامه: نام، کلاس، درس، معدل', () => {
    const d = W(`reportCardCert(${ctx.sA},'نوبت اول')`);
    assert(d.ok === true, 'ok نیست: ' + (d.msg||''));
    assert(d.title === 'کارنامه', 'عنوانِ کارنامه نیست');
    assert(d.body.indexOf('الف تست') > -1, 'نامِ دانش‌آموز نیست');
    assert(d.body.indexOf('تست کارنامه') > -1, 'نامِ کلاس نیست');
    assert(d.body.indexOf('>' + ctx.subName + '<') > -1, 'درس نیست');
    assert(d.body.indexOf('معدلِ وزنی') > -1, 'معدل نیست');
    assert(d.body.indexOf('رتبهٔ کلاس') > -1, 'رتبه نیست');
  });

  test('R2 میانگینِ کلاس: ۱۸ و ۱۰ ⇒ ۱۴', () => {
    const d = W(`reportCardCert(${ctx.sA},'نوبت اول')`);
    /* اعداد فارسی */
    assert(d.body.indexOf(String.fromCharCode(0x06F1,0x06F8)) > -1, 'نمرهٔ ۱۸ نیست');
    assert(d.body.indexOf(String.fromCharCode(0x06F1,0x06F4)) > -1, 'میانگینِ کلاس ۱۴ نیست');
  });

  test('R3 رتبهٔ کلاس: اولِ دو نفره', () => {
    const d = W(`reportCardCert(${ctx.sA},'نوبت اول')`);
    assert(d.body.indexOf('رتبهٔ کلاس: <b>1'.replace('<b>1','<b>' + String.fromCharCode(0x06F1))) > -1, 'رتبهٔ ۱ نیست');
    assert(d.body.indexOf('رتبهٔ کلاس: <b>' + String.fromCharCode(0x06F1) + '</b> از ' + String.fromCharCode(0x06F2)) > -1, '«۱ از ۲» نیست');
    const d2 = W(`reportCardCert(${ctx.sB},'نوبت اول')`);
    assert(d2.body.indexOf('رتبهٔ کلاس: <b>' + String.fromCharCode(0x06F2)) > -1, 'رتبهٔ ب: ۲ نیست');
  });

  test('R4 فیلترِ نوبت', () => {
    W(`add('grades',{school_id:1,student_id:${ctx.sA},class_id:${ctx.cls},subject_id:${ctx.sub},term:'نوبت دوم',exam_type:'پایانی',score:5,max_score:20,created_at:'2026-09-02'})`);
    const d1 = W(`reportCardCert(${ctx.sA},'نوبت اول')`);
    const d2 = W(`reportCardCert(${ctx.sA},'نوبت دوم')`);
    assert(d2.ok === true, 'کارنامهٔ نوبتِ دوم ساخته نشد');
    /* نمرهٔ ۵ (نوبتِ دوم) نباید میانگینِ نوبتِ اول را آلوده کند */
    assert(d1.body.indexOf(String.fromCharCode(0x06F1,0x06F8)) > -1, 'میانگینِ نوبتِ اول تغییر کرد (فیلترِ نوبت شکسته)');
    assert(d2.subtitle.indexOf('نوبت دوم') > -1, 'نوبتِ دوم در زیرنویس نیست');
    /* نمرهٔ ۵ نباید در جدولِ نوبتِ اول بیاید: فقط یک ردیفِ درس داریم
       (یک <tr> هدر + یک <tr> درس) */
    const trCount = (d1.body.match(/<tr>/g) || []).length;
    assert(trCount === 2, 'فیلترِ نوبت شکست: ' + trCount + ' ردیف');
  });

  test('R5 نمرهٔ ندارد ⇒ پیام', () => {
    const sC = W(`add('users',{school_id:1,role:'student',full_name:'ج تست',national_id:'9991001000003',phone:'09990001192',active:1,created_at:'2026-09-01'}).id`);
    W(`add('enrollments',{school_id:1,class_id:${ctx.cls},student_id:${sC}})`);
    const d = W(`reportCardCert(${sC},'نوبت اول')`);
    assert(d.ok === false, 'باید رد شود');
    assert(String(d.msg).indexOf('نمره‌ای ثبت نشده') > -1, 'پیامِ صادقانه نیست');
  });

  test('R6 شناسهٔ غیردانش‌آموزی ⇒ رد', () => {
    const m1 = W(`db.users.find(u=>u.role==='manager'&&u.school_id===1).id`);
    const d = W(`reportCardCert(${m1},'نوبت اول')`);
    assert(d.ok === false, 'کاربرِ غیردانش‌آموز باید رد شود');
    assert(String(d.msg).indexOf('دانش‌آموز پیدا نشد') > -1, 'پیامِ رد درست نیست');
  });

  test('R7 دکمهٔ «چاپ کارنامه» در تبِ کارنامه', () => {
    const m1 = W(`db.users.find(u=>u.role==='manager'&&u.school_id===1).id`);
    W(`(function(){
      S.user = byId('users', ${m1}); S.persona = null; S.boss = null;
      S.child = ${ctx.sA}; S.filters = {}; S.route = 'record'; S.tab = 'grades'; render();
    })()`);
    const btn = win.document.querySelector('[data-act="report-print"]');
    assert(btn, 'دکمهٔ چاپ کارنامه نیست');
    assert(btn.getAttribute('data-sid') === String(ctx.sA), 'data-sid درست نیست');
  });

  test('R8 نامِ پرمخاطره امن می‌شود', () => {
    const sD = W(`add('users',{school_id:1,role:'student',full_name:'<img src=x onerror=alert(1)>',national_id:'9991001000004',phone:'09990001193',active:1,created_at:'2026-09-01'}).id`);
    W(`add('enrollments',{school_id:1,class_id:${ctx.cls},student_id:${sD}})`);
    W(`add('grades',{school_id:1,student_id:${sD},class_id:${ctx.cls},subject_id:${ctx.sub},term:'نوبت اول',exam_type:'پایانی',score:12,max_score:20,created_at:'2026-09-01'})`);
    const d = W(`reportCardCert(${sD},'نوبت اول')`);
    assert(d.body.indexOf('<img src=x') === -1, 'HTMLِ خامِ نام در خروجی است!');
    assert(d.body.indexOf('&lt;img') > -1, 'نامِ فرارِ‌شده نیست');
  });

  test('R9 پاک‌سازیِ رکوردهای آزمون', () => {
    W(`(function(){
      [${ctx.sA},${ctx.sB}].forEach(function(k){
        db.grades.slice().filter(function(g){return g.student_id===k;}).forEach(function(g){remove('grades',g.id);});
        db.enrollments.slice().filter(function(e){return e.student_id===k;}).forEach(function(e){remove('enrollments',e.id);});
        remove('users',k);
      });
      remove('classes',${ctx.cls});
    })()`);
    assert(!db.users.some(u => u.id === ctx.sA || u.id === ctx.sB), 'کاربران آزمایشی حذف نشدند');
    assert(!db.classes.some(c => c.id === ctx.cls), 'کلاس آزمایشی حذف نشد');
  });

  await seq;
  await sleep(100);
  const bad = results.filter(r => !r[1]).length;
  console.log(`\nreport2 (کارنامهٔ چاپ‌شونده): ${results.length} بررسی — ✅ ${results.length - bad} · ❌ ${bad}`);
  process.exit(bad ? 1 : 0);
}, 300);
