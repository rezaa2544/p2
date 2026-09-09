#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   دور ۷۳ — پایش امنیتیِ سرور (audit senior) — توستِ زنده
   S-73-1  restore نمی‌تواند نشستِ log-out شده را زنده کند
           (و stateِ rate-limit را ریست نکند)
   S-73-2  send-code: پاسخِ یک‌شکل برای شمارهٔ ناشناخته (رقابتِ
           phone-enumeration مسدود) + rate-limit پیش از بررسیِ وجود
   S-73-3  فایل‌های store/backup/audit با mode 0600 (PII)
   S-73-4  X-Forwarded-Proto فقط در حالتِ proxyِ اعلام‌شده معتبر است
   S-73-5  مقایسهٔ nid ثابت‌زمان (بازگشتِ رفتاری)
   S-73-7  delete-account: لینک‌های parent→student هم پاک می‌شوند
   اجرا: node tests/security2.js   (پورت 8995)
   ═══════════════════════════════════════════════════════════════════ */
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

function httpReq(port, method, p, body, cookie, extraHeaders) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = Object.assign({ 'Content-Type': 'application/json' }, extraHeaders || {});
    if (cookie) headers['Cookie'] = cookie;
    if (cookie && CSRF_JAR[cookie] && !headers['X-CSRF-Token']) headers['X-CSRF-Token'] = CSRF_JAR[cookie];
    const req = http.request({ hostname: '127.0.0.1', port, path: p, method, headers }, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => {
        let j = null; try { j = JSON.parse(b); } catch (e) {}
        resolve({ status: res.statusCode, headers: res.headers, json: j, raw: b, setCookie: res.headers['set-cookie'] });
      });
    });
    req.on('error', () => resolve({ status: 0, headers: {}, json: null, raw: '', setCookie: undefined }));
    if (data) req.write(data);
    req.end();
  });
}
const CSRF_JAR = {}; /* F-CSRF-01: نگاشتِ نشست ← توکن (تزریقِ خودکار) */
function cookieOf(r){ const sc = r.setCookie; if(!sc) return null; const m = String(Array.isArray(sc) ? sc[0] : sc).match(/payesh_session=[^;]*/); const ck = m ? m[0] : null; const cm = String(Array.isArray(sc) ? sc.join(';') : sc).match(/csrf_token=([^;]+)/); if(ck && cm) CSRF_JAR[ck] = cm[1]; return ck; }

async function login(port, phone, nid, wrongNid) {
  const sc = await httpReq(port, 'POST', '/api/auth/send-code', { phone });
  if (sc.status !== 200 || !sc.json || !sc.json.demo_code) return { ok: false, why: 'send-code', r: sc };
  const useNid = wrongNid || nid;
  const lg = await httpReq(port, 'POST', '/api/auth/login', { phone, code: sc.json.demo_code, national_id: useNid });
  return { ok: lg.status === 200 && lg.json && lg.json.ok, r: lg, cookie: cookieOf(lg) };
}

