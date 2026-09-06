#!/usr/bin/env node
/**
 * شبیه‌سازیِ جامعِ سلامت (دور ۷۲) — چندمدرسه، چندنقش، سناریو + چاس (کلاینت)
 *
 *  مدارسِ دمو:
 *   S1 = 1 (دبیرستان — همهٔ توان‌ها)
 *   S2 = 2 (دبیرستان فرزان — بدون چندپایه)
 *   S4 = 4 (دبیرستان دخترانه — توان‌های محدود)
 *   S5 = 5 (مجتمع آموزشی — کارگاه + چندپایه)
 *   S6 = 6 (دبستان و متوسطه — در دمو غیرفعال: active:0)
 *
 *  بخش‌ها:
 *   A  بوت و هویت/مجوزها
 *   B  جداییِ دادهٔ چندمدرسه‌ای (tenant)
 *   C  قابلیت‌های دور ۷۱ در چند مدرسه
 *   D  حالت‌ها و حالت‌های ویژه (روز غیرحضوری، توان‌ها، تابستانی/تجدیدی)
 *   E  چالش‌های غیرمنتظره (چاس: رکوردهای یتیم، خالی، پرمخاطره، هم‌زمان)
 *   F  ماژول‌زایی (رندرهای پیاپی بدون خطا)
 *
 * اجرا:  node tests/sim_full2.js   (بعد از node build.js؛ jsdom لازم است)
 */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
function T(c, m) {
  if (c) { pass++; console.log('  ✅ ' + m); }
  else { fail++; console.log('  ❌ ' + m); }
}

const consoleErrs = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost/',
  virtualConsole: new VirtualConsole().on('jsdomError', e => {
    if (String(e.message).includes('Could not parse CSS')) return;
    consoleErrs.push(String(e.message));
  })
});
const win = dom.window;
const W = expr => win.eval(expr);
/* ارزیابیِ ایمن: خطای داخلی → {ok:false,msg} به‌جای کرشِ کلِ شبیه‌سازی */
function SW(expr) {
  try { const r = win.eval('(' + expr + ')'); return { ok: true, v: r }; }
  catch (e) { return { ok: false, msg: String(e.message || e) }; }
}
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
function asUser(uid, route, extra) {
  extra = extra || {};
  W(`(function(){
    S.user = byId('users', ${uid});
    S.persona = null; S.boss = null;
    S.filters = ${JSON.stringify(extra.filters || {})};
    S.child = ${extra.child != null ? extra.child : 'null'};
    S.tab = ${JSON.stringify(extra.tab || 'profile')};
    S.route = ${JSON.stringify(route)};
    render();
  })()`);
}
const rootHtml = () => win.document.getElementById('root').innerHTML;
/* یک بخش: خطای هر بخش، آن بخش را ❌ می‌کند اما شبیه‌سازی ادامه می‌یابد */
async function section(name, fn) {
  console.log('\n▸ ' + name);
  const errs = consoleErrs.length;
  try { await fn(); }
  catch (e) { T(false, name + ' — خطای ناگهانی: ' + String(e.message || e)); }
}

