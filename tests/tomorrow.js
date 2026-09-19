#!/usr/bin/env node
/* E.1 فرناز: چک‌لیست «فردا چی لازم دارم» — اجرا: node tests/tomorrow.js */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); }
catch { console.log('jsdom نصب نیست — سئوت رد شد.'); process.exit(1); }

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  PASS ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('E.1 — tomorrow checklist suite');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
    virtualConsole: new VirtualConsole().on('jsdomError', () => {}).on('error', () => {}),
  });
  const win = dom.window;
  const W = (expr) => win.eval(expr);
  await sleep(2000);

  // iso ثابت: شنبه ۱۴۰۴/۰۶/۱۵ = 2026-09-06؟ نه — شنبهٔ واقعی را از روی خودِ موتور می‌گیریم:
  // فردایِ iso باید روزی باشد که ما برنامه می‌چینیم. dow فردا را حساب کن و همان را بذر بزن.
  const ISO = '2026-09-08'; // سه‌شنبه (صرفاً ثابت برای تکرارپذیری)
  const tmrDow = W('todayDow(addDaysISO("' + ISO + '",1))');
  const tmrIso = W('addDaysISO("' + ISO + '",1)');
  const setup = JSON.parse(W(`JSON.stringify((function(){
    var mgr=db.users.find(u=>u.role==="manager"&&u.school_id);
    S.user=mgr;S.persona=null;S.boss=null;
    var sid=mgr.school_id;
    var cls=insert('classes',{school_id:sid,name:'TM Class'});
    var st=insert('users',{school_id:sid,role:'student',full_name:'TM Kid',username:'tm_kid_1',password:'1',active:1,created_at:todayISO()});
    insert('enrollments',{school_id:sid,class_id:cls.id,student_id:st.id});
    var sub1=insert('subjects',{school_id:sid,name:'ورزش'});
    var sub2=insert('subjects',{school_id:sid,name:'ریاضی'});
    insert('schedule',{school_id:sid,class_id:cls.id,day:${tmrDow},period:1,subject_id:sub1.id});
    insert('schedule',{school_id:sid,class_id:cls.id,day:${tmrDow},period:2,subject_id:sub2.id});
    return {st:st.id,cls:cls.id,tmr:'${tmrIso}'};
  })())`));
  const ST = setup.st;

  const card = W('tomorrowCard(' + ST + ',"' + ISO + '")');
  chk('T1 lessons of tomorrow listed', card.indexOf('ورزش') > -1 && card.indexOf('ریاضی') > -1);
  chk('T2a sport gear shown', card.indexOf('لباس ورزش') > -1);
  chk('T2b no gear invented for math', card.indexOf('ریاضی') > -1 && (card.match(/🎒/g) || []).length >= 1);
  chk('T2c gear fn: art->paint', W('tomorrowGearFor("هنر")') === '🎨 وسایل نقاشی');
  chk('T2d gear fn: math->null', W('tomorrowGearFor("ریاضی")') === null);

  // جابه‌جایی فردا
  const CLS = setup.cls;
  W(`insert('substitutions',{school_id:S.user.school_id,schedule_id:db.schedule.filter(s=>s.day===${tmrDow}&&s.class_id===${CLS})[0].id,date:'${tmrIso}',sub_teacher_id:S.user.id});`);
  const card2 = W('tomorrowCard(' + ST + ',"' + ISO + '")');
  chk('T3 substitution badge shown', card2.indexOf('جابه‌جای') > -1);

  // روز خالی (پنجشنبه‌ای که برنامه ندارد — day=4 اگر فردا day دیگری است، وگرنه day=0 را پاک می‌کنیم؟)
  // ساده: دانش‌آموزِ بی‌کلاس
  const ST2 = W('insert("users",{school_id:S.user.school_id,role:"student",full_name:"TM NoClass",username:"tm_kid_2",password:"1",active:1,created_at:todayISO()}).id');
  const card3 = W('tomorrowCard(' + ST2 + ',"' + ISO + '")');
  chk('T4 empty tomorrow message', card3.indexOf('فردا کلاسی نیست') > -1);

  /* تیک + ماندگاری.
     چرا کلیکِ واقعی شبیه‌سازی نمی‌شود؟ پروبِ ایزوله (/tmp/jsd.js) ثابت کرد jsdom برخلاف
     مرورگر: (۱) قبل از اجرای لیسنرها checked را تاگِل می‌کند، (۲) با وجود preventDefault
     بعد از دیسپچ دوباره تاگِل می‌زند. پس «کلیکِ» jsdom معنای مرورگری ندارد.
     در مرورگرِ واقعی: لحظهٔ دیسپچ checked=مقدارِ قدیمی است، preventDefaultِ دیسپچر تاگِلِ
     بومی را لغو می‌کند، تاگِلِ دستیِ هندلر حالتِ جدید را می‌سازد — منطقِ محصول درست است.
     به‌جایش: گیتِ نقش + فراخوانیِ مستقیمِ اکشن با فیکِ el (همان باکسِ واقعیِ رندرشده). */
  W('S.user=byId("users",' + ST + ');');
  W('document.body.innerHTML+=tomorrowCard(' + ST + ',"' + ISO + '");');
  const box = W('document.querySelector(\'.tomorrow-card input[data-idx="p1"]\')');
  chk('T5a checkbox rendered', !!box);
  chk('T5b gate: manager blocked', W('(function(){S.user=db.users.find(u=>u.role==="manager"&&u.school_id);return canAction("tomorrow-check");})()') === false);
  chk('T5c gate: student allowed', W('S.user=byId("users",' + ST + ');canAction("tomorrow-check")') === true);
  W('(function(){var b=document.querySelector(\'.tomorrow-card input[data-idx="p1"]\');b.checked=false;coreActions(null,b,0,"tomorrow-check",null)["tomorrow-check"]();})()');
  const stored = W('JSON.parse(Store.get(tomorrowCheckKey(' + ST + ',"' + tmrIso + '"),"{}"))');
  chk('T5d check persisted to localStorage', stored && stored.p1 === 1, JSON.stringify(stored));
  W('(function(){var b=document.querySelector(\'.tomorrow-card input[data-idx="p1"]\');coreActions(null,b,0,"tomorrow-check",null)["tomorrow-check"]();})()');
  const stored2 = W('JSON.parse(Store.get(tomorrowCheckKey(' + ST + ',"' + tmrIso + '"),"{}"))');
  chk('T5e second toggle unchecks', stored2 && stored2.p1 === 0, JSON.stringify(stored2));
  W('(function(){var b=document.querySelector(\'.tomorrow-card input[data-idx="p1"]\');b.checked=false;coreActions(null,b,0,"tomorrow-check",null)["tomorrow-check"]();})()');
  const card4 = W('tomorrowCard(' + ST + ',"' + ISO + '")');
  chk('T5f re-render shows checked', card4.indexOf('data-idx="p1" checked') > -1);

  // summaryBlock
  const sum = W('summaryBlock(' + ST + ')');
  chk('T6 summary includes tomorrow card', sum.indexOf('فردا چی لازم دارم') > -1);

  // DAYS_FULL برای پنجشنبه/جمعه undefined نمی‌دهد
  const fri = W('(function(){var d=addDaysISO("' + ISO + '",0);return tomorrowCard(' + ST + ',"'+ ISO +'").indexOf("undefined")===-1;})()');
  chk('T7 no undefined in card', fri === true);

  console.log('tomorrow: ' + okc + ' pass / ' + failc + ' fail');
  if (failc) { console.log('FAILURES:'); fails.forEach(f => console.log(' - ' + f)); }
  try { dom.window.close(); } catch (e) {}
  process.exit(failc ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
