#!/usr/bin/env node
/* E.2 فرناز: شمارش‌معکوس امتحان + یادآوری — اجرا: node tests/examcount.js */
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
  if (cond) { okc++; console.log('  PASS ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('E.2 — exam countdown suite');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
    virtualConsole: new VirtualConsole().on('jsdomError', () => {}).on('error', () => {}),
  });
  const win = dom.window;
  const W = (expr) => win.eval(expr);
  await sleep(2000);

  const ISO = '2026-09-08';
  const S = JSON.parse(W(`JSON.stringify((function(){
    var mgr=db.users.find(u=>u.role==="manager"&&u.school_id);
    S.user=mgr;
    var sid=mgr.school_id;
    notifySaveSettings(sid,{enabled:true});
    var cls=insert('classes',{school_id:sid,name:'EX Class'});
    var cls2=insert('classes',{school_id:sid,name:'EX Other'});
    var st=insert('users',{school_id:sid,role:'student',full_name:'EX Kid',username:'ex_kid_1',password:'1',active:1,created_at:todayISO()});
    var par=insert('users',{school_id:sid,role:'parent',full_name:'EX Par',username:'ex_par_1',password:'1',phone:'09123456789',active:1,created_at:todayISO()});
    insert('enrollments',{school_id:sid,class_id:cls.id,student_id:st.id});
    insert('parent_links',{school_id:sid,student_id:st.id,parent_id:par.id});
    var math=insert('subjects',{school_id:sid,name:'EXRiazi'});
    var sci=insert('subjects',{school_id:sid,name:'EXOloom'});
    var term=insert('exam_terms',{school_id:sid,title:'EX Term',start_date:'2026-09-01',end_date:'2026-10-30',status:'published'});
    var mk=function(c,s,d,t){return insert('exams',{school_id:sid,term_id:term.id,class_id:c,subject_id:s,date:d,start_time:t||'08:00',duration:90,room:'A',max_score:20,source:'internal'});};
    var near=mk(cls.id,math.id,addDaysISO('${ISO}',3),'08:00');
    var far=mk(cls.id,sci.id,addDaysISO('${ISO}',10),'08:00');
    var other=mk(cls2.id,sci.id,addDaysISO('${ISO}',1),'08:00');
    var past=mk(cls.id,sci.id,addDaysISO('${ISO}',-5),'08:00');
    return {st:st.id,par:par.id,cls:cls.id,near:near.id,far:far.id,other:other.id};
  })())`));

  // ── شمارش‌معکوس (iso ثابت؛ ۳ روز مانده ⇒ هنوز یادآوری نمی‌فرستد) ──
  const card = W('examCountdownCard(' + S.st + ',"' + ISO + '")');
  chk('T1 countdown text', card.indexOf('EXRiazi') > -1 && card.indexOf(W('fa(3)') + ' روز تا امتحان') > -1, card.slice(0, 120));
  chk('T2 nearest wins', card.indexOf('EXRiazi') > -1 && card.indexOf('EXOloom') === -1);
  chk('T3 other-class exam ignored', W('nextExamFor(' + S.st + ',"' + ISO + '").exam.id') === S.near);
  const ST2 = W('insert("users",{school_id:S.user.school_id,role:"student",full_name:"EX NoClass",username:"ex_kid_2",password:"1",active:1,created_at:todayISO()}).id');
  chk('T4 no exam -> empty card', W('examCountdownCard(' + ST2 + ',"' + ISO + '")') === '');
  chk('T5 past exam ignored', W('nextExamFor(' + S.st + ',"' + ISO + '").days') === 3);

  // ── یادآوری: رندر با ۱ روز فاصله (۰ و ۱ و ۲ روز ⇒ پنجره) ──
  const q0 = W('db.notify_queue.length'), n0 = W('db.notifications.length');
  W('examCountdownCard(' + S.st + ',addDaysISO("' + ISO + '",1));'); // near: 2 روز مانده
  const q1 = W('db.notify_queue.filter(q=>q.source_ref==="examrem:' + S.near + '").length');
  const nSt = W('db.notifications.filter(n=>n.type==="exam_remind"&&n.user_id===' + S.st + ').length');
  const nPar = W('db.notifications.filter(n=>n.type==="exam_remind"&&n.user_id===' + S.par + ').length');
  chk('T6a sms queued once', q1 === 1, 'q=' + q1);
  chk('T6b in-app to student', nSt === 1, 'n=' + nSt);
  chk('T6c in-app to parent', nPar === 1, 'n=' + nPar);
  chk('T6d sms kind/body sane', W('db.notify_queue.filter(q=>q.source_ref==="examrem:' + S.near + '")[0].kind') === 'event');

  // ضدتکرار
  W('examCountdownCard(' + S.st + ',addDaysISO("' + ISO + '",1));');
  W('examCountdownCard(' + S.st + ',addDaysISO("' + ISO + '",2));'); // ۱ روز مانده
  W('examCountdownCard(' + S.st + ',addDaysISO("' + ISO + '",3));'); // روز امتحان
  chk('T7a sms still once', W('db.notify_queue.filter(q=>q.source_ref==="examrem:' + S.near + '").length') === 1);
  chk('T7b in-app still once each', W('db.notifications.filter(n=>n.type==="exam_remind").length') === 2);

  // امتحان دور یادآوری نمی‌گیرد
  chk('T8 far exam untouched', W('db.notify_queue.filter(q=>q.source_ref==="examrem:' + S.far + '").length') === 0
    && W('db.notifications.filter(n=>n.type==="exam_remind").length') === 2);

  // روز امتحان: تیتر «امروز»
  const cardToday = W('examCountdownCard(' + S.st + ',addDaysISO("' + ISO + '",3));');
  chk('T9 today headline', cardToday.indexOf('امروز امتحان') > -1);

  // پیامک خاموش ⇒ فقط اعلان داخلی
  W('notifySaveSettings(S.user.school_id,{enabled:false});');
  const S3 = JSON.parse(W(`JSON.stringify((function(){
    var sid=S.user.school_id;
    var c=insert('classes',{school_id:sid,name:'EX Class3'});
    var s=insert('users',{school_id:sid,role:'student',full_name:'EX Kid3',username:'ex_kid_3',password:'1',active:1,created_at:todayISO()});
    insert('enrollments',{school_id:sid,class_id:c.id,student_id:s.id});
    var t=db.exam_terms.filter(x=>x.title==='EX Term')[0];
    var sub=db.subjects.filter(x=>x.name==='EXRiazi')[0];
    var e=insert('exams',{school_id:sid,term_id:t.id,class_id:c.id,subject_id:sub.id,date:addDaysISO('${ISO}',2),start_time:'08:00',duration:90,max_score:20,source:'internal'});
    return {st:s.id,ex:e.id};
  })())`));
  W('examCountdownCard(' + S3.st + ',"' + ISO + '");');
  chk('T10a sms skipped when disabled', W('db.notify_queue.filter(q=>q.source_ref==="examrem:' + S3.ex + '").length') === 0);
  chk('T10b in-app still sent', W('db.notifications.filter(n=>n.type==="exam_remind"&&n.user_id===' + S3.st + ').length') === 1);

  // summaryBlock (نسبت به امروزِ واقعی — ایزوله)
  const hasSum = W(`(function(){
    var sid=S.user.school_id;
    var c=insert('classes',{school_id:sid,name:'EX SumC'});
    var s=insert('users',{school_id:sid,role:'student',full_name:'EX SumK',username:'ex_kid_4',password:'1',active:1,created_at:todayISO()});
    insert('enrollments',{school_id:sid,class_id:c.id,student_id:s.id});
    var t=db.exam_terms.filter(x=>x.title==='EX Term')[0];
    var sub=db.subjects.filter(x=>x.name==='EXOloom')[0];
    insert('exams',{school_id:sid,term_id:t.id,class_id:c.id,subject_id:sub.id,date:addDaysISO(todayISO(),4),start_time:'08:00',duration:90,max_score:20,source:'internal'});
    return summaryBlock(s.id).indexOf('روز تا امتحان EXOloom')>-1;
  })()`);
  chk('T11 summary includes countdown', hasSum === true);

  console.log('examcount: ' + okc + ' pass / ' + failc + ' fail');
  if (failc) { console.log('FAILURES:'); fails.forEach(f => console.log(' - ' + f)); }
  try { dom.window.close(); } catch (e) {}
  process.exit(failc ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
