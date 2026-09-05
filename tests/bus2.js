#!/usr/bin/env node
/**
 * سئوت امنیت سرویس (بند ۱۱): نیاز اولیا + ثبت دوسویه + مغایرت + موقعیت
 *
 * در پروسهٔ جداگانه اجرا می‌شود (نه داخل smoke.js).
 *
 * بخش‌ها:
 *  B1 دادهٔ نمونه (هر سه پاسخ + موقعیت + یک مغایرتِ واقعی)
 *  B2 busNeedSet: مدیر قبول (upsert) + ولی فقط فرزندش + نقش‌های دیگر رد
 *  B3 busEvent دوسویه: دانش‌آموز فقط خودش، راننده فقط مسیر خودش
 *  B4 busMismatch: none → pending → ok / conflict (رویدادهای کنترل‌شده)
 *  B5 busLocationSend: راننده/دانش‌آموز + بازهٔ pos + گاردها
 *
 * اجرا: node tests/bus2.js
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

/** فیکسور: مدرسهٔ فعال + مدیر + مسیر دمو + دانش‌آموزها + ولی */
async function bFx(){
  return JSON.parse(W(`JSON.stringify((function(){
    var sc = db.schools.filter(function(s){return s.active;})[0];
    var mgr = db.users.filter(function(x){return x.role==='manager'&&x.school_id===sc.id;})[0];
    var route = db.bus_routes.filter(function(r){return r.school_id===sc.id;})[0];
    if(!route) return null;
    var onRoute = db.bus_students.filter(function(b){return b.route_id===route.id;})
      .map(function(b){return b.student_id;});
    /* دانش‌آموزِ روی مسیر که امروز رویدادِ student نداشته باشد */
    var clean = null, dirty = null;
    onRoute.forEach(function(sid){
      var evs = db.bus_events.filter(function(e){return e.student_id===sid && (e.at||'').slice(0,10)===todayISO();});
      if(evs.some(function(e){return e.source==='student';}) && !dirty) dirty = sid;
      else if(!evs.length && !clean) clean = sid;
    });
    var otherStu = db.users.filter(function(x){return x.role==='student'&&x.school_id===sc.id&&onRoute.indexOf(x.id)<0;})[0];
    var parentId = null, parentChild = null;
    if(dirty){
      var pl = db.parent_links.filter(function(p){return p.student_id===dirty;})[0];
      if(pl) { parentId = pl.parent_id; parentChild = dirty; }
    }
    window.__bFx = {sc:sc.id, mgr:mgr.id, route:route.id,
      onRoute: onRoute, clean: clean||0, dirty: dirty||0,
      otherStu: otherStu?otherStu.id:0, parentId: parentId||0, parentChild: parentChild||0};
    return {sc:sc.id, mgr:mgr.id, route:route.id,
      onRoute: onRoute, clean: clean||0, dirty: dirty||0,
      otherStu: otherStu?otherStu.id:0, parentId: parentId||0, parentChild: parentChild||0};
  })())`));
}

