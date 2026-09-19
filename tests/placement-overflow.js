/* ─────────────────────────────────────────────────────────────
   placement-overflow.js — سرریزِ چیدمان (دور ۱۰۰، نقصِ ۴)
   ─────────────────────────────────────────────────────────────
   ریشهٔ نقص: autoPlacement وقتی همهٔ کلاس‌ها پر بودند، دانش‌آموز را
   به buckets[0] می‌ریخت (فراتر از ظرفیت!) و هیچ‌جا «جا‌نشده» گزارش
   نمی‌شد. رفع: خروجیِ {buckets, unplaced} + پیش‌نمایشِ جا‌نشده‌ها در
   تبِ چیدمان (با دکمهٔ «کلاس موازی» در کنارش) + اعمالِ جزئی با هشدار.

   O1 سرریزِ مستقیم: ۵ نفر در ۲ کلاسِ ۲نفره ← ۴ چیده + ۱ جا‌نشده،
      بدونِ تجاوز از ظرفیت (به‌ویژه کلاسِ اول)
   O2 تناسبِ دقیق: ۴ نفر در ۲ کلاسِ ۲نفره ← جا‌نشده صفر
   O3 بی‌کلاسی: همه جا‌نشده
   O4 پیش‌نمایش: بجِ «۲ نفر جا نمی‌شوند» + دکمهٔ کلاس موازی
   O5 سرتاسریِ place-auto (کلیکِ واقعی): تأییدیه جا‌نشده را اعلام می‌کند؛
      پس از تأیید ۴ نفر چیده + ۲ نفر همچنان در انتظار
   O6 سرتاسریِ enroll-paid (کلیکِ واقعی): ۲ ثبت‌نام + ۱ «چیده نشد»
   ───────────────────────────────────────────────────────────── */
