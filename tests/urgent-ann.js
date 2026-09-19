#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   urgent-ann.js — بند د.۳: اطلاعیه فوری/بحرانی اداره
   ───────────────────────────────────────────────────────────────────
   بخش کلاینت (jsdom):
   U1  رکورد قدیمی بدون severity = عادی (سازگاری با گذشته)
   U2  مرتب‌سازی: بحرانی، فوری، سپس تازه‌ترین
   U3  ایزولاسیون دامنه: مدرسهٔ داخل/بیرون محدوده، خود اداره، سوپرادمین
   U4  انتشار اداره: office_id خود + سطح اهمیت ذخیره می‌شود
   U5  سطح اهمیت نامعتبر رد می‌شود
   U6  نشان بصری: بنر قرمز بحرانی + بج اداره
   بخش سرور (پورت 9032):
   V1  درج اداره با office_id خود پذیرفته می‌شود
   V2  درج با office_id ادارهٔ دیگر رد می‌شود (شکاف بین‌اداره‌ای بسته)
   V3  ویرایش اطلاعیهٔ ادارهٔ دیگر رد می‌شود
   V4  حذف اطلاعیهٔ ادارهٔ دیگر رد می‌شود
   V5  درج اطلاعیهٔ مدرسه‌ای توسط مدیر بی‌تأثیر می‌ماند
   اجرا:  node tests/urgent-ann.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { console.log('⏭️  jsdom نصب نیست — تست رد شد.  (npm i --no-save jsdom)'); process.exit(1); }

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');
const PORT = 9032;

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

const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
  virtualConsole: new (require('jsdom').VirtualConsole)()
});
const win = dom.window;
const W = (expr) => win.eval(expr);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mainHtml = () => (win.document.querySelector('.main') || {}).innerHTML || '';

main().catch((e) => { console.error(e); process.exit(1); });

