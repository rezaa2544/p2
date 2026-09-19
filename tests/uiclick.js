#!/usr/bin/env node
/**
 * دور ۷۹ بندهای ۱-۲ — تستِ کلیکِ واقعیِ رابط (دیسپاتچِ دکمه‌ها) — پایش
 *
 * چرا این سئوت: باگِ پیشینِ pre-confirm/pre-reject/pre-del/bus-follow-open
 * (پارامترهایِ سای‌کنندهٔ el/id در اکشن‌هایِ A) هیچ‌گاه دیده نمی‌شد چون
 * سئوت‌های قبلی preConfirm/busFollowStart را **مستقیم** صدا می‌زدند. این
 * سئوت فقط از **دکمهٔ واقعیِ DOM** عبور می‌کند: render → querySelector →
 * click() → (مودالِ تأیید → click) — یعنی دقیقاً همان مسیری که یک مدیرِ
 * واقعی می‌رود.
 *
 * بخش‌ها:
 *  U1 قیف پیش‌ثبت‌نام: دکمهٔ «✔ تأیید» (pre-confirm) + تأیید مودال
 *     → رکورد confirmed + حسابِ دانش‌آموز ساخته می‌شود
 *  U2 دکمهٔ «رد» (pre-reject) مستقیم → رکورد rejected
 *  U3 دکمهٔ «✖» (pre-del) + تأیید مودال → رکورد حذف
 *  U4 دکمهٔ «🔎 شروع پیگیری» (bus-follow-open) با مغایرتِ واقعیِ
 *     pending → مودال باز + _busFollow درست + دکمهٔ «ذخیره» →
 *     پیگیری در bus_followups ثبت می‌شود
 *
 * اجرا: node tests/uiclick.js   (نیاز: بیلدِ تازه — node build.js)
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
const doc = win.document;
const W = (expr) => win.eval(expr);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (c, m) => { if (!c) throw new Error(m || 'شرط برقرار نیست'); };

const results = [];
const sec = async (name, fn) => {
  const t0 = Date.now();
  try { await fn(); results.push({ name, ok: true, detail: '', ms: Date.now() - t0 }); }
  catch (e) { const stack1 = String((e.stack || '').split(String.fromCharCode(10))[1] || '').trim(); results.push({ name, ok: false, detail: String(e.message || e) + '  ||  ' + stack1, ms: Date.now() - t0 }); }
};

const setU = (id) => W(`S.user=byId('users',${id});S.persona=null;S.boss=null;S.child=null;`);
const click = (sel) => {
  const b = doc.querySelector(sel);
  if (!b) throw new Error('دکمهٔ ' + sel + ' در DOM نیست');
  b.click();
};

(async () => {
  await sleep(400);

  /* مدرسهٔ ۱ (SH-101) + مدیرش برای قیف پیش‌ثبت‌نام */
  const fx = JSON.parse(W(`JSON.stringify((function(){
    var mgr = db.users.filter(function(u){return u.role==='manager'&&u.school_id===1;})[0];
    var route = db.bus_routes[0];
    var mgrBus = db.users.filter(function(u){return u.role==='manager'&&u.school_id===route.school_id;})[0];
    var bss = db.bus_students.filter(function(x){return x.route_id===route.id;});
    return { mgr: mgr?mgr.id:0, route: route.id, sc: route.school_id,
             mgrBus: mgrBus?mgrBus.id:0,
             stud: bss.length?byId('users',bss[bss.length-1].student_id).id:0 };
  })())`));
  if (!fx.mgr) throw new Error('مدیرِ مدرسهٔ ۱ پیدا نشد');
  if (!fx.route) throw new Error('مسیرِ دمو پیدا نشد');

  /* ─────────── U1: pre-confirm از دکمهٔ واقعی ─────────── */
  await sec('U1 قیف پیش‌ثبت‌نام: دکمهٔ «تأیید» واقعی → تأیید + ساختِ حساب', async () => {
    setU(fx.mgr);
    const rowId = W(`(function(){
      var p = preAddRow(1,{name:'تازه‌وارد کلیک-تست',national_id:'9999000091',phone:'09100000091',grade:10,field:null});
      return p.id;
    })()`);
    W(`S.route='schoolyear';S.tab='pre';S.filters={};S.page=1;render();`);
    click(`[data-act="pre-confirm"][data-id="${rowId}"]`);
    /* مودالِ تأیید باید باز شده باشد */
    assert(doc.querySelector('#modal [data-act="ask-ok"]'), 'مودالِ تأیید باز نشد');
    click('#modal [data-act="ask-ok"]');
    const st = JSON.parse(W(`JSON.stringify((function(){
      var pe = byId('pre_enrollments',${rowId});
      var u = pe&&pe.student_id?byId('users',pe.student_id):null;
      return { status: pe?pe.status:null, student_id: pe?pe.student_id:null,
               uName: u?u.full_name:null, uRole: u?u.role:null, uSchool: u?u.school_id:null };
    })())`));
    assert(st.status === 'confirmed', 'رکورد confirmed نشد: ' + st.status);
    assert(st.student_id, 'student_id ثبت نشد');
    assert(st.uName === 'تازه‌وارد کلیک-تست' && st.uRole === 'student' && st.uSchool === 1,
      'حسابِ دانش‌آموز درست ساخته نشد: ' + JSON.stringify(st));
  });

  /* ─────────── U2: pre-reject از دکمهٔ واقعی ─────────── */
  await sec('U2 قیف پیش‌ثبت‌نام: دکمهٔ «رد» واقعی → rejected', async () => {
    setU(fx.mgr);
    const rowId = W(`(function(){
      var p = preAddRow(1,{name:'ردشوندهٔ کلیک-تست',national_id:'9999000092',phone:null,grade:10,field:null});
      return p.id;
    })()`);
    W(`S.route='schoolyear';S.tab='pre';S.filters={};S.page=1;render();`);
    click(`[data-act="pre-reject"][data-id="${rowId}"]`);
    const st = W(`(function(){var pe=byId('pre_enrollments',${rowId});return pe?pe.status:'GONE';})()`);
    assert(st === 'rejected', 'رکورد rejected نشد: ' + st);
  });

  /* ─────────── U3: pre-del از دکمهٔ واقعی ─────────── */
  await sec('U3 قیف پیش‌ثبت‌نام: دکمهٔ «حذف» واقعی + تأیید → حذف', async () => {
    setU(fx.mgr);
    const rowId = W(`(function(){
      var p = preAddRow(1,{name:'حذف‌شوندهٔ کلیک-تست',national_id:'9999000093',phone:null,grade:11,field:null});
      return p.id;
    })()`);
    W(`S.route='schoolyear';S.tab='pre';S.filters={};S.page=1;render();`);
    click(`[data-act="pre-del"][data-id="${rowId}"]`);
    assert(doc.querySelector('#modal [data-act="ask-ok"]'), 'مودالِ تأییدِ حذف باز نشد');
    click('#modal [data-act="ask-ok"]');
    const gone = W(`!byId('pre_enrollments',${rowId})`);
    assert(gone, 'رکورد حذف نشد');
  });

  /* ─────────── U4: bus-follow-open از دکمهٔ واقعی ────────── */
  await sec('U4 پیگیری سرویس: دکمهٔ «شروع پیگیری» واقعی → مودال + ثبتِ پیگیری', async () => {
    setU(fx.mgrBus);
    /* مغایرتِ pendingِ قطعی: یک رویدادِ on بدونِ رویدادِ دانش‌آموزی */
    W(`(function(){
      var today = todayISO();
      db.bus_events.slice().forEach(function(e){
        if(e.student_id===${fx.stud} && (e.at||'').slice(0,10)===today) remove('bus_events', e.id);
      });
      insert('bus_events',{school_id:${fx.sc},route_id:${fx.route},student_id:${fx.stud},
        type:'on',at:new Date().toISOString(),by:${fx.mgrBus},source:'driver'});
    })()`);
    const mm = W(`busMismatch(${fx.stud}).key`);
    assert(mm === 'pending', 'مغایرتِ pending ساخته نشد: ' + mm);
    W(`S.route='busservice';S.filters={};S.page=1;render();`);
    click(`[data-act="bus-follow-open"][data-id="${fx.stud}"]`);
    /* مودال باید با همان دانش‌آموز باز شده باشد — نه کرش، نه مودالِ غریب */
    const mo = doc.querySelector('#modal');
    assert(mo && mo.textContent.indexOf('پیگیری مغایرت') >= 0, 'مودالِ پیگیری باز نشد (کرشِ el؟)');
    const fol = JSON.parse(W(`JSON.stringify(window._busFollow||null)`));
    assert(fol && fol.route === fx.route && fol.student === fx.stud,
      '_busFollow درست تنظیم نشد: ' + JSON.stringify(fol));
    /* ذخیره از دکمهٔ واقعیِ مودال */
    const note = doc.getElementById('bf_note');
    if (note) note.value = 'یادداشت کلیک-تست';
    click('#modal [data-act="bus-follow-save"]');
    const fu = JSON.parse(W(`JSON.stringify((function(){
      var f = busFollowOf(${fx.stud}, todayISO());
      return f ? { id:f.id, route:f.route_id, student:f.student_id, status:f.status } : null;
    })())`));
    assert(fu && fu.student === fx.stud && fu.route === fx.route && fu.status === 'open',
      'پیگیری ثبت نشد: ' + JSON.stringify(fu));
    /* پاک‌سازی: پیگیری + رویدادهایِ ساخت‌شده (ردیف‌های دمو دست‌نخورده) */
    W(`(function(){
      var today = todayISO();
      db.bus_followups.slice().forEach(function(f){
        if(f.student_id===${fx.stud} && f.date===today) remove('bus_followups', f.id);
      });
      db.bus_events.slice().forEach(function(e){
        if(e.student_id===${fx.stud} && (e.at||'').slice(0,10)===today) remove('bus_events', e.id);
      });
    })()`);
  });

  const ok = results.filter((r) => r.ok).length;
  console.log('\n──────────────────────────────────────────');
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.name}  (${r.ms} ms)`);
    if (!r.ok) console.log('   ↳ ' + r.detail);
  }
  console.log('──────────────────────────────────────────');
  console.log(`uiclick: ${ok}/${results.length} بخش سبز`);
  process.exit(ok === results.length ? 0 : 1);
})().catch((e) => { console.error('💥 ' + (e && e.stack || e)); process.exit(1); });
