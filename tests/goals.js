#!/usr/bin/env node
/* E.3 فرناز: هدف‌گذاری شخصی نمره — اجرا: node tests/goals.js */
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
  console.log('E.3 — grade goals suite');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
    virtualConsole: new VirtualConsole().on('jsdomError', () => {}).on('error', () => {}),
  });
  const win = dom.window;
  const W = (expr) => win.eval(expr);
  await sleep(2000);

  const S = JSON.parse(W(`JSON.stringify((function(){
    var mgr=db.users.find(u=>u.role==="manager"&&u.school_id);
    S.user=mgr;
    var sid=mgr.school_id;
    var cls=insert('classes',{school_id:sid,name:'G Class'});
    var mkU=function(r,n,u){return insert('users',{school_id:sid,role:r,full_name:n,username:u,password:'1',active:1,created_at:todayISO()});};
    var a=mkU('student','G KidA','g_kid_a'), b=mkU('student','G KidB','g_kid_b'), p=mkU('parent','G Par','g_par');
    insert('enrollments',{school_id:sid,class_id:cls.id,student_id:a.id});
    insert('enrollments',{school_id:sid,class_id:cls.id,student_id:b.id});
    insert('parent_links',{school_id:sid,student_id:a.id,parent_id:p.id});
    var math=insert('subjects',{school_id:sid,name:'GRiazi'});
    var sci=insert('subjects',{school_id:sid,name:'GOloom'});
    var g=function(sub,sc,at){insert('grades',{school_id:sid,class_id:cls.id,student_id:a.id,subject_id:sub,score:sc,max_score:20,term:'term1',exam_type:'quiz',created_at:at});};
    g(math.id,14,'2026-09-01'); g(math.id,16,'2026-09-05');
    g(sci.id,12,'2026-09-02'); g(sci.id,15,'2026-09-06');
    return {a:a.id,b:b.id,p:p.id,mgr:mgr.id,math:math.id,sci:sci.id};
  })())`));
  const as = (uid) => W('S.user=byId("users",' + uid + ');');
  const card = (sid, sub) => W('S.trendSub=' + sub + ';gradeTrendCard(' + sid + ');');

  // ── بدون هدف: پیام + ویرایشگر برای خود ──
  as(S.a);
  const c1 = card(S.a, S.math);
  chk('T1a empty-goal message', c1.indexOf('هنوز هدفی تعیین نشده') > -1);
  chk('T1b editor rendered', c1.indexOf('id="goal_val"') > -1 && c1.indexOf('data-act="goal-save"') > -1);

  // ── ثبت از مسیر اکشن ──
  W('document.body.innerHTML+=' + JSON.stringify('<div id="gtest">' + c1 + '</div>') + ';');
  W('document.querySelector("#gtest #goal_val").value="18";');
  W('(function(){var btn=document.querySelector("#gtest [data-act=\\"goal-save\\"]");coreActions(null,btn,' + S.a + ',"goal-save",' + S.a + ')["goal-save"]();})()');
  chk('T2 goal saved via action', W('goalGet(' + S.a + ',' + S.math + ')') === 18);

  // ── خط مرجع + لجند ──
  const c2 = card(S.a, S.math);
  chk('T3a goal legend', c2.indexOf('🎯 هدف: <b>') > -1 && c2.indexOf(W('fa(18)')) > -1);
  chk('T3b goal ticks on every column', (c2.match(/goal-tick/g) || []).length === 2, 'ticks=' + ((c2.match(/goal-tick/g) || []).length));
  chk('T3c tick height = goal/20', c2.indexOf('bottom:90.0%') > -1);

  // ── دسترسی ──
  as(S.p);
  const cP = card(S.a, S.math);
  chk('T4 parent sees editor+ticks', cP.indexOf('id="goal_val"') > -1 && cP.indexOf('goal-tick') > -1);
  as(S.mgr);
  const cM = card(S.a, S.math);
  chk('T5a manager: no editor', cM.indexOf('goal_val') === -1 && cM.indexOf('goal-save') === -1);
  chk('T5b manager: no ticks/legend', cM.indexOf('goal-tick') === -1 && cM.indexOf('🎯 هدف') === -1);
  chk('T5c manager: no empty-msg', cM.indexOf('هنوز هدفی تعیین نشده') === -1);
  as(S.b);
  const cB = card(S.a, S.math);
  chk('T6 other student: hidden', cB.indexOf('goal-tick') === -1 && cB.indexOf('goal_val') === -1);

  // ── گارد مالکیت در اکشن ──
  as(S.b);
  W('document.querySelector("#gtest #goal_val").value="10";');
  W('(function(){var btn=document.querySelector("#gtest [data-act=\\"goal-save\\"]");coreActions(null,btn,' + S.a + ',"goal-save",' + S.a + ')["goal-save"]();})()');
  chk('T7 ownership guard', W('goalGet(' + S.a + ',' + S.math + ')') === 18);

  // ── اعتبارسنجی ──
  as(S.a);
  ['abc', '25', '-3', ''].forEach(v => {
    W('document.querySelector("#gtest #goal_val").value=' + JSON.stringify(v) + ';');
    W('(function(){var btn=document.querySelector("#gtest [data-act=\\"goal-save\\"]");coreActions(null,btn,' + S.a + ',"goal-save",' + S.a + ')["goal-save"]();})()');
  });
  chk('T8 invalid rejected', W('goalGet(' + S.a + ',' + S.math + ')') === 18);

  // ── ارقام فارسی ──
  W('document.querySelector("#gtest #goal_val").value="۱۵";');
  W('(function(){var btn=document.querySelector("#gtest [data-act=\\"goal-save\\"]");coreActions(null,btn,' + S.a + ',"goal-save",' + S.a + ')["goal-save"]();})()');
  chk('T9 persian digits accepted', W('goalGet(' + S.a + ',' + S.math + ')') === 15);

  // ── تک‌درس / همه ──
  const cAll = card(S.a, 0);
  chk('T10 all-subjects: no goal UI', cAll.indexOf('goal-tick') === -1 && cAll.indexOf('goal_val') === -1);
  const cSci = card(S.a, S.sci);
  chk('T11 per-subject independence', cSci.indexOf('هنوز هدفی تعیین نشده') > -1 && cSci.indexOf('goal-tick') === -1);

  console.log('goals: ' + okc + ' pass / ' + failc + ' fail');
  if (failc) { console.log('FAILURES:'); fails.forEach(f => console.log(' - ' + f)); }
  try { dom.window.close(); } catch (e) {}
  process.exit(failc ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
