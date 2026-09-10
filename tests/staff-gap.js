#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   staff-gap.js — بند د.۴: کمبود نیروی انسانی
   ───────────────────────────────────────────────────────────────────
   بخش کلاینت (jsdom):
   G1  موجود = معلمانِ متمایز هر درس از برنامهٔ هفتگی
   G2  بدون هنجار = «تعریف نشده» (null) — هرگز صفرِ ساختگی
   G3  مازاد: شکاف صفر + نشان مازاد
   G4  دامنه: اداره فقط مدارس محدوده؛ سوپرادمین همه
   G5  گارد نقش: مدیر/دبیر به نما دسترسی ندارند
   G6  تعیین هنجار با اکشن + اعتبارسنجی ورودی
   G7  حذف هنجار
   G8  تجمیع شهرستان/استان در نما
   بخش سرور (پورت 9033):
   W1  کارشناس برای مدرسهٔ داخل محدوده ⇒ پذیرش
   W2  کارشناس برای مدرسهٔ بیرون محدوده ⇒ رد (خارج دامنه)
   W3  مدیر ⇒ ردِ نقش (هنجار فقط اداره/سوپرادمین)
   W4  ویرایش/حذف رکورد بیرون محدوده ⇒ رد
   W5  سوپرادمین برای هر مدرسه ⇒ پذیرش
   اجرا:  node tests/staff-gap.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — تست رد شد.  (npm i --no-save jsdom)'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');
const PORT = 9033;

let pass = 0, fail = 0;
const errors = [];
let __seq = Promise.resolve();
function test(name, fn) {
  const p = __seq.then(() => new Promise((resolve) => {
    let q;
    try { q = fn(); }
    catch (e) { fail++; errors.push(name + ': ' + e.message); console.log(`  ❌ ${name}\n     ${e.message}`); resolve(); return; }
    Promise.resolve(q).then(
      () => { pass++; console.log(`  ✅ ${name}`); },
      (e) => { fail++; errors.push(name + ': ' + e.message); console.log(`  ❌ ${name}\n     ${e.message}`); }
    ).then(resolve);
  }));
  __seq = p;
}
const assert = (c, m) => { if (!c) throw new Error(m || 'شرط برقرار نیست'); };

const __vc = new (require('jsdom').VirtualConsole)();
__vc.on('jsdomError', (e) => console.log('  [jsdom] ' + String(e.message).slice(0, 160)));
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
  virtualConsole: __vc
});
const win = dom.window;
const W = (expr) => win.eval(expr);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mainHtml = () => (win.document.querySelector('.main') || {}).innerHTML || '';

main().catch((e) => { console.error(e); process.exit(1); });

