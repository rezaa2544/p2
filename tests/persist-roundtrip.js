#!/usr/bin/env node
/**
 * سئوت ماندگاریِ درج‌های کاربر (دور ۱۰۰، نقصِ ۲ — P0) — پایش
 *
 * ریشهٔ نقص: ۷ مسیرِ کاربر با add() می‌نوشتند (فقط حافظه؛ بی دفترچه و
 * بی صف) و پس از بوتِ تازه گم می‌شدند. رفع: insert() در هر ۷ نقطه.
 *
 * این سئوت برای هر مسیر سه چیز را می‌سنجد:
 *   ۱) رکورد در db ساخته می‌شود (رفتارِ کاربر عوض نشده)
 *   ۲) opِ ins در دفترچهٔ عملیات (log) هست (ماندگاری)
 *   ۳) op در صفِ همگام‌سازی (pending/failed) هست (همگام‌سازی)
 * و در پایان، بوتِ تازه را شبیه‌سازی می‌کند (تولیدِ دوبارهٔ دنیای دمو +
 * بازپخشِ دفترچه — همان ترتیبِ بوتِ واقعی در 24-edu-office.js) و بقای
 * هر ۷ رکورد را با شناسه می‌سنجد.
 *
 * بخش‌ها:
 *  P1 مهمان (visitorRegister) · P2 کتاب (libAddBook) · P3 امانت (libLend)
 *  P4 تجهیز (assetAdd) · P5 نمرهٔ سیدا (sedasUpsert) · P6 مدل دوجو
 *  (dojoSaveModel) · P7 گواهی (certRecord) · P8 بوتِ تازه (بقا)
 *  P9 حسابرسیِ صف
 *
 * اجرا: node tests/persist-roundtrip.js
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

/* شناسه‌هایِ رکوردهایِ ساخته‌شده — برای سنجشِ بقا در P8 */
const IDS = {};

