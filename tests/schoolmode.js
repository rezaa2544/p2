#!/usr/bin/env node
/**
 * سئوت حالت حضوری/غیرحضوری مدرسه (بند ۱۳) — پایش
 *
 * در پروسهٔ جداگانه اجرا می‌شود (نه داخل smoke.js).
 *
 * بخش‌ها:
 *  S1 دادهٔ نمونه: مدرسهٔ دوم امروز غیرحضوری + مدرسهٔ اول حضوری (پیش‌فرض)
 *  S2 setSchoolMode: scope اداره (داخل قبول / بیرون رد) + مدیر (خود قبول /
 *     دیگر رد) + سوپرادمین قبول + دبیر/دانش‌آموز رد + upsert (ردیفِ واحد)
 *     + اعتبارسنجی حالت/تاریخ
 *  S3 نمایش: نوار در حضور/کلاس‌ها/کلاس مجازی/کتابخانه/مهمان/املاک
 *     (مدرسهٔ مجازی بله، حضوری نه) + کارت داشبورد مدیر + بج/دکمهٔ اداره
 *  S4 مودال حالت (فیلدها + مقدار پیش‌فرض از ردیفِ موجود)
 *
 * اجرا: node tests/schoolmode.js
 */
const fs = require('fs');
const path = require('path');

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — سئوت رد شد.  (npm i --no-save jsdom)'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
  virtualConsole: new VirtualConsole().on('jsdomError', () => {}).on('error', () => {}),
});
const win = dom.window;
const W = (expr) => win.eval(expr);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (c, m) => { if (!c) throw new Error(m || 'شرط برقرار نیست'); };

const results = [];
const sec = async (name, fn) => {
  const t0 = Date.now();
  try { await fn(); results.push({ name, ok: true, detail: '', ms: Date.now() - t0 }); }
  catch (e) { const stack1 = String((e.stack||'').split(String.fromCharCode(10))[1]||'').trim(); results.push({ name, ok: false, detail: String(e.message || e) + '  ||  ' + stack1, ms: Date.now() - t0 }); }
};

const setU = (id, extra) => W(`S.user=byId('users',${id});S.persona=null;S.boss=null;S.child=null;${extra||''}`);

