#!/usr/bin/env node
/**
 * سئوت سرویس ۳ (بند ۱۴ — اصلِ واقعیت) — پایش
 *
 * در پروسهٔ جداگانه اجرا می‌شود (نه داخل smoke.js).
 *
 * بخش‌ها:
 *  G1 هندسهٔ واقعی: haversine (فاصلهٔ شناخته‌شده) + طول مسیر +
 *     پروجکشن (روی مسیر dist≈0 / pos درست + خارج dist>0) + busPointAt
 *  G2 دادهٔ نمونه: مسیر هندسهٔ واقعی دارد + موقعیت‌های دمو مختصاتی
 *     واقعی و هم‌راستای هندسه (pos سازگار)
 *  G3 busSimNext: پیشبرد به نقطهٔ بعدیِ واقعی (مختصات می‌چرخد، pos
 *    单调، دانش‌آموز به موقعیتِ خودرو) + busRecordLocation (off-route)
 *  G4 نقشهٔ واقعی: SVG با مختصات واقعی + مقیاس متر + ایستگاه‌ها +
 *     فالبِ شماتیکِ قدیمی برای مسیرِ بدون هندسه
 *  G5 busGpsGet بدون GPS → {ok:false} (جایگزینِ دروغین ساخته نمی‌شود)
 *  G6 پیگیریِ واقعی: شروع/بستن (مدیر قبول، راننده/دبیر/دانش‌آموز رد،
 *     scope مدرسه، upsert روزانه، نتیجهٔ بسته‌شدن ثبت)
 *  G7 نمایش: بخشِ پیگیری در پنل مدیر + خطِ وضعیت در تب پرونده
 *
 * اجرا: node tests/bus3.js
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (c, m) => { if (!c) throw new Error(m || 'شرط برقرار نیست'); };

const results = [];
const sec = async (name, fn) => {
  const t0 = Date.now();
  try { await fn(); results.push({ name, ok: true, detail: '', ms: Date.now() - t0 }); }
  catch (e) { const stack1 = String((e.stack||'').split(String.fromCharCode(10))[1]||'').trim(); results.push({ name, ok: false, detail: String(e.message || e) + '  ||  ' + stack1, ms: Date.now() - t0 }); }
};

const setU = (id) => W(`S.user=byId('users',${id});S.persona=null;S.boss=null;S.child=null;`);

(async () => {
  await sleep(300);
  const fx = JSON.parse(W(`JSON.stringify((function(){
    var route = db.bus_routes[0];
    var drv = db.users.filter(function(u){return u.role==='driver'&&u.school_id===route.school_id;})[0];
    var mgr = db.users.filter(function(u){return u.role==='manager'&&u.school_id===route.school_id;})[0];
    var t = db.users.filter(function(u){return u.role==='teacher'&&u.school_id===route.school_id;})[0];
    var bss = db.bus_students.filter(function(x){return x.route_id===route.id;});
    var stud = bss.length ? byId('users', bss[0].student_id).id : 0;
    var otherMgr = db.users.filter(function(u){return u.role==='manager'&&u.school_id!==route.school_id;})[0];
    return {route: route.id, drv: drv?drv.id:0, mgr: mgr?mgr.id:0, t: t?t.id:0,
            stud: stud, otherMgr: otherMgr?otherMgr.id:0, sc: route.school_id};
  })())`));
  if(!fx.route) throw new Error('مسیرِ دمو پیدا نشد');

  await sec('G1 هندسهٔ واقعی: haversine + طول + پروجکشن + pointAt', async () => {
    const r = JSON.parse(W(`JSON.stringify((function(){
      var a=[35.7000,51.4000], b=[35.7100,51.4000];
      var d = busHaversine(a,b);
      var line=[[35.70,51.40],[35.71,51.40],[35.72,51.40]];
      var prOn = busProjectOnRoute(line, 35.715, 51.40);
      var prOff = busProjectOnRoute(line, 35.715, 51.42);
      var pa = busPointAt(line, 0.5);
      var prA = busProjectOnRoute(line, pa[0], pa[1]);
      return {d:d, len:busRouteLengthM(line), prOn:prOn, prOff:prOff,
              posAt:busProjectOnRoute(line, pa[0], pa[1]).pos};
    })())`));
    assert(Math.abs(r.d-1108)<25, 'فاصلهٔ haversine ۱ عرض درجه ≈ ۱۱.۱ km نیست: ' + r.d);
    assert(Math.abs(r.len-2*1108)<50, 'طول مسیرِ خطی ≈ ۲۲.۱ km نیست: ' + r.len);
    assert(r.prOn.dist<2, 'پروجکشن روی مسیر باید dist≈0 باشد: ' + JSON.stringify(r.prOn));
    assert(Math.abs(r.prOn.pos-75)<1, 'pos روی نیمهٔ دوم باید ≈۷۵ باشد: ' + JSON.stringify(r.prOn));
    assert(r.prOff.dist>1500, 'پروجکشنِ خارج‌مسیر باید دور باشد (≈۱.۸km): ' + JSON.stringify(r.prOff));
    assert(Math.abs(r.posAt-50)<1, 'pointAt(0.5) باید pos≈۵۰ بدهد: ' + r.posAt);
  });

  await sec('G2 دادهٔ نمونه: هندسهٔ واقعی + موقعیت‌های مختصاتی سازگار', async () => {
    const r = JSON.parse(W(`JSON.stringify((function(){
      var rt = byId('bus_routes', ${fx.route});
      var veh = busLatestVehicle(${fx.route});
      var ok = false;
      if(veh){ var pr = busProjectOnRoute(rt.points, veh.lat, veh.lng); ok = pr.dist < 5 && Math.abs(pr.pos - veh.pos) < 1.5; }
      return {
        hasPts: Array.isArray(rt.points) && rt.points.length>=2,
        nStops: String(rt.stops||'').split(/[,،]/).length,
        vehLat: veh?veh.lat:0, vehLng: veh?veh.lng:0,
        consistent: ok, off: veh?veh.off:1
      };
    })())`));
    assert(r.hasPts, 'مسیرِ دمو هندسهٔ واقعی ندارد');
    assert(r.nStops>=3, 'ایستگاه‌های مسیر نیست');
    assert(r.vehLat>35 && r.vehLat<36 && r.vehLng>51 && r.vehLng<52, 'مختصاتِ دمو واقعی نیست: ' + JSON.stringify(r));
    assert(r.consistent, 'pos ذخیره‌شده با هندسهٔ واقعی سازگار نیست: ' + JSON.stringify(r));
    assert(r.off===0, 'موقعیتِ دمو باید روی مسیر باشد');
  });

  await sec('G3 busSimNext + busRecordLocation (off-route واقعی)', async () => {
    try{
      setU(fx.drv);
      const before = JSON.parse(W(`JSON.stringify(busLatestVehicle(${fx.route})||{pos:null})`));
      const r1 = JSON.parse(W(`JSON.stringify(busSimNext(${fx.route},'driver'))`));
      assert(r1.ok===true, 'simNext شکست: ' + (r1.msg||''));
      assert(r1.rec.lat && r1.rec.lng, 'مختصاتِ واقعی ثبت نشد');
      const after = JSON.parse(W(`JSON.stringify(busLatestVehicle(${fx.route}))`));
      assert(after.lat!==before.lat || after.lng!==before.lng, 'مختصات تغییر نکرد');
      const rS = JSON.parse(W(`JSON.stringify((function(){
        S.user=byId('users',${fx.stud});S.persona=null;S.boss=null;S.child=null;
        return busSimNext(${fx.route},'student');
      })())`));
      assert(rS.ok===true, 'simNext دانش‌آموز شکست: ' + (rS.msg||''));
      const veh = JSON.parse(W(`JSON.stringify(busLatestVehicle(${fx.route}))`));
      assert(Math.abs(rS.rec.lat-veh.lat)<1e-9, 'دانش‌آموز باید در موقعیتِ واقعیِ خودرو ثبت شود');
      /* off-route: ۴۰۰ متر کناره‌ای → off:1 */
      const off = JSON.parse(W(`JSON.stringify((function(){
        var rt=byId('bus_routes',${fx.route});
        var p=rt.points[1];
        return busRecordLocation(${fx.route},{lat:p[0], lng:p[1]+0.006},0,'driver');
      })())`));
      assert(off.ok===true, 'recordLocation شکست: ' + (off.msg||''));
      assert(off.rec.off===1, 'خارج از مسیر (≈۴۵۰m) تشخیص داده نشد');
      W(`remove('bus_locations', ${off.rec.id})`);
    } finally {
      /* پاک‌سازی: موقعیت‌های ساخته‌شده در این بخش (بعد از دو ردیف دمو) */
      W(`(function(){
        var rows = db.bus_locations.filter(function(l){ return l.route_id===${fx.route}; })
          .sort(function(a,b){ return (b.recorded_at||'').localeCompare(a.recorded_at||''); });
        rows.slice(2).forEach(function(l){ remove('bus_locations', l.id); });
      })()`);
    }
  });

  await sec('G4 نقشهٔ واقعی: SVG مختصاتی + فالبِ قدیمی', async () => {
    const r = JSON.parse(W(`JSON.stringify((function(){
      var h = busSchematicHtml(${fx.route});
      var legacy = add('bus_routes',{school_id:${fx.sc}, name:'مسیر قدیمی بدون هندسه', driver_id:0, created_at:todayISO()});
      var h2 = busSchematicHtml(legacy.id);
      remove('bus_routes', legacy);
      return {
        isSvg: h.indexOf('<svg')>=0,
        hasCoord: /\\d+\\.\\d{3}°/.test(h),
        hasScale: h.indexOf('متر')>=0,
        hasNorth: h.indexOf('شمال')>=0,
        legacyBar: h2.indexOf('موقعیت روی مسیر')>=0 && h2.indexOf('<svg')<0
      };
    })())`));
    assert(r.isSvg, 'نقشهٔ واقعی SVG نیست');
    assert(r.hasCoord, 'مختصاتِ واقعی (°) روی نقشه نیست');
    assert(r.hasScale, 'مقیاسِ متر واقعی نیست');
    assert(r.hasNorth, 'جهتِ شمال نیست');
    assert(r.legacyBar, 'مسیرِ بدون هندسه باید فالبِ شماتیکِ قدیمی بدهد');
  });

  await sec('G5 بدون GPS: جایگزینِ دروغین ساخته نمی‌شود', async () => {
    const r = JSON.parse(await W(`(async()=>{ const g = await busGpsGet(); return JSON.stringify(g); })()`));
    assert(r.ok===false && (r.reason==='nogs' || r.reason==='timeout' || r.reason==='err'),
      'jsdom GPS ندارد و باید {ok:false} برگردد: ' + JSON.stringify(r));
  });

  await sec('G6 پیگیریِ واقعی: نقش + scope + upsert + بستن', async () => {
    const st = fx.stud;
    try{
      /* راننده/دبیر/دانش‌آموز → رد */
      setU(fx.drv);
      let r = JSON.parse(W(`JSON.stringify(busFollowStart(${fx.route},${st},'x'))`));
      assert(r.ok===false, 'راننده پیگیری ساخت!');
      setU(fx.t);
      r = JSON.parse(W(`JSON.stringify(busFollowStart(${fx.route},${st},'x'))`));
      assert(r.ok===false, 'دبیر پیگیری ساخت!');
      setU(st);
      r = JSON.parse(W(`JSON.stringify(busFollowStart(${fx.route},${st},'x'))`));
      assert(r.ok===false, 'دانش‌آموز پیگیری ساخت!');
      /* مدیرِ مدرسهٔ دیگر → رد (scope) */
      if(fx.otherMgr){
        setU(fx.otherMgr);
        r = JSON.parse(W(`JSON.stringify(busFollowStart(${fx.route},${st},'x'))`));
        assert(r.ok===false, 'مدیرِ مدرسهٔ دیگر پیگیری ساخت!');
      }
      /* مدیرِ خود: شروع → upsert (همان ردیف) → بستن → نتیجه */
      setU(fx.mgr);
      r = JSON.parse(W(`JSON.stringify(busFollowStart(${fx.route},${st},'تماس با راننده'))`));
      assert(r.ok===true, 'مدیر نتوانست پیگیری شروع کند: ' + (r.msg||''));
      const id1 = r.rec.id;
      r = JSON.parse(W(`JSON.stringify(busFollowStart(${fx.route},${st},'یادداشت تازه'))`));
      assert(r.ok===true && r.rec.id===id1, 'upsert روزانه نشد — ردیف دوم ساخته شد');
      assert(r.rec.note==='یادداشت تازه', 'یادداشت به‌روز نشد');
      const n = W(`db.bus_followups.filter(function(x){return x.student_id===${st}&&x.date===todayISO();}).length`);
      assert(n===1, 'باید فقط یک ردیفِ روزانه باشد: ' + n);
      r = JSON.parse(W(`JSON.stringify(busFollowClose(${id1},'حل شد: تأیید پیاده‌شدن'))`));
      assert(r.ok===true && r.rec.status==='closed', 'بستن شکست');
      assert(r.rec.close_note==='حل شد: تأیید پیاده‌شدن' && r.rec.closed_by===fx.mgr, 'نتیجهٔ بستن ثبت نشد');
      /* دانش‌آموز نمی‌تواند ببندد */
      const rC = JSON.parse(W(`(function(){S.user=byId('users',${st});S.persona=null;S.boss=null;S.child=null; return JSON.stringify(busFollowClose(${id1},'x'))})()`));
      assert(rC.ok===false, 'دانش‌آموز پیگیری بست!');
    } finally {
      /* (st, today) ردیفِ دمو نداشت (ردیفِ دمو مالِ دانش‌آموز دوم است) — همه پاک */
      setU(fx.mgr);
      W(`(function(){
        db.bus_followups.slice().forEach(function(f){
          if(f.student_id===${st} && f.date===todayISO()) remove('bus_followups', f.id);
        });
      })()`);
    }
  });

  await sec('G7 نمایش: بخشِ پیگیری مدیر + خطِ وضعیت پرونده', async () => {
    setU(fx.mgr, '');
    W(`S.route='busservice';S.filters={};S.page=1;`);
    const outM = W(`renderRoute()`);
    assert(outM.indexOf('پیگیری مغایرت سوار/پیاده')>=0, 'بخشِ پیگیری در پنل مدیر نیست');
    assert(outM.indexOf('data-act="bus-follow-open"')>=0 || outM.indexOf('data-act="bus-follow-close"')>=0, 'دکمه‌های پیگیری نیستند');
    /* دانش‌آموز: خطِ وضعیتِ پیگیری در تب سرویس (یک پیگیریِ موقت می‌سازیم) */
    try{
      setU(fx.mgr);
      const rF = JSON.parse(W(`JSON.stringify(busFollowStart(${fx.route},${fx.stud},'بررسی موقت'))`));
      assert(rF.ok===true, 'ساختِ پیگیریِ موقت شکست');
      setU(fx.stud);
      W(`S.route='record';S.filters={};S.page=1;S.tab='bus';S.child=null;`);
      const outS = W(`renderRoute()`);
      assert(outS.indexOf('در حال <b>پیگیری</b>')>=0, 'خطِ وضعیتِ پیگیری در پروندهٔ دانش‌آموز نیست');
    } finally {
      setU(fx.mgr);
      W(`(function(){
        db.bus_followups.slice().forEach(function(f){
          if(f.student_id===${fx.stud} && f.date===todayISO()) remove('bus_followups', f.id);
        });
      })()`);
    }
  });

  const ok = results.filter((r) => r.ok).length;
  console.log('\n──────────────────────────────────────────');
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.name}  (${r.ms} ms)`);
    if (!r.ok) console.log('   ↳ ' + r.detail);
  }
  console.log('──────────────────────────────────────────');
  console.log(`سئوت سرویس ۳: ${ok}/${results.length} موفق  —  ${ok===results.length?'بدون خطا ✅':'اشکال دارد ❌'}`);
  process.exit(ok === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
