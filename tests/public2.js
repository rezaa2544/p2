#!/usr/bin/env node
/**
 * تست‌های C.3 فرناز — گزارش عمومی مدرسه (بدون ورود)
 *  - نمایش در صفحهٔ ورود: نام، آمار تجمیعی، جلسه‌ها به‌تفکیک نوع، بوم
 *  - تعویض مدرسه، عدم نشت دادهٔ شخصی، نبود بخش در حالت ورودکرده، فالبک
 *
 * اجرا:  node tests/public2.js   (نیازمند jsdom)
 */
const fs = require('fs');
const path = require('path');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — تست رد شد.  (npm i --no-save jsdom)'); process.exit(1); }

const ROOT = path.join(__dirname, '..');
// hardening: rebuild base index.html (a previously crashed mutation suite may have left a mutated build)
try { require('child_process').execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' }); } catch (e) {}
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
const asOut = () => W(`(function(){
  S.user=null;S.persona=null;S.boss=null;S.filters={};S.route='dashboard';S.tab='';render();
})()`);
const pubText = () => W(`document.querySelector('#pub-report').textContent`);
const pubHTML = () => W(`document.querySelector('#pub-report').innerHTML`);

main().catch((e) => { console.error(e); process.exit(1); });

async function main() {
await sleep(400);
console.log('\n▸ گزارش عمومی مدرسه (C.3 فرناز)');

test('P0 بدون ورود: فرم ورود + گزارش عمومی، بدون خطا', () => {
  asOut();
  assert(consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
  assert(W(`document.getElementById('lnid')?1:0`) === 1, 'فرم ورود نیست!');
  assert(W(`document.getElementById('pub-report')?1:0`) === 1, 'گزارش عمومی نیست!');
  assert(W(`document.querySelector('[data-f="pubschool"]')?1:0`) === 1, 'انتخاب مدرسه نیست!');
});

test('P1 آمار تجمیعی مدرسهٔ پیش‌فرض درست است', () => {
  asOut();
  const sid = W(`byId('schools',Number(document.querySelector('[data-f="pubschool"]').value)).id`);
  const exp = W(`(function(){
    var us=db.users.filter(function(u){return u.school_id===${sid};});
    return {s:us.filter(function(u){return u.role==='student';}).length,
            t:us.filter(function(u){return u.role==='teacher';}).length,
            c:db.classes.filter(function(x){return x.school_id===${sid};}).length};
  })()`);
  assert(W(`document.querySelector('#pub-report h4').textContent`) === W(`byId('schools',${sid}).name`), 'نام مدرسه درست نیست');
  const t = pubText();
  assert(t.includes(W(`fa(${exp.s})`)) && t.includes(W(`fa(${exp.t})`)) && t.includes(W(`fa(${exp.c})`)), 'آمار با داده نمی‌خواند: ' + JSON.stringify(exp));
});

test('P2 تعویض مدرسه گزارش را عوض می‌کند', () => {
  asOut();
  W(`(function(){var s=document.querySelector('[data-f="pubschool"]');s.value='2';
    s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  assert(W(`document.querySelector('#pub-report h4').textContent`) === W(`byId('schools',2).name`), 'تعویض به مدرسهٔ ۲ کار نکرد');
});

test('P3 جلسه‌ها به‌تفکیک نوع + آخرین تاریخ (بایگانی‌شده حساب نیست)', () => {
  asOut();
  W(`S.filters.pubschool='2';render()`);
  W(`insert('assoc_minutes',{school_id:2,meeting_type:'teachers',meeting_date:'2026-09-01',attendees:'محرمانه-حاضرین',resolutions:'محرمانه-رزولوشن',archived:0,created_at:'2026-09-01'})`);
  W(`insert('assoc_minutes',{school_id:2,meeting_type:'teachers',meeting_date:'2026-09-05',attendees:'x',resolutions:'y',archived:0,created_at:'2026-09-05'})`);
  W(`insert('assoc_minutes',{school_id:2,meeting_type:'teachers',meeting_date:'2026-08-01',attendees:'x',resolutions:'y',archived:1,created_at:'2026-08-01'})`);
  W(`insert('assoc_minutes',{school_id:2,archived:0,meeting_date:'2026-09-03',attendees:'x',resolutions:'y',created_at:'2026-09-03'})`);
  W(`render()`);
  const h = pubHTML();
  assert(h.includes(`<b>${W(`fa(2)`)}</b><span>شورای معلمان</span>`), 'شمارش شورای معلمان باید ۲ باشد (بایگانی نه)');
  assert(h.includes('آخرین: ' + W(`jalali('2026-09-05')`)), 'آخرین تاریخ شورای معلمان درست نیست');
  const assocN = W(`db.assoc_minutes.filter(function(m){return m.school_id===2&&!m.archived&&!m.meeting_type;}).length`);
  assert(h.includes(`<b>${W(`fa(${assocN})`)}</b><span>انجمن اولیا و مربیان</span>`), 'شمارش انجمن درست نیست');
});

test('P4 بومِ مدرسه نمایش داده می‌شود (و مدرسهٔ بی‌بوم، بخش ندارد)', () => {
  asOut();
  W(`update('schools',2,{boom_goals:'هدف عمومی نمایشی',public_goals:1})`);
  W(`S.filters.pubschool='2';render()`);
  assert(pubText().includes('هدف عمومی نمایشی'), 'بوم مدرسهٔ ۲ نمایش داده نشد');
  W(`S.filters.pubschool='1';render()`);
  assert(!pubText().includes('برنامه ویژه'), 'مدرسهٔ بی‌بوم نباید بخش بوم داشته باشد');
  W(`S.filters.pubschool='2';render()`);
});

test('P5 هیچ دادهٔ شخصی نشت نمی‌کند', () => {
  asOut();
  W(`S.filters.pubschool='2';render()`);
  const t = pubText();
  const stu = W(`db.users.find(function(u){return u.role==='student'&&u.school_id===2;}).full_name`);
  const tea = W(`db.users.find(function(u){return u.role==='teacher'&&u.school_id===2;}).full_name`);
  assert(!t.includes(stu), 'نام دانش‌آموز نشت کرد!');
  assert(!t.includes(tea), 'نام دبیر نشت کرد!');
  assert(!t.includes('محرمانه-رزولوشن'), 'متن مصوبه نشت کرد!');
  assert(!t.includes('محرمانه-حاضرین'), 'فهرست حاضرین نشت کرد!');
});

test('P6 در حالت ورودکرده گزارش عمومی نیست', () => {
  W(`(function(){S.user=db.users.find(function(u){return u.role==='manager'&&u.school_id===1;});
    S.filters={};S.route='dashboard';render();})()`);
  assert(W(`document.getElementById('pub-report')?1:0`) === 0, 'گزارش عمومی نباید داخل پنل باشد!');
});

test('P7 شناسهٔ نامعتبر/غیرفعال → بازگشت به اول، بدون خرابی', () => {
  asOut();
  W(`S.filters.pubschool='999';render()`);
  assert(W(`document.getElementById('pub-report')?1:0`) === 1, 'با شناسهٔ نامعتبر خراب شد!');
  assert(W(`document.querySelector('#pub-report h4').textContent`) === W(`byId('schools',1).name`), 'فالبک باید مدرسهٔ ۱ باشد');
  W(`S.filters.pubschool='6';render()`);
  assert(W(`document.querySelector('#pub-report h4').textContent`) === W(`byId('schools',1).name`), 'مدرسهٔ غیرفعال نباید عمومی شود');
});

await __seq;
const total = pass + fail;
console.log(`گزارش عمومی: ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
dom.window.close();
process.exit(fail ? 1 : 0);
}
