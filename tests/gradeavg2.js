#!/usr/bin/env node
/**
 * تست‌های مقایسهٔ نمره با میانگین کلاس (بند ۴.۹)
 *  - classScoreContext: میانگینِ ناشناس (avg/n/students) برای هر
 *    (درس، نوبت، نوع) — فقط وقتی ≥۲ دانش‌آموزِ عضو نمره دارند
 *  - بدونِ نام/شناسه (فقط عدد)
 *  - نمایِ پرونده (مدیر/دبیر) و پنلِ ولی: بجِ «· کلاس: X.XX»
 *  - ردیفی که فقط یک نفر نمره دارد بج نمی‌گیرد
 *
 * اجرا:  node tests/gradeavg2.js   (نیازمند jsdom)
 */
const fs = require('fs');
const path = require('path');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — تست رد شد.  (npm i --no-save jsdom)'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
let __seq = Promise.resolve();
function test(name, fn) {
  const p = __seq.then(() => new Promise((resolve) => {
    let q;
    try { q = fn(); }
    catch (e) { fail++; console.log(`  ❌ ${name}\n     ${e.message}`); resolve(); return; }
    Promise.resolve(q).then(
      () => { pass++; console.log(`  ✅ ${name}`); },
      (e) => { fail++; console.log(`  ❌ ${name}\n     ${e.message}`); }
    ).then(resolve);
  }));
  __seq = p;
}
const assert = (c, m) => { if (!c) throw new Error(m || 'شرط برقرار نیست'); };

const consoleErrors = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost/',
  virtualConsole: new (require('jsdom').VirtualConsole)()
    .on('jsdomError', (e) => consoleErrors.push(e.message))
    .on('error', (m) => consoleErrors.push(String(m))),
});
const win = dom.window;
const W = (expr) => win.eval(expr);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

main().catch((e) => { console.error(e); process.exit(1); });