(async () => {
  await sleep(300);
  const T = W(`todayISO()`);
  const fx = JSON.parse(W(`JSON.stringify((function(){
    var sc2 = db.schools[1], sc1 = db.schools[0], sc3 = db.schools[2];
    var offProv = db.users.filter(function(u){return u.role==='edu_office'&&byId('offices',u.office_id).level==='province'&&byId('offices',u.office_id).province_id===1;})[0];
    var offDist = db.users.filter(function(u){return u.role==='edu_office'&&byId('offices',u.office_id).level==='district';})[0];
    var offTehran = db.users.filter(function(u){return u.role==='edu_office'&&byId('offices',u.office_id).province_id===2;})[0];
    var mgr2 = db.users.filter(function(u){return u.role==='manager'&&u.school_id===sc2.id;})[0];
    var mgr1 = db.users.filter(function(u){return u.role==='manager'&&u.school_id===sc1.id;})[0];
    var t2 = db.users.filter(function(u){return u.role==='teacher'&&u.school_id===sc2.id;})[0];
    var t1 = db.users.filter(function(u){return u.role==='teacher'&&u.school_id===sc1.id;})[0];
    var sup = db.users.filter(function(u){return u.role==='superadmin';})[0];
    var st2 = db.users.filter(function(u){return u.role==='student'&&u.school_id===sc2.id;})[0];
    return {
      sc1:sc1.id, sc2:sc2.id, sc3:sc3.id,
      offProv:offProv?offProv.id:0, offDist:offDist?offDist.id:0, offTehran:offTehran?offTehran.id:0,
      mgr2:mgr2?mgr2.id:0, mgr1:mgr1?mgr1.id:0,
      t2:t2?t2.id:0, t1:t1?t1.id:0, sup:sup?sup.id:0, st2:st2?st2.id:0
    };
  })())`));

  await sec('S1 دادهٔ نمونه: مدرسهٔ دوم غیرحضوری + اولی حضوری', async () => {
    const r = JSON.parse(W(`JSON.stringify({
      v2: schoolModeOf(${fx.sc2},${JSON.stringify(T)}),
      v1: schoolModeOf(${fx.sc1},${JSON.stringify(T)}),
      rows: db.attendance_modes.length
    })`));
    assert(r.v2==='virtual', 'مدرسهٔ دوم دمو virtual نیست: ' + JSON.stringify(r));
    assert(r.v1==='in_person', 'مدرسهٔ اول باید پیش‌فرضِ حضوری باشد');
  });

  await sec('S2 setSchoolMode: scope + نقش + upsert + اعتبارسنجی', async () => {
    /* مدرسهٔ ۳ (تهران) را برای تستِ scope استفاده می‌کنیم — پس از آزمون پاک می‌شود */
    try{
      /* ادارهٔ استانِ دیگر: مدرسهٔ ۱ (خارج از scope) رد، مدرسهٔ ۳ (داخل) قبول */
      setU(fx.offTehran);
      let r = JSON.parse(W(`JSON.stringify(setSchoolMode(${fx.sc1},${JSON.stringify(T)},'virtual'))`));
      assert(r.ok===false, 'ادارهٔ استانِ دیگر مدرسهٔ بیرونِ scope را تغییر داد!');
      r = JSON.parse(W(`JSON.stringify(setSchoolMode(${fx.sc3},${JSON.stringify(T)},'virtual'))`));
      assert(r.ok===true, 'ادارهٔ تهران مدرسهٔ تهران را تغییر نداد: ' + (r.msg||''));
      /* ناحیهٔ سنندج: مدرسهٔ ۵ (همین شهرستان، ناحیهٔ دیگر) باید رد شود */
      const sc5 = W(`byId('schools', db.schools.filter(function(s){return s.province_id===1 && s.county_id!==1;})[0].id).id`);
      setU(fx.offDist);
      r = JSON.parse(W(`JSON.stringify(setSchoolMode(${sc5},${JSON.stringify(T)},'virtual'))`));
      assert(r.ok===false, 'ادارهٔ ناحیه مدرسهٔ ناحیهٔ دیگر را تغییر داد!');
      /* مدیر: مدرسهٔ خود قبول، مدرسهٔ دیگر رد */
      setU(fx.mgr2);
      r = JSON.parse(W(`JSON.stringify(setSchoolMode(${fx.sc3},${JSON.stringify(T)},'in_person'))`));
      assert(r.ok===false, 'مدیر مدرسهٔ دیگر را تغییر داد!');
      r = JSON.parse(W(`JSON.stringify(setSchoolMode(${fx.sc2},${JSON.stringify(T)},'in_person'))`));
      assert(r.ok===true, 'مدیر مدرسهٔ خود را تغییر نداد: ' + (r.msg||''));
      /* سوپرادمین: هر مدرسه‌ای */
      setU(fx.sup);
      r = JSON.parse(W(`JSON.stringify(setSchoolMode(${fx.sc1},${JSON.stringify(T)},'virtual'))`));
      assert(r.ok===true, 'سوپرادمین رد شد: ' + (r.msg||''));
      /* upsert: ردیفِ واحد */
      const n1 = W(`db.attendance_modes.filter(function(x){return x.school_id===${fx.sc1}&&x.date===${JSON.stringify(T)};}).length`);
      setU(fx.sup);
      JSON.parse(W(`JSON.stringify(setSchoolMode(${fx.sc1},${JSON.stringify(T)},'in_person'))`));
      const n2 = W(`db.attendance_modes.filter(function(x){return x.school_id===${fx.sc1}&&x.date===${JSON.stringify(T)};}).length`);
      assert(n1===1 && n2===1, 'upsert نشد — ردیفِ تکراری: ' + n1 + '/' + n2);
      const setBy = W(`byId('attendance_modes', db.attendance_modes.filter(function(x){return x.school_id===${fx.sc1}&&x.date===${JSON.stringify(T)};})[0].id).set_by`);
      assert(setBy===fx.sup, 'set_by ثبت نشد');
      /* دبیر/دانش‌آموز: رد */
      setU(fx.t2);
      r = JSON.parse(W(`JSON.stringify(setSchoolMode(${fx.sc2},${JSON.stringify(T)},'in_person'))`));
      assert(r.ok===false, 'دبیر حالت را تغییر داد!');
      setU(fx.st2);
      r = JSON.parse(W(`JSON.stringify(setSchoolMode(${fx.sc2},${JSON.stringify(T)},'in_person'))`));
      assert(r.ok===false, 'دانش‌آموز حالت را تغییر داد!');
      /* اعتبارسنجی */
      setU(fx.sup);
      r = JSON.parse(W(`JSON.stringify(setSchoolMode(${fx.sc3},'2026-13-99','virtual'))`));
      assert(r.ok===false, 'تاریخِ نامعتبر پذیرفته شد!');
      r = JSON.parse(W(`JSON.stringify(setSchoolMode(${fx.sc3},${JSON.stringify(T)},'hybrid'))`));
      assert(r.ok===false, 'حالتِ نامعتبر پذیرفته شد!');
    } finally {
      /* پاک‌سازی: همهٔ ردیف‌هایی که دمو نبودند (مدرسهٔ ۲، امروز) +
         برگرداندنِ ردیفِ دمو به virtual (تستِ مدیر آن را تغییر داده بود) */
      setU(fx.sup, '');
      W(`(function(){
        db.attendance_modes.slice().forEach(function(x){
          if(x.school_id!==${fx.sc2} || x.date!==${JSON.stringify(T)}) remove('attendance_modes', x.id);
        });
      })()`);
      JSON.parse(W(`JSON.stringify(setSchoolMode(${fx.sc2},${JSON.stringify(T)},'virtual'))`));
    }
  });

  await sec('S3 نمایش: نوار (۶ نما) + کارت مدیر + بج/دکمهٔ اداره', async () => {
    /* مدرسهٔ ۲ دمو virtual است: دبیرِ آن نوار می‌بیند */
    setU(fx.t2, `S.route='attendance';S.filters={};S.page=1;`);
    const outAtt = W(`renderRoute()`);
    assert(outAtt.indexOf('غیرحضوری (مجازی)')>=0, 'نوار در حضورِ مدرسهٔ مجازی نیست');
    for(const rt of ['classes','vclass']){
      setU(fx.t2, `S.route='${rt}';S.filters={};S.page=1;`);
      const out = W(`renderRoute()`);
      assert(out.indexOf('برای این روز به‌صورت خودکار مجازی‌اند')>=0, 'نوار در ' + rt + ' نیست');
    }
    /* فضاها (کتابخانه/مهمان/املاک) مخصوص مدیر — مدیرِ همان مدرسه می‌بیند */
    for(const rt of ['library','visitors','assets']){
      setU(fx.mgr2, `S.route='${rt}';S.filters={};S.page=1;`);
      const out = W(`renderRoute()`);
      assert(out.indexOf('برای این روز به‌صورت خودکار مجازی‌اند')>=0, 'نوار در ' + rt + ' نیست');
    }
    /* مدرسهٔ ۱ حضوری: نوار نیست */
    setU(fx.t1, `S.route='attendance';S.filters={};S.page=1;`);
    const outAtt1 = W(`renderRoute()`);
    assert(outAtt1.indexOf('غیرحضوری (مجازی)')<0, 'نوار در مدرسهٔ حضوری نباید بیاید');
    /* دانش‌آموز: نوار نمی‌بیند (مخصوص کارکنان) */
    setU(fx.st2, `S.route='attendance';S.filters={};S.page=1;`);
    const outSt = W(`renderRoute()`);
    assert(outSt.indexOf('برای این روز به‌صورت خودکار مجازی‌اند')<0, 'دانش‌آموز نوار دید!');
    /* کارتِ مدیرِ مدرسهٔ ۲: بج + دکمهٔ «حضوری کردن امروز» */
    setU(fx.mgr2, `S.route='dashboard';S.filters={};S.page=1;`);
    const outDash = W(`renderRoute()`);
    assert(outDash.indexOf('حالت مدرسه امروز')>=0, 'کارتِ حالت در داشبوردِ مدیر نیست');
    assert(outDash.indexOf('🏠 غیرحضوری')>=0, 'بجِ غیرحضوری نیست');
    assert(outDash.indexOf('حضوری کردن امروز')>=0, 'دکمهٔ toggle نیست');
    /* فهرستِ اداره: بج + دکمهٔ «حالت» روی ردیفِ مدرسهٔ ۲ */
    setU(fx.offProv, `S.route='officeschools';S.filters={};S.page=1;`);
    const outOff = W(`renderRoute()`);
    assert(outOff.indexOf('data-act="smode-open"')>=0, 'دکمهٔ «حالت» در اداره نیست');
    assert(outOff.indexOf('🏠 غیرحضوری')>=0 && outOff.indexOf('🏫 حضوری')>=0, 'بج‌های حالت نیستند');
  });

  await sec('S4 مودال حالت: فیلدها + مقدار پیش‌فرض', async () => {
    setU(fx.offProv, '');
    W(`smodeModal(${fx.sc2})`);
    const r = JSON.parse(W(`JSON.stringify({
      wid: window._smodeId,
      html: (document.getElementById('modal')||{}).innerHTML||''
    })`));
    assert(r.wid===fx.sc2, 'window._smodeId نشد');
    assert(r.html.indexOf('id="sm_date"')>=0 && r.html.indexOf('id="sm_mode"')>=0, 'فیلدها نیستند');
    assert(r.html.indexOf('selected')>=0, 'مقدار پیش‌فرض انتخاب نشده');
    W(`closeModal()`);
  });

  const ok = results.filter((r) => r.ok).length;
  console.log('\n──────────────────────────────────────────');
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.name}  (${r.ms} ms)`);
    if (!r.ok) console.log('   ↳ ' + r.detail);
  }
  console.log('──────────────────────────────────────────');
  console.log(`سئوت حالت مدرسه: ${ok}/${results.length} موفق  —  ${ok===results.length?'بدون خطا ✅':'اشکال دارد ❌'}`);
  process.exit(ok === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