async function clientPart() {
  await sleep(600);
  console.log('\n▸ د.۳ — اطلاعیه فوری/بحرانی (کلاینت)');

  /* دفترهای دمو: ادارهٔ شهرستانی (بانه) صاحب اطلاعیه‌های نمونه است */
  const OFF = W(`(db.offices.find(o=>o.county_id)||db.offices[0]).id`);
  const OFF2 = W(`(function(){var a=${OFF};var o=db.offices.find(x=>x.id!==a);return o.id;})()`);
  const CRIT = W(`db.announcements.find(a=>a.severity==='critical').id`);
  const URG = W(`db.announcements.find(a=>a.severity==='urgent').id`);

  test('U1 رکورد قدیمی بدون فیلد = عادی', () => {
    const legacy = W(`db.announcements.find(a=>a.school_id===null&&a.office_id==null&&a.severity==null)`);
    if (legacy) {
      const SA = W(`db.users.find(u=>u.role==='superadmin').id`);
      W(`S.user=byId('users',${SA});S.route='announcements';S.filters={};render()`);
      assert(mainHtml().indexOf('اطلاعیهٔ بحرانی') > -1, 'بنر بحرانی نیست');
      assert(W(`myAnnouncements().some(a=>a.id===${legacy.id}&&(a.severity==null))`), 'رکورد قدیمی حذف شد');
    }
  });

  test('U2 مرتب‌سازی: بحرانی، فوری، تازه‌ترین', () => {
    /* رکوردهای کنترل‌شده با تاریخ‌های مختلف: بحرانیِ کهنه باید باز هم
       قبل از فوری و عادیِ تازه بیاید — فقط تاریخ ملاک نیست. */
    const SA = W(`db.users.find(u=>u.role==='superadmin').id`);
    W(`S.user=byId('users',${SA});0`);
    W(`db.announcements.push(
      {id:981001,school_id:null,office_id:null,audience:'all',severity:'critical',title:'ک-کهنه',body:'ب',created_at:'2026-01-01'},
      {id:981002,school_id:null,office_id:null,audience:'all',severity:'urgent',title:'ف-میانه',body:'ب',created_at:'2026-02-01'},
      {id:981003,school_id:null,office_id:null,audience:'all',severity:'normal',title:'ع-تازه',body:'ب',created_at:'2026-09-09'})`);
    try {
      const ids = W(`myAnnouncements().map(a=>a.id)`);
      const ic = ids.indexOf(981001), iu = ids.indexOf(981002), io = ids.indexOf(981003);
      assert(ic > -1 && iu > -1 && io > -1, 'رکوردهای تستی در فهرست نیستند');
      assert(ic < iu, 'بحرانیِ کهنه باید قبل از فوری بیاید');
      assert(iu < io, 'فوری باید قبل از عادیِ تازه بیاید');
      /* عادی‌ها بر اساس تاریخ نزولی */
      const norm = W(`myAnnouncements().filter(a=>!(a.severity==='critical'||a.severity==='urgent')).map(a=>a.created_at||'')`);
      for (let i = 1; i < norm.length; i++) assert(norm[i - 1] >= norm[i], 'عادی‌ها بر اساس تاریخ نزولی نیستند');
    } finally {
      W(`db.announcements=db.announcements.filter(a=>a.id<981000||a.id>981003)`);
    }
  });

  test('U3 ایزولاسیون دامنهٔ اطلاعیهٔ اداره', () => {
    /* مدیر مدرسهٔ داخل محدودهٔ بانه می‌بیند */
    const countyId = W(`byId('offices',${OFF}).county_id`);
    const inM = W(`db.users.find(u=>u.role==='manager'&&(byId('schools',u.school_id)||{}).county_id===${countyId})`);
    const outM = W(`db.users.find(u=>u.role==='manager'&&(byId('schools',u.school_id)||{}).county_id!==${countyId})`);
    assert(inM, 'مدیر داخل محدوده پیدا نشد');
    assert(outM, 'مدیر بیرون محدوده پیدا نشد');
    W(`S.user=byId('users',${inM.id});0`);
    assert(W(`myAnnouncements().some(a=>a.id===${CRIT})`), 'مدرسهٔ داخل محدوده بحرانی را ندید');
    W(`S.user=byId('users',${outM.id});0`);
    assert(!W(`myAnnouncements().some(a=>a.id===${CRIT})`), 'مدرسهٔ بیرون محدوده بحرانی را دید (نشت دامنه)');
    /* خود اداره می‌بیند */
    const EO = W(`db.users.find(u=>u.office_id===${OFF}).id`);
    W(`S.user=byId('users',${EO});0`);
    assert(W(`myAnnouncements().some(a=>a.id===${CRIT})`), 'خود اداره اطلاعیه‌اش را ندید');
    /* ادارهٔ دیگر نمی‌بیند */
    const EO2 = W(`db.users.find(u=>u.office_id===${OFF2}).id`);
    if (EO2) {
      W(`S.user=byId('users',${EO2});0`);
      assert(!W(`myAnnouncements().some(a=>a.id===${CRIT})`), 'ادارهٔ دیگر اطلاعیهٔ بیگانه را دید');
    }
    /* سوپرادمین می‌بیند */
    const SA = W(`db.users.find(u=>u.role==='superadmin').id`);
    W(`S.user=byId('users',${SA});0`);
    assert(W(`myAnnouncements().some(a=>a.id===${CRIT})`), 'سوپرادمین ندید');
  });

  test('U4 انتشار اداره: office_id خود + سطح اهمیت', () => {
    const EO = W(`db.users.find(u=>u.office_id===${OFF}).id`);
    W(`S.user=byId('users',${EO});S.route='announcements';S.filters={};render()`);
    W(`annModal()`);
    W(`document.getElementById('a_title').value='تست انتشار فوری';document.getElementById('a_body').value='متن تست برای انتشار';document.getElementById('a_sev').value='urgent';0`);
    const before = W('db.announcements.length');
    W(`document.querySelector('[data-act="ann-save"]').click()`);
    assert(W('db.announcements.length') === before + 1, 'اطلاعیه ثبت نشد');
    const rec = W(`db.announcements[db.announcements.length-1]`);
    assert(rec.severity === 'urgent', 'severity ذخیره نشد: ' + rec.severity);
    assert(Number(rec.office_id) === Number(OFF), 'office_id ادارهٔ خود نیست');
    assert(rec.school_id === null, 'اطلاعیهٔ اداره نباید school_id داشته باشد');
    W(`remove('announcements',${rec.id})`);
  });

  test('U5 سطح اهمیت نامعتبر رد می‌شود', () => {
    const EO = W(`db.users.find(u=>u.office_id===${OFF}).id`);
    W(`S.user=byId('users',${EO});S.route='announcements';S.filters={};render()`);
    W(`annModal()`);
    W(`(function(){var s=document.getElementById('a_sev');var o=document.createElement('option');o.value='hack';s.appendChild(o);s.value='hack';
      document.getElementById('a_title').value='تست نامعتبر';document.getElementById('a_body').value='متن تست نامعتبر';})()`);
    const before = W('db.announcements.length');
    W(`document.querySelector('[data-act="ann-save"]').click()`);
    assert(W('db.announcements.length') === before, 'severity نامعتبر پذیرفته شد');
    W(`closeModal()`);
  });

  test('U6 نشان بصری: بنر قرمز + بج اداره', () => {
    const countyId = W(`byId('offices',${OFF}).county_id`);
    const inM = W(`db.users.find(u=>u.role==='manager'&&(byId('schools',u.school_id)||{}).county_id===${countyId}).id`);
    W(`S.user=byId('users',${inM});S.route='announcements';S.filters={};render()`);
    const h = mainHtml();
    assert(h.indexOf('اطلاعیهٔ بحرانی') > -1, 'بج بحرانی نیست');
    assert(h.indexOf('اطلاعیهٔ فوری') > -1, 'بج فوری نیست');
    assert(/border:\s*3px solid var\(--red\)/.test(h), 'کادر قرمز بحرانی نیست');
    assert(h.indexOf('🏛️') > -1, 'بج اداره نیست');
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
    req.on('error', (e) => resolve({ status: 0, headers: {}, body: 'SOCKERR ' + e.code + ' ' + e.message, json: null }));
    if (data) req.write(data);
    req.end();
  });
}

