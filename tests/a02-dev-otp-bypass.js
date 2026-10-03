#!/usr/bin/env node
/* A-02 — Secure DEV_OTP_BYPASS predicate (P1)
 *
 * Regression suite: the dev OTP bypass must be an EXPLICIT opt-in.
 * Previously the predicate was `!IS_PROD && PAYESH_DEV_OTP_BYPASS !== '0'`,
 * which turned the bypass ON for every non-production deployment
 * (NODE_ENV unset + PAYESH_ENV unset) and accepted any value other than
 * the literal "0". Only `PAYESH_DEV_OTP_BYPASS=1` may enable it now.
 *
 * Cases A-I from the mission spec + empty/"yes" extra cases. Each case
 * loads a FRESH server/auth module instance because the predicate is
 * evaluated at module scope, and the env stays in place for the request
 * itself (apiSendCode re-derives isProd per request for the demo echo).
 *
 * Two independent signals per case, so a harness that silently drops the
 * response cannot produce a false green:
 *   1. send-code → demo_code === '0000' only when the bypass is ON
 *   2. login with '0000'  → 200 only when the bypass is ON
 */
'use strict';

const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const SERVER = path.join(ROOT, 'server');

/* جهش‌کشی (A02_MUTATE=VULN): کد را به predicateِ آسیب‌پذیرِ پیش از fix
 * برمی‌گرداند — این شاخه باید این suite را قرمز کند (negative-test proof).
 * 🔴 الگوی p06/p11: جهش روی یک کپی نوشته می‌شود، هرگز روی خودِ auth.js؛
 * مسیر با resolve + بررسیِ مالکیت حل می‌شود و require همیشه literal ایستاست. */
const MUT = process.env.A02_MUTATE || '';
let AUTH_PATH, AUTH_RESOLVED;
if (MUT) {
  const p = path.resolve(SERVER, 'auth.a02-mutated.js');
  if (path.dirname(p) !== SERVER) throw new Error('a02: mutated path escapes server/');
  const M = {
    VULN: [
      "const DEV_OTP_BYPASS = !IS_PROD && process.env.PAYESH_DEV_OTP_BYPASS === '1';",
      "const DEV_OTP_BYPASS = !IS_PROD && process.env.PAYESH_DEV_OTP_BYPASS !== '0';",
    ],
  };
  if (!M[MUT]) { console.error('جهش ناشناخته:', MUT); process.exit(2); }
  const live = fs.readFileSync(path.join(SERVER, 'auth.js'), 'utf8');
  if (live.split(M[MUT][0]).length - 1 !== 1) { console.error('الگوی جهش مچ نشد:', MUT); process.exit(2); }
  fs.writeFileSync(p, live.replace(M[MUT][0], M[MUT][1]));
  console.log('[mutated]', MUT, '→', 'auth.a02-mutated.js');
  process.on('exit', () => { try { fs.unlinkSync(p); } catch (_) {} });
  AUTH_PATH = require.resolve('../server/auth.a02-mutated.js');
} else {
  AUTH_PATH = require.resolve('../server/auth.js');
}
AUTH_RESOLVED = AUTH_PATH;

/* Keys that feed the predicate. */
const PREDICATE_KEYS = ['NODE_ENV', 'PAYESH_ENV', 'PAYESH_DEV_OTP_BYPASS'];

/* The module reads other PAYESH_* vars at load; keep the ones a plain
 * file-mode load needs (limits relaxed so send-code never rate-limits). */
const BASE_ENV = {
  PAYESH_SMS_IP_LIMIT: '1000000',
  PAYESH_SMS_PHONE_LIMIT: '1000000',
  PAYESH_LOGIN_IP_LIMIT: '1000000',
  PAYESH_LOGIN_PHONE_LIMIT: '1000000',
  PAYESH_SMS_DAILY_CAP: '1000000',
  PAYESH_SMS_COOLDOWN_S: '0',
};

const USERS = [
  { id: 3, role: 'manager', school_id: 1, national_id: '0011111111', active: true, full_name: 'مدیر', phone: '09123456789' },
];

/* ── helpers (same shape as p11-phone-auth: apiSendCode/apiLogin on the
 *    object returned by createAuth, raw writeHead/end response mock) ── */
