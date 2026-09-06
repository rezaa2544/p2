/* ─────────────────────────────────────────────────────────────
   server4.js — TLS واقعی (مرحلهٔ ۲، بند TLS)
   ─────────────────────────────────────────────────────────────
   همه‌چیز واقعی: گواهیِ خودامضا با سازندهٔ خالصِ stdlib
   (server/tls-cert.js — DER دست‌ساز، بدون هیچ وابستگی) →
   سرورِ https واقعی (spawn) → درخواست‌های https واقعی.

   سناریو:
     T1  سازندهٔ گواهی: فایل‌های crt/key + گواهی قابلِ خواندن
         توسط X509Certificate (CN درست، مدتِ اعتبار آینده)
     T2  سرور با PAYESH_TLS_CERT/KEY راه می‌افتد → health با
         https واقعی 200 می‌گیرد
     T3  هدرِ HSTS فقط در https وجود دارد
     T4  کوکیِ احراز در https دارای Secure است (و HttpOnly/Lax)
     T5  ورودِ کامل با https: send-code → login → /me
     T6  گواهیِ نادرست (فایلِ غایب) = راه‌اندازیِ شکسته با
         پیامِ روشن (سرور بالا نمی‌آید)
   ───────────────────────────────────────────────────────────── */
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const PORTS = [8941, 8942, 8943];
const TLS_OPTS = { rejectUnauthorized: false };