async function clientPart() {
  await sleep(600);
  console.log('\n▸ د.۴ — کمبود نیروی انسانی (کلاینت)');

  /* ── جهان مصنوعی: مدرسهٔ ۹۱۰۱ با برنامهٔ کنترل‌شده ──
     درس ۹۱۰۱: دو اسلات از معلم ۹۲۰۱ + یک اسلات از ۹۲۰۲ ⇒ موجود ۲
     درس ۹۱۰۲: سه اسلات از معلم ۹۲۰۳ ⇒ موجود ۱                 */
  test('G0 ساخت جهان مصنوعی', () => {
    W(`db.schools.push({id:9101,name:'مصنوعی تست',level:'دبیرستان',province_id:1,county_id:2,district_id:4,capacity:10})`);
    W(`db.schedule.push(
      {id:93001,school_id:9101,class_id:1,subject_id:9101,teacher_id:9201,day:0,period:1},
      {id:93002,school_id:9101,class_id:1,subject_id:9101,teacher_id:9201,day:1,period:1},
      {id:93003,school_id:9101,class_id:1,subject_id:9101,teacher_id:9202,day:2,period:1},
      {id:93004,school_id:9101,class_id:1,subject_id:9102,teacher_id:9203,day:0,period:2},
      {id:93005,school_id:9101,class_id:1,subject_id:9102,teacher_id:9203,day:1,period:2},
      {id:93006,school_id:9101,class_id:1,subject_id:9102,teacher_id:9203,day:2,period:2})`);
    W(`if(typeof idxInvalidate==='function'){idxInvalidate('schools');idxInvalidate('schedule');idxInvalidate('staff_posts');}0`);
  });

  test('G1 موجود = معلمانِ متمایز هر درس', () => {
    const rows = W(`staffGapRows(byId('schools',9101), staffGapIndex())`);
    const r1 = rows.find(r => r.sid === 9101), r2 = rows.find(r => r.sid === 9102);
    assert(r1 && r1.have === 2, 'موجود درس ۹۱۰۱ باید ۲ باشد: ' + (r1 && r1.have));
    assert(r2 && r2.have === 1, 'موجود درس ۹۱۰۲ باید ۱ باشد (معلم تکراری یک‌بار): ' + (r2 && r2.have));
  });

  test('G2 بدون هنجار = تعریف‌نشده، نه صفر', () => {
    const rows = W(`staffGapRows(byId('schools',9101), staffGapIndex())`);
    const r1 = rows.find(r => r.sid === 9101);
    assert(r1.req === null && r1.gap === null, 'هنجار نباید ساخته شود');
    assert(String(sgapStatusFA(r1)).indexOf('تعریف نشده') > -1, 'برچسب باید «تعریف نشده» باشد');
  });

  test('G3 شکاف و مازاد', () => {
    W(`if(!db.staff_posts)db.staff_posts=[];
      db.staff_posts.push({id:94001,school_id:9101,subject_id:9101,required:5,created_at:'2026-09-09'});
      db.staff_posts.push({id:94002,school_id:9101,subject_id:9102,required:1,created_at:'2026-09-09'})`);
    let rows = W(`staffGapRows(byId('schools',9101), staffGapIndex())`);
    const r1 = rows.find(r => r.sid === 9101), r2 = rows.find(r => r.sid === 9102);
    assert(r1.gap === 3, 'شکاف درس ۹۱۰۱ باید ۳ باشد: ' + r1.gap);
    assert(r2.gap === 0 && r2.surplus === false, 'درس ۹۱۰۲ کامل: ' + JSON.stringify({ g: r2.gap, s: r2.surplus }));
    W(`db.staff_posts=db.staff_posts.filter(p=>p.id!==94002);0`);
    W(`db.staff_posts.push({id:94003,school_id:9101,subject_id:9102,required:0,created_at:'2026-09-09'})`);
    rows = W(`staffGapRows(byId('schools',9101), staffGapIndex())`);
    const r2b = rows.find(r => r.sid === 9102);
    assert(r2b.gap === 0 && r2b.surplus === true, 'مازاد باید علامت بخورد');
    W(`db.staff_posts=db.staff_posts.filter(p=>p.id!==94003);0`);
  });

  test('G4 دامنه: اداره فقط محدودهٔ خود؛ سوپرادمین همه', () => {
    const OFF = W(`(db.offices.find(o=>o.county_id)||db.offices[0]).id`);
    const EO = W(`db.users.find(u=>u.office_id===${OFF}).id`);
    W(`S.user=byId('users',${EO});S.route='staffgap';S.filters={};render()`);
    let h = mainHtml();
    assert(h.indexOf('مصنوعی تست') > -1, 'مدرسهٔ داخل محدوده (شهرستان) باید دیده شود');
    const outSchool = W(`db.schools.find(s=>s.county_id!==${W(`byId('offices',${OFF}).county_id`)})`);
    if (outSchool) assert(h.indexOf(outSchool.name) === -1, 'مدرسهٔ بیرون محدوده دیده شد: ' + outSchool.name);
    const SA = W(`db.users.find(u=>u.role==='superadmin').id`);
    W(`S.user=byId('users',${SA});render()`);
    h = mainHtml();
    assert(h.indexOf('مصنوعی تست') > -1, 'سوپرادمین باید همه را ببیند');
    if (outSchool) assert(h.indexOf(outSchool.name) > -1, 'سوپرادمین باید مدرسهٔ بیرون محدوده را هم ببیند');
  });

  test('G5 گارد نقش: مدیر و دبیر محروم‌اند', () => {
    const M = W(`db.users.find(u=>u.role==='manager').id`);
    W(`S.user=byId('users',${M});S.route='staffgap';S.filters={};render()`);
    assert(mainHtml().indexOf('دسترسی مجاز نیست') > -1, 'مدیر باید محروم باشد');
    /* فراخوانی مستقیم نما هم باید محروم کند (لایهٔ آخر دفاع) */
    assert(W(`viewStaffGap()`).indexOf('دسترسی مجاز نیست') > -1, 'نما مستقیماً برای مدیر محروم نیست');
    const T = W(`db.users.find(u=>u.role==='teacher').id`);
    W(`S.user=byId('users',${T});render()`);
    assert(mainHtml().indexOf('دسترسی مجاز نیست') > -1, 'دبیر باید محروم باشد');
    assert(W(`viewStaffGap()`).indexOf('دسترسی مجاز نیست') > -1, 'نما مستقیماً برای دبیر محروم نیست');
    assert(W(`canRoute('staffgap','manager')`) === false, 'روت نباید برای مدیر مجاز باشد');
    assert(W(`canRoute('staffgap','teacher')`) === false, 'روت نباید برای دبیر مجاز باشد');
  });

  test('G6 تعیین هنجار با اکشن + اعتبارسنجی', () => {
    const OFF = W(`(db.offices.find(o=>o.county_id)||db.offices[0]).id`);
    const EO = W(`db.users.find(u=>u.office_id===${OFF}).id`);
    W(`S.user=byId('users',${EO});S.route='staffgap';S.filters={};render()`);
    const before = W('db.staff_posts.length');
    W(`staffGapNormModal(9101,9102);document.getElementById('sg_req').value='4';0`);
    W(`document.querySelector('[data-act="staffpost-save"]').click()`);
    assert(W('db.staff_posts.length') === before + 1, 'هنجار ثبت نشد');
    const rec = W(`db.staff_posts.find(p=>p.school_id===9101&&p.subject_id===9102)`);
    assert(rec && rec.required === 4, 'required ذخیره نشد: ' + (rec && rec.required));
    /* اعتبارسنجی: منفی/اعشاری/بیش از سقف — روی درسی که هنجار ندارد */
    for (const bad of ['-1', '1.5', '999', 'abc']) {
      W(`staffGapNormModal(9101,9103);document.getElementById('sg_req').value='${bad}';0`);
      const b2 = W('db.staff_posts.length');
      W(`document.querySelector('[data-act="staffpost-save"]').click()`);
      assert(W('db.staff_posts.length') === b2, 'مقدار نامعتبر پذیرفته شد: ' + bad);
    }
    W(`remove('staff_posts',${rec.id})`);
  });

  test('G7 حذف هنجار', async () => {
    const OFF = W(`(db.offices.find(o=>o.county_id)||db.offices[0]).id`);
    const EO = W(`db.users.find(u=>u.office_id===${OFF}).id`);
    W(`S.user=byId('users',${EO});S.route='staffgap';S.filters={};render()`);
    W(`db.staff_posts.push({id:94010,school_id:9101,subject_id:9102,required:2,created_at:'2026-09-09'})`);
    W(`S.filters={};render()`);
    const before = W('db.staff_posts.length');
    W(`document.querySelector('[data-act="staffpost-del"][data-id="94010"]').click()`);
    await sleep(80);
    W(`document.querySelectorAll('#modal button').forEach(b=>{if(b.textContent.indexOf('حذف کن')>-1)b.click();})`);
    assert(W('db.staff_posts.length') === before - 1, 'هنجار حذف نشد');
  });

  test('G8 تجمیع شهرستان/استان در نما', () => {
    const SA = W(`db.users.find(u=>u.role==='superadmin').id`);
    W(`S.user=byId('users',${SA});S.route='staffgap';S.filters={};render()`);
    const h = mainHtml();
    assert(h.indexOf('تجمیع شهرستان / استان') > -1, 'جدول تجمیع نیست');
    assert(h.indexOf('جمع شکاف') > -1, 'کارت جمع شکاف نیست');
    assert(h.indexOf('تعریف نشده') > -1 || h.indexOf('بدون هنجار') > -1, 'نشان بی‌هنجاری نیست');
    /* پاک‌سازی جهان مصنوعی */
    W(`db.schedule=db.schedule.filter(x=>x.id<93000||x.id>93006);db.schools=db.schools.filter(s=>s.id!==9101);db.staff_posts=db.staff_posts.filter(p=>p.id<94000||p.id>94010);0`);
  });
}

