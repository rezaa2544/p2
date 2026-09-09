#!/usr/bin/env node
/**
 * تست‌های مانور سالانهٔ ایمنی/زلزله (بند B.4 فرناز — چت۱):
 *  - سید قطعی safety_drills (بدون جابه‌جایی RNG / بدون کاربر تازه)
 *  - ثبت/ویرایش/حذف مدیر از مسیر واقعی کلیک
 *  - گارد فقط-مدیر + ضد IDOR بین‌مدرسه‌ای + اعتبارسنجی fail-closed
 *  - نماد سبز/قرمز داشبورد + آمار تجمیعی گزارش رئیس اداره
 *  - قاعدهٔ سرور (شمار شرکت‌کننده) به‌صورت مستقیم
 *
 * اجرا:  node tests/drills2.js   (نیازمند jsdom)
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
function test(name, fn) {
  try { fn(); pass++; console.log(`  ✅ ${name}`); }
  catch (e) { fail++; errors.push(`${name}: ${e.message}`); console.log(`  ❌ ${name}\n     ${e.message}`); }
}
function assert(c, m) { if (!c) throw new Error(m || 'شرط برقرار نیست'); }

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
const mgrLogin = (u) => W(`S.user=db.users.find(function(x){return x.username==='${u || 'manager1'}';});S.persona=null;S.boss=null;S.filters={};`);
const go = (route) => W(`S.route='${route}';render();`);

async function main() {
  await sleep(500);
  W('window.ATT0=db.attendance.length');

  test('D1 بوت بدون خطا + سید مانور (فرد=سبز، زوج=قرمز)', () => {
    assert(consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
    assert(Number(W(`db.safety_drills.length`)) === 6, 'سید باید دقیقاً ۶ رکورد باشد: ' + W(`db.safety_drills.length`));
    assert(Number(W(`db.users.length`)) === 1035, 'کاربر تازه ساخته شد!');
    assert(W(`!!db.users.find(function(u){return u.username==='manager1';})`), 'حساب نمونه جابه‌جا شد');
    assert(W(`drillAnnualStatus(1).done`) === true, 'مدرسهٔ ۱ باید سبز باشد');
    assert(W(`drillAnnualStatus(2).done`) === false, 'مدرسهٔ ۲ باید قرمز باشد');
    assert(W(`drillStatsFor([1,2,3,4,5,6]).done`) === 3, 'آمار تجمیعی باید ۳ از ۶ باشد');
  });

  test('D2 ثبت مدیر از مسیر واقعی (مودال → ذخیره)', () => {
    mgrLogin(); go('drills');
    const before = Number(W(`db.safety_drills.length`));
    W(`document.querySelector('[data-act="drill-new"]').click()`);
    assert(W(`document.getElementById('drill_f_date')?1:0`) === 1, 'مودال ثبت باز نشد!');
    W(`(function(){document.getElementById('drill_f_date').value='2026-09-01';
      document.getElementById('drill_f_students').value='200';
      document.getElementById('drill_f_staff').value='15';
      document.getElementById('drill_f_notes').value='یادداشت آزمایشی';
      document.querySelector('[data-act="drill-save"]').click();})()`);
    assert(Number(W(`db.safety_drills.length`)) === before + 1, 'رکورد ساخته نشد');
    const d = W(`db.safety_drills[db.safety_drills.length-1]`);
    assert(d.school_id === 1, 'school_id باید از نشست بیاید');
    assert(d.participant_count_students === 200 && d.participant_count_staff === 15, 'شمارها ذخیره نشد');
    assert(d.registered_by === W(`S.user.id`), 'ثبت‌کننده ذخیره نشد');
  });

  test('D3 ویرایش از مسیر واقعی', () => {
    mgrLogin(); go('drills');
    const id = W(`db.safety_drills.filter(function(d){return d.school_id===1;})[0].id`);
    W(`document.querySelector('[data-act="drill-edit"][data-id="${id}"]').click()`);
    assert(W(`document.getElementById('drill_f_id').value`) === String(id), 'مودال ویرایش شناسه را ندارد');
    W(`(function(){document.getElementById('drill_f_students').value='210';
      document.querySelector('[data-act="drill-save"]').click();})()`);
    assert(W(`byId('safety_drills',${id}).participant_count_students`) === 210, 'ویرایش اعمال نشد');
  });

  test('D4 حذف با تأیید', () => {
    mgrLogin(); go('drills');
    const id = W(`db.safety_drills.filter(function(d){return d.school_id===1&&d.notes==='یادداشت آزمایشی';})[0].id`);
    const before = Number(W(`db.safety_drills.length`));
    W(`document.querySelector('[data-act="drill-del"][data-id="${id}"]').click()`);
    W(`document.querySelector('[data-act="drill-del-ok"]').click()`);
    assert(Number(W(`db.safety_drills.length`)) === before - 1, 'حذف نشد');
    assert(W(`byId('safety_drills',${id})`) == null, 'رکورد هنوز هست!');
  });

  test('D5 اعتبارسنجی fail-closed + ضد IDOR', () => {
    mgrLogin();
    assert(W(`saveDrill(null,'2026-09-01',-1,5,'').ok`) === false, 'شمار منفی باید رد شود');
    assert(W(`saveDrill(null,'2026-09-01',5,100001,'').ok`) === false, 'شمار بیش‌ازحد باید رد شود');
    assert(W(`saveDrill(null,'2026-13-99',5,5,'').ok`) === false, 'تاریخ نامعتبر باید رد شود');
    assert(W(`saveDrill(null,'2999-01-01',5,5,'').ok`) === false, 'آینده باید رد شود');
    assert(W(`saveDrill(null,'2026-09-01',2.5,5,'').ok`) === false, 'شمار اعشاری باید رد شود');
    W(`S.user=db.users.find(function(u){return u.role==='teacher'&&u.school_id===1;})`);
    assert(W(`saveDrill(null,'2026-09-01',5,5,'').ok`) === false, 'دبیر نباید ثبت کند');
    assert(W(`deleteDrill(1).ok`) === false, 'دبیر نباید حذف کند');
    mgrLogin('manager2');
    const other = W(`db.safety_drills.filter(function(d){return d.school_id===1;})[0].id`);
    assert(W(`saveDrill(${other},'2026-09-01',5,5,'x').ok`) === false, 'ویرایش بین‌مدرسه‌ای باید رد شود');
    assert(W(`deleteDrill(${other}).ok`) === false, 'حذف بین‌مدرسه‌ای باید رد شود');
  });

  test('D6 نماد سبز/قرمز داشبورد + دکمهٔ مسیریابی', () => {
    mgrLogin(); go('dashboard');
    const t1 = W(`document.body.textContent`);
    assert(t1.includes('🟢') && t1.includes('مانور ایمنی امسال'), 'نماد سبز مدیر ۱ نیست!');
    mgrLogin('manager2'); go('dashboard');
    const t2 = W(`document.body.textContent`);
    assert(t2.includes('🔴'), 'نماد قرمز مدیر ۲ نیست!');
    W(`document.querySelector('[data-act="go"][data-r="drills"]').click()`);
    assert(W(`S.route`) === 'drills', 'دکمه باید به روت drills برود');
  });

  test('D7 آمار تجمیعی اداره + ستون هر مدرسه', () => {
    const st = W(`drillStatsFor([1,2,3,4,5,6])`);
    assert(st.schools === 6 && st.done === 3 && st.drills === 3, 'تجمیع درست نیست: ' + JSON.stringify(st));
    assert(st.students > 0 && st.staff > 0, 'جمع شرکت‌کنندگان صفر است!');
    W(`S.user=db.users.find(function(u){return u.role==='edu_office';});S.filters={};S.route='officedash';render();`);
    const t = W(`document.body.textContent`);
    assert(t.includes('مانور ایمنی سالانه'), 'کارت تجمیعی در داشبورد اداره نیست!');
    assert(t.includes('🟢') && t.includes('🔴'), 'ستون وضعیت هر مدرسه نیست!');
  });

  test('D8 ماتریس canAction هر ۵ اکشن', () => {
    const acts = ['drill-new', 'drill-edit', 'drill-save', 'drill-del', 'drill-del-ok'];
    acts.forEach((a) => {
      assert(W(`canAction('${a}','manager')`) === true, a + ' باید برای مدیر باز باشد');
      assert(W(`canAction('${a}','superadmin')`) === true, a + ' باید برای سوپرادمین باز باشد (بای‌پس)');
      ['teacher', 'student', 'parent', 'driver', 'counselor', 'edu_office'].forEach((r) => {
        assert(W(`canAction('${a}','${r}')`) === false, `${a} نباید برای ${r} باز باشد`);
      });
    });
  });

  test('D9 قاعدهٔ سرور: شمار صحیح ۰ تا ۱۰۰۰۰۰', () => {
    const v = require('../server/validate.js');
    const r = v.ruleFor('safety_drills', 'participant_count_students');
    assert(r && r.type === 'integer' && r.min === 0 && r.max === 100000, 'ruleFor شمار دانش‌آموز درست نیست');
    const r2 = v.ruleFor('safety_drills', 'participant_count_staff');
    assert(r2 && r2.type === 'integer', 'ruleFor شمار کادر درست نیست');
    assert(v.checkRule(0, r) === null && v.checkRule(500, r) === null, 'مقادیر مجاز باید قبول شوند');
    assert(v.checkRule(-1, r) !== null, 'منفی باید رد شود');
    assert(v.checkRule(100001, r) !== null, 'بیش‌ازحد باید رد شود');
    assert(v.checkRule(2.5, r) !== null, 'اعشاری باید رد شود');
    assert(v.ruleFor('safety_drills', 'date').type === 'date', 'تاریخ باید قاعدهٔ date بگیرد');
  });

  test('D10 جدایی از ماژول‌های دیگر', () => {
    assert(Number(W(`db.attendance.length`)) === Number(W(`window.ATT0`)), 'حضور دانش‌آموز دست خورد!');
    assert(W(`typeof viewDrills`) === 'function' && W(`typeof viewTraining`) === 'function', 'توابع نما نیست!');
  });

  const total = pass + fail;
  console.log(`تست مانور ایمنی: ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
  if (consoleErrors.length) {
    console.log(`\n⚠️ خطاهای کنسول (${consoleErrors.length}):`);
    consoleErrors.slice(0, 5).forEach((e) => console.log('   ' + String(e).slice(0, 160)));
  }
  console.log('─'.repeat(52) + '\n');
  dom.window.close();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
