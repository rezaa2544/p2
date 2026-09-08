/* ─────────────────────────────────────────────────────────────
   tuition-plan.js — تفکیکِ plan-save شهریه از اشتراک (دور ۱۰۰، نقصِ ۳)
   ─────────────────────────────────────────────────────────────
   ریشهٔ نقص (دوگانه):
   ۱) سایه: 'plan-save' در A (قیمت‌گذاریِ اشتراک) نسخهٔ F7 (طرحِ شهریه)
      را می‌پوشاند ⇒ کلیکِ «ذخیرهٔ طرحِ شهریه» به گردانندهٔ اشتباه می‌رفت.
   ۲) نقش: 'plan-save' دو بار در ACTION_ROLES بود (‏[manager,superadmin]
      زیرِ «مالی» + ‏[superadmin] زیرِ «پنل سوپرادمین») و دومی می‌برد ⇒
      مدیر عملاً اجازه نداشت.
   رفع: تغییرنامِ نسخهٔ F7 به 'tuition-plan-save' (گرداننده + دکمهٔ مودال +
   نقش‌ها)؛ نسخهٔ A دست‌نخورده ماند.

   T1 رجیستری‌ها: بدونِ سایه (F7 نسخهٔ تازه را دارد، نسخهٔ کهنه را نه؛
      A برعکس) + دکمهٔ مودالِ طرح به نامِ تازه اشاره می‌کند
   T2 نقش‌ها: مدیر/سوپرادمین مجاز، بقیه رد؛ plan-save همچنان فقط سوپرادمین
   T3 سرتاسریِ مدیر (کلیکِ واقعی ← دیسپچ): ساخت + ویرایشِ طرحِ شهریه،
      بدونِ دست‌خوردنِ تنظیماتِ اشتراک
   T4 سرتاسریِ سوپرادمین (کلیکِ واقعی): ذخیرهٔ قیمتِ اشتراک، بدونِ
      دست‌خوردنِ طرح‌هایِ شهریه (عدمِ تداخلِ دوطرفه)
   ───────────────────────────────────────────────────────────── */
