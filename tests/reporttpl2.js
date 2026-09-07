#!/usr/bin/env node
/**
 * دور ۷۹ بند ۸ — قالبِ قابل‌انتخابِ کارنامه (بند ۴.۳)
 *  کارنامهٔ حرفه‌ایِ قابل چاپ از قبل وجود داشت (report2 قفلش کرده)؛
 *  باقی‌مانده: «قالبِ قابل‌انتخاب». حالا:
 *   - reportCardCert(sid, term, tpl) — tpl: 'classic' (پیش‌فرض،
 *     خروجیِ بایت‌به‌بایتِ قدیمی) یا 'compact' (چیدمانِ دوستونه)
 *   - انتخابگر در ردیفِ چاپ (cert_tpl) + دکمهٔ واقعیِ چاپ کارنامه
 *  T1 classic بایت‌به‌بایت دست‌نخورده (ضدِ رگرسیون)
 *  T2 compact: همان داده، بدنهٔ متفاوت، مقادیرِ یکسان
 *  T3 compact در برابرِ HTMLِ پرمخاطره امن است (esc)
 *  T4 بدونِ نمره: هر دو قالب همان خطا را می‌دهند
 *  T5 UI سرتاسری: انتخابِ compact + کلیکِ دکمهٔ واقعی ⇒ پنجرهٔ چاپ
 *     بدنهٔ compact می‌گیرد (نه فراخوانیِ مستقیمِ تابع)
 *  T6 پاک‌سازی (آخرین تست زنجیر — درسِ دور ۷۹)
 *
 * اجرا:  node tests/reporttpl2.js   (نیاز: بیلدِ تازه)
 */
