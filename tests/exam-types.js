#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   فاز ۰.۳ — تفکیک امتحان نهایی کشوری از امتحان داخلی مدرسه
   اجرا: node tests/exam-types.js

   چه چیزی سنجیده می‌شود:
     T1  examTypeOf — نمای دوحالتی از منشأ جلسه (internal|national)
     T2  gradeSource — پیش‌فرض internal برای رکورد قدیمی (بدون source)
     T3  مدیر می‌تواند نمرهٔ نهایی کشوری ثبت کند (کلیک واقعی) + مُهر source
     T4  🔴 دبیر نمی‌تواند نمرهٔ نهایی کشوری ثبت کند (کلیک واقعی)
     T5  🔴 دبیر نمی‌تواند نمرهٔ نهایی کشوریِ موجود را ویرایش کند
     T6  فرم دبیر نوع «امتحان نهایی» را ندارد؛ فرم مدیر دارد
     T7  کارنامه: کارت جداگانهٔ نمرات نهایی کشوری + معدل خودش
     T8  گواهی نمرات: بخش جداگانهٔ نهایی کشوری (فقط وقتی نمره باشد)
     T9  نما: برچسب «نهایی کشوری» در جدول نمرات
     T10 نمرهٔ داخلی با همان مسیر، source=internal می‌گیرد (بدون برچسب)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); }
