#!/usr/bin/env node
/* E.6 فرناز: یادداشت شخصی ولی — اجرا: node tests/pnote.js */
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
  console.log('E.6 — parent note suite');
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
    var cls=insert('classes',{school_id:sid,name:'N Class'});
    var mkU=function(r,n,u){return insert('users',{school_id:sid,role:r,full_name:n,username:u,password:'1',active:1,created_at:todayISO()});};
    var s=mkU('student','N Kid','n_kid'), s2=mkU('student','N Kid2','n_kid2');
    var p1=mkU('parent','N Par1','n_par1'), p2=mkU('parent','N Par2','n_par2');
    insert('enrollments',{school_id:sid,class_id:cls.id,student_id:s.id});
    insert('enrollments',{school_id:sid,class_id:cls.id,student_id:s2.id});
    insert('parent_links',{school_id:sid,student_id:s.id,parent_id:p1.id});
    insert('parent_links',{school_id:sid,student_id:s.id,parent_id:p2.id});
    return {s:s.id,s2:s2.id,p1:p1.id,p2:p2.id,mgr:mgr.id};
  })())`));
  const as = (uid) => W('S.user=byId("users",' + uid + ');');
  const saveAs = (uid, sid, val) => {
    as(uid);
    /* برای تست منفی (کارت مخفی است) فقط textarea تزریق می‌شود و el مصنوعی است */
    W('document.body.innerHTML+=' + JSON.stringify('<div id="ntest">' + W('parentNoteCard(' + sid + ')') + '</div>') + ';');
    W('if(!document.querySelector("#ntest #note_text"))document.getElementById("ntest").innerHTML=\'<textarea id="note_text"></textarea>\';');
    W('document.querySelector("#ntest #note_text").value=' + JSON.stringify(val) + ';');
    W('(function(){var b=document.querySelector("#ntest [data-act=\\"pnote-save\\"]")||{dataset:{}};coreActions(null,b,' + sid + ',"pnote-save",' + sid + ')["pnote-save"]();document.getElementById("ntest").remove();})()');
  };

  // ── نمایش ──
  as(S.p1);
  W('S.child=' + S.s + ';');
  const v = W('viewChildren()');
  chk('T1 card in children view', v.indexOf('id="note_text"') > -1 && v.indexOf('هنوز یادداشتی ثبت نشده') > -1);

  // ── ذخیره از مسیر اکشن ──
  saveAs(S.p1, S.s, 'قرار دندان‌پزشکی پنجشنبه');
  const n1 = JSON.parse(W('JSON.stringify(noteGet(' + S.p1 + ',' + S.s + '))'));
  chk('T2a text saved', n1 && n1.text === 'قرار دندان‌پزشکی پنجشنبه');
  chk('T2b updated stamped', n1 && n1.updated === W('todayISO()'));
  as(S.p1);
  const c2 = W('parentNoteCard(' + S.s + ')');
  chk('T3 re-render shows text+date', c2.indexOf('قرار دندان‌پزشکی') > -1 && c2.indexOf('آخرین به‌روزرسانی') > -1);

  // ── حریم: والد دیگر نمی‌بیند ──
  as(S.p2);
  const cP2 = W('parentNoteCard(' + S.s + ')');
  chk('T4a other parent: card but empty', cP2.indexOf('id="note_text"') > -1 && cP2.indexOf('قرار دندان‌پزشکی') === -1);
  saveAs(S.p2, S.s, 'یادداشت والد دوم');
  chk('T4b notes coexist per-parent', W('noteGet(' + S.p1 + ',' + S.s + ').text') === 'قرار دندان‌پزشکی پنجشنبه'
    && W('noteGet(' + S.p2 + ',' + S.s + ').text') === 'یادداشت والد دوم');

  // ── حریم: بقیه هیچی ──
  as(S.s);
  chk('T5 student sees nothing', W('parentNoteCard(' + S.s + ')') === '');
  as(S.mgr);
  chk('T6 manager sees nothing', W('parentNoteCard(' + S.s + ')') === '');
  as(S.p1);
  chk('T7 unlinked child hidden', W('parentNoteCard(' + S.s2 + ')') === '');

  // ── سقف ۵۰۰ ──
  saveAs(S.p1, S.s, 'x'.repeat(501));
  chk('T8 over-500 rejected', W('noteGet(' + S.p1 + ',' + S.s + ').text') === 'قرار دندان‌پزشکی پنجشنبه');
  saveAs(S.p1, S.s, 'y'.repeat(500));
  chk('T9 exactly-500 accepted', W('noteGet(' + S.p1 + ',' + S.s + ').text') === 'y'.repeat(500));

  // ── پاک‌سازی با ذخیرهٔ خالی ──
  saveAs(S.p1, S.s, '   ');
  chk('T10 empty clears', W('noteGet(' + S.p1 + ',' + S.s + ')') === null);
  as(S.p1);
  chk('T10b empty message back', W('parentNoteCard(' + S.s + ')').indexOf('هنوز یادداشتی ثبت نشده') > -1);

  // ── XSS ──
  saveAs(S.p1, S.s, '<script>alert(1)</scr' + 'ipt>');
  as(S.p1);
  const cX = W('parentNoteCard(' + S.s + ')');
  chk('T11 xss escaped', cX.indexOf('<script>') === -1 && cX.indexOf('&lt;script&gt;') > -1);

  // ── گارد مالکیت در اکشن ──
  saveAs(S.p2, S.s2, 'نفوذ');
  chk('T12a unlinked save rejected', W('noteGet(' + S.p2 + ',' + S.s2 + ')') === null);
  saveAs(S.mgr, S.s, 'نفوذ مدیر');
  chk('T12b manager save rejected', W('JSON.stringify(noteGet(' + S.mgr + ',' + S.s + '))') === 'null'
    && W('noteGet(' + S.p1 + ',' + S.s + ').text').indexOf('نفوذ مدیر') === -1);

  // ── گیت نقش ──
  chk('T13a canAction parent', W('(function(){S.user=byId("users",' + S.p1 + ');return canAction("pnote-save");})()') === true);
  chk('T13b canAction manager blocked', W('(function(){S.user=byId("users",' + S.mgr + ');return canAction("pnote-save");})()') === false);

  // ── JSON خراب ──
  as(S.p1);
  W('Store.set(noteKey(' + S.p1 + ',' + S.s + '),"{oops");');
  chk('T14 corrupt json safe', W('noteGet(' + S.p1 + ',' + S.s + ')') === null
    && W('parentNoteCard(' + S.s + ')').indexOf('هنوز یادداشتی ثبت نشده') > -1);

  console.log('pnote: ' + okc + ' pass / ' + failc + ' fail');
  if (failc) { console.log('FAILURES:'); fails.forEach(f => console.log(' - ' + f)); }
  try { dom.window.close(); } catch (e) {}
  process.exit(failc ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