async function serverPart() {
  if (!fs.existsSync(REAL_STORE)) { console.log('⏭️  store نیست — node server/seed.js'); return; }
  console.log('\n▸ د.۳ — اطلاعیه فوری/بحرانی (سرور)');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-uann-'));
  const storeFile = path.join(tmp, 'payesh.json');
  fs.copyFileSync(REAL_STORE, storeFile);
  const env = Object.assign({}, process.env, {
    PORT: String(PORT), HOST: '127.0.0.1',
    PAYESH_STORE: storeFile, PAYESH_AUDIT: path.join(tmp, 'audit.log'),
    PAYESH_KEY: path.join(tmp, 'jwt.key'), PAYESH_DEMO_CODE: '1'
  });
  const server = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env, stdio: 'pipe' });
  const srvLog = path.join(tmp, 'server.log');
  const logStream = fs.createWriteStream(srvLog, { flags: 'a' });
  server.stdout.pipe(logStream);
  server.stderr.pipe(logStream);
  server.on('exit', (code, sig) => { if (code !== null && code !== 0) console.log('    [srv-exit] code=' + code + ' sig=' + sig); });
  try {
    let booted = false;
    for (let i = 0; i < 50; i++) {
      const h = await httpReq('GET', '/api/health');
      if (h.status === 200 && h.json && h.json.ok && h.json.pid === server.pid) { booted = true; break; }
      if (server.exitCode !== null) break;
      await sleep(300);
    }
    test('V0 سرور بالا آمد (' + PORT + ')', () => assert(booted));
    if (!booted) { await __seq; return; }

    const seed = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
    const eos = seed.users.filter(u => u.role === 'edu_office' && u.office_id);
    const eo1 = eos[0], eo2 = eos.find(u => u.office_id !== eo1.office_id);
    const mg = seed.users.find(u => u.role === 'manager');

    async function login(u) {
      const phone = String(u.phone).replace(/[\s\-()]/g, '');
      const sc = await httpReq('POST', '/api/auth/send-code', { phone });
      const lg = await httpReq('POST', '/api/auth/login', { phone, code: sc.json && sc.json.demo_code, national_id: u.national_id });
      const sc2 = lg.headers['set-cookie'];
      return Array.isArray(sc2) ? sc2[0].split(';')[0] : (sc2 || '').split(';')[0];
    }
    const c1 = await login(eo1), c2 = eo2 ? await login(eo2) : null, cm = await login(mg);
    test('V0b نشست‌ها', () => assert(c1 && cm));

    let seq = 0, iid = 990000;
    const syncOps = (ck, ops) => httpReq('POST', '/api/sync', { ops: ops.map(o => { if (o.t === 'ins' && o.id == null) o.id = (++iid); return Object.assign({ uid: 'uann-' + (++seq) }, o); }) }, ck);
    const res0 = (r) => (r.json && r.json.results && r.json.results[0]) || {};

    test('V1 درج با office_id خود پذیرفته شد', async () => {
      const r = await syncOps(c1, [{ t: 'ins', c: 'announcements', by: eo1.id,
        data: { title: 'فوری تست', body: 'متن', audience: 'all', severity: 'urgent', school_id: null, office_id: eo1.office_id, created_at: new Date().toISOString().slice(0, 10) } }]);
      let extra = '';
      if (res0(r).ok !== true) { try { extra = '\n--- سرور:\n' + fs.readFileSync(srvLog, 'utf8').slice(-1200); } catch (e) {} }
      assert(res0(r).ok === true, 'HTTP ' + r.status + ' :: ' + r.body.slice(0, 200) + extra);
    });

    test('V2 درج با office_id ادارهٔ دیگر رد شد', async () => {
      if (!eo2) return;
      const r = await syncOps(c1, [{ t: 'ins', c: 'announcements', by: eo1.id,
        data: { title: 'جعل', body: 'متن', audience: 'all', severity: 'critical', school_id: null, office_id: eo2.office_id, created_at: new Date().toISOString().slice(0, 10) } }]);
      assert(res0(r).ok !== true && res0(r).code === 'out_of_scope', JSON.stringify(res0(r)));
    });

    test('V3 ویرایش اطلاعیهٔ ادارهٔ دیگر رد شد', async () => {
      if (!eo2 || !c2) return;
      const foreign = seed.announcements.find(a => a.office_id === eo1.office_id);
      if (!foreign) return;
      const r = await syncOps(c2, [{ t: 'upd', c: 'announcements', id: foreign.id, by: eo2.id, data: { title: 'دستکاری' } }]);
      assert(res0(r).ok !== true && res0(r).code === 'out_of_scope', JSON.stringify(res0(r)));
    });

    test('V4 حذف اطلاعیهٔ ادارهٔ دیگر رد شد', async () => {
      if (!eo2 || !c2) return;
      const foreign = seed.announcements.find(a => a.office_id === eo1.office_id);
      if (!foreign) return;
      const r = await syncOps(c2, [{ t: 'del', c: 'announcements', id: foreign.id, by: eo2.id }]);
      assert(res0(r).ok !== true && res0(r).code === 'out_of_scope', JSON.stringify(res0(r)));
    });

    test('V6 مدرسهٔ داخل محدوده ولی office_id ادارهٔ دیگر رد شد', async () => {
      if (!eo2) return;
      const office1 = seed.offices.find(o => o.id === eo1.office_id);
      const inSchool = seed.schools.find(s =>
        (!office1.province_id || s.province_id === office1.province_id) &&
        (!office1.county_id || s.county_id === office1.county_id) &&
        (!office1.district_id || s.district_id === office1.district_id));
      if (!inSchool) return;
      const r = await syncOps(c1, [{ t: 'ins', c: 'announcements', by: eo1.id,
        data: { title: 'جعل هویت اداره', body: 'متن', audience: 'all', severity: 'urgent', school_id: inSchool.id, office_id: eo2.office_id, created_at: new Date().toISOString().slice(0, 10) } }]);
      assert(res0(r).ok !== true && res0(r).code === 'out_of_scope', JSON.stringify(res0(r)));
    });

    test('V5 اطلاعیهٔ مدرسه‌ای مدیر بی‌تأثیر ماند', async () => {
      const r = await syncOps(cm, [{ t: 'ins', c: 'announcements', by: mg.id,
        data: { title: 'مدرسه‌ای', body: 'متن مدرسه', audience: 'all', severity: 'normal', school_id: mg.school_id, created_at: new Date().toISOString().slice(0, 10) } }]);
      assert(res0(r).ok === true, JSON.stringify(res0(r)));
    });

    /* همهٔ آزمون‌های صف اجرا شوند، سپس پاک‌سازی */
    await __seq;
  } finally {
    try { server.kill('SIGKILL'); } catch (e) {}
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
}

async function main() {
  await clientPart();
  await serverPart();
  await __seq;
  const total = pass + fail;
  console.log('────────────────────────────────────────────────────');
  console.log(`اطلاعیه فوری/بحرانی: ${pass}/${total} موفق` + (fail ? `  —  ${fail} ناموفق` : '  —  بدون خطا ✅'));
  if (errors.length) console.log('ناموفق‌ها: ' + errors.join(' | '));
  process.exit(fail ? 1 : 0);
}
