#!/usr/bin/env node
/**
 * سئوت گیمیفیکیشن ابتدایی (بند ۵: لایهٔ امتیاز ClassDojo-وار) — پایش
 *
 * در پروسهٔ جداگانه اجرا می‌شود (نه داخل smoke.js).
 *
 * نکتهٔ مهم: در دادهٔ نمونه مدرسهٔ ابتدایی نیست (مقاطع دمو:
 * متوسطه اول/دوم) — پس فیکسور خود مدرسهٔ ابتدایی‌اش را می‌سازد:
 * مدرسه + کلاس (homeroom برای دبیر) + دبیر + مدیر + دو دانش‌آموز.
 *
 * بخش‌ها:
 *  J1 دروازهٔ مقطع و فعال‌سازی
 *  J2 امنیت ویرایش مدل (فقط مدیر؛ school_id روی داده)
 *  J3 چیپ‌ها + مسیر ذخیرهٔ انضباط + نبود چیپ در مقطع غیرابتدایی
 *  J4 نمایش (بج دانش‌آموز + تب پروندهٔ ولی + بدون مدل = بدون بج)
 *  J5 همگام‌سازی مدل (ویرایش/حذف) + بقای سابقه
 *  J6 اعتبارسنجی (نام خالی، مقدار صفر، بیش از حد)
 *
 * اجرا: node tests/dojo.js
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
  catch (e) { results.push({ name, ok: false, detail: String(e.message || e), ms: Date.now() - t0 }); }
};

/* ── فیکسور: مدرسهٔ ابتداییِ کوچک ─────────────────────────────── */
async function djFx(){
  return JSON.parse(W(`JSON.stringify((function(){
    var now = new Date().toISOString();
    var sch = add('schools',{name:'ابتدایی تستی ' + Date.now(),code:'DJTEST',city:'تست',address:'',
      phone:'09120000000', level:'ابتدایی', type:'عادی', gender:'پسرانه',
      branches:[], fields:[], shift:'صبح', capacity:100, active:1, created_at:now});
    var t = add('users',{school_id:sch.id,role:'teacher',full_name:'دبیر تستی دوژو',username:'djt_'+Date.now(),
      password:'x12345',national_id:'0000000001',phone:'09121111111',active:1,created_at:now});
    var mgr = add('users',{school_id:sch.id,role:'manager',full_name:'مدیر تستی دوژو',username:'djm_'+Date.now(),
      password:'x12345',national_id:'0000000002',phone:'09122222222',active:1,created_at:now});
    var cls = add('classes',{school_id:sch.id,name:'اول الف',grade:'اول',field:'عمومی',room:'ر1',
      capacity:30,homeroom_teacher_id:t.id});
    function mkStud(n){
      var s = add('users',{school_id:sch.id,role:'student',full_name:'دانش‌آموز تستی ' + n,
        username:'djs'+Date.now()+'_'+n, password:'x12345',national_id:'0000000003',phone:'09123333333',
        active:1,grade_level:'اول',created_at:now});
      add('enrollments',{school_id:sch.id,class_id:cls.id,student_id:s.id});
      return s.id;
    }
    var st1 = mkStud(1), st2 = mkStud(2);
    window.__djFx = {sch:sch.id,t:t.id,mgr:mgr.id,cls:cls.id,st1:st1,st2:st2};
    return {sch:sch.id,t:t.id,mgr:mgr.id,cls:cls.id,st1:st1,st2:st2};
  })())`));
}
async function djFxTearDown(){
  W(`(function(){
    var fx = window.__djFx;
    if(fx){
      db.dojo_types.filter(function(x){return x.school_id===fx.sch;}).forEach(function(x){remove('dojo_types',x.id);});
      db.discipline.filter(function(x){var s=byId('users',x.student_id);return s&&s.school_id===fx.sch;})
        .forEach(function(x){remove('discipline',x.id);});
      db.enrollments.filter(function(e){return e.class_id===fx.cls;}).forEach(function(e){remove('enrollments',e.id);});
      remove('users', fx.st1);
      remove('users', fx.st2);
      remove('users', fx.t);
      remove('users', fx.mgr);
      remove('classes', fx.cls);
      remove('schools', fx.sch);
    }
    window.__djFx = null;
  })()`);
}
/** تعریف مدل چهارنوعی روی مدرسهٔ فیکسور (مستقیم روی داده — برای بخش‌های نمایش) */
function djSeedTypes(schId){
  W(`(function(){
    var defs=[['احترام','🌟',1],['همکاری','🤝',1],['تلاش','💪',1],['نظم','⚠️',-1]];
    defs.forEach(function(d,i){ add('dojo_types',{school_id:${JSON.stringify(schId)},label:d[0],icon:d[1],delta:d[2],order:i}); });
  })()`);
}