const fs = require('fs');
const path = require('path');

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — سئوت رد شد.  (npm i --no-save jsdom)'); process.exit(1); }

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
  console.log('\n▸ P1-4 — سرریزِ چیدمان (jsdom)');

  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
    virtualConsole: new VirtualConsole().on('jsdomError', () => {}).on('error', () => {}),
  });
  const win = dom.window;
  const W = (expr) => win.eval(expr);
  await sleep(2000);

  /* ── O1–O3: مستقیم و خالص (آبجکتِ مصنوعی کافی است: فقط user.id و capacity خوانده می‌شود) ── */
  const direct = (nSt, caps) => JSON.parse(W(`JSON.stringify((function(){
    var sts=[],cls=[];
    for(var i=0;i<${nSt};i++) sts.push({user:{id:9000+i}});
    ${JSON.stringify(caps)}.forEach(function(c,i){ cls.push({id:700+i,capacity:c}); });
    var r=autoPlacement(sts,cls);
    var bk=(r&&r.buckets)||null, un=(r&&r.unplaced)||null;
    return { shape: !!bk&&!!un,
      sizes: bk?bk.map(function(b){return b.list.length;}):null,
      un: un?un.length:-1,
      over: bk?bk.some(function(b,i){return b.list.length>${JSON.stringify(caps)}[i];}):null };
  })())`));

  /* دفاعیِ جهشِ M2 (خروجیِ آرایه): sizes ممکن است null باشد */
  const sz = (r) => (r && r.sizes) || [];
  const r1 = direct(5, [2, 2]);
  chk('O1a شکلِ خروجی {buckets,unplaced}', r1.shape === true, JSON.stringify(r1));
  chk('O1b توزیعِ ۴ نفر در دو کلاس', r1.shape && JSON.stringify(sz(r1).slice().sort()) === '[2,2]', JSON.stringify(r1.sizes));
  chk('O1c یک نفر جا‌نشده', r1.un === 1, 'un=' + r1.un);
  chk('O1d هیچ کلاسی (به‌ویژه اولی) از ظرفیت نگذشت', r1.over === false, JSON.stringify(r1.sizes));

  const r2 = direct(4, [2, 2]);
  chk('O2 تناسبِ دقیق: ۴ چیده، ۰ جا‌نشده',
    r2.shape === true && r2.un === 0 && JSON.stringify(sz(r2).slice().sort()) === '[2,2]', JSON.stringify(r2));

  const r3 = direct(5, []);
  chk('O3 بی‌کلاسی: ۰ چیده، ۵ جا‌نشده',
    r3.shape === true && sz(r3).length === 0 && r3.un === 5, JSON.stringify(r3));

  /* ── فیکسچرِ مشترکِ O4/O5: مدرسهٔ تازه، پایهٔ ۹، ۲ کلاسِ ۲نفره، ۶ دانش‌آموزِ بی‌کلاس ── */
  const fx = JSON.parse(W(`JSON.stringify((function(){
    var now=new Date().toISOString(), tag=String(Date.now());
    var sch=add('schools',{name:'مدرسه چیدمان '+tag,code:'PL'+tag,city:'تست',address:'',phone:'09120000000',
      level:'متوسطه اول',type:'عادی',gender:'پسرانه',branches:[],fields:[],shift:'صبح',capacity:100,active:1,created_at:now});
    var mgr=add('users',{school_id:sch.id,role:'manager',full_name:'مدیر چیدمان',username:'plm'+tag,
      password:'x12345',national_id:'0000000001',phone:'09120000001',active:1,created_at:now});
    var c1=add('classes',{school_id:sch.id,name:'نهم الف',grade_level:9,capacity:2});
    var c2=add('classes',{school_id:sch.id,name:'نهم ب',grade_level:9,capacity:2});
    var studs=[];
    for(var i=0;i<6;i++){
      studs.push(add('users',{school_id:sch.id,role:'student',full_name:'دانش‌آموز چیدمان '+i,
        username:'pls'+tag+'_'+i,password:'x12345',national_id:'000000001'+i,phone:'0912000001'+i,
        grade_level:9,active:1,created_at:now}).id);
    }
    S.user=byId('users',mgr.id);S.persona=null;S.boss=null;
    return {sch:sch.id,cls:[c1.id,c2.id],studs:studs};
  })())`));
  chk('O4a فیکسچر: ۶ نفر در انتظارِ پایهٔ ۹',
    W(`needPlacement(${fx.sch}).filter(function(p){return p.grade===9;}).length`) === 6);

  /* ── O4: پیش‌نمایش ── */
  W(`S.tab='placement';`);
  /* دفاعیِ جهشِ M2: اگر view پرتاب کرد، قرمزِ تمیز نه FATAL */
  let placementHtml = '';
  try { placementHtml = String(W(`viewSchoolYear()`)); }
  catch (e) { placementHtml = 'THREW: ' + (e.message || e); }
  const cards = placementHtml.split('<div class="card" style="margin-bottom:12px">');
  const g9card = cards.filter(c => c.indexOf('پایهٔ ۹') >= 0)[0] || '';
  chk('O4b کارتِ پایهٔ ۹ رندر شد', g9card.length > 0);
  chk('O4c بجِ «۲ نفر جا نمی‌شوند» هست', g9card.indexOf('۲ نفر جا نمی‌شوند') >= 0,
    g9card.replace(/\s+/g, ' ').slice(0, 200));
  chk('O4d دکمهٔ «کلاس موازی» کنارِ هشدار هست',
    g9card.indexOf('data-act="cls-parallel"') >= 0 && g9card.indexOf('data-g="9"') >= 0);

  /* ── O5: سرتاسریِ place-auto ── */
  W(`(function(){var b=document.createElement('button');b.setAttribute('data-act','place-auto');
    b.setAttribute('data-g','9');b.setAttribute('data-fl','');document.body.appendChild(b);b.click();b.remove();})()`);
  const confirmText = String(W(`(document.querySelector('#modal')||{textContent:''}).textContent`));
  chk('O5a تأییدیه جا‌نشده را پیشاپیش اعلام می‌کند',
    confirmText.indexOf('۲ نفر در ظرفیت نمی‌گنجند') >= 0, confirmText.slice(0, 160));
  W(`(function(){var b=document.querySelector('#modal button[data-act="ask-ok"]');if(b)b.click();})()`);
  chk('O5b چهار نفر چیده شدند (کلاسِ پایهٔ ۹ گرفتند)',
    W(`JSON.stringify(${JSON.stringify(fx.studs)}.filter(function(id){
      var c=classOf(id);return c&&Number(c.grade_level)===9;}).length)`) === '4');
  chk('O5c دو نفر همچنان در انتظارند',
    W(`needPlacement(${fx.sch}).filter(function(p){return p.grade===9;}).length`) === 2);
  const capOk = W(`JSON.stringify(${JSON.stringify(fx.cls)}.map(function(cid){
    return db.enrollments.filter(function(e){return e.class_id===cid;}).length;}))`);
  chk('O5d هیچ کلاسی از ظرفیتِ ۲ نگذشت', JSON.stringify(JSON.parse(capOk).sort()) === '[2,2]', capOk);

  /* ── O6: سرتاسریِ enroll-paid (مدرسهٔ دوم: ۱ کلاسِ ۲نفره + ۳ شهریه‌داده) ── */
  const fx2 = JSON.parse(W(`JSON.stringify((function(){
    var now=new Date().toISOString(), tag=String(Date.now()+7);
    var sch=add('schools',{name:'مدرسه ثبت‌نام '+tag,code:'EN'+tag,city:'تست',address:'',phone:'09120000000',
      level:'متوسطه اول',type:'عادی',gender:'پسرانه',branches:[],fields:[],shift:'صبح',capacity:100,active:1,created_at:now});
    var mgr=add('users',{school_id:sch.id,role:'manager',full_name:'مدیر ثبت‌نام',username:'enm'+tag,
      password:'x12345',national_id:'0000000002',phone:'09120000002',active:1,created_at:now});
    var c1=add('classes',{school_id:sch.id,name:'نهم الف',grade_level:9,capacity:2});
    var studs=[];
    for(var i=0;i<3;i++){
      var st=add('users',{school_id:sch.id,role:'student',full_name:'دانش‌آموز ثبت‌نام '+i,
        username:'ens'+tag+'_'+i,password:'x12345',national_id:'000000002'+i,phone:'0912000002'+i,
        grade_level:9,active:1,created_at:now});
      add('installments',{tuition_id:0,school_id:sch.id,student_id:st.id,seq:1,due_date:'1404-01-01',
        amount:1000,paid_amount:1000,status:'paid'});
      studs.push(st.id);
    }
    S.user=byId('users',mgr.id);S.persona=null;S.boss=null;
    return {sch:sch.id,cls:c1.id,studs:studs};
  })())`));
  chk('O6a فیکسچر: ۳ شهریه‌داده در انتظار',
    W(`enrollmentList(${fx2.sch}).filter(function(x){return x.paid;}).length`) === 3);
  W(`(function(){var b=document.createElement('button');b.setAttribute('data-act','enroll-paid');
    document.body.appendChild(b);b.click();b.remove();})()`);
  W(`(function(){var b=document.querySelector('#modal button[data-act="ask-ok"]');if(b)b.click();})()`);
  const toastText = String(W(`(document.querySelector('#toasts')||{textContent:''}).textContent`));
  chk('O6b توست «۱ نفر چیده نشد» را اعلام می‌کند', toastText.indexOf('۱ نفر چیده نشدند') >= 0, toastText.slice(0, 160));
  chk('O6c دو نفر در کلاس نشستند',
    W(`db.enrollments.filter(function(e){return e.class_id===${fx2.cls};}).length`) === 2);
  chk('O6d یک نفر همچنان در انتظار است',
    W(`needPlacement(${fx2.sch}).filter(function(p){return p.grade===9;}).length`) === 1);

  dom.window.close();
  console.log('\nplacement-overflow: ' + okc + '/' + (okc + failc) + (failc ? ' — شکست: ' + fails.join(' | ') : '  ✅'));
  process.exit(failc ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
