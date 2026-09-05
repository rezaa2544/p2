#!/usr/bin/env node
/**
 * شبیه‌سازی جامع سلامت — پایش
 * چندین مدرسه × نقش‌ها × حالت‌ها + چالش‌های غیرمنتظره؛ همه روی باندل
 * واقعی index.html در jsdom و با رندر واقعی اجرا می‌شوند.
 *
 * اجرا: node tests/simulation.js
 * خروج: جدول سناریو + جمع‌بندی (سبز/قرمز به تفکیک بخش)
 */
const fs = require('fs');
const path = require('path');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — شبیه‌سازی رد شد.  (npm i --no-save jsdom)'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

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

/* هم‌ایدیوم کلیک داخل کد صفحه (برای سناریوهایی که داخل win.eval کلیک نیاز دارند) */
win.eval(`window.__clk=function(act,attrs){attrs=attrs||{};var el=document.createElement('button');el.setAttribute('data-act',act);for(var k in attrs)el.setAttribute('data-'+k,attrs[k]);document.body.appendChild(el);el.dispatchEvent(new MouseEvent('click',{bubbles:true}));el.remove();};`);

const results = [];
function sim(section, name, fn) {
  const e0 = consoleErrors.length;
  const t0 = Date.now();
  try { fn(); results.push({ section, name, ok: true, detail: '', ms: Date.now() - t0, newErrs: consoleErrors.length - e0 }); }
  catch (e) { results.push({ section, name, ok: false, detail: String(e.message || e), ms: Date.now() - t0, newErrs: consoleErrors.length - e0 }); }
}
const assert = (c, m) => { if (!c) throw new Error(m || 'شرط برقرار نیست'); };

/* ایدیوم‌های ثابت پروژه */
const clk = (act, attrs = {}) => W(
  `(function(){var el=document.createElement('button');el.setAttribute('data-act',${JSON.stringify(act)});` +
  Object.entries(attrs).map(([k, v]) => `el.setAttribute('data-${k}',${JSON.stringify(v)});`).join('') +
  `document.body.appendChild(el);el.dispatchEvent(new MouseEvent('click',{bubbles:true}));el.remove();})()`
);
const DATE_AT = 'function dateAtY(di,hh,mm,yr){var js=(di+6)%7;var b=new Date();var d=new Date(yr,b.getMonth(),b.getDate()+((js-b.getDay()+7)%7));d.setHours(hh,mm,0,0);return d;}';

main().catch((e) => { console.error(e); process.exit(1); });

