#!/usr/bin/env node
/**
 * سئوت کتابخانه ۲ (E.4: فیلدها + سقف نسخه + کتابدار + نمای دانش‌آموز + هوک سرور)
 *
 * بخش‌ها (jsdom روی index.html ساخته‌شده):
 *  B1 فیلدهای تازه (isbn/location/total) + ویرایش کتاب
 *  B2 سقف نسخه‌ها (امانت تا سقف، ردِ مازاد، بازگشت و امانتِ دوباره)
 *  B3 کتابدار (اعطا/لغو، امانت و بازگشت، منعِ کتاب‌سازی، منعِ بی‌مجوز و غیرهم‌مدرسه)
 *  B4 نمای دانش‌آموز (فقط امانتِ خود، بدون دکمهٔ نوشتاری، جستجو)
 *  B5 جستجو (عنوان/نویسنده/کد/شابک)
 * بخش‌ها (سرور، درون‌پروسه‌ای):
 *  S1 قلمروِ کتابدار (مدیر/کتابدار/بی‌مجوز/غیرهم‌مدرسه)
 *  S2 سرتاسری apiSync (ins کتابدار می‌نشیند، بی‌مجوز out_of_scope)
 *
 * اجرا: node tests/library2.js   (نیازمند jsdom + بیلدِ تازه: node build.js)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
    var sts = db.users.filter(function(x){return x.role==='student'&&x.school_id===sc.id;});
    return {sc:sc.id, other:other?other.id:0, mgr:mgr.id, tea:tea?tea.id:0, teaX:teaX?teaX.id:0,
      s1:sts[0].id, s2:sts[1].id, s3:sts[2].id};
  })()`);
}
function asMgr(f) { W(`S.user=byId('users',${f.mgr});S.persona=null;S.boss=null;`); }
function asTea(f) { W(`S.user=byId('users',${f.tea});S.persona=null;S.boss=null;`); }
function asStu(f, id) { W(`S.user=byId('users',${id});S.persona=null;S.boss=null;`); }
function tearDown() {
  W(`(function(){
    db.lib_loans.filter(function(l){return l._e4;}).forEach(function(l){remove('lib_loans',l.id);});
    db.lib_books.filter(function(b){return b._e4;}).forEach(function(b){remove('lib_books',b.id);});
    db.users.forEach(function(u){ if(u._e4staff) delete u.lib_staff; });
  })()`);
}
function mkBook(title, extra) {
  const ex = extra ? JSON.stringify(extra) : 'undefined';
  const r = J(`libAddBook(${JSON.stringify(title)},'نویسنده','C-1','',${ex})`);
  assert(r.ok === true, 'ساخت کتاب شکست: ' + (r.msg || ''));
  W(`(function(){var b=byId('lib_books',${r.rec.id}); if(b) b._e4=1;})()`);
  return r.rec.id;
}
function tagLoan(id) { W(`(function(){var l=byId('lib_loans',${id}); if(l) l._e4=1;})()`); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await sleep(300);

  await sec('B1 فیلدها + ویرایش', async () => {
    const f = await fx();
    try {
      asMgr(f);
      const bid = mkBook('کتاب فیلددار', { isbn: '978-964-01', location: 'قفسه A-3', total_copies: 3 });
      const b = J(`byId('lib_books',${bid})`);
      assert(b.isbn === '978-964-01' && b.location === 'قفسه A-3' && b.total_copies === 3, 'فیلدها ننشستند');
      const e1 = J(`libEditBook(${bid},{location:'قفسه B-1',total_copies:5})`);
      assert(e1.ok === true, 'ویرایش شکست: ' + (e1.msg || ''));
      assert(J(`byId('lib_books',${bid}).location`) === 'قفسه B-1', 'ویرایش اعمال نشد');
      assert(J(`byId('lib_books',${bid}).total_copies`) === 5, 'سقف به‌روز نشد');
      const e2 = J(`libEditBook(${bid},{title:''})`);
      assert(e2.ok === false, 'عنوانِ خالی پذیرفته شد!');
      asTea(f);
      const e3 = J(`libEditBook(${bid},{location:'X'})`);
      assert(e3.ok === false, 'دبیر کتاب را ویرایش کرد!');
      asStu(f, f.s1);
      const e4 = J(`libEditBook(${bid},{location:'X'})`);
      assert(e4.ok === false, 'دانش‌آموز کتاب را ویرایش کرد!');
    } finally { tearDown(); }
  });

  await sec('B2 سقف نسخه‌ها', async () => {
    const f = await fx();
    try {
      asMgr(f);
      const bid = mkBook('کتاب دوسقفی', { total_copies: 2 });
      const l1 = J(`libLend(${bid},${f.s1},'')`);
      const l2 = J(`libLend(${bid},${f.s2},'')`);
      assert(l1.ok && l2.ok, 'دو امانتِ اول شکست خورد');
      tagLoan(l1.rec.id); tagLoan(l2.rec.id);
      assert(J(`libAvail(${bid})`) === 0, 'موجودی باید ۰ باشد');
      const l3 = J(`libLend(${bid},${f.s3},'')`);
      assert(l3.ok === false, 'امانتِ سوم از سقف گذشت!');
      const rt = J(`libReturn(${l1.rec.id})`);
      assert(rt.ok === true, 'بازگشت شکست');
      assert(J(`libAvail(${bid})`) === 1, 'موجودی پس از بازگشت باید ۱ باشد');
      const l4 = J(`libLend(${bid},${f.s3},'')`);
      assert(l4.ok === true, 'امانتِ دوباره شکست');
      tagLoan(l4.rec.id);
      /* کتابِ بی‌سقف (قدیمی): رفتارِ نامحدود می‌ماند */
      const bidU = mkBook('کتاب بی‌سقف', {});
      const u1 = J(`libLend(${bidU},${f.s1},'')`);
      const u2 = J(`libLend(${bidU},${f.s2},'')`);
      assert(u1.ok && u2.ok, 'کتابِ بی‌سقف باید نامحدود بماند');
      tagLoan(u1.rec.id); tagLoan(u2.rec.id);
    } finally { tearDown(); }
  });

  await sec('B3 کتابدار', async () => {
    const f = await fx();
    try {
      asMgr(f);
      const bid = mkBook('کتاب کتابدار', {});
      /* دبیرِ بی‌مجوز رد می‌شود (رفتارِ قدیم) */
      asTea(f);
      const d0 = J(`libLend(${bid},${f.s1},'')`);
      assert(d0.ok === false, 'دبیرِ بی‌مجوز امانت داد!');
      /* اعطا ← امانت و بازگشت آزاد */
      asMgr(f);
      W(`(function(){var t=byId('users',${f.tea}); if(t) t._e4staff=1;})()`);
      const g = J(`libSetStaff(${f.tea},true)`);
      assert(g.ok === true, 'اعطا شکست: ' + (g.msg || ''));
      asTea(f);
      const d1 = J(`libLend(${bid},${f.s1},'')`);
      assert(d1.ok === true, 'کتابدار نتوانست امانت بدهد: ' + (d1.msg || ''));
      tagLoan(d1.rec.id);
      const r1 = J(`libReturn(${d1.rec.id})`);
      assert(r1.ok === true, 'کتابدار نتوانست بازگشت بگیرد');
      /* کتابدار نمی‌تواند کتاب بسازد/ویرایش/حذف کند */
      const nb = J(`libAddBook('X','Y','Z')`);
      assert(nb.ok === false, 'کتابدار کتاب ساخت!');
      const ed = J(`libEditBook(${bid},{location:'X'})`);
      assert(ed.ok === false, 'کتابدار کتاب را ویرایش کرد!');
      const dl = J(`libDelBook(${bid})`);
      assert(dl.ok === false, 'کتابدار کتاب را حذف کرد!');
      /* لغو ← دوباره رد */
      asMgr(f);
      J(`libSetStaff(${f.tea},false)`);
      asTea(f);
      const d2 = J(`libLend(${bid},${f.s2},'')`);
      assert(d2.ok === false, 'پس از لغو، امانت رفت!');
      /* پرچمِ مدرسهٔ دیگر بی‌اثر است */
      if (f.teaX) {
        asMgr(f);
        W(`(function(){var t=byId('users',${f.teaX}); if(t) t._e4staff=1;})()`);
        J(`libSetStaff(${f.teaX},true)`);
        W(`S.user=byId('users',${f.teaX});S.persona=null;S.boss=null;`);
        const dX = J(`libLend(${bid},${f.s1},'')`);
        assert(dX.ok === false, 'کتابدارِ مدرسهٔ دیگر امانت داد!');
        asMgr(f);
        J(`libSetStaff(${f.teaX},false)`);
      }
      /* دانش‌آموز هرگز */
      asStu(f, f.s1);
      const ds = J(`libLend(${bid},${f.s2},'')`);
      assert(ds.ok === false, 'دانش‌آموز امانت داد!');
    } finally { tearDown(); }
  });

  await sec('B4 نمای دانش‌آموز', async () => {
    const f = await fx();
    try {
      asMgr(f);
      const bid = mkBook('کتاب دانش‌آموز', {});
      const l1 = J(`libLend(${bid},${f.s1},'')`);
      const l2 = J(`libLend(${bid},${f.s2},'')`);
      tagLoan(l1.rec.id); tagLoan(l2.rec.id);
      const nm1 = J(`byId('users',${f.s1}).full_name`);
      const nm2 = J(`byId('users',${f.s2}).full_name`);
      asStu(f, f.s1);
      const out = W(`(S.route='library',S.filters={},S.page=1,renderRoute())`);
      assert(typeof out === 'string' && out.indexOf('دسترسی مجاز نیست') < 0, 'نمای دانش‌آموز مسدود است');
      assert(out.indexOf('امانتِ من') >= 0, 'بخش امانتِ من نیست');
      assert(out.indexOf('کتاب دانش‌آموز') >= 0, 'فهرست کتاب نیست');
      assert(out.indexOf('data-act="lib-lend"') < 0, 'دکمهٔ امانت در نمای دانش‌آموز!');
      assert(out.indexOf('data-act="lib-return"') < 0, 'دکمهٔ بازگشت در نمای دانش‌آموز!');
      assert(out.indexOf('data-act="lib-new"') < 0, 'دکمهٔ کتاب‌جدید در نمای دانش‌آموز!');
      assert(out.indexOf('data-act="lib-del"') < 0, 'دکمهٔ حذف در نمای دانش‌آموز!');
      assert(out.indexOf(nm2) < 0, 'امانتِ دانش‌آموزِ دیگر لو رفت!');
      /* مدیر همان کتاب را با دکمه‌ها می‌بیند (رگرسیونِ نما) */
      asMgr(f);
      const outM = W(`(S.route='library',S.filters={},S.page=1,renderRoute())`);
      assert(outM.indexOf('data-act="lib-lend"') >= 0, 'دکمهٔ امانتِ مدیر گم شد');
      assert(outM.indexOf('تفویضِ کتابداری') >= 0, 'بخش تفویض نیست');
    } finally { tearDown(); }
  });

  await sec('B5 جستجو', async () => {
    const f = await fx();
    try {
      asMgr(f);
      mkBook('هندسهٔ نااقلیدسی', { isbn: 'ZZZ-SEARCH-1' });
      mkBook('تاریخ صفویه', {});
      const r1 = J(`libSearch('نااقلیدس',${f.sc}).length`);
      const r2 = J(`libSearch('ZZZ-SEARCH-1',${f.sc}).length`);
      const r3 = J(`libSearch('',${f.sc}).length`);
      const r4 = J(`libSearch('zzz-search-1',${f.sc}).length`);
      assert(r1 >= 1 && r2 >= 1, 'جستجو پیدا نکرد');
      assert(r4 >= 1, 'جستجو حساس به حروف است');
      assert(r3 >= r1 && r3 >= 2, 'جستجوی خالی باید همه باشد');
    } finally { tearDown(); }
  });

  /* ── سرور ── */
  await sec('S1 قلمروِ کتابدار (inScope)', async () => {
    const { inScope, attach } = require('../server/sync.js');
    const store = {
      users: [
        { id: 1, role: 'manager', school_id: 7 },
        { id: 2, role: 'teacher', school_id: 7, lib_staff: 1 },
        { id: 3, role: 'teacher', school_id: 7 },
        { id: 4, role: 'teacher', school_id: 8, lib_staff: 1 },
      ],
      lib_loans: [{ id: 50, school_id: 7, book_id: 9, student_id: 20 }],
    };
    attach(store);
    const d7 = { school_id: 7 };
    const mgr = { id: 1, role: 'manager', school_id: 7 };
    const lib = { id: 2, role: 'teacher', school_id: 7 };
    const plain = { id: 3, role: 'teacher', school_id: 7 };
    const other = { id: 4, role: 'teacher', school_id: 8 };
    assert(inScope(mgr, 'lib_loans', null, d7) === true, 'مدیر باید آزاد باشد');
    assert(inScope(lib, 'lib_loans', null, d7) === true, 'کتابدار باید آزاد باشد');
    assert(inScope(lib, 'lib_loans', 50, { returned_at: 'x' }) === true, 'بازگشتِ کتابدار باید آزاد باشد');
    assert(inScope(plain, 'lib_loans', null, d7) === false, 'بی‌مجوز رد نشد!');
    assert(inScope(plain, 'lib_loans', 50, { returned_at: 'x' }) === false, 'بازگشتِ بی‌مجوز رد نشد!');
    assert(inScope(other, 'lib_loans', null, d7) === false, 'غیرهم‌مدرسه رد نشد!');
    assert(inScope(lib, 'lib_loans', null, { school_id: 8 }) === false, 'رکوردِ مدرسهٔ دیگر رد نشد!');
  });

  await sec('S2 سرتاسری apiSync', async () => {
    const { createSync, attach } = require('../server/sync.js');
    function makeCtx(user) {
      const store = {
        users: [
          { id: 1, role: 'manager', school_id: 7, full_name: 'M' },
          { id: 2, role: 'teacher', school_id: 7, full_name: 'T', lib_staff: 1 },
          { id: 3, role: 'teacher', school_id: 7, full_name: 'P' },
        ],
        lib_books: [{ id: 9, school_id: 7, title: 'B' }],
        lib_loans: [],
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
      await sync.apiSync({}, res, { ops: [Object.assign({ uid: `e4-${crypto.randomBytes(16).toString('hex')}`, at: new Date().toISOString(), by }, op)] });
      return res._cap.body;
    }
    const libSync = makeCtx({ id: 2, role: 'teacher', school_id: 7 });
    const okBody = await runOp(libSync, { c: 'lib_loans', t: 'ins',
      data: { school_id: 7, book_id: 9, student_id: 20, loan_at: new Date().toISOString(), due_at: '2027-01-01' } }, 2);
    const okRes = (okBody.results || okBody.ops || [])[0] || {};
    assert(okRes.ok === true, 'ins کتابدار رد شد: ' + JSON.stringify(okBody).slice(0, 200));
    const plainSync = makeCtx({ id: 3, role: 'teacher', school_id: 7 });
    const noBody = await runOp(plainSync, { c: 'lib_loans', t: 'ins',
      data: { school_id: 7, book_id: 9, student_id: 21, loan_at: new Date().toISOString(), due_at: '2027-01-01' } }, 3);
    const noRes = (noBody.results || noBody.ops || [])[0] || {};
    assert(noRes.ok === false && noRes.code === 'out_of_scope', 'بی‌مجوز رد نشد: ' + JSON.stringify(noBody).slice(0, 200));
  });

  console.log('');
  let ok = 0;
  for (const r of results) {
    if (r.ok) ok++;
    console.log(`${r.ok ? '✅' : '❌'} ${r.name}  (${r.ms} ms)${r.ok ? '' : '\n   ' + r.detail}`);
  }
  console.log('──────────────────────────────────────────');
  console.log(`سئوت کتابخانه ۲: ${ok}/${results.length} موفق  —  ${ok === results.length ? 'بدون خطا ✅' : 'اشکال دارد ❌'}`);
  process.exit(ok === results.length ? 0 : 1);
})();
