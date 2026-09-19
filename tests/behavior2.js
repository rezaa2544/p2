#!/usr/bin/env node
/**
 * سئوت گیمیفیکیشن رفتاری ۲ (E.3: امتیازِ سریع + کارتِ داشبورد + حذفِ دبیر از del)
 *
 * روی لایهٔ موجود (discipline + dojo) — بدونِ جدولِ موازی.
 * در پروسهٔ جداگانه اجرا می‌شود (نه داخل smoke.js).
 *
 * بخش‌ها:
 *  B1 ثبتِ سریع (فیلدها + دلتای مدل + جمع)
 *  B2 نگهبان‌ها (کلاسِ خود/مدیر/مقطع/مدل/نقش)
 *  B3 نماها (دکمهٔ ⭐ حضور، حذفِ مخفی برای دبیر، نوارِ داشبورد)
 *  B4 مدلِ سرور (del بدونِ دبیر + اکشنِ disc-quick)
 *
 * اجرا: node tests/behavior2.js
 */
const fs = require('fs');
const path = require('path');

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — سئوت رد شد.  (npm i --no-save jsdom)'); process.exit(1); }

const ROOT = path.join(__dirname, '..');
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

/* ── فیکسور ─────────────────────────────────────────────────────── */
function fx() {
  return J(`(function(){
    var now = new Date().toISOString();
    var tag = Date.now();
    function mkSchool(level){
      return add('schools',{name:'مدرسه تستی ' + level + tag,code:'BX'+tag+level,city:'تست',address:'',
        phone:'09120000000',level:level,type:'عادی',gender:'پسرانه',branches:[],fields:[],
        shift:'صبح',capacity:100,active:1,created_at:now});
    }
    function mkUser(schId, role, name, suffix){
      return add('users',{school_id:schId,role:role,full_name:name,username:'bx'+tag+suffix,
        password:'x12345',national_id:'0000000001',phone:'09121111111',active:1,
        grade_level:'اول',created_at:now});
    }
    var sch = mkSchool('ابتدایی');
    var sch2 = mkSchool('متوسطه اول');
    var t = mkUser(sch.id,'teacher','دبیر یک','t1');
    var t2 = mkUser(sch.id,'teacher','دبیر دو','t2');
    var mgr = mkUser(sch.id,'manager','مدیر','mg');
    var par = mkUser(sch.id,'parent','ولی','pa');
    var cls = add('classes',{school_id:sch.id,name:'اول الف',grade:'اول',field:'عمومی',room:'ر1',capacity:30,homeroom_teacher_id:t.id});
    var cls2 = add('classes',{school_id:sch.id,name:'اول ب',grade:'اول',field:'عمومی',room:'ر2',capacity:30,homeroom_teacher_id:t2.id});
    function mkStud(schId, clsId, n){
      var s = mkUser(schId,'student','دانش‌آموز ' + n,'s'+n+clsId);
      add('enrollments',{school_id:schId,class_id:clsId,student_id:s.id});
      return s.id;
    }
    var st1 = mkStud(sch.id, cls.id, 1), st2 = mkStud(sch.id, cls.id, 2);
    var stX = mkStud(sch.id, cls2.id, 3);
    var clsN = add('classes',{school_id:sch2.id,name:'هفتم الف',grade:'هفتم',field:'عمومی',room:'ر1',capacity:30,homeroom_teacher_id:t.id});
    var stN = mkStud(sch2.id, clsN.id, 4);
    add('parent_links',{parent_id:par.id,student_id:st1});
    /* مدلِ امتیاز: اولین مثبت دلتای ۲ دارد (تا دلتا تست شود) */
    add('dojo_types',{school_id:sch.id,label:'یاری',icon:'🤝',delta:2,order:0});
    add('dojo_types',{school_id:sch.id,label:'نظم',icon:'⚠️',delta:-1,order:1});
    window.__bxFx = {tag:tag,sch:sch.id,sch2:sch2.id,t:t.id,t2:t2.id,mgr:mgr.id,par:par.id,
      cls:cls.id,cls2:cls2.id,clsN:clsN.id,st1:st1,st2:st2,stX:stX,stN:stN};
    return window.__bxFx;
  })()`);
}
function fxDown() {
  W(`(function(){
    var fx = window.__bxFx;
    if(fx){
      db.dojo_types.filter(function(x){return x.school_id===fx.sch;}).forEach(function(x){remove('dojo_types',x.id);});
      db.discipline.filter(function(x){var s=byId('users',x.student_id);return s&&(s.school_id===fx.sch||s.school_id===fx.sch2);})
        .forEach(function(x){remove('discipline',x.id);});
      db.enrollments.filter(function(e){return e.class_id===fx.cls||e.class_id===fx.cls2||e.class_id===fx.clsN;})
        .forEach(function(e){remove('enrollments',e.id);});
      db.parent_links.filter(function(l){return l.student_id===fx.st1;}).forEach(function(l){remove('parent_links',l.id);});
      [fx.st1,fx.st2,fx.stX,fx.stN,fx.t,fx.t2,fx.mgr,fx.par].forEach(function(id){remove('users',id);});
      [fx.cls,fx.cls2,fx.clsN].forEach(function(id){remove('classes',id);});
      remove('schools',fx.sch); remove('schools',fx.sch2);
    }
    window.__bxFx = null;
  })()`);
}
function asUser(id) { W(`S.user = byId('users', ${id}); S.filters = {};`); }

