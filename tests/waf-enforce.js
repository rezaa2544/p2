#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────
   waf-enforce.js — WAF حالتِ ENFORCE (P0 #6) + حفاظتِ سوءاستفاده
   ─────────────────────────────────────────────────────────────
   A  یکواحده: mode پیش‌فرض report · تشخیص‌ها دست‌نخورده · allowlist
   B  enforce (فرزندِ بوت‌شده): XSS/SQLi ⇒ 403 waf_blocked ·
      fail-safe allowlist (پروب‌ها هرگز مسدود نمی‌شوند) ·
      allowlistِ اپراتور (PAYESH_WAF_ALLOW) · بدنهٔ بلاک payload ندارد
   C  report (پیش‌فرض): همان URL ⇒ verdict دیده می‌شود ولی روتینگ ادامه دارد
   D  حفاظتِ سوءاستفاده: سقفِ per-phoneِ login (PAYESH_LOGIN_PHONE_LIMIT)
      + پلکانِ send-code (regression)

   اجرایِ CI: lane WAF — node tests/waf-ddos.js --unit-only &&
              node tests/waf-enforce.js && node tests/waf-mutations.js
   ───────────────────────────────────────────────────────────── */
'use strict';
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const waf = require(path.join(ROOT, 'server', 'waf.js'));

let green = 0, red = 0;
function chk(name, ok, info) {
  if (ok) { green++; console.log('  ✅ ' + name); }
  else { red++; console.log('  ❌ ' + name + (info ? ' — ' + info : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function req(method, port, p, body, headers) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const h = Object.assign({ 'Content-Type': 'application/json' }, headers || {});
    if (data) h['Content-Length'] = Buffer.byteLength(data);
    const r = http.request({ host: '127.0.0.1', port: port, method: method, path: p, headers: h }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b }));
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function boot(port, env) {
  const storeFile = '/tmp/waf-enforce-store-' + port + '-' + Date.now() + '.json';
  try { fs.copyFileSync(path.join(ROOT, 'server', 'data', 'payesh.json'), storeFile); }
  catch (e) { /* seed نیست — با استورِ خالی */ fs.writeFileSync(storeFile, JSON.stringify({ users: [], schools: [] })); }
  const proc = spawn('node', [path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT,
    env: Object.assign({}, process.env, {
      PORT: String(port), HOST: '127.0.0.1',
      PAYESH_STORE: storeFile,
      PAYESH_AUDIT: '/tmp/waf-enforce-audit-' + port + '.log',
      PAYESH_ENV: 'development', NODE_ENV: 'development',
      PAYESH_DEMO_CODE: '1'
    }, env || {}),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let log = '';
  proc.stdout.on('data', (d) => { log += d; });
  proc.stderr.on('data', (d) => { log += d; });
  return new Promise((resolve) => {
    let tries = 0;
    const t = setInterval(async () => {
      tries++;
      try {
        const r = await req('GET', port, '/api/health');
        clearInterval(t);
        resolve({ proc: proc, storeFile: storeFile, ok: true, log: () => log });
      } catch (e) {
        if (proc.exitCode !== null) { clearInterval(t); resolve({ proc: proc, storeFile: storeFile, ok: false, log: () => log }); }
        else if (tries > 45) { clearInterval(t); resolve({ proc: proc, storeFile: storeFile, ok: false, log: () => log }); }
      }
    }, 500);
  });
}
function close(s) {
  if (!s) return;
  try { process.kill(s.proc.pid, 'SIGKILL'); } catch (e) {}
  try { fs.unlinkSync(s.storeFile); } catch (e) {}
}

async function main() {
  /* ── A: یکواحده (بدون بوت) ── */
  console.log('— A: یکواحده —');
  chk('A1 mode پیش‌فرض report است', waf.WAF_MODE === 'report', 'mode=' + waf.WAF_MODE);
  const ev = (url) => waf.evaluateInput({ url: url || '', ua: '' });
  chk('A2a تشخیصِ XSS دست‌نخورده', ev('/api/x?m=<script>alert(1)</script>') && ev('/api/x?m=<script>alert(1)</script>').rule === 'xss');
  chk('A2b تشخیصِ SQLi دست‌نخورده', ev("/api/x?f=1%27%20OR%201=1--") && ev("/api/x?f=1%27%20OR%201=1--").rule === 'sqli');
  chk('A2c تشخیصِ traversal دست‌نخورده', ev('/api/../etc/passwd') && ev('/api/../etc/passwd').rule === 'traversal');
  chk('A2d تشخیصِ badbot دست‌نخورده', waf.evaluateInput({ url: '', ua: 'sqlmap/1.8' }).rule === 'badbot');
  chk('A2e پاک = null', ev('/api/students/1?name=آیدا') === null);
  chk('A3a allowlist: /api/health', waf.isAllowlisted('/api/health') === true);
  chk('A3b allowlist: /api/liveness', waf.isAllowlisted('/api/liveness') === true);
  chk('A3c allowlist: /api/readiness', waf.isAllowlisted('/api/readiness') === true);
  chk('A3d allowlist: زیرمسیرِ /api/health نیست', waf.isAllowlisted('/api/health/extra') === false);
  chk('A3e غیرمجاز: /api/students/1', waf.isAllowlisted('/api/students/1') === false);
  process.env.PAYESH_WAF_ALLOW = '/api/bell';
  chk('A3f allowlistِ اپراتور: /api/bell', waf.isAllowlisted('/api/bell/now') === true);
  chk('A3g allowlistِ اپراتور: پیشوندِ کاذب نمی‌خورد', waf.isAllowlisted('/api/bellwether/1') === false);
  delete process.env.PAYESH_WAF_ALLOW;

  /* ── B: enforce (بوتِ فرزند) ── */
  console.log('— B: enforce (بوت) —');
  const E = await boot(8991, { PAYESH_WAF_MODE: 'enforce', PAYESH_WAF_ALLOW: '/api/bell' });
  chk('B0 سرورِ enforce بالا آمد', !!E && E.ok, E ? E.log() : '');
  if (E && E.ok) {
    /* payload کدشده — Node http کاراکترِ خامِ < > در path نمی‌دهد؛
       WAF خودش decode می‌کند (الگوریسمِ evaluateInput: raw + decoded). */
    const X = encodeURIComponent('<script>alert(1)</script>');
    const S = encodeURIComponent("1' OR 1=1--");
    const xss = '/api/public-report?m=' + X;
    const r1 = await req('GET', 8991, xss);
    chk('B1a XSS ⇒ 403', r1.status === 403, 'status=' + r1.status);
    let j1 = {};
    try { j1 = JSON.parse(r1.body); } catch (e) {}
    chk('B1b code=waf_blocked + rule=xss', j1.ok === false && j1.code === 'waf_blocked' && j1.rule === 'xss', r1.body.slice(0, 120));
    chk('B1c X-WAF-Action: block', r1.headers['x-waf-action'] === 'block', JSON.stringify(r1.headers['x-waf-action']));
    const sqli = '/api/students/1?f=' + S;
    const r2 = await req('GET', 8991, sqli);
    let j2 = {};
    try { j2 = JSON.parse(r2.body); } catch (e) {}
    chk('B2 SQLi ⇒ 403 waf_blocked (rule=sqli)', r2.status === 403 && j2.code === 'waf_blocked' && j2.rule === 'sqli', 'status=' + r2.status + ' ' + r2.body.slice(0, 120));
    const r3 = await req('GET', 8991, '/api/%2e%2e/%2e%2e/etc/passwd');
    chk('B3 traversal ⇒ 403 (یا 400ِ روتینگ — ولی هرگز 200/500)', r3.status === 403 || r3.status === 400, 'status=' + r3.status);
    /* fail-safe: پروب‌های زیرساخت با همان الگو مسدود نمی‌شوند */
    const r4 = await req('GET', 8991, '/api/liveness?m=' + X);
    chk('B4a fail-safe: /api/liveness با الگوی XSS ⇒ 200', r4.status === 200, 'status=' + r4.status);
    chk('B4b verdict همچنان دیده شده (xss) ولی بلاک نشده', r4.headers['x-waf-verdict'] === 'xss', JSON.stringify(r4.headers['x-waf-verdict']));
    /* allowlistِ اپراتور */
    const r5 = await req('GET', 8991, '/api/bell/now?f=' + S);
    chk('B5 PAYESH_WAF_ALLOW=/api/bell ⇒ مسدود نمی‌شود', r5.status !== 403 || JSON.parse(r5.body || '{}').code !== 'waf_blocked', 'status=' + r5.status + ' ' + r5.body.slice(0, 100));
    /* درخواستِ پاک در enforce */
    const r6 = await req('GET', 8991, '/api/health');
    chk('B6a پاک ⇒ 200', r6.status === 200, 'status=' + r6.status);
    chk('B6b verdict=clean', r6.headers['x-waf-verdict'] === 'clean', JSON.stringify(r6.headers['x-waf-verdict']));
    /* بدنهٔ بلاک، payload ندارد (PII/echo rule) */
    chk('B7 بدنهٔ بلاک بدون echoِ payload', r1.body.indexOf('alert(1)') < 0 && r1.body.length < 200, r1.body.slice(0, 120));
  }

  /* ── C: report (پیش‌فرض — همان URL، بلاک نمی‌شود) ── */
  console.log('— C: report (پیش‌فرض) —');
  const R = await boot(8992, {});
  chk('C0 سرورِ report بالا آمد', !!R && R.ok, R ? R.log() : '');
  if (R && R.ok) {
    const CX = encodeURIComponent('<script>alert(1)</script>');
    const r1 = await req('GET', 8992, '/api/public-report?m=' + CX);
    chk('C1a report: همان XSS ⇒ بلاک نمی‌شود (روتینگ ادامه دارد)', r1.status !== 403 || JSON.parse(r1.body || '{}').code !== 'waf_blocked', 'status=' + r1.status + ' ' + r1.body.slice(0, 80));
    chk('C1b report: verdict=xss در سرآیند', r1.headers['x-waf-verdict'] === 'xss', JSON.stringify(r1.headers['x-waf-verdict']));
    const r2 = await req('GET', 8992, '/api/health');
    chk('C2 report: پاک ⇒ 200 + clean', r2.status === 200 && r2.headers['x-waf-verdict'] === 'clean');
  }

  /* ── D: حفاظتِ سوءاستفاده (بوتِ report با سقفِ test) ── */
  console.log('— D: حفاظتِ سوءاستفاده —');
  const A = await boot(8993, { PAYESH_LOGIN_PHONE_LIMIT: '3', PAYESH_SMS_PHONE_LIMIT: '2', PAYESH_SMS_COOLDOWN_S: '0', PAYESH_SMS_WINDOW_S: '3600' });
  chk('D0 سرورِ abuse بالا آمد', !!A && A.ok, A ? A.log() : '');
  if (A && A.ok) {
    /* seed ممکن است نباشد (CI: gitignored) — fallback: شمارنده‌ها پیش از
       وجود‌سنجی کار می‌کنند، پس رفتارِ test با شمارهٔ نامشخص یکسان است. */
    let known = { users: [] };
    try { known = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'data', 'payesh.json'), 'utf8')); } catch (e) {}
    const ph = String((known.users && known.users[0] ? known.users[0].phone : '09121234567')).replace(/[\s\-()]/g, '').slice(-10);
    const ph2 = String((known.users && known.users[1] ? known.users[1].phone : '09121234568')).replace(/[\s\-()]/g, '').slice(-10);
    /* D1: سقفِ per-phoneِ login: ۳ تلاش ⇒ چهارم ۴۲۹ */
    let last = -1;
    for (let i = 0; i < 4; i++) {
      const r = await req('POST', 8993, '/api/auth/login', { phone: ph, code: '000000', national_id: '0000000000' });
      last = r.status;
      if (r.status === 429) break;
      await sleep(1100); /* تأخیرِ تصاعدیِ login_fail را رد می‌کنیم */
    }
    chk('D1 سقفِ per-phoneِ login: تلاشِ چهارم ۴۲۹', last === 429, 'last=' + last);
    /* D2: شمارهِٔ دیگر (کنترل) — همان IP، phoneِ تازه: هنوز ۴۰۱ (نه ۴۲) */
    const r2 = await req('POST', 8993, '/api/auth/login', { phone: ph2, code: '000000', national_id: '0000000000' });
    chk('D2 phoneِ دیگر باز هم می‌تواند تلاش کند (۴۰، نه ۴۲۹)', r2.status === 401, 'status=' + r2.status);
    /* D3: پلکانِ send-code (regression): سقفِ phone=۲ ⇒ سوم ۴۲۹ */
    let s429 = -1, sOk = 0;
    for (let i = 0; i < 3; i++) {
      const r = await req('POST', 8993, '/api/auth/send-code', { phone: ph2 });
      if (r.status === 200) sOk++;
      else if (r.status === 429 && s429 < 0) s429 = i + 1;
    }
    chk('D3 send-code: سقفِ phone (۲) ⇒ ارسالِ سوم ۴۲', sOk === 2 && s429 === 3, 'ok=' + sOk + ' first429=#' + s429);
  }

  close(E); close(R); close(A);
  await sleep(300);
  console.log('────────────────────────────────────────────────────');
  console.log(`waf-enforce: ${green} ✅ / ${red} ❌ از ${green + red}`);
  process.exit(red === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