function mkOtp(){
  const data = { cd: {}, codes: {}, login_fail: {} };
  return {
    data,
    save: async () => {},
    reloadIfChanged: async () => {},
    deleteCode: (ph) => { delete data.codes[ph]; },
  };
}
function mkCtx(){
  return {
    store: { users: JSON.parse(JSON.stringify(USERS)), schools: [], __revoked_jti: {} },
    db: null,
    JWT_SECRET: 'a02-test-secret-0123456789-0123456789-0123456789',
    SESSION_NAME: 'sid',
    SESSION_TTL_S: 3600,
    CODE_TTL_MS: 10 * 60 * 1000,
    DEMO_CODE_ECHO: true,
    audit: () => {},
    isHttps: () => false,
    markDirty: () => {},
    otp: mkOtp(),
  };
}
function mkRes(){
  const res = { headers: {}, statusCode: null, body: null };
  res.writeHead = (code) => { res.statusCode = code; };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.end = (b) => { res.body = b ? JSON.parse(b) : null; };
  return res;
}
const mkReq = () => ({ socket: { remoteAddress: '127.0.0.1' }, headers: {} });

async function sendCode(auth, phone){
  const res = mkRes();
  await auth.apiSendCode(mkReq(), res, { phone });
  return res;
}
async function login(auth, phone, code, nid){
  const res = mkRes();
  await auth.apiLogin(mkReq(), res, { phone, code, national_id: nid });
  return res;
}

/* Fresh module per case (the predicate is module-scoped). The env stays
 * applied for the request itself; restore() puts it back afterwards. */
function loadFreshAuth(overrides){
  delete require.cache[AUTH_RESOLVED];

  const saved = {};
  for (const k of PREDICATE_KEYS){ saved[k] = process.env[k]; delete process.env[k]; }
  for (const k of Object.keys(overrides || {})){
    if (overrides[k] === undefined) continue;
    process.env[k] = overrides[k];
  }
  const auth = require(AUTH_PATH).createAuth(mkCtx());
  return {
    auth,
    restore(){
      for (const k of PREDICATE_KEYS) delete process.env[k];
      for (const k of Object.keys(saved)) process.env[k] = saved[k];
    },
  };
}

let pass = 0, fail = 0;
const failures = [];
function chk(name, cond, extra){
  if(cond){ pass++; console.log('  ✅', name); }
  else { fail++; failures.push(name + (extra ? ' :: ' + extra : '')); console.log('  ❌', name, extra ? ':: ' + extra : ''); }
}

/* One case = both signals, so a dropped/garbled response fails at least
 * one assertion instead of looking like a clean OFF. login() is wrapped
 * because reaching setSessionCookie (only possible when the bypass
 * accepted 0000) can throw REVOCATION_UNAVAILABLE under a DATABASE_URL
 * deployment — that throw is itself evidence the bypass fired. */
async function runCase(label, overrides, expectOn, extraEnv){
  const box = loadFreshAuth(overrides);
  try {
    if (extraEnv) for (const k of Object.keys(extraEnv)) process.env[k] = extraEnv[k];
    const sc = await sendCode(box.auth, '09123456789');
    const echoed = (sc.body && sc.body.demo_code) || '';
    let lg = null, loginErr = null;
    try {
      lg = await login(box.auth, '09123456789', '0000', '0011111111');
    } catch (e) {
      loginErr = e;
    }
    const loginOk = !loginErr && lg.statusCode === 200 && lg.body && lg.body.ok === true;
    const evidence = loginErr
      ? 'login threw ' + (loginErr.code || loginErr.message)
      : 'status=' + lg.statusCode + ' body=' + JSON.stringify(lg.body).slice(0, 120);
    if (expectOn) {
      chk(label + ' — send-code کد 0000 می‌دهد', echoed === '0000', 'demo_code=' + echoed + ' status=' + sc.statusCode);
      chk(label + ' — ورود با 0000 پذیرفته می‌شود', loginOk, evidence);
    } else {
      chk(label + ' — send-code کد 0000 نمی‌دهد', echoed !== '0000', 'demo_code=' + echoed);
      chk(label + ' — ورود با 0000 رد می‌شود', !loginOk, evidence);
    }
  } finally {
    if (extraEnv) for (const k of Object.keys(extraEnv)) delete process.env[k];
    box.restore();
  }
}

