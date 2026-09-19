#!/usr/bin/env node
/**
 * تست‌های تولید خودکار برنامهٔ هفتگی (E.6)
 *  G1 خالصِ کوچک: ثبتِ کامل + تخصص + بی‌تداخلی + پراکندگی
 *  G2 دبیرِ مشترک: بدونِ تداخل در دو کلاس + احترام به رکوردِ سراسری
 *  G3 بازخورد: ظرفیتِ ناکافی و درسِ بدونِ متخصص
 *  G4 پس‌گردِ تک‌سطحی (جابه‌جاییِ قربانی)
 *  G5 رابط + ثبت: دکمهٔ مدیر، پیش‌نمایش، ثبت، بی‌تداخلی
 *  G6 قطعیت: تکرارِ یکسان
 *
 * اجرا:  node tests/schedule-gen.js   (نیازمند jsdom)
 */
const fs = require('fs');
const path = require('path');

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — تست رد شد.  (npm i --no-save jsdom)'); process.exit(1); }

const ROOT = path.join(__dirname, '..');
// hardening: rebuild base index.html (a previously crashed mutation suite may have left a mutated build)
try { require('child_process').execFileSync(process.execPath, ['build.js'], { cwd: ROOT, stdio: 'ignore' }); } catch (e) {}
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
  virtualConsole: new VirtualConsole().on('jsdomError', () => {}).on('error', () => {}),
});
const win = dom.window;
const W = (expr) => win.eval(expr);
const J = (expr) => JSON.parse(W(`JSON.stringify(${expr})`));
const assert = (c, m) => { if (!c) throw new Error(m || 'شرط برقرار نیست'); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const sec = async (name, fn) => {
  const t0 = Date.now();
  try { await fn(); results.push({ name, ok: true, detail: '', ms: Date.now() - t0 }); }
  catch (e) { results.push({ name, ok: false, detail: String(e.message || e), ms: Date.now() - t0 }); }
};

function noConflicts(pls) {
  const c = {}, t = {};
  for (const p of pls) {
    const kc = p.class_id + '|' + p.day + '|' + p.period;
    if (c[kc]) return 'class ' + kc;
    c[kc] = 1;
    if (p.teacher_id != null) {
      const kt = p.teacher_id + '|' + p.day + '|' + p.period;
      if (t[kt]) return 'teacher ' + kt;
      t[kt] = 1;
    }
  }
  return null;
}

async function main() {
  await sleep(300);

  await sec('G1 خالصِ کوچک', async () => {
    const r = J(`schedGenerate({
      classes: [{id:1,grade:'اول',field:''},{id:2,grade:'اول',field:''}],
      subjects: [{id:10,grade:'اول',field:'',weekly_hours:4},{id:11,grade:'اول',field:'',weekly_hours:2}],
      teachers: [{id:100,subject_id:10},{id:101,subject_id:11}],
      existing: [], days: [0,1,2,3,4], periodsPerDay: 6
    })`);
    assert(r.stats.demands === 12, 'تقاضا باید ۱۲ باشد: ' + r.stats.demands);
    assert(r.stats.unplaced === 0, 'همه باید ثبت شوند: ' + JSON.stringify(r.stats));
    assert(noConflicts(r.placements) === null, 'تداخل: ' + noConflicts(r.placements));
    /* تخصص: درسِ ۱۰ فقط با دبیرِ ۱۰۰ */
    const bad = r.placements.filter(p => p.subject_id === 10 && p.teacher_id !== 100);
    assert(bad.length === 0, 'درسِ تخصصی به غیرمتخصص رسید');
    const bad2 = r.placements.filter(p => p.subject_id === 11 && p.teacher_id !== 101);
    assert(bad2.length === 0, 'درسِ دوم هم باید به متخصصِ خودش برسد');
    /* پراکندگی: ۴ زنگِ درسِ ۱۰ در کلاسِ ۱ روی ۴ روزِ متفاوت */
    const days = r.placements.filter(p => p.class_id === 1 && p.subject_id === 10).map(p => p.day);
    assert(new Set(days).size === 4, 'پراکندگیِ روزانه رعایت نشد: ' + JSON.stringify(days));
  });

  await sec('G2 دبیرِ مشترک', async () => {
    const r = J(`schedGenerate({
      classes: [{id:1,grade:'اول',field:''},{id:2,grade:'اول',field:''}],
      subjects: [{id:10,grade:'اول',field:'',weekly_hours:6}],
      teachers: [{id:100,subject_id:10}],
      existing: [{class_id:99,teacher_id:100,subject_id:10,day:0,period:1}],
      days: [0,1,2,3,4], periodsPerDay: 6
    })`);
    assert(r.stats.unplaced === 0, 'باید همه ثبت شوند: ' + JSON.stringify(r.stats));
    assert(noConflicts(r.placements.concat([{ class_id: 99, teacher_id: 100, day: 0, period: 1 }])) === null,
      'تداخل با رکوردِ سراسری');
    /* دو کلاس نباید در یک (روز،زنگ) دبیرِ مشترک را بگیرند */
    const slots = r.placements.map(p => p.day + '|' + p.period);
    assert(new Set(slots).size === slots.length, 'دبیرِ مشترک تداخل گرفت');
  });

  await sec('G3 بازخورد', async () => {
    /* الف) ظرفیتِ ناکافی: ظرفیت ۶، تقاضا ۹ → ۳ تعیین‌نشدهٔ دلیل‌دار */
    const r = J(`schedGenerate({
      classes: [{id:1,grade:'اول',field:''}],
      subjects: [{id:10,grade:'اول',field:'',weekly_hours:8},{id:11,grade:'اول',field:'',weekly_hours:1}],
      teachers: [{id:100,subject_id:10}],
      existing: [], days: [0], periodsPerDay: 6
    })`);
    assert(r.stats.demands === 9, 'تقاضا باید ۹ باشد');
    assert(r.stats.unplaced === 3, 'تعیین‌نشده باید ۳ باشد: ' + JSON.stringify(r.stats));
    assert(r.unplaced.every(u => typeof u.reason === 'string' && u.reason.length > 0), 'هر تعیین‌نشده باید دلیل داشته باشد');
    /* ب) درسِ بدونِ متخصص (با ظرفیتِ کافی) → teacher_id تهی */
    const r2 = J(`schedGenerate({
      classes: [{id:1,grade:'اول',field:''}],
      subjects: [{id:10,grade:'اول',field:'',weekly_hours:2},{id:11,grade:'اول',field:'',weekly_hours:1}],
      teachers: [{id:100,subject_id:10}],
      existing: [], days: [0], periodsPerDay: 6
    })`);
    assert(r2.stats.unplaced === 0, 'با ظرفیتِ کافی همه باید ثبت شوند');
    const s11 = r2.placements.filter(p => p.subject_id === 11);
    assert(s11.length === 1 && s11[0].teacher_id == null, 'درسِ بدونِ متخصص باید با دبیرِ تهی ثبت شود');
    assert(r2.stats.noSpecialist === 1, 'شمارِ بدونِ متخصص باید ۱ باشد');
    /* ج) پوششِ فعلی از تقاضا کم می‌شود (اجرایِ دوباره دوبرابر نمی‌کند) */
    const r3 = J(`schedGenerate({
      classes: [{id:1,grade:'اول',field:''}],
      subjects: [{id:10,grade:'اول',field:'',weekly_hours:2}],
      teachers: [{id:100,subject_id:10}],
      existing: [{class_id:1,teacher_id:100,subject_id:10,day:0,period:1}],
      days: [0], periodsPerDay: 6
    })`);
    assert(r3.stats.demands === 1 && r3.stats.placed === 1, 'تقاضا باید ۲−۱=۱ شود: ' + JSON.stringify(r3.stats));
  });

  await sec('G4 پس‌گرد', async () => {
    /* حریصانه: A(روز۰) بعد B بی‌جا می‌ماند؛ با جابه‌جایی هر دو می‌نشینند */
    const r = J(`schedGenerate({
      classes: [{id:1,grade:'اول',field:''}],
      subjects: [{id:10,grade:'اول',field:'',weekly_hours:1},{id:11,grade:'اول',field:'',weekly_hours:1}],
      teachers: [{id:100,subject_id:10},{id:101,subject_id:11}],
      existing: [{class_id:99,teacher_id:101,subject_id:11,day:1,period:1}],
      days: [0,1], periodsPerDay: 1
    })`);
    assert(r.stats.placed === 2 && r.stats.unplaced === 0,
      'پس‌گرد باید هر ۲ را بنشاند: ' + JSON.stringify(r.stats));
    assert(noConflicts(r.placements.concat([{ class_id: 99, teacher_id: 101, day: 1, period: 1 }])) === null,
      'تداخل پس از پس‌گرد');
    const b = r.placements.filter(p => p.subject_id === 11)[0];
    assert(b.day === 0, 'درسِ B باید روزِ ۰ بنشیند (روزِ ۱ دبیرش مشغول است)');
  });

  await sec('G5 رابط + ثبت', async () => {
    const F = J(`(function(){
      var now = new Date().toISOString(), tag = 'SG' + Date.now();
      var sch = add('schools',{name:'مدرسه '+tag,code:tag,city:'تست',address:'',phone:'09120000000',
        level:'متوسطه اول',type:'عادی',gender:'پسرانه',branches:[],fields:[],shift:'صبح',
        capacity:100,active:1,created_at:now});
      var mgr = add('users',{school_id:sch.id,role:'manager',full_name:'مدیر '+tag,username:'sgm'+tag,
        password:'x12345',national_id:'0000000001',phone:'09121111111',active:1,created_at:now});
      var sub1 = add('subjects',{school_id:sch.id,name:'ریاضی '+tag,code:'',weekly_hours:4,grade:'هفتم',field:''});
      var sub2 = add('subjects',{school_id:sch.id,name:'ورزش '+tag,code:'',weekly_hours:2,grade:'هفتم',field:''});
      var t1 = add('users',{school_id:sch.id,role:'teacher',full_name:'دبیر '+tag,username:'sgt'+tag,
        password:'x12345',national_id:'0000000002',phone:'09122222222',active:1,subject_id:sub1.id,created_at:now});
      var cls = add('classes',{school_id:sch.id,name:'هفتم الف '+tag,grade:'هفتم',field:'عمومی',room:'ر1',
        capacity:30,homeroom_teacher_id:t1.id});
      return {sch:sch.id, mgr:mgr.id, t1:t1.id, cls:cls.id, sub1:sub1.id, sub2:sub2.id};
    })()`);
    try {
      W(`S.user = byId('users', ${F.mgr}); S.filters = {class:${F.cls}};`);
      const mgrView = W(`viewSchedule()`);
      assert(mgrView.indexOf('data-act="schedgen-open"') >= 0, 'مدیر باید دکمهٔ تولید خودکار ببیند');
      W(`S.user = byId('users', ${F.t1}); S.filters = {};`);
      const tView = W(`viewSchedule()`);
      assert(tView.indexOf('schedgen-open') < 0, 'دبیر نباید دکمهٔ تولید ببیند');
      W(`S.user = byId('users', ${F.mgr}); S.filters = {class:${F.cls}};`);
      W(`schedgenPreviewModal(${F.sch})`);
      const pv = J(`window._schedgen.res.stats`);
      assert(pv.demands === 6 && pv.placed === 6, 'پیش‌نمایش باید ۶/۶ باشد: ' + JSON.stringify(pv));
      const ap = J(`schedgenApply()`);
      assert(ap.ok === true, 'ثبت رد شد: ' + ap.msg);
      const n = J(`db.schedule.filter(function(x){return x.class_id===${F.cls};}).length`);
      assert(n === 6, 'باید ۶ ردیف ثبت شود، شد: ' + n);
      const confs = J(`scheduleConflicts(${F.sch})`);
      assert(confs.length === 0, 'برنامهٔ تولیدشده باید بی‌تداخل باشد: ' + JSON.stringify(confs).slice(0, 200));
      /* ثبتِ دوباره چیزی اضافه نمی‌کند (پوششِ کامل → تقاضای صفر) */
      W(`schedgenPreviewModal(${F.sch})`);
      const pv2 = J(`window._schedgen.res.stats`);
      assert(pv2.demands === 0 && pv2.placed === 0, 'پیش‌نمایشِ دوباره باید تقاضای صفر بدهد: ' + JSON.stringify(pv2));
      const ap2 = J(`schedgenApply()`);
      const n2 = J(`db.schedule.filter(function(x){return x.class_id===${F.cls};}).length`);
      assert(ap2.ok === true && n2 === 6, 'ثبتِ دوباره نباید ردیف اضافه کند');
    } finally {
      W(`(function(){
        db.schedule.filter(function(x){return x.class_id===${F.cls};}).forEach(function(x){remove('schedule',x.id);});
        remove('classes',${F.cls}); remove('subjects',${F.sub1}); remove('subjects',${F.sub2});
        remove('users',${F.t1}); remove('users',${F.mgr}); remove('schools',${F.sch});
        window._schedgen = null;
      })()`);
    }
  });

  await sec('G6 قطعیت', async () => {
    const a = W(`JSON.stringify(schedGenerate({
      classes: [{id:1,grade:'اول',field:''},{id:2,grade:'اول',field:''}],
      subjects: [{id:10,grade:'اول',field:'',weekly_hours:5},{id:11,grade:'اول',field:'',weekly_hours:3}],
      teachers: [{id:100,subject_id:10},{id:101,subject_id:11}],
      existing: [{class_id:99,teacher_id:100,subject_id:10,day:2,period:3}],
      days: [0,1,2,3,4], periodsPerDay: 6
    }))`);
    const b = W(`JSON.stringify(schedGenerate({
      classes: [{id:1,grade:'اول',field:''},{id:2,grade:'اول',field:''}],
      subjects: [{id:10,grade:'اول',field:'',weekly_hours:5},{id:11,grade:'اول',field:'',weekly_hours:3}],
      teachers: [{id:100,subject_id:10},{id:101,subject_id:11}],
      existing: [{class_id:99,teacher_id:100,subject_id:10,day:2,period:3}],
      days: [0,1,2,3,4], periodsPerDay: 6
    }))`);
    assert(a === b, 'دو اجرا باید یکسان باشند');
  });

  console.log('──────────────────────────────────────────');
  let ok = 0;
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.name}  (${r.ms} ms)`);
    if (!r.ok) console.log('   ' + r.detail);
    else ok++;
  }
  console.log('──────────────────────────────────────────');
  console.log(`سوئیت زمان‌بند: ${ok}/${results.length} موفق  —  ${ok === results.length ? 'بدون خطا ✅' : 'اشکال دارد ❌'}`);
  process.exit(ok === results.length ? 0 : 1);
}
main();