/* ─────────────── بخش سرور ─────────────── */
function httpReq(method, p, body, cookie) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1', port: PORT, path: p, method,
      headers: Object.assign(
        data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
        cookie ? { Cookie: cookie } : {}
      )
    }, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => {
        let j = null; try { j = JSON.parse(b); } catch (e) {}
        resolve({ status: res.statusCode, headers: res.headers, body: b, json: j });
      });
    });
    req.on('error', (e) => resolve({ status: 0, headers: {}, body: 'SOCKERR ' + e.code, json: null }));
    if (data) req.write(data);
    req.end();
  });
}

async function serverPart() {
  if (!fs.existsSync(REAL_STORE)) { console.log('⏭️  store نیست — node server/seed.js'); return; }
  console.log('\n▸ د.۴ — کمبود نیروی انسانی (سرور)');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-sgap-'));
  const storeFile = path.join(tmp, 'payesh.json');
  fs.copyFileSync(REAL_STORE, storeFile);
  const env = Object.assign({}, process.env, {
    PORT: String(PORT), HOST: '127.0.0.1',
    PAYESH_STORE: storeFile, PAYESH_AUDIT: path.join(tmp, 'audit.log'),
    PAYESH_KEY: path.join(tmp, 'jwt.key'), PAYESH_DEMO_CODE: '1'
  });
  const server = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env, stdio: 'pipe' });
  try {
    let booted = false;
    for (let i = 0; i < 50; i++) {
      const h = await httpReq('GET', '/api/health');
      if (h.status === 200 && h.json && h.json.ok && h.json.pid === server.pid) { booted = true; break; }
      if (server.exitCode !== null) break;
      await sleep(300);
    }
    test('W0 سرور بالا آمد (' + PORT + ')', () => assert(booted));
    if (!booted) { await __seq; return; }

    const seed = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
    const eo = seed.users.find(u => u.role === 'edu_office' && u.office_id);
    const office = seed.offices.find(o => o.id === eo.office_id);
    const inSchool = seed.schools.find(s =>
      (!office.province_id || s.province_id === office.province_id) &&
      (!office.county_id || s.county_id === office.county_id) &&
      (!office.district_id || s.district_id === office.district_id));
    const outSchool = seed.schools.find(s =>
      (office.province_id && s.province_id !== office.province_id) ||
      (office.county_id && s.county_id !== office.county_id) ||
      (office.district_id && s.district_id !== office.district_id));
    const mg = seed.users.find(u => u.role === 'manager');
    const sa = seed.users.find(u => u.role === 'superadmin');
    const inSubj = seed.subjects.find(x => x.school_id === inSchool.id);
    const outSubj = seed.subjects.find(x => x.school_id === outSchool.id);

    async function login(u) {
      const phone = String(u.phone).replace(/[\s\-()]/g, '');
      const sc = await httpReq('POST', '/api/auth/send-code', { phone });
      const lg = await httpReq('POST', '/api/auth/login', { phone, code: sc.json && sc.json.demo_code, national_id: u.national_id });
      const sc2 = lg.headers['set-cookie'];
      return Array.isArray(sc2) ? sc2[0].split(';')[0] : (sc2 || '').split(';')[0];
    }
    const ceo = await login(eo), cmg = await login(mg), csa = await login(sa);
    test('W0b نشست‌ها', () => assert(ceo && cmg && csa));

    let seq = 0, iid = 980000;
    const syncOps = (ck, ops) => httpReq('POST', '/api/sync', { ops: ops.map(o => { if (o.t === 'ins' && o.id == null) o.id = (++iid); return Object.assign({ uid: 'usgap-' + (++seq) }, o); }) }, ck);
    const res0 = (r) => (r.json && r.json.results && r.json.results[0]) || {};

    test('W1 کارشناس: مدرسهٔ داخل محدوده پذیرفته شد', async () => {
      const r = await syncOps(ceo, [{ t: 'ins', c: 'staff_posts', by: eo.id,
        data: { school_id: inSchool.id, subject_id: inSubj.id, required: 3, created_at: new Date().toISOString().slice(0, 10) } }]);
      assert(res0(r).ok === true, 'HTTP ' + r.status + ' :: ' + r.body.slice(0, 160));
    });

    test('W2 کارشناس: مدرسهٔ بیرون محدوده رد شد', async () => {
      const r = await syncOps(ceo, [{ t: 'ins', c: 'staff_posts', by: eo.id,
        data: { school_id: outSchool.id, subject_id: outSubj.id, required: 2, created_at: new Date().toISOString().slice(0, 10) } }]);
      assert(res0(r).ok !== true && res0(r).code === 'out_of_scope', JSON.stringify(res0(r)) + ' :: HTTP ' + r.status);
    });

    test('W3 مدیر: تعیین هنجار رد نقش شد', async () => {
      const r = await syncOps(cmg, [{ t: 'ins', c: 'staff_posts', by: mg.id,
        data: { school_id: mg.school_id, subject_id: seed.subjects.find(x => x.school_id === mg.school_id).id, required: 1, created_at: new Date().toISOString().slice(0, 10) } }]);
      assert(res0(r).ok !== true && res0(r).code === 'role_denied', JSON.stringify(res0(r)));
    });

    test('W4 کارشناس: ویرایش/حذف رکورد بیرون محدوده رد شد', async () => {
      let foreign = seed.staff_posts.find(p => p.school_id === outSchool.id);
      if (!foreign) {
        /* رکورد بیرون محدوده در دمو نیست — با سوپرادمین می‌سازیم
           (شناسه در data: معیارِ سرور برایِ ذخیره‌سازیِ ins) */
        const fid = ++iid;
        const mk = await syncOps(csa, [{ t: 'ins', c: 'staff_posts', id: fid, by: sa.id,
          data: { id: fid, school_id: outSchool.id, subject_id: outSubj.id, required: 1, created_at: new Date().toISOString().slice(0, 10) } }]);
        assert(res0(mk).ok === true, 'ساخت رکورد بیرونی شکست: ' + JSON.stringify(res0(mk)));
        foreign = { id: fid };
      }
      const r1 = await syncOps(ceo, [{ t: 'upd', c: 'staff_posts', id: foreign.id, by: eo.id, data: { required: 9 } }]);
      assert(res0(r1).ok !== true && res0(r1).code === 'out_of_scope', 'upd: ' + JSON.stringify(res0(r1)));
      const r2 = await syncOps(ceo, [{ t: 'del', c: 'staff_posts', id: foreign.id, by: eo.id }]);
      assert(res0(r2).ok !== true && res0(r2).code === 'out_of_scope', 'del: ' + JSON.stringify(res0(r2)));
    });

    test('W6 کارشناس: انتقال هنجار به مدرسهٔ بیرون محدوده رد شد', async () => {
      const w6id = ++iid;
      const mk = await syncOps(ceo, [{ t: 'ins', c: 'staff_posts', id: w6id, by: eo.id,
        data: { id: w6id, school_id: inSchool.id, subject_id: inSubj.id, required: 1, created_at: new Date().toISOString().slice(0, 10) } }]);
      assert(res0(mk).ok === true, 'ساخت هنجار داخل محدوده شکست: ' + JSON.stringify(res0(mk)));
      const mv = await syncOps(ceo, [{ t: 'upd', c: 'staff_posts', id: w6id, by: eo.id, data: { school_id: outSchool.id } }]);
      assert(res0(mv).ok !== true && res0(mv).code === 'out_of_scope', 'انتقال پذیرفته شد: ' + JSON.stringify(res0(mv)));
    });

    test('W5 سوپرادمین: هر مدرسه پذیرفته شد', async () => {
      const r = await syncOps(csa, [{ t: 'ins', c: 'staff_posts', by: sa.id,
        data: { school_id: outSchool.id, subject_id: outSubj.id, required: 5, created_at: new Date().toISOString().slice(0, 10) } }]);
      assert(res0(r).ok === true, JSON.stringify(res0(r)));
    });

    /* همهٔ آزمون‌های صف اجرا شوند، سپس پاک‌سازی */
    await __seq;
  } finally {
    try { server.kill('SIGKILL'); } catch (e) {}
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
}

/* برچسب وضعیت به فارسی — کپی کوچک از ماژول برای آسایش آزمون */
function sgapStatusFA(row) {
  if (row.req == null) return 'تعریف نشده';
  if (row.gap >= 2) return 'کمبود شدید';
  if (row.gap === 1) return 'کمبود';
  if (row.surplus) return 'مازاد';
  return 'کامل';
}

async function main() {
  await clientPart();
  await serverPart();
  await __seq;
  const total = pass + fail;
  console.log('────────────────────────────────────────────────────');
  console.log(`کمبود نیروی انسانی: ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
  if (errors.length) console.log('ناموفق‌ها: ' + errors.join(' | '));
  process.exit(fail ? 1 : 0);
}
