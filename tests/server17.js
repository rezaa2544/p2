#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   server17 — JWT/OTP/TLS (R96, P0-3/4/5 + P1-10)
   ───────────────────────────────────────────────────────────────────
   J1–J11  JWT: iss/aud/iat/exp/tamper/revocation/rotation/weak-key/
           cookie flags — سرورِ 9005 (دو فاز: قبل و بعد از rotation)
   O1–O8   OTP: CSPRNG + hash-only + cooldown + سقف روزانه + IP +
           tries-کِلی + brute-force IP + عدمِ نشتِ کد — سرورِ 9006
           با سقف‌هایِ صریحِ پایین
   T1–T6   TLS/transport: production بی‌گواهی → exit، proxy اعلام‌شده،
           self-signed در production، Secure+HSTS، body-limit 413،
           rotationِ audit
   اجرا: node tests/server17.js   (پورت‌ها: 9005–9009)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const REAL_STORE = path.join(ROOT, 'server', 'data', 'payesh.json');
const { makeSelfSigned } = require(path.join(ROOT, 'server', 'tls-cert.js'));

let pass = 0, fail = 0;
const errors = [];
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; errors.push(name + (extra !== undefined ? ' — ' + String(extra).slice(0, 200) : '')); console.log('  ❌ ' + name + (extra !== undefined ? ' — ' + String(extra).slice(0, 200) : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PORT = 9005, OTP_PORT = 9006;
let tmp = null;
const procs = [];
function spawnServer(env, out) {
  const p = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  p.log = '';
  p.stdout.on('data', (d) => (p.log += d));
  p.stderr.on('data', (d) => (p.log += d));
  procs.push(p);
  return p;
}
process.on('exit', () => {
  for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} }
  try { if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
});

function req(method, port, p, body, cookie, mod) {
  const m = mod || http;
  return new Promise((resolve) => {
    const data = body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const caPath = tmp ? path.join(tmp, 'tls', 'cert.pem') : null;
    const ca = (m === https && caPath && fs.existsSync(caPath)) ? fs.readFileSync(caPath) : undefined;
    const r = m.request({
      hostname: '127.0.0.1', port, path: p, method,
      rejectUnauthorized: false,
      ca,
      headers: Object.assign(
        data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
        cookie ? { Cookie: cookie } : {}
      )
    }, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => {
        let j = null; try { j = JSON.parse(b); } catch (e) {}
        resolve({ status: res.statusCode, json: j, headers: res.headers, text: b });
      });
    });
    r.on('error', () => resolve({ status: 0, json: null, headers: {}, text: '' }));
    if (data) r.write(data);
    r.end();
  });
}

async function bootServer(port, extraEnv) {
  const env = Object.assign({}, process.env, {
    PORT: String(port), HOST: '127.0.0.1',
    PAYESH_STORE: path.join(tmp, 's' + port + '.json'),
    PAYESH_OTP_FILE: path.join(tmp, 'otp-' + port + '.json'), /* R101: هر سرور فایلِ OTP خودش (ایزولاسیون) */
    PAYESH_AUDIT: path.join(tmp, 'a' + port + '.log'),
    PAYESH_KEY: path.join(tmp, 'k' + port + '.key'),
    PAYESH_DEMO_CODE: '1'
  }, extraEnv || {});
  fs.copyFileSync(REAL_STORE, env.PAYESH_STORE);
  const p = spawnServer(env, port);
  const useTls = !!(env.PAYESH_TLS_CERT && env.PAYESH_TLS_KEY);
  for (let i = 0; i < 50; i++) {
    const h = await req('GET', port, '/api/health', null, null, useTls ? https : http);
    if (h.status === 200 && h.json && h.json.ok) {
      if (Number(h.json.pid) === p.pid) return p;
      try { process.kill(Number(h.json.pid)); } catch (e) {} /* سرورِ ماندهٔ اجرایِ پیشین */
    }
    if (p.exitCode !== null) return null;
    await sleep(300);
  }
  return null;
}

/* ساختِ JWT دستی (همان الگوریتم) — برایِ تست‌هایِ منفی */
function craftToken(key, over) {
  const b64u = (b) => Buffer.from(b).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const h = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = b64u(JSON.stringify(Object.assign({
    iss: 'payesh', aud: 'payesh-web', sub: 1, role: 'superadmin', school_id: null,
    iat: now - 10, exp: now + 28800, jti: 'jt_' + crypto.randomBytes(10).toString('hex')
  }, over)));
  const s = b64u(crypto.createHmac('sha256', key).update(h + '.' + p).digest());
  return h + '.' + p + '.' + s;
}

