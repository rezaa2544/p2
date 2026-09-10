#!/usr/bin/env node
/**
 * سئوت اموال ۲ (E.5: شمارها + تحویلدار + جستجو + هوک سرور)
 *
 * بخش‌ها (jsdom روی index.html ساخته‌شده):
 *  B1 شمارها (ثبت/ویرایش، اعتبارسنجی، پیش‌فرضِ سازگار)
 *  B2 تحویلدار (اعطا/لغو، به‌روزرسانی، منعِ ثبت/حذف و بی‌مجوز و غیرهم‌مدرسه)
 *  B3 نما + جستجو (مدیر/تحویلدار، بخش تفویض، فیلتر)
 * بخش‌ها (سرور، درون‌پروسه‌ای):
 *  S1 قلمروِ تحویلدار (inScope)
 *  S2 سرتاسری apiSync (upd تحویلدار می‌نشیند، بی‌مجوز out_of_scope)
 *
 * اجرا: node tests/assets2.js   (نیازمند jsdom + بیلدِ تازه: node build.js)
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
const J = (expr) => JSON.parse(W(`JSON.stringify(${expr})`));

async function fx() {
  return J(`(function(){
    var scs = db.schools.filter(function(s){return s.active;});
    var sc = scs[0], other = scs[1] || null;
    var mgr = db.users.filter(function(x){return x.role==='manager'&&x.school_id===sc.id;})[0];
    var tea = db.users.filter(function(x){return x.role==='teacher'&&x.school_id===sc.id;})[0];
    var teaX = other ? db.users.filter(function(x){return x.role==='teacher'&&x.school_id===other.id;})[0] : null;
    return {sc:sc.id, other:other?other.id:0, mgr:mgr.id, tea:tea?tea.id:0, teaX:teaX?teaX.id:0};
  })()`);
}
function asMgr(f) { W(`S.user=byId('users',${f.mgr});S.persona=null;S.boss=null;`); }
function asTea(f) { W(`S.user=byId('users',${f.tea});S.persona=null;S.boss=null;`); }
function tearDown() {
  W(`(function(){
    db.assets.filter(function(a){return a._e5;}).forEach(function(a){remove('assets',a.id);});
    db.users.forEach(function(u){ if(u._e5staff) delete u.asset_staff; });
  })()`);
}
function mkAsset(name, status, extra) {
  const ex = extra ? JSON.stringify(extra) : 'undefined';
  const r = J(`assetAdd(${JSON.stringify(name)},'اداری','انبار','${status}','',${ex})`);
  assert(r.ok === true, 'ساخت تجهیز شکست: ' + (r.msg || ''));
  W(`(function(){var a=byId('assets',${r.rec.id}); if(a) a._e5=1;})()`);
  return r.rec.id;
}

(async () => {
  await sleep(300);

  await sec('B1 شمارها', async () => {
    const f = await fx();
    try {
      asMgr(f);
      const aid = mkAsset('میز تحریر', 'available', { total_count: 10, usable_count: 7 });
      const a = J(`byId('assets',${aid})`);
      assert(a.total_count === 10 && a.usable_count === 7, 'شمارها ننشستند');
      const bad = J(`assetAdd('X','Y','Z','available','',{total_count:2,usable_count:5})`);
      assert(bad.ok === false, 'usable>total پذیرفته شد!');
      const e1 = J(`assetEdit(${aid},{usable_count:4,note:'دو عدد خراب'})`);
      assert(e1.ok === true, 'ویرایش شکست: ' + (e1.msg || ''));
      assert(J(`byId('assets',${aid}).usable_count`) === 4, 'شمار به‌روز نشد');
      const e2 = J(`assetEdit(${aid},{usable_count:99})`);
      assert(e2.ok === false, 'ویرایشِ usable>total پذیرفته شد!');
      const e3 = J(`assetEdit(${aid},{name:''})`);
      assert(e3.ok === false, 'نامِ خالی پذیرفته شد!');
      /* پیش‌فرضِ سازگار: available ← total، غیر آن ← ۰ */
      const a2 = mkAsset('صندلی', 'available');
      assert(J(`byId('assets',${a2}).total_count`) === 1 && J(`byId('assets',${a2}).usable_count`) === 1, 'پیش‌فرضِ available');
      const a3 = mkAsset('میز شکسته', 'repair');
      assert(J(`byId('assets',${a3}).usable_count`) === 0, 'پیش‌فرضِ repair');
      asTea(f);
      const e4 = J(`assetEdit(${aid},{note:'X'})`);
      assert(e4.ok === false, 'دبیر شناسنامه را ویرایش کرد!');
    } finally { tearDown(); }
  });

  await sec('B2 تحویلدار', async () => {
    const f = await fx();
    try {
      asMgr(f);
      const aid = mkAsset('نیمکت', 'available', { total_count: 5, usable_count: 5 });
      asTea(f);
      const d0 = J(`assetSetStatus(${aid},'repair','کارگاه')`);
      assert(d0.ok === false, 'دبیرِ بی‌مجوز به‌روز کرد!');
      asMgr(f);
      W(`(function(){var t=byId('users',${f.tea}); if(t) t._e5staff=1;})()`);
      const g = J(`assetSetCustodian(${f.tea},true)`);
      assert(g.ok === true, 'اعطا شکست: ' + (g.msg || ''));
      asTea(f);
      const d1 = J(`assetSetStatus(${aid},'repair','کارگاه',{usable_count:3})`);
      assert(d1.ok === true, 'تحویلدار نتوانست به‌روز کند: ' + (d1.msg || ''));
      const v = J(`byId('assets',${aid})`);
      assert(v.status === 'repair' && v.location === 'کارگاه' && v.usable_count === 3, 'به‌روزرسانی ننشست');
      const dBad = J(`assetSetStatus(${aid},'repair','کارگاه',{usable_count:99})`);
      assert(dBad.ok === false, 'تحویلدار شمارِ نامعتبر نشاند!');
      const nb = J(`assetAdd('X','Y','Z','available')`);
      assert(nb.ok === false, 'تحویلدار تجهیز ساخت!');
      const dl = J(`assetDel(${aid})`);
      assert(dl.ok === false, 'تحویلدار تجهیز را حذف کرد!');
      asMgr(f);
      J(`assetSetCustodian(${f.tea},false)`);
      asTea(f);
      const d2 = J(`assetSetStatus(${aid},'available','انبار')`);
      assert(d2.ok === false, 'پس از لغو، به‌روزرسانی رفت!');
      if (f.teaX) {
        asMgr(f);
        W(`(function(){var t=byId('users',${f.teaX}); if(t) t._e5staff=1;})()`);
        J(`assetSetCustodian(${f.teaX},true)`);
        W(`S.user=byId('users',${f.teaX});S.persona=null;S.boss=null;`);
        const dX = J(`assetSetStatus(${aid},'available','انبار')`);
        assert(dX.ok === false, 'تحویلدارِ مدرسهٔ دیگر به‌روز کرد!');
        asMgr(f);
        J(`assetSetCustodian(${f.teaX},false)`);
      }
    } finally { tearDown(); }
  });

  await sec('B3 نما + جستجو', async () => {
    const f = await fx();
    try {
      asMgr(f);
      mkAsset('میکروسکوپ آزمایشگاه', 'available');
      W(`(function(){var t=byId('users',${f.tea}); if(t) t._e5staff=1;})()`);
      J(`assetSetCustodian(${f.tea},true)`);
      asTea(f);
      const out = W(`(S.route='assets',S.filters={},S.page=1,renderRoute())`);
      assert(out.indexOf('دسترسی مجاز نیست') < 0, 'نمای تحویلدار مسدود است');
      assert(out.indexOf('data-act="as-status"') >= 0, 'دکمهٔ وضعیت برای تحویلدار نیست');
      assert(out.indexOf('data-act="as-new"') < 0, 'دکمهٔ ثبت در نمای تحویلدار!');
      assert(out.indexOf('data-act="as-del"') < 0, 'دکمهٔ حذف در نمای تحویلدار!');
      assert(out.indexOf('تفویضِ تحویلداری') < 0, 'بخش تفویض در نمای تحویلدار!');
      asMgr(f);
      J(`assetSetCustodian(${f.tea},false)`);
      const outT = W(`(S.user=byId('users',${f.tea}),S.persona=null,S.boss=null,S.route='assets',S.filters={},S.page=1,renderRoute())`);
      assert(outT.indexOf('دسترسی مجاز نیست') >= 0, 'دبیرِ بی‌مجوز صفحه را دید!');
      asMgr(f);
      const outM = W(`(S.route='assets',S.filters={},S.page=1,renderRoute())`);
      assert(outM.indexOf('تفویضِ تحویلداری') >= 0, 'بخش تفویضِ مدیر نیست');
      const r1 = J(`assetSearch('میکروسکوپ',${f.sc}).length`);
      const r2 = J(`assetSearch('',${f.sc}).length`);
      assert(r1 >= 1 && r2 > r1, 'جستجو درست کار نمی‌کند');
    } finally { tearDown(); }
  });

  await sec('S1 قلمروِ تحویلدار (inScope)', async () => {
    const { inScope, attach } = require('../server/sync.js');
    const store = {
      users: [
        { id: 1, role: 'manager', school_id: 7 },
        { id: 2, role: 'teacher', school_id: 7, asset_staff: 1 },
        { id: 3, role: 'teacher', school_id: 7 },
        { id: 4, role: 'teacher', school_id: 8, asset_staff: 1 },
      ],
      assets: [{ id: 50, school_id: 7, name: 'X', status: 'available' }],
    };
    attach(store);
    const d7 = { school_id: 7, status: 'repair' };
    const mgr = { id: 1, role: 'manager', school_id: 7 };
    const cus = { id: 2, role: 'teacher', school_id: 7 };
    const plain = { id: 3, role: 'teacher', school_id: 7 };
    const other = { id: 4, role: 'teacher', school_id: 8 };
    assert(inScope(mgr, 'assets', 50, { status: 'repair' }) === true, 'مدیر باید آزاد باشد');
    assert(inScope(cus, 'assets', 50, { status: 'repair' }) === true, 'تحویلدار باید آزاد باشد');
    assert(inScope(plain, 'assets', 50, { status: 'repair' }) === false, 'بی‌مجوز رد نشد!');
    assert(inScope(other, 'assets', 50, { status: 'repair' }) === false, 'غیرهم‌مدرسه رد نشد!');
    assert(inScope(cus, 'assets', null, { school_id: 8 }) === false, 'رکوردِ مدرسهٔ دیگر رد نشد!');
  });

  await sec('S2 سرتاسری apiSync', async () => {
    const { createSync, attach } = require('../server/sync.js');
    function makeCtx(user) {
      const store = {
        users: [
          { id: 1, role: 'manager', school_id: 7, full_name: 'M' },
          { id: 2, role: 'teacher', school_id: 7, full_name: 'T', asset_staff: 1 },
          { id: 3, role: 'teacher', school_id: 7, full_name: 'P' },
        ],
        assets: [{ id: 50, school_id: 7, name: 'X', status: 'available', total_count: 1, usable_count: 1 }],
        __processed_uids: {}, __server_version: 0,
      };
      attach(store);
      return createSync({
        store, db: null, MAX_BATCH: 500, AT_DRIFT_MS: 24 * 3600 * 1000,
        audit: () => {},
        sessionFrom: () => user,
        sendJson: (res, code, body) => { res._cap = { code, body }; },
        markDirty: () => {},
      });
    }
    async function runOp(sync, op, by) {
      const res = {};
      await sync.apiSync({}, res, { ops: [Object.assign({ uid: 'e5-' + Math.random(), at: new Date().toISOString(), by }, op)] });
      return res._cap.body;
    }
    const cusSync = makeCtx({ id: 2, role: 'teacher', school_id: 7 });
    const okBody = await runOp(cusSync, { c: 'assets', t: 'upd', id: 50, data: { status: 'repair' } }, 2);
    const okRes = (okBody.results || okBody.ops || [])[0] || {};
    assert(okRes.ok === true, 'upd تحویلدار رد شد: ' + JSON.stringify(okBody).slice(0, 200));
    const plainSync = makeCtx({ id: 3, role: 'teacher', school_id: 7 });
    const noBody = await runOp(plainSync, { c: 'assets', t: 'upd', id: 50, data: { status: 'repair' } }, 3);
    const noRes = (noBody.results || noBody.ops || [])[0] || {};
    assert(noRes.ok === false && noRes.code === 'out_of_scope', 'بی‌مجوز رد نشد: ' + JSON.stringify(noBody).slice(0, 200));
    /* تحویلدار نمی‌تواند ثبت کند (ins فقط مدیر) */
    const insBody = await runOp(cusSync, { c: 'assets', t: 'ins', data: { school_id: 7, name: 'Y', status: 'available' } }, 2);
    const insRes = (insBody.results || insBody.ops || [])[0] || {};
    assert(insRes.ok === false, 'تحویلدار ثبت کرد!');
  });

  console.log('');
  let ok = 0;
  for (const r of results) {
    if (r.ok) ok++;
    console.log(`${r.ok ? '✅' : '❌'} ${r.name}  (${r.ms} ms)${r.ok ? '' : '\n   ' + r.detail}`);
  }
  console.log('──────────────────────────────────────────');
  console.log(`سئوت اموال ۲: ${ok}/${results.length} موفق  —  ${ok === results.length ? 'بدون خطا ✅' : 'اشکال دارد ❌'}`);
  process.exit(ok === results.length ? 0 : 1);
})();