catch { console.log('jsdom نصب نیست — سئوت رد شد.'); process.exit(0); }

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('فاز ۰.۳ — تفکیک امتحان نهایی کشوری از داخلی');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
    virtualConsole: new VirtualConsole().on('jsdomError', () => {}).on('error', () => {}),
  });
  const win = dom.window;
  const W = (expr) => win.eval(expr);
  await sleep(2000);

  /* ── محیط آزمون ساخته می‌شود (نه ثابت): یک کلاس دوازدهم با دانش‌آموز،
        یک مدیر و یک دبیر در همان مدرسه. ───────────────────────────── */
  const env = JSON.parse(W(`JSON.stringify((function(){
    var school = db.schools.filter(function(s){return s.active;})[0];
    var cls = insert('classes',{school_id:school.id,name:'ET دوازدهم ریاضی',grade:'دوازدهم',capacity:30});
    var sub = insert('subjects',{school_id:school.id,name:'ET ریاضی',weekly_hours:4,grade:'دوازدهم'});
    var sub2 = insert('subjects',{school_id:school.id,name:'ET فیزیک',weekly_hours:3,grade:'دوازدهم'});
    var st = insert('users',{school_id:school.id,role:'student',full_name:'ET دانش‌آموز',username:'et_stu_1',password:'1',active:1,created_at:todayISO()});
    insert('enrollments',{school_id:school.id,class_id:cls.id,student_id:st.id});
    var mgr = insert('users',{school_id:school.id,role:'manager',full_name:'ET مدیر',username:'et_mgr_1',password:'1',active:1,created_at:todayISO()});
    var tea = insert('users',{school_id:school.id,role:'teacher',full_name:'ET دبیر',username:'et_tea_1',password:'1',subject:sub.name,active:1,created_at:todayISO()});
    insert('schedule',{school_id:school.id,class_id:cls.id,subject_id:sub.id,teacher_id:tea.id,day:0,p:1});
    /* یک نمرهٔ داخلی معمولی (پیش از هر کاری) */
    var internalGrade = insert('grades',{school_id:school.id,student_id:st.id,class_id:cls.id,subject_id:sub2.id,teacher_id:tea.id,term:TERMS[0],exam_type:'میان‌ترم',kind:'theory',score:15,max_score:20,created_at:todayISO()});
    return {school:school.id,cls:cls.id,sub:sub.id,sub2:sub2.id,st:st.id,mgr:mgr.id,tea:tea.id,internalGrade:internalGrade.id};
  })())`));

  /* ورودِ نقش‌ها — همان الگوی بقیهٔ سئوت‌ها */
  const as = (userId) => W('S.user=byId("users",' + userId + ');S.persona=null;S.boss=null;S.route="grades";S.tab="grades";S.page=1;S.filters={class:' + env.cls + '};S.user.role');

  /* ── T1: نمای دوحالتی منشأ جلسه ─────────────────────────────── */
  const t1 = JSON.parse(W(`JSON.stringify({
    none: examTypeOf({}),
    internal: examTypeOf({source:'internal'}),
    national: examTypeOf({source:'national_final'}),
    makeup: examTypeOf({source:'makeup'}),
    legacy: examTypeOf({is_final:1})
  })`));
  chk('T1a جلسهٔ بدون منشأ → internal', t1.none === 'internal', t1.none);
  chk('T1b جلسهٔ درسی → internal', t1.internal === 'internal', t1.internal);
  chk('T1c جلسهٔ نهایی کشوری → national', t1.national === 'national', t1.national);
  chk('T1d جلسهٔ جبرانی → internal (کشوری نیست)', t1.makeup === 'internal', t1.makeup);
  chk('T1e رکورد قدیمی با is_final → national', t1.legacy === 'national', t1.legacy);

  /* ── T2: منشأ نمره، با پیش‌فرض internal ─────────────────────── */
  const t2 = JSON.parse(W(`JSON.stringify({
    missing: gradeSource({score:10}),
    internal: gradeSource({source:'internal'}),
    national: gradeSource({source:'national'}),
    junk: gradeSource({source:'national_final'}),
    labelI: gradeSourceLabel({}),
    labelN: gradeSourceLabel({source:'national'})
  })`));
  chk('T2a نمرهٔ قدیمی بدون source → internal', t2.missing === 'internal', t2.missing);
  chk('T2b مقدار ناشناخته → internal (fail-closed)', t2.junk === 'internal', t2.junk);
  chk('T2c نمرهٔ کشوری → national', t2.national === 'national', t2.national);
  chk('T2d برچسب فارسی درست است', t2.labelI === 'داخلی' && t2.labelN === 'نهایی کشوری', t2.labelI + '/' + t2.labelN);

  /* ── T3: مدیر، نمرهٔ نهایی کشوری را با کلیک واقعی ثبت می‌کند ── */
  as(env.mgr);
  const t3 = JSON.parse(W(`(function(){
    gradeModal(null);
    var st=document.getElementById('g_st'); if(st) st.value=String(${env.st});
    var sub=document.getElementById('g_sub'); if(sub) sub.value=String(${env.sub});
    var term=document.getElementById('g_term'); if(term) term.value=TERMS[0];
    var type=document.getElementById('g_type'); if(type) type.value=NATIONAL_EXAM_TYPE;
    var score=document.getElementById('g_score'); if(score) score.value='17.5';
    var before=db.grades.filter(function(g){return g.student_id===${env.st}&&gradeSource(g)==='national';}).length;
    var btn=document.querySelector('#modal [data-act="grade-save"]');
    if(!btn) return JSON.stringify({err:'no-btn'});
    btn.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    var rows=db.grades.filter(function(g){return g.student_id===${env.st}&&gradeSource(g)==='national';});
    return JSON.stringify({before:before,after:rows.length,row:rows[rows.length-1]||null});
  })()`));
  chk('T3a مدیر نمرهٔ نهایی کشوری را ثبت کرد', t3.err === undefined && t3.after === t3.before + 1, JSON.stringify(t3).slice(0, 140));
  chk('T3b مُهر source روی رکورد نشست', t3.row && t3.row.source === 'national', t3.row ? String(t3.row.source) : 'no-row');
  chk('T3c نوع آزمون همان «امتحان نهایی» است', t3.row && t3.row.exam_type === 'امتحان نهایی', t3.row ? String(t3.row.exam_type) : 'no-row');
  const natId = t3.row ? t3.row.id : 0;

  /* ── T4: 🔴 دبیر نمی‌تواند نمرهٔ نهایی کشوری ثبت کند ─────────── */
  as(env.tea);
  const t4 = JSON.parse(W(`(function(){
    gradeModal(null);
    /* فرم دبیر این نوع را ندارد؛ پس مثل یک مهاجم مستقیم مقدار می‌دهیم */
    var type=document.getElementById('g_type');
    if(type){ var o=document.createElement('option'); o.value=NATIONAL_EXAM_TYPE; o.textContent=NATIONAL_EXAM_TYPE; type.appendChild(o); type.value=NATIONAL_EXAM_TYPE; }
    var st=document.getElementById('g_st'); if(st) st.value=String(${env.st});
    var sub=document.getElementById('g_sub'); if(sub) sub.value=String(${env.sub});
    var score=document.getElementById('g_score'); if(score) score.value='20';
    var before=db.grades.filter(function(g){return g.student_id===${env.st}&&gradeSource(g)==='national';}).length;
    var btn=document.querySelector('#modal [data-act="grade-save"]');
    if(!btn) return JSON.stringify({err:'no-btn'});
    btn.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    var after=db.grades.filter(function(g){return g.student_id===${env.st}&&gradeSource(g)==='national';}).length;
    return JSON.stringify({before:before,after:after});
  })()`));
  chk('T4 🔴 ثبت نمرهٔ کشوری توسط دبیر رد شد', t4.err === undefined && t4.after === t4.before, JSON.stringify(t4));

  /* ── T5: 🔴 دبیر نمی‌تواند نمرهٔ کشوریِ موجود را ویرایش کند ──── */
  const t5 = JSON.parse(W(`(function(){
    var rec=byId('grades',${natId});
    var before=rec?rec.score:null;
    gradeModal(rec);
    var score=document.getElementById('g_score');
    var locked=!!(score&&score.disabled);
    if(score) score.value='0.25';
    var btn=document.querySelector('#modal [data-act="grade-save"]');
    if(btn) btn.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    var after=(byId('grades',${natId})||{}).score;
    return JSON.stringify({before:before,after:after,locked:locked});
  })()`));
  chk('T5a نمرهٔ کشوری در فرم دبیر قفل است', t5.locked === true, 'locked=' + t5.locked);
  chk('T5b 🔴 ویرایش نمرهٔ کشوری توسط دبیر اثر نکرد', t5.before === t5.after, t5.before + '→' + t5.after);

  /* ── T6: کشف‌پذیری — گزینهٔ نوع در فرم دبیر و مدیر ─────────── */
  const t6 = JSON.parse(W(`(function(){
    function optsOf(uid){
      S.user=byId('users',uid);S.persona=null;S.boss=null;S.filters={class:${env.cls}};
      gradeModal(null);
      var t=document.getElementById('g_type');
      if(!t) return [];
      var out=[]; for(var i=0;i<t.options.length;i++) out.push(t.options[i].value);
      return out;
    }
    return JSON.stringify({teacher:optsOf(${env.tea}),manager:optsOf(${env.mgr})});
  })()`));
  chk('T6a فرم دبیر «امتحان نهایی» را ندارد', t6.teacher.indexOf('امتحان نهایی') === -1, JSON.stringify(t6.teacher));
  chk('T6b فرم مدیر «امتحان نهایی» را دارد', t6.manager.indexOf('امتحان نهایی') > -1, JSON.stringify(t6.manager));
  W('if(document.getElementById("modal-close"))document.getElementById("modal-close").click();');

  /* ── T7: کارنامه — کارت جداگانهٔ نمرات نهایی کشوری ─────────── */
  const t7 = JSON.parse(W(`(function(){
    var st=byId('users',${env.st});
    var card=nationalGradesCard(${env.st});
    var S2=S.user;
    S.user=st;S.persona=null;S.boss=null;S.tab='grades';S.route='record';S.filters={};
    var page=viewRecord(${env.st});
    S.user=S2;
    return JSON.stringify({
      cardHasSubject: card.indexOf('ET ریاضی')>-1,
      cardHasTitle: card.indexOf('نمرات امتحان نهایی کشوری')>-1,
      cardMean: (nationalGpa(${env.st})===17.5),
      pageHasTitle: page.indexOf('نمرات امتحان نهایی کشوری')>-1,
      chipLabel: page.indexOf('نهایی کشوری')>-1,
      emptyCard: nationalGradesCard(${env.mgr})===''
    });
  })()`));
  chk('T7a کارت، درس و عنوان جداگانه دارد', t7.cardHasSubject === true && t7.cardHasTitle === true, JSON.stringify(t7));
  chk('T7b معدل نهایی کشوری خودش حساب می‌شود', t7.cardMean === true, 'nationalGpa=' + W('nationalGpa(' + env.st + ')'));
  chk('T7c صفحهٔ کارنامه کارت را نشان می‌دهد', t7.pageHasTitle === true, 'pageHasTitle=' + t7.pageHasTitle);
  chk('T7d برچسب روی چیپ نمره هست', t7.chipLabel === true, 'chipLabel=' + t7.chipLabel);
  chk('T7e بدون نمرهٔ کشوری، کارتی ساخته نمی‌شود', t7.emptyCard === true, 'emptyCard=' + t7.emptyCard);

  /* ── T8: گواهی نمرات — بخش جداگانه ────────────────────────── */
  const t8 = JSON.parse(W(`(function(){
    var withNat=transcriptCert(${env.st},TERMS[0]);
    /* نمرهٔ کشوری را موقتاً داخلی می‌کنیم تا نبودِ بخش سنجیده شود */
    var rec=byId('grades',${natId});
    update('grades',${natId},{source:'internal'});
    var withoutNat=transcriptCert(${env.st},TERMS[0]);
    update('grades',${natId},{source:'national'});
    return JSON.stringify({
      okA: withNat.ok===true, hasA: withNat.body.indexOf('امتحانات نهایی کشوری')>-1,
      meanA: withNat.body.indexOf('معدل نهایی کشوری')>-1,
      okB: withoutNat.ok===true, hasB: withoutNat.body.indexOf('امتحانات نهایی کشوری')>-1
    });
  })()`));
  chk('T8a گواهی، بخش نهایی کشوری را دارد', t8.okA === true && t8.hasA === true, JSON.stringify(t8));
  chk('T8b معدل نهایی کشوری در گواهی می‌آید', t8.meanA === true, 'meanA=' + t8.meanA);
  chk('T8c بدون نمرهٔ کشوری، بخش نمی‌آید', t8.okB === true && t8.hasB === false, 'hasB=' + t8.hasB);

  /* ── T9/T10: نمای جدول نمرات ──────────────────────────────── */
  const t9 = JSON.parse(W(`(function(){
    S.user=byId('users',${env.mgr});S.persona=null;S.boss=null;
    S.route='grades';S.filters={class:${env.cls}};
    var out=viewGrades();
    return JSON.stringify({
      badge: out.indexOf('نهایی کشوری')>-1,
      internalRowPresent: out.indexOf('میان‌ترم')>-1
    });
  })()`));
  chk('T9 جدول نمرات برچسب «نهایی کشوری» دارد', t9.badge === true, JSON.stringify(t9));
  chk('T10 نمرهٔ داخلی هم در همان جدول هست', t9.internalRowPresent === true, JSON.stringify(t9));

  const total = okc + failc;
  console.log('────────────────────────────────────────────────────');
  console.log('تفکیک امتحان نهایی: ' + okc + '/' + total + ' موفق' + (failc ? '  —  ' + failc + ' خطا ❌' : '  —  بدون خطا ✅'));
  if (failc) { fails.forEach((f) => console.log('   • ' + f)); }
  console.log('────────────────────────────────────────────────────');
  process.exit(failc ? 1 : 0);
}

main().catch((e) => { console.error('خطای سئوت:', e); process.exit(1); });