let okc = 0, failc = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { okc++; console.log('  ✅ ' + name); }
  else { failc++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function waitHealth(base, timeoutMs, useTls) {
  const t0 = Date.now();
  return new Promise((resolve) => {
    (function tick() {
      const req = (useTls ? https.get : http.get)(
        Object.assign({ hostname: '127.0.0.1', path: '/api/health', port: Number(base.split(':')[2]) }, useTls ? TLS_OPTS : {}),
        (res) => { res.resume(); res.on('end', () => resolve(true)); }
      );
      req.on('error', () => {
        if (Date.now() - t0 > timeoutMs) return resolve(false);
        setTimeout(tick, 300);
      });
    })();
  });
}

/* mini cookie jar (Node fetch/http keeps no cookies) */
function makeJar() {
  const jar = {};
  return {
    headers() { return Object.keys(jar).map((k) => k + '=' + jar[k]); },
    absorb(resHeaders) {
      const sc = resHeaders['set-cookie'];
      if (!sc) return;
      sc.forEach((c) => {
        const [pair] = c.split(';');
        const idx = pair.indexOf('=');
        if (idx > 0) jar[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
      });
    }
  };
}

async function httpsReq(port, method, p, body, jar) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request(Object.assign({
      hostname: '127.0.0.1', port, path: p, method,
      headers: Object.assign({ 'Content-Type': 'application/json' },
        jar ? { Cookie: jar.headers().join('; ') } : {})
    }, TLS_OPTS), (res) => {
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

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-tls-'));
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} }); /* پاک‌سازیِ tmp تا /tmp پر نشود */
  const certDir = path.join(tmp, 'certs');
  const storeFile = path.join(tmp, 'payesh.json');
  const auditFile = path.join(tmp, 'audit.log');
  const keyFile = path.join(tmp, 'jwt.key');
  fs.copyFileSync(path.join(ROOT, 'server/data/payesh.json'), storeFile);

  /* T1 — the stdlib cert generator */
  let certPem = '', keyPem = '', x509 = null;
  try {
    execFileSync(process.execPath, ['server/tls-cert.js', certDir, 'payesh-test'], { cwd: ROOT, stdio: 'pipe' });
    certPem = fs.readFileSync(path.join(certDir, 'tls.crt'), 'utf8');
    keyPem = fs.readFileSync(path.join(certDir, 'tls.key'), 'utf8');
    x509 = new crypto.X509Certificate(certPem);
  } catch (e) { /* checked below */ }
  chk('T1a گواهی ساخته شد و X509Certificate می‌خواند', !!x509);
  const subj = x509 ? (x509.subject || '').replace(/\s+/g, ' ') : '';
  chk('T1b نامِ مشترکِ گواهی درست است (payesh-test)', /payesh-test/.test(subj), subj);
  const notAfter = x509 ? Date.parse(x509.validTo) : 0;
  chk('T1c اعتبار گواهی تا آینده است', notAfter > Date.now() + 365 * 86400000);
  chk('T1d کلیدِ خصوصی PEM است', /PRIVATE KEY-----/.test(keyPem));

  /* T2–T5 — a real https server */
  let port = null, srv = null;
  for (const p of PORTS) {
    srv = spawn(process.execPath, ['server/index.js'], {
      cwd: ROOT,
      env: Object.assign({}, process.env, {
        PORT: String(p), HOST: '127.0.0.1',
        PAYESH_STORE: storeFile, PAYESH_AUDIT: auditFile, PAYESH_KEY: keyFile,
        PAYESH_DEMO_CODE: '1',
        PAYESH_TLS_CERT: path.join(certDir, 'tls.crt'),
        PAYESH_TLS_KEY: path.join(certDir, 'tls.key')
      }),
      stdio: 'ignore'
    });
    const base = 'http://127.0.0.1:' + p;
    // wait for health — but only trust a server whose pid is THIS spawned one
    let okBoot = false;
    for (let i = 0; i < 50; i++) {
      const h = await httpsReq(p, 'GET', '/api/health').then(r => r.json).catch(() => null);
      if (h && h.ok && h.pid === srv.pid) { okBoot = true; break; }
      if (h && h.ok) { console.log('  ! port ' + p + ' squatted by pid ' + h.pid + ' — trying next'); break; }
      await sleep(300);
    }
    if (okBoot) { port = p; break; }
    srv.kill('SIGKILL');
  }
  chk('T2 سرورِ https واقعی بالا آمد و health 200 می‌دهد', port !== null);

  if (port) {
    const health = await httpsReq(port, 'GET', '/api/health', null, null);
    chk('T2b health با https واقعی: 200 + ok:true', health.status === 200 && health.json && health.json.ok === true, String(health.status));
    chk('T3 هدرِ HSTS در https وجود دارد', /max-age=/.test(health.headers['strict-transport-security'] || ''));
    chk('T3b CSP با nonce در https هم سرو می‌شود', /nonce-/.test(health.headers['content-security-policy'] || ''));

    /* login flow over TLS with a cookie jar (a real parent from the store) */
    const su = JSON.parse(fs.readFileSync(storeFile, 'utf8')).users.find((u) => u.role === 'parent');
    const jar = makeJar();
    const send = await httpsReq(port, 'POST', '/api/auth/send-code', { phone: su.phone }, jar);
    chk('T4a send-code: 200 + کدِ دموی بازتاب‌شده', send.status === 200 && send.json && !!send.json.demo_code, send.raw.slice(0, 120));
    const login = await httpsReq(port, 'POST', '/api/auth/login',
      { phone: su.phone, code: String(send.json && send.json.demo_code || ''), national_id: su.national_id }, jar);
    const setc = (login.headers['set-cookie'] || []).join('; ');
    chk('T4b کوکیِ نشست: HttpOnly + SameSite=Lax', /HttpOnly/.test(setc) && /SameSite=Lax/.test(setc), setc.slice(0, 120));
    chk('T4c کوکی در https دارای Secure است', /Secure/.test(setc), setc.slice(0, 120));
    chk('T5a ورود کامل با https می‌شود', login.status === 200 && login.json && login.json.ok === true, login.raw.slice(0, 120));
    const me = await httpsReq(port, 'GET', '/api/auth/me', null, jar);
    chk('T5b /me با کوکیِ https: همان نشست', me.status === 200 && me.json && me.json.ok === true && !!me.json.user, me.raw.slice(0, 120));
    const bell = await httpsReq(port, 'GET', '/api/bell/now', null, jar);
    chk('T5c endpointِ زنگ با https (ok:true + ts عدد + family آرایه)', bell.status === 200 && bell.json && bell.json.ok === true && typeof bell.json.ts === 'number' && Array.isArray(bell.json.family), bell.raw.slice(0, 120));
  }

  /* T6 — broken TLS config must fail to start with a clear message */
  let brokeUp = false;
  const bad = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: Object.assign({}, process.env, {
      PORT: '8944', HOST: '127.0.0.1',
      PAYESH_STORE: storeFile, PAYESH_AUDIT: auditFile, PAYESH_KEY: keyFile,
      PAYESH_TLS_CERT: path.join(tmp, 'missing.crt'),
      PAYESH_TLS_KEY: path.join(tmp, 'missing.key')
    }),
    stdio: 'pipe'
  });
  let errOut = '';
  bad.stderr.on('data', (d) => (errOut += d));
  bad.on('exit', () => {});
  await sleep(2500);
  const alive = !bad.killed && bad.exitCode === null;
  brokeUp = alive;
  bad.kill('SIGKILL');
  chk('T6 گواهیِ غایب = راه‌اندازی شکسته (سرور بالا نمی‌آید)', !brokeUp);
  chk('T6b پیامِ روشن برای گواهیِ غایب', /TLS file missing/.test(errOut), errOut.slice(0, 120));

  if (srv) srv.kill('SIGKILL');
  await sleep(300);
  console.log('\n────────────────────────────────────────────────────────');
  console.log('server4 (TLS واقعی): ' + (okc + failc) + ' بررسی — ✅ ' + okc + ' · ❌ ' + failc);
  if (fails.length) { console.log('شکست‌ها:'); fails.forEach((f) => console.log('  - ' + f)); }
  process.exit(failc ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