async function login(port, phone, nid, cookieStore) {
  const sc = await req('POST', port, '/api/auth/send-code', { phone });
  const code = sc.json && sc.json.demo_code;
  const lg = await req('POST', port, '/api/auth/login', { phone, code, national_id: nid });
  const setc = lg.headers['set-cookie'];
  const ck = Array.isArray(setc) ? setc[0] : setc;
  cookieStore.ck = ck ? ck.split(';')[0] : null;
  return lg;
}

async function main() {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-s17-'));
  const seed = JSON.parse(fs.readFileSync(REAL_STORE, 'utf8'));
  const SA = seed.users.find(u => u.id === 1);
  const M2 = seed.users.find(u => u.id === 244); /* مدرسهٔ 2 */

  /* ═══ سرورِ اصلی 9005 (سقف‌هایِ بالا برایِ آزادیِ تست) ═══ */
  const mainEnv = {
    PAYESH_SMS_COOLDOWN_S: '0', PAYESH_SMS_DAILY_CAP: '1000000',
    PAYESH_SMS_IP_LIMIT: '1000000', PAYESH_SMS_PHONE_LIMIT: '1000000',
    PAYESH_LOGIN_IP_LIMIT: '1000000', PAYESH_LOGIN_TRIES: '1000000'
  };
  let main = await bootServer(PORT, mainEnv);
  chk('M0 سرورِ 9005 بالا آمد', !!main);
  if (!main) return;

  /* ── J1–J8: اعتبارِ JWT ───────────────────────────────────────── */
  console.log('\n— J: JWT —');
  const jj = {};
  const lg = await login(PORT, String(SA.phone).replace(/[\s\-()]/g, ''), SA.national_id, jj);
  chk('J0 login واقعی → 200 + کوکی', lg.status === 200 && jj.ck, lg.status + ' ' + JSON.stringify(lg.json));
  const meOk = (tok) => req('GET', PORT, '/api/auth/me', null, 'payesh_session=' + tok).then(r => r.status);

  const KEY1 = fs.readFileSync(path.join(tmp, 'k' + PORT + '.key'), 'utf8').trim();
  chk('J1 توکنِ سالم (دستِ سازنده) → 200', (await meOk(craftToken(KEY1, {}))) === 200);
  const good = craftToken(KEY1, {});
  chk('J2 payload دستکاری‌شده → 401', (await meOk(good.slice(0, -8) + 'AAAA.BBBB')) === 401);
  chk('J3 امضایِ جعلی → 401', (await meOk(craftToken(KEY1, {}).slice(0, 36) + 'AAAA.' + craftToken(KEY1, {}).slice(36))) === 401);
  chk('J4 exp گذشته → 401', (await meOk(craftToken(KEY1, { exp: Math.floor(Date.now() / 1000) - 60 }))) === 401);
  chk('J5 iss نادرست → 401', (await meOk(craftToken(KEY1, { iss: 'evil' }))) === 401);
  chk('J6 aud نادرست → 401', (await meOk(craftToken(KEY1, { aud: 'other-app' }))) === 401);
  chk('J7 iat خیلیِ قدیمی (replay) → 401', (await meOk(craftToken(KEY1, { iat: Math.floor(Date.now() / 1000) - 9 * 3600 }))) === 401);
  chk('J8 iat در آینده (clock skew) → 401', (await meOk(craftToken(KEY1, { iat: Math.floor(Date.now() / 1000) + 3600 }))) === 401);

  /* J9: revocation با logout */
  const out = await req('POST', PORT, '/api/auth/logout', {}, jj.ck);
  chk('J9a logout → 200', out.status === 200, out.status);
  chk('J9b کوکیِ پسِ logout → 401 (jti سلب شد)', (await meOk(jj.ck.split('=')[1])) === 401);

  /* J10: flagsِ کوکی */
  const jj2 = {};
  const lg2 = await login(PORT, String(M2.phone).replace(/[\s\-()]/g, ''), M2.national_id, jj2);
  const ckRaw = lg2.headers['set-cookie'];
  const ckStr = Array.isArray(ckRaw) ? ckRaw.join('; ') : String(ckRaw || '');
  chk('J10a HttpOnly', /httponly/i.test(ckStr));
  chk('J10b SameSite=Lax', /samesite=lax/i.test(ckStr));
  chk('J10c Path=/ و Max-Age', /path=\//i.test(ckStr) && /max-age=28800/i.test(ckStr));
  chk('J10d بدونِ Secure در HTTP (صحتِ پرچم‌ها)', !/;\s*secure/i.test(ckStr));

  /* J11: body limit */
  const big = JSON.stringify({ phone: '09999838444', code: '1234', national_id: '1111111111', pad: 'x'.repeat(5000) });
  const rl = await req('POST', PORT, '/api/auth/login', big, null);
  chk('J11 body > 4KB → 413 body_too_large', rl.status === 413 && rl.json && rl.json.code === 'body_too_large', rl.status + ' ' + rl.text.slice(0, 80));

  /* T6: rotationِ audit — فایل را ۱۰.۵MB می‌کنیم */
  const auditMain = path.join(tmp, 'a' + PORT + '.log');
  fs.appendFileSync(auditMain, 'x'.repeat(10.5 * 1024 * 1024) + '\n');
  const jj3 = {};
  await login(PORT, String(SA.phone).replace(/[\s\-()]/g, ''), SA.national_id, jj3);
  await sleep(400);
  chk('T6a audit چرخید: .1 وجود دارد', fs.existsSync(auditMain + '.1'));
  chk('T6b auditِ جدید کوچک است', fs.statSync(auditMain).size < 1024 * 1024, String(fs.statSync(auditMain).size));

  /* J12: rotationِ کلید — سرور با کلیدِ جدید + PREV=قدمی */
  main.kill('SIGKILL');
  await sleep(500);
  const KEY2 = crypto.randomBytes(32).toString('hex');
  const env2 = Object.assign({}, mainEnv, {
    PAYESH_JWT_SECRET: KEY2,
    PAYESH_JWT_SECRET_PREV: KEY1
  });
  const main2 = await bootServer(PORT, env2);
  chk('J12a سرور با کلیدِ جدید بالا آمد', !!main2);
  const oldTok = craftToken(KEY1, { iat: Math.floor(Date.now() / 1000) - 10 });
  chk('J12b توکنِ کلیدِ قدیمی + PREV → 200 (rotation نرم)', (await meOk(oldTok)) === 200);
  const jj4 = {};
  const lg4 = await login(PORT, String(SA.phone).replace(/[\s\-()]/g, ''), SA.national_id, jj4);
  chk('J12c loginِ جدید با کلیدِ جدید → 200', lg4.status === 200);
  /* بدونِ PREV، کلیدِ قدیمی باید مردود باشد */
  main2.kill('SIGKILL');
  await sleep(500);
  const main3 = await bootServer(PORT, Object.assign({}, mainEnv, { PAYESH_JWT_SECRET: KEY2 }));
  chk('J12d کلیدِ قدیمی بدونِ PREV → 401', (await meOk(oldTok)) === 401);
  main3.kill('SIGKILL');
  await sleep(300);

  /* ── T: invariantsِ استارت ────────────────────────────────────── */
  console.log('\n— T: استارت/TLS —');
  {
    /* T1: production بدونِ TLS */
    const t1 = spawnServer(Object.assign({}, process.env, {
      PORT: '9007', HOST: '127.0.0.1', PAYESH_ENV: 'production',
      PAYESH_STORE: path.join(tmp, 't1.json'), PAYESH_OTP_FILE: path.join(tmp, 'otp-t1.json'), PAYESH_AUDIT: path.join(tmp, 't1.log'),
      PAYESH_KEY: path.join(tmp, 't1.key')
    }), 9007);
    fs.copyFileSync(REAL_STORE, path.join(tmp, 't1.json'));
    const code1 = await new Promise((res) => {
      const to = setTimeout(() => res('timeout'), 8000);
      t1.on('exit', (c) => { clearTimeout(to); res(c); });
    });
    chk('T1 production بدونِ TLS/proxy → exit(1)', code1 === 1, 'code=' + code1);
    chk('T1b پیامِ راهنما در log', /production requires TLS/.test(t1.log), t1.log.slice(-160));
  }
  {
    /* T2: production + proxy اعلام‌شده */
    const t2 = await bootServer(9008, Object.assign({}, mainEnv, { PAYESH_ENV: 'production', PAYESH_BEHIND_PROXY: '1', ALLOW_MEMORY_FALLBACK: '1' }));
    chk('T2 production + PAYESH_BEHIND_PROXY=1 → بالا می‌آید', !!t2);
    if (t2) t2.kill('SIGKILL');
  }
  {
    /* T3: production + self-signed → exit(1) (gateِ R85) */
    const ss = makeSelfSigned('payesh.test', new Date(Date.now() - 86400000), new Date(Date.now() + 86400000 * 365));
    fs.writeFileSync(path.join(tmp, 'ss.crt'), ss.certPem);
    fs.writeFileSync(path.join(tmp, 'ss.key'), ss.keyPem);
    const t3 = spawnServer(Object.assign({}, process.env, {
      PORT: '9009', HOST: '127.0.0.1', PAYESH_ENV: 'production',
      PAYESH_TLS_CERT: path.join(tmp, 'ss.crt'), PAYESH_TLS_KEY: path.join(tmp, 'ss.key'),
      PAYESH_STORE: path.join(tmp, 't3.json'), PAYESH_OTP_FILE: path.join(tmp, 'otp-t3.json'), PAYESH_AUDIT: path.join(tmp, 't3.log'),
      PAYESH_KEY: path.join(tmp, 't3.key')
    }), 9009);
    fs.copyFileSync(REAL_STORE, path.join(tmp, 't3.json'));
    const code3 = await new Promise((res) => {
      const to = setTimeout(() => res('timeout'), 8000);
      t3.on('exit', (c) => { clearTimeout(to); res(c); });
    });
    chk('T3 production + self-signed → exit(1)', code3 === 1, 'code=' + code3);
  }
  {
    /* T4: TLS در development → Secure + HSTS */
    await sleep(500);
    const ss4 = makeSelfSigned('payesh.test', new Date(Date.now() - 86400000), new Date(Date.now() + 86400000 * 365));
    fs.mkdirSync(path.join(tmp, 'tls'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'tls', 'cert.pem'), ss4.certPem);
    fs.writeFileSync(path.join(tmp, 'ss.crt'), ss4.certPem);
    fs.writeFileSync(path.join(tmp, 'ss.key'), ss4.keyPem);
    const t4 = await bootServer(9009, Object.assign({}, mainEnv, {
      PAYESH_TLS_CERT: path.join(tmp, 'ss.crt'), PAYESH_TLS_KEY: path.join(tmp, 'ss.key')
    }));
    chk('T4a سرورِ TLS بالا آمد (dev + self-signed)', !!t4);
    if (t4) {
      const j4 = {};
      const sc = await req('POST', 9009, '/api/auth/send-code', { phone: String(SA.phone).replace(/[\s\-()]/g, '') }, null, https);
      const lgt = await req('POST', 9009, '/api/auth/login', { phone: String(SA.phone).replace(/[\s\-()]/g, ''), code: sc.json && sc.json.demo_code, national_id: SA.national_id }, null, https);
      const cks = Array.isArray(lgt.headers['set-cookie']) ? lgt.headers['set-cookie'].join('; ') : String(lgt.headers['set-cookie'] || '');
      chk('T4b کوکیِ TLS دارای Secure', lgt.status === 200 && /;\s*secure/i.test(cks), lgt.status + ' ' + cks.slice(0, 120));
      const ht = await req('GET', 9009, '/api/health', null, null, https);
      chk('T4c هدرِ HSTS روی TLS', !!ht.headers['strict-transport-security'], JSON.stringify(ht.headers['strict-transport-security']));
      t4.kill('SIGKILL');
    }
  }

  /* ── O: OTP — سرورِ 9006 با سقف‌هایِ صریح ─────────────────────── */
  console.log('\n— O: OTP —');
  const otp = await bootServer(OTP_PORT, {
    PAYESH_SMS_COOLDOWN_S: '5', PAYESH_SMS_DAILY_CAP: '5',
    PAYESH_SMS_PHONE_LIMIT: '5', PAYESH_SMS_IP_LIMIT: '10',
    PAYESH_LOGIN_IP_LIMIT: '20', PAYESH_LOGIN_TRIES: '5'
  });
  chk('O0 سرورِ 9006 (سقف‌هایِ سخت) بالا آمد', !!otp);
  if (!otp) return;
  const otpStore = path.join(tmp, 's' + OTP_PORT + '.json');
  const otpAudit = path.join(tmp, 'a' + OTP_PORT + '.log');
  const phone1 = String(SA.phone).replace(/[\s\-()]/g, '');
  const phone2 = String(M2.phone).replace(/[\s\-()]/g, '');

  const s1 = await req('POST', OTP_PORT, '/api/auth/send-code', { phone: phone1 });
  chk('O1a send → 200 sent', s1.status === 200 && s1.json.code === 'sent', JSON.stringify(s1.json));
  const code1 = s1.json.demo_code;
  await sleep(2600); /* persist */
  const storeTxt = fs.readFileSync(otpStore, 'utf8');
  const otpTxt = fs.readFileSync(path.join(tmp, 'otp-' + OTP_PORT + '.json'), 'utf8'); /* R101 */
  chk('O1b کدِ plaintext در store/otp نیست (فقط hash در otp.json)',
    storeTxt.indexOf('"' + code1 + '"') < 0 && otpTxt.indexOf('"' + code1 + '"') < 0
    && /\{[^{}]*"h":"[0-9a-f]{64}"/.test(otpTxt));
  chk('O1c پاسخِ send-code فقط sent/demo_code', s1.json.code === 'sent' && s1.json.demo_code === code1 && Object.keys(s1.json).length === 3, JSON.stringify(s1.json));

  const s1b = await req('POST', OTP_PORT, '/api/auth/send-code', { phone: phone1 });
  chk('O2 cooldown 5s → 429 rate_limited', s1b.status === 429 && s1b.json.code === 'rate_limited', s1b.status + ' ' + JSON.stringify(s1b.json));
  await sleep(5200);
  const s1c = await req('POST', OTP_PORT, '/api/auth/send-code', { phone: phone1 });
  chk('O3 بعد از cooldown → 200', s1c.status === 200, s1c.status);

  const s2 = await req('POST', OTP_PORT, '/api/auth/send-code', { phone: phone2 });
  const code2 = s2.json.demo_code;
  /* phone1: 2 send شده (O1, O3) — 3 تا دیگر تا سقفِ روزانهٔ 5 */
  await sleep(5200);
  const s3 = await req('POST', OTP_PORT, '/api/auth/send-code', { phone: phone1 });
  await sleep(5200);
  const s4 = await req('POST', OTP_PORT, '/api/auth/send-code', { phone: phone1 });
  await sleep(5200);
  const s4b = await req('POST', OTP_PORT, '/api/auth/send-code', { phone: phone1 });
  chk('O4a sendِ پنجمِ phone1 → 200 (آخرِ سقف)', s4b.status === 200, s4b.status);
  await sleep(5200);
  const s5 = await req('POST', OTP_PORT, '/api/auth/send-code', { phone: phone1 });
  chk('O4b sendِ ششمِ phone1 → 429 (سقفِ روزانه)', s5.status === 429, s5.status);

  /* O5: tries — 5 بارِ کدِ نادرست → کد می‌میرد، حتی کدِ درست هم رد */
  for (let i = 0; i < 5; i++) await req('POST', OTP_PORT, '/api/auth/login', { phone: phone2, code: '0000', national_id: M2.national_id });
  const l6 = await req('POST', OTP_PORT, '/api/auth/login', { phone: phone2, code: code2, national_id: M2.national_id });
  chk('O5a بعد از 5 تلاشِ نادرست، کدِ درست هم 401 (کد کِلی شد)', l6.status === 401 && l6.json.code === 'bad_code', JSON.stringify(l6.json));
  await sleep(5200);
  const s6 = await req('POST', OTP_PORT, '/api/auth/send-code', { phone: phone2 });
  const code2b = s6.json.demo_code;
  const l7 = await req('POST', OTP_PORT, '/api/auth/login', { phone: phone2, code: code2b, national_id: M2.national_id });
  chk('O5b sendِ جدید + کدِ درست → 200', l7.status === 200, l7.status);

  /* O6: brute-force IP — login‌هایِ نادرست از یک IP تا rate_limited.
     شمارندهٔ IP از O5 (6 login) شروع می‌شود؛ پس 429 باید حداکثر
     بعد ازِ 15 loginِ دیگر بیاید. 3 تلفن، کدِ ثابتِ غلط؛ چون tries
     کد را می‌کُشد، resend لازم نیست (login بدونِ کد هم 401 است
     و شمارندهٔ IP را بالا می‌برد). */
  const phones = [SA, M2, seed.users.find(u => u.id === 4)];
  let hits429 = -1;
  let tries = 0;
  for (let i = 0; i < 25; i++) {
    const u = phones[i % 3];
    tries++;
    const r = await req('POST', OTP_PORT, '/api/auth/login', { phone: String(u.phone).replace(/[\s\-()]/g, ''), code: '9999', national_id: u.national_id });
    if (r.status === 429) { hits429 = tries; break; }
  }
  chk('O6 brute-force: سقفِ IP (20/10min) login را 429 می‌کند', hits429 > 0 && hits429 <= 15, '429 در تلاشِ ' + hits429 + ' (بعد از 6 تلاشِ O5)');

  /* O7: نشتِ کد — audit + store */
  await sleep(600);
  const auditTxt = fs.existsSync(otpAudit) ? fs.readFileSync(otpAudit, 'utf8') : '';
  const allCodes = [code1, code2, code2b].filter(Boolean);
  const leak = allCodes.filter(c => auditTxt.indexOf(c) > -1 || fs.readFileSync(otpStore, 'utf8').indexOf('"' + c + '"') > -1).length;
  chk('O7a هیچ کدی در audit یا store نیست', leak === 0);
  chk('O7b audit: send_code فقط user_id/role', /"type":"send_code"/.test(auditTxt) && !/"code"\s*:\s*"\d{4,6}"/.test(auditTxt)); /* R101: نگهبانِ نشت شامل ۶ رقمی */
  chk('O7c logِ سرور: نشتِ کد ندارد', !otp.log || !allCodes.some(c => otp.log.indexOf(c) > -1));

  /* O8: shape برابرِ تلفنِ موجود/ناموجود (بدونِ demo echo — سرورِ جدا) */
  otp.kill('SIGKILL');
  await sleep(400);
  {
    const env = Object.assign({}, process.env, {
      PORT: '9007', HOST: '127.0.0.1',
      PAYESH_STORE: path.join(tmp, 'o8.json'), PAYESH_OTP_FILE: path.join(tmp, 'otp-o8.json'), PAYESH_AUDIT: path.join(tmp, 'o8.log'),
      PAYESH_KEY: path.join(tmp, 'o8.key')
    });
    fs.copyFileSync(REAL_STORE, env.PAYESH_STORE);
    const o8 = spawnServer(env, 9007);
    let up = false;
    for (let i = 0; i < 40; i++) {
      const h = await req('GET', 9007, '/api/health');
      if (h.status === 200) { up = true; break; }
      await sleep(300);
    }
    chk('O8a سرورِ بدونِ DEMO_CODE بالا آمد', up);
    if (up) {
      const rKnown = await req('POST', 9007, '/api/auth/send-code', { phone: phone1 });
      const rUnk = await req('POST', 9007, '/api/auth/send-code', { phone: '09000000000' });
      chk('O8b موجود: 200 {ok,code:sent} بدونِ echo', rKnown.status === 200 && rKnown.json.code === 'sent' && !rKnown.json.demo_code, JSON.stringify(rKnown.json));
      chk('O8c ناموجود: همانِ shape (بدونِ 404 — enum guard)', rUnk.status === 200 && JSON.stringify(rUnk.json) === JSON.stringify(rKnown.json), JSON.stringify(rUnk.json));
      o8.kill('SIGKILL');
    }
  }
  /* ── S: R96 P0-5 — validatorِ صریحِ /api/sms/send ──────────────── */
  console.log('\n— S: SMS validator —');
  {
    const env = Object.assign({}, process.env, {
      PORT: '9007', HOST: '127.0.0.1',
      PAYESH_STORE: path.join(tmp, 's.json'), PAYESH_OTP_FILE: path.join(tmp, 'otp-s.json'), PAYESH_AUDIT: path.join(tmp, 's.log'),
      PAYESH_KEY: path.join(tmp, 's.key'), PAYESH_DEMO_CODE: '1'
    });
    fs.copyFileSync(REAL_STORE, env.PAYESH_STORE);
    const s7 = spawnServer(env, 9007);
    let up = false;
    for (let i = 0; i < 40; i++) {
      const h = await req('GET', 9007, '/api/health');
      if (h.status === 200) { up = true; break; }
      await sleep(300);
    }
    chk('S0 سرورِ 9007 (SMS) بالا آمد', up);
    if (up) {
      const ss = {};
      await login(9007, phone1, SA.national_id, ss);
      const b1 = await req('POST', 9007, '/api/sms/send', { queue_ids: [1, 'x'] }, ss.ck);
      chk('S1 queue_idsِ غیرِ صحیح → 400 bad_batch', b1.status === 400 && b1.json.code === 'bad_batch', b1.status + ' ' + JSON.stringify(b1.json));
      const b2 = await req('POST', 9007, '/api/sms/send', { queue_ids: 5 }, ss.ck);
      chk('S2 queue_idsِ غیرآرایه → 400 bad_batch', b2.status === 400 && b2.json.code === 'bad_batch', b2.status + ' ' + JSON.stringify(b2.json));
      const b3 = await req('POST', 9007, '/api/sms/send', { queue_ids: [1], phone: '09999838444' }, ss.ck);
      chk('S3 فیلدِ ناشناس (phone) → 400 unknown_field (تزریقِ رد)', b3.status === 400 && b3.json.code === 'unknown_field' && b3.json.field === 'phone', b3.status + ' ' + JSON.stringify(b3.json));
      const b4 = await req('POST', 9007, '/api/sms/send', { queue_ids: [] }, ss.ck);
      chk('S4 آرایهٔ خالی → 400 empty_batch', b4.status === 400 && b4.json.code === 'empty_batch', b4.status + ' ' + JSON.stringify(b4.json));
      const b5 = await req('POST', 9007, '/api/sms/send', { queue_ids: [1] }, ss.ck);
      chk('S5 بدنهٔ معتبر → validation رد شد (503ِ provider، نه 400)', b5.status === 503 && b5.json.code === 'sms_not_configured', b5.status + ' ' + JSON.stringify(b5.json));
      const mm = {};
      await login(9007, phone2, M2.national_id, mm);
      const b6 = await req('POST', 9007, '/api/sms/send', { queue_ids: [1] }, mm.ck);
      chk('S6 مدیر → 403 forbidden (فقطِ superadmin)', b6.status === 403 && b6.json.code === 'forbidden', b6.status + ' ' + JSON.stringify(b6.json));
      const b7 = await req('POST', 9007, '/api/sms/send', { queue_ids: [1] }, null);
      chk('S7 بدونِ کوکی → 401', b7.status === 401, b7.status);
      s7.kill('SIGKILL');
      await sleep(300);
    }
  }
  /* ── E: R97 (TODO 2.7) — نگهبانِ شمردنِ شناسه (سطحِ روتر) ───────── */
  console.log('\n— E: enumeration guard —');
  {
    const env = Object.assign({}, process.env, {
      PORT: '9007', HOST: '127.0.0.1',
      PAYESH_STORE: path.join(tmp, 'e.json'), PAYESH_OTP_FILE: path.join(tmp, 'otp-e.json'), PAYESH_AUDIT: path.join(tmp, 'e.log'),
      PAYESH_KEY: path.join(tmp, 'e.key'), PAYESH_DEMO_CODE: '1',
      PAYESH_SMS_COOLDOWN_S: '0',
      PAYESH_ENUM_WARN: '5', PAYESH_ENUM_SLOW1: '8',
      PAYESH_ENUM_SLOW2: '12', PAYESH_ENUM_REVOKE: '15'
    });
    fs.copyFileSync(REAL_STORE, env.PAYESH_STORE);
    const e7 = spawnServer(env, 9007);
    let up = false;
    for (let i = 0; i < 40; i++) {
      const h = await req('GET', 9007, '/api/health');
      if (h.status === 200) { up = true; break; }
      await sleep(300);
    }
    chk('E0 سرورِ 9007 (enum) بالا آمد', up);
    if (up) {
      const em = {};
      const lgE = await login(9007, phone2, M2.national_id, em);
      const tick = async (p) => { const a = Date.now(); await req('GET', 9007, p, null, em.ck); return Date.now() - a; };
      for (let i = 0; i < 3; i++) await tick('/api/students/9990' + i);
      const aud0 = fs.readFileSync(env.PAYESH_AUDIT, 'utf8');
      chk('E1 رد‌هایِ کم (3) → هنوز هشدارِ enum ندارد', aud0.indexOf('enum_warn') === -1, aud0.split('\n').filter(l => l.indexOf('enum') > -1).length);
      for (let i = 0; i < 2; i++) await tick('/api/students/9981' + i); /* n=5 = WARN */
      const aud1 = fs.readFileSync(env.PAYESH_AUDIT, 'utf8');
      chk('E2 n=5 → آدیتِ enum_warn', aud1.indexOf('enum_warn') > -1);
      for (let i = 0; i < 3; i++) await tick('/api/students/9972' + i); /* n=8 = SLOW1 */
      const d1 = await tick('/api/bell/now');
      chk('E3 n=8 (SLOW1) → درخواستِ بعدی ≥500ms', d1 >= 480, d1 + 'ms');
      for (let i = 0; i < 4; i++) await tick('/api/students/9963' + i); /* n=12 = SLOW2 */
      const d2 = await tick('/api/bell/now');
      chk('E4 n=12 (SLOW2) → درخواستِ بعدی ≥2s', d2 >= 1900, d2 + 'ms');
      for (let i = 0; i < 3; i++) await tick('/api/students/9954' + i); /* n=15 = REVOKE */
      const me = await req('GET', 9007, '/api/auth/me', null, em.ck);
      chk('E5 n=15 (REVOKE) → نشست ابطال شد (/me = 401)', me.status === 401, me.status + ' ' + JSON.stringify(me.json));
      const audF = fs.readFileSync(env.PAYESH_AUDIT, 'utf8');
      chk('E6 آدیت: enum_slow + enum_slow2 + enum_revoke ثبت شد',
        audF.indexOf('enum_slow') > -1 && audF.indexOf('enum_slow2') > -1 && audF.indexOf('enum_revoke') > -1);
      e7.kill('SIGKILL');
      await sleep(300);
    }
  }
  console.log('\n— F: field-level authorization (R98) —');
  {
    const env = Object.assign({}, process.env, {
      PORT: '9010', HOST: '127.0.0.1',
      PAYESH_STORE: path.join(tmp, 'f.json'), PAYESH_OTP_FILE: path.join(tmp, 'otp-f.json'), PAYESH_AUDIT: path.join(tmp, 'f.log'),
      PAYESH_KEY: path.join(tmp, 'f.key'), PAYESH_DEMO_CODE: '1',
      PAYESH_SMS_COOLDOWN_S: '0'
    });
    fs.copyFileSync(REAL_STORE, env.PAYESH_STORE);
    const f10 = spawnServer(env, 9010);
    let up = false;
    for (let i = 0; i < 40; i++) {
      const h = await req('GET', 9010, '/api/health');
      if (h.status === 200) { up = true; break; }
      await sleep(300);
    }
    chk('F0 سرورِ 9010 (fields) بالا آمد', up);
    if (up) {
      const T1 = seed.users.find(u => u.id === 4);  /* teacher، مدرسهٔ 1 */
      const M1 = seed.users.find(u => u.id === 2);  /* manager، مدرسهٔ 1 */
      const mt = {}, mm = {};
      await login(9010, String(T1.phone).replace(/[\s\-()]/g, ''), T1.national_id, mt);
      await login(9010, String(M1.phone).replace(/[\s\-()]/g, ''), M1.national_id, mm);
      let fSeq = 0;
      const opX = (over) => Object.assign({ uid: 'f' + (++fSeq) + crypto.randomBytes(2).toString('hex'), at: new Date().toISOString() }, over);
      const sync = (ck, ops) => req('POST', 9010, '/api/sync', { ops }, ck);

      /* F1 — مدیر نوتیفیکاسیون برایِ دبیر می‌سازد (user_id مالِ مدیریت) */
      const r1 = await sync(mm.ck, [opX({ by: 2, c: 'notifications', t: 'ins', data: { user_id: 4, school_id: 1, type: 'announcement', title: 'F-notice', body: 'b' } })]);
      const res1 = r1.json && r1.json.results && r1.json.results[0];
      chk('F1 manager ins notifications (user_id) → ok', r1.status === 200 && res1 && res1.ok === true, JSON.stringify(r1.json));
      await sleep(2600); /* persist تا store رویِ فایِل بنشیند */
      const fs1 = JSON.parse(fs.readFileSync(env.PAYESH_STORE, 'utf8'));
      const nt = (fs1.notifications || []).find(x => x.title === 'F-notice');

      /* F2 — دبیر همان رکورد را با user_id می‌فرستد → field_denied (per-op) */
      if (nt) {
        const r2 = await sync(mt.ck, [opX({ id: nt.id, by: 4, c: 'notifications', t: 'upd', data: { read: 1, user_id: 16 } })]);
        const res2 = r2.json && r2.json.results && r2.json.results[0];
        chk('F2 teacher upd notifications (user_id) → field_denied', r2.status === 200 && res2 && res2.ok === false && res2.code === 'field_denied', JSON.stringify(r2.json));
        await sleep(2600); /* persist */
        const fs2 = JSON.parse(fs.readFileSync(env.PAYESH_STORE, 'utf8'));
        const nt2 = (fs2.notifications || []).find(x => x.id === nt.id);
        chk('F3 store دست‌نخورده: user_id=4 و read اعمال نشد (inject نشد)', nt2 && nt2.user_id === 4 && nt2.read !== 1, JSON.stringify(nt2));

        /* F4 — مسیرِ مشروع: teacher فقط read → ok */
        const r4 = await sync(mt.ck, [opX({ id: nt.id, by: 4, c: 'notifications', t: 'upd', data: { read: 1 } })]);
        const res4 = r4.json && r4.json.results && r4.json.results[0];
        chk('F4 teacher upd notifications (read) → ok', r4.status === 200 && res4 && res4.ok === true, JSON.stringify(r4.json));
      }

      /* F5 — roleِ دامنه‌ای (exam_duties) برایِ مدیر → ok */
      const r5 = await sync(mm.ck, [opX({ by: 2, c: 'exam_duties', t: 'ins', data: { exam_id: 1, teacher_id: 4, role: 'proctor', school_id: 1 } })]);
      const res5 = r5.json && r5.json.results && r5.json.results[0];
      chk('F5 manager ins exam_duties (role دامنه‌ای) → ok', r5.status === 200 && res5 && res5.ok === true, JSON.stringify(r5.json));

      /* F6 — roleِ دامنه‌ای برایِ دبیر → field_denied (با idِ رکوردِ F1) */
      const r6b = nt ? await sync(mt.ck, [opX({ id: nt.id, by: 4, c: 'notifications', t: 'upd', data: { read: 1, role: 'student' } })]) : { json: null };
      const res6b = r6b.json && r6b.json.results && r6b.json.results[0];
      chk('F6 teacher upd notifications (role) → field_denied', r6b.status === 200 && res6b && res6b.ok === false && res6b.code === 'field_denied', JSON.stringify(r6b.json));

      const audF = fs.readFileSync(env.PAYESH_AUDIT, 'utf8');
      chk('F7 آدیت: sync_field_gate با field_denied ثبت شد', audF.indexOf('sync_field_gate') > -1 && audF.indexOf('field_denied') > -1);
      f10.kill('SIGKILL');
      await sleep(300);
    }
  }
  console.log('\n' + '─'.repeat(52));
  console.log(`server17: ${pass} سبز / ${fail} قرمز` + (fail ? ' ❌' : ' ✅'));
  errors.slice(0, 10).forEach(e => console.log('   ' + e));
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
