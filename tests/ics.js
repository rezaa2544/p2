#!/usr/bin/env node
/* E.4 فرناز: خروجی ICS — اجرا: node tests/ics.js */
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
const bytes = (s) => Buffer.byteLength(s, 'utf8');

async function main() {
  console.log('E.4 — ics export suite');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
    virtualConsole: new VirtualConsole().on('jsdomError', () => {}).on('error', () => {}),
  });
  const win = dom.window;
  const W = (expr) => win.eval(expr);
  await sleep(2000);

  const T = W('todayISO()');
  const S = JSON.parse(W(`JSON.stringify((function(){
    var mgr=db.users.find(u=>u.role==="manager"&&u.school_id);
    S.user=mgr;
    var sid=mgr.school_id;
    var cA=insert('classes',{school_id:sid,name:'I ClassA'});
    var cB=insert('classes',{school_id:sid,name:'I ClassB'});
    var mkU=function(r,n,u){return insert('users',{school_id:sid,role:r,full_name:n,username:u,password:'1',active:1,created_at:todayISO()});};
    var sa=mkU('student','I KidA','i_kid_a'), par=mkU('parent','I Par','i_par'), drv=mkU('driver','I Drv','i_drv');
    insert('enrollments',{school_id:sid,class_id:cA.id,student_id:sa.id});
    insert('parent_links',{school_id:sid,student_id:sa.id,parent_id:par.id});
    var math=insert('subjects',{school_id:sid,name:'IRiazi'});
    var term=insert('exam_terms',{school_id:sid,title:'I Term',start_date:'2026-09-01',end_date:'2026-12-30',status:'published'});
    var mkE=function(c,d,t){return insert('exams',{school_id:sid,term_id:term.id,class_id:c,subject_id:math.id,date:d,start_time:t||'08:00',duration:90,room:'A',max_score:20,source:'internal'});};
    var eA=mkE(cA.id,addDaysISO(todayISO(),3),'08:00');
    var eB=mkE(cB.id,addDaysISO(todayISO(),2),'10:00');
    var ePast=mkE(cA.id,addDaysISO(todayISO(),-4),'08:00');
    var longTitle='رویداد بسیار مهم مدرسه که عنوانش خیلی طولانی است تا تاشدن خط امتحان شود ';
    var r1=insert('calendar',{school_id:sid,title:'جشن, مدرسه; بزرگ',date:addDaysISO(todayISO(),5),kind:'event'});
    var r2=insert('calendar',{school_id:sid,title:longTitle+longTitle,kind:'holiday',date:addDaysISO(todayISO(),6)});
    var r3=insert('calendar',{school_id:sid,title:'گذشته',date:addDaysISO(todayISO(),-2),kind:'event'});
    return {sa:sa.id,par:par.id,drv:drv.id,mgr:mgr.id,sid:sid,eA:eA.id,eB:eB.id,ePast:ePast.id,r1:r1.id,r2:r2.id,r3:r3.id};
  })())`));
  const as = (uid) => W('S.user=byId("users",' + uid + ');');

  // ── ساختار ──
  as(S.sa);
  const pack = JSON.parse(W('JSON.stringify(icsBuild())'));
  chk('T1a fixtures in scope (+seed tolerated)', pack.text.indexOf('payesh-cal-' + S.r1 + '@') > -1
    && pack.text.indexOf('payesh-cal-' + S.r2 + '@') > -1 && pack.text.indexOf('payesh-exam-' + S.eA + '@') > -1
    && pack.text.indexOf('payesh-exam-' + S.eB + '@') === -1
    && pack.count === (pack.text.match(/BEGIN:VEVENT/g) || []).length, 'count=' + pack.count);
  chk('T1b envelope', pack.text.indexOf('BEGIN:VCALENDAR') === 0 && pack.text.indexOf('VERSION:2.0') > -1
    && pack.text.indexOf('PRODID:-//Payesh//School Calendar//FA') > -1 && pack.text.trimEnd().endsWith('END:VCALENDAR'));
  chk('T1c CRLF only', pack.text.indexOf('\n') > -1 && !/[^\r]\n/.test(pack.text), 'lone-LF found');

  // ── رویداد امتحان ──
  chk('T2a exam UID', pack.text.indexOf('UID:payesh-exam-' + S.eA + '@payesh') > -1);
  const dA = W('addDaysISO(todayISO(),3)').replace(/-/g, '');
  chk('T2b DTSTART floating', pack.text.indexOf('DTSTART:' + dA + 'T080000') > -1);
  chk('T2c DTEND = +90min', pack.text.indexOf('DTEND:' + dA + 'T093000') > -1);
  chk('T2d summary/location/desc', pack.text.indexOf('SUMMARY:' + 'امتحان IRiazi') > -1
    && pack.text.indexOf('LOCATION:') > -1 && pack.text.indexOf('I ClassA') > -1);

  // ── تمام‌روز + اسکیپ + تاشدن ──
  const d1 = W('addDaysISO(todayISO(),5)').replace(/-/g, '');
  const d1n = W('addDaysISO(todayISO(),6)').replace(/-/g, '');
  chk('T3 all-day DTSTART/DTEND', pack.text.indexOf('DTSTART;VALUE=DATE:' + d1) > -1 && pack.text.indexOf('DTEND;VALUE=DATE:' + d1n) > -1);
  chk('T4 escaping', pack.text.indexOf('جشن\\, مدرسه\\; بزرگ') > -1);
  const lines = pack.text.split('\r\n');
  const tooLong = lines.filter(l => bytes(l) > 75);
  const badCont = lines.filter((l, i) => i > 0 && l[0] === ' ' && bytes(l) > 75);
  chk('T5a fold: no line >75 bytes', tooLong.length === 0, tooLong.slice(0, 2).join('|').slice(0, 120));
  chk('T5b fold: continuation sane', badCont.length === 0);
  chk('T5c long title folded', lines.some(l => l[0] === ' '));

  // ── پایداری UID ──
  const pack2 = JSON.parse(W('JSON.stringify(icsBuild())'));
  const uids = (t) => (t.match(/UID:[^\r\n]+/g) || []).sort().join(',');
  chk('T6 UID stable', uids(pack.text) === uids(pack2.text));

  // ── دامنهٔ نقش‌ها ──
  as(S.par);
  const pP = JSON.parse(W('JSON.stringify(icsBuild())'));
  chk('T7a parent sees kid exam', pP.text.indexOf('payesh-exam-' + S.eA + '@') > -1);
  chk('T7b parent not other class', pP.text.indexOf('payesh-exam-' + S.eB + '@') === -1);
  as(S.mgr);
  const pM = JSON.parse(W('JSON.stringify(icsBuild())'));
  chk('T8 manager sees all', pM.text.indexOf('payesh-exam-' + S.eA + '@') > -1 && pM.text.indexOf('payesh-exam-' + S.eB + '@') > -1);
  as(S.drv);
  const pD = JSON.parse(W('JSON.stringify(icsBuild())'));
  chk('T9 driver: calendar only, no exams', pD.text.indexOf('payesh-cal-') > -1 && pD.text.indexOf('payesh-exam-') === -1);

  // ── گذشته حذف ──
  chk('T10 past excluded', pack.text.indexOf('payesh-exam-' + S.ePast + '@') === -1 && pM.text.indexOf('payesh-cal-' + S.r3 + '@') === -1);

  // ── نام فایل ──
  chk('T11 filename', pack.filename === 'payesh_calendar_' + S.sid + '_' + T + '.ics', pack.filename);

  // ── مسیر دانلود واقعی (Blob) ──
  as(S.sa);
  W(`(function(){
    window.__blob=null; window.__dl=null;
    URL.createObjectURL=function(b){window.__blob=b;return 'blob:fake';};
    URL.revokeObjectURL=function(){};
    var _create=document.createElement.bind(document);
    document.createElement=function(tag){var el=_create(tag);
      if(String(tag).toLowerCase()==='a'){setTimeout(function(){window.__dl=el.download;},0);}return el;};
  })()`);
  W('F7_ACTIONS["ics-download"](null,null);');
  await sleep(100);
  W(`(function(){window.__blobText=null;var fr=new FileReader();
    fr.onload=function(){window.__blobText=fr.result;};fr.readAsText(window.__blob);})()`);
  for (let i = 0; i < 20 && W('window.__blobText') === null; i++) await sleep(50);
  const blobText = W('window.__blobText');
  const expectText = W('icsBuild().text');
  /* DTSTAMP مهرِ لحظهٔ ساخت است (دقتِ ثانیه)؛ بلاب در لحظهٔ کلیک ساخته می‌شود
     و متنِ انتظار بعد از خواندن — اگر از مرزِ ثانیه بگذرند متفاوت‌اند.
     پس فقط خطِ DTSTAMP را نرمال می‌کنیم؛ بقیهٔ محتوا باید مو‌به‌مو یکی باشد. */
  const noStamp = (t) => String(t == null ? '' : t).replace(/DTSTAMP:\d{8}T\d{6}Z\r?\n/g, '');
  chk('T12a blob content = ics text', noStamp(blobText) === noStamp(expectText));
  chk('T12b anchor filename', W('window.__dl') === pack.filename, String(W('window.__dl')));

  // ── دکمه در صفحه ──
  chk('T13 button on calendar page', W('viewCalendar().indexOf("data-act=\\"ics-download\\"")') > -1);

  console.log('ics: ' + okc + ' pass / ' + failc + ' fail');
  if (failc) { console.log('FAILURES:'); fails.forEach(f => console.log(' - ' + f)); }
  try { dom.window.close(); } catch (e) {}
  process.exit(failc ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