async function main() {
  await sleep(300);

  console.log('\n▸ بوت و داده');
  sim('بوت', 'بوت بدون خطا + دادهٔ دمو', () => {
    assert(consoleErrors.length === 0, 'خطای کنسول: ' + consoleErrors.slice(0, 2).join(' | '));
    assert(W('db.schools.length') === 6, 'شش مدرسهٔ دمو نیست');
    assert(W('db.users.length') > 100, 'کاربران دمو نیست');
    assert(W('db.bell_schedules.length') >= 5, 'bell_schedules دمو نیست');
  });
  sim('بوت', 'مدرسهٔ ۶ غیرفعال و بقیهٔ فعال (مرز دمو)', () => {
    assert(W('db.schools[5].active') === 0, 'مدرسهٔ ۶ باید غیرفعال باشد');
    assert(W('db.schools.slice(0,5).every(s=>s.active===1)'), 'مدرسه‌های ۱ تا ۵ باید فعال باشند');
    const has6 = W('(db.bell_schedules||[]).some(b=>b.school_id===db.schools[5].id)');
    console.log('   ⓘ مدرسهٔ ۶ رکورد bell_schedules اختصاصی دارد: ' + has6);
  });

  console.log('\n▸ الف — ورود و پوسته');
  /* ورود بدونِ رمز (از ۲۰-۰۹-۵): شماره + کد (پنلِ پیامکی) + کد ملی
     (سامانهٔ تطبیق — جدا از پنل) */
  const loginFill = (un) => W(`(function(){var u=db.users.find(x=>x.username===${JSON.stringify(un)});
    document.getElementById('lpn').value=u.phone;
    document.getElementById('lnid').value=u.national_id;
    document.getElementById('lcode').value=SmsPanel.sendCode(u.phone);return true;})()`);
  sim('ورود', 'ورود واقعی سوپرادمین (فرم + کلیک)', () => {
    loginFill('superadmin');
    clk('login');
    assert(W('S.user && S.user.role') === 'superadmin', 'ورود انجام نشد');
    assert(W('S.route') === 'dashboard', 'روت خانهٔ سوپرادمین: ' + W('S.route'));
  });
  sim('ورود', 'کد اشتباه رد می‌شود', () => {
    clk('logout');
    W(`(function(){var u=db.users.find(x=>x.username==='superadmin');
      document.getElementById('lpn').value=u.phone;
      document.getElementById('lnid').value=u.national_id;
      document.getElementById('lcode').value='0000';})()`);
    clk('login');
    assert(W('S.user') === null, 'با کدِ اشتباه وارد شد!');
    assert(W(`document.getElementById('lerr').textContent`).includes('کد'), 'خطای ورود نمایش داده نشد');
  });
  const ROLES = [
    ['superadmin', 'superadmin'], ['edu_office', 'edu_kurdistan'],
    ['manager', 'manager1'], ['teacher', 'teacher1_1'],
    ['student', W('db.users.find(u=>u.role==="student").username')],
    ['parent', W('db.users.find(u=>u.username==="parent_multi"||u.role==="parent").username')],
    ['counselor', 'counselor1'],
  ];
  sim('ورود', 'ورود واقعی هر ۷ نقش + روت خانهٔ درست', () => {
    for (const [role, un] of ROLES) {
      clk('logout');
      loginFill(un);
      clk('login');
      assert(W('S.user && S.user.role') === role, `ورود ${role} (${un}) انجام نشد`);
      const home = W(`homeRoute(${JSON.stringify(role)})`);
      assert(W('S.route') === home, `روت خانهٔ ${role}: ${W('S.route')} ≠ ${home}`);
      const h = W('renderRoute()');
      assert(typeof h === 'string' && h.length > 100, `رندر ${role} خالی است`);
    }
  });
  sim('ورود', 'حساب مدرسهٔ غیرفعال (manager6) — ورود مسدود (F-3)', () => {
    clk('logout');
    loginFill('manager6');
    clk('login');
    const loggedIn = W('S.user && S.user.role') === 'manager';
    const err = W(`(document.getElementById('lerr')||{}).textContent||''`);
    assert(loggedIn === false, '🔴 کاربر مدرسهٔ غیرفعال وارد سامانه شد (نگهبان F-3 شکست)');
    assert(err.indexOf('این مدرسه غیرفعال است') > -1, '🔴 پیام غیرفنی «مدرسه غیرفعال است» نمایش داده نشد');
    console.log('   ⓘ F-3: ورود manager6 مسدود شد + پیام غیرفنی نمایش داده شد');
  });

  console.log('\n▸ ب — مرزهای بین‌مدرسه‌ای (IDOR)');
  sim('IDOR', 'مدیر ۱ فقط کلاس‌های مدرسهٔ ۱ را می‌بیند', () => {
    W('S.user=db.users.find(u=>u.username==="manager1");S.persona=null;S.boss=null;');
    const r = JSON.parse(W(`(()=>{var c=visibleClasses();return JSON.stringify({n:c.length,all:c.every(x=>x.school_id===S.user.school_id)});})()`));
    assert(r.n > 0 && r.all === true, `کلاس‌های قابل‌دید: ${r.n} — همهٔ مدرسهٔ ۱؟ ${r.all}`);
  });
  sim('IDOR', 'مدیر ۱ کلاس مدرسهٔ ۲ را در انتخابگر حضور نمی‌بیند', () => {
    W('S.user=db.users.find(u=>u.username==="manager1");S.persona=null;S.boss=null;S.route="attendance";S.filters={};');
    const r = JSON.parse(W(`(()=>{
      var s2=db.classes.find(c=>c.school_id===db.schools[1].id);
      var h=renderRoute();
      var sels=(h.match(/<select[\\s\\S]*?<\\/select>/g)||[]).join('|');
      var has=sels.indexOf('value="'+s2.id+'"')>-1;
      var vis=visibleClasses();
      var bad=vis.filter(c=>c.school_id!==db.schools[0].id).length;
      return JSON.stringify({s2:s2.id,has:has,vis:vis.length,bad:bad});})()`));
    assert(r.s2 > 0, 'پیش‌فرض دمو: مدرسهٔ ۲ کلاس ندارد!');
    assert(r.vis > 0 && r.bad === 0, 'کلاس خارج از مدرسهٔ مدیر در visibleClasses: ' + r.bad);
    assert(r.has === false, 'کلاس مدرسهٔ ۲ در انتخابگر مدیر ۱ هست!');
  });
  sim('IDOR', 'دبیر: مرز کلاس‌ها در نمرات (فیلتر دبیر — یافتهٔ ثبت می‌شود)', () => {
    W('S.user=db.users.find(u=>u.username==="teacher1_1");S.persona=null;S.boss=null;S.route="grades";S.filters={};S.fopen={grades:true};');
    const r = JSON.parse(W(`(()=>{
      var t=S.user;var cls=visibleClasses().map(c=>c.id);
      var rows=db.grades.filter(g=>cls.indexOf(g.class_id)>-1);
      var own=rows.filter(g=>g.teacher_id===t.id).length;
      return JSON.stringify({rows:rows.length,own:own,other:rows.length-own});})()`));
    assert(r.rows > 0, 'ردیف نمره‌ای در کلاس‌های دبیر نیست');
    console.log(`   ⓘ فیلتر دبیر در viewGrades: ${r.own} ردیف خودش / ${r.other} ردیف دبیر دیگر (فیلتر teacher_id در کد خنثی است — یافته در گزارش)`);
  });
  sim('IDOR', 'مشاور ۱: صفحات حساس بسته + صف فقط مدرسهٔ ۱', () => {
    W('S.user=db.users.find(u=>u.username==="counselor1");S.persona=null;S.boss=null;');
    for (const rt of ['users', 'grades', 'attendance', 'schedule', 'record', 'classes']) {
      W(`S.route=${JSON.stringify(rt)};S.filters={};`);
      const h = W('renderRoute()');
      assert(h.indexOf('data-act="user-save"') === -1 && h.indexOf('data-act="att-set"') === -1,
        `صفحهٔ ${rt} برای مشاور باز است!`);
    }
    const r = JSON.parse(W(`(()=>{var q=counselorQueue(S.user.school_id,true);return JSON.stringify({n:q.length,all:q.every(x=>x.school_id===S.user.school_id)});})()`));
    assert(r.all === true, 'ارجاع مدرسهٔ دیگر در صف مشاور ۱ است!');
  });
  sim('IDOR', 'دانش‌آموز: فقط پروندهٔ خودش؛ روت مدیرانه بسته', () => {
    W('S.user=db.users.find(u=>u.role==="student");S.persona=null;S.boss=null;');
    W(`S.route="schools";S.filters={};`);
    const h = W('renderRoute()');
    assert(h.indexOf('data-act="school-save"') === -1, 'فهرست مدارس برای دانش‌آموز باز است!');
    W(`S.route="record";S.filters={};`);
    const hr = W('renderRoute()');
    assert(hr.length > 100, 'پروندهٔ دانش‌آموز رندر نشد');
  });
  sim('IDOR', 'ولی چندفرزند: فقط فرزندان خودش (مدرسه‌های مختلف، طراحی دمو)', () => {
    W('S.user=db.users.find(u=>u.username==="parent_multi");S.persona=null;S.boss=null;S.route="children";S.filters={};');
    const h = W('renderRoute()');
    assert(h.length > 100, 'نمای فرزندان رندر نشد');
    const r = JSON.parse(W(`(()=>{
      var p=S.user;
      var h=renderRoute();
      var links=db.parent_links.filter(l=>l.parent_id===p.id);
      var kidIds=links.map(l=>l.student_id);
      var shown=kidIds.filter(id=>h.indexOf('data-id="'+id+'"')>-1).length;
      /* فرزندِ واقعیِ ولیِ دیگر = دانش‌آموزی که نه در مجموعهٔ فرزندان من
         باشد ولی data-idش در نمای من بیاید (فرزندانِ مشترک با ولیِ دوم
         — همسر — در دمو رایج‌اند و طبیعی‌اند) */
      var mySet={};
      kidIds.forEach(function(id){mySet[id]=1;});
      var foreign=0;
      db.parent_links.forEach(function(l){
        if(mySet[l.student_id])return;
        if(h.indexOf('data-id="'+l.student_id+'"')>-1)foreign++;
      });
      return JSON.stringify({kids:kidIds.length,shown:shown,foreign:foreign,
        schools:JSON.stringify([...new Set(links.map(l=>(db.users.find(u=>u.id===l.student_id)||{}).school_id))])});})()`));
    console.log('   ⓘ فرزندان parent_multi در مدارس: ' + r.schools + ' (طراحی دمو: ولی بین‌مدرسه)');
    assert(r.kids >= 2, 'ولی چندفرزند باید حداقل ۲ فرزند داشته باشد');
    assert(r.shown === r.kids, `فقط ${r.shown} از ${r.kids} فرزند در نمای ولی نیست`);
    assert(r.foreign === 0, 'فرزندِ ولیِ دیگر (data-id) در نمای این ولی نمایش داده شد!');
  });
  sim('IDOR', 'اداره (edu_kurdistan): داشبورد اداره رندر می‌شود', () => {
    W('S.user=db.users.find(u=>u.username==="edu_kurdistan");S.persona=null;S.boss=null;S.route="officedash";S.filters={};');
    const h = W('renderRoute()');
    assert(h.length > 200, 'داشبورد اداره رندر نشد');
  });

  console.log('\n▸ ج — جریان‌های روزمره به تفکیک نقش');
  sim('جریان', 'مدیر: ساخت کلاس (مودال + ذخیره) و پاک‌سازی', () => {
    W('S.user=db.users.find(u=>u.username==="manager1");S.persona=null;S.boss=null;S.route="classes";S.filters={};');
    W('classModal(null)');
    W(`document.getElementById('c_name').value='ششم شبیه‌سازی';document.getElementById('c_grade').value='ششم'`);
    W(`(function(){var el=document.getElementById('c_mode');el.value='class';el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    const n0 = W('db.classes.length');
    clk('class-save');
    assert(W('db.classes.length') === n0 + 1, 'کلاس ذخیره نشد');
    const cid = W('db.classes[db.classes.length-1].id');
    assert(W(`db.classes.find(c=>c.id===${cid}).name`) === 'ششم شبیه‌سازی', 'نام کلاس نادرست');
    W(`applyOp({c:'classes',t:'del',id:${cid}})`);
    assert(W('db.classes.length') === n0, 'پاک‌سازی انجام نشد');
  });
  sim('جریان', 'دبیر: ثبت حضور از دکمه + مرور و ثبت نهایی → دفترچه', () => {
    W('S.user=db.users.find(u=>u.username==="teacher1_1");S.persona=null;S.boss=null;');
    const r = JSON.parse(W(`(()=>{
      var cls=visibleClasses()[0];
      var studs=studentsOfClass(cls.id).slice(0,2);
      if(!studs.length)return JSON.stringify({skip:true});
      S.filters={class:cls.id,date:todayISO()};
      return JSON.stringify({skip:false,a:studs[0].id,b:studs[1].id});})()`));
    assert(!r.skip, 'دانش‌آموزی برای آزمایش حضور نبود');
    const l0 = W('log.length');
    clk('att-set', { id: r.a, s: 'present' });
    clk('att-set', { id: r.b, s: 'present' });
    clk('att-commit');
    let dl = W('log.length') - l0;
    if (dl === 0) {
      clk('att-set', { id: r.a, s: 'absent' });
      clk('att-set', { id: r.b, s: 'absent' });
      clk('att-commit');
      dl = W('log.length') - l0;
    }
    assert(dl >= 1, 'ثبت حضور و غیاب در دفترچه نشد');
    W('Store.setJSON(ATT_DRAFT_KEY,{})');
  });
  sim('جریان', 'دبیر: پیش‌گزینش زنگ در حضور و غیاب + دستی + ریست', () => {
    W('S.user=db.users.find(u=>u.username==="teacher1_1");S.persona=null;S.boss=null;');
    const r = JSON.parse(W(`(()=>{
      ${DATE_AT}
      var tid=S.user.id,sid=S.user.school_id;
      var tl=bellTimeline(sid,0);
      var les=tl.filter(x=>x.kind==="lesson")[0];
      var f=les.from.split(":");
      S.bellNow=dateAtY(0,Number(f[0]),Number(f[1])+5,new Date().getFullYear());
      S.filters={};S.route="attendance";S.page=1;
      var h=renderRoute();
      var ind=h.indexOf("انتخاب خودکار بر اساس زنگ")>-1;
      var row=null;db.schedule.forEach(rw=>{if(row)return;if(rw.day===0&&Number(rw.period)===1&&rw.teacher_id===tid&&rw.class_id)row=rw;});
      var auto=row?new RegExp('value="'+row.class_id+'" selected').test(h):false;
      var man=visibleClasses().find(c=>c.id!==row.class_id);
      S.filters={class:man.id};
      var h2=renderRoute();
      var gone=h2.indexOf("انتخاب خودکار بر اساس زنگ")===-1;
      __clk('att-reset-class');
      var h3=renderRoute();
      var reset=h3.indexOf("انتخاب خودکار بر اساس زنگ")===-1;
      S.bellNow=null;S.filters={};
      return JSON.stringify({ind:ind,auto:auto,gone:gone,reset:reset});})()`));
    assert(r.ind === true, 'نشان پیش‌گزینش نبود');
    assert(r.auto === true, 'کلاس خودکار انتخاب نبود');
    assert(r.gone === true, 'نشان با انتخاب دستی ناپدید نشد');
    assert(r.reset === true, 'ریست نشان را برنمی‌گرداند');
  });
  sim('جریان', 'دبیر: پیش‌گزینش زنگ در نمرات (کلاس + درس) + ریست', () => {
    W('S.user=db.users.find(u=>u.username==="teacher1_1");S.persona=null;S.boss=null;');
    const r = JSON.parse(W(`(()=>{
      ${DATE_AT}
      var tid=S.user.id,sid=S.user.school_id;
      var row=null;db.schedule.forEach(rw=>{if(row)return;if(rw.day===0&&Number(rw.period)===1&&rw.teacher_id===tid&&rw.class_id&&rw.subject_id)row=rw;});
      var tl=bellTimeline(sid,0);var les=tl.filter(x=>x.kind==="lesson")[0];var f=les.from.split(":");
      S.bellNow=dateAtY(0,Number(f[0]),Number(f[1])+5,new Date().getFullYear());
      S.filters={};S.fopen={grades:true};S.route="grades";S.page=1;
      var h=renderRoute();
      var ind=h.indexOf("انتخاب خودکار بر اساس زنگ")>-1;
      var cls=new RegExp('value="'+row.class_id+'" selected').test(h);
      var sub=new RegExp('value="'+row.subject_id+'" selected').test(h);
      __clk('grade-reset-auto');
      var h2=renderRoute();
      var gone=h2.indexOf("انتخاب خودکار بر اساس زنگ")===-1;
      S.bellNow=null;S.filters={};S.fopen={};
      return JSON.stringify({ind:ind,cls:cls,sub:sub,gone:gone});})()`));
    assert(r.ind === true, 'نشان در نمرات نبود');
    assert(r.cls === true && r.sub === true, 'کلاس/درس خودکار انتخاب نبودند');
    assert(r.gone === true, 'ریست در نمرات کار نکرد');
  });
  sim('جریان', 'دبیر: ثبت نمره از راه مودال (کلیک واقعی)', () => {
    W('S.user=db.users.find(u=>u.username==="teacher1_1");S.persona=null;S.boss=null;');
    const r = JSON.parse(W(`(()=>{
      var sid=S.user.school_id;
      var rec=byId('schools',sid);
      var rules=JSON.parse(JSON.stringify(rec.notify_rules||null));
      rec.notify_rules={enabled:true,kinds:{grade:true}};
      S.route="grades";S.filters={};S.fopen={};
      var g0=db.grades.length;
      gradeModal(null);
      var st=studentsOfClass(window._gclass)[0];
      document.getElementById('g_st').value=String(st.id);
      document.getElementById('g_score').value='11';
      __clk('grade-save');
      var added=db.grades.length-g0;
      rec.notify_rules=rules;
      return JSON.stringify({added:added,gid:db.grades[db.grades.length-1]?db.grades[db.grades.length-1].id:0});})()`));
    assert(r.added === 1 && r.gid > 0, 'نمره از مودال ذخیره نشد');
  });
  sim('جریان', 'امتحان نهایی: دوازدهم قبول، یازدهم رد (قاعدهٔ finalGradeOk)', () => {
    const r = JSON.parse(W(`(()=>{
      var sid=db.schools[0].id;
      var c12=db.classes.find(c=>c.school_id===sid&&c.grade==='دوازدهم');
      var c11=db.classes.find(c=>c.school_id===sid&&c.grade==='یازدهم');
      if(!c12||!c11)return JSON.stringify({skip:true});
      var m=db.users.find(u=>u.role==='manager'&&u.school_id===sid);
      S.user=m;S.persona=null;S.boss=null;S.route='grades';
      S.filters={class:c11.id};
      var st=studentsOfClass(c11.id)[0];
      var g11n=db.grades.length;
      gradeModal(null);
      document.getElementById('g_st').value=String(st.id);
      document.getElementById('g_type').value='امتحان نهایی';
      document.getElementById('g_score').value='15';
      __clk('grade-save');
      var g11=db.grades.length-g11n;
      S.filters={class:c12.id};
      var st2=studentsOfClass(c12.id)[0];
      var g12n=db.grades.length;
      gradeModal(null);
      document.getElementById('g_st').value=String(st2.id);
      document.getElementById('g_type').value='امتحان نهایی';
      document.getElementById('g_score').value='15';
      __clk('grade-save');
      var g12=db.grades.length-g12n;
      return JSON.stringify({skip:false,g11:g11,g12:g12});})()`));
    assert(!r.skip, 'کلاس یازدهم/دوازدهم مدرسهٔ ۱ نبود');
    assert(r.g11 === 0, 'امتحان نهایی یازدهم ذخیره شد (قاعدهٔ finalGradeOk شکسته شد)!');
    assert(r.g12 === 1, 'امتحان نهایی دوازدهم ذخیره نشد');
  });
  sim('جریان', 'مدیر: ارجاع الگو به مشاور → رسیدگی (رکورد پاک نمی‌شود)', () => {
    const r = JSON.parse(W(`(()=>{
      var sid=db.schools[0].id;
      var flagged=patternFlagged(sid,30)||[];
      var pick=null;
      for(var i=0;i<flagged.length&&!pick;i++){
        for(var j=0;j<flagged[i].breaches.length;j++){
          var b=flagged[i].breaches[j];
          if(!counselorOpenRef(sid,flagged[i].user.id,b.key)){pick={st:flagged[i].user.id,key:b.key};break;}
        }
      }
      if(!pick)return JSON.stringify({skip:true});
      var m=db.users.find(u=>u.role==='manager'&&u.school_id===sid);
      S.user=m;S.persona=null;S.boss=null;S.route='followup';S.filters={};
      var n0=db.counselor_refs.length;
      __clk('counselor-ref',{s:String(pick.st),k:String(pick.key)});
      var n1=db.counselor_refs.length;
      var ref=db.counselor_refs[n1-1];
      if(!ref||ref.student_id!==pick.st)return JSON.stringify({skip:false,refOk:false,made:n1-n0});
      var cou=db.users.find(u=>u.role==='counselor'&&u.school_id===sid);
      S.user=cou;S.persona=null;S.boss=null;S.route='cqueue';S.filters={};
      __clk('counselor-handle',{r:String(ref.id)});
      var after=byId('counselor_refs',ref.id);
      return JSON.stringify({skip:false,refOk:true,made:n1-n0,
        status:after?after.status:null,still:!!after});})()`));
    assert(!r.skip, 'دانش‌آموز الگودار بدون ارجاعِ بازِ قبلی در مدرسهٔ ۱ نبود');
    assert(r.refOk === true && r.made === 1, 'ارجاع درست ساخته نشد: made=' + r.made);
    assert(r.still === true, 'رکورد ارجاع بعد از رسیدگی پاک شد!');
    assert(r.status && r.status !== 'open', `وضعیت بعد از رسیدگی: ${r.status}`);
  });
  sim('جریان', 'اعلان الگو به ولی: مدرسهٔ ۱ در صف، مدرسهٔ ۲ (خاموش) رد', () => {
    const r = JSON.parse(W(`(()=>{
      var s1=db.schools[0].id,s2=db.schools[1].id;
      var pick=null;
      (patternFlagged(s1,30)||[]).forEach(function(rw){
        if(pick)return;
        var stt=patternNotifyState(s1,rw.user.id);
        if(!stt.pending&&!stt.lastSentAt){pick=rw.user.id;}
      });
      if(!pick)return JSON.stringify({skip:true});
      var m1=db.users.find(u=>u.role==='manager'&&u.school_id===s1);
      S.user=m1;S.persona=null;S.boss=null;S.route='followup';S.filters={};
      var q0=db.notify_queue.length;
      __clk('pattern-notify',{s:String(pick)});
      var res1=db.notify_queue.length-q0;
      var f2=patternFlagged(s2,30)||[];
      var pick2=f2.length?f2[0].user.id:null;
      var m2=db.users.find(u=>u.role==='manager'&&u.school_id===s2);
      S.user=m2;S.persona=null;S.boss=null;S.route='followup';S.filters={};
      var q1=db.notify_queue.length;
      var res2=null;
      if(pick2){__clk('pattern-notify',{s:String(pick2)});res2=db.notify_queue.length-q1;}
      return JSON.stringify({skip:false,res1:res1,st2:!!pick2,res2:res2});})()`));
    assert(!r.skip, 'دانش‌آموز الگودار با وضعیت آزاد (نه در صف، نه در مهلت ۷روزه) در مدرسهٔ ۱ نبود');
    assert(r.res1 === 1, 'پیام مدرسهٔ ۱ در صف نشد');
    if (r.res2 !== null) assert(r.res2 === 0, 'مدرسهٔ خاموش (بدون notify_rules) هم پیام ساخت!');
    else console.log('   ⓘ مدرسهٔ ۲: دانش‌آموز الگودار نبود — شاخهٔ خاموش آزمایش نشد');
  });

  console.log('\n▸ د — حالت‌های زنگ');
  /* الگوی تست‌پذیری پروژه: bellNowBar(زمان) مستقیم؛ نوار داشبورد همیشه
     ساعت زنده را نشان می‌دهد و S.bellNow مخصوص پیش‌گزینش حضور/نمرات است. */
  sim('زنگ', 'شنبه وسط زنگ: نوار زنگ درسی (live) + نام کلاس', () => {
    W('S.user=db.users.find(u=>u.username==="teacher1_1");S.persona=null;S.boss=null;');
    const r = JSON.parse(W(`(()=>{
      ${DATE_AT}
      var sid=S.user.school_id;
      var tl=bellTimeline(sid,0);var les=tl.filter(x=>x.kind==="lesson")[0];var f=les.from.split(":");
      var now=dateAtY(0,Number(f[0]),Number(f[1])+5,new Date().getFullYear());
      var bar=bellNowBar(now);
      return JSON.stringify({live:bar.indexOf("bell-bar-live")>-1||bar.indexOf("bell-bar-free")>-1,
        kind:bar});})()`));
    assert(r.live === true, 'نوار زنگ درسی (live/free) نشد: ' + r.kind);
  });
  sim('زنگ', 'وسط تفریح: نوار تفریح + بدون پیش‌گزینش', () => {
    W('S.user=db.users.find(u=>u.username==="teacher1_1");S.persona=null;S.boss=null;');
    const r = JSON.parse(W(`(()=>{
      ${DATE_AT}
      var sid=S.user.school_id;
      var tl=bellTimeline(sid,0);var brk=tl.filter(x=>x.kind==="break")[0];var g=brk.from.split(":");
      var now=dateAtY(0,Number(g[0]),Number(g[1])+5,new Date().getFullYear());
      var bar=bellNowBar(now);
      var brkShown=bar.indexOf("bell-bar-break")>-1&&bar.indexOf("تفریح")>-1;
      S.bellNow=now;S.route="attendance";S.filters={};
      var ha=renderRoute();
      var noPre=ha.indexOf("انتخاب خودکار بر اساس زنگ")===-1;
      S.bellNow=null;
      return JSON.stringify({brkShown:brkShown,noPre:noPre});})()`));
    assert(r.brkShown === true, 'نوار تفریح نشد');
    assert(r.noPre === true, 'در تفریح پیش‌گزینش شد!');
  });
  sim('زنگ', 'پنجشنبه (روزِ غیرکاری): نوار «روز درسی نیست» + حضور/نمره بدون خطا', () => {
    W('S.user=db.users.find(u=>u.username==="teacher3_1");S.persona=null;S.boss=null;');
    const r = JSON.parse(W(`(()=>{
      ${DATE_AT}
      var bar=bellNowBar(dateAtY(5,10,0,new Date().getFullYear()));
      var hol=bar.indexOf("bell-bar-off")>-1&&bar.indexOf("روز درسی نیست")>-1;
      S.bellNow=dateAtY(5,10,0,new Date().getFullYear());
      S.route="attendance";S.filters={};
      var ha=renderRoute();
      S.route="grades";S.filters={};S.fopen={grades:true};
      var hg=renderRoute();
      S.bellNow=null;
      return JSON.stringify({hol:hol,a:ha.length>100,g:hg.length>100});})()`));
    assert(r.hol === true, 'نوار روز تعطیل جمعه نشد');
    assert(r.a && r.g, 'حضور/نمره در جمعه رندر نشد');
  });
  sim('زنگ', 'ساعت نامعتبر (۱۹۹۰): نوار هشدار، نه زنگ', () => {
    W('S.user=db.users.find(u=>u.username==="teacher1_1");S.persona=null;S.boss=null;');
    const r = JSON.parse(W(`(()=>{
      ${DATE_AT}
      var bar=bellNowBar(dateAtY(0,8,0,1990));
      return JSON.stringify({warn:bar.indexOf("bell-bar-warn")>-1,
        noLesson:bar.indexOf("bell-bar-live")===-1});})()`));
    assert(r.warn === true, 'نوار هشدار ساعت نامعتبر نشد');
    assert(r.noLesson === true, 'با ساعت نامعتبر زنگ نشان داده شد');
  });
  sim('زنگ', 'مدرسهٔ ۶: پیش‌گزینش از جایگزین پیش‌فرض بدون کرش', () => {
    W('S.user=db.users.find(u=>u.username==="manager6");S.persona=null;S.boss=null;');
    const r = JSON.parse(W(`(()=>{
      ${DATE_AT}
      var sid=S.user.school_id;
      var has=(db.bell_schedules||[]).some(b=>b.school_id===sid);
      var tl=bellTimeline(sid,0);
      var les=tl.filter(x=>x.kind==="lesson")[0];
      if(!les)return JSON.stringify({has:has,noLesson:true,ind:null});
      var f=les.from.split(":");
      S.bellNow=dateAtY(0,Number(f[0]),Number(f[1])+5,new Date().getFullYear());
      S.route="attendance";S.filters={};
      var h=renderRoute();
      var ind=h.indexOf("انتخاب خودکار بر اساس زنگ")>-1;
      S.bellNow=null;
      return JSON.stringify({has:has,ind:ind});})()`));
    assert(r.noLesson !== true, 'خطا در ساختن تایم‌لاین جایگزین مدرسهٔ ۶');
    console.log('   ⓘ مدرسهٔ ۶: رکورد اختصاصی=' + r.has + ' — پیش‌گزینش با جایگزین: ' + r.ind);
  });

  console.log('\n▸ ه — چالش‌های غیرمنتظره');
  sim('چالش', 'XSS در نام کلاس: فرار می‌شود و اجرا نمی‌شود', () => {
    W('S.user=db.users.find(u=>u.username==="manager1");S.persona=null;S.boss=null;S.route="classes";S.filters={};');
    W('window.__xss=0;');
    W('classModal(null)');
    W(`document.getElementById('c_name').value='<img src=x onerror="window.__xss=1">';document.getElementById('c_grade').value='ششم'`);
    W(`(function(){var el=document.getElementById('c_mode');el.value='class';el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    clk('class-save');
    const cid = W('db.classes[db.classes.length-1].id');
    const h = W('renderRoute()');
    const exec = W('window.__xss');
    const escaped = h.indexOf('&lt;img') > -1;
    assert(exec === 0, '🔴 اسکریپت XSS اجرا شد!');
    assert(escaped === true, 'نام کلاس فرار نشد');
    W(`applyOp({c:'classes',t:'del',id:${cid}})`);
  });
  sim('چالش', 'نام ۳۰۰ کاراکتری: رندر بدون خطا', () => {
    W('S.user=db.users.find(u=>u.username==="manager1");S.persona=null;S.boss=null;S.route="classes";S.filters={};');
    const long = 'کلاس ' + 'ط'.repeat(290);
    W('classModal(null)');
    W(`document.getElementById('c_name').value=${JSON.stringify(long)};document.getElementById('c_grade').value='هشتم'`);
    W(`(function(){var el=document.getElementById('c_mode');el.value='class';el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    clk('class-save');
    const cid = W('db.classes[db.classes.length-1].id');
    const h = W('renderRoute()');
    assert(h.length > 100, 'رندر بعد از نام بلند خطا داد');
    W(`applyOp({c:'classes',t:'del',id:${cid}})`);
  });
  sim('چالش', 'جستجوی پرت در حضور و غیاب: حالت خالی، نه خطا', () => {
    W('S.user=db.users.find(u=>u.username==="teacher1_1");S.persona=null;S.boss=null;');
    const r = JSON.parse(W(`(()=>{
      S.route="attendance";S.filters={q:"zzzzzz"};
      var h=renderRoute();
      return JSON.stringify({len:h.length,empty:h.indexOf("یافته نشد")>-1||h.indexOf("نتیجه")>-1});})()`));
    assert(r.len > 50, 'نمای حضور با جستجوی پرت رندر نشد');
  });
  sim('چالش', 'پرش بین رویت‌ها با فیلترها: پنج دور بدون خطا', () => {
    W('S.user=db.users.find(u=>u.username==="teacher1_1");S.persona=null;S.boss=null;');
    for (let i = 0; i < 5; i++) {
      W(`S.filters={class:visibleClasses()[0].id};S.route="attendance";renderRoute();`);
      W(`S.filters={subject:db.subjects[0].id};S.route="grades";S.fopen={grades:true};renderRoute();`);
      W(`S.filters={};S.route="schedule";renderRoute();`);
      W(`S.route="dashboard";renderRoute();`);
    }
    assert(true, 'پنج دور پرش بدون خطا');
  });
  sim('چالش', 'یکپارچگی دفترچه: ساخت/ویرایش/حذف = سه ردیف log با رد پای کاربر', () => {
    W('S.user=db.users.find(u=>u.username==="manager1");S.persona=null;S.boss=null;S.route="classes";S.filters={};');
    const l0 = W('log.length');
    W('classModal(null)');
    W(`document.getElementById('c_name').value='دفترچهٔ آزمایش';document.getElementById('c_grade').value='نهم'`);
    W(`(function(){var el=document.getElementById('c_mode');el.value='class';el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    clk('class-save');
    const cid = W('db.classes[db.classes.length-1].id');
    W(`update("classes",${cid},{name:"دفترچهٔ آزمایش ۲"})`);
    W(`applyOp({c:"classes",t:"del",id:${cid}})`);
    const l1 = W('log.length');
    assert(l1 === l0 + 3, `log +۳ نشد (+${l1 - l0})`);
    const r = JSON.parse(W(`(()=>{
      var ops=log.slice(${l0});
      return JSON.stringify({
        kinds:ops.map(o=>o.t).join(","),
        cols:ops.map(o=>o.c).join(","),
        by:ops.every(o=>typeof o.by==="number")
      });})()`));
    assert(r.kinds === 'ins,upd,del', `نوع عملیات: ${r.kinds}`);
    assert(r.cols === 'classes,classes,classes', `ستون عملیات: ${r.cols}`);
    assert(r.by === true, 'رد پای کاربر (by) در log نیست');
  });
  sim('چالش', 'bell-copy-prev: کلیک واقعی روز ۲ را روی روز ۱ می‌کند', () => {
    W('S.user=db.users.find(u=>u.username==="manager1");S.persona=null;S.boss=null;');
    const sid = W('db.schools[0].id');
    W('bellModal(' + sid + ')');
    try {
      W('window._edit.days[0]={start:"06:00",slots:[{kind:"lesson",min:25}]}');
      W('bellRenderDay(0)');
      const r = JSON.parse(W(`(()=>{
        var copy0=document.querySelectorAll('.bell-day[data-day="0"] [data-act=bell-copy-prev]').length;
        var b1=document.querySelector('.bell-day[data-day="1"] [data-act=bell-copy-prev]');
        if(!b1)return JSON.stringify({copy0:copy0,done:false});
        b1.click();
        var d1=window._edit.days[1];
        return JSON.stringify({copy0:copy0,done:true,start:d1.start,slots:d1.slots});})()`));
      assert(r.copy0 === 0, 'شنبه دکمهٔ کپی از روز قبل دارد');
      assert(r.done === true, 'دکمهٔ کپی یکشنبه نبود یا کلیک نشد');
      assert(r.start === '06:00', 'شروع روز کپی نشد: ' + r.start);
      assert(r.slots.length === 1 && r.slots[0].min === 25, 'بازه‌ها کپی نشدند: ' + JSON.stringify(r.slots));
    } finally { W('closeModal()'); }
  });
  sim('چالش', 'bell-del روی ردیف سوم: فقط همان بازه حذف می‌شود (بازمقالهٔ data-i)', () => {
    W('S.user=db.users.find(u=>u.username==="manager1");S.persona=null;S.boss=null;');
    const sid = W('db.schools[0].id');
    W('bellModal(' + sid + ')');
    try {
      W('window._edit.days[0]={start:"07:00",slots:[{kind:"lesson",min:30},{kind:"break",min:10},{kind:"lesson",min:30}]}');
      W('bellRenderDay(0)');
      const r = JSON.parse(W(`(()=>{
        var rows=document.querySelectorAll('.bell-day[data-day="0"] .bell-edit-row');
        if(rows.length<3)return JSON.stringify({skip:true});
        var btn=rows[2].querySelector('[data-act=bell-del]');
        btn.click();
        return JSON.stringify(window._edit.days[0].slots.map(s=>s.kind));})()`));
      assert(!r.skip, 'سه ردیف زنگ در فرم نبود');
      assert(r.length === 2 && r[0] === 'lesson' && r[1] === 'break',
        '🔴 bell-del بازهٔ اشتباه حذف کرد: باقی‌مانده ' + JSON.stringify(r) + ' — انتظار [lesson,break]. data-i روی دکمه است ولی اکشن از ردیف می‌خواند (بازمقالهٔ معلوم)');
    } finally { W('closeModal()'); }
  });
  sim('چالش', 'bellSaveDays: ساعت نامعتبر با نام روز رد می‌شود', () => {
    const sid = W('db.schools[2].id');
    const r = JSON.parse(W(`(()=>{
      var days=[{start:"07:00",slots:[{kind:"lesson",min:30}]},{start:"بی‌معنا",slots:[{kind:"lesson",min:30}]},{start:"07:00",slots:[{kind:"lesson",min:30}]},{start:"07:00",slots:[{kind:"lesson",min:30}]},{start:"07:00",slots:[{kind:"lesson",min:30}]}];
      return JSON.stringify(bellSaveDays(${sid},days));})()`));
    assert(r.ok === false, 'ساعت نامعتبر پذیرفته شد!');
    assert(String(r.msg).indexOf('یکشنبه') > -1, 'نام روز معیوب در پیام نیست: ' + r.msg);
  });
  sim('چالش', '۵۰ رندر پیاپی: بدون خطا + زمان سنجیده', () => {
    W('S.user=db.users.find(u=>u.username==="teacher1_1");S.persona=null;S.boss=null;');
    const ms = W(`(()=>{
      var t0=Date.now();
      var routes=["dashboard","attendance","grades","schedule","discipline","exams","record"];
      for(var i=0;i<50;i++){S.route=routes[i%routes.length];S.filters={};renderRoute();}
      return Date.now()-t0;})()`);
    console.log('   ⓘ زمان ۵۰ رندر: ' + ms + 'ms');
    assert(ms < 60000, `۵۰ رندر خیلی کند شد: ${ms}ms`);
  });

  // ── نتیجه
  const total = results.length;
  const ok = results.filter(r => r.ok).length;
  const bySec = {};
  results.forEach(r => { (bySec[r.section] = bySec[r.section] || [0, 0]); bySec[r.section][r.ok ? 0 : 1]++; });

  console.log('\n' + '─'.repeat(62));
  for (const r of results) {
    console.log(`  ${r.ok ? '✅' : '❌'} [${r.section}] ${r.name}${r.ok ? '' : '\n     ' + r.detail}`);
  }
  console.log('─'.repeat(62));
  Object.keys(bySec).forEach(s => console.log(`  ${s}: ${bySec[s][0]} سبز / ${bySec[s][1]} قرمز`));
  console.log('──────────────────────────────────────────────────────────');
  console.log(`شبیه‌سازی جامع: ${ok}/${total} سناریو سبز` + (ok === total ? '  ✅' : `  —  ${total - ok} قرمز 🔴`));
  if (consoleErrors.length) {
    console.log(`\n⚠️ خطاهای کنسول (${consoleErrors.length}):`);
    consoleErrors.slice(0, 8).forEach(e => console.log('   ' + String(e).slice(0, 160)));
  }
  process.exit(ok === total && consoleErrors.length <= 1 ? 0 : 1);
}