(async () => {
  await sleep(2000); /* بوتِ کامل: generate + بازپخش + initSync */

  /* ── آماده‌سازی: صف منجمد (ارسالِ شبیه‌سازی‌شده خالی‌اش نکند) ── */
  W(`SYNC.online=false;`);
  const fx = JSON.parse(W(`JSON.stringify((function(){
    var schA = db.schools.filter(function(s){return s.active;})[0].id;
    var mgr = db.users.filter(function(u){return u.role==='manager'&&u.school_id===schA;})[0];
    if(!mgr) mgr = add('users',{school_id:schA,role:'manager',full_name:'مدیر تستی ماندگاری',
      username:'pxmgr_'+Date.now(),password:'x12345',national_id:'0000000001',phone:'09120000001',active:1});
    var st = add('users',{school_id:schA,role:'student',full_name:'دانش‌آموز تستی ماندگاری',
      username:'pxst_'+Date.now(),password:'x12345',national_id:'0000000002',phone:'09120000002',active:1});
    var sub = db.subjects.filter(function(s){return s.school_id===schA;})[0];
    if(!sub) sub = add('subjects',{school_id:schA,name:'درس تستی ماندگاری'});
    /* مدرسهٔ ابتدایی + مدیر برای دوجو (دروازهٔ مقطع) */
    var schE = add('schools',{name:'ابتدایی ماندگاری',code:'PXE',city:'تست',address:'',phone:'09120000003',
      level:'ابتدایی',type:'عادی',gender:'پسرانه',branches:[],fields:[],shift:'صبح',capacity:100,active:1});
    var mgrE = add('users',{school_id:schE.id,role:'manager',full_name:'مدیر ابتدایی ماندگاری',
      username:'pxmgre_'+Date.now(),password:'x12345',national_id:'0000000003',phone:'09120000004',active:1});
    S.user = byId('users', mgr.id); S.persona = null; S.boss = null;
    return {schA:schA, mgr:mgr.id, st:st.id, sub:sub.id, schE:schE.id, mgrE:mgrE.id};
  })())`));
  assert(fx.schA && fx.mgr && fx.st && fx.sub && fx.schE && fx.mgrE, 'فیکسچر ساخته نشد');

  const logHas = (c, id) => W(
    `log.some(function(e){return e&&e.t==='ins'&&e.c==='${c}'&&e.data&&e.data.id===${id};})`) === true;
  /* R96 P0-5: صف نسخهٔ پاکِ op را دارد (id/by از data حذف شده) — پس
     تطبیق با فیلدِ یکتا، نه id */
  const qCount = (c) => W(
    `SYNC.queue.filter(function(x){return x&&(x.status==='pending'||x.status==='failed')&&x.op&&x.op.c==='${c}'&&x.op.t==='ins';}).length`);

  await sec('P1 مهمان: درج + دفترچه + صف', async () => {
    const q0 = qCount('visitors');
    const r = JSON.parse(W(`JSON.stringify(visitorRegister('مهمان ماندگاری','کار اداری'))`));
    assert(r.ok === true, 'ثبت مهمان شکست: ' + (r.msg || ''));
    assert(r.rec && r.rec.id, 'رکورد برنگشت');
    assert(W(`byId('visitors',${r.rec.id})!==undefined`) === true, 'رکورد در db نیست');
    assert(logHas('visitors', r.rec.id), 'opِ ins در دفترچه نیست (گم می‌شود!)');
    assert(qCount('visitors') === q0 + 1, 'op در صف نیست');
    assert(W(`SYNC.queue.some(function(x){return x&&x.op&&x.op.c==='visitors'&&x.op.data&&x.op.data.name==='مهمان ماندگاری';})`) === true,
      'دادهٔ صف با رکورد نمی‌خواند');
    IDS.visitor = r.rec.id;
  });

  await sec('P2 کتاب: درج + دفترچه + صف', async () => {
    const q0 = qCount('lib_books');
    const r = JSON.parse(W(`JSON.stringify(libAddBook('کتاب ماندگاری','نویسندهٔ تست','PX-B1','PX-SER-1'))`));
    assert(r.ok === true, 'ثبت کتاب شکست: ' + (r.msg || ''));
    assert(logHas('lib_books', r.rec.id), 'opِ ins در دفترچه نیست');
    assert(qCount('lib_books') === q0 + 1, 'op در صف نیست');
    IDS.book = r.rec.id;
  });

  await sec('P3 امانت: درج + دفترچه + صف', async () => {
    const q0 = qCount('lib_loans');
    const r = JSON.parse(W(`JSON.stringify(libLend(${IDS.book},${fx.st},''))`));
    assert(r.ok === true, 'امانت شکست: ' + (r.msg || ''));
    assert(logHas('lib_loans', r.rec.id), 'opِ ins در دفترچه نیست');
    assert(qCount('lib_loans') === q0 + 1, 'op در صف نیست');
    IDS.loan = r.rec.id;
  });

  await sec('P4 تجهیز: درج + دفترچه + صف', async () => {
    const q0 = qCount('assets');
    const r = JSON.parse(W(`JSON.stringify(assetAdd('تجهیز ماندگاری','کامپیوتر','انبار','available',''))`));
    assert(r.ok === true, 'ثبت تجهیز شکست: ' + (r.msg || ''));
    assert(logHas('assets', r.rec.id), 'opِ ins در دفترچه نیست');
    assert(qCount('assets') === q0 + 1, 'op در صف نیست');
    IDS.asset = r.rec.id;
  });

  await sec('P5 سیدا: درج + دفترچه + صف', async () => {
    const q0 = qCount('sedascores');
    const r = JSON.parse(W(`JSON.stringify(sedasUpsert(${fx.st},${fx.sub},'نوبت اول',17,''))`));
    assert(r.ok === true, 'ثبت نمره شکست: ' + (r.msg || ''));
    assert(r.updated === false, 'باید مسیرِ درج می‌بود نه ویرایش');
    assert(logHas('sedascores', r.rec.id), 'opِ ins در دفترچه نیست');
    assert(qCount('sedascores') === q0 + 1, 'op در صف نیست');
    IDS.seda = r.rec.id;
  });

  await sec('P6 دوجو: درجِ چندتایی + دفترچه + صف', async () => {
    const q0 = qCount('dojo_types');
    W(`S.user=byId('users',${fx.mgrE});S.persona=null;S.boss=null;dojoConfigModal();`);
    W(`(function(){
      var el=document.createElement('button');
      el.setAttribute('data-act','dojo-apply-defaults');
      document.body.appendChild(el); el.click(); el.remove();
    })()`);
    const r = JSON.parse(W(`JSON.stringify(dojoSaveModel())`));
    assert(r.ok === true, 'ذخیرهٔ مدل شکست: ' + (r.msg || ''));
    const labels = JSON.parse(W(`JSON.stringify(dojoTypes(${fx.schE}).map(function(t){return t.label;}))`));
    assert(labels.length === 4, 'انتظار ۴ نوع، شد ' + labels.length);
    const nLog = W(`log.filter(function(e){return e&&e.t==='ins'&&e.c==='dojo_types';}).length`);
    assert(nLog >= 4, 'opهایِ درج در دفترچه نیستند (شد ' + nLog + ')');
    assert(qCount('dojo_types') === q0 + 4, 'opها در صف نیستند');
    IDS.dojoLabels = labels;
    W(`S.user=byId('users',${fx.mgr});S.persona=null;S.boss=null;`);
  });

  await sec('P7 گواهی: درج + دفترچه + صف', async () => {
    const q0 = qCount('certificates');
    const r = JSON.parse(W(`JSON.stringify(certRecord('enrollment',${fx.st}))`));
    assert(r.ok === true, 'ثبت صدور شکست: ' + (r.msg || ''));
    assert(r.code, 'کد برنگشت');
    assert(logHas('certificates', r.rec.id), 'opِ ins در دفترچه نیست');
    assert(qCount('certificates') === q0 + 1, 'op در صف نیست');
    IDS.cert = r.rec.id;
  });

  await sec('P8 بوتِ تازه: هر ۷ رکورد با شناسه باقی‌اند', async () => {
    /* همان ترتیبِ بوتِ واقعی (24-edu-office.js) + بازپخشِ دفترچه */
    W(`(function(){
      generate(); generateExtras(); generateP8(); generateP9(); generateP10();
      if(typeof generateP11==='function') generateP11();
      if(typeof generateP12==='function') generateP12();
      if(typeof generateBusDemo==='function') generateBusDemo();
      if(typeof generateVclassDemo==='function') generateVclassDemo();
      if(typeof generateHomeworkDemo==='function') generateHomeworkDemo();
      if(typeof generateVisitorsDemo==='function') generateVisitorsDemo();
      if(typeof generateLibraryDemo==='function') generateLibraryDemo();
      if(typeof generateAssetsDemo==='function') generateAssetsDemo();
      if(typeof generateSidaDemo==='function') generateSidaDemo();
      if(typeof generateSchoolModeDemo==='function') generateSchoolModeDemo();
      /* دامِ آزمودن (ریشه‌یابیِ P8): بازتولیدِ درون‌حافظه‌ای ایندکس‌هایِ
         IDX را کهنه می‌کند و بازپخش، درج‌هایِ بی‌سید (گواهی/دوجو) را
         «تکراری» می‌پندارد. بوتِ واقعی (تازه‌شدنِ هیپ) این را ندارد؛
         جریانِ بازیابی (38-plans-backup.js) هم دورِ بازتولید idxReset
         می‌کند — همان الگو اینجاست. */
      if(typeof idxReset==='function') idxReset();
      applyLog();
    })()`);
    const got = JSON.parse(W(`JSON.stringify({
      visitor: (byId('visitors',${IDS.visitor})||{}).name||null,
      book: (byId('lib_books',${IDS.book})||{}).title||null,
      loan: (byId('lib_loans',${IDS.loan})||{}).book_id||null,
      asset: (byId('assets',${IDS.asset})||{}).name||null,
      seda: (byId('sedascores',${IDS.seda})||{}).score,
      cert: (byId('certificates',${IDS.cert})||{}).type||null,
      dojo: db.dojo_types.filter(function(t){return ${JSON.stringify(IDS.dojoLabels)}.indexOf(t.label)>=0;}).length
    })`));
    assert(got.visitor === 'مهمان ماندگاری', 'مهمان پس از بوت گم شد');
    assert(got.book === 'کتاب ماندگاری', 'کتاب پس از بوت گم شد');
    assert(got.loan === IDS.book, 'امانت پس از بوت گم شد');
    assert(got.asset === 'تجهیز ماندگاری', 'تجهیز پس از بوت گم شد');
    assert(got.seda === 17, 'نمرهٔ سیدا پس از بوت گم شد');
    assert(got.cert === 'enrollment', 'گواهی پس از بوت گم شد');
    assert(got.dojo === 4, 'انواع دوجو پس از بوت گم شدند (شد ' + got.dojo + ')');
  });

  await sec('P9 حسابرسیِ صف: هر ۷ مجموعه opِ فعال دارند', async () => {
    /* بازپخش با SYNC_MUTED است — شمارشِ صف همانِ پایانِ P7 */
    const n = {};
    for (const c of ['visitors', 'lib_books', 'lib_loans', 'assets', 'sedascores', 'dojo_types', 'certificates']) {
      n[c] = qCount(c);
    }
    const total = Object.values(n).reduce((a, b) => a + b, 0);
    assert(total >= 10, 'opهایِ صف کم‌اند (انتظار ≥۱۰، شد ' + total + '): ' + JSON.stringify(n));
    for (const c of Object.keys(n)) assert(n[c] >= 1, 'صفِ ' + c + ' خالی است');
  });

  const ok = results.filter((r) => r.ok).length;
  console.log('\n──────────────────────────────────────────');
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.name}  (${r.ms} ms)`);
    if (!r.ok) console.log('   ↳ ' + r.detail);
  }
  console.log('──────────────────────────────────────────');
  console.log(`سئوت ماندگاری: ${ok}/${results.length} موفق  —  ${ok === results.length ? 'بدون خطا ✅' : 'اشکال دارد ❌'}`);
  process.exit(ok === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