const fs = require('fs');
const path = require('path');

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — سئوت رد شد.  (npm i --no-save jsdom)'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('\n▸ P1-3 — تفکیکِ plan-save شهریه/اشتراک (jsdom)');

  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
    virtualConsole: new VirtualConsole().on('jsdomError', () => {}).on('error', () => {}),
  });
  const win = dom.window;
  const W = (expr) => win.eval(expr);
  /* کلیکِ دفاعی روی دکمهٔ «ذخیره» مودال (هر data-actای که داشته باشد —
     زیرِ جهشِ M2 دکمه به گردانندهٔ اشتباه می‌رود و باید قرمزِ تمیز بدهد،
     نه کرش). خروجی: data-actِ کلیک‌شده یا 'missing'. */
  const clickModalSubmit = () => W(`(function(){
    var b=document.querySelector('#modal button.btn:not(.ghost)');
    if(!b) return 'missing';
    var act=b.getAttribute('data-act'); b.click(); return act;
  })()`);
  await sleep(2000);

  /* ── T1: رجیستری‌ها ── */
  chk('T1a نسخهٔ شهریه در F7 هست', W(`typeof F7_ACTIONS['tuition-plan-save']==='function'`));
  chk('T1b نسخهٔ کهنه از F7 رفته (سایه نمانده)', W(`F7_ACTIONS['plan-save']===undefined`));
  chk('T1c نسخهٔ اشتراک در A هست', W(`typeof financeActions()['plan-save']==='function'`));
  chk('T1d نسخهٔ شهریه در A نیست', W(`financeActions()['tuition-plan-save']===undefined`));
  W(`S.user=db.users.find(u=>u.role==='manager'&&u.school_id);S.persona=null;S.boss=null;planModal(null);`);
  chk('T1e دکمهٔ مودالِ طرح به نامِ تازه اشاره می‌کند',
    W(`(function(){var b=document.querySelector('#modal button[data-act="tuition-plan-save"]');return !!b;})()`) === true);
  W(`closeModal();`);

  /* ── T2: نقش‌ها ── */
  const roleCases = [
    ['manager', 'tuition-plan-save', true], ['superadmin', 'tuition-plan-save', true],
    ['teacher', 'tuition-plan-save', false], ['parent', 'tuition-plan-save', false],
    ['student', 'tuition-plan-save', false], ['edu_office', 'tuition-plan-save', false],
    ['counselor', 'tuition-plan-save', false], ['driver', 'tuition-plan-save', false],
    ['manager', 'plan-save', false], ['superadmin', 'plan-save', true],
  ];
  let rolesOk = true, rolesBad = '';
  for (const [role, act, want] of roleCases) {
    const got = W(`canAction('${act}','${role}')`);
    if (got !== want) { rolesOk = false; rolesBad += `${role}→${act}=${got}(want ${want}) `; }
  }
  chk('T2a جدولِ نقش‌ها (۱۰ حالت)', rolesOk, rolesBad);
  /* کنترلِ مثبت با S.user واقعی (نه فقط آرگومانِ صریح) */
  W(`S.user=db.users.find(u=>u.role==='manager'&&u.school_id);S.persona=null;S.boss=null;`);
  chk('T2b مدیرِ واقعی مجاز است', W(`canAction('tuition-plan-save')`) === true);
  chk('T2c مدیرِ واقعی به plan-saveِ اشتراک مجاز نیست', W(`canAction('plan-save')`) === false);

  /* ── T3: سرتاسریِ مدیر — کلیکِ واقعی ── */
  const mgr = JSON.parse(W(`JSON.stringify((function(){
    var m=db.users.find(function(u){return u.role==='manager'&&u.school_id;});
    S.user=m;S.persona=null;S.boss=null;
    return {id:m.id,school:m.school_id};
  })())`));
  const appBefore = W(`JSON.stringify(db.app_settings)`);
  const plansBefore = W(`db.tuition_plans.length`);
  W(`F7_ACTIONS['plan-new']();`);
  W(`document.getElementById('pl_title').value='طرح تستی تفکیک';
     document.getElementById('pl_amount').value='50000000';
     document.getElementById('pl_inst').value='5';
     document.getElementById('pl_int').value='30';`);
  const actNew = clickModalSubmit();
  const created = JSON.parse(W(`JSON.stringify(db.tuition_plans.filter(function(p){
    return p.title==='طرح تستی تفکیک';}).map(function(p){return {id:p.id,amount:p.amount,inst:p.installments,school:p.school_id};}))`));
  chk('T3a کلیکِ ذخیره، طرحِ شهریه ساخت (act=' + actNew + ')', created.length === 1, JSON.stringify(created));
  chk('T3b فیلدها + مدرسهٔ مدیر درست نشست',
    created.length === 1 && created[0].amount === 50000000 && created[0].inst === 5 && created[0].school === mgr.school,
    JSON.stringify(created));
  chk('T3c شمارِ طرح‌ها یکی زیاد شد', W(`db.tuition_plans.length`) === plansBefore + 1);
  chk('T3d تنظیماتِ اشتراک دست‌نخورد', W(`JSON.stringify(db.app_settings)`) === appBefore);
  /* ویرایش — دفاعی: اگر T3a شکست (جهش)، به‌جایِ کرش، قرمزِ تمیز بده */
  if (created.length === 1) {
    W(`F7_ACTIONS['plan-edit'](null,${created[0].id});`);
    W(`document.getElementById('pl_title').value='طرح تستی تفکیک (ویرایش)';`);
    clickModalSubmit();
    chk('T3e ویرایشِ طرح کار می‌کند',
      W(`(byId('tuition_plans',${created[0].id})||{}).title`) === 'طرح تستی تفکیک (ویرایش)');
    chk('T3f ویرایش رکوردِ تازه نساخت', W(`db.tuition_plans.length`) === plansBefore + 1);
  } else {
    chk('T3e ویرایشِ طرح کار می‌کند', false, 'پیش‌نیاز (T3a) شکست');
    chk('T3f ویرایش رکوردِ تازه نساخت', false, 'پیش‌نیاز (T3a) شکست');
  }

  /* ── T4: سرتاسریِ سوپرادمین — عدمِ تداخلِ دوطرفه ── */
  W(`S.user=db.users.find(u=>u.role==='superadmin');S.persona=null;S.boss=null;`);
  const plansBefore4 = W(`db.tuition_plans.length`);
  W(`(function(){var b=document.createElement('button');b.setAttribute('data-act','plan-settings');
    document.body.appendChild(b);b.click();b.remove();})();`);
  chk('T4a مودالِ اشتراک باز شد',
    W(`(function(){var b=document.querySelector('#modal button[data-act="plan-save"]');return !!b;})()`) === true);
  W(`document.getElementById('pl_m').value='1234567';`);
  W(`document.querySelector('#modal button[data-act="plan-save"]').click();`);
  chk('T4b قیمتِ ماهانه ذخیره شد', W(`subSettings().price_monthly`) === 1234567,
    'got=' + W(`subSettings().price_monthly`));
  chk('T4c طرح‌هایِ شهریه دست‌نخورد', W(`db.tuition_plans.length`) === plansBefore4);

  dom.window.close();
  console.log('\ntuition-plan: ' + okc + '/' + (okc + failc) + (failc ? ' — شکست: ' + fails.join(' | ') : '  ✅'));
  process.exit(failc ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
