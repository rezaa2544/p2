#!/usr/bin/env node
/**
 * تست‌های کمک‌های داوطلبانه (بند B.5 فرناز — چت۱):
 *  - سید قطعی donations (بدون جابه‌جایی RNG / بدون کاربر تازه)
 *  - ثبت/ویرایش/حذف مدیر از مسیر واقعی کلیک + نام اختیاری (ناشناس)
 *  - رسید چاپی ساده (نامدار و ناشناس) + گیت مدرسه در چاپ
 *  - گارد فقط-مدیر + ضد IDOR + اعتبارسنجی fail-closed
 *  - جدایی کامل از ماژول شهریه + قاعدهٔ سرور به‌صورت مستقیم
 *
 * اجرا:  node tests/donations2.js   (نیازمند jsdom)
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
const JS_UNSAFE_CHAR_MAP = {
  '<': '\\u003C',
  '>': '\\u003E',
  '/': '\\u002F',
  '\\': '\\\\',
  '\b': '\\b',
  '\f': '\\f',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
  '\0': '\\0',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};
const escapeUnsafeChars = (str) => str.replace(/[<>\/\\\b\f\n\r\t\0\u2028\u2029]/g, (ch) => JS_UNSAFE_CHAR_MAP[ch] || ch);
const safeJsLiteral = (value) => escapeUnsafeChars(JSON.stringify(value));
const mgrLogin = (u) => W(`S.user=db.users.find(function(x){return x.username==='${u || 'manager1'}';});S.persona=null;S.boss=null;S.filters={};`);
const go = (route) => W(`S.route='${route}';render();`);

async function main() {
  await sleep(500);
  W('window.TU0=db.tuitions.length;window.IN0=db.installments.length;window.TR0=db.transactions.length;');

  test('N1 بوت بدون خطا + سید کمک‌ها (۶ نامدار + ۶ ناشناس)', () => {
    assert(consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
    assert(Number(W(`db.donations.length`)) === 12, 'سید باید دقیقاً ۱۲ رکورد باشد: ' + W(`db.donations.length`));
    assert(Number(W(`db.donations.filter(function(d){return !d.donor_name;}).length`)) === 6, '۶ رکورد باید ناشناس باشد');
    assert(Number(W(`db.users.length`)) === 1036, 'کاربر تازه ساخته شد!' /* SIM-01: +guard1 (seed-completeness) */);
    assert(W(`!!db.users.find(function(u){return u.username==='manager1';})`), 'حساب نمونه جابه‌جا شد');
  });

  function saveViaUI(donor, amount, date, desc) {
    W(`document.querySelector('[data-act="don-new"]').click()`);
    W(`(function(){document.getElementById('don_f_donor').value=${safeJsLiteral(donor)};
      document.getElementById('don_f_amount').value=${safeJsLiteral(amount)};
      document.getElementById('don_f_date').value=${safeJsLiteral(date)};
      document.getElementById('don_f_desc').value=${safeJsLiteral(desc)};
      document.querySelector('[data-act="don-save"]').click();})()`);
  }

  test('N2 ثبت نامدار از مسیر واقعی', () => {
    mgrLogin(); go('donations');
    const before = Number(W(`db.donations.length`));
    saveViaUI('حاجی خیر', '2500000', '2026-09-02', 'کمک به کتابخانه');
    assert(Number(W(`db.donations.length`)) === before + 1, 'رکورد ساخته نشد');
    const d = W(`db.donations[db.donations.length-1]`);
    assert(d.school_id === 1 && d.donor_name === 'حاجی خیر' && d.amount === 2500000, 'فیلدها درست ذخیره نشد: ' + JSON.stringify(d));
  });

  test('N3 ثبت ناشناس (نام خالی)', () => {
    mgrLogin(); go('donations');
    saveViaUI('', '1000000', '2026-09-03', 'نذر');
    const d = W(`db.donations[db.donations.length-1]`);
    assert(d.donor_name == null, 'نام خالی باید null شود');
    assert(W(`donorFa(${JSON.stringify(d)})`) === 'ناشناس', 'نمایش ناشناس کار نمی‌کند');
    assert(W(`document.body.textContent.includes('ناشناس')`) === true, 'ناشناس در جدول نیست');
  });

  test('N4 ویرایش از مسیر واقعی', () => {
    mgrLogin(); go('donations');
    const id = W(`db.donations.filter(function(d){return d.school_id===1&&d.donor_name==='حاجی خیر';})[0].id`);
    W(`document.querySelector('[data-act="don-edit"][data-id="${id}"]').click()`);
    W(`(function(){document.getElementById('don_f_amount').value='3000000';
      document.querySelector('[data-act="don-save"]').click();})()`);
    assert(W(`byId('donations',${id}).amount`) === 3000000, 'ویرایش اعمال نشد');
  });

  test('N5 حذف با تأیید', () => {
    mgrLogin(); go('donations');
    const id = W(`db.donations.filter(function(d){return d.school_id===1&&d.donor_name==='حاجی خیر';})[0].id`);
    const before = Number(W(`db.donations.length`));
    W(`document.querySelector('[data-act="don-del"][data-id="${id}"]').click()`);
    W(`document.querySelector('[data-act="don-del-ok"]').click()`);
    assert(Number(W(`db.donations.length`)) === before - 1, 'حذف نشد');
  });

  test('N6 اعتبارسنجی fail-closed + ضد IDOR', () => {
    mgrLogin();
    assert(W(`saveDonation(null,'x',0,'2026-09-01','').ok`) === false, 'مبلغ صفر باید رد شود');
    assert(W(`saveDonation(null,'x',-5,'2026-09-01','').ok`) === false, 'مبلغ منفی باید رد شود');
    assert(W(`saveDonation(null,'x',2.5,'2026-09-01','').ok`) === false, 'مبلغ اعشاری باید رد شود');
    assert(W(`saveDonation(null,'x',10000000001,'2026-09-01','').ok`) === false, 'مبلغ بیش‌ازحد باید رد شود');
    assert(W(`saveDonation(null,'x',100,'2026-13-99','').ok`) === false, 'تاریخ نامعتبر باید رد شود');
    assert(W(`saveDonation(null,'x',100,'2999-01-01','').ok`) === false, 'آینده باید رد شود');
    W(`S.user=db.users.find(function(u){return u.role==='teacher'&&u.school_id===1;})`);
    assert(W(`saveDonation(null,'x',100,'2026-09-01','').ok`) === false, 'دبیر نباید ثبت کند');
    mgrLogin('manager2');
    const other = W(`db.donations.filter(function(d){return d.school_id===1;})[0].id`);
    assert(W(`saveDonation(${other},'x',100,'2026-09-01','').ok`) === false, 'ویرایش بین‌مدرسه‌ای باید رد شود');
    assert(W(`deleteDonation(${other}).ok`) === false, 'حذف بین‌مدرسه‌ای باید رد شود');
  });

  test('N7 رسید چاپی (نامدار + ناشناس) + گیت مدرسه', () => {
    mgrLogin(); go('donations');
    let captured = '';
    win.open = () => ({ document: { write: (s) => { captured += s; }, close: () => {} } });
    const named = W(`db.donations.filter(function(d){return d.school_id===1&&d.donor_name;})[0].id`);
    W(`donPrint(${named})`);
    assert(captured.includes('رسید کمک داوطلبانه'), 'تیتر رسید نیست!');
    assert(captured.includes('خیر مدرسه'), 'نام کمک‌کننده در رسید نیست!');
    assert(captured.includes('ریال'), 'واحد ریال در رسید نیست!');
    assert(captured.includes(W(`byId('schools',1).name`)), 'نام مدرسه در رسید نیست!');
    captured = '';
    const anon = W(`db.donations.filter(function(d){return d.school_id===1&&!d.donor_name;})[0].id`);
    W(`donPrint(${anon})`);
    assert(captured.includes('ناشناس'), 'رسید ناشناس درست نیست!');
    captured = '';
    mgrLogin('manager2');
    W(`donPrint(${named})`);
    assert(captured === '', 'چاپ بین‌مدرسه‌ای باید بسته شود!');
  });

  test('N8 ماتریس canAction هر ۶ اکشن', () => {
    const acts = ['don-new', 'don-edit', 'don-save', 'don-del', 'don-del-ok', 'don-print'];
    acts.forEach((a) => {
      assert(W(`canAction('${a}','manager')`) === true, a + ' باید برای مدیر باز باشد');
      assert(W(`canAction('${a}','superadmin')`) === true, a + ' باید برای سوپرادمین باز باشد (بای‌پس)');
      ['teacher', 'student', 'parent', 'driver', 'counselor', 'edu_office'].forEach((r) => {
        assert(W(`canAction('${a}','${r}')`) === false, `${a} نباید برای ${r} باز باشد`);
      });
    });
  });

  test('N9 قاعده‌های سرور: مبلغ + نام + تاریخ', () => {
    const v = require('../server/validate.js');
    const r = v.ruleFor('donations', 'amount');
    assert(r && r.type === 'integer' && r.min === 1, 'ruleFor مبلغ درست نیست');
    assert(v.checkRule(1000, r) === null, 'مبلغ مجاز باید قبول شود');
    assert(v.checkRule(0, r) !== null && v.checkRule(-5, r) !== null, 'صفر/منفی باید رد شود');
    assert(v.checkRule(2.5, r) !== null, 'اعشاری باید رد شود');
    const rn = v.ruleFor('donations', 'donor_name');
    assert(rn && rn.type === 'string' && rn.max === 100, 'نام کمک‌کننده باید string/100 باشد');
    assert(v.ruleFor('donations', 'date').type === 'date', 'تاریخ باید قاعدهٔ date بگیرد');
  });

  test('N10 جدایی کامل از شهریه', () => {
    assert(Number(W(`db.tuitions.length`)) === Number(W(`window.TU0`)), 'tuitions دست خورد!');
    assert(Number(W(`db.installments.length`)) === Number(W(`window.IN0`)), 'installments دست خورد!');
    assert(Number(W(`db.transactions.length`)) === Number(W(`window.TR0`)), 'transactions دست خورد!');
  });

  const total = pass + fail;
  console.log(`تست کمک‌های داوطلبانه: ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
  if (consoleErrors.length) {
    console.log(`\n⚠️ خطاهای کنسول (${consoleErrors.length}):`);
    consoleErrors.slice(0, 5).forEach((e) => console.log('   ' + String(e).slice(0, 160)));
  }
  console.log('─'.repeat(52) + '\n');
  dom.window.close();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