(async () => {
  await sleep(300);

  await sec('J1 دروازهٔ مقطع: فقط ابتدایی + فقط با مدل تعریف‌شده', async () => {
    const fx = await djFx();
    try{
      const demoSch = JSON.parse(W(`JSON.stringify(db.schools.filter(function(s){return s.active;})[0].id)`));
      const r = JSON.parse(W(`JSON.stringify((function(){
        return {
          fxEl: schoolIsElementary(${fx.sch}),
          demoEl: schoolIsElementary(${demoSch}),
          availNoTypes: dojoAvailableForStudent(${fx.st1}),
          demoAvail: dojoAvailableForStudent((function(){var e=db.enrollments.filter(function(x){return x.school_id===${demoSch};})[0];return e?e.student_id:0;})())
        };
      })())`));
      assert(r.fxEl===true, 'مدرسهٔ فیکسور ابتدایی شناخته نشد');
      assert(r.demoEl===false, 'مدرسهٔ دمو (غیرابتدایی) ابتدایی شناخته شد!');
      assert(r.availNoTypes===false, 'بدون مدل تعریف‌شده، گیمیفیکیشن فعال است!');
      assert(r.demoAvail===false, 'مدرسهٔ غیرابتدایی دمو فعال شد!');
      djSeedTypes(fx.sch);
      const after = W(`dojoAvailableForStudent(${fx.st1})`);
      assert(after===true, 'با مدل تعریف‌شده فعال نشد');
    } finally { await djFxTearDown(); }
  });

  await sec('J2 امنیت مدل: معلم/سوپرادمین رد، مدیر قبول + school_id روی داده', async () => {
    const fx = await djFx();
    try{
      djSeedTypes(fx.sch);
      /* ۱) گارد اکشن: معلم نمی‌تواند دکمهٔ dojo-config را بزند */
      W(`S.user=byId('users',${fx.t});S.persona=null;S.boss=null;`);
      const blocked = JSON.parse(W(`JSON.stringify((function(){
        var el=document.createElement('button');
        el.setAttribute('data-act','dojo-config');
        document.body.appendChild(el); el.click(); el.remove();
        return {modal: document.querySelector('#modal').innerHTML.indexOf('مدل امتیازها')>=0};
      })())`));
      assert(blocked.modal===false, 'مودال مدل برای معلم باز شد!');
      /* ۲) فراخوانی مستقیم dojoSaveModel از معلم → رد (ردیف معتبر تا چک‌نقش تنها مانع باشد) */
      W(`(function(){ var host=document.querySelector('#modal'); host.innerHTML='<div data-drow><input class="d_icon" value="⭐"><input class="d_label" value="خونگی"><select class="d_delta"><option value="1" selected>1</option></select></div>'; })()`);
      const rTeacher = JSON.parse(W(`JSON.stringify(dojoSaveModel())`));
      assert(rTeacher.ok===false, 'معلم مدل را ذخیره کرد!');
      W(`closeModal()`);
      /* ۳) سوپرادمین (بدون مدرسه) → رد */
      W(`S.user=db.users.filter(function(x){return x.role==='superadmin';})[0];S.persona=null;S.boss=null;`);
      const rSa = JSON.parse(W(`JSON.stringify(dojoSaveModel())`));
      assert(rSa.ok===false, 'سوپرادمین بدون مدرسه مدل ذخیره کرد!');
      /* ۴) مدیر: افزودن نوع از مسیر UI */
      W(`S.user=byId('users',${fx.mgr});S.persona=null;S.boss=null;`);
      W(`dojoConfigModal()`);
      const before = W(`dojoTypes(${fx.sch}).length`);
      W(`(function(){
        var el=document.createElement('button');
        el.setAttribute('data-act','dojo-row-add');
        document.body.appendChild(el); el.click(); el.remove();
        var rows=document.querySelectorAll('#modal [data-drow]');
        rows[rows.length-1].querySelector('.d_label').value='مسئولیت‌پذیری';
      })()`);
      const rM = JSON.parse(W(`JSON.stringify(dojoSaveModel())`));
      assert(rM.ok===true, 'مدیر نتوانست مدل ذخیره کند: ' + (rM.msg||''));
      const rows = JSON.parse(W(`JSON.stringify(dojoTypes(${fx.sch}).map(function(t){return {school_id:t.school_id};}))`));
      assert(rows.length===before+1, 'ردیف تازه افزوده نشد');
      const sameSchool = W(`dojoTypes(${fx.sch}).every(function(t){return t.school_id===${fx.sch};})`);
      assert(sameSchool===true, 'school_id ردیف‌ها درست نیست');
    } finally { await djFxTearDown(); }
  });

  await sec('J3 چیپ‌ها: نمایش در فرم + پرکردن + ذخیره از disc-save + نبود در غیرابتدایی', async () => {
    const fx = await djFx();
    try{
      djSeedTypes(fx.sch);
      /* معلم فیکسور: فرم انضباط برای دانش‌آموز خودش — چیپ‌ها هست */
      W(`S.user=byId('users',${fx.t});S.persona=null;S.boss=null;S.filters={class:${fx.cls}};`);
      W(`discModal(null)`);
      const html1 = W(`document.querySelector('#modal').innerHTML`);
      assert(html1.indexOf('dojo-pick')>=0, 'چیپ‌ها در فرم نیستند');
      assert(html1.indexOf('احترام')>=0, 'برچسب مدل در چیپ نیست');
      /* کلیک چیپِ «نظم» (-۱) → عنوان/امتیاز/نوع پر می‌شود */
      W(`(function(){
        var chips=document.querySelectorAll('#modal [data-act="dojo-pick"]');
        for(var i=0;i<chips.length;i++){
          if(chips[i].textContent.indexOf('نظم')>=0){ chips[i].click(); break; }
        }
      })()`);
      const filled = JSON.parse(W(`JSON.stringify({
        title: V('d_title'), points: V('d_points'), kind: V('d_kind')
      })`));
      assert(filled.title==='نظم' && filled.points==='-1' && filled.kind==='negative', 'چیپ فرم را درست پر نکرد: ' + JSON.stringify(filled));
      /* ذخیره از مسیر مجاز disc-save */
      W(`(function(){
        var el=document.createElement('button');
        el.setAttribute('data-act','disc-save');
        document.body.appendChild(el); el.click(); el.remove();
      })()`);
      const total1 = W(`dojoTotal(${fx.st1})`);
      assert(total1===-1, 'امتیاز ثبت نشد (انتظار -1، شد ' + total1 + ')');
      /* مقطع غیرابتدایی: چیپ نباشد */
      const demoSch = JSON.parse(W(`JSON.stringify(db.schools.filter(function(s){return s.active;})[0])`));
      const dcls = JSON.parse(W(`JSON.stringify((function(){
        var c=db.classes.filter(function(x){return x.school_id===${demoSch.id};})[0];
        var t=db.users.filter(function(x){return x.role==='teacher'&&x.school_id===${demoSch.id};})[0];
        return c&&t?{cls:c.id,t:t.id}:{cls:0,t:0};
      })())`));
      if(dcls.t){
        W(`S.user=byId('users',${dcls.t});S.persona=null;S.boss=null;S.filters={class:${dcls.cls}};`);
        W(`discModal(null)`);
        const html2 = W(`document.querySelector('#modal').innerHTML`);
        assert(html2.indexOf('dojo-pick')<0, 'چیپ در مقطع غیرابتدایی نمایش داده شد!');
      }
    } finally { await djFxTearDown(); }
  });

  await sec('J4 نمایش: بج دانش‌آموز + تب پروندهٔ ولی + بدون مدل = بدون بج', async () => {
    const fx = await djFx();
    try{
      /* دو مورد: +۲ (احترام×۲) و -۱ (نظم) → خالص +۱ */
      W(`(function(){
        var now=todayISO();
        add('discipline',{school_id:${fx.sch},student_id:${fx.st1},date:now,kind:'positive',title:'احترام',description:'',points:2,created_by:${fx.t}});
        add('discipline',{school_id:${fx.sch},student_id:${fx.st1},date:now,kind:'negative',title:'نظم',description:'',points:-1,created_by:${fx.t}});
      })()`);
      /* بدون مدل: بج نیست (تب انضباطی پروندهٔ خودِ دانش‌آموز، با ردیف موجود) */
      W(`S.user=byId('users',${fx.st1});S.persona=null;S.boss=null;S.route='record';S.filters={};S.tab='discipline';S.page=1;`);
      let out = W(`renderRoute()`);
      assert(out.indexOf('مجموع امتیاز')<0, 'بج بدون مدل تعریف‌شده نمایش داده شد');
      djSeedTypes(fx.sch);
      W(`S.user=byId('users',${fx.st1});S.persona=null;S.boss=null;S.route='record';S.filters={};S.tab='discipline';S.page=1;`);
      out = W(`renderRoute()`);
      assert(out.indexOf('مجموع امتیاز: ۱')>=0, 'بجِ مجموع در نمای دانش‌آموز نیست: ' + (out.match(/مجموع امتیاز[^<]*/)||[''])[0]);
      /* تب انضباطی پرونده — ولی (با S.child) */
      W(`(function(){
        var par = add('users',{school_id:${fx.sch},role:'parent',full_name:'ولی تستی دوژو',username:'djp_'+Date.now(),
          password:'x12345',national_id:'0000000004',phone:'09124444444',active:1,created_at:new Date().toISOString()});
        add('parent_links',{parent_id:par.id,student_id:${fx.st1},relation:'مادر'});
        window.__djPar = par.id;
      })()`);
      W(`S.user=byId('users',window.__djPar);S.persona=null;S.boss=null;S.child=${fx.st1};S.route='record';S.filters={};S.tab='discipline';S.page=1;`);
      const rec = W(`renderRoute()`);
      assert(rec.indexOf('مجموع امتیاز: ۱')>=0, 'بج در تب پروندهٔ ولی نیست');
      W(`(function(){ remove('parent_links', db.parent_links.filter(function(p){return p.parent_id===window.__djPar;})[0].id); remove('users', window.__djPar); window.__djPar=null; })()`);
    } finally { await djFxTearDown(); }
  });

  await sec('J5 همگام‌سازی مدل: ویرایش/حذف + بقای سابقهٔ انضباطی', async () => {
    const fx = await djFx();
    try{
      djSeedTypes(fx.sch);
      W(`(function(){
        add('discipline',{school_id:${fx.sch},student_id:${fx.st1},date:todayISO(),kind:'positive',title:'احترام',description:'',points:2,created_by:${fx.t}});
      })()`);
      W(`S.user=byId('users',${fx.mgr});S.persona=null;S.boss=null;`);
      W(`dojoConfigModal()`);
      /* برچسبِ ردیف اول را عوض کن و ردیف آخر را حذف کن */
      W(`(function(){
        var rows=document.querySelectorAll('#modal [data-drow]');
        var first=rows[0].querySelector('.d_label');
        first.value='کلاس‌داری';
        var last=rows[rows.length-1];
        last.querySelector('[data-act="dojo-row-del"]').click();
      })()`);
      const r = JSON.parse(W(`JSON.stringify(dojoSaveModel())`));
      assert(r.ok===true, 'ذخیرهٔ همگام‌سازی شکست: ' + (r.msg||''));
      const chk = JSON.parse(W(`JSON.stringify((function(){
        var ts=dojoTypes(${fx.sch});
        return {n:ts.length, first:ts[0].label, hasNeg:ts.some(function(t){return t.delta<0;}),
                total:dojoTotal(${fx.st1})};
      })())`));
      assert(chk.n===3, 'حذف ردیف اعمال نشد (انتظار ۳، شد ' + chk.n + ')');
      assert(chk.first==='کلاس‌داری', 'ویرایش برچسب اعمال نشد');
      assert(chk.hasNeg===false, 'ردیف منفی حذف نشد');
      assert(chk.total===2, 'سابقهٔ انضباطی با حذف نوع از بین رفت!');
      /* دکمهٔ پیش‌فرض: وقتی مدرسهٔ ابتدایی هیچ نوعی نداشته باشد ظاهر می‌شود */
      W(`(function(){ dojoTypes(${fx.sch}).forEach(function(t){ remove('dojo_types',t.id); }); })()`);
      W(`dojoConfigModal()`);
      const btnVisible = W(`document.querySelector('#modal').innerHTML.indexOf('dojo-apply-defaults')>=0`);
      assert(btnVisible===true, 'دکمهٔ پیش‌فرض بدون مدل ظاهر نشد');
      W(`(function(){
        var el=document.createElement('button');
        el.setAttribute('data-act','dojo-apply-defaults');
        document.body.appendChild(el); el.click(); el.remove();
      })()`);
      const rDef = JSON.parse(W(`JSON.stringify(dojoSaveModel())`));
      assert(rDef.ok===true, 'ذخیرهٔ پیش‌فرض‌ها شکست: ' + (rDef.msg||''));
      const def = JSON.parse(W(`JSON.stringify(dojoTypes(${fx.sch}).map(function(t){return t.label;}))`));
      assert(def.length===4 && def[0]==='احترام' && def[3]==='نظم', 'پیش‌فرض‌ها درست اعمال نشدند: ' + JSON.stringify(def));
    } finally { await djFxTearDown(); }
  });

  await sec('J6 اعتبارسنجی: نام خالی / مقدار صفر / بیش از حد', async () => {
    const fx = await djFx();
    try{
      djSeedTypes(fx.sch);
      W(`S.user=byId('users',${fx.mgr});S.persona=null;S.boss=null;`);
      /* نام خالی */
      W(`dojoConfigModal()`);
      W(`(function(){ var r=document.querySelector('#modal [data-drow] .d_label'); r.value='   '; })()`);
      let r = JSON.parse(W(`JSON.stringify(dojoSaveModel())`));
      assert(r.ok===false && /نام/.test(r.msg||''), 'نام خالی رد نشد: ' + JSON.stringify(r));
      /* مقدار صفر (گزینهٔ مخفی — دفاع در عمق) */
      W(`dojoConfigModal()`);
      W(`(function(){ var s=document.querySelector('#modal [data-drow] .d_delta'); var o=document.createElement('option'); o.value='0'; s.appendChild(o); s.value='0'; })()`);
      r = JSON.parse(W(`JSON.stringify(dojoSaveModel())`));
      assert(r.ok===false && /صفر/.test(r.msg||''), 'مقدار صفر رد نشد: ' + JSON.stringify(r));
      /* بیش از حد (گزینهٔ مخفی — دفاع در عمق) */
      W(`dojoConfigModal()`);
      W(`(function(){ var s=document.querySelector('#modal [data-drow] .d_delta'); var o=document.createElement('option'); o.value='7'; s.appendChild(o); s.value='7'; })()`);
      r = JSON.parse(W(`JSON.stringify(dojoSaveModel())`));
      assert(r.ok===false && /حد/.test(r.msg||''), 'مقدار بیش از حد رد نشد: ' + JSON.stringify(r));
      W(`closeModal()`);
    } finally { await djFxTearDown(); }
  });

  const ok = results.filter((r) => r.ok).length;
  console.log('\n──────────────────────────────────────────');
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.name}  (${r.ms} ms)`);
    if (!r.ok) console.log('   ↳ ' + r.detail);
  }
  console.log('──────────────────────────────────────────');
  console.log(`سئوت دوژو: ${ok}/${results.length} موفق  —  ${ok===results.length?'بدون خطا ✅':'اشکال دارد ❌'}`);
  process.exit(ok === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