(async () => {
  await sleep(300);
  const fx = await bFx();
  if(!fx) throw new Error('فیکسور ساخته نشد');
  let created = {needs:[], events:[], locs:[]};

  await sec('B1 دادهٔ نمونه: هر سه پاسخ + موقعیت + یک مغایرت', async () => {
    const r = JSON.parse(W(`JSON.stringify((function(){
      var needs = {};
      db.bus_needs.filter(function(n){return n.school_id===${fx.sc};}).forEach(function(n){ needs[n.answer]=(needs[n.answer]||0)+1; });
      var conf = 0, pend = 0;
      db.bus_students.filter(function(b){return b.route_id===${fx.route};}).forEach(function(b){
        var m = busMismatch(b.student_id);
        if(m.key==='conflict') conf++;
        if(m.key==='pending') pend++;
      });
      var locs = db.bus_locations.filter(function(l){return l.route_id===${fx.route};});
      return {needs:needs, conflict:conf, pending:pend, locs:locs.length,
        driverLoc: locs.some(function(l){return l.student_id===0 && l.source==='driver';})};
    })())`));
    assert(r.needs.school>=2 && r.needs.self>=1 && r.needs.none>=1, 'هر سه پاسخ لازم است: ' + JSON.stringify(r.needs));
    assert(r.conflict>=1, 'مغایرتِ نمونه نیست');
    assert(r.locs>=2 && r.driverLoc, 'موقعیتِ نمونه نیست: ' + JSON.stringify(r));
  });

  await sec('B2 busNeedSet: مدیر (upsert) + ولی فقط فرزند + بقیه رد', async () => {
    try{
      W(`S.user=byId('users',${fx.mgr});S.persona=null;S.boss=null;`);
      const r1 = JSON.parse(W(`JSON.stringify(busNeedSet(${fx.otherStu}, 'self', 'تست'))`));
      assert(r1.ok===true, 'ثبت مدیر شکست: ' + (r1.msg||''));
      assert(r1.rec.school_id===fx.sc, 'school_id درست نیست');
      created.needs.push(r1.rec.id);
      /* upsert: ردیفِ دوم نساخته شود */
      const r2 = JSON.parse(W(`JSON.stringify(busNeedSet(${fx.otherStu}, 'none', ''))`));
      assert(r2.ok===true && r2.updated===true && r2.rec.id===r1.rec.id, 'آپسِرت درست کار نکرد: ' + JSON.stringify(r2));
      const cnt = W(`db.bus_needs.filter(function(n){return n.student_id===${fx.otherStu};}).length`);
      assert(cnt===1, 'ردیف تکراری: ' + cnt);
      /* پاسخ نامعتبر */
      const rB = JSON.parse(W(`JSON.stringify(busNeedSet(${fx.otherStu}, 'maybe', ''))`));
      assert(rB.ok===false, 'پاسخ نامعتبر پذیرفته شد!');
      /* ولی برای فرزندش */
      if(fx.parentId){
        W(`S.user=byId('users',${fx.parentId});S.child=${fx.parentChild};S.boss=null;`);
        const rP = JSON.parse(W(`JSON.stringify(busNeedSet(${fx.parentChild}, 'school', ''))`));
        assert(rP.ok===true, 'ولی نتوانست برای فرزندش ثبت کند: ' + (rP.msg||''));
        /* ولی برای کسی که فرزندش نیست */
        const notChild = JSON.parse(W(`JSON.stringify((function(){
          var kids = db.parent_links.filter(function(p){return p.parent_id===${fx.parentId};}).map(function(p){return p.student_id;});
          var s = db.users.filter(function(x){return x.role==='student'&&x.school_id===${fx.sc}&&kids.indexOf(x.id)<0;})[0];
          return s?s.id:0;
        })())`));
        if(notChild){
          W(`S.user=byId('users',${fx.parentId});S.child=${notChild};S.boss=null;`);
          const rPX = JSON.parse(W(`JSON.stringify(busNeedSet(${notChild}, 'school', ''))`));
          assert(rPX.ok===false, 'ولی برای غیرفرزند ثبت کرد!');
        }
      }
      /* دبیر → رد */
      const t = JSON.parse(W(`JSON.stringify((function(){
        var x=db.users.filter(function(x){return x.role==='teacher'&&x.school_id===${fx.sc};})[0];
        return x?x.id:0;
      })())`));
      W(`S.user=byId('users',${t});S.persona=null;S.boss=null;`);
      const rT = JSON.parse(W(`JSON.stringify(busNeedSet(${fx.otherStu}, 'none', ''))`));
      assert(rT.ok===false, 'دبیر پاسخ سرویس ثبت کرد!');
    } finally {
      created.needs.forEach((id) => W(`remove('bus_needs',${id})`));
    }
  });

  await sec('B3 busEvent دوسویه: دانش‌آموز فقط خودش + راننده فقط مسیرش', async () => {
    try{
      /* دانش‌آموزِ روی مسیر برای خودش */
      W(`S.user=byId('users',${fx.clean});S.persona=null;S.boss=null;`);
      const r1 = JSON.parse(W(`JSON.stringify(busEvent(${fx.clean}, 'on', 'student'))`));
      assert(r1.ok===true, 'دانش‌آموز رویدادِ خودش را ثبت نکرد: ' + (r1.msg||''));
      assert(r1.rec.source==='student', 'source رویدادِ دانش‌آموز درست نیست: ' + r1.rec.source);
      created.events.push(r1.rec.id);
      /* دانش‌آموز برای دیگری → رد */
      const r2 = JSON.parse(W(`JSON.stringify(busEvent(${fx.dirty}, 'on', 'student'))`));
      assert(r2.ok===false, 'دانش‌آموز رویدادِ دیگری را ثبت کرد!');
      /* راننده برای مسیر خودش */
      const drv = JSON.parse(W(`JSON.stringify((function(){
        var r=byId('bus_routes',${fx.route}); return r?r.driver_id:0;
      })())`));
      W(`S.user=byId('users',${drv});S.persona=null;S.boss=null;`);
      const r3 = JSON.parse(W(`JSON.stringify(busEvent(${fx.clean}, 'on'))`));
      assert(r3.ok===true, 'راننده رویدادِ مسیرش را ثبت نکرد: ' + (r3.msg||''));
      assert(r3.rec.source==='driver', 'source رویدادِ راننده درست نیست: ' + r3.rec.source);
      created.events.push(r3.rec.id);
      /* رانندهٔ بی‌مسیر (ساختگی) → رد */
      const fakeD = JSON.parse(W(`JSON.stringify(insert('users',{school_id:${fx.sc},role:'driver',full_name:'رانندهٔ بی‌مسیر',username:'fadriver'+Date.now(),phone:'',active:1}).id)`));
      try{
        W(`S.user=byId('users',${fakeD});S.persona=null;S.boss=null;`);
        const r4 = JSON.parse(W(`JSON.stringify(busEvent(${fx.clean}, 'off'))`));
        assert(r4.ok===false, 'رانندهٔ بی‌مسیر رویداد ثبت کرد!');
      } finally { W(`remove('users',${fakeD})`); }
    } finally {
      created.events.forEach((id) => W(`remove('bus_events',${id})`));
    }
  });

  await sec('B4 busMismatch: none → pending → ok / conflict', async () => {
    try{
      const sid = fx.clean;
      let m0 = JSON.parse(W(`JSON.stringify(busMismatch(${sid}))`));
      assert(m0.key==='none', 'بدون رویداد باید none باشد: ' + m0.key);
      /* فقط راننده → pending */
      const drv = JSON.parse(W(`JSON.stringify(byId('bus_routes',${fx.route}).driver_id)`));
      W(`S.user=byId('users',${drv});S.persona=null;S.boss=null;`);
      const e1 = JSON.parse(W(`JSON.stringify(busEvent(${sid}, 'on'))`));
      created.events.push(e1.rec.id);
      let m1 = JSON.parse(W(`JSON.stringify(busMismatch(${sid}))`));
      assert(m1.key==='pending', 'فقط راننده باید pending باشد: ' + m1.key);
      /* دانش‌آموز هم «سوار» → ok */
      W(`S.user=byId('users',${sid});S.persona=null;S.boss=null;`);
      const e2 = JSON.parse(W(`JSON.stringify(busEvent(${sid}, 'on', 'student'))`));
      created.events.push(e2.rec.id);
      let m2 = JSON.parse(W(`JSON.stringify(busMismatch(${sid}))`));
      assert(m2.key==='ok', 'هم‌خوانی باید ok باشد: ' + m2.key);
      /* دانش‌آموز «پیاده» بگوید ولی راننده هنوز «سوار» → conflict */
      const e3 = JSON.parse(W(`JSON.stringify(busEvent(${sid}, 'off', 'student'))`));
      created.events.push(e3.rec.id);
      let m3 = JSON.parse(W(`JSON.stringify(busMismatch(${sid}))`));
      assert(m3.key==='conflict', 'مغایرت شناسایی نشد: ' + m3.key);
      assert(m3.lastD && m3.lastD.type==='on' && m3.lastS && m3.lastS.type==='off', 'طرف‌های مغایرت درست نیستند: ' + JSON.stringify(m3));
    } finally {
      created.events.forEach((id) => W(`remove('bus_events',${id})`));
    }
  });

  await sec('B5 busLocationSend: گاردها + بازهٔ pos + آخرین موقعیت', async () => {
    try{
      const drv = JSON.parse(W(`JSON.stringify(byId('bus_routes',${fx.route}).driver_id)`));
      W(`S.user=byId('users',${drv});S.persona=null;S.boss=null;`);
      const r1 = JSON.parse(W(`JSON.stringify(busLocationSend('driver', 42))`));
      assert(r1.ok===true, 'موقعیتِ راننده ثبت نشد: ' + (r1.msg||''));
      assert(r1.rec.pos===42 && r1.rec.student_id===0 && r1.rec.source==='driver', 'محتوای موقعیت درست نیست: ' + JSON.stringify(r1.rec));
      created.locs.push(r1.rec.id);
      const latest = JSON.parse(W(`JSON.stringify(busLatestLocation(${fx.route}))`));
      assert(latest && latest.id===r1.rec.id, 'آخرین موقعیت درست برنگشت');
      /* pos خارج از بازه */
      const rB = JSON.parse(W(`JSON.stringify(busLocationSend('driver', 140))`));
      assert(rB.ok===false, 'pos خارج از بازه پذیرفته شد!');
      /* رانندهٔ بی‌مسیر (ساختگی) → رد */
      const fakeD2 = JSON.parse(W(`JSON.stringify(insert('users',{school_id:${fx.sc},role:'driver',full_name:'رانندهٔ بی‌مسیر ۲',username:'fadriver2'+Date.now(),phone:'',active:1}).id)`));
      try{
        W(`S.user=byId('users',${fakeD2});S.persona=null;S.boss=null;`);
        const rX = JSON.parse(W(`JSON.stringify(busLocationSend('driver', 10))`));
        assert(rX.ok===false, 'رانندهٔ بی‌مسیر موقعیت فرستاد!');
      } finally { W(`remove('users',${fakeD2})`); }
      /* دانش‌آموزِ روی مسیر → قبول (pos = همان خودرو) */
      W(`S.user=byId('users',${fx.clean});S.persona=null;S.boss=null;`);
      const rS = JSON.parse(W(`JSON.stringify(busLocationSend('student', 0, 0))`));
      assert(rS.ok===true, 'موقعیتِ دانش‌آموز ثبت نشد: ' + (rS.msg||''));
      assert(rS.rec.student_id===fx.clean && rS.rec.source==='student', 'محتوای موقعیتِ دانش‌آموز درست نیست: ' + JSON.stringify(rS.rec));
      created.locs.push(rS.rec.id);
      /* دانش‌آموزِ بدون مسیر → رد */
      W(`S.user=byId('users',${fx.otherStu});S.persona=null;S.boss=null;`);
      const rN = JSON.parse(W(`JSON.stringify(busLocationSend('student', 0, 0))`));
      assert(rN.ok===false, 'دانش‌آموزِ بی‌مسیر موقعیت فرستاد!');
    } finally {
      created.locs.forEach((id) => W(`remove('bus_locations',${id})`));
    }
  });

  W(`window.__bFx=null`);
  const ok = results.filter((r) => r.ok).length;
  console.log('\n──────────────────────────────────────────');
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.name}  (${r.ms} ms)`);
    if (!r.ok) console.log('   ↳ ' + r.detail);
  }
  console.log('──────────────────────────────────────────');
  console.log(`سئوت سرویس ۲: ${ok}/${results.length} موفق  —  ${ok===results.length?'بدون خطا ✅':'اشکال دارد ❌'}`);
  process.exit(ok === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