const fs = require('fs');
const path = require('path');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — تست رد شد.  (npm i --no-save jsdom)'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
// hardening: rebuild base index.html (a previously crashed mutation suite may have left a mutated build)
try { require('child_process').execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' }); } catch (e) {}
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const errors = [];
let __seq = Promise.resolve();
function test(name, fn) {
  const p = __seq.then(() => new Promise((resolve) => {
    let q;
    try { q = fn(); }
    catch (e) { fail++; errors.push(name + ': ' + e.message); console.log(`  ❌ ${name}\n     ${e.message}`); resolve(); return; }
    Promise.resolve(q).then(
      () => { pass++; console.log(`  ✅ ${name}`); },
      (e) => { fail++; errors.push(name + ': ' + e.message); console.log(`  ❌ ${name}\n     ${e.message}`); }
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
const W = (s) => win.eval(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

main().catch((e) => { console.error(e); process.exit(1); });

async function main() {
  /* صبر تا دمو آماده و پایدار شود (الگوی دور ۷۹: پایداریِ مرجعِ db) */
  const t0 = Date.now();
  let ref = null, stable = 0;
  while (Date.now() - t0 < 6000) {
    const cur = W(`(()=>{try{return (db&&db.users&&db.users.length)?db:null}catch(e){return null}})()`);
    if (cur && cur === ref) { stable++; if (stable >= 1) break; }
    else { ref = cur; stable = 0; }
    await sleep(100);
  }
  assert(ref !== null, 'دمو آماده نشد');

  /* سناریوی کنترل‌شده: کلاس با دو دانش‌آموز + یک درس (الگوی report2) */
  const ctx = W(`(function(){
    var cls = add('classes',{school_id:1,name:'تست قالب کارنامه',grade:'دهم'});
    var sA = add('users',{school_id:1,role:'student',full_name:'الف قالب',national_id:'9992002000001',phone:'09990002290',active:1,created_at:'2026-09-01'});
    var sB = add('users',{school_id:1,role:'student',full_name:'ب قالب',national_id:'9992002000002',phone:'09990002291',active:1,created_at:'2026-09-01'});
    add('enrollments',{school_id:1,class_id:cls.id,student_id:sA.id});
    add('enrollments',{school_id:1,class_id:cls.id,student_id:sB.id});
    var sub = db.subjects[0];
    add('grades',{school_id:1,student_id:sA.id,class_id:cls.id,subject_id:sub.id,term:'نوبت اول',exam_type:'پایانی',score:18,max_score:20,created_at:'2026-09-01'});
    add('grades',{school_id:1,student_id:sB.id,class_id:cls.id,subject_id:sub.id,term:'نوبت اول',exam_type:'پایانی',score:10,max_score:20,created_at:'2026-09-01'});
    return {cls:cls.id,sA:sA.id,sB:sB.id,sub:sub.id,subName:sub.name};
  })()`);
  assert(ctx && ctx.sA, 'سناریوی کنترل‌شده ساخته نشد');

  test('T0 بوت بدون خطا', async () => {
    await sleep(400);
    assert(consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
  });

  test('T1 classic بایت‌به‌بایت دست‌نخورده است (ضدِ رگرسیون)', () => {
    const a = W(`JSON.stringify(reportCardCert(${ctx.sA},'نوبت اول'))`);
    const b = W(`JSON.stringify(reportCardCert(${ctx.sA},'نوبت اول','classic'))`);
    assert(a === b, 'خروجیِ classic با حالتِ بدونِ پارامتر فرق کرد!');
  });

  test('T2 compact: همان داده، بدنهٔ متفاوت، مقادیرِ یکسان', () => {
    const c = W(`JSON.parse(JSON.stringify(reportCardCert(${ctx.sA},'نوبت اول')))`);
    const k = W(`JSON.parse(JSON.stringify(reportCardCert(${ctx.sA},'نوبت اول','compact')))`);
    assert(k.ok === true, 'compact ok نیست: ' + (k.msg || ''));
    assert(k.body !== c.body, 'بدنهٔ compact با classic یکی است (قالب جدا نیست!)');
    assert(k.body.indexOf('grid-template-columns:1fr 1fr') > -1, 'چیدمانِ دوستونه نیست');
    assert(k.body.indexOf('الف قالب') > -1, 'نام نیست');
    assert(k.body.indexOf('>' + ctx.subName + '<') > -1, 'درس نیست');
    /* مقادیرِ محاسبه‌شده باید دقیقاً همان‌ها باشند */
    ['معدلِ وزنی', 'رتبهٔ کلاس', 'حضور (کل سال)'].forEach((lab) => {
      assert(k.body.indexOf(lab) > -1, 'برچسبِ ' + lab + ' در compact نیست');
    });
    /* ۱۸ (نمرهٔ A) و ۱۴ (میانگین کلاس) باید هر دو قالب را داشته باشند */
    const fa18 = W(`fa(18)`), fa14 = W(`fa(14)`);
    assert(k.body.indexOf(fa18) > -1 && c.body.indexOf(fa18) > -1, 'نمرهٔ ۱۸');
    assert(k.body.indexOf(fa14) > -1 && c.body.indexOf(fa14) > -1, 'میانگینِ کلاس ۱۴');
    /* عنوان/مدرسه/زیرعنوان/یادداشت دست‌نخورده */
    assert(k.title === c.title && k.school === c.school && k.subtitle === c.subtitle && k.note === c.note, 'متادیتای سند فرق کرد');
  });

  test('T3 compact در برابرِ HTMLِ پرمخاطره امن است', () => {
    const sD = W(`add('users',{school_id:1,role:'student',full_name:'<img src=x onerror=alert(1)>',national_id:'9992002000004',phone:'09990002293',active:1,created_at:'2026-09-01'}).id`);
    W(`add('enrollments',{school_id:1,class_id:${ctx.cls},student_id:${sD}})`);
    W(`add('grades',{school_id:1,student_id:${sD},class_id:${ctx.cls},subject_id:${ctx.sub},term:'نوبت اول',exam_type:'پایانی',score:12,max_score:20,created_at:'2026-09-01'})`);
    const k = W(`reportCardCert(${sD},'نوبت اول','compact')`);
    assert(k.body.indexOf('<img src=x') === -1, 'HTMLِ خامِ نام در compact است!');
    assert(k.body.indexOf('&lt;img') > -1, 'نامِ فرار‌شده در compact نیست');
  });

  test('T4 بدونِ نمره: هر دو قالب همان خطا را می‌دهند', () => {
    const sE = W(`add('users',{school_id:1,role:'student',full_name:'بی‌نمره قالب',national_id:'9992002000005',phone:'09990002294',active:1,created_at:'2026-09-01'}).id`);
    W(`add('enrollments',{school_id:1,class_id:${ctx.cls},student_id:${sE}})`);
    const a = W(`reportCardCert(${sE},'نوبت اول')`);
    const b = W(`reportCardCert(${sE},'نوبت اول','compact')`);
    assert(a.ok === false && b.ok === false, 'بدونِ نمره باید خطا بدهد');
    assert(a.msg === b.msg, 'پیامِ خطا فرق کرد');
  });

  test('T5 UI سرتاسری: انتخابِ compact + کلیکِ واقعی ⇒ سندِ compact به printableDoc می‌رسد', async () => {
    const m1 = W(`db.users.find(u=>u.role==='manager'&&u.school_id===1).id`);
    W(`(function(){
      S.user = byId('users', ${m1}); S.persona = null; S.boss = null;
      S.child = ${ctx.sA}; S.filters = {}; S.route = 'record'; S.tab = 'grades'; render();
    })()`);
    const sel = win.document.getElementById('cert_tpl');
    assert(sel, 'انتخابگرِ قالب (cert_tpl) در ردیفِ چاپ نیست');
    const opts = Array.from(sel.options).map(o => o.value);
    assert(opts.indexOf('classic') > -1 && opts.indexOf('compact') > -1, 'گزینه‌ها درست نیستند: ' + opts);
    /* جاسوسی بر printableDoc تا سندِ چاپ‌شده را بگیریم (window.open در
       jsdom پیاده‌سازی نشده؛ بقیهٔ مسیر — انتخابگر، دکمهٔ واقعی،
       دیسپچ و اکشن — کاملاً واقعی است) */
    W(`window.__lastDoc=null; var _p=printableDoc; window.printableDoc=function(d){window.__lastDoc=d;return true;};`);
    sel.value = 'compact';
    const btn = win.document.querySelector('[data-act="report-print"]');
    assert(btn, 'دکمهٔ چاپ کارنامه نیست');
    btn.click();
    await sleep(50);
    const d1 = W(`window.__lastDoc`);
    assert(d1 && d1.body, 'اکشن سندِ چاپی نساخت (انتخابگر یا دکمه کار نمی‌کند)');
    assert(d1.body.indexOf('grid-template-columns:1fr 1fr') > -1, 'سندِ چاپ‌شده compact نیست (انتخابگر کار نمی‌کند!)');
    assert(d1.title === 'کارنامه', 'عنوانِ سند درست نیست');
    /* و حالا classic (پیش‌فرض) */
    W(`window.__lastDoc=null`);
    sel.value = 'classic';
    btn.click();
    await sleep(50);
    const d2 = W(`window.__lastDoc`);
    assert(d2 && d2.body, 'سندِ چاپیِ classic نساخت');
    assert(d2.body.indexOf('<table>') > -1, 'سندِ classic جدول ندارد');
    assert(d2.body.indexOf('grid-template-columns:1fr 1fr') === -1, 'classic بدنهٔ compact گرفت!');
  });

  test('T6 پاک‌سازی: رکوردهای آزمون + دمو برمی‌گردد', () => {
    const ids = W(`JSON.stringify((function(){
      var m = {classes:[],users:[],enrollments:[],grades:[]};
      ['${ctx.cls}'].forEach(function(c){ m.classes.push(Number(c)); });
      [${ctx.sA},${ctx.sB}].forEach(function(id){ id=Number(id); m.users.push(id); m.enrollments.push.apply(m.enrollments, db.enrollments.filter(function(e){return e.student_id===id;}).map(function(e){return e.id;})); m.grades.push.apply(m.grades, db.grades.filter(function(g){return g.student_id===id;}).map(function(g){return g.id;})); });
      return m;
    })())`);
    const m = JSON.parse(ids);
    /* دانش‌آموزانِ T3/T4 هم پاک شوند */
    const extra = W(`JSON.stringify((function(){
      var ids=[];
      db.users.forEach(function(u){ if(u.full_name&&u.full_name.indexOf('قالب')>-1||u.full_name&&/<img/.test(u.full_name)){ ids.push(u.id);
        db.enrollments.filter(function(e){return e.student_id===u.id;}).forEach(function(e){remove('enrollments',e.id);});
        db.grades.filter(function(g){return g.student_id===u.id;}).forEach(function(g){remove('grades',g.id);});
      }});
      return ids;
    })())`);
    JSON.parse(extra).forEach((id) => W(`remove('users',${id})`));
    m.grades.forEach((id) => W(`remove('grades',${id})`));
    m.enrollments.forEach((id) => W(`remove('enrollments',${id})`));
    m.users.forEach((id) => W(`remove('users',${id})`));
    m.classes.forEach((id) => W(`remove('classes',${id})`));
    const left = W(`db.users.filter(u=>u.full_name&&u.full_name.indexOf('قالب')>-1).length + db.classes.filter(c=>c.name&&c.name.indexOf('قالب')>-1).length`);
    assert(left === 0, 'رکوردهای آزمون پاک نشده: ' + left);
  });

  await __seq;
  console.log('\n────────────────────────────────────────────────────');
  console.log(`reporttpl2 (قالبِ کارنامه): ${pass + fail} بررسی — ✅ ${pass} · ❌ ${fail}`);
  if (errors.length) { console.log('\nخطاها:'); errors.slice(0, 10).forEach(e => console.log(' •', e)); }
  console.log('────────────────────────────────────────────────────');
// hardening: rebuild base index.html (a previously crashed mutation suite may have left a mutated build)
try { require('child_process').execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'ignore' }); } catch (e) {}
  process.exit(fail ? 1 : 0);
}