async function main() {
  console.log('\n▸ دور ۷۳ — پایش امنیتیِ سرور (زنده)');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payesh-sec2-'));
  process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} });
  const storeFile = path.join(tmp, 'payesh.json');
  fs.copyFileSync(path.join(ROOT, 'server/data/payesh.json'), storeFile);
  const keyFile = path.join(tmp, 'jwt.key');
  const auditFile = path.join(tmp, 'audit.log');
  const src = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  const SA = src.users.find(u => u.role === 'superadmin');
  const T  = src.users.find(u => u.username === 'teacher1_1');
  const ST = src.users.find(u => u.id === 16);
  const P  = src.users.find(u => u.id === 17);
  const UNKNOWN = '09990000001';

  let port = null, srv = null;
  for (const p of [8995, 8998]) {
    const s = spawn(process.execPath, ['server/index.js'], {
      cwd: ROOT,
      env: Object.assign({}, process.env, {
        PORT: String(p), HOST: '127.0.0.1',
        PAYESH_STORE: storeFile, PAYESH_AUDIT: auditFile, PAYESH_KEY: keyFile, PAYESH_DEMO_CODE: '1',
        /* R96: S2/S1 سقفِ تلفن (۵/۱۰ دقیقه — پیش ازِ چکِ وجود) را می‌سنجد؛
           cooldown و سقفِ IP برایِ آزادیِ بقیهٔ تست‌ها بالا */
        PAYESH_SMS_COOLDOWN_S: '0', PAYESH_SMS_DAILY_CAP: '1000000',
        PAYESH_SMS_PHONE_LIMIT: '5', PAYESH_SMS_IP_LIMIT: '1000000',
        PAYESH_LOGIN_IP_LIMIT: '1000000', PAYESH_LOGIN_TRIES: '1000000'
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
  chk('P0 سرور بالا آمد', port !== null);
  if (port === null) { console.log('  ⚠ بدون سرور'); process.exit(1); }

  /* ── S-73-4: X-Forwarded-Proto از کلاینتِ مستقیم بی‌اعتبار ── */
  const xfp = await httpReq(port, 'GET', '/', null, null, { 'x-forwarded-proto': 'https' });
  chk('S4-A اسپُف XFP: HSTS صادر نمی‌شود (بدون proxyِ اعلام‌شده)', !xfp.headers['strict-transport-security'], JSON.stringify(xfp.headers['strict-transport-security']));
  const scT = await httpReq(port, 'POST', '/api/auth/send-code', { phone: T.phone });
  const lgT0 = await httpReq(port, 'POST', '/api/auth/login', { phone: T.phone, code: scT.json.demo_code, national_id: T.national_id }, null, { 'x-forwarded-proto': 'https' });
  chk('S4-B اسپُف XFP: کوکیِ Secure نمی‌شود', !(lgT0.setCookie || '').includes('Secure'), String(lgT0.setCookie));

  /* ── S-73-2: بدون نشتِ وجودِ حساب + rate-limit روی ناشناخته ── */
  const unk1 = await httpReq(port, 'POST', '/api/auth/send-code', { phone: UNKNOWN });
  chk('S2-A شمارهٔ ناشناخته: 200 + شکلِ یک‌جانبه (نه 404/no_account)', unk1.status === 200 && unk1.json && unk1.json.ok === true && unk1.json.code === 'sent' && !unk1.json.demo_code, unk1.raw);
  const unk2 = await httpReq(port, 'POST', '/api/auth/send-code', { phone: UNKNOWN });
  const unk3 = await httpReq(port, 'POST', '/api/auth/send-code', { phone: UNKNOWN });
  const unk4 = await httpReq(port, 'POST', '/api/auth/send-code', { phone: UNKNOWN });
  const unk5 = await httpReq(port, 'POST', '/api/auth/send-code', { phone: UNKNOWN });
  chk('S2-B پنج ارسالِ اولِ ناشناخته: 200', [unk1, unk2, unk3, unk4, unk5].every(r => r.status === 200), [unk1, unk2, unk3, unk4, unk5].map(r => r.status).join(','));
  const unk6 = await httpReq(port, 'POST', '/api/auth/send-code', { phone: UNKNOWN });
  chk('S2-C ششم: 429 rate_limited (ناشناخته هم حد دارد)', unk6.status === 429 && unk6.json && unk6.json.code === 'rate_limited', unk6.raw);
  const lgUnknown = await httpReq(port, 'POST', '/api/auth/login', { phone: UNKNOWN, code: '1234', national_id: '1234567890' });
  chk('S2-D لاگین با شمارهٔ ناشناخته: 401 (بدون crash)', lgUnknown.status === 401, lgUnknown.raw);

  /* ── لاگین‌های پایه ── */
  const SA2 = await login(port, SA.phone, SA.national_id);
  const T2  = await login(port, T.phone, T.national_id);
  const ST2 = await login(port, ST.phone, ST.national_id);
  const P2  = await login(port, P.phone, P.national_id);
  chk('C1 چهار حساب (superadmin/teacher/student/parent) وارد می‌شوند',
      SA2.ok && T2.ok && ST2.ok && P2.ok && SA2.cookie && T2.cookie && ST2.cookie && P2.cookie,
      [SA2.ok, T2.ok, ST2.ok, P2.ok].join(','));

  /* ── S-73-5: nid اشتباه → nid_mismatch (رفتار ثابت، مقایسهٔ جدید) ── */
  const scW = await httpReq(port, 'POST', '/api/auth/send-code', { phone: T.phone });
  const lgW = await httpReq(port, 'POST', '/api/auth/login', { phone: T.phone, code: scW.json.demo_code, national_id: '0000000000' });
  chk('S5 nid اشتباه: 401 nid_mismatch', lgW.status === 401 && lgW.json && lgW.json.code === 'nid_mismatch', lgW.raw);

  /* ── S-73-1: log-out بعد از restore باقی می‌ماند ── */
  const out = await httpReq(port, 'POST', '/api/auth/logout', null, T2.cookie);
  chk('D0 خروجِ teacher: 200', out.status === 200, out.raw);
  const meDead = await httpReq(port, 'GET', '/api/auth/me', null, T2.cookie);
  chk('D1 نشستِ خارج‌شده مرده: 401', meDead.status === 401, meDead.raw);
  const bk = await httpReq(port, 'POST', '/api/admin/backup', {}, SA2.cookie);
  chk('D2 بکاپِ superadmin: 200 + نام', bk.status === 200 && bk.json && bk.json.file, bk.raw);
  const rs = await httpReq(port, 'POST', '/api/admin/restore', { file: bk.json.file }, SA2.cookie);
  chk('D3 restore: 200', rs.status === 200 && rs.json && rs.json.ok === true, rs.raw);
  const meDead2 = await httpReq(port, 'GET', '/api/auth/me', null, T2.cookie);
  chk('S1-A بعد از restore: نشستِ log-out شده هنوز 401 (revocation دائمی)', meDead2.status === 401, meDead2.raw);
  const meSA = await httpReq(port, 'GET', '/api/auth/me', null, SA2.cookie);
  chk('S1-B نشستِ superadmin (بدون log-out) بعد از restore سالم', meSA.status === 200, meSA.raw);
  const unk7 = await httpReq(port, 'POST', '/api/auth/send-code', { phone: UNKNOWN });
  chk('S1-C rate-limitِ ناشناخته بعد از restore حفظ است (429)', unk7.status === 429, unk7.raw);
  const T3 = await login(port, T.phone, T.national_id);
  chk('S1-D teacher دوباره (نشستِ تازه) وارد می‌شود', T3.ok && !!T3.cookie, T3.ok ? 'ok' : T3.r.raw);

  /* ── S-73-3: modeِ فایل‌ها 0600 ── */
  await sleep(2600); /* flushِ 2 ثانیه‌ایِ store */
  const mode = (f) => { try { return fs.statSync(f).mode & 0o777; } catch (e) { return -1; } };
  chk('S3-A store file 0600', mode(storeFile) === 0o600, '0' + (mode(storeFile) & 0o777).toString(8));
  chk('S3-B audit log 0600', mode(auditFile) === 0o600, '0' + (mode(auditFile) & 0o777).toString(8));
  const bkFile = path.join(tmp, 'backups', bk.json.file);
  const foundBk = fs.existsSync(bkFile) ? bkFile : (fs.existsSync(path.join(ROOT, 'server/data/backups', bk.json.name)) ? path.join(ROOT, 'server/data/backups', bk.json.name) : null);
  chk('S3-C backup file 0600', foundBk !== null && mode(foundBk) === 0o600, foundBk && ('0' + (mode(foundBk) & 0o777).toString(8)));

  /* ── restore با نامِ فایلِ شیطانی: traversal مسدود ── */
  const rs2 = await httpReq(port, 'POST', '/api/admin/restore', { file: '../../evil.json' }, SA2.cookie);
  chk('F1 نامِ traversal: بی‌خطر (به آخرین بکاپِ معتبر برمی‌گردد)', rs2.status === 200 && rs2.json && rs2.json.ok === true && rs2.json.file !== '../../evil.json', rs2.raw);

  /* ── S-73-7: delete-account student → لینک‌های parent پاک ── */
  const bellB = await httpReq(port, 'GET', '/api/bell/now', null, P2.cookie);
  chk('G0 قبل از حذف: bellِ parent کودکِ 16 را می‌بیند', bellB.status === 200 && bellB.json && bellB.json.family && bellB.json.family.length === 1 && Number(bellB.json.family[0].studentId) === 16, bellB.raw);
  const scDel = await httpReq(port, 'POST', '/api/auth/send-code', { phone: ST.phone });
  const del = await httpReq(port, 'POST', '/api/auth/delete-account', { code: scDel.json && scDel.json.demo_code }, ST2.cookie);
  chk('G1 delete-accountِ student: 200', del.status === 200 && del.json && del.json.deleted === true, del.raw);
  const st404 = await httpReq(port, 'GET', '/api/students/16', null, SA2.cookie);
  chk('G2 studentِ حذف‌شده: 404 (superadmin هم نمی‌بیند)', st404.status === 404, st404.raw);
  const bellA = await httpReq(port, 'GET', '/api/bell/now', null, P2.cookie);
  chk('S7 بعد از حذف: bellِ parent دیگر کودک را نمی‌بیند', bellA.status === 200 && bellA.json && bellA.json.family && bellA.json.family.length === 0, bellA.raw);

  /* ── wrap ── */
  srv.kill('SIGKILL');
  console.log('\nsecurity2: ' + pass + ' ✅ / ' + fail + ' ❌');
  if (fail) { errors.forEach((e) => console.log('  — ' + e)); process.exit(1); }
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
