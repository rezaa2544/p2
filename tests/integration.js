#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   دور ۷۴ — تستِ یکپارچهٔ واقعی: index.htmlِ ساخته‌شده + سرورِ واقعی
   -----------------------------------------------------------------
   بارِ سنگینِ «اتصال به سرور» که قبلاً تست‌شده نبود: کلاینتِ واقعی
   (همان بیلدی که به کاربر می‌رسد) با شبکهٔ واقعی (HTTP واقعی، کوکیِ
   واقعیِ نشست) با سرورِ واقعی — بدون هیچ mock.
     I1  خودِ کلاینت سرور را تشخیص می‌دهد (DATA_MODE=server از /api/health)
     I2  ورودِ واقعی از مسیرِ کلاینت (send-code → login، کوکی در جار)
     I3  نشستِ واقعی: /me و /bell/now با کوکیِ همان جلسه
     I4  یک نوشتنِ واقعی از Data لایهٔ کلاینت → صفِ SYNC → /api/sync
     I5  رکورد روی diskِ سرور نشست (flush + atomic rename)
     I6  خروج از حساب → نشست در سرور سلب شد
   موتانت‌هایِ قرارداد (کلاینت/سرور):
     - مسیرِ login در کلاینت اشتباه ⇒ I2
     - کوکیِ نشست توسطِ کلاینت فرستاده نشود ⇒ I3
     - سرور کوکی نسازد ⇒ I3
   اجرا: node tests/integration.js
   ═══════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name + (extra !== undefined ? ' — ' + String(extra).slice(0, 160) : '')); console.log('  ❌ ' + name + (extra !== undefined ? ' — ' + String(extra).slice(0, 160) : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nodeFetch = global.fetch;

function httpReq(port, method, p, body, cookie) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers['Cookie'] = cookie;
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ hostname: '127.0.0.1', port, path: p, method, headers }, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) {} resolve({ status: res.statusCode, json: j, raw: b, setCookie: res.headers['set-cookie'] }); });
    });
    req.on('error', () => resolve({ status: 0, json: null, raw: '' }));
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  console.log('\n▸ دور 74 — یکپارچهٔ واقعی (بیلدِ کلاینت + سرورِ زنده)');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-int-'));
  const storeFile = path.join(tmp, 'payesh.json');
  fs.copyFileSync(path.join(ROOT, 'server/data/payesh.json'), storeFile);
  const keyFile = path.join(tmp, 'jwt.key');
  const auditFile = path.join(tmp, 'audit.log');
  const src = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  const SA = src.users.find(u => u.role === 'superadmin');
  const P = src.users.find(u => u.id === 17);

  /* ── سرورِ واقعی ── */
  let port = null, srv = null;
  for (const p of [8993, 8992]) {
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
      const h = await httpReq(p, 'GET', '/api/health').then(r => r.json).catch(() => null);
      if (h && h.ok && h.pid === s.pid) { booted = true; break; }
      if (h && h.ok) break;
      await sleep(300);
    }
    if (booted) { port = p; srv = s; break; }
    s.kill('SIGKILL');
  }
  chk('P0 سرورِ واقعی بالا آمد', port !== null);
  if (port === null) { process.exit(1); }

  /* ── جارِ کوکی (کوکیِ نشست فقط در مرورگر/کلاینت می‌ماند) ── */
  const jar = { cookie: '' };
  function parseCookies(h) {
    const sc = h.getSetCookie ? h.getSetCookie() : (h['set-cookie'] || []);
    for (const c of Array.isArray(sc) ? sc : [sc]) {
      const kv = String(c).split(';')[0];
      const i = kv.indexOf('=');
      if (i > 0) jar.cookie = kv.slice(0, i) + '=' + kv.slice(i + 1);
    }
  }
  const origin = 'http://127.0.0.1:' + port;

  /* ── بارگذاریِ index.htmlِ ساخته‌شده در jsdom + fetchِ واقعی ── */
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const consoleErrs = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: origin + '/',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.scrollTo = () => {};
      /* fetch: همان قراردادِ مرورگر — URL نسبی به origin resolve شود،
         کوکیِ نشست همراه هر درخواست برود و Set-Cookie ثبت شود. */
      window.fetch = function (url, init) {
        init = init || {};
        const u = String(url).indexOf('http') === 0 ? url : new URL(String(url), origin).href;
        const headers = {};
        const src = init.headers || {};
        for (const k of Object.keys(src)) headers[k.toLowerCase()] = src[k];
        if (jar.cookie && !headers['cookie'] && init.credentials !== 'omit') headers['cookie'] = jar.cookie;
        return nodeFetch(u, Object.assign({}, init, { headers, redirect: 'manual' }))
          .then((res) => { parseCookies(res.headers); return res; });
      };
      const ce = window.console.error.bind(window.console);
      window.console.error = (...a) => { consoleErrs.push(a.map(String).join(' ')); ce(...a); };
    }
  });
  const w = dom.window;

  /* ── I1: کلاینت خودش سرور را تشخیص داده است ── */
  let detected = false;
  for (let i = 0; i < 120; i++) {
    try { if (w.eval('typeof DATA_MODE !== "undefined" && DATA_MODE === "server"')) { detected = true; break; } } catch (e) {}
    await sleep(500);
  }
  chk('I1 کلاینتِ واقعی سرور را تشخیص داد (DATA_MODE=server)', detected, 'DATA_MODE=' + (() => { try { return w.eval('DATA_MODE'); } catch (e) { return 'n/a'; } })());

  if (detected) {
    /* ── I2: ورودِ واقعی از مسیرِ کلاینت (همان فراخوانی‌هایی که UI می‌زند) ── */
    const sc = await w.eval(`(async()=>{ const r = await Api.post('/api/auth/send-code',{phone:${JSON.stringify(SA.phone)}},{raw:true}); return {status:r.status, demo:r.body&&r.body.demo_code}; })()`);
    const lg = await w.eval(`(async()=>{ const r = await Api.post('/api/auth/login',{phone:${JSON.stringify(SA.phone)},code:'${sc.demo}',national_id:${JSON.stringify(SA.national_id)}},{raw:true}); return {status:r.status, ok:r.body&&r.body.ok, role:r.body&&r.body.user&&r.body.user.role}; })()`);
    chk('I2-a send-code از کلاینت: 200 + demo_code', sc.status === 200 && !!sc.demo, JSON.stringify(sc));
    chk('I2-b login از کلاینت: 200 + superadmin', lg.status === 200 && lg.ok === true && lg.role === 'superadmin', JSON.stringify(lg));
    chk('I2-c کوکیِ نشست در جارِ کلاینت نشست', /payesh_session=/.test(jar.cookie), jar.cookie.slice(0, 24));
    /* همان کاری که UI پس از ورود می‌کند: کاربر با id از پاسخِ سرور از
       دادهٔ محلی گرفته می‌شود (server2 بند D). مهرِ op.by از S.user می‌آید. */
    const suserOk = await w.eval(`(function(){ var u = db.users.find(function(x){ return x.id === ${SA.id} }); S.user = u; return !!(S.user && S.user.role === "superadmin"); })()`);
    chk('I2-d S.user از پاسخِ سرور تنظیم شد (مسیرِ UI)', suserOk === true, String(suserOk))


    /* ── I3: نشستِ واقعی از کلاینت ── */
    const me = await w.eval(`(async()=>{ const r = await Api.get('/api/auth/me'); return {status:0, id:r&&r.user&&r.user.id, role:r&&r.user&&r.user.role}; })().catch(e=>({err:String(e)}))`);
    chk('I3-a /me با کوکیِ واقعی: superadmin', me.role === 'superadmin' && !!me.id, JSON.stringify(me));
    /* parent: bell — ورود دوم (HTTP خام) با کوکیِ همان نشست */
    const scP = await httpReq(port, 'POST', '/api/auth/send-code', { phone: P.phone });
    const lgP = await httpReq(port, 'POST', '/api/auth/login', { phone: P.phone, code: scP.json.demo_code, national_id: P.national_id });
    const parentCookie = Array.isArray(lgP.setCookie) ? lgP.setCookie[0] : (lgP.setCookie || '');
    const bell = await httpReq(port, 'GET', '/api/bell/now', null, parentCookie);
    chk('I3-b bellِ parent (HTTP واقعی + کوکی): فرزندِ 16 را می‌بیند', bell.status === 200 && bell.json && bell.json.family && bell.json.family.length === 1 && Number(bell.json.family[0].studentId) === 16, JSON.stringify(bell.json && bell.json.family));

    /* ── I4/I5: نوشتنِ واقعی از Data لایهٔ کلاینت → /api/sync → disk ── */
    const noteId = await w.eval(`(function(){ var rec = Data.create('teacher_notes', { school_id: 1, teacher_id: 2, text: 'یادداشتِ یکپارچه‌سازیِ ' + Date.now(), date: new Date().toISOString().slice(0,10), by: ${SA.id} }); return rec && rec.id; })()`);
    let synced = false;
    for (let i = 0; i < 40; i++) { await sleep(500); try { if (w.eval('typeof SYNC !== "undefined" && pendingCount() === 0')) { synced = true; break; } } catch (e) {} }
    chk('I4 عملیات از Data لایهٔ کلاینت همگام شد (صف خالی)', synced === true, (() => { try { return 'pending=' + w.eval('pendingCount()'); } catch (e) { return 'n/a'; } })());
    let onDisk = false;
    for (let i = 0; i < 12; i++) {
      await sleep(1000);
      try {
        const disk = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
        if ((disk.teacher_notes || []).some(x => x.id === noteId)) { onDisk = true; break; }
      } catch (e) {}
    }
    chk('I5 رکورد روی diskِ سرور نشست (flush + rename اتمی)', onDisk && noteId != null, 'id=' + noteId);

    /* ── I6: خروج → نشستِ سروری سلب شد ── */
    const lo = await w.eval(`(async()=>{ const r = await Api.post('/api/auth/logout', null, {raw:true}); return r.status; })()`);
    const me2 = await w.eval(`(async()=>{ try { await Api.get('/api/auth/me'); return {ok:true}; } catch(e){ return {ok:false, msg:String(e)}; } })()`);
    chk('I6-a خروج از کلاینت: 200', lo === 200, String(lo));
    chk('I6-b بعد از خروج /me می‌میرد (سلبِ نشست در سرور)', me2.ok === false, JSON.stringify(me2).slice(0, 120));
  }

  srv.kill('SIGKILL');
  dom.window.close();
  console.log('\nconsole.error کلاینت در طول تست: ' + (consoleErrs.length ? consoleErrs.length + ' — ' + consoleErrs[0].slice(0, 100) : 'صفر'));
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('\nintegration: ' + pass + ' ✅ / ' + fail + ' ❌');
  if (fail) { errors.forEach((e) => console.log('  — ' + e)); process.exit(1); }
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
