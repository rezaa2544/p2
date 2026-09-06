#!/usr/bin/env node

/**
 * server7 — حذفِ حساب (قفل ۹.۵ — ملاک حذفِ حسابِ گوگل‌پلی)
 *
 * بخش A — سرورِ واقعی:
 *   D1  بدون نشست → 401
 *   D2  ولی حذف می‌کند: کاربر + parent_links از disk می‌روند؛ فرزند و بقیه سالم
 *   D3  نشستِ باز می‌میرد (/me با کوکیِ قدیم = 401)
 *   D4  ورودِ دوباره بعد از حذف بسته است (send-code: پاسخِ یک‌شکلِ بدونِ نشت + login با کدِ معتبر bad_code)
 *   D5  پیام‌های فرستاده‌شده می‌روند؛ داده‌های نهادی (حضور) دست‌نخورده
 *   D6  آدیت: account_deleted بدونِ شماره/کدِ ملی (بهداشتی)
 *   D7  صفحهٔ وبِ جداگانه: سرو می‌شود، فرمِ کامل، بدون وابستگیِ خارجی
 *
 * بخش B — کلاینتِ واقعی در jsdom:
 *   C1  سیاست: دکمهٔ «درخواستِ حذفِ حساب» + متنِ بخشِ ۷
 *   C2  حالتِ محلی: پاک‌سازیِ کاملِ دستگاه (localStorage + S.user)
 *   C3  حالتِ سروری: endpoint صدا زده می‌شود؛ موفقیت = پاک‌سازی؛ خطا = دست‌نخورده
 *
 * اجرا: node tests/server7.js  (نیازمند jsdom)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name + (extra !== undefined ? ' — ' + String(extra).slice(0, 160) : '')); console.log('  ❌ ' + name + (extra !== undefined ? ' — ' + String(extra).slice(0, 160) : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function httpReq(port, method, p, body, jar) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (jar) headers['Cookie'] = jar.headers().join('; ');
    const req = http.request({ hostname: '127.0.0.1', port, path: p, method, headers }, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => {
        if (jar) jar.absorb(res.headers);
        let j = null; try { j = JSON.parse(b); } catch (e) {}
        resolve({ status: res.statusCode, headers: res.headers, json: j, raw: b });
      });
    });
    req.on('error', () => resolve({ status: 0, headers: {}, json: null, raw: '' }));
    if (data) req.write(data);
    req.end();
  });
}
function makeJar() {
  const jar = {};
  return {
    headers() { return Object.keys(jar).map((k) => k + '=' + jar[k]); },
    absorb(h) {
      const sc = h['set-cookie'];
      if (!sc) return;
      sc.forEach((c) => {
        const [pair] = c.split(';');
        const i = pair.indexOf('=');
        if (i > 0) jar[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
      });
    }
  };
}

async function partA() {
  console.log('\n▸ حذفِ حساب — سرور (قفل ۹.۵)');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-s7-'));
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} }); /* پاک‌سازیِ tmp تا /tmp پر نشود */
  const storeFile = path.join(tmp, 'payesh.json');
  fs.copyFileSync(path.join(ROOT, 'server/data/payesh.json'), storeFile);
  const keyFile = path.join(tmp, 'jwt.key');
  const auditFile = path.join(tmp, 'audit.log');

  let port = null, srv = null;
  for (const p of [8981, 8982, 8983]) {
    const s = spawn(process.execPath, ['server/index.js'], {
      cwd: ROOT,
      env: Object.assign({}, process.env, {
        PORT: String(p), HOST: '127.0.0.1',
        PAYESH_STORE: storeFile, PAYESH_AUDIT: auditFile, PAYESH_KEY: keyFile, PAYESH_DEMO_CODE: '1'
      }),
      stdio: 'pipe'
    });
    let booted = false;
    for (let i = 0; i < 50; i++) {
      const h = await httpReq(p, 'GET', '/api/health').then((r) => r.json).catch(() => null);
      if (h && h.ok && h.pid === s.pid) { booted = true; break; }
      if (h && h.ok) break;
      await sleep(300);
    }
    if (booted) { port = p; srv = s; break; }
    s.kill('SIGKILL');
  }
  chk('A0 سرور بالا آمد (با pidِ خودِ این spawn)', port !== null);
  if (port === null) { console.log('  ⚠ بدون سرور، ادامه ممکن نیست'); return false; }

  // D1: بدون نشست
  const noAuth = await httpReq(port, 'POST', '/api/auth/delete-account', {}, null);
  chk('D1 بدون نشست → 401 no_session', noAuth.status === 401 && noAuth.json && noAuth.json.code === 'no_session', noAuth.raw);

  // D2: ولیِ ۱۷ (فرزندِ ۱۶)
  const su = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  const par = su.users.find(u => u.id === 17);
  const jar = makeJar();
  const send = await httpReq(port, 'POST', '/api/auth/send-code', { phone: par.phone }, jar);
  const origCode = String((send.json && send.json.demo_code) || '');
  await httpReq(port, 'POST', '/api/auth/login',
    { phone: par.phone, code: origCode, national_id: par.national_id }, jar);

  const del = await httpReq(port, 'POST', '/api/auth/delete-account', {}, jar);
  chk('D2a حذف: 200 + deleted:true', del.status === 200 && del.json && del.json.ok === true && del.json.deleted === true, del.raw);

  await sleep(2500); /* persistStore هر ۲ ثانیه */
  const disk = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  chk('D2b کاربر از disk رفته + parent_links او رفته',
    !disk.users.some(u => u.id === 17) && !disk.parent_links.some(l => l.parent_id === 17),
    'users=' + disk.users.filter(u => u.id === 17).length + ' links=' + disk.parent_links.filter(l => l.parent_id === 17).length);
  chk('D2c فرزند و بقیهٔ کاربران سالم‌اند',
    !!disk.users.find(u => u.id === 16) && disk.users.length === su.users.length - 1);

  // D3: نشستِ باز می‌میرد
  const meDead = await httpReq(port, 'GET', '/api/auth/me', null, jar);
  chk('D3 نشستِ باز بعد از حذف مرده است (/me = 401)', meDead.status === 401, meDead.raw);

  // D4: ورودِ دوباره — کلِ مسیرِ احراز بسته است
  const jar2 = makeJar();
  const send2 = await httpReq(port, 'POST', '/api/auth/send-code', { phone: par.phone }, jar2);
  /* حتی با همان کدِ معتبرِ قبلی، کاربرِ حذف‌شده دیگر نمی‌تواند وارد شود */
  const relogin = await httpReq(port, 'POST', '/api/auth/login',
    { phone: par.phone, code: origCode, national_id: par.national_id }, jar2);
  /* دور ۷۳ (S-73-2): send-code دیگر 404/no_account نمی‌دهد — پاسخِ یک‌شکل
     برای هر شماره (ناشناخته/حذف‌شده/موجود) تا phone-enumeration بسته بماند.
     login با کدِ معتبرِ قبلی = bad_code (چکِ کد قبل از وجودِ کاربر — زمانِ مساوی). */
  chk('D4 ورودِ دوباره بعد از حذف بسته است (send-code بدونِ نشتِ وجود؛ login با کدِ معتبر = bad_code)',
    send2.status === 200 && send2.json && send2.json.ok === true && send2.json.code === 'sent' && !send2.json.demo_code &&
    relogin.status === 401 && relogin.json && relogin.json.code === 'bad_code',
    'send:' + send2.raw + ' login:' + relogin.raw);

  // D5: پیام‌های فرستاده‌شده رفته + حضورِ نهادی دست‌نخورده
  const sentBefore = (su.messages || []).filter(m => m.from_id === 17).length;
  const sentAfter = (disk.messages || []).filter(m => m.from_id === 17).length;
  const attCountBefore = (su.attendance || []).filter(a => a.student_id === 16).length;
  const attCountAfter = (disk.attendance || []).filter(a => a.student_id === 16).length;
  chk('D5 پیام‌های فرستاده‌شده حذف شدند (' + sentBefore + '→' + sentAfter + ') + حضورِ فرزند دست‌نخورده',
    sentBefore > 0 && sentAfter === 0 && attCountAfter === attCountBefore,
    'sent ' + sentBefore + '→' + sentAfter + ' att ' + attCountBefore + '→' + attCountAfter);

  // D6: آدیت بهداشتی
  const auditTxt = fs.existsSync(auditFile) ? fs.readFileSync(auditFile, 'utf8') : '';
  chk('D6 آدیت: account_deleted ثبت شد، بدونِ شماره/کدِ ملی',
    /account_deleted/.test(auditTxt) && auditTxt.indexOf(par.phone) === -1 && auditTxt.indexOf(par.national_id) === -1,
    auditTxt.slice(-220));

  // D7: صفحهٔ وبِ جداگانه
  const page = await httpReq(port, 'GET', '/account-deletion.html', null, null);
  chk('D7a صفحهٔ حذفِ حساب سرو می‌شود (فرمِ کامل)',
    page.status === 200 && page.raw.indexOf('حذف حساب') !== -1 && page.raw.indexOf('کد ملی') !== -1 && page.raw.indexOf('delete-account') !== -1,
    page.raw.slice(0, 120));
  chk('D7b صفحه خودکفاست (بدون وابستگیِ خارجی)',
    page.raw.indexOf('https://') === -1 && page.raw.indexOf('http://') === -1 && /<script>/.test(page.raw),
    page.raw.slice(0, 120));

  srv.kill('SIGKILL');
  await sleep(200);
  return true;
}

