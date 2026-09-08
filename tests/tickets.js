#!/usr/bin/env node
/* G.2 فرناز: تیکت پشتیبانی — اجرا: node tests/tickets.js */
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
  console.log('G.2 — support tickets suite');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
    virtualConsole: new VirtualConsole().on('jsdomError', () => {}).on('error', () => {}),
  });
  const win = dom.window;
  const W = (expr) => win.eval(expr);
  await sleep(2000);

  const S = JSON.parse(W(`JSON.stringify((function(){
    var mgrs=db.users.filter(u=>u.role==="manager"&&u.school_id);
    var mA=mgrs[0], mB=mgrs.filter(u=>u.school_id!==mA.school_id)[0];
    S.user=mA;
    var tA=insert('support_tickets',{school_id:mA.school_id,title:'TK-A مشکل ورود',description:'الف',priority:'high',status:'open',created_at:todayISO(),updated_at:todayISO()});
    var tB=insert('support_tickets',{school_id:mB.school_id,title:'TK-B گزارش',description:'ب',priority:'low',status:'review',created_at:todayISO(),updated_at:todayISO()});
    return {mA:mA.id,mB:mB.id,tA:tA.id,tB:tB.id,
      sup:db.users.filter(u=>u.role==="superadmin")[0].id,
      tea:db.users.filter(u=>u.role==="teacher"&&u.school_id===mA.school_id)[0].id};
  })())`));
  const as = (uid) => W('S.user=byId("users",' + uid + ');');
  const A = (act, el, id) => W('adminActions(null,' + el + ',' + id + ',"' + act + '",' + id + ')["' + act + '"]();');

  // ── دامنهٔ دید ──
  as(S.mA);
  const vA = W('viewTickets()');
  chk('T1a manager sees own', vA.indexOf('TK-A مشکل ورود') > -1);
  chk('T1b manager not other school', vA.indexOf('TK-B گزارش') === -1);
  chk('T1c new-button for manager', vA.indexOf('data-act="ticket-new"') > -1);
  as(S.mB);
  chk('T2 manager B mirror', W('viewTickets()').indexOf('TK-A مشکل ورود') === -1
    && W('viewTickets()').indexOf('TK-B گزارش') > -1);
  as(S.sup);
  const vS = W('viewTickets()');
  chk('T3a super sees all', vS.indexOf('TK-A مشکل ورود') > -1 && vS.indexOf('TK-B گزارش') > -1);
  chk('T3b status buttons', vS.indexOf('data-act="ticket-status"') > -1 && vS.indexOf('data-s="closed"') > -1);
  chk('T3c no new-button for super', vS.indexOf('data-act="ticket-new"') === -1);
  as(S.tea);
  chk('T4 teacher blocked', W('viewTickets()').indexOf('دسترسی ندارید') > -1);

  // ── ثبت ──
  as(S.mA);
  A('ticket-new', 'null', 'null');
  chk('T5 modal opened', W('document.getElementById("tk_title")!==null'));
  W('document.getElementById("tk_title").value="TK-A2 چاپ";document.getElementById("tk_desc").value="شرح";document.getElementById("tk_pri").value="med";');
  A('ticket-save', 'null', 'null');
  const c1 = W('db.support_tickets.filter(t=>t.title==="TK-A2 چاپ").length');
  chk('T6a created', c1 === 1);
  chk('T6b defaults', W('db.support_tickets.filter(t=>t.title==="TK-A2 چاپ")[0].status') === 'open'
    && W('db.support_tickets.filter(t=>t.title==="TK-A2 چاپ")[0].school_id') === W('S.user.school_id'));

  // اعتبارسنجی
  const n0 = W('db.support_tickets.length');
  A('ticket-new', 'null', 'null');
  W('document.getElementById("tk_title").value="";');
  A('ticket-save', 'null', 'null');
  chk('T7 empty title rejected', W('db.support_tickets.length') === n0);
  A('ticket-new', 'null', 'null');
  W('document.getElementById("tk_title").value="بد";document.getElementById("tk_pri").value="urgent";');
  try { A('ticket-save', 'null', 'null'); } catch (e) {}
  chk('T8 bad priority rejected', W('db.support_tickets.length') === n0);

  // ── تغییر وضعیت (سوپرادمین) ──
  as(S.sup);
  W('update("support_tickets",' + S.tA + ',{updated_at:"2026-01-01"});'); // کهنه‌سازی تا bump دیده شود
  W('adminActions(null,{dataset:{s:"closed"}},' + S.tA + ',"ticket-status",' + S.tA + ')["ticket-status"]();');
  chk('T9a status changed', W('byId("support_tickets",' + S.tA + ').status') === 'closed');
  chk('T9b updated bumped', W('byId("support_tickets",' + S.tA + ').updated_at') === W('todayISO()'));
  try { W('adminActions(null,{dataset:{s:"bogus"}},' + S.tA + ',"ticket-status",' + S.tA + ')["ticket-status"]();'); } catch (e) {}
  chk('T10 bad status rejected', W('byId("support_tickets",' + S.tA + ').status') === 'closed');

  // ── گیت نقش ──
  chk('T11a save: manager yes', W('(function(){S.user=byId("users",' + S.mA + ');return canAction("ticket-save");})()') === true);
  chk('T11b save: teacher no', W('(function(){S.user=byId("users",' + S.tea + ');return canAction("ticket-save");})()') === false);
  chk('T11c status: super yes', W('(function(){S.user=byId("users",' + S.sup + ');return canAction("ticket-status");})()') === true);
  chk('T11d status: manager no', W('(function(){S.user=byId("users",' + S.mA + ');return canAction("ticket-status");})()') === false);

  console.log('tickets: ' + okc + ' pass / ' + failc + ' fail');
  if (failc) { console.log('FAILURES:'); fails.forEach(f => console.log(' - ' + f)); }
  try { dom.window.close(); } catch (e) {}
  process.exit(failc ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