setTimeout(async () => {
await section('A — بوت و هویت/مجوزها', async () => {
  await sleep(500);
  T(rootHtml().length > 1000, 'A1 بوت بدون خطا');
  T(consoleErrs.length === 0, 'A2 خطای کنسولِ بوت: ' + (consoleErrs.length ? consoleErrs[0] : 'صفر'));
  const ids = SW(`({
    super: (db.users.find(u=>u.role==='superadmin')||{}).id||0,
    m1: (db.users.find(u=>u.role==='manager'&&u.school_id===1)||{}).id||0,
    m2: (db.users.find(u=>u.role==='manager'&&u.school_id===2)||{}).id||0,
    m4: (db.users.find(u=>u.role==='manager'&&u.school_id===4)||{}).id||0,
    m5: (db.users.find(u=>u.role==='manager'&&u.school_id===5)||{}).id||0,
    t1: (db.users.find(u=>u.role==='teacher'&&u.school_id===1)||{}).id||0,
    cous1: (db.users.find(u=>u.role==='counselor'&&u.school_id===1)||{}).id||0,
    cous2: (db.users.find(u=>u.role==='counselor'&&u.school_id===2)||{}).id||0,
    drv1: (db.users.find(u=>u.role==='driver'&&u.school_id===1)||{}).id||0
  })`).v || {};
  global.__ids = ids;
  T(!!(ids.super && ids.m1 && ids.m2 && ids.m4 && ids.cous1 && ids.cous2 && ids.drv1),
    'A3 همهٔ نقش‌های کلیدی در دمو موجود‌اند' + (ids.m5 ? ' (شامل مدیرِ ۵)' : ' — مدیرِ ۵؟'));
  T(SW(`homeRoute('counselor')`).v === 'cqueue', 'A4 خانهٔ مشاور صفِ ارجاع است');
  T(SW(`homeRoute('driver')`).v === 'myservice', 'A5 خانهٔ راننده مسیرِ خودش است');
  T(SW(`canRoute('cqueue','teacher')`).v === false, 'A6 دبیر به صفِ مشاور نمی‌رود');
  T(SW(`canRoute('followup','teacher')`).v === false, 'A7 دبیر به پیگیری الگوها نمی‌رود');
  T(SW(`canRoute('users','counselor')`).v === false, 'A8 مشاور فهرستِ کاربران را نمی‌بیند');
  T(SW(`canRoute('users','manager')`).v === true, 'A9 مدیر فهرستِ کاربران مدرسه‌اش را می‌بیند');
  T(SW(`canRoute('officedash','superadmin')`).v === true, 'A10 اصل: سوپرادمین همهٔ روت‌ها');
  T(SW(`canRoute('record','student')` && SW(`canRoute('record','parent')`).v === true).v === true, 'A11 پرونده برای دانش‌آموز/ولی');
});

/* زمینهٔ دانش‌آموزان */
const ctx = SW(`({
  st12: (function(){var c=db.classes.find(c=>c.school_id===1&&Number(gradeFromName(c.name))===12);
    var e=c&&db.enrollments.find(x=>x.class_id===c.id);return e?e.student_id:0;})(),
  st10: (function(){var c=db.classes.find(c=>c.school_id===1&&Number(gradeFromName(c.name))===10);
    var e=c&&db.enrollments.find(x=>x.class_id===c.id);return e?e.student_id:0;})(),
  st9s4: (function(){var c=db.classes.find(c=>c.school_id===4&&Number(gradeFromName(c.name))===9)||db.classes.find(c=>Number(gradeFromName(c.name))===9);
    var e=c&&db.enrollments.find(x=>x.class_id===c.id);return e?e.student_id:0;})(),
  st2: db.enrollments.filter(e=>{var c=byId('classes',e.class_id);return c&&c.school_id===2;}).map(e=>e.student_id)[0]||0,
  par12: (function(){var p=db.parent_links.find(x=>x.student_id===(function(){var c=db.classes.find(c=>c.school_id===1&&Number(gradeFromName(c.name))===12);
    var e=c&&db.enrollments.find(x=>x.class_id===c.id);return e?e.student_id:0;})());return p&&byId('users',p.parent_id)?byId('users',p.parent_id).id:0;})(),
  otherKid: db.users.find(u=>u.role==='student'&&u.school_id===1).id||0,
  n12: db.classes.filter(c=>Number(gradeFromName(c.name))===12).length
})`);
const C = ctx.ok ? ctx.v : {};
const ids = global.__ids || {};

await section('B — جداییِ دادهٔ چندمدرسه‌ای (tenant)', async () => {
  T(!!(C.st12 && C.st10 && C.st2), 'B0 زمینهٔ دانش‌آموزان (دوازدهم/دهم/مدرسهٔ ۲) پیدا شد');
  if (!C.st12) return;
  const vc = SW(`(function(){S.user=byId('users',${ids.m2});return visibleClasses().map(c=>c.school_id);})()`);
  T(vc.ok && vc.v.length > 0 && vc.v.every(s => s === 2), 'B1 مدیرِ ۲ فقط کلاس‌های مدرسهٔ ۲ را می‌بیند (' + (vc.ok ? vc.v.length : '?') + ' کلاس)');
  asUser(ids.m2, 'record', { tab: 'profile' });
  T(rootHtml().indexOf(W(`byId('users',${C.st12}).full_name`)) === -1, 'B2 لیستِ پروندهٔ مدیرِ ۲ دانش‌آموزِ مدرسهٔ ۱ را ندارد');
  asUser(ids.m1, 'record', { child: C.st12, tab: 'profile' });
  T(rootHtml().indexOf(W(`byId('users',${C.st12}).full_name`)) > -1, 'B3 مدیرِ ۱ پرونده دانش‌آموزِ خودش را می‌بینه');
  const t1cls = SW(`(function(){S.user=byId('users',${ids.t1});return visibleClasses().every(function(c){return c.school_id===1;});})()`);
  T(t1cls.ok && t1cls.v === true, 'B4 کلاس‌های قابلِ دیدِ دبیر فقط مدرسهٔ خودش');
  const kidsOfPar = SW(`(function(){var p=db.parent_links.find(x=>x.student_id===${C.st12});
    return db.parent_links.filter(x=>x.parent_id===p.parent_id).map(x=>x.student_id);})()`).v || [];
  T(kidsOfPar.indexOf(C.st12) > -1, 'B5 ولیِ دوازدهمی فرزندش را می‌بیند (' + kidsOfPar.length + ' فرزند)');
  const otherIsKid = kidsOfPar.indexOf(C.otherKid) > -1;
  asUser(C.par12, 'children');
  const kidsHtml = rootHtml();
  T(otherIsKid || kidsHtml.indexOf(W(`byId('users',${C.otherKid}).full_name`)) === -1,
    'B6 ولیِ بیگانهٔ مدرسهٔ ۱ فرزندِ دیگر را در لیست ندارد');
  asUser(C.st12, 'record', { child: C.st10, tab: 'profile' });
  T(rootHtml().indexOf(W(`byId('users',${C.st12}).full_name`)) > -1 &&
    rootHtml().indexOf(W(`byId('users',${C.st10}).full_name`)) === -1,
    'B7 دانش‌آموز فقط خودش (S.childِ بیگانه نادیده)');
  const q1 = SW(`counselorQueue(1,true).map(r=>r.school_id)`).v || [];
  const q2 = SW(`counselorQueue(2,true).map(r=>r.school_id)`).v || [];
  T(q1.every(s => s === 1) && q2.every(s => s === 2), 'B8 صفِ مشاور فقط ارجاع‌های مدرسهٔ خودش (۱: ' + q1.length + '، ۲: ' + q2.length + ')');
});

await section('C — قابلیت‌های دور ۷۱ در چند مدرسه', async () => {
  const s2 = SW(`(function(){
    var cls=db.classes.filter(c=>c.school_id===2);
    if(!cls.length)return{err:'no class s2'};
    var c=cls[0];
    var t=db.users.find(u=>u.role==='teacher'&&u.school_id===2);
    var subs=db.subjects.filter(s=>s.school_id===2);
    if(!subs.length)return{err:'no subjects s2'};
    var d=add('schedule',{school_id:2,class_id:c.id,subject_id:subs[0].id,teacher_id:t.id,day:2,period:3}).id;
    var d2=add('schedule',{school_id:2,class_id:c.id,subject_id:subs[1].id,teacher_id:t.id,day:2,period:3}).id;
    return {d:d,d2:d2};
  })()`).v || {};
  if (s2.err) { T(false, 'C زمینهٔ مدرسهٔ ۲: ' + s2.err); return; }
  asUser(ids.m2, 'schedule');
  T(rootHtml().indexOf('تداخل') > -1, 'C1 مدیرِ ۲ تداخلِ مدرسهٔ خودش را می‌بیند');
  T(rootHtml().indexOf('sched-conf-sug') > -1, 'C2 مدیر دکمهٔ «پیشنهاد جایِ آزاد» را می‌بیند (جابه‌جایی وقتی جای خالی باشد ظاهر می‌شود)');
  const sug = SW(`suggestSlots(${s2.d})`).v;
  const wd2 = SW(`workDaysOf(2)`).v || [0,1,2,3];
  T(Array.isArray(sug) && sug.length <= 3 && sug.every(s => wd2.indexOf(s.day) > -1),
    'C3 پیشنهادها فقط روزهای کاریِ مدرسهٔ ۲ (' + (Array.isArray(sug) ? sug.length + ' پیشنهاد' : 'خطا') + ')');
  W(`remove('schedule',${s2.d});remove('schedule',${s2.d2});`);
  asUser(ids.m1, 'classes');
  T(!!win.document.querySelector('[data-act="class-membership"]'), 'C4 مدیرِ ۱ دکمهٔ «عضویتِ دروس» را می‌بیند (has_multigrade)');
  asUser(ids.m2, 'classes');
  T(win.document.querySelector('[data-act="class-membership"]') === null, 'C5 مدیرِ ۲ دکمهٔ چندپایه نمی‌بیند (بدون توان)');
  if (C.st9s4) {
    asUser(ids.m4, 'record', { child: C.st9s4, tab: 'profile' });
    T(rootHtml().indexOf('مسیرهای ادامهٔ تحصیل بعد از نهم') > -1, 'C6 کارتِ مسیرِ نهم در پروندهٔ نهمی (مدرسهٔ ۴)');
    T(rootHtml().indexOf('استعدادهای درخشان') > -1, 'C7 بازنمایهٔ صادقانه (نه جایگزینِ مشاوره) هست');
    asUser(ids.m1, 'record', { child: C.st10, tab: 'profile' });
    T(rootHtml().indexOf('مسیرهای ادامهٔ تحصیل بعد از نهم') === -1, 'C8 دهمی کارتِ نهم را نمی‌بیند');
  }
  const m1 = SW(`counselorMsgSend(${C.st12},byId('users',${C.st12}),'تستِ شبیه‌سازیِ جامع')`).v || {};
  T(m1.ok === true, 'C9 دوازدهم می‌تواند به مشاور بنویسد');
  const r1 = SW(`counselorMsgSend(${C.st12},byId('users',${ids.cous1}),'پاسخِ شبیه‌سازی')`).v || {};
  T(r1.ok === true, 'C10 مشاورِ مدرسهٔ ۱ پاسخ می‌دهد');
  const rx = SW(`counselorMsgSend(${C.st12},byId('users',${ids.cous2}),'تجاوز بین‌مدرسه')`).v || {};
  T(rx.ok === false, 'C11 مشاورِ مدرسهٔ ۲ نمی‌تواند در رشتهٔ مدرسهٔ ۱ بنویسد');
  asUser(ids.m4, 'record', { child: C.st9s4, tab: 'grades' });
  T(!!win.document.querySelector('[data-act="report-print"]'), 'C12 دکمهٔ «چاپ کارنامه» در نماست (مدرسهٔ ۴)');
  const rc = SW(`reportCardCert(${C.st12},'نوبت اول')`).v || {};
  T(rc.ok === true && String(rc.body).indexOf('رتبهٔ کلاس') > -1, 'C13 کارنامه با رتبهٔ کلاس ساخته می‌شود (مدرسهٔ ۱)');
  asUser(ids.t1, 'schedule');
  T(rootHtml().indexOf('sched-conf-move') === -1, 'C14 نمای دبیر دکمهٔ جابه‌جایی ندارد (فقط اطلاع)');
});

const VDAY = new Date().toISOString().slice(0, 10);
await section('D — حالت‌ها و حالت‌های ویژه', async () => {
  const vb = SW(`(function(){
    var ex=(db.attendance_modes||[]).find(x=>x.school_id===2&&x.date==='${VDAY}');
    if(!ex)add('attendance_modes',{school_id:2,date:'${VDAY}',mode:'virtual',set_by:${ids.m2},set_at:'${VDAY}'});
    S.user=byId('users',${ids.m2});
    return virtualModeBanner('${VDAY}');
  })()`);
  T(vb.ok && String(vb.v).length > 0, 'D1 نوارِ «روزِ غیرحضوری» برای مدرسهٔ ۲ ساخته می‌شود');
  SW(`(db.attendance_modes||[]).filter(x=>x.school_id===2&&x.date==='${VDAY}').forEach(x=>remove('attendance_modes',x.id));`);
  const s6 = SW(`byId('schools',6)`).v;
  T(!!s6 && s6.active === 0, 'D2 مدرسهٔ ۶ در دمو active:0 (سناریوی مدرسهٔ خاموش)');
  T(SW(`db.users.filter(u=>u.role==='student'&&u.school_id===6).length`).v > 0, 'D3 دادهٔ دانش‌آموزانِ مدرسهٔ ۶ سالم است (فقط درگاه خاموش)');
  T(SW(`hasCap(1,'has_multigrade')`).v === true && SW(`hasCap(2,'has_multigrade')`).v === false, 'D4 has_multigrade: مدرسهٔ ۱ بله، ۲ نه');
  T(SW(`hasCap(5,'has_workshop')`).v === true, 'D5 مدرسهٔ ۵ توانِ کارگاه دارد');
  T(SW(`hasCap(1,'has_iep')`).v === true, 'D6 مدرسهٔ ۱ توانِ IEP دارد');
  const sum = SW(`(function(){
    var c=add('summer_classes',{school_id:1,name:'بهبودی ریاضی',teacher_id:${ids.t1},student_ids:[${C.st12}],start_date:'2026-07-01',end_date:'2026-07-15',created_at:'${VDAY}',updated_at:'${VDAY}'});
    var ok=db.summer_classes.some(x=>x.id===c.id);
    remove('summer_classes',c.id);
    return ok;
  })()`);
  T(sum.ok && sum.v === true, 'D7 کلاسِ تابستانی ساخته/حذف شد (جدا از سالِ رسمی)');
  const lib = SW(`(function(){
    S.user=byId('users',${ids.m1});
    var r1=libAddBook('کتابِ چاس','نویسندهٔ چاس','CODE-1','S-99');
    var r2=libAddBook('کتابِ دومی','نویسندهٔ چاس','CODE-2','S-99');
    var b=(db.lib_books||[]).filter(x=>x.serial==='S-99');
    b.forEach(x=>remove('lib_books',x.id));
    return {first:r1.ok,second:r2.ok,msg:r2.msg};
  })()`).v || {};
  T(lib.first === true && lib.second === false, 'D8 سریالِ تکراریِ کتاب در همان مدرسه رد شد (' + (lib.msg || '—') + ')');
  const am = SW(`assocMinutes(1).length`).v;
  T(am >= 0, 'D9 توابعِ صورت‌جلسهٔ انجمن سالم است (مدرسهٔ ۱: ' + am + ' صورت‌جلسه)');
});

await section('E — چالش‌های غیرمنتظره (چاس)', async () => {
  const e0 = consoleErrs.length;
  W(`add('counselor_refs',{school_id:1,student_id:999999,breach_key:'late',reason:'تست یتیم',pattern:{late:{count:5},absent:{count:0}},referred_by:${ids.m1},status:'open',created_at:'${VDAY}'})`);
  asUser(ids.cous1, 'cqueue');
  T(rootHtml().indexOf('یتیم') > -1 && consoleErrs.length === e0, 'E1 ارجاعِ یتیم (دانش‌آموزِ حذف‌شده) بدون کرش نمایش داده می‌شود');
  W(`(db.counselor_refs||[]).filter(r=>r.student_id===999999).forEach(r=>remove('counselor_refs',r.id));`);
  const noCls = W(`add('users',{school_id:1,role:'student',full_name:'بدون کلاس',national_id:'9992002000001',phone:'09990001177',active:1,created_at:'${VDAY}'}).id`);
  const e1 = consoleErrs.length;
  asUser(ids.m1, 'record', { child: noCls, tab: 'grades' });
  T(rootHtml().length > 300 && consoleErrs.length === e1, 'E2 پروندهٔ دانش‌آموزِ بدون کلاس بدون کرش رندر می‌شود');
  W(`add('grades',{school_id:1,student_id:${C.st12},class_id:null,subject_id:999999,term:'نوبت اول',exam_type:'پایانی',score:15,max_score:20,created_at:'${VDAY}'})`);
  const e2 = consoleErrs.length;
  asUser(ids.m1, 'record', { child: C.st12, tab: 'grades' });
  T(consoleErrs.length === e2, 'E3 نمرهٔ درسِ ناموجود بدون کرش (نشانِ «—»)');
  W(`(db.grades||[]).filter(g=>g.subject_id===999999).forEach(g=>remove('grades',g.id));`);
  W(`add('attendance',{school_id:1,student_id:888888,date:'${VDAY}',status:'present',created_at:'${VDAY}'})`);
  const e3 = consoleErrs.length;
  asUser(ids.m1, 'attendance');
  T(consoleErrs.length === e3, 'E4 رکوردِ حضورِ یتیم بدون کرش');
  W(`(db.attendance||[]).filter(a=>a.student_id===888888).forEach(a=>remove('attendance',a.id));`);
  const emptyCls = W(`add('classes',{school_id:1,name:'خالی تست',grade:'دهم'}).id`);
  T(SW(`studentsOfClass(${emptyCls}).length`).v === 0, 'E5 کلاسِ خالی: studentsOfClass خالی برمی‌گردد (فرم‌ها toast می‌زنند، نه کرش)');
  W(`remove('classes',${emptyCls});remove('users',${noCls});`);
  const xssKid = W(`(function(){
    var c=db.classes.find(c=>Number(gradeFromName(c.name))===12);
    var u=add('users',{school_id:1,role:'student',full_name:'<img src=x onerror=alert(1)>',national_id:'9992002000002',phone:'09990001178',active:1,created_at:'${VDAY}'});
    add('enrollments',{school_id:1,class_id:c.id,student_id:u.id});
    return u.id;
  })()`);
  W(`counselorMsgSend(${xssKid},byId('users',${xssKid}),'سلام <script>alert(2)</script>')`);
  asUser(ids.cous1, 'cqueue', { filters: { cmsg_stu: xssKid } });
  const xssHtml = rootHtml();
  T(xssHtml.indexOf('<script>alert(2)</script>') === -1, 'E6 HTML در رشتهٔ دوازدهم فرار می‌شود (XSS بسته)');
  const r500 = SW(`counselorMsgSend(${C.st12},byId('users',${C.st12}),${JSON.stringify('ب'.repeat(500))})`).v || {};
  const r501 = SW(`counselorMsgSend(${C.st12},byId('users',${C.st12}),${JSON.stringify('ب'.repeat(501))})`).v || {};
  T(r500.ok === true && r501.ok === false, 'E7 مرزِ ۵۰۰ نویسه: ۵۰ قبول، ۵۰۱ رد');
  const clsEdit = W(`add('classes',{school_id:1,name:'کلاس هم‌زمانی',grade:'دهم'}).id`);
  W(`update('classes',${clsEdit},{capacity:25});`);
  W(`update('classes',${clsEdit},{capacity:30,room:'204'});`);
  T(W(`byId('classes',${clsEdit}).capacity`) === 30 && W(`byId('classes',${clsEdit}).room`) === '204', 'E8 نوشتنِ دوم روی همان رکورد: آخرِ نوشتن برنده، بدون کرش');
  W(`remove('classes',${clsEdit});`);
  const no12 = SW(`(function(){
    for(var s of [2,4,6]){
      var has=db.classes.some(c=>c.school_id===s&&Number(gradeFromName(c.name))===12);
      if(!has)return s;
    }
    return 0;
  })()`).v;
  T(SW(`counselorMsgInbox(${no12},10).length`).v === 0, 'E9 مدرسهٔ ' + no12 + ' بدون دوازدهم: صندوقِ مشاور خالی و سالم');
  const crossT = SW(`(function(){
    var t=db.users.find(u=>u.role==='teacher'&&u.school_id===1);
    var c1=db.classes.find(c=>c.school_id===1);
    var c2=db.classes.find(c=>c.school_id===2);
    var s1=db.subjects.find(s=>s.school_id===1);
    var s2=db.subjects.find(s=>s.school_id===2);
    add('schedule',{school_id:1,class_id:c1.id,subject_id:s1.id,teacher_id:t.id,day:3,period:5});
    add('schedule',{school_id:2,class_id:c2.id,subject_id:s2.id,teacher_id:t.id,day:3,period:5});
    return t.id;
  })()`).v;
  const cf1 = SW(`scheduleConflicts(1).filter(c=>c.kind==='teacher'&&c.teacher_id===${crossT}).length`).v;
  const cf2 = SW(`scheduleConflicts(2).filter(c=>c.kind==='teacher'&&c.teacher_id===${crossT}).length`).v;
  T(cf1 > 0 && cf2 > 0, 'E10 تداخلِ بین‌مدرسه‌ایِ دبیر در هر دو مدرسه دیده می‌شود (۱: ' + cf1 + '، ۲: ' + cf2 + ')');
  const patBefore = SW(`(function(){var p=patternCheck(${C.st12},30);return p.late?p.late.count:-1;})()`).v;
  W(`add('attendance',{school_id:1,student_id:${C.st12},date:'2030-01-01',status:'late',late_minutes:10,created_at:'${VDAY}'})`);
  const patAfter = SW(`(function(){var p=patternCheck(${C.st12},30);return p.late?p.late.count:-1;})()`).v;
  T(patBefore === patAfter && patAfter >= 0, 'E11 حضورِ آینده (۲۰۰) در ۳۰ روزِ گذشته شمرده نمی‌شود (قبل: '+patBefore+'، بعد: '+patAfter+')');
  W(`(db.attendance||[]).filter(a=>a.date==='2030-01-01').forEach(a=>remove('attendance',a.id));`);
  const bigT = SW(`(function(){var t0=Date.now();reportCardCert(${C.st12},'نوبت اول');return Date.now()-t0;})()`).v;
  T(Number(bigT) < 2000, 'E12 کارنامهٔ کامل در ' + bigT + ' ms (زیر ۲ ثانیه)');
});

await section('F — ماژول‌زایی (رندرهای پیاپی)', async () => {
  const b1 = consoleErrs.length;
  let crashed = '';
  const routes = ['dashboard','schedule','record','classes','attendance','notifications'];
  const users = [ids.m1, ids.t1, C.st12, C.par12, ids.cous1, ids.m2];
  for (let i = 0; i < 50 && !crashed; i++) {
    try { asUser(users[i % 6], routes[i % 6], { child: routes[i % 6] === 'record' ? C.st12 : null }); }
    catch (e) { crashed = String(e.message || e); }
  }
  T(!crashed && consoleErrs.length === b1, 'F1 ۵۰ رندرِ پیاپیِ چندنقش بدون خطا' + (crashed ? ' — ' + crashed : ''));
  const b2 = consoleErrs.length;
  let crashed2 = '';
  for (let i = 0; i < 20 && !crashed2; i++) {
    try {
      asUser(ids.cous1, 'cqueue', { filters: i % 2 ? { cmsg_stu: C.st12 } : {} });
      asUser(ids.m1, 'schedule');
    } catch (e) { crashed2 = String(e.message || e); }
  }
  T(!crashed2 && consoleErrs.length === b2, 'F2 ۲۰ چرخهٔ باز/بستهٔ رشتهٔ دوازدهم + برنامه بدون خطا' + (crashed2 ? ' — ' + crashed2 : ''));
  T(consoleErrs.length === 0, 'F3 کلِ شبیه‌سازی: صفر خطای کنسول' + (consoleErrs.length ? ' — ' + consoleErrs[0] : ''));
});

/* ── پاک‌سازیِ رکوردهای آزمون ── */
try {
  W(`(function(){
    var xk=(db.users||[]).find(u=>u.national_id==='9992002000002');
    var kids=[${C.st12}]; if(xk)kids.push(xk.id);
    (db.counselor_msgs||[]).filter(function(m){return kids.indexOf(m.student_id)>-1;})
      .forEach(function(m){remove('counselor_msgs',m.id);});
    var keys={};
    (db.schedule||[]).forEach(function(s){
      if(s.day===3&&s.period===5&&s.teacher_id){
        var n=(db.schedule||[]).filter(function(x){return x.teacher_id===s.teacher_id&&x.day===3&&x.period===5;}).length;
        if(n>1)keys[s.teacher_id]=1;
      }
    });
    (db.schedule||[]).filter(function(s){return s.day===3&&s.period===5&&keys[s.teacher_id];}).forEach(function(s){remove('schedule',s.id);});
    if(xk){
      (db.enrollments||[]).filter(function(e){return e.student_id===xk.id;}).forEach(function(e){remove('enrollments',e.id);});
      remove('users',xk.id);
    }
  })()`);
} catch (e) { /* پاک‌سازی بر عهدهٔ دمو است */ }

await sleep(150);
console.log(`\nsim_full2 (شبیه‌سازیِ جامعِ کلاینت): ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
process.exit(fail ? 1 : 0);
}, 300);