async function main() {
await sleep(400);
console.log('\n▸ مقایسهٔ نمره با میانگین کلاس (بند ۴.۹)');

test('G0 بوت بدون خطا', () => {
  assert(consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
});

/* زمینه: کلاسی با ≥۲ دانش‌آموزِ دارای نمره در یک (درس، نوبت، نوع) +
   ترجیحاً یک گروهِ تک‌نفره (برای تستِ «بدون بج») */
const ctx = W(`(function(){
  var cls=db.classes[0];
  var best=null, single=null;
  db.classes.forEach(function(c){
    var grp=Object.create(null);
    db.grades.forEach(function(g){
      if(!c || (function(){var m=classSubjectMembers(c.id, g.subject_id);return m.some(function(u){return u.id===g.student_id;});})()) {
        var k=g.subject_id+'|'+g.term+'|'+g.exam_type;
        if(!grp[k]) grp[k]={k:k,ids:[]};
        if(grp[k].ids.indexOf(g.student_id)<0) grp[k].ids.push(g.student_id);
      }
    });
    Object.keys(grp).forEach(function(k){
      var n=grp[k].ids.length;
      if(n>=2 && (!best || n>best.n)) best={cid:c.id, k:grp[k].k, n:n, first:grp[k].ids[0], second:grp[k].ids[1]};
      if(n===1 && !single) single={cid:c.id, k:grp[k].k, first:grp[k].ids[0]};
    });
  });
  if(!best) return null;
  var mgr=db.users.find(function(u){var c=byId('classes',best.cid);return u.role==='manager'&&u.school_id===c.school_id&&u.active;});
  var pl=db.parent_links.find(function(l){return l.student_id===best.first;});
  return {cid:best.cid,k:best.k,n:best.n,st:best.first,st2:best.second,
          mgr:mgr?mgr.id:0, parent:pl?pl.parent_id:0,
          single:single};
})()`);
assert(ctx, 'زمینهٔ دمو (کلاس با ≥۲ نمرهٔ هم‌درس) پیدا نشد');

test('G1 واحدها: میانگین درست + آستانهٔ ۲ نفر', () => {
  const got = W(`(function(){
    var c=classScoreContext(${ctx.cid});
    var e=c[${JSON.stringify(ctx.k)}];
    if(!e) return null;
    return {avg:e.avg,n:e.n,students:e.students};
  })()`);
  assert(got, 'میانگین برای گروهِ دواندازهٔ نمونه نیست');
  const exp = W(`(function(){
    var s=0,n=0;
    db.grades.forEach(function(g){
      if(g.subject_id+'|'+g.term+'|'+g.exam_type!==${JSON.stringify(ctx.k)}) return;
      var m=classSubjectMembers(${ctx.cid},g.subject_id);
      if(!m.some(function(u){return u.id===g.student_id;})) return;
      s+=g.score;n++;
    });
    return n?s/n:0;
  })()`);
  assert(Math.abs(got.avg - exp) < 0.01, 'میانگین درست محاسبه نشد (گرفت: ' + got.avg + '، انتظار: ' + exp + ')');
  assert(got.students >= 2, 'شمارهٔ دانش‌آموزان < ۲');
  /* گروهِ تک‌نفره نباید وجود داشته باشد */
  if(ctx.single){
    const s2 = W(`classScoreContext(${ctx.single.cid})[${JSON.stringify(ctx.single.k)}]`);
    assert(!s2, 'میانگینِ تک‌نفره تولید شد — آستانهٔ ۲ نفر شکسته شد');
  }
});

test('G2 ناشناسی: فقط عدد — نه نام، نه شناسه', () => {
  const keys = W(`Object.keys(classScoreContext(${ctx.cid})[${JSON.stringify(ctx.k)}])`);
  assert(JSON.stringify(keys.sort()) === JSON.stringify(['avg','n','students']),
    'کلیدهای ورودی فقط avg/n/students باید باشند (گرفت: ' + JSON.stringify(keys) + ')');
  const raw = W(`JSON.stringify(classScoreContext(${ctx.cid}))`);
  const names = W(`db.users.filter(function(u){return u.full_name;}).map(function(u){return u.full_name;})`);
  names.forEach((nm) => assert(raw.indexOf(nm) === -1, 'نامِ «' + nm + '» در خروجیِ ناشناس است!'));
});

const BADGE = `(function(){var r=document.getElementById('root').innerHTML;return r.indexOf('· کلاس:')>-1;})()`;
const BADGE_VAL = (v) => `(function(){var r=document.getElementById('root').innerHTML;var i=r.indexOf('· کلاس:');return i>-1&&r.indexOf(${JSON.stringify(v)},i)>-1;})()`;

test('G3 نمایِ پرونده (مدیر): بجِ میانگین کنار نمره', () => {
  W(`(function(){
    S.user=byId('users',${ctx.mgr});S.persona=null;S.boss=null;
    S.child=${ctx.st};S.filters={};S.route='record';S.tab='grades';render();
  })()`);
  assert(W(BADGE), 'بجِ «· کلاس:» در تبِ نمرات نیست');
  const avgTxt = W(`fa(classScoreContext(${ctx.cid})[${JSON.stringify(ctx.k)}].avg.toFixed(2))`);
  assert(W(BADGE_VAL(avgTxt)), 'میانگینِ درست (' + avgTxt + ') در بج نیست');
});

test('G4 پنلِ ولی: بجِ میانگین برای فرزند', () => {
  if(!ctx.parent){ console.log('     (ولیِ نمونه نیست — رد می‌شود)'); return; }
  W(`(function(){
    S.user=byId('users',${ctx.parent});S.persona=null;S.boss=null;
    S.child=${ctx.st};S.filters={};S.route='children';S.tab='grades';render();
  })()`);
  assert(W(BADGE), 'ولی نباید بجِ میانگین را ببیند (یا تبِ نمرات رندر نشد)');
});

test('G5 دانش‌آموزِ گروهِ تک‌نفره: بج نمی‌گیرد', () => {
  if(!ctx.single){ console.log('     (گروهِ تک‌نفرهٔ نمونه نیست — رد می‌شود)'); return; }
  const s2 = W(`(function(){
    var c=byId('classes',${ctx.single.cid});
    var m=db.users.find(function(u){return u.role==='manager'&&u.school_id===c.school_id&&u.active;});
    return m?m.id:0;
  })()`);
  if(!s2){ console.log('     (مدیرِ آن مدرسه نیست — رد می‌شود)'); return; }
  W(`(function(){
    S.user=byId('users',${s2});S.persona=null;S.boss=null;
    S.child=${ctx.single.first};S.filters={};S.route='record';S.tab='grades';render();
  })()`);
  /* فقط برای آن درس نباید بجِ کلاس باشد */
  const anyBadge = W(`(function(){var r=document.getElementById('root').innerHTML;return r.indexOf('· کلاس:')>-1;})()`);
  if(anyBadge){
    /* اگر همان دانش‌آموز در درسِ دیگرِ کلاسش هم گروهِ دواندازه دارد، بجِ آن درس مجاز است؛
       پس دقیق‌تر: بجِ درسِ تک‌نفره باید نباشد — بج‌ها را با متنِ درس مقایسه می‌کنیم. */
    const k = W(`(function(){var p=${JSON.stringify(ctx.single.k)}.split('|');var s=byId('subjects',Number(p[0]));return s?s.name:'';})()`);
    const lineHas = W(`(function(){
      var r=document.getElementById('root').innerHTML;
      var i=r.indexOf(${JSON.stringify(k)});
      return i>-1 && r.indexOf('· کلاس:',i)>-1 && r.indexOf('· کلاس:',i) - i < 200;
    })()`);
    assert(!lineHas, 'درسِ تک‌نفره بجِ میانگینِ کلاس گرفت');
  }
});

test('G6 گروهِ تک‌نفرهٔ مصنوعی: میانگین نمی‌سازد (آستانهٔ ۲)', () => {
  const skey = W(`Object.keys(classScoreContext(${ctx.cid}))[0].split('|')[0]`);
  const kNew = skey + '|term-تست|exam';
  const before = W(`db.grades.length`);
  W(`(function(){
    db.grades.push({id:99999001,student_id:${ctx.st2},class_id:${ctx.cid},subject_id:Number(${JSON.stringify(skey)}),term:'term-تست',exam_type:'exam',score:15});
  })()`);
  const hasNew = W(`!!classScoreContext(${ctx.cid})[${JSON.stringify(kNew)}]`);
  assert(!hasNew, 'گروهِ تک‌نفرهٔ مصنوعی میانگین ساخت — آستانهٔ ۲ نفر شکست');
  W(`db.grades.splice(${before-1},1)`);
  assert(W(`db.grades.length`) === before, 'ردیفِ مصنوعی پاک نشد');
});

await sleep(100);
console.log('\n────────────────────────────────────────────────────');
console.log(`gradeavg2 (مقایسهٔ نمره/میانگین): ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
if (fail) process.exit(1);
process.exit(0);
}