async function partB() {
  let JSDOM;
  try { ({ JSDOM } = require('jsdom')); }
  catch { console.log('  ⏭️ jsdom نصب نیست — بخش B رد شد.  (npm i --no-save jsdom)'); return; }

  console.log('\n▸ حذفِ حساب — کلاینت (jsdom + index.htmlِ واقعی)');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost/',
    virtualConsole: new (require('jsdom').VirtualConsole)()
  });
  const win = dom.window;
  const W = (expr) => win.eval(expr);
  await sleep(500);

  // C1: دکمه + متن
  const h = W('privacyPolicyHtml()');
  chk('C1 سیاست: دکمهٔ «درخواستِ حذفِ حساب» + متنِ بخشِ ۷',
    h.indexOf('delete-account-req') !== -1 && h.indexOf('کاملاً حذف می‌شود') !== -1);

  // C2: حالتِ محلی
  const parId = W(`(function(){
    var l = db.parent_links || []; var ids = {};
    l.forEach(function(x){ ids[x.parent_id] = 1; });
    var p = (db.users || []).find(function(u){ return u.role === 'parent' && ids[u.id]; });
    return p ? p.id : null;
  })()`);
  W(`S.user=byId('users',${parId});S.persona=null;S.boss=null;`);
  W(`Store.set('payesh_test_key_v1','x');`);
  const keysBefore = W('Store.keys().length');
  W(`DATA_MODE='local'; doDeleteAccount();`);
  await sleep(100);
  chk('C2 حالتِ محلی: localStorage خالی + نشستِ محلی پاک',
    W('Store.keys().length') === 0 && W('S.user') === null && keysBefore > 0,
    'keys ' + keysBefore + '→' + W('Store.keys().length'));

  // C3: حالتِ سروری
  const parId2 = W(`(db.users||[]).find(function(u){return u.role==='parent';}).id`);
  W(`S.user=byId('users',${parId2});S.persona=null;S.boss=null;`);
  let fetchCalls = 0;
  let fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ ok: true, deleted: true }) });
  win.fetch = (url) => { fetchCalls++; return fetchImpl(url); };
  W(`DATA_MODE='server'; Store.set('payesh_test_key_v2','y');`);
  W('doDeleteAccount()');
  await sleep(120);
  chk('C3a حالتِ سروری: endpoint صدا زده شد + پاک‌سازی بعد از موفقیت',
    fetchCalls === 1 && W('S.user') === null && W('Store.keys().length') === 0,
    'fetch=' + fetchCalls + ' keys=' + W('Store.keys().length'));

  // C3b: خطای سرور = دست‌نخورده
  W(`S.user=byId('users',${parId2});S.persona=null;S.boss=null;`);
  W(`Store.set('payesh_test_key_v3','z');`);
  fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({ ok: false, code: 'no_session' }) });
  W('doDeleteAccount()');
  await sleep(120);
  chk('C3b خطای سرور: پاک‌سازی نمی‌شود (کاربر دست‌نخورده)',
    fetchCalls === 2 && W('S.user') !== null && W("Store.get('payesh_test_key_v3')") === 'z',
    'user=' + JSON.stringify(W('S.user') && W('S.user').id));

  win.close();
}

(async () => {
  const okA = await partA();
  if (okA) await partB();
  console.log('\n────────────────────────────────────────────────────────');
  console.log('server7 (حذفِ حساب): ' + (pass + fail) + ' بررسی — ✅ ' + pass + ' · ❌ ' + fail);
  if (errors.length) { console.log('شکست‌ها:'); errors.forEach((f) => console.log('  - ' + f)); }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