(async function main(){
  for (const k of Object.keys(BASE_ENV)) if (process.env[k] === undefined) process.env[k] = BASE_ENV[k];
  /* این suite در حالتِ فایل (file-mode) اجرا می‌شود؛ DATABASE_URL/REDIS_URL
     محیطِ اطراف نباید روی آن سایه بیندازد. سناریوی C خودش DATABASE_URL را
     به‌صورتِ صریح اضافه می‌کند. */
  delete process.env.DATABASE_URL;
  delete process.env.REDIS_URL;

  console.log('\nA-02 — Secure DEV_OTP_BYPASS predicate\n');

  /* ── source-level guard ── */
  const src = fs.readFileSync(AUTH_PATH, 'utf8');
  chk('source: predicate فقط با مقدار ۱ روشن می‌شود',
      src.indexOf("process.env.PAYESH_DEV_OTP_BYPASS === '1'") !== -1);
  chk('source: پیش‌فرضِ ناامنِ !IS_PROD حذف شده',
      src.indexOf('PAYESH_DEV_OTP_BYPASS !== \'0\'') === -1);
  chk('source: گاردِ production همچنان وجود دارد',
      src.indexOf('NODE_ENV === \'production\'') !== -1 &&
      src.indexOf('PAYESH_ENV === \'production\'') !== -1);

  /* ── A) NODE_ENV=production → OFF (حتی با bypass=1) ── */
  await runCase('A) NODE_ENV=production + bypass=1 → OFF', { NODE_ENV: 'production', PAYESH_DEV_OTP_BYPASS: '1' }, false);

  /* ── B) PAYESH_ENV=production → OFF ── */
  await runCase('B) PAYESH_ENV=production + bypass=1 → OFF', { PAYESH_ENV: 'production', PAYESH_DEV_OTP_BYPASS: '1' }, false);

  /* ── C) NODE_ENV unset + PAYESH_ENV unset + DATABASE_URL → OFF
   *     (این سناریوی خطرناکِ A-02 بود: دیتابیس واقعی ولی bypass روشن) ── */
  await runCase('C) NODE_ENV/PAYESH_ENV unset + DATABASE_URL → OFF', {}, false, { DATABASE_URL: 'postgres://localhost/payesh' });

  /* ── D) هر سه unset → OFF ── */
  await runCase('D) هر سه unset → OFF', {}, false);

  /* ── E) =0 → OFF ── */
  await runCase('E) PAYESH_DEV_OTP_BYPASS=0 → OFF', { PAYESH_DEV_OTP_BYPASS: '0' }, false);

  /* ── F) =1 → ON (تنها مقدارِ فعال‌کننده) ── */
  await runCase('F) PAYESH_DEV_OTP_BYPASS=1 → ON', { PAYESH_DEV_OTP_BYPASS: '1' }, true);

  /* ── G) =false → OFF ── */
  await runCase('G) PAYESH_DEV_OTP_BYPASS=false → OFF', { PAYESH_DEV_OTP_BYPASS: 'false' }, false);

  /* ── H) =true → OFF (رشتهٔ truthy نباید فعال کند) ── */
  await runCase('H) PAYESH_DEV_OTP_BYPASS=true → OFF', { PAYESH_DEV_OTP_BYPASS: 'true' }, false);

  /* ── I) =random → OFF ── */
  await runCase('I) PAYESH_DEV_OTP_BYPASS=random → OFF', { PAYESH_DEV_OTP_BYPASS: 'random' }, false);

  /* ── X1) رشتهٔ خالی → OFF ── */
  await runCase('X1) PAYESH_DEV_OTP_BYPASS="" → OFF', { PAYESH_DEV_OTP_BYPASS: '' }, false);

  /* ── X2) =yes → OFF ── */
  await runCase('X2) PAYESH_DEV_OTP_BYPASS=yes → OFF', { PAYESH_DEV_OTP_BYPASS: 'yes' }, false);

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if(fail){
    console.log('FAILURES:');
    failures.forEach((f) => console.log('  - ' + f));
    process.exit(1);
  }
  console.log('A-02 ALL GREEN');
})().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(2); });
