#!/usr/bin/env node
/* E.5 فرناز: پاسخ سریع ولی به اعلان غیبت — اجرا: node tests/excuse.js */
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
  console.log('E.5 — excuse request suite');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
    virtualConsole: new VirtualConsole().on('jsdomError', () => {}).on('error', () => {}),
  });
  const win = dom.window;
  const W = (expr) => win.eval(expr);
  await sleep(2000);

  const ISO = '2026-09-08', ISO2 = '2026-09-07', ISO3 = '2026-09-06', ISO4 = '2026-09-05';
  const S = JSON.parse(W(`JSON.stringify((function(){
    var mgr=db.users.find(u=>u.role==="manager"&&u.school_id);
    S.user=mgr;
    var sid=mgr.school_id;
    var cls=insert('classes',{school_id:sid,name:'Q Class'});
    var mkU=function(r,n,u){return insert('users',{school_id:sid,role:r,full_name:n,username:u,password:'1',active:1,created_at:todayISO()});};
    var s=mkU('student','Q Kid','q_kid'), p=mkU('parent','Q Par','q_par'), p2=mkU('parent','Q Par2','q_par2');
    insert('enrollments',{school_id:sid,class_id:cls.id,student_id:s.id});
    insert('parent_links',{school_id:sid,student_id:s.id,parent_id:p.id});
    var mkA=function(dt,stt){return insert('attendance',{school_id:sid,class_id:cls.id,student_id:s.id,date:dt,status:stt});};
    var a1=mkA('${ISO}','absent'), a2=mkA('${ISO2}','absent'), a3=mkA('${ISO3}','excused'), a4=mkA('${ISO4}','absent');
    var mkN=function(uid,dt,ref){return insert('notifications',{user_id:uid,school_id:sid,type:'absence',title:'غیبت',body:'x',link:'children',ref:ref||null,read:0,created_at:dt});};
    var n1=mkN(p.id,'${ISO}','att_'+a1.id);
    var n2=mkN(p.id,'${ISO2}',null);
    var n3=mkN(p.id,'${ISO3}','att_'+a3.id);
    var n4=mkN(p.id,'${ISO4}','att_'+a4.id);
    insert('leaves',{school_id:sid,student_id:s.id,from_date:'${ISO4}',to_date:'${ISO4}',reason:'قبلاً',status:'pending',created_at:todayISO()});
    insert('notifications',{user_id:p.id,school_id:sid,type:'announcement',title:'اطلاعیه',body:'y',link:'announcements',read:0,created_at:'${ISO}'});
    return {s:s.id,p:p.id,p2:p2.id,mgr:mgr.id,a1:a1.id,a2:a2.id,a3:a3.id,a4:a4.id,n1:n1.id};
  })())`));
  const as = (uid) => W('S.user=byId("users",' + uid + ');');

  // ── دکمه کنار اعلان ──
  as(S.p);
  const v = W('viewNotifications()');
  chk('T1 button with att id (ref path)', v.indexOf('data-act="quick-excuse" data-id="' + S.a1 + '"') > -1);
  chk('T2 fallback resolution (no ref)', v.indexOf('data-act="quick-excuse" data-id="' + S.a2 + '"') > -1);
  chk('T3 excused: no button', v.indexOf('data-id="' + S.a3 + '"') === -1);
  chk('T4 pending: badge, no button', v.indexOf('در انتظار بررسی مدیر') > -1 && v.indexOf('data-id="' + S.a4 + '"') === -1);

  as(S.s);
  chk('T5 student: no excuse buttons', W('viewNotifications().indexOf("quick-excuse")') === -1);
  as(S.p2);
  chk('T6 other parent: no leak', W('viewNotifications().indexOf("quick-excuse")') === -1);

  // ── جریان کامل درخواست (ولی فقط درخواست، نه تغییر وضعیت) ──
  as(S.p);
  W('CF_ACTIONS["quick-excuse"](null,' + S.a1 + ');');
  chk('T7a modal opened', W('document.getElementById("qe_reason")!==null'));
  W('document.getElementById("qe_reason").value="مراجعه به پزشک";');
  W('CF_ACTIONS["qe-save"]();');
  chk('T7b leave pending created', W('db.leaves.filter(l=>l.student_id===' + S.s + '&&l.status==="pending"&&l.from_date==="' + ISO + '").length') === 1);
  chk('T7c status NOT changed by parent', W('byId("attendance",' + S.a1 + ').status') === 'absent');
  chk('T7d manager notified', W('db.notifications.filter(n=>n.user_id===' + S.mgr + '&&n.link==="leaves").length') >= 1);

  // ضدتکرار
  W('CF_ACTIONS["quick-excuse"](null,' + S.a1 + ');');
  W('document.getElementById("qe_reason").value="دوباره";');
  W('CF_ACTIONS["qe-save"]();');
  chk('T8 no duplicate request', W('db.leaves.filter(l=>l.student_id===' + S.s + '&&l.status==="pending"&&l.from_date==="' + ISO + '").length') === 1);

  // تأیید مدیر → موجه + اعلان به ولی
  as(S.mgr);
  const lv = W('db.leaves.filter(l=>l.student_id===' + S.s + '&&l.status==="pending"&&l.from_date==="' + ISO + '")[0].id');
  W('decideLeave(' + lv + ',"approved");');
  chk('T9a approved -> excused', W('byId("attendance",' + S.a1 + ').status') === 'excused');
  chk('T9b parent gets approval notif', W('db.notifications.filter(n=>n.user_id===' + S.p + '&&n.title.indexOf("تأیید شد")>-1).length') >= 1);

  // ساخت اعلان غیبت + ضدتکرار آن
  const A5 = W('insert("attendance",{school_id:S.user.school_id,class_id:db.classes.filter(c=>c.name==="Q Class")[0].id,student_id:' + S.s + ',date:"2026-09-04",status:"absent"}).id');
  W('absenceNotifFor(byId("attendance",' + A5 + '));');
  W('absenceNotifFor(byId("attendance",' + A5 + '));');
  chk('T10 notif created once with ref', W('db.notifications.filter(n=>n.ref==="att_' + A5 + '").length') === 1);

  // اعلان غیرغیبت دکمه ندارد (پوشش ضمنی در T1-T4، ولی صریح:)
  as(S.p);
  chk('T11 announcement untouched', W('viewNotifications().indexOf("اطلاعیه")') > -1);

  // گیت ولی (مستقیم): حتی اگر اعلان غیبت به خود دانش‌آموز برسد، دکمه نبیند
  W('insert("notifications",{user_id:' + S.s + ',school_id:S.user.school_id,type:"absence",title:"غیبت",body:"x",link:"record",ref:"att_' + S.a2 + '",read:0,created_at:"' + ISO2 + '"});');
  as(S.s);
  chk('T12 gate tested directly', W('viewNotifications().indexOf("quick-excuse")') === -1);

  console.log('excuse: ' + okc + ' pass / ' + failc + ' fail');
  if (failc) { console.log('FAILURES:'); fails.forEach(f => console.log(' - ' + f)); }
  try { dom.window.close(); } catch (e) {}
  process.exit(failc ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
