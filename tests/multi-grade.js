/* ─────────────────────────────────────────────────────────────
   multi-grade.js — موج ۲۱: کلاس چندپایه (مدارس روستایی و عشایری)
   نمای ماتریسی (سطر=دانش‌آموز، ستون=پایه) برای حضور و نمره:
   دکمه‌های سریع حاضر/غایب/مرخصی، ثبت گروهی هر پایه با یک ضربه،
   فیلتر پایه، وضعیت فعلی، و حفظ Offline-First (پیش‌نویس Store +
   صف همگام‌سازی).
   اجرا: node tests/multi-grade.js
   ───────────────────────────────────────────────────────────── */
'use strict';
const { JSDOM } = require('jsdom');
const fs = require('fs');
const HTML = fs.readFileSync(__dirname + '/../index.html', 'utf8');

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('\n▸ موج ۲۱ — کلاس چندپایه: ماتریس حضور و نمره');

  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true,
    beforeParse(w) {
      w.scrollTo = () => {};
      w.fetch = () => Promise.resolve({ ok: false, status: 404, json: async () => ({}), headers: { get: () => null } });
    }
  });
  const W = (c) => dom.window.eval(c);
  const D = dom.window.document;
  const click = (sel) => { const el = D.querySelector(sel); if (!el) return false; el.click(); return true; };
  await sleep(1700);

  /* ── چیدمان صحنه: مدیرِ مدرسهٔ ۱ (SH-101 → has_multigrade:1) ── */
  W(`S.user = db.users.find(u=>u.role==='manager'&&u.school_id===1);
     S.showPicker=false; S.route='multigrade'; S.filters={}; SYNC.demoMode=true; 0;`);

  /* ── ۱) توابع پایه ── */
  chk('M1 mgGradeName: عدد → نام فارسی پایه',
    W(`mgGradeName(10)`) === 'دهم' && W(`mgGradeName(3)`) === 'سوم' && W(`mgGradeName(0)`) === '—');
  chk('M2 mgStudentGradeNum: grade_level دانش‌آموز مقدم است',
    W(`mgStudentGradeNum({grade_level:4},{grade:'دهم'})`) === 4);
  chk('M3 mgStudentGradeNum: بدون grade_level از پایهٔ کلاس می‌آید',
    W(`mgStudentGradeNum({}, {grade:'یازدهم'})`) === 11);
  chk('M4 قابلیت مدرسه: SH-101 چندپایه دارد و FZ-102 ندارد',
    W(`hasCap(1,'has_multigrade')`) === true && W(`hasCap(2,'has_multigrade')`) === false);

  /* ── ۲) بدون کلاسِ نشان‌دار: حالت خالی ── */
  W(`db.classes.forEach(c=>{delete c.multigrade;}); render(); 0;`);
  chk('M5 بدون کلاس چندپایه، حالت خالی (نه ماتریس)',
    !D.querySelector('[data-act="mg-att-col"]') && D.body.textContent.includes('کلاس چندپایه‌ای در دسترس نیست'));

  /* ── ۳) صحنهٔ چندپایه: یک کلاس با دو پایهٔ ۱۰ و ۱۱ ── */
  W(`var c = db.classes.find(x=>x.school_id===1);
     c.multigrade = 1; window.__mgc = c.id;
     var sts = studentsOfClass(c.id);
     window.__all = sts.map(s=>s.id);
     sts.forEach((s,i)=>{ s.grade_level = (i%2===0)?10:11; });
     window.__g10 = sts.filter((s,i)=>i%2===0).map(s=>s.id);
     window.__g11 = sts.filter((s,i)=>i%2===1).map(s=>s.id);
     S.filters={}; render(); 0;`);
  const nAll = W('window.__all.length'), n10 = W('window.__g10.length'), n11 = W('window.__g11.length');
  chk('M6 ماتریس رندر شد: ستون هر دو پایه + برچسب چندپایه',
    D.body.textContent.includes('پایهٔ دهم') && D.body.textContent.includes('پایهٔ یازدهم')
    && !!D.querySelector('[data-act="mg-att-col"]'));
  chk('M7 هر دانش‌آموز فقط در ستون پایهٔ خودش کنترل دارد (خانه‌های خاموش درست)',
    D.querySelectorAll('td.mg-off').length === nAll
    && D.querySelectorAll('[data-act="mg-att-set"]').length === nAll * 3);
  chk('M8 دکمه‌های سریع: حاضر/غایب/مرخصی در هر سطر',
    (() => { const b = [...D.querySelectorAll('[data-act="mg-att-set"]')].slice(0, 3).map(x => x.textContent.trim());
      return JSON.stringify(b) === JSON.stringify(['حاضر','غایب','مرخصی']); })());
  chk('M9 پیش از هر ثبتی: همه «ثبت نشده»',
    [...D.querySelectorAll('tbody .badge.b-gray')].filter(x => x.textContent === 'ثبت نشده').length === nAll);

  /* ── ۴) فیلتر پایه ── */
  W(`S.filters.mggrade='10'; render(); 0;`);
  chk('M10 فیلتر پایه: فقط دانش‌آموزانِ پایهٔ دهم می‌مانند',
    D.querySelectorAll('tbody tr').length === n10);
  W(`S.filters.mggrade=''; render(); 0;`);

  /* ── ۵) ثبت گروهی یک پایه با یک ضربه (پیش‌نویس آفلاین) ── */
  click('[data-act="mg-att-col"][data-g="10"][data-s="present"]');
  await sleep(50);
  let draft = W(`JSON.stringify(attDraftGet(window.__mgc, todayISO()))`);
  chk('M11 ضربهٔ سرستون: همهٔ پایهٔ دهم در پیش‌نویس «حاضر» شدند',
    (() => { const d = JSON.parse(draft); const g10 = W('JSON.stringify(window.__g10)');
      return JSON.parse(g10).every(id => d[id] === 'present') && Object.keys(d).length === n10; })(), draft);
  chk('M12 پیش‌نویس در Store است نه فقط حافظه (Offline-First)',
    W(`Object.keys(Store.getJSON('sms_att_draft_v1',{})||{}).length`) >= 1);
  chk('M13 نوار پیش‌نویس با شمار تغییرات ظاهر شد',
    !!D.querySelector('.att-draft-bar') && !!D.querySelector('[data-act="att-review"]'));

  /* ── ۶) تیک تکی + رفت‌وبرگشتی ── */
  const sid11 = W('window.__g11[0]');
  click(`[data-act="mg-att-set"][data-id="${sid11}"][data-s="excused"]`);
  await sleep(50);
  chk('M14 تیک تکی «مرخصی» در پیش‌نویس نشست',
    W(`attDraftGet(window.__mgc, todayISO())[${sid11}]`) === 'excused');
  chk('M15 وضعیت فعلی در ماتریس: نشان «مرخصی» + سطر پیش‌نویس',
    [...D.querySelectorAll('tbody .badge')].some(b => b.textContent === 'مرخصی')
    && D.querySelectorAll('tr.att-row-draft').length === n10 + 1);
  click(`[data-act="mg-att-set"][data-id="${sid11}"][data-s="excused"]`);
  await sleep(50);
  chk('M16 زدن دوبارهٔ همان دکمه تیک را برمی‌دارد (رفت‌وبرگشتی)',
    W(`attDraftGet(window.__mgc, todayISO())[${sid11}]`) === undefined);
  click(`[data-act="mg-att-set"][data-id="${sid11}"][data-s="absent"]`);
  await sleep(50);

  /* ── ۷) ثبت نهایی از مسیر رسمی att-review → att-commit ── */
  const q0 = W('SYNC.queue.length');
  const att0 = W('db.attendance.length');
  click('[data-act="att-review"]');
  await sleep(80);
  chk('M17 مودال مرور نهایی باز شد و دکمهٔ تأیید دارد',
    !!D.querySelector('#modal [data-act="att-commit"]'));
  click('#modal [data-act="att-commit"]');
  await sleep(120);
  const attNew = W('db.attendance.length') - att0;
  chk('M18 ثبت نهایی: رکوردهای حضور نوشته شدند (' + (n10 + 1) + ' تغییر)',
    attNew === n10 + 1, 'نوشته‌شده: ' + attNew);
  chk('M19 وضعیت‌ها درست‌اند: پایهٔ دهم present و تکی absent',
    W(`db.attendance.filter(a=>a.class_id===window.__mgc&&a.date===todayISO()&&a.status==='present').length`) === n10
    && W(`db.attendance.some(a=>a.class_id===window.__mgc&&a.date===todayISO()&&a.student_id===${sid11}&&a.status==='absent')`) === true);
  chk('M20 Offline-First: هر نوشتار وارد صف همگام‌سازی شد',
    W('SYNC.queue.length') - q0 >= n10 + 1, 'صف: +' + (W('SYNC.queue.length') - q0));
  chk('M21 پس از ثبت، پیش‌نویس این کلاس پاک شد',
    W(`Object.keys(attDraftGet(window.__mgc, todayISO())).length`) === 0);
  chk('M22 ماتریس وضعیت ثبت‌شده را نشان می‌دهد (حاضر از پایگاه داده)',
    [...D.querySelectorAll('tbody .badge.b-green')].filter(b => b.textContent === 'حاضر').length === n10);

  /* ── ۸) برگهٔ نمرات: ماتریس ورودی + ثبت گروهی ── */
  click('[data-act="mg-tab"][data-id="grades"]');
  await sleep(80);
  chk('M23 برگهٔ نمرات: ورودی نمره فقط در ستون پایهٔ خود دانش‌آموز',
    D.querySelectorAll('input.mg-score').length === nAll
    && D.querySelectorAll('td.mg-off').length === nAll);
  chk('M24 امتحان نهایی کشوری در گزینه‌های نوع آزمون نیست (فاز ۰.۳)',
    (() => { const o = [...D.querySelectorAll('[data-f="mgtype"] option')].map(x => x.textContent);
      return o.length > 0 && !o.includes(W('NATIONAL_EXAM_TYPE')); })());

  const g0 = W('db.grades.length');
  const qg0 = W('SYNC.queue.length');
  const s10a = W('window.__g10[0]'), s10b = W('window.__g10[1]');
  D.querySelector(`#mg_sc_${s10a}`).value = '18.5';
  D.querySelector(`#mg_sc_${s10b}`).value = '11';
  click('[data-act="mg-grades-save"]');
  await sleep(120);
  chk('M25 ثبت گروهی نمره: فقط خانه‌های پُرشده ثبت شدند (۲ رکورد)',
    W('db.grades.length') - g0 === 2, '+' + (W('db.grades.length') - g0));
  chk('M26 رکورد نمره کامل است: مدرسه/کلاس/درس/نوبت/سقف ۲۰/منشأ داخلی',
    (() => { const g = JSON.parse(W(`JSON.stringify(db.grades[db.grades.length-1])`));
      const subId = Number(W(`S.filters.mgsub || visibleSubjects()[0].id`));
      return g.class_id === W('window.__mgc') && g.school_id === 1 && g.max_score === 20
        && g.subject_id === subId && g.source === 'internal' && g.term && g.exam_type; })());
  chk('M27 نمره‌ها وارد صف همگام‌سازی شدند (Offline-First)',
    W('SYNC.queue.length') - qg0 >= 2);
  chk('M28 ستون «آخرین نمره» پس از ثبت پُر شد',
    (() => { W('render(); 0;'); return [...D.querySelectorAll('tbody .badge')].some(b => /۱۸٫۵|۱۸\.۵/.test(b.textContent) || b.textContent.includes('۱۸')); })());

  /* ── ۹) اعتبارسنجی نمره ── */
  const g1 = W('db.grades.length');
  D.querySelector(`#mg_sc_${s10a}`).value = '25';
  click('[data-act="mg-grades-save"]');
  await sleep(80);
  chk('M29 نمرهٔ خارج از ۰..۲۰ رد می‌شود و چیزی ثبت نمی‌شود',
    W('db.grades.length') === g1);

  /* ── ۱۰) مجوزها ── */
  chk('M30 ACTION_ROLES: اکشن‌های نویسندهٔ چندپایه برچسب‌دارند',
    (() => { const r = JSON.parse(W(`JSON.stringify([ACTION_ROLES['mg-att-set'],ACTION_ROLES['mg-att-col'],ACTION_ROLES['mg-grades-save']])`));
      return r.every(x => Array.isArray(x) && x.includes('teacher') && x.includes('manager') && !x.includes('student') && !x.includes('parent')); })());
  chk('M31 canAction: دانش‌آموز و ولی از اکشن‌های نویسنده محروم‌اند',
    W(`canAction('mg-att-col','student')`) === false && W(`canAction('mg-grades-save','parent')`) === false
    && W(`canAction('mg-att-set','teacher')`) === true);
  chk('M32 روت multigrade در منوی مدیر و دبیر هست و در منوی دانش‌آموز نیست',
    W(`navRoutesOf('manager').includes('multigrade')`) === true
    && W(`navRoutesOf('teacher').includes('multigrade')`) === true
    && W(`navRoutesOf('student').includes('multigrade')`) === false);
  chk('M33 دانش‌آموز و ولی به روت دسترسی ندارند؛ مدیر و دبیر دارند (canRoute)',
    W(`canRoute('multigrade','student')`) === false && W(`canRoute('multigrade','parent')`) === false
    && W(`canRoute('multigrade','manager')`) === true && W(`canRoute('multigrade','teacher')`) === true);

  /* ── ۱۱) نمای فقط‌خواندنی سوپرادمین ── */
  W(`S.user = db.users.find(u=>u.role==='superadmin'); S.route='multigrade'; S.filters={}; render(); 0;`);
  chk('M34 سوپرادمین ماتریس را می‌بیند (نظارت) و رندر نمی‌شکند',
    D.body.textContent.includes('چندپایه'));

  console.log('\nجمع: ' + okc + ' قبول، ' + failc + ' رد');
  if (failc) { console.log('\nخطاها:'); fails.forEach(f => console.log('  ✗ ' + f)); }
  process.exit(failc ? 1 : 0);
})().catch(e => { console.error('کرش تست:', e); process.exit(1); });