async function main() {
  await sleep(300);
  const F = fx();
  try {
    await sec('B1 ثبتِ سریع', async () => {
      asUser(F.t);
      const before = J(`dojoTotal(${F.st1})`);
      const r = J(`dojoQuickAward(${F.st1})`);
      assert(r.ok === true, 'ثبتِ دبیرِ کلاسِ خود رد شد: ' + r.msg);
      const rec = J(`db.discipline.filter(function(d){return d.student_id===${F.st1};}).slice(-1)[0]`);
      assert(rec.kind === 'positive', 'kind باید positive باشد');
      assert(rec.points === 2, 'باید دلتای اولین نوعِ مثبت (۲) بنشیند، نشست: ' + rec.points);
      assert(rec.created_by === F.t, 'created_by باید دبیر باشد');
      assert(rec.school_id === F.sch, 'school_id باید مدرسه باشد');
      assert(/یاری/.test(rec.title), 'عنوان باید از مدل بیاید: ' + rec.title);
      assert(J(`dojoTotal(${F.st1})`) === before + 2, 'جمع باید ۲ تا بالا برود');
    });

    await sec('B2 نگهبان‌ها', async () => {
      asUser(F.t);
      const cross = J(`dojoQuickAward(${F.stX})`);
      assert(cross.ok === false, 'دبیر نباید به کلاسِ دیگر امتیاز بدهد');
      const other = J(`dojoQuickAward(${F.stN})`);
      assert(other.ok === false, 'مدرسه/مقطعِ دیگر باید رد شود');
      asUser(F.mgr);
      const m = J(`dojoQuickAward(${F.stX})`);
      assert(m.ok === true, 'مدیرِ هم‌مدرسه باید بتواند: ' + m.msg);
      asUser(F.par);
      assert(J(`dojoQuickAward(${F.st1})`).ok === false, 'ولی نباید ثبت کند');
      asUser(F.st1);
      assert(J(`dojoQuickAward(${F.st1})`).ok === false, 'دانش‌آموز نباید ثبت کند');
      /* مقطعِ غیرابتدایی حتی برای مدیر بسته است */
      asUser(F.mgr);
      assert(J(`dojoCanQuickAward(${F.stN})`) === false, 'غیرابتدایی باید بسته باشد');
      /* بدونِ مدل هم بسته است */
      const noModel = J(`(function(){
        var keep = db.dojo_types.filter(function(x){return x.school_id===${F.sch};});
        keep.forEach(function(x){remove('dojo_types',x.id);});
        var r = dojoCanQuickAward(${F.st1});
        keep.forEach(function(x){insert('dojo_types',{school_id:x.school_id,label:x.label,icon:x.icon,delta:x.delta,order:x.order});});
        return r;
      })()`);
      assert(noModel === false, 'بدونِ مدل باید بسته باشد');
    });

    await sec('B3 نماها', async () => {
      asUser(F.t);
      W(`S.filters = {class:${F.cls}, date:todayISO()};`);
      const row = W(`attRowHTML(byId('users',${F.st1}), 0, attCtx(${F.cls}, todayISO()))`);
      assert(row.indexOf('data-act="disc-quick"') >= 0, 'ردیفِ حضور باید دکمهٔ ⭐ داشته باشد');
      const rowX = W(`attRowHTML(byId('users',${F.stX}), 0, attCtx(${F.cls2}, todayISO()))`);
      assert(rowX.indexOf('disc-quick') < 0, 'دانش‌آموزِ کلاسِ دیگر نباید ⭐ ببیند');
      /* پرونده انضباطی: دبیر ویرایش می‌بیند ولی حذف نه؛ مدیر حذف می‌بیند */
      W(`S.filters = {};`);
      const dvT = W(`viewDiscipline()`);
      assert(dvT.indexOf('data-act="disc-edit"') >= 0, 'دبیر باید ویرایش ببیند');
      assert(dvT.indexOf('data-act="disc-del"') < 0, 'دبیر نباید حذف ببیند');
      asUser(F.mgr);
      const dvM = W(`viewDiscipline()`);
      assert(dvM.indexOf('data-act="disc-del"') >= 0, 'مدیر باید حذف ببیند');
      /* کارتِ داشبورد: نوارِ آخرین امتیازها برای دانش‌آموز */
      asUser(F.st1);
      const dash = W(`summaryBlock(${F.st1})`);
      assert(dash.indexOf('آخرین امتیازها') >= 0, 'داشبورد باید نوارِ امتیازها داشته باشد');
      assert(dash.indexOf('یاری') >= 0, 'نوار باید عنوانِ امتیازِ ثبت‌شده را نشان بدهد');
      asUser(F.par);
      const dashP = W(`summaryBlock(${F.st1})`);
      assert(dashP.indexOf('آخرین امتیازها') >= 0, 'داشبوردِ ولی باید نوارِ امتیازها داشته باشد');
    });

    await sec('B4 مدلِ سرور', async () => {
      const wp = JSON.parse(fs.readFileSync(path.join(ROOT, 'authz', 'write-perms.json'), 'utf8'));
      const del = wp.ops.discipline.del;
      assert(del.indexOf('teacher') < 0, 'دبیر باید از del انضباط بیرون باشد: ' + JSON.stringify(del));
      assert(del.indexOf('manager') >= 0, 'مدیر باید del داشته باشد');
      const q = wp.actions['disc-quick'];
      assert(q && q.roles.indexOf('teacher') >= 0 && q.roles.indexOf('manager') >= 0,
        'disc-quick باید teacher+manager باشد');
      assert(wp.ops.discipline.ins.indexOf('teacher') >= 0, 'دبیر باید ins داشته باشد');
    });
  } finally {
    fxDown();
  }

  console.log('──────────────────────────────────────────');
  let ok = 0;
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.name}  (${r.ms} ms)`);
    if (!r.ok) console.log('   ' + r.detail);
    else ok++;
  }
  console.log('──────────────────────────────────────────');
  console.log(`سوئیت رفتار ۲: ${ok}/${results.length} موفق  —  ${ok === results.length ? 'بدون خطا ✅' : 'اشکال دارد ❌'}`);
  process.exit(ok === results.length ? 0 : 1);
}
main();
